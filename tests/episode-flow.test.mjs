import test from 'node:test';
import assert from 'node:assert/strict';
import {EPISODE_1, episodeLevel, episodeNext, episodeTitle, episodeAvailable} from '../src/episode.js';
import {EPISODE_PLANS} from '../src/episode-plans.js';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';
import {musicPatternFor} from '../src/procedural-audio.js';

const IDS = EPISODE_1.map(level => level.id);

function standBefore(game, line, distance = 24) {
  const a = game.map.vertices[line.v1], b = game.map.vertices[line.v2];
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  assert.ok(length > 1, `exit line ${line.id} is too short to activate`);
  // The front of a Doom line is its right side; its normal points right of the direction.
  const side = line.right === -1 ? -1 : 1;
  const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
  const x = mid.x + (dy / length) * distance * side, y = mid.y - (dx / length) * distance * side;
  const sector = game.map.sectorAt(x, y);
  assert.ok(sector, `exit line ${line.id} has no floor on its front side`);
  Object.assign(game.player, {x, y, z: sector.floor, angle: Math.atan2(mid.y - y, mid.x - x), health: 100});
  return sector;
}

function pointInSector(game, id) {
  for (const cell of game.map.floorPolygons.filter(cell => cell.sector === id)) {
    const x = cell.points.reduce((sum, p) => sum + p.x, 0) / cell.points.length;
    const y = cell.points.reduce((sum, p) => sum + p.y, 0) / cell.points.length;
    if (game.map.sectorAt(x, y)?.id === id) return {x, y};
  }
  throw new Error(`No interior sample for sector ${id}`);
}

test('episode 1 routes every level forward and the E1M3 secret into E1M9', () => {
  assert.deepEqual(IDS, ['E1M1', 'E1M2', 'E1M3', 'E1M4', 'E1M5', 'E1M6', 'E1M7', 'E1M8', 'E1M9']);
  assert.equal(episodeNext('E1M1'), 'E1M2');
  assert.equal(episodeNext('E1M3'), 'E1M4');
  assert.equal(episodeNext('E1M3', {secret: true}), 'E1M9');
  assert.equal(episodeNext('E1M9'), 'E1M4', 'the military base returns to command control');
  assert.equal(episodeNext('E1M9', {secret: true}), 'E1M4', 'E1M9 has no further secret');
  assert.equal(episodeNext('E1M8'), null, 'E1M8 ends the episode');
  assert.equal(episodeNext('E1M8', {secret: true}), null);
  assert.throws(() => episodeLevel('E1M10'), RangeError);
  assert.equal(episodeTitle('E1M6'), 'E1M6 · CENTRAL PROCESSING');
  assert.deepEqual(episodeAvailable(EPISODE_PLANS).map(level => level.id), IDS,
    'the menu may only offer surveyed levels');
  for (const level of EPISODE_1) assert.equal(Boolean(level.secret), level.id === 'E1M9');
});

test('every surveyed level can be finished, by exit switch or by the E1M8 exit hub', () => {
  const resources = new ProceduralResources();
  for (const id of IDS) {
    const plan = EPISODE_PLANS[id];
    const exits = plan.walls.map((wall, index) => ({index, special: wall[3]}))
      .filter(entry => entry.special === 11 || entry.special === 51);
    const hubs = plan.sectors.map((sector, index) => ({index, special: sector[5]}))
      .filter(entry => entry.special === 11);
    assert.ok(exits.length || hubs.length, `${id} can never be finished`);
    if (!exits.length) assert.equal(id, 'E1M8', `${id} must use the documented exit switches`);
    if (!hubs.length && id !== 'E1M8') assert.ok(exits.some(entry => entry.special === 11), `${id} needs a non-secret exit`);
    for (const entry of exits) {
      const game = new DoomGame(resources.map(id), {skill: 2});
      assert.equal(game.stats().level, id);
      const line = game.lines[entry.index];
      standBefore(game, line);
      const result = game.use();
      assert.equal(result?.type, 'exit', `${id} exit line ${entry.index} does not activate`);
      assert.equal(result.line, entry.index);
      assert.equal(game.completed, true, `${id} exit line ${entry.index} does not finish the level`);
      assert.equal(game.stats().exitSecret, entry.special === 51, `${id} exit line ${entry.index} kind`);
      assert.equal(game.use(), false, 'a finished level cannot be exited twice');
    }
    for (const hub of hubs) {
      const game = new DoomGame(resources.map(id), {skill: 2});
      const spot = pointInSector(game, hub.index), sector = game.map.sectors[hub.index];
      Object.assign(game.player, {x: spot.x, y: spot.y, z: sector.floor, sector: hub.index, health: 100});
      game.update(1 / 35, {});
      assert.equal(game.completed, true, `${id} exit hub ${hub.index} does not finish the level`);
      assert.equal(game.stats().exitSecret, false, 'the hub is the normal ending');
      assert.ok(game.player.health > 0, 'the episode must end on a victory, not a corpse');
    }
  }
});

test('the resource cache builds each surveyed level once and refuses the unsurveyed', () => {
  const resources = new ProceduralResources();
  for (const id of IDS) {
    assert.equal(resources.canBuild(id), true);
    const first = resources.map(id);
    assert.equal(resources.map(id), first, `${id} must be reused, not rebuilt`);
    assert.equal(first.name, id);
  }
  assert.equal(resources.canBuild('E1M10'), false);
  assert.equal(resources.canBuild('MAP01'), false);
  assert.throws(() => resources.map('E1M10'), /plan arpenté/);
  assert.equal(resources.map(), resources.map('E1M1'), 'the default level stays E1M1');
  const built = resources.map('E1M2');
  resources.releaseMap('E1M2');
  assert.notEqual(resources.map('E1M2'), built, 'a released level is rebuilt fresh');
  assert.ok(resources.flat('FLOOR4_8'), 'flats stay generated from code');
  assert.ok(resources.stats().generatedImages > 0);
  assert.equal(resources.stats().importedAssets, 0);
});

test('each level gets its own deterministic generated music track', () => {
  const seen = new Set();
  for (const id of IDS) {
    const a = musicPatternFor('D_' + id, 0x4652524f), b = musicPatternFor('D_' + id, 0x4652524f);
    assert.deepEqual(a, b, `${id} music must be reproducible`);
    assert.ok(a.events.length && a.duration > 0 && a.original);
    seen.add(a.seed + ':' + a.bpm);
  }
  assert.equal(seen.size, IDS.length, 'every level needs a distinct theme');
  const fallback = musicPatternFor('FERRO_INDUSTRIAL', 7);
  assert.deepEqual(fallback, musicPatternFor('anything else', 7));
  assert.equal(fallback.seed, 7);
});
