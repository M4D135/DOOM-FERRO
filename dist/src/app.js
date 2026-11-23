import { ProceduralResources } from './procedural-resources.js?v=0.4.0-f3ce9999b077';
import { FerroDoomRenderer } from './ferro-doom-renderer.js?v=0.4.0-f3ce9999b077';
import { DoomGame } from './game.js?v=0.4.0-f3ce9999b077';
import { ProceduralAudio } from './procedural-audio.js?v=0.4.0-f3ce9999b077';
import { GamepadControls } from './input.js?v=0.4.0-f3ce9999b077';

const $ = id => document.getElementById(id);
const world = $('world'), overlay = $('overlay'), hud = $('hud');
const ctx = overlay.getContext('2d'), hctx = hud.getContext('2d');
const keys = new Set(), images = new Map(), visited = new Set();
const touch = { forward: 0, strafe: 0, fire: false, use: false, turn: 0, look: 0 };
let resources, map, game, renderer, audio;
let mode = 'title', mapOpen = false, soundEnabled = true, fpsVisible = false;
let previousTime = 0, previousHealth = 100, damage = 0, pickupFlash = 0;
let mouseTurn = 0, mouseLook = 0, requestedWeapon = null, messageUntil = 0;
let fps = 60, frames = 0, lastHud = '';
let inputKind = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
let screenRevision = 0, pointerWasLocked = false, neutralInput = false;
let audioUnlockPending = null;
const padControls = new GamepadControls();
document.body.classList.toggle('touch', inputKind === 'touch');

function controlMode(kind) {
  inputKind = kind;
  document.body.classList.toggle('touch', kind === 'touch');
}

function image(name) {
  if (images.has(name)) return images.get(name);
  const patch = resources.patch(name);
  if (!patch) return null;
  const canvas = document.createElement('canvas');
  canvas.width = patch.width; canvas.height = patch.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(patch.pixels), patch.width, patch.height), 0, 0);
  const value = { canvas, ...patch }; images.set(name, value); return value;
}

function patch(context, name, x, y, scale = 1, anchor = false) {
  const p = image(name); if (!p) return;
  context.drawImage(p.canvas, Math.round(x - (anchor ? p.leftOffset * scale : 0)), Math.round(y - (anchor ? p.topOffset * scale : 0)), Math.round(p.width * scale), Math.round(p.height * scale));
}

function message(text) {
  $('gameMessage').textContent = text; messageUntil = performance.now() + 2600;
  if (/ramass|trouv|bonus|armure|santé|cartouche|munition/i.test(text)) pickupFlash = 0.14;
}

function playSound(name, options) {
  audio?.play(name, options);
}

function unlockAudio() {
  if (!audio || !soundEnabled) return Promise.resolve(false);
  if (audio.unlocked && audio.context?.state === 'running') return Promise.resolve(true);
  // Only direct keyboard/pointer/click handlers call this. A gamepad sample is
  // not browser activation, and a rejected/pending resume must not stall play.
  if (!audioUnlockPending) {
    audioUnlockPending = audio.unlock().finally(() => { audioUnlockPending = null; });
  }
  return audioUnlockPending;
}

function clearInput() {
  keys.clear(); mouseTurn = mouseLook = 0;
  touch.forward = touch.strafe = touch.turn = touch.look = 0;
  touch.fire = touch.use = false;
  requestedWeapon = null; neutralInput = true; padControls.clear();
  const captures = [['movePad', movePointer], ['lookPad', lookPointer], ['touchFire', firePointer]];
  movePointer = lookPointer = firePointer = null; moveOrigin = lookLast = null;
  for (const [id, pointer] of captures) {
    const element = $(id);
    try { if (pointer !== null && element.hasPointerCapture?.(pointer)) element.releasePointerCapture(pointer); } catch { /* Pointer already released. */ }
  }
  $('movePad').firstElementChild.style.transform = '';
}

function screen(next) {
  mode = next; screenRevision++;
  document.body.classList.toggle('playing', next === 'playing');
  $('menu').hidden = next !== 'title'; $('pause').hidden = next !== 'paused';
  $('ending').hidden = next !== 'dead' && next !== 'complete';
  $('hud').hidden = next === 'title';
  clearInput(); lastHud = '';
  if (next !== 'playing') {
    document.exitPointerLock?.(); audio?.pauseMusic();
  }
  if (next === 'playing') audio?.resumeMusic();
}

async function capturePointer() {
  if (mode !== 'playing' || inputKind !== 'mouse' || document.pointerLockElement === world || !world.requestPointerLock) return;
  try {
    await world.requestPointerLock();
    if (mode !== 'playing' && document.pointerLockElement === world) document.exitPointerLock?.();
  } catch { if (mode === 'playing' && inputKind === 'mouse') message('Clique dans le jeu pour activer la souris.'); }
}

async function start(restart = false, activateAudio = true) {
  if (!game) return;
  if (restart || mode === 'title' || mode === 'dead' || mode === 'complete') {
    const skill = Number($('skill').value);
    // Restore the same sector objects used by the rendering adapter.
    game.restart();
    game = new DoomGame(map, { skill, onSound: playSound, onMessage: message, onComplete: complete });
    visited.clear(); previousHealth = 100; damage = pickupFlash = 0;
    audio.stopMusic();
    audio.startMusic('D_E1M1');
  }
  mapOpen = false; document.body.classList.remove('automap'); $('mapButton').setAttribute('aria-pressed', 'false');
  screen('playing'); const revision = screenRevision;
  audio.setEnabled(soundEnabled);
  const unlocked = activateAudio ? unlockAudio() : Promise.resolve(false);
  // Request capture during the user gesture, before audio's asynchronous resume.
  capturePointer(); world.focus({ preventScroll: true });
  await unlocked;
  if (mode === 'playing' && revision === screenRevision) audio.resumeMusic();
}

function pause(activateAudio = true) { if (mode === 'playing') screen('paused'); else if (mode === 'paused') start(false, activateAudio); }

function complete() {
  const stats = game.stats();
  showResults(stats, false); screen('complete');
}

function showResults(stats, dead) {
  $('endingTitle').textContent = dead ? 'VOUS ÊTES MORT' : 'HANGAR TERMINÉ';
  const minutes = Math.floor(stats.time / 60), seconds = Math.floor(stats.time % 60).toString().padStart(2, '0');
  $('results').replaceChildren();
  for (const [label, value] of [['Monstres', `${stats.kills} / ${stats.totalKills}`], ['Objets', `${stats.items} / ${stats.totalItems}`], ['Secrets', `${stats.secrets} / ${stats.totalSecrets}`], ['Temps', `${minutes}:${seconds}`]]) {
    const p = document.createElement('p'), strong = document.createElement('strong');
    p.append(label); strong.textContent = value; p.append(strong); $('results').append(p);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled; audio?.setEnabled(soundEnabled);
  for (const id of ['audioButton', 'pauseSound']) { $(id).textContent = soundEnabled ? 'SON ACTIVÉ' : 'SON COUPÉ'; $(id).setAttribute('aria-pressed', String(soundEnabled)); }
  if (soundEnabled) unlockAudio();
}

function toggleMap() {
  if (mode !== 'playing') return;
  mapOpen = !mapOpen; document.body.classList.toggle('automap', mapOpen);
  $('mapButton').setAttribute('aria-pressed', String(mapOpen));
}

function cycleWeapon() {
  if (!game || mode !== 'playing') return;
  const weapons = ['fist', 'pistol', ...(game.player.weapons.has('shotgun') ? ['shotgun'] : [])];
  requestedWeapon = weapons[(weapons.indexOf(game.player.weapon) + 1) % weapons.length];
}

function gamepad(dt) {
  let devices = [];
  try { devices = Array.from(navigator.getGamepads?.() || []); } catch { /* Sandboxed embeds may deny only the Gamepad API. */ }
  const sample = padControls.sample(devices, dt, mode);
  if (sample.active) controlMode('gamepad');
  if (sample.difficulty) {
    const selector = $('skill');
    selector.selectedIndex = Math.max(0, Math.min(selector.options.length - 1, selector.selectedIndex + sample.difficulty));
  }
  if (sample.action === 'start') start(true, false);
  else if (sample.action === 'resume') start(false, false);
  else if (sample.action === 'pause') pause(false);
  if (sample.map) toggleMap();
  if (sample.cycleWeapon) cycleWeapon();
  return sample.input;
}

function getInput(dt, pad) {
  const held = (...codes) => codes.some(code => keys.has(code)) ? 1 : 0;
  const input = {
    forward: held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown') + touch.forward + (pad?.forward || 0),
    strafe: held('KeyD') - held('KeyA') + touch.strafe + (pad?.strafe || 0),
    turn: (held('ArrowLeft') - held('ArrowRight')) * 2.5 * dt + mouseTurn + touch.turn + (pad?.turn || 0),
    look: mouseLook + touch.look + (pad?.look || 0),
    run: Boolean(held('ShiftLeft', 'ShiftRight') || pad?.run || (movePointer !== null && (touch.forward || touch.strafe))),
    fire: held('ControlLeft', 'ControlRight', 'Mouse0') || touch.fire || pad?.fire,
    use: held('KeyE', 'Space') || touch.use || pad?.use,
    weapon: requestedWeapon
  };
  mouseTurn = mouseLook = touch.turn = touch.look = 0; touch.use = false; requestedWeapon = null;
  if (neutralInput) {
    neutralInput = false;
    return { forward: 0, strafe: 0, turn: 0, look: 0, fire: false, use: false, run: false, weapon: null };
  }
  return input;
}

function resize() {
  const r = $('viewport').getBoundingClientRect();
  overlay.width = Math.max(1, Math.round(r.width)); overlay.height = Math.max(1, Math.round(r.height));
  ctx.imageSmoothingEnabled = hctx.imageSmoothingEnabled = false;
  renderer?.resize();
}

function number(value, right, y, prefix = 'STTNUM') {
  let x = right;
  for (const digit of Math.max(0, Math.round(value)).toString().split('').reverse()) {
    const p = image(prefix + digit); if (!p) continue;
    x -= p.width; hctx.drawImage(p.canvas, x, y);
  }
}

function drawHud(time) {
  if (!game || mode === 'title') return;
  const p = game.player;
  const faceLevel = Math.max(0, Math.min(4, Math.floor((100 - p.health) / 20)));
  const face = p.health <= 0 ? 'STFDEAD0' : damage > 0.2 ? `STFOUCH${faceLevel}` : `STFST${faceLevel}${Math.floor(time / 1.7) % 3}`;
  const signature = [p.ammo, p.shells, p.health, p.armor, p.weapon, face, p.weapons.size].join('|');
  if (signature === lastHud) return; lastHud = signature;
  hctx.clearRect(0, 0, 320, 32); patch(hctx, 'STBAR', 0, 0);
  if (p.weapon !== 'fist') number(p.weapon === 'shotgun' ? p.shells : p.ammo, 44, 3);
  number(p.health, 90, 3); patch(hctx, 'STTPRCNT', 90, 3);
  number(p.armor, 221, 3); patch(hctx, 'STTPRCNT', 221, 3);
  patch(hctx, image(face) ? face : 'STFST00', 143, 0, 1, true);
  for (let n = 2; n <= 7; n++) patch(hctx, `${n === 2 || (n === 3 && p.weapons.has('shotgun')) ? 'STYSNUM' : 'STGNUM'}${n}`, 111 + ((n - 2) % 3) * 12, 4 + Math.floor((n - 2) / 3) * 10);
  [p.ammo, p.shells, 0, 0].forEach((count, i) => number(count, 288, 5 + i * 6, 'STYSNUM'));
  [200, 50, 50, 300].forEach((count, i) => number(count, 314, 5 + i * 6, 'STYSNUM'));
  hud.setAttribute('aria-label', `Santé ${Math.round(p.health)} %, armure ${Math.round(p.armor)} %, ${p.ammo} balles, ${p.shells} cartouches.`);
}


function drawMap() {
  const width = overlay.width, height = overlay.height, p = game.player;
  ctx.fillStyle = '#090907f2'; ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / 2100, height / 1550), cx = width / 2, cy = height / 2;
  ctx.save(); ctx.translate(cx - p.x * scale, cy + p.y * scale); ctx.scale(scale, -scale); ctx.lineWidth = 1.25 / scale;
  for (const line of map.lines) {
    const front = map.sides[line.right]?.sector, back = map.sides[line.left]?.sector;
    if (!visited.has(front) && !visited.has(back)) continue;
    if (line.flags & 128) continue;
    const a = map.vertices[line.v1], b = map.vertices[line.v2];
    ctx.strokeStyle = line.special === 1 ? '#d6a44c' : back === undefined ? '#c64432' : map.sectors[front]?.floor !== map.sectors[back]?.floor ? '#7f572d' : '#46432e';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.strokeStyle = '#f0e4bd'; ctx.lineWidth = 2 / scale;
  ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-18, 15); ctx.lineTo(-8, 0); ctx.lineTo(-18, -15); ctx.closePath(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#c9b68a'; ctx.font = 'bold 15px monospace'; ctx.fillText('E1M1 · HANGAR', 20, height - 22);
}

function tick(timestamp) {
  const dt = Math.min(0.05, Math.max(0, (timestamp - (previousTime || timestamp)) / 1000)); previousTime = timestamp;
  const time = timestamp / 1000;
  if (dt > 0) fps += (1 / dt - fps) * 0.04;
  try {
    const pad = gamepad(dt);
    if (game && mode === 'playing') {
      audio?.setListener?.(game.player);
      const input = getInput(dt, pad);
      game.update(dt, input);
      const p = game.player, sector = map.sectorAt(p.x, p.y);
      if (sector) visited.add(sector.id);
      if (p.health < previousHealth) damage = Math.min(0.65, 0.17 + (previousHealth - p.health) / 60);
      previousHealth = p.health;
      if (p.health <= 0 && mode === 'playing') { showResults(game.stats(), true); screen('dead'); }
      damage = Math.max(0, damage - dt * 0.7); pickupFlash = Math.max(0, pickupFlash - dt);
    }
    if (game && renderer) {
      const p = game.player;
      renderer.draw({ x: p.x, y: p.y, z: p.z + (p.health <= 0 ? 12 : 41), angle: p.angle, pitch: p.pitch, fov: 70 }, { entities: game.entities, time: game.stats().time, flash: 0, damage: 0, weapon: mode === 'title' || mapOpen ? null : { kind: p.weapon, phase: game.time - game.lastShot, moving: p.moving, dead: p.health <= 0, light: (map.sectorAt(p.x, p.y)?.light ?? 192) / 255 } });
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (mode !== 'title') { if (mapOpen) drawMap(); drawHud(time); }
      $('damage').style.opacity = String(damage * 0.7);
      if (pickupFlash > 0) { ctx.fillStyle = `rgba(220,179,40,${pickupFlash * 0.45})`; ctx.fillRect(0, 0, overlay.width, overlay.height); }
      if (++frames % 20 === 0) {
        const stats = renderer.stats, sector = map.sectorAt(p.x, p.y);
        $('perf').textContent = `${Math.round(fps)} FPS · FERRO ${stats.ferroVersion}\n${stats.width || world.width} × ${stats.height || world.height} · ${stats.mapTriangles} triangles carte\n${stats.drawCalls || 0} appels · secteur ${sector?.id ?? '?'}\nPosition ${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)} · angle ${Math.round(p.angle * 180 / Math.PI)}°\n3D procédurale · ${stats.modelInstances || 0} modèles · ${stats.modelTriangles || 0} triangles objets\nDétails proche/moyen/loin ${(stats.modelLods || [0,0,0]).slice().reverse().join('/')} · ${stats.modelCulled || 0} hors champ · ${((stats.modelBytes || 0)/1048576).toFixed(1)} Mio GPU`;
        $('accessibleStatus').textContent = `${mode}. Secteur ${sector?.id}, santé ${Math.round(p.health)}, munitions ${p.ammo}.`;
        world.dataset.sector = String(sector?.id); world.dataset.triangles = String(stats.mapTriangles); world.dataset.engine = `FERRO ${stats.ferroVersion}`; world.dataset.generation = 'procedural';
      }
    }
    if (messageUntil && timestamp > messageUntil) { $('gameMessage').textContent = ''; messageUntil = 0; }
  } catch (error) { console.error(error); showError(error); return; }
  requestAnimationFrame(tick);
}

function showError(error) {
  screen('error'); $('error').hidden = false; $('errorText').textContent = error?.message || String(error);
}

$('start').addEventListener('click', () => start(true));
$('resume').addEventListener('click', () => start(false));
$('restart').addEventListener('click', () => start(true));
$('playAgain').addEventListener('click', () => start(true));
$('backMenu').addEventListener('click', () => { game.restart(); screen('title'); });
$('pauseButton').addEventListener('click', () => pause());
$('mapButton').addEventListener('click', toggleMap);
$('audioButton').addEventListener('click', toggleSound); $('pauseSound').addEventListener('click', toggleSound);
$('helpButton').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
$('fullscreenButton').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('game').requestFullscreen(); } catch { message('Utilise le mode paysage pour agrandir le jeu.'); } });

document.addEventListener('keydown', e => {
  if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat && !document.pointerLockElement) pause(false); return; }
  if (e.code === 'F3') { e.preventDefault(); if (!e.repeat) { fpsVisible = !fpsVisible; $('perf').hidden = !fpsVisible; } return; }
  if (mode !== 'playing') return;
  if (!e.repeat) unlockAudio();
  controlMode('mouse');
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat && e.code === 'Tab') toggleMap();
  if (/^Digit[123]$/.test(e.code)) requestedWeapon = Number(e.code.slice(-1));
  keys.add(e.code);
});
document.addEventListener('keyup', e => keys.delete(e.code));
document.addEventListener('pointerdown', e => {
  if (e.pointerType) controlMode(e.pointerType === 'mouse' ? 'mouse' : 'touch');
  if (mode === 'playing' && e.pointerType === 'mouse') unlockAudio();
}, true);
// Non-mouse pointers grant browser activation on release, not on pointerdown.
document.addEventListener('pointerup', e => { if (mode === 'playing' && e.pointerType && e.pointerType !== 'mouse') unlockAudio(); }, true);
world.addEventListener('mousedown', e => { if (mode === 'playing' && inputKind === 'mouse' && e.button === 0) { keys.add('Mouse0'); capturePointer(); unlockAudio(); } });
document.addEventListener('mouseup', e => { if (e.button === 0) keys.delete('Mouse0'); });
document.addEventListener('mousemove', e => { if (mode === 'playing' && document.pointerLockElement === world) { mouseTurn -= e.movementX * 0.0026; mouseLook -= e.movementY * 0.0021; } });
world.addEventListener('contextmenu', e => e.preventDefault());
world.addEventListener('wheel', e => { if (mode === 'playing') { e.preventDefault(); cycleWeapon(); } }, { passive: false });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === world, lost = pointerWasLocked && !locked;
  pointerWasLocked = locked;
  if (lost && mode === 'playing') screen('paused');
});
window.addEventListener('blur', () => { clearInput(); if (mode === 'playing') screen('paused'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') screen('paused'); });
window.addEventListener('resize', resize);

let movePointer = null, moveOrigin = null, lookPointer = null, lookLast = null, firePointer = null;
$('movePad').addEventListener('pointerdown', e => { if (mode !== 'playing' || movePointer !== null) return; controlMode('touch'); movePointer = e.pointerId; moveOrigin = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); });
$('movePad').addEventListener('pointermove', e => {
  if (e.pointerId !== movePointer) return;
  let x = e.clientX - moveOrigin.x, y = e.clientY - moveOrigin.y;
  const length = Math.hypot(x, y); if (length > 40) { x *= 40 / length; y *= 40 / length; }
  touch.strafe = x / 40; touch.forward = -y / 40; $('movePad').firstElementChild.style.transform = `translate(${x}px,${y}px)`;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('movePad').addEventListener(type, e => { if (e.pointerId === movePointer) { movePointer = null; touch.forward = touch.strafe = 0; $('movePad').firstElementChild.style.transform = ''; } });
$('lookPad').addEventListener('pointerdown', e => { if (mode !== 'playing' || lookPointer !== null) return; controlMode('touch'); lookPointer = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); });
$('lookPad').addEventListener('pointermove', e => { if (e.pointerId !== lookPointer) return; touch.turn -= (e.clientX - lookLast.x) * 0.006; touch.look -= (e.clientY - lookLast.y) * 0.004; lookLast = { x: e.clientX, y: e.clientY }; });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('lookPad').addEventListener(type, e => { if (e.pointerId === lookPointer) { lookPointer = null; lookLast = null; } });
$('touchFire').addEventListener('pointerdown', e => { if (mode !== 'playing' || firePointer !== null) return; controlMode('touch'); firePointer = e.pointerId; touch.fire = true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touchFire').addEventListener(type, e => { if (e.pointerId === firePointer) { firePointer = null; touch.fire = false; } });
$('touchUse').addEventListener('pointerdown', e => { if (mode === 'playing') touch.use = true; e.preventDefault(); });
$('touchWeapon').addEventListener('pointerdown', e => { cycleWeapon(); e.preventDefault(); });

async function boot() {
  try {
    resources = new ProceduralResources();
    map = resources.map('E1M1');
    audio = new ProceduralAudio();
    game = new DoomGame(map, { skill: 2, onSound: playSound, onMessage: message, onComplete: complete });
    renderer = new FerroDoomRenderer(world, resources, map, { maxPixels: matchMedia('(pointer: coarse)').matches ? 640 * 400 : 960 * 600, brightness: 1.2 });
    await renderer.prepareModels?.();
    const logo = image('M_DOOM'); $('doomLogo').width = logo.width; $('doomLogo').height = logo.height; $('doomLogo').getContext('2d').drawImage(logo.canvas, 0, 0);
    resize(); screen('title'); $('loading').hidden = true; $('menuActions').hidden = false;
    requestAnimationFrame(tick);
  } catch (error) { console.error(error); showError(error); }
}
boot();
