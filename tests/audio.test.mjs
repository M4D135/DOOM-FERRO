import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Wad} from '../src/wad.js';
import {DoomAudio, parseMus} from '../src/audio.js';

const wad = new Wad(readFileSync(new URL('../assets/doom1.wad', import.meta.url)));
function score(events, instruments = []) {
  const start = 16 + instruments.length * 2;
  const bytes = Buffer.alloc(start + events.length);
  bytes.set([77, 85, 83, 26]);
  bytes.writeUInt16LE(events.length, 4); bytes.writeUInt16LE(start, 6);
  bytes.writeUInt16LE(1, 8); bytes.writeUInt16LE(instruments.length, 12);
  instruments.forEach((number, index) => bytes.writeUInt16LE(number, 16 + index * 2));
  bytes.set(events, start);
  return bytes;
}

test('original E1M1 MUS preserves the complete 96-second score', () => {
  const music = parseMus(wad.get('D_E1M1'));
  assert.equal(music.ticksPerSecond, 140);
  assert.equal(music.ticks, 13440);
  assert.equal(music.duration, 96);
  assert.equal(music.events.length, 5826);
  assert.equal(music.notes.length, 2332);
  assert.deepEqual([...new Set(music.notes.filter(note => !note.percussion).map(note => note.program))].sort((a, b) => a - b), [29, 30, 34]);
  assert(music.notes.some(note => note.percussion));
  assert(music.notes.every(note => note.duration >= 0 && note.end <= music.duration));
  assert(music.events.every((event, index) => index === 0 || event.time >= music.events[index - 1].time));
  assert.equal(music.events.at(-1).type, 'end');
});

test('MUS velocity inheritance is per-channel and variable time uses 140 Hz', () => {
  const music = parseMus(score([
    0x10, 60 | 128, 70, // Channel 0, note 60, explicit velocity.
    0x91, 64 | 128, 90, 0x81, 0x0c, // Channel 1, then delay 140 ticks.
    0x00, 60, 0x01, 64,
    0x90, 62, 70, // Channel 0 inherits 70, then delay 70 ticks.
    0x00, 62, 0x60
  ]));
  assert.equal(music.duration, 1.5);
  assert.deepEqual(music.notes.map(note => [note.channel, note.note, note.velocity, note.time, note.duration]), [[0, 60, 70, 0, 1], [1, 64, 90, 0, 1], [0, 62, 70, 1, 0.5]]);
});

test('program, pitch, controls and system messages are retained', () => {
  const music = parseMus(score([
    0x40, 0, 29, 0x40, 3, 99, 0x20, 192,
    0x90, 60 | 128, 100, 14,
    0x30, 11, 0x30, 14, 0x60
  ], [29]));
  assert.deepEqual(music.instruments, [29]);
  assert.equal(music.events.find(event => event.type === 'program').program, 29);
  assert.equal(music.events.find(event => event.type === 'pitch').bend, 1);
  assert.equal(music.events.find(event => event.type === 'control').value, 99);
  assert.equal(music.notes[0].program, 29);
  assert.equal(music.notes[0].duration, 0.1);
  assert.deepEqual(music.events.filter(event => event.type === 'system').map(event => event.controller), [11, 14]);
});

test('truncated, malformed and unbounded MUS event streams fail safely', () => {
  assert.throws(() => parseMus(new Uint8Array(5)), /header is truncated/);
  const badMagic = score([0x60]); badMagic[0] = 0;
  assert.throws(() => parseMus(badMagic), /invalid signature/);
  const badLength = score([0x60]); badLength.writeUInt16LE(999, 4);
  assert.throws(() => parseMus(badLength), /outside file bounds/);
  assert.throws(() => parseMus(score([0x10, 0x80])), /event stream is truncated/);
  assert.throws(() => parseMus(score([0x50, 0x60])), /unsupported event type/);
  assert.throws(() => parseMus(score([0x30, 9, 0x60])), /invalid system controller/);
  assert.throws(() => parseMus(score([0x40, 10, 1, 0x60])), /invalid controller/);
  assert.throws(() => parseMus(score([0x90, 60, 0x80, 0x80, 0x80, 0x80, 0, 0x60])), /delay is too large/);
  assert.throws(() => parseMus(score([0x10, 60])), /missing its end marker/);
});

class Parameter {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class AudioNode {
  constructor() { for (const name of ['gain', 'pan', 'frequency', 'Q', 'playbackRate', 'threshold', 'knee', 'ratio']) this[name] = new Parameter(); }
  connect() {} disconnect() {} start() {} stop() {}
}
class FakeContext {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 22050; this.destination = new AudioNode(); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return new AudioNode(); }
  createStereoPanner() { return new AudioNode(); }
  createDynamicsCompressor() { return new AudioNode(); }
  createBufferSource() { return new AudioNode(); }
  createOscillator() { return new AudioNode(); }
  createBiquadFilter() { return new AudioNode(); }
  createBuffer(channels, length, sampleRate) { const data = new Float32Array(length); return {sampleRate, length, copyToChannel(source) { data.set(source); }, getChannelData() { return data; }}; }
}

test('audio waits for unlock, caps total voices, pauses and resumes at the saved time', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeContext;
  const audio = new DoomAudio(wad);
  try {
    assert.equal(audio.play('DSPISTOL'), false);
    assert.equal(await audio.unlock(), true);
    for (let i = 0; i < 40; i++) assert(audio.play('DSPISTOL'));
    assert.equal(audio.voices.size, 24);
    assert.equal(audio.buffers.size, 1);
    audio.setEnabled(false);
    assert.equal(audio.voices.size, 0);
    assert.equal(audio.play('DSPISTOL'), false);
    assert.equal(audio.startMusic(), true);
    assert.equal(audio.running, false);
    audio.setEnabled(true);
    assert.equal(audio.running, true);
    audio.context.currentTime = 3;
    audio.pauseMusic();
    assert.equal(audio.running, false);
    assert(audio.musicOffset > 2.9 && audio.musicOffset < 3.1);
    assert.equal(audio.voices.size, 0);
    const position = audio.musicOffset;
    audio.context.currentTime = 10;
    audio.resumeMusic();
    assert.equal(audio.running, true);
    assert.equal(audio.musicOffset, position);
    assert(audio.voices.size <= 24);
    audio.stopMusic();
    assert.equal(audio.track, null);
    assert.equal(audio.running, false);
    assert.equal(audio.voices.size, 0);
  } finally {
    audio.dispose();
    if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous;
  }
});
