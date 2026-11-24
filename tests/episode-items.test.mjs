import test from 'node:test';
import assert from 'node:assert/strict';
import {EPISODE_PLANS} from '../src/episode-plans.js';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';
import {modelForEntity} from '../src/procedural-models.js';

const IDS = Object.keys(EPISODE_PLANS);
const resources = new ProceduralResources();
const NEW_TYPES = [5, 6, 13, 8, 34, 2010, 2013, 2024, 2025, 2026, 2045, 2046];

function level(id, skill = 3) {
  const messages = [];
  const game = new DoomGame(resources.map(id), {skill, onMessage: text => messages.push(text)});
  game.entities.forEach(entity => { if (entity.enemy) entity.removed = true; });
  return {game, messages};
}

function standOn(game, entity) {
  const sector = game.map.sectorAt(entity.x, entity.y);
  Object.assign(game.player, {x: entity.x, y: entity.y, z: sector.floor, sector: sector.id, health: 100});
  for (let i = 0; i < 6; i++) game.update(1 / 35, {});
}

function find(game, type) {
  const entity = game.entities.find(candidate => candidate.type === type && !candidate.removed);
  assert.ok(entity, `no spawnable object of type ${type} in this level`);
  return entity;
}

test('every new object the nine levels place spawns with a real 3D body', () => {
  const seen = new Set();
  for (const id of IDS) {
    for (const thing of EPISODE_PLANS[id].objects) {
      // Deathmatch-only placements (flag 16) never appear in the solo episode.
      if (NEW_TYPES.includes(thing[3]) && !(thing[4] & 16) && (thing[4] & 4)) seen.add(thing[3]);
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [...NEW_TYPES].sort((a, b) => a - b),
    'the survey should place every object this suite covers');
  for (const id of IDS) {
    const {game} = level(id);
    for (const entity of game.entities) {
      if (!NEW_TYPES.includes(entity.type)) continue;
      const mesh = modelForEntity(entity, 0.3, 2);
      assert.ok(mesh, `${id} type ${entity.type} (${entity.sprite}) renders nothing`);
      assert.ok(mesh.vertices.length > 900 && mesh.vertices.every(Number.isFinite),
        `${id} type ${entity.type} mesh is empty or non-finite`);
      const height = mesh.bounds.max[2] - mesh.bounds.min[2];
      assert.ok(height > 3 && height < 60, `${id} type ${entity.type} is ${height} tall`);
      assert.equal(entity.sprite.slice(0, 4), mesh.key.split(':')[1],
        `${id} type ${entity.type} uses the wrong recipe`);
    }
  }
});

test('cards, ammo and backpacks fill the inventory they belong to', () => {
  const {game} = level('E1M6');
  for (const [type, colour] of [[5, 'blue'], [6, 'yellow'], [13, 'red']]) {
    const card = find(game, type);
    standOn(game, card);
    assert.equal(game.player.keys[colour], 1, `type ${type} did not grant the ${colour} card`);
    assert.equal(card.removed, true, `type ${type} stayed on the floor`);
  }
  const rockets = find(game, 2010);
  game.player.rockets = 0;
  standOn(game, rockets);
  assert.equal(game.player.rockets, 5, 'a rocket box must give five missiles');
  const pack = find(game, 8);
  Object.assign(game.player, {ammo: 100, shells: 10, rockets: 10});
  standOn(game, pack);
  assert.deepEqual([game.player.ammo, game.player.shells, game.player.rockets], [110, 14, 15],
    'the backpack must top up every ammo pool');
});

test('soulspheres and medikit buckets heal past the ordinary health cap', () => {
  const {game} = level('E1M3');
  const soul = find(game, 2013);
  game.player.health = 150;
  standOn(game, soul);
  assert.equal(game.player.health, 200, 'a soulsphere must be able to reach 200');
  const bucket = find(game, 2046);
  game.player.health = 150;
  standOn(game, bucket);
  assert.equal(game.player.health, 200, 'the medikit bucket must reach 200');
  const stim = game.entities.find(entity => entity.type === 2011 && !entity.removed);
  if (stim) {
    game.player.health = 100;
    standOn(game, stim);
    assert.equal(game.player.health, 100, 'a stimpack must not push past 100');
  }
});

test('berserk, the radiation suit and the survey gear change how the level plays', () => {
  const {game, messages} = level('E1M5');
  const fist = find(game, 2024);
  game.player.weapon = 'pistol';
  standOn(game, fist);
  assert.equal(game.player.berserk, true, 'the berserk patch was not recorded');
  assert.equal(game.player.weapon, 'fist', 'the berserk patch forces the fist');
  assert.ok(messages.includes('Furie'), 'the berserk patch must announce itself');
  game.player.health = 100;
  const punches = [];
  for (let i = 0; i < 40; i++) {
    const before = game.entities.filter(entity => entity.enemy).length;
    game.player.angle = 0; game.player._weaponCooldown = 0;
    const result = game.fire();
    if (result) punches.push(result.hits);
    if (before !== game.entities.filter(entity => entity.enemy).length) break;
  }
  assert.ok(punches.length, 'the berserk fist must be able to swing');

  const suit = find(game, 2025);
  standOn(game, suit);
  assert.equal(game.player.suit, true, 'the radiation suit was not recorded');
  const nukage = game.map.sectors.find(sector => sector.special === 7);
  assert.ok(nukage, 'E1M5 should contain nukage to test the suit');
  const cell = game.map.floorPolygons.filter(c => c.sector === nukage.id)
    .map(c => ({x: c.points.reduce((n, p) => n + p.x, 0) / c.points.length,
      y: c.points.reduce((n, p) => n + p.y, 0) / c.points.length}))
    .find(p => game.map.sectorAt(p.x, p.y)?.id === nukage.id);
  Object.assign(game.player, {x: cell.x, y: cell.y, z: nukage.floor, sector: nukage.id, health: 100});
  for (let i = 0; i < 70; i++) game.update(1 / 35, {});
  assert.equal(game.player.health, 100, 'the suit must absorb radiation damage');

  const visor = find(game, 2045);
  standOn(game, visor);
  assert.equal(game.player.visor, true, 'the infrared visor was not recorded');
  const map = game.entities.find(entity => entity.type === 2026 && !entity.removed);
  if (map) {
    standOn(game, map);
    assert.equal(game.player.mapShown, true, 'the mission map must be revealed');
  }
});
