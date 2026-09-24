import {
  DataTexture,
  RGBAFormat,
  RepeatWrapping,
  Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { texture } from 'three/tsl';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { PROFILES } from '../config';
import type { Quality } from '../types';

export const MATERIAL_NAMES = ['sand', 'rock', 'wet', 'snow'] as const;
export type SurfaceMaterial = (typeof MATERIAL_NAMES)[number];
export class MaterialLibrary {
  private fallback = new DataTexture(new Uint8Array([128, 128, 128, 150]), 1, 1, RGBAFormat);
  readonly maps = {
    sand: texture(this.fallback),
    rock: texture(this.fallback),
    wet: texture(this.fallback),
    snow: texture(this.fallback),
  };
  private loader = new KTX2Loader();
  private loaded: Texture[] = [];
  private generation = 0;
  private alive = true;
  quality: Quality | null = null;
  loading = false;
  constructor(private renderer: WebGPURenderer) {
    this.fallback.needsUpdate = true;
    this.loader.setTranscoderPath(`${import.meta.env.BASE_URL}assets/basis/`).setWorkerLimit(2);
  }
  async load(quality: Quality) {
    if (this.quality === quality) return;
    const generation = ++this.generation;
    this.loading = true;
    this.loader.detectSupport(this.renderer);
    const textures: Texture[] = [];
    try {
      // Sequential transcodes cap peak staging memory, particularly on uncompressed adapters.
      for (const name of MATERIAL_NAMES) {
        const size =
          name === 'wet' || name === 'snow'
            ? Math.min(2048, PROFILES[quality].textureSize)
            : PROFILES[quality].textureSize;
        const t = await this.loader.loadAsync(
          `${import.meta.env.BASE_URL}assets/materials/${name}-${size}.ktx2`,
        );
        t.wrapS = t.wrapT = RepeatWrapping;
        t.anisotropy = 8;
        textures.push(t);
        if (!this.alive || generation !== this.generation) {
          textures.forEach((t) => t.dispose());
          return;
        }
      }
      const previous = this.loaded;
      MATERIAL_NAMES.forEach((name, i) => {
        this.maps[name].value = textures[i];
      });
      this.loaded = textures;
      this.quality = quality;
      previous.forEach((t) => t.dispose());
    } catch (error) {
      textures.forEach((t) => t.dispose());
      throw error;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
  get memoryBytes() {
    return this.loaded.reduce(
      (sum, t) =>
        sum +
        t.mipmaps.reduce(
          (n, m) => n + ((m as { data?: ArrayBufferView }).data?.byteLength ?? 0),
          0,
        ),
      0,
    );
  }
  dispose() {
    this.alive = false;
    this.generation++;
    this.loaded.forEach((t) => t.dispose());
    this.fallback.dispose();
    this.loader.dispose();
  }
}
