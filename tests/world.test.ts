import { describe, it, expect } from 'vitest';
import { sampleTile, tileKey, TILE_SAMPLES, type HeightTile } from '../src/world/tiles';
import { waterSurface, windAt } from '../src/world/field';
import { WORLD } from '../src/config';
function tile(x: number, z: number): HeightTile {
  const data = new Float32Array(TILE_SAMPLES * TILE_SAMPLES);
  for (let iz = 0; iz < 257; iz++)
    for (let ix = 0; ix < 257; ix++) data[iz * 257 + ix] = (x + ix) * 0.2 + (z + iz) * 0.4;
  return { x, z, data };
}
describe('canonical terrain', () => {
  it('uses floor addressing for negative coordinates', () => {
    expect(tileKey(-0.1, -256.1)).toBe('-1,-2');
  });
  it('interpolates both triangles consistently with a planar mesh', () => {
    const t = tile(0, 0);
    for (const [x, z] of [
      [10.1, 12.2],
      [10.9, 12.9],
    ]) {
      const s = sampleTile(t, x, z);
      expect(s.height).toBeCloseTo(x * 0.2 + z * 0.4, 4);
      expect(s.normal.y).toBeGreaterThan(0.8);
    }
  });
  it('has matching sector borders within 5 cm', () => {
    const a = tile(0, 0),
      b = tile(256, 0);
    for (let z = 0; z < 256; z += 0.5)
      expect(Math.abs(sampleTile(a, 256, z).height - sampleTile(b, 256, z).height)).toBeLessThan(
        0.05,
      );
  });
  it('handles negative-sector sampling', () => {
    const t = tile(-256, -256);
    expect(sampleTile(t, -10.5, -30.5).height).toBeCloseTo(-14.3, 3);
  });
});
describe('water and shared thermal volumes', () => {
  it('produces finite bounded Gerstner water heights and unit normals', () => {
    for (let t = 0; t < 10; t += 0.25) {
      const s = waterSurface(31000, -31000, t);
      expect(Math.abs(s.height)).toBeLessThan(2.31);
      expect(Math.hypot(s.normal.x, s.normal.y, s.normal.z)).toBeCloseTo(1, 6);
    }
  });
  it('provides lift in visible thermal locations and none above their tops', () => {
    for (const t of WORLD.thermals) {
      expect(windAt({ x: t.x, y: (t.base + t.top) / 2, z: t.z }).y).toBeGreaterThan(5);
      expect(windAt({ x: t.x, y: 8000, z: t.z }).y).toBe(0);
    }
  });
});
