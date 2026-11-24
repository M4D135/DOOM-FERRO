/** Separates the wall-clock delta used for measurement from the bounded delta
 * handed to the simulation. The simulation cap remains, but it no longer hides
 * stalls from the frame-rate readout. */
export function createFrameTimer({ maxSimulationDelta = 0.05, smoothing = 0.04 } = {}) {
  let previous = null;
  let fps = 60;
  let lastRealDelta = 0;
  let lastSimulationDelta = 0;
  let lastTimestamp = 0;

  return {
    tick(timestamp) {
      const raw = previous === null ? 0 : Math.max(0, (timestamp - previous) / 1000);
      previous = timestamp;
      lastTimestamp = timestamp;
      lastRealDelta = raw;
      lastSimulationDelta = Math.min(maxSimulationDelta, raw);
      if (raw > 0) fps += (1 / raw - fps) * smoothing;
      return { rawDelta: raw, simulationDelta: lastSimulationDelta, fps };
    },
    reset() {
      previous = null;
      fps = 60;
      lastRealDelta = 0;
      lastSimulationDelta = 0;
      lastTimestamp = 0;
    },
    get fps() { return fps; },
    get realDelta() { return lastRealDelta; },
    get simulationDelta() { return lastSimulationDelta; },
    get timestamp() { return lastTimestamp; },
  };
}

export default createFrameTimer;
