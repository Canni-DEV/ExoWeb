import { it, expect } from 'vitest';
import { Scene, PerspectiveCamera } from 'three/webgpu';
import { EffectsRenderer } from '../src/render/effects';
import { createUniforms } from '../src/render/uniforms';
import { createPlayer } from '../src/simulation/player';
import type { RenderSnapshot } from '../src/types';

it('renders each dated event once, freezes emission on pause and clears transient effects', () => {
  const u = createUniforms(),
    effects = new EffectsRenderer(new Scene(), u),
    camera = new PerspectiveCamera();
  const player = createPlayer({ x: 0, y: 80, z: 0 });
  player.time = 1;
  const snapshot: RenderSnapshot = {
    player,
    cameraYaw: 0,
    cameraPitch: 0,
    checkpoint: 0,
    completed: false,
    dt: 1 / 60,
    events: [
      {
        id: 1,
        kind: 'splash',
        time: 1,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 8, z: -50 },
        strength: 10,
      },
    ],
  };
  try {
    effects.update(snapshot, camera, 'medium');
    const count = effects.count;
    expect(count).toBeGreaterThan(0);
    const wet = u.lensWet.value;
    for (let i = 0; i < 10; i++) effects.update({ ...snapshot, dt: 1 }, camera, 'medium');
    expect(effects.count).toBe(count);
    expect(u.lensWet.value).toBe(wet);
    effects.clear();
    expect(effects.count).toBe(0);
    expect(u.lensWet.value).toBe(0);
    effects.update(snapshot, camera, 'medium');
    expect(effects.count).toBe(0);
  } finally {
    effects.dispose();
    u.cloudNoise.value.dispose();
  }
});

it('bounds emissions even if a frame contains many high-strength impacts', () => {
  const u = createUniforms(),
    effects = new EffectsRenderer(new Scene(), u),
    camera = new PerspectiveCamera(),
    player = createPlayer({ x: 0, y: 80, z: 0 });
  player.time = 1;
  try {
    effects.update(
      {
        player,
        cameraYaw: 0,
        cameraPitch: 0,
        checkpoint: 0,
        completed: false,
        dt: 1 / 60,
        events: Array.from({ length: 64 }, (_, id) => ({
          id: id + 1,
          kind: 'splash',
          time: 1,
          position: { ...player.position },
          velocity: { x: 0, y: 0, z: 0 },
          strength: 500,
        })),
      },
      camera,
      'low',
    );
    expect(effects.count).toBeLessThanOrEqual(1024);
    player.time = 10;
    effects.update(
      { player, cameraYaw: 0, cameraPitch: 0, checkpoint: 0, completed: false, dt: 1 / 60 },
      camera,
      'low',
    );
    expect(effects.count).toBe(0);
  } finally {
    effects.dispose();
    u.cloudNoise.value.dispose();
  }
});
