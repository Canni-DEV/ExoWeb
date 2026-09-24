import { BoxGeometry, IcosahedronGeometry } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/assets/models', { recursive: true });
function glb(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  g.computeBoundingBox();
  const arrays = ['position', 'normal'].map((name) =>
    Buffer.from(g.getAttribute(name).array.buffer),
  );
  const bin = Buffer.concat(arrays);
  const count = g.getAttribute('position').count;
  const json = {
    asset: { version: '2.0', generator: 'ExoWeb original geometry' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: arrays.map((b, i) => ({
      buffer: 0,
      byteOffset: i === 0 ? 0 : arrays[0].length,
      byteLength: b.length,
      target: 34962,
    })),
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count,
        type: 'VEC3',
        min: g.boundingBox.min.toArray(),
        max: g.boundingBox.max.toArray(),
      },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
    ],
  };
  let bytes = Buffer.from(JSON.stringify(json));
  bytes = Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, 32)]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + bytes.length + bin.length, 8);
  head.writeUInt32LE(bytes.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, bytes, bh, bin]);
}
const monolith = new BoxGeometry(1, 1, 1, 1, 6, 1);
const p = monolith.getAttribute('position');
for (let i = 0; i < p.count; i++) {
  const y = p.getY(i),
    taper = 1 - (y + 0.5) * 0.3;
  p.setXYZ(i, p.getX(i) * taper + (y + 0.5) * 0.12, y, p.getZ(i) * taper);
}
await writeFile('public/assets/models/monolith.glb', glb(monolith));
for (let v = 0; v < 3; v++) {
  const rock = new IcosahedronGeometry(0.5, 2),
    a = rock.getAttribute('position');
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i),
      y = a.getY(i),
      z = a.getZ(i);
    const scale = 0.83 + 0.13 * Math.sin(x * 31 + v) * Math.sin(y * 19 + z * 17);
    a.setXYZ(i, x * scale, y * scale, z * scale);
  }
  await writeFile(`public/assets/models/rock-${v}.glb`, glb(rock));
}
