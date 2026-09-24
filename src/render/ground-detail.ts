import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three/webgpu';
import { output, positionWorld, vec4 } from 'three/tsl';
import type { TerrainStream } from '../world/stream';
import type { RenderUniforms } from './uniforms';
import type { Quality } from '../types';
import { aerial } from './shaders';

/** Sub-radius gravel is decorative; large, navigational rocks are shared landmark colliders. */
export class GroundDetail {
  private mesh: InstancedMesh;
  private key = '';
  constructor(
    private scene: Scene,
    private stream: TerrainStream,
    private u: RenderUniforms,
  ) {
    const material = new MeshStandardNodeMaterial({
      color: 0x2b1922,
      roughness: 0.73,
      vertexColors: true,
    });
    material.outputNode = vec4(
      aerial(output.rgb, positionWorld.add(u.origin), u.eye, u.sun, u.storm),
      1,
    );
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), material, 1600);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  update(x: number, z: number, quality: Quality) {
    const cx = Math.floor(x / 8),
      cz = Math.floor(z / 8),
      key = `${cx},${cz},${quality},${this.u.origin.value.x},${this.u.origin.value.z}`;
    if (key === this.key) return;
    this.key = key;
    const reach = quality === 'low' ? 10 : quality === 'high' ? 19 : 15;
    const hash = (x: number, z: number) => {
      let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    let count = 0;
    const matrix = new Matrix4(),
      rotation = new Quaternion(),
      position = new Vector3(),
      scale = new Vector3();
    for (let iz = -reach; iz <= reach; iz++)
      for (let ix = -reach; ix <= reach; ix++) {
        const gx = cx + ix,
          gz = cz + iz,
          r = hash(gx, gz),
          px = gx * 8 + r * 7,
          pz = gz * 8 + hash(gz, gx) * 7;
        if (r < 0.24 || !this.stream.ready(px, pz)) continue;
        const surface = this.stream.surface(px, pz);
        if (surface.height < 4 || surface.normal.y < 0.72) continue;
        const size = 0.08 + r * 0.24;
        position.set(
          px - this.u.origin.value.x,
          surface.height + size * 0.28,
          pz - this.u.origin.value.z,
        );
        rotation.setFromAxisAngle(new Vector3(0, 1, 0), r * 20);
        scale.set(size, size * 0.62, size * (0.7 + r * 0.4));
        matrix.compose(position, rotation, scale);
        this.mesh.setMatrixAt(count, matrix);
        this.mesh.setColorAt(count, new Color(0.35 + r * 0.4, 0.28 + r * 0.2, 0.31 + r * 0.2));
        count++;
      }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardNodeMaterial).dispose();
  }
}
