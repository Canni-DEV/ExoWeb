import type { Settings, WorldDefinition } from './types';

export const PHYSICS = Object.freeze({
  step: 1 / 120,
  gravity: 9.8,
  gravityMultiplier: 6,
  radius: 2.5,
  jumpSpeed: 12,
  maxSpeed: 450,
  groundAcceleration: 18,
  energyDrain: 8,
  recharge: 30,
  thermalRecharge: 20,
});
export const WORLD: WorldDefinition = {
  seed: 7319,
  size: 64_000,
  checkpoints: [
    {
      id: 0,
      name: 'La orilla',
      x: 0,
      z: 0,
      radius: 350,
      hint: 'Rodá con WASD. Mantené gravedad al bajar y soltala al subir.',
    },
    {
      id: 1,
      name: 'El pliegue',
      x: -3200,
      z: -6400,
      radius: 650,
      hint: 'Saltá y mantené disco para transformar el impulso en vuelo.',
    },
    {
      id: 2,
      name: 'La corona',
      x: -6000,
      z: -16000,
      radius: 900,
      hint: 'Buscá las columnas de nubes: sus corrientes recargan tu energía.',
    },
    {
      id: 3,
      name: 'El mar interior',
      x: 4500,
      z: -20500,
      radius: 1000,
      hint: 'Rozá el agua en disco para rebotar. Si frenás, podés volver a saltar.',
    },
    {
      id: 4,
      name: 'La señal',
      x: 19000,
      z: -25000,
      radius: 750,
      hint: 'Llegaste. El planeta queda abierto para seguir explorando.',
    },
  ],
  thermals: [
    { x: -1800, z: -4000, radius: 1100, base: 100, top: 3000, strength: 22 },
    { x: -3800, z: -9800, radius: 1500, base: 500, top: 4700, strength: 35 },
    { x: -5900, z: -14600, radius: 1700, base: 1000, top: 6500, strength: 42 },
    { x: -1000, z: -19000, radius: 1400, base: 30, top: 3800, strength: 26 },
    { x: 5000, z: -20800, radius: 1500, base: 0, top: 4000, strength: 30 },
    { x: 10000, z: -22600, radius: 1700, base: 0, top: 4200, strength: 32 },
    { x: 15100, z: -24000, radius: 1800, base: 0, top: 5000, strength: 34 },
  ],
};
export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sensitivity: 1,
  invertY: false,
  comfort: false,
  music: 0.35,
  effects: 0.65,
  bindings: {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    gravity: 'ShiftLeft',
    glide: 'ControlLeft',
    jump: 'Space',
    reset: 'KeyR',
  },
  gamepad: { gravity: 7, glide: 6, jump: 0, pause: 9 },
};
export const PROFILES = {
  low: { cloudScale: 0.25, cloudSteps: 32, shadowSteps: 3, particles: 128 },
  medium: { cloudScale: 0.5, cloudSteps: 64, shadowSteps: 5, particles: 256 },
  high: { cloudScale: 0.5, cloudSteps: 96, shadowSteps: 7, particles: 512 },
} as const;
