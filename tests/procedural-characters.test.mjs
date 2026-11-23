import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, copyFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {MeshBuilder} from '../src/procedural-mesh.js';
import {characterMesh} from '../src/procedural-characters.js';

const FAMILIES = [
  {type:3004, base:'POSS', alive:'ABCDEFG', dead:'HIJKL'},
  {type:9, base:'SPOS', alive:'ABCDEFG', dead:'HIJKL'},
  {type:3001, base:'TROO', alive:'ABCDEFGH', dead:'IJKLM'},
];
const actor = (family, frame = 'A', extra = {}) => ({type:family.type, base:family.base, sprite:`${family.base}${frame}1`, state:'chase', ...extra});
const subtract = (a,b) => a.map((value,i) => value-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((total,value,i) => total+value*b[i],0);
const span = (mesh,axis) => mesh.bounds.max[axis]-mesh.bounds.min[axis];

/** Check the renderer contract and signed volume, including every triangle. */
function inspect(mesh) {
  assert.equal(mesh.stride,10);
  assert.ok(mesh.vertices instanceof Float32Array);
  assert.equal(mesh.vertices.length,mesh.triangles*30);
  const actualMin = [Infinity,Infinity,Infinity], actualMax = [-Infinity,-Infinity,-Infinity];
  let signedVolume = 0;
  for (let i=0;i<mesh.vertices.length;i+=30) {
    const vertices = [0,1,2].map(vertex => Array.from(mesh.vertices.slice(i+vertex*10,i+vertex*10+10)));
    const points = vertices.map(vertex => vertex.slice(0,3));
    const face = cross(subtract(points[1],points[0]),subtract(points[2],points[0]));
    assert.ok(Math.hypot(...face)>1e-7,`${mesh.key}: degenerate triangle`);
    signedVolume += dot(points[0],cross(points[1],points[2]))/6;
    for (const vertex of vertices) {
      assert.ok(vertex.every(Number.isFinite),`${mesh.key}: nonfinite vertex`);
      const normal=vertex.slice(3,6);
      assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-5,`${mesh.key}: normal length`);
      assert.ok(dot(face,normal)>0,`${mesh.key}: winding opposes normal`);
      assert.ok(vertex.slice(6).every(value=>value>=0&&value<=1),`${mesh.key}: color or emission outside [0,1]`);
      for (let k=0;k<3;k++) { actualMin[k]=Math.min(actualMin[k],vertex[k]); actualMax[k]=Math.max(actualMax[k],vertex[k]); }
    }
  }
  assert.deepEqual(mesh.bounds,{min:actualMin,max:actualMax});
  return signedVolume;
}

test('closed primitives have outward winding, unit normals, and nonzero volume', () => {
  const color=[80,120,200];
  const box=new MeshBuilder().box([0,0,0],[2,4,6],color).finish('box');
  assert.equal(inspect(box),48);
  assert.deepEqual(box.bounds,{min:[-1,-2,-3],max:[1,2,3]});
  const ellipsoid=new MeshBuilder().ellipsoid([0,0,0],[2,3,4],color).finish('ellipsoid');
  const cylinder=new MeshBuilder().cylinder([0,0,0],[0,0,5],2,color).finish('cylinder');
  const cone=new MeshBuilder().cone([0,0,0],[0,0,5],2,color).finish('cone');
  assert.ok(inspect(ellipsoid)>80);
  assert.ok(Math.abs(inspect(cylinder)-60)<1e-5);
  assert.ok(Math.abs(inspect(cone)-20)<1e-5);
  const oblique=new MeshBuilder().cylinder([1,2,3],[5,-4,8],2,color,{topRadius:.5,segments:9}).finish('oblique-frustum');
  assert.ok(inspect(oblique)>20);
});

test('composition preserves volume and normals under rotation, nonuniform scale, and reflection', () => {
  const source=new MeshBuilder().box([0,0,0],[2,4,6],[64,128,255],{emissive:.4}).finish('source');
  const transformed=new MeshBuilder().add(source,{translation:[7,-3,9],rotation:[.3,-.7,1.1],scale:[-2,.5,3]}).finish('transformed');
  assert.ok(Math.abs(inspect(transformed)-144)<1e-4);
  for (let i=0;i<transformed.vertices.length;i+=10) {
    assert.ok(Math.abs(transformed.vertices[i+6]-64/255)<1e-7);
    assert.ok(Math.abs(transformed.vertices[i+9]-.4)<1e-7);
  }
  assert.throws(()=>new MeshBuilder().add(source,{scale:[1,0,1]}),/scale/);
});

test('every authored actor frame is a grounded volume below the 2000-triangle budget', () => {
  for (const family of FAMILIES) for (const frame of family.alive+family.dead) {
    const mesh=characterMesh(actor(family,frame));
    assert.ok(inspect(mesh)>5000,`${mesh.key}: expected a closed body volume`);
    assert.ok(mesh.triangles>1000&&mesh.triangles<=2000,`${mesh.key}: triangle budget`);
    assert.equal(mesh.bounds.min[2],0,`${mesh.key}: feet/corpse must meet floor`);
    assert.ok(span(mesh,0)>20&&span(mesh,1)>12,`${mesh.key}: cannot be a billboard`);
    if (family.alive.includes(frame)) assert.ok(span(mesh,2)>=53&&span(mesh,2)<=58,`${mesh.key}: Doom actor height`);
  }
});

test('poses are cached independently of camera-facing sprite suffixes and actor orientation', () => {
  for (const family of FAMILIES) {
    const first=characterMesh(actor(family),0);
    for (let view=1;view<=8;view++) {
      const same=characterMesh(actor(family,'A',{sprite:`${family.base}A${view}`,angle:view,flip:view%2===0}),99);
      assert.equal(same,first);
    }
    assert.notDeepEqual(characterMesh(actor(family,'B')).vertices,first.vertices);
    assert.notDeepEqual(characterMesh(actor(family,'C')).vertices,first.vertices);
    assert.notDeepEqual(characterMesh(actor(family,'D')).vertices,first.vertices);
    assert.notEqual(characterMesh(actor(family,'A',{state:'idle'})),first);
  }
  assert.equal(characterMesh({type:12345}),null);
  assert.equal(characterMesh(actor(FAMILIES[0],'A',{removed:true})),null);
});

test('attack poses move actual arms and guns, with a volumetric human muzzle flash', () => {
  for (const family of FAMILIES) {
    const walk=characterMesh(actor(family)), aim=characterMesh(actor(family,'E')), fire=characterMesh(actor(family,'F'));
    assert.notDeepEqual(aim.vertices,walk.vertices);
    assert.notDeepEqual(fire.vertices,aim.vertices);
    if (family.base==='TROO') {
      assert.ok(fire.bounds.max[1]>aim.bounds.max[1]+5);
      assert.ok(aim.bounds.max[0]>walk.bounds.max[0]+5);
    } else {
      assert.ok(aim.bounds.max[1]>walk.bounds.max[1]+10);
      const emissiveVertices=mesh=>Array.from(mesh.vertices).filter((value,index)=>index%10===9&&value>.8).length;
      assert.equal(emissiveVertices(aim),0);
      assert.ok(emissiveVertices(fire)>50);
      assert.ok(fire.triangles>aim.triangles);
    }
  }
});

test('deaths collapse through distinct 3D poses to substantial lying bodies', () => {
  for (const family of FAMILIES) {
    const first=characterMesh(actor(family,family.dead[0],{alive:false}));
    const middle=characterMesh(actor(family,family.dead[2],{alive:false}));
    const last=characterMesh(actor(family,family.dead.at(-1),{alive:false}));
    assert.notDeepEqual(first.vertices,middle.vertices);
    assert.notDeepEqual(middle.vertices,last.vertices);
    assert.ok(span(last,2)>10&&span(last,2)<20,`${family.base}: lying body retains thickness`);
    assert.ok(span(last,1)>45,`${family.base}: body lies along the ground`);
    assert.ok(span(first,2)>span(last,2)+25);
    assert.equal(last.bounds.min[2],0);
    assert.ok(inspect(last)>5000);
  }
});

test('state-only callers get deterministic bounded animation and death fallbacks', () => {
  for (const family of FAMILIES) {
    const entity={type:family.type,state:'walk'};
    assert.equal(characterMesh(entity,0),characterMesh(actor(family,'A')));
    assert.equal(characterMesh(entity,1/7),characterMesh(actor(family,'B')));
    assert.equal(characterMesh(entity,4/7),characterMesh(entity,0));
    const dead={type:family.type,alive:false,stateTime:.75};
    assert.equal(characterMesh(dead),characterMesh(actor(family,family.dead.at(-1),{alive:false})));
    assert.equal(characterMesh({type:family.type,state:'pain'}),characterMesh(actor(family,family.alive.at(-1))));
  }
});

test('character generation runs with only its two source modules, without reference media or readers', async () => {
  const folder=await mkdtemp(join(tmpdir(),'doom-procedural-characters-'));
  try {
    await writeFile(join(folder,'package.json'),JSON.stringify({type:'module'}));
    for (const file of ['procedural-mesh.js','procedural-characters.js']) await copyFile(new URL(`../src/${file}`,import.meta.url),join(folder,file));
    const result=spawnSync(process.execPath,['--input-type=module','-e',`
      globalThis.fetch=()=>{throw new Error('No external resources are available');};
      const {characterMesh}=await import('./procedural-characters.js');
      for(const type of [3004,9,3001]) {
        const mesh=characterMesh({type,state:'idle'});
        if(!(mesh.vertices instanceof Float32Array)||mesh.triangles<1000)process.exit(1);
      }
    `],{cwd:folder,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  } finally { await rm(folder,{recursive:true,force:true}); }
});
