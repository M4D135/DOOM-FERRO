import test from 'node:test';
import assert from 'node:assert/strict';
import {ProceduralResources} from '../src/procedural-resources.js';
import {buildLightingRig,sceneLighting} from '../src/procedural-lighting.js';

const map=new ProceduralResources().map();
const rig=buildLightingRig(map);
const view=(x,y,z,angle=0)=>({oeil:[x/32,z/32,-y/32],avant:[Math.cos(angle),0,-Math.sin(angle)],droite:[Math.sin(angle),0,Math.cos(angle)],haut:[0,1,0]});
const ids=lighting=>[...new Set(lighting.sources.map(source=>source.id))].sort();
const array=values=>Array.from(values);

test('a one-unit step keeps the shadow owner and the accepted fixture set stable',()=>{
  const before=sceneLighting(rig,view(2499,-2285,73),[],0,null);
  const after=sceneLighting(rig,view(2500,-2285,73),[],0.016,before);
  assert.equal(after.debug.shadowSource,before.debug.shadowSource);
  assert.deepEqual(ids(after),ids(before));
  assert.ok(after.sources.every(source=>source.weight>0.9));
});

test('a sector light does not pop into the budget on a one-unit step',()=>{
  const before=sceneLighting(rig,view(1651,-2525,41),[],0,null);
  const after=sceneLighting(rig,view(1652,-2525,41),[],0.016,before);
  assert.equal(after.count,before.count);
  assert.deepEqual(ids(after),ids(before));
});

test('the fallback room fill is anchored to the sector instead of following the eye',()=>{
  const before=sceneLighting(rig,view(739,-3405,41),[],0,null);
  const after=sceneLighting(rig,view(740,-3405,41),[],0.016,before);
  assert.match(before.sources[0].id,/^room-fill-/);
  assert.deepEqual(array(before.positions),array(after.positions));
  assert.deepEqual(array(before.colors),array(after.colors));
});

test('turning the head does not move the world shadow projection',()=>{
  const before=sceneLighting(rig,view(2499,-2285,73),[],0,null);
  const after=sceneLighting(rig,view(2499,-2285,73,Math.PI/2),[],0.016,before);
  assert.deepEqual(array(before.shadowVP),array(after.shadowVP));
  assert.equal(after.debug.shadowSource,before.debug.shadowSource);
});

test('a muzzle flash uses its transient slot without removing the fixed room lights',()=>{
  const base=view(1651,-2525,41);
  const rest=sceneLighting(rig,base,[],0,{kind:'pistol',phase:Infinity},null);
  const shot=sceneLighting(rig,base,[],0.016,{kind:'pistol',phase:.03},rest);
  assert.ok(shot.sources.some(source=>source.id==='muzzle'));
  assert.equal(shot.debug.shadowSource,rest.debug.shadowSource);
  for(const source of rest.sources)assert.ok(shot.sources.some(candidate=>candidate.id===source.id),source.id);
});
