import {
  DepthTexture,
  FloatType,
  HalfFloatType,
  Matrix4,
  NodeMaterial,
  QuadMesh,
  RenderPipeline,
  RenderTarget,
  type Node,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  fract,
  int,
  length,
  max,
  mix,
  mrt,
  normalize,
  output,
  sin,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { clouds } from './shaders';
import type { RenderUniforms } from './uniforms';
import { PROFILES } from '../config';
import type { Quality } from '../types';

export class AtmospherePipeline {
  private sceneTarget = new RenderTarget(1, 1, {
    type: HalfFloatType,
    count: 2,
    depthTexture: new DepthTexture(1, 1, FloatType),
  });
  private cloudTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  private history = [
    new RenderTarget(1, 1, { type: HalfFloatType, count: 2, depthBuffer: false }),
    new RenderTarget(1, 1, { type: HalfFloatType, count: 2, depthBuffer: false }),
  ];
  private compositeTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  private temporal = [
    new RenderTarget(1, 1, { type: HalfFloatType, count: 2, depthBuffer: false }),
    new RenderTarget(1, 1, { type: HalfFloatType, count: 2, depthBuffer: false }),
  ];
  private sceneMRT = mrt({ output, velocity });
  private quad = new QuadMesh(new NodeMaterial());
  private cloudMaterial = new NodeMaterial();
  private historyMaterial = new NodeMaterial();
  private compositeMaterial = new NodeMaterial();
  private temporalMaterial = new NodeMaterial();
  private historyTexture = texture(this.history[0].texture);
  private historyMeta = texture(this.history[0].textures[1]);
  private resolvedCloud = texture(this.history[1].texture);
  private resolvedMeta = texture(this.history[1].textures[1]);
  private previousColor = texture(this.temporal[0].texture);
  private previousDepth = texture(this.temporal[0].textures[1]);
  private resolvedColor = texture(this.temporal[1].texture);
  private final: RenderPipeline;
  private bloomNode: ReturnType<typeof bloom>;
  private historyMRT: ReturnType<typeof mrt>;
  private temporalMRT: ReturnType<typeof mrt>;
  private frame = 0;
  private width = 1;
  private height = 1;
  private quality: Quality = 'medium';

  constructor(
    private renderer: WebGPURenderer,
    private u: RenderUniforms,
  ) {
    this.sceneTarget.textures[0].name = 'output';
    this.sceneTarget.textures[1].name = 'velocity';
    for (const target of [...this.history, ...this.temporal]) {
      target.textures[0].name = 'output';
      target.textures[1].name = 'meta';
    }
    const coords = uv();
    const depth = texture(this.sceneTarget.depthTexture!).r;
    const view = this.u.inverseProjection.mul(
      vec4(coords.x.mul(2).sub(1), float(1).sub(coords.y.mul(2)), depth, 1),
    );
    const viewPoint = view.xyz.div(view.w);
    const ray = normalize(this.u.cameraWorld.mul(vec4(normalize(viewPoint), 0)).xyz);
    const sceneDistance = length(viewPoint).min(100000);
    const jitter = fract(
      sin(dot(coords.mul(this.u.resolution), vec2(12.9898, 78.233)))
        .mul(43758.5453)
        .add(this.u.frame.mul(0.61803398875)),
    );
    this.cloudMaterial.outputNode = clouds(
      this.u.eye,
      ray,
      sceneDistance,
      this.u.sun,
      this.u.time,
      this.u.storm,
      this.u.cloudSteps,
      this.u.shadowSteps,
      jitter,
    );

    // World-space reprojection of the cloud layer, with scene-depth disocclusion rejection.
    const anchor = clamp(
      float(2600).sub(this.u.eye.y).div(ray.y.abs().max(0.08)).abs(),
      150,
      20000,
    ).min(sceneDistance);
    const anchorWorld = this.u.eye.add(ray.mul(anchor)).sub(this.u.origin);
    const previousClip = this.u.previousViewProjection.mul(vec4(anchorWorld, 1));
    const previousUV = previousClip.xy.div(previousClip.w).mul(vec2(0.5, -0.5)).add(0.5);
    const inBounds = previousUV
      .greaterThan(0)
      .all()
      .and(previousUV.lessThan(1).all())
      .and(previousClip.w.greaterThan(0));
    const currentCloud = texture(this.cloudTarget.texture);
    const oldCloud = this.historyTexture.sample(previousUV);
    const oldDistance = this.historyMeta.sample(previousUV).r.mul(100000);
    const depthReject = float(1).sub(smoothstep(60, 800, oldDistance.sub(sceneDistance).abs()));
    const alphaReject = float(1).sub(smoothstep(0.05, 0.35, oldCloud.a.sub(currentCloud.a).abs()));
    const historyWeight = float(inBounds)
      .mul(this.u.historyValid)
      .mul(depthReject)
      .mul(alphaReject)
      .mul(0.78);
    const limited = oldCloud.clamp(currentCloud.sub(0.12), currentCloud.add(0.12));
    this.historyMaterial.outputNode = mix(currentCloud, limited, historyWeight);
    this.historyMRT = mrt({
      output,
      meta: vec4(sceneDistance.div(100000), anchor.div(100000), 0, 1),
    });

    // Four depth-aware taps prevent a low-resolution cloud silhouette bleeding across mountains.
    const color = texture(this.sceneTarget.texture);
    const offsets = [vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(-0.5, 0.5), vec2(0.5, 0.5)];
    let total: Node<'vec4'> = vec4(0),
      weight: Node<'float'> = float(0);
    for (const offset of offsets) {
      const sampleUV = coords.add(offset.div(this.u.cloudResolution));
      const sampleDepth = this.resolvedMeta.sample(sampleUV).r.mul(100000);
      const w = float(1).div(float(1).add(sampleDepth.sub(sceneDistance).abs().mul(0.01)));
      total = total.add(this.resolvedCloud.sample(sampleUV).mul(w));
      weight = weight.add(w);
    }
    const cloud = total.div(weight.max(0.0001));
    this.compositeMaterial.outputNode = vec4(
      color.rgb.mul(float(1).sub(cloud.a)).add(cloud.rgb),
      1,
    );

    // Motion-vector temporal resolve with depth rejection and neighbourhood clamping.
    const current = texture(this.compositeTarget.texture),
      motion = texture(this.sceneTarget.textures[1]).xy.mul(vec2(0.5, -0.5));
    const previousSceneUV = coords.sub(motion);
    const valid = previousSceneUV.greaterThan(0).all().and(previousSceneUV.lessThan(1).all());
    const oldDepth = this.previousDepth.sample(previousSceneUV).r;
    const reject = float(1).sub(smoothstep(0.00005, 0.002, oldDepth.sub(depth).abs()));
    let minimum = current.rgb,
      maximum = current.rgb;
    for (const offset of offsets) {
      const neighbor = current.sample(coords.add(offset.mul(2).div(this.u.resolution))).rgb;
      minimum = minimum.min(neighbor);
      maximum = maximum.max(neighbor);
    }
    const oldColor = this.previousColor.sample(previousSceneUV).rgb.clamp(minimum, maximum);
    const temporalWeight = this.u.historyValid
      .mul(float(valid))
      .mul(reject)
      .mul(float(1).sub(motion.length().mul(40).saturate()))
      .mul(0.72);
    this.temporalMaterial.outputNode = vec4(mix(current.rgb, oldColor, temporalWeight), 1);
    this.temporalMRT = mrt({ output, meta: vec4(depth, 0, 0, 1) });

    const blurred = motionBlur(
      this.resolvedColor,
      motion.clamp(-0.035, 0.035).mul(this.u.blur).mul(this.u.historyValid),
      int(8),
    );
    this.bloomNode = bloom(blurred, 0.18, 0.65, 1.0);
    const vignette = float(1).sub(smoothstep(0.25, 0.78, coords.distance(vec2(0.5))).mul(0.17));
    const grain = jitter.sub(0.5).mul(0.003);
    this.final = new RenderPipeline(
      renderer,
      vec4(
        max(
          vec3(0),
          blurred.rgb.add(this.bloomNode.rgb).mul(vignette).mul(this.u.exposure).add(grain),
        ),
        1,
      ),
    );
    const debug = new URLSearchParams(location.search).get('pass');
    if (debug === 'scene') this.final.outputNode = texture(this.sceneTarget.texture);
    if (debug === 'clouds') this.final.outputNode = vec4(this.resolvedCloud.rgb, 1);
    if (debug === 'motion') this.final.outputNode = vec4(motion.abs().mul(20), 0, 1);
  }
  resize(width: number, height: number, quality: Quality) {
    this.width = width;
    this.height = height;
    this.quality = quality;
    const profile = PROFILES[quality],
      cw = Math.max(1, Math.ceil(width * profile.cloudScale)),
      ch = Math.max(1, Math.ceil(height * profile.cloudScale));
    this.sceneTarget.setSize(width, height);
    this.compositeTarget.setSize(width, height);
    this.cloudTarget.setSize(cw, ch);
    for (const target of this.history) target.setSize(cw, ch);
    for (const target of this.temporal) target.setSize(width, height);
    this.u.resolution.value.set(width, height);
    this.u.cloudResolution.value.set(cw, ch);
    this.u.cloudSteps.value = profile.cloudSteps;
    this.u.shadowSteps.value = profile.shadowSteps;
    this.invalidate();
  }
  invalidate() {
    this.u.historyValid.value = 0;
  }
  render(scene: Scene, camera: PerspectiveCamera) {
    const r = this.renderer,
      u = this.u,
      read = this.frame % 2,
      write = 1 - read;
    u.frame.value = this.frame;
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    r.setMRT(this.sceneMRT);
    r.setRenderTarget(this.sceneTarget);
    r.render(scene, camera);
    r.setMRT(null);
    const draw = (material: NodeMaterial, target: RenderTarget) => {
      this.quad.material = material;
      r.setRenderTarget(target);
      this.quad.render(r);
    };
    draw(this.cloudMaterial, this.cloudTarget);
    this.historyTexture.value = this.history[read].texture;
    this.historyMeta.value = this.history[read].textures[1];
    r.setMRT(this.historyMRT);
    draw(this.historyMaterial, this.history[write]);
    r.setMRT(null);
    this.resolvedCloud.value = this.history[write].texture;
    this.resolvedMeta.value = this.history[write].textures[1];
    draw(this.compositeMaterial, this.compositeTarget);
    this.previousColor.value = this.temporal[read].texture;
    this.previousDepth.value = this.temporal[read].textures[1];
    r.setMRT(this.temporalMRT);
    draw(this.temporalMaterial, this.temporal[write]);
    r.setMRT(null);
    this.resolvedColor.value = this.temporal[write].texture;
    r.setRenderTarget(null);
    this.final.render();
    u.previousViewProjection.value.copy(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    u.historyValid.value = 1;
    this.frame++;
  }
  get memoryBytes() {
    const cloudFactor = PROFILES[this.quality].cloudScale ** 2;
    return this.width * this.height * (8 * 2 + 4 + 8 + 8 * 4 + 8 * 5 * cloudFactor + 12);
  }
  dispose() {
    this.sceneTarget.dispose();
    this.cloudTarget.dispose();
    this.compositeTarget.dispose();
    for (const t of [...this.history, ...this.temporal]) t.dispose();
    for (const m of [
      this.cloudMaterial,
      this.historyMaterial,
      this.compositeMaterial,
      this.temporalMaterial,
    ])
      m.dispose();
    this.bloomNode.dispose();
    this.final.dispose();
  }
}
