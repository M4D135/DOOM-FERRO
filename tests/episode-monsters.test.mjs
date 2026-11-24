import test from 'node:test';
import assert from 'node:assert/strict';
import {EPISODE_PLANS} from '../src/episode-plans.js';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';
import {modelForEntity, collectModelBatches} from '../src/procedural-models.js';

const IDS = Object.keys(EPISODE_PLANS);
const MONSTER_TYPES = [9, 58, 3001, 3002, 3003, 3004];
const resources = new ProceduralResources();
const skillFlag = skill => skill === 1 ? 1 : skill === 2 ? 2 : 4;

function expectedEnemies(plan, skill) {
  const flag = skillFlag(skill);
  return plan.objects.filter(thing => MONSTER_TYPES.includes(thing[3])
    && thing.type !== 11 && !(thing[4] & 16) && (thing[4] & flag)).length;
}

test('every monster placed in the nine levels actually spawns and counts as a kill', () => {
  const species = new Set();
  for (const id of IDS) {
    for (const skill of [1, 2, 3]) {
      const game = new DoomGame(resources.map(id), {skill});
      const expected = expectedEnemies(EPISODE_PLANS[id], skill);
      assert.equal(game.entities.filter(entity => entity.enemy).length, expected,
        `${id} skill ${skill} spawns the wrong number of monsters`);
      assert.equal(game.totalKills, expected, `${id} skill ${skill} totalKills`);
    }
    for (const thing of EPISODE_PLANS[id].objects) if (MONSTER_TYPES.includes(thing[3])) species.add(thing[3]);
  }
  assert.deepEqual([...species].sort((a, b) => a - b), MONSTER_TYPES,
    'the episode should exercise every species the survey found');
});

test('sergeants, spectres and barons are distinct fighters with real meshes', () => {
  const map = resources.map('E1M6');
  const fresh = new DoomGame(map, {skill: 3});
  const sergeant = fresh.entities.find(entity => entity.type === 3002);
  const spectre = fresh.entities.find(entity => entity.type === 58);
  const baron = new DoomGame(resources.map('E1M8'), {skill: 3}).entities.find(entity => entity.type === 3003);
  assert.ok(sergeant && spectre && baron, 'the surveyed levels must contain each new species');
  assert.equal(sergeant.config.base, 'POSS');
  assert.equal(sergeant.config.shots, 3, 'the sergeant fires a three-round burst');
  assert.equal(spectre.shadow, true, 'the spectre keeps the Doom shadow cue');
  assert.notEqual(baron.shadow, true, 'the baron is fully visible');
  assert.ok(baron.config.hp > spectre.config.hp * 4, 'a baron must be far tougher than a spectre');
  for (const entity of [sergeant, spectre, baron]) {
    for (const state of ['idle', 'chase', 'attack', 'pain', 'dead']) {
      Object.assign(entity, {state, alive: state !== 'dead', stateTime: state === 'dead' ? .3 : 0});
      const mesh = modelForEntity(entity, 0.4, 2);
      assert.ok(mesh && mesh.vertices.length > 3000, `${entity.type} ${state} has no 3D body`);
      assert.ok(mesh.vertices.every(Number.isFinite), `${entity.type} ${state} mesh is not finite`);
      const height = mesh.bounds.max[2] - mesh.bounds.min[2];
      assert.ok(height > 30 && height < 80, `${entity.type} ${state} is ${height} tall`);
      assert.ok(!/billboard|sprite/i.test(mesh.key), `${entity.type} must not be a billboard`);
    }
  }
});

test('barons spit a heavy fireball and the spectre shimmers instead of blending', () => {
  const fresh = new DoomGame(resources.map('E1M8'), {skill: 3});
  const baron = fresh.entities.find(entity => entity.type === 3003);
  const spectre = fresh.entities.find(entity => entity.type === 58);
  // The baron arena is a closet; fight it in the widest room of the episode.
  const cells = fresh.map.floorPolygons.map(cell => ({
    sector: cell.sector,
    x: cell.points.reduce((sum, p) => sum + p.x, 0) / cell.points.length,
    y: cell.points.reduce((sum, p) => sum + p.y, 0) / cell.points.length,
    area: (Math.max(...cell.points.map(p => p.x)) - Math.min(...cell.points.map(p => p.x)))
      * (Math.max(...cell.points.map(p => p.y)) - Math.min(...cell.points.map(p => p.y)))
  })).sort((a, b) => b.area - a.area);
  let placed = false;
  for (const cell of cells) {
    for (const offset of [160, 200, 120, 240]) {
      for (const direction of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const x = cell.x + Math.cos(direction) * offset, y = cell.y + Math.sin(direction) * offset;
        const target = fresh.map.sectorAt(x, y);
        if (!target || target.id !== cell.sector) continue;
        Object.assign(fresh.player, {x, y, z: target.floor, sector: target.id, health: 100});
        Object.assign(baron, {x: cell.x, y: cell.y, z: target.floor, sector: target.id, alive: true});
        if (fresh.lineOfSight(baron.x, baron.y, baron.z + 32, x, y, target.floor + 32)) { placed = true; break; }
      }
      if (placed) break;
    }
    if (placed) break;
  }
  assert.ok(placed, 'no open firing position for the baron');
  const before = fresh.entities.length;
  fresh._enemyAttack(baron);
  const shot = fresh.entities.slice(before).find(entity => entity.projectile);
  assert.ok(shot, 'the baron did not launch a fireball');
  assert.equal(shot.damage, baron.config.damage);
  assert.ok(shot.scale > 1.4 && shot.radius > 8, 'the baron fireball must read as a big missile');
  assert.ok(Math.hypot(shot.vx, shot.vy) > 100, 'the fireball must travel toward the player');

  const map = fresh.map;
  const lights = [];
  for (const time of [0, 0.3, 0.6, 0.9, 1.2]) {
    const batches = collectModelBatches(map, [spectre], time, null, null);
    assert.equal(batches.length, 1, 'the spectre must produce one instanced batch');
    lights.push(batches[0].instances[5]);
  }
  assert.ok(Math.max(...lights) - Math.min(...lights) > 0.1, 'the spectre light must shimmer');
  assert.ok(Math.max(...lights) < 1.2, 'the spectre never renders brighter than its sector');
});
