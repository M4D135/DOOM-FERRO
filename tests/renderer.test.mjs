import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ProceduralResources} from '../src/procedural-resources.js';
import {createE1M1Map} from '../src/procedural-map.js';
import {Raster} from '../src/procedural-raster.js';
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

test('mirrored procedural sprites reflect around their thing anchor, including asymmetric crops',()=>{
  const map=createE1M1Map();
  const origin={x:1056,y:-3616,z:0};
  // Build asymmetric procedural fixtures so this regression remains effective
  // even when a character recipe currently emits a centered, symmetric crop.
  const pictures=[new Raster(31,56,6,56).rect(2,3,27,50,[180,90,40]).result('offset-left'),
    new Raster(47,60,31,60).ellipse(20,30,16,27,[90,150,70]).result('offset-right')];
  for(const patch of pictures){
    const name=patch.name;
    assert.notEqual(patch.width,2*patch.leftOffset,name+' must exercise an asymmetric anchor');
    for(const scale of [1,0.5])for(const right of [[1,0,0],[Math.SQRT1_2,0,Math.SQRT1_2]]){
      const adapter=Object.create(FerroDoomRenderer.prototype);
      adapter.map=map;adapter.spriteMeshes=new Map();
      adapter._texture=()=>patch;
      adapter._upload=(collection,key,vertices)=>collection.set(key,{vertices});
      const view={droite:right,oeil:[origin.x/32,41/32,-origin.y/32],avant:[0,0,-1]};
      const bounds=[];
      for(const flip of [false,true]){
        adapter.frame={entities:[{...origin,sprite:name,flip,scale}]};
        adapter._sprites(view);
        const vertices=adapter.spriteMeshes.get(name).vertices;
        assert.equal(vertices.length,42,'two triangles for one sprite');
        const offsets=[];
        for(let i=0;i<vertices.length;i+=7){
          offsets.push((vertices[i]-origin.x/32)*right[0]+(vertices[i+2]+origin.y/32)*right[2]);
          assert.ok(Number.isFinite(vertices[i])&&Number.isFinite(vertices[i+1])&&Number.isFinite(vertices[i+2]));
        }
        bounds.push({left:Math.min(...offsets),right:Math.max(...offsets),vertices});
      }
      const [normal,mirrored]=bounds;
      assert.ok(Math.abs(normal.left+mirrored.right)<0.00001,name+' mirrored right edge preserves the origin');
      assert.ok(Math.abs(normal.right+mirrored.left)<0.00001,name+' mirrored left edge preserves the origin');
      assert.ok(Math.abs(normal.right-normal.left-patch.width*scale/32)<0.00001,name+' picture width is unchanged');
      for(let i=0;i<normal.vertices.length;i+=7){
        assert.equal(normal.vertices[i+1],mirrored.vertices[i+1],'vertical position is unchanged');
        assert.equal(normal.vertices[i+3]+mirrored.vertices[i+3],1,'texture U is mirrored');
        assert.equal(normal.vertices[i+4],mirrored.vertices[i+4],'texture V is unchanged');
      }
    }
  }
});
