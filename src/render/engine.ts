import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NodeMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import {
  float,
  Fn,
  instanceIndex,
  positionLocal,
  positionPrevious,
  positionWorld,
  vec4,
} from 'three/tsl';
import { shader } from './native';
import { PHYSICS, WORLD } from '../config';
import { damp, length, smooth } from '../simulation/math';
import type { Diagnostics, Quality, RenderSnapshot, Settings, Vec3 } from '../types';
import { TerrainStream } from '../world/stream';
import { createUniforms } from './uniforms';
import { skyColor } from './shaders';
import { AtmospherePipeline } from './pipeline';
import { TerrainRenderer } from './terrain';
import { OceanRenderer } from './ocean';

export class Engine {
  adapterDescription = '';
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(65, 1, 0.5, 120000);
  readonly uniforms = createUniforms();
  readonly stream: TerrainStream;
  private terrain: TerrainRenderer;
  private pipeline: AtmospherePipeline;
  private ship = new Group();
  private orb: Mesh;
  private halo: Mesh;
  private ocean: OceanRenderer;
  private sky: Mesh;
  private dust: InstancedMesh;
  private beacons: { group: Group; global: Vector3; beam: Mesh }[] = [];
  private cameraPosition = new Vector3();
  private previousYaw = 0;
  private previousPitch = 0;
  private scale = 1;
  private quality: Quality = 'medium';
  private frameTimes: number[] = [];
  private stableTime = 0;
  private width = 0;
  private height = 0;
  private gpuMs: number | null = null;
  private querying = false;
  private alive = true;
  onLost: (message: string) => void = () => {};
  onStats: (diagnostics: Diagnostics) => void = () => {};
  private constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
    this.renderer = new WebGPURenderer({
      canvas,
      device,
      antialias: false,
      alpha: false,
      trackTimestamp: device.features.has('timestamp-query'),
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.onDeviceLost = (info) =>
      this.onLost(
        `La GPU dejó de responder (${info.reason}). Recargá para continuar desde el checkpoint.`,
      );
    this.stream = new TerrainStream(this.renderer);
    this.terrain = new TerrainRenderer(this.scene, this.stream, this.uniforms);
    this.pipeline = new AtmospherePipeline(this.renderer, this.uniforms);
    const u = this.uniforms;
    const skyMaterial = new NodeMaterial();
    skyMaterial.side = BackSide;
    skyMaterial.depthWrite = false;
    skyMaterial.outputNode = vec4(
      skyColor(positionWorld.add(u.origin).sub(u.eye).normalize(), u.sun, u.storm),
      1,
    );
    this.sky = new Mesh(new SphereGeometry(90000, 32, 16), skyMaterial);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.ocean = new OceanRenderer(this.scene, u);
    this.orb = new Mesh(
      new SphereGeometry(PHYSICS.radius, 48, 32),
      new MeshStandardNodeMaterial({ color: 0x818c8e, metalness: 0.88, roughness: 0.23 }),
    );
    this.halo = new Mesh(
      new TorusGeometry(2.47, 0.018, 6, 96),
      new MeshBasicNodeMaterial({ color: 0x9cebea }),
    );
    this.halo.rotation.x = Math.PI / 2;
    this.ship.add(this.orb, this.halo);
    this.scene.add(this.ship);
    const sun = new DirectionalLight(0xffdfb2, 4);
    sun.position.copy(u.sun.value).multiplyScalar(100);
    this.scene.add(sun, new HemisphereLight(0xb0d6ef, 0x29211c, 2));

    const particles = new NodeMaterial();
    particles.transparent = true;
    particles.depthWrite = false;
    particles.blending = AdditiveBlending;
    const particlePosition =
      shader<'vec3'>(`fn exoParticle(i:f32,t:f32,ship:vec3f,origin:vec3f)->vec3f{
      let seed=fract(sin(i*127.1+311.7)*43758.5453);
      let a=i*2.39996;let radius=20.0+seed*160.0;
      return ship-origin+vec3f(cos(a)*radius,fract(seed+t*0.015)*100.0-50.0,sin(a)*radius);
    }`);
    const dustPosition = positionLocal.add(
      particlePosition(float(instanceIndex), u.time, u.ship, u.origin),
    );
    particles.positionNode = Fn(() => {
      positionPrevious.assign(dustPosition);
      return dustPosition;
    })();
    particles.outputNode = vec4(0.21, 0.35, 0.39, 0.22);
    this.dust = new InstancedMesh(new SphereGeometry(0.15, 3, 2), particles, 512);
    for (let i = 0; i < 512; i++) this.dust.setMatrixAt(i, new Matrix4());
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }
  static async create(canvas: HTMLCanvasElement) {
    if (!navigator.gpu)
      throw new Error(
        'Este viaje necesita WebGPU. Abrí ExoWeb en Chrome o Edge con aceleración gráfica activada.',
      );
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter)
      throw new Error(
        'No se encontró una GPU compatible con WebGPU. Revisá la aceleración gráfica y el controlador.',
      );
    const device = await adapter.requestDevice({
      requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [],
    });
    const engine = new Engine(canvas, device);
    engine.adapterDescription = [
      adapter.info.vendor,
      adapter.info.architecture,
      adapter.info.description,
    ]
      .filter(Boolean)
      .join(' / ');
    device.addEventListener('uncapturederror', (event) =>
      engine.onLost(`Error de WebGPU: ${event.error.message}`),
    );
    await engine.renderer.init();
    return engine;
  }
  async initialize() {
    for (const cp of WORLD.checkpoints) {
      const height = await this.stream.loadPoint(cp.x + 100, cp.z + 100);
      const group = new Group();
      const pillar = new Mesh(
        new CylinderGeometry(9, 16, 200, 5),
        new MeshStandardNodeMaterial({ color: 0x19262b, metalness: 0.6, roughness: 0.5 }),
      );
      pillar.position.y = 100;
      const beam = new Mesh(
        new CylinderGeometry(4, 9, 6500, 8, 1, true),
        new MeshBasicNodeMaterial({
          color: new Color(0.23, 1.1, 1.45),
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      beam.position.y = 3300;
      group.add(pillar, beam);
      this.scene.add(group);
      this.beacons.push({
        group,
        global: new Vector3(cp.x + 100, Math.max(0, height), cp.z + 100),
        beam,
      });
    }
  }
  resetCamera(position: Vec3, yaw: number) {
    this.cameraPosition.set(
      position.x + Math.sin(yaw) * 40,
      position.y + 12,
      position.z + Math.cos(yaw) * 40,
    );
    this.pipeline.invalidate();
    this.uniforms.historyValid.value = 0;
    this.uniforms.storm.value = smooth(1000, 14000, position.x) * smooth(10000, 19000, -position.z);
  }
  invalidate() {
    this.pipeline.invalidate();
  }
  private resize(quality: Quality) {
    const width = Math.max(2, Math.floor(window.innerWidth * this.scale)),
      height = Math.max(2, Math.floor(window.innerHeight * this.scale));
    if (width === this.width && height === this.height && quality === this.quality) return;
    this.width = width;
    this.height = height;
    this.quality = quality;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.pipeline.resize(width, height, quality);
    this.dust.count = quality === 'low' ? 128 : quality === 'high' ? 512 : 256;
  }
  render(snapshot: RenderSnapshot, settings: Settings, measure = true) {
    if (!this.alive) return;
    const started = performance.now();
    const p = snapshot.player,
      u = this.uniforms,
      dt = Math.min(0.05, snapshot.dt),
      speed = length(p.velocity);
    if (Math.hypot(p.position.x - u.origin.value.x, p.position.z - u.origin.value.z) > 2000) {
      u.origin.value.set(
        Math.floor(p.position.x / 256) * 256,
        0,
        Math.floor(p.position.z / 256) * 256,
      );
      this.terrain.rebase();
      this.ocean.rebase();
      this.pipeline.invalidate();
    }
    const storm = smooth(1000, 14000, p.position.x) * smooth(10000, 19000, -p.position.z);
    u.storm.value = damp(u.storm.value, storm, 0.15, dt);
    u.time.value = p.time;
    u.ship.value.set(p.position.x, p.position.y, p.position.z);
    u.exposure.value = damp(u.exposure.value, 1.08 + storm * 0.25, 0.5, dt);
    u.blur.value = settings.comfort ? 0 : 0.45;
    const yaw = snapshot.cameraYaw,
      pitch = snapshot.cameraPitch;
    if (Math.abs(yaw - this.previousYaw) > 0.3 || Math.abs(pitch - this.previousPitch) > 0.2)
      this.pipeline.invalidate();
    this.previousYaw = yaw;
    this.previousPitch = pitch;
    const distance = 40 + Math.min(35, speed * 0.09),
      vertical = 7 + Math.sin(pitch) * distance;
    const target = new Vector3(
      p.position.x + Math.sin(yaw) * distance * Math.cos(pitch),
      p.position.y + vertical,
      p.position.z + Math.cos(yaw) * distance * Math.cos(pitch),
    );
    // Sweep from craft to desired camera; shorten the boom before crossing a ridge.
    for (let i = 1; i <= 16; i++) {
      const fraction = i / 16,
        x = p.position.x + (target.x - p.position.x) * fraction,
        z = p.position.z + (target.z - p.position.z) * fraction;
      if (this.stream.ready(x, z)) {
        const surface =
          Math.max(this.stream.surface(x, z).height, this.stream.water(x, z, p.time).height) + 2;
        const y = p.position.y + (target.y - p.position.y) * fraction;
        if (y < surface) {
          target.set(x, surface, z);
          break;
        }
      }
    }
    this.cameraPosition.lerp(target, 1 - Math.exp(-8 * dt));
    if (this.stream.ready(this.cameraPosition.x, this.cameraPosition.z))
      this.cameraPosition.y = Math.max(
        this.cameraPosition.y,
        this.stream.surface(this.cameraPosition.x, this.cameraPosition.z).height + 2,
      );
    u.eye.value.copy(this.cameraPosition);
    this.camera.position.copy(this.cameraPosition).sub(u.origin.value);
    const focus = new Vector3(p.position.x, p.position.y + 1, p.position.z)
      .addScaledVector(new Vector3(p.velocity.x, 0, p.velocity.z), 0.035)
      .sub(u.origin.value);
    this.camera.lookAt(focus);
    if (!settings.comfort)
      this.camera.rotateZ(Math.sin(p.time * 0.5) * Math.min(0.012, speed * 0.00004));
    this.camera.fov = damp(
      this.camera.fov,
      settings.comfort ? 65 : 65 + 25 * smooth(20, 300, speed),
      2,
      dt,
    );
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.ship.position.copy(u.ship.value).sub(u.origin.value);
    this.orb.scale.set(1 + p.morph * 0.4, 1 - p.morph * 0.83, 1 + p.morph * 0.4);
    this.orb.rotation.x += ((speed * dt) / PHYSICS.radius) * (1 - p.morph);
    this.ship.rotation.y = p.yaw;
    this.halo.scale.setScalar(1 + p.morph * 0.4);
    this.halo.visible = p.form === 'disc';
    this.sky.position.copy(this.camera.position);
    for (const [i, b] of this.beacons.entries()) {
      b.group.position.copy(b.global).sub(u.origin.value);
      b.beam.visible = snapshot.completed || i === Math.min(4, snapshot.checkpoint + 1);
    }
    this.terrain.update(p.position.x, p.position.z);
    this.ocean.update(p.position.x, p.position.z);
    this.resize(settings.quality);
    this.pipeline.render(this.scene, this.camera);
    const cpuMs = performance.now() - started;
    if (measure && snapshot.dt > 0 && snapshot.dt < 0.2) {
      this.frameTimes.push(snapshot.dt * 1000);
      if (this.frameTimes.length > 600) this.frameTimes.shift();
      this.stableTime += snapshot.dt;
    }
    if (this.stableTime > 3 && this.frameTimes.length > 90) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b),
        p95 = sorted[Math.floor(sorted.length * 0.95)],
        avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      const old = this.scale;
      if (avg > 17.3) this.scale = Math.max(0.67, this.scale - 0.05);
      else if (avg < 16.1) this.scale = Math.min(1, this.scale + 0.025);
      if (old !== this.scale) {
        this.resize(settings.quality);
        this.frameTimes = [];
      }
      this.onStats({
        fps: 1000 / avg,
        p95,
        scale: this.scale,
        sectors: this.stream.tiles.size,
        memoryMiB: this.memoryBytes / 1048576,
        cpuMs,
        gpuMs: this.gpuMs,
        ...p.position,
      });
      this.stableTime = 0;
      if (!this.querying) {
        this.querying = true;
        void this.renderer
          .resolveTimestampsAsync()
          .then((ms) => {
            this.gpuMs = ms ?? null;
          })
          .catch(() => {
            this.gpuMs = null;
          })
          .finally(() => {
            this.querying = false;
          });
      }
    }
  }
  get memoryBytes() {
    return (
      this.pipeline.memoryBytes +
      (this.terrain.vertices + this.ocean.vertices) * 40 +
      this.stream.tiles.size * 257 * 257 * 4 +
      8 * 1024 * 1024
    );
  }
  dispose() {
    this.alive = false;
    this.stream.dispose();
    this.terrain.dispose();
    this.ocean.dispose();
    this.pipeline.dispose();
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of materials) m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
