import test from 'node:test';
import assert from 'node:assert/strict';
import {ProceduralResources} from '../src/procedural-resources.js';
import {buildMapGeometry} from '../src/ferro-doom-renderer.js';
import {EPISODE_PLANS} from '../src/episode-plans.js';

const resources = new ProceduralResources();

function missingFor(id) {
  const map = resources.map(id);
  const missing = new Set();
  for (const group of buildMapGeometry(resources, map)) {
    const surface = group.kind === 'flat' ? resources.flat(group.name) : resources.texture(group.name);
    if (!surface) missing.add(`${group.kind}:${group.name}`);
  }
  return [...missing].sort();
}

const QUALIFIED = ['E1M1', 'E1M2', 'E1M3', 'E1M4', 'E1M5', 'E1M9'];

test('the qualified levels are fully covered by the procedural material library', () => {
  for (const id of QUALIFIED) {
    assert.deepEqual(missingFor(id), [], `${id} must never fall back to a placeholder`);
  }
});

test('the remaining levels report their unimplemented surfaces', () => {
  const gap = {};
  for (const id of Object.keys(EPISODE_PLANS)) {
    if (QUALIFIED.includes(id)) continue;
    const missing = missingFor(id);
    if (missing.length) gap[id] = missing;
  }
  const total = new Set(Object.values(gap).flat()).size;
  // This number is a debt ceiling: writing a recipe must lower it, never raise it.
  assert.ok(total > 0, 'the survey gap below has been closed and must be re-measured');
  assert.equal(total, 16, `unimplemented surfaces changed from the recorded 16 to ${total}: `
    + Object.entries(gap).map(([id, names]) => `${id}=${names.length}`).join(' '));
  assert.deepEqual(Object.keys(gap), ['E1M6', 'E1M7', 'E1M8'],
    'every level beyond the qualified ones is expected to still need recipes');
});
