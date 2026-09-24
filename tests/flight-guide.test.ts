import { it, expect } from 'vitest';
import { flightGuide } from '../src/platform/flight-guide';
import { createPlayer } from '../src/simulation/player';
import { DEFAULT_SETTINGS } from '../src/config';
it('explains empty energy recovery and honors remapped controls', () => {
  const p = createPlayer({ x: 0, y: 100, z: 0 });
  p.energy = 0;
  p.glideLocked = true;
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.bindings.gravity = 'KeyG';
  const guide = flightGuide(p, settings);
  expect(guide.hint).toContain('G en descenso');
  expect(guide.hint).toContain('agotado');
  expect(guide.low).toBe(true);
});
it('distinguishes a thermal recharge from open-air glide endurance', () => {
  const p = createPlayer({ x: 0, y: 500, z: 0 });
  p.energy = 50;
  p.form = 'disc';
  p.energySource = 'glide';
  expect(flightGuide(p, DEFAULT_SETTINGS).state).toContain('10 s');
  p.energySource = 'thermal';
  const guide = flightGuide(p, DEFAULT_SETTINGS);
  expect(guide.state).toContain('CORRIENTE');
  expect(guide.charging).toBe(true);
});
