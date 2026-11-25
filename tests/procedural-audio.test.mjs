import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ProceduralAudio, DoomAudio, synthesizeEffect, createMusicPattern, spatialParameters, MAX_PROCEDURAL_VOICES} from '../src/procedural-audio.js';

const GAME_SOUNDS = ['DSPISTOL', 'DSSHOTGN', 'DSPUNCH', 'DSSWING', 'DSCLAW', 'DSBAREXP',
  'DSFIRSHT', 'DSFIRXPL', 'DSDOROPN', 'DSDORCLS', 'DSPSTART', 'DSPSTOP', 'DSSWTCHX',
  'DSNOWAY', 'DSITEMUP', 'DSWPNUP', 'DSPOSIT1', 'DSBGSIT1', 'DSPOPAIN', 'DSPLPAIN',
  'DSPODTH1', 'DSBGDTH1', 'DSPLDETH', 'DSRLAUNC'];
const digest = samples => createHash('sha256').update(new Uint8Array(samples.buffer)).digest('hex');

test('every gameplay sound is synthesized, finite, bounded and distinct without resources', () => {
  const hashes = new Set();
  for (const name of GAME_SOUNDS) {
    const sound = synthesizeEffect(name, {sampleRate: 22050});
    assert(sound, name); assert.equal(sound.sampleRate, 22050);
    assert(sound.samples.length >= 2000 && sound.samples.length < 30000, name);
    let energy = 0;
    for (const sample of sound.samples) { assert(Number.isFinite(sample) && Math.abs(sample) <= .881, name); energy += sample * sample; }
    assert(energy / sound.samples.length > .0005, `${name} must be audible`);
    assert.equal(Math.abs(sound.samples[0]), 0); assert.equal(Math.abs(sound.samples.at(-1)), 0);
    hashes.add(digest(sound.samples));
  }
  assert.equal(hashes.size, GAME_SOUNDS.length, 'weapons, machinery, voices and items have different timbres');
  assert.equal(synthesizeEffect('UNKNOWN_SOUND'), null);
});

test('procedural PCM is repeatable by seed and adapts duration to the sample rate', () => {
  const first = synthesizeEffect('DSBAREXP', {seed: 42, sampleRate: 22050});
  const again = synthesizeEffect('DSBAREXP', {seed: 42, sampleRate: 22050});
  const other = synthesizeEffect('DSBAREXP', {seed: 43, sampleRate: 22050});
  assert.deepEqual(first.samples, again.samples);
  assert.notEqual(digest(first.samples), digest(other.samples));
  const highRate = synthesizeEffect('DSBAREXP', {sampleRate: 48000});
  assert(Math.abs(first.samples.length / first.sampleRate - highRate.samples.length / highRate.sampleRate) < .0001);
  assert.equal(synthesizeEffect('DSPISTOL', {sampleRate: Infinity}).sampleRate, 22050);
});

test('the original generated score is deterministic, changes with its seed and contains all instruments', () => {
  const track = createMusicPattern({seed: 12});
  assert.deepEqual(track, createMusicPattern({seed: 12}));
  assert.notDeepEqual(track.events, createMusicPattern({seed: 13}).events);
  assert.deepEqual([...new Set(track.events.map(event => event.kind))].sort(), ['bass', 'drone', 'hat', 'kick', 'lead', 'snare']);
  assert.equal(track.original, true);
  assert(track.duration > 30 && track.duration < 40);
  for (const [index, event] of track.events.entries()) {
    assert(Number.isFinite(event.time) && event.time >= 0 && event.time < track.duration);
    assert(event.duration > 0 && event.velocity > 0 && event.velocity <= 1);
    assert(event.time + event.duration <= track.duration, 'a resumed loop has no hidden tail from its predecessor');
    assert(index === 0 || event.time >= track.events[index - 1].time);
  }
});

test('distance and listener heading determine stereo pan without nonfinite parameters', () => {
  const listener = {x: 0, y: 0, z: 0, angle: Math.PI / 2};
  assert.deepEqual(spatialParameters(null, listener), {gain: 1, pan: 0, distance: 0});
  assert(spatialParameters({x: 256, y: 0}, listener).pan > .9, 'east is right when facing north');
  assert(spatialParameters({x: -256, y: 0}, listener).pan < -.9, 'west is left when facing north');
  assert(Math.abs(spatialParameters({x: 0, y: 256}, listener).pan) < 1e-12);
  assert(spatialParameters({x: 256, y: 0}, {...listener, angle: -Math.PI / 2}).pan < -.9);
  const near = spatialParameters({x: 64, y: 0}, listener), far = spatialParameters({x: 900, y: 0}, listener);
  assert.equal(near.gain, 1); assert(far.gain > 0 && far.gain < .2);
  assert.equal(spatialParameters({x: 1800, y: 0}, listener).gain, 0);
  assert.equal(spatialParameters({x: NaN, y: Infinity}, listener).gain, 1);
});

class Parameter {
  constructor(value = 0) { this.value = value; this.operations = []; }
  setValueAtTime(value, time) { this.value = value; this.operations.push(['set', value, time]); }
  setTargetAtTime(value, time, constant) { this.value = value; this.operations.push(['target', value, time, constant]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.operations.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { assert(value > 0); this.value = value; this.operations.push(['exponential', value, time]); }
}
class AudioNode {
  constructor(kind) {
    this.kind = kind; this.connections = []; this.starts = []; this.stops = []; this.disconnected = false;
    for (const name of ['gain', 'pan', 'frequency', 'Q', 'playbackRate', 'threshold', 'knee', 'ratio']) this[name] = new Parameter();
  }
  connect(node) { this.connections.push(node); }
  disconnect() { this.disconnected = true; this.connections.length = 0; }
  start(...args) { this.starts.push(args); }
  stop(time) { this.stops.push(time); }
}
class FakeContext {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 22050; this.destination = new AudioNode('output'); this.nodes = []; }
  node(kind) { const node = new AudioNode(kind); this.nodes.push(node); return node; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return this.node('gain'); }
  createStereoPanner() { return this.node('panner'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createBufferSource() { return this.node('buffer'); }
  createOscillator() { return this.node('oscillator'); }
  createBiquadFilter() { return this.node('filter'); }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return {length, sampleRate, duration: length / sampleRate, copyToChannel(samples) { data.set(samples); }, getChannelData() { return data; }};
  }
}
async function withAudio(callback) {
  const previous = {context: globalThis.AudioContext, set: globalThis.setInterval, clear: globalThis.clearInterval};
  const timers = new Map(); let nextTimer = 1;
  globalThis.AudioContext = FakeContext;
  globalThis.setInterval = fn => { const id = nextTimer++; timers.set(id, fn); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  // Any accidental use of an external resource reader fails this test.
  const audio = new ProceduralAudio({sound() { throw new Error('recorded sample access'); }, get() { throw new Error('score access'); }});
  try { await callback(audio, timers); }
  finally {
    audio.dispose();
    if (previous.context === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous.context;
    globalThis.setInterval = previous.set; globalThis.clearInterval = previous.clear;
  }
}

test('autoplay waits for unlock and compatibility names never read external audio', async () => {
  assert.equal(DoomAudio, ProceduralAudio);
  await withAudio(async (audio, timers) => {
    assert.equal(audio.play('DSPISTOL'), false);
    assert.equal(audio.startMusic('D_E1M1'), true);
    assert.equal(audio.context, null); assert.equal(audio.voices.size, 0); assert.equal(timers.size, 0);
    assert.equal(await audio.unlock(), true);
    assert.equal(audio.running, true); assert.equal(timers.size, 1); assert(audio.voices.size > 0);
    assert(audio.play('DSPISTOL')); assert.equal(audio.play('NOT_A_SOUND'), false);
    const before = audio.context.nodes.length;
    assert.equal(audio.play('DSPISTOL', {x: 2000, y: 0}), false);
    assert.equal(audio.context.nodes.length, before, 'inaudible distant effects allocate no audio nodes');
  });
});

test('voice limits, cached generation and completion clean up all connected nodes', async () => {
  await withAudio(async audio => {
    await audio.unlock();
    const first = audio.play('DSPISTOL');
    for (let i = 0; i < 50; i++) assert(audio.play('DSPISTOL'));
    assert.equal(audio.voices.size, MAX_PROCEDURAL_VOICES); assert.equal(audio.buffers.size, 1);
    assert(first.source.stops.length > 0 && first.source.disconnected);
    const voice = [...audio.voices][0]; voice.source.onended();
    assert(!audio.voices.has(voice)); assert(voice.nodes.every(node => node.disconnected));
    audio.setEnabled(false); assert.equal(audio.voices.size, 0); assert.equal(audio.play('DSPISTOL'), false);
    audio.setEnabled(true); assert(audio.play('DSPISTOL'));
    audio.dispose(); assert.equal(audio.context.state, 'closed'); assert.equal(audio.voices.size, 0); assert.equal(audio.buffers.size, 0);
    assert.equal(await audio.unlock(), false); assert.equal(audio.startMusic(), false);
  });
});

test('turning and moving update active spatial sounds, while relative interface sounds stay centered', async () => {
  await withAudio(async audio => {
    await audio.unlock(); audio.setListener({x: 0, y: 0, z: 0, angle: Math.PI / 2});
    const shot = audio.play('DSPISTOL', {x: 256, y: 0, volume: .8});
    const pickup = audio.play('DSITEMUP');
    const gain = shot.gain.gain.value;
    assert(shot.pan.pan.value > .9); assert.equal(pickup.pan.pan.value, 0);
    audio.setListener({angle: -Math.PI / 2}); assert(shot.pan.pan.value < -.9);
    audio.setListener({x: -900}); assert(shot.gain.gain.value < gain / 3);
    assert.equal(pickup.gain.gain.value, 1); assert.equal(pickup.pan.pan.value, 0);
    assert.equal(shot.gain.gain.operations.at(-1)[0], 'target', 'listener motion changes parameters smoothly');
  });
});

test('music pause, mute and resume preserve elapsed position and dispose clears its scheduler', async () => {
  await withAudio(async (audio, timers) => {
    await audio.unlock(); audio.startMusic();
    const track = audio.track;
    audio.context.currentTime = 3.25; audio.pauseMusic();
    assert.equal(audio.running, false); assert.equal(timers.size, 0); assert.equal(audio.voices.size, 0);
    assert(Math.abs(audio.musicOffset - 3.25) < 1e-8);
    audio.context.currentTime = 100; audio.resumeMusic();
    assert.equal(audio.running, true); assert.equal(timers.size, 1);
    assert(Math.abs(audio.musicOrigin - 96.75) < 1e-8);
    assert(audio.voices.size > 0 && audio.voices.size <= MAX_PROCEDURAL_VOICES);
    assert([...audio.voices].every(voice => voice.started >= 100 && voice.endsAt > 100));
    audio.context.currentTime = 101; audio.setEnabled(false);
    assert(Math.abs(audio.musicOffset - 4.25) < 1e-8); assert.equal(timers.size, 0); assert.equal(audio.voices.size, 0);
    audio.context.currentTime = 200; audio.setEnabled(true);
    assert.equal(audio.track, track); assert.equal(timers.size, 1); assert(Math.abs(audio.musicOrigin - 195.75) < 1e-8);
    audio.stopMusic(); assert.equal(audio.track, null); assert.equal(audio.musicOffset, 0); assert.equal(timers.size, 0);
    audio.startMusic(); audio.dispose(); assert.equal(timers.size, 0); assert.equal(audio.running, false);
  });
});

test('the scheduler loops and skips expired beats after a long interruption', async () => {
  await withAudio(async (audio, timers) => {
    await audio.unlock(); audio.startMusic();
    const duration = audio.track.duration;
    audio.context.currentTime = duration * 5 + .34;
    for (const tick of timers.values()) tick();
    assert.equal(audio.musicCycle, 5);
    assert(audio.voices.size <= MAX_PROCEDURAL_VOICES);
    assert([...audio.voices].every(voice => voice.started >= audio.context.currentTime && voice.started <= audio.context.currentTime + .12));
    audio.context.currentTime = duration * 6 - .04;
    for (const tick of timers.values()) tick();
    assert.equal(audio.musicCycle, 6, 'lookahead schedules the beginning of the next loop');
    assert(audio.voices.size <= MAX_PROCEDURAL_VOICES);
  });
});
