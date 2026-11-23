/**
 * True 3D, articulated constructions studied against Doom 1993's five authored
 * viewing directions. No artwork, sampled colors, reference reader, camera or
 * billboard is used here. The fixed palette and proportions describe anatomy,
 * clothing, weapons and wounds; every surface is a generated triangle volume.
 * X is the actor's right, Y forward, Z up. Ground is Z=0, standing height ~56.
 */
import {MeshBuilder} from './procedural-mesh.js?v=0.3.0-663ad4ffe1db';

const cache = new Map();
const FAMILY = {3004:'POSS',9:'SPOS',3001:'TROO'};
const BONE = [188,177,139], BLOOD = [111,17,10], DARK_BLOOD = [57,8,5];
const STEEL = [66,72,70], GUN_DARK = [26,30,29], GUN_LIGHT = [104,112,107];
const ellipsoid = (b,p,r,c,options={}) => b.ellipsoid(p,r,c,{segments:8,rings:4,...options});
const joint = (b,p,r,c) => b.ellipsoid(p,[r,r,r],c,{segments:6,rings:3});
const limb = (b,a,z,r1,r2,c) => b.cylinder(a,z,r1,c,{segments:7,topRadius:r2});
const between = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);

function frameFor(entity, time, family) {
  const frames = family === 'TROO' ? 'IJKLM' : 'HIJKL';
  let frame = typeof entity.sprite === 'string' ? entity.sprite[4] : null;
  if (entity.alive === false || entity.state === 'dead' || entity.state === 'dying') {
    if (!frames.includes(frame || '?')) frame = frames[Math.min(4,Math.floor((entity.stateTime ?? .75)/.15))];
  } else if (!frame || !/^[A-Z]$/.test(frame)) {
    if (entity.state === 'pain') frame = family === 'TROO' ? 'H' : 'G';
    else if (entity.state === 'attack') frame = 'F';
    else frame = entity.state === 'chase' || entity.state === 'walk' ? 'ABCD'[Math.floor(Math.max(0,time)*7)%4] : 'A';
  }
  const dead = frames.includes(frame), pain = frame === (family === 'TROO' ? 'H' : 'G');
  const attack = (family === 'TROO' ? 'EFG' : 'EF').includes(frame);
  const idle = !dead && !pain && !attack && entity.state === 'idle';
  const walkIndex = Math.max(0,'ABCD'.indexOf(frame));
  return {frame,dead,pain,attack,idle,deathIndex:frames.indexOf(frame),
    step: dead ? 2.2 : attack || pain ? .7 : idle ? 1.0 : [.65,1,-.65,-1][walkIndex]*4.1,
    lift: idle || attack || pain || dead ? 0 : [0,1.7,0,-1.7][walkIndex]};
}

function humanHead(b, guard, pose) {
  const h = new MeshBuilder(), skin = guard ? [190,145,102] : [178,159,116];
  ellipsoid(h,[0,1,.2],[2.6,2.4,2.2],skin,{segments:7,rings:3});
  ellipsoid(h,[0,.7,5.2],[4.05,3.45,5.0],skin,{segments:10,rings:5});
  ellipsoid(h,[0,2.2,2.4],[3.1,2.0,2.2],guard?[173,118,78]:[162,137,90],{segments:8,rings:3});
  for (const side of [-1,1]) {
    ellipsoid(h,[side*4.0,.8,5.0],[.72,1.0,1.35],skin,{segments:5,rings:3});
    h.box([side*1.65,3.75,6.3],[2.1,.6,1.05],[63,27,14]);
    h.box([side*1.65,4.1,6.3],[1.15,.22,.42],[183,44,17],{emissive:.06});
    h.box([side*1.8,3.8,7.1],[2.7,.62,.55],guard?[127,80,43]:[113,110,61],{rotation:[0,side*.1,0]});
  }
  ellipsoid(h,[0,4.0,4.7],[.85,1.05,1.1],[177,116,68],{segments:6,rings:3});
  ellipsoid(h,[0,3.9,2.7],[1.9,.65,1.25],[39,10,5],{segments:6,rings:3});
  h.box([0,4.42,3.35],[2.5,.25,.48],[207,187,136]);
  h.box([0,4.2,1.6],[1.1,.35,1.2],BLOOD);
  if (!guard) {
    // A thin green military flat-top, not an invented helmet or armor shell.
    h.box([0,.45,9.8],[7.15,5.1,.85],[66,84,43]);
    h.box([0,-2.3,8.7],[7.5,.55,2.3],[48,66,32]);
    for (const side of [-1,1]) h.box([side*3.75,.1,8.6],[.5,4.4,1.8],[52,73,34]);
    h.box([0,1.7,10.23],[6.5,2.2,.15],[93,109,58]);
  }
  if (pose.dead) ellipsoid(h,[1.6,3.75,4.3],[1.7,.5,2.7],BLOOD,{segments:5,rings:3});
  b.add(h.finish('human-head'),{translation:[0,pose.pain?-1:0,45.2],rotation:[pose.pain?.24:0,0,pose.pain?.10:0]});
}

function firearm(guard, firing) {
  const b = new MeshBuilder(), stock = guard ? [66,45,28] : [49,54,44];
  b.box([0,-6.3,-.4],[3.4,5.7,3.8],stock,{rotation:[.08,0,0]});
  b.box([0,-8.9,-.4],[3.6,.7,4.0],GUN_DARK);
  b.box([0,0,0],[3.1,7.0,3.1],STEEL);
  b.box([0,-1.8,-2.6],[2.0,2.4,4.1],GUN_DARK,{rotation:[-.23,0,0]});
  b.box([0,1.3,1.6],[1.4,11.0,.65],GUN_LIGHT);
  b.cylinder([0,4.3,.5],[0,guard?18.6:21.0,.5],guard?1.05:.87,STEEL,{segments:7});
  if (guard) {
    ellipsoid(b,[0,6.0,-.2],[1.6,3.4,1.65],[63,47,30],{segments:7,rings:3});
    for (const y of [4.1,5.5,6.9,8.3]) b.box([0,y,-1.25],[2.6,.35,.5],GUN_DARK);
  } else {
    b.box([0,5.7,-.4],[2.6,5.6,2.7],GUN_DARK);
    b.box([0,1.1,-3.2],[2.2,2.8,4.0],GUN_DARK,{rotation:[-.12,0,0]});
    b.box([0,10.7,1.8],[.55,1.5,2.3],GUN_DARK);
  }
  const end = guard ? 18.6 : 21.0;
  b.cylinder([0,end,.5],[0,end+.15,.5],guard?.73:.58,[8,10,9],{segments:7});
  if (firing) {
    b.cone([0,end+.1,.5],[0,end+6.5,.5],2.6,[255,149,25],{segments:7,emissive:1});
    ellipsoid(b,[0,end+2.0,.5],[1.15,2.3,1.15],[255,231,112],{segments:6,rings:3,emissive:1});
  }
  return b.finish(guard?'pump-shotgun':'infantry-rifle');
}

function human(family, pose) {
  const b = new MeshBuilder(), guard = family === 'SPOS';
  const shirt = guard ? [43,47,45] : [130,119,91];
  const shirtLight = guard ? [64,69,64] : [153,142,111];
  const trousers = guard ? [31,34,31] : [91,100,63];
  const trouserLight = guard ? [48,51,47] : [110,112,78];
  const skin = guard ? [186,139,96] : [178,151,104];
  const boot = [92,25,16];
  for (const side of [-1,1]) {
    const stride = pose.step*side, lift = Math.max(0,pose.lift*side);
    const hip = [side*4.55,-.4,26.2];
    const knee = [side*5.15,stride*.45+1.1,14.4+lift*.25];
    const ankle = [side*5.6,stride,4.7+lift];
    limb(b,hip,knee,4.0,3.45,trousers);
    joint(b,knee,3.45,trouserLight);
    limb(b,knee,ankle,3.3,2.75,trousers);
    ellipsoid(b,[ankle[0],ankle[1]+2.25,2.65+lift],[3.35,5.65,2.65],boot,{segments:8,rings:3});
    b.box([ankle[0],ankle[1]+2.0,.7+lift],[6.0,8.4,1.4],[52,21,15]);
    limb(b,[ankle[0],ankle[1],3.3+lift],[ankle[0],ankle[1],7.3+lift],2.8,2.75,boot);
    const thigh = between(hip,knee,.55);
    ellipsoid(b,[thigh[0]+side*.45,thigh[1]+3.25,thigh[2]],[2.1,.38,3.3],BLOOD,{segments:6,rings:3});
    ellipsoid(b,[knee[0],knee[1]+3.1,knee[2]-2.8],[1.6,.33,2.0],guard?[100,19,13]:[126,37,22],{segments:5,rings:3});
    ellipsoid(b,[thigh[0],thigh[1]-3.2,thigh[2]-1.8],[1.7,.35,3.1],BLOOD,{segments:5,rings:3});
  }
  ellipsoid(b,[0,-.3,25.9],[7.7,4.3,4.7],trousers);
  ellipsoid(b,[0,0,36.7],[9.15,4.8,9.4],shirt,{segments:10,rings:5});
  b.box([0,0,27.3],[16.0,8.4,1.7],guard?[77,76,58]:[73,68,42]);
  b.box([0,4.45,27.2],[2.7,.55,1.4],[129,121,84]);
  for (const side of [-1,1]) {
    ellipsoid(b,[side*4.5,3.7,39.6],[4.2,1.5,4.4],shirtLight,{segments:7,rings:3});
    ellipsoid(b,[side*8.8,.0,42.2],[4.4,4.05,3.6],shirtLight,{segments:8,rings:3});
  }
  ellipsoid(b,[0,4.3,40.3],[3.7,.6,4.5],BLOOD,{segments:7,rings:3});
  b.box([.35,4.8,36.5],[1.6,.4,3.8],DARK_BLOOD,{rotation:[0,0,.12]});
  if (pose.dead) ellipsoid(b,[0,4.6,35.8],[6.1,.8,5.3],[143,19,10],{segments:8,rings:3});
  const rightHand = pose.dead ? [13,2,23] : pose.attack ? [3.7,7.0,32.8] : [7.5,7.4,32.4];
  const leftHand = pose.dead ? [-14,2,27] : pose.attack ? [-1.9,12.0,33.0] : [-5.7,10.7,39.4];
  for (const side of [-1,1]) {
    const shoulder = [side*9.0,.2,42.0];
    const elbow = pose.dead ? [side*12.7,1.8,32.0] : [side*11.4,4.3,35.2];
    const wrist = side>0?rightHand:leftHand, cuff = between(shoulder,elbow,.54);
    limb(b,shoulder,cuff,3.8,3.6,shirt);
    limb(b,cuff,elbow,3.15,2.9,skin); joint(b,elbow,2.9,skin);
    limb(b,elbow,wrist,2.65,2.2,skin);
    ellipsoid(b,wrist,[2.5,2.0,2.45],BLOOD,{segments:7,rings:3});
    const forearm = between(elbow,wrist,.6);
    ellipsoid(b,[forearm[0],forearm[1]+1.8,forearm[2]],[1.2,.45,1.5],guard?[163,94,57]:[153,91,52],{segments:5,rings:3});
  }
  humanHead(b,guard,pose);
  const weapon = firearm(guard,pose.frame==='F'&&!pose.dead);
  const gunRotation = pose.dead ? [.2,0,1.35] : pose.attack ? [0,0,.10] : [.38,0,1.20];
  b.add(weapon,{translation:pose.dead?[0,7,25.5]:pose.attack?[1.9,7.2,33.5]:[1.5,8.3,35.8],rotation:gunRotation});
  return b.finish('human');
}

function impHead(b,pose) {
  const h = new MeshBuilder(), skin = [122,77,29], highlight = [148,99,44];
  ellipsoid(h,[0,-.6,1.4],[3.7,3.3,3.7],skin,{segments:8,rings:4});
  ellipsoid(h,[0,0,6.0],[4.8,3.9,5.8],skin,{segments:10,rings:5});
  ellipsoid(h,[0,1.8,4.3],[3.9,2.65,4.4],highlight,{segments:8,rings:4});
  for (const side of [-1,1]) {
    ellipsoid(h,[side*2.8,2.6,5.2],[1.8,2.0,3.2],[109,65,21],{segments:6,rings:3});
    h.box([side*1.85,4.13,7.1],[2.0,.8,.82],[42,12,3]);
    h.box([side*1.85,4.6,7.15],[1.3,.25,.48],[239,49,13],{emissive:.28});
    ellipsoid(h,[side*2.0,3.75,8.1],[2.7,1.25,.85],[99,65,27],{segments:6,rings:3,rotation:[0,side*.11,0]});
  }
  ellipsoid(h,[0,4.15,5.9],[1.15,1.2,1.15],[119,70,27],{segments:6,rings:3});
  ellipsoid(h,[0,4.0,3.3],[2.55,1.1,3.0],[30,7,2],{segments:8,rings:4});
  ellipsoid(h,[0,4.7,2.8],[1.85,.55,1.7],[152,21,10],{segments:6,rings:3});
  for (const x of [-1.5,-.5,.5,1.5]) {
    h.cone([x,5.05,5.05],[x,5.1,3.7],.38,BONE,{segments:5});
    h.cone([x,5.0,1.25],[x,5.05,2.2],.33,[165,155,116],{segments:5});
  }
  ellipsoid(h,[0,2.6,.45],[3.15,2.1,1.6],skin,{segments:7,rings:3});
  b.add(h.finish('imp-head'),{translation:[0,3.4,44],rotation:[pose.pain?.30:0,0,pose.pain?.10:0]});
}

function imp(pose) {
  const b = new MeshBuilder(), skin = [109,73,26], light = [132,88,34], shadow = [83,53,18];
  for (const side of [-1,1]) {
    const stride = pose.step*side, lift = Math.max(0,pose.lift*side);
    const hip = [side*4.7,-1.4,25.5], knee = [side*5.7,3.5+stride*.5,14.3+lift*.3], ankle = [side*5.8,-1+stride,4.4+lift];
    limb(b,hip,knee,4.3,3.8,skin); ellipsoid(b,between(hip,knee,.5),[4.0,4.0,6.2],light,{segments:7,rings:4,rotation:[-.16,0,0]});
    joint(b,knee,3.5,skin); limb(b,knee,ankle,3.1,2.5,skin);
    ellipsoid(b,[ankle[0],ankle[1]+2.6,2.55+lift],[3.8,5.8,2.55],skin,{segments:8,rings:3});
    for (const toe of [-1,0,1]) b.cone([ankle[0]+toe*2.1,ankle[1]+6.4,2.1+lift],[ankle[0]+toe*2.2,ankle[1]+9.1,1.0+lift],.72,BONE,{segments:5});
    b.cone([knee[0]+side*.7,knee[1]+2.5,knee[2]],[knee[0]+side*1.6,knee[1]+6.0,knee[2]+.8],1.0,BONE,{segments:5});
  }
  ellipsoid(b,[0,-.8,25.8],[7.25,4.4,5.2],skin,{segments:8,rings:4});
  ellipsoid(b,[0,-.8,36.3],[9.5,5.7,10.5],skin,{segments:10,rings:5});
  ellipsoid(b,[0,-3.1,43.2],[8.3,4.4,5.0],shadow,{segments:8,rings:4});
  for (const side of [-1,1]) {
    ellipsoid(b,[side*4.4,4.1,39.5],[4.7,2.2,3.6],light,{segments:7,rings:4});
    for (const [z,r] of [[29.7,1.4],[32.6,1.6],[35.7,1.7]]) ellipsoid(b,[side*2.0,4.2,z],[2.35,1.25,r],z<33?skin:light,{segments:6,rings:3});
    ellipsoid(b,[side*9.0,0,43.3],[4.6,4.4,4.3],light,{segments:8,rings:4});
    // Original imp quills belong to shoulders/arms/knees, never the head.
    b.cone([side*10.2,-.2,45.0],[side*16.2,-1.0,49.2],1.6,BONE,{segments:5});
    b.cone([side*11.5,-1.2,40.8],[side*16.9,-2.1,42.3],1.25,BONE,{segments:5});
    b.cone([side*6.2,-4.5,43.7],[side*8.1,-8.0,46.0],1.15,[162,153,120],{segments:5});
  }
  let elbows = [[12.2,3.4,35.6],[-12.2,3.4,35.6]], wrists = [[13.7,6.9,27.9],[-13.7,6.9,27.9]];
  if (pose.attack) {
    if (pose.frame==='E') { elbows=[[17.5,2.0,35.5],[-11.6,6.0,37.1]]; wrists=[[23,7,31.8],[-5.2,9.4,38.8]]; }
    else if (pose.frame==='F') { elbows=[[11.5,10,37.5],[-11.4,5.1,34.5]]; wrists=[[6.4,19.4,38.8],[-5.8,8.4,32.4]]; }
    else { elbows=[[11.2,11.5,39.1],[-12.5,3.7,34.3]]; wrists=[[5.7,23.1,40.8],[-13.6,7.0,28.1]]; }
  } else if (pose.pain) { elbows=[[13.6,3.1,35.5],[-13.4,1.5,34.7]]; wrists=[[6.2,9.5,34.7],[-18,4.1,28.8]]; }
  else if (pose.dead) { elbows=[[14.1,0,33.1],[-14.4,2,32.3]]; wrists=[[17.3,1,22.5],[-17.1,3,24.0]]; }
  for (let i=0;i<2;i++) {
    const side=i===0?1:-1, shoulder=[side*9.5,.3,42.4], elbow=elbows[i], wrist=wrists[i];
    limb(b,shoulder,elbow,3.8,3.3,skin); joint(b,elbow,3.2,shadow); limb(b,elbow,wrist,3.15,2.2,skin);
    const quill = between(shoulder,elbow,.76);
    b.cone([quill[0]+side*1.8,quill[1]-1,quill[2]],[quill[0]+side*5.3,quill[1]-2,quill[2]+1.3],1.05,BONE,{segments:5});
    ellipsoid(b,wrist,[2.8,2.4,3.5],light,{segments:7,rings:3});
    for (const finger of [-1,0,1]) {
      const at=[wrist[0]+finger*1.45,wrist[1]+1.5,wrist[2]-1.9];
      b.cone(at,[at[0]+finger*.35,at[1]+2.5,at[2]-2.5],.7,[145,136,99],{segments:5});
    }
  }
  if (pose.dead) {
    ellipsoid(b,[0,4.9,35],[6.3,1.1,6.2],[132,20,11],{segments:8,rings:3});
    for (const side of [-1,1]) for (const z of [33,36,39]) b.cylinder([side*.7,5.7,z],[side*3.8,5.4,z+.6],.45,BONE,{segments:5});
  }
  impHead(b,pose);
  return b.finish('imp');
}

/** Pose cache ignores view suffixes, camera bearing and mirrored sprite flags. */
export function characterMesh(entity, time = 0) {
  if (!entity || entity.removed) return null;
  const family = FAMILY[entity.type] || entity.base || String(entity.sprite || '').slice(0,4);
  if (!['POSS','SPOS','TROO'].includes(family)) return null;
  const pose = frameFor(entity,time,family);
  const key = `character:${family}:${pose.frame}:${pose.idle?'idle':'pose'}`;
  if (cache.has(key)) return cache.get(key);
  const source = family==='TROO'?imp(pose):human(family,pose);
  let result;
  if (pose.dead) {
    const collapse = [.18,.38,.65,.88,1][Math.max(0,pose.deathIndex)];
    const tilted = new MeshBuilder().add(source,{rotation:[collapse*Math.PI/2,0,collapse*.12]}).finish('fallen');
    const translate = [-(tilted.bounds.min[0]+tilted.bounds.max[0])*.5,
      -(tilted.bounds.min[1]+tilted.bounds.max[1])*.5,-tilted.bounds.min[2]];
    const b = new MeshBuilder().add(tilted,{translation:translate});
    if (collapse>.8) ellipsoid(b,[0,0,.3],[10.5,12.8,.3],DARK_BLOOD,{segments:8,rings:3});
    result=b.finish(key);
  } else result=new MeshBuilder().add(source,{translation:[0,0,-source.bounds.min[2]]}).finish(key);
  cache.set(key,result);
  return result;
}

export default characterMesh;
