/**
 * Doom IWAD/PWAD reader. No network access and no external dependencies.
 * The original bytes, map coordinates, palette and resource names are preserved.
 * Binary record layouts follow id Software's linuxdoom-1.10/doomdata.h,
 * r_data.c and p_setup.c: https://github.com/id-Software/DOOM
 */
const ascii = new TextDecoder('ascii');
const MAP_LUMPS = ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS'];
const MAX_PIXELS = 16 * 1024 * 1024;
const EMPTY_SIDE = 0xffff;

function fail(message) { throw new Error(`WAD: ${message}`); }
function ensure(condition, message) { if (!condition) fail(message); }
function checkedRange(offset, size, length, label) {
  ensure(Number.isInteger(offset) && Number.isInteger(size) && offset >= 0 && size >= 0 && offset <= length && size <= length - offset, `${label} outside file bounds`);
}
function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function nameAt(bytes, offset, length = 8) {
  checkedRange(offset, length, bytes.length, 'name');
  const data = bytes.subarray(offset, offset + length);
  const end = data.indexOf(0);
  return ascii.decode(end < 0 ? data : data.subarray(0, end)).toUpperCase();
}
function imageSize(width, height, label) {
  ensure(width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= MAX_PIXELS, `${label} has invalid image dimensions`);
}
function sideIndex(value) { return value === EMPTY_SIDE ? -1 : value; }
function validIndex(index, array, label) { ensure(index >= 0 && index < array.length, `${label} index ${index} out of range`); }

/** The same right=0 / left=1 convention as Doom's R_PointOnSide. */
export function pointOnNodeSide(x, y, node) {
  if (!node.dx) return x <= node.x ? +(node.dy > 0) : +(node.dy < 0);
  if (!node.dy) return y <= node.y ? +(node.dx < 0) : +(node.dx > 0);
  return (y - node.y) * node.dx < (x - node.x) * node.dy ? 0 : 1;
}

export class Wad {
  constructor(buffer) {
    ensure(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer), 'expected ArrayBuffer or typed array');
    this.bytes = buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    ensure(this.bytes.length >= 12, 'header is truncated');
    const header = view(this.bytes);
    this.kind = ascii.decode(this.bytes.subarray(0, 4));
    ensure(this.kind === 'IWAD' || this.kind === 'PWAD', 'invalid magic; expected IWAD or PWAD');
    const count = header.getInt32(4, true);
    const directory = header.getInt32(8, true);
    ensure(count >= 0 && count <= 100000, 'invalid lump count');
    checkedRange(directory, count * 16, this.bytes.length, 'directory');
    this.entries = [];
    this.byName = new Map();
    for (let i = 0; i < count; i++) {
      const at = directory + i * 16;
      const offset = header.getInt32(at, true);
      const size = header.getInt32(at + 4, true);
      checkedRange(offset, size, this.bytes.length, `lump ${i}`);
      const entry = {name: nameAt(this.bytes, at + 8), offset, size, index: i};
      this.entries.push(entry);
      this.byName.set(entry.name, entry); // Doom uses the last duplicate lump.
    }
    const palettes = this.get('PLAYPAL');
    this.palette = palettes && palettes.length >= 768 ? palettes.subarray(0, 768) : null;
    this.patchCache = new Map();
    this.flatCache = new Map();
    this.textureCache = new Map();
    this.mapCache = new Map();
    this.soundCache = new Map();
    this.textureDefinitions = null;
  }

  /** Returns a read-only-by-convention view of the original lump, or null. */
  get(name) {
    const entry = this.byName.get(String(name).toUpperCase());
    return entry ? this.bytes.subarray(entry.offset, entry.offset + entry.size) : null;
  }

  has(name) { return this.byName.has(String(name).toUpperCase()); }

  /** Decode a Doom column/post picture (sprites, HUD patches and wall patches). */
  patch(name) {
    name = String(name).toUpperCase();
    if (this.patchCache.has(name)) return this.patchCache.get(name);
    const bytes = this.get(name);
    if (!bytes) return null;
    ensure(this.palette, 'PLAYPAL is missing or truncated');
    ensure(bytes.length >= 8, `${name} picture header is truncated`);
    const data = view(bytes);
    const width = data.getUint16(0, true), height = data.getUint16(2, true);
    imageSize(width, height, name);
    checkedRange(8, width * 4, bytes.length, `${name} column directory`);
    const pixels = new Uint8Array(width * height * 4);
    const palette = this.palette;
    for (let x = 0; x < width; x++) {
      let cursor = data.getUint32(8 + x * 4, true);
      ensure(cursor >= 8 + width * 4 && cursor < bytes.length, `${name} column offset is invalid`);
      let previousTop = -1;
      let terminated = false;
      while (cursor < bytes.length) {
        const delta = bytes[cursor++];
        if (delta === 255) { terminated = true; break; }
        checkedRange(cursor, 2, bytes.length, `${name} post header`);
        const length = bytes[cursor++];
        cursor++; // Unused byte before the post.
        checkedRange(cursor, length + 1, bytes.length, `${name} post pixels`);
        // Tall-patch relative posts remain compatible with vanilla pictures.
        const top = delta <= previousTop ? previousTop + delta : delta;
        previousTop = top;
        for (let dy = 0; dy < length; dy++) {
          const y = top + dy;
          if (y >= height) continue;
          const index = bytes[cursor + dy] * 3;
          const dest = (y * width + x) * 4;
          pixels[dest] = palette[index];
          pixels[dest + 1] = palette[index + 1];
          pixels[dest + 2] = palette[index + 2];
          pixels[dest + 3] = 255;
        }
        cursor += length + 1; // Includes unused trailing byte.
      }
      ensure(terminated, `${name} column is missing its terminator`);
    }
    const result = {name, width, height, pixels, leftOffset: data.getInt16(4, true), topOffset: data.getInt16(6, true)};
    this.patchCache.set(name, result);
    return result;
  }

  flat(name) {
    name = String(name).toUpperCase();
    if (this.flatCache.has(name)) return this.flatCache.get(name);
    const bytes = this.get(name);
    if (!bytes) return null;
    ensure(bytes.length === 4096, `${name} flat must contain 4096 palette indices`);
    ensure(this.palette, 'PLAYPAL is missing or truncated');
    const pixels = new Uint8Array(4096 * 4);
    for (let i = 0; i < 4096; i++) {
      const source = bytes[i] * 3, target = i * 4;
      pixels[target] = this.palette[source];
      pixels[target + 1] = this.palette[source + 1];
      pixels[target + 2] = this.palette[source + 2];
      pixels[target + 3] = 255;
    }
    const result = {name, width: 64, height: 64, pixels, leftOffset: 0, topOffset: 0};
    this.flatCache.set(name, result);
    return result;
  }

  readTextureDefinitions() {
    if (this.textureDefinitions) return this.textureDefinitions;
    const pnames = this.get('PNAMES');
    ensure(pnames && pnames.length >= 4, 'PNAMES is missing or truncated');
    const namesData = view(pnames), count = namesData.getInt32(0, true);
    ensure(count >= 0 && count <= 100000, 'invalid PNAMES count');
    checkedRange(4, count * 8, pnames.length, 'PNAMES');
    const names = Array.from({length: count}, (_, i) => nameAt(pnames, 4 + i * 8));
    const definitions = new Map();
    for (const lumpName of ['TEXTURE1', 'TEXTURE2']) {
      const bytes = this.get(lumpName);
      if (!bytes) continue;
      ensure(bytes.length >= 4, `${lumpName} header is truncated`);
      const data = view(bytes), textureCount = data.getInt32(0, true);
      ensure(textureCount >= 0 && textureCount <= 100000, `${lumpName} count is invalid`);
      checkedRange(4, textureCount * 4, bytes.length, `${lumpName} directory`);
      for (let i = 0; i < textureCount; i++) {
        const offset = data.getInt32(4 + i * 4, true);
        checkedRange(offset, 22, bytes.length, `${lumpName} texture`);
        const name = nameAt(bytes, offset);
        const width = data.getInt16(offset + 12, true), height = data.getInt16(offset + 14, true);
        imageSize(width, height, name);
        const patchCount = data.getInt16(offset + 20, true);
        ensure(patchCount >= 0, `${name} patch count is invalid`);
        checkedRange(offset + 22, patchCount * 10, bytes.length, `${name} patches`);
        const patches = [];
        for (let p = 0; p < patchCount; p++) {
          const at = offset + 22 + p * 10;
          const patchIndex = data.getUint16(at + 4, true);
          validIndex(patchIndex, names, `${name} patch`);
          patches.push({x: data.getInt16(at, true), y: data.getInt16(at + 2, true), name: names[patchIndex]});
        }
        definitions.set(name, {name, width, height, patches});
      }
    }
    this.textureDefinitions = definitions;
    return definitions;
  }

  /** Assemble a wall texture from its original PNAMES patch placements. */
  texture(name) {
    name = String(name).toUpperCase();
    if (name === '-' || !name) return null;
    if (this.textureCache.has(name)) return this.textureCache.get(name);
    const definition = this.readTextureDefinitions().get(name);
    if (!definition) return null;
    const {width, height} = definition;
    const pixels = new Uint8Array(width * height * 4);
    for (const placement of definition.patches) {
      const patch = this.patch(placement.name);
      ensure(patch, `missing patch ${placement.name} for texture ${name}`);
      const startX = Math.max(0, -placement.x), endX = Math.min(patch.width, width - placement.x);
      const startY = Math.max(0, -placement.y), endY = Math.min(patch.height, height - placement.y);
      for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) {
        const source = (y * patch.width + x) * 4;
        if (!patch.pixels[source + 3]) continue;
        const target = ((y + placement.y) * width + x + placement.x) * 4;
        pixels[target] = patch.pixels[source];
        pixels[target + 1] = patch.pixels[source + 1];
        pixels[target + 2] = patch.pixels[source + 2];
        pixels[target + 3] = 255;
      }
    }
    const result = {name, width, height, pixels, leftOffset: 0, topOffset: 0};
    this.textureCache.set(name, result);
    return result;
  }

  /** Decode a format-3 DMX digital sound to Web Audio-compatible PCM. */
  sound(name) {
    name = String(name).toUpperCase();
    if (this.soundCache.has(name)) return this.soundCache.get(name);
    const bytes = this.get(name);
    if (!bytes) return null;
    ensure(bytes.length >= 8, `${name} sound header is truncated`);
    const data = view(bytes), format = data.getUint16(0, true);
    ensure(format === 3, `${name} is not a DMX PCM sound`);
    const sampleRate = data.getUint16(2, true), count = data.getUint32(4, true);
    ensure(sampleRate > 0, `${name} sample rate is invalid`);
    checkedRange(8, count, bytes.length, `${name} PCM samples`);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) samples[i] = (bytes[i + 8] - 128) / 128;
    const result = {name, sampleRate, samples};
    this.soundCache.set(name, result);
    return result;
  }

  map(name = 'E1M1') {
    name = String(name).toUpperCase();
    if (this.mapCache.has(name)) return this.mapCache.get(name);
    const marker = this.byName.get(name);
    ensure(marker, `map ${name} is missing`);
    const lumps = new Map();
    for (let i = marker.index + 1; i < this.entries.length && i <= marker.index + 10; i++) {
      const entry = this.entries[i];
      if (/^(E\dM\d|MAP\d\d)$/.test(entry.name)) break;
      lumps.set(entry.name, this.bytes.subarray(entry.offset, entry.offset + entry.size));
    }
    for (const expected of MAP_LUMPS) ensure(lumps.has(expected), `${name} is missing ${expected}`);
    const records = (lumpName, stride, decode) => {
      const bytes = lumps.get(lumpName);
      ensure(bytes.length % stride === 0, `${name}/${lumpName} record is truncated`);
      const data = view(bytes);
      return Array.from({length: bytes.length / stride}, (_, i) => decode(data, i * stride, bytes, i));
    };
    const vertices = records('VERTEXES', 4, (d, o) => ({x: d.getInt16(o, true), y: d.getInt16(o + 2, true)}));
    const lines = records('LINEDEFS', 14, (d, o, b, id) => ({id, v1: d.getUint16(o, true), v2: d.getUint16(o + 2, true), flags: d.getUint16(o + 4, true), special: d.getUint16(o + 6, true), tag: d.getUint16(o + 8, true), right: sideIndex(d.getUint16(o + 10, true)), left: sideIndex(d.getUint16(o + 12, true))}));
    const sides = records('SIDEDEFS', 30, (d, o, b, id) => ({id, xOffset: d.getInt16(o, true), yOffset: d.getInt16(o + 2, true), upper: nameAt(b, o + 4), lower: nameAt(b, o + 12), middle: nameAt(b, o + 20), sector: d.getUint16(o + 28, true)}));
    const sectors = records('SECTORS', 26, (d, o, b, id) => ({id, floor: d.getInt16(o, true), ceiling: d.getInt16(o + 2, true), floorTexture: nameAt(b, o + 4), ceilingTexture: nameAt(b, o + 12), light: d.getInt16(o + 20, true), special: d.getUint16(o + 22, true), tag: d.getUint16(o + 24, true)}));
    const things = records('THINGS', 10, (d, o, b, id) => ({id, x: d.getInt16(o, true), y: d.getInt16(o + 2, true), angle: d.getUint16(o + 4, true), type: d.getUint16(o + 6, true), flags: d.getUint16(o + 8, true)}));
    const segs = records('SEGS', 12, (d, o) => ({v1: d.getUint16(o, true), v2: d.getUint16(o + 2, true), angle: d.getUint16(o + 4, true), line: d.getUint16(o + 6, true), direction: d.getUint16(o + 8, true), offset: d.getUint16(o + 10, true)}));
    const subsectors = records('SSECTORS', 4, (d, o, b, id) => { const count = d.getUint16(o, true), first = d.getUint16(o + 2, true); return {id, count, first, numSegs: count, firstSeg: first, sector: -1}; });
    const boxAt = (d, o) => ({top: d.getInt16(o, true), bottom: d.getInt16(o + 2, true), left: d.getInt16(o + 4, true), right: d.getInt16(o + 6, true)});
    const nodes = records('NODES', 28, (d, o) => { const rightChild = d.getUint16(o + 24, true), leftChild = d.getUint16(o + 26, true); return {x: d.getInt16(o, true), y: d.getInt16(o + 2, true), dx: d.getInt16(o + 4, true), dy: d.getInt16(o + 6, true), rightBox: boxAt(d, o + 8), leftBox: boxAt(d, o + 16), rightChild, leftChild, children: [rightChild, leftChild]}; });
    ensure(vertices.length && sectors.length && subsectors.length, `${name} has no playable geometry`);
    for (const side of sides) validIndex(side.sector, sectors, `${name} sidedef sector`);
    for (const line of lines) {
      validIndex(line.v1, vertices, `${name} linedef vertex`);
      validIndex(line.v2, vertices, `${name} linedef vertex`);
      ensure(line.right !== -1 || line.left !== -1, `${name} linedef has no sidedef`);
      if (line.right !== -1) validIndex(line.right, sides, `${name} linedef right sidedef`);
      if (line.left !== -1) validIndex(line.left, sides, `${name} linedef left sidedef`);
    }
    for (const seg of segs) {
      validIndex(seg.v1, vertices, `${name} seg vertex`);
      validIndex(seg.v2, vertices, `${name} seg vertex`);
      validIndex(seg.line, lines, `${name} seg linedef`);
      ensure(seg.direction === 0 || seg.direction === 1, `${name} seg direction is invalid`);
    }
    for (const leaf of subsectors) {
      ensure(leaf.count > 0, `${name} has an empty subsector`);
      checkedRange(leaf.first, leaf.count, segs.length, `${name} subsector segs`);
      const seg = segs[leaf.first], line = lines[seg.line];
      const index = seg.direction ? line.left : line.right;
      validIndex(index, sides, `${name} subsector sidedef`);
      leaf.sector = sides[index].sector;
    }
    for (let i = 0; i < nodes.length; i++) for (const child of nodes[i].children) {
      if (child & 0x8000) validIndex(child & 0x7fff, subsectors, `${name} BSP subsector`);
      else { validIndex(child, nodes, `${name} BSP node`); ensure(child < i, `${name} BSP nodes are cyclic or not in child-first order`); }
    }
    const subsectorAt = (x, y) => {
      ensure(Number.isFinite(x) && Number.isFinite(y), `${name} point must be finite`);
      if (!nodes.length) return 0;
      let nodeIndex = nodes.length - 1;
      for (let steps = 0; steps <= nodes.length; steps++) {
        if (nodeIndex & 0x8000) return nodeIndex & 0x7fff;
        const node = nodes[nodeIndex];
        nodeIndex = node.children[pointOnNodeSide(x, y, node)];
      }
      fail(`${name} BSP traversal did not terminate`);
    };
    const subsectorSector = index => { validIndex(index, subsectors, `${name} subsector`); return sectors[subsectors[index].sector]; };
    const sectorAt = (x, y) => subsectorSector(subsectorAt(x, y));
    const bounds = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
    for (const p of vertices) { bounds.minX = Math.min(bounds.minX, p.x); bounds.minY = Math.min(bounds.minY, p.y); bounds.maxX = Math.max(bounds.maxX, p.x); bounds.maxY = Math.max(bounds.maxY, p.y); }
    const result = {name, vertices, lines, sides, sectors, things, segs, subsectors, nodes, bounds, subsectorAt, subsectorSector, sectorAt, reject: lumps.get('REJECT') || null, blockmap: lumps.get('BLOCKMAP') || null};
    this.mapCache.set(name, result);
    return result;
  }
}

export default Wad;
