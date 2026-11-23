/** Small deterministic rasterizer. Every pixel comes from geometry or noise. */
export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
export const shade = (color, light, add = 0) => color.slice(0, 3).map(value => clamp(Math.round(value * light + add), 0, 255));
export function seedOf(text) {
  let value = 2166136261;
  for (const character of String(text)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function noise(x, y, seed = 0) {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
export function smoothNoise(x, y, seed = 0, period = 256) {
  const ix = Math.floor(x), iy = Math.floor(y), px = x - ix, py = y - iy;
  const u = px * px * (3 - 2 * px), v = py * py * (3 - 2 * py);
  const n = (a, b) => noise(((a % period) + period) % period, ((b % period) + period) % period, seed);
  return (n(ix, iy) * (1 - u) + n(ix + 1, iy) * u) * (1 - v) + (n(ix, iy + 1) * (1 - u) + n(ix + 1, iy + 1) * u) * v;
}

// A stroke alphabet, described as polylines in a 4 by 6 design space.
// These are vector construction rules, not sampled font or image data.
const alphabet = {
  A: [[[0,6],[0,2],[2,0],[4,2],[4,6]],[[0,4],[4,4]]],
  B: [[[0,0],[0,6],[3,6],[4,5],[4,4],[3,3],[0,3]],[[0,0],[3,0],[4,1],[4,2],[3,3]]],
  C: [[[4,1],[3,0],[1,0],[0,1],[0,5],[1,6],[3,6],[4,5]]],
  D: [[[0,0],[0,6],[2,6],[4,4],[4,2],[2,0],[0,0]]],
  E: [[[4,0],[0,0],[0,6],[4,6]],[[0,3],[3,3]]],
  F: [[[4,0],[0,0],[0,6]],[[0,3],[3,3]]],
  G: [[[4,1],[3,0],[1,0],[0,1],[0,5],[1,6],[4,6],[4,3],[2,3]]],
  H: [[[0,0],[0,6]],[[4,0],[4,6]],[[0,3],[4,3]]],
  I: [[[0,0],[4,0]],[[2,0],[2,6]],[[0,6],[4,6]]],
  J: [[[0,0],[4,0],[4,5],[3,6],[1,6],[0,5]]],
  K: [[[0,0],[0,6]],[[4,0],[0,3],[4,6]]],
  L: [[[0,0],[0,6],[4,6]]],
  M: [[[0,6],[0,0],[2,3],[4,0],[4,6]]],
  N: [[[0,6],[0,0],[4,6],[4,0]]],
  O: [[[1,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,1],[1,0]]],
  P: [[[0,6],[0,0],[3,0],[4,1],[4,2],[3,3],[0,3]]],
  Q: [[[1,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,1],[1,0]],[[2,4],[4,6]]],
  R: [[[0,6],[0,0],[3,0],[4,1],[4,2],[3,3],[0,3]],[[2,3],[4,6]]],
  S: [[[4,0],[1,0],[0,1],[0,2],[1,3],[3,3],[4,4],[4,5],[3,6],[0,6]]],
  T: [[[0,0],[4,0]],[[2,0],[2,6]]],
  U: [[[0,0],[0,5],[1,6],[3,6],[4,5],[4,0]]],
  V: [[[0,0],[0,3],[2,6],[4,3],[4,0]]],
  W: [[[0,0],[0,6],[2,3],[4,6],[4,0]]],
  X: [[[0,0],[4,6]],[[4,0],[0,6]]],
  Y: [[[0,0],[2,3],[4,0]],[[2,3],[2,6]]],
  Z: [[[0,0],[4,0],[0,6],[4,6]]],
  '-': [[[0,3],[4,3]]], '+': [[[0,3],[4,3]],[[2,1],[2,5]]],
  '0': [[[1,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,1],[1,0]]],
  '1': [[[1,1],[2,0],[2,6]],[[1,6],[3,6]]],
  '2': [[[0,1],[1,0],[3,0],[4,1],[4,2],[0,6],[4,6]]],
  '3': [[[0,0],[3,0],[4,1],[4,5],[3,6],[0,6]],[[1,3],[4,3]]],
  '4': [[[0,0],[0,3],[4,3]],[[4,0],[4,6]]],
  '5': [[[4,0],[0,0],[0,3],[3,3],[4,4],[4,5],[3,6],[0,6]]],
  '6': [[[4,0],[1,0],[0,1],[0,5],[1,6],[3,6],[4,5],[4,4],[3,3],[0,3]]],
  '7': [[[0,0],[4,0],[1,6]]],
  '8': [[[1,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,1],[1,0]],[[0,3],[4,3]]],
  '9': [[[4,3],[1,3],[0,2],[0,1],[1,0],[3,0],[4,1],[4,5],[3,6],[0,6]]]
};

export class Raster {
  constructor(width, height, leftOffset = 0, topOffset = 0) {
    this.width = width; this.height = height;
    this.leftOffset = leftOffset; this.topOffset = topOffset;
    this.pixels = new Uint8Array(width * height * 4);
  }
  pixel(x, y, color) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const value = typeof color === 'function' ? color(x, y) : color;
    if (!value) return;
    const at = (y * this.width + x) * 4;
    this.pixels[at] = clamp(Math.round(value[0]), 0, 255);
    this.pixels[at + 1] = clamp(Math.round(value[1]), 0, 255);
    this.pixels[at + 2] = clamp(Math.round(value[2]), 0, 255);
    this.pixels[at + 3] = value[3] ?? 255;
  }
  rect(x, y, width, height, color) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(this.height, Math.ceil(y + height)); yy++)
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(this.width, Math.ceil(x + width)); xx++) this.pixel(xx, yy, color);
    return this;
  }
  ellipse(cx, cy, rx, ry, color, relief = false) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.height - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.width - 1, Math.ceil(cx + rx)); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, radius = u * u + v * v;
        if (radius > 1) continue;
        const base = typeof color === 'function' ? color(x, y) : color;
        this.pixel(x, y, relief ? shade(base, .35 + .65 * clamp(-u * .35 - v * .5 + Math.sqrt(1 - radius) * .75)) : base);
      }
    }
    return this;
  }
  line(x0, y0, x1, y1, thickness, color) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (thickness <= 1) this.pixel(Math.round(x), Math.round(y), color);
      else this.ellipse(x, y, thickness * .5, thickness * .5, color);
    }
    return this;
  }
  polygon(points, color) {
    const first = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
    const last = Math.min(this.height - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
    for (let y = first; y <= last; y++) {
      const intersections = [], py = y + .5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] > py) === (b[1] > py)) continue;
        intersections.push(a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2)
        for (let x = Math.max(0, Math.ceil(intersections[i] - .5)); x < Math.min(this.width, Math.ceil(intersections[i + 1] - .5)); x++) this.pixel(x, y, color);
    }
    return this;
  }
  bevel(x, y, width, height, color, inset = false) {
    this.rect(x, y, width, height, color);
    this.rect(x, y, width, 1, shade(color, inset ? .45 : 1.45));
    this.rect(x, y, 1, height, shade(color, inset ? .55 : 1.2));
    this.rect(x, y + height - 1, width, 1, shade(color, inset ? 1.15 : .4));
    this.rect(x + width - 1, y, 1, height, shade(color, inset ? 1.1 : .5));
    return this;
  }
  text(value, x, y, height, color, thickness = Math.max(1, height / 7), spacing = height / 6) {
    const scale = height / 6;
    for (const character of String(value).toUpperCase()) {
      for (const path of alphabet[character] || []) for (let i = 1; i < path.length; i++)
        this.line(x + path[i - 1][0] * scale, y + path[i - 1][1] * scale,
          x + path[i][0] * scale, y + path[i][1] * scale, thickness, color);
      x += 4 * scale + spacing;
    }
    return this;
  }
  result(name) { return { name, width: this.width, height: this.height, pixels: this.pixels, leftOffset: this.leftOffset, topOffset: this.topOffset }; }
}
