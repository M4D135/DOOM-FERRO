/**
 * Camera-independent 3D props and view weapons, built from solid primitives.
 * The 1993 silhouettes guide proportions and colours; no sprite pixels, stored
 * model, encoded asset or reference reader is part of this runtime module.
 * World axes are X right, Y forward, Z up. The host owns world position/scale.
 */
import {MeshBuilder} from './procedural-mesh.js';

const TAU = Math.PI * 2, CACHE_LIMIT = 96, cache = new Map();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const dark = [30, 34, 29], steel = [91, 97, 91], edge = [142, 148, 135];
const red = [166, 13, 6], brass = [174, 126, 42], wood = [106, 66, 30];
const TYPES = Object.freeze({2035:'BAR1',2028:'COLU',48:'ELEC',35:'CBRA',10:'PLAYW',12:'PLAYW',15:'PLAYN',24:'POL5',
  2011:'STIM',2012:'MEDI',2014:'BON1',2015:'BON2',2018:'ARM1',2019:'ARM2',2007:'CLIP',2048:'AMMO',2008:'SHEL',2049:'SBOX',2001:'SHOT'});
const FAMILIES=new Set([...Object.values(TYPES),'BAL1','BEXP']);

function remembered(key, create) {
  if (cache.has(key)) { const value=cache.get(key); cache.delete(key); cache.set(key,value); return value; }
  const value=create();
  if(cache.size>=CACHE_LIMIT)cache.delete(cache.keys().next().value);
  cache.set(key,value); return value;
}
const ell=(b,c,r,color,extra={})=>b.ellipsoid(c,r,color,{segments:8,rings:4,...extra});
const cyl=(b,a,c,r,color,extra={})=>b.cylinder(a,c,r,color,{segments:8,...extra});
function grounded(mesh) {
  return Math.abs(mesh.bounds.min[2])<1e-6?mesh:new MeshBuilder().add(mesh,{translation:[0,0,-mesh.bounds.min[2]]}).finish(mesh.key);
}

function barrel(b, frame=0) {
  cyl(b,[0,0,1],[0,0,30],10,[105,113,77],{segments:12});
  for(const [z,h,r,color] of [[0,2,10.7,steel],[8.7,2.1,10.5,dark],[21,2.2,10.5,dark],[30,2,10.8,edge]])
    cyl(b,[0,0,z],[0,0,z+h],r,color,{segments:12});
  cyl(b,[0,0,31.95],[0,0,32.15],8.8,[61,90,30],{segments:12,emissive:.025});
  for(let i=0;i<4;i++) {
    const angle=i*TAU/4+.3,r=4.5+(i%2),z=32.2+((i+frame)%2)*.18;
    ell(b,[Math.cos(angle)*r,Math.sin(angle)*r,z],[1.1,.85,.23],[109,151,64],{segments:6,rings:3,emissive:.05});
  }
  for(let i=0;i<4;i++) {
    const a=i*TAU/4;
    b.box([Math.cos(a)*9.75,Math.sin(a)*9.75,16],[.35,3.5,7.5],[73,82,48],{rotation:[0,0,a]});
  }
}

function columnLamp(b) {
  cyl(b,[0,0,0],[0,0,3],12,[57,62,57],{segments:12,topRadius:8});
  cyl(b,[0,0,3],[0,0,7],7.5,[77,83,77],{segments:10,topRadius:4.7});
  cyl(b,[0,0,7],[0,0,41],4.4,[28,32,29]);
  for(let i=0;i<4;i++) {const a=i*TAU/4;cyl(b,[Math.cos(a)*4,Math.sin(a)*4,8],[Math.cos(a)*4,Math.sin(a)*4,40],.6,[83,89,80],{segments:5});}
  cyl(b,[0,0,40],[0,0,45],6.2,[245,241,119],{segments:12,emissive:.95});
  cyl(b,[0,0,45],[0,0,47],6.8,[34,38,31],{segments:10,topRadius:4.9});
  cyl(b,[0,0,47],[0,0,48],3.7,[62,65,47]);
}

function techColumn(b) {
  cyl(b,[0,0,0],[0,0,6],15,dark,{segments:12});
  cyl(b,[0,0,6],[0,0,34],11.8,[52,58,54],{segments:12});
  cyl(b,[0,0,34],[0,0,38],14,steel,{segments:10});
  cyl(b,[0,0,122],[0,0,128],15,dark,{segments:12});
  for(let i=0;i<6;i++) {
    const a=i*TAU/6,x=Math.cos(a)*11.6,y=Math.sin(a)*11.6;
    cyl(b,[x,y,38],[x,y,123],.95,[34,39,35],{segments:5});
  }
  for(let i=0;i<8;i++) {
    const a=i*TAU/8+.24,r=4.5+i%3*2,x=Math.cos(a)*r,y=Math.sin(a)*r;
    cyl(b,[x,y,39],[x*.7,y*.7,121],.65,i%2?edge:[103,107,95],{segments:5});
    const z=48+i*9;
    b.box([x,y,z],[3,2.2,4.2],i%3?[106,113,105]:[196,200,180]);
  }
  for(const z of [54,81,108])cyl(b,[0,0,z],[0,0,z+1.1],10.8,[76,82,72],{segments:8,cap:false});
}

function candelabrum(b, frame) {
  const gold=[174,116,35], highlight=[222,169,59];
  ell(b,[0,0,3.2],[7,6,3.2],gold,{segments:8,rings:3});
  for(let i=0;i<3;i++){const a=i*TAU/3;cyl(b,[Math.cos(a)*2,Math.sin(a)*2,3],[Math.cos(a)*10,Math.sin(a)*10,.9],1.6,highlight,{segments:5});}
  cyl(b,[0,0,4],[0,0,42],1.9,gold,{segments:6});
  for(let i=0;i<7;i++) {
    const a=i*1.7,next=a+1.7,z=8+i*4;
    cyl(b,[Math.cos(a)*2.6,Math.sin(a)*2.6,z],[Math.cos(next)*2.6,Math.sin(next)*2.6,z+4],.85,highlight,{segments:4});
  }
  for(const x of [-10,0,10]) {
    const cupZ=x===0?47:39;
    if(x)cyl(b,[0,0,34],[x,0,36],1.3,gold,{segments:6});
    cyl(b,[x,0,x?36:42],[x,0,cupZ],1.6,gold,{segments:6});
    cyl(b,[x,0,cupZ],[x,0,cupZ+2],3.4,highlight,{segments:8,topRadius:2.7});
    cyl(b,[x,0,cupZ+2],[x,0,cupZ+9],1.5,[211,192,135],{segments:6});
    ell(b,[x+(frame-1.5)*.13,0,cupZ+10.3],[.9,.9,1.7],[255,215,84],{segments:6,rings:3,emissive:1});
  }
}

function crossLabel(b, y, z, width, height) {
  b.box([0,y,z],[width*.28,.26,height],red);
  b.box([0,y,z],[width,.28,height*.28],red);
}
function medical(b, large) {
  const w=large?27:13,d=large?12:8,h=large?17:14;
  b.box([0,0,h/2],[w,d,h],[146,149,139]);
  b.box([0,0,h-1],[w+1,d+1,2.4],[190,193,179]);
  b.box([0,0,1],[w+.5,d+.5,2],[86,91,82]);
  crossLabel(b,d/2+.15,h*.52,large?8:6,large?9:8);
  crossLabel(b,-d/2-.15,h*.52,large?8:6,large?9:8);
  for(const x of [-w*.31,w*.31])b.box([x,d/2+.25,h*.25],[1.5,.5,h*.4],[70,75,69]);
  if(large) {
    for(const x of [-3.5,3.5])b.box([x,0,h+1.3],[1.6,2,3],[73,79,73]);
    b.box([0,0,h+2.6],[8.5,2,1.4],[90,96,88]);
  }
}

function healthBottle(b, frame) {
  ell(b,[0,0,5.7],[5.4,4.5,5.7],[5,9,124],{segments:10,rings:5,emissive:.03+frame*.01});
  cyl(b,[0,0,8],[0,0,14],1.8,[4,11,151]);
  cyl(b,[0,0,13.5],[0,0,15.2],2.1,[11,24,169]);
  cyl(b,[0,0,15.2],[0,0,16.6],1.6,[109,118,81],{segments:6});
  ell(b,[-2.5,3.2,6.7],[.65,.35,2.4],[24,51,225],{segments:6,rings:3,emissive:.1});
}

function helmet(b) {
  ell(b,[0,0,7],[7,6,6],[109,110,99],{segments:10,rings:5});
  cyl(b,[0,0,3.3],[0,0,4.5],8,[65,68,60],{segments:10});
  b.box([0,5.7,3.2],[7.4,.4,4.4],[28,33,29]);
  for(const x of [-6.1,6.1])b.box([x,1.2,2.8],[2.2,5.2,5.6],[90,94,83]);
  // Follow the same faceted surface as the dome, so the crest touches it in profile.
  const band=[-2,-1,0,1,2].map(i=>[6*Math.sin(i*Math.PI/5)*Math.cos(Math.PI/10),7+6*Math.cos(i*Math.PI/5)]);
  for(let i=1;i<band.length;i++) {
    const [ay,az]=band[i-1],[by,bz]=band[i],dy=by-ay,dz=bz-az;
    b.box([0,(ay+by)/2,(az+bz)/2-.05],[1.3,Math.hypot(dy,dz),.55],[138,132,100],{rotation:[Math.atan2(dz,dy),0,0]});
  }
}

function armor(b, blue, frame) {
  const color=blue?[14,26,177]:[63,169,31], brighter=blue?[29,49,222]:[91,205,49], shadow=blue?[10,17,88]:[25,85,18];
  b.box([0,0,7],[17,7,12],color);
  b.box([0,3.8,8],[15,.9,10],brighter,{emissive:frame*.025});
  b.box([0,-3.9,8],[15,1,10],color);
  b.box([0,0,1.2],[17.5,7.4,2.4],shadow);
  for(const side of [-1,1]) {
    ell(b,[side*10.8,0,13.4],[5,4.4,3.6],brighter,{segments:10,rings:4});
    b.box([side*5.4,0,13.7],[4.7,7,3.5],color,{rotation:[0,side*.18,0]});
    b.box([side*6.6,4.5,9.7],[1.5,.7,10],shadow,{rotation:[0,side*.15,0]});
  }
  b.box([0,3.1,13.4],[4,.6,2.5],shadow);
}

// Stencilled lettering is extruded strokes, not a texture or sampled font.
const GLYPHS={A:[[0,0,1,4],[1,4,2,0],[.5,2,1.5,2]],M:[[0,0,0,4],[0,4,1,2],[1,2,2,4],[2,4,2,0]],
  O:[[0,0,0,4],[0,4,2,4],[2,4,2,0],[2,0,0,0]],S:[[2,4,0,4],[0,4,0,2],[0,2,2,2],[2,2,2,0],[2,0,0,0]],
  H:[[0,0,0,4],[2,0,2,4],[0,2,2,2]],E:[[0,0,0,4],[0,4,2,4],[0,2,1.6,2],[0,0,2,0]],L:[[0,4,0,0],[0,0,2,0]]};
function lettering(b, text, center, scale, color) {
  const start=center[0]-(text.length*3-1)*scale/2;
  [...text].forEach((character,i)=>{
    for(const [ax,az,bx,bz] of GLYPHS[character]||[]) {
      const dx=(bx-ax)*scale,dz=(bz-az)*scale;
      b.box([start+(i*3+(ax+bx)/2)*scale,center[1],center[2]+(az+bz)*scale/2],[.43*scale,.26,Math.hypot(dx,dz)+.28*scale],color,{rotation:[0,Math.atan2(dx,dz),0]});
    }
  });
}
function clip(b) {
  b.box([0,0,4.5],[6,3.6,9],[84,91,85]);
  b.box([0,0,.8],[7,4.1,1.6],[50,56,51]);
  for(const x of [-2,0,2]) {
    b.box([x,1.95,4.8],[.55,.3,6.5],[36,42,37]);
    cyl(b,[x,0,8.5],[x,0,10.2],.8,brass,{segments:6});
    b.cone([x,0,10.2],[x,0,11.1],.8,[207,169,83],{segments:6});
  }
}
function ammoBox(b) {
  b.box([0,0,6.5],[28,12,13],[54,72,27]);
  b.box([0,0,14.1],[30,14,3.2],[79,96,40]);
  b.box([0,6.3,12.8],[2.2,.65,3.5],[140,137,95]);
  lettering(b,'AMMO',[0,6.2,3.8],1.2,[150,127,66]);
  for(const x of [-13,13])b.box([x,0,6.2],[1,12.5,11],[43,57,22]);
}
function shell(b,x,y,z,scale=1) {
  cyl(b,[x,y,z],[x,y,z+5*scale],1.25*scale,[162,20,8],{segments:6});
  cyl(b,[x,y,z+5*scale],[x,y,z+7*scale],1.3*scale,[214,166,51],{segments:6});
  cyl(b,[x,y,z+6.9*scale],[x,y,z+7.2*scale],.55*scale,[117,80,23],{segments:5});
}
function shells(b) { for(const x of [-4.5,-1.5,1.5,4.5])shell(b,x,0,0); }
function shellBox(b) {
  b.box([0,0,5],[32,11,10],[114,117,107]);
  b.box([0,0,10.4],[32,11.4,1.6],[154,157,142]);
  b.box([10.5,0,8],[10.4,11.5,6],[123,85,39]);
  lettering(b,'SHELLS',[-5,5.7,2.6],1,[40,45,39]);
  for(let i=0;i<3;i++)shell(b,7.5+i*3,0,9,.72);
}

function corpse(b, family) {
  ell(b,[0,0,.45],[family==='POL5'?27:25,9,.45],[112,7,3],{segments:12,rings:3});
  if(family==='PLAYN') {
    ell(b,[0,0,4.8],[10,5,4.5],[58,122,28]);
    ell(b,[13,0,4.3],[4,3.5,3.6],[161,128,89]);
    ell(b,[13,-1,6],[4.4,3.6,2],[53,98,24]);
    for(const side of [-1,1]) {
      cyl(b,[-5,side*3,4],[-20,side*4,3],2.5,[49,104,23],{segments:6});
      ell(b,[-23,side*4,2.4],[4.5,2.7,2.4],dark,{segments:6,rings:3});
      cyl(b,[5,side*4,4],[13,side*8,2.4],2,[147,96,56],{segments:6});
    }
    ell(b,[6,2,4],[5,3,2.8],red,{segments:8,rings:3});
  } else {
    for(let i=0;i<6;i++) {
      const x=-17+i*6.1,y=Math.sin(i*2)*3.7;
      ell(b,[x,y,1.4+(i%3)*.7],[3.8,3,1.4+(i%3)*.7],i%2?red:[91,5,3],{segments:6,rings:3});
    }
    if(family==='PLAYW') {
      ell(b,[-4,0,5.5],[7,4.5,5.5],[135,21,7],{segments:8,rings:4});
      ell(b,[18,1,4],[3.8,3.2,3.4],[160,109,69],{segments:8,rings:3});
      for(const side of [-1,1]) {
        cyl(b,[-7,side*3,3],[-18,side*5,4],2.3,[48,109,23],{segments:6});
        ell(b,[-22,side*5,2.8],[4,2.6,2.8],dark,{segments:6,rings:3});
        cyl(b,[-3,side*3,6],[-5,side*5,14],.9,[195,166,125],{segments:5});
      }
    }
  }
}

function shotgunBody(b,{view=false,pump=0}={}) {
  if(!view) {
    b.box([0,-18,3.6],[5.8,17,6.2],wood,{rotation:[.12,0,0]});
    b.box([0,-25.4,3.4],[7,2.2,7],[49,33,20]);
    b.box([0,-4,5.7],[4.2,12,4.3],[56,61,58]);
    cyl(b,[0,1,6.3],[0,33,6.3],1.35,[56,61,60],{segments:10});
    cyl(b,[0,0,3.8],[0,19,3.8],1,[40,46,43]);
    cyl(b,[0,8,3.8],[0,17,3.8],2.25,wood);
    for(let i=0;i<5;i++)cyl(b,[0,8.5+i*1.6,3.8],[0,9.1+i*1.6,3.8],2.36,[64,40,22]);
    b.box([0,31.5,7.8],[.7,1.3,.8],[123,129,119]);
    for(const [a,c] of [[[0,-7,3.2],[0,-7,.7]],[[0,-7,.7],[0,-2,.7]],[[0,-2,.7],[0,-2,3.2]]])cyl(b,a,c,.4,dark,{segments:4});
  } else {
    b.box([0,12,-15],[4.3,12,5],[57,37,23],{rotation:[.3,0,0]});
    b.box([0,21,-10],[3.8,9,4.4],[27,32,29]);
    b.box([0,21,-7.7],[3.2,8.5,.5],[48,53,49]);
    cyl(b,[0,24,-7.7],[0,43,-6.8],1.15,[35,40,38],{segments:10});
    cyl(b,[0,23,-10.1],[0,37,-9.5],.9,[43,48,43]);
    cyl(b,[0,26+pump,-10.2],[0,34+pump,-9.8],2,wood);
    for(let i=0;i<5;i++)cyl(b,[0,26.5+pump+i*1.45,-10.2+i*.07],[0,27.1+pump+i*1.45,-10.2+i*.07],2.08,[65,39,19]);
    b.box([0,42,-5.4],[.6,.9,.6],[132,138,126]);
    b.box([1.95,21,-9.8],[.18,4,1.6],[12,16,14]);
  }
}

function flame(b, center, radius, frame, barrelBlast=false) {
  const fade=frame/4,bright=frame<2?[255,205,68]:frame<4?[232,75,7]:[157,24,3];
  ell(b,center,[radius*.72,radius*.72,radius*.85],bright,{segments:10,rings:5,emissive:1});
  for(let i=0;i<5;i++) {
    const angle=i*TAU/5+frame*.4,offset=radius*.59;
    const z=center[2]+Math.sin(angle*2)*radius*.34;
    ell(b,[center[0]+Math.cos(angle)*offset,center[1]+Math.sin(angle)*offset,z],
      [radius*.48,radius*.5,radius*.57],i%2?[224-70*fade,39,3]:[255-80*fade,104-70*fade,7],{segments:8,rings:4,emissive:1});
  }
  if(barrelBlast)for(let i=0;i<4;i++) {
    const a=i*TAU/4+frame*.3;
    b.box([Math.cos(a)*radius*.82,Math.sin(a)*radius*.82,Math.max(2,center[2]+Math.sin(a*3)*radius*.5)],[3,1.3,8],i%2?steel:[87,101,48],{rotation:[a*.2,a,frame]});
  }
}

function objectBuild(family, frame, key) {
  const b=new MeshBuilder();
  if(family==='BAR1')barrel(b,frame);
  else if(family==='COLU')columnLamp(b);
  else if(family==='ELEC')techColumn(b);
  else if(family==='CBRA')candelabrum(b,frame);
  else if(family==='STIM'||family==='MEDI')medical(b,family==='MEDI');
  else if(family==='BON1')healthBottle(b,frame);
  else if(family==='BON2')helmet(b);
  else if(family==='ARM1'||family==='ARM2')armor(b,family==='ARM2',frame);
  else if(family==='CLIP')clip(b);
  else if(family==='AMMO')ammoBox(b);
  else if(family==='SHEL')shells(b);
  else if(family==='SBOX')shellBox(b);
  else if(family==='SHOT') {const gun=new MeshBuilder();shotgunBody(gun);b.add(gun.finish('pickup-shotgun'),{rotation:[0,0,-Math.PI/2]});}
  else if(['PLAYW','PLAYN','POL5'].includes(family))corpse(b,family);
  else if(family==='BAL1')flame(b,[0,0,0],frame<2?7.3:13+(frame-2)*4,frame,false);
  else if(family==='BEXP') {
    if(frame===0) {barrel(b);ell(b,[0,0,31],[5,5,5],[255,155,21],{segments:8,rings:4,emissive:1});}
    else flame(b,[0,0,17+frame*2],10+frame*4,frame,true);
  }
  else return null;
  const mesh=b.finish(key);return family==='BAL1'?mesh:grounded(mesh);
}

/** Fixed geometry is shared across positions, angles and camera orientations. */
export function objectMesh(entity, time=0) {
  if(!entity||entity.removed||entity.enemy)return null;
  const sprite=String(entity.sprite||'').toUpperCase();
  let family=sprite.startsWith('PLAY')?sprite.slice(0,5):sprite.slice(0,4);
  if(!family)family=entity.projectile?'BAL1':TYPES[entity.type];
  if(entity.barrel&&entity.state==='exploding')family='BEXP';
  let frame=0;
  if(family==='BEXP')frame=clamp(sprite.startsWith('BEXP')?sprite.charCodeAt(4)-65:Math.floor((entity.stateTime||0)*10),0,4);
  else if(family==='BAL1')frame=clamp(sprite.startsWith('BAL1')?sprite.charCodeAt(4)-65:entity.alive===false?2:0,0,4);
  else if(['BAR1','BON1','ARM1','ARM2'].includes(family))frame=clamp((sprite.charCodeAt(4)||65)-65,0,family==='BON1'?3:1);
  else if(family==='CBRA')frame=Math.floor((Number.isFinite(time)?Math.max(0,time):0)*8)%4;
  if(!FAMILIES.has(family))return null;
  const key=`object:${family}:${frame}`;
  return remembered(key,()=>objectBuild(family,frame,key));
}

function handMesh(gloved=true) {
  return remembered(`hand:${gloved}`,()=>{
    const b=new MeshBuilder(),skin=gloved?[154,96,49]:[186,124,76],light=gloved?[179,119,67]:[207,151,99];
    ell(b,[0,0,0],[3.7,4.1,2.5],skin,{segments:10,rings:4});
    for(const x of [-2.7,-.9,.9,2.7]) {
      ell(b,[x,2.6,.7],[1.05,1.6,1.5],light,{segments:6,rings:3});
      cyl(b,[x,3.7,.1],[x,3.4,-2.3],.8,skin,{segments:5});
    }
    ell(b,[3.4,-.1,-.3],[1.7,2.8,1.4],light,{segments:6,rings:3,rotation:[0,0,-.35]});
    cyl(b,[0,-4,-.7],[0,-16,-4.6],3.1,[151,95,54],{segments:8,topRadius:4.1});
    if(gloved)for(let i=0;i<3;i++)cyl(b,[0,-4.7-i*.9,-.7-i*.3],[0,-5.1-i*.9,-.9-i*.3],3.45,[105,62,30],{segments:6});
    else {
      b.box([0,3.1,1.9],[5.5,1.2,.8],[75,78,72]);
      for(const x of [-1.8,0,1.8])ell(b,[x,3.1,2.4],[.7,.75,.6],[133,134,119],{segments:5,rings:3});
    }
    return b.finish(`hand:${gloved}`);
  });
}

function pistolBase() {
  return remembered('weapon:pistol:base',()=>{
    const b=new MeshBuilder();
    b.box([0,22,-12.5],[3.3,4.2,7],[42,35,24],{rotation:[-.2,0,0]});
    ell(b,[0,27,-7.3],[2.2,7.5,2.1],[29,34,31],{segments:10,rings:5});
    ell(b,[0,20.4,-7.4],[2.3,2.1,2.3],[22,27,24],{segments:10,rings:4});
    cyl(b,[0,28,-7.2],[0,37,-6.8],1.5,[44,50,47],{segments:10,topRadius:1.2});
    cyl(b,[0,36.9,-6.8],[0,37.15,-6.8],.8,[10,14,12],{segments:10});
    for(const side of [-1,1]) {
      b.box([side*1.8,27,-6.3],[.24,9,.4],[99,105,95]);
      b.box([side*1.05,21.2,-5.1],[.5,.9,.7],[94,102,91]);
    }
    b.box([0,35,-5.2],[.45,.9,.6],[141,147,131]);
    b.box([2.2,28,-7.5],[.16,2.5,.9],[9,13,11]);
    b.add(handMesh(true),{translation:[0,22,-10.8],rotation:[.10,0,.08]});
    return b.finish('weapon:pistol:base');
  });
}

function muzzleFlash(b,center,large) {
  ell(b,[center[0],center[1]+1.5,center[2]],[large?3.7:2.5,2,large?3.7:3],[255,239,151],{segments:8,rings:4,emissive:1});
  for(let i=0;i<4;i++) {
    const a=i*TAU/4+.2,r=large?5.2:3.7;
    b.cone([center[0],center[1]+.4,center[2]],[center[0]+Math.cos(a)*r,center[1]+(large?7:5),center[2]+Math.sin(a)*r],large?2.1:1.4,[255,113,14],{segments:5,emissive:1});
  }
  b.cone([center[0],center[1],center[2]],[center[0],center[1]+(large?9:7),center[2]],large?2:1.4,[255,249,187],{segments:6,emissive:1});
}

/** Phase is seconds since the shot. Infinity, a negative value or a completed cycle is idle. */
export function weaponMesh(kind='pistol', phase=Infinity) {
  if(!['pistol','shotgun','fist'].includes(kind))return null;
  const duration=kind==='shotgun'?.65:kind==='fist'?.4:.3;
  const active=Number.isFinite(phase)&&phase>=0&&phase<duration;
  const tick=active?Math.floor(phase*60):-1,t=tick<0?Infinity:tick/60,key=`weapon:${kind}:${tick}`;
  return remembered(key,()=>{
    const b=new MeshBuilder();
    if(kind==='pistol') {
      const recoil=t<.3?Math.exp(-t*15):0,gun=new MeshBuilder().add(pistolBase());
      if(t<.08)muzzleFlash(gun,[0,37.2,-6.8],false);
      b.add(gun.finish('pistol-pose'),{translation:[0,-2.5*recoil,.6*recoil],rotation:[.12*recoil,0,0]});
    } else if(kind==='shotgun') {
      const lift=t>.1&&t<.6?Math.sin((t-.1)/.5*Math.PI):0;
      const pump=t>.2&&t<.5?-5*Math.sin((t-.2)/.3*Math.PI):0;
      const recoil=t<.1?Math.exp(-t*19):0,gun=new MeshBuilder();
      shotgunBody(gun,{view:true,pump});
      gun.add(handMesh(true),{translation:[2.6,22,-11.5],rotation:[.08,0,-.16]});
      gun.add(handMesh(true),{translation:[-2.7,29+pump,-11],rotation:[.25,0,.3],scale:.85});
      if(t<.08)muzzleFlash(gun,[0,43,-6.8],true);
      b.add(gun.finish('shotgun-pose'),{translation:[-7*lift,-2*recoil,-1.5*lift],rotation:[.7*lift+.08*recoil,0,.1*lift]});
    } else {
      const extension=t<.12?Math.sin(t/.12*Math.PI/2):t<.36?1-(t-.12)/.24:0;
      b.add(handMesh(false),{translation:[3-5*extension,25+17*extension,-13+6.5*extension],rotation:[-.12+.18*extension,.14*(1-extension),-.25+.3*extension],scale:1.12});
    }
    return b.finish(key);
  });
}

export function proceduralObjectCacheStats() { return {entries:cache.size,limit:CACHE_LIMIT,bytes:[...cache.values()].reduce((sum,mesh)=>sum+mesh.vertices.byteLength,0)}; }
