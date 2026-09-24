import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping } from 'three/webgpu';

/** Periodic, deterministic 3D noise: precomputed once, hardware-filtered during ray marching. */
export function createCloudNoise() {
  const size = 64,
    data = new Uint8Array(size ** 3);
  const hash = (x: number, y: number, z: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + 7319;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, z: number, cells: number) => {
    const q = [x, y, z].map((v) => (v / size) * cells),
      i = q.map(Math.floor);
    const f = q.map((v, j) => {
      const a = v - i[j];
      return a * a * (3 - 2 * a);
    });
    let n = 0;
    for (let iz = 0; iz < 2; iz++)
      for (let iy = 0; iy < 2; iy++)
        for (let ix = 0; ix < 2; ix++)
          n +=
            hash((i[0] + ix) % cells, (i[1] + iy) % cells, (i[2] + iz) % cells) *
            (ix ? f[0] : 1 - f[0]) *
            (iy ? f[1] : 1 - f[1]) *
            (iz ? f[2] : 1 - f[2]);
    return n;
  };
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        data[x + size * (y + size * z)] = Math.round(
          255 * (noise(x, y, z, 8) * 0.7 + noise(x, y, z, 16) * 0.22 + noise(x, y, z, 32) * 0.08),
        );
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RedFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
