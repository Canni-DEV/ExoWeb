import type { Vec3 } from '../types';
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
export const normalize = (v: Vec3): Vec3 => {
  const l = length(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, rate: number, dt: number) =>
  mix(a, b, 1 - Math.exp(-rate * dt));
export function interpolateVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

export class FixedClock {
  private accumulator = 0;
  constructor(readonly step = 1 / 120) {}
  advance(dt: number, update: (dt: number) => boolean | void) {
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.step && steps < 12) {
      if (update(this.step) === false) {
        this.reset();
        return 0;
      }
      this.accumulator -= this.step;
      steps++;
    }
    return clamp(this.accumulator / this.step, 0, 1);
  }
  reset() {
    this.accumulator = 0;
  }
}
