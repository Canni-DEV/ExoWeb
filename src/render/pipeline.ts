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
  dot,
  float,
  fract,
  int,
  ivec2,
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
  sampler,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { clouds, cloudDepth } from './shaders';
import { shader } from './native';
import type { RenderUniforms } from './uniforms';
import { PROFILES } from '../config';
import type { Quality } from '../types';

export class AtmospherePipeline {
  private sceneTarget = new RenderTarget(1, 1, {
    type: HalfFloatType,
    count: 2,
    depthTexture: new DepthTexture(1, 1, FloatType),
  });
  private opaqueTarget = new RenderTarget(1, 1, {
    type: HalfFloatType,
    depthTexture: new DepthTexture(1, 1, FloatType),
  });
  readonly opaqueColor = texture(this.opaqueTarget.texture);
  readonly opaqueDepth = texture(this.opaqueTarget.depthTexture!);
  private cloudTarget = new RenderTarget(1, 1, {
    type: HalfFloatType,
    count: 2,
    depthBuffer: false,
  });
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
  private cloudMRT: ReturnType<typeof mrt>;
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
  invalidations = 0;

  constructor(
    private renderer: WebGPURenderer,
    private u: RenderUniforms,
  ) {
    this.sceneTarget.textures[0].name = 'output';
    this.sceneTarget.textures[1].name = 'velocity';
    this.cloudTarget.textures[0].name = 'output';
    this.cloudTarget.textures[1].name = 'meta';
    for (const target of [...this.history, ...this.temporal]) {
      target.textures[0].name = 'output';
      target.textures[1].name = 'meta';
    }
    const coords = uv();
    // Resolve to the unjittered output grid. The scene's sample shift must not
    // move the cloud rays or survive into the final image as camera vibration.
    const sceneUV = coords.sub(this.u.projectionJitter);
    const depth = texture(this.sceneTarget.depthTexture!).sample(sceneUV).r;
    const view = this.u.inverseProjection.mul(
      vec4(sceneUV.x.mul(2).sub(1), float(1).sub(sceneUV.y.mul(2)), depth, 1),
    );
    const viewPoint = view.xyz.div(view.w);
    const cloudView = this.u.cloudInverseProjection.mul(
      vec4(coords.x.mul(2).sub(1), float(1).sub(coords.y.mul(2)), 1, 1),
    );
    const ray = normalize(this.u.cameraWorld.mul(vec4(normalize(cloudView.xyz), 0)).xyz);
    const sceneDistance = length(viewPoint).min(100000);
    const jitter = fract(
      sin(dot(coords.mul(this.u.resolution), vec2(12.9898, 78.233)))
        .mul(43758.5453)
        .add(this.u.frame.mul(0.61803398875)),
    );
    // Stable per-pixel strata avoid coherent density flashes when the camera is
    // still. Clouds keep their own stable grid, separate from geometry AA.
    const cloudJitter = shader<'float'>(`fn exoCloudJitter(uv:vec2f,size:vec2f)->f32 {
      let p=vec2u(floor(uv*size));var h=p.x*374761393u+p.y*668265263u;
      h=(h^(h>>13u))*1274126177u;h=h^(h>>16u);
      return (f32(h&65535u)+.5)/65536.0;
    }`)(coords, this.u.cloudResolution);
    this.cloudMaterial.outputNode = clouds(
      this.u.eye,
      ray,
      sceneDistance,
      this.u.sun,
      this.u.time,
      this.u.storm,
      this.u.cloudSteps,
      this.u.shadowSteps,
      cloudJitter,
      this.u.cloudNoise,
      sampler(this.u.cloudNoise),
    );
    const cloudMeta = cloudDepth(
      this.u.eye,
      ray,
      sceneDistance,
      this.u.sun,
      this.u.time,
      this.u.storm,
      this.u.cloudSteps,
      this.u.shadowSteps,
      cloudJitter,
      this.u.cloudNoise,
      sampler(this.u.cloudNoise),
    );
    this.cloudMRT = mrt({ output, meta: cloudMeta });

    // World-space reprojection of the cloud layer, with scene-depth disocclusion rejection.
    const currentMeta = texture(this.cloudTarget.textures[1]);
    const rawCloud = texture(this.cloudTarget.texture);
    const tolerance = sceneDistance.mul(0.02).max(10);
    let filteredCloud: Node<'vec4'> = rawCloud.mul(0.4);
    let filteredDepth: Node<'float'> = currentMeta.r.mul(rawCloud.a).mul(0.4);
    let filterWeight: Node<'float'> = float(0.4);
    for (const offset of [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1)]) {
      const sampleUV = coords.add(offset.div(this.u.cloudResolution));
      const sampleMeta = currentMeta.sample(sampleUV);
      const sampleCloud = rawCloud.sample(sampleUV);
      const sampleDistance = sampleMeta.g.mul(100000);
      const w = float(1)
        .sub(smoothstep(tolerance, tolerance.mul(3), sampleDistance.sub(sceneDistance).abs()))
        .mul(0.15);
      filteredCloud = filteredCloud.add(sampleCloud.mul(w));
      filteredDepth = filteredDepth.add(sampleMeta.r.mul(sampleCloud.a).mul(w));
      filterWeight = filterWeight.add(w);
    }
    const currentCloud = filteredCloud.div(filterWeight);
    // Reproject the same filtered volume as the color. An empty center texel
    // must not anchor its cloudy neighbors one metre in front of the camera.
    const anchor = filteredDepth.div(filteredCloud.a.max(0.00001)).mul(100000).max(1);
    const anchorWorld = this.u.eye
      .add(ray.mul(anchor))
      .add(vec3(7, 0, -3).mul(this.u.delta))
      .sub(this.u.origin);
    const previousClip = this.u.previousCloudViewProjection.mul(vec4(anchorWorld, 1));
    const previousUV = previousClip.xy.div(previousClip.w).mul(vec2(0.5, -0.5)).add(0.5);
    const inBounds = previousUV
      .greaterThan(0)
      .all()
      .and(previousUV.lessThan(1).all())
      .and(previousClip.w.greaterThan(0));
    // Validate each texel before interpolation: bilinear metadata cannot describe
    // a mixture of a foreground mountain and the sky behind it.
    const gatherCloud =
      shader<'vec4'>(`fn exoGatherCloud(uv:vec2f,distance:f32,col:texture_2d<f32>,metadata:texture_2d<f32>)->vec4f {
      let dimensions=vec2i(textureDimensions(col));let p=uv*vec2f(dimensions)-.5;
      let base=vec2i(floor(p));let f=fract(p);let tolerance=max(10.0,distance*.02);
      var color=vec4f(0.0);var total=0.0;
      for(var y=0;y<2;y++){for(var x=0;x<2;x++){
        let pixel=clamp(base+vec2i(x,y),vec2i(0),dimensions-1);
        let sampleDepth=textureLoad(metadata,pixel,0).g*100000.0;
        let compatible=1.0-smoothstep(tolerance,tolerance*3.0,abs(sampleDepth-distance));
        let bilinear=select(1.0-f.x,f.x,x==1)*select(1.0-f.y,f.y,y==1);
        let w=bilinear*compatible;color+=textureLoad(col,pixel,0)*w;total+=w;
      }}
      return color/max(total,.00001);
    }`);
    const oldCloud = gatherCloud(previousUV, sceneDistance, this.historyTexture, this.historyMeta);
    const oldDistance = this.historyMeta
      .load(ivec2(previousUV.mul(this.u.cloudResolution).clamp(0, this.u.cloudResolution.sub(1))))
      .g.mul(100000);
    const depthReject = float(1).sub(
      smoothstep(tolerance, tolerance.mul(3), oldDistance.sub(sceneDistance).abs()),
    );
    const historyWeight = float(inBounds)
      .mul(this.u.historyValid)
      .mul(depthReject)
      .mul(smoothstep(0.001, 0.04, currentCloud.a))
      .mul(0.9);
    const limited = oldCloud.clamp(currentCloud.sub(0.2), currentCloud.add(0.2));
    this.historyMaterial.outputNode = mix(currentCloud, limited, historyWeight);
    this.historyMRT = mrt({
      output,
      meta: currentMeta,
    });

    // Upsample unfiltered texels only after testing their individual depths.
    const motion = texture(this.sceneTarget.textures[1])
      .sample(sceneUV)
      .xy.mul(vec2(0.5, -0.5))
      .add(this.u.projectionJitter)
      .sub(this.u.previousProjectionJitter);
    const color = motionBlur(
      this.resolvedColor,
      motion.clamp(-0.025, 0.025).mul(this.u.blur).mul(this.u.historyValid),
      int(8),
    );
    const offsets = [vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(-0.5, 0.5), vec2(0.5, 0.5)];
    const cloud = gatherCloud(coords, sceneDistance, this.resolvedCloud, this.resolvedMeta);
    this.compositeMaterial.outputNode = vec4(
      color.rgb.mul(float(1).sub(cloud.a)).add(cloud.rgb),
      1,
    );

    // Motion-vector temporal resolve with depth rejection and neighbourhood clamping.
    const current = texture(this.sceneTarget.texture).sample(sceneUV);
    const contactAO =
      shader<'float'>(`fn exoContactAO(uv:vec2f,depth:texture_depth_2d,ip:mat4x4f,quality:i32)->f32 {
      if(quality==0){return 1.0;}
      let dimensions=vec2f(textureDimensions(depth));
      let z=textureLoad(depth,vec2i(clamp(uv*dimensions,vec2f(0.0),dimensions-1.0)),0);
      let h=ip*vec4f(uv*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),z,1.0);let center=h.xyz/h.w;
      if(-center.z>280.0||z>.99999){return 1.0;}
      let radius=clamp(2.0/max(1.0,-center.z),.001,.035);var occlusion=0.0;
      for(var i=0;i<8;i++){
        let angle=f32(i)*2.39996;let coord=clamp(uv+vec2f(cos(angle),sin(angle))*radius,vec2f(.001),vec2f(.999));
        let d=textureLoad(depth,vec2i(coord*dimensions),0);
        let q=ip*vec4f(coord*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),d,1.0);let point=q.xyz/q.w;
        let dz=point.z-center.z;
        occlusion+=smoothstep(.15,1.2,dz)*(1.0-smoothstep(1.5,5.0,length(point-center)));
      }
      return 1.0-occlusion*.035*(1.0-smoothstep(160.0,280.0,-center.z));
    }`)(sceneUV, texture(this.sceneTarget.depthTexture!), this.u.inverseProjection, this.u.quality);
    const previousSceneUV = coords.sub(motion);
    const valid = previousSceneUV.greaterThan(0).all().and(previousSceneUV.lessThan(1).all());
    const oldDepth = this.previousDepth.sample(previousSceneUV).r.mul(100000);
    const oldClip = this.u.previousViewProjection.mul(this.u.cameraWorld.mul(vec4(viewPoint, 1)));
    const depthError = oldDepth.sub(oldClip.w).abs();
    const reject = float(1).sub(
      smoothstep(
        float(2).add(oldClip.w.abs().mul(0.008)),
        float(8).add(oldClip.w.abs().mul(0.035)),
        depthError,
      ),
    );
    let minimum = current.rgb,
      maximum = current.rgb;
    for (const offset of offsets) {
      const neighbor = current.sample(sceneUV.add(offset.mul(2).div(this.u.resolution))).rgb;
      minimum = minimum.min(neighbor);
      maximum = maximum.max(neighbor);
    }
    const oldColor = this.previousColor.sample(previousSceneUV).rgb.clamp(minimum, maximum);
    const temporalWeight = this.u.historyValid
      .mul(float(valid))
      .mul(reject)
      .mul(float(1).sub(motion.length().mul(40).saturate()))
      .mul(mix(0.3, 0.88, smoothstep(80, 1800, sceneDistance)));
    this.temporalMaterial.outputNode = vec4(
      mix(current.rgb.mul(contactAO), oldColor, temporalWeight),
      1,
    );
    this.temporalMRT = mrt({ output, meta: vec4(viewPoint.z.negate().div(100000), 0, 0, 1) });

    const lensEffect = shader<'vec4'>(`fn exoLens(uv:vec2f,t:f32,wet:f32,intensity:f32)->vec4f {
      let grid=uv*vec2f(17.0,10.0);let cell=floor(grid);let f=fract(grid)-.5;
      let seed=fract(sin(dot(cell,vec2f(127.1,311.7)))*43758.5453);
      let center=vec2f(sin(seed*41.0),cos(seed*57.0))*.24;
      let d=(f-center)*vec2f(1.0,1.45);let r=length(d);
      let amount=smoothstep(.65,1.0,seed)*wet*intensity;
      let shape=(1.0-smoothstep(.08,.19,r))*amount;
      let edge=exp(-pow((r-.155)*75.0,2.0))*amount;
      return vec4f(d*shape*.009,edge*.08,shape);
    }`)(coords, this.u.time, this.u.lensWet, this.u.lens);
    const composed = texture(this.compositeTarget.texture).sample(coords.add(lensEffect.xy));
    this.bloomNode = bloom(composed, 0.3, 0.55, 1.15);
    const vignette = float(1).sub(smoothstep(0.25, 0.78, coords.distance(vec2(0.5))).mul(0.17));
    const grain = jitter.sub(0.5).mul(0.022).mul(this.u.grain);
    this.final = new RenderPipeline(
      renderer,
      vec4(
        max(
          vec3(0),
          composed.rgb
            .add(this.bloomNode.rgb.mul(this.u.bloom))
            .add(lensEffect.z)
            .mul(vignette)
            .mul(this.u.exposure)
            .add(grain),
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
    this.opaqueTarget.setSize(width, height);
    this.renderer.initRenderTarget(this.opaqueTarget);
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
    this.frame = 0;
    this.invalidations++;
  }
  render(scene: Scene, camera: PerspectiveCamera) {
    const r = this.renderer,
      u = this.u,
      read = this.frame % 2,
      write = 1 - read;
    u.frame.value = this.frame;
    const halton = (index: number, base: number) => {
      let n = index,
        f = 1,
        value = 0;
      while (n > 0) {
        f /= base;
        value += f * (n % base);
        n = Math.floor(n / base);
      }
      return value;
    };
    const sample = (this.frame % 8) + 1;
    camera.coordinateSystem = r.coordinateSystem;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    u.cloudInverseProjection.value.copy(camera.projectionMatrixInverse);
    const cloudViewProjection = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    u.projectionJitter.value.set(
      (halton(sample, 2) - 0.5) / this.width,
      (halton(sample, 3) - 0.5) / this.height,
    );
    camera.setViewOffset(
      this.width,
      this.height,
      halton(sample, 2) - 0.5,
      halton(sample, 3) - 0.5,
      this.width,
      this.height,
    );
    camera.updateProjectionMatrix();
    r.setMRT(this.sceneMRT);
    r.setRenderTarget(this.sceneTarget);
    camera.layers.set(0);
    r.render(scene, camera);
    // The renderer selects the WebGPU projection on the first render.
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    r.copyTextureToTexture(this.sceneTarget.texture, this.opaqueTarget.texture);
    r.copyTextureToTexture(this.sceneTarget.depthTexture!, this.opaqueTarget.depthTexture!);
    r.autoClear = false;
    camera.layers.set(1);
    r.render(scene, camera);
    camera.layers.set(2);
    r.render(scene, camera);
    r.autoClear = true;
    camera.layers.set(0);
    r.setMRT(null);
    const draw = (material: NodeMaterial, target: RenderTarget) => {
      this.quad.material = material;
      r.setRenderTarget(target);
      this.quad.render(r);
    };
    r.setMRT(this.cloudMRT);
    draw(this.cloudMaterial, this.cloudTarget);
    r.setMRT(null);
    this.historyTexture.value = this.history[read].texture;
    this.historyMeta.value = this.history[read].textures[1];
    r.setMRT(this.historyMRT);
    draw(this.historyMaterial, this.history[write]);
    r.setMRT(null);
    this.resolvedCloud.value = this.history[write].texture;
    this.resolvedMeta.value = this.history[write].textures[1];
    this.previousColor.value = this.temporal[read].texture;
    this.previousDepth.value = this.temporal[read].textures[1];
    r.setMRT(this.temporalMRT);
    draw(this.temporalMaterial, this.temporal[write]);
    r.setMRT(null);
    this.resolvedColor.value = this.temporal[write].texture;
    draw(this.compositeMaterial, this.compositeTarget);
    r.setRenderTarget(null);
    this.final.render();
    u.previousViewProjection.value.copy(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    u.previousCloudViewProjection.value.copy(cloudViewProjection);
    u.previousProjectionJitter.value.copy(u.projectionJitter.value);
    u.historyValid.value = 1;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    this.frame++;
  }
  get memoryBytes() {
    const cloudFactor = PROFILES[this.quality].cloudScale ** 2;
    return this.width * this.height * (8 * 2 + 4 + 12 + 8 + 8 * 4 + 8 * 6 * cloudFactor + 12);
  }
  dispose() {
    this.sceneTarget.dispose();
    this.opaqueTarget.dispose();
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
