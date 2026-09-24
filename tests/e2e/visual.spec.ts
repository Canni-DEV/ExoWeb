import { test, expect } from '@playwright/test';

test.describe('Nácar visual fidelity', () => {
  test.skip(process.env.GPU_TESTS !== '1', 'Requires a real WebGPU device.');
  test('art direction scenes and resource loading remain valid', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [],
      missing: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) missing.push(r.url());
    });
    await page.goto('./?test=1');
    await page.waitForFunction(
      () =>
        document.body.dataset.engine === 'error' || window.__EXOWEB_TEST__?.snapshot().firstFrame,
      {},
      { timeout: 45000 },
    );
    expect(await page.locator('#error-message').textContent()).toBe('');
    for (const scene of [
      'costa',
      'rasante',
      'monolito',
      'cima',
      'nube',
      'cielo',
      'oceano',
      'tormenta',
    ]) {
      await page.evaluate((scene) => window.__EXOWEB_TEST__!.visit(scene), scene);
      await page.evaluate(() =>
        window.__EXOWEB_TEST__!.configure({
          time: 30,
          frozen: true,
          scale: 1,
          hud: 'hidden',
          form: 'disc',
        }),
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            let frames = 0;
            const tick = () => {
              if (++frames === 35) resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      await expect(page.locator('#error-screen')).toBeHidden();
      await page.screenshot({ path: info.outputPath(`${scene}.png`) });
      expect(await page.evaluate(() => window.__EXOWEB_TEST__!.seamError())).toBeLessThan(0.05);
    }
    expect(missing).toEqual([]);
    expect(errors).toEqual([]);
  });
});
