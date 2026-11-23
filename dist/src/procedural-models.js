import { characterMesh } from './procedural-characters.js?v=0.3.0-663ad4ffe1db';
import { objectMesh, weaponMesh } from './procedural-objects.js?v=0.3.0-663ad4ffe1db';

export const MODEL_VERTEX_STRIDE = 10;
export const MODEL_INSTANCE_STRIDE = 8;

/** The old four-letter identifiers select a model recipe and animation pose.
 * They never select an image or an orientation relative to the camera. */
export function modelForEntity(entity, time = 0) {
  if (!entity || entity.removed) return null;
  return entity.enemy || /^(POSS|SPOS|TROO)/.test(entity.sprite || '')
    ? characterMesh(entity, time) : objectMesh(entity, time);
}

/** Instance coordinates are FERRO world units. Local models use Doom units,
 * X right / Y forward / Z up. The GPU rotates around the actor's own heading. */
export function collectModelBatches(map, entities, time = 0) {
  const batches = new Map();
  for (const entity of entities || []) {
    if (entity.removed) continue;
    const mesh = modelForEntity(entity, time);
    if (!mesh) continue;
    const sector = map.sectorAt(entity.x, entity.y);
    const z = Number.isFinite(entity.z) ? entity.z : sector?.floor || 0;
    let batch = batches.get(mesh.key);
    if (!batch) { batch = {mesh, values: [], entityIds: []}; batches.set(mesh.key, batch); }
    batch.values.push(entity.x / 32, z / 32, -entity.y / 32, entity.angle || 0,
      entity.scale ?? 1, entity.fullbright ? 2 : (sector?.light ?? 192) / 255,
      sector?.special || 0, 0);
    batch.entityIds.push(entity.id);
  }
  return [...batches.values()].map(batch => ({mesh: batch.mesh,
    instances: new Float32Array(batch.values), count: batch.entityIds.length,
    entityIds: batch.entityIds}));
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
