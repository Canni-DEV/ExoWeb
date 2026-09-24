import { PHYSICS, WORLD } from '../config';
import type { InputFrame, PlayerState, Vec3, WorldSampler } from '../types';
import { clamp, dot, length, normalize, smooth } from './math';

export const createPlayer = (position: Vec3): PlayerState => ({
  position: { ...position },
  velocity: { x: 0, y: 0, z: 0 },
  yaw: 0,
  energy: 100,
  form: 'sphere',
  morph: 0,
  contact: 'air',
  time: 0,
  clearance: 0,
  energySource: 'idle',
  glideLocked: false,
  jumpBuffer: 0,
  groundGrace: 0,
});
export const clonePlayer = (p: PlayerState): PlayerState => ({
  ...p,
  position: { ...p.position },
  velocity: { ...p.velocity },
});
export const isPlayerFinite = (p: PlayerState) =>
  [
    p.position.x,
    p.position.y,
    p.position.z,
    p.velocity.x,
    p.velocity.y,
    p.velocity.z,
    p.energy,
    p.time,
    p.yaw,
    p.morph,
    p.clearance,
    p.jumpBuffer,
    p.groundGrace,
  ].every(Number.isFinite);
export interface PhysicsEvents {
  impact: number;
  splash: boolean;
  transformed: boolean;
  sonic: boolean;
  invalid: boolean;
}

export function simulate(
  p: PlayerState,
  input: InputFrame,
  world: WorldSampler,
  dt: number,
): PhysicsEvents {
  const events: PhysicsEvents = {
    impact: 0,
    splash: false,
    transformed: false,
    sonic: false,
    invalid: false,
  };
  if (!isPlayerFinite(p)) {
    events.invalid = true;
    return events;
  }
  const beforeSpeed = length(p.velocity);
  p.time += dt;
  p.yaw = input.yaw;
  const groundHere = world.surface(p.position.x, p.position.z),
    waterHere = world.water(p.position.x, p.position.z, p.time);
  const overWater = waterHere.height > groundHere.height;
  const support = overWater ? waterHere : groundHere;
  p.clearance = Math.max(0, p.position.y - PHYSICS.radius - support.height);
  // Keep support through the collision skin. It used to remove traction every other step.
  const grounded = p.clearance <= PHYSICS.supportDistance && dot(p.velocity, support.normal) < 0.8;
  p.contact = grounded ? (overWater ? 'water' : 'ground') : 'air';
  p.groundGrace = grounded ? PHYSICS.coyoteTime : Math.max(0, p.groundGrace - dt);
  p.jumpBuffer = input.jump ? PHYSICS.jumpBuffer : Math.max(0, p.jumpBuffer - dt);
  if (p.energy >= PHYSICS.glideRestartEnergy) p.glideLocked = false;
  const previousForm = p.form;
  p.form = input.glide && !input.gravity && p.energy > 0 && !p.glideLocked ? 'disc' : 'sphere';
  const wind = world.wind(p.position);
  const skimming =
    p.form === 'disc' && p.clearance < 8 && Math.hypot(p.velocity.x, p.velocity.z) > 25;
  const diving = input.gravity && !grounded && p.velocity.y < -10;
  p.energySource = grounded
    ? overWater
      ? 'water'
      : 'ground'
    : wind.y > 3
      ? 'thermal'
      : skimming
        ? 'skim'
        : diving
          ? 'dive'
          : p.form === 'disc'
            ? 'glide'
            : p.energy === 0
              ? 'empty'
              : 'idle';
  const recharge = grounded
    ? PHYSICS.recharge
    : wind.y > 3
      ? PHYSICS.thermalRecharge
      : skimming
        ? PHYSICS.skimRecharge
        : diving
          ? PHYSICS.diveRecharge
          : 0;
  p.energy = clamp(
    p.energy + (recharge - (p.form === 'disc' && !grounded ? PHYSICS.energyDrain : 0)) * dt,
    0,
    100,
  );
  if (p.energy === 0) {
    p.form = 'sphere';
    p.glideLocked = true;
    p.energySource = 'empty';
  }
  p.morph += ((p.form === 'disc' ? 1 : 0) - p.morph) * (1 - Math.exp(-12 * dt));
  events.transformed = previousForm !== p.form;
  const v = p.velocity;
  const moveLength = Math.hypot(input.moveX, input.moveZ);
  const mx = input.moveX / Math.max(1, moveLength),
    mz = input.moveZ / Math.max(1, moveLength);
  const wish = {
    x: mx * Math.cos(input.yaw) - mz * Math.sin(input.yaw),
    y: 0,
    z: -mx * Math.sin(input.yaw) - mz * Math.cos(input.yaw),
  };
  if (p.groundGrace > 0 && p.jumpBuffer > 0) {
    v.y = Math.max(0, v.y) + PHYSICS.jumpSpeed;
    p.position.y += 0.12;
    p.contact = 'air';
    p.groundGrace = 0;
    p.jumpBuffer = 0;
  }
  const gravity = PHYSICS.gravity * (input.gravity ? PHYSICS.gravityMultiplier : 1);
  v.y -= gravity * dt;
  if (p.contact !== 'air') {
    const normal =
      p.contact === 'ground'
        ? world.surface(p.position.x, p.position.z).normal
        : { x: 0, y: 1, z: 0 };
    const projection = dot(wish, normal);
    const acceleration =
      PHYSICS.groundAcceleration + PHYSICS.lowSpeedAssist * (1 - smooth(15, 65, beforeSpeed));
    v.x += (wish.x - normal.x * projection) * acceleration * dt;
    v.y += -normal.y * projection * acceleration * dt;
    v.z += (wish.z - normal.z * projection) * acceleration * dt;
    const drag = Math.exp(-(p.contact === 'water' ? 0.12 : 0.018) * dt);
    v.x *= drag;
    v.z *= drag;
  } else if (p.form === 'disc') {
    const horizontal = Math.hypot(v.x, v.z);
    // Steering rotates horizontal momentum; it cannot create kinetic energy.
    if (moveLength > 0.05 && horizontal > 0.1) {
      const desired = Math.atan2(wish.x, -wish.z),
        current = Math.atan2(v.x, -v.z);
      const angle = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
      const heading = current + clamp(angle, -0.7 * dt, 0.7 * dt);
      v.x = Math.sin(heading) * horizontal;
      v.z = -Math.cos(heading) * horizontal;
    }
    // Redirect descent momentum into forward travel, preserving speed before drag.
    // This is an arcade glider, not an engine adding thrust in mid-air.
    if (v.y < 0) {
      const total = length(v),
        angle = Math.atan2(v.y, horizontal);
      const targetAngle = -0.035;
      const recovered = Math.min(
        targetAngle,
        angle + PHYSICS.diveRecoveryRate * smooth(12, 60, total) * dt,
      );
      if (recovered > angle) {
        const heading =
          horizontal > 0.1
            ? Math.atan2(v.x, -v.z)
            : moveLength > 0.05
              ? Math.atan2(wish.x, -wish.z)
              : -input.yaw;
        const h = total * Math.cos(recovered);
        v.x = Math.sin(heading) * h;
        v.z = -Math.cos(heading) * h;
        v.y = Math.sin(recovered) * total;
      }
    }
    const drag = Math.exp(-0.008 * dt);
    v.x *= drag;
    v.z *= drag;
  } else {
    const drag = Math.exp(-0.004 * dt);
    v.x *= drag;
    v.z *= drag;
  }
  if (p.contact === 'air') {
    v.y += wind.y * dt;
    v.x += (wind.x - v.x) * 0.003 * dt;
    v.z += (wind.z - v.z) * 0.003 * dt;
  }
  const speed = length(v);
  if (speed > PHYSICS.maxSpeed) {
    const k = PHYSICS.maxSpeed / speed;
    v.x *= k;
    v.y *= k;
    v.z *= k;
  }

  // Sweep at <= 1 m intervals so the 1 m canonical height field cannot be skipped.
  const steps = Math.max(1, Math.ceil(length(v) * dt));
  const h = dt / steps;
  // Retain support until a query actually detects separation, not merely the skin gap.
  for (let i = 0; i < steps; i++) {
    const old = { ...p.position };
    const target = { x: old.x + v.x * h, y: old.y + v.y * h, z: old.z + v.z * h };
    const terrain = world.surface(target.x, target.z),
      water = world.water(target.x, target.z, p.time);
    const isWater = water.height > terrain.height;
    const surface = isWater ? water : terrain;
    if (target.y - PHYSICS.radius - surface.height > PHYSICS.supportDistance) p.contact = 'air';
    if (target.y - PHYSICS.radius < surface.height) {
      let lo = 0,
        hi = 1;
      for (let j = 0; j < 8; j++) {
        const t = (lo + hi) / 2,
          x = old.x + (target.x - old.x) * t,
          z = old.z + (target.z - old.z) * t,
          y = old.y + (target.y - old.y) * t;
        const ground = world.surface(x, z).height,
          sea = world.water(x, z, p.time).height;
        if (y - PHYSICS.radius < Math.max(ground, sea)) hi = t;
        else lo = t;
      }
      const impact = Math.max(0, -dot(v, surface.normal));
      events.impact = Math.max(events.impact, impact);
      // Brief touchdowns and water skips are enough to prepare the next glide.
      p.energy = 100;
      p.glideLocked = false;
      p.energySource = isWater ? 'water' : 'ground';
      const horizontal = Math.hypot(v.x, v.z);
      if (
        isWater &&
        p.form === 'disc' &&
        horizontal > 30 &&
        Math.atan2(impact, horizontal) < Math.PI / 9 &&
        impact > 0.5
      ) {
        v.y = Math.max(7, impact * 0.65);
        v.x *= 0.97;
        v.z *= 0.97;
        events.splash = true;
        p.contact = 'air';
        p.groundGrace = 0;
      } else {
        const vn = dot(v, surface.normal);
        if (vn < 0) {
          v.x -= surface.normal.x * vn;
          v.y -= surface.normal.y * vn;
          v.z -= surface.normal.z * vn;
        }
        p.contact = isWater ? 'water' : 'ground';
        if (isWater) {
          v.y = Math.max(v.y, 0);
          events.splash = impact > 5;
        }
      }
      // Refined time of impact is used for the remaining tangential movement.
      target.x = old.x + (target.x - old.x) * lo + v.x * h * (1 - lo);
      target.z = old.z + (target.z - old.z) * lo + v.z * h * (1 - lo);
      target.y =
        Math.max(
          world.surface(target.x, target.z).height,
          world.water(target.x, target.z, p.time).height,
        ) +
        PHYSICS.radius +
        0.005;
    }
    p.position = target;
  }
  // The signal pillars are solid capsules; nearby contacts are inexpensive on CPU.
  for (const cp of WORLD.checkpoints) {
    const cx = cp.x + 100,
      cz = cp.z + 100,
      dx = p.position.x - cx,
      dz = p.position.z - cz,
      r = Math.hypot(dx, dz);
    if (
      r < 16 + PHYSICS.radius &&
      world.ready(cx, cz) &&
      p.position.y < world.surface(cx, cz).height + 200
    ) {
      const n = normalize({ x: dx || 0.01, y: 0, z: dz });
      p.position.x = cx + n.x * (16 + PHYSICS.radius);
      p.position.z = cz + n.z * (16 + PHYSICS.radius);
      const vn = dot(v, n);
      if (vn < 0) {
        v.x -= vn * n.x;
        v.z -= vn * n.z;
      }
    }
  }
  events.sonic = beforeSpeed < 343 && length(v) >= 343;
  events.invalid =
    !Number.isFinite(p.position.x + p.position.y + p.position.z + length(v)) ||
    Math.abs(p.position.x) > WORLD.size / 2 - 400 ||
    Math.abs(p.position.z) > WORLD.size / 2 - 400 ||
    p.position.y < -1000 ||
    p.position.y > 18000;
  return events;
}
