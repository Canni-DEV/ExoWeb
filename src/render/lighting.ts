import {
  BackSide,
  Color,
  CubeCamera,
  CubeRenderTarget,
  HalfFloatType,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  NodeMaterial,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type Camera,
  type RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu';
import { positionWorld, sampler, vec4 } from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { reflectedSky } from './shaders';
import { PROFILES } from '../config';
import type { Quality } from '../types';
import type { RenderUniforms } from './uniforms';

export class WorldLighting {
  readonly sun = new DirectionalLight(0xffc386, 3.4);
  private ambient = new HemisphereLight(0x8c81ce, 0x361b25, 0.45);
  private generator: PMREMGenerator;
  private probe = new Scene();
  private environment: RenderTarget | null = null;
  private cube = new CubeRenderTarget(128, {
    type: HalfFloatType,
    generateMipmaps: false,
    depthBuffer: false,
  });
  private capture = new CubeCamera(0.1, 10, this.cube);
  private face = -1;
  private lastUpdate = -100;
  private profile: Quality | null = null;
  constructor(
    private renderer: WebGPURenderer,
    private scene: Scene,
    private u: RenderUniforms,
  ) {
    renderer.shadowMap.enabled = true;
    this.sun.castShadow = true;
    this.sun.shadow.normalBias = 1.8;
    this.sun.shadow.bias = -0.00015;
    scene.add(this.sun, this.sun.target, this.ambient);
    this.generator = new PMREMGenerator(renderer);
    this.capture.coordinateSystem = renderer.coordinateSystem;
    this.capture.updateCoordinateSystem();
    this.capture.updateMatrixWorld();
    const material = new NodeMaterial();
    material.side = BackSide;
    material.outputNode = vec4(
      reflectedSky(
        positionWorld.normalize(),
        u.eye,
        u.sun,
        u.time,
        u.storm,
        u.cloudNoise,
        sampler(u.cloudNoise),
      ),
      1,
    );
    this.probe.add(new Mesh(new SphereGeometry(2, 32, 16), material));
  }
  quality(quality: Quality) {
    if (this.profile === quality) return;
    this.profile = quality;
    const p = PROFILES[quality];
    this.sun.shadow.shadowNode?.dispose();
    this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    const csm = new CSMShadowNode(this.sun, {
      cascades: p.cascades,
      maxFar: quality === 'low' ? 700 : quality === 'medium' ? 2200 : 4500,
      mode: 'practical',
    });
    csm.fade = true;
    this.sun.shadow.shadowNode = csm;
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      }
    });
  }
  update(force = false) {
    const u = this.u,
      s = u.storm.value;
    this.sun.color.copy(new Color(0xffc386)).lerp(new Color(0xbce2d2), s);
    this.sun.intensity = 3.4 - s * 1.5;
    this.sun.position.copy(u.eye.value).sub(u.origin.value).addScaledVector(u.sun.value, 10000);
    this.sun.target.position.copy(u.eye.value).sub(u.origin.value);
    this.ambient.color.copy(new Color(0x8c81ce)).lerp(new Color(0x397d83), s);
    if (force || (this.face < 0 && u.time.value - this.lastUpdate > 8)) this.face = 0;
    if (this.face >= 0) {
      const target = this.renderer.getRenderTarget(),
        activeFace = this.renderer.getActiveCubeFace();
      // One face per frame. Initial compilation is completed behind the loading screen.
      const count = force ? 6 : 1;
      for (let i = 0; i < count && this.face < 6; i++, this.face++) {
        this.renderer.setRenderTarget(this.cube, this.face);
        this.renderer.render(this.probe, this.capture.children[this.face] as Camera);
      }
      this.renderer.setRenderTarget(target, activeFace);
      if (this.face === 6) {
        this.environment = this.generator.fromCubemap(this.cube.texture, this.environment);
        this.scene.environment = this.environment.texture;
        this.lastUpdate = u.time.value;
        this.face = -1;
      }
    }
  }
  invalidate() {
    this.lastUpdate = -100;
    this.face = -1;
  }
  get memoryBytes() {
    const p = PROFILES[this.profile ?? 'medium'];
    return p.cascades * p.shadowSize * p.shadowSize * 4 + 4 * 1024 * 1024;
  }
  dispose() {
    this.sun.shadow.shadowNode?.dispose();
    this.environment?.dispose();
    this.cube.dispose();
    this.generator.dispose();
    this.probe.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as NodeMaterial).dispose();
      }
    });
  }
}
