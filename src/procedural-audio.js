/**
 * FERRO audio generated from arithmetic, envelopes, oscillators and seeded noise.
 * No recorded samples, score file, resource reader or network request is used.
 * Legacy sound identifiers are only names for gameplay events.
 */
export const MAX_PROCEDURAL_VOICES = 24;
const TAU = Math.PI * 2;
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const modulo = (x, n) => ((x % n) + n) % n;
const midiFrequency = note => 440 * 2 ** ((note - 69) / 12);

function nameSeed(name, seed) {
  let value = (seed ^ 2166136261) >>> 0;
  for (const character of name) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value || 1;
}
function randomGenerator(seed) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

const EFFECTS = Object.freeze({
  DSPISTOL: ['pistol', .27], DSSHOTGN: ['shotgun', .67], DSPUNCH: ['punch', .22],
  DSSWING: ['swing', .24], DSCLAW: ['claw', .26], DSBAREXP: ['explosion', 1.15],
  DSFIRSHT: ['fire', .42], DSFIRXPL: ['impact', .48], DSDOROPN: ['doorOpen', .92],
  DSDORCLS: ['doorClose', .92], DSPSTART: ['liftStart', .8], DSPSTOP: ['liftStop', .3],
  DSSWTCHN: ['switch', .14], DSSWTCHX: ['switch', .14], DSNOWAY: ['blocked', .23],
  DSITEMUP: ['pickup', .28], DSWPNUP: ['weaponPickup', .45], DSGETPOW: ['weaponPickup', .45],
  DSPOSIT1: ['sight', .75], DSPOSIT2: ['sight', .79], DSPOSIT3: ['sight', .82],
  DSBGSIT1: ['growl', 1.02], DSBGSIT2: ['growl', .94], DSPOPAIN: ['pain', .36],
  DSPLPAIN: ['playerPain', .34], DSPODTH1: ['death', .9], DSPODTH2: ['death', .96],
  DSPODTH3: ['death', .87], DSBGDTH1: ['monsterDeath', 1.12], DSBGDTH2: ['monsterDeath', 1.06],
  DSPLDETH: ['playerDeath', .98], DSSLOP: ['impact', .48], DSRLAUNC: ['rocketLaunch', .62],
  PROC_KICK: ['kick', .24], PROC_SNARE: ['snare', .19], PROC_HAT: ['hat', .075]
});

/** Pure deterministic sample synthesis; reusable in tests and offline tools. */
export function synthesizeEffect(name, {sampleRate = 22050, seed = 0x4f455252} = {}) {
  name = String(name).toUpperCase();
  const specification = EFFECTS[name];
  if (!specification) return null;
  sampleRate = Math.round(clamp(finite(sampleRate, 22050), 8000, 96000));
  const [kind, duration] = specification, count = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(count), random = randomGenerator(nameSeed(name, finite(seed, 0)));
  const lowCoefficient = 1 - Math.exp(-TAU * 310 / sampleRate);
  const midCoefficient = 1 - Math.exp(-TAU * 1900 / sampleRate);
  let low = 0, middle = 0, phase = 0;
  const tone = (frequency, t) => Math.sin(TAU * frequency * t);
  const burst = (t, start, decay) => t < start ? 0 : Math.exp(-(t - start) * decay);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate, p = t / duration, white = random() * 2 - 1;
    low += lowCoefficient * (white - low); middle += midCoefficient * (white - middle);
    const high = white - middle, band = middle - low;
    let value = 0;
    if (kind === 'pistol' || kind === 'shotgun') {
      phase += TAU * (kind === 'pistol' ? 48 + 145 * Math.exp(-t * 65) : 42 + 110 * Math.exp(-t * 24)) / sampleRate;
      const decay = kind === 'pistol' ? 28 : 15;
      value = (high * 1.25 + band * 3 + Math.sin(phase) * .68) * Math.exp(-t * decay);
      value += high * .75 * Math.exp(-t * 170);
      if (kind === 'shotgun') value += (band * 2 + tone(720, t) * .12) * (burst(t, .26, 65) + burst(t, .43, 55));
    } else if (kind === 'punch' || kind === 'kick') {
      phase += TAU * (kind === 'kick' ? 43 + 120 * Math.exp(-t * 45) : 65 + 110 * Math.exp(-t * 36)) / sampleRate;
      value = Math.sin(phase) * Math.exp(-t * 19) + (kind === 'punch' ? band * 2 : high * .13) * Math.exp(-t * 50);
    } else if (kind === 'swing' || kind === 'claw') {
      const envelope = Math.sin(Math.PI * p) ** 2;
      value = (band * 3.5 + high * .3) * envelope * (kind === 'claw' ? 1 + .25 * tone(110, t) : 1);
    } else if (kind === 'explosion' || kind === 'impact') {
      phase += TAU * (26 + 75 * Math.exp(-t * 13)) / sampleRate;
      const envelope = Math.exp(-t * (kind === 'explosion' ? 4.8 : 9));
      value = (low * 5 + band * 1.2 + Math.sin(phase) * .6) * envelope;
      value += high * .8 * Math.exp(-t * 40);
      if (kind === 'explosion') value += low * 2 * (burst(t, .17, 12) + burst(t, .34, 10));
    } else if (kind === 'fire') {
      phase += TAU * (105 + 450 * (1 - p) ** 3) / sampleRate;
      value = (Math.sin(phase + .8 * tone(67, t)) * .6 + band * 1.6) * Math.sin(Math.PI * Math.min(1, p * 1.3)) * (1 - p);
    } else if (kind === 'rocketLaunch') {
      phase += TAU * (160 - 118 * Math.min(1, t / .09)) / sampleRate;
      const envelope = Math.min(1, t * 55) * Math.exp(-t * 4.2);
      const turbulence = Math.sin(TAU * 7.3 * t) * .3 + Math.sin(TAU * 13.1 * t) * .15;
      value = (band * 2.4 + high * .95 + low * 2.1) * envelope * (1 + turbulence);
      value += Math.sin(phase) * .5 * Math.exp(-t * 11);
    } else if (kind === 'doorOpen' || kind === 'doorClose' || kind === 'liftStart') {
      phase += TAU * (kind === 'doorClose' ? 68 + 25 * p : 105 - 30 * p) / sampleRate;
      const motor = Math.sin(phase) * .24 + Math.sin(phase * 2.07) * .12 + Math.sin(phase * 5.03) * .06;
      const envelope = Math.min(1, t * 18, (duration - t) * 10);
      value = (motor + band * 1.35 + low * 1.8) * envelope * (.85 + .15 * tone(19, t));
      value += (band * 1.5 + tone(150, t) * .18) * burst(t, kind === 'doorClose' ? duration - .13 : .015, 38);
    } else if (kind === 'liftStop' || kind === 'switch') {
      value = (band * 2 + tone(kind === 'switch' ? 950 : 240, t) * .4 + tone(381, t) * .2) * Math.exp(-t * (kind === 'switch' ? 48 : 23));
      if (kind === 'switch') value += high * .3 * burst(t, .055, 60);
    } else if (kind === 'blocked') {
      value = (tone(130, t) + .2 * tone(390, t)) * .45 * (burst(t, 0, 26) + burst(t, .11, 26));
    } else if (kind === 'pickup' || kind === 'weaponPickup') {
      const step = Math.min(3, Math.floor(p * 4)), frequency = 330 * 2 ** ((step * 4 + (kind === 'weaponPickup' ? -7 : 0)) / 12);
      phase += TAU * frequency / sampleRate;
      value = (Math.sin(phase) * .6 + Math.sin(phase * 2) * .15) * Math.exp(-p * 2) * (.65 + .35 * Math.sin(Math.PI * modulo(p * 4, 1)));
      if (kind === 'weaponPickup') value += band * .8 * Math.exp(-t * 28);
    } else if (kind === 'snare') {
      value = (high * .75 + band * 2 + tone(175, t) * .3) * Math.exp(-t * 24);
    } else if (kind === 'hat') {
      value = (high * .8 + tone(7930, t) * .14 + tone(5147, t) * .14) * Math.exp(-t * 64);
    } else {
      const dying = kind === 'death' || kind === 'monsterDeath' || kind === 'playerDeath';
      const hurting = kind === 'pain' || kind === 'playerPain';
      const base = kind === 'growl' || kind === 'monsterDeath' ? 45 : hurting ? 100 : 76;
      phase += TAU * base * (dying ? 1.2 - .8 * p : .8 + .25 * Math.sin(Math.PI * p)) / sampleRate;
      const rasp = Math.tanh(Math.sin(phase + .6 * Math.sin(phase * .49)) * 3);
      const formants = .28 * tone(460 - 170 * p, t) + .13 * tone(1120 - 300 * p, t);
      const envelope = Math.min(1, t * 40) * (1 - p) ** (dying ? .7 : 1.5);
      value = (rasp * .45 + formants * (.4 + .6 * Math.abs(Math.sin(phase))) + band * 1.15) * envelope;
    }
    // Soft saturation plus a short edge fade prevents clipping and DC clicks.
    const fade = clamp(Math.min(t / .0015, (count - 1 - i) / sampleRate / .012), 0, 1);
    samples[i] = Math.tanh(value * 1.25) * .88 * fade;
  }
  return {name, sampleRate, samples};
}

/** Create an original arrangement from a seed and musical rules, not a score. */
export function createMusicPattern({seed = 0x4652524f, bpm = 112, bars = 16} = {}) {
  bpm = clamp(finite(bpm, 112), 60, 180); bars = Math.round(clamp(finite(bars, 16), 4, 32));
  const random = randomGenerator(finite(seed, 0)), beat = 60 / bpm, step = beat / 4;
  const scale = [0, 1, 3, 5, 7, 8, 10], events = [];
  for (let bar = 0; bar < bars; bar++) {
    const root = 38 + (bar % 8 >= 6 ? -2 : 0), barTime = bar * 16 * step;
    events.push({time: barTime, duration: beat * 3.8, kind: 'drone', note: root + 12, velocity: .26, pan: 0});
    for (let slot = 0; slot < 16; slot++) {
      const time = barTime + slot * step;
      if (slot % 8 === 0 || (slot === 10 && bar % 2 === 1) || (slot === 15 && bar % 4 === 3))
        events.push({time, duration: .24, kind: 'kick', velocity: .9, pan: 0});
      if (slot === 4 || slot === 12) events.push({time, duration: .19, kind: 'snare', velocity: .72, pan: -.08});
      if (slot % 2 === 0 || random() > .76) events.push({time, duration: .075, kind: 'hat', velocity: slot % 4 === 0 ? .35 : .23, pan: .28});
      if ((slot * 5 + bar % 2) % 16 < 7) {
        const degree = slot === 0 || random() < .58 ? 0 : scale[1 + Math.floor(random() * 4)];
        events.push({time, duration: step * (slot % 3 === 0 ? 1.55 : .82), kind: 'bass', note: root + degree, velocity: .74, pan: -.06});
      }
      if (bar % 4 >= 2 && slot % 3 === 1 && random() > .25)
        events.push({time, duration: step * 1.7, kind: 'lead', note: root + 24 + scale[Math.floor(random() * scale.length)], velocity: .28, pan: .15});
    }
  }
  const duration = bars * 16 * step;
  for (const event of events) event.duration = Math.min(event.duration, duration - event.time);
  events.sort((a, b) => a.time - b.time);
  return {events, duration, bpm, bars, seed: finite(seed, 0), original: true};
}

/**
 * One generated episode theme, varied deterministically per level so each
 * surveyed map has its own tempo and voicing without any imported music.
 */
export function musicPatternFor(name, seed = 0x4652524f) {
  const level = /^D_E1M([1-9])$/.exec(String(name).toUpperCase())?.[1];
  if (!level) return createMusicPattern({seed});
  return createMusicPattern({
    seed: (finite(seed, 0) + Number(level) * 0x9e3779b1) >>> 0,
    bpm: 100 + Number(level) * 5,
    bars: Number(level) >= 8 ? 12 : 16
  });
}

/** Doom XY coordinates: positive pan is to the listener's right. */
export function spatialParameters(source, listener = {}) {
  if (!Number.isFinite(source?.x) || !Number.isFinite(source?.y)) return {gain: 1, pan: 0, distance: 0};
  const dx = source.x - finite(listener.x), dy = source.y - finite(listener.y);
  const dz = finite(source.z) - finite(listener.z), planar = Math.hypot(dx, dy), distance = Math.hypot(planar, dz);
  const angle = finite(listener.angle), pan = planar < 1 ? 0 : clamp((dx * Math.sin(angle) - dy * Math.cos(angle)) / planar, -.95, .95);
  const gain = distance >= 1800 ? 0 : 1 / (1 + (Math.max(0, distance - 96) / 260) ** 1.45) * clamp((1800 - distance) / 350, 0, 1);
  return {gain, pan, distance};
}

export class ProceduralAudio {
  constructor(options = {}) {
    this.seed = finite(options?.seed, 0x4652524f);
    this.enabled = true; this.unlocked = false; this.disposed = false; this.context = null;
    this.buffers = new Map(); this.voices = new Set(); this.listener = {x: 0, y: 0, z: 0, angle: 0};
    this.track = null; this.musicName = null; this.musicPaused = true; this.musicOffset = 0;
    this.musicOrigin = 0; this.eventIndex = 0; this.musicCycle = 0; this.running = false; this.timer = null;
  }

  async unlock() {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return false;
        const context = this.context = new Context({latencyHint: 'interactive'});
        this.master = context.createGain(); this.master.gain.value = this.enabled ? .72 : 0;
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -10; this.compressor.knee.value = 12; this.compressor.ratio.value = 6;
        this.master.connect(this.compressor); this.compressor.connect(context.destination);
        this.effectsBus = context.createGain(); this.effectsBus.gain.value = .85; this.effectsBus.connect(this.master);
        this.musicBus = context.createGain(); this.musicBus.gain.value = .25; this.musicBus.connect(this.master);
      }
      await this.context.resume();
      if (this.disposed) return false;
      this.unlocked = this.context.state === 'running';
      if (this.unlocked && this.enabled && this.track && !this.musicPaused) this.#beginMusic();
      return this.unlocked;
    } catch { return false; }
  }

  setEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this.enabled || this.disposed) return;
    this.enabled = enabled;
    if (this.master) this.master.gain.setTargetAtTime(enabled ? .72 : 0, this.context.currentTime, .015);
    if (!enabled) { this.#haltMusic(true); for (const voice of Array.from(this.voices)) this.#stopVoice(voice); }
    else if (this.unlocked && this.track && !this.musicPaused) this.#beginMusic();
  }

  setListener(position = {}) {
    for (const field of ['x', 'y', 'z', 'angle']) if (Number.isFinite(position[field])) this.listener[field] = position[field];
    if (!this.context || this.disposed) return;
    for (const voice of this.voices) if (!voice.music) this.#positionVoice(voice, false);
  }

  #buffer(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    // Short mono buffers are generated once; native Web Audio handles resampling.
    const sound = synthesizeEffect(name, {sampleRate: Math.min(22050, this.context.sampleRate), seed: this.seed});
    if (!sound) return null;
    const buffer = this.context.createBuffer(1, sound.samples.length, sound.sampleRate);
    buffer.copyToChannel(sound.samples, 0); this.buffers.set(name, buffer); return buffer;
  }

  play(name, {x, y, z, volume = 1, rate = 1} = {}) {
    if (!this.enabled || !this.unlocked || this.context?.state !== 'running' || this.disposed) return false;
    name = String(name).toUpperCase();
    if (!EFFECTS[name]) return false;
    const position = Number.isFinite(x) && Number.isFinite(y) ? {x, y, z: finite(z)} : null;
    volume = clamp(finite(volume, 1), 0, 1); rate = clamp(finite(rate, 1), .25, 4);
    if (volume === 0 || spatialParameters(position, this.listener).gain === 0) return false;
    try {
      const context = this.context, buffer = this.#buffer(name), source = context.createBufferSource();
      const gain = context.createGain(), filter = context.createBiquadFilter();
      const pan = context.createStereoPanner?.() || null;
      source.buffer = buffer; source.playbackRate.value = rate; filter.type = 'lowpass'; filter.Q.value = .3;
      source.connect(filter); filter.connect(gain); gain.connect(pan || this.effectsBus); if (pan) pan.connect(this.effectsBus);
      const voice = this.#registerVoice({source, nodes: [filter, gain, ...(pan ? [pan] : [])], gain, pan, filter, position, volume,
        music: false, started: context.currentTime, endsAt: context.currentTime + buffer.length / buffer.sampleRate / rate});
      this.#positionVoice(voice, true); source.start(context.currentTime); return voice;
    } catch { return false; }
  }

  #positionVoice(voice, immediate) {
    const {gain, pan, distance} = spatialParameters(voice.position, this.listener), time = this.context.currentTime;
    const set = (parameter, value) => immediate ? parameter.setValueAtTime(value, time) : parameter.setTargetAtTime(value, time, .025);
    set(voice.gain.gain, voice.volume * gain); if (voice.pan) set(voice.pan.pan, pan);
    set(voice.filter.frequency, Math.min(this.context.sampleRate * .45, 650 + 14000 / (1 + distance / 380)));
  }

  startMusic(name = 'FERRO_INDUSTRIAL') {
    if (this.disposed) return false;
    this.stopMusic(); this.track = musicPatternFor(name, this.seed); this.musicName = String(name);
    this.musicPaused = false; if (this.enabled && this.unlocked) this.#beginMusic(); return true;
  }
  pauseMusic() { this.musicPaused = true; this.#haltMusic(true); }
  resumeMusic() { if (!this.track || this.disposed) return; this.musicPaused = false; if (this.enabled && this.unlocked) this.#beginMusic(); }
  stopMusic() { this.#haltMusic(false); this.musicPaused = true; this.musicOffset = 0; this.track = null; this.musicName = null; this.eventIndex = 0; this.musicCycle = 0; }
  dispose() {
    if (this.disposed) return;
    this.stopMusic(); for (const voice of Array.from(this.voices)) this.#stopVoice(voice);
    this.buffers.clear(); this.disposed = true; this.unlocked = false;
    for (const node of [this.effectsBus, this.musicBus, this.master, this.compressor]) try { node?.disconnect(); } catch {}
    this.context?.close().catch(() => {});
  }

  #registerVoice(voice) {
    this.#pruneVoices();
    while (this.voices.size >= MAX_PROCEDURAL_VOICES)
      this.#stopVoice(Array.from(this.voices).find(item => !item.music) || this.voices.values().next().value);
    this.voices.add(voice); voice.source.onended = () => this.#removeVoice(voice); return voice;
  }
  #removeVoice(voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of [voice.source, ...voice.nodes]) try { node.disconnect(); } catch {}
  }
  #stopVoice(voice) { try { voice.source.stop(this.context?.currentTime || 0); } catch {} this.#removeVoice(voice); }
  #pruneVoices() { for (const voice of this.voices) if (voice.endsAt <= this.context.currentTime) this.#stopVoice(voice); }
  #haltMusic(preserve) {
    if (this.running && preserve && this.context && this.track) this.musicOffset = modulo(this.context.currentTime - this.musicOrigin, this.track.duration);
    if (this.timer !== null) clearInterval(this.timer); this.timer = null; this.running = false;
    for (const voice of Array.from(this.voices)) if (voice.music) this.#stopVoice(voice);
  }

  #beginMusic() {
    if (this.running || !this.track || this.musicPaused || !this.enabled || this.context?.state !== 'running' || this.disposed) return;
    const now = this.context.currentTime, offset = this.musicOffset;
    this.musicOrigin = now - offset; this.musicCycle = 0; this.eventIndex = 0; this.running = true;
    // Reconstruct notes crossing a pause; percussion seeks its generated buffer.
    while (this.eventIndex < this.track.events.length && this.track.events[this.eventIndex].time < offset - 1e-7) {
      const event = this.track.events[this.eventIndex++];
      if (event.time + event.duration > offset) this.#musicVoice(event, now, offset - event.time);
    }
    this.#pumpMusic(); this.timer = setInterval(() => this.#pumpMusic(), 25); this.timer?.unref?.();
  }

  #pumpMusic() {
    if (!this.running || !this.track || this.context.state !== 'running') return;
    this.#pruneVoices();
    const now = this.context.currentTime, track = this.track;
    let next = this.musicOrigin + this.musicCycle * track.duration + (track.events[this.eventIndex]?.time ?? track.duration);
    // After a suspended tab, skip expired beats instead of emitting a burst.
    if (next < now - .2) {
      const elapsed = Math.max(0, now - this.musicOrigin), phase = modulo(elapsed, track.duration);
      this.musicCycle = Math.floor(elapsed / track.duration); this.eventIndex = track.events.findIndex(event => event.time >= phase);
      if (this.eventIndex < 0) { this.eventIndex = 0; this.musicCycle++; }
    }
    for (let scheduled = 0; scheduled < 64; scheduled++) {
      if (this.eventIndex >= track.events.length) { this.eventIndex = 0; this.musicCycle++; }
      const event = track.events[this.eventIndex], when = this.musicOrigin + this.musicCycle * track.duration + event.time;
      if (when > now + .12) break;
      this.eventIndex++;
      if (when + event.duration > now) this.#musicVoice(event, Math.max(now, when), Math.max(0, now - when));
    }
  }

  #musicVoice(event, when, offset = 0) {
    const context = this.context, duration = event.duration - offset;
    if (duration < .003) return;
    const gain = context.createGain(), pan = context.createStereoPanner?.() || null, nodes = [gain, ...(pan ? [pan] : [])];
    gain.connect(pan || this.musicBus); if (pan) { pan.pan.value = event.pan; pan.connect(this.musicBus); }
    let source, percussion = ['kick', 'snare', 'hat'].includes(event.kind);
    if (percussion) {
      source = context.createBufferSource(); source.buffer = this.#buffer('PROC_' + event.kind.toUpperCase());
      gain.gain.setValueAtTime(event.velocity * .65, when); source.connect(gain);
    } else {
      source = context.createOscillator(); source.type = event.kind === 'bass' ? 'sawtooth' : event.kind === 'lead' ? 'square' : 'triangle';
      source.frequency.setValueAtTime(midiFrequency(event.note), when);
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = event.kind === 'bass' ? 1.1 : .4;
      filter.frequency.setValueAtTime(event.kind === 'bass' ? 950 : event.kind === 'lead' ? 2100 : 620, when);
      source.connect(filter); filter.connect(gain); nodes.push(filter);
      const level = event.velocity * (event.kind === 'drone' ? .23 : .32), attack = Math.min(duration / 4, offset > 0 ? .003 : event.kind === 'drone' ? .24 : .006);
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(level * (1 - offset / event.duration), when + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    }
    const voice = this.#registerVoice({source, nodes, music: true, started: when, endsAt: when + duration});
    if (percussion) source.start(when, offset); else source.start(when);
    source.stop(when + duration); return voice;
  }
}

// Drop-in compatibility for hosts using the previous class name.
export {ProceduralAudio as DoomAudio};
export default ProceduralAudio;
