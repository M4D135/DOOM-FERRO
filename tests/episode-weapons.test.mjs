import test from 'node:test';
import assert from 'node:assert/strict';
import {EPISODE_PLANS} from '../src/episode-plans.js';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';
import {modelForEntity, viewWeaponBatch} from '../src/procedural-models.js';
import {weaponMesh} from '../src/procedural-weapons.js';

const IDS = Object.keys(EPISODE_PLANS);
const resources = new ProceduralResources();
const WEAPON_TYPES = {2002: 'chaingun', 2003: 'launcher', 2005: 'chainsaw'};
const KINDS = ['pistol', 'shotgun', 'fist', 'chaingun', 'launcher', 'chainsaw'];

function level(id, skill = 3) {
  const messages = [];
  const game = new DoomGame(resources.map(id), {skill, onMessage: text => messages.push(text)});
  game.entities.forEach(entity => { if (entity.enemy) entity.removed = true; });
  return {game, messages};
}

function place(game, entity, back = 0, height = 0) {
  const angle = Math.atan2(game.player.y - entity.y, game.player.x - entity.x);
  const sector = game.map.sectorAt(entity.x, entity.y);
  Object.assign(game.player, {
    x: entity.x - Math.cos(angle) * back, y: entity.y - Math.sin(angle) * back,
    z: sector.floor, sector: sector.id, angle, pitch: 0, health: 100,
  });
  return angle;
}

test('the three missing arsenal pieces spawn as generated hardware, not as holes', () => {
  const seen = new Set();
  for (const id of IDS) {
    for (const thing of EPISODE_PLANS[id].objects) {
      if (WEAPON_TYPES[thing[3]] && !(thing[4] & 16) && (thing[4] & 4)) seen.add(thing[3]);
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), Object.keys(WEAPON_TYPES).map(Number),
    'the nine levels should place every weapon this suite covers');
  for (const id of IDS) {
    const {game} = level(id);
    for (const entity of game.entities) {
      if (!WEAPON_TYPES[entity.type]) continue;
      const mesh = modelForEntity(entity, 0.3, 2);
      assert.ok(mesh, `${id} lost its ${WEAPON_TYPES[entity.type]} (${entity.sprite})`);
      assert.ok(mesh.vertices.length > 1200 && mesh.vertices.every(Number.isFinite),
        `${id} ${WEAPON_TYPES[entity.type]} mesh is empty or non-finite`);
      const [width, depth, height] = [1, 0, 2].map(i => mesh.bounds.max[i] - mesh.bounds.min[i]);
      assert.ok(height > 8 && height < 40 && Math.max(width, depth) > 14,
        `${id} ${WEAPON_TYPES[entity.type]} is ${width}x${depth}x${height}`);
    }
  }
});

test('the six hands-on weapons all have an articulated view model', () => {
  for (const kind of KINDS) {
    const idle = weaponMesh(kind, Infinity), fired = weaponMesh(kind, 0.02);
    assert.ok(idle && fired, `${kind} has no view model`);
    assert.ok(idle.triangles > 4000, `${kind} view model is too thin: ${idle.triangles}`);
    assert.ok(fired.vertices.every(Number.isFinite), `${kind} pose is not finite`);
    assert.ok(idle.bounds.max[1] - idle.bounds.min[1] > 20, `${kind} does not point down the barrel`);
    assert.ok(viewWeaponBatch({kind, phase: 0, moving: true, light: 1}), `${kind} cannot be drawn`);
  }
  assert.equal(weaponMesh('plasma', 0), null, 'unmodelled weapons must not borrow another mesh');
});

test('picking up the arsenal arms the player and tops the matching ammo pool', () => {
  const {game, messages} = level('E1M3');
  const chaingun = game.entities.find(e => e.type === 2002 && !e.removed);
  place(game, chaingun);
  for (let i = 0; i < 6; i++) game.update(1 / 35, {});
  assert.ok(game.player.weapons.has('chaingun'), 'the chaingun was not added to the arsenal');
  assert.equal(game.player.weapon, 'chaingun', 'a new weapon must be drawn immediately');
  assert.equal(game.player.ammo, 70, 'the chaingun brings a belt of rounds with it');
  assert.ok(messages.includes('Mitrallette'), 'the chaingun must announce itself');

  const launcher = game.entities.find(e => e.type === 2003 && !e.removed);
  place(game, launcher);
  for (let i = 0; i < 6; i++) game.update(1 / 35, {});
  assert.ok(game.player.weapons.has('launcher'), 'the launcher was not added to the arsenal');
  assert.equal(game.player.rockets, 2, 'the launcher brings two rockets');

  // A second copy of an owned weapon is still worth taking: it is ammo.
  const spare = game.entities.find(e => e.type === 2003 && !e.removed);
  if (spare) {
    game.player.rockets = 40;
    place(game, spare);
    for (let i = 0; i < 6; i++) game.update(1 / 35, {});
    assert.equal(game.player.rockets, 42, 'a spare launcher must still feed the rack');
  }

  const saw = game.entities.find(e => e.type === 2005 && !e.removed);
  place(game, saw);
  for (let i = 0; i < 6; i++) game.update(1 / 35, {});
  assert.ok(game.player.weapons.has('chainsaw'), 'the chainsaw was not added to the arsenal');
});

test('the new weapons fire, eat the right ammo and hurt what they hit', () => {
  const {game} = level('E1M4');
  game.player.weapons = new Set(['fist', 'pistol', 'shotgun', 'chaingun', 'launcher', 'chainsaw']);
  Object.assign(game.player, {ammo: 200, shells: 50, rockets: 50});

  game.player.weapon = 'chaingun';
  for (let i = 0; i < 12; i++) { game._weaponCooldown = 0; game.fire(); }
  assert.equal(game.player.ammo, 188, 'the chaingun must burn one round per shot');
  game.player.ammo = 0;
  game._weaponCooldown = 0;
  assert.equal(game.fire(), false, 'an empty chaingun must click, not fire');

  game.player.weapon = 'chainsaw';
  game.player.ammo = 90;
  game._weaponCooldown = 0;
  const sawn = game.fire();
  assert.ok(sawn && sawn.weapon === 'chainsaw', 'the chainsaw must swing without ammo');
  assert.equal(game.player.ammo, 90, 'the chainsaw must not consume bullets');

  const barrel = game.entities.find(e => e.barrel && !e.removed);
  assert.ok(barrel, 'E1M4 needs a barrel to test rocket splash');
  place(game, barrel, 96);
  game.player.weapon = 'launcher';
  game._weaponCooldown = 0;
  const before = game.player.rockets;
  const shot = game.fire();
  assert.equal(game.player.rockets, before - 1, 'the launcher must spend a rocket');
  assert.equal(shot.hits, 0, 'the launcher damages through its projectile, not a hitscan');
  const rocket = game.entities.find(e => e.type === 'rocket');
  assert.ok(rocket, 'the launcher must put a missile in the world');
  assert.equal(rocket.owner, game.player, 'the missile belongs to the player');
  for (let i = 0; i < 60 && !barrel.removed; i++) game.update(1 / 35, {});
  assert.ok(barrel.removed || barrel.state === 'exploding', 'the rocket must blow the barrel apart');
});

test('weapon selection follows the original number keys and ignores unowned hardware', () => {
  const {game} = level('E1M1');
  for (const digit of [4, 5, 6]) {
    game.selectWeapon(digit);
    assert.equal(game.player.weapon, 'pistol', `slot ${digit} must be refused while unowned`);
  }
  game.player.weapons.add('launcher');
  game.selectWeapon(5);
  assert.equal(game.player.weapon, 'launcher', 'slot 5 is the launcher');
  game.selectWeapon(1);
  assert.equal(game.player.weapon, 'fist', 'slot 1 is the fist');
});
