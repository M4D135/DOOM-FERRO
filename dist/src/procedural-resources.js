/** All shipped resources are generated from code; no binary asset is loaded. */
import { createE1M1Map } from './procedural-map.js?v=0.5.0-c0b972f9f86b';
import { proceduralTexture, proceduralFlat } from './procedural-materials.js?v=0.5.0-c0b972f9f86b';
import { proceduralPatch, hasProceduralPatch } from './procedural-interface.js?v=0.5.0-c0b972f9f86b';

export class ProceduralResources {
  constructor() {
    this.kind = 'procedural';
    this.used = new Map();
  }

  _remember(kind, name, value) {
    if (value) this.used.set(kind + ':' + name, value);
    return value;
  }

  map(name = 'E1M1') {
    if (name !== 'E1M1') throw new Error('Seul le plan E1M1 est disponible.');
    return createE1M1Map();
  }

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
