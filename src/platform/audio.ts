import type { PlayerState, Settings } from '../types';
import type { PhysicsEvents } from '../simulation/player';
import { clamp, length, smooth } from '../simulation/math';
export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private wind: GainNode | null = null;
  private roll: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voices: GainNode[] = [];
  private oscillators: OscillatorNode[] = [];
  private noise: AudioBuffer | null = null;
  private lastThunder = 0;
  private active = false;
  async start() {
    if (!this.context) {
      const c = new AudioContext();
      this.context = c;
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      this.effects = c.createGain();
      this.music = c.createGain();
      this.effects.connect(this.master);
      this.music.connect(this.master);
      const noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate),
        data = noise.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * 0.03) / 1.025;
        data[i] = previous * 3;
      }
      this.noise = noise;
      const source = c.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      this.filter = c.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 400;
      this.wind = c.createGain();
      this.wind.gain.value = 0;
      source.connect(this.filter);
      this.filter.connect(this.wind);
      this.wind.connect(this.effects);
      source.start();
      const rolling = c.createBufferSource();
      rolling.buffer = noise;
      rolling.loop = true;
      rolling.playbackRate.value = 0.45;
      const rollFilter = c.createBiquadFilter();
      rollFilter.type = 'lowpass';
      rollFilter.frequency.value = 140;
      this.roll = c.createGain();
      this.roll.gain.value = 0;
      rolling.connect(rollFilter);
      rollFilter.connect(this.roll);
      this.roll.connect(this.effects);
      rolling.start();
      for (const [i, hz] of [55, 82.4069, 110, 146.832, 164.814, 220].entries()) {
        const oscillator = c.createOscillator(),
          gain = c.createGain();
        oscillator.type = i % 2 ? 'sine' : 'triangle';
        oscillator.frequency.value = hz;
        oscillator.detune.value = i % 2 ? 4 : -4;
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(this.music);
        oscillator.start();
        this.voices.push(gain);
        this.oscillators.push(oscillator);
      }
    }
    this.active = true;
    await this.context.resume();
    this.master!.gain.setTargetAtTime(0.7, this.context.currentTime, 0.3);
  }
  pause() {
    this.active = false;
    if (this.context) this.master!.gain.setTargetAtTime(0, this.context.currentTime, 0.1);
  }
  update(p: PlayerState, s: Settings, stage: number) {
    const c = this.context;
    if (!c || !this.active) return;
    const t = c.currentTime,
      speed = length(p.velocity),
      storm = smooth(1000, 14000, p.position.x) * smooth(10000, 19000, -p.position.z);
    this.effects!.gain.setTargetAtTime(s.effects, t, 0.1);
    this.music!.gain.setTargetAtTime(s.music, t, 0.1);
    this.wind!.gain.setTargetAtTime(0.04 + clamp(speed / 300, 0, 1) * 0.9 + storm * 0.2, t, 0.25);
    this.filter!.frequency.setTargetAtTime(250 + speed * 9, t, 0.25);
    this.roll!.gain.setTargetAtTime(
      p.contact === 'ground' ? clamp(speed / 90, 0, 0.55) : p.contact === 'water' ? 0.15 : 0,
      t,
      0.1,
    );
    const root = [55, 61.735, 65.406, 49, 73.416][stage] ?? 55;
    const intervals = [1, 1.5, 2, 8 / 3, 3, 4];
    this.voices.forEach((voice, i) => {
      this.oscillators[i].frequency.setTargetAtTime(root * intervals[i], t, 5);
      voice.gain.setTargetAtTime(
        (0.025 + 0.012 * Math.sin(t * (0.027 + i * 0.006) + i)) *
          (0.6 + clamp(p.position.y / 4000, 0, 1) * 0.5) *
          (i < 3 ? 1 : 0.35 + smooth(20, 250, speed) * 0.65),
        t,
        1,
      );
    });
    if (storm > 0.3 && t - this.lastThunder > 18) {
      this.burst(0.25 * storm, 2.5, 70);
      this.lastThunder = t;
    }
  }
  events(e: PhysicsEvents) {
    if (!this.active) return;
    if (e.impact > 12) this.burst(Math.min(0.3, e.impact / 200), 0.2, 180);
    if (e.splash) this.burst(0.25, 0.7, 900);
    if (e.sonic) this.burst(0.45, 1.2, 90);
    if (e.transformed) this.tone();
  }
  private burst(volume: number, duration: number, frequency: number) {
    const c = this.context;
    if (!c || !this.noise) return;
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects!);
    source.start();
    source.stop(c.currentTime + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  private tone() {
    const c = this.context;
    if (!c) return;
    const osc = c.createOscillator(),
      gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.24);
    gain.gain.setValueAtTime(0.055, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.effects!);
    osc.start();
    osc.stop(c.currentTime + 0.3);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  dispose() {
    this.active = false;
    void this.context?.close();
    this.context = null;
  }
}
