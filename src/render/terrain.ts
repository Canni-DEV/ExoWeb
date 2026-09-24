import {
  BufferAttribute,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Vector4,
  type Scene,
  type Node,
} from 'three/webgpu';
import {
  attribute,
  cameraViewMatrix,
  modelWorldMatrix,
  output,
  sampler,
  Fn,
  positionLocal,
  positionPrevious,
  positionWorld,
  uniform,
  vec3,
  vec2,
  vec4,
} from 'three/tsl';
import { terrainHeight } from '../world/field';
import {
  terrainSurface,
  terrainWeights,
  surfaceNormal,
  cloudShadow,
  aerial,
  horizonDrop,
  stitchHeight,
} from './shaders';
import type { MaterialLibrary } from './assets';
import { MATERIAL_NAMES } from './assets';
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
  private nearMaterial: MeshStandardNodeMaterial;
  private farMaterial: MeshStandardNodeMaterial;
  private geometries = new Map<number, PlaneGeometry>();
  private nearPool: PlaneGeometry[] = [];
  constructor(
    private scene: Scene,
    private stream: TerrainStream,
    private u: RenderUniforms,
    private library?: MaterialLibrary,
  ) {
    this.nearMaterial = this.material(true);
    this.farMaterial = this.material(false);
    stream.onTile = () => {
      this.center = '';
    };
  }
  private material(near: boolean) {
    const m = new MeshStandardNodeMaterial({ metalness: 0.04 });
    const global = positionWorld.add(this.u.origin);
    // positionWorld depends on positionNode: use an independent per-object offset.
    const offset = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xz.add(this.u.origin.xz);
    const size = uniform(256).onObjectUpdate(({ object }) => object!.userData.patchSize as number);
    const coord = positionLocal.xz.add(offset);
    // Keep vertices on their canonical coordinates: snapping XZ collapsed triangles at LOD rims.
    const sample = coord;
    const edges = uniform(new Vector4()).onObjectUpdate(
      ({ object }) => object!.userData.edgeSpacing as Vector4,
    );
    // Fine rim vertices interpolate the actual coarse edge; skirts alone exposed sawtooth walls.
    const base = near
      ? attribute('height', 'float')
      : terrainHeight(sample).sub(horizonDrop(sample, this.u.eye.xz));
    const visualHeight = stitchHeight(
      sample,
      positionLocal.xz,
      size,
      edges,
      this.u.eye.xz,
      base,
      size.div(near ? 256 : 64),
    ).sub(attribute('skirt', 'float').mul(4));
    const displaced = vec3(sample.x.sub(offset.x), visualHeight, sample.y.sub(offset.y));
    m.positionNode = Fn(() => {
      positionPrevious.assign(displaced);
      return displaced;
    })();
    const epsilon = global.distance(this.u.eye).mul(0.004).clamp(4, 120);
    const normalCoord = global.xz;
    const smoothNormal = vec3(
      terrainHeight(normalCoord.sub(vec2(epsilon, 0))).sub(
        terrainHeight(normalCoord.add(vec2(epsilon, 0))),
      ),
      epsilon.mul(2),
      terrainHeight(normalCoord.sub(vec2(0, epsilon))).sub(
        terrainHeight(normalCoord.add(vec2(0, epsilon))),
      ),
    ).normalize();
    const n = smoothNormal;
    const weights = terrainWeights(global, n);
    const coords = global.mul(0.15);
    const blend = n.abs().pow(5);
    const sum = blend.x.add(blend.y).add(blend.z);
    const samples = MATERIAL_NAMES.map((name) => {
      const map = this.library?.maps[name];
      return map
        ? [map.sample(coords.yz), map.sample(coords.xz), map.sample(coords.xy)]
        : [vec4(0.5, 0.5, 0.5, 0.6), vec4(0.5, 0.5, 0.5, 0.6), vec4(0.5, 0.5, 0.5, 0.6)];
    });
    const packed = samples.map((s) =>
      s[0].mul(blend.x).add(s[1].mul(blend.y)).add(s[2].mul(blend.z)).div(sum),
    );
    const surface = terrainSurface(
      global,
      n,
      packed[0],
      packed[1],
      packed[2],
      packed[3],
      this.u.storm,
    );
    const mixed = [0, 1, 2].map((axis) =>
      samples[0][axis]
        .mul(weights.x)
        .add(samples[1][axis].mul(weights.y))
        .add(samples[2][axis].mul(weights.z))
        .add(samples[3][axis].mul(weights.w)),
    );
    const normal = surfaceNormal(n, mixed[0], mixed[1], mixed[2]);
    m.normalNode = normal.transformDirection(cameraViewMatrix);
    m.colorNode = surface.rgb;
    m.roughnessNode = surface.a;
    const occlusion = packed[0].b
      .mul(weights.x)
      .add(packed[1].b.mul(weights.y))
      .add(packed[2].b.mul(weights.z))
      .add(weights.w)
      .mul(0.12)
      .add(0.88);
    m.aoNode = occlusion;
    const shadow = cloudShadow(
      global,
      this.u.sun,
      this.u.time,
      this.u.storm,
      this.u.cloudNoise,
      sampler(this.u.cloudNoise),
    );
    // Three r186 calls this with the shadow node; published types incorrectly declare no args.
    m.receivedShadowNode = Fn(([received]: [Node<'vec4'>]) =>
      received.mul(shadow),
    ) as unknown as () => Node;
    m.outputNode = vec4(aerial(output.rgb, global, this.u.eye, this.u.sun, this.u.storm), 1);
    m.castShadowPositionNode = displaced;
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
      if (distance > 120000) return;
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
    // Match the ocean's horizon. Stopping land at the playable boundary exposed
    // water above positive terrain heights and produced a sheet of distant foam.
    visit(-262144, -262144, 524288);
    for (const [key, p] of this.patches)
      if (!wanted.has(key)) {
        this.scene.remove(p.mesh);
        if (p.near) this.nearPool.push(p.mesh.geometry as PlaneGeometry);
        this.patches.delete(key);
      }
    for (const [key, p] of wanted)
      if (!this.patches.has(key)) {
        let geometry: PlaneGeometry;
        if (p.near) {
          const heights = this.stream.tiles.get(tileKey(p.x, p.z))!.data;
          const reused = this.nearPool.pop();
          if (reused) {
            geometry = reused;
            const attribute = geometry.getAttribute('height');
            attribute.array.set(heights);
            const perimeter = geometry.userData.perimeter as number[];
            for (let i = 0; i < perimeter.length; i++)
              attribute.array[heights.length + i] = heights[perimeter[i]];
            attribute.needsUpdate = true;
          } else {
            geometry = new PlaneGeometry(TILE_SIZE, TILE_SIZE, 256, 256);
            geometry.rotateX(-Math.PI / 2);
            geometry.translate(128, 0, 128);
            geometry.setAttribute('height', new BufferAttribute(heights, 1));
            this.addSkirts(geometry, 256);
          }
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
        mesh.castShadow = p.size <= 1024;
        mesh.receiveShadow = true;
        mesh.userData.worldX = p.x;
        mesh.userData.worldZ = p.z;
        mesh.userData.patchSize = p.size;
        mesh.userData.edgeSpacing = new Vector4();
        this.scene.add(mesh);
        this.patches.set(key, { ...p, mesh });
      }
    const all = [...this.patches.values()];
    for (const p of all) {
      const own = p.size / (p.near ? 256 : 64),
        epsilon = 0.01;
      const points = [
        [p.x + p.size / 2, p.z - epsilon],
        [p.x + p.size / 2, p.z + p.size + epsilon],
        [p.x - epsilon, p.z + p.size / 2],
        [p.x + p.size + epsilon, p.z + p.size / 2],
      ];
      const steps = points.map(([px, pz]) => {
        const neighbor = all.find(
          (q) => px >= q.x && px < q.x + q.size && pz >= q.z && pz < q.z + q.size,
        );
        const spacing = neighbor ? neighbor.size / (neighbor.near ? 256 : 64) : own;
        return spacing > own ? spacing : 0;
      });
      (p.mesh.userData.edgeSpacing as Vector4).set(steps[0], steps[1], steps[2], steps[3]);
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
    geometry.userData.perimeter = perimeter;
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
    for (const g of this.nearPool) count += g.getAttribute('position').count;
    return count;
  }
  dispose() {
    for (const p of this.patches.values()) {
      this.scene.remove(p.mesh);
      if (p.near) p.mesh.geometry.dispose();
    }
    for (const g of this.geometries.values()) g.dispose();
    for (const g of this.nearPool) g.dispose();
    this.nearPool = [];
    this.nearMaterial.dispose();
    this.farMaterial.dispose();
    this.patches.clear();
  }
}
