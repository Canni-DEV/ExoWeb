import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  RingGeometry,
  Quaternion,
  Vector3,
  Color,
  type PerspectiveCamera,
  type Scene,
} from 'three/webgpu';
import { attribute, float, uv, vec4 } from 'three/tsl';
import { PROFILES } from '../config';
import type { Quality, RenderSnapshot, Vec3 } from '../types';
import type { RenderUniforms } from './uniforms';
import { waterSurface } from '../world/field';

interface Particle {
  position: Vector3;
  velocity: Vector3;
  born: number;
  life: number;
  size: number;
  water: boolean;
  foam: boolean;
  color: Color;
}
export class EffectsRenderer {
  private particles: Particle[] = [];
  private mesh: InstancedMesh;
  private alpha = new InstancedBufferAttribute(new Float32Array(1024), 1);
  private trail: Mesh;
  private trailPoints: { position: Vector3; side: Vector3; time: number }[] = [];
  private trailPositions = new Float32Array(96 * 4 * 3);
  private trailAlpha = new Float32Array(96 * 4);
  private matrix = new Matrix4();
  private quaternion = new Quaternion();
  private foamRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private lastTime = 0;
  private emission = 0;
  private randomState = 7319;
  private consumed = 0;
  private sonic: Mesh;
  private sonicBorn = -100;
  private sonicPosition = new Vector3();
  constructor(
    private scene: Scene,
    private u: RenderUniforms,
  ) {
    const geometry = new PlaneGeometry(1, 1);
    geometry.setAttribute('particleAlpha', this.alpha);
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
    });
    const radial = uv().sub(0.5).length().mul(2);
    material.opacityNode = float(1)
      .sub(radial.smoothstep(0.05, 1))
      .pow(2)
      .mul(attribute('particleAlpha', 'float'));
    this.mesh = new InstancedMesh(geometry, material, 1024);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.layers.set(2);
    for (let i = 0; i < 1024; i++) this.mesh.setColorAt(i, new Color(1, 1, 1));
    scene.add(this.mesh);
    const ribbon = new BufferGeometry();
    ribbon.setAttribute('position', new Float32BufferAttribute(this.trailPositions, 3));
    ribbon.setAttribute('trailAlpha', new Float32BufferAttribute(this.trailAlpha, 1));
    const indices: number[] = [];
    for (let i = 0; i < 95; i++)
      for (let side = 0; side < 2; side++) {
        const a = i * 4 + side * 2,
          b = (i + 1) * 4 + side * 2;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    ribbon.setIndex(indices);
    ribbon.setDrawRange(0, 0);
    const trailMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      color: 0xd7d9ff,
      side: 2,
    });
    trailMaterial.outputNode = vec4(1.1, 1.2, 1.65, attribute('trailAlpha', 'float'));
    this.trail = new Mesh(ribbon, trailMaterial);
    this.trail.frustumCulled = false;
    this.trail.layers.set(2);
    scene.add(this.trail);
    this.sonic = new Mesh(
      new RingGeometry(0.88, 1, 64),
      new MeshBasicNodeMaterial({
        color: 0xd4e5ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: 2,
      }),
    );
    this.sonic.layers.set(2);
    this.sonic.visible = false;
    scene.add(this.sonic);
  }
  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967295;
  }
  private emit(
    position: Vec3,
    velocity: Vec3,
    time: number,
    water: boolean,
    strength: number,
    foam = false,
  ) {
    if (this.particles.length >= 1024) return;
    const angle = this.random() * Math.PI * 2,
      radial = this.random() * Math.min(12, strength * 0.3 + 2);
    this.particles.push({
      position: new Vector3(position.x, position.y - 2, position.z),
      velocity: new Vector3(
        velocity.x * 0.06 + Math.cos(angle) * radial,
        foam ? 0 : 1 + this.random() * Math.min(18, strength * 0.5),
        velocity.z * 0.06 + Math.sin(angle) * radial,
      ),
      born: time,
      life: foam ? 4 : water ? 1.4 + this.random() : 2 + this.random() * 1.4,
      size: foam ? 2.5 : water ? 0.25 + this.random() * 0.65 : 1 + this.random() * 2,
      water,
      foam,
      color: new Color(water ? 0xb6ded5 : 0x99675e),
    });
  }
  update(snapshot: RenderSnapshot, camera: PerspectiveCamera, quality: Quality) {
    const p = snapshot.player,
      time = p.time,
      dt = Math.max(0, Math.min(0.05, time - this.lastTime));
    this.lastTime = time;
    for (const event of snapshot.events ?? []) {
      if (event.id <= this.consumed) continue;
      this.consumed = event.id;
      if (event.kind === 'splash' || event.kind === 'impact') {
        for (let i = 0; i < Math.min(64, Math.ceil(event.strength * 1.5)); i++)
          this.emit(event.position, event.velocity, time, event.kind === 'splash', event.strength);
        if (event.kind === 'splash') {
          this.u.splash.value = 1;
          this.emit(event.position, event.velocity, time, true, 1, true);
        }
      }
      if (event.kind === 'sonic') {
        this.sonicBorn = time;
        this.sonicPosition.set(event.position.x, event.position.y, event.position.z);
        this.sonic.quaternion.setFromUnitVectors(
          new Vector3(0, 0, 1),
          new Vector3(event.velocity.x, event.velocity.y, event.velocity.z).normalize(),
        );
      }
    }
    const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z),
      water = p.contact === 'water' || (p.position.y < 12 && p.clearance < 8);
    if (dt > 0 && speed > 8 && (p.contact !== 'air' || water)) {
      this.emission += dt * Math.min(100, speed * 0.7);
      while (this.emission >= 1) {
        this.emit(p.position, p.velocity, time, water, Math.min(12, speed * 0.04));
        this.emission--;
      }
    }
    this.u.splash.value *= Math.exp(-dt * 2);
    const sonicAge = time - this.sonicBorn;
    this.sonic.visible = sonicAge < 0.65;
    if (this.sonic.visible) {
      this.sonic.position.copy(this.sonicPosition).sub(this.u.origin.value);
      this.sonic.scale.setScalar(6 + sonicAge * 85);
      (this.sonic.material as MeshBasicNodeMaterial).opacity = (1 - sonicAge / 0.65) * 0.3;
    }
    const humidity = (p.position.y > 1400 && p.position.y < 3600 ? 0.3 : 0) + (water ? 0.55 : 0);
    this.u.lensWet.value +=
      (Math.min(1, humidity + this.u.splash.value) - this.u.lensWet.value) *
      (1 - Math.exp(-dt * 0.8));
    this.particles = this.particles.filter((a) => time - a.born < a.life);
    const max = PROFILES[quality].particles;
    this.mesh.count = Math.min(max, this.particles.length);
    for (let i = 0; i < this.mesh.count; i++) {
      const a = this.particles[i],
        age = (time - a.born) / a.life;
      a.position.addScaledVector(a.velocity, dt);
      if (!a.foam) a.velocity.y -= (a.water ? 8 : 1) * dt;
      if (a.foam) a.position.y = waterSurface(a.position.x, a.position.z, time).height + 0.06;
      const size = a.size * (1 + age * (a.foam ? 8 : a.water ? 1 : 3));
      this.quaternion.copy(a.foam ? this.foamRotation : camera.quaternion);
      this.matrix.compose(
        a.position.clone().sub(this.u.origin.value),
        this.quaternion,
        new Vector3(size, size, 1),
      );
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, a.color);
      this.alpha.setX(i, (1 - age) ** 2 * (a.water ? 0.65 : 0.3));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.trailPoints = this.trailPoints.filter((a) => time - a.time < 2.1);
    const last = this.trailPoints.at(-1);
    if (dt > 0 && p.form === 'disc' && speed > 22 && (!last || time - last.time > 0.023)) {
      const side = new Vector3(p.velocity.z, 0, -p.velocity.x).normalize();
      this.trailPoints.push({
        position: new Vector3(p.position.x, p.position.y, p.position.z),
        side,
        time,
      });
      if (this.trailPoints.length > 96) this.trailPoints.shift();
    }
    const vertices = this.trail.geometry.getAttribute('position'),
      alpha = this.trail.geometry.getAttribute('trailAlpha');
    for (let i = 0; i < this.trailPoints.length; i++) {
      const point = this.trailPoints[i],
        fade = Math.max(0, 1 - (time - point.time) / 2.1),
        width = 0.065 + (1 - fade) * 0.17;
      for (let side = 0; side < 2; side++)
        for (let edge = 0; edge < 2; edge++) {
          const pos = point.position
            .clone()
            .addScaledVector(
              point.side,
              (side === 0 ? -1 : 1) * 2.8 + (edge === 0 ? -width : width),
            )
            .sub(this.u.origin.value);
          const index = i * 4 + side * 2 + edge;
          vertices.setXYZ(index, pos.x, pos.y, pos.z);
          alpha.setX(index, fade * 0.5);
        }
    }
    vertices.needsUpdate = true;
    alpha.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, Math.max(0, this.trailPoints.length - 1) * 12);
  }
  get count() {
    return this.particles.length;
  }
  clear() {
    this.particles = [];
    this.trailPoints = [];
    this.lastTime = 0;
    this.sonicBorn = -100;
    this.sonic.visible = false;
    this.emission = 0;
    this.mesh.count = 0;
    this.trail.geometry.setDrawRange(0, 0);
    this.u.lensWet.value = 0;
    this.u.splash.value = 0;
  }
  dispose() {
    for (const m of [this.mesh, this.trail, this.sonic]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshBasicNodeMaterial).dispose();
    }
  }
}
