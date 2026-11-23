import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';
import {GamepadControls} from '../src/input.js';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor() {
    this.listeners = new Map(); this.captures = new Set(); this.style = {}; this.dataset = {};
    this.attributes = {}; this.hidden = false; this.firstElementChild = {style: {}};
    const classes = new Set();
    this.classList = {
      contains: name => classes.has(name), remove: name => classes.delete(name),
      toggle(name, enabled = !classes.has(name)) { if (enabled) classes.add(name); else classes.delete(name); }
    };
    this.context = new Proxy({}, {get: (target, key) => target[key] ?? (() => {})});
  }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  dispatch(type, properties = {}) {
    const event = {target: this, currentTarget: this, repeat: false, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...properties};
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
  getContext() { return this.context; }
  getBoundingClientRect() { return {width: 640, height: 400}; }
  setAttribute(key, value) { this.attributes[key] = value; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { if (this.captures.delete(id)) this.dispatch('lostpointercapture', {pointerId: id}); }
  focus() {} append() {} replaceChildren() {}
}

/** Run the production app and game with only DOM, renderer and audio boundaries mocked. */
async function browser({coarse = false, touchPoints = 0} = {}) {
  const h = {pads: [], now: 0, audio: null, game: null, frames: [], events: [], errors: []};
  const elements = new Map([...html.matchAll(/<[a-z]+\b[^>]*\bid="([^"]+)"[^>]*>/gi)].map(match => {
    const element = new Element(); element.hidden = /\bhidden\b/.test(match[0]); return [match[1], element];
  }));
  h.get = id => elements.get(id);
  const document = h.document = new Element(), window = h.window = new Element();
  document.body = new Element(); document.pointerLockElement = null;
  document.getElementById = h.get; document.createElement = () => new Element();
  h.lock = target => { document.pointerLockElement = target; document.dispatch('pointerlockchange'); };
  document.exitPointerLock = () => { if (document.pointerLockElement) h.lock(null); };
  h.get('world').requestPointerLock = () => { h.events.push('pointer-lock'); h.lock(h.get('world')); return Promise.resolve(); };
  const skill = h.get('skill'); skill.options = [{value: '1'}, {value: '2'}, {value: '3'}]; skill.selectedIndex = 1;
  Object.defineProperty(skill, 'value', {get: () => skill.options[skill.selectedIndex].value});
  class ObservedGame extends DoomGame {
    constructor(...args) { super(...args); this.inputs = []; h.game = this; }
    update(dt, input) { this.inputs.push({...input}); super.update(dt, input); }
  }
  class Audio {
    constructor() { h.audio = this; this.unlocked = false; this.context = {state: 'suspended'}; this.calls = 0; this.pending = []; this.musicPaused = true; }
    unlock() {
      this.calls++; h.events.push('audio-request');
      return new Promise(resolve => this.pending.push(success => {
        this.unlocked = success; this.context.state = success ? 'running' : 'suspended';
        h.events.push('audio-settled'); resolve(success);
      }));
    }
    settle(success = true) { for (const resolve of this.pending.splice(0)) resolve(success); }
    play() {} setEnabled() {} stopMusic() { this.musicPaused = true; }
    startMusic() { this.musicPaused = false; }
    resumeMusic() { this.musicPaused = false; }
    pauseMusic() { this.musicPaused = true; }
  }
  class Renderer { constructor() { this.stats = {}; } resize() {} draw() {} }
  h.navigator = {maxTouchPoints: touchPoints, getGamepads: () => h.pads};
  const context = vm.createContext({
    document, window, ProceduralResources, DoomGame: ObservedGame, GamepadControls, ProceduralAudio: Audio, FerroDoomRenderer: Renderer,
    navigator: h.navigator,
    matchMedia: () => ({matches: coarse}), performance: {now: () => h.now},
    ImageData: class {}, console: {error: error => h.errors.push(error)},
    requestAnimationFrame: callback => h.frames.push(callback),
    fetch: () => { throw new Error('The procedural game must boot without requesting any asset.'); }
  });
  // Keep every production handler intact; replace module wiring and await boot only.
  vm.runInContext(appSource.replace(/^import[^\n]*\n/gm, '').replace(/boot\(\);\s*$/, 'globalThis.appReady = boot();'), context);
  await context.appReady;
  assert.deepEqual(h.errors, []);
  h.frame = () => {
    const frame = h.frames.shift(); assert.ok(frame, 'the application keeps scheduling frames');
    frame(h.now += 1000 / 60); assert.deepEqual(h.errors, []);
    return h.game.inputs.at(-1);
  };
  h.pointer = (id, type, properties = {}) => {
    const element = h.get(id), event = {pointerType: 'touch', ...properties};
    if (type === 'pointerdown' || type === 'pointerup') document.dispatch(type, {target: element, ...event});
    element.dispatch(type, event);
  };
  h.click = (id, pointerType = 'mouse') => {
    h.pointer(id, 'pointerdown', {pointerType}); h.pointer(id, 'pointerup', {pointerType}); h.get(id).dispatch('click');
  };
  h.key = (code, repeat = false) => document.dispatch('keydown', {code, repeat});
  h.playing = () => document.body.classList.contains('playing');
  return h;
}

function controller(pressed = []) {
  return {connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({length: 16}, (_, i) => ({pressed: pressed.includes(i)}))};
}

test('DOM mouse start on a touch-capable PC locks before audio settles and preserves walk/run', async () => {
  const h = await browser({touchPoints: 10});
  h.click('start');
  assert.equal(h.playing(), true);
  assert.equal(h.document.body.classList.contains('touch'), false);
  assert.equal(h.document.pointerLockElement, h.get('world'));
  assert.ok(h.events.includes('pointer-lock')); assert.equal(h.events.includes('audio-settled'), false);
  h.frame(); h.key('KeyW');
  assert.equal(h.frame().forward, 1); assert.equal(h.game.inputs.at(-1).run, false);
  h.key('ShiftLeft'); assert.equal(h.frame().run, true);
  h.document.dispatch('mousemove', {movementX: 10, movementY: 0});
  assert.ok(h.frame().turn < 0);
  h.lock(null); assert.equal(h.get('pause').hidden, false);
  h.audio.settle(); await flush();
  assert.equal(h.audio.musicPaused, true, 'late audio completion must preserve the pause');
});

test('DOM Escape repeats, pointer loss and focus loss pause once and release captured inputs', async () => {
  const h = await browser({coarse: true, touchPoints: 5});
  h.click('start', 'touch'); h.frame();
  h.pointer('movePad', 'pointerdown', {pointerId: 1});
  h.pointer('movePad', 'pointermove', {pointerId: 1, clientY: -30});
  h.pointer('touchFire', 'pointerdown', {pointerId: 2});
  assert.equal(h.frame().fire, true);
  h.key('Digit1'); // Pause before the next simulation frame consumes this request.
  h.key('Escape'); h.key('Escape', true); h.key('Escape', true);
  assert.equal(h.get('pause').hidden, false); assert.equal(h.playing(), false);
  assert.equal(h.get('movePad').captures.size, 0); assert.equal(h.get('touchFire').captures.size, 0);
  h.pointer('movePad', 'pointermove', {pointerId: 1, clientY: -40});
  h.click('resume', 'touch'); h.frame();
  assert.equal(h.frame().forward, 0); assert.equal(h.game.inputs.at(-1).fire, false);
  assert.equal(h.game.inputs.at(-1).weapon, null);
  assert.equal(h.game.player.weapon, 'pistol', 'a pending weapon change cannot cross pause/resume');
  h.pointer('world', 'pointerdown', {pointerType: 'mouse'}); h.get('world').dispatch('mousedown');
  assert.equal(h.document.pointerLockElement, h.get('world'));
  h.lock(null); h.lock(null);
  assert.equal(h.get('pause').hidden, false, 'duplicate unlocked events cannot resume the game');
  h.click('resume'); h.frame(); h.key('KeyW'); h.get('world').dispatch('mousedown');
  h.window.dispatch('blur'); assert.equal(h.playing(), false);
  h.click('resume'); h.frame();
  assert.equal(h.frame().forward, 0); assert.equal(h.game.inputs.at(-1).fire, false);
});

test('DOM touch move, look and fire track separate fingers and handle cancellation', async () => {
  const h = await browser({coarse: true, touchPoints: 5});
  h.click('start', 'touch'); h.frame();
  h.pointer('movePad', 'pointerdown', {pointerId: 1});
  h.pointer('movePad', 'pointermove', {pointerId: 1, clientY: -40});
  h.pointer('lookPad', 'pointerdown', {pointerId: 2});
  h.pointer('lookPad', 'pointerdown', {pointerId: 9});
  h.pointer('lookPad', 'pointerup', {pointerId: 9});
  h.pointer('touchFire', 'pointerdown', {pointerId: 3});
  h.pointer('touchFire', 'pointerdown', {pointerId: 8});
  h.pointer('touchFire', 'pointerup', {pointerId: 8});
  h.pointer('lookPad', 'pointermove', {pointerId: 2, clientX: 20});
  let input = h.frame();
  assert.equal(input.forward, 1); assert.equal(input.run, true); assert.equal(input.fire, true); assert.ok(input.turn < 0);
  h.pointer('touchFire', 'pointercancel', {pointerId: 3});
  h.pointer('lookPad', 'pointercancel', {pointerId: 2});
  h.pointer('lookPad', 'pointermove', {pointerId: 2, clientX: 40});
  input = h.frame(); assert.equal(input.forward, 1); assert.equal(input.fire, false); assert.equal(input.turn, 0);
  h.get('movePad').releasePointerCapture(1);
  input = h.frame(); assert.equal(input.forward, 0); assert.equal(input.run, false);
  assert.equal(h.get('movePad').firstElementChild.style.transform, '');
});

test('DOM difficulty stays within its options and denied gamepad access preserves keyboard play', async () => {
  const h = await browser(), selector = h.get('skill');
  const press = button => {
    h.pads = [controller()]; h.frame();
    h.pads = [controller([button])]; h.frame();
  };
  press(13); assert.equal(selector.selectedIndex, selector.options.length - 1);
  press(13); assert.equal(selector.selectedIndex, selector.options.length - 1, 'a fresh down edge cannot exceed the maximum');
  press(12); assert.equal(selector.selectedIndex, 1);
  press(12); assert.equal(selector.selectedIndex, 0);
  press(12); assert.equal(selector.selectedIndex, 0, 'a fresh up edge cannot pass the minimum');
  h.navigator.getGamepads = () => { throw new Error('Gamepad API denied by browser policy'); };
  h.frame(); h.click('start'); h.frame(); h.key('KeyW');
  assert.equal(h.frame().forward, 1);
  assert.equal(h.playing(), true);
  assert.equal(h.get('error').hidden, true, 'gamepad denial must not show the fatal error screen');
});

test('DOM first keyboard or touch gesture enables audio after gamepad start without duplicate resumes', async () => {
  for (const gesture of ['keyboard', 'touch']) {
    const h = await browser({touchPoints: 5});
    h.pads = [controller([0])]; h.frame();
    assert.equal(h.playing(), true); assert.equal(h.audio.calls, 0, 'gamepad polling cannot unlock browser audio');
    h.pads = [controller()]; h.frame();
    h.key('Escape'); h.key('Escape', true); h.key('Escape'); h.frame();
    assert.equal(h.audio.calls, 0, 'Escape resumes play without claiming browser activation');
    const activate = () => {
      if (gesture === 'keyboard') h.key('KeyW');
      else {
        const calls = h.audio.calls;
        h.pointer('movePad', 'pointerdown', {pointerId: 1});
        assert.equal(h.audio.calls, calls, 'touch activation waits for release');
        h.pointer('movePad', 'pointerup', {pointerId: 1});
      }
    };
    activate();
    assert.equal(h.audio.calls, 1, `${gesture} requests audio synchronously`);
    h.key('KeyW', true); h.key('KeyD');
    h.pointer('touchUse', 'pointerdown', {pointerId: 2}); h.pointer('touchUse', 'pointerup', {pointerId: 2});
    h.pointer('world', 'pointerdown', {pointerType: 'mouse'}); h.get('world').dispatch('mousedown');
    assert.equal(h.audio.calls, 1, 'one pending audio request is shared by later gestures');
    h.frame(); h.frame(); assert.equal(h.playing(), true, 'pending audio never blocks simulation');
    h.audio.settle(false); await flush();
    activate(); assert.equal(h.audio.calls, 2, 'a refused unlock can be retried by a fresh gesture');
    h.audio.settle(); await flush();
    h.key('KeyD'); h.pointer('touchUse', 'pointerdown', {pointerId: 3}); h.pointer('touchUse', 'pointerup', {pointerId: 3});
    assert.equal(h.audio.calls, 2, 'running audio does not need another resume');
  }
});
