import { Mesh, NodeMaterial, PlaneGeometry, type Scene } from 'three/webgpu';
import {
  Fn,
  modelWorldMatrix,
  positionLocal,
  positionPrevious,
  positionWorld,
  vec3,
  vec4,
} from 'three/tsl';
import { terrainHeight, waterHeight } from '../world/field';
import { waterColor, horizonDrop } from './shaders';
import type { RenderUniforms } from './uniforms';
export class OceanRenderer {
  private patches = new Map<string, { mesh: Mesh; x: number; z: number }>();
  private geometry = new Map<number, PlaneGeometry>();
  private material = new NodeMaterial();
  private center = '';
  constructor(
    private scene: Scene,
    private u: RenderUniforms,
  ) {
    const global = positionWorld.add(u.origin),
      offset = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xz.add(u.origin.xz),
      coord = positionLocal.xz.add(offset);
    const displaced = vec3(
      positionLocal.x,
      waterHeight(coord, u.time).sub(horizonDrop(coord, u.eye.xz)),
      positionLocal.z,
    );
    this.material.positionNode = Fn(() => {
      positionPrevious.assign(displaced);
      return displaced;
    })();
    this.material.outputNode = vec4(
      waterColor(global, u.eye, u.sun, u.storm, terrainHeight(global.xz), u.ship, u.time),
      1,
    );
  }
  update(x: number, z: number) {
    const center = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    if (center === this.center) return;
    this.center = center;
    const wanted = new Map<string, { x: number; z: number; size: number }>();
    const visit = (px: number, pz: number, size: number) => {
      const d = Math.hypot(
        Math.max(Math.abs(x - px - size / 2) - size / 2, 0),
        Math.max(Math.abs(z - pz - size / 2) - size / 2, 0),
      );
      if (d > 120000) return;
      if (size > 512 && d < size * 1.2) {
        const h = size / 2;
        for (let iz = 0; iz < 2; iz++)
          for (let ix = 0; ix < 2; ix++) visit(px + ix * h, pz + iz * h, h);
        return;
      }
      wanted.set(`${px},${pz},${size}`, { x: px, z: pz, size });
    };
    visit(-262144, -262144, 524288);
    for (const [key, p] of this.patches)
      if (!wanted.has(key)) {
        this.scene.remove(p.mesh);
        this.patches.delete(key);
      }
    for (const [key, p] of wanted)
      if (!this.patches.has(key)) {
        let geometry = this.geometry.get(p.size);
        if (!geometry) {
          const divisions = p.size === 512 ? 128 : 32;
          geometry = new PlaneGeometry(p.size, p.size, divisions, divisions);
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(p.size / 2, 0, p.size / 2);
          this.geometry.set(p.size, geometry);
        }
        const mesh = new Mesh(geometry, this.material);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.patches.set(key, { mesh, x: p.x, z: p.z });
      }
    this.rebase();
  }
  rebase() {
    for (const p of this.patches.values())
      p.mesh.position.set(p.x - this.u.origin.value.x, 0, p.z - this.u.origin.value.z);
  }
  get vertices() {
    let count = 0;
    for (const p of this.patches.values()) count += p.mesh.geometry.getAttribute('position').count;
    return count;
  }
  dispose() {
    for (const p of this.patches.values()) this.scene.remove(p.mesh);
    for (const g of this.geometry.values()) g.dispose();
    this.material.dispose();
    this.patches.clear();
  }
}
