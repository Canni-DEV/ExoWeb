import { WORLD } from '../config';
import { clamp, length } from '../simulation/math';
import type { Action, Diagnostics, PlayerState, Settings } from '../types';
import { flightGuide } from './flight-guide';

export const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export const keyLabel = (key: string) =>
  key
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Left', ' izq.')
    .replace('Right', ' der.')
    .replace('Space', 'Espacio')
    .replace('Control', 'Ctrl');
const actions: Record<Action, string> = {
  forward: 'Avanzar',
  backward: 'Retroceder',
  left: 'Izquierda',
  right: 'Derecha',
  gravity: 'Gravedad',
  glide: 'Disco',
  jump: 'Saltar',
  reset: 'Reiniciar',
};
export class UI {
  onSettings: () => void = () => {};
  onRemap: (action: Action) => void = () => {};
  onCancelRemap: () => void = () => {};
  private modal: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private noticeTimer = 0;
  private lastHint = -1;
  private nearBoundary = false;
  private hintUntil = 9;
  private dismissed = false;
  constructor(readonly settings: Settings) {
    document
      .querySelectorAll<HTMLButtonElement>('[data-open]')
      .forEach((button) => (button.onclick = () => this.open(button.dataset.open!)));
    document
      .querySelectorAll<HTMLButtonElement>('[data-close]')
      .forEach((button) => (button.onclick = () => this.close()));
    element('dismiss-hint').onclick = () => {
      this.dismissed = true;
      element('tutorial').hidden = true;
    };
    element('reload').onclick = () => location.reload();
    element('error-menu').onclick = () => {
      element('error-screen').hidden = true;
      element('menu').hidden = false;
      element('hud').hidden = true;
      element('pause-screen').hidden = true;
      element<HTMLButtonElement>('begin').disabled = true;
      element('begin-label').textContent = 'WebGPU no disponible';
      element('loading').textContent = 'Podés revisar los controles y ajustes antes de reintentar.';
    };
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'F3') {
          event.preventDefault();
          element('diagnostics').hidden = !element('diagnostics').hidden;
        }
        if (event.code === 'Escape' && this.modal) {
          event.stopImmediatePropagation();
          this.close();
        }
        if (event.code === 'Tab' && this.modal) {
          const focusable = [
            ...this.modal.querySelectorAll<HTMLElement>('button,input,select,summary,a'),
          ];
          const first = focusable[0],
            last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      },
      { capture: true },
    );
    const select = element<HTMLSelectElement>('quality');
    select.value = settings.quality;
    select.onchange = () => {
      settings.quality = select.value as Settings['quality'];
      this.onSettings();
    };
    const hud = element<HTMLSelectElement>('hud-mode');
    hud.value = settings.hud;
    hud.onchange = () => {
      settings.hud = hud.value as Settings['hud'];
      this.onSettings();
    };
    for (const key of [
      'sensitivity',
      'music',
      'effects',
      'motionBlur',
      'grain',
      'bloom',
      'lens',
    ] as const) {
      const input = element<HTMLInputElement>(key);
      input.value = String(settings[key]);
      input.oninput = () => {
        settings[key] = Number(input.value);
        this.onSettings();
      };
    }
    for (const [id, key] of [
      ['invert', 'invertY'],
      ['comfort', 'comfort'],
    ] as const) {
      const input = element<HTMLInputElement>(id);
      input.checked = settings[key];
      input.onchange = () => {
        settings[key] = input.checked;
        this.onSettings();
      };
    }
    this.refreshBindings();
  }
  open(id: string) {
    this.close();
    this.previousFocus = document.activeElement as HTMLElement;
    this.modal = element(id);
    this.modal.hidden = false;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.querySelector<HTMLElement>('button')?.focus();
  }
  close() {
    if (this.modal) {
      this.onCancelRemap();
      this.refreshBindings();
      this.modal.hidden = true;
      this.modal = null;
      this.previousFocus?.focus();
    }
  }
  refreshBindings() {
    const container = element('bindings');
    container.replaceChildren();
    for (const [action, label] of Object.entries(actions) as [Action, string][]) {
      const row = document.createElement('div');
      row.className = 'binding-row';
      const span = document.createElement('span');
      span.textContent = label;
      const button = document.createElement('button');
      button.textContent = keyLabel(this.settings.bindings[action]);
      button.setAttribute('aria-label', `Cambiar ${label}`);
      button.onclick = () => {
        button.textContent = 'Pulsá una tecla';
        this.onRemap(action);
      };
      row.append(span, button);
      container.append(row);
    }
    const pad = element('gamepad-bindings');
    pad.replaceChildren();
    const labels = [
      'A / ✕',
      'B / ○',
      'X / □',
      'Y / △',
      'LB',
      'RB',
      'LT',
      'RT',
      'Select',
      'Start',
      'L3',
      'R3',
      'Arriba',
      'Abajo',
      'Izquierda',
      'Derecha',
      'Home',
    ];
    for (const [action, label] of [
      ['gravity', 'Gravedad'],
      ['glide', 'Disco'],
      ['jump', 'Salto'],
      ['pause', 'Pausa'],
    ] as const) {
      const row = document.createElement('label');
      row.textContent = label;
      const select = document.createElement('select');
      labels.forEach((name, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = name;
        select.append(option);
      });
      select.value = String(this.settings.gamepad[action]);
      select.onchange = () => {
        const previous = this.settings.gamepad[action],
          next = Number(select.value);
        for (const key of Object.keys(this.settings.gamepad) as (keyof Settings['gamepad'])[])
          if (this.settings.gamepad[key] === next) this.settings.gamepad[key] = previous;
        this.settings.gamepad[action] = next;
        this.onSettings();
        this.refreshBindings();
      };
      row.append(select);
      pad.append(row);
    }
    const table = element('control-table');
    table.replaceChildren();
    for (const [label, keyboard, controller] of [
      [
        'Movimiento',
        `${keyLabel(this.settings.bindings.forward)} ${keyLabel(this.settings.bindings.left)} ${keyLabel(this.settings.bindings.backward)} ${keyLabel(this.settings.bindings.right)}`,
        'Stick izquierdo',
      ],
      ['Cámara', 'Mouse', 'Stick derecho'],
      [
        'Gravedad',
        `${keyLabel(this.settings.bindings.gravity)} / click izq.`,
        labels[this.settings.gamepad.gravity],
      ],
      [
        'Disco',
        `${keyLabel(this.settings.bindings.glide)} / click der.`,
        labels[this.settings.gamepad.glide],
      ],
      ['Saltar', keyLabel(this.settings.bindings.jump), labels[this.settings.gamepad.jump]],
    ]) {
      const row = document.createElement('div');
      row.className = 'control-row';
      for (const text of [label, keyboard, controller]) {
        const span = document.createElement('span');
        span.textContent = text;
        row.append(span);
      }
      table.append(row);
    }
  }
  ready(hasSave: boolean) {
    element<HTMLButtonElement>('begin').disabled = false;
    element('begin-label').textContent = 'Iniciar expedición';
    element('continue').hidden = !hasSave;
    element('loading').textContent = 'Un planeta. Tu propio camino.';
    element('ready-state').textContent = 'SEÑAL RECIBIDA';
    document.body.dataset.engine = 'ready';
  }
  notice(text: string) {
    clearTimeout(this.noticeTimer);
    const notice = element('notice');
    notice.textContent = text;
    notice.hidden = false;
    this.noticeTimer = window.setTimeout(() => (notice.hidden = true), 5500);
  }
  error(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    element('error-message').textContent = message;
    element('error-detail').textContent =
      error instanceof Error ? (error.stack ?? message) : message;
    element('error-screen').hidden = false;
    element('streaming').hidden = true;
    document.body.dataset.engine = 'error';
    element('reload').focus();
  }
  update(player: PlayerState, checkpoint: number, completed: boolean, yaw: number) {
    element('hud').dataset.mode = this.settings.hud;
    element('hud').dataset.energy =
      player.form === 'disc' ||
      player.energy < 99 ||
      ['thermal', 'dive', 'skim'].includes(player.energySource)
        ? 'active'
        : 'idle';
    const nearBoundary = Math.max(Math.abs(player.position.x), Math.abs(player.position.z)) > 29500;
    if (nearBoundary && !this.nearBoundary)
      this.notice(
        'La niebla se cierra. Volvé hacia las señales; más allá regresarás al último checkpoint.',
      );
    this.nearBoundary = nearBoundary;
    const next = WORLD.checkpoints[Math.min(checkpoint + 1, 4)],
      distance = Math.hypot(next.x - player.position.x, next.z - player.position.z);
    element('speed').textContent = String(Math.round(length(player.velocity))).padStart(3, '0');
    element('altitude').textContent = `${Math.round(player.position.y).toLocaleString('es')} m`;
    element('form-label').textContent = player.form === 'disc' ? 'DISCO' : 'ESFERA';
    element('energy-fill').style.width = `${player.energy}%`;
    element('energy-label').textContent = String(Math.round(player.energy));
    const guide = flightGuide(player, this.settings);
    element('energy-state').textContent = guide.state;
    element('energy-fill').dataset.level = guide.low
      ? 'low'
      : guide.charging
        ? 'charging'
        : 'normal';
    element('tutorial-text').textContent = guide.hint;
    element('destination-label').textContent = completed
      ? 'EXPLORACIÓN LIBRE'
      : next.name.toUpperCase();
    element('distance').textContent = completed ? '∞' : `${(distance / 1000).toFixed(1)} km`;
    element('stage-number').textContent = `0${checkpoint + 1} / 05`;
    element('stage-name').textContent = WORLD.checkpoints[checkpoint].name.toUpperCase();
    const angle = Math.atan2(next.x - player.position.x, -(next.z - player.position.z)) + yaw;
    const relative = Math.atan2(Math.sin(angle), Math.cos(angle));
    element('compass').style.left = `${50 + clamp(relative / 1.2, -1, 1) * 42}%`;
    element('compass').style.opacity = completed ? '0' : '0.8';
    if (this.lastHint !== checkpoint) {
      this.lastHint = checkpoint;
      this.hintUntil = player.time + 9;
      this.dismissed = false;
    }
    element('tutorial').hidden = completed || this.dismissed || player.time > this.hintUntil;
  }
  stats(d: Diagnostics) {
    element('diagnostics').textContent =
      `WEBGPU · NÁCAR\n${d.fps.toFixed(1)} FPS · p95 ${d.p95.toFixed(1)} ms\nCPU render ${d.cpuMs.toFixed(1)} ms · GPU ${d.gpuMs === null ? 'no disponible' : d.gpuMs.toFixed(1) + ' ms'}\nResolución interna ${(d.scale * 100).toFixed(0)}%\nSectores ${d.sectors} · memoria estimada ${d.memoryMiB.toFixed(0)} MiB\n${d.x.toFixed(0)} / ${d.y.toFixed(0)} / ${d.z.toFixed(0)} m`;
  }
}
