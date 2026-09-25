import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Copy only known acceptance artifacts. Keep local reference images out of distribution.
const [visualRoot, benchmarkRoot] = process.argv.slice(2);
if (!visualRoot)
  throw new Error(
    'Usage: node scripts/collect-verification.mjs <playwright-output> [benchmark-output]',
  );
const destination = 'docs/verification/nacar';
await mkdir(destination, { recursive: true });
async function find(root, name) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, name);
    try {
      await readFile(file);
      return file;
    } catch {
      /* Try the next test directory. */
    }
  }
  throw new Error(`Missing ${name} in ${root}`);
}
const visualDirectory = (await readdir(visualRoot)).find((name) => name.startsWith('visual-'));
if (!visualDirectory) throw new Error('Visual acceptance artifacts not found');
for (const name of ['costa', 'rasante', 'monolito', 'cima', 'nube', 'cielo', 'oceano', 'tormenta'])
  await copyFile(
    join(visualRoot, visualDirectory, `${name}.png`),
    join(destination, `${name}.png`),
  );
await copyFile(await find(visualRoot, 'video.webm'), join(destination, 'motion.webm'));
await copyFile(await find(visualRoot, 'profiles.json'), join(destination, 'profiles.json'));
if (benchmarkRoot) {
  const file = await find(benchmarkRoot, 'active-1080p.json');
  const benchmark = JSON.parse(await readFile(file, 'utf8'));
  if (benchmark.results.some((r) => r.samples.some((s, i) => i && s.time <= r.samples[i - 1].time)))
    throw new Error(
      'Benchmark contains paused simulation or a respawn; it cannot certify continuous active traversal',
    );
  await copyFile(file, join(destination, 'active-1080p.json'));
  const results = benchmark.results.map((r) => ({
    scene: r.scene,
    seconds: r.seconds,
    fps: r.fps,
    p95: r.p95,
    max: r.max,
    memoryMiB: Math.max(...r.samples.map((s) => s.memoryMiB)),
    minScale: Math.min(...r.samples.map((s) => s.visual.scale)),
    maxScale: Math.max(...r.samples.map((s) => s.visual.scale)),
    streamingSamples: r.samples.filter((s) => s.streaming).length,
    samples: r.samples.length,
    originChanges: r.samples.filter(
      (s, i) => i && JSON.stringify(s.origin) !== JSON.stringify(r.samples[i - 1].origin),
    ).length,
  }));
  const summary = {
    browser: benchmark.results[0].browser,
    hardware: benchmark.hardware,
    errors: benchmark.errors,
    seconds: results.reduce((s, r) => s + r.seconds, 0),
    meanFps:
      benchmark.results.reduce((s, r) => s + r.frames, 0) /
      results.reduce((s, r) => s + r.seconds, 0),
    results,
  };
  await writeFile(
    join(destination, 'benchmark-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(JSON.stringify(summary, null, 2));
}
console.log(`Verification artifacts copied to ${destination}`);
