import test from 'node:test';
import assert from 'node:assert/strict';
import {EPISODE_PLANS} from '../src/episode-plans.js';
import {buildProceduralMap, createEpisodeMap} from '../src/procedural-map.js';

// Measured offline from the verified shareware archive by
// tools/export-episode1-plans.mjs. Repeating them here keeps a damaged
// exporter from validating its own output.
const COUNTS = {
  E1M1: {vertices: 385, walls: 475, faces: 648, sectors: 85, objects: 138},
  E1M2: {vertices: 812, walls: 1033, faces: 1323, sectors: 200, objects: 262},
  E1M3: {vertices: 835, walls: 1026, faces: 1326, sectors: 177, objects: 380},
  E1M4: {vertices: 673, walls: 830, faces: 1054, sectors: 139, objects: 254},
  E1M5: {vertices: 665, walls: 825, faces: 1053, sectors: 143, objects: 293},
  E1M6: {vertices: 1081, walls: 1352, faces: 1727, sectors: 250, objects: 463},
  E1M7: {vertices: 763, walls: 958, faces: 1223, sectors: 170, objects: 358},
  E1M8: {vertices: 264, walls: 333, faces: 511, sectors: 74, objects: 126},
  E1M9: {vertices: 509, walls: 653, faces: 902, sectors: 147, objects: 237}
};
const IDS = Object.keys(COUNTS);
const finite = value => Number.isFinite(value);

test('the registry offers exactly the nine surveyed Episode 1 levels', () => {
  assert.deepEqual(Object.keys(EPISODE_PLANS), IDS);
  for (const [id, plan] of Object.entries(EPISODE_PLANS)) {
    assert.equal(plan.name, id);
    assert.equal(typeof plan.title, 'string');
    assert.ok(plan.title.length, `${id} needs a menu title`);
    assert.equal(plan.version, 1);
    for (const banned of ['nodes', 'reject', 'blockmap', 'sprites', 'textures', 'patches', 'flats', 'sounds']) {
      assert.equal(plan[banned], undefined, `${id} must not carry ${banned}`);
    }
  }
});

test('every surveyed plan matches the reference tables and stays internally consistent', () => {
  for (const [id, plan] of Object.entries(EPISODE_PLANS)) {
    const expected = COUNTS[id];
    assert.equal(plan.vertices.length, expected.vertices, `${id} wall endpoints`);
    assert.equal(plan.walls.length, expected.walls, `${id} walls`);
    assert.equal(plan.faces.length, expected.faces, `${id} faces`);
    assert.equal(plan.sectors.length, expected.sectors, `${id} sectors`);
    assert.equal(plan.objects.length, expected.objects, `${id} objects`);
    for (const [x, y] of plan.vertices) assert.ok(finite(x) && finite(y), `${id} non-finite endpoint`);
    for (const [v1, v2, , , , right, left] of plan.walls) {
      assert.ok(plan.vertices[v1] && plan.vertices[v2], `${id} wall endpoint out of range`);
      for (const side of [right, left]) {
        if (side !== -1) assert.ok(plan.faces[side], `${id} wall face out of range`);
      }
    }
    let faced = 0;
    for (const [, , , , , sector] of plan.faces) {
      assert.ok(plan.sectors[sector], `${id} face without a sector`);
      faced++;
    }
    assert.ok(faced > 0, `${id} has no faces`);
    for (const [floor, ceiling, floorTexture, ceilingTexture, light, special, tag] of plan.sectors) {
      assert.ok([floor, ceiling, light, special, tag].every(finite), `${id} malformed sector`);
      assert.ok(ceiling >= floor, `${id} inverted sector heights`);
      assert.ok(light >= 0 && light <= 255, `${id} light outside 0..255`);
      for (const texture of [floorTexture, ceilingTexture]) {
        assert.equal(typeof texture, 'string', `${id} texture must be a recipe name`);
        if (texture) assert.equal(texture, texture.toUpperCase(), `${id} recipe name must be upper case`);
      }
    }
    assert.equal(plan.objects.filter(([, , , type]) => type === 1).length, 1, `${id} needs one player start`);
  }
});

test('every surveyed plan builds playable geometry without a reference BSP', () => {
  for (const id of IDS) {
    const map = createEpisodeMap(id);
    assert.equal(map.procedural, true);
    assert.equal(map.name, id);
    assert.equal(map.nodes.length, 0, `${id} must not need a BSP`);
    assert.ok(map.floorPolygons.length > 0, `${id} has no floor cells`);
    assert.equal(map.subsectors.length, map.floorPolygons.length);
    assert.equal(map.sectors.length, COUNTS[id].sectors);
    assert.equal(map.things.length, COUNTS[id].objects);
    for (const cell of map.floorPolygons) {
      assert.ok(cell.points.length >= 3, `${id} produced a degenerate cell`);
      assert.ok(cell.maxX > cell.minX && cell.maxY > cell.minY, `${id} produced an empty cell`);
      assert.ok(map.sectors[cell.sector], `${id} cell without a sector`);
    }
    for (const thing of map.things) {
      const sector = map.sectorAt(thing.x, thing.y);
      assert.ok(sector, `${id} object ${thing.id} lies outside the generated floor`);
    }
    const start = map.things.find(thing => thing.type === 1);
    assert.ok(map.sectorAt(start.x, start.y), `${id} player start is not on generated floor`);
    assert.equal(map.subsectorAt(map.bounds.minX - 1e6, map.bounds.minY - 1e6), -1,
      `${id} queries outside the bounds must miss`);
  }
});

test('building a level twice yields the same geometry and unknown ids fail loudly', () => {
  for (const id of IDS) {
    const a = createEpisodeMap(id), b = createEpisodeMap(id);
    assert.equal(a.vertices.length, b.vertices.length);
    assert.equal(a.floorPolygons.length, b.floorPolygons.length);
    assert.equal(a.subsectors.length, b.subsectors.length);
    assert.deepEqual(a.floorPolygons.map(cell => [cell.sector, cell.points.length]),
      b.floorPolygons.map(cell => [cell.sector, cell.points.length]));
  }
  for (const id of ['E1M10', 'E2M1', 'MAP01', '']) {
    assert.throws(() => createEpisodeMap(id), /unknown episode level/, `${id} must not build`);
  }
  assert.throws(() => buildProceduralMap(null), /incomplete construction plan/);
  assert.throws(() => buildProceduralMap({vertices: [], walls: [], faces: [], sectors: [], objects: []}),
    /empty construction plan/);
});

test('the nine plans build in well under a frame budget each', () => {
  for (const id of IDS) {
    const started = performance.now();
    createEpisodeMap(id);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 250, `${id} took ${elapsed.toFixed(1)} ms to build`);
  }
});
