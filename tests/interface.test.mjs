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
