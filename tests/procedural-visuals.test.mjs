import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { proceduralTexture, proceduralFlat } from '../src/procedural-materials.js';
import { proceduralPatch, hasProceduralPatch } from '../src/procedural-sprites.js';

const digest = pixels => createHash('sha256').update(pixels).digest('hex');
const alphaCount = image => {
  let count = 0;
  for (let i = 3; i < image.pixels.length; i += 4) if (image.pixels[i]) count++;
  return count;
};
function valid(image, name) {
  assert.ok(image, name);
  assert.ok(Number.isInteger(image.width) && Number.isInteger(image.height), name + ' integer size');
  assert.ok(image.width > 0 && image.height > 0 && image.width <= 1024 && image.height <= 512, name + ' bounded size');
  assert.ok(image.pixels instanceof Uint8Array, name + ' RGBA bytes');
  assert.equal(image.pixels.length, image.width * image.height * 4, name + ' complete buffer');
  assert.ok(Number.isFinite(image.leftOffset) && Number.isFinite(image.topOffset), name + ' finite anchor');
  assert.ok(alphaCount(image) > 0, name + ' visible content');
}

test('all named level surface families produce complete opaque procedural materials', () => {
  const names = ['BIGDOOR2','BIGDOOR4','BRNBIGC','BRNBIGL','BRNBIGR','BROWN1','BROWN144','BROWN96','BROWNGRN','COMPSPAN','COMPTALL','COMPTILE','COMPUTE2','DOOR3','DOORSTOP','DOORTRAK','EXITDOOR','EXITSIGN','LITE3','NUKE24','PLANET1','SLADWALL','STARG3','STARGR1','STARTAN1','STARTAN3','STEP1','STEP6','SUPPORT2','SW1STRTN','SW2STRTN','TEKWALL1','TEKWALL4','SKY1'];
  for (const name of names) {
    const image = proceduralTexture(name); valid(image, name);
    assert.equal(alphaCount(image), image.width * image.height, name + ' opaque wall');
    const colors = new Set();
    for (let i = 0; i < image.pixels.length; i += 4) colors.add(image.pixels[i] * 65536 + image.pixels[i+1] * 256 + image.pixels[i+2]);
    assert.ok(colors.size > 12, name + ' shading and material detail');
  }
  assert.equal(proceduralTexture('-'), null);
  assert.equal(proceduralTexture(''), null);
});

test('floors, animated acid and switch states remain visually distinguishable', () => {
  const names = ['CEIL3_5','CEIL5_1','CEIL5_2','FLAT14','FLAT18','FLAT20','FLAT23','FLAT5_5','FLOOR1_1','FLOOR4_8','FLOOR5_1','FLOOR5_2','FLOOR6_2','FLOOR7_1','FLOOR7_2','STEP2','TLITE6_1','TLITE6_4','TLITE6_5','TLITE6_6','NUKAGE1','NUKAGE2','NUKAGE3'];
  for (const name of names) {
    const image = proceduralFlat(name); valid(image, name);
    assert.equal(image.width, 64); assert.equal(image.height, 64);
    assert.equal(alphaCount(image), 4096);
  }
  assert.equal(new Set(['NUKAGE1','NUKAGE2','NUKAGE3'].map(name => digest(proceduralFlat(name).pixels))).size, 3);
  assert.notEqual(digest(proceduralTexture('SW1STRTN').pixels), digest(proceduralTexture('SW2STRTN').pixels));
  assert.notEqual(digest(proceduralTexture('COMPTALL').pixels), digest(proceduralTexture('BROWN1').pixels));
});

test('fresh generators reproduce identical bytes without a seed file or image resource', async () => {
  const materials = await import('../src/procedural-materials.js?fresh-determinism');
  const sprites = await import('../src/procedural-sprites.js?fresh-determinism');
  for (const name of ['BIGDOOR2','COMPTALL','SKY1']) assert.equal(digest(proceduralTexture(name).pixels), digest(materials.proceduralTexture(name).pixels));
  for (const name of ['NUKAGE2','FLOOR4_8']) assert.equal(digest(proceduralFlat(name).pixels), digest(materials.proceduralFlat(name).pixels));
  for (const name of ['POSSA2A8','TROOH2H8','STBAR','PISGA0','M_DOOM']) assert.equal(digest(proceduralPatch(name).pixels), digest(sprites.proceduralPatch(name).pixels));
  assert.equal(proceduralPatch('POSSA2A8'), proceduralPatch('POSSA2'), 'rotation aliases share the generated resource');
  assert.equal(proceduralTexture('BIGDOOR2'), proceduralTexture('bigdoor2'), 'lazy cache reuses buffers');
});

test('volumetric actors have stable centered foot origins across views and animation', () => {
  for (const family of ['POSS','SPOS','TROO']) {
    const facing = [];
    for (let rotation = 1; rotation <= 8; rotation++) {
      const name = `${family}A${rotation}`, image = proceduralPatch(name); valid(image,name);
      assert.equal(image.width, 80); assert.equal(image.height, 72);
      assert.equal(image.leftOffset, 40); assert.equal(image.topOffset, 70);
      assert.ok(alphaCount(image) > 250 && alphaCount(image) < 2400, name + ' silhouette in transparent space');
      assert.equal(image.pixels[3], 0); assert.equal(image.pixels.at(-1), 0);
      facing.push(digest(image.pixels));
    }
    assert.ok(new Set(facing).size >= 5, family + ' generated view-dependent volumes');
    const frames = [];
    for (const frame of family === 'TROO' ? 'ABCDEFGHIJKLM' : 'ABCDEFGHIJKL') {
      const image = proceduralPatch(`${family}${frame}1`);
      assert.deepEqual([image.width,image.height,image.leftOffset,image.topOffset], [80,72,40,70]);
      frames.push(digest(image.pixels));
    }
    assert.ok(new Set(frames).size >= 9, family + ' walking, attack, pain and collapse frames');
  }
  assert.notEqual(digest(proceduralPatch('POSSA1').pixels),digest(proceduralPatch('SPOSA1').pixels));
  assert.notEqual(digest(proceduralPatch('SPOSA1').pixels),digest(proceduralPatch('TROOA1').pixels));
});

test('pickups, blockers and effects have visible silhouettes and valid world anchors', () => {
  const names = ['STIMA0','MEDIA0','BON1A0','BON1B0','BON2A0','ARM1A0','ARM1B0','ARM2A0','CLIPA0','AMMOA0','SHELA0','SBOXA0','SHOTA0','BAR1A0','BAR1B0','BEXPA0','BEXPB0','BEXPC0','BEXPD0','BEXPE0','BAL1A0','BAL1B0','BAL1C0','BAL1D0','BAL1E0','ELECA0','COLUA0','CBRAA0','PLAYW0','PLAYN0','POL5A0'];
  for (const name of names) {
    assert.equal(hasProceduralPatch(name), true);
    const image = proceduralPatch(name); valid(image,name);
    assert.equal(image.leftOffset, image.width / 2, name + ' centered billboard');
    assert.ok(alphaCount(image) < image.width * image.height, name + ' transparent background');
  }
  assert.equal(proceduralPatch('ELECA0').topOffset,128, 'tall solid scenery remains visible over its collision body');
  assert.equal(proceduralPatch('COLUA0').topOffset,48);
  assert.notEqual(digest(proceduralPatch('BAR1A0').pixels),digest(proceduralPatch('BAR1B0').pixels));
  assert.equal(new Set(['A','B','C','D','E'].map(frame=>digest(proceduralPatch(`BEXP${frame}0`).pixels))).size,5);
});

test('first-person weapons fit the logical viewport with neutral UI offsets', () => {
  const names = ['PISGA0','PISGB0','PISFA0','SHTGA0','SHTGB0','SHTGC0','SHTGD0','SHTFA0','PUNGA0','PUNGB0'];
  for (const name of names) {
    const image = proceduralPatch(name); valid(image,name);
    assert.deepEqual([image.width,image.height,image.leftOffset,image.topOffset],[320,168,0,0]);
    assert.ok(alphaCount(image) < 320*168*.23, name + ' does not cover the main view');
    for(let y=0;y<70;y++)for(let x=0;x<320;x++)assert.equal(image.pixels[(y*320+x)*4+3],0,name+' leaves the upper view clear');
  }
  assert.notEqual(digest(proceduralPatch('PISGA0').pixels),digest(proceduralPatch('PISGB0').pixels));
  assert.notEqual(digest(proceduralPatch('PUNGA0').pixels),digest(proceduralPatch('PUNGB0').pixels));
});

test('procedural status bar, digits, face and title satisfy the live HUD layout', () => {
  const bar=proceduralPatch('STBAR');valid(bar,'STBAR');assert.deepEqual([bar.width,bar.height],[320,32]);
  for (const prefix of ['STTNUM','STYSNUM','STGNUM']) {
    const hashes=[];
    for (let digit=0;digit<10;digit++) {const image=proceduralPatch(prefix+digit);valid(image,prefix+digit);hashes.push(digest(image.pixels));}
    assert.equal(new Set(hashes).size,10,prefix+' legible distinct digits');
  }
  for(const name of ['STFST00','STFST01','STFST02','STFST40','STFOUCH0','STFOUCH4','STFDEAD0']){
    const image=proceduralPatch(name);valid(image,name);
    assert.deepEqual([image.width,image.height,image.leftOffset,image.topOffset],[24,30,-5,-1]);
  }
  valid(proceduralPatch('M_DOOM'),'M_DOOM'); valid(proceduralPatch('STTPRCNT'),'STTPRCNT');
  assert.equal(proceduralPatch('missing-resource'),null);assert.equal(hasProceduralPatch('missing-resource'),false);
});

test('visual generator sources contain no external loading or stored bitmap mechanism', () => {
  for (const file of ['procedural-raster.js','procedural-materials.js','procedural-sprites.js']) {
    const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|atob|createImageBitmap|readFileSync)\s*\(/,file);
    assert.doesNotMatch(source,/data:image|base64|\.wad['"]|Math\.random\s*\(/i,file);
    assert.doesNotMatch(source,/from\s+['"](?!\.\/procedural-raster\.js)[^'"]+['"]/,file);
  }
});
