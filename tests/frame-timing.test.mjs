import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameTimer } from '../src/frame-timing.js';

test('the frame timer measures real stalls while bounding only the simulation delta', () => {
  const timer = createFrameTimer({ maxSimulationDelta: 0.05, smoothing: 1 });
  assert.deepEqual(timer.tick(0), { rawDelta: 0, simulationDelta: 0, fps: 60 });
  assert.deepEqual(timer.tick(16), { rawDelta: 0.016, simulationDelta: 0.016, fps: 62.5 });
  assert.deepEqual(timer.tick(116), { rawDelta: 0.1, simulationDelta: 0.05, fps: 10 });
  assert.equal(timer.realDelta, 0.1);
  assert.equal(timer.simulationDelta, 0.05);
  timer.reset();
  assert.equal(timer.realDelta, 0);
  assert.equal(timer.simulationDelta, 0);
});
