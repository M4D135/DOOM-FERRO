import { characterMesh } from './procedural-characters.js?v=0.5.0-c0b972f9f86b';
import { objectMesh, weaponMesh } from './procedural-objects.js?v=0.5.0-c0b972f9f86b';
import { MESH_VERTEX_STRIDE } from './procedural-mesh.js?v=0.5.0-c0b972f9f86b';

export const MODEL_VERTEX_STRIDE = MESH_VERTEX_STRIDE;
export const MODEL_INSTANCE_STRIDE = 8;

/** The old four-letter identifiers select a model recipe and animation pose.
 * They never select an image or an orientation relative to the camera. */
export function modelForEntity(entity, time = 0, detail = 2) {
  if (!entity || entity.removed) return null;
  return entity.enemy || /^(POSS|SPOS|TROO)/.test(entity.sprite || '')
    ? characterMesh(entity, time, detail) : objectMesh(entity, time, detail);
}

/** Conservative world-space sphere, before generating expensive close geometry.
 * Bounds include the largest authored poses, lamps and weapon pickups. */
function extent(entity) {
  const type = entity.type, family = String(entity.sprite || entity.base || '').slice(0,4);
  const height = type === 48 || family === 'ELEC' ? 132 : entity.enemy ? 64 : 60;
  const scale = Math.max(.01, Math.abs(entity.scale ?? 1));
  return {height: height * scale, radius: (height > 100 ? 73 : 48) * scale};
}

/** Frustum rejection and distance LOD never rotate an actor toward the camera.
 * Threshold hysteresis avoids alternating between recipes at a boundary. */
export function modelVisibility(entity, view, previousDetail) {
  if (!view) return {visible: true, detail: 2};
  const {height, radius} = extent(entity), r = radius / 32;
  const d = [entity.x / 32 - view.oeil[0], ((entity.z || 0) + height / 2) / 32 - view.oeil[1], -entity.y / 32 - view.oeil[2]];
  const dot = axis => d[0]*axis[0]+d[1]*axis[1]+d[2]*axis[2];
  const depth = dot(view.avant), ty = view.tangente, tx = ty * view.largeur / view.hauteur;
  if (depth < -r || Math.abs(dot(view.droite)) > depth*tx+r*Math.hypot(1,tx) ||
      Math.abs(dot(view.haut)) > depth*ty+r*Math.hypot(1,ty)) return {visible: false, detail: 0};
  const distance = Math.max(0, Math.hypot(...d)*32-radius) / Math.max(.01,Math.abs(entity.scale ?? 1));
  const near = previousDetail === 2 ? 288 : 224, far = previousDetail === 0 ? 576 : 704;
  return {visible: true, detail: distance < near ? 2 : distance < far ? 1 : 0};
}

/** Instance coordinates are FERRO world units. Local models use Doom units,
 * X right / Y forward / Z up. The GPU rotates around the actor's own heading. */
export function collectModelBatches(map, entities, time = 0, view = null, lodState = null, maxDetail = 2) {
  const batches = new Map(), summary = {total:0,visible:0,culled:0,lods:[0,0,0]};
  for (const entity of entities || []) {
    if (entity.removed) continue;
    summary.total++;
    const visibility = modelVisibility(entity,view,lodState?.get(entity));
    if (!visibility.visible) {summary.culled++;continue;}
    visibility.detail=Math.min(visibility.detail,maxDetail);
    lodState?.set(entity,visibility.detail);
    const mesh = modelForEntity(entity, time, visibility.detail);
    if (!mesh) continue;
    summary.visible++;summary.lods[visibility.detail]++;
    const sector = map.sectorAt(entity.x, entity.y);
    const z = Number.isFinite(entity.z) ? entity.z : sector?.floor || 0;
    let batch = batches.get(mesh.key);
    if (!batch) { batch = {mesh, values: [], entityIds: []}; batches.set(mesh.key, batch); }
    batch.values.push(entity.x / 32, z / 32, -entity.y / 32, entity.angle || 0,
      entity.scale ?? 1, entity.fullbright ? 2 : (sector?.light ?? 192) / 255,
      sector?.special || 0, 0);
    batch.entityIds.push(entity.id);
  }
  const result = [...batches.values()].map(batch => ({mesh: batch.mesh,
    instances: new Float32Array(batch.values), count: batch.entityIds.length,
    entityIds: batch.entityIds}));
  Object.defineProperty(result,'summary',{value:summary});
  return result;
}

/** A nearby object can cast a visible shadow while outside the camera. Reuse
 * the visible pose buffers exactly; extra casters use at most the middle LOD
 * and are bounded by the primary light's range and projection cone. */
export function collectShadowBatches(map,entities,time,lighting,visibleBatches) {
  const visibleIds=new Set(visibleBatches.flatMap(batch=>batch.entityIds));
  const origin=lighting.shadowView.oeil,range=lighting.shadowRange+2.5;
  const extra=(entities||[]).filter(e=>!e.removed&&!visibleIds.has(e.id)&&
    Math.hypot(e.x/32-origin[0],((e.z||0)+32)/32-origin[1],-e.y/32-origin[2])<range);
  return [...visibleBatches,...collectModelBatches(map,extra,time,lighting.shadowView,null,1)];
}

/** Weapon geometry lives in the camera's 3D basis, with depth between its parts. */
export function viewWeaponBatch(weapon, time = 0) {
  if (!weapon || weapon.dead) return null;
  const mesh = weaponMesh(weapon.kind || 'pistol', weapon.phase ?? Infinity);
  if (!mesh) return null;
  const bob = weapon.moving ? Math.sin(time * 9) : 0;
  return {mesh, instances: new Float32Array([bob * .7, 0, Math.abs(bob) * .5,
    0, 1, Math.max(.65, weapon.light ?? .9), 0, 0]), count: 1};
}
