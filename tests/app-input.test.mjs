import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GamepadControls } from '../src/input.js';

const dt = 1 / 60;
const controller = () => ({ index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) });

// Exercise the actual DOM event handlers without starting WAD, audio or WebGL.
// Imports are supplied as test doubles; only the final boot() call is omitted.
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/\nboot\(\);\s*$/, '\n');

function browser({ coarse = false, touchPoints = 5, unlock = async () => true } = {}) {
  const elements = new Map(), docEvents = new Map(), winEvents = new Map();
  let pointerRequests = 0, musicResumes = 0;
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const listeners = new Map(), classes = new Set(), captures = new Set();
    const node = {
      id, style: {}, firstElementChild: { style: {} }, hidden: false,
      classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, remove(name) { classes.delete(name); }, contains: name => classes.has(name) },
      getContext: () => ({}), setAttribute() {}, focus() {},
      addEventListener(type, callback) { listeners.set(type, callback); },
      dispatch(type, values = {}) { listeners.get(type)?.({ currentTarget: node, preventDefault() {}, ...values }); },
      requestPointerLock() { pointerRequests++; return Promise.resolve(); },
      setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id),
      options: [{ value: '1' }, { value: '2' }, { value: '3' }], selectedIndex: 1
    };
    elements.set(id, node); return node;
  }
  const pad = controller();
  const document = { body: element('body'), getElementById: element, pointerLockElement: null,
    exitPointerLock() { document.pointerLockElement = null; },
    addEventListener(type, callback) { docEvents.set(type, callback); } };
  const audio = { unlock, setEnabled() {}, resumeMusic() { musicResumes++; }, pauseMusic() {}, stopMusic() {}, startMusic() {} };
  const navigator = { maxTouchPoints: touchPoints, getGamepads: () => [pad] };
  const context = vm.createContext({ document, navigator, GamepadControls,
    matchMedia: () => ({ matches: coarse }), window: { addEventListener(type, callback) { winEvents.set(type, callback); } },
    performance: { now: () => 0 }, console, requestAnimationFrame() {}, testAudio: audio });
  vm.runInContext(app + `
    game = { player: { weapon: 'pistol', weapons: new Set(['fist', 'pistol']) } };
    audio = testAudio;
    globalThis.api = { capturePointer, getInput, gamepad, screen, start, controlMode,
      setMode: value => mode = value, mode: () => mode };
  `, context);
  return { api: context.api, element, pad, document, navigator,
    event(type, values = {}) { docEvents.get(type)?.({ preventDefault() {}, ...values }); },
    windowEvent(type) { winEvents.get(type)?.(); },
    pointerRequests: () => pointerRequests, musicResumes: () => musicResumes };
}

test('a touchscreen laptop can capture a mouse and walk; only the touch joystick auto-runs', async () => {
  const b = browser(); b.api.setMode('playing');
  await b.api.capturePointer();
  assert.equal(b.pointerRequests(), 1);
  b.event('keydown', { code: 'KeyW' });
  assert.equal(b.api.getInput(dt, null).forward, 1);
  assert.equal(b.api.getInput(dt, null).run, false);
  b.event('keyup', { code: 'KeyW' });
  b.element('movePad').dispatch('pointerdown', { pointerId: 1, clientX: 60, clientY: 60 });
  b.element('movePad').dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 20 });
  assert.equal(b.api.getInput(dt, null).run, true);
  await b.api.capturePointer();
  assert.equal(b.pointerRequests(), 1, 'touch input does not request mouse capture');
  b.element('movePad').dispatch('pointerup', { pointerId: 1 });
  assert.equal(b.api.getInput(dt, null).run, false);
  b.document.pointerLockElement = b.element('world'); b.event('pointerlockchange');
  b.document.pointerLockElement = null; b.event('pointerlockchange');
  assert.equal(b.api.mode(), 'paused', 'losing capture also pauses on touch hardware');
});

test('Escape repeat stays paused and a pause releases touch ownership and pending commands', () => {
  const b = browser({ coarse: true }); b.api.setMode('playing');
  b.event('keydown', { code: 'Digit1' });
  b.element('movePad').dispatch('pointerdown', { pointerId: 1, clientX: 60, clientY: 60 });
  b.element('movePad').dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 20 });
  b.element('touchFire').dispatch('pointerdown', { pointerId: 2 });
  b.event('keydown', { code: 'Escape', repeat: false });
  b.event('keydown', { code: 'Escape', repeat: true });
  assert.equal(b.api.mode(), 'paused');
  assert.equal(b.element('movePad').hasPointerCapture(1), false);
  assert.equal(b.element('touchFire').hasPointerCapture(2), false);
  b.api.screen('playing');
  b.element('movePad').dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 0 });
  b.api.getInput(dt, null);
  const fresh = b.api.getInput(dt, null);
  assert.equal(fresh.forward, 0); assert.equal(Boolean(fresh.fire), false); assert.equal(fresh.weapon, null);
});

test('another finger cannot steal or cancel the active look and fire controls', () => {
  const b = browser({ coarse: true }); b.api.setMode('playing');
  b.element('lookPad').dispatch('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
  b.element('lookPad').dispatch('pointerdown', { pointerId: 2, clientX: 80, clientY: 50 });
  b.element('lookPad').dispatch('pointerup', { pointerId: 2 });
  b.element('lookPad').dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 50 });
  assert.notEqual(b.api.getInput(dt, null).turn, 0);
  b.element('touchFire').dispatch('pointerdown', { pointerId: 3 });
  b.element('touchFire').dispatch('pointerup', { pointerId: 4 });
  assert.equal(b.api.getInput(dt, null).fire, true);
  b.element('touchFire').dispatch('pointerup', { pointerId: 3 });
  assert.equal(Boolean(b.api.getInput(dt, null).fire), false);
});

test('audio resume cannot delay mouse capture or undo a later pause', async () => {
  let finishAudio;
  const b = browser({ unlock: () => new Promise(resolve => { finishAudio = resolve; }) });
  b.api.setMode('paused');
  const started = b.api.start(false);
  assert.equal(b.pointerRequests(), 1, 'capture requested in the initiating gesture');
  b.api.screen('paused');
  const count = b.musicResumes(); finishAudio(true); await started;
  assert.equal(b.api.mode(), 'paused');
  assert.equal(b.musicResumes(), count, 'late audio completion does not restart music');
});

test('denied Gamepad API leaves keyboard working and title difficulty stays bounded', () => {
  const b = browser();
  b.pad.buttons[13].pressed = true;
  b.api.gamepad(dt); assert.equal(b.element('skill').selectedIndex, 2);
  b.pad.buttons[13].pressed = false; b.api.gamepad(dt);
  b.pad.buttons[13].pressed = true; b.api.gamepad(dt);
  assert.equal(b.element('skill').selectedIndex, 2);
  b.navigator.getGamepads = () => { throw new Error('Gamepad denied'); };
  b.api.setMode('playing');
  assert.doesNotThrow(() => b.api.gamepad(dt));
  b.event('keydown', { code: 'KeyW' });
  assert.equal(b.api.getInput(dt, null).forward, 1);
});
