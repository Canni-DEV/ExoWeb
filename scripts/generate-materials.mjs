// Original periodic surface fields. No reference screenshots are sampled or redistributed.
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const output = 'public/assets/materials';
await mkdir(output, { recursive: true });
await mkdir('public/assets/basis', { recursive: true });
await mkdir('.cache/nacar-assets', { recursive: true });
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm'])
  await copyFile(
    `node_modules/three/examples/jsm/libs/basis/${file}`,
    `public/assets/basis/${file}`,
  );
const expected = '7b8837e020e48239ab3085697a16334649c07ef121f5a6556d8b17919938a143';
let encoder;
try {
  encoder = await readFile('.cache/nacar-assets/basisu.wasm');
} catch {
  const response = await fetch(
    'https://raw.githubusercontent.com/BinomialLLC/basis_universal/v2_1_0r/bin/basisu_st.wasm',
  );
  if (!response.ok) throw new Error('Basis encoder download failed');
  encoder = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(encoder).digest('hex') !== expected)
  throw new Error('Unverified Basis encoder');
await writeFile('.cache/nacar-assets/basisu.wasm', encoder);
const TAU = Math.PI * 2,
  clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 7319;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, cells) {
  x *= cells;
  y *= cells;
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx *= fx * (3 - 2 * fx);
  fy *= fy * (3 - 2 * fy);
  const h = (a, b) => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells);
  const a = h(ix, iy) * (1 - fx) + h(ix + 1, iy) * fx,
    b = h(ix, iy + 1) * (1 - fx) + h(ix + 1, iy + 1) * fx;
  return a * (1 - fy) + b * fy;
}
function height(kind, x, y) {
  const broad = noise(x, y, 8),
    medium = noise(x, y, 32),
    fine = noise(x, y, 128);
  const warp = Math.sin(y * TAU * 3) * 0.075 + (broad - 0.5) * 0.12;
  if (kind === 'sand')
    return (
      0.5 +
      Math.sin((x + warp) * TAU * 19) * 0.16 +
      Math.sin((x + warp) * TAU * 38 + 0.7) * 0.04 +
      (medium - 0.5) * 0.14 +
      (fine - 0.5) * 0.045
    );
  if (kind === 'rock')
    return (
      0.15 +
      Math.abs(broad - 0.45) * 0.8 +
      medium * 0.25 +
      fine * 0.12 +
      Math.pow(0.5 + 0.5 * Math.sin((y + warp * 0.3) * TAU * 11), 6) * 0.1
    );
  if (kind === 'wet')
    return 0.3 + broad * 0.2 + medium * 0.18 + fine * 0.05 + Math.sin((x + warp) * TAU * 13) * 0.12;
  return 0.35 + broad * 0.3 + medium * 0.08 + fine * 0.025 + Math.sin((x + warp) * TAU * 7) * 0.05;
}
const manifest = {
  version: 1,
  license: 'Original ExoWeb assets',
  seed: 7319,
  layout: 'RG: tangent slope, B: height, A: roughness',
  files: [],
};
for (const size of [1024, 2048, 4096])
  for (const kind of ['sand', 'rock', 'wet', 'snow']) {
    if (size === 4096 && (kind === 'wet' || kind === 'snow')) continue;
    const field = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) field[y * size + x] = height(kind, x / size, y / size);
    const data = Buffer.alloc(18 + size * size * 4);
    data[2] = 2;
    data.writeUInt16LE(size, 12);
    data.writeUInt16LE(size, 14);
    data[16] = 32;
    data[17] = 0x28;
    const at = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const h = at(x, y),
          dx = (at(x + 1, y) - at(x - 1, y)) * size * 0.055,
          dy = (at(x, y + 1) - at(x, y - 1)) * size * 0.055;
        const rough =
          kind === 'wet'
            ? 0.14 + h * 0.22
            : kind === 'snow'
              ? 0.65 + h * 0.18
              : kind === 'rock'
                ? 0.38 + h * 0.32
                : 0.38 + h * 0.28;
        const p = 18 + (y * size + x) * 4;
        data[p] = Math.round(clamp(h, 0, 1) * 255);
        data[p + 1] = Math.round((clamp(dy, -1, 1) * 0.5 + 0.5) * 255);
        data[p + 2] = Math.round((clamp(dx, -1, 1) * 0.5 + 0.5) * 255);
        data[p + 3] = Math.round(rough * 255);
      }
    const source = `.cache/nacar-assets/${kind}-${size}.tga`,
      target = `${output}/${kind}-${size}.ktx2`;
    await writeFile(source, data);
    const run = spawnSync(
      process.execPath,
      [
        'scripts/encode-texture.mjs',
        '-file',
        source,
        '-output_file',
        target,
        '-ktx2',
        '-uastc',
        '-uastc_level',
        '0',
        '-mipmap',
        '-linear',
        '-no_multithreading',
      ],
      { encoding: 'utf8', maxBuffer: 2 ** 20 },
    );
    if (run.status !== 0) throw new Error(run.stdout + '\n' + run.stderr);
    const bytes = await readFile(target);
    manifest.files.push({
      kind,
      size,
      path: `assets/materials/${kind}-${size}.ktx2`,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    console.log(`${kind} ${size}: ${(bytes.length / 1048576).toFixed(2)} MiB`);
  }
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
