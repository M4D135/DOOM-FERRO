/** All shipped resources are generated from code; no binary asset is loaded. */
import {createEpisodeMap} from './procedural-map.js';
import {EPISODE_PLANS} from './episode-plans.js';
import { proceduralTexture, proceduralFlat } from './procedural-materials.js';
import { proceduralPatch, hasProceduralPatch } from './procedural-interface.js';

export class ProceduralResources {
  constructor() {
    this.kind = 'procedural';
    this.used = new Map();
    this.maps = new Map();
  }

  _remember(kind, name, value) {
    if (value) this.used.set(kind + ':' + name, value);
    return value;
  }

  /** Build a surveyed level once and reuse it; an unsurveyed id is refused. */
  map(name = 'E1M1') {
    if (!Object.hasOwn(EPISODE_PLANS, name)) throw new Error(`Seul un plan arpenté est disponible (${name}).`);
    if (!this.maps.has(name)) this.maps.set(name, createEpisodeMap(name));
    return this.maps.get(name);
  }

  /** True only for a level whose plan was surveyed offline. */
  canBuild(name) { return Object.hasOwn(EPISODE_PLANS, name); }

  /** Drop a built level so its cells and meshes can be reclaimed. */
  releaseMap(name) { this.maps.delete(name); }

  texture(name) { return this._remember('wall', name, proceduralTexture(name)); }
  flat(name) { return this._remember('flat', name, proceduralFlat(name)); }
  patch(name) { return this._remember('interface', name, proceduralPatch(name)); }
  has(name) { return hasProceduralPatch(name); }

  stats() {
    return { mode: this.kind, generatedImages: this.used.size,
      rgbaBytes: [...this.used.values()].reduce((sum, value) => sum + value.pixels.byteLength, 0),
      importedAssets: 0 };
  }
}
