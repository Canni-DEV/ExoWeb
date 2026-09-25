import {
  Color,
  CylinderGeometry,
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type Scene,
  type BufferGeometry,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cameraViewMatrix, mix, output, positionWorld, normalWorld, vec3, vec4 } from 'three/tsl';
import { landmarkLayout } from '../world/landmarks';
import { aerial, surfaceNormal } from './shaders';
import type { TerrainStream } from '../world/stream';
import type { RenderUniforms } from './uniforms';
import type { MaterialLibrary } from './assets';
import type { Landmark } from '../types';

export class LandmarkRenderer {
  private items: { definition: Landmark; mesh: Mesh; beam?: Group }[] = [];
  private geometries: BufferGeometry[] = [];
  private material: MeshStandardNodeMaterial;
  constructor(
    private scene: Scene,
    private stream: TerrainStream,
    private u: RenderUniforms,
    assets: MaterialLibrary,
  ) {
    const m = (this.material = new MeshStandardNodeMaterial({ metalness: 0.22, roughness: 0.38 }));
    const p = positionWorld.add(u.origin),
      n = normalWorld,
      map = assets.maps.rock;
    const x = map.sample(p.yz.mul(0.035)),
      y = map.sample(p.xz.mul(0.035)),
      z = map.sample(p.xy.mul(0.035));
    m.normalNode = surfaceNormal(n, x, y, z).transformDirection(cameraViewMatrix);
    m.colorNode = mix(vec3(0.025, 0.018, 0.038), vec3(0.12, 0.07, 0.075), y.b);
    m.roughnessNode = y.a.mul(0.7);
    m.outputNode = vec4(aerial(output.rgb, p, u.eye, u.sun, u.storm), 1);
    // Material receives the same directional shadows as the landscape.
  }
  async initialize() {
    const loader = new GLTFLoader();
    for (const name of ['monolith', 'rock-0', 'rock-1', 'rock-2']) {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${name}.glb`);
      let geometry: BufferGeometry | undefined;
      gltf.scene.traverse((o) => {
        if (o instanceof Mesh) {
          geometry = o.geometry;
          for (const material of Array.isArray(o.material) ? o.material : [o.material])
            material.dispose();
        }
      });
      if (!geometry) throw new Error(`Modelo vacío: ${name}`);
      this.geometries.push(geometry);
    }
    for (const definition of landmarkLayout()) {
      const base = await this.stream.loadPoint(definition.position.x, definition.position.z);
      definition.position.y +=
        Math.max(0, base) + (definition.kind === 'monolith' ? definition.scale.y * 0.5 : 0);
      const mesh = new Mesh(
        this.geometries[definition.kind === 'monolith' ? 0 : 1 + (definition.seed % 3)],
        this.material,
      );
      mesh.scale.set(definition.scale.x, definition.scale.y, definition.scale.z);
      mesh.rotation.y = definition.yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      let beam: Group | undefined;
      if (definition.kind === 'monolith') {
        beam = new Group();
        for (const [radius, opacity] of [
          [1.2, 0.8],
          [5, 0.15],
          [14, 0.025],
        ]) {
          const light = new Mesh(
            new CylinderGeometry(radius, radius * 1.4, 14000, 6, 1, true),
            new MeshBasicNodeMaterial({
              color: new Color(0.6, 1.35, 1.8),
              transparent: true,
              opacity,
              depthWrite: false,
              blending: AdditiveBlending,
            }),
          );
          light.position.y = 7000;
          beam.add(light);
        }
        this.scene.add(beam);
      }
      this.scene.add(mesh);
      this.items.push({ definition, mesh, beam });
    }
    this.stream.obstacles = this.items.map((x) => x.definition);
    this.update(0, false);
  }
  update(checkpoint: number, completed: boolean) {
    for (const item of this.items) {
      const { position } = item.definition;
      item.mesh.position.set(
        position.x - this.u.origin.value.x,
        position.y - this.u.origin.value.y,
        position.z - this.u.origin.value.z,
      );
      if (item.beam) {
        item.beam.position.copy(item.mesh.position);
        item.beam.visible =
          completed || item.definition.id === `signal-${Math.min(4, checkpoint + 1)}`;
      }
    }
  }
  dispose() {
    for (const item of this.items) {
      this.scene.remove(item.mesh);
      if (item.beam) {
        this.scene.remove(item.beam);
        item.beam.traverse((o) => {
          if (o instanceof Mesh) {
            o.geometry.dispose();
            (o.material as MeshBasicNodeMaterial).dispose();
          }
        });
      }
    }
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
    this.items = [];
  }
}
