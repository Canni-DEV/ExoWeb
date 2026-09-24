import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function ready(page: Page) {
  await page.goto('./?test=1');
  await page.waitForFunction(
    () => window.__EXOWEB_TEST__?.snapshot().firstFrame || document.body.dataset.engine === 'error',
    undefined,
    { timeout: 45000 },
  );
  await expect(page.locator('#error-screen')).toBeHidden();
}
async function seconds(page: Page, duration: number) {
  const time = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.time);
  await expect
    .poll(() => page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.time), {
      timeout: duration * 2000 + 10000,
      intervals: [200],
    })
    .toBeGreaterThan(time + duration);
}
test.describe('Nácar presentation acceptance', () => {
  test.skip(process.env.GPU_TESTS !== '1', 'Requires real WebGPU.');
  test('quality transitions preserve native output and bounded resources', async ({
    page,
  }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await ready(page);
    const reports = [];
    for (const quality of ['low', 'high', 'medium'] as const) {
      await page.evaluate(
        (quality) =>
          window.__EXOWEB_TEST__!.configure({ quality, scale: 0.75, time: 30, frozen: true }),
        quality,
      );
      await page.waitForFunction((q) => {
        const v = window.__EXOWEB_TEST__!.snapshot().visual;
        return v.quality === q && !v.assetsLoading;
      }, quality);
      await page.evaluate(
        () =>
          new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );
      const snapshot = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot());
      expect(snapshot.visual.output).toEqual({ width: 1920, height: 1080 });
      expect(snapshot.visual.internal).toEqual({ width: 1440, height: 810 });
      expect(snapshot.memoryMiB).toBeLessThan(quality === 'high' ? 1024 : 512);
      reports.push({ quality, memoryMiB: snapshot.memoryMiB, visual: snapshot.visual });
      await page.screenshot({ path: info.outputPath(`${quality}-75.png`) });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect
      .poll(() => page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().visual.output.width))
      .toBe(1366);
    expect(errors).toEqual([]);
    await writeFile(info.outputPath('profiles.json'), JSON.stringify(reports, null, 2));
  });
  test('effects pause with simulation and clear on teleport; camera and origins remain finite', async ({
    page,
  }, info) => {
    await ready(page);
    await page.evaluate(() =>
      window.__EXOWEB_TEST__!.configure({
        position: { x: 15000, y: 25, z: -24000 },
        velocity: { x: 0, y: -80, z: -160 },
        scale: 1,
        hud: 'full',
      }),
    );
    await page.evaluate(() => window.__EXOWEB_TEST__!.play());
    await page.keyboard.down('Control');
    await seconds(page, 3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeVisible();
    const paused = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot());
    expect(Math.abs(paused.visual.shipRoll)).toBeLessThan(0.05);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let n = 0;
          const f = () => (++n > 30 ? resolve() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
    );
    const after = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot());
    expect(after.player.time).toBe(paused.player.time);
    expect(after.visual.effects).toBe(paused.visual.effects);
    await page.keyboard.up('Control');
    await page.evaluate(() => window.__EXOWEB_TEST__!.visit('cielo'));
    const teleported = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot());
    expect(teleported.visual.effects).toBe(0);
    expect(teleported.visual.invalidations).toBeGreaterThan(paused.visual.invalidations);
    for (const value of Object.values(teleported.visual.camera))
      expect(Number.isFinite(value)).toBe(true);
    expect(await page.evaluate(() => window.__EXOWEB_TEST__!.seamError())).toBeLessThan(0.05);
    await writeFile(
      info.outputPath('effects.json'),
      JSON.stringify({ paused, after, teleported }, null, 2),
    );
  });
  test('high-DPI output uses physical pixels independently of internal scale', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 2,
    });
    try {
      const page = await context.newPage();
      await ready(page);
      await page.evaluate(() => window.__EXOWEB_TEST__!.configure({ scale: 0.75 }));
      const visual = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().visual);
      expect(visual.output).toEqual({ width: 1920, height: 1080 });
      expect(visual.internal).toEqual({ width: 1440, height: 810 });
    } finally {
      await context.close();
    }
  });
  test('missing local material reports a recoverable error instead of a blank canvas', async ({
    page,
  }) => {
    await page.route('**/assets/materials/sand-2048.ktx2', (r) =>
      r.fulfill({ status: 404, body: 'Missing test asset' }),
    );
    await page.goto('./?test=1');
    await expect(page.locator('#error-screen')).toBeVisible();
    await expect(page.locator('#error-message')).not.toBeEmpty();
  });
  test('sustained active traversal at native 1080p', async ({ page, browser }, info) => {
    test.skip(
      !process.env.ACTIVE_BENCHMARK_SECONDS,
      'Opt-in ten-minute native-resolution benchmark.',
    );
    const duration = Number(process.env.ACTIVE_BENCHMARK_SECONDS ?? 600);
    test.setTimeout((duration + 150) * 1000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await ready(page);
    const results = [];
    for (const scene of ['rasante', 'pendiente', 'cima', 'nube', 'cielo', 'tormenta']) {
      await page.evaluate((scene) => window.__EXOWEB_TEST__!.visit(scene), scene);
      await page.evaluate(() =>
        window.__EXOWEB_TEST__!.configure({
          scale: 1,
          quality: 'medium',
          frozen: false,
          velocity: { x: 15, y: 0, z: -110 },
          hud: 'hidden',
        }),
      );
      await page.evaluate(() => window.__EXOWEB_TEST__!.play());
      await page.keyboard.down('w');
      if (scene !== 'rasante') await page.keyboard.down('Control');
      await seconds(page, 1);
      await page.evaluate(() => window.__EXOWEB_TEST__!.beginBenchmark());
      const samples = [];
      const start = Date.now();
      while (Date.now() - start < (duration / 6) * 1000) {
        await page.waitForTimeout(1000);
        const sample = await page.evaluate(() => {
          const s = window.__EXOWEB_TEST__!.snapshot();
          return {
            time: s.player.time,
            position: s.player.position,
            origin: s.origin,
            visual: s.visual,
            memoryMiB: s.memoryMiB,
            streaming: !document.getElementById('streaming')!.hidden,
          };
        });
        samples.push(sample);
        await expect(page.locator('#error-screen')).toBeHidden();
      }
      const s = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot()),
        frames = s.frames.toSorted((a, b) => a - b);
      results.push({
        scene,
        browser: browser.version(),
        adapter: s.adapter,
        frames: frames.length,
        seconds: frames.reduce((a, b) => a + b, 0) / 1000,
        fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
        p95: frames[Math.floor(frames.length * 0.95)],
        max: frames.at(-1),
        samples,
      });
      await page.keyboard.up('w');
      await page.keyboard.up('Control');
      expect(samples.every((x) => x.visual.scale === 1)).toBe(true);
      expect(Math.max(...samples.map((x) => x.memoryMiB))).toBeLessThan(512);
      expect(
        Math.hypot(
          s.player.position.x - samples[0].position.x,
          s.player.position.z - samples[0].position.z,
        ),
      ).toBeGreaterThan(20);
      console.log(
        `Benchmark ${scene}: ${results.at(-1)!.fps.toFixed(1)} FPS, p95 ${results.at(-1)!.p95.toFixed(1)} ms`,
      );
    }
    await writeFile(
      info.outputPath('active-1080p.json'),
      JSON.stringify(
        {
          hardware: 'RTX 5070 Ti; not a certification of RTX 3060/RX 6600',
          duration,
          errors,
          results,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  });
});
