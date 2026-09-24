import type { Action, InputFrame, Settings } from '../types';
import { clamp } from '../simulation/math';

export class Input {
  private keys = new Set<string>();
  private mouse = new Set<number>();
  private jumpQueued = false;
  private gamepadJump = false;
  private gamepadPause = false;
  private connected = false;
  private resetTime = 0;
  private controller = new AbortController();
  private capture: Action | null = null;
  active = false;
  yaw = 0;
  pitch = 0.18;
  onPause: () => void = () => {};
  onBinding: () => void = () => {};
  onNotice: (text: string) => void = () => {};
  constructor(
    private canvas: HTMLCanvasElement,
    public settings: Settings,
  ) {
    const signal = this.controller.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        if (this.capture) {
          if (event.code === 'Escape') {
            this.capture = null;
            return;
          }
          if (
            !/^(Key[A-Z]|Digit[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Arrow(Up|Down|Left|Right))$/.test(
              event.code,
            )
          )
            return;
          const previous = this.settings.bindings[this.capture];
          for (const action of Object.keys(this.settings.bindings) as Action[])
            if (this.settings.bindings[action] === event.code)
              this.settings.bindings[action] = previous;
          this.settings.bindings[this.capture] = event.code;
          this.capture = null;
          event.preventDefault();
          this.onBinding();
          return;
        }
        if (event.code === 'Escape' && this.active) {
          this.onPause();
          return;
        }
        if (!this.active) return;
        if (
          Object.values(this.settings.bindings).includes(event.code) ||
          event.code.startsWith('Arrow')
        )
          event.preventDefault();
        if (!event.repeat && event.code === this.settings.bindings.jump) this.jumpQueued = true;
        this.keys.add(event.code);
      },
      { signal },
    );
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), { signal });
    canvas.addEventListener(
      'mousedown',
      (event) => {
        if (this.active) {
          this.mouse.add(event.button);
          if (document.pointerLockElement !== canvas)
            void canvas
              .requestPointerLock()
              ?.catch(() => this.onNotice('Podés mover la cámara arrastrando sobre la escena.'));
        }
      },
      { signal },
    );
    window.addEventListener('mouseup', (event) => this.mouse.delete(event.button), { signal });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    window.addEventListener(
      'mousemove',
      (event) => {
        if (this.active && (document.pointerLockElement === canvas || this.mouse.size > 0)) {
          this.yaw -= event.movementX * 0.002 * this.settings.sensitivity;
          this.pitch = clamp(
            this.pitch +
              event.movementY *
                0.0015 *
                this.settings.sensitivity *
                (this.settings.invertY ? -1 : 1),
            -0.65,
            1.25,
          );
        }
      },
      { signal },
    );
    window.addEventListener(
      'blur',
      () => {
        this.clear();
        if (this.active) this.onPause();
      },
      { signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.clear();
          if (this.active) this.onPause();
        }
      },
      { signal },
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (!document.pointerLockElement && this.active) this.onPause();
      },
      { signal },
    );
  }
  remap(action: Action) {
    this.capture = action;
    this.clear();
  }
  cancelRemap() {
    this.capture = null;
  }
  clear() {
    this.keys.clear();
    this.mouse.clear();
    this.jumpQueued = false;
    this.resetTime = 0;
    this.gamepadJump = false;
  }
  poll(dt: number): InputFrame {
    const b = this.settings.bindings,
      pressed = (action: Action) => this.active && this.keys.has(b[action]);
    let moveX =
      Number(pressed('right') || this.keys.has('ArrowRight')) -
      Number(pressed('left') || this.keys.has('ArrowLeft'));
    let moveZ =
      Number(pressed('forward') || this.keys.has('ArrowUp')) -
      Number(pressed('backward') || this.keys.has('ArrowDown'));
    let gravity = pressed('gravity') || this.mouse.has(0),
      glide = pressed('glide') || this.mouse.has(2);
    const pad = [...navigator.getGamepads()].find((p) => p?.connected && p.mapping === 'standard');
    if (this.connected && !pad && this.active) {
      this.clear();
      this.onPause();
      this.onNotice('Mando desconectado. Podés continuar con teclado y mouse.');
    }
    this.connected = Boolean(pad);
    if (pad) {
      const dead = (v: number) =>
        Math.abs(v) > 0.15 ? (Math.sign(v) * (Math.abs(v) - 0.15)) / 0.85 : 0;
      const pause = pad.buttons[this.settings.gamepad.pause]?.pressed ?? false;
      if (pause && !this.gamepadPause) this.onPause();
      this.gamepadPause = pause;
      if (this.active) {
        moveX += dead(pad.axes[0] ?? 0);
        moveZ -= dead(pad.axes[1] ?? 0);
        this.yaw -= dead(pad.axes[2] ?? 0) * dt * 2.2 * this.settings.sensitivity;
        this.pitch = clamp(
          this.pitch +
            dead(pad.axes[3] ?? 0) *
              dt *
              1.6 *
              this.settings.sensitivity *
              (this.settings.invertY ? -1 : 1),
          -0.65,
          1.25,
        );
        gravity ||= pad.buttons[this.settings.gamepad.gravity]?.pressed ?? false;
        glide ||= pad.buttons[this.settings.gamepad.glide]?.pressed ?? false;
        const jump = pad.buttons[this.settings.gamepad.jump]?.pressed ?? false;
        if (jump && !this.gamepadJump) this.jumpQueued = true;
        this.gamepadJump = jump;
      }
    }
    this.resetTime = pressed('reset') ? this.resetTime + dt : 0;
    return {
      moveX: clamp(moveX, -1, 1),
      moveZ: clamp(moveZ, -1, 1),
      yaw: this.yaw,
      pitch: this.pitch,
      gravity,
      glide,
      jump: this.jumpQueued,
      reset: this.resetTime > 1.2,
    };
  }
  consumeJump() {
    this.jumpQueued = false;
  }
  dispose() {
    this.controller.abort();
    this.clear();
  }
}
