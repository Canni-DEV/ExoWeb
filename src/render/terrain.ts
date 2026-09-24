import {
  BufferAttribute,
  Mesh,
  NodeMaterial,
  PlaneGeometry,
  Vector2,
  type Scene,
} from 'three/webgpu';
import {
  attribute,
  Fn,
  mix,
  positionLocal,
  positionPrevious,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { terrainHeight } from '../world/field';
import { terrainColor, horizonDrop } from './shaders';
import { tileKey, TILE_SIZE } from '../world/tiles';
import type { TerrainStream } from '../world/stream';
import type { RenderUniforms } from './uniforms';

interface Patch {
  mesh: Mesh;
  x: number;
  z: number;
  size: number;
  near: boolean;
}
export class TerrainRenderer {
  private patches = new Map<string, Patch>();
  private center = '';
  private nearMaterial: NodeMaterial;
  private farMaterial: NodeMaterial;
  private geometries = new Map<number, PlaneGeometry>();
  constructor(
    private scene: Scene,
    private stream: TerrainStream,
    private u: RenderUniforms,
  ) {
    this.nearMaterial = this.material(true);
    this.farMaterial = this.material(false);
    stream.onTile = () => {
      this.center = '';
    };
  }
  private material(near: boolean) {
    const m = new NodeMaterial();
    const global = positionWorld.add(this.u.origin);
    // positionWorld depends on positionNode: use an independent per-object offset.
    const offset = uniform(new Vector2()).onObjectUpdate(
      ({ object }) => new Vector2(object!.userData.worldX, object!.userData.worldZ),
    );
    const size = uniform(256).onObjectUpdate(({ object }) => object!.userData.patchSize as number);
    const coord = positionLocal.xz.add(offset);
    const coarseStep = size.div(32);
    const morph = smoothstep(size.mul(1.6), size.mul(3.2), coord.distance(this.u.eye.xz));
    const sample = near ? coord : mix(coord, coord.div(coarseStep).floor().mul(coarseStep), morph);
    const height = (near ? attribute('height', 'float') : terrainHeight(sample)).sub(
      attribute('skirt', 'float').mul(size.div(16).max(4).min(500)),
    );
    const visualHeight = near ? height : height.sub(horizonDrop(sample, this.u.eye.xz));
    const displaced = vec3(sample.x.sub(offset.x), visualHeight, sample.y.sub(offset.y));
    m.positionNode = Fn(() => {
      positionPrevious.assign(displaced);
      return displaced;
    })();
    m.outputNode = vec4(terrainColor(global, this.u.eye, this.u.sun, this.u.storm, this.u.ship), 1);
    return m;
  }
  update(x: number, z: number) {
    const cx = Math.floor(x / 256),
      cz = Math.floor(z / 256),
      center = `${cx},${cz}`;
    if (center === this.center) return;
    this.center = center;
    const wanted = new Map<string, { x: number; z: number; size: number; near: boolean }>();
    // Quadtree covering the complete region. Distance-based splits keep far geometry small.
    const visit = (px: number, pz: number, size: number) => {
      const distance = Math.hypot(
        Math.max(Math.abs(x - (px + size / 2)) - size / 2, 0),
        Math.max(Math.abs(z - (pz + size / 2)) - size / 2, 0),
      );
      if (size > 256 && distance < size * 1.8) {
        const h = size / 2;
        for (let iz = 0; iz < 2; iz++)
          for (let ix = 0; ix < 2; ix++) visit(px + ix * h, pz + iz * h, h);
        return;
      }
      const near =
        size === 256 &&
        Math.abs(Math.floor(px / 256) - cx) <= 1 &&
        Math.abs(Math.floor(pz / 256) - cz) <= 1 &&
        this.stream.ready(px, pz);
      wanted.set(`${px},${pz},${size},${near}`, { x: px, z: pz, size, near });
    };
    visit(-32768, -32768, 65536);
    for (const [key, p] of this.patches)
      if (!wanted.has(key)) {
        this.scene.remove(p.mesh);
        if (p.near) p.mesh.geometry.dispose();
        this.patches.delete(key);
      }
    for (const [key, p] of wanted)
      if (!this.patches.has(key)) {
        let geometry: PlaneGeometry;
        if (p.near) {
          geometry = new PlaneGeometry(TILE_SIZE, TILE_SIZE, 256, 256);
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(128, 0, 128);
          geometry.setAttribute(
            'height',
            new BufferAttribute(this.stream.tiles.get(tileKey(p.x, p.z))!.data, 1),
          );
          this.addSkirts(geometry, 256);
        } else {
          geometry = this.geometries.get(p.size)!;
          if (!geometry) {
            geometry = new PlaneGeometry(p.size, p.size, 64, 64);
            geometry.rotateX(-Math.PI / 2);
            geometry.translate(p.size / 2, 0, p.size / 2);
            this.addSkirts(geometry, p.size);
            this.geometries.set(p.size, geometry);
          }
        }
        const mesh = new Mesh(geometry, p.near ? this.nearMaterial : this.farMaterial);
        mesh.frustumCulled = false;
        mesh.userData.worldX = p.x;
        mesh.userData.worldZ = p.z;
        mesh.userData.patchSize = p.size;
        this.scene.add(mesh);
        this.patches.set(key, { ...p, mesh });
      }
    this.rebase();
  }
  private addSkirts(geometry: PlaneGeometry, size: number) {
    // Vertical skirts hide sub-pixel cracks between independently morphing LODs.
    const vertices = geometry.getAttribute('position'),
      segments = Math.round(Math.sqrt(vertices.count)) - 1,
      stride = segments + 1;
    const perimeter: number[] = [];
    for (let i = 0; i < segments; i++) perimeter.push(i);
    for (let i = 0; i < segments; i++) perimeter.push(i * stride + segments);
    for (let i = segments; i > 0; i--) perimeter.push(segments * stride + i);
    for (let i = segments; i > 0; i--) perimeter.push(i * stride);
    const count = vertices.count;
    for (const name of Object.keys(geometry.attributes)) {
      const original = geometry.getAttribute(name),
        array = new Float32Array((count + perimeter.length) * original.itemSize);
      array.set(original.array);
      for (let i = 0; i < perimeter.length; i++)
        for (let axis = 0; axis < original.itemSize; axis++)
          array[(count + i) * original.itemSize + axis] =
            original.array[perimeter[i] * original.itemSize + axis];
      geometry.setAttribute(name, new BufferAttribute(array, original.itemSize));
    }
    const skirt = new Float32Array(count + perimeter.length);
    skirt.fill(1, count);
    geometry.setAttribute('skirt', new BufferAttribute(skirt, 1));
    const indices = Array.from(geometry.index!.array);
    for (let i = 0; i < perimeter.length; i++) {
      const j = (i + 1) % perimeter.length,
        a = perimeter[i],
        b = perimeter[j];
      indices.push(a, count + i, b, b, count + i, count + j);
    }
    geometry.setIndex(indices);
    geometry.userData.size = size;
  }
  rebase() {
    for (const p of this.patches.values())
      p.mesh.position.set(
        p.x - this.u.origin.value.x,
        -this.u.origin.value.y,
        p.z - this.u.origin.value.z,
      );
  }
  get vertices() {
    let count = 0;
    for (const p of this.patches.values()) count += p.mesh.geometry.getAttribute('position').count;
    return count;
  }
  dispose() {
    for (const p of this.patches.values()) {
      this.scene.remove(p.mesh);
      if (p.near) p.mesh.geometry.dispose();
    }
    for (const g of this.geometries.values()) g.dispose();
    this.nearMaterial.dispose();
    this.farMaterial.dispose();
    this.patches.clear();
  }
}
