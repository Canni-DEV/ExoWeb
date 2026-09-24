import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('public/assets/materials/manifest.json', 'utf8'));
for (const entry of manifest.files) {
  const bytes = await readFile(`public/${entry.path}`);
  assert.equal(bytes.length, entry.bytes, entry.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
  assert.equal(bytes.subarray(0, 12).toString('hex'), 'ab4b5458203230bb0d0a1a0a', 'KTX2 header');
  assert.equal(bytes.readUInt32LE(20), entry.size);
  assert.equal(bytes.readUInt32LE(24), entry.size);
  assert.ok(bytes.readUInt32LE(40) > 1, 'Every material needs mipmaps');
}
const size = async (directory) => {
  let n = 0;
  for (const name of await readdir(directory)) {
    const path = `${directory}/${name}`,
      s = await stat(path);
    n += s.isDirectory() ? await size(path) : s.size;
  }
  return n;
};
const publicBytes = await size('public');
const initial =
  manifest.files.filter((f) => f.size === 2048).reduce((sum, f) => sum + f.bytes, 0) +
  (await size('public/assets/models')) +
  (await size('public/assets/basis'));
const total = await size('dist');
// Use uncompressed bytes: conservative with HTTP content encoding and cache disabled.
const initialWithCode = initial + total - publicBytes;
assert.ok(initialWithCode <= 20_000_000, `Initial transfer exceeds 20 MB: ${initialWithCode}`);
assert.ok(total <= 80_000_000, `Static distribution exceeds 80 MB: ${total}`);
await stat('public/licenses/BASIS-APACHE-2.0.txt');
console.log(
  JSON.stringify(
    { initialBytes: initialWithCode, totalBytes: total, materials: manifest.files.length },
    null,
    2,
  ),
);
