import { StorageBufferAttribute, Vector2, type WebGPURenderer } from 'three/webgpu';
import { Fn, float, instanceIndex, storage, uniform, vec2 } from 'three/tsl';
import { terrainHeight, waterSurface, windAt } from './field';
import { sampleTile, TILE_SAMPLES, TILE_SIZE, tileKey, type HeightTile } from './tiles';
import type { Vec3, WorldSampler, Landmark } from '../types';

export class TerrainStream implements WorldSampler {
  obstacles: Landmark[] = [];
  readonly tiles = new Map<string, HeightTile>();
  readonly pending = new Map<string, { x: number; z: number }>();
  onTile: ((tile: HeightTile) => void) | null = null;
  error: Error | null = null;
  private alive = true;
  private running = false;
  private center = { x: 0, z: 0 };
  private output = new StorageBufferAttribute(TILE_SAMPLES * TILE_SAMPLES, 1);
  private buffer = storage(this.output, 'float', TILE_SAMPLES * TILE_SAMPLES);
  private offset = uniform(new Vector2());
  private compute = Fn(() => {
    const x = float(instanceIndex.mod(TILE_SAMPLES));
    const z = float(instanceIndex.div(TILE_SAMPLES));
    this.buffer.element(instanceIndex).assign(terrainHeight(vec2(x, z).add(this.offset)));
  })().compute(TILE_SAMPLES * TILE_SAMPLES);
  constructor(private renderer: WebGPURenderer) {}
  ready(x: number, z: number) {
    return this.tiles.has(tileKey(x, z));
  }
  surface(x: number, z: number) {
    const tile = this.tiles.get(tileKey(x, z));
    if (!tile) throw new Error(`Sector sin colisión ${tileKey(x, z)}`);
    return sampleTile(tile, x, z);
  }
  water = waterSurface;
  wind = windAt;
  /** Maximum discontinuity at shared sample rows, useful for GPU acceptance diagnostics. */
  get seamError() {
    let error = 0;
    for (const tile of this.tiles.values()) {
      const right = this.tiles.get(tileKey(tile.x + TILE_SIZE, tile.z));
      const bottom = this.tiles.get(tileKey(tile.x, tile.z + TILE_SIZE));
      for (let i = 0; i < TILE_SAMPLES; i++) {
        if (right)
          error = Math.max(
            error,
            Math.abs(tile.data[i * TILE_SAMPLES + TILE_SIZE] - right.data[i * TILE_SAMPLES]),
          );
        if (bottom)
          error = Math.max(
            error,
            Math.abs(tile.data[TILE_SIZE * TILE_SAMPLES + i] - bottom.data[i]),
          );
      }
    }
    return error;
  }
  request(x: number, z: number) {
    const key = tileKey(x, z);
    if (!this.tiles.has(key) && !this.pending.has(key))
      this.pending.set(key, {
        x: Math.floor(x / TILE_SIZE) * TILE_SIZE,
        z: Math.floor(z / TILE_SIZE) * TILE_SIZE,
      });
  }
  requestAround(p: Vec3, velocity: Vec3) {
    this.center = { x: p.x, z: p.z };
    // Retain a full near neighbourhood for camera collision and arbitrary steering.
    for (let z = -2; z <= 2; z++)
      for (let x = -2; x <= 2; x++) this.request(p.x + x * TILE_SIZE, p.z + z * TILE_SIZE);
    for (let t = 0; t <= 4; t += 0.25) {
      const px = p.x + velocity.x * t,
        pz = p.z + velocity.z * t;
      for (let z = -1; z <= 1; z++)
        for (let x = -1; x <= 1; x++) this.request(px + x * TILE_SIZE, pz + z * TILE_SIZE);
    }
    for (const [key, tile] of this.tiles)
      if (Math.hypot(tile.x - p.x, tile.z - p.z) > 4000) this.tiles.delete(key);
    for (const [key, tile] of this.pending)
      if (Math.hypot(tile.x - p.x, tile.z - p.z) > 4500) this.pending.delete(key);
    void this.pump();
  }
  canStep(p: Vec3, v: Vec3, dt: number) {
    // A conservative footprint covers the swept player and terrain camera probes.
    const x = p.x + v.x * dt,
      z = p.z + v.z * dt;
    for (const dx of [-8, 0, 8])
      for (const dz of [-8, 0, 8]) if (!this.ready(x + dx, z + dz)) return false;
    return true;
  }
  async warm(p: Vec3) {
    this.requestAround(p, { x: 0, y: 0, z: 0 });
    while (this.alive && (!this.ready(p.x, p.z) || this.running || this.pending.size)) {
      if (this.error) throw this.error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  async loadPoint(x: number, z: number) {
    this.request(x, z);
    void this.pump();
    while (this.alive && !this.ready(x, z)) {
      if (this.error) throw this.error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.surface(x, z).height;
  }
  private async pump() {
    if (this.running || !this.alive || this.error) return;
    this.running = true;
    try {
      while (this.pending.size && this.alive) {
        const entries = [...this.pending.entries()].sort(
          (a, b) =>
            Math.hypot(a[1].x - this.center.x, a[1].z - this.center.z) -
            Math.hypot(b[1].x - this.center.x, b[1].z - this.center.z),
        );
        const [key, tile] = entries[0];
        this.offset.value.set(tile.x, tile.z);
        await this.renderer.computeAsync(this.compute);
        const result = await this.renderer.getArrayBufferAsync(this.output);
        if (!this.alive) break;
        const ready = { ...tile, data: new Float32Array(result) };
        this.tiles.set(key, ready);
        this.pending.delete(key);
        this.onTile?.(ready);
        // Yield between dispatches; never block the simulation on a GPU readback.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.alive = false;
    this.tiles.clear();
    this.pending.clear();
    this.compute.dispose();
  }
}
