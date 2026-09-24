import type { Surface } from '../types';
import { normalize } from '../simulation/math';
export const TILE_SIZE = 256;
export const TILE_SAMPLES = 257;
export interface HeightTile {
  x: number;
  z: number;
  data: Float32Array;
}
export const tileKey = (x: number, z: number) =>
  `${Math.floor(x / TILE_SIZE)},${Math.floor(z / TILE_SIZE)}`;
export function sampleTile(tile: HeightTile, x: number, z: number): Surface {
  const lx = Math.max(0, Math.min(255.999999, x - tile.x));
  const lz = Math.max(0, Math.min(255.999999, z - tile.z));
  const ix = Math.floor(lx),
    iz = Math.floor(lz),
    fx = lx - ix,
    fz = lz - iz;
  const offset = iz * TILE_SAMPLES + ix;
  const a = tile.data[offset],
    b = tile.data[offset + 1],
    c = tile.data[offset + TILE_SAMPLES],
    d = tile.data[offset + TILE_SAMPLES + 1];
  // Same a-c-b / b-c-d diagonal used by PlaneGeometry rotated onto XZ.
  if (fx + fz <= 1)
    return {
      height: a + (b - a) * fx + (c - a) * fz,
      normal: normalize({ x: a - b, y: 1, z: a - c }),
    };
  return {
    height: d + (c - d) * (1 - fx) + (b - d) * (1 - fz),
    normal: normalize({ x: c - d, y: 1, z: b - d }),
  };
}
