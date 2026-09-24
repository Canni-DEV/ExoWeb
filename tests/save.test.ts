import { it, expect } from 'vitest';
import { cleanSettings, parseSave } from '../src/platform/save';
it('recovers from corrupt or incompatible saves', () => {
  for (const value of [null, '{', 'null', '{"version":2}'])
    expect(parseSave(value).checkpoint).toBe(0);
});
it('bounds checkpoint and settings from untrusted storage', () => {
  const saved = parseSave(
    JSON.stringify({
      version: 1,
      checkpoint: 99,
      completed: true,
      settings: { quality: 'ultra', sensitivity: 100, music: -1, gamepad: { jump: 900 } },
    }),
  );
  expect(saved.checkpoint).toBe(4);
  expect(saved.settings.quality).toBe('medium');
  expect(saved.settings.sensitivity).toBe(3);
  expect(saved.settings.music).toBe(0);
  expect(saved.settings.gamepad.jump).toBe(0);
});
it('keeps a valid checkpoint, preferences, and bindings', () => {
  const saved = parseSave(
    JSON.stringify({
      version: 1,
      checkpoint: 3,
      settings: { quality: 'high', comfort: true, bindings: { jump: 'KeyJ' } },
    }),
  );
  expect(saved.checkpoint).toBe(3);
  expect(saved.settings.comfort).toBe(true);
  expect(saved.settings.bindings.jump).toBe('KeyJ');
});
it('does not accept non-finite volume or arbitrary key strings', () => {
  const settings = cleanSettings({ music: NaN, bindings: { jump: '<script>' } });
  expect(settings.music).toBe(0.35);
  expect(settings.bindings.jump).toBe('Space');
});
