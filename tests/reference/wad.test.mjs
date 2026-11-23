import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Wad, pointOnNodeSide} from '../../reference/wad.js';

const source = readFileSync(new URL('../../reference/doom1.wad', import.meta.url));
const wad = new Wad(source);

function makeWad(lumps, kind = 'PWAD') {
  const size = 12 + lumps.reduce((sum, [, bytes]) => sum + bytes.length, 0);
  const data = Buffer.alloc(size + lumps.length * 16);
  data.write(kind, 0, 4, 'ascii');
  data.writeInt32LE(lumps.length, 4);
  data.writeInt32LE(size, 8);
  let cursor = 12;
  lumps.forEach(([name, bytes], index) => {
    Buffer.from(bytes).copy(data, cursor);
    const entry = size + index * 16;
    data.writeInt32LE(cursor, entry);
    data.writeInt32LE(bytes.length, entry + 4);
    data.write(name, entry + 8, 8, 'ascii');
    cursor += bytes.length;
  });
  return data;
}

function makePalette() {
  const palette = Buffer.alloc(768);
  for (let i = 0; i < 256; i++) { palette[i * 3] = i; palette[i * 3 + 1] = 255 - i; palette[i * 3 + 2] = i % 13; }
  return palette;
}

function tinyPatch() {
  // 2x3, left=-2, top=7; first column has one opaque pixel at y=1;
  // second column has opaque pixels at y=0 and y=1. Others transparent.
  const bytes = Buffer.alloc(29);
  bytes.writeUInt16LE(2, 0); bytes.writeUInt16LE(3, 2);
  bytes.writeInt16LE(-2, 4); bytes.writeInt16LE(7, 6);
  bytes.writeUInt32LE(16, 8); bytes.writeUInt32LE(22, 12);
  bytes.set([1, 1, 0, 10, 0, 255], 16);
  bytes.set([0, 2, 0, 20, 30, 0, 255], 22);
  return bytes;
}

function textureLumps() {
  const names = Buffer.alloc(12); names.writeInt32LE(1); names.write('PATCH', 4);
  const texture = Buffer.alloc(40);
  texture.writeInt32LE(1); texture.writeInt32LE(8, 4);
  texture.write('COMPOSED', 8); texture.writeInt16LE(3, 20); texture.writeInt16LE(3, 22);
  texture.writeInt16LE(1, 28); texture.writeInt16LE(1, 30); texture.writeInt16LE(0, 32);
  texture.writeInt16LE(0, 34); // patch 0 at x=1,y=0.
  return [['PNAMES', names], ['TEXTURE1', texture]];
}

test('research reference is the complete authentic Doom v1.9 shareware IWAD', () => {
  assert.equal(source.length, 4196020);
  assert.equal(createHash('md5').update(source).digest('hex'), 'f0cefca49926d00903cf57551d901abe');
  assert.equal(createHash('sha256').update(source).digest('hex'), '1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771');
  assert.equal(wad.kind, 'IWAD');
  assert.equal(wad.entries.length, 1264);
  for (let level = 1; level <= 9; level++) assert(wad.has(`E1M${level}`));
  assert.equal(wad.has('E2M1'), false);
});

test('E1M1 retains every original map record and its exact player spawn', () => {
  const map = wad.map('E1M1');
  const expected = {things: 138, lines: 475, sides: 648, vertices: 467, segs: 732, subsectors: 237, nodes: 236, sectors: 85};
  for (const [name, count] of Object.entries(expected)) assert.equal(map[name].length, count, name);
  const player = map.things.find(thing => thing.type === 1);
  assert.deepEqual({x: player.x, y: player.y, angle: player.angle, flags: player.flags}, {x: 1056, y: -3616, angle: 90, flags: 7});
  const sector = map.sectorAt(player.x, player.y);
  assert.equal(sector.id, 38);
  assert.equal(sector.floor, 0);
  assert.equal(sector.ceiling, 72);
  assert.equal(sector.floorTexture, 'FLOOR4_8');
  assert.equal(sector.ceilingTexture, 'CEIL3_5');
  assert.equal(map.subsectorSector(map.subsectorAt(player.x, player.y)), sector);
});

test('every E1M1 wall and non-sky flat resolves from original palette resources', () => {
  const map = wad.map();
  const walls = new Set(map.sides.flatMap(side => [side.upper, side.middle, side.lower]).filter(name => name !== '-'));
  assert.equal(walls.size, 32);
  for (const name of walls) {
    const image = wad.texture(name);
    assert(image, name);
    assert.equal(image.pixels.length, image.width * image.height * 4, name);
    assert(image.pixels.some((value, i) => i % 4 === 3 && value === 255), `${name} must not be empty`);
  }
  const flats = new Set(map.sectors.flatMap(sector => [sector.floorTexture, sector.ceilingTexture]).filter(name => name !== 'F_SKY1'));
  assert.equal(flats.size, 21);
  for (const name of flats) assert.equal(wad.flat(name).pixels.length, 16384, name);
  assert(wad.texture('SKY1'));
});

test('original sprites and HUD retain picture offsets and transparent pixels', () => {
  assert.equal(wad.patch('TITLEPIC').width, 320);
  assert.equal(wad.patch('TITLEPIC').height, 200);
  assert.equal(wad.patch('STBAR').height, 32);
  const player = wad.patch('PLAYA1');
  assert.equal(player.width, 41);
  assert.equal(player.height, 56);
  assert(player.pixels.some((value, i) => i % 4 === 3 && value === 0));
  assert(player.pixels.some((value, i) => i % 4 === 3 && value === 255));
  assert.equal(wad.patch('PLAYA1'), player, 'decoded pictures are cached');
});

test('DMX sounds decode real sample rate and sample count without invented samples', () => {
  const sound = wad.sound('DSPISTOL');
  assert.equal(sound.sampleRate, 11025);
  assert.equal(sound.samples.length, 5661);
  const raw = wad.get('DSPISTOL');
  for (const i of [0, 16, 100, 1000, 5660]) assert.equal(sound.samples[i], (raw[i + 8] - 128) / 128);
  assert(sound.samples.every(sample => sample >= -1 && sample < 1));
});

test('synthetic posts preserve holes, row orientation, palette and signed offsets', () => {
  const small = new Wad(makeWad([['PLAYPAL', makePalette()], ['PATCH', tinyPatch()]]));
  const image = small.patch('patch');
  assert.equal(image.leftOffset, -2);
  assert.equal(image.topOffset, 7);
  const pixel = (x, y) => Array.from(image.pixels.subarray((y * 2 + x) * 4, (y * 2 + x + 1) * 4));
  assert.deepEqual(pixel(0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(0, 1), [10, 245, 10, 255]);
  assert.deepEqual(pixel(1, 0), [20, 235, 7, 255]);
  assert.deepEqual(pixel(1, 1), [30, 225, 4, 255]);
  assert.deepEqual(pixel(1, 2), [0, 0, 0, 0]);
});

test('TEXTURE1 uses patch origins independently of sprite drawing offsets', () => {
  const small = new Wad(makeWad([['PLAYPAL', makePalette()], ['PATCH', tinyPatch()], ...textureLumps()]));
  const image = small.texture('COMPOSED');
  assert.equal(image.width, 3); assert.equal(image.height, 3);
  const pixel = (x, y) => Array.from(image.pixels.subarray((y * 3 + x) * 4, (y * 3 + x + 1) * 4));
  assert.deepEqual(pixel(0, 1), [0, 0, 0, 0]);
  assert.deepEqual(pixel(1, 1), [10, 245, 10, 255]);
  assert.deepEqual(pixel(2, 0), [20, 235, 7, 255]);
  assert.equal(small.texture('-'), null);
  assert.equal(small.texture('ABSENT'), null);
});

test('duplicate lump lookup and typed array slices obey actual WAD bounds', () => {
  const bytes = makeWad([['DUP', [1]], ['DUP', [2, 3]]]);
  const padded = Buffer.concat([Buffer.alloc(10, 0xff), bytes, Buffer.alloc(9)]);
  const small = new Wad(padded.subarray(10, 10 + bytes.length));
  assert.deepEqual(Array.from(small.get('dup')), [2, 3]);
  assert.equal(small.get('MISSING'), null);
});

test('invalid headers, directories and lump ranges fail explicitly', () => {
  assert.throws(() => new Wad(new Uint8Array(11)), /header is truncated/);
  const magic = makeWad([]); magic.write('BAD!', 0); assert.throws(() => new Wad(magic), /invalid magic/);
  const directory = makeWad([]); directory.writeInt32LE(100, 4); assert.throws(() => new Wad(directory), /directory outside/);
  const lump = makeWad([['BAD', [1]]]); lump.writeInt32LE(500, lump.readInt32LE(8)); assert.throws(() => new Wad(lump), /lump 0 outside/);
});

test('malformed image posts and malformed texture references cannot read past a lump', () => {
  const broken = tinyPatch(); broken.writeUInt32LE(999, 8);
  const small = new Wad(makeWad([['PLAYPAL', makePalette()], ['PATCH', broken]]));
  assert.throws(() => small.patch('PATCH'), /column offset is invalid/);
  const entries = textureLumps(); entries[1][1].writeInt16LE(7, 34);
  const badTexture = new Wad(makeWad([['PLAYPAL', makePalette()], ['PATCH', tinyPatch()], ...entries]));
  assert.throws(() => badTexture.texture('COMPOSED'), /patch index 7 out of range/);
});

test('BSP axis-aligned and diagonal partitions use Doom right/left convention', () => {
  assert.equal(pointOnNodeSide(1, 0, {x: 0, y: 0, dx: 0, dy: 10}), 0);
  assert.equal(pointOnNodeSide(-1, 0, {x: 0, y: 0, dx: 0, dy: 10}), 1);
  assert.equal(pointOnNodeSide(0, -1, {x: 0, y: 0, dx: 10, dy: 0}), 0);
  assert.equal(pointOnNodeSide(0, 1, {x: 0, y: 0, dx: 10, dy: 0}), 1);
  assert.equal(pointOnNodeSide(10, 1, {x: 0, y: 0, dx: 10, dy: 10}), 0);
  assert.equal(pointOnNodeSide(1, 10, {x: 0, y: 0, dx: 10, dy: 10}), 1);
  assert.throws(() => wad.map().sectorAt(NaN, 0), /point must be finite/);
});

test('damaged map vertex references and BSP cycles fail before game startup', () => {
  const mapIndex = wad.entries.findIndex(entry => entry.name === 'E1M1');
  const lineEntry = wad.entries[mapIndex + 2];
  const invalidVertex = Buffer.from(source);
  invalidVertex.writeUInt16LE(65535, lineEntry.offset);
  assert.throws(() => new Wad(invalidVertex).map(), /linedef vertex index 65535 out of range/);
  const nodeEntry = wad.entries[mapIndex + 7];
  const cyclic = Buffer.from(source);
  cyclic.writeUInt16LE(235, nodeEntry.offset + 235 * 28 + 24);
  assert.throws(() => new Wad(cyclic).map(), /BSP nodes are cyclic/);
});
