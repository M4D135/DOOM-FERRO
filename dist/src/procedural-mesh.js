/** Procedural triangle primitives. Local axes: X right, Y forward, Z up. */
const EPS = 1e-10;
const TAU = Math.PI * 2;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => { const length = Math.hypot(...a); return length > EPS ? a.map(v => v / length) : [0, 0, 1]; };
const plus = (a, b) => a.map((v, i) => v + b[i]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function vector(value, label) {
  if (!value || value.length < 3 || ![value[0], value[1], value[2]].every(Number.isFinite)) throw new Error(`MeshBuilder: invalid ${label}`);
  return [value[0], value[1], value[2]];
}

/** Euler radians, applied X then Y then Z, about the local origin. */
export function rotateEuler(point, rotation = [0, 0, 0]) {
  const [rx, ry, rz] = rotation;
  let [x, y, z] = point;
  if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y*c-z*s, y*s+z*c]; }
  if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x*c+z*s, -x*s+z*c]; }
  if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x*c-y*s, x*s+y*c]; }
  return [x, y, z];
}

export class MeshBuilder {
  constructor() { this.data = []; }

  _triangle(a, b, c, color, emissive = 0, normals = null) {
    const face = cross(sub(b, a), sub(c, a));
    if (Math.hypot(...face) <= EPS) return this;
    const normal = unit(face), points = [a, b, c];
    for (let i = 0; i < 3; i++) this.data.push(...points[i], ...(normals ? unit(normals[i]) : normal), ...color, emissive);
    return this;
  }

  triangle(a, b, c, color, options = {}) {
    const points = [a, b, c].map(p => vector(p, 'triangle point'));
    const rgb = vector(color, 'color');
    if (options.rotation) for (let i = 0; i < 3; i++) points[i] = rotateEuler(points[i], vector(options.rotation, 'rotation'));
    return this._triangle(...points, rgb, options.emissive || 0);
  }

  box(center, size, color, options = {}) {
    center = vector(center, 'box center'); size = vector(size, 'box size'); color = vector(color, 'color');
    if (size.some(v => v <= 0)) throw new Error('MeshBuilder: box dimensions must be positive');
    const rotation = options.rotation ? vector(options.rotation, 'rotation') : [0, 0, 0];
    const signs = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const corners = signs.map(sign => plus(center, rotateEuler(sign.map((v, i) => v * size[i] / 2), rotation)));
    for (const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]]) {
      this._triangle(corners[a],corners[b],corners[c],color,options.emissive || 0);
      this._triangle(corners[a],corners[c],corners[d],color,options.emissive || 0);
    }
    return this;
  }

  ellipsoid(center, radii, color, options = {}) {
    center = vector(center, 'ellipsoid center'); radii = vector(radii, 'ellipsoid radii'); color = vector(color, 'color');
    if (radii.some(v => v <= 0)) throw new Error('MeshBuilder: ellipsoid radii must be positive');
    const segments = clamp(Math.round(options.segments ?? 10), 3, 96), rings = clamp(Math.round(options.rings ?? 6), 2, 64);
    const rotation = options.rotation ? vector(options.rotation, 'rotation') : [0, 0, 0];
    const rows = [];
    for (let row = 0; row <= rings; row++) {
      const phi = Math.PI * row / rings, points = [];
      for (let column = 0; column <= segments; column++) {
        const theta = TAU * (column % segments) / segments;
        const direction = [Math.sin(phi)*Math.cos(theta), Math.sin(phi)*Math.sin(theta), Math.cos(phi)];
        const local = direction.map((v, i) => v * radii[i]);
        points.push({p: plus(center, rotateEuler(local, rotation)), n: unit(rotateEuler(direction.map((v, i) => v / radii[i]), rotation))});
      }
      rows.push(points);
    }
    const emit = (a, b, c) => this._triangle(a.p,b.p,c.p,color,options.emissive || 0,[a.n,b.n,c.n]);
    for (let row = 0; row < rings; row++) for (let column = 0; column < segments; column++) {
      const a = rows[row][column], b = rows[row][column+1], c = rows[row+1][column+1], d = rows[row+1][column];
      emit(a,d,c); emit(a,c,b);
    }
    return this;
  }

  cylinder(from, to, radius, color, options = {}) {
    from = vector(from, 'cylinder start'); to = vector(to, 'cylinder end'); color = vector(color, 'color');
    const height = Math.hypot(...sub(to, from)), topRadius = options.topRadius ?? radius;
    if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(topRadius) || topRadius < 0) throw new Error('MeshBuilder: cylinder radii must be nonnegative');
    if (height <= EPS || (radius === 0 && topRadius === 0)) return this;
    const segments = clamp(Math.round(options.segments ?? 12), 3, 96);
    const axis = unit(sub(to, from)), reference = Math.abs(axis[2]) < .9 ? [0,0,1] : [0,1,0];
    const u = unit(cross(reference, axis)), v = cross(axis, u), bottom = [], top = [], normals = [];
    for (let i = 0; i <= segments; i++) {
      const angle = TAU * (i % segments) / segments;
      const radial = u.map((value, k) => value * Math.cos(angle) + v[k] * Math.sin(angle));
      bottom.push(from.map((value, k) => value + radial[k] * radius));
      top.push(to.map((value, k) => value + radial[k] * topRadius));
      normals.push(unit(radial.map((value, k) => value + axis[k] * (radius - topRadius) / height)));
    }
    const emissive = options.emissive || 0;
    for (let i = 0; i < segments; i++) {
      this._triangle(bottom[i],bottom[i+1],top[i+1],color,emissive,[normals[i],normals[i+1],normals[i+1]]);
      this._triangle(bottom[i],top[i+1],top[i],color,emissive,[normals[i],normals[i+1],normals[i]]);
      if (options.cap !== false) {
        const down = axis.map(value => -value);
        this._triangle(from,bottom[i+1],bottom[i],color,emissive,[down,down,down]);
        this._triangle(to,top[i],top[i+1],color,emissive,[axis,axis,axis]);
      }
    }
    return this;
  }

  cone(from, to, radius, color, options = {}) { return this.cylinder(from,to,radius,color,{...options,topRadius:0}); }

  add(mesh, {translation = [0,0,0], rotation = [0,0,0], scale = 1} = {}) {
    if (!mesh || mesh.stride !== 10 || !mesh.vertices || mesh.vertices.length % 30) throw new Error('MeshBuilder: incompatible mesh');
    translation = vector(translation, 'translation'); rotation = vector(rotation, 'rotation');
    scale = typeof scale === 'number' ? [scale,scale,scale] : vector(scale, 'scale');
    if (!scale.every(Number.isFinite) || scale.some(value => Math.abs(value) <= EPS)) throw new Error('MeshBuilder: scale must be finite and nonzero');
    const reflected = scale[0] * scale[1] * scale[2] < 0;
    for (let at = 0; at < mesh.vertices.length; at += 30) {
      for (const vertex of reflected ? [0,2,1] : [0,1,2]) {
        const i = at + vertex * 10, source = mesh.vertices;
        const position = plus(translation,rotateEuler([source[i]*scale[0],source[i+1]*scale[1],source[i+2]*scale[2]],rotation));
        const normal = unit(rotateEuler([source[i+3]/scale[0],source[i+4]/scale[1],source[i+5]/scale[2]],rotation));
        this.data.push(...position,...normal,source[i+6]*255,source[i+7]*255,source[i+8]*255,source[i+9]);
      }
    }
    return this;
  }

  finish(key = 'procedural-mesh') {
    const vertices = new Float32Array(this.data.length), min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    for (let i = 0; i < this.data.length; i += 10) {
      for (let k = 0; k < 10; k++) {
        const value = this.data[i+k];
        if (!Number.isFinite(value)) throw new Error('MeshBuilder: nonfinite vertex');
        vertices[i+k] = k >= 6 && k <= 8 ? clamp(value/255,0,1) : k === 9 ? clamp(value,0,1) : value;
      }
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k],vertices[i+k]); max[k] = Math.max(max[k],vertices[i+k]); }
    }
    if (!vertices.length) { min.fill(0); max.fill(0); }
    return {key:String(key),vertices,stride:10,triangles:vertices.length/30,bounds:{min,max}};
  }
}

export default MeshBuilder;
