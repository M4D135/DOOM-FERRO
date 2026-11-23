import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Wad} from '../src/wad.js';
import {DoomGame, closestPointOnSegment} from '../src/game.js';

const bytes = readFileSync(new URL('../assets/doom1.wad', import.meta.url));
function setup(skill = 2, callbacks = {}) {
  const wad = new Wad(bytes), map = wad.map('E1M1');
  return {wad, map, game: new DoomGame(map, {skill, ...callbacks})};
}
function park(game, x, y, angle = 0) {
  const sector = game.map.sectorAt(x, y);
  Object.assign(game.player, {x, y, angle, z: sector.floor, sector: sector.id, vz: 0});
}
function quiet(game) { game.entities.forEach(entity => { entity.removed = true; }); }
function tick(game, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 70); i++) game.update(1 / 70, input);
}
function fireballFromLeft(game, target, height = 26) {
  const projectile = {id: 'test-fireball', type: 'fireball', projectile: true, owner: null,
    x: target.x - 40, y: target.y, z: target.z + height, vx: 350, vy: 0, vz: 0,
    sprite: 'BAL1A0', radius: 6, height: 12, sector: target.sector, alive: true,
    solid: false, fullbright: true, flip: false, scale: 1, removed: false, age: 0};
  game.entities.push(projectile);
  return projectile;
}
function pointInSector(game, id) {
  for (const sub of game.map.subsectors.filter(sub => sub.sector === id)) {
    const vertices = game.map.segs.slice(sub.first, sub.first + sub.count).map(seg => game.map.vertices[seg.v1]);
    const x = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const y = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    if (game.map.sectorAt(x, y).id === id) return {x, y};
  }
  throw new Error(`No interior sample for sector ${id}`);
}

test('original solo skill flags, entity sprites, player start and three secrets', () => {
  for (const [skill, kills, items] of [[1, 4, 37], [2, 6, 37], [3, 29, 38]]) {
    const {game, wad} = setup(skill);
    assert.equal(game.totalKills, kills); assert.equal(game.totalItems, items); assert.equal(game.totalSecrets, 3);
    assert.deepEqual([game.player.x, game.player.y, game.player.z], [1056, -3616, 0]);
    assert.equal(game.player.angle, Math.PI / 2);
    for (const entity of game.entities) assert.ok(wad.has(entity.sprite), entity.sprite);
    assert.ok(!game.entities.some(e => e.type === 2002 || e.type === 2003), 'multiplayer-only weapons are absent');
  }
});

test('swept player movement cannot tunnel through a wall or diagonal corner', () => {
  const {game} = setup(); quiet(game);
  game.moveActor(game.player, 0, -4000);
  assert.ok(game.player.y >= -3664.1 && game.player.y <= -3663.9, 'radius16 stops against south wall at -3680');
  game.moveActor(game.player, 4000, -4000);
  for (const line of game.nearbyLines(game.player.x, game.player.y, 17)) {
    if (!game.lineBlocksActor(line, game.player)) continue;
    const p = closestPointOnSegment(game.player.x, game.player.y, line.ax, line.ay, line.bx, line.by);
    assert.ok(Math.hypot(p.x - game.player.x, p.y - game.player.y) >= 15.97, `wall ${line.id}`);
  }
  assert.ok(game.map.sectorAt(game.player.x, game.player.y).ceiling - game.player.z >= 56);
});

test('all four original manual doors block, open, and allow the player through', () => {
  for (const id of [151, 247, 324, 340]) {
    const {game} = setup(); quiet(game);
    const line = game.lines[id], dx = line.bx - line.ax, dy = line.by - line.ay, length = Math.hypot(dx, dy);
    const midX = (line.ax + line.bx) / 2, midY = (line.ay + line.by) / 2;
    const nx = dy / length, ny = -dx / length;
    park(game, midX + nx * 40, midY + ny * 40, Math.atan2(-ny, -nx));
    game.moveActor(game.player, -nx * 80, -ny * 80);
    assert.ok((game.player.x - midX) * nx + (game.player.y - midY) * ny >= 15.9, `closed door ${id}`);
    assert.equal(game.use().type, 'door', `use ${id}`);
    tick(game, 1.5);
    assert.ok(game.map.sectors[line.back].ceiling - game.map.sectors[line.back].floor >= 56, `headroom ${id}`);
    game.moveActor(game.player, -nx * 95, -ny * 95);
    assert.ok((game.player.x - midX) * nx + (game.player.y - midY) * ny < -16, `through ${id}`);
  }
});

test('closing door reopens when a player radius overlaps its boundary', () => {
  const {game} = setup(); quiet(game);
  park(game, 1496, -2496, 0); game.use(); tick(game, 1.5);
  park(game, 1528, -2496, 0);
  assert.equal(game.player.sector, 3, 'center is adjacent to, rather than inside, sector4');
  game.actions.get(4).phase = 'down'; tick(game, 0.5);
  assert.ok(game.map.sectors[4].ceiling >= 56);
  assert.notEqual(game.actions.get(4).phase, 'down');
});

test('closed doors block line of sight and hitscan, then open their portals', () => {
  const {game} = setup(); quiet(game);
  assert.equal(game.lineOfSight(1496, -2496, 32, 1580, -2496, 32), false);
  park(game, 1496, -2496, 0); game.use(); tick(game, 1.5);
  assert.equal(game.lineOfSight(1496, -2496, 32, 1580, -2496, 32), true);
});

test('crossing original line308 lowers the tagged secret floor once', () => {
  const {game} = setup(); quiet(game);
  park(game, 3008, -4200, Math.PI / 2);
  game.moveActor(game.player, 0, 80);
  assert.equal(game.actions.get(59)?.kind, 'floor');
  tick(game, 1.2);
  assert.equal(game.map.sectors[59].floor, -40);
  game.moveActor(game.player, 0, -80);
  assert.equal(game.actions.has(59), false, 'one-use trigger does not restart');
});

test('crossing original line195 cycles the tagged secret lift down, waits, returns', () => {
  const {game} = setup(); quiet(game);
  const line = game.lines[195], dx = line.bx - line.ax, dy = line.by - line.ay, length = Math.hypot(dx, dy);
  const nx = dy / length, ny = -dx / length, x = (line.ax + line.bx) / 2, y = (line.ay + line.by) / 2;
  park(game, x + nx * 20, y + ny * 20);
  game.moveActor(game.player, -nx * 40, -ny * 40);
  assert.equal(game.actions.get(70)?.kind, 'lift');
  tick(game, 1.2);
  assert.equal(game.map.sectors[70].floor, -48);
  tick(game, 4.2);
  assert.equal(game.map.sectors[70].floor, 104);
  assert.equal(game.actions.has(70), false);
});

test('acid damages a grounded player; secrets count each original sector only once', () => {
  const {game} = setup(); quiet(game);
  const acid = pointInSector(game, 13); park(game, acid.x, acid.y); tick(game, 1);
  assert.equal(game.player.health, 95);
  for (const id of [68, 69, 70]) {
    const point = pointInSector(game, id); park(game, point.x, point.y); game.update(1 / 70);
    game.update(1 / 70);
  }
  assert.equal(game.secrets, 3);
});

test('pistol, fists and original shotgun pickup use the correct ammunition pools', () => {
  const {game} = setup();
  assert.ok(game.fire()); assert.equal(game.player.ammo, 49); assert.equal(game.fire(), false);
  tick(game, 0.3); game.selectWeapon('fist'); game.fire(); assert.equal(game.player.ammo, 49);
  const shotgun = game.entities.find(e => e.type === 2001);
  park(game, shotgun.x, shotgun.y); game.update(1 / 70);
  assert.equal(game.player.weapon, 'shotgun'); assert.equal(game.player.shells, 8); assert.ok(shotgun.removed);
  tick(game, 0.5); game.fire(); assert.equal(game.player.shells, 7); assert.equal(game.player.ammo, 49);
});

test('real E1M1 enemy can be shot, dies once and drops ammunition', () => {
  const {game} = setup();
  const enemy = game.entities.find(e => e.type === 3004 && e.x === 3056);
  game.entities.forEach(e => { if (e !== enemy) e.removed = true; });
  park(game, 3056, -3510, -Math.PI / 2);
  for (let i = 0; i < 8 && enemy.alive; i++) { game.fire(); tick(game, 0.3); }
  assert.equal(enemy.alive, false); assert.equal(enemy.solid, false); assert.equal(game.kills, 1);
  assert.ok(game.entities.some(e => e.id === `drop-${enemy.id}`));
  game.damageEntity(enemy, 100); assert.equal(game.kills, 1);
});

test('barrel explosion damages nearby actors and resolves to valid original sprites', () => {
  const {game, wad} = setup();
  const barrel = game.entities.find(e => e.barrel);
  game.entities.forEach(e => { if (e !== barrel) e.removed = true; });
  park(game, barrel.x - 35, barrel.y); game.player.armor = 100; game.player.armorType = 1;
  game.damageEntity(barrel, 21); assert.equal(barrel.alive, false); assert.equal(barrel.solid, false);
  assert.ok(game.player.health < 100); assert.ok(game.player.armor < 100);
  for (let i = 0; i < 5; i++) { tick(game, 0.1); assert.ok(wad.has(barrel.sprite), barrel.sprite); }
  tick(game, 0.1); assert.ok(barrel.removed);
});

test('original solid lamp blocks an imp fireball and protects the player behind it', () => {
  const sounds = [];
  const {game, wad} = setup(3, {onSound: name => sounds.push(name)});
  const lamp = game.entities.find(e => e.id === 40);
  assert.equal(lamp.type, 2028); assert.equal(lamp.solid, true); assert.equal(lamp.alive, false);
  game.entities.forEach(e => { if (e !== lamp) e.removed = true; });
  park(game, lamp.x + 48, lamp.y);
  const projectile = fireballFromLeft(game, lamp);
  tick(game, 0.2);
  assert.equal(projectile.alive, false, 'a solid, nonliving decoration stops the fireball');
  assert.ok(projectile.x < lamp.x, 'the collision occurs before crossing the lamp');
  assert.equal(game.player.health, 100, 'the player behind the lamp receives no damage');
  assert.equal(lamp.removed, false); assert.equal(lamp.solid, true);
  assert.ok(sounds.includes('DSFIRXPL'), 'the fireball still plays its impact sound');
  assert.ok(wad.has(projectile.sprite), 'the impact uses an original Doom sprite');
});

test('original nonsolid candle and corpse allow a fireball to reach the player', () => {
  for (const id of [61, 124]) {
    const {game} = setup(3);
    const decoration = game.entities.find(e => e.id === id);
    assert.equal(decoration.solid, false); assert.equal(decoration.alive, false);
    game.entities.forEach(e => { if (e !== decoration) e.removed = true; });
    park(game, decoration.x + 48, decoration.y);
    // Low trajectory overlaps even the corpse's height, so this exercises
    // nonsolidity rather than merely passing over a short decoration.
    const projectile = fireballFromLeft(game, decoration, 4);
    tick(game, 0.25);
    assert.ok(projectile.x > decoration.x, `fireball passes decoration ${id}`);
    assert.equal(projectile.alive, false, 'the fireball then impacts the player');
    assert.ok(game.player.health < 100, `decoration ${id} does not shield the player`);
    assert.equal(decoration.removed, false);
  }
});

test('fireballs still impact and damage living enemies and barrels', () => {
  for (const id of [11, 35]) {
    const {game, wad} = setup(3);
    const target = game.entities.find(e => e.id === id), hp = target.hp;
    game.entities.forEach(e => { if (e !== target) e.removed = true; });
    const projectile = fireballFromLeft(game, target);
    // Isolate the projectile collision from enemy movement and attacks.
    for (let i = 0; i < 20 && projectile.alive; i++) game._updateProjectile(projectile, 1 / 70);
    assert.equal(projectile.alive, false, `fireball impacts target ${id}`);
    assert.ok(target.hp < hp, `living target ${id} takes damage`);
    game._updateProjectile(projectile, 1 / 70);
    assert.ok(wad.has(projectile.sprite), 'the impact keeps a valid original animation');
  }
});

test('only an aimed nearby exit switch completes E1M1 and restart restores everything', () => {
  let completed = 0;
  const {game} = setup(2, {onComplete: () => completed++});
  quiet(game); assert.equal(game.use(), false); assert.equal(completed, 0);
  const side = game.map.sides[game.lines[330].right], original = {...side};
  park(game, 2940, -4768, Math.PI);
  assert.equal(game.use().type, 'exit'); assert.equal(completed, 1); assert.equal(game.completed, true);
  assert.ok(['upper', 'middle', 'lower'].some(k => side[k].startsWith('SW2')));
  game.use(); assert.equal(completed, 1);
  game.restart(); assert.equal(game.completed, false); assert.deepEqual(side, original);
  assert.equal(game.player.health, 100); assert.equal(game.player.ammo, 50);
  assert.equal(game.map.sectors[4].ceiling, 0); assert.equal(game.map.sectors[70].floor, 104);
});

test('armor bonuses restore basic protection after blue armor is exhausted', () => {
  const {game} = setup();
  const bonuses = game.entities.filter(e => e.type === 2015).slice(0, 10);
  game.entities.forEach(e => { if (!bonuses.includes(e)) e.removed = true; });
  Object.assign(game.player, {health: 200, armor: 1, armorType: 2});
  game.damagePlayer(4);
  assert.equal(game.player.armor, 0);
  assert.equal(game.player.armorType, 0, 'depleted blue armor no longer grants its protection rate');
  assert.equal(game.player.health, 197);
  for (const bonus of bonuses) {
    park(game, bonus.x, bonus.y);
    game.update(1 / 70);
    assert.ok(bonus.removed, 'original E1M1 armor bonus is collected');
  }
  assert.equal(game.player.armor, 10);
  assert.equal(game.player.armorType, 1, 'armor bonuses alone restore basic armor');
  game.damagePlayer(20);
  assert.equal(game.player.armor, 4, 'basic armor absorbs floor(20 / 3), rather than half');
  assert.equal(game.player.health, 183);
});

test('same input sequence and random seed produce the same simulation', () => {
  const a = setup(3).game, b = setup(3).game;
  for (let i = 0; i < 350; i++) {
    const input = {forward: 1, turn: i > 150 ? 0.015 : 0, fire: i % 7 === 0, run: true};
    a.update(1 / 70, input); b.update(1 / 70, input);
  }
  assert.deepEqual(a.stats(), b.stats());
  assert.deepEqual(a.player, b.player);
  assert.deepEqual(a.entities, b.entities);
});

test('complete main route from authentic spawn with real movement and door use, no teleport', () => {
  const {game} = setup();
  // Only enemies are excluded from this movement acceptance test. Original
  // barrels, solid scenery, pickups, floors and initially closed doors remain.
  game.entities.forEach(entity => { if (entity.enemy) entity.removed = true; });
  const waypoints = [[1056,-3072],[1248,-2880],[1248,-2720],[1264,-2704],[1264,-2688],
    [1392,-2560],[1424,-2560],[1440,-2544],[2032,-2544],[2096,-2608],[2640,-2608],
    [2896,-2864],[2896,-3568],[2960,-3632],[2960,-4288],[2976,-4304],[2976,-4576],
    [2992,-4592],[2992,-4720],[2944,-4768]];
  const doors = [];
  for (const [x, y] of waypoints) {
    let frames = 0;
    while (Math.hypot(game.player.x - x, game.player.y - y) > 0.3) {
      const p = game.player, distance = Math.hypot(x - p.x, y - p.y), angle = Math.atan2(y - p.y, x - p.x);
      const hit = game.raycast(p.x, p.y, p.z + 32, angle, 64);
      const use = Boolean(hit.line?.special === 1 && !game.actions.has(hit.line.back));
      if (use) doors.push(hit.line.id);
      game.update(1 / 70, {forward: Math.min(1, distance / (200 / 70)),
        turn: Math.atan2(Math.sin(angle - p.angle), Math.cos(angle - p.angle)), use});
      assert.ok(++frames < 2100, `trapped before waypoint ${x},${y}; at ${p.x},${p.y}, sector ${p.sector}`);
      assert.ok(p.health > 0);
    }
  }
  assert.equal(game.completed, false, 'reaching the room does not substitute for activating its exit');
  assert.deepEqual(doors, [151, 340, 325]);
  assert.equal(game.player.sector, 82);
  game.update(1 / 70, {use: false});
  game.update(1 / 70, {turn: Math.atan2(Math.sin(Math.PI - game.player.angle), Math.cos(Math.PI - game.player.angle)), use: true});
  assert.equal(game.completed, true);
  assert.ok(game.time > 20 && game.time < 40, 'real walking time includes door waits');
});
