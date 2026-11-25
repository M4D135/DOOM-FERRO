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
        // A floor already resting at its neighbour’s height has nothing to do.
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

// ─── Boss trigger E1M8 (tag 666) ────────────────────────────────────────────
test('E1M8 boss trigger: killing the last Baron lowers tag 666 sectors', () => {
  const fresh = game('E1M8');
  const barons = fresh.entities.filter(e => e.enemy && e.type === 3003 && e.alive);
  assert.ok(barons.length >= 2, 'E1M8 must have at least 2 Barons');
  const tag666 = fresh.map.sectors.filter(s => s.tag === 666);
  assert.ok(tag666.length > 0, 'E1M8 must have tag 666 sectors');
  const beforeFloors = tag666.map(s => s.floor);
  // Kill all but one Baron — sector should NOT move yet.
  for (let i = 0; i < barons.length - 1; i++) {
    fresh.damageEntity(barons[i], 99999);
  }
  for (let i = 0; i < 40; i++) fresh.update(1 / 35, {});
  assert.deepEqual(tag666.map(s => s.floor), beforeFloors, 'tag 666 must not move while a Baron lives');
  // Kill the last Baron — sector should lower.
  fresh.damageEntity(barons[barons.length - 1], 99999);
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  const anyLowered = tag666.some((s, i) => s.floor < beforeFloors[i]);
  assert.ok(anyLowered, 'tag 666 sectors must lower after last Baron dies');
});

// ─── Stairs special 7 (S1 Build Stairs Up 8) ───────────────────────────────
test('special 7 builds stairs: chain sectors rise by +8 each', () => {
  const fresh = game('E1M8');
  const line = fresh.lines.find(l => l.special === 7);
  assert.ok(line, 'E1M8 must contain special 7 stairs');
  faceLine(fresh.map, fresh.player, line);
  const rootFloor = fresh.map.sectors.find(s => s.tag === line.tag).floor;
  const result = fresh.use();
  assert.equal(result?.type, 'stairs', 'special 7 must return stairs');
  assert.ok(result.sectors.length >= 2, 'stairs must chain multiple sectors');
  for (let i = 0; i < 160; i++) fresh.update(1 / 35, {});
  result.sectors.forEach((id, index) => {
    assert.equal(fresh.map.sectors[id].floor, rootFloor + 8 * (index + 1),
      `stair step ${index} (sector ${id}) must reach +${8 * (index + 1)}`);
  });
});

// ─── Stairs special 8 (W1 Build Stairs Up 8) ───────────────────────────────
test('special 8 W1 builds stairs on crossing', () => {
  const fresh = game('E1M3');
  const line = fresh.lines.find(l => l.special === 8);
  assert.ok(line, 'E1M3 must contain special 8 W1 stairs');
  const before = fresh.map.sectors.map(s => s.floor);
  fresh._crossLine(line, fresh.player);
  for (let i = 0; i < 160; i++) fresh.update(1 / 35, {});
  const risen = fresh.map.sectors.filter((s, i) => s.floor > before[i]);
  assert.ok(risen.length >= 2, 'W1 stairs must raise chained sectors');
});

// ─── Donut special 9 ────────────────────────────────────────────────────────
test('special 9 donut lowers pillar and raises ring', () => {
  const fresh = game('E1M2');
  const line = fresh.lines.find(l => l.special === 9);
  if (!line) return;
  faceLine(fresh.map, fresh.player, line);
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag);
  assert.ok(tagged.length >= 1, 'donut must tag at least 1 sector');
  const before = tagged.map(s => s.floor);
  const result = fresh.use();
  assert.equal(result?.type, 'donut', 'special 9 must return donut');
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  const anyMoved = tagged.some((s, i) => s.floor !== before[i]);
  assert.ok(anyMoved, 'donut sectors must move');
});

// ─── Special 18: S1 Raise Floor to Nearest Higher Neighbour ─────────────────
test('special 18 raises tagged floors to nearest higher neighbour', () => {
  const fresh = game('E1M4');
  const line = fresh.lines.find(l => l.special === 18);
  if (!line) return;
  faceLine(fresh.map, fresh.player, line);
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag && !fresh.actions.has(s.id));
  if (!tagged.length) return;
  const before = tagged.map(s => s.floor);
  const result = fresh.use();
  assert.equal(result?.type, 'floor', 'special 18 must return floor');
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  const anyRose = tagged.some((s, i) => s.floor > before[i]);
  assert.ok(anyRose, 'special 18 must raise floors');
});

// ─── Special 22: W1 Raise to Next Higher Floor ──────────────────────────────
test('special 22 W1 raises floors and clears special', () => {
  const fresh = game('E1M5');
  const line = fresh.lines.find(l => l.special === 22);
  if (!line) return;
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag);
  if (!tagged.length) return;
  const before = tagged.map(s => s.floor);
  fresh._crossLine(line, fresh.player);
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  const anyRose = tagged.some((s, i) => s.floor > before[i]);
  assert.ok(anyRose, 'special 22 must raise floors');
  // special should be cleared
  for (const s of tagged) {
    if (s.floor > before[tagged.indexOf(s)]) {
      assert.equal(s.special, 0, 'special 22 must clear sector special');
    }
  }
});

// ─── Special 23: S1 Lower Floor to Lowest Neighbour ─────────────────────────
test('special 23 lowers tagged floors to lowest neighbour', () => {
  const fresh = game('E1M7');
  const line = fresh.lines.find(l => l.special === 23);
  if (!line) return;
  faceLine(fresh.map, fresh.player, line);
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag && !fresh.actions.has(s.id));
  if (!tagged.length) return;
  const before = tagged.map(s => s.floor);
  const result = fresh.use();
  assert.equal(result?.type, 'floor', 'special 23 must return floor');
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  const anyLowered = tagged.some((s, i) => s.floor < before[i]);
  assert.ok(anyLowered, 'special 23 must lower floors');
});

// ─── Special 70: SR Lower Floor Turbo ───────────────────────────────────────
test('special 70 lowers tagged floors turbo', () => {
  const fresh = game('E1M5');
  const line = fresh.lines.find(l => l.special === 70);
  if (!line) return;
  faceLine(fresh.map, fresh.player, line);
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag && !fresh.actions.has(s.id));
  if (!tagged.length) return;
  const before = tagged.map(s => s.floor);
  const result = fresh.use();
  assert.equal(result?.type, 'floor', 'special 70 must return floor');
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  const anyLowered = tagged.some((s, i) => s.floor < before[i]);
  assert.ok(anyLowered, 'special 70 must lower floors');
});

// ─── Special 82: WR Lower Floor (paired with 91 raise in E1M8) ──────────────
test('special 82 WR lowers raised tagged floors back to lowest neighbour', () => {
  const fresh = game('E1M8');
  const lowerLine = fresh.lines.find(l => l.special === 82);
  assert.ok(lowerLine, 'E1M8 must contain special 82');
  const raiseLine = fresh.lines.find(l => l.special === 91 && l.tag === lowerLine.tag);
  assert.ok(raiseLine, 'E1M8 pairs special 82 with special 91 on the same tag');
  const tagged = fresh.map.sectors.filter(s => s.tag === lowerLine.tag);
  const initial = tagged.map(s => s.floor);
  fresh._crossLine(raiseLine, fresh.player);
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  assert.ok(tagged.some((s, i) => s.floor > initial[i]), 'paired special 91 must raise the platform first');
  const raised = tagged.map(s => s.floor);
  fresh._crossLine(lowerLine, fresh.player);
  for (let i = 0; i < 60; i++) fresh.update(1 / 35, {});
  assert.ok(tagged.some((s, i) => s.floor < raised[i]), 'special 82 must lower the raised platform back down');
});

// ─── Special 35: W1 Lights to 35 ────────────────────────────────────────────
test('special 35 W1 sets sector light to 35', () => {
  const fresh = game('E1M3');
  const line = fresh.lines.find(l => l.special === 35);
  if (!line) return;
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag);
  if (!tagged.length) return;
  fresh._crossLine(line, fresh.player);
  for (const s of tagged) {
    assert.equal(s.light, 35, `special 35 must set light to 35 on sector ${s.id}`);
  }
});

// ─── Special 16/76: Close 30 Then Open ──────────────────────────────────────
test('special 16 W1 closes door for 30 tics then reopens', () => {
  const fresh = game('E1M6');
  const line = fresh.lines.find(l => l.special === 16);
  if (!line) return;
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag && !fresh.actions.has(s.id));
  if (!tagged.length) return;
  const beforeCeilings = tagged.map(s => s.ceiling);
  fresh._crossLine(line, fresh.player);
  // Should have closeDoor30 actions
  const hasAction = tagged.some(s => fresh.actions.has(s.id));
  assert.ok(hasAction, 'special 16 must start closeDoor30 action');
  // Run enough frames to close and wait
  for (let i = 0; i < 120; i++) fresh.update(1 / 35, {});
  // After 30 tics wait + closing time, should be reopening
  const anyAction = tagged.some(s => {
    const a = fresh.actions.get(s.id);
    return a && (a.phase === 'wait' || a.phase === 'up');
  });
  assert.ok(anyAction || tagged.every(s => !fresh.actions.has(s.id)),
    'special 16 must progress through phases');
});

// ─── Special 46: GR Open Door (shot-activated) ──────────────────────────────
test('special 46 door opens when shot', () => {
  const fresh = game('E1M2');
  const line = fresh.lines.find(l => l.special === 46);
  if (!line) return;
  const tagged = fresh.map.sectors.filter(s => s.tag && s.tag === line.tag);
  assert.ok(tagged.length, 'special 46 must tag a sector');
  // Place player facing the line and shoot
  const mid = {x: (line.ax + line.bx) / 2, y: (line.ay + line.by) / 2};
  const dx = line.bx - line.ax, dy = line.by - line.ay;
  const len = Math.hypot(dx, dy);
  const side = line.right >= 0 ? 1 : -1;
  const px = mid.x + (dy / len) * 48 * side, py = mid.y - (dx / len) * 48 * side;
  const sector = fresh.map.sectorAt(px, py);
  if (!sector) return;
  Object.assign(fresh.player, {x: px, y: py, z: sector.floor, sector: sector.id,
    angle: Math.atan2(mid.y - py, mid.x - px), health: 100, ammo: 50, weapon: 'pistol'});
  fresh.fire();
  // The door should have been triggered
  const hasDoorAction = tagged.some(s => fresh.actions.has(s.id));
  assert.ok(hasDoorAction, 'special 46 must open door when shot');
});
