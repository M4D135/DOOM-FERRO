import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {objectMesh,weaponMesh,proceduralObjectCacheStats} from '../src/procedural-objects.js';
import {MESH_VERTEX_STRIDE as STRIDE,MATERIALS} from '../src/procedural-mesh.js';
import {createE1M1Map} from '../src/procedural-map.js';
import {DoomGame} from '../src/game.js';

const TYPES=[2035,2028,48,35,10,12,15,24,2011,2012,2014,2015,2018,2019,2007,2048,2008,2049,2001];
const BUDGET=[550,2500,12000];
const digest=mesh=>createHash('sha256').update(new Uint8Array(mesh.vertices.buffer)).digest('hex');
const someVertex=(mesh,predicate)=>{for(let i=0;i<mesh.vertices.length;i+=STRIDE)if(predicate(mesh.vertices,i))return true;return false;};
const hasMaterial=(mesh,name)=>someVertex(mesh,(v,i)=>v[i+12]===MATERIALS[name].kind);

function validate(mesh,budget,ground=true) {
  assert(mesh&&mesh.vertices instanceof Float32Array);
  assert.equal(mesh.stride,STRIDE);assert.equal(mesh.vertices.length%(3*STRIDE),0);
  assert.equal(mesh.triangles,mesh.vertices.length/(3*STRIDE));
  assert(mesh.triangles>0&&mesh.triangles<=budget,`${mesh.key}: ${mesh.triangles} triangles exceeds ${budget}`);
  let signedVolume=0;
  const v=mesh.vertices;
  for(let i=0;i<v.length;i+=STRIDE) {
    for(let j=0;j<STRIDE;j++)assert(Number.isFinite(v[i+j]),mesh.key+' finite vertex attributes');
    assert(Math.abs(Math.hypot(v[i+3],v[i+4],v[i+5])-1)<1e-5,mesh.key+' normal');
    for(let j=6;j<12;j++)assert(v[i+j]>=0&&v[i+j]<=1,mesh.key+' colour/emission/roughness/metalness');
    assert(Number.isInteger(v[i+12])&&v[i+12]>=0&&v[i+12]<=10,mesh.key+' material kind');
    assert(v[i+13]>0,mesh.key+' material scale');
    for(let j=0;j<3;j++)assert(v[i+j]>=mesh.bounds.min[j]-1e-5&&v[i+j]<=mesh.bounds.max[j]+1e-5,mesh.key+' finite bounds');
  }
  for(let i=0;i<v.length;i+=3*STRIDE) {
    const b=i+STRIDE,c=i+2*STRIDE;
    signedVolume+=(v[i]*(v[b+1]*v[c+2]-v[b+2]*v[c+1])+v[i+1]*(v[b+2]*v[c]-v[b]*v[c+2])+v[i+2]*(v[b]*v[c+1]-v[b+1]*v[c]))/6;
  }
  assert(signedVolume>1,mesh.key+' must enclose real volume instead of facing quads');
  for(let axis=0;axis<3;axis++)assert(mesh.bounds.max[axis]-mesh.bounds.min[axis]>.2,mesh.key+' has thickness on every axis');
  if(ground)assert(Math.abs(mesh.bounds.min[2])<1e-5,mesh.key+' must sit on Z=0');
}

test('all E1M1 object types have finite volumetric meshes and three bounded detail levels',()=>{
  for(const type of TYPES) {
    const meshes=[0,1,2].map(detail=>objectMesh({type},0,detail));
    for(let detail=0;detail<3;detail++){
      validate(meshes[detail],BUDGET[detail]);
      assert(meshes[detail].key.endsWith(':d'+detail),'detail is part of the cache key');
    }
    assert(meshes[0].triangles<meshes[1].triangles,`${type}: distant geometry must be cheaper`);
    assert(meshes[1].triangles<=meshes[2].triangles);
    assert(Math.abs(meshes[0].bounds.max[2]-meshes[2].bounds.max[2])<3,`${type}: detail changes must preserve the silhouette height`);
  }
  for(const skill of [1,2,3]) {
    const game=new DoomGame(createE1M1Map(),{skill});
    for(const entity of game.entities.filter(entity=>!entity.enemy))assert(objectMesh(entity),'map entity '+entity.type);
  }
  assert.equal(objectMesh({type:999999}),null);
  assert.equal(objectMesh({type:3001,enemy:true,sprite:'TROOA1'}),null);
  assert.equal(objectMesh({type:2035,removed:true}),null);
});

test('object geometry has a stable world pivot independent of camera, angle, location or host scale',()=>{
  for(const detail of [0,1,2])for(const type of TYPES.filter(type=>type!==35)) {
    const original=objectMesh({type},0,detail);
    const elsewhere=objectMesh({type,x:10000,y:-7000,z:600,angle:2.1,flip:true,scale:4,camera:{x:99,y:33,angle:-2}},1000,detail);
    assert.equal(elsewhere,original,'host transforms must not be baked into '+type);
  }
  assert.equal(objectMesh({type:2028}).bounds.max[2],48);
  assert.equal(objectMesh({type:48}).bounds.max[2],128);
  const shotgun=objectMesh({type:2001});
  assert(shotgun.bounds.max[0]-shotgun.bounds.min[0]>55);
  assert(shotgun.bounds.max[1]-shotgun.bounds.min[1]>5);
});

test('reference colours and physical materials distinguish the original pickups',()=>{
  const colour=(type,predicate)=>someVertex(objectMesh({type}),(v,i)=>predicate(v[i+6],v[i+7],v[i+8]));
  assert(colour(2014,(r,g,b)=>b>.4&&b>r*3&&b>g*3));
  assert(colour(2015,(r,g,b)=>r>.35&&Math.abs(r-g)<.08&&Math.abs(g-b)<.08));
  assert(colour(2018,(r,g,b)=>g>.6&&g>r*1.6&&g>b*2));
  assert(colour(2019,(r,g,b)=>b>.6&&b>r*3&&b>g*3));
  for(const type of [2011,2012])assert(colour(type,(r,g,b)=>r>.6&&g<.1&&b<.05));
  for(const[type,material]of[[2014,'glass'],[2015,'metal'],[2018,'paint'],[2001,'wood'],[2001,'metal'],[15,'cloth'],[15,'skin']])assert(hasMaterial(objectMesh({type}),material),`${type} has ${material}`);
});

test('medikit keeps its inclined lid and front handle, armor has an open three-dimensional neckline',()=>{
  const med=objectMesh({type:2012}),v=med.vertices;
  assert(med.bounds.max[2]<19,'MEDI has no invented top handle');
  assert(someVertex(med,(a,i)=>a[i+6]>.6&&a[i+7]<.1&&a[i+2]>16),'red cross reaches the lid');
  assert(!someVertex(med,(a,i)=>a[i+6]>.6&&a[i+7]<.1&&a[i+2]<11),'red cross stays above the handle');
  assert(someVertex(med,(a,i)=>a[i+12]===MATERIALS.leather.kind&&a[i+1]>7&&a[i+2]<10),'front handle projects out of the case');
  for(const type of [2018,2019]) {
    const armor=objectMesh({type}),a=armor.vertices;let caps=0;
    for(let i=0;i<a.length;i+=3*STRIDE){
      const j=i+STRIDE,k=i+2*STRIDE,den=(a[j+1]-a[k+1])*(a[i]-a[k])+(a[k]-a[j])*(a[i+1]-a[k+1]);
      if(Math.abs(den)<1e-8)continue;
      const u=((a[j+1]-a[k+1])*(-a[k])+(a[k]-a[j])*(-a[k+1]))/den;
      const w=((a[k+1]-a[i+1])*(-a[k])+(a[i]-a[k])*(-a[k+1]))/den,t=1-u-w;
      if(u>=0&&w>=0&&t>=0&&u*a[i+2]+w*a[j+2]+t*a[k+2]>5)caps++;
    }
    assert.equal(caps,0,'neck opening cannot be a dark disc on a closed torso');
  }
});

test('projectiles and explosion stages have genuine emissive volumes at every detail level',()=>{
  const fireball=objectMesh({projectile:true,sprite:'BAL1A0'});
  assert(fireball.bounds.min[2]<-4&&fireball.bounds.max[2]>4,'projectile Z is its centre, not its feet');
  for(const detail of [0,1,2]) {
    const fireballHashes=new Set(),explosionHashes=new Set();
    for(const frame of 'ABCDE') {
      const ball=objectMesh({projectile:true,sprite:`BAL1${frame}0`},0,detail);
      const blast=objectMesh({barrel:true,state:'exploding',sprite:`BEXP${frame}0`},0,detail);
      validate(ball,BUDGET[detail],false);validate(blast,BUDGET[detail]);
      fireballHashes.add(digest(ball));explosionHashes.add(digest(blast));
      assert(someVertex(ball,(v,i)=>v[i+9]>.9&&v[i+12]===MATERIALS.glow.kind));
    }
    assert.equal(fireballHashes.size,5);assert.equal(explosionHashes.size,5);
  }
});

test('first-person weapons have solid mechanics, anatomical hands, volumetric flashes and recoverable poses',()=>{
  for(const kind of ['pistol','shotgun','fist']) {
    const idle=weaponMesh(kind,Infinity);
    validate(idle,26000,false);
    assert(idle.bounds.max[1]>20,'weapon points along local +Y');
    let left=Infinity,right=-Infinity;
    for(let i=0;i<idle.vertices.length;i+=STRIDE)if(idle.vertices[i+1]>20){left=Math.min(left,idle.vertices[i]/idle.vertices[i+1]);right=Math.max(right,idle.vertices[i]/idle.vertices[i+1]);}
    assert(Math.abs((left+right)/2)<.2,'forward model stays centred around the aim');
    assert(hasMaterial(idle,'skin'),'the arm is a physical skin surface');
    if(kind!=='fist')assert(hasMaterial(idle,'metal')&&hasMaterial(idle,'leather'));
    assert.equal(weaponMesh(kind,10),idle);assert.equal(weaponMesh(kind,-1),idle);assert.equal(weaponMesh(kind,NaN),idle);
    const moving=weaponMesh(kind,kind==='fist'?.15:.03);validate(moving,26000,false);
    assert.notEqual(digest(moving),digest(idle));
    assert.equal(weaponMesh(kind,.121),weaponMesh(kind,.122),'30 Hz pose quantisation reuses geometry');
    if(kind!=='fist') {
      assert(someVertex(moving,(v,i)=>v[i+9]===1&&v[i+12]===MATERIALS.glow.kind),'flash is part of the 3D mesh');
      assert(moving.triangles>idle.triangles);
      assert(!someVertex(weaponMesh(kind,.2),(v,i)=>v[i+9]===1),'flash ends after the shot');
    }else assert(moving.bounds.min[1]<0,'the punching arm continues behind the camera');
  }
  const rest=weaponMesh('shotgun',Infinity),pump=weaponMesh('shotgun',.35);
  assert(pump.bounds.max[2]>rest.bounds.max[2]+15,'reload raises the barrel');
  assert(pump.bounds.min[0]<rest.bounds.min[0]-5,'pump animation shifts the gun to the original left-side pose');
  assert.equal(weaponMesh('unknown'),null);
});

test('hands remain visible in the actual 70-degree perspective without counting the wooden stock',()=>{
  const tangent=Math.tan(70*Math.PI/360),aspect=1.6;
  for(const kind of ['pistol','shotgun','fist'])for(const phase of [Infinity,kind==='shotgun'?.35:kind==='fist'?.15:.03]) {
    const mesh=weaponMesh(kind,phase);let visibleHands=0;
    for(let i=0;i<mesh.vertices.length;i+=STRIDE) {
      const v=mesh.vertices,x=v[i],y=v[i+1],z=v[i+2],material=v[i+12];
      if((material===MATERIALS.skin.kind||material===MATERIALS.leather.kind)&&y>.1&&Math.abs(x/y)<tangent*aspect&&Math.abs(z/y)<tangent)visibleHands++;
    }
    assert(visibleHands>100,`${kind}: the hand cannot be entirely below the frame`);
  }
});

test('shared parts stay resident while object and animated pose caches remain under 32 MiB',()=>{
  for(const kind of ['pistol','shotgun','fist'])weaponMesh(kind,0);
  const staticParts=proceduralObjectCacheStats().weapons.staticParts;
  for(let iteration=0;iteration<96;iteration++) {
    const time=((iteration*17)%211)/300;
    for(const kind of ['pistol','shotgun','fist'])weaponMesh(kind,time);
    objectMesh({type:35},time*9,iteration%3);
    objectMesh({type:2014,sprite:`BON1${'ABCD'[iteration%4]}0`},time,iteration%3);
  }
  const stats=proceduralObjectCacheStats();
  assert(stats.entries<=stats.limit);assert.equal(stats.byteLimit,32*1024*1024);
  assert(stats.bytes<=stats.byteLimit);
  for(const family of ['objects','weapons']){
    assert(stats[family].entries<=stats[family].limit);
    assert(stats[family].bytes<=stats[family].byteLimit);
  }
  assert.equal(stats.weapons.staticParts,staticParts,'new recoil/pump phases do not rebuild permanent geometry');
  assert(stats.weapons.staticParts<20,'the shared part set is finite');
});

// The new close-up surfaces must survive depth testing as solids. These checks
// exercise geometry/topology, not a requested triangle count or a beauty claim.
test('analytic hand sculpting produces one closed joined surface with shared smooth normals',async()=>{
  const {implicitMesh,smoothUnion,ellipsoidDistance,capsuleDistance}=await import('../src/procedural-object-sculpt.js');
  const mesh=implicitMesh('joined-hand-test',{
    bounds:[[-3,-3,-3],[3,3,3]],resolution:[22,24,22],color:[180,125,85],material:'skin',
    distance:(x,y,z)=>smoothUnion(ellipsoidDistance(x,y,z,[0,-.4,0],[1.3,1.5,.85]),
      capsuleDistance(x,y,z,[.55,.1,.1],[1.1,1.65,.2],.55,.38),.30)
  });
  validate(mesh,10000,false);
  const v=mesh.vertices,vertices=new Map(),edges=new Map(),neighbors=new Map();
  const id=(offset)=>{
    const key=[v[offset],v[offset+1],v[offset+2]].map(x=>x.toFixed(6)).join(',');
    if(!vertices.has(key))vertices.set(key,vertices.size);
    return vertices.get(key);
  };
  for(let i=0;i<v.length;i+=STRIDE*3){
    const ids=[id(i),id(i+STRIDE),id(i+STRIDE*2)];
    for(let k=0;k<3;k++){
      const a=ids[k],b=ids[(k+1)%3],key=a<b?a+':'+b:b+':'+a;
      edges.set(key,(edges.get(key)||0)+1);
      if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);
      if(!neighbors.has(b))neighbors.set(b,new Set());neighbors.get(b).add(a);
    }
  }
  for(const count of edges.values())assert.equal(count,2,'every sculpted edge belongs to two faces');
  const seen=new Set(),queue=[0];while(queue.length){const a=queue.pop();if(seen.has(a))continue;seen.add(a);for(const b of neighbors.get(a))if(!seen.has(b))queue.push(b);}
  assert.equal(seen.size,vertices.size,'palm and finger are joined, with no disconnected beads');
});

test('muzzles have annular metal rims and visible bore depth rather than flat black disks',()=>{
  const forwardSurface=(mesh,x,z)=>{
    let hit=-Infinity;const a=mesh.vertices;
    for(let i=0;i<a.length;i+=3*STRIDE){
      const j=i+STRIDE,k=i+2*STRIDE,den=(a[j+2]-a[k+2])*(a[i]-a[k])+(a[k]-a[j])*(a[i+2]-a[k+2]);
      if(Math.abs(den)<1e-9)continue;
      const u=((a[j+2]-a[k+2])*(x-a[k])+(a[k]-a[j])*(z-a[k+2]))/den;
      const w=((a[k+2]-a[i+2])*(x-a[k])+(a[i]-a[k])*(z-a[k+2]))/den,t=1-u-w;
      if(u>=0&&w>=0&&t>=0)hit=Math.max(hit,u*a[i+1]+w*a[j+1]+t*a[k+1]);
    }return hit;
  };
  for(const[kind,z,edge]of[['pistol',-6.91,1.02],['shotgun',-8.6+1.15*.73,.73]]){
    const mesh=weaponMesh(kind),bore=forwardSurface(mesh,0,z),rim=forwardSurface(mesh,edge,z);
    assert(Number.isFinite(bore)&&Number.isFinite(rim));
    assert(rim-bore>1.0,`${kind} bore is recessed by more than one game unit`);
  }
});

test('SHELLS reads left to right from the shell box printed face, with E and L stems on the viewer left',()=>{
  // The printed face points along local +Y; its viewer-right direction is -X.
  // Probe the actual front-facing ink triangles, not vertex insertion order.
  const inkAt=(mesh,screenX,z)=>{
    const v=mesh.vertices;
    for(let i=0;i<v.length;i+=3*STRIDE){
      if(v[i+4]<.9||Math.abs(v[i+6]-47/255)>1e-6||Math.abs(v[i+7]-51/255)>1e-6||Math.abs(v[i+8]-43/255)>1e-6)continue;
      const j=i+STRIDE,k=i+2*STRIDE,ax=-v[i],bx=-v[j],cx=-v[k],az=v[i+2],bz=v[j+2],cz=v[k+2];
      const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-9)continue;
      const a=((bz-cz)*(screenX-cx)+(cx-bx)*(z-cz))/den,b=((cz-az)*(screenX-cx)+(ax-cx)*(z-cz))/den;
      if(a>=0&&b>=0&&a+b<=1)return true;
    }return false;
  };
  const scale=.97,left=5.6-8.5*scale,z=2.4+3*scale;
  for(const detail of[1,2]){
    const mesh=objectMesh({type:2049},0,detail);
    for(const column of[2,3,4]){
      const x=left+column*3*scale;
      assert(inkAt(mesh,x,z),'E/L has its vertical stem on the left as viewed from +Y');
      assert(!inkAt(mesh,x+2*scale,z),'E/L is open at the upper right, not horizontally mirrored');
    }
  }
});
