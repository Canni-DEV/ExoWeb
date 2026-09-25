import { it, expect } from 'vitest';
import { Mesh, Scene } from 'three/webgpu';
import { TerrainRenderer } from '../src/render/terrain';
import { createUniforms } from '../src/render/uniforms';
import type { TerrainStream } from '../src/world/stream';
import { tileKey, type HeightTile } from '../src/world/tiles';

it('keeps distant land behind the ocean through the visible horizon', () => {
  const stream = { ready: () => false, onTile: null } as unknown as TerrainStream;
  const scene = new Scene();
  const renderer = new TerrainRenderer(scene, stream, createUniforms());
  try {
    for (const [x, z] of [
      [0, 0],
      [-6500, -15000],
      [19000, -25000],
    ]) {
      renderer.update(x, z);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const px = x + Math.cos(angle) * 90000;
        const pz = z + Math.sin(angle) * 90000;
        expect(
          scene.children.some(
            ({ userData: p }) =>
              px >= p.worldX &&
              px < p.worldX + p.patchSize &&
              pz >= p.worldZ &&
              pz < p.worldZ + p.patchSize,
          ),
        ).toBe(true);
      }
    }
  } finally {
    renderer.dispose();
  }
});

it('recycles near geometry while replacing canonical heights and all skirt samples', () => {
  const tiles = new Map<string, HeightTile>();
  const stream = {
    tiles,
    ready: (x: number, z: number) => tiles.has(tileKey(x, z)),
    onTile: null,
  } as unknown as TerrainStream;
  const scene = new Scene(),
    renderer = new TerrainRenderer(scene, stream, createUniforms());
  const geometries = new Set<number>();
  try {
    for (const center of [0, 256, 512, 256, 0, -256]) {
      tiles.clear();
      for (let z = -1; z <= 1; z++)
        for (let x = -1; x <= 1; x++) {
          const px = center + x * 256,
            pz = z * 256,
            data = new Float32Array(257 * 257);
          data.fill(px + pz + 1000);
          tiles.set(tileKey(px, pz), { x: px, z: pz, data });
        }
      renderer.update(center, 0);
      const near = scene.children.filter(
        (m): m is Mesh => m instanceof Mesh && Boolean(m.geometry.getAttribute('height')),
      );
      expect(near).toHaveLength(9);
      for (const mesh of near) {
        geometries.add(mesh.geometry.id);
        const heights = mesh.geometry.getAttribute('height').array;
        const expected = mesh.userData.worldX + mesh.userData.worldZ + 1000;
        expect(heights[0]).toBe(expected);
        expect(heights[257 * 257 - 1]).toBe(expected);
        expect(heights.at(-1)).toBe(expected);
      }
    }
    expect(geometries.size).toBe(9);
  } finally {
    renderer.dispose();
  }
});
