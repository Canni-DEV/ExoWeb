import './style.css';
import { PHYSICS, WORLD } from './config';
import type { Engine } from './render/engine';
import { FixedClock, interpolateVec } from './simulation/math';
import { clonePlayer, createPlayer, isPlayerFinite, simulate } from './simulation/player';
import { SaveStore } from './platform/save';
import { Input } from './platform/input';
import { Soundscape } from './platform/audio';
import { element, UI } from './platform/ui';
import type { PlayerState, Vec3 } from './types';

const store = new SaveStore(),
  ui = new UI(store.data.settings),
  input = new Input(element<HTMLCanvasElement>('app'), store.data.settings),
  audio = new Soundscape(),
  clock = new FixedClock();
let engine: Engine | null = null,
  player: PlayerState = createPlayer({ x: 0, y: 200, z: 0 }),
  previous = clonePlayer(player);
let playing = false,
  started = false,
  loading = false,
  failed = false,
  alive = true,
  frame = 0,
  last = performance.now();
let checkpoint = store.data.checkpoint,
  completed = store.data.completed;
const presets: Record<string, Vec3> = {
  costa: { x: 0, y: 280, z: 0 },
  pendiente: { x: -3200, y: 700, z: -6400 },
  cima: { x: -6000, y: 4200, z: -16000 },
  nube: { x: -3800, y: 2700, z: -9800 },
  cielo: { x: -5900, y: 5800, z: -14600 },
  oceano: { x: 10000, y: 80, z: -22600 },
};
let firstFrame = false,
  benchmarkFrames: number[] | null = null;
interface TestAPI {
  snapshot: () => {
    player: PlayerState;
    playing: boolean;
    loading: boolean;
    firstFrame: boolean;
    checkpoint: number;
    completed: boolean;
    adapter: string;
    memoryMiB: number;
    origin: Vec3;
    frames: number[];
  };
  visit: (scene: string) => Promise<void>;
  sample: (x: number, z: number) => number;
  seamError: () => number;
  beginBenchmark: () => void;
}
declare global {
  interface Window {
    __EXOWEB_TEST__?: TestAPI;
  }
}

function fatal(error: unknown) {
  if (failed) return;
  failed = true;
  playing = false;
  input.active = false;
  input.clear();
  audio.pause();
  ui.error(error);
  console.error(error);
}
function persist() {
  store.write();
  if (!store.available)
    ui.notice(
      'El guardado no está disponible. Tu progreso se conserva solo mientras esta pestaña siga abierta.',
    );
}
function pause() {
  if (!started || loading || failed) return;
  if (playing) {
    playing = false;
    input.active = false;
    input.clear();
    clock.reset();
    audio.pause();
    document.exitPointerLock();
    element('pause-screen').hidden = false;
    element('resume').focus();
  } else if (element('pause-screen').hidden === false) resume();
}
function resume() {
  if (loading || failed) return;
  ui.close();
  element('pause-screen').hidden = true;
  element('finish').hidden = true;
  element('menu').hidden = true;
  element('hud').hidden = false;
  playing = true;
  started = true;
  input.active = true;
  clock.reset();
  last = performance.now();
  engine?.invalidate();
  void audio
    .start()
    .catch(() => ui.notice('El audio no está disponible. Podés seguir jugando sin sonido.'));
}
async function spawn(position?: Vec3) {
  if (!engine) return;
  loading = true;
  playing = false;
  input.active = false;
  input.clear();
  clock.reset();
  element('streaming').hidden = false;
  const cp = WORLD.checkpoints[checkpoint],
    p = position ?? { x: cp.x, y: 0, z: cp.z };
  await engine.stream.warm(p);
  const surface = Math.max(
    engine.stream.surface(p.x, p.z).height,
    engine.stream.water(p.x, p.z, 0).height,
  );
  player = createPlayer({
    x: p.x,
    y: position ? Math.max(p.y, surface + PHYSICS.radius) : surface + PHYSICS.radius + 0.1,
    z: p.z,
  });
  previous = clonePlayer(player);
  input.yaw = 0;
  input.pitch = 0.15;
  engine.resetCamera(player.position, input.yaw);
  loading = false;
  element('streaming').hidden = true;
}
async function start(fresh: boolean) {
  if (loading || failed) return;
  void audio.start().catch(() => {});
  if (fresh) {
    checkpoint = 0;
    completed = false;
    store.data.checkpoint = 0;
    store.data.completed = false;
    persist();
  }
  element('menu').hidden = true;
  await spawn();
  resume();
}
ui.onSettings = () => {
  persist();
  engine?.invalidate();
};
ui.onRemap = (action) => input.remap(action);
ui.onCancelRemap = () => input.cancelRemap();
input.onBinding = () => {
  ui.refreshBindings();
  persist();
};
input.onPause = pause;
input.onNotice = (text) => ui.notice(text);
element('begin').onclick = () => void start(true).catch(fatal);
element('continue').onclick = () => void start(false).catch(fatal);
element('pause').onclick = pause;
element('resume').onclick = resume;
element('explore').onclick = resume;
element('respawn').onclick = () => {
  element('pause-screen').hidden = true;
  void spawn().then(resume).catch(fatal);
};
element('return-menu').onclick = () => {
  playing = false;
  started = false;
  input.active = false;
  input.clear();
  audio.pause();
  element('pause-screen').hidden = true;
  element('hud').hidden = true;
  element('menu').hidden = false;
  ui.ready(checkpoint > 0);
};
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  fatal(event.reason);
});

function tick(now: number) {
  if (!alive || failed) return;
  frame = requestAnimationFrame(tick);
  const rawDt = (now - last) / 1000,
    dt = Math.min(rawDt, 0.1);
  last = now;
  if (!engine || loading) return;
  try {
    const controls = input.poll(dt);
    if (!isPlayerFinite(player)) {
      ui.notice('Recuperando la nave desde la última señal estable.');
      void spawn()
        .then(() => {
          if (started) resume();
        })
        .catch(fatal);
      return;
    }
    engine.stream.requestAround(player.position, player.velocity);
    if (engine.stream.error) throw engine.stream.error;
    let alpha = 1;
    if (playing) {
      if (controls.reset) {
        void spawn().then(resume).catch(fatal);
        return;
      }
      alpha = clock.advance(dt, (step) => {
        if (!engine!.stream.canStep(player.position, player.velocity, step)) {
          element('streaming').hidden = false;
          return false;
        }
        element('streaming').hidden = true;
        previous = clonePlayer(player);
        const events = simulate(player, controls, engine!.stream, step);
        input.consumeJump();
        controls.jump = false;
        audio.events(events);
        if (events.invalid) {
          ui.notice('Regresando a la última señal estable.');
          void spawn().then(resume).catch(fatal);
          return false;
        }
        if (!completed) {
          const next = WORLD.checkpoints[Math.min(checkpoint + 1, 4)];
          if (Math.hypot(player.position.x - next.x, player.position.z - next.z) < next.radius) {
            checkpoint = next.id;
            completed = checkpoint === 4;
            store.data.checkpoint = checkpoint;
            store.data.completed = completed;
            persist();
            if (store.available) ui.notice(`${next.name} · progreso guardado`);
            if (completed) {
              playing = false;
              input.active = false;
              input.clear();
              audio.pause();
              document.exitPointerLock();
              element('finish').hidden = false;
              element('explore').focus();
              return false;
            }
          }
        }
      });
      audio.update(player, store.data.settings, checkpoint);
    } else if (!started) {
      player.time += dt;
      previous = clonePlayer(player);
    }
    const renderPlayer = {
      ...player,
      position: interpolateVec(previous.position, player.position, alpha),
      velocity: interpolateVec(previous.velocity, player.velocity, alpha),
    };
    engine.render(
      {
        player: renderPlayer,
        cameraYaw: input.yaw,
        cameraPitch: input.pitch,
        checkpoint,
        completed,
        dt: rawDt,
      },
      store.data.settings,
      playing || Boolean(benchmarkFrames),
    );
    firstFrame = true;
    if (benchmarkFrames) benchmarkFrames.push(rawDt * 1000);
    ui.update(player, checkpoint, completed, input.yaw);
    // Read-only diagnostic snapshot, useful for reproducible browser acceptance checks.
    document.body.dataset.state = playing ? 'playing' : started ? 'paused' : 'menu';
    if (new URLSearchParams(location.search).has('diagnostics'))
      element('diagnostics').hidden = false;
  } catch (error) {
    fatal(error);
  }
}

async function boot() {
  if (!store.available)
    ui.notice('No se puede guardar en este navegador. El viaje continuará en memoria.');
  const { Engine } = await import('./render/engine');
  engine = await Engine.create(element<HTMLCanvasElement>('app'));
  engine.onLost = fatal;
  engine.onStats = (d) => ui.stats(d);
  element('loading').textContent = 'Trazando el relieve y las señales…';
  await engine.initialize();
  const params = new URLSearchParams(location.search),
    preset = presets[params.get('scene') ?? ''];
  await spawn(preset ?? { x: 0, y: 275, z: 0 });
  ui.ready(checkpoint > 0);
  last = performance.now();
  frame = requestAnimationFrame(tick);
  if (preset) {
    element('menu').hidden = true;
    element('hud').hidden = false;
    ui.update(player, checkpoint, completed, input.yaw);
  }
  if (params.has('test'))
    window.__EXOWEB_TEST__ = {
      snapshot: () => ({
        player: clonePlayer(player),
        playing,
        loading,
        firstFrame,
        checkpoint,
        completed,
        adapter: engine!.adapterDescription,
        memoryMiB: engine!.memoryBytes / 1048576,
        origin: {
          x: engine!.uniforms.origin.value.x,
          y: engine!.uniforms.origin.value.y,
          z: engine!.uniforms.origin.value.z,
        },
        frames: benchmarkFrames ?? [],
      }),
      visit: async (name) => {
        if (!presets[name]) throw new Error('Escena desconocida');
        firstFrame = false;
        await spawn(presets[name]);
        started = false;
        element('menu').hidden = true;
        element('hud').hidden = false;
      },
      sample: (x, z) => engine!.stream.surface(x, z).height,
      seamError: () => engine!.stream.seamError,
      beginBenchmark: () => {
        benchmarkFrames = [];
      },
    };
}
void boot().catch(fatal);
window.addEventListener(
  'pagehide',
  () => {
    alive = false;
    cancelAnimationFrame(frame);
    input.dispose();
    audio.dispose();
    engine?.dispose();
  },
  { once: true },
);
