/**
 * E1M1 gameplay on generated sector geometry, rendered separately by FERRO.
 * Coordinates and heights remain Doom units. This is a new simulation rather
 * than the original Doom executable; sector specials follow id's published
 * p_spec.c / p_switch.c / p_doors.c data definitions.
 */
const TAU = Math.PI * 2;
const EPS = 1e-6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const ENEMIES = {
  3004: {base: 'POSS', hp: 20, radius: 20, height: 56, speed: 68, death: 'HIJKL', pain: 'G', attack: 'EF', damage: 5},
  9: {base: 'SPOS', hp: 30, radius: 20, height: 56, speed: 65, death: 'HIJKL', pain: 'G', attack: 'EF', damage: 5},
  3001: {base: 'TROO', hp: 60, radius: 20, height: 56, speed: 72, death: 'IJKLM', pain: 'H', attack: 'EFG', damage: 8},
};
const PICKUPS = {
  2011: {sprite: 'STIMA0', kind: 'health', amount: 10, text: 'Stimulant'},
  2012: {sprite: 'MEDIA0', kind: 'health', amount: 25, text: 'Trousse de soins'},
  2014: {sprite: 'BON1A0', kind: 'healthBonus', amount: 1, countItem: true, frames: 'ABCDCB', text: 'Bonus de santé'},
  2015: {sprite: 'BON2A0', kind: 'armorBonus', amount: 1, countItem: true, frames: 'ABCDCB', text: 'Bonus d’armure'},
  2018: {sprite: 'ARM1A0', kind: 'armor', amount: 100, armorType: 1, frames: 'AB', text: 'Armure de sécurité'},
  2019: {sprite: 'ARM2A0', kind: 'armor', amount: 200, armorType: 2, frames: 'AB', text: 'Méga-armure'},
  2007: {sprite: 'CLIPA0', kind: 'ammo', amount: 10, text: 'Chargeur'},
  2048: {sprite: 'AMMOA0', kind: 'ammo', amount: 50, text: 'Boîte de balles'},
  2008: {sprite: 'SHELA0', kind: 'shells', amount: 4, text: 'Cartouches'},
  2049: {sprite: 'SBOXA0', kind: 'shells', amount: 20, text: 'Boîte de cartouches'},
  2001: {sprite: 'SHOTA0', kind: 'shotgun', amount: 8, text: 'Fusil à pompe'},
};
const SCENERY = {
  48: {sprite: 'ELECA0', solid: true, radius: 16, height: 128},
  2028: {sprite: 'COLUA0', solid: true, radius: 16, height: 48, fullbright: true},
  35: {sprite: 'CBRAA0', solid: false, height: 60, fullbright: true},
  10: {sprite: 'PLAYW0', solid: false, height: 16},
  12: {sprite: 'PLAYW0', solid: false, height: 16},
  15: {sprite: 'PLAYN0', solid: false, height: 16},
  24: {sprite: 'POL5A0', solid: false, height: 16},
};

export function closestPointOnSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return {x: ax + t * dx, y: ay + t * dy, t};
}

/** Intersection fractions along AB and CD; null for parallel/nonintersecting. */
export function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < EPS) return null;
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? {t, u} : null;
}

export class DoomGame {
  constructor(map, {skill = 2, onSound = () => {}, onMessage = () => {}, onComplete = () => {}} = {}) {
    this.map = map;
    this.skill = clamp(Math.round(skill), 1, 4);
    this.onSound = onSound;
    this.onMessage = onMessage;
    this.onComplete = onComplete;
    this._originalSectors = map.sectors.map(s => ({...s}));
    this._originalSides = map.sides.map(s => ({...s}));
    this.lines = map.lines.map(line => {
      const a = map.vertices[line.v1], b = map.vertices[line.v2];
      return {...line, ax: a.x, ay: a.y, bx: b.x, by: b.y,
        front: line.right < 0 ? -1 : map.sides[line.right].sector,
        back: line.left < 0 ? -1 : map.sides[line.left].sector};
    });
    this._grid = new Map();
    this.neighbors = map.sectors.map(() => new Set());
    const soundBounds = map.sectors.map(() => ({minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity}));
    for (const line of this.lines) {
      for (const id of new Set([line.front, line.back])) {
        if (id < 0) continue;
        const bounds = soundBounds[id];
        bounds.minX = Math.min(bounds.minX, line.ax, line.bx); bounds.maxX = Math.max(bounds.maxX, line.ax, line.bx);
        bounds.minY = Math.min(bounds.minY, line.ay, line.by); bounds.maxY = Math.max(bounds.maxY, line.ay, line.by);
      }
      for (let gx = Math.floor(Math.min(line.ax, line.bx) / 128); gx <= Math.floor(Math.max(line.ax, line.bx) / 128); gx++) {
        for (let gy = Math.floor(Math.min(line.ay, line.by) / 128); gy <= Math.floor(Math.max(line.ay, line.by) / 128); gy++) {
          const key = `${gx},${gy}`;
          if (!this._grid.has(key)) this._grid.set(key, []);
          this._grid.get(key).push(line);
        }
      }
      if (line.front >= 0 && line.back >= 0 && line.front !== line.back) {
        this.neighbors[line.front].add(line.back);
        this.neighbors[line.back].add(line.front);
      }
    }
    // Doom places a sector's sound origin at the midpoint of its boundary bounds.
    // In particular, the timed lift must be heard at the lift, not its remote trigger.
    this._sectorSoundOrigins = soundBounds.map(b => ({x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2}));
    this.restart();
  }

  random() {
    this._rng ^= this._rng << 13; this._rng ^= this._rng >>> 17; this._rng ^= this._rng << 5;
    return (this._rng >>> 0) / 4294967296;
  }

  restart() {
    this.map.sectors.forEach((s, i) => Object.assign(s, this._originalSectors[i]));
    this.map.sides.forEach((s, i) => Object.assign(s, this._originalSides[i]));
    this.map.revision = (this.map.revision || 0) + 1;
    this._rng = 0xE1A11993;
    this.time = 0; this.completed = false; this.kills = 0; this.items = 0; this.secrets = 0;
    this.exitSecret = false;
    this.actions = new Map(); this.visitedSecrets = new Set(); this._triggered = new Set();
    this._useHeld = false; this._acidTimer = 0; this._weaponCooldown = 0;
    this.lastShot = -10; this.shotTime = 0; this.hurtFlash = 0; this.pickupFlash = 0; this.muzzleFlash = 0;
    const spawn = this.map.things.find(t => t.type === 1);
    if (!spawn) throw new Error(`${this.map.name || 'Le niveau'} ne contient pas de point de départ.`);
    const sector = this.map.sectorAt(spawn.x, spawn.y);
    this.player = {x: spawn.x, y: spawn.y, z: sector.floor, height: 56, radius: 16,
      angle: spawn.angle * Math.PI / 180, pitch: 0, health: 100, armor: 0, armorType: 0,
      ammo: 50, shells: 0, weapon: 'pistol', weapons: new Set(['fist', 'pistol']),
      sector: sector.id, vz: 0, alive: true, solid: true, moving: false, bob: 0};
    const flag = this.skill === 1 ? 1 : this.skill === 2 ? 2 : 4;
    this.entities = [];
    for (const thing of this.map.things) {
      if (thing.type <= 4 || thing.type === 11 || thing.flags & 16 || !(thing.flags & flag)) continue;
      const floor = this.map.sectorAt(thing.x, thing.y);
      const base = {id: thing.id, x: thing.x, y: thing.y, z: floor.floor, sector: floor.id, vz: 0,
        type: thing.type, angle: thing.angle * Math.PI / 180, flip: false, removed: false,
        fullbright: false, scale: 1, alive: true, solid: false, radius: 16, height: 16};
      const enemy = ENEMIES[thing.type], pickup = PICKUPS[thing.type], scenery = SCENERY[thing.type];
      if (enemy) {
        this.entities.push({...base, ...enemy, config: enemy, enemy: true, solid: true,
          sprite: `${enemy.base}A1`, state: 'idle', awake: false, ambush: Boolean(thing.flags & 8),
          stateTime: 0, attackTimer: 0.5 + this.random(), sightTimer: this.random() * 0.2, seesPlayer: false});
      } else if (pickup) {
        this.entities.push({...base, sprite: pickup.sprite, pickup, height: 16});
      } else if (thing.type === 2035) {
        this.entities.push({...base, sprite: 'BAR1A0', solid: true, barrel: true, hp: 20, radius: 10, height: 42, state: 'idle'});
      } else if (scenery) {
        this.entities.push({...base, ...scenery, alive: false});
      }
    }
    this.totalKills = this.entities.filter(e => e.enemy).length;
    this.totalItems = this.entities.filter(e => e.pickup?.countItem).length;
    this.totalSecrets = this._originalSectors.filter(s => s.special === 9).length;
    this._orientSprites();
    return this;
  }

  stats() {
    return {level: this.map.name, kills: this.kills, totalKills: this.totalKills, items: this.items, totalItems: this.totalItems,
      secrets: this.secrets, totalSecrets: this.totalSecrets, time: this.time, completed: this.completed,
      exitSecret: Boolean(this.exitSecret), dead: this.player.health <= 0};
  }

  _sound(name, at = this.player) { this.onSound(name, {x: at.x, y: at.y, z: at.z}); }

  _sectorSound(name, sector) {
    this._sound(name, {...this._sectorSoundOrigins[sector.id], z: sector.floor});
  }

  _orientSprites() {
    for (const entity of this.entities) {
      if (!entity.enemy || !entity.alive || entity.removed) continue;
      const bearing = Math.atan2(this.player.y - entity.y, this.player.x - entity.x);
      const turn = ((bearing - entity.angle) % TAU + TAU + Math.PI / 8) % TAU;
      const rotation = Math.floor(turn / (Math.PI / 4)) + 1, frame = entity.sprite[4];
      // Paired view identifiers share one generated pose, mirrored around its origin.
      const first = rotation > 5 ? 10 - rotation : rotation;
      entity.sprite = entity.base + frame + first + (first > 1 && first < 5 ? frame + (10 - first) : '');
      entity.flip = rotation > 5;
    }
  }

  nearbyLines(x, y, radius = 32) {
    const result = new Set();
    for (let gx = Math.floor((x - radius) / 128); gx <= Math.floor((x + radius) / 128); gx++) {
      for (let gy = Math.floor((y - radius) / 128); gy <= Math.floor((y + radius) / 128); gy++) {
        const bucket = this._grid.get(`${gx},${gy}`);
        if (bucket) for (const line of bucket) result.add(line);
      }
    }
    return result;
  }

  opening(line) {
    if (line.front < 0 || line.back < 0) return null;
    const a = this.map.sectors[line.front], b = this.map.sectors[line.back];
    return {bottom: Math.max(a.floor, b.floor), top: Math.min(a.ceiling, b.ceiling)};
  }

  lineBlocksActor(line, actor) {
    const opening = this.opening(line);
    return !opening || Boolean(line.flags & 1) || Boolean(actor.enemy && line.flags & 2)
      || opening.top - opening.bottom < actor.height - EPS
      || opening.bottom > actor.z + 24 + EPS
      || opening.top < Math.max(actor.z, opening.bottom) + actor.height - EPS;
  }

  /** Circle movement is substepped, then resolved against segments and corners. */
  moveActor(actor, dx, dy, {collideEntities = true, triggers = actor === this.player || Boolean(actor.enemy)} = {}) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
    const startX = actor.x, startY = actor.y;
    const distance = Math.hypot(dx, dy), steps = Math.max(1, Math.ceil(distance / 4));
    const sx = dx / steps, sy = dy / steps;
    for (let step = 0; step < steps; step++) {
      const oldX = actor.x, oldY = actor.y;
      let x = oldX + sx, y = oldY + sy;
      const candidates = this.nearbyLines(x, y, actor.radius + 5);
      for (let pass = 0; pass < 5; pass++) {
        let corrected = false;
        for (const line of candidates) {
          if (!this.lineBlocksActor(line, actor)) continue;
          const closest = closestPointOnSegment(x, y, line.ax, line.ay, line.bx, line.by);
          let nx = x - closest.x, ny = y - closest.y;
          const d = Math.hypot(nx, ny), radius = actor.radius + 0.015;
          if (d >= radius) continue;
          if (d < EPS) {
            nx = oldX - closest.x; ny = oldY - closest.y;
            if (Math.hypot(nx, ny) < EPS) { nx = line.by - line.ay; ny = line.ax - line.bx; }
          }
          const n = Math.hypot(nx, ny) || 1;
          x += nx / n * (radius - d); y += ny / n * (radius - d); corrected = true;
        }
        if (collideEntities) {
          const solids = actor === this.player ? this.entities : [this.player, ...this.entities];
          for (const other of solids) {
            if (other === actor || !other.solid || other.removed || other.z + other.height <= actor.z || other.z >= actor.z + actor.height) continue;
            let ex = x - other.x, ey = y - other.y;
            const d = Math.hypot(ex, ey), radius = actor.radius + other.radius;
            if (d >= radius) continue;
            if (d < EPS) { ex = oldX - other.x || 1; ey = oldY - other.y; }
            const n = Math.hypot(ex, ey) || 1;
            x += ex / n * (radius - d); y += ey / n * (radius - d); corrected = true;
          }
        }
        if (!corrected) break;
      }
      const sector = this.map.sectorAt(x, y);
      if (!sector || sector.ceiling - sector.floor < actor.height - EPS || sector.floor > actor.z + 24 + EPS) continue;
      // Final wall verification prevents entity pushes from placing an actor in a wall.
      let valid = true;
      for (const line of this.nearbyLines(x, y, actor.radius + 1)) {
        if (!this.lineBlocksActor(line, actor)) continue;
        const q = closestPointOnSegment(x, y, line.ax, line.ay, line.bx, line.by);
        if (Math.hypot(x - q.x, y - q.y) < actor.radius - 0.025) { valid = false; break; }
      }
      if (!valid) continue;
      actor.x = x; actor.y = y; actor.sector = sector.id;
      if (actor.z < sector.floor) { actor.z = sector.floor; actor.vz = 0; }
      if (triggers) {
        for (const line of candidates) {
          if ((line.special === 36 || line.special === 88)
            && segmentIntersection(oldX, oldY, x, y, line.ax, line.ay, line.bx, line.by)) this._crossLine(line, actor);
        }
      }
    }
    return Math.hypot(actor.x - startX, actor.y - startY);
  }

  /** Trace geometry only, through all open sector portals at the ray's height. */
  raycast(x, y, z, angle, maxDistance = 2048, slope = 0) {
    const ex = x + Math.cos(angle) * maxDistance, ey = y + Math.sin(angle) * maxDistance;
    let best = maxDistance, hitLine = null;
    for (const line of this.lines) {
      const hit = segmentIntersection(x, y, ex, ey, line.ax, line.ay, line.bx, line.by);
      if (!hit || hit.t < 0.000001) continue;
      const distance = hit.t * maxDistance;
      if (distance >= best) continue;
      const gap = this.opening(line), height = z + slope * distance;
      if (!gap || height <= gap.bottom + 0.01 || height >= gap.top - 0.01) { best = distance; hitLine = line; }
    }
    return {distance: best, line: hitLine, x: x + Math.cos(angle) * best, y: y + Math.sin(angle) * best, z: z + slope * best};
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const distance = Math.hypot(bx - ax, by - ay);
    if (distance < EPS) return true;
    return this.raycast(ax, ay, az, Math.atan2(by - ay, bx - ax), distance, (bz - az) / distance).distance >= distance - 0.05;
  }

  use() {
    if (this.completed || this.player.health <= 0) return false;
    const p = this.player, endX = p.x + Math.cos(p.angle) * 64, endY = p.y + Math.sin(p.angle) * 64;
    const hits = [];
    for (const line of this.lines) {
      const hit = segmentIntersection(p.x, p.y, endX, endY, line.ax, line.ay, line.bx, line.by);
      if (hit) hits.push({line, t: hit.t});
    }
    hits.sort((a, b) => a.t - b.t);
    for (const {line} of hits) {
      if (line.special === 1) return this._openDoor(line);
      if (line.special === 11 || line.special === 51) {
        this.completed = true; this.exitSecret = line.special === 51;
        const side = this.map.sides[line.right] || this.map.sides[line.left];
        if (side) for (const name of ['upper', 'middle', 'lower']) if (side[name].startsWith('SW1')) side[name] = side[name].replace('SW1', 'SW2');
        this.map.revision = (this.map.revision || 0) + 1;
        this._sound('DSSWTCHX'); this.onComplete(this.stats());
        return {type: 'exit', line: line.id};
      }
      const gap = this.opening(line);
      if (!gap || gap.top - gap.bottom < 56) break;
    }
    this._sound('DSNOWAY');
    return false;
  }

  _openDoor(line, actor = this.player) {
    // ML_SECRET protects the concealed face of the courtyard door from monsters.
    // Its ordinary reverse face remains usable on the return journey.
    if (line.back < 0 || (actor.enemy && line.flags & 32)) return false;
    const sector = this.map.sectors[line.back], old = this.actions.get(sector.id);
    if (old?.kind === 'door') {
      if (actor.enemy && old.phase !== 'down') return false;
      old.phase = old.phase === 'down' ? 'up' : 'down';
      this._sectorSound(old.phase === 'up' ? 'DSDOROPN' : 'DSDORCLS', sector);
      return {type: 'door', sector: sector.id};
    }
    const ceilings = [...this.neighbors[sector.id]].map(i => this.map.sectors[i].ceiling);
    const target = (ceilings.length ? Math.min(...ceilings) : sector.floor + 128) - 4;
    this.actions.set(sector.id, {kind: 'door', phase: 'up', target, base: sector.floor, wait: 0});
    this._sectorSound('DSDOROPN', sector);
    return {type: 'door', sector: sector.id};
  }

  _crossLine(line, actor = this.player) {
    // p_spec.c allows monsters to retrigger type 88, but type 36 is player-only.
    if (actor !== this.player && (!actor.enemy || line.special !== 88)) return;
    if (line.special === 36 && this._triggered.has(line.id)) return;
    const targets = this.map.sectors.filter(s => s.tag && s.tag === line.tag);
    for (const sector of targets) {
      if (this.actions.has(sector.id)) continue;
      const floors = [...this.neighbors[sector.id]].map(i => this.map.sectors[i].floor);
      if (line.special === 36) {
        const below = floors.filter(f => f < sector.floor);
        const target = below.length ? Math.max(...below) + 8 : sector.floor;
        this.actions.set(sector.id, {kind: 'floor', target, speed: 140});
        this._triggered.add(line.id);
      } else if (line.special === 88) {
        this.actions.set(sector.id, {kind: 'lift', phase: 'down', target: Math.min(sector.floor, ...floors), base: sector.floor, wait: 0});
      }
      this._sectorSound('DSPSTART', sector);
    }
  }

  _updateActions(dt) {
    for (const [id, action] of this.actions) {
      const sector = this.map.sectors[id], oldFloor = sector.floor, oldCeiling = sector.ceiling;
      const occupants = [this.player, ...this.entities].filter(e => {
        if (!e.solid || e.removed) return false;
        if (e.sector === id) return true;
        if (action.kind !== 'door') return false;
        for (const line of this.nearbyLines(e.x, e.y, e.radius + 1)) {
          if (line.front !== id && line.back !== id) continue;
          const point = closestPointOnSegment(e.x, e.y, line.ax, line.ay, line.bx, line.by);
          if (Math.hypot(point.x - e.x, point.y - e.y) < e.radius + 0.1) return true;
        }
        return false;
      });
      if (action.kind === 'door') {
        if (action.phase === 'up') {
          sector.ceiling = Math.min(action.target, sector.ceiling + 70 * dt);
          if (sector.ceiling >= action.target) { action.phase = 'wait'; action.wait = 150 / 35; }
        } else if (action.phase === 'wait') {
          action.wait -= dt;
          if (action.wait <= 0) { action.phase = 'down'; this._sectorSound('DSDORCLS', sector); }
        } else {
          const next = Math.max(action.base, sector.ceiling - 70 * dt);
          if (occupants.some(e => e.z + e.height > next)) { action.phase = 'up'; this._sectorSound('DSDOROPN', sector); }
          else { sector.ceiling = next; if (next <= action.base) this.actions.delete(id); }
        }
      } else if (action.kind === 'floor') {
        sector.floor = Math.max(action.target, sector.floor - action.speed * dt);
        if (sector.floor <= action.target) { this.actions.delete(id); this._sectorSound('DSPSTOP', sector); }
      } else if (action.kind === 'lift') {
        if (action.phase === 'down') {
          sector.floor = Math.max(action.target, sector.floor - 140 * dt);
          if (sector.floor <= action.target) { action.phase = 'wait'; action.wait = 3; this._sectorSound('DSPSTOP', sector); }
        } else if (action.phase === 'wait') {
          action.wait -= dt;
          if (action.wait <= 0) { action.phase = 'up'; this._sectorSound('DSPSTART', sector); }
        } else {
          const next = Math.min(action.base, sector.floor + 140 * dt);
          if (occupants.some(e => sector.ceiling - next < e.height)) { action.phase = 'down'; }
          else { sector.floor = next; if (next >= action.base) { this.actions.delete(id); this._sectorSound('DSPSTOP', sector); } }
        }
      }
      if (sector.floor !== oldFloor) {
        for (const actor of [this.player, ...this.entities]) {
          if (!actor.removed && actor.sector === id && actor.z <= oldFloor + 0.1) { actor.z += sector.floor - oldFloor; actor.vz = 0; }
        }
      }
      if (sector.floor !== oldFloor || sector.ceiling !== oldCeiling) this.map.revision = (this.map.revision || 0) + 1;
    }
  }

  selectWeapon(value) {
    const weapon = ({1: 'fist', 2: 'pistol', 3: 'shotgun'})[value] || value;
    if (this.player.weapons.has(weapon)) this.player.weapon = weapon;
  }

  fire() {
    const p = this.player;
    if (this.completed || p.health <= 0 || this._weaponCooldown > 0) return false;
    const shotgun = p.weapon === 'shotgun', fist = p.weapon === 'fist';
    if (!fist && (shotgun ? p.shells : p.ammo) <= 0) {
      this.onMessage('Plus de munitions'); this._weaponCooldown = 0.2; return false;
    }
    if (!fist) { if (shotgun) p.shells--; else p.ammo--; }
    this._weaponCooldown = fist ? 0.4 : shotgun ? 0.9 : 0.28;
    this.shotTime = this._weaponCooldown; this.lastShot = this.time;
    this.muzzleFlash = fist ? 0 : 0.09;
    if (!fist) this._sound(shotgun ? 'DSSHOTGN' : 'DSPISTOL');
    const range = fist ? 64 : 2048, shotZ = p.z + 32;
    // Original-style vertical autoaim keeps the stairs and windows playable.
    let aimSlope = Math.tan(p.pitch), aimDistance = Infinity;
    for (const e of this.entities) {
      if ((!e.enemy && !e.barrel) || !e.alive || e.removed) continue;
      const distance = Math.hypot(e.x - p.x, e.y - p.y);
      if (distance < aimDistance && distance < range && Math.abs(angleDifference(Math.atan2(e.y - p.y, e.x - p.x), p.angle)) < 0.1
        && this.lineOfSight(p.x, p.y, shotZ, e.x, e.y, e.z + e.height * 0.55)) {
        aimSlope = (e.z + e.height * 0.55 - shotZ) / distance; aimDistance = distance;
      }
    }
    let hitCount = 0;
    for (let i = 0; i < (shotgun ? 7 : 1); i++) {
      const angle = p.angle + (shotgun ? (this.random() - this.random()) * 0.09 : 0);
      const damage = fist ? (1 + Math.floor(this.random() * 10)) * 2 : (1 + Math.floor(this.random() * 3)) * 5;
      const hit = this._hitscan(p.x, p.y, shotZ, angle, range, aimSlope, p);
      if (hit.entity) { this.damageEntity(hit.entity, damage, p); hitCount++; }
    }
    if (fist && hitCount) this._sound('DSPUNCH');
    if (!fist) {
      for (const enemy of this.entities) {
        if (enemy.enemy && enemy.alive && !enemy.ambush && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 1400
          && this.lineOfSight(p.x, p.y, p.z + 32, enemy.x, enemy.y, enemy.z + 32)) enemy.awake = true;
      }
    }
    return {weapon: p.weapon, hits: hitCount};
  }

  _hitscan(x, y, z, angle, range, slope, owner) {
    const wall = this.raycast(x, y, z, angle, range, slope);
    let distance = wall.distance, entity = null;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const targets = owner === this.player ? this.entities : [this.player, ...this.entities];
    for (const target of targets) {
      if (target === owner || target.removed || !target.alive || (!target.enemy && !target.barrel && target !== this.player)) continue;
      const rx = target.x - x, ry = target.y - y;
      const along = rx * dirX + ry * dirY, side = rx * dirY - ry * dirX;
      if (along < 0 || Math.abs(side) > target.radius) continue;
      const t = Math.max(0, along - Math.sqrt(target.radius ** 2 - side ** 2));
      const height = z + slope * t;
      if (t < distance && height >= target.z && height <= target.z + target.height) { distance = t; entity = target; }
    }
    return {distance, entity, line: entity ? null : wall.line};
  }

  damagePlayer(amount, attacker = null) {
    const p = this.player;
    if (p.health <= 0 || this.completed) return;
    if (this.skill === 1) amount *= 0.5;
    amount = Math.max(1, Math.floor(amount));
    const saved = Math.min(p.armor, Math.floor(amount * (p.armorType === 2 ? 0.5 : 1 / 3)));
    p.armor -= saved; amount -= saved;
    if (p.armor === 0) p.armorType = 0;
    p.health = Math.max(0, p.health - amount); this.hurtFlash = Math.min(0.7, this.hurtFlash + amount / 80 + 0.12);
    if (p.health === 0) { p.alive = false; p.solid = false; this._sound('DSPLDETH'); this.onMessage('Vous êtes mort. Recommencez le niveau.'); }
    else this._sound('DSPLPAIN');
  }

  damageEntity(entity, amount, attacker = this.player) {
    if (!entity.alive || entity.removed || (!entity.enemy && !entity.barrel)) return;
    entity.hp -= amount;
    if (entity.hp > 0) {
      if (entity.enemy) { entity.awake = true; entity.state = 'pain'; entity.stateTime = 0.18; this._sound(entity.type === 3001 ? 'DSPOPAIN' : 'DSPOPAIN', entity); }
      return;
    }
    entity.alive = false; entity.solid = false; entity.flip = false; entity.state = 'dead'; entity.stateTime = 0;
    if (entity.barrel) {
      entity.state = 'exploding'; entity.sprite = 'BEXPA0'; entity.fullbright = true;
      this._sound('DSBAREXP', entity);
      for (const target of [this.player, ...this.entities]) {
        if (target === entity || !target.alive || target.removed) continue;
        const distance = Math.max(0, Math.hypot(target.x - entity.x, target.y - entity.y) - target.radius);
        if (distance < 128 && this.lineOfSight(entity.x, entity.y, entity.z + 24, target.x, target.y, target.z + 24)) {
          const damage = Math.ceil(128 - distance);
          if (target === this.player) this.damagePlayer(damage, attacker); else this.damageEntity(target, damage, attacker);
        }
      }
    } else {
      this.kills++;
      this._sound(entity.type === 3001 ? 'DSBGDTH1' : 'DSPODTH1', entity);
      if (entity.type === 3004 || entity.type === 9) {
        const pickup = entity.type === 9 ? {...PICKUPS[2001], amount: 4} : {...PICKUPS[2007], amount: 5};
        this.entities.push({id: `drop-${entity.id}`, type: entity.type === 9 ? 2001 : 2007, x: entity.x, y: entity.y,
          z: entity.z, sector: entity.sector, angle: 0, sprite: pickup.sprite, pickup, removed: false,
          fullbright: false, flip: false, scale: 1, alive: true, solid: false, radius: 12, height: 16, vz: 0});
      }
    }
  }

  _pickup(entity) {
    const item = entity.pickup, p = this.player;
    let taken = false;
    switch (item.kind) {
      case 'health': if (p.health < 100) { p.health = Math.min(100, p.health + item.amount); taken = true; } break;
      case 'healthBonus': p.health = Math.min(200, p.health + item.amount); taken = true; break;
      case 'armorBonus': p.armor = Math.min(200, p.armor + item.amount); p.armorType ||= 1; taken = true; break;
      case 'armor': if (p.armor < item.amount) { p.armor = item.amount; p.armorType = item.armorType; taken = true; } break;
      case 'ammo': if (p.ammo < 200) { p.ammo = Math.min(200, p.ammo + item.amount); taken = true; } break;
      case 'shells': if (p.shells < 50) { p.shells = Math.min(50, p.shells + item.amount); taken = true; } break;
      case 'shotgun': {
        const isNew = !p.weapons.has('shotgun');
        if (isNew || p.shells < 50) {
          p.weapons.add('shotgun'); p.shells = Math.min(50, p.shells + item.amount); taken = true;
          if (isNew) p.weapon = 'shotgun';
        }
        break;
      }
    }
    if (!taken) return;
    entity.removed = true;
    if (item.countItem) this.items++;
    this.pickupFlash = 0.18; this.onMessage(item.text); this._sound(item.kind === 'shotgun' ? 'DSWPNUP' : 'DSITEMUP');
  }

  _gravity(actor, dt) {
    const sector = this.map.sectorAt(actor.x, actor.y); actor.sector = sector.id;
    if (actor.z > sector.floor + 0.01) {
      actor.vz = (actor.vz || 0) - 800 * dt;
      actor.z = Math.max(sector.floor, actor.z + actor.vz * dt);
    } else { actor.z = sector.floor; actor.vz = 0; }
  }

  _enemyAttack(enemy) {
    const p = this.player, distance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    if (p.health <= 0 || !this.lineOfSight(enemy.x, enemy.y, enemy.z + 32, p.x, p.y, p.z + 32)) return;
    const angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    if (enemy.type === 3001) {
      if (distance < 64) { this.damagePlayer((1 + Math.floor(this.random() * 8)) * 3, enemy); this._sound('DSCLAW', enemy); }
      else {
        const dx = p.x - enemy.x, dy = p.y - enemy.y, dz = p.z + 32 - (enemy.z + 32), d = Math.hypot(dx, dy, dz) || 1;
        this.entities.push({id: `fireball-${this.time}-${enemy.id}`, type: 'fireball', projectile: true, owner: enemy,
          x: enemy.x + Math.cos(angle) * 24, y: enemy.y + Math.sin(angle) * 24, z: enemy.z + 26,
          vx: dx / d * 350, vy: dy / d * 350, vz: dz / d * 350, sprite: 'BAL1A0', radius: 6, height: 12,
          sector: enemy.sector, alive: true, solid: false, fullbright: true, flip: false, scale: 1, removed: false, age: 0});
        this._sound('DSFIRSHT', enemy);
      }
    } else {
      this._sound(enemy.type === 9 ? 'DSSHOTGN' : 'DSPISTOL', enemy);
      for (let i = 0; i < (enemy.type === 9 ? 3 : 1); i++) {
        const shot = angle + (this.random() - this.random()) * 0.17;
        const hit = this._hitscan(enemy.x, enemy.y, enemy.z + 32, shot, 2048, (p.z - enemy.z) / Math.max(1, distance), enemy);
        const damage = (1 + Math.floor(this.random() * 5)) * 3;
        if (hit.entity === p) this.damagePlayer(damage, enemy);
        else if (hit.entity) this.damageEntity(hit.entity, damage, enemy);
      }
    }
  }

  _updateEnemy(enemy, dt) {
    if (!enemy.alive) {
      enemy.stateTime += dt;
      const frame = enemy.config.death[Math.min(enemy.config.death.length - 1, Math.floor(enemy.stateTime / 0.15))];
      enemy.sprite = `${enemy.base}${frame}0`; return;
    }
    this._gravity(enemy, dt);
    const p = this.player, distance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    const aim = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    enemy.sightTimer -= dt;
    if (enemy.sightTimer <= 0) {
      enemy.sightTimer = 0.2;
      enemy.seesPlayer = p.health > 0 && distance < 1500
        && this.lineOfSight(enemy.x, enemy.y, enemy.z + 32, p.x, p.y, p.z + 32);
      if (!enemy.awake && enemy.seesPlayer && (distance < 64 || Math.abs(angleDifference(aim, enemy.angle)) < Math.PI / 2)) {
        enemy.awake = true; this._sound(enemy.type === 3001 ? 'DSBGSIT1' : 'DSPOSIT1', enemy);
      }
    }
    if (!enemy.awake || p.health <= 0) { enemy.sprite = `${enemy.base}A1`; return; }
    enemy.angle = aim;
    enemy.attackTimer -= dt;
    if (enemy.state === 'pain') {
      enemy.stateTime -= dt; enemy.sprite = `${enemy.base}${enemy.config.pain}1`;
      if (enemy.stateTime <= 0) enemy.state = 'chase';
      return;
    }
    if (enemy.state === 'attack') {
      enemy.stateTime -= dt;
      const attack = enemy.config.attack;
      const at = Math.min(attack.length - 1, Math.floor((0.5 - enemy.stateTime) / (0.5 / attack.length)));
      enemy.sprite = `${enemy.base}${attack[Math.max(0, at)]}1`;
      if (enemy.stateTime <= 0.17 && !enemy.attackFired) { enemy.attackFired = true; this._enemyAttack(enemy); }
      if (enemy.stateTime <= 0) { enemy.state = 'chase'; enemy.attackTimer = 0.8 + this.random() * 1.6; }
      return;
    }
    if (enemy.seesPlayer && distance < 1000 && enemy.attackTimer <= 0) {
      enemy.state = 'attack'; enemy.stateTime = 0.5; enemy.attackFired = false; return;
    }
    enemy.state = 'chase';
    if (distance > 44) {
      const step = enemy.speed * dt;
      let moved = this.moveActor(enemy, Math.cos(aim) * step, Math.sin(aim) * step);
      if (moved < step * 0.4) {
        enemy.avoidSign ||= this.random() < 0.5 ? -1 : 1;
        for (const delta of [Math.PI / 4, Math.PI / 2, -Math.PI / 4, -Math.PI / 2]) {
          const direction = aim + delta * enemy.avoidSign;
          moved = this.moveActor(enemy, Math.cos(direction) * step, Math.sin(direction) * step);
          if (moved > step * 0.5) break;
        }
        for (const line of this.nearbyLines(enemy.x, enemy.y, 32)) {
          if (line.special !== 1 || this.actions.has(line.back)) continue;
          const q = closestPointOnSegment(enemy.x, enemy.y, line.ax, line.ay, line.bx, line.by);
          if (Math.hypot(q.x - enemy.x, q.y - enemy.y) < 28 && this.map.sectors[line.back].ceiling - this.map.sectors[line.back].floor < 56) this._openDoor(line, enemy);
        }
      }
    }
    enemy.sprite = `${enemy.base}${'ABCD'[Math.floor(this.time * 7) % 4]}1`;
  }

  _updateProjectile(projectile, dt) {
    projectile.age += dt;
    if (!projectile.alive) {
      projectile.sprite = `BAL1${'CDE'[Math.min(2, Math.floor(projectile.age * 12))]}0`;
      if (projectile.age > 0.25) projectile.removed = true;
      return;
    }
    const dx = projectile.vx * dt, dy = projectile.vy * dt, dz = projectile.vz * dt;
    const distance = Math.hypot(dx, dy);
    const wall = this.raycast(projectile.x, projectile.y, projectile.z + 6, Math.atan2(dy, dx), distance, dz / (distance || 1));
    let collided = wall.line !== null;
    projectile.x += dx; projectile.y += dy; projectile.z += dz;
    const sector = this.map.sectorAt(projectile.x, projectile.y);
    if (!sector || projectile.z < sector.floor || projectile.z + projectile.height > sector.ceiling) collided = true;
    if (!collided) {
      for (const target of [this.player, ...this.entities]) {
        if (target === projectile.owner || target === projectile || target.projectile || target.removed || !target.solid) continue;
        if (Math.hypot(target.x - projectile.x, target.y - projectile.y) < target.radius + 6
          && projectile.z + 12 >= target.z && projectile.z <= target.z + target.height) {
          // Doom's PIT_CheckThing stops missiles on solid decorations even
          // when they are not shootable. Such impacts deal no damage.
          if (target.alive && (target === this.player || target.enemy || target.barrel)) {
            const damage = (1 + Math.floor(this.random() * 8)) * 3;
            if (target === this.player) this.damagePlayer(damage, projectile.owner); else this.damageEntity(target, damage, projectile.owner);
          }
          collided = true; break;
        }
      }
    }
    if (collided || projectile.age > 8) { projectile.alive = false; projectile.age = 0; this._sound('DSFIRXPL', projectile); }
    projectile.sprite = `BAL1${Math.floor(this.time * 8) % 2 ? 'B' : 'A'}0`;
  }

  update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0 || this.completed) return;
    dt = Math.min(dt, 0.15);
    const p = this.player;
    p.angle = (p.angle + (Number(input.turn) || 0) + TAU) % TAU;
    p.pitch = clamp(p.pitch + (Number(input.look) || 0), -0.65, 0.65);
    if (input.weapon !== undefined) this.selectWeapon(input.weapon);
    if (input.use && !this._useHeld) this.use();
    this._useHeld = Boolean(input.use);
    if (this.completed) return this.stats();
    const steps = Math.max(1, Math.ceil(dt * 70)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.time += h;
      this._weaponCooldown = Math.max(0, this._weaponCooldown - h);
      this.shotTime = this._weaponCooldown; this.muzzleFlash = Math.max(0, this.muzzleFlash - h);
      this.hurtFlash = Math.max(0, this.hurtFlash - h); this.pickupFlash = Math.max(0, this.pickupFlash - h);
      this._updateActions(h);
      if (p.health > 0) {
        const forward = clamp(Number(input.forward) || 0, -1, 1), strafe = clamp(Number(input.strafe) || 0, -1, 1);
        const magnitude = Math.max(1, Math.hypot(forward, strafe)), speed = input.run ? 320 : 200;
        const dx = (Math.cos(p.angle) * forward + Math.sin(p.angle) * strafe) / magnitude * speed * h;
        const dy = (Math.sin(p.angle) * forward - Math.cos(p.angle) * strafe) / magnitude * speed * h;
        p.moving = this.moveActor(p, dx, dy) > 0.01;
        if (p.moving) p.bob += h * (input.run ? 11 : 8);
        this._gravity(p, h);
        if (input.fire) this.fire();
        const sector = this.map.sectors[p.sector];
        if (sector.special === 9 && Math.abs(p.z - sector.floor) <= 0.1 && !this.visitedSecrets.has(sector.id)) {
          this.visitedSecrets.add(sector.id); this.secrets++; this.onMessage('Un secret a été découvert !'); this._sound('DSITEMUP');
        }
        if (sector.special === 7 && p.z <= sector.floor + 0.1) {
          this._acidTimer += h;
          if (this._acidTimer >= 32 / 35) { this._acidTimer -= 32 / 35; this.damagePlayer(5); }
        } else this._acidTimer = 0;
        // Sector special 11 is the E1M8 exit hub. It hurts, but it ends the
        // level rather than killing the player, so the episode can be finished.
        if (sector.special === 11 && !this.completed) {
          this.completed = true; this.exitSecret = false;
          this.damagePlayer(Math.max(0, Math.min(500, p.health - 1)));
          this._sound('DSSWTCHX'); this.onComplete(this.stats());
        }
      }
      const count = this.entities.length;
      for (let j = 0; j < count; j++) {
        const entity = this.entities[j];
        if (entity.removed) continue;
        if (entity.enemy) this._updateEnemy(entity, h);
        else if (entity.projectile) this._updateProjectile(entity, h);
        else if (entity.barrel) {
          if (entity.state === 'exploding') {
            entity.stateTime += h;
            entity.sprite = `BEXP${'ABCDE'[Math.min(4, Math.floor(entity.stateTime * 10))]}0`;
            if (entity.stateTime > 0.55) entity.removed = true;
          } else entity.sprite = `BAR1${Math.floor(this.time * 3) % 2 ? 'B' : 'A'}0`;
        } else if (entity.pickup) {
          this._gravity(entity, h);
          if (entity.pickup.frames) {
            const frames = entity.pickup.frames;
            entity.sprite = entity.pickup.sprite.slice(0, 4) + frames[Math.floor(this.time * 5) % frames.length] + '0';
          }
          if (p.health > 0 && Math.hypot(entity.x - p.x, entity.y - p.y) < 26
            && entity.z >= p.z - 8 && entity.z <= p.z + p.height) this._pickup(entity);
        }
      }
    }
    this._orientSprites();
    if (this.entities.length > 192) this.entities = this.entities.filter(entity => !entity.projectile || !entity.removed);
    return this.stats();
  }
}
