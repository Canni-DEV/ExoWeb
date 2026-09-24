import {
  ACESFilmicToneMapping,
  BackSide,
  Group,
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
import { mix, output, positionLocal, positionWorld, vec4, vec3 } from 'three/tsl';
import { PHYSICS } from '../config';
import { damp, length, smooth } from '../simulation/math';
import type { Diagnostics, Quality, RenderSnapshot, Settings, Vec3 } from '../types';
import { TerrainStream } from '../world/stream';
import { createUniforms } from './uniforms';
import { skyColor, aerial } from './shaders';
import { AtmospherePipeline } from './pipeline';
import { TerrainRenderer } from './terrain';
import { OceanRenderer } from './ocean';
import { MaterialLibrary } from './assets';
import { WorldLighting } from './lighting';
import { LandmarkRenderer } from './landmarks';
import { environmentAt } from '../world/environment';
import { sweepLandmarks } from '../world/landmarks';
import { EffectsRenderer } from './effects';
import { noise2 } from '../world/field';
import { GroundDetail } from './ground-detail';

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
  private assets: MaterialLibrary;
  private lighting: WorldLighting;
  private landmarks: LandmarkRenderer;
  private effects: EffectsRenderer;
  private groundDetail: GroundDetail;
  private frozenScale: number | null = null;
  private lastTime = 0;
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
  private constructor(
    canvas: HTMLCanvasElement,
    private device: GPUDevice,
  ) {
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
    this.assets = new MaterialLibrary(this.renderer);
    this.terrain = new TerrainRenderer(this.scene, this.stream, this.uniforms, this.assets);
    this.pipeline = new AtmospherePipeline(this.renderer, this.uniforms);
    this.lighting = new WorldLighting(this.renderer, this.scene, this.uniforms);
    this.landmarks = new LandmarkRenderer(this.scene, this.stream, this.uniforms, this.assets);
    this.effects = new EffectsRenderer(this.scene, this.uniforms);
    this.groundDetail = new GroundDetail(this.scene, this.stream, this.uniforms);
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
    this.ocean.bindScene(this.pipeline.opaqueColor, this.pipeline.opaqueDepth);
    const shipMaterial = new MeshStandardNodeMaterial({
      color: 0x59505a,
      metalness: 0.94,
      roughness: 0.2,
    });
    const mottling = noise2(positionLocal.xz.mul(4.5));
    shipMaterial.colorNode = mix(
      vec3(0.015, 0.012, 0.017),
      vec3(0.085, 0.065, 0.055),
      mottling.smoothstep(0.25, 0.8),
    );
    shipMaterial.roughnessNode = mottling.mul(0.2).add(0.12);
    const glow = positionLocal.y
      .negate()
      .add(0.8)
      .smoothstep(0, 2)
      .mul(mottling.mul(0.25).add(0.75));
    shipMaterial.emissiveNode = vec3(2.8, 0.45, 0.065)
      .mul(glow)
      .mul(u.energy.mul(0.65).add(u.gravity.mul(0.8)).add(0.18));
    shipMaterial.outputNode = vec4(
      aerial(output.rgb, positionWorld.add(u.origin), u.eye, u.sun, u.storm),
      1,
    );
    this.orb = new Mesh(new SphereGeometry(PHYSICS.radius, 48, 32), shipMaterial);
    this.halo = new Mesh(
      new TorusGeometry(2.47, 0.018, 6, 96),
      new MeshBasicNodeMaterial({ color: 0x9cebea }),
    );
    this.halo.rotation.x = Math.PI / 2;
    this.ship.add(this.orb, this.halo);
    this.orb.castShadow = true;
    this.orb.receiveShadow = true;
    this.scene.add(this.ship);
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
      requiredFeatures: (
        [
          'timestamp-query',
          'texture-compression-bc',
          'texture-compression-etc2',
          'texture-compression-astc',
        ] as GPUFeatureName[]
      ).filter((f) => adapter.features.has(f)),
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
    await this.assets.load('medium');
    await this.landmarks.initialize();
    this.lighting.quality('medium');
    this.lighting.update(true);
  }
  resetCamera(position: Vec3, yaw: number) {
    this.effects.clear();
    this.orb.rotation.x = 0;
    this.lighting.invalidate();
    this.lastTime = 0;
    this.cameraPosition.set(
      position.x + Math.sin(yaw) * 40,
      position.y + 12,
      position.z + Math.cos(yaw) * 40,
    );
    this.pipeline.invalidate();
    this.uniforms.historyValid.value = 0;
    this.uniforms.storm.value = environmentAt(position).storm;
  }
  invalidate() {
    this.pipeline.invalidate();
  }
  async prepare(snapshot: RenderSnapshot, settings: Settings) {
    // Compile/upload while the loading screen is visible, before accepting controls.
    this.render(snapshot, settings, false);
    await this.device.queue.onSubmittedWorkDone();
    this.invalidate();
  }
  private resize(quality: Quality) {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(2, Math.floor(window.innerWidth * pixelRatio * this.scale)),
      height = Math.max(2, Math.floor(window.innerHeight * pixelRatio * this.scale));
    if (width === this.width && height === this.height && quality === this.quality) return;
    this.width = width;
    this.height = height;
    this.quality = quality;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.pipeline.resize(width, height, quality);
    this.lighting.quality(quality);
    if (!this.assets.loading && this.assets.quality !== quality)
      void this.assets.load(quality).catch((e) => this.onLost(String(e)));
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
    const environment = environmentAt(p.position),
      storm = environment.storm;
    u.storm.value = damp(u.storm.value, storm, 0.15, dt);
    u.previousTime.value = this.lastTime || p.time;
    u.delta.value = Math.max(0, p.time - u.previousTime.value);
    u.time.value = p.time;
    this.lastTime = p.time;
    u.alpine.value = environment.alpine;
    u.wetness.value = environment.wetness;
    u.ship.value.set(p.position.x, p.position.y, p.position.z);
    u.shipVelocity.value.set(p.velocity.x, p.velocity.y, p.velocity.z);
    u.contact.value = p.contact === 'water' ? 1 : p.clearance < 8 && p.position.y < 12 ? 0.4 : 0;
    u.energy.value = p.energy / 100;
    u.gravity.value = snapshot.gravity ? 1 : 0;
    u.exposure.value = damp(u.exposure.value, environment.exposure, 0.5, dt);
    u.blur.value = settings.comfort ? 0 : settings.motionBlur * 0.4 * smooth(60, 280, speed);
    u.bloom.value = settings.bloom;
    u.grain.value = settings.grain;
    u.lens.value = settings.comfort ? 0 : settings.lens;
    u.quality.value = settings.quality === 'low' ? 0 : settings.quality === 'high' ? 2 : 1;
    const yaw = snapshot.cameraYaw,
      pitch = snapshot.cameraPitch;
    if (Math.abs(yaw - this.previousYaw) > 0.3 || Math.abs(pitch - this.previousPitch) > 0.2)
      this.pipeline.invalidate();
    this.previousYaw = yaw;
    this.previousPitch = pitch;
    const distance = 65 + Math.min(45, speed * 0.1),
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
    const obstacle = sweepLandmarks(
      p.position,
      { x: this.cameraPosition.x, y: this.cameraPosition.y, z: this.cameraPosition.z },
      2,
      this.stream.obstacles,
    );
    if (obstacle)
      this.cameraPosition.lerpVectors(
        new Vector3(p.position.x, p.position.y, p.position.z),
        this.cameraPosition,
        Math.max(0.005, obstacle.fraction - 0.02),
      );
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
    const visualDt = Math.min(0.05, u.delta.value);
    if (p.form === 'disc') this.orb.rotation.x *= Math.exp(-12 * visualDt);
    else {
      const roll = this.orb.rotation.x + ((speed * visualDt) / PHYSICS.radius) * (1 - p.morph) ** 2;
      this.orb.rotation.x = Math.atan2(Math.sin(roll), Math.cos(roll));
    }
    this.ship.rotation.y = p.yaw;
    this.halo.scale.setScalar(1 + p.morph * 0.4);
    this.halo.visible = p.form === 'disc';
    this.sky.position.copy(this.camera.position);
    this.landmarks.update(snapshot.checkpoint, snapshot.completed);
    this.effects.update(snapshot, this.camera, settings.quality);
    this.terrain.update(p.position.x, p.position.z);
    this.ocean.update(p.position.x, p.position.z);
    this.groundDetail.update(p.position.x, p.position.z, settings.quality);
    this.resize(settings.quality);
    if (!this.assets.loading && this.assets.quality !== settings.quality)
      void this.assets.load(settings.quality).catch((e) => this.onLost(String(e)));
    this.lighting.update();
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
      if (avg > 17.3) this.scale = Math.max(0.75, this.scale - 0.05);
      else if (avg < 16.1) this.scale = Math.min(1, this.scale + 0.025);
      if (this.frozenScale !== null) this.scale = this.frozenScale;
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
      this.assets.memoryBytes +
      this.lighting.memoryBytes +
      8 * 1024 * 1024
    );
  }
  dispose() {
    this.alive = false;
    this.stream.dispose();
    this.terrain.dispose();
    this.ocean.dispose();
    this.pipeline.dispose();
    this.landmarks.dispose();
    this.effects.dispose();
    this.groundDetail.dispose();
    this.lighting.dispose();
    this.assets.dispose();
    this.uniforms.cloudNoise.value.dispose();
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of materials) m.dispose();
      }
    });
    this.renderer.dispose();
  }
  setResolutionScale(scale: number | null) {
    this.frozenScale = scale;
    this.scale = scale ?? 1;
    this.resize(this.quality);
    this.invalidate();
  }
  get visualStats() {
    return {
      scale: this.scale,
      quality: this.quality,
      assetsLoading: this.assets.loading,
      historyValid: this.uniforms.historyValid.value,
      effects: this.effects.count,
      shipRoll: this.orb.rotation.x,
      invalidations: this.pipeline.invalidations,
      camera: {
        x: this.cameraPosition.x,
        y: this.cameraPosition.y,
        z: this.cameraPosition.z,
        fov: this.camera.fov,
      },
      internal: { width: this.width, height: this.height },
      output: { width: this.renderer.domElement.width, height: this.renderer.domElement.height },
      sectors: this.stream.tiles.size,
      pendingSectors: this.stream.pending.size,
    };
  }
}
