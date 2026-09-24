import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/config';
import type { InputFrame, WorldSampler } from '../src/types';
import { createPlayer, simulate } from '../src/simulation/player';
import { FixedClock, length, normalize } from '../src/simulation/math';

const idle: InputFrame = {
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  gravity: false,
  glide: false,
  jump: false,
  reset: false,
};
const flat: WorldSampler = {
  surface: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
  water: () => ({ height: -100, normal: { x: 0, y: 1, z: 0 } }),
  wind: () => ({ x: 0, y: 0, z: 0 }),
  ready: () => true,
};
const ocean: WorldSampler = {
  ...flat,
  surface: () => ({ height: -100, normal: { x: 0, y: 1, z: 0 } }),
  water: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }),
};

describe('fixed simulation', () => {
  const travel = (fps: number) => {
    const p = createPlayer({ x: 500, y: PHYSICS.radius + 0.005, z: 0 });
    p.contact = 'ground';
    const clock = new FixedClock();
    for (let frame = 0; frame < fps * 12; frame++)
      clock.advance(1 / fps, (dt) => {
        simulate(p, { ...idle, moveZ: 1, gravity: p.time > 4 && p.time < 8 }, flat, dt);
      });
    return p;
  };
  it('is independent of 30, 60 and 144 Hz rendering', () => {
    const reference = travel(60);
    for (const fps of [30, 144]) {
      const p = travel(fps);
      expect(Math.abs(p.position.z - reference.position.z)).toBeLessThan(0.01);
      expect(Math.abs(p.velocity.z - reference.velocity.z)).toBeLessThan(0.01);
    }
  });
  it('does not accumulate hidden-tab time', () => {
    const clock = new FixedClock();
    let steps = 0;
    clock.advance(60, () => {
      steps++;
    });
    expect(steps).toBe(12);
    clock.reset();
    expect(
      clock.advance(0, () => {
        steps++;
      }),
    ).toBe(0);
  });
  it('stops catch-up when collision data is missing', () => {
    const clock = new FixedClock();
    let steps = 0;
    clock.advance(0.05, () => {
      steps++;
      return false;
    });
    expect(steps).toBe(1);
    expect(clock.advance(0, () => {})).toBe(0);
  });
});
describe('craft mechanics', () => {
  it('falls under gravity and lands on the canonical surface', () => {
    const p = createPlayer({ x: 500, y: 30, z: 0 });
    for (let i = 0; i < 600; i++) simulate(p, idle, flat, PHYSICS.step);
    expect(p.contact).toBe('ground');
    expect(p.position.y).toBeCloseTo(PHYSICS.radius + 0.005, 3);
  });
  it('gives gravity priority over transformation', () => {
    const p = createPlayer({ x: 500, y: 500, z: 0 });
    simulate(p, { ...idle, gravity: true, glide: true }, flat, PHYSICS.step);
    expect(p.form).toBe('sphere');
    expect(p.velocity.y).toBeCloseTo((-9.8 * 6) / 120, 5);
  });
  it('preserves momentum during transformation', () => {
    const p = createPlayer({ x: 500, y: 500, z: 0 });
    p.velocity.z = -100;
    simulate(p, { ...idle, glide: true }, flat, PHYSICS.step);
    expect(p.form).toBe('disc');
    expect(Math.abs(p.velocity.z)).toBeGreaterThan(99);
  });
  it('spends energy in flight and returns to sphere at zero', () => {
    const p = createPlayer({ x: 500, y: 1000, z: 0 });
    p.energy = 0.01;
    simulate(p, { ...idle, glide: true }, flat, PHYSICS.step);
    expect(p.energy).toBe(0);
    expect(p.form).toBe('sphere');
  });
  it('recharges on ground and in thermals', () => {
    const p = createPlayer({ x: 500, y: 500, z: 0 });
    p.energy = 20;
    const thermal = { ...flat, wind: () => ({ x: 0, y: 30, z: 0 }) };
    simulate(p, idle, thermal, PHYSICS.step);
    expect(p.energy).toBeGreaterThan(20);
    p.position.y = PHYSICS.radius + 0.01;
    p.velocity = { x: 0, y: 0, z: 0 };
    p.contact = 'ground';
    const before = p.energy;
    simulate(p, idle, flat, PHYSICS.step);
    expect(p.energy - before).toBeCloseTo(PHYSICS.recharge / 120, 5);
  });
  it('does not permit repeated mid-air jumps', () => {
    const p = createPlayer({ x: 500, y: PHYSICS.radius + 0.005, z: 0 });
    p.contact = 'ground';
    simulate(p, { ...idle, jump: true }, flat, PHYSICS.step);
    const first = p.velocity.y;
    simulate(p, { ...idle, jump: true }, flat, PHYSICS.step);
    expect(first).toBeGreaterThan(11);
    expect(p.velocity.y).toBeLessThan(first);
  });
  it('steers a disc without generating horizontal speed', () => {
    const p = createPlayer({ x: 500, y: 500, z: 0 });
    p.velocity.z = -100;
    for (let i = 0; i < 60; i++)
      simulate(p, { ...idle, glide: true, moveX: 1 }, flat, PHYSICS.step);
    expect(p.velocity.x).toBeGreaterThan(0);
    expect(Math.hypot(p.velocity.x, p.velocity.z)).toBeLessThan(100);
  });
  it('limits extreme velocity and keeps finite state', () => {
    const p = createPlayer({ x: 500, y: 100, z: 0 });
    p.velocity.x = 3000;
    simulate(p, idle, flat, PHYSICS.step);
    expect(length(p.velocity)).toBeLessThanOrEqual(450.00001);
    expect(Number.isFinite(p.position.x)).toBe(true);
  });
  it('sweeps into steep rising terrain at maximum speed', () => {
    const world: WorldSampler = {
      ...flat,
      surface: (x) => ({
        height: Math.max(0, (x - 504) * 4),
        normal: normalize({ x: x > 504 ? -4 : 0, y: 1, z: 0 }),
      }),
    };
    const p = createPlayer({ x: 500, y: 8, z: 0 });
    p.velocity.x = 450;
    for (let i = 0; i < 5; i++) {
      simulate(p, idle, world, PHYSICS.step);
      expect(p.position.y - PHYSICS.radius).toBeGreaterThanOrEqual(
        world.surface(p.position.x, 0).height - 0.01,
      );
    }
  });
  it('bounces a fast shallow disc off water', () => {
    const p = createPlayer({ x: 500, y: 2.52, z: 0 });
    p.velocity = { x: 100, y: -8, z: 0 };
    simulate(p, { ...idle, glide: true }, ocean, PHYSICS.step);
    expect(p.velocity.y).toBeGreaterThan(0);
    expect(p.contact).toBe('air');
  });
  it('floats and can relaunch after a slow water contact', () => {
    const p = createPlayer({ x: 500, y: 2.52, z: 0 });
    p.velocity.y = -5;
    simulate(p, idle, ocean, PHYSICS.step);
    expect(p.contact).toBe('water');
    simulate(p, { ...idle, jump: true }, ocean, PHYSICS.step);
    expect(p.velocity.y).toBeGreaterThan(10);
  });
  it('detects world boundary and invalid states', () => {
    const p = createPlayer({ x: 31900, y: 500, z: 0 });
    expect(simulate(p, idle, flat, PHYSICS.step).invalid).toBe(true);
  });
  it('recovers non-finite state before querying missing collision sectors', () => {
    const p = createPlayer({ x: NaN, y: 500, z: 0 });
    const world = {
      ...flat,
      surface: () => {
        throw new Error('Must not sample an invalid position');
      },
    };
    expect(simulate(p, idle, world, PHYSICS.step).invalid).toBe(true);
  });
});

describe('momentum flow regressions', () => {
  it('keeps traction through the contact skin and recovers speed from rest', () => {
    const p = createPlayer({ x: 500, y: PHYSICS.radius + 0.005, z: 0 });
    let grounded = 0;
    for (let i = 0; i < 480; i++) {
      simulate(p, { ...idle, moveZ: 1 }, flat, PHYSICS.step);
      grounded += Number(p.contact === 'ground');
    }
    expect(grounded / 480).toBeGreaterThan(0.98);
    expect(Math.hypot(p.velocity.x, p.velocity.z)).toBeGreaterThan(100);
  });
  it('redirects a dive into forward travel without creating mechanical energy', () => {
    const p = createPlayer({ x: 500, y: 10000, z: 0 });
    p.velocity = { x: 10, y: -180, z: 0 };
    const energy = 0.5 * length(p.velocity) ** 2 + PHYSICS.gravity * p.position.y;
    for (let i = 0; i < 120; i++) simulate(p, { ...idle, glide: true }, flat, PHYSICS.step);
    expect(Math.hypot(p.velocity.x, p.velocity.z)).toBeGreaterThan(140);
    expect(0.5 * length(p.velocity) ** 2 + PHYSICS.gravity * p.position.y).toBeLessThanOrEqual(
      energy + 1,
    );
  });
  it('recharges from a brief water skip instead of requiring a stop', () => {
    const p = createPlayer({ x: 500, y: 2.52, z: 0 });
    p.energy = 2;
    p.velocity = { x: 100, y: -8, z: 0 };
    simulate(p, { ...idle, glide: true }, ocean, PHYSICS.step);
    expect(p.energy).toBe(100);
    expect(p.velocity.y).toBeGreaterThan(0);
  });
  it('prevents empty-energy form flickering while recharging in a thermal', () => {
    const p = createPlayer({ x: 500, y: 500, z: 0 });
    p.energy = 0;
    p.glideLocked = true;
    const thermal = { ...flat, wind: () => ({ x: 0, y: 30, z: 0 }) };
    let transitions = 0;
    for (let i = 0; i < 120; i++) {
      transitions += Number(
        simulate(p, { ...idle, glide: true }, thermal, PHYSICS.step).transformed,
      );
      if (p.energy < 14) expect(p.form).toBe('sphere');
    }
    expect(transitions).toBe(1);
    expect(p.form).toBe('disc');
  });
  it('recovers from low-speed floating without a thermal or external boost', () => {
    const p = createPlayer({ x: 500, y: 2.505, z: 0 });
    p.energy = 0;
    for (let i = 0; i < 480; i++) simulate(p, { ...idle, moveZ: 1 }, ocean, PHYSICS.step);
    expect(Math.abs(p.velocity.z)).toBeGreaterThan(80);
    expect(p.energy).toBe(100);
    simulate(p, { ...idle, jump: true }, ocean, PHYSICS.step);
    expect(p.velocity.y).toBeGreaterThan(10);
  });
  it('buffers a jump just before touchdown', () => {
    const p = createPlayer({ x: 500, y: 3.4, z: 0 });
    p.velocity.y = -10;
    simulate(p, { ...idle, jump: true }, flat, PHYSICS.step);
    for (let i = 0; i < 14; i++) simulate(p, idle, flat, PHYSICS.step);
    expect(p.velocity.y).toBeGreaterThan(10);
  });
  it('recharges during a gravity dive but not while idling in open air', () => {
    const p = createPlayer({ x: 500, y: 5000, z: 0 });
    p.energy = 0;
    p.velocity.y = -20;
    for (let i = 0; i < 120; i++) simulate(p, { ...idle, gravity: true }, flat, PHYSICS.step);
    expect(p.energy).toBeCloseTo(PHYSICS.diveRecharge, 3);
    const before = p.energy;
    simulate(p, idle, flat, PHYSICS.step);
    expect(p.energy).toBe(before);
  });
});
