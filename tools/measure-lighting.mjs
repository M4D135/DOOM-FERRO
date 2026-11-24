#!/usr/bin/env node
/** Measure how much the local lighting changes between two consecutive frames.
 *
 * The same camera paths are replayed twice: once stateless, where every frame
 * re-picks its sources from scratch (the behaviour the rig had before the
 * stability pass), and once continuous, where the previous frame is handed
 * back to the rig. A "pop" is a source appearing or disappearing, a weight
 * jump, a shadow owner change or a jump of the shadow projection. */
import {ProceduralResources} from '../src/procedural-resources.js';
import {buildLightingRig, sceneLighting, MAX_SCENE_LIGHTS, ENTRY_RANGE, RETENTION_RANGE, FADE_SECONDS} from '../src/procedural-lighting.js';

const map = new ProceduralResources().map('E1M1');
const rig = buildLightingRig(map);
const view = (x, y, z, angle = 0) => ({
  oeil: [x / 32, z / 32, -y / 32],
  avant: [Math.cos(angle), 0, -Math.sin(angle)],
  droite: [Math.sin(angle), 0, Math.cos(angle)],
  haut: [0, 1, 0],
});

const paths = {
  'A wall lamp corridor': Array.from({length: 11}, (_, i) => view(2495 + i, -2285, 73, Math.PI / 2)),
  'B sector light room': Array.from({length: 11}, (_, i) => view(1647 + i, -2525, 41, Math.PI / 2)),
  'C fill only room': Array.from({length: 11}, (_, i) => view(735 + i, -3405, 41, Math.PI / 2)),
  'D head turn': Array.from({length: 9}, (_, i) => view(2499, -2285, 73, i * Math.PI / 16)),
};

const active = lighting => new Set(lighting.sources.filter(source => source.weight > 0.05).map(source => source.id));
const weights = lighting => new Map(lighting.sources.map(source => [source.id, source.weight]));
const effective = lighting => new Map(lighting.sources.map(source => [source.id, source.power * source.weight]));
const maxDelta = (a, b) => a.reduce((worst, value, i) => Math.max(worst, Math.abs(value - b[i])), 0);

function replay(frames, continuous) {
  const report = {frames: frames.length, setChanges: 0, hardPops: 0, settledIntensityJumps: 0,
    shadowOwnerChanges: 0, shadowProjectionJumps: 0, worstWeightJump: 0, worstSettledIntensityJump: 0,
    worstShadowProjectionDelta: 0, appeared: [], disappeared: []};
  let previous = null, previousActive = null, previousWeights = null, previousEffective = null,
    previousShadow = null, previousVP = null;
  frames.forEach((camera, index) => {
    const lighting = sceneLighting(rig, camera, [], index * 0.016, null, continuous ? previous : null);
    previous = lighting;
    if (index === 0) {
      previousActive = active(lighting); previousWeights = weights(lighting);
      previousEffective = effective(lighting);
      previousShadow = lighting.debug.shadowSource; previousVP = Array.from(lighting.shadowVP);
      return;
    }
    const now = active(lighting), nowWeights = weights(lighting), nowEffective = effective(lighting);
    for (const id of now) if (!previousActive.has(id) && !report.appeared.includes(id)) report.appeared.push(id);
    for (const id of previousActive) if (!now.has(id) && !report.disappeared.includes(id)) report.disappeared.push(id);
    if (now.size !== previousActive.size || [...now].some(id => !previousActive.has(id))) report.setChanges++;
    for (const id of new Set([...now, ...previousActive])) {
      const before = previousWeights.get(id) ?? 0, after = nowWeights.get(id) ?? 0;
      const jump = Math.abs(after - before);
      if (jump > 0.5) report.hardPops++;
      report.worstWeightJump = Math.max(report.worstWeightJump, jump);
      if (before > 0.9 && after > 0.9) {
        const relative = Math.abs(nowEffective.get(id) - previousEffective.get(id)) /
          Math.max(Math.abs(previousEffective.get(id)), Math.abs(nowEffective.get(id)), 1e-6);
        if (relative > 0.15) report.settledIntensityJumps++;
        report.worstSettledIntensityJump = Math.max(report.worstSettledIntensityJump, relative);
      }
    }
    if (lighting.debug.shadowSource !== previousShadow) report.shadowOwnerChanges++;
    const vp = Array.from(lighting.shadowVP);
    const delta = previousVP.length === vp.length ? maxDelta(previousVP, vp) : Infinity;
    if (delta > 0.05) report.shadowProjectionJumps++;
    report.worstShadowProjectionDelta = Math.max(report.worstShadowProjectionDelta, delta);
    previousActive = now; previousWeights = nowWeights; previousEffective = nowEffective;
    previousShadow = lighting.debug.shadowSource; previousVP = vp;
  });
  return report;
}

const measured = {scope: 'Replayed E1M1 camera paths through the production lighting rig. Stateless frames re-pick '
  + 'their sources every frame, which is the behaviour before the stability pass; continuous frames hand the previous '
  + 'lighting back to the rig. A hard pop is a source whose weight moves by more than 0.5 in a single frame, which no '
  + '0.18 s fade can produce; a settled intensity jump is a source already at full weight whose emitted power changes '
  + 'by more than 15 per cent between two frames. Values are counts over the transitions of each path, not pixels.',
  map: 'E1M1', maxSceneLights: MAX_SCENE_LIGHTS, entryRange: ENTRY_RANGE, retentionRange: RETENTION_RANGE,
  fadeSeconds: FADE_SECONDS, paths: {}};

for (const [name, frames] of Object.entries(paths)) {
  measured.paths[name] = {stateless: replay(frames, false), continuous: replay(frames, true)};
}
measured.summary = {
  statelessHardPops: Object.values(measured.paths).reduce((sum, path) => sum + path.stateless.hardPops, 0),
  continuousHardPops: Object.values(measured.paths).reduce((sum, path) => sum + path.continuous.hardPops, 0),
  statelessShadowChanges: Object.values(measured.paths).reduce((sum, path) => sum + path.stateless.shadowOwnerChanges, 0),
  continuousShadowChanges: Object.values(measured.paths).reduce((sum, path) => sum + path.continuous.shadowOwnerChanges, 0),
  statelessShadowProjectionJumps: Object.values(measured.paths).reduce((sum, path) => sum + path.stateless.shadowProjectionJumps, 0),
  continuousShadowProjectionJumps: Object.values(measured.paths).reduce((sum, path) => sum + path.continuous.shadowProjectionJumps, 0),
  continuousSettledIntensityJumps: Object.values(measured.paths).reduce((sum, path) => sum + path.continuous.settledIntensityJumps, 0),
};

process.stdout.write(JSON.stringify(measured, null, 2) + '\n');
