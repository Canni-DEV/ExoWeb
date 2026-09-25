import type { PlayerState, VisualEvent } from '../types';
import type { PhysicsEvents } from './player';

/** Step events are accumulated until one render consumes them, including multi-step frames. */
export class VisualEvents {
  private nextId = 1;
  private pending: VisualEvent[] = [];
  push(events: PhysicsEvents, player: PlayerState) {
    const emit = (kind: VisualEvent['kind'], strength: number) => {
      if (this.pending.length >= 64) return;
      this.pending.push({
        id: this.nextId++,
        kind,
        strength,
        time: player.time,
        position: { ...player.position },
        velocity: { ...player.velocity },
      });
    };
    if (events.splash) emit('splash', Math.max(8, events.impact));
    else if (events.impact > 3) emit('impact', events.impact);
    if (events.transformed) emit('transform', 1);
    if (events.sonic) emit('sonic', 1);
  }
  drain() {
    const events = this.pending;
    this.pending = [];
    return events;
  }
  clear() {
    this.pending = [];
  }
}
