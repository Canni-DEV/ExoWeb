import { readFile, writeFile } from 'node:fs/promises';
const root = '.cache/baseline/';
async function replace(file, before, after) {
  const source = (await readFile(root + file, 'utf8')).replaceAll('\r\n', '\n');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Unexpected baseline source: ${file}`);
  await writeFile(root + file, source.replace(before, after));
}
await replace(
  'src/render/engine.ts',
  'const distance = 40 + Math.min(35, speed * 0.09)',
  'const distance = 65 + Math.min(45, speed * 0.1)',
);
await replace('src/main.ts', 'player.time += dt;', 'player.time = 30;');
await replace(
  'src/main.ts',
  '  previous = clonePlayer(player);\n  input.yaw = 0;',
  "  player.time=30;player.form='disc';player.morph=1;\n  previous = clonePlayer(player);\n  input.yaw = 0;",
);
console.log('Baseline fixture: 65m camera boom, 30s time, disc. Original renderer and terrain.');
