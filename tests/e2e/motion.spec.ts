import { test, expect } from '@playwright/test';
test.use({
  video: { mode: 'on', size: { width: 1920, height: 1080 } },
  viewport: { width: 1920, height: 1080 },
});
test.describe('recorded motion review', () => {
  test.skip(
    process.env.RECORD_MOTION !== '1',
    'Explicit video capture, separate from performance measurement.',
  );
  test('rolling, flight, turns, splash, cloud crossing and origin change', async ({
    page,
  }, info) => {
    test.setTimeout(150000);
    await page.goto('./?test=1');
    await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame);
    for (const [scene, label, velocity] of [
      ['rasante', 'Rodadura', { x: 0, y: 0, z: -110 }],
      ['pendiente', 'Planeo y giro', { x: 0, y: 80, z: -160 }],
      ['tormenta', 'Rebote y salpicadura', { x: 0, y: -90, z: -220 }],
      ['nube', 'Entrada en nube', { x: 0, y: 150, z: -160 }],
      ['cielo', 'Salida y picado', { x: 0, y: -200, z: -180 }],
      ['costa', 'Origen gráfico', { x: 0, y: 25, z: -420 }],
    ] as const) {
      await page.keyboard.up('w');
      await page.keyboard.up('Control');
      await page.keyboard.up('Shift');
      await page.evaluate((scene) => window.__EXOWEB_TEST__!.visit(scene), scene);
      await page.evaluate(
        async ({ velocity, label }) => {
          await window.__EXOWEB_TEST__!.configure({
            time: 30,
            quality: 'medium',
            scale: 1,
            hud: 'hidden',
            velocity: { ...velocity },
          });
          let caption = document.getElementById('review-caption');
          if (!caption) {
            caption = document.createElement('div');
            caption.id = 'review-caption';
            caption.style.cssText =
              'position:fixed;bottom:30px;left:40px;color:#fff;font:16px sans-serif;letter-spacing:3px;pointer-events:none';
            document.body.append(caption);
          }
          caption.textContent = label.toUpperCase();
          window.__EXOWEB_TEST__!.play();
        },
        { velocity, label },
      );
      await page.keyboard.down('w');
      if (scene !== 'rasante') await page.keyboard.down('Control');
      if (scene === 'cielo') await page.keyboard.down('Shift');
      for (let second = 0; second < 8; second++) {
        await page.waitForTimeout(1000);
        if (scene === 'pendiente')
          await page.evaluate((yaw) => window.__EXOWEB_TEST__!.configure({ yaw }), second * 0.15);
        await expect(page.locator('#error-screen')).toBeHidden();
        if (second === 3 || second === 7)
          await page.screenshot({ path: info.outputPath(`${scene}-${second}.png`) });
      }
      expect(
        await page.evaluate(() => window.__EXOWEB_TEST__!.snapshot().player.time),
      ).toBeGreaterThan(35);
    }
  });
});
