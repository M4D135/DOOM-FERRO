/** Mechanical weapons and articulated hands; generated from shared solid parts. */
import {MeshBuilder,rotateEuler} from './procedural-mesh.js';

const cache=new Map(),parts=new Map(),LIMIT=64,BYTE_LIMIT=20*1024*1024;
let bytes=0;
const DARK=[23,28,26],STEEL=[77,85,80],EDGE=[135,145,132],WOOD=[104,62,27],LEATHER=[151,94,46],SKIN=[185,124,76];
const TAU=Math.PI*2;
function remember(key,make){
 if(parts.has(key))return parts.get(key);
 if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);return v;}
 const m=make();while(cache.size&&(cache.size+parts.size>=LIMIT||bytes+m.vertices.byteLength>BYTE_LIMIT)){const k=cache.keys().next().value;bytes-=cache.get(k).vertices.byteLength;cache.delete(k);}if(bytes+m.vertices.byteLength>BYTE_LIMIT)throw new Error('Weapon parts exceed memory budget');
 (key.startsWith('part:')?parts:cache).set(key,m);bytes+=m.vertices.byteLength;return m;
}
/** Compose immutable parts in linear typed-array passes: no primitive rebuild per pose. */
function poseMesh(key,sources,rotation=[0,0,0],translation=[0,0,0]){
 const vertices=new Float32Array(sources.reduce((n,p)=>n+p.mesh.vertices.length,0)),axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotateEuler(v,rotation));
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let offset=0;
 for(const{mesh,shift=[0,0,0]}of sources){vertices.set(mesh.vertices,offset);const end=offset+mesh.vertices.length;
  for(let i=offset;i<end;i+=17){const x=vertices[i]+shift[0],y=vertices[i+1]+shift[1],z=vertices[i+2]+shift[2],nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5];
   for(let k=0;k<3;k++){vertices[i+k]=translation[k]+axes[0][k]*x+axes[1][k]*y+axes[2][k]*z;vertices[i+3+k]=axes[0][k]*nx+axes[1][k]*ny+axes[2][k]*nz;min[k]=Math.min(min[k],vertices[i+k]);max[k]=Math.max(max[k],vertices[i+k]);}
  }offset=end;
 }return{key,vertices,stride:17,triangles:vertices.length/51,bounds:{min,max}};
}
const ell=(b,p,r,c,material='skin',segments=14,rings=6,extra={})=>b.ellipsoid(p,r,c,{segments,rings,material,...extra});
const line=(b,a,z,r,c,material='metal',segments=8)=>b.cylinder(a,z,r,c,{segments,material});
const box=(b,p,s,c,bevel=.25,material='metal',extra={})=>b.roundedBox(p,s,Math.min(bevel,...s.map(v=>v*.42)),c,{material,bevelSegments:1,...extra});
function screw(b,p,r=.28,rotation=[0,0,0]){
 const s=new MeshBuilder();s.cylinder([0,0,-.1],[0,0,.1],r,EDGE,{segments:8,material:'metal'});s.box([0,0,.12],[r*1.45,.085,.05],DARK,{material:'metal'});b.add(s.finish('screw'),{translation:p,rotation});
}
function ring(b,p,r,t,c,rotation=[0,0,0],segments=20){b.torus(p,r,t,c,{segments,sections:4,rotation,material:'metal'});}
function tubePath(b,points,radii,c,material='skin',segments=10){
 for(let i=1;i<points.length;i++)b.tube(points[i-1],points[i],[[0,radii[i-1],radii[i-1]*.88],[.4,(radii[i-1]+radii[i])*.5,(radii[i-1]+radii[i])*.44],[1,radii[i],radii[i]*.88]],c,{segments,material,smoothProfile:true});
}
function forearm(b,from,to,gloved=true,thickness=1){
 const end=from.map((v,i)=>v+4*(to[i]-v));
 // Continue behind the camera so a punch never exposes a cut-off arm end.
 b.tube(from,end,[[0,2.5,2.15],[.045,2.8,2.4],[.1375,3.7,3.0],[.25,4.65,3.8],[.55,5.5,4.5],[1,6.6,5.3]].map(([t,x,y])=>[t,x*thickness,y*thickness]),SKIN,{segments:16,material:'skin',smoothProfile:true});
 const t=(u)=>from.map((x,i)=>x+(to[i]-x)*u);
 if(gloved){
  b.tube(from,t(.3),[[0,2.65,2.35],[.2,3.0,2.5],[.65,3.2,2.6],[1,3.25,2.6]],LEATHER,{segments:16,material:'leather',smoothProfile:true});
  for(let n=0;n<3;n++){const p=t(.06+n*.07),q=t(.077+n*.07);b.tube(p,q,[[0,2.85+n*.13,2.45+n*.05],[.5,3.0+n*.13,2.56+n*.05],[1,2.88+n*.13,2.48+n*.05]],[126+n*6,76+n*4,36+n*2],{segments:16,material:'leather'});}
 }
}

/** Right hand wrapped around a vertical grip: fingers curl in front of +Y. */
function gripHand(){return remember('part:grip-hand',()=>{
 const b=new MeshBuilder(),light=[170,110,60],crease=[103,60,29];
 ell(b,[1.15,-.7,-.25],[2.85,1.6,3.05],LEATHER,'leather',16,8);
 ell(b,[1.25,-.15,-2.6],[2.3,1.55,1.7],LEATHER,'leather',12,5);
 for(let i=0;i<4;i++){
  const z=2.3-i*1.5,r=.74-i*.035;
  const points=[[2.5,-.5,z],[3.1,1.0,z],[2.5,2.8,z-.25],[.7,3.1,z-.45],[-.2,2.5,z-.55]];
  tubePath(b,points,[r,r*.98,r*.87,r*.8,r*.58],light,'leather',10);
  ell(b,points[1],[r*1.03,r*.95,r*.95],light,'leather',10,5);
  for(const p of [points[1],points[2]])line(b,[p[0]-.36,p[1]-.23,p[2]+r*.82],[p[0]+.36,p[1]-.23,p[2]+r*.82],.065,crease,'leather',5);
 }
 tubePath(b,[[.2,-1.5,2.0],[-1.5,-.6,2.6],[-2,1.1,2.1],[-1.5,2.4,1.1]],[1.05,.92,.8,.57],light,'leather',12);
 ell(b,[-1.4,-.5,2.2],[1.1,.9,1.35],LEATHER,'leather',12,5);
 // Short irregular folds follow the knuckles rather than drawing a glove symbol.
 for(let i=0;i<5;i++)line(b,[-.3+i*.45,-2.17,.8-i*.5],[.7+i*.35,-2.21,.6-i*.5],.055,i%2?crease:[180,116,63],'leather',5);
 forearm(b,[1.3,-3.2,-3.5],[.6,-17,-9.2],true);
 return b.finish('part:grip-hand');
});}

function fistHand(){return remember('part:fist-hand',()=>{
 const b=new MeshBuilder(),light=[202,141,88],crease=[132,78,43];
 ell(b,[0,0,-.1],[3.25,3.25,1.85],SKIN,'skin',18,8);
 for(let i=0;i<4;i++){
  const x=-2.35+i*1.55,r=.84-((i===3)?.1:0),start=[x,1.5,.8],knuckle=[x,3.0,1.0],mid=[x,4.1,-.15],tip=[x,2.7,-1.6];
  tubePath(b,[start,knuckle,mid,tip],[r,r*.98,r*.9,r*.7],SKIN,'skin',12);
  ell(b,knuckle,[r*1.06,r*.98,r*.95],light,'skin',12,6);
  for(const dy of [-.22,.22])line(b,[x-.43,3.1+dy,1.72],[x+.43,3.1+dy,1.72],.055,crease,'skin',5);
  line(b,[x*.7,-1.8,1.45],[x,2.25,1.75],.08,[211,151,94],'skin',5);
 }
 tubePath(b,[[2.8,-.4,-.1],[3.5,1.7,-.5],[2.3,3.3,-1.3],[.8,3.3,-1.4]],[1.1,.94,.8,.6],SKIN,'skin',12);
 ell(b,[2.8,.35,-.6],[1.4,1.8,1.25],SKIN,'skin',12,6);
 forearm(b,[0,-2.8,-.4],[16,-16,-15],false,.78);
 return b.finish('part:fist-hand');
});}

function guard(b,p,size,c=DARK,detail=2){
 // A real opening enclosed by a shallow rectangular loop.
 const [x,y,z]=p,[w,l,h]=size,t=.32;
 box(b,[x-w/2,y,z],[t,l,h],c,.12);
 box(b,[x+w/2,y,z],[t,l,h],c,.12);
 box(b,[x,y-l/2,z],[w,t,h],c,.12);
 box(b,[x,y+l/2,z],[w,t,h],c,.12);
 if(detail===2)box(b,[x,y,z+.25],[.45,l*.6,.9],STEEL,.15);
}

/** An annular muzzle with a recessed dark bore, not a disc painted on its end. */
function muzzle(b,from,to,z,outer,inner,segments=24){
 b.cylinder([0,from,z],[0,to,z],outer,[45,53,47],{segments,material:'metal',cap:false});
 const point=(r,y,i)=>[r*Math.cos(i*TAU/segments),y,z+r*Math.sin(i*TAU/segments)],back=from+.12;
 for(let i=0;i<segments;i++){
  const a=point(outer,to,i),c=point(outer,to,i+1),u=point(inner,to,i),v=point(inner,to,i+1),p=point(inner,back,i),q=point(inner,back,i+1);
  b.triangle(a,u,v,EDGE,{material:'metal'});b.triangle(a,v,c,EDGE,{material:'metal'});
  b.triangle(u,p,q,[26,30,27],{material:'metal'});b.triangle(u,q,v,[26,30,27],{material:'metal'});
  b.triangle([0,back,z],q,p,[5,8,6],{material:'metal'});
  b.triangle([0,from,z],point(outer,from,i),point(outer,from,i+1),DARK,{material:'metal'});
 }
}

function pistolBody(){return remember('part:pistol-body',()=>{
 const b=new MeshBuilder();
 // Rounded original profile, with a compact rear and a tapered forward slide.
 b.tube([0,19.8,-7.4],[0,34.7,-6.85],[[0,1.65,1.6],[.1,2.22,2.05],[.36,2.12,1.94],[.78,1.7,1.5],[1,1.42,1.28]],[31,38,35],{segments:20,material:'metal',smoothProfile:true});
 box(b,[0,22,-12.1],[3.05,4.15,7.6],[44,35,25],.7,'leather',{rotation:[-.2,0,0]});
 box(b,[0,23.5,-10],[3.1,7.9,1.9],DARK,.4);
 for(const side of [-1,1]){
  box(b,[side*1.56,21.7,-12.7],[.2,3.0,4.6],[56,44,29],.08,'leather',{rotation:[-.2,0,0]});
  for(let i=0;i<6;i++)line(b,[side*1.7,20.1+i*.48,-6.5],[side*1.84,20.2+i*.48,-8.9],.075,[94,103,91],'metal',6);
  box(b,[side*1.77,27.9,-6.2],[.24,8.5,.3],[112,123,109],.10);
  screw(b,[side*1.73,21.2,-12.7],.24,[0,Math.PI/2,0]);
 }
 // Chamber, extractor, sights and exposed rear hammer.
 box(b,[1.91,28.0,-7.0],[.16,3.1,1.2],[8,12,11],.10);
 box(b,[2.04,28.1,-7.0],[.13,2.5,.22],[121,131,119],.06);
 box(b,[0,20.2,-5.55],[2.2,.9,.7],DARK,.15);
 for(const x of [-.8,.8])box(b,[x,20.3,-4.98],[.35,.6,.5],[172,182,159],.08);
 box(b,[0,34.8,-5.2],[.36,1.0,.52],[157,167,148],.09);
 box(b,[0,19.5,-6.4],[.72,.7,1.3],[81,90,78],.15,{kind:'metal',roughness:.3});
 muzzle(b,34.4,37.05,-6.75,1.2,.82);
 ring(b,[0,37.15,-6.75],.96,.21,[130,140,123],[-Math.PI/2,0,0],24);
 // Trigger loop lies ahead of the grip with actual empty space between rails.
 for(const side of [-1,1]){line(b,[side*.95,25.1,-10.5],[side*.95,25.1,-13.3],.22,DARK);line(b,[side*.95,25.1,-13.3],[side*.95,28,-12.7],.22,DARK);line(b,[side*.95,28,-12.7],[side*.95,28,-10.0],.22,DARK);}
 line(b,[0,25.8,-10.0],[0,26.4,-12.2],.22,STEEL);
 return b.finish('part:pistol-body');
});}

function shotgunPump(detail=2){return remember(`part:shotgun-pump:${detail}`,()=>{
 const b=new MeshBuilder(),seg=[7,12,20][detail];
 b.tube([0,9,-1.35],[0,20,-1.35],[[0,1.9,1.8],[.12,2.28,2.05],[.88,2.28,2.05],[1,1.9,1.8]],WOOD,{segments:seg,material:'wood',smoothProfile:true});
 if(detail)for(let i=0;i<8;i++)ring(b,[0,10+i*1.2,-1.35],2.12,.13,[61,35,17],[-Math.PI/2,0,0],seg);
 return b.finish(`part:shotgun-pump:${detail}`);
});}
function shotgunBody(detail=2,includePump=true){return remember(`part:shotgun-body:${detail}:${includePump}`,()=>{
 const b=new MeshBuilder(),seg=[7,12,20][detail],high=detail===2;
 // One physical shotgun construction is used both in hand and on the floor.
 b.tube([0,-26,-3.6],[0,-7,-.7],[[0,3.4,3.7],[.12,3.1,3.55],[.44,2.55,2.7],[.78,1.6,1.7],[1,1.75,1.9]],WOOD,{segments:seg,material:'wood',smoothProfile:true});
 if(detail)box(b,[0,-25.9,-3.6],[6.8,1.15,7.2],[45,30,21],.6,'leather',{rotation:[.15,0,0]});
 (detail?box:(b,p,s,c)=>b.box(p,s,c,{material:'metal'}))(b,[0,-1,0],[4.7,12.5,4.7],[39,47,42],.7);
 b.tube([0,4.7,1.15],[0,37.7,1.15],[[0,1.45,1.45],[.2,1.25,1.25],[.85,1.1,1.1],[1,1.1,1.1]],[40,48,43],{segments:seg,material:'metal',cap:!high});
 line(b,[0,4.5,-1.35],[0,24,-1.35],.95,[43,50,43],'metal',seg);
 if(includePump)b.add(shotgunPump(detail));
 if(detail){
  box(b,[2.4,-.3,.25],[.15,5.6,2.0],[8,13,10],.1);
  box(b,[2.51,-.6,.65],[.15,4.6,.4],[112,123,108],.1);
  box(b,[0,-1,2.45],[2.7,11,.35],[88,99,86],.15);
  box(b,[0,36.4,2.45],[.65,1.2,.65],[166,176,151],.12);
  for(const y of [6.3,22.5])ring(b,[0,y,1.1],1.28,.12,[118,129,111],[-Math.PI/2,0,0],seg);
  for(const side of [-1,1]){line(b,[side*1.1,-5,-2.4],[side*1.1,-4.4,-5.1],.3,DARK);line(b,[side*1.1,-4.4,-5.1],[side*1.1,1.8,-4.3],.3,DARK);line(b,[side*1.1,1.8,-4.3],[side*1.1,2.0,-2.3],.3,DARK);}
  line(b,[0,-2.5,-2.3],[0,-1.6,-4.0],.28,STEEL);
 }
 if(high){
  muzzle(b,36.0,37.7,1.15,1.1,.78);ring(b,[0,37.8,1.15],.92,.19,[128,139,121],[-Math.PI/2,0,0],24);
  for(const side of [-1,1])for(const y of [-5,2])screw(b,[side*2.47,y,-.6],.28,[0,Math.PI/2,0]);
  line(b,[2.6,1.3,-.8],[3.5,1.3,-.8],.32,STEEL);ell(b,[3.65,1.3,-.8],[.55,.6,.55],[39,46,37],'metal',10,5);
  for(const side of [-1,1])for(let n=0;n<6;n++)line(b,[side*1.75,-10.5-n*.55,-.7],[side*1.95,-10.5-n*.55,-2.6],.07,[54,30,15],'wood',5);
 }
 return b.finish(`part:shotgun-body:${detail}:${includePump}`);
});}

export function worldShotgunMesh(detail=2){return shotgunBody(Math.max(0,Math.min(2,detail)),true);}

function flash(b,p,large){
 const r=large?3.7:2.5;ell(b,[p[0],p[1]+1,p[2]],[r*.8,2,r*.8],[255,241,163],'glow',12,6,{emissive:1});
 for(let i=0;i<5;i++){const a=i*TAU/5+.2;b.cone([p[0]+Math.cos(a)*.3,p[1]+.6,p[2]+Math.sin(a)*.3],[p[0]+Math.cos(a)*r*1.55,p[1]+r*2.1,p[2]+Math.sin(a)*r*1.55],r*.4,[255,135+i*11,24],{segments:7,material:'glow',emissive:1});}
 b.cone(p,[p[0],p[1]+r*2.7,p[2]],r*.7,[255,251,208],{segments:8,material:'glow',emissive:1});
}

function pistolRig(){return remember('part:pistol-rig',()=>new MeshBuilder().add(pistolBody()).add(gripHand(),{translation:[-.7,20.5,-11.6],rotation:[.03,0,.035]}).finish('part:pistol-rig'));}
function shotgunRig(){return remember('part:shotgun-rig',()=>new MeshBuilder().add(shotgunBody(2,false),{translation:[0,23,-8.6],scale:.73}).add(gripHand(),{translation:[-.7,20.1,-12.3],rotation:[.22,0,-.06],scale:.95}).finish('part:shotgun-rig'));}
function pumpRig(){return remember('part:pump-rig',()=>new MeshBuilder().add(shotgunPump(2),{translation:[0,23,-8.6],scale:.73}).add(gripHand(),{translation:[-1.15,33.5,-12.5],rotation:[Math.PI/2,0,Math.PI],scale:.82}).finish('part:pump-rig'));}
function flashMesh(kind){return remember('part:flash:'+kind,()=>{const b=new MeshBuilder();flash(b,kind==='pistol'?[0,37.2,-6.75]:[0,50.5,-7.75],kind==='shotgun');return b.finish('part:flash:'+kind);});}

/** Quantised articulated poses are bounded in time and memory (30 samples/sec). */
export function weaponMesh(kind='pistol',phase=Infinity){
 if(!['pistol','shotgun','fist'].includes(kind))return null;
 const duration=kind==='shotgun'?.65:kind==='fist'?.4:.3;
 const tick=Number.isFinite(phase)&&phase>=0&&phase<duration?Math.floor(phase*30):-1,t=tick<0?Infinity:tick/30,key=`weapon:${kind}:${tick}`;
 return remember(key,()=>{
  if(kind==='pistol'){
   const sources=[{mesh:pistolRig()}];if(t<.08)sources.push({mesh:flashMesh(kind)});const recoil=t<.3?Math.exp(-t*15):0;
   return poseMesh(key,sources,[.12*recoil,0,0],[0,-2.5*recoil,.6*recoil]);
  }else if(kind==='shotgun'){
   const lift=t>.1&&t<.6?Math.sin((t-.1)/.5*Math.PI):0,pump=t>.2&&t<.5?-5*Math.sin((t-.2)/.3*Math.PI):0,recoil=t<.1?Math.exp(-t*19):0;
   const sources=[{mesh:shotgunRig()},{mesh:pumpRig(),shift:[0,pump*.73,0]}];if(t<.08)sources.push({mesh:flashMesh(kind)});
   const rotation=[.7*lift+.08*recoil,0,.1*lift],pivot=[0,18,-11],rotated=rotateEuler(pivot,rotation);
   return poseMesh(key,sources,rotation,[-7*lift-rotated[0],18-2*recoil-rotated[1],-11-1.5*lift-rotated[2]]);
  }else{
   const extension=t<.12?Math.sin(t/.12*Math.PI/2):t<.36?1-(t-.12)/.24:0;
   return poseMesh(key,[{mesh:fistHand()}],[-.12+.18*extension,.14*(1-extension),-.25+.3*extension],[3-5*extension,25-4*extension,-13+8.5*extension]);
  }
 });
}
export function weaponCacheStats(){let staticBytes=0;for(const mesh of parts.values())staticBytes+=mesh.vertices.byteLength;return{entries:cache.size+parts.size,limit:LIMIT,bytes,byteLimit:BYTE_LIMIT,staticParts:parts.size,staticBytes,poses:cache.size};}
