import test from 'node:test';
import assert from 'node:assert/strict';
import {GamepadControls} from '../src/input.js';

function controller({pressed=[],axes=[0,0,0,0],index=0}={}) {
  return {connected:true,index,axes,buttons:Array.from({length:16},(_,i)=>({pressed:pressed.includes(i)}))};
}

test('controller can select difficulty and start from the menu without firing',()=>{
  const input=new GamepadControls();
  assert.equal(input.sample([controller({pressed:[13]})],1/60,'title').difficulty,1);
  assert.equal(input.sample([controller({pressed:[13]})],1/60,'title').difficulty,0);
  input.sample([controller()],1/60,'title');
  const start=input.sample([controller({pressed:[0,7]})],1/60,'title');
  assert.equal(start.action,'start');assert.equal(start.input.fire,false);
  const play=input.sample([controller({pressed:[0,7]})],1/60,'playing');
  assert.equal(play.input.fire,false);assert.equal(play.input.use,false);
  input.sample([controller()],1/60,'playing');
  assert.equal(input.sample([controller({pressed:[7]})],1/60,'playing').input.fire,true);
});

test('pause and resume require a new button press and cannot leak held triggers',()=>{
  const input=new GamepadControls();
  assert.equal(input.sample([controller({pressed:[9,7]})],1/60,'playing').action,'pause');
  assert.equal(input.sample([controller({pressed:[9,7]})],1/60,'paused').action,null);
  input.sample([controller({pressed:[7]})],1/60,'paused');
  assert.equal(input.sample([controller({pressed:[0,7]})],1/60,'paused').action,'resume');
  const resumed=input.sample([controller({pressed:[0,7]})],1/60,'playing');
  assert.equal(resumed.input.fire,false);assert.equal(resumed.input.use,false);
});

test('axes implement deadzone, forward, right strafe and radian look deltas',()=>{
  const input=new GamepadControls();
  const small=input.sample([controller({axes:[.1,-.1,.1,-.1]})],.02,'playing');
  for(const key of ['forward','strafe','turn','look']) assert.equal(Math.abs(small.input[key]),0);
  const full=input.sample([controller({axes:[1,-1,1,-1]})],.02,'playing').input;
  assert.equal(full.forward,1);assert.equal(full.strafe,1);
  assert.ok(Math.abs(full.turn+.054)<1e-10);assert.ok(Math.abs(full.look-.034)<1e-10);
});

test('use, map and weapon commands are edges while firing is held',()=>{
  const input=new GamepadControls(),pad=controller({pressed:[0,3,7,8]});
  const first=input.sample([pad],1/60,'playing');
  assert.equal(first.input.use,true);assert.equal(first.map,true);assert.equal(first.cycleWeapon,true);
  const held=input.sample([pad],1/60,'playing');
  assert.equal(held.input.use,false);assert.equal(held.map,false);assert.equal(held.cycleWeapon,false);assert.equal(held.input.fire,true);
});

test('disconnect resets motion and explicit clears require releasing pressed buttons',()=>{
  const input=new GamepadControls();
  input.sample([controller({pressed:[7],axes:[1,-1,1,1]})],.02,'playing');input.clear();
  assert.equal(input.sample([controller({pressed:[7]})],.02,'playing').input.fire,false);
  const absent=input.sample([],1/60,'playing');
  assert.equal(absent.active,false);assert.equal(absent.input.fire,false);assert.equal(absent.input.forward,0);
  assert.equal(input.sample([controller({index:1,pressed:[7]})],.02,'playing').input.fire,true);
});
