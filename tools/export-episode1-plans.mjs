#!/usr/bin/env node
/**
 * Development-only survey of all nine Episode 1 reference layouts.
 * This tool reads geometry and object placements, never images, audio or BSP.
 * The generated plans are committed as readable construction parameters; neither
 * this exporter nor its input file is needed to build or run the game.
 *
 * node tools/export-episode1-plans.mjs [reference/doom1.wad] [src/] [--check]
 *
 * --check compares the regenerated tables against the committed ones and exits
 * non-zero on any difference, so a reviewer can prove the survey is reproducible.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const check = process.argv.includes('--check');
const input = args[0] || fileURLToPath(new URL('../reference/doom1.wad', import.meta.url));
const outputDirectory = args[1] || fileURLToPath(new URL('../src/', import.meta.url));
const EXPECTED_SHA256 = '1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771';
const EPISODE = Array.from({length: 9}, (_, i) => `E1M${i + 1}`);
const TITLES = {
  E1M1: 'Hangar', E1M2: 'Nuclear Plant', E1M3: 'Toxin Refinery', E1M4: 'Command Control',
  E1M5: 'Phobos Lab', E1M6: 'Central Processing', E1M7: 'Computer Station',
  E1M8: 'Phobos Anomaly', E1M9: 'Military Base'
};
// Reference counts measured directly from the shareware archive. A survey that
// disagrees with any of them is a broken reader, never a different map.
const REFERENCE_COUNTS = {
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

const bytes = readFileSync(input);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(`Unexpected reference edition ${sha256}; refusing to change the surveyed layout.`);
}

const directory = bytes.readInt32LE(8), count = bytes.readInt32LE(4);
const labelAt = (buffer, offset) => buffer.toString('ascii', offset, offset + 8).split('\0')[0];
const GEOMETRY_LUMPS = ['VERTEXES', 'LINEDEFS', 'SIDEDEFS', 'SECTORS', 'THINGS'];

function lumpsFor(mapName) {
  let marker = -1;
  const lumps = new Map();
  for (let i = 0; i < count; i++) {
    const at = directory + i * 16, label = labelAt(bytes, at + 8);
    if (label === mapName) { marker = i; continue; }
    if (marker < 0) continue;
    if (/^E\dM\d$/.test(label)) break;
    if (!GEOMETRY_LUMPS.includes(label)) continue;
    lumps.set(label, bytes.subarray(bytes.readInt32LE(at), bytes.readInt32LE(at) + bytes.readInt32LE(at + 4)));
  }
  if (marker < 0) throw new Error(`Reference archive has no ${mapName} marker.`);
  for (const label of GEOMETRY_LUMPS) if (!lumps.has(label)) throw new Error(`${mapName} is missing its ${label} table.`);
  return lumps;
}

function records(lumps, label, stride, decode) {
  const data = lumps.get(label);
  if (!data || data.length % stride) throw new Error(`Invalid geometry table: ${label}`);
  return Array.from({length: data.length / stride}, (_, i) => decode(data, i * stride));
}

const noSide = index => index === 65535 ? -1 : index;
const upper = name => name.toUpperCase();
const finite = value => Number.isFinite(value);

function survey(mapName) {
  const lumps = lumpsFor(mapName);
  const originalVertices = records(lumps, 'VERTEXES', 4, (b, i) => [b.readInt16LE(i), b.readInt16LE(i + 2)]);
  const walls = records(lumps, 'LINEDEFS', 14,
    (b, i) => [b.readUInt16LE(i), b.readUInt16LE(i + 2), b.readUInt16LE(i + 4), b.readUInt16LE(i + 6),
      b.readUInt16LE(i + 8), noSide(b.readUInt16LE(i + 10)), noSide(b.readUInt16LE(i + 12))]);
  // Only wall endpoints are kept; the reference BSP vertices and segs stay unread.
  const usedVertices = [...new Set(walls.flatMap(row => row.slice(0, 2)))].sort((a, b) => a - b);
  const vertexIds = new Map(usedVertices.map((old, id) => [old, id]));
  const vertices = usedVertices.map(id => originalVertices[id]);
  for (const wall of walls) { wall[0] = vertexIds.get(wall[0]); wall[1] = vertexIds.get(wall[1]); }
  const faces = records(lumps, 'SIDEDEFS', 30,
    (b, i) => [b.readInt16LE(i), b.readInt16LE(i + 2), upper(labelAt(b, i + 4)), upper(labelAt(b, i + 12)),
      upper(labelAt(b, i + 20)), b.readUInt16LE(i + 28)]);
  const sectors = records(lumps, 'SECTORS', 26,
    (b, i) => [b.readInt16LE(i), b.readInt16LE(i + 2), upper(labelAt(b, i + 4)), upper(labelAt(b, i + 12)),
      b.readInt16LE(i + 20), b.readUInt16LE(i + 22), b.readUInt16LE(i + 24)]);
  const objects = records(lumps, 'THINGS', 10,
    (b, i) => [b.readInt16LE(i), b.readInt16LE(i + 2), b.readUInt16LE(i + 4), b.readUInt16LE(i + 6), b.readUInt16LE(i + 8)]);
  validate(mapName, {vertices, walls, faces, sectors, objects});
  return {vertices, walls, faces, sectors, objects};
}

function validate(mapName, plan) {
  const expected = REFERENCE_COUNTS[mapName];
  const measured = {vertices: plan.vertices.length, walls: plan.walls.length, faces: plan.faces.length,
    sectors: plan.sectors.length, objects: plan.objects.length};
  for (const key of Object.keys(expected)) {
    if (measured[key] !== expected[key]) {
      throw new Error(`${mapName}: ${key} count ${measured[key]} differs from the reference ${expected[key]}.`);
    }
  }
  for (const [x, y] of plan.vertices) if (!finite(x) || !finite(y)) throw new Error(`${mapName}: non-finite wall endpoint.`);
  for (const [v1, v2, , , , right, left] of plan.walls) {
    if (!Number.isInteger(v1) || !Number.isInteger(v2) || !plan.vertices[v1] || !plan.vertices[v2]) {
      throw new Error(`${mapName}: wall endpoint out of range.`);
    }
    for (const side of [right, left]) if (side !== -1 && !plan.faces[side]) throw new Error(`${mapName}: wall face out of range.`);
    if (right === -1 && left === -1) throw new Error(`${mapName}: wall without any face.`);
  }
  for (const face of plan.faces) {
    if (!Number.isInteger(face[5]) || !plan.sectors[face[5]]) throw new Error(`${mapName}: face without a sector.`);
    if (!finite(face[0]) || !finite(face[1])) throw new Error(`${mapName}: face with invalid offsets.`);
  }
  for (const sector of plan.sectors) {
    if (![sector[0], sector[1], sector[4], sector[5], sector[6]].every(finite) || sector[1] < sector[0]) {
      throw new Error(`${mapName}: sector with invalid dimensions.`);
    }
    if (typeof sector[2] !== 'string' || typeof sector[3] !== 'string') {
      throw new Error(`${mapName}: sector without a surface recipe.`);
    }
  }
  for (const object of plan.objects) {
    if (!object.every(finite)) throw new Error(`${mapName}: object with invalid placement.`);
    if (object[2] % 45) throw new Error(`${mapName}: object angle ${object[2]} is off the reference 45 degree grid.`);
  }
  if (!plan.objects.some(object => object[3] === 1)) throw new Error(`${mapName}: no single player start.`);
}

const section = (label, schema, rows) =>
  `  // ${schema}\n  ${label}: [\n${rows.map((row, id) => `    ${JSON.stringify(row)}, // ${id}`).join('\n')}\n  ],\n`;

function render(mapName, plan) {
  const header = `/**
 * ${mapName} ${TITLES[mapName]}: fixed reference layout, expressed as construction parameters.
 * Coordinates are classic map units; array indices preserve mechanism IDs.
 * Surface names are recipe identifiers only: no palette, patch, texture pixels,
 * sprite, sound, original BSP, triangulation or encoded binary is stored here.
 * Runtime floors and spatial queries are generated by procedural-map.js.
 * Re-survey with tools/export-episode1-plans.mjs; normal builds need no reference file.
 */
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};

export const ${mapName}_PLAN = freeze({
  name: '${mapName}',
  title: '${TITLES[mapName]}',
  version: 1,
`;
  return header
    + section('vertices', 'x, y; only wall endpoints, no reference BSP split vertices', plan.vertices)
    + section('walls', 'start vertex, end vertex, flags, action, tag, right face, left face', plan.walls)
    + section('faces', 'horizontal offset, vertical offset, upper recipe, lower recipe, middle recipe, sector', plan.faces)
    + section('sectors', 'floor height, ceiling height, floor recipe, ceiling recipe, light, effect, tag', plan.sectors)
    + section('objects', 'x, y, angle in degrees, archetype, difficulty/placement flags', plan.objects)
    + `});\n\nexport default ${mapName}_PLAN;\n`;
}

function renderRegistry(names) {
  const imports = names.map(name => `import {${name}_PLAN} from './${name.toLowerCase()}-plan.js';`).join('\n');
  return `/**
 * Generated plan registry. Every entry was surveyed OFFLINE from the verified
 * shareware reference by tools/export-episode1-plans.mjs and passed its table
 * counts, so the game can offer the level. A missing entry means the level is
 * not playable and the menu must never advertise it.
 */
${imports}

export const EPISODE_PLANS = Object.freeze({
${names.map(name => `  ${name}: ${name}_PLAN`).join(',\n')}
});

export default EPISODE_PLANS;
`;
}

const written = [];
for (const mapName of EPISODE) {
  const plan = survey(mapName);
  const text = render(mapName, plan);
  const target = resolve(outputDirectory, `${mapName.toLowerCase()}-plan.js`);
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (previous !== text) {
    if (check) throw new Error(`${mapName}: committed plan differs from the reproducible survey.`);
    writeFileSync(target, text);
    written.push(mapName);
  }
  console.log(`${mapName}: ${plan.vertices.length} vertices, ${plan.walls.length} walls, ${plan.faces.length} faces, `
    + `${plan.sectors.length} sectors, ${plan.objects.length} things. No media or BSP.`);
}
const registry = resolve(outputDirectory, 'episode-plans.js');
const registryText = renderRegistry(EPISODE);
if (existsSync(registry) && readFileSync(registry, 'utf8') === registryText) {
  console.log('episode-plans.js already registers the nine surveyed levels.');
} else if (check) {
  throw new Error('episode-plans.js differs from the generated registry.');
} else {
  writeFileSync(registry, registryText);
  written.push('episode-plans.js');
}
console.log(written.length ? `Wrote ${written.join(', ')}.` : 'All plans already reproducible.');
