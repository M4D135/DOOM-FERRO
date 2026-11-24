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

test('every surveyed level is fully covered by the procedural material library', () => {
  const gap = {};
  for (const id of Object.keys(EPISODE_PLANS)) {
    const missing = missingFor(id);
    if (missing.length) gap[id] = missing;
  }
  assert.deepEqual(gap, {}, 'no level may fall back to the renderer placeholder: '
    + Object.entries(gap).map(([id, names]) => `${id}=${names.join(',')}`).join(' '));
});
