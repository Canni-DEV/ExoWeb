import { DEFAULT_SETTINGS, WORLD } from '../config';
import type { SaveDataV1, Settings } from '../types';
import { clamp } from '../simulation/math';
export const SAVE_KEY = 'exoweb.save.v1';
export function cleanSettings(value: unknown): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!value || typeof value !== 'object') return d;
  const s = value as Record<string, unknown>;
  if (s.quality === 'low' || s.quality === 'medium' || s.quality === 'high') d.quality = s.quality;
  if (s.hud === 'contextual' || s.hud === 'full' || s.hud === 'hidden') d.hud = s.hud;
  for (const name of ['motionBlur', 'grain', 'bloom', 'lens'] as const)
    if (typeof s[name] === 'number' && Number.isFinite(s[name])) d[name] = clamp(s[name], 0, 1);
  for (const name of ['sensitivity', 'music', 'effects'] as const)
    if (typeof s[name] === 'number' && Number.isFinite(s[name]))
      d[name] = clamp(s[name], name === 'sensitivity' ? 0.2 : 0, name === 'sensitivity' ? 3 : 1);
  for (const name of ['invertY', 'comfort'] as const)
    if (typeof s[name] === 'boolean') d[name] = s[name];
  if (s.bindings && typeof s.bindings === 'object')
    for (const key of Object.keys(d.bindings) as (keyof Settings['bindings'])[]) {
      const candidate = (s.bindings as Record<string, unknown>)[key];
      if (
        typeof candidate === 'string' &&
        /^(Key[A-Z]|Digit[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Arrow(Up|Down|Left|Right))$/.test(
          candidate,
        )
      )
        d.bindings[key] = candidate;
    }
  if (s.gamepad && typeof s.gamepad === 'object')
    for (const key of Object.keys(d.gamepad) as (keyof Settings['gamepad'])[]) {
      const candidate = (s.gamepad as Record<string, unknown>)[key];
      if (
        typeof candidate === 'number' &&
        Number.isInteger(candidate) &&
        candidate >= 0 &&
        candidate <= 16
      )
        d.gamepad[key] = candidate;
    }
  return d;
}
export function parseSave(raw: string | null): SaveDataV1 {
  const fresh: SaveDataV1 = {
    version: 1,
    checkpoint: 0,
    completed: false,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
  try {
    if (!raw) return fresh;
    const data = JSON.parse(raw);
    if (data.version !== 1) return fresh;
    return {
      version: 1,
      checkpoint: Number.isInteger(data.checkpoint)
        ? clamp(data.checkpoint, 0, WORLD.checkpoints.length - 1)
        : 0,
      completed: data.completed === true,
      settings: cleanSettings(data.settings),
    };
  } catch {
    return fresh;
  }
}
export class SaveStore {
  available = true;
  data: SaveDataV1;
  constructor() {
    try {
      this.data = parseSave(localStorage.getItem(SAVE_KEY));
    } catch {
      this.available = false;
      this.data = parseSave(null);
    }
  }
  write() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      this.available = false;
    }
  }
}
