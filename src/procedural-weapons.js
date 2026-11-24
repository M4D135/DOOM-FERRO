/** Mechanical weapons and articulated hands; generated from shared solid parts. */
import {MeshBuilder,rotateEuler} from './procedural-mesh.js';
import {implicitMesh,smoothUnion,ellipsoidDistance,capsuleDistance,roundedBoxDistance,bendSculpt,loft} from './procedural-object-sculpt.js';
import {ageSurface} from './procedural-object-finish.js';

const cache=new Map(),parts=new Map(),LIMIT=64,BYTE_LIMIT=20*1024*1024;
let bytes=0;
const DARK=[20,23,24],STEEL=[70,77,79],EDGE=[131,140,140],WOOD=[103,61,28],LEATHER=[121,98,73],SKIN=[165,125,101];
const TAU=Math.PI*2;
function remember(key,make){
 if(parts.has(key))return parts.get(key);
 if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);return v;}
 const m=make();if(key.startsWith('part:'))ageSurface(m,'weapon');while(cache.size&&(cache.size+parts.size>=LIMIT||bytes+m.vertices.byteLength>BYTE_LIMIT)){const k=cache.keys().next().value;bytes-=cache.get(k).vertices.byteLength;cache.delete(k);}if(bytes+m.vertices.byteLength>BYTE_LIMIT)throw new Error('Weapon parts exceed memory budget');
 (key.startsWith('part:')?parts:cache).set(key,m);bytes+=m.vertices.byteLength;return m;
}
/** Compose immutable parts in linear typed-array passes: no primitive rebuild per pose. */
function poseMesh(key,sources,rotation=[0,0,0],translation=[0,0,0]){
 const vertices=new Float32Array(sources.reduce((n,p)=>n+p.mesh.vertices.length,0));
 let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,offset=0;
 for(const{mesh,shift=[0,0,0],rotation:localRotation=[0,0,0],scale=1}of sources){
  vertices.set(mesh.vertices,offset);const end=offset+mesh.vertices.length,
   basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotateEuler(rotateEuler(v,localRotation),rotation)),
   origin=rotateEuler(shift,rotation),tx=origin[0]+translation[0],ty=origin[1]+translation[1],tz=origin[2]+translation[2],
   [xx,xy,xz]=basis[0],[yx,yy,yz]=basis[1],[zx,zy,zz]=basis[2];
  // Compose the local and animated transforms once per part, not per vertex.
  for(let i=offset;i<end;i+=17){
   const px=vertices[i],py=vertices[i+1],pz=vertices[i+2],nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5],
    x=tx+scale*(xx*px+yx*py+zx*pz),y=ty+scale*(xy*px+yy*py+zy*pz),z=tz+scale*(xz*px+yz*py+zz*pz);
   vertices[i]=x;vertices[i+1]=y;vertices[i+2]=z;
   vertices[i+3]=xx*nx+yx*ny+zx*nz;vertices[i+4]=xy*nx+yy*ny+zy*nz;vertices[i+5]=xz*nx+yz*ny+zz*nz;
   if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
  }offset=end;
 }
 return{key,vertices,stride:17,triangles:vertices.length/51,bounds:{min:[minX,minY,minZ],max:[maxX,maxY,maxZ]}};
}

const ell=(b,p,r,c,material='skin',segments=14,rings=6,extra={})=>b.ellipsoid(p,r,c,{segments,rings,material,...extra});
const line=(b,a,z,r,c,material='metal',segments=8)=>b.cylinder(a,z,r,c,{segments,material});
const box=(b,p,s,c,bevel=.25,material='metal',extra={})=>b.roundedBox(p,s,Math.min(bevel,...s.map(v=>v*.42)),c,{material,bevelSegments:2,...extra});
function screw(b,p,r=.28,rotation=[0,0,0]){
 const s=new MeshBuilder();s.cylinder([0,0,-.1],[0,0,.1],r,EDGE,{segments:8,material:'metal'});s.box([0,0,.12],[r*1.45,.085,.05],DARK,{material:'metal'});b.add(s.finish('screw'),{translation:p,rotation});
}
function ring(b,p,r,t,c,rotation=[0,0,0],segments=20){b.torus(p,r,t,c,{segments,sections:4,rotation,material:'metal'});}
/** Forged flat-section trigger guard: a continuous hollow loop in the YZ plane. */
function triggerGuard(b,p,ry,rz,width,thickness,segments=32){
 const exponent=.72,point=(i,inner,side)=>{
  const angle=i*TAU/segments,cy=Math.cos(angle),sz=Math.sin(angle);
  return[p[0]+side*width/2,p[1]+Math.sign(cy)*Math.abs(cy)**exponent*(ry-inner*thickness),p[2]+Math.sign(sz)*Math.abs(sz)**exponent*(rz-inner*thickness)];
 };
 const quad=(a,c,d,e,normal)=>{const opts={material:{kind:'metal',roughness:.37},normals:[normal,normal,normal]};
  const u=c.map((v,k)=>v-a[k]),v=d.map((x,k)=>x-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(n.reduce((s,x,k)=>s+x*normal[k],0)<0)[c,e]=[e,c];b.triangle(a,c,d,DARK,opts);b.triangle(a,d,e,DARK,opts);
 };
 for(let i=0;i<segments;i++){
  const angle=(i+.5)*TAU/segments;
  for(const side of[-1,1])quad(point(i,0,side),point(i+1,0,side),point(i+1,1,side),point(i,1,side),[side,0,0]);
  for(const inner of[0,1])quad(point(i,inner,-1),point(i+1,inner,-1),point(i+1,inner,1),point(i,inner,1),[0,Math.cos(angle)*(inner?-1:1),Math.sin(angle)*(inner?-1:1)]);
 }
}

function forearm(b,from,to,gloved=true,thickness=1){
 const end=from.map((v,i)=>v+3.8*(to[i]-v));
 const rows=[[...from,1.68*thickness,1.32*thickness],
  ...[.08,.25,.6,1].map(t=>[...from.map((v,i)=>v+(end[i]-v)*t),(1.7+t*3.6)*thickness,(1.35+t*2.6)*thickness])];
 loft(b,rows,SKIN,{segments:20,steps:22,material:{kind:'skin',roughness:.64,scale:1},displace:(angle,t)=>
  .012*Math.sin(angle*3+t*2)*Math.sin(Math.PI*t)+.009*Math.cos(angle*7-t*17)*Math.exp(-t*13)});
 if(gloved){
  const cuffEnd=from.map((v,i)=>v+(to[i]-v)*.22);
  loft(b,[[...from,1.85*thickness,1.52*thickness],[...cuffEnd,2.02*thickness,1.63*thickness]],LEATHER,
   {segments:28,steps:10,material:{kind:'leather',roughness:.78},displace:(angle,t)=>.009*Math.sin(t*18+Math.sin(angle*2)*1.4)*Math.sin(Math.PI*t)});
 }
}

/** One blended field joins the palm, metacarpals, thumb and bent fingers.
 * The visible skin has no sphere/tube junctions. A matching empty grip volume
 * makes the inner hand concave around the actual pistol handle. */
function gripHand(){return remember('part:grip-hand',()=>{
 const bones=[],add=(a,z,r1,r2=r1)=>bones.push([a,z,r1,r2]);
 for(let i=0;i<4;i++){
  const z=2.0-i*1.22,r=.53-i*.026;
  const p=[[2.18,-.34,z],[2.92,.62,z-.04],[2.45,1.88,z-.12],[.75,2.27,z-.21],[-.23,1.85,z-.30]];
  for(let n=1;n<p.length;n++)add(p[n-1],p[n],r*(1-(n-1)*.07),r*(1-n*.07));
 }
 const thumb=[[.65,-1.0,1.1],[-.60,-.58,1.65],[-1.22,.55,1.53],[-1.02,1.66,.65]];
 for(let i=1;i<thumb.length;i++)add(thumb[i-1],thumb[i],.68-i*.035,.63-i*.035);

 const distance=(x,y,z)=>{
  let d=ellipsoidDistance(x,y,z,[1.42,-.72,-.33],[1.86,1.08,2.65]);
  d=smoothUnion(d,ellipsoidDistance(x,y,z,[.45,-.52,-.36],[.96,.98,1.54]),.54);
  d=smoothUnion(d,ellipsoidDistance(x,y,z,[1.58,-.89,-2.4],[1.36,.96,1.45]),.6);
  for(const [a,b,ra,rb]of bones)d=smoothUnion(d,capsuleDistance(x,y,z,a,b,ra,rb),.43);
  d=smoothUnion(d,capsuleDistance(x,y,z*1.18,[1.2,-2.15,-2.5*1.18],[1.9,-6.45,-4.4*1.18],1.38,1.64),.52);
  d=Math.max(d,-roundedBoxDistance(x,y,z,[.45,.79,-.47],[1.08,1.18,3.25],.3)-.02);
  // Shallow, asymmetric folds are part of the leather surface, not added rods.
  const back=Math.exp(-1*((y+1.63)/.62)**2)*Math.exp(-1*((z+.5)/3.0)**4);
  d+=.010*Math.sin(z*6.4+x*1.5+Math.sin(z*2.0))*back;
  return d;
 };
 const skin=implicitMesh('sculpted-grip',{bounds:[[-3.0,-8.6,-6.6],[4.0,3.5,3.15]],resolution:[25,37,32],distance,
  color:(x,y,z)=>LEATHER.map((v,k)=>v*(.975+.025*Math.sin(x*.8+z*.6))+(k===0?1.2:0)),material:{kind:'leather',roughness:.78,scale:1}});
 const b=new MeshBuilder().add(skin);
 // Stitched cuff edge and double row of small thread bites follow its curvature.
 forearm(b,[1.9,-6.3,-4.4],[3.1,-18.2,-9.6],true,.94);
 for(let i=0;i<17;i++){
  const a=i*Math.PI*2/17,x=1.9+Math.cos(a)*1.86,z=-4.4+Math.sin(a)*1.52;
  line(b,[x,-6.35,z],[x,-6.55,z],.025,[173,130,83],'cloth',4);
 }
 return b.finish('part:grip-hand');
});}

function fistHand(){return remember('part:fist-hand',()=>{
 const bones=[];
 for(let i=0;i<4;i++){
  const x=-2.02+i*1.32,r=i===3?.48:.56,arc=i===0?-.15:i===3?-.47:.15;
  const p=[[x,.25,.30],[x,1.65+arc,.57],[x,2.60+arc,-.03],[x,2.40+arc,-1.03],[x,1.38+arc,-1.3]];
  for(let n=1;n<p.length;n++)bones.push([p[n-1],p[n],r*(1-(n-1)*.04),r*(1-n*.04)]);
 }
 const thumb=[[2.08,-.25,-.15],[2.9,1.03,-.43],[2.35,2.26,-1.02],[.82,2.2,-1.22]];
 for(let i=1;i<thumb.length;i++)bones.push([thumb[i-1],thumb[i],.78-i*.055,.73-i*.055]);
 const distance=(x,y,z)=>{
  let d=ellipsoidDistance(x,y,z,[0,-.05,-.20],[2.52,1.93,1.24]);
  d=smoothUnion(d,ellipsoidDistance(x,y,z,[1.5,.1,-.45],[1.05,1.65,1.0]),.42);
  // Curled fingers press into the palmar pad. This continuous flesh closes the
  // sub-cell pinch below the middle fingers instead of joining four sheets at
  // the same dual-grid edge; the visible knuckle silhouette stays unchanged.
  d=smoothUnion(d,ellipsoidDistance(x,y,z,[.2,.87,-.82],[2.0,1.17,.75]),.34);
  // Adjacent closed fingers touch through compressed soft tissue. A narrow
  // mathematical air pocket between their capsule bones is not a skin fold.
  for(const[a,b,ra,rb]of bones)d=smoothUnion(d,capsuleDistance(x,y,z,a,b,ra,rb),.70);
  // The wrist and forearm belong to this same watertight field. The narrower
  // wrist opens into asymmetric extensor/flexor masses, without a round cap
  // protruding over a second arm surface at the most visible junction.
  const t=Math.max(0,Math.min(1,(-y-1.8)/53)),rx=1.43+3.12*(1-Math.exp(-t*3.0)),rz=1.10+2.03*(1-Math.exp(-t*3.4));
  const radial=(Math.hypot((x-.12*Math.sin(t*3))/rx,(z+.22)/rz)-1)*rz;
  const arm=Math.max(radial,y+1.35,-55.3-y);
  d=smoothUnion(d,arm,.57);
  const back=Math.exp(-1*((z-1.1)/.5)**2)*Math.exp(-1*((y-.25)/2.1)**4);
  d+=.014*Math.sin(y*11+x*2.1)*back;
  for(const k of[-1.98,-.66,.66,1.98])d-=.033*Math.exp(-1*((x-k)/.23)**2)*Math.exp(-1*((y+.25)/1.8)**2)*back;
  // Tendons flatten into the wrist, while the two skin creases are shallow
  // depressions in the volume rather than separate rings around it.
  const wrist=Math.exp(-1*((y+3.4)/3.0)**2)*Math.exp(-1*((z-1.05)/.55)**2);
  d-=.038*Math.cos(x*3.1)*wrist;
  d+=.020*(Math.exp(-1*((y+2.3)/.11)**2)+.65*Math.exp(-1*((y+2.65)/.14)**2))*Math.exp(-1*((z+.95)/.4)**2);
  return d;
 };
 const samples=[...Array.from({length:14},(_,i)=>-58+i*50/14),...Array.from({length:45},(_,i)=>-8+i*11.75/44)];
 const sculpt=implicitMesh('sculpted-fist',{bounds:[[-5.7,-58,-3.9],[5.7,3.75,3.8]],resolution:[40,58,30],axisPositions:[null,samples,null],distance,
  color:(x,y,z)=>{
   const knuckle=Math.exp(-1*((y-1.8)/1.0)**2)*Math.max(0,z+.1)*.028,
    variation=.974+.016*Math.sin(x*.9+y*.4)+.009*Math.sin(y*1.7-x*.6);
   return SKIN.map((v,k)=>v*variation+(k===0?3+knuckle*70:-knuckle*35));
  },material:{kind:'skin',roughness:.71,scale:1}});
 // Smooth centreline begins inside the wrist. Dense longitudinal samples stay
 // on the fingers; the hidden upper forearm does not waste an equally fine grid.
 bendSculpt(sculpt,y=>{const q=Math.max(0,-y-1.5),s=q-1.25*(1-Math.exp(-q/1.25)),ds=q?-(1-Math.exp(-q/1.25)):0;return[s*.97,-s*.88,ds*.97,-ds*.88];});
 const b=new MeshBuilder().add(sculpt);
 // Thin curved nail plates remain under the curled fingertips and only become
 // visible from the palm side. They are coloured skin, not luminous white dots.
 for(let i=0;i<4;i++)ell(b,[-2.02+i*1.32,1.31+(i===3?-.22:0),-1.72],
  [i===3?.28:.34,.37,.055],[178,143,123],{kind:'skin',roughness:.46},12,4);
 return b.finish('part:fist-hand');
});}


/** An annular muzzle with a recessed dark bore, not a disc painted on its end. */
function muzzle(b,from,to,z,outer,inner,segments=24){
 b.cylinder([0,from,z],[0,to,z],outer,[41,46,49],{segments,material:'metal',cap:false});
 const point=(r,y,i)=>[r*Math.cos(i*TAU/segments),y,z+r*Math.sin(i*TAU/segments)],back=from+.12;
 for(let i=0;i<segments;i++){
  const a=point(outer,to,i),c=point(outer,to,i+1),u=point(inner,to,i),v=point(inner,to,i+1),p=point(inner,back,i),q=point(inner,back,i+1);
  b.triangle(a,u,v,EDGE,{material:'metal'});b.triangle(a,v,c,EDGE,{material:'metal'});
  b.triangle(u,p,q,[25,29,31],{material:'metal'});b.triangle(u,q,v,[25,29,31],{material:'metal'});
  b.triangle([0,back,z],q,p,[5,7,8],{material:'metal'});
  b.triangle([0,from,z],point(outer,from,i),point(outer,from,i+1),DARK,{material:'metal'});
 }
}

function pistolBody(){return remember('part:pistol-body',()=>{
 const b=new MeshBuilder(),blue={kind:'metal',roughness:.34,metalness:.92},machined={kind:'metal',roughness:.23,metalness:.94};
 // The original rounded rear, broad shoulders and tapered nose are retained;
 // the body is a joined, milled profile rather than an oval tube with stripes.
 loft(b,[[0,19.7,-7.42,1.30,1.35],[0,20.0,-7.42,1.69,1.62],[0,21.1,-7.41,1.93,1.71],
  [0,24.2,-7.38,1.97,1.72],[0,29,-7.19,1.74,1.49],[0,33.6,-7.02,1.44,1.23],[0,35.5,-6.98,1.40,1.16]],
  [34,39,41],{segments:28,steps:22,sectionPower:3.2,material:blue});
 box(b,[0,22.2,-11.9],[2.45,3.0,7.4],[44,37,29],.48,'leather',{rotation:[-.17,0,0]});
 box(b,[0,24.2,-9.32],[2.85,8.6,1.0],DARK,.20,blue);
 box(b,[0,22.65,-8.82],[3.30,5.4,.35],[52,57,58],.10,machined);
 // Separate grip shells, lower magazine floor and recessed fasteners.
 for(const side of[-1,1]){
  box(b,[side*1.23,21.98,-12.35],[.20,2.52,4.95],[58,47,34],.08,'leather',{rotation:[-.17,0,0]});
  screw(b,[side*1.36,21.8,-12.6],.22,[0,Math.PI/2,0]);
  for(let i=0;i<8;i++)box(b,[side*(1.91-i*.006),20.6+i*.36,-7.38],[.14,.115,2.04],
   i%2?[55,61,62]:[38,43,45],.035,blue,{rotation:[-.12,0,0],bevelSegments:1});
  box(b,[side*1.70,23.5,-8.85],[.24,1.6,.26],[87,94,95],.07,machined);
 }
 box(b,[0,21.25,-15.55],[2.66,3.18,.48],DARK,.12,blue,{rotation:[-.17,0,0]});
 // Ejection port has a recess, an extractor and an inset chamber block.
 box(b,[1.77,28.0,-7.0],[.06,3.02,1.13],[7,10,11],.07,blue);
 box(b,[1.83,27.65,-7.0],[.10,1.30,.78],[115,122,124],.10,machined);
 box(b,[1.87,28.5,-7.48],[.14,2.66,.20],[77,85,88],.06,machined);
 box(b,[1.84,29.4,-6.8],[.16,.74,.25],[94,101,104],.05,machined);
 // Open rear notch, individual sight ears, dovetail and serrated rear hammer.
 box(b,[0,20.55,-5.64],[2.08,.85,.34],DARK,.08,blue);
 for(const x of[-.76,.76])box(b,[x,20.52,-5.27],[.43,.62,.66],[47,53,54],.075,blue);
 for(const x of[-.74,.74])box(b,[x,20.19,-5.29],[.17,.04,.19],[183,187,168],.03,'paint');
 box(b,[0,34.4,-5.70],[.31,.94,.55],[96,104,107],.065,machined);
 box(b,[0,19.48,-6.45],[.61,.85,1.18],[66,73,75],.18,machined,{rotation:[-.16,0,0]});
 for(let i=0;i<4;i++)box(b,[0,19.08,-6.82+i*.18],[.53,.09,.07],DARK,.025,blue,{bevelSegments:1});
 muzzle(b,34.55,37.05,-6.91,1.10,.74,32);
 ring(b,[0,37.10,-6.91],.94,.105,[119,128,130],[-Math.PI/2,0,0],32);
 triggerGuard(b,[0,26.14,-11.45],2.13,1.48,1.08,.24,32);
 // A curved blade leaves visible air around the trigger.
 loft(b,[[0,25.1,-10.00,.20,.26],[0,25.5,-10.62,.18,.26],[0,25.83,-11.31,.15,.25],
  [0,25.78,-11.86,.13,.20]],[103,111,114],{segments:10,steps:8,sectionPower:3,material:machined});
 return b.finish('part:pistol-body');
});}

function shotgunPump(detail=2){return remember(`part:shotgun-pump:${detail}`,()=>{
 const b=new MeshBuilder(),seg=[8,14,28][detail],steps=[4,14,42][detail];
 // The grooves are carved into the wood surface, not a necklace of toruses.
 loft(b,[[0,8.9,-1.35,1.73,1.54],[0,9.6,-1.35,2.02,1.80],[0,11.0,-1.35,2.18,1.91],
  [0,18.6,-1.35,2.18,1.91],[0,20.0,-1.35,1.83,1.64]],WOOD,
  {segments:seg,steps,sectionPower:2.3,material:{kind:'wood',roughness:.50},
   displace:detail?(angle,t)=>-.039*Math.sin(Math.PI*t)**.32*(.5+.5*Math.cos(t*TAU*8))**4+.006*Math.sin(angle*5+t*14):null});
 if(detail){
  for(const y of[9.2,19.77])ring(b,[0,y,-1.35],1.72,.10,[70,43,24],[-Math.PI/2,0,0],seg);
  for(const side of[-1,1])box(b,[side*1.36,14.4,-.05],[.22,10.8,.24],[79,85,86],.07,'metal',{bevelSegments:1});
 }
 return b.finish(`part:shotgun-pump:${detail}`);
});}
function shotgunBody(detail=2,includePump=true){return remember(`part:shotgun-body:${detail}:${includePump}`,()=>{
 const b=new MeshBuilder(),seg=[8,14,28][detail],high=detail===2,
  blue={kind:'metal',roughness:.36,metalness:.92},polished={kind:'metal',roughness:.23,metalness:.95};
 const partBox=(p,s,c,bevel=.25,material=blue)=>detail?box(b,p,s,c,bevel,material,{bevelSegments:high?2:1}):b.box(p,s,c,{material});
 // Walnut stock has a comb, concave wrist and flared butt. Surface coordinates
 // follow its longitudinal grain so material detail remains stable while pumped.
 loft(b,[[0,-26.1,-3.65,2.94,3.92],[0,-25.4,-3.60,3.18,4.10],[0,-22.8,-3.30,3.02,3.87],
  [0,-18.8,-2.88,2.52,3.45],[0,-14.9,-2.29,1.94,2.64],[0,-12.5,-2.03,1.45,1.83],
  [0,-10.6,-1.59,1.49,1.70],[0,-8.3,-1.02,1.83,1.90],[0,-7.0,-.75,1.88,1.96]],WOOD,
  {segments:seg,steps:[5,12,30][detail],sectionPower:2.25,material:{kind:'wood',roughness:.48},
   displace:high?(a,t)=>.004*Math.sin(a*5+t*8)*Math.sin(t*Math.PI)-.004*Math.exp(-1*((t-.7)/.13)**2)*Math.sin(a*18+t*34)*Math.sin(a*18-t*34):null});
 partBox([0,-26.0,-3.65],[6.32,.70,8.03],[31,27,23],.38,'leather');
 if(high){
  for(const z of[-6.4,-.9])screw(b,[0,-26.38,z],.23,[Math.PI/2,0,0]);

 }
 // Left/main casting and right-side port frame surround a genuinely inset bolt.
 partBox([-.22,-1,0],[4.19,12.4,4.55],[34,39,41],.54);
 if(detail){
  partBox([2.02,-5.27,0],[.55,3.00,4.36],[35,40,42],.24);
  partBox([2.02,3.61,0],[.55,3.00,4.36],[35,40,42],.24);
  partBox([2.10,-.72,1.70],[.45,5.95,.91],[39,44,47],.19);
  partBox([2.10,-.72,-1.49],[.45,5.95,1.32],[39,44,47],.19);
  partBox([1.91,-.75,.12],[.12,5.42,2.20],[8,11,12],.08);
  partBox([1.99,-1.45,.55],[.14,3.81,.85],[115,124,129],.18,polished);
  partBox([2.13,.63,.88],[.30,1.0,.32],[78,85,89],.07,polished);
  partBox([0,-1.25,2.23],[2.60,10.66,.23],[54,61,64],.075);
  for(const x of[-.38,0,.38])partBox([x,-1.25,2.37],[.065,9.75,.045],[29,34,36],.018);
 }
 b.tube([0,4.7,1.15],[0,37.7,1.15],[[0,1.46,1.46],[.08,1.40,1.40],[.22,1.22,1.22],[.96,1.08,1.08],[1,1.08,1.08]],
  [41,46,49],{segments:seg,material:blue,cap:!high,smoothProfile:true});
 b.tube([0,4.8,-1.35],[0,24.2,-1.35],[[0,1.03,1.03],[.05,.95,.95],[.94,.95,.95],[1,.88,.88]],
  [37,42,45],{segments:seg,material:blue,smoothProfile:true});
 if(includePump)b.add(shotgunPump(detail));
 if(detail){
  partBox([0,36.2,2.43],[.44,.82,.43],[132,141,139],.10,polished);
  for(const y of[6.3,22.6])ring(b,[0,y,1.1],1.26,.11,[88,97,101],[-Math.PI/2,0,0],seg);
  triggerGuard(b,[0,-1.5,-3.31],3.25,1.57,1.30,.28,high?32:16);
  loft(b,[[0,-2.7,-2.0,.22,.25],[0,-1.94,-2.85,.20,.23],[0,-1.48,-3.8,.16,.20]],
   [91,100,104],{segments:8,steps:high?8:3,material:polished});
 }
 if(high){
  muzzle(b,35.5,37.7,1.15,1.08,.77,32);ring(b,[0,37.75,1.15],.92,.105,[115,125,129],[-Math.PI/2,0,0],32);
  for(const side of[-1,1])for(const y of[-5.25,2.90])screw(b,[side*2.36,y,-.65],.24,[0,Math.PI/2,0]);
  line(b,[2.07,.40,-.25],[2.95,.40,-.25],.20,STEEL,'metal',12);
  b.cylinder([2.91,.40,-.25],[3.44,.40,-.25],.42,[43,49,52],{segments:16,material:blue});
  for(let i=0;i<5;i++)ring(b,[3.0+i*.085,.40,-.25],.41,.025,[94,103,107],[0,Math.PI/2,0],16);
  partBox([0,-6.27,2.25],[.80,1.10,.24],[75,82,84],.09,polished);
 }
 return b.finish(`part:shotgun-body:${detail}:${includePump}`);
});}

export function worldShotgunMesh(detail=2){return shotgunBody(Math.max(0,Math.min(2,detail)),true);}

function chaingunBody(detail=2){return remember(`part:chaingun-body:d${detail}`,()=>{
 const b=new MeshBuilder(),high=detail===2,seg=high?20:10;
 box(b,[0,-1.2,0],[4.8,12,5.2],[54,61,64],.34,'metal');
 box(b,[0,-7.4,0],[4.2,5.6,4.4],[38,43,46],.3,'metal');
 box(b,[0,4.6,.4],[4.2,4.4,4.6],[62,69,72],.3,'metal');
 for(let i=0;i<6;i++){const a=i*TAU/6;
  line(b,[Math.cos(a)*2.5,7,Math.sin(a)*2.5],[Math.cos(a)*2.5,30,Math.sin(a)*2.5],1.05,[46,52,55],'metal',high?12:6);}
 b.cylinder([0,7,.2],[0,9.4,.2],3.9,[70,77,80],{segments:seg,material:'metal'});
 b.cylinder([0,29,.2],[0,31.6,.2],3.9,[70,77,80],{segments:seg,material:'metal'});
 ring(b,[0,31.8,.2],3.6,.34,EDGE,[Math.PI/2,0,0],seg);
 b.cylinder([-3.9,-1.4,1.6],[-3.9,-1.4,6.4],2.9,[58,64,67],{segments:seg,material:'metal'});
 box(b,[-2.6,3.4,1.6],[2.6,4.6,2.6],[48,54,57],.24,'metal');
 if(high)for(let i=0;i<7;i++)box(b,[-3.9,-1.4,2+i*.6],[3.1,.5,.34],[176,146,62],.06,'metal');
 box(b,[0,-8.6,-1.6],[3.4,4.6,3.4],[44,49,52],.3,'metal');
 triggerGuard(b,[0,-3.4,-3.2],2.6,1.5,1.1,.26,high?24:12);
 if(high){for(const y of[-4.4,1.6])ring(b,[0,y,.2],4.1,.28,EDGE,[Math.PI/2,0,0],seg);
  for(const side of[-1,1])for(const y of[-6.4,-1.4])screw(b,[side*2.5,y,1.9],.22,[0,Math.PI/2,0]);
  box(b,[0,-6.2,2.6],[.7,1.1,.26],[126,134,134],.08,'metal');}
 return b.finish(`part:chaingun-body:d${detail}`);
});}

function launcherBody(detail=2){return remember(`part:launcher-body:d${detail}`,()=>{
 const b=new MeshBuilder(),high=detail===2,seg=high?22:10;
 b.tube([0,-6,0],[0,30,0],[[0,3.4,3.4],[.06,3.3,3.3],[.9,3.3,3.3],[1,3,3]],[62,69,72],
  {segments:seg,material:'metal',cap:true,smoothProfile:true});
 b.cylinder([0,16,6.2],[0,26,6.2],2.1,[142,72,36],{segments:seg,material:'paint'});
 b.cone([0,26,6.2],[0,30.4,6.2],2.1,[176,96,44],{segments:seg,material:'paint'});
 for(let i=0;i<3;i++){const f=new MeshBuilder();f.box([0,0,2.2],[.28,3.2,4.4],[126,64,32],{material:'paint'});
  b.add(f.finish('launcher-fin'),{translation:[0,20,6.2],rotation:[i*TAU/3,0,0]});}
 box(b,[0,-7.6,-3.4],[3.2,4.4,4.6],[44,49,52],.3,'metal');
 triggerGuard(b,[0,-4.6,-3],2.4,1.4,1,.24,high?24:12);
 box(b,[0,-9.6,.6],[4.4,3.4,3.4],[54,60,63],.34,'metal');
 box(b,[2.9,2.4,3.4],[1.4,7.2,1.2],[40,45,48],.2,'metal');
 if(high){ring(b,[0,30.2,0],3.3,.3,EDGE,[Math.PI/2,0,0],seg);
  for(const y of[-2,10,20])ring(b,[0,y,0],3.5,.24,EDGE,[Math.PI/2,0,0],seg);
  for(const side of[-1,1])screw(b,[side*3.2,-2.4,2.4],.22,[0,Math.PI/2,0]);}
 return b.finish(`part:launcher-body:d${detail}`);
});}

function chainsawBody(detail=2){return remember(`part:chainsaw-body:d${detail}`,()=>{
 const b=new MeshBuilder(),high=detail===2,seg=high?18:8;
 box(b,[0,-2.4,0],[5.6,9.4,5.4],[168,86,26],.36,'paint');
 box(b,[0,-8.4,-.4],[4.6,4.4,4.6],[54,58,60],.3,'metal');
 box(b,[0,13.4,1.2],[2.2,17,2.6],[150,156,156],.2,'metal');
 if(high)for(let i=0;i<14;i++)box(b,[(i%2?1:-1)*1.35,5.6+i*1.3,2.7],[.6,.62,.5],[196,200,198],.05,'metal');
 box(b,[0,1.4,4.6],[4.4,10,1.1],[46,50,52],.24,'metal');
 for(const y of[-3.2,5.6])box(b,[0,y,2.6],[3.2,1.2,4.2],[50,55,58],.24,'metal');
 b.cylinder([2.9,-4.4,2.2],[4.6,-4.4,2.2],.55,[36,40,42],{segments:high?10:6,material:'metal'});
 if(high){ring(b,[0,-2.4,3],2.2,.3,EDGE,[Math.PI/2,0,0],seg);
  for(const x of[-2.4,2.4])for(const y of[-6.2,-1.2])screw(b,[x,y,2.4],.2);}
 return b.finish(`part:chainsaw-body:d${detail}`);
});}

function flash(b,p,large){
 const r=large?3.7:2.5;ell(b,[p[0],p[1]+1,p[2]],[r*.8,2,r*.8],[255,241,163],'glow',12,6,{emissive:1});
 for(let i=0;i<5;i++){const a=i*TAU/5+.2;b.cone([p[0]+Math.cos(a)*.3,p[1]+.6,p[2]+Math.sin(a)*.3],[p[0]+Math.cos(a)*r*1.55,p[1]+r*2.1,p[2]+Math.sin(a)*r*1.55],r*.4,[255,135+i*11,24],{segments:7,material:'glow',emissive:1});}
 b.cone(p,[p[0],p[1]+r*2.7,p[2]],r*.7,[255,251,208],{segments:8,material:'glow',emissive:1});
}

// Rigs are transform descriptions over one immutable instance of each part.
// They do not retain duplicate 3D hands in assembled mesh copies.
function pistolRig(){return[{mesh:pistolBody()},{mesh:gripHand(),shift:[-.7,20.5,-11.6],rotation:[.03,0,.035]}];}
function shotgunRig(){return[{mesh:shotgunBody(2,false),shift:[0,23,-8.6],scale:.73},
 {mesh:gripHand(),shift:[-.7,20.1,-12.3],rotation:[.22,0,-.06],scale:.95}];}
function pumpRig(pump=0){return[{mesh:shotgunPump(2),shift:[0,23+pump*.73,-8.6],scale:.73},
 {mesh:gripHand(),shift:[-1.15,33.5+pump*.73,-12.5],rotation:[Math.PI/2,0,Math.PI],scale:.82}];}
function chaingunRig(){return[{mesh:chaingunBody(2)},{mesh:gripHand(),shift:[-.7,1.2,-4.6],rotation:[.18,0,-.05],scale:.9}];}
function launcherRig(){return[{mesh:launcherBody(2)},{mesh:gripHand(),shift:[-.6,-6.2,-4.4],rotation:[.2,0,-.04],scale:.9}];}
function chainsawRig(){return[{mesh:chainsawBody(2)},{mesh:gripHand(),shift:[-.4,-7.4,-2.2],rotation:[.1,0,.02],scale:.88}];}
const MUZZLES={pistol:[0,37.2,-6.75],shotgun:[0,50.5,-7.75],chaingun:[0,33.4,.2],launcher:[0,31.4,0]};
function flashMesh(kind){return remember('part:flash:'+kind,()=>{const b=new MeshBuilder();flash(b,MUZZLES[kind]||[0,32,0],kind==='shotgun');return b.finish('part:flash:'+kind);});}

/** Quantised articulated poses are bounded in time and memory (30 samples/sec). */
export function weaponMesh(kind='pistol',phase=Infinity){
 if(!['pistol','shotgun','fist','chaingun','launcher','chainsaw'].includes(kind))return null;
 const duration=kind==='shotgun'?.65:kind==='fist'?.4:kind==='chaingun'?.14:kind==='launcher'?.95
  :kind==='chainsaw'?.24:.3;
 const tick=Number.isFinite(phase)&&phase>=0&&phase<duration?Math.floor(phase*30):-1,t=tick<0?Infinity:tick/30,key=`weapon:${kind}:${tick}`;
 return remember(key,()=>{
  if(kind==='pistol'){
   const sources=pistolRig();if(t<.08)sources.push({mesh:flashMesh(kind)});const recoil=t<.3?Math.exp(-t*15):0;
   return poseMesh(key,sources,[.12*recoil,0,0],[0,-2.5*recoil,.6*recoil]);
  }else if(kind==='shotgun'){
   const lift=t>.1&&t<.6?Math.sin((t-.1)/.5*Math.PI):0,pump=t>.2&&t<.5?-5*Math.sin((t-.2)/.3*Math.PI):0,recoil=t<.1?Math.exp(-t*19):0;
   const sources=[...shotgunRig(),...pumpRig(pump)];if(t<.08)sources.push({mesh:flashMesh(kind)});
   const rotation=[.7*lift+.08*recoil,0,.1*lift],pivot=[0,18,-11],rotated=rotateEuler(pivot,rotation);
   return poseMesh(key,sources,rotation,[-7*lift-rotated[0],18-2*recoil-rotated[1],-11-1.5*lift-rotated[2]]);
  }else if(kind==='chaingun'){
   const sources=chaingunRig();if(t<.06)sources.push({mesh:flashMesh(kind)});
   const recoil=t<.25?Math.exp(-t*18):0;
   return poseMesh(key,sources,[.1*recoil,0,0],[0,-2.2*recoil,.5*recoil]);
  }else if(kind==='launcher'){
   const sources=launcherRig();if(t<.09)sources.push({mesh:flashMesh(kind)});
   const recoil=t<.4?Math.exp(-t*11):0;
   return poseMesh(key,sources,[.16*recoil,0,0],[0,-6.5*recoil,1.8*recoil]);
  }else if(kind==='chainsaw'){
   const shake=Number.isFinite(t)?Math.sin(t*58)*.022:0;
   return poseMesh(key,chainsawRig(),[shake,.02+shake,shake*.6],[0,0,0]);
  }else{
   const extension=t<.12?Math.sin(t/.12*Math.PI/2):t<.36?1-(t-.12)/.24:0;
   return poseMesh(key,[{mesh:fistHand()}],[-.12+.18*extension,.14*(1-extension),-.25+.3*extension],[3-5*extension,25-4*extension,-13+8.5*extension]);
  }
 });
}
export function weaponCacheStats(){let staticBytes=0;for(const mesh of parts.values())staticBytes+=mesh.vertices.byteLength;return{entries:cache.size+parts.size,limit:LIMIT,bytes,byteLimit:BYTE_LIMIT,staticParts:parts.size,staticBytes,poses:cache.size};}
