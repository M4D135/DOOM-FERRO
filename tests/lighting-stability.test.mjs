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
  const after=sceneLighting(rig,view(2500,-2285,73),[],0.016,null,before);
  assert.equal(after.debug.shadowSource,before.debug.shadowSource);
  assert.deepEqual(ids(after),ids(before));
  assert.ok(after.sources.every(source=>source.weight>0.9));
});

test('a sector light entering the budget fades in instead of replacing the room lights',()=>{
  const before=sceneLighting(rig,view(1651,-2525,41),[],0,null);
  const after=sceneLighting(rig,view(1652,-2525,41),[],0.016,null,before);
  const beforeIds=new Set(before.sources.map(source=>source.id));
  for(const source of before.sources){
    const kept=after.sources.find(candidate=>candidate.id===source.id);
    assert.ok(kept,`${source.id} is still lit one unit later`);
    assert.ok(kept.weight>0.9,`${source.id} keeps its weight while a neighbour arrives`);
  }
  for(const source of after.sources){
    if(beforeIds.has(source.id))continue;
    assert.ok(source.weight<1,`${source.id} arrives mid-fade instead of at full power`);
  }
});

test('the fallback room fill is anchored to the sector instead of following the eye',()=>{
  const before=sceneLighting(rig,view(739,-3405,41),[],0,null);
  const after=sceneLighting(rig,view(740,-3405,41),[],0.016,null,before);
  assert.match(before.sources[0].id,/^room-fill-/);
  assert.deepEqual(array(before.positions),array(after.positions));
  assert.deepEqual(array(before.colors),array(after.colors));
});

test('turning the head does not move the world shadow projection',()=>{
  const before=sceneLighting(rig,view(2499,-2285,73),[],0,null);
  const after=sceneLighting(rig,view(2499,-2285,73,Math.PI/2),[],0.016,null,before);
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

const corridor=Array.from({length:11},(_,i)=>view(2495+i,-2285,73,Math.PI/2));
const fillRoom=Array.from({length:11},(_,i)=>view(735+i,-3405,41,Math.PI/2));

function walk(frames){
  const steps=[];let previous=null,previousWeights=new Map(),previousShadow=null;
  for(const [index,camera] of frames.entries()){
    const lighting=sceneLighting(rig,camera,[],index*0.016,null,previous);
    assert.ok(lighting.state,'the rig hands its lighting state back to the caller');
    const weights=new Map(lighting.sources.map(source=>[source.id,source.weight]));
    if(previous){
      for(const id of new Set([...weights.keys(),...previousWeights.keys()])){
        steps.push({id,jump:Math.abs((weights.get(id)??0)-(previousWeights.get(id)??0))});
      }
      assert.equal(lighting.debug.shadowSource,previousShadow,'the shadow owner is stable across the walk');
    }
    previous=lighting;previousWeights=weights;previousShadow=lighting.debug.shadowSource;
  }
  return steps;
}

test('the state survives the round trip through the renderer so the fade is actually applied',()=>{
  const first=sceneLighting(rig,corridor[0],[],0,null,null);
  assert.ok(first.state?.lights?.length,'the first frame exposes a state');
  assert.equal(first.state.time,0);
  const entered=walk(corridor).filter(step=>step.jump>0.001&&step.jump<=0.5);
  assert.ok(entered.length,'a source fades in or out instead of switching at full strength');
  assert.ok(entered.every(step=>step.jump<=0.5/3),'no weight moves further than the 0.18 s fade allows in one frame');
});

test('a full budget never evicts a light that is still fading',()=>{
  for(const frames of [corridor,fillRoom]){
    for(const step of walk(frames)){
      assert.ok(step.jump<=0.5,`${step.id} changed by ${step.jump.toFixed(3)} in one frame`);
    }
  }
});
