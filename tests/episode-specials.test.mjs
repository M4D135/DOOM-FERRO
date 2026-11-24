import test from 'node:test';
import assert from 'node:assert/strict';
import {EPISODE_PLANS} from '../src/episode-plans.js';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';

const IDS = Object.keys(EPISODE_PLANS);
const resources = new ProceduralResources();
const LOCKED = new Map([[26, 'blue'], [32, 'blue'], [27, 'yellow'], [34, 'yellow'], [28, 'red'], [33, 'red']]);
const KEY_TYPES = new Map([[5, 'blue'], [6, 'yellow'], [13, 'red']]);
const game = id => new DoomGame(resources.map(id), {skill: 3, onMessage: () => {}});

function faceLine(map, player, line, distance = 24) {
  const dx = line.bx - line.ax, dy = line.by - line.ay, length = Math.hypot(dx, dy);
  assert.ok(length > 1, `line ${line.id} is too short to reach`);
  const side = line.right === -1 ? -1 : 1;
  const mid = {x: (line.ax + line.bx) / 2, y: (line.ay + line.by) / 2};
  const x = mid.x + (dy / length) * distance * side, y = mid.y - (dx / length) * distance * side;
  const sector = map.sectorAt(x, y);
  assert.ok(sector, `line ${line.id} has no floor on its front side`);
  Object.assign(player, {x, y, z: sector.floor, sector: sector.id, angle: Math.atan2(mid.y - y, mid.x - x), health: 100});
  return sector;
}

function linesWith(map, specials) {
  return map.lines.filter(line => specials.includes(line.special));
}

test('every locked door colour has its key somewhere in the same level', () => {
  for (const id of IDS) {
    const plan = EPISODE_PLANS[id];
    const needed = new Set(plan.walls.map(wall => LOCKED.get(wall[3])).filter(Boolean));
    const present = new Set(plan.objects.map(thing => KEY_TYPES.get(thing[3])).filter(Boolean));
    for (const colour of needed) {
      assert.ok(present.has(colour), `${id} locks doors with the ${colour} card but never offers one`);
    }
  }
});

test('locked cards block the door until the card is found', () => {
  for (const id of IDS) {
    const map = resources.map(id);
    const locked = linesWith(map, [...LOCKED.keys()]);
    for (const line of locked) {
      const colour = LOCKED.get(line.special);
      const fresh = game(id);
      faceLine(fresh.map, fresh.player, fresh.lines[line.id]);
      assert.equal(fresh.use(), false, `${id} line ${line.id} opened without the ${colour} card`);
      assert.equal(fresh.actions.size, 0, `${id} line ${line.id} moved a sector without the card`);
      fresh.player.keys[colour] = 1;
      const result = fresh.use();
      assert.equal(result?.type, 'door', `${id} line ${line.id} stays shut with the ${colour} card`);
      assert.ok(fresh.actions.size > 0, `${id} line ${line.id} did not start a door`);
    }
  }
});

test('tagged switch doors raise every sector carrying the line tag', () => {
  const checked = new Set();
  for (const id of IDS) {
    const map = resources.map(id);
    for (const line of linesWith(map, [103, 46, 20])) {
      const fresh = game(id), target = fresh.lines[line.id];
      faceLine(fresh.map, fresh.player, target);
      const expected = map.sectors.filter(s => s.tag && s.tag === target.tag);
      assert.ok(expected.length, `${id} switch line ${line.id} tags nothing`);
      const before = expected.map(s => s.ceiling);
      assert.equal(fresh.use()?.type, 'door', `${id} switch line ${line.id} does not open`);
      for (let i = 0; i < 40; i++) fresh.update(1 / 35, {});
      if (expected.some((s, i) => s.ceiling > before[i])) { checked.add(id); continue; }
      // Nothing rose only when the tagged sector already rests at its open height.
      assert.equal(fresh.actions.size, 0, `${id} switch line ${line.id} queued a no-op`);
      for (const s of expected) {
        const above = [...fresh.neighbors[s.id]].map(i => fresh.map.sectors[i].ceiling)
          .filter(ceiling => ceiling > s.ceiling + 4);
        assert.equal(above.length, 0, `${id} switch line ${line.id} left a closable door shut`);
      }
    }
  }
  assert.ok(checked.size >= 5, 'most levels should use tagged switch doors');
});

test('walk-over specials drive their tagged sectors', () => {
  const seen = new Set();
  for (const id of IDS) {
    const map = resources.map(id);
    for (const line of linesWith(map, [62, 63, 91, 98, 90, 86])) {
      const fresh = game(id), target = fresh.lines[line.id];
      if (!target.tag) continue;
      const targets = map.sectors.filter(s => s.tag === target.tag);
      assert.ok(targets.length, `${id} walk-over line ${line.id} tags nothing`);
      const before = targets.map(s => ({floor: s.floor, ceiling: s.ceiling}));
      fresh._crossLine(target, fresh.player);
      fresh.actions.forEach((action, sectorId) => {
        assert.ok(targets.some(s => s.id === sectorId),
          `${id} line ${target.special} moved an untagged sector`);
        assert.ok(['door', 'floor', 'lift'].includes(action.kind), `${id} unexpected action ${action.kind}`);
      });
      for (let i = 0; i < 40; i++) fresh.update(1 / 35, {});
      const moved = targets.some((s, i) => s.floor !== before[i].floor || s.ceiling !== before[i].ceiling);
      if (!moved) {
        // A floor already resting at its neighbour's height has nothing to do.
        assert.equal(fresh.actions.size, 0, `${id} walk-over line ${line.id} queued a no-op`);
        continue;
      }
      assert.ok(moved, `${id} walk-over line ${line.id} (special ${line.special}) changed nothing`);
      seen.add(line.special);
    }
  }
  assert.ok(seen.has(91) && seen.has(62), 'stairs and lowering floors must both be exercised');
});

test('walk-over teleports land the player on the tagged destination marker', () => {
  const seen = [];
  for (const id of IDS) {
    const map = resources.map(id);
    for (const line of linesWith(map, [97])) {
      const fresh = game(id), target = fresh.lines[line.id];
      const marker = map.things.find(thing => thing.type === 14
        && map.sectorAt(thing.x, thing.y)?.tag === target.tag);
      assert.ok(marker, `${id} teleport line ${line.id} has no destination marker in tag ${target.tag}`);
      const result = fresh._teleport(target, fresh.player);
      assert.equal(result?.type, 'teleport', `${id} teleport line ${line.id} refused`);
      assert.equal(fresh.player.x, marker.x);
      assert.equal(fresh.player.y, marker.y);
      assert.equal(fresh.player.sector, map.sectorAt(marker.x, marker.y).id);
      seen.push(id);
    }
  }
  assert.ok(seen.length >= 10, 'teleports should be exercised across the episode');
});

test('acid and super-slime floors damage the player at their own rate', () => {
  const rates = {7: 5, 16: 100};
  const exercised = new Set();
  for (const id of IDS) {
    const map = resources.map(id);
    for (const [special, rate] of Object.entries(rates)) {
      const sector = map.sectors.find(s => s.special === Number(special));
      if (!sector) continue;
      const fresh = game(id);
      const cell = fresh.map.floorPolygons.filter(c => c.sector === sector.id)
        .map(c => ({x: c.points.reduce((n, p) => n + p.x, 0) / c.points.length,
          y: c.points.reduce((n, p) => n + p.y, 0) / c.points.length}))
        .find(p => fresh.map.sectorAt(p.x, p.y)?.id === sector.id);
      assert.ok(cell, `${id} sector ${sector.id} (special ${special}) has no reachable floor`);
      Object.assign(fresh.player, {x: cell.x, y: cell.y, z: sector.floor, sector: sector.id, health: 200});
      fresh.entities.forEach(entity => { entity.removed = true; });
      // The floor tick fires every 32/35 s, so one application needs 33 frames.
      for (let i = 0; i < 33; i++) fresh.update(1 / 35, {});
      assert.equal(fresh.player.health, 200 - rate, `${id} special ${special} dealt the wrong damage`);
      exercised.add(Number(special));
    }
  }
  assert.deepEqual([...exercised].sort((a, b) => a - b), [7, 16]);
});
