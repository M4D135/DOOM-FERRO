/** Original Doom PCM effects + a small, dependency-free MUS sequencer.
 * MUS notes and timing are preserved. Instrument timbres are Web Audio
 * approximations, not an emulation of the original OPL sound hardware.
 * Format reference: chocolate-doom/chocolate-doom, src/mus2mid.c.
 */
const TICKS_PER_SECOND = 140;
const MAX_VOICES = 24;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const initialChannel = () => ({program: 0, volume: 100, expression: 127, pan: 64, bend: 0, sustain: false, modulation: 0, bank: 0});

/** Parse a MUS score without Web Audio. All event times/durations are seconds. */
export function parseMus(input) {
  const error = message => { throw new Error(`MUS: ${message}`); };
  if (!(input instanceof ArrayBuffer) && !ArrayBuffer.isView(input)) error('expected ArrayBuffer or typed array');
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 16) error('header is truncated');
  if (bytes[0] !== 77 || bytes[1] !== 85 || bytes[2] !== 83 || bytes[3] !== 26) error('invalid signature');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scoreLength = data.getUint16(4, true), scoreStart = data.getUint16(6, true);
  const instrumentCount = data.getUint16(12, true);
  if (scoreStart < 16 + instrumentCount * 2 || scoreStart > bytes.length || scoreLength < 1 || scoreLength > bytes.length - scoreStart) error('score or instrument table is outside file bounds');
  const instruments = Array.from({length: instrumentCount}, (_, i) => data.getUint16(16 + i * 2, true));
  const end = scoreStart + scoreLength;
  let cursor = scoreStart, ticks = 0, finished = false;
  const velocities = Array(16).fill(127), programs = Array(16).fill(0);
  const events = [], notes = [], active = new Map();
  const read = () => { if (cursor >= end) error('event stream is truncated'); return bytes[cursor++]; };
  const closeNote = (key, time) => {
    const note = active.get(key);
    if (note) { note.end = time; note.duration = Math.max(0, time - note.time); active.delete(key); }
  };
  while (cursor < end) {
    const descriptor = read(), channel = descriptor & 15, type = (descriptor >> 4) & 7;
    const time = ticks / TICKS_PER_SECOND;
    const base = {time, ticks, channel};
    if (type === 0) {
      const note = read() & 127;
      events.push({...base, type: 'noteOff', note});
      closeNote(`${channel}:${note}`, time);
    } else if (type === 1) {
      const raw = read(), note = raw & 127;
      if (raw & 128) velocities[channel] = read() & 127;
      const velocity = velocities[channel];
      const event = {...base, type: 'noteOn', note, velocity};
      events.push(event);
      closeNote(`${channel}:${note}`, time);
      const item = {...event, program: programs[channel], percussion: channel === 15, end: null, duration: null};
      notes.push(item);
      active.set(`${channel}:${note}`, item);
    } else if (type === 2) {
      const value = read();
      events.push({...base, type: 'pitch', value, bend: (value - 128) / 64});
    } else if (type === 3) {
      const controller = read();
      if (controller < 10 || controller > 14) error(`invalid system controller ${controller}`);
      events.push({...base, type: 'system', controller});
      if (controller === 10 || controller === 11) for (const key of Array.from(active.keys())) if (key.startsWith(`${channel}:`)) closeNote(key, time);
    } else if (type === 4) {
      const controller = read(), value = Math.min(127, read());
      if (controller > 9) error(`invalid controller ${controller}`);
      if (controller === 0) {
        programs[channel] = value;
        events.push({...base, type: 'program', program: value});
      } else events.push({...base, type: 'control', controller, value});
    } else if (type === 6) {
      events.push({...base, type: 'end'});
      finished = true;
      break;
    } else error(`unsupported event type ${type}`);
    if (descriptor & 128) {
      let delay = 0, parts = 0, value;
      do {
        if (++parts > 4) error('variable-length delay is too large');
        value = read();
        delay = delay * 128 + (value & 127);
      } while (value & 128);
      ticks += delay;
      if (!Number.isSafeInteger(ticks) || ticks > TICKS_PER_SECOND * 60 * 60 * 24) error('score duration is unreasonable');
    }
  }
  if (!finished) error('score is missing its end marker');
  const duration = ticks / TICKS_PER_SECOND;
  for (const key of Array.from(active.keys())) closeNote(key, duration);
  return {events, notes, duration, ticks, ticksPerSecond: TICKS_PER_SECOND, instruments, channels: data.getUint16(8, true)};
}

export class DoomAudio {
  constructor(wad) {
    this.wad = wad;
    this.enabled = true;
    this.unlocked = false;
    this.context = null;
    this.buffers = new Map();
    this.voices = new Set();
    this.activeNotes = new Map();
    this.channels = Array.from({length: 16}, initialChannel);
    this.channelNodes = [];
    this.track = null;
    this.musicName = null;
    this.musicPaused = true;
    this.musicOffset = 0;
    this.musicStart = 0;
    this.musicOrigin = 0;
    this.eventIndex = 0;
    this.timer = null;
    this.running = false;
    this.disposed = false;
  }

  /** Call directly from a click/key/touch handler to satisfy browser autoplay. */
  async unlock() {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext({latencyHint: 'interactive'});
        const context = this.context;
        this.master = context.createGain(); this.master.gain.value = 0.7;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -8; compressor.knee.value = 10; compressor.ratio.value = 8;
        this.master.connect(compressor); compressor.connect(context.destination);
        this.effectsBus = context.createGain(); this.effectsBus.gain.value = 0.65; this.effectsBus.connect(this.master);
        this.musicBus = context.createGain(); this.musicBus.gain.value = 0.2; this.musicBus.connect(this.master);
        this.channelNodes = Array.from({length: 16}, () => {
          const gain = context.createGain(), pan = context.createStereoPanner();
          gain.connect(pan); pan.connect(this.musicBus);
          return {gain, pan};
        });
        this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.7), context.sampleRate);
        const noise = this.noise.getChannelData(0);
        let state = 0x13ac;
        for (let i = 0; i < noise.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) | 0; noise[i] = (state >>> 0) / 2147483648 - 1; }
        this.#resetChannels(context.currentTime);
      }
      await this.context.resume();
      this.unlocked = this.context.state === 'running';
      if (this.unlocked && this.enabled && this.track && !this.musicPaused) this.#beginMusic();
      return this.unlocked;
    } catch { return false; }
  }

  setEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.#haltMusic(true);
      for (const voice of Array.from(this.voices)) this.#stopVoice(voice);
    } else if (this.unlocked && this.track && !this.musicPaused) this.#beginMusic();
  }

  play(name, {volume = 1, rate = 1} = {}) {
    if (!this.enabled || !this.unlocked || !this.context || this.context.state !== 'running' || this.disposed) return false;
    try {
      name = String(name).toUpperCase();
      let buffer = this.buffers.get(name);
      if (!buffer) {
        const sound = this.wad.sound(name);
        if (!sound || !sound.samples.length) return false;
        buffer = this.context.createBuffer(1, sound.samples.length, sound.sampleRate);
        buffer.copyToChannel(sound.samples, 0);
        this.buffers.set(name, buffer);
      }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = clamp(Number.isFinite(rate) ? rate : 1, 0.25, 4);
      gain.gain.value = clamp(Number.isFinite(volume) ? volume : 1, 0, 1);
      source.connect(gain); gain.connect(this.effectsBus);
      const voice = this.#registerVoice({source, nodes: [gain], music: false, started: this.context.currentTime});
      source.start();
      return voice;
    } catch { return false; }
  }

  startMusic(name = 'D_E1M1') {
    if (this.disposed) return false;
    const bytes = this.wad.get(name);
    if (!bytes) return false;
    let track;
    try { track = parseMus(bytes); } catch { return false; }
    if (track.duration <= 0) return false;
    this.stopMusic();
    this.track = track;
    this.musicName = name;
    this.musicPaused = false;
    if (this.enabled && this.unlocked) this.#beginMusic();
    return true;
  }

  pauseMusic() { this.musicPaused = true; this.#haltMusic(true); }
  resumeMusic() {
    if (!this.track || this.disposed) return;
    this.musicPaused = false;
    if (this.enabled && this.unlocked) this.#beginMusic();
  }
  stopMusic() {
    this.#haltMusic(false);
    this.musicPaused = true;
    this.musicOffset = 0;
    this.track = null;
    this.musicName = null;
    this.eventIndex = 0;
  }
  dispose() {
    this.stopMusic();
    for (const voice of Array.from(this.voices)) this.#stopVoice(voice);
    this.buffers.clear();
    this.disposed = true;
    this.unlocked = false;
    if (this.context) this.context.close().catch(() => {});
  }

  #registerVoice(voice) {
    while (this.voices.size >= MAX_VOICES) {
      // Prefer replacing an old effect; keep the music's held notes stable.
      const oldest = Array.from(this.voices).find(item => !item.music) || this.voices.values().next().value;
      this.#stopVoice(oldest);
    }
    this.voices.add(voice);
    voice.source.onended = () => this.#removeVoice(voice);
    return voice;
  }
  #removeVoice(voice) {
    if (!this.voices.delete(voice)) return;
    try { voice.source.disconnect(); } catch {}
    for (const node of voice.nodes || []) try { node.disconnect(); } catch {}
    if (voice.key && this.activeNotes.get(voice.key) === voice) this.activeNotes.delete(voice.key);
  }
  #stopVoice(voice, when = this.context?.currentTime || 0) {
    try { voice.source.stop(when); } catch {}
    this.#removeVoice(voice);
  }
  #release(voice, when) {
    if (!voice || voice.releasing || voice.percussion) return;
    voice.releasing = true;
    voice.envelope.gain.cancelScheduledValues(when);
    voice.envelope.gain.setTargetAtTime(0, when, 0.025);
    try { voice.source.stop(when + 0.16); } catch {}
    if (this.activeNotes.get(voice.key) === voice) this.activeNotes.delete(voice.key);
  }

  #resetChannels(when) {
    this.channels = Array.from({length: 16}, initialChannel);
    this.channelNodes.forEach(({gain, pan}, channel) => {
      gain.gain.cancelScheduledValues(when); pan.pan.cancelScheduledValues(when);
      gain.gain.setValueAtTime(this.channels[channel].volume / 127, when);
      pan.pan.setValueAtTime(0, when);
    });
  }
  #haltMusic(preservePosition) {
    if (this.running && preservePosition && this.context && this.track) {
      this.musicOffset = Math.max(0, this.context.currentTime - this.musicOrigin) % this.track.duration;
    }
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    for (const voice of Array.from(this.voices)) if (voice.music) this.#stopVoice(voice);
    this.activeNotes.clear();
  }
  #beginMusic() {
    if (this.running || !this.track || !this.context || this.context.state !== 'running' || !this.enabled || this.musicPaused) return;
    const now = this.context.currentTime + 0.025;
    this.#resetChannels(this.context.currentTime);
    this.musicStart = now - this.musicOffset;
    this.musicOrigin = this.musicStart;
    this.eventIndex = 0;
    const held = new Map();
    while (this.eventIndex < this.track.events.length && this.track.events[this.eventIndex].time < this.musicOffset) {
      const event = this.track.events[this.eventIndex++], key = `${event.channel}:${event.note}`;
      if (event.type === 'noteOn') held.set(key, event);
      else if (event.type === 'noteOff') held.delete(key);
      else if (event.type === 'system' && (event.controller === 10 || event.controller === 11)) {
        for (const [id, note] of held) if (note.channel === event.channel) held.delete(id);
      } else this.#dispatch(event, now, true);
    }
    for (const note of held.values()) if (note.channel !== 15) this.#noteOn(note, now);
    this.running = true;
    this.#schedule();
    this.timer = setInterval(() => this.#schedule(), 25);
  }
  #schedule() {
    if (!this.running || !this.context || this.context.state !== 'running') return;
    const next = this.track.events[this.eventIndex];
    if (next && this.musicStart + next.time < this.context.currentTime - 0.25) {
      // A suspended/background tab must not replay a burst of overdue notes.
      this.#haltMusic(true);
      this.#beginMusic();
      return;
    }
    const until = this.context.currentTime + 0.12;
    let count = 0;
    while (this.running && count++ < 2048) {
      if (this.eventIndex >= this.track.events.length) {
        const loopTime = this.musicStart + this.track.duration;
        if (loopTime > until) break;
        this.musicStart = loopTime;
        this.musicOffset = 0;
        this.eventIndex = 0;
        this.#resetChannels(Math.max(loopTime, this.context.currentTime));
      }
      const event = this.track.events[this.eventIndex];
      const when = this.musicStart + event.time;
      if (when > until) break;
      this.#dispatch(event, Math.max(when, this.context.currentTime));
      this.eventIndex++;
    }
  }

  #dispatch(event, when, stateOnly = false) {
    const channel = this.channels[event.channel], nodes = this.channelNodes[event.channel];
    if (event.type === 'noteOn') { if (!stateOnly) this.#noteOn(event, when); }
    else if (event.type === 'noteOff') {
      const voice = this.activeNotes.get(`${event.channel}:${event.note}`);
      if (voice) { voice.held = false; if (!channel.sustain) this.#release(voice, when); }
    } else if (event.type === 'program') channel.program = event.program;
    else if (event.type === 'pitch') {
      channel.bend = event.bend;
      if (!stateOnly) for (const voice of this.voices) if (voice.music && voice.channel === event.channel && !voice.percussion && !voice.releasing) voice.source.frequency.setValueAtTime(voice.baseHz * 2 ** (event.bend / 12), when);
    } else if (event.type === 'control') {
      if (event.controller === 1) channel.bank = event.value;
      else if (event.controller === 2) channel.modulation = event.value;
      else if (event.controller === 3) channel.volume = event.value;
      else if (event.controller === 4) channel.pan = event.value;
      else if (event.controller === 5) channel.expression = event.value;
      else if (event.controller === 8) {
        channel.sustain = event.value >= 64;
        if (!channel.sustain && !stateOnly) for (const voice of this.voices) if (voice.music && voice.channel === event.channel && !voice.held) this.#release(voice, when);
      }
      nodes.gain.gain.setValueAtTime(channel.volume * channel.expression / (127 * 127), when);
      nodes.pan.pan.setValueAtTime(clamp((channel.pan - 64) / 64, -1, 1), when);
    } else if (event.type === 'system') {
      if (event.controller === 10 || event.controller === 11) {
        if (!stateOnly) for (const voice of Array.from(this.voices)) if (voice.music && voice.channel === event.channel) {
          if (event.controller === 10) this.#stopVoice(voice, when); else this.#release(voice, when);
        }
      } else if (event.controller === 14) {
        Object.assign(channel, {expression: 127, bend: 0, sustain: false, modulation: 0});
        nodes.gain.gain.setValueAtTime(channel.volume / 127, when);
        if (!stateOnly) for (const voice of this.voices) if (voice.music && voice.channel === event.channel) {
          if (!voice.held) this.#release(voice, when);
          else if (!voice.percussion) voice.source.frequency.setValueAtTime(voice.baseHz, when);
        }
      }
    } else if (event.type === 'end' && !stateOnly) {
      for (const voice of Array.from(this.voices)) if (voice.music) this.#release(voice, when);
    }
  }

  #noteOn(event, when) {
    if (!event.velocity) {
      this.#release(this.activeNotes.get(`${event.channel}:${event.note}`), when);
      return;
    }
    const context = this.context, channel = this.channels[event.channel];
    const key = `${event.channel}:${event.note}`;
    this.#release(this.activeNotes.get(key), when);
    const envelope = context.createGain(), filter = context.createBiquadFilter();
    let source, duration = null;
    const percussion = event.channel === 15;
    const baseHz = 440 * 2 ** ((event.note - 69) / 12);
    let level = event.velocity / 127 * 0.24;
    if (percussion) {
      const kick = event.note === 35 || event.note === 36;
      const tom = [41, 43, 45, 47, 48, 50].includes(event.note);
      if (kick || tom) {
        source = context.createOscillator(); source.type = 'sine';
        const frequency = kick ? 145 : 120 + (event.note - 41) * 18;
        source.frequency.setValueAtTime(frequency, when);
        source.frequency.exponentialRampToValueAtTime(kick ? 42 : frequency * 0.6, when + 0.12);
        filter.type = 'lowpass'; filter.frequency.value = 900;
        duration = kick ? 0.23 : 0.25; level *= kick ? 1.9 : 1.2;
      } else {
        source = context.createBufferSource(); source.buffer = this.noise;
        const hat = [42, 44, 46].includes(event.note);
        const cymbal = [49, 51, 52, 53, 55, 57, 59].includes(event.note);
        filter.type = 'highpass'; filter.frequency.value = hat ? 6500 : cymbal ? 3500 : 1200;
        duration = event.note === 46 ? 0.28 : hat ? 0.075 : cymbal ? 0.55 : 0.16;
        level *= hat ? 0.38 : cymbal ? 0.5 : 0.82;
      }
    } else {
      source = context.createOscillator();
      const guitar = channel.program >= 24 && channel.program <= 31;
      const bass = channel.program >= 32 && channel.program <= 39;
      source.type = guitar ? 'sawtooth' : bass ? 'triangle' : channel.program >= 80 ? 'square' : 'triangle';
      source.frequency.setValueAtTime(baseHz * 2 ** (channel.bend / 12), when);
      filter.type = 'lowpass'; filter.frequency.value = bass ? 950 : guitar ? 2100 : 3000;
      filter.Q.value = guitar ? 0.7 : 0.3;
      if (bass) level *= 1.2;
    }
    source.connect(filter); filter.connect(envelope); envelope.connect(this.channelNodes[event.channel].gain);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(level, when + (percussion ? 0.002 : 0.006));
    if (duration !== null) {
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    } else envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.58), when + 0.15);
    const voice = this.#registerVoice({source, nodes: [filter, envelope], envelope, music: true, percussion, channel: event.channel, key, held: true, started: when, baseHz, releasing: false});
    this.activeNotes.set(key, voice);
    source.start(when);
    if (duration !== null) source.stop(when + duration + 0.01);
  }
}

export default DoomAudio;
