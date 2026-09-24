import { WORLD } from '../config';
import type { Landmark, Vec3 } from '../types';

/** Authored silhouettes; coordinates and conservative oriented colliders are shared by all consumers. */
export function landmarkLayout(): Landmark[] {
  const result: Landmark[] = [];
  for (const [i, cp] of WORLD.checkpoints.entries()) {
    result.push({
      id: `signal-${i}`,
      kind: 'monolith',
      seed: i + 7319,
      position: { x: cp.x + 260, y: 0, z: cp.z - 220 },
      scale: { x: 48 + i * 8, y: 380 + i * 85, z: 65 + i * 9 },
      yaw: 0.2 + i * 0.65,
    });
    for (let j = 0; j < 7; j++) {
      const a = j * 2.399 + i,
        radius = 700 + (j % 3) * 180;
      const size = 9 + ((j * 7 + i * 3) % 19);
      result.push({
        id: `suspended-${i}-${j}`,
        kind: 'rock',
        seed: i * 71 + j * 19,
        position: {
          x: cp.x + Math.cos(a) * radius,
          y: 160 + j * 46,
          z: cp.z + Math.sin(a) * radius,
        },
        scale: { x: size, y: size * 1.35, z: size * 0.8 },
        yaw: a,
      });
    }
  }
  return result;
}

function local(p: Vec3, obstacle: Landmark) {
  const dx = p.x - obstacle.position.x,
    dz = p.z - obstacle.position.z;
  const c = Math.cos(obstacle.yaw),
    s = Math.sin(obstacle.yaw);
  return { x: c * dx - s * dz, y: p.y - obstacle.position.y, z: s * dx + c * dz };
}

/** Swept sphere against expanded OBBs. Returns the earliest contact, never endpoint-only. */
export function sweepLandmarks(
  from: Vec3,
  to: Vec3,
  radius: number,
  obstacles: readonly Landmark[],
) {
  let closest = 1;
  let normal: Vec3 | null = null;
  for (const obstacle of obstacles) {
    const extent = Math.max(obstacle.scale.x, obstacle.scale.y, obstacle.scale.z) + radius;
    if (
      Math.hypot(
        from.x - obstacle.position.x,
        from.y - obstacle.position.y,
        from.z - obstacle.position.z,
      ) >
      extent + Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
    )
      continue;
    const a = local(from, obstacle),
      b = local(to, obstacle);
    let enter = 0,
      leave = closest,
      hit: Vec3 | null = null,
      inside = true;
    for (const axis of ['x', 'y', 'z'] as const) {
      const half = obstacle.scale[axis] * 0.5 + radius;
      if (Math.abs(a[axis]) > half) inside = false;
      const d = b[axis] - a[axis];
      if (Math.abs(d) < 1e-8) {
        if (Math.abs(a[axis]) > half) {
          leave = -1;
          break;
        }
        continue;
      }
      const t1 = (-half - a[axis]) / d,
        t2 = (half - a[axis]) / d;
      const near = Math.min(t1, t2),
        far = Math.max(t1, t2);
      if (near > enter) {
        enter = near;
        hit = { x: 0, y: 0, z: 0 };
        hit[axis] = -Math.sign(d);
      }
      leave = Math.min(leave, far);
      if (enter > leave) break;
    }
    if (!inside && hit && enter <= leave && enter >= 0 && enter < closest) {
      closest = enter;
      const c = Math.cos(obstacle.yaw),
        s = Math.sin(obstacle.yaw);
      normal = { x: c * hit.x + s * hit.z, y: hit.y, z: -s * hit.x + c * hit.z };
    }
  }
  return normal ? { fraction: closest, normal } : null;
}
