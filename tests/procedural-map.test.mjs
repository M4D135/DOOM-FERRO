import test from 'node:test';
import assert from 'node:assert/strict';
import {E1M1_PLAN} from '../src/e1m1-plan.js';
import {buildProceduralMap, createE1M1Map} from '../src/procedural-map.js';
import {DoomGame} from '../src/game.js';

const signedArea = points => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length];
  return sum + a.x * b.y - a.y * b.x;
}, 0) / 2;
const center = points => points.reduce((sum, p) => ({x: sum.x + p.x / points.length, y: sum.y + p.y / points.length}), {x: 0, y: 0});

function park(game, x, y, angle) {
  const sector = game.map.sectorAt(x, y);
  assert.ok(sector, `player placement belongs to a constructed cell: ${x}, ${y}`);
  Object.assign(game.player, {x, y, angle, z: sector.floor, sector: sector.id, vz: 0});
}

test('procedural E1M1 constructs independent deterministic geometry from layout parameters', () => {
  const a = createE1M1Map(), b = createE1M1Map();
  assert.equal(a.procedural, true);
  assert.equal(a.planVertexCount, 385, 'only authored wall endpoints are in the plan');
  assert.equal(a.lines.length, 475); assert.equal(a.sides.length, 648);
  assert.equal(a.sectors.length, 85); assert.equal(a.things.length, 138);
  assert.equal(a.nodes.length, 0, 'no reference BSP is embedded or required');
  assert.ok(a.floorPolygons.length > a.sectors.length);
  assert.deepEqual(a.floorPolygons, b.floorPolygons);
  assert.deepEqual(a.vertices, b.vertices);
  assert.deepEqual(a.subsectors, b.subsectors);
  a.sectors[4].ceiling = 120;
  a.sides[a.lines[330].right].middle = 'test-switch';
  assert.equal(b.sectors[4].ceiling, 0, 'door animation belongs to one game instance');
  assert.equal(E1M1_PLAN.sectors[4][1], 0, 'the construction plan is unchanged');
  assert.notEqual(b.sides[b.lines[330].right].middle, 'test-switch');
});

test('generated convex cells cover each sector contour exactly and drive sector queries', () => {
  const map = createE1M1Map();
  const contourAreas = map.sectors.map(() => 0), cellAreas = map.sectors.map(() => 0);
  for (const line of map.lines) {
    const a = map.vertices[line.v1], b = map.vertices[line.v2];
    const cross = (a.x * b.y - a.y * b.x) / 2;
    const front = map.sides[line.right]?.sector, back = map.sides[line.left]?.sector;
    if (front === back) continue;
    if (front !== undefined) contourAreas[front] -= cross;
    if (back !== undefined) contourAreas[back] += cross;
  }
  for (const cell of map.floorPolygons) {
    const area = signedArea(cell.points), c = center(cell.points);
    assert.ok(area > 0, 'generated floors have the upward winding');
    cellAreas[cell.sector] += area;
    assert.equal(map.sectorAt(c.x, c.y)?.id, cell.sector, `cell ${cell.subsector} shares its collision sector`);
    for (let i = 0; i < cell.points.length; i++) {
      const a = cell.points[i], b = cell.points[(i + 1) % cell.points.length], d = cell.points[(i + 2) % cell.points.length];
      assert.ok((b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x) >= -1e-7, 'each floor cell is convex');
      const x = a.x * .3 + c.x * .7, y = a.y * .3 + c.y * .7;
      assert.equal(map.sectorAt(x, y)?.id, cell.sector, 'cell interiors contain no foreign-sector islands');
    }
    const sub = map.subsectors[cell.subsector];
    assert.equal(sub.sector, cell.sector);
    assert.deepEqual(map.segs.slice(sub.first, sub.first + sub.count).map(seg => map.vertices[seg.v1]), cell.points);
  }
  for (const sector of map.sectors) {
    assert.ok(contourAreas[sector.id] > 0);
    assert.ok(Math.abs(cellAreas[sector.id] - contourAreas[sector.id]) < 1e-6 * contourAreas[sector.id], `sector ${sector.id} has no omitted floor area`);
  }
});

test('all placements and mechanism IDs resolve against the generated footprint', () => {
  const map = createE1M1Map(), game = new DoomGame(map, {skill: 3});
  for (const thing of map.things) assert.ok(map.sectorAt(thing.x, thing.y), `placement ${thing.id}`);
  assert.deepEqual([game.player.x, game.player.y, game.player.z, game.player.angle], [1056, -3616, 0, Math.PI / 2]);
  assert.equal(game.totalKills, 29); assert.equal(game.totalSecrets, 3);
  assert.deepEqual(map.sectors.filter(s => s.special === 9).map(s => s.id), [68, 69, 70]);
  assert.deepEqual(map.lines.filter(line => line.special === 1).map(line => line.id), [151, 152, 247, 248, 324, 325, 340, 341]);
  assert.equal(map.lines[330].special, 11);
  assert.equal(map.lines[308].special, 36);
  assert.equal(map.lines[195].special, 88);
  assert.equal(map.sectorAt(map.bounds.minX - 1, map.bounds.minY - 1), null);
  assert.equal(map.subsectorAt(map.bounds.maxX + 1, map.bounds.maxY + 1), -1);
  assert.equal(map.subsectorSector(-1), null);
});

test('the procedural sweep preserves holes and disconnected parts of a sector', () => {
  const vertices = [[-10,-10],[-10,10],[10,10],[10,-10],
    [-3,-3],[3,-3],[3,3],[-3,3], [20,-5],[20,5],[30,5],[30,-5]];
  const walls = [];
  for (const start of [0, 4, 8]) for (let i = 0; i < 4; i++) walls.push([start + i, start + (i + 1) % 4, 0, 0, 0, 0, -1]);
  const plan = {name: 'HOLE_TEST', vertices, walls, faces: [[0,0,'-','-','wall',0]],
    sectors: [[0,128,'floor','ceiling',160,0,0]], objects: []};
  const map = buildProceduralMap(plan);
  assert.ok(Math.abs(map.floorPolygons.reduce((sum, cell) => sum + signedArea(cell.points), 0) - 464) < 1e-8);
  assert.equal(map.sectorAt(0, 0), null, 'the courtyard hole is not filled');
  assert.equal(map.sectorAt(15, 0), null, 'the gap between disconnected rooms is not filled');
  assert.equal(map.sectorAt(-7, 0)?.id, 0);
  assert.equal(map.sectorAt(25, 0)?.id, 0);
  assert.throws(() => buildProceduralMap({...plan, walls: walls.slice(1)}), /open contour/);
});

test('all eight door faces become passable while advancing, with every enemy and object present', () => {
  for (const id of [151, 152, 247, 248, 324, 325, 340, 341]) {
    const game = new DoomGame(createE1M1Map(), {skill: 3});
    const line = game.lines[id], length = Math.hypot(line.bx - line.ax, line.by - line.ay);
    const tx = (line.bx - line.ax) / length, ty = (line.by - line.ay) / length, nx = ty, ny = -tx;
    const mx = (line.ax + line.bx) / 2, my = (line.ay + line.by) / 2;
    const offset = (length / 2 - 18) * (id % 2 ? .8 : -.8);
    park(game, mx + nx * 40 + tx * offset, my + ny * 40 + ty * offset, Math.atan2(-ny, -nx));
    assert.equal(game.lineBlocksActor(line, game.player), true, `closed face ${id} blocks`);
    let crossed = false;
    for (let frame = 0; frame < 150; frame++) {
      game.update(1 / 60, {forward: 1, run: true, use: true});
      if ((game.player.x - mx) * nx + (game.player.y - my) * ny < -16) { crossed = true; break; }
    }
    assert.equal(crossed, true, `face ${id} admits the player during opening`);
    assert.ok(game.player.health > 0);
    assert.equal(game.totalKills, 29, 'acceptance keeps the original active enemies');
  }
});

test('generated E1M1 is traversable from spawn to the exit with active opponents and no teleport', () => {
  const game = new DoomGame(createE1M1Map(), {skill: 2});
  const points = [[1056,-3072],[1248,-2880],[1248,-2720],[1264,-2704],[1264,-2688],
    [1392,-2560],[1424,-2560],[1440,-2544],[2032,-2544],[2096,-2608],[2640,-2608],
    [2896,-2864],[2896,-3568],[2960,-3632],[2960,-4288],[2976,-4304],[2976,-4576],
    [2992,-4592],[2992,-4720],[2944,-4768]];
  const doors = [], dt = 1 / 60;
  for (const [x, y] of points) {
    let frames = 0;
    while (Math.hypot(game.player.x - x, game.player.y - y) > .3) {
      const p = game.player, distance = Math.hypot(x - p.x, y - p.y), angle = Math.atan2(y - p.y, x - p.x);
      const hit = game.raycast(p.x, p.y, p.z + 32, angle, 64);
      const use = Boolean(hit.line?.special === 1 && !game.actions.has(hit.line.back));
      if (use) doors.push(hit.line.id);
      game.update(dt, {forward: Math.min(1, distance / (320 * dt)), run: true,
        turn: Math.atan2(Math.sin(angle - p.angle), Math.cos(angle - p.angle)), use});
      assert.ok(++frames < 1800, `blocked before ${x},${y} at ${p.x},${p.y}`);
      assert.ok(p.health > 0, 'the route retains live combat');
      assert.ok(game.map.sectorAt(p.x, p.y), 'movement never enters an unbuilt floor');
    }
  }
  assert.deepEqual(doors, [151, 340, 325]);
  assert.equal(game.player.sector, 82);
  assert.equal(game.entities.filter(e => e.enemy).length, 6, 'opponents were not removed for the route');
  game.update(dt, {use: false});
  game.update(dt, {turn: Math.atan2(Math.sin(Math.PI - game.player.angle), Math.cos(Math.PI - game.player.angle)), use: true});
  assert.equal(game.completed, true);
  assert.ok(game.time > 12 && game.time < 25);
});
