import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {proceduralTexture,proceduralFlat,TEXTURE_DIMENSIONS,FLAT_NAMES} from '../src/procedural-materials.js';
import {surfaceDetail,surfaceDetailCacheStats,clearSurfaceDetailCache,SURFACE_DETAIL_BUDGET} from '../src/procedural-surface-detail.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sample = (resource,field,x,y) => {
  const xx=Math.max(0,Math.min(resource.width-1,Math.floor(x/resource.baseWidth*resource.width)));
  const yy=Math.max(0,Math.min(resource.height-1,Math.floor(y/resource.baseHeight*resource.height)));
  return [...resource[field].slice((yy*resource.width+xx)*4,(yy*resource.width+xx)*4+4)];
};

test('every E1M1 material has complete continuous PBR maps with preserved UV extents',()=>{
  for(const [kind,names] of [['texture',Object.keys(TEXTURE_DIMENSIONS)],['flat',FLAT_NAMES]])for(const name of names){
    const base=kind==='flat'?proceduralFlat(name):proceduralTexture(name);
    const detail=surfaceDetail(kind,name,base,{maxSize:128});
    if(name==='SKY1'||name==='F_SKY1'){assert.equal(detail,null,'sky is drawn by the dedicated sky path');continue;}
    assert.equal(detail.baseWidth,base.width,name+' keeps horizontal texture scale');
    assert.equal(detail.baseHeight,base.height,name+' keeps vertical texture scale');
    assert.ok(detail.width<=128&&detail.height<=128,name+' obeys GPU size cap');
    for(const field of ['pixels','normalRoughness','surface']){
      assert.ok(detail[field] instanceof Uint8Array,name+' '+field+' bytes');
      assert.equal(detail[field].length,detail.width*detail.height*4,name+' '+field+' completeness');
    }
    for(let i=0;i<detail.normalRoughness.length;i+=52){
      const n=detail.normalRoughness;
      const length=Math.hypot(n[i]/127.5-1,n[i+1]/127.5-1,n[i+2]/127.5-1);
      assert.ok(Math.abs(length-1)<.012,name+' encoded unit tangent normal');
      assert.ok(n[i+2]>=128,name+' height field faces outward');
      assert.ok(n[i+3]>=22&&n[i+3]<=250,name+' bounded physical roughness');
    }
    assert.ok(detail.heightScale>0&&detail.heightScale<=3,name+' small physical relief in Doom units');
  }
});

test('HD wall and floor recipes reproduce deterministically without modifying the legacy source',async()=>{
  const fresh=await import('../src/procedural-surface-detail.js?deterministic-instance');
  for(const [kind,name] of [['texture','STARTAN3'],['texture','BIGDOOR2'],['texture','COMPUTE1'],['flat','FLOOR4_8'],['flat','NUKAGE2']]){
    const base=kind==='flat'?proceduralFlat(name):proceduralTexture(name),before=digest(base.pixels);
    const a=surfaceDetail(kind,name,base,{maxSize:128}),b=fresh.surfaceDetail(kind,name,base,{maxSize:128});
    for(const field of ['pixels','normalRoughness','surface'])assert.equal(digest(a[field]),digest(b[field]),name+' '+field);
    assert.equal(digest(base.pixels),before,name+' source pixels remain untouched');
    assert.notEqual(a.pixels,base.pixels,name+' separate albedo buffer');
    assert.notEqual(a.normalRoughness,a.surface,name+' material and normals are independent');
  }
});

test('normal map follows the measured bevel height instead of painted brightness',()=>{
  const d=surfaceDetail('texture','STARTAN3',proceduralTexture('STARTAN3'));
  assert.deepEqual([d.width,d.height,d.baseWidth,d.baseHeight],[512,512,128,128]);
  const center=sample(d,'surface',16,29),gutter=sample(d,'surface',.2,29);
  assert.ok(center[3]>gutter[3]+50,'raised panel stands above its narrow assembly seam');
  const normal=sample(d,'normalRoughness',.5,29);
  assert.ok(normal[0]<95,'left bevel slopes up along positive U');
  const reflected=sample(d,'normalRoughness',31.25,29);
  assert.ok(reflected[0]>160,'right bevel slopes down along positive U');
  const face=sample(d,'normalRoughness',16,29);
  assert.ok(face[2]>248,'painted plate centre stays almost planar');
  assert.ok(sample(d,'surface',.2,29)[1]<sample(d,'surface',16,29)[1],'occlusion is restricted to panel recesses');
  // Heights are in source texture units, independent of final texture density.
  const low=surfaceDetail('texture','STARTAN3',proceduralTexture('STARTAN3'),{maxSize:256});
  assert.equal(low.heightScale,d.heightScale);
  assert.ok(Math.abs(sample(low,'surface',16,29)[3]-center[3])<=4,'physical plate relief does not double when resolution doubles');
});

test('masonry, bare metal, glass and luminous inserts have distinct material responses',()=>{
  const paving=surfaceDetail('flat','FLOOR4_8',proceduralFlat('FLOOR4_8'),{maxSize:128});
  const metal=surfaceDetail('texture','DOOR3',proceduralTexture('DOOR3'),{maxSize:128});
  const console=surfaceDetail('texture','COMPUTE1',proceduralTexture('COMPUTE1'),{maxSize:128});
  const luminous=surfaceDetail('flat','TLITE6_6',proceduralFlat('TLITE6_6'),{maxSize:128});
  assert.equal(sample(paving,'surface',40,16)[0],0,'paving is dielectric');
  assert.ok(sample(metal,'surface',30,35)[0]>190,'bare door metal is a conductor');
  assert.ok(sample(paving,'normalRoughness',40,16)[3]>sample(metal,'normalRoughness',30,35)[3]+40,'rough paving scatters more than metal');
  assert.equal(sample(console,'surface',28,14)[0],0,'CRT glass is dielectric');
  assert.ok(sample(console,'normalRoughness',28,14)[3]<70,'CRT has a smooth glass surface');
  assert.ok(sample(luminous,'surface',16,16)[2]>220,'the luminous insert emits strongly');
  assert.equal(sample(luminous,'surface',32,32)[2],0,'fixture housing does not emit');
  assert.equal(sample(luminous,'surface',21,21)[2],0,'the four-light reference uses small circular bulbs, not large diamonds');
  const stoneHeight=sample(paving,'surface',40,16)[3],jointHeight=sample(paving,'surface',32,32)[3];
  assert.ok(stoneHeight>jointHeight+60,'joined six-sided paving has deep mortar seams');
});

test('switch changes stay local, slit grilles stay open and wet acid has three analytic phases',()=>{
  const off=surfaceDetail('texture','SW1STRTN',proceduralTexture('SW1STRTN'),{maxSize:128});
  const on=surfaceDetail('texture','SW2STRTN',proceduralTexture('SW2STRTN'),{maxSize:128});
  for(const [x,y] of [[8,22],[48,92],[30,20],[15,119]])for(const field of ['pixels','normalRoughness','surface'])assert.deepEqual(sample(off,field,x,y),sample(on,field,x,y),'surrounding plate is unchanged');
  assert.ok(sample(off,'surface',30,81)[2]>sample(on,'surface',30,81)[2]+100,'red glass dims with switch activation');
  assert.ok(sample(on,'surface',30,95)[2]>sample(off,'surface',30,95)[2]+100,'green glass lights with switch activation');
  const grille=surfaceDetail('texture','BRNBIGC',proceduralTexture('BRNBIGC'),{maxSize:128});
  let opaque=0;for(let i=3;i<grille.pixels.length;i+=4)opaque+=grille.pixels[i]>127;
  assert.ok(opaque/(grille.width*grille.height)>.65&&opaque/(grille.width*grille.height)<.8,'diagonal openings remain physical cutouts');
  const acid=[1,2,3].map(n=>surfaceDetail('flat','NUKAGE'+n,proceduralFlat('NUKAGE'+n),{maxSize:128}));
  assert.equal(new Set(acid.map(d=>digest(d.pixels))).size,3,'three fluid color phases');
  assert.equal(new Set(acid.map(d=>digest(d.normalRoughness))).size,3,'three matching ripple normal phases');
});

test('resolution caps are separate cache entries and LRU storage never exceeds 48 MiB',()=>{
  clearSurfaceDetailCache();
  const base=proceduralTexture('COMPTALL');
  const desktop=surfaceDetail('texture','COMPTALL',base),mobile=surfaceDetail('texture','COMPTALL',base,{maxSize:256});
  assert.deepEqual([desktop.width,desktop.height],[1024,512]);
  assert.deepEqual([mobile.width,mobile.height],[256,128]);
  assert.equal(surfaceDetail('texture','COMPTALL',base,{maxSize:256}),mobile,'normalized cap cache hit');
  assert.notEqual(mobile,desktop);
  for(const name of ['STARTAN3','STARTAN2','STARG3','BIGDOOR2','BIGDOOR4','BROWN1','BROWN96','BROWN144','COMPUTE1','TEKWALL1','TEKWALL4','PLANET1','FLOOR4_8','CEIL3_5','FLAT5_5','FLOOR6_2','FLOOR7_2']){
    const wall=proceduralTexture(name),d=surfaceDetail(wall?'texture':'flat',name,wall||proceduralFlat(name));
    assert.ok(d.byteLength<=6*1024*1024,'individual detail never exceeds the 524288-pixel allocation cap');
    assert.ok(surfaceDetailCacheStats().bytes<=SURFACE_DETAIL_BUDGET,'LRU respects retained CPU byte limit');
  }
  const stats=surfaceDetailCacheStats();
  assert.ok(stats.evictions>0,'large working sets cause actual eviction');
  assert.ok(stats.hits>0,'stats expose cache reuse');
  assert.ok(stats.peakWorkingBytes<=SURFACE_DETAIL_BUDGET,'temporary height fields count toward the live CPU staging budget');
  clearSurfaceDetailCache();assert.equal(surfaceDetailCacheStats().bytes,0,'CPU staging can be released after GPU upload');
});

test('detail generator has no asset loader, random source or embedded media payload',()=>{
  const source=readFileSync(new URL('../src/procedural-surface-detail.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|atob|createImageBitmap|readFileSync)\s*\(/);
  assert.doesNotMatch(source,/data:image|base64|\.wad['"]|Math\.random\s*\(/i);
  assert.doesNotMatch(source,/from\s+['"](?!\.\/procedural-raster\.js)[^'"]+['"]/);
  assert.equal(surfaceDetail('texture','MISSING',null),null);
});
