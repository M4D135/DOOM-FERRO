import test from 'node:test';
import assert from 'node:assert/strict';
import {createE1M1Map} from '../src/procedural-map.js';
import {DoomGame} from '../src/game.js';

const STEP = 1 / 70;
const turnTo = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const spawnToSecretDoor = [[1056,-3072],[1248,-2880],[1248,-2720],[1264,-2704],[1264,-2688],
  [1392,-2560],[1424,-2560],[1440,-2544],[2032,-2544],[2096,-2608],[2640,-2608],
  [2896,-2864],[2896,-3568],[3008,-3672],[3008,-3840]];
const toCourtyard = [[2672,-3840],[2400,-4016],[2128,-4016],[2112,-3712],[2112,-3584],[1824,-3280]];
const fromCourtyard = [[2112,-3584],[2112,-3712],[2128,-4016],[2400,-4016],[2672,-3840],[3008,-3840]];
const toShotgun = [[3008,-4200],[3008,-3840],[3008,-3640],[3220,-3560],[3392,-3504],
  [3432,-3584],[3440,-3856],[3264,-3936]];
const toLiftTrigger = [[3440,-3856],[3432,-3584],[3392,-3504],[3280,-3400],[3090,-3232],[2896,-2940]];
const raceToLift = [[3344,-3424],[3392,-3504],[3440,-3584],[3488,-3824],[3552,-3872]];
const alongGallery = [[3648,-3872],[3680,-3808],[3648,-3648],[3616,-3504],[3616,-3392],
  [3712,-3264],[3664,-3168],[3616,-3088],[3568,-2992],[3472,-2960],[3376,-3024],[3328,-3100]];

function setup(callbacks = {}) { return new DoomGame(createE1M1Map(), {skill: 2, ...callbacks}); }
function tick(game, seconds) { for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.update(STEP); }

/**
 * Real controls only: no position/height assignments, actor removal, health or
 * ammo grants, sector edits, private action calls, or disabled collisions.
 * A deterministic combat driver aims at visible enemies while walking/strafing.
 */
function walk(game, points, {run = false, visited = new Set()} = {}) {
  for (const [x, y] of points) {
    let frames = 0;
    while (Math.hypot(game.player.x - x, game.player.y - y) > 0.3) {
      const p = game.player, distance = Math.hypot(x - p.x, y - p.y);
      const heading = Math.atan2(y - p.y, x - p.x);
      const hit = game.raycast(p.x, p.y, p.z + 32, heading, 64);
      const use = Boolean(hit.line?.special === 1 && !game.actions.has(hit.line.back));
      const target = !use && game.entities.filter(e => e.enemy && e.alive && !e.removed
        && Math.hypot(e.x - p.x, e.y - p.y) < 900
        && game.lineOfSight(p.x, p.y, p.z + 32, e.x, e.y, e.z + e.height / 2))
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : heading;
      const amount = Math.min(1, distance / ((run ? 320 : 200) * STEP));
      game.update(STEP, {forward: Math.cos(heading - aim) * amount,
        strafe: Math.sin(aim - heading) * amount, turn: turnTo(aim, p.angle),
        fire: Boolean(target), use, run});
      visited.add(p.sector);
      assert.ok(++frames < 1400, `trapped before ${x},${y}; at ${p.x},${p.y},${p.z}, sector ${p.sector}`);
      assert.ok(p.health > 0, `died on the real route before ${x},${y}`);
    }
  }
  return visited;
}

// Only isolated mechanism tests below use local fixtures. The full journey
// above and its acceptance test never place the player inside a secret.
function place(game, actor, x, y, angle = 0, heightAboveFloor = 0) {
  const sector = game.map.sectorAt(x, y);
  Object.assign(actor, {x, y, z: sector.floor + heightAboveFloor, sector: sector.id, angle, vz: 0});
}

function cross(game, lineId, actor = game.player, reverse = false) {
  const line = game.lines[lineId], dx = line.bx - line.ax, dy = line.by - line.ay;
  const length = Math.hypot(dx, dy), sign = reverse ? -1 : 1;
  const nx = dy / length * sign, ny = -dx / length * sign;
  place(game, actor, (line.ax + line.bx) / 2 + nx * 24, (line.ay + line.by) / 2 + ny * 24);
  game.moveActor(actor, -nx * 48, -ny * 48);
}

test('all three E1M1 secrets, rewards, return routes and exit work from spawn with live combat', () => {
  const messages = [], game = setup({onMessage: message => messages.push(message)});
  const visited = new Set([game.player.sector]);
  assert.deepEqual([game.player.x, game.player.y, game.player.z], [1056,-3616,0]);
  assert.equal(game.totalSecrets, 3);
  assert.deepEqual(game.map.sectors.filter(s => s.special === 9).map(s => s.id), [68,69,70]);
  assert.equal(game.map.sectors[68].ceiling, -24, 'concealed courtyard door starts closed');
  assert.equal(game.map.sectors[59].floor, 96, 'the shotgun approach starts inaccessible');
  assert.equal(game.map.sectors[70].floor, 104, 'timed platform starts at the upper gallery');
  const originalBarrels = game.entities.filter(e => e.barrel).length;

  walk(game, spawnToSecretDoor, {visited});
  walk(game, toCourtyard, {visited});
  assert.equal(game.player.sector, 13);
  assert.equal(game.player.armorType, 2);
  assert.equal(game.player.armor, 200, 'original blue armor in the outdoor basin was collected');
  assert.ok(game.entities.find(e => e.id === 13).removed);
  assert.deepEqual([...game.visitedSecrets], [68]);
  for (const id of [67,66,65,64,63,50,49,48,77,16,17,18,19,21,23,22,5,13]) {
    assert.ok(visited.has(id), `courtyard approach traversed original sector ${id}`);
  }

  walk(game, fromCourtyard, {visited});
  assert.equal(game.player.sector, 56, 'the closed reverse face can reopen on the return journey');
  walk(game, toShotgun, {visited});
  assert.equal(game.map.sectors[59].floor, -40, 'line 308 lowered the ledge to the exact original target');
  assert.ok(game._triggered.has(308));
  assert.deepEqual([...game.visitedSecrets], [68,69]);
  assert.equal(game.player.weapon, 'shotgun');
  assert.ok(game.player.weapons.has('shotgun'));
  assert.ok(game.entities.find(e => e.id === 98).removed, 'the placed shotgun was collected');

  walk(game, toLiftTrigger, {run: true, visited});
  assert.equal(game.actions.get(70)?.kind, 'lift');
  const departure = game.time;
  walk(game, raceToLift, {run: true, visited});
  assert.ok(game.time - departure < 4, 'the original timed approach is reachable at normal run speed');
  assert.equal(game.player.sector, 70);
  assert.equal(game.map.sectors[70].floor, -48);
  assert.deepEqual([...game.visitedSecrets], [68,69,70]);
  tick(game, 2.5);
  assert.equal(game.player.z, 104, 'the player rides the platform into the upper passage');
  assert.equal(game.actions.has(70), false);
  walk(game, alongGallery, {run: true, visited});
  tick(game, 0.8);
  assert.equal(game.player.sector, 57, 'the far window returns to the zigzag room');
  assert.equal(game.player.z, -48);
  for (const id of [129,130,131,132,133,134,135,136,137]) {
    assert.ok(game.entities.find(e => e.id === id).removed, `original gallery reward ${id} was collected`);
  }
  assert.equal(messages.filter(m => m === 'Un secret a été découvert !').length, 3);
  assert.equal(game.kills, game.totalKills, 'all six original medium-skill enemies were fought normally');
  assert.equal(game.entities.filter(e => e.barrel && !e.removed).length, originalBarrels);

  walk(game, [[3220,-3360],[3008,-3568],[3008,-3840],[3008,-4200],
    [2976,-4576],[2992,-4592],[2992,-4720],[2944,-4768]], {run: true, visited});
  assert.equal(game.completed, false, 'secret discovery does not bypass the normal exit switch');
  assert.equal(game.player.sector, 82);
  game.update(STEP, {use: false});
  game.update(STEP, {turn: turnTo(Math.PI, game.player.angle), use: true});
  assert.equal(game.completed, true);
  assert.equal(game.secrets, 3);
  assert.ok(game.player.health > 0);
});

test('a secret counts once after landing, never while falling through its sector', () => {
  const game = setup();
  place(game, game.player, 3264, -3856, 0, 16);
  game.update(STEP);
  assert.ok(game.player.z > -48);
  assert.equal(game.secrets, 0);
  assert.equal(game.visitedSecrets.size, 0);
  tick(game, 0.5);
  assert.equal(game.player.z, -48);
  assert.equal(game.secrets, 1);
  tick(game, 0.5);
  assert.equal(game.secrets, 1);
  game.restart();
  assert.equal(game.secrets, 0);
  assert.equal(game.visitedSecrets.size, 0);
  assert.equal(game.totalSecrets, 3);
});

test('monsters cross the repeatable lift trigger but cannot lower the player-only secret ledge', () => {
  const game = setup(), monster = game.entities.find(e => e.enemy);
  cross(game, 195, monster);
  assert.equal(game.actions.get(70)?.kind, 'lift', 'type 88 accepts a monster crossing');
  assert.equal(game.actions.get(70)?.target, -48);
  assert.equal(game.secrets, 0, 'monsters do not discover a player secret');
  cross(game, 308, monster);
  assert.equal(game.actions.has(59), false, 'type 36 ignores monsters');
  assert.equal(game._triggered.has(308), false, 'a monster cannot consume the one-use trigger');
  game.moveActor(monster, 0, 80); // Clear the real collision radius before the player follows.
  cross(game, 308);
  assert.equal(game.actions.get(59)?.kind, 'floor');
});

test('monster door use respects the concealed face while permitting ordinary and return doors', () => {
  for (const [lineId, monsterX, playerX, y, allowed] of [
    [247,2964.1,2880,-3840,false], [248,2891.9,3008,-3840,true], [151,1515.9,1616,-2496,true]
  ]) {
    const game = setup(), monster = game.entities.find(e => e.enemy);
    place(game, monster, monsterX, y); place(game, game.player, playerX, y);
    Object.assign(monster, {awake: true, state: 'chase', attackTimer: 10, sightTimer: 10, seesPlayer: false});
    game.update(0.15);
    assert.equal(game.actions.has(game.lines[lineId].back), allowed, `door face ${lineId}`);
  }
});

test('a missed secret lift completes its cycle and can be retriggered with cues at the platform', () => {
  const sounds = [], game = setup({onSound: (name, at) => sounds.push({name, at})});
  cross(game, 195);
  tick(game, 1.2);
  assert.equal(game.map.sectors[70].floor, -48);
  assert.equal(game.actions.get(70).phase, 'wait');
  const originalAction = game.actions.get(70);
  cross(game, 195, game.player, true);
  assert.equal(game.actions.get(70), originalAction, 'crossing while active does not extend the timer');
  tick(game, 4.2);
  assert.equal(game.map.sectors[70].floor, 104);
  assert.equal(game.actions.has(70), false);
  assert.equal(game.secrets, 0, 'lowering a secret without visiting it does not count');
  cross(game, 195);
  assert.equal(game.actions.get(70)?.phase, 'down', 'missing the first cycle does not lock out the secret');
  const liftSounds = sounds.filter(s => s.name === 'DSPSTART' || s.name === 'DSPSTOP');
  assert.deepEqual(liftSounds.map(s => s.name), ['DSPSTART','DSPSTOP','DSPSTART','DSPSTOP','DSPSTART']);
  for (const sound of liftSounds) {
    assert.equal(sound.at.x, 3552);
    assert.equal(sound.at.y, -3872);
    assert.ok([-48,104].includes(sound.at.z));
  }
});

test('the courtyard door sound originates in its moving panel on either approach', () => {
  for (const [x, angle] of [[2984,Math.PI],[2872,0]]) {
    const sounds = [], game = setup({onSound: (name, at) => sounds.push({name, at})});
    place(game, game.player, x, -3840, angle);
    assert.deepEqual(game.use(), {type: 'door', sector: 68});
    assert.deepEqual(sounds[0], {name: 'DSDOROPN', at: {x: 2928, y: -3840, z: -24}});
    tick(game, 1);
    assert.equal(game.map.sectors[68].ceiling, 44, 'lowest neighbor ceiling minus four Doom units');
    assert.equal(game.map.sectors[68].ceiling - game.map.sectors[68].floor, 68);
  }
});
