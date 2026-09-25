import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

for (const pass of ['clouds', 'final'] as const) {
  test(`${pass}: stable horizon, terrain and foreground occlusion`, async ({ page }, info) => {
    test.skip(process.env.GPU_TESTS !== '1', 'Requires a real WebGPU device.');
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    // Allows the same regression to run against a separately built pre-fix revision.
    await page.goto(`${process.env.TEMPORAL_BASE_URL ?? './'}?test=1&pass=${pass}`);
    await page.waitForFunction(() => window.__EXOWEB_TEST__?.snapshot().firstFrame, undefined, {
      timeout: 45000,
    });
    await page.evaluate(async () => {
      await window.__EXOWEB_TEST__!.visit('costa');
      await window.__EXOWEB_TEST__!.configure({
        time: 30,
        frozen: true,
        quality: 'medium',
        scale: 1,
        hud: 'hidden',
        form: 'disc',
      });
      // Test the render, excluding the HUD's CSS gradient and pause button.
      document.getElementById('interface')!.style.display = 'none';
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 0;
          const tick = () => (++frames === 180 ? resolve() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
    );
    const images: string[] = [];
    for (let frame = 0; frame < 16; frame++) {
      const png = await page.screenshot();
      images.push(png.toString('base64'));
      if (frame === 0 || frame === 15)
        await writeFile(info.outputPath(`${pass}-${frame}.png`), png);
    }
    // Decode with the browser's PNG implementation; no extra image-library dependency.
    const measurements = await page.evaluate(
      async ({ images, pass }) => {
        const regions: Record<string, number[]> =
          pass === 'clouds'
            ? {
                sky: [700, 30, 880, 150],
                horizon: [1200, 275, 380, 60],
                foreground: [100, 500, 500, 300],
              }
            : { mountain: [80, 145, 870, 220] };
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const context = canvas.getContext('2d')!;
        let previous: Uint8ClampedArray | undefined;
        const result = Object.entries(regions).map(([name]) => ({
          name,
          meanDelta: 0,
          pixels: 0,
          maximumValue: 0,
          histogram: new Array<number>(766).fill(0),
        }));
        for (const image of images) {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${image}`)).blob(),
          );
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          for (const region of result) {
            const [x, y, width, height] = regions[region.name as keyof typeof regions];
            for (let py = y; py < y + height; py++)
              for (let px = x; px < x + width; px++) {
                let delta = 0;
                for (let channel = 0; channel < 3; channel++) {
                  const index = (py * canvas.width + px) * 4 + channel;
                  region.maximumValue = Math.max(region.maximumValue, pixels[index]);
                  if (previous) {
                    delta += Math.abs(pixels[index] - previous[index]);
                  }
                }
                if (previous) {
                  region.meanDelta += delta / 3;
                  region.histogram[delta]++;
                  region.pixels++;
                }
              }
          }
          previous = pixels;
        }
        return result.map((r) => {
          let count = 0;
          const p99 =
            r.histogram.findIndex((n) => {
              count += n;
              return count >= r.pixels * 0.99;
            }) / 3;
          return {
            name: r.name,
            meanDelta: r.meanDelta / r.pixels,
            p99,
            maximumValue: r.maximumValue,
          };
        });
      },
      { images, pass },
    );
    await writeFile(info.outputPath('temporal.json'), JSON.stringify(measurements, null, 2));
    expect(errors).toEqual([]);
    if (pass === 'clouds') {
      expect(measurements.find((r) => r.name === 'sky')!.meanDelta).toBeLessThan(0.05);
      expect(measurements.find((r) => r.name === 'horizon')!.meanDelta).toBeLessThan(0.15);
      expect(measurements.find((r) => r.name === 'foreground')!.maximumValue).toBe(0);
      // A camera transition into clear sky must not stretch old cloud color
      // from empty ray anchors into vertical streaks while the camera settles.
      await page.evaluate(async () => {
        await window.__EXOWEB_TEST__!.visit('cielo');
        await window.__EXOWEB_TEST__!.configure({ time: 30, frozen: true });
        await new Promise<void>((resolve) => {
          let n = 0;
          const tick = () => (++n === 35 ? resolve() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        });
      });
      const clear = await page.screenshot();
      await writeFile(info.outputPath('clear-sky.png'), clear);
      const ghost = await page.evaluate(async (image) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${image}`)).blob(),
        );
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        // Stay clear of the actual thermal tower at the far left of this view.
        const pixels = context.getImageData(350, 150, 400, 150).data;
        let maximum = 0;
        for (let i = 0; i < pixels.length; i++)
          if (i % 4 !== 3) maximum = Math.max(maximum, pixels[i]);
        return maximum;
      }, clear.toString('base64'));
      expect(ghost).toBe(0);
    } else expect(measurements[0].p99).toBeLessThan(15);
  });
}
