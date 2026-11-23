import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Wad} from '../src/wad.js';
import {buildSubsectorPolygons,buildMapGeometry} from '../src/ferro-doom-renderer.js';

const wad=new Wad(readFileSync(new URL('../assets/doom1.wad',import.meta.url)));

test('FERRO canonical sources retain upstream bytes and locked hashes',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../vendor/ferro/manifest.json',import.meta.url)));
  assert.equal(globalThis.FERRO.version,manifest.version);
  assert.equal(manifest.version,'0.3.33');
  for(const module of manifest.modules){
    const bytes=readFileSync(new URL('../vendor/ferro/'+module.file,import.meta.url));
    assert.equal(bytes.length,module.bytes,module.file+' length');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),module.sha256,module.file+' SHA256');
    const git=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(git,module.gitBlobSha,module.file+' upstream git blob');
  }
});

test('BSP triangulation covers every original E1M1 subsector and sector',()=>{
  const map=wad.map('E1M1'),leaves=buildSubsectorPolygons(map);
  assert.equal(leaves.length,237);
  assert.equal(leaves.length,map.subsectors.length);
  assert.equal(new Set(leaves.map(leaf=>leaf.sector)).size,map.sectors.length);
  for(const leaf of leaves){
    assert.ok(leaf.points.length>=3);
    const center=leaf.points.reduce((a,p)=>({x:a.x+p.x/leaf.points.length,y:a.y+p.y/leaf.points.length}),{x:0,y:0});
    assert.equal(map.sectorAt(center.x,center.y).id,leaf.sector,'rendered floor must match collision BSP sector');
    const signedArea=leaf.points.reduce((a,p,i)=>{const q=leaf.points[(i+1)%leaf.points.length];return a+p.x*q.y-p.y*q.x;},0);
    assert.ok(signedArea>0,'floor polygons have the upward world winding');
  }
});

test('E1M1 render mesh uses original WAD materials and finite geometry',()=>{
  const map=wad.map('E1M1'),meshes=buildMapGeometry(wad,map);
  assert.equal(meshes.length,53);
  assert.equal(meshes.reduce((n,m)=>n+m.vertices.length/21,0),1844);
  for(const mesh of meshes){
    assert.equal(mesh.vertices.length%21,0,'complete triangles');
    assert.ok(mesh.vertices.every(Number.isFinite));
    assert.ok(mesh.kind==='flat'?wad.flat(mesh.name):wad.texture(mesh.name),'real WAD texture '+mesh.name);
  }
});

test('opening closed sectors rebuilds door surfaces from mutable heights',()=>{
  const map=wad.map('E1M1'),leaves=buildSubsectorPolygons(map),doors=map.sectors.filter(s=>s.floor===s.ceiling);
  assert.equal(doors.length,4);
  const original=buildMapGeometry(wad,map,leaves);
  for(const door of doors)door.ceiling+=64;
  const opened=buildMapGeometry(wad,map,leaves);
  assert.ok(opened.every(m=>m.vertices.every(Number.isFinite)));
  assert.notEqual(opened.reduce((n,m)=>n+m.vertices.length,0),original.reduce((n,m)=>n+m.vertices.length,0));
  assert.equal(opened.reduce((n,m)=>n+m.vertices.length/21,0),1860);
});

test('type48 computer walls encode GPU scrolling without changing WAD offsets',()=>{
  const map=wad.map('E1M1'),originalOffsets=map.sides.map(s=>s.xOffset);
  const scrolling=map.lines.filter(line=>line.special===48);
  assert.ok(scrolling.length>0);
  const meshes=buildMapGeometry(wad,map);
  let scrollVertices=0;
  for(const mesh of meshes)for(let i=6;i<mesh.vertices.length;i+=7){
    const value=mesh.vertices[i];
    if(value>=1000){
      scrollVertices++;
      assert.equal(Math.floor(value/1000),wad.texture(mesh.name).width);
      assert.ok(map.sectors.some(s=>s.special===value%1000));
    }
  }
  assert.ok(scrollVertices>0);
  assert.deepEqual(map.sides.map(s=>s.xOffset),originalOffsets);
});
