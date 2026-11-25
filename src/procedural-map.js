/**
 * Construct a playable map from a fixed architectural plan.
 *
 * Each sector is decomposed into convex trapezoids by a horizontal sweep over
 * its boundary vertices. Even/odd spans preserve concave rooms, disconnected
 * regions and holes. Neither pre-triangulated geometry nor a reference BSP is
 * used. Rendering and sector queries share the resulting cells exactly.
 */
import {E1M1_PLAN} from './e1m1-plan.js';
import {EPISODE_PLANS} from './episode-plans.js';

const EPSILON = 1e-7;
const GRID_SIZE = 128;
const finite = value => Number.isFinite(value);
const fail = message => { throw new Error(`Procedural map: ${message}`); };
const samePoint = (a, b) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
const area2 = points => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - p.y * q.x;
}, 0);

function compactPolygon(points) {
  const result = points.filter((p, i) => !samePoint(p, points[(i + points.length - 1) % points.length]));
  if (result.length < 3 || area2(result) <= EPSILON) return null;
  return result;
}

function sweepSector(sector, edges) {
  const levels = [...new Set(edges.flatMap(edge => [edge.a.y, edge.b.y]))].sort((a, b) => a - b);
  const cells = [];
  const at = (edge, y) => edge.a.x + (y - edge.a.y) * (edge.b.x - edge.a.x) / (edge.b.y - edge.a.y);
  // A band midpoint never sits on a contour vertex. A tiny probe offset is the
  // only defence left when two contours touch exactly on that shared ordinate.
  const probes = [0, 1e-4, -1e-4, 1e-3, -1e-3];
  for (let band = 0; band < levels.length - 1; band++) {
    const bottom = levels[band], top = levels[band + 1];
    let crossings = null;
    for (const probe of probes) {
      const middle = (bottom + top) / 2 + probe * Math.max(1, top - bottom);
      if (middle <= bottom || middle >= top) continue;
      const found = edges.filter(edge => Math.min(edge.a.y, edge.b.y) < middle
        && Math.max(edge.a.y, edge.b.y) > middle)
        .map(edge => ({edge, x: at(edge, middle)}))
        .sort((a, b) => a.x - b.x || a.edge.id - b.edge.id);
      if (found.length && !(found.length % 2)) { crossings = found; break; }
      crossings ||= found;
    }
    if (!crossings) continue;
    if (crossings.length % 2) fail(`sector ${sector} has an open contour at y=${(bottom + top) / 2}`);
    for (let i = 0; i < crossings.length; i += 2) {
      const left = crossings[i], right = crossings[i + 1];
      if (right.x - left.x <= EPSILON) continue;
      const points = compactPolygon([
        {x: at(left.edge, bottom), y: bottom}, {x: at(right.edge, bottom), y: bottom},
        {x: at(right.edge, top), y: top}, {x: at(left.edge, top), y: top}
      ]);
      if (points) cells.push({sector, points});
    }
  }
  if (!cells.length) fail(`sector ${sector} has no floor area`);
  return cells;
}

function contains(cell, x, y) {
  if (x < cell.minX - EPSILON || x > cell.maxX + EPSILON
    || y < cell.minY - EPSILON || y > cell.maxY + EPSILON) return false;
  for (let i = 0; i < cell.points.length; i++) {
    const a = cell.points[i], b = cell.points[(i + 1) % cell.points.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < -EPSILON) return false;
  }
  return true;
}

/** Build new mutable sectors and fresh generated cells; the plan stays immutable. */
export function buildProceduralMap(plan) {
  if (!plan || !Array.isArray(plan.vertices) || !Array.isArray(plan.walls)
    || !Array.isArray(plan.faces) || !Array.isArray(plan.sectors) || !Array.isArray(plan.objects)) fail('incomplete construction plan');
  const vertices = plan.vertices.map(([x, y]) => {
    if (!finite(x) || !finite(y)) fail('nonfinite wall endpoint');
    return {x, y};
  });
  const planVertexCount = vertices.length;
  const lines = plan.walls.map(([v1, v2, flags, special, tag, right, left], id) => ({id, v1, v2, flags, special, tag, right, left}));
  const sides = plan.faces.map(([xOffset, yOffset, upper, lower, middle, sector], id) => ({id, xOffset, yOffset, upper, lower, middle, sector}));
  const sectors = plan.sectors.map(([floor, ceiling, floorTexture, ceilingTexture, light, special, tag], id) => ({id, floor, ceiling, floorTexture, ceilingTexture, light, special, tag}));
  const things = plan.objects.map(([x, y, angle, type, flags], id) => ({id, x, y, angle, type, flags}));
  if (vertices.length < 3 || !lines.length || !sectors.length) fail('empty construction plan');
  for (const sector of sectors) {
    if (![sector.floor, sector.ceiling, sector.light, sector.special, sector.tag].every(finite)
      || sector.ceiling < sector.floor) fail(`sector ${sector.id} has invalid dimensions`);
  }
  for (const side of sides) {
    if (!Number.isInteger(side.sector) || !sectors[side.sector]) fail(`face ${side.id} has no sector`);
    if (!finite(side.xOffset) || !finite(side.yOffset)) fail(`face ${side.id} has invalid offsets`);
  }
  const boundaries = sectors.map(() => []);
  const sharedEdges = new Map();
  for (const line of lines) {
    if (!Number.isInteger(line.v1) || !Number.isInteger(line.v2)
      || !vertices[line.v1] || !vertices[line.v2]) fail(`wall ${line.id} has an invalid endpoint`);
    for (const index of [line.right, line.left]) if (index !== -1 && (!Number.isInteger(index) || !sides[index])) fail(`wall ${line.id} has an invalid face`);
    if (line.right === -1 && line.left === -1) fail(`wall ${line.id} has no face`);
    const a = vertices[line.v1], b = vertices[line.v2];
    if (samePoint(a, b)) fail(`wall ${line.id} has zero length`);
    const front = line.right < 0 ? -1 : sides[line.right].sector;
    const back = line.left < 0 ? -1 : sides[line.left].sector;
    // A line within the same sector controls gameplay or decoration, not its footprint.
    if (front === back) continue;
    // Two-sided neighbours can describe the same contour twice; a duplicated
    // span would be paired with itself and silently erase real floor area.
    const key = line.v1 < line.v2 ? `${line.v1}:${line.v2}` : `${line.v2}:${line.v1}`;
    let edge = sharedEdges.get(key);
    if (!edge) { edge = {id: line.id, a, b}; sharedEdges.set(key, edge); }
    if (front >= 0) boundaries[front].push(edge);
    if (back >= 0) boundaries[back].push(edge);
  }

  const floorPolygons = [];
  for (const sector of sectors) floorPolygons.push(...sweepSector(sector.id, boundaries[sector.id]));
  const vertexLookup = new Map(vertices.map((point, id) => [`${point.x},${point.y}`, id]));
  const vertexId = point => {
    const key = `${point.x},${point.y}`;
    if (!vertexLookup.has(key)) { vertexLookup.set(key, vertices.length); vertices.push({...point}); }
    return vertexLookup.get(key);
  };
  const segs = [], subsectors = [], grid = new Map();
  for (const [id, cell] of floorPolygons.entries()) {
    cell.subsector = id;
    cell.minX = Math.min(...cell.points.map(p => p.x)); cell.maxX = Math.max(...cell.points.map(p => p.x));
    cell.minY = Math.min(...cell.points.map(p => p.y)); cell.maxY = Math.max(...cell.points.map(p => p.y));
    const first = segs.length, count = cell.points.length;
    for (let i = 0; i < count; i++) {
      // These are generated cell edges, including virtual sweep cuts, not authored walls.
      segs.push({v1: vertexId(cell.points[i]), v2: vertexId(cell.points[(i + 1) % count]),
        line: -1, direction: 0, offset: 0, generated: true});
    }
    subsectors.push({id, first, count, firstSeg: first, numSegs: count, sector: cell.sector, generated: true});
    for (let gx = Math.floor(cell.minX / GRID_SIZE); gx <= Math.floor(cell.maxX / GRID_SIZE); gx++) {
      for (let gy = Math.floor(cell.minY / GRID_SIZE); gy <= Math.floor(cell.maxY / GRID_SIZE); gy++) {
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(id);
      }
    }
  }
  const bounds = {
    minX: Math.min(...plan.vertices.map(p => p[0])), maxX: Math.max(...plan.vertices.map(p => p[0])),
    minY: Math.min(...plan.vertices.map(p => p[1])), maxY: Math.max(...plan.vertices.map(p => p[1]))
  };
  const subsectorAt = (x, y) => {
    if (!finite(x) || !finite(y)) fail('point coordinates must be finite');
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return -1;
    const candidates = grid.get(`${Math.floor(x / GRID_SIZE)},${Math.floor(y / GRID_SIZE)}`) || [];
    for (const id of candidates) if (contains(floorPolygons[id], x, y)) return id;
    return -1;
  };
  const subsectorSector = id => subsectors[id] ? sectors[subsectors[id].sector] : null;
  const sectorAt = (x, y) => subsectorSector(subsectorAt(x, y));
  for (const thing of things) {
    if (![thing.x, thing.y, thing.angle, thing.type, thing.flags].every(finite)) fail(`object ${thing.id} has invalid placement`);
    if (!sectorAt(thing.x, thing.y)) fail(`object ${thing.id} lies outside the generated plan`);
  }
  const initialSectors = sectors.map(s => ({...s}));
  const initialSides = sides.map(s => ({...s}));
  return {
    name: plan.name || 'GENERATED', procedural: true, generator: 'sector-trapezoid-sweep-v1',
    planVersion: plan.version || 1, planVertexCount, vertices, lines, sides, sectors, things,
    initialSectors, initialSides,
    floorPolygons, subsectors, segs, nodes: [], bounds, subsectorAt, subsectorSector, sectorAt,
    reject: null, blockmap: null, revision: 0
  };
}

export function createE1M1Map() { return buildProceduralMap(E1M1_PLAN); }

/** Build one surveyed Episode 1 level by id; unknown ids are a hard error. */
export function createEpisodeMap(id) {
  const plan = EPISODE_PLANS[id];
  if (!plan) fail(`unknown episode level ${id}`);
  return buildProceduralMap(plan);
}

export default createE1M1Map;
