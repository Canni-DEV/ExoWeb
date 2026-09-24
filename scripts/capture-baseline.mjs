import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/verification/nacar', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:4176/ExoWeb/?test=1');
  await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame);
  await page.addStyleTag({ content: '#hud{visibility:hidden!important}' });
  for (const scene of ['costa', 'cielo', 'oceano']) {
    await page.evaluate((scene) => window.__EXOWEB_TEST__.visit(scene), scene);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 0;
          const tick = () => (++n === 35 ? resolve() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
    );
    await page.screenshot({ path: `docs/verification/nacar/before-${scene}.png` });
  }
} finally {
  await browser.close();
}
