import { PHYSICS } from '../config';
import { length } from '../simulation/math';
import type { PlayerState, Settings } from '../types';

const key = (value: string) =>
  value
    .replace('Key', '')
    .replace('ControlLeft', 'Ctrl')
    .replace('ShiftLeft', 'Shift')
    .replace('Space', 'Espacio');
export function flightGuide(p: PlayerState, s: Settings) {
  const gravity = key(s.bindings.gravity),
    disc = key(s.bindings.glide),
    jump = key(s.bindings.jump);
  const move = [s.bindings.forward, s.bindings.left, s.bindings.backward, s.bindings.right]
    .map(key)
    .join('/');
  const source = p.energySource;
  const state =
    source === 'thermal'
      ? 'CORRIENTE · RECARGANDO'
      : source === 'skim'
        ? 'RASANTE · RECARGANDO'
        : source === 'dive'
          ? 'PICADO · RECARGANDO'
          : source === 'ground'
            ? 'SUELO · RECARGANDO'
            : source === 'water'
              ? 'AGUA · RECARGANDO'
              : p.glideLocked
                ? 'DISCO RECUPERÁNDOSE'
                : source === 'glide'
                  ? `PLANEO · ${Math.ceil(p.energy / PHYSICS.energyDrain)} s`
                  : 'ENERGÍA DE PLANEO';
  let hint = `${disc}: disco. Usá la altura y el impulso para avanzar hacia la señal.`;
  if (source === 'thermal')
    hint =
      'La columna te eleva y recarga el disco. Podés salir hacia la próxima señal cuando tengas altura.';
  else if (p.contact === 'water')
    hint = `${move}: tomá velocidad flotando. ${jump}: relanzate; luego ${disc} para rebotar sobre el agua.`;
  else if (p.contact === 'ground') {
    if (length(p.velocity) < 55)
      hint = `${move}: tomá impulso. No necesitás gravedad para arrancar. ${jump}: salto; ${disc}: planeo.`;
    else if (p.velocity.y > 2)
      hint = `Estás subiendo: soltá ${gravity} para conservar impulso. ${jump} y ${disc} enlazan el vuelo.`;
    else hint = `${gravity}: acelerá en la bajada. Soltalo al subir y mantené ${disc} al despegar.`;
  } else if (p.glideLocked)
    hint = `Disco agotado: ${gravity} en descenso recupera energía. Tocá suelo/agua o buscá una columna para recargar.`;
  else if (source === 'dive')
    hint = `Estás acumulando impulso: soltá ${gravity} y mantené ${disc} para convertir la caída en avance.`;
  else if (p.form === 'disc' && p.energy < 25)
    hint = `Energía baja: acercate al suelo o agua, buscá una columna, o hacé un picado con ${gravity}.`;
  else if (source === 'skim')
    hint =
      'El vuelo rasante recupera energía. Un roce con el suelo o un rebote en agua recarga el disco.';
  else if (p.form === 'disc')
    hint = `El disco conserva impulso; no tiene motor. ${gravity}: picado para ganar velocidad. Soltalo y volvé al disco.`;
  return {
    state,
    hint,
    low: p.energy < 25,
    charging: ['ground', 'water', 'thermal', 'skim', 'dive'].includes(source),
  };
}
