import { describe, it, expect } from 'vitest';
import { sweepLandmarks, landmarkLayout } from '../src/world/landmarks';
import { environmentAt } from '../src/world/environment';
import { VisualEvents } from '../src/simulation/visual-events';
import { createPlayer, simulate } from '../src/simulation/player';
import { cleanSettings, parseSave } from '../src/platform/save';
import { DEFAULT_SETTINGS } from '../src/config';
import type { Landmark, WorldSampler, InputFrame } from '../src/types';

const box: Landmark = {
  id: 'wall',
  kind: 'monolith',
  seed: 1,
  position: { x: 0, y: 10, z: 0 },
  scale: { x: 2, y: 20, z: 20 },
  yaw: 0,
};
describe('landmark colliders', () => {
  it('intercepts a fast crossing even when both endpoints are outside', () => {
    const hit = sweepLandmarks({ x: -100, y: 10, z: 0 }, { x: 100, y: 10, z: 0 }, 2.5, [box]);
    expect(hit?.fraction).toBeCloseTo(0.4825);
    expect(hit?.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(
      sweepLandmarks({ x: -100, y: 40, z: 0 }, { x: 100, y: 40, z: 0 }, 2.5, [box]),
    ).toBeNull();
  });
  it('uses the rotated collider for camera and flight queries', () => {
    const obstacle = { ...box, yaw: Math.PI / 2 };
    const hit = sweepLandmarks({ x: 0, y: 10, z: -100 }, { x: 0, y: 10, z: 100 }, 2, [obstacle]);
    expect(hit?.fraction).toBeCloseTo(0.485);
    expect(hit?.normal.z).toBeCloseTo(-1);
  });
  it('projects high-speed movement without crossing the physical obstacle', () => {
    const world: WorldSampler = {
      surface: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
      water: () => ({ height: -50, normal: { x: 0, y: 1, z: 0 } }),
      wind: () => ({ x: 0, y: 0, z: 0 }),
      ready: () => true,
      obstacles: [box],
    };
    const p = createPlayer({ x: -5, y: 10, z: 0 });
    p.velocity.x = 450;
    const input: InputFrame = {
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      gravity: false,
      glide: false,
      jump: false,
      reset: false,
    };
    simulate(p, input, world, 1 / 120);
    expect(p.position.x).toBeLessThanOrEqual(-3.49);
    expect(p.velocity.x).toBeLessThan(1);
  });
  it('has deterministic unique features and clear checkpoint spawn positions', () => {
    const features = landmarkLayout();
    expect(features).toEqual(landmarkLayout());
    expect(new Set(features.map((x) => x.id)).size).toBe(features.length);
    expect(features.filter((x) => x.kind === 'monolith')).toHaveLength(5);
  });
});
describe('visual events and compatibility', () => {
  it('accumulates substeps and drains each event once, copying transient state', () => {
    const queue = new VisualEvents(),
      p = createPlayer({ x: 1, y: 2, z: 3 });
    queue.push({ impact: 12, splash: true, transformed: false, sonic: false, invalid: false }, p);
    p.position.x = 100;
    p.time = 1;
    queue.push({ impact: 0, splash: false, transformed: true, sonic: true, invalid: false }, p);
    const events = queue.drain();
    expect(events.map((e) => e.kind)).toEqual(['splash', 'transform', 'sonic']);
    expect(events[0].position.x).toBe(1);
    expect(queue.drain()).toEqual([]);
    queue.push({ impact: 8, splash: false, transformed: false, sonic: false, invalid: false }, p);
    queue.clear();
    expect(queue.drain()).toEqual([]);
  });
  it('retains old checkpoint progress and defaults new presentation controls', () => {
    const saved = parseSave(
      JSON.stringify({
        version: 1,
        checkpoint: 3,
        completed: false,
        settings: { quality: 'high' },
      }),
    );
    expect(saved.checkpoint).toBe(3);
    expect(saved.settings.hud).toBe('contextual');
    expect(saved.settings.bloom).toBe(DEFAULT_SETTINGS.bloom);
    const settings = cleanSettings({ bloom: 9, lens: -1, grain: NaN, hud: 'wrong' });
    expect(settings.bloom).toBe(1);
    expect(settings.lens).toBe(0);
    expect(settings.grain).toBe(DEFAULT_SETTINGS.grain);
  });
  it('spatial climate is independent of progression and varies continuously', () => {
    const a = environmentAt({ x: 7000, y: 100, z: -21000 }),
      b = environmentAt({ x: 7001, y: 100, z: -21000 });
    expect(Math.abs(a.storm - b.storm)).toBeLessThan(0.001);
    expect(environmentAt({ x: 0, y: 100, z: 0 }).storm).toBe(0);
    expect(environmentAt({ x: 15000, y: 100, z: -24000 }).storm).toBe(1);
  });
});
