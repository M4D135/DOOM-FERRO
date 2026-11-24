import test from 'node:test';
import assert from 'node:assert/strict';
import {ProceduralResources} from '../src/procedural-resources.js';
import {DoomGame} from '../src/game.js';
import {MAX_SCENE_LIGHTS,buildLightingRig,lightPathOpen,shadowProjection,sceneLighting,studioLighting,sectorLightPulse,weaponShadowProjection} from '../src/procedural-lighting.js';
import {collectModelBatches,collectShadowBatches,modelForEntity,viewWeaponBatch} from '../src/procedural-models.js';

const view={oeil:[33,41/32,113],avant:[0,0,-1],droite:[1,0,0],haut:[0,1,0]};
const transform=(m,p)=>Array.from({length:4},(_,row)=>p.reduce((n,v,col)=>n+v*m[col*4+row],0));

test('shadow camera centers the light target and handles a vertical light direction',()=>{
  for(const [position,target] of [[[2,5,3],[0,1,-4]],[[0,5,0],[0,0,0]],[[0,0,0],[0,5,0]]]){
    const vp=shadowProjection(position,target),clip=transform(vp,[...target,1]);
    assert.ok([...vp].every(Number.isFinite));assert.ok(clip[3]>0);
    assert.ok(Math.abs(clip[0]/clip[3])<1e-5);assert.ok(Math.abs(clip[1]/clip[3])<1e-5);
    assert.ok(clip[2]/clip[3]>-1&&clip[2]/clip[3]<1,'target is inside the depth range');
    const behind=target.map((v,i)=>position[i]-(v-position[i]));
    assert.ok(transform(vp,[...behind,1])[3]<0,'geometry behind the light cannot be projected as lit');
  }
});

test('generated fixture lights remain inside their actual E1M1 sectors',()=>{
  const map=new ProceduralResources().map(),rig=buildLightingRig(map);
  assert.ok(rig.lights.length>50);
  for(const light of rig.lights){
    const sector=map.sectorAt(light.x,light.y);
    assert.equal(sector?.id,light.sector,'light is inside the sector it illuminates');
    assert.ok(light.z>sector.floor&&light.z<sector.ceiling);
    assert.ok(light.power>0&&light.range>0);
  }
  assert.ok(rig.lights.some(l=>l.source==='emissive-ceiling'));
  assert.ok(rig.lights.some(l=>l.source==='open-sky'));
});

test('closed Door 151 blocks a light ray and its real opening action releases it',()=>{
  const map=new ProceduralResources().map(),game=new DoomGame(map,{skill:2}),rig=buildLightingRig(map),line=game.lines[151];
  const x=(line.ax+line.bx)/2,y=(line.ay+line.by)/2,dx=line.bx-line.ax,dy=line.by-line.ay,length=Math.hypot(dx,dy);
  const a={x:x+dy/length*5,y:y-dx/length*5,z:41},b={x:x-dy/length*5,y:y+dx/length*5,z:41};
  assert.equal(lightPathOpen(rig,a,b),false);
  game._openDoor(line);for(let i=0;i<140;i++)game._updateActions(1/70);
  assert.ok(map.sectors[line.back].ceiling-map.sectors[line.back].floor>=56);
  assert.equal(lightPathOpen(rig,a,b),true,'lighting follows mutable door heights, without rebuilding the rig');
});

test('local lights are bounded, finite and fixed in the room when the camera turns',()=>{
  const map=new ProceduralResources().map(),rig=buildLightingRig(map),a=sceneLighting(rig,view);
  const b=sceneLighting(rig,{...view,avant:[1,0,0],droite:[0,0,1]});
  assert.ok(a.count>0&&a.count<=MAX_SCENE_LIGHTS);
  assert.deepEqual(a.positions,b.positions);assert.deepEqual(a.colors,b.colors);
  for(const array of[a.positions,a.colors,a.shadowVP])assert.ok([...array].every(Number.isFinite));
  const origin={x:view.oeil[0]*32,y:-view.oeil[2]*32,z:view.oeil[1]*32};
  for(const source of a.sources){
    const [x,z,negativeY]=source.position;
    assert.ok(lightPathOpen(rig,origin,{x:x*32,y:-negativeY*32,z:z*32}));
  }
});

test('muzzle illumination appears only during the shot and keeps a stable room shadow light',()=>{
  const map=new ProceduralResources().map(),rig=buildLightingRig(map);
  const rest=sceneLighting(rig,view,[],0,{kind:'pistol',phase:Infinity});
  const shot=sceneLighting(rig,view,[],0,{kind:'pistol',phase:.03});
  const ended=sceneLighting(rig,view,[],0,{kind:'pistol',phase:.2});
  assert.equal(shot.sources[0].id,rest.sources[0].id);
  assert.ok(shot.sources.some(l=>l.id==='muzzle'));assert.ok(!ended.sources.some(l=>l.id==='muzzle'));
  assert.ok(!sceneLighting(rig,view,[],0,{kind:'fist',phase:.03}).sources.some(l=>l.id==='muzzle'));
  assert.ok(shot.count<=MAX_SCENE_LIGHTS);
});

test('studio inspection uses finite three-light geometry, with the same shadow projection',()=>{
  const lights=studioLighting(view,[33,49/32,112]);
  assert.equal(lights.count,3);assert.ok(lights.sources.every(s=>s.source==='studio'));
  assert.ok([...lights.shadowVP,...lights.positions,...lights.colors].every(Number.isFinite));
});

test('sector strobes and pulses change direct light power while keeping a stable shadow source',()=>{
  assert.equal(sectorLightPulse(12,0),1);assert.equal(sectorLightPulse(12,.3),.35);
  assert.equal(sectorLightPulse(3,.1),1);assert.equal(sectorLightPulse(3,.3),.35);
  assert.ok(sectorLightPulse(8,.6)>sectorLightPulse(8,1.8));
  const map=new ProceduralResources().map(),rig=buildLightingRig(map);
  const a=sceneLighting(rig,view,[],0),b=sceneLighting(rig,view,[],1);
  assert.equal(a.sources[0].id,b.sources[0].id);assert.deepEqual(a.positions,b.positions);
  const primary=rig.lights.find(l=>l.id===a.sources[0].id),special=map.sectors[primary.sector].special;
  assert.ok(Math.abs(b.colors[3]/a.colors[3]-sectorLightPulse(special,1)/sectorLightPulse(special,0))<1e-5);
});

test('a camera-culled model inside the light cone remains a bounded shadow caster',()=>{
  const camera={oeil:[0,1,0],avant:[0,0,-1],droite:[1,0,0],haut:[0,1,0],tangente:.6,largeur:1,hauteur:1};
  const map={sectorAt:()=>({floor:0,light:160,special:0})};
  const behind={id:'behind-camera',type:2035,sprite:'BAR1A0',x:0,y:-96,z:0};
  const far={...behind,id:'outside-light',y:-4096};
  const lighting={shadowView:{...camera,oeil:[0,4,6],avant:[0,-.6,-.8],haut:[0,.8,-.6],tangente:1.5},shadowRange:12};
  const visible=collectModelBatches(map,[behind,far],0,camera);
  assert.equal(visible.length,0);
  const shadows=collectShadowBatches(map,[behind,far],0,lighting,visible);
  assert.deepEqual(shadows.flatMap(b=>b.entityIds),['behind-camera']);
  assert.ok(shadows[0].mesh===modelForEntity(behind,0,1),'offscreen casters cannot allocate the close-detail recipe');
});


test('fitted weapon shadow contains visible weapon geometry for all three held weapons',()=>{
  const map=new ProceduralResources().map(),rig=buildLightingRig(map);
  for(const kind of ['pistol','shotgun','fist']){
    const v={...view,tangente:Math.tan(35*Math.PI/180),largeur:1280,hauteur:800};
    const lighting=sceneLighting(rig,v),batch=viewWeaponBatch({kind,phase:Infinity});
    const matrix=weaponShadowProjection(lighting.positions.subarray(0,3),v,batch);
    assert.ok([...matrix].every(Number.isFinite));let inspected=0;
    for(let i=0;i<batch.mesh.vertices.length;i+=batch.mesh.stride*9){
      const [x,y,z]=batch.mesh.vertices.subarray(i,i+3),ty=v.tangente,tx=ty*v.largeur/v.hauteur;
      if(y<.8||Math.abs(x)>y*tx||Math.abs(z)>y*ty)continue;
      const p=v.oeil.map((n,k)=>n+(v.droite[k]*x+v.avant[k]*y+v.haut[k]*z)/32);
      const c=transform(matrix,[...p,1]);assert.ok(c[3]>0);
      assert.ok(Math.abs(c[0]/c[3])<1.02&&Math.abs(c[1]/c[3])<1.02,kind+' visible geometry stays in shadow map');inspected++;
    }
    assert.ok(inspected>50,kind+' fixture must cover the actual visible mesh');
  }
});
