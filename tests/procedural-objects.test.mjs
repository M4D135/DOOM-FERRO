import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {objectMesh,weaponMesh,proceduralObjectCacheStats} from '../src/procedural-objects.js';
import {createE1M1Map} from '../src/procedural-map.js';
import {DoomGame} from '../src/game.js';

const TYPES=[2035,2028,48,35,10,12,15,24,2011,2012,2014,2015,2018,2019,2007,2048,2008,2049,2001];
const digest=mesh=>createHash('sha256').update(new Uint8Array(mesh.vertices.buffer)).digest('hex');
function validate(mesh,budget,ground=true) {
  assert(mesh&&mesh.vertices instanceof Float32Array);
  assert.equal(mesh.stride,10);assert.equal(mesh.vertices.length%30,0);
  assert.equal(mesh.triangles,mesh.vertices.length/30);
  assert(mesh.triangles>0&&mesh.triangles<=budget,`${mesh.key}: ${mesh.triangles} triangles exceeds ${budget}`);
  let signedVolume=0;
  for(let i=0;i<mesh.vertices.length;i+=10) {
    const v=mesh.vertices;
    assert([...v.subarray(i,i+10)].every(Number.isFinite),mesh.key);
    assert(Math.abs(Math.hypot(v[i+3],v[i+4],v[i+5])-1)<1e-5,mesh.key+' normal');
    for(let j=6;j<10;j++)assert(v[i+j]>=0&&v[i+j]<=1,mesh.key+' colour/emission');
    for(let j=0;j<3;j++)assert(v[i+j]>=mesh.bounds.min[j]-1e-6&&v[i+j]<=mesh.bounds.max[j]+1e-6);
  }
  for(let i=0;i<mesh.vertices.length;i+=30) {
    const v=mesh.vertices,a=[v[i],v[i+1],v[i+2]],b=[v[i+10],v[i+11],v[i+12]],c=[v[i+20],v[i+21],v[i+22]];
    signedVolume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  assert(signedVolume>1,mesh.key+' must enclose real volume instead of facing quads');
  for(let axis=0;axis<3;axis++)assert(mesh.bounds.max[axis]-mesh.bounds.min[axis]>.2,mesh.key+' has thickness on every axis');
  if(ground)assert(Math.abs(mesh.bounds.min[2])<1e-5,mesh.key+' must sit on Z=0');
}

test('all E1M1 pickup, scenery and barrel types have finite volumetric 3D meshes within budget',()=>{
  for(const type of TYPES)validate(objectMesh({type}),700);
  for(const skill of [1,2,3]) {
    const game=new DoomGame(createE1M1Map(),{skill});
    for(const entity of game.entities.filter(entity=>!entity.enemy))validate(objectMesh(entity),700);
  }
  assert.equal(objectMesh({type:999999}),null);
  assert.equal(objectMesh({type:3001,enemy:true,sprite:'TROOA1'}),null);
  assert.equal(objectMesh({type:2035,removed:true}),null);
});

test('object geometry has a stable world pivot independent of camera, angle, location or host scale',()=>{
  for(const type of TYPES.filter(type=>type!==35)) {
    const original=objectMesh({type});
    const elsewhere=objectMesh({type,x:10000,y:-7000,z:600,angle:2.1,flip:true,scale:4,camera:{x:99,y:33,angle:-2}},1000);
    assert.equal(elsewhere,original,'host transforms must not be baked into '+type);
  }
  const lamp=objectMesh({type:2028});assert.equal(lamp.bounds.max[2],48);
  const column=objectMesh({type:48});assert.equal(column.bounds.max[2],128);
  const shotgun=objectMesh({type:2001});
  assert(shotgun.bounds.max[0]-shotgun.bounds.min[0]>55);
  assert(shotgun.bounds.max[1]-shotgun.bounds.min[1]>5);
});

test('reference colour families distinguish the blue bottle, grey helmet, coloured armor and cross',()=>{
  const colours=mesh=>{const out=[];for(let i=6;i<mesh.vertices.length;i+=10)out.push([...mesh.vertices.subarray(i,i+3)]);return out;};
  assert(colours(objectMesh({type:2014})).some(([r,g,b])=>b>.4&&b>r*3&&b>g*3));
  assert(colours(objectMesh({type:2015})).some(([r,g,b])=>r>.35&&Math.abs(r-g)<.08&&Math.abs(g-b)<.08));
  assert(colours(objectMesh({type:2018})).some(([r,g,b])=>g>.6&&g>r*1.6&&g>b*2));
  assert(colours(objectMesh({type:2019})).some(([r,g,b])=>b>.6&&b>r*3&&b>g*3));
  for(const type of [2011,2012])assert(colours(objectMesh({type})).some(([r,g,b])=>r>.6&&g<.1&&b<.05));
});

test('projectiles and all explosion stages are volumetric and bounded, with centre-origin fireballs',()=>{
  const fireball=objectMesh({projectile:true,sprite:'BAL1A0'});
  validate(fireball,700,false);
  assert(fireball.bounds.min[2]<-4&&fireball.bounds.max[2]>4,'projectile Z is its centre, not its feet');
  const fireballHashes=new Set(),explosionHashes=new Set();
  for(const frame of 'ABCDE') {
    const ball=objectMesh({projectile:true,sprite:`BAL1${frame}0`});
    const blast=objectMesh({barrel:true,state:'exploding',sprite:`BEXP${frame}0`});
    validate(ball,700,false);validate(blast,700);
    fireballHashes.add(digest(ball));explosionHashes.add(digest(blast));
    assert(ball.vertices.some((value,index)=>index%10===9&&value>.9));
  }
  assert.equal(fireballHashes.size,5);assert.equal(explosionHashes.size,5);
});

test('first-person weapons are closed 3D models, with actual muzzle flashes and recoverable poses',()=>{
  for(const kind of ['pistol','shotgun','fist']) {
    const idle=weaponMesh(kind,Infinity);
    validate(idle,1500,false);
    assert(idle.bounds.max[1]>20,'weapon points along local +Y');
    assert(Math.abs((idle.bounds.min[0]+idle.bounds.max[0])/2)<3,'idle model stays centred around the aim');
    assert.equal(weaponMesh(kind,10),idle);assert.equal(weaponMesh(kind,-1),idle);assert.equal(weaponMesh(kind,NaN),idle);
    const moving=weaponMesh(kind,kind==='fist'?.15:.03);validate(moving,1500,false);
    assert.notEqual(digest(moving),digest(idle));
    assert.equal(weaponMesh(kind,.121),weaponMesh(kind,.122),'bounded pose quantisation reuses geometry');
    if(kind!=='fist') {
      assert(moving.vertices.some((value,index)=>index%10===9&&value===1),'flash is part of the 3D mesh');
      assert(moving.triangles>idle.triangles);
      assert(!weaponMesh(kind,.2).vertices.some((value,index)=>index%10===9&&value===1),'flash ends after the shot');
    }
  }
  const rest=weaponMesh('shotgun',Infinity),pump=weaponMesh('shotgun',.35);
  assert(pump.bounds.max[2]>rest.bounds.max[2]+15,'reload raises the barrel');
  assert(pump.bounds.min[0]<rest.bounds.min[0]-5,'pump animation shifts the gun to the original left-side pose');
  assert.equal(weaponMesh('unknown'),null);
});

test('brown hands and a resting fist remain visible in the actual 70-degree perspective cone',()=>{
  const tangent=Math.tan(70*Math.PI/360),aspect=1.6;
  for(const kind of ['pistol','shotgun','fist']) {
    const mesh=weaponMesh(kind,Infinity);let visibleSkin=0;
    for(let i=0;i<mesh.vertices.length;i+=10) {
      const v=mesh.vertices,x=v[i],y=v[i+1],z=v[i+2],r=v[i+6],g=v[i+7],b=v[i+8];
      if(y>.1&&Math.abs(x/y)<tangent*aspect&&Math.abs(z/y)<tangent&&r>g*1.2&&g>b*1.2&&r>.4)visibleSkin++;
    }
    assert(visibleSkin>20,`${kind}: the arm cannot be entirely below the frame`);
  }
});

test('pose caching remains bounded across varied animation times',()=>{
  for(let iteration=0;iteration<500;iteration++) {
    const time=iteration/701;
    for(const kind of ['pistol','shotgun','fist'])weaponMesh(kind,time);
    objectMesh({type:35},time*9);
    objectMesh({type:2014,sprite:`BON1${'ABCD'[iteration%4]}0`},time);
  }
  const stats=proceduralObjectCacheStats();
  assert(stats.entries<=stats.limit);assert.equal(stats.limit,96);
  assert(stats.bytes<20*1024*1024,'bounded geometry stays within a modest CPU memory budget');
});
