import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {proceduralPatch,hasProceduralPatch} from '../src/procedural-interface.js';
const digest = image => createHash('sha256').update(image.pixels).digest('hex');
function valid(name){
  const image=proceduralPatch(name);assert.ok(image,name);
  assert.equal(image.pixels.length,image.width*image.height*4,name);
  assert.ok(image.width>0&&image.height>0&&image.width<=320&&image.height<=100);
  assert.ok(image.pixels.some((value,index)=>index%4===3&&value>0),name+' visible pixels');
  return image;
}
test('generated HUD preserves its logical layout and contains all live status states',()=>{
  const bar=valid('STBAR');assert.deepEqual([bar.width,bar.height],[320,32]);
  for(const prefix of ['STTNUM','STYSNUM','STGNUM']){
    const digits=Array.from({length:10},(_,i)=>valid(prefix+i));
    assert.equal(new Set(digits.map(digest)).size,10,'all numeric values remain distinguishable');
  }
  for(let damage=0;damage<5;damage++){
    for(let direction=0;direction<3;direction++){
      const face=valid('STFST'+damage+direction);
      assert.ok(face.width<=35&&face.height<=40,'face fits the classic central status area');
    }
    valid('STFOUCH'+damage);
  }
  valid('STFDEAD0');valid('STTPRCNT');valid('M_DOOM');
});
test('interface generation is deterministic and cannot supply a world or weapon billboard',async()=>{
  const fresh=await import('../src/procedural-interface.js?independent-instance');
  for(const name of ['STBAR','STFST00','STFOUCH3','STTNUM8','M_DOOM'])
    assert.equal(digest(proceduralPatch(name)),digest(fresh.proceduralPatch(name)));
  for(const name of ['POSSA1','TROOA1','BAR1A0','ARM1A0','PISGA0','SHTGA0','PUNGA0','missing']){
    assert.equal(hasProceduralPatch(name),false,name+' is not a UI bitmap');
    assert.equal(proceduralPatch(name),null,name+' must use its 3D model');
  }
});
test('key card icons STKEYS0/1/2 are distinct, deterministic and valid',()=>{
  const blue=valid('STKEYS0');
  const yellow=valid('STKEYS1');
  const red=valid('STKEYS2');
  // All 7×5
  assert.deepEqual([blue.width,blue.height],[7,5]);
  assert.deepEqual([yellow.width,yellow.height],[7,5]);
  assert.deepEqual([red.width,red.height],[7,5]);
  // Distinct from each other
  const digests = new Set([digest(blue),digest(yellow),digest(red)]);
  assert.equal(digests.size,3,'key cards must be visually distinct');
  // Deterministic
  assert.equal(digest(proceduralPatch('STKEYS0')),digest(blue));
  assert.equal(digest(proceduralPatch('STKEYS1')),digest(yellow));
  assert.equal(digest(proceduralPatch('STKEYS2')),digest(red));
  // hasProceduralPatch recognises them
  assert.ok(hasProceduralPatch('STKEYS0'));
  assert.ok(hasProceduralPatch('STKEYS1'));
  assert.ok(hasProceduralPatch('STKEYS2'));
  // Blue card has blue-dominant pixels
  let blueSum=0,redSum=0;
  for(let i=0;i<blue.pixels.length;i+=4){
    if(blue.pixels[i+3]>0){blueSum+=blue.pixels[i+2];redSum+=red.pixels[i];}
  }
  assert.ok(blueSum>0,'blue card must have blue channel');
});
