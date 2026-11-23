import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ProceduralResources} from '../src/procedural-resources.js';
import {createE1M1Map} from '../src/procedural-map.js';
import { collectModelBatches, viewWeaponBatch, MODEL_VERTEX_STRIDE } from '../src/procedural-models.js';
import { DoomGame } from '../src/game.js';
import {FerroDoomRenderer,buildSubsectorPolygons,buildMapGeometry} from '../src/ferro-doom-renderer.js';

const resources=new ProceduralResources();

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

test('generated floor triangulation covers every E1M1 cell and sector',()=>{
  const map=createE1M1Map(),leaves=buildSubsectorPolygons(map);
  assert.equal(leaves.length,295);
  assert.equal(map.nodes.length,0);
  assert.equal(leaves.length,map.subsectors.length);
  assert.equal(new Set(leaves.map(leaf=>leaf.sector)).size,map.sectors.length);
  for(const leaf of leaves){
    assert.ok(leaf.points.length>=3);
    const center=leaf.points.reduce((a,p)=>({x:a.x+p.x/leaf.points.length,y:a.y+p.y/leaf.points.length}),{x:0,y:0});
    assert.equal(map.sectorAt(center.x,center.y).id,leaf.sector,'rendered floor must match generated collision sector');
    const signedArea=leaf.points.reduce((a,p,i)=>{const q=leaf.points[(i+1)%leaf.points.length];return a+p.x*q.y-p.y*q.x;},0);
    assert.ok(signedArea>0,'floor polygons have the upward world winding');
  }
});

test('E1M1 render mesh uses generated materials and finite geometry',()=>{
  const map=createE1M1Map(),meshes=buildMapGeometry(resources,map);
  assert.equal(meshes.length,53);
  assert.equal(meshes.reduce((n,m)=>n+m.vertices.length/21,0),2025);
  for(const mesh of meshes){
    assert.equal(mesh.vertices.length%21,0,'complete triangles');
    assert.ok(mesh.vertices.every(Number.isFinite));
    assert.ok(mesh.kind==='flat'?resources.flat(mesh.name):resources.texture(mesh.name),'generated texture '+mesh.name);
  }
});

test('opening closed sectors rebuilds door surfaces from mutable heights',()=>{
  const map=createE1M1Map(),leaves=buildSubsectorPolygons(map),doors=map.sectors.filter(s=>s.floor===s.ceiling);
  assert.equal(doors.length,4);
  const original=buildMapGeometry(resources,map,leaves);
  for(const door of doors)door.ceiling+=64;
  const opened=buildMapGeometry(resources,map,leaves);
  assert.ok(opened.every(m=>m.vertices.every(Number.isFinite)));
  assert.notEqual(opened.reduce((n,m)=>n+m.vertices.length,0),original.reduce((n,m)=>n+m.vertices.length,0));
  assert.equal(opened.reduce((n,m)=>n+m.vertices.length/21,0),2041);
});

test('type48 computer walls encode GPU scrolling without changing plan offsets',()=>{
  const map=createE1M1Map(),originalOffsets=map.sides.map(s=>s.xOffset);
  const scrolling=map.lines.filter(line=>line.special===48);
  assert.ok(scrolling.length>0);
  const meshes=buildMapGeometry(resources,map);
  let scrollVertices=0;
  for(const mesh of meshes)for(let i=6;i<mesh.vertices.length;i+=7){
    const value=mesh.vertices[i];
    if(value>=1000){
      scrollVertices++;
      assert.equal(Math.floor(value/1000),resources.texture(mesh.name).width);
      assert.ok(map.sectors.some(s=>s.special===value%1000));
    }
  }
  assert.ok(scrollVertices>0);
  assert.deepEqual(map.sides.map(s=>s.xOffset),originalOffsets);
});

test('world entities are instanced 3D volumes at the simulation origin and heading',()=>{
  const map=createE1M1Map(),game=new DoomGame(map,{skill:3});
  const batches=collectModelBatches(map,game.entities,0);
  assert.equal(batches.reduce((n,b)=>n+b.count,0),game.entities.filter(e=>!e.removed).length);
  for(const batch of batches){
    const mesh=batch.mesh;
    assert.equal(mesh.stride,MODEL_VERTEX_STRIDE);
    assert.equal(mesh.vertices.length%(3*MODEL_VERTEX_STRIDE),0,'complete geometry, material and surface-coordinate triangles');
    assert.ok(mesh.triangles>12,'geometry cannot collapse to a billboard');
    for(const axis of [0,1,2])assert.ok(mesh.bounds.max[axis]-mesh.bounds.min[axis]>.1,'volume along all three axes');
    for(let i=0;i<batch.count;i++){
      const actor=game.entities.find(e=>e.id===batch.entityIds[i]);
      const record=batch.instances.subarray(i*8,i*8+8);
      for(const [index,value] of [[0,actor.x/32],[1,actor.z/32],[2,-actor.y/32],[3,actor.angle||0]])
        assert.ok(Math.abs(record[index]-value)<.0001,'uses actor state, never camera facing');
    }
  }
  const actor=game.entities.find(e=>e.enemy),fixed={...actor,angle:0};
  const a=collectModelBatches(map,[fixed],0)[0];
  const b=collectModelBatches(map,[{...fixed,angle:Math.PI/2}],0)[0];
  assert.equal(a.mesh,b.mesh,'turning shares one genuine mesh');
  assert.notEqual(a.instances[3],b.instances[3],'heading rotates that mesh in world space');
  const removed=collectModelBatches(map,[{...fixed,removed:true}],0);
  assert.equal(removed.length,0,'collected and removed objects leave the renderer');
});

test('first-person arms are depth-tested meshes and are omitted on title, map and death',()=>{
  assert.equal(viewWeaponBatch(null),null);
  assert.equal(viewWeaponBatch({kind:'pistol',dead:true}),null);
  for(const kind of ['pistol','shotgun','fist']){
    const idle=viewWeaponBatch({kind,phase:Infinity});
    const shot=viewWeaponBatch({kind,phase:.03});
    assert.ok(idle.mesh.triangles>12);assert.equal(idle.count,1);
    assert.notEqual(idle.mesh.key,shot.mesh.key,'weapon has a generated shot/punch pose');
    assert.ok(idle.mesh.bounds.max[1]>idle.mesh.bounds.min[1]+2,'weapon has depth');
  }
});
