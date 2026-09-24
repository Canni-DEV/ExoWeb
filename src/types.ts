export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface InputFrame {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  gravity: boolean;
  glide: boolean;
  jump: boolean;
  reset: boolean;
}
export type Contact = 'air' | 'ground' | 'water';
export type EnergySource =
  'ground' | 'water' | 'thermal' | 'skim' | 'dive' | 'glide' | 'empty' | 'idle';
export interface PlayerState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  energy: number;
  form: 'sphere' | 'disc';
  morph: number;
  contact: Contact;
  time: number;
  clearance: number;
  energySource: EnergySource;
  glideLocked: boolean;
  jumpBuffer: number;
  groundGrace: number;
}
export interface Checkpoint {
  id: number;
  name: string;
  x: number;
  z: number;
  hint: string;
  radius: number;
}
export interface Thermal {
  x: number;
  z: number;
  radius: number;
  base: number;
  top: number;
  strength: number;
}
export interface WorldDefinition {
  seed: number;
  size: number;
  checkpoints: readonly Checkpoint[];
  thermals: readonly Thermal[];
}
export interface Surface {
  height: number;
  normal: Vec3;
}
export interface WorldSampler {
  surface(x: number, z: number): Surface;
  water(x: number, z: number, time: number): Surface;
  wind(position: Vec3): Vec3;
  ready(x: number, z: number): boolean;
}
export type Quality = 'low' | 'medium' | 'high';
export type Action =
  'forward' | 'backward' | 'left' | 'right' | 'gravity' | 'glide' | 'jump' | 'reset';
export interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  comfort: boolean;
  music: number;
  effects: number;
  bindings: Record<Action, string>;
  gamepad: { gravity: number; glide: number; jump: number; pause: number };
}
export interface SaveDataV1 {
  version: 1;
  checkpoint: number;
  completed: boolean;
  settings: Settings;
}
export interface RenderSnapshot {
  player: PlayerState;
  cameraYaw: number;
  cameraPitch: number;
  checkpoint: number;
  completed: boolean;
  dt: number;
}
export interface Diagnostics {
  fps: number;
  p95: number;
  scale: number;
  sectors: number;
  memoryMiB: number;
  cpuMs: number;
  gpuMs: number | null;
  x: number;
  y: number;
  z: number;
}
