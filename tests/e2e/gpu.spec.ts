import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
test.describe('real WebGPU acceptance', () => {
  test.skip(
    process.env.GPU_TESTS !== '1',
    'Run explicitly with GPU_TESTS=1 on a WebGPU device; CI does not certify rendering.',
  );
  test('renders all six reference scenes without GPU errors', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('./?test=1');
    await expect(page.locator('body')).toHaveAttribute('data-engine', 'ready');
    await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame);
    const adapter = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().adapter);
    await testInfo.attach('adapter', { body: adapter, contentType: 'text/plain' });
    for (const scene of ['costa', 'pendiente', 'cima', 'nube', 'cielo', 'oceano']) {
      await page.evaluate((scene) => window.__EXOWEB_TEST__!.visit(scene), scene);
      await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame);
      await expect
        .poll(async () => page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.time), {
          intervals: [100],
        })
        .toBeGreaterThan(0.75);
      await page.screenshot({ path: testInfo.outputPath(`${scene}.png`) });
      expect(await page.evaluate(() => window.__EXOWEB_TEST__!.seamError())).toBeLessThan(0.05);
      const state = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot());
      expect(
        Math.hypot(
          state.player.position.x - state.origin.x,
          state.player.position.z - state.origin.z,
        ),
      ).toBeLessThan(2000);
      expect(state.player.velocity).toEqual({ x: 0, y: 0, z: 0 });
      await expect(page.locator('#error-screen')).toBeHidden();
    }
    expect(errors).toEqual([]);
  });
  test('keyboard movement, jumping, pause and resume preserve coherent state', async ({ page }) => {
    await page.goto('./?test=1');
    await page.getByRole('button', { name: 'Iniciar expedición', exact: true }).click();
    await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().playing);
    const before = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.position.z);
    await page.keyboard.down('w');
    await expect
      .poll(async () => page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.position.z))
      .toBeLessThan(before - 5);
    await page.keyboard.up('w');
    await page.keyboard.press('Space');
    await expect
      .poll(async () => page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.velocity.y))
      .toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeVisible();
    const position = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.position);
    await page.screenshot();
    expect(await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.position)).toEqual(
      position,
    );
    await page.locator('#resume').click();
    await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().playing);
  });
  test('standard gamepad movement and disconnection are handled', async ({ page }) => {
    await page.addInitScript(() => {
      let connected = true;
      const buttons = Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      }));
      const pad = {
        id: 'Acceptance gamepad',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, -1, 0, 0],
        buttons,
        timestamp: 0,
      };
      Object.defineProperty(navigator, 'getGamepads', { value: () => (connected ? [pad] : []) });
      document.addEventListener('disconnect-test-pad', () => (connected = false));
    });
    await page.goto('./?test=1');
    await page.getByRole('button', { name: 'Iniciar expedición', exact: true }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => window.__EXOWEB_TEST__?.snapshot().player.velocity.z ?? 0),
      )
      .toBeLessThan(-1);
    await page.evaluate(() => document.dispatchEvent(new Event('disconnect-test-pad')));
    await expect(page.locator('#pause-screen')).toBeVisible();
    await expect(page.locator('#notice')).toContainText('Mando desconectado');
  });
  test('10 minute 1080p visual benchmark', async ({ page, browser }, testInfo) => {
    test.skip(process.env.BENCHMARK_SECONDS === undefined, 'Opt-in sustained GPU benchmark.');
    const seconds = Number(process.env.BENCHMARK_SECONDS ?? 600);
    test.setTimeout((seconds + 120) * 1000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('./?test=1');
    await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame);
    const scenarios = ['costa', 'pendiente', 'cima', 'nube', 'cielo', 'oceano'];
    const result = [];
    for (const scene of scenarios) {
      await page.evaluate((scene) => window.__EXOWEB_TEST__!.visit(scene), scene);
      await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame);
      await page.evaluate(() => window.__EXOWEB_TEST__!.beginBenchmark());
      await expect
        .poll(
          async () =>
            page.evaluate(() =>
              window.__EXOWEB_TEST__!.snapshot().frames.reduce((a, b) => a + b, 0),
            ),
          { timeout: (seconds / 6) * 1000 + 30000, intervals: [1000] },
        )
        .toBeGreaterThan((seconds / 6) * 1000);
      const snapshot = await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot());
      const frames = snapshot.frames.toSorted((a, b) => a - b);
      result.push({
        scene,
        browser: browser.version(),
        adapter: snapshot.adapter,
        frames: frames.length,
        seconds: frames.reduce((a, b) => a + b, 0) / 1000,
        fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
        p95: frames[Math.floor(frames.length * 0.95)],
        memoryMiB: snapshot.memoryMiB,
        diagnostics: await page.locator('#diagnostics').textContent(),
      });
    }
    await testInfo.attach('benchmark', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    await writeFile(testInfo.outputPath('benchmark.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    for (const scene of result) expect(scene.memoryMiB).toBeLessThan(512);
  });
});
