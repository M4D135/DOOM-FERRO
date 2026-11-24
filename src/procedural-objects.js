/** Detailed Doom-reference props. Every surface is generated geometry/material. */
import {MeshBuilder} from './procedural-mesh.js';
import {loft} from './procedural-object-sculpt.js';
import {buildRemains} from './procedural-remains.js';
import {ageSurface} from './procedural-object-finish.js';
import {weaponMesh,worldShotgunMesh,weaponCacheStats} from './procedural-weapons.js';
export {weaponMesh};
const TAU=Math.PI*2,cache=new Map(),LIMIT=96,BYTE_LIMIT=12*1024*1024;
let cacheBytes=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TYPES={2035:'BAR1',2028:'COLU',48:'ELEC',35:'CBRA',34:'CAND',10:'PLAYW',12:'PLAYW',15:'PLAYN',24:'POL5',2011:'STIM',2012:'MEDI',2014:'BON1',2015:'BON2',2018:'ARM1',2019:'ARM2',2007:'CLIP',2048:'AMMO',2008:'SHEL',2049:'SBOX',2001:'SHOT',2002:'MGUN',2003:'LAUN',2005:'CSAW',5:'BKEY',6:'YKEY',13:'RKEY',8:'BPAK',2010:'ROCK',2013:'SOUL',2024:'PINS',2025:'SUIT',2026:'PMAP',2045:'PVIS',2046:'BROK'};
const FAMILIES=new Set([...Object.values(TYPES),'BAL1','BEXP','MISL']);
const DARK=[26,30,29],STEEL=[108,114,114],EDGE=[151,159,155],RED=[169,13,7],BRASS=[182,133,49];
const cfg=q=>({q,s:[7,14,32][q],r:[3,6,12][q],thin:[4,6,10][q]});
function remember(key,make){
 if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);return v;}
 const m=make();while(cache.size&&(cache.size>=LIMIT||cacheBytes+m.vertices.byteLength>BYTE_LIMIT)){const k=cache.keys().next().value;cacheBytes-=cache.get(k).vertices.byteLength;cache.delete(k);}
 cache.set(key,m);cacheBytes+=m.vertices.byteLength;return m;
}
const cyl=(b,a,z,r,c,d,material='metal',extra={})=>b.cylinder(a,z,r,c,{segments:d.s,material,...extra});
const ell=(b,p,r,c,d,material='paint',extra={})=>b.ellipsoid(p,r,c,{segments:d.s,rings:d.r,material,...extra});
const box=(b,p,s,c,d,material='paint',bevel=.3,extra={})=>d.q?b.roundedBox(p,s,Math.min(bevel,...s.map(x=>x*.42)),c,{material,bevelSegments:d.q===2?2:1,...extra}):b.box(p,s,c,{material,...extra});
const ring=(b,p,r,t,c,d,material='metal',extra={})=>b.torus(p,r,t,c,{segments:d.s,sections:d.q===2?6:4,material,...extra});
function line(b,a,z,r,c,d,material='metal'){return b.cylinder(a,z,r,c,{segments:d.thin,material});}
function ground(m){return Math.abs(m.bounds.min[2])<1e-6?m:new MeshBuilder().add(m,{translation:[0,0,-m.bounds.min[2]]}).finish(m.key);}
function bolt(b,p,r,d,rotation=[0,0,0]){
 const h=new MeshBuilder();h.cylinder([0,0,-.08],[0,0,.12],r,EDGE,{segments:d.q===2?6:4,material:'metal'});
 if(d.q===2)h.box([0,0,.14],[r*1.4,.09,.05],DARK,{material:'metal'});
 b.add(h.finish('bolt'),{translation:p,rotation});
}
function barrel(b,d,frame){
 // Rolled sheet metal has two pressed ribs and a crimped open top. The seams
 // follow the sheet; rust is not represented as floating rectangular stickers.
 const profile=d.q?[[0,9.65],[.18,10.0],[.42,10.42],[.75,10.50],[1.22,10.47],[1.65,10.08],
  [2.2,9.72],[7.85,9.68],[8.15,9.82],[8.55,10.30],[9.05,10.58],[9.65,10.58],[10.13,10.29],
  [10.65,9.75],[20.03,9.72],[20.48,10.20],[20.98,10.56],[21.67,10.58],[22.16,10.24],
  [22.70,9.68],[29.52,9.64],[30.0,9.93],[30.25,10.19]]:[[0,10.5],[2,9.8],[29.7,9.8],[30.2,10.3]];
 if(d.q===2){
  const sheet=new MeshBuilder(),rows=[];
  for(let i=0;i<profile.length-1;i++){
   const a=profile[i],c=profile[i+1],n=Math.max(1,Math.ceil((c[0]-a[0])/1.5));
   for(let k=0;k<n;k++)rows.push([a[0]+(c[0]-a[0])*k/n,a[1]+(c[1]-a[1])*k/n]);
  }rows.push(profile.at(-1));
  sheet.lathe([0,0,0],rows,[96,108,67],{segments:48,material:{kind:'paint',roughness:.65},smoothProfile:true,cap:false});
  const shell=sheet.finish('barrel-sheet'),v=shell.vertices;
  // Two shallow knocks distort the rolled sheet, with the normals derived from
  // those same dents. The original diameter, height and pressed ribs stay intact.
  const dent=(a,z)=>-.18*Math.exp(-1*((a-.85)/.20)**2-((z-16.1)/2.7)**2)
   -.11*Math.exp(-1*((a+1.8)/.26)**2-((z-5.2)/1.4)**2)
   +.013*Math.sin(a*17+z*.9)*Math.exp(-1*((z-16)/8)**2);
  for(let i=0;i<v.length;i+=17){
   const r=Math.hypot(v[i],v[i+1]),a=Math.atan2(v[i+1],v[i]),z=v[i+2],c=Math.cos(a),s=Math.sin(a),delta=dent(a,z),
    da=(dent(a+.001,z)-dent(a-.001,z))/.002,dz=(dent(a,z+.001)-dent(a,z-.001))/.002,
    radial=v[i+3]*c+v[i+4]*s,nt=-radial*da/(r+delta),nz=v[i+5]-radial*dz,
    nx=radial*c-nt*s,ny=radial*s+nt*c,length=Math.hypot(nx,ny,nz)||1;
   v[i]=(r+delta)*c;v[i+1]=(r+delta)*s;v[i+3]=nx/length;v[i+4]=ny/length;v[i+5]=nz/length;
  }b.add(shell);
 }else b.lathe([0,0,0],profile,[96,108,67],{segments:d.s,material:{kind:'paint',roughness:.65},smoothProfile:d.q>0,cap:false});
 cyl(b,[0,0,0],[0,0,.18],9.65,[62,72,44],d,'metal');
 for(const z of[1.03,9.34,21.35])ring(b,[0,0,z],10.40,d.q?.20:.16,[67,75,48],d,'metal');
 // The rim and visible inside wall have actual thickness above the recessed fluid.
 b.lathe([0,0,0],[[29.9,9.82],[30.25,10.23],[30.76,10.62],[31.33,10.66],[31.72,10.22],[31.75,9.61]],
  [132,141,107],{segments:d.s,material:'metal',smoothProfile:true,cap:false});
 const wall=(r,z,i)=>[r*Math.cos(i*TAU/d.s),r*Math.sin(i*TAU/d.s),z];
 for(let i=0;i<d.s;i++){
  const a=wall(9.61,31.75,i),c=wall(9.61,31.75,i+1),p=wall(9.37,29.95,i),q=wall(9.37,29.95,i+1);
  b.triangle(a,c,q,[51,66,37],{material:'metal'});b.triangle(a,q,p,[51,66,37],{material:'metal'});
 }
 cyl(b,[0,0,29.98],[0,0,30.18],9.35,[38,73,20],d,{kind:'glass',roughness:.16},{emissive:.015});
 if(d.q){
  for(let i=0;i<(d.q===2?8:4);i++){const a=i*2.399,r=2+i*.66;ell(b,[Math.cos(a)*r,Math.sin(a)*r,30.2],[.42+(i%3)*.23,.42+(i%3)*.23,.06+((i+frame)%3)*.055],[85,122,43],{...d,s:10,r:4},'glass');}
  const a=2.13,r=9.73;
  line(b,[Math.cos(a)*r,Math.sin(a)*r,2.0],[Math.cos(a)*r,Math.sin(a)*r,29.85],.065,[80,90,55],d,'paint');
 }
 if(d.q===2)for(const z of[3.2,28.1])ring(b,[0,0,z],9.73,.035,[133,143,99],d,'metal');
}

function lamp(b,d){
 b.lathe([0,0,0],d.q?[[0,11.7],[.7,12],[2.1,9.4],[3,8],[4.3,7.8],[4.6,5.4],[6.8,5.2],[7.3,4.1],[9.6,3.7],[39.2,3.7],[40,5.8],[41,6.2]]:[[0,12],[3,7],[7,4],[40,4],[41,6.2]],DARK,{segments:d.s,material:'metal'});
 cyl(b,[0,0,41],[0,0,45.8],5.8,[249,243,132],d,'glass',{emissive:.9});
 b.lathe([0,0,0],[[45.8,6.2],[46.6,6.2],[47.4,4.8],[48,3.8]],[47,52,40],{segments:d.s,material:'metal'});
 if(d.q){for(const z of [3.1,4.8,7.2,40.7,46])ring(b,[0,0,z],z<10?(z<4?8:5.3):6,.17,STEEL,d);for(let i=0;i<(d.q===2?8:4);i++){const a=i*TAU/(d.q===2?8:4);line(b,[3.75*Math.cos(a),3.75*Math.sin(a),9],[3.75*Math.cos(a),3.75*Math.sin(a),39],.12,[75,80,69],d);}}
 if(d.q===2)for(let i=0;i<4;i++){const a=i*TAU/4;bolt(b,[7.2*Math.cos(a),7.2*Math.sin(a),2.1],.34,d);line(b,[5.8*Math.cos(a),5.8*Math.sin(a),41],[5.8*Math.cos(a),5.8*Math.sin(a),45.6],.12,[88,88,58],d);}
}
function tech(b,d){
 b.lathe([0,0,0],[[0,14.5],[.35,14.8],[1.2,15],[4.9,15],[5.5,14.65],[6.1,12],
  [31.5,12],[32.2,12.45],[33.3,13.5],[35,14],[38,14]],[56,61,60],{segments:d.s,material:'metal'});
 b.lathe([0,0,0],[[122,14],[122.5,14.6],[123,15],[127.2,15],[128,14.6]],DARK,{segments:d.s,material:'metal'});
 const bars=d.q===2?8:4;for(let i=0;i<bars;i++){const a=i*TAU/bars;line(b,[12*Math.cos(a),12*Math.sin(a),37],[12*Math.cos(a),12*Math.sin(a),123],d.q?.50:.9,[47,53,52],d);}
 if(d.q){
  for(const z of[6.8,32.5,36,122.8,126])ring(b,[0,0,z],z<30?12.1:14,.23,EDGE,d,'metal',{sections:4});
  const wires=d.q===2?12:5;
  for(let i=0;i<wires;i++){
   const a=i*2.4,r=4.3+(i%4)*1.5,wire=new MeshBuilder(),rows=[];
   for(let k=0;k<6;k++){const t=k/5,angle=a+.23*Math.sin(t*4+i*.7),radius=r+.9*Math.sin(t*3+i),
    x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,z=38.4+t*84;
    rows.push([x,z,-y,.22+(i%3)*.025,.22+(i%3)*.025]);}
   loft(wire,rows,i%3?[113,122,110]:[45,51,47],{segments:d.q===2?8:5,steps:d.q===2?18:5,material:{kind:'paint',roughness:.52}});
   b.add(wire.finish('column-cable'),{rotation:[Math.PI/2,0,0]});
  }
  // Circuit cards are placed in their own frames, so edge rails, ceramic chips
  // and contacts share an orientation and never float away from the board.
  for(let i=0;i<(d.q===2?10:6);i++){
   const a=i*2.25,z=44+(i*17)%72,r=6.6,board=new MeshBuilder();
   box(board,[0,0,0],[4.6,.40,4.9],i%3?[68,91,53]:[145,152,132],d,'paint',.08);
   box(board,[0,.41,0],[2.15,.58,2.34],[25,30,29],d,'plain',.10);
   if(d.q===2){
    for(const side of[-1,1]){
     line(board,[side*2.04,.13,-2.04],[side*2.04,.13,2.04],.10,EDGE,d);
     for(let k=0;k<4;k++)box(board,[side*1.42,.32,-.88+k*.57],[.48,.18,.12],[144,148,133],{...d,q:0},'metal');
    }
    for(const x of[-1.2,0,1.2])cyl(board,[x,.38,1.74],[x,.8,1.74],.25,[88,96,82],{...d,s:8},'metal');
   }
   b.add(board.finish('column-card'),{translation:[Math.cos(a)*r,Math.sin(a)*r,z],rotation:[0,0,a-Math.PI/2]});
  }
 }
 if(d.q===2){
  for(let i=0;i<10;i++){const a=i*TAU/10;line(b,[12.04*Math.cos(a),12.04*Math.sin(a),8],[12.04*Math.cos(a),12.04*Math.sin(a),30],.09,[105,114,110],d);}
  for(let i=0;i<8;i++){const a=i*TAU/8;bolt(b,[13.3*Math.cos(a),13.3*Math.sin(a),127.6],.34,d);}
 }
}

function candles(b,d,frame){
 const gold=[167,112,36];b.lathe([0,0,0],[[0,7],[1.8,8],[3.3,4.2],[5.5,2.1],[36,1.65],[42,2.2]],gold,{segments:d.s,material:'metal'});
 for(let i=0;i<3;i++){const a=i*TAU/3;line(b,[Math.cos(a)*2,Math.sin(a)*2,4],[Math.cos(a)*10,Math.sin(a)*10,1],1.35,gold,d);}
 for(const x of [-10,0,10]){const z=x?40:48;if(x){line(b,[0,0,32],[x*.7,0,34],1.3,gold,d);line(b,[x*.7,0,34],[x,0,39],1.3,gold,d);}b.lathe([x,0,0],[[z-1,1.5],[z,3.6],[z+1.4,3.8],[z+2,2.4]],[205,156,56],{segments:d.s,material:'metal'});cyl(b,[x,0,z+2],[x,0,z+9],1.4,[211,195,143],d,'plain');ell(b,[x+(frame-1.5)*.12,0,z+10.4],[.85,.85,1.7],[255,207,72],d,'glow',{emissive:1});if(d.q)for(let n=0;n<3;n++){const a=n*2.1;line(b,[x+1.4*Math.cos(a),1.4*Math.sin(a),z+8],[x+1.4*Math.cos(a),1.4*Math.sin(a),z+4+n],.18,[236,217,166],d,'plain');}}
 if(d.q)for(const z of [8,16,24,32,41])ring(b,[0,0,z],z===41?2.2:1.8,.3,[220,174,76],d);
}
function medical(b,d,large){
 const w=large?27:13,depth=large?12:8,h=large?10.7:14;
 box(b,[0,0,h/2],[w,depth,h],[143,147,136],d,'paint',.9);
 box(b,[0,0,.8],[w+.2,depth+.2,1.6],[91,97,87],d,'metal',.4);
 if(large){
  // The original MEDI is a shallow chest with an inclined lid and a front handle.
  const outline=(x,y,z)=>{
   const points=[],radius=d.q?.76:.8,segments=[1,2,6][d.q];
   for(let corner=0;corner<4;corner++){
    const cx=(corner===0||corner===3?1:-1)*(x-radius),cy=(corner<2?1:-1)*(y-radius);
    for(let i=0;i<=segments;i++){const a=corner*Math.PI/2+i*Math.PI/2/segments;points.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,z]);}
   }return points;
  };
  const rings=d.q?[[13.61,6.27,10.8],[13.8,6.45,11.04],[12.04,4.07,17.85],[11.9,3.9,18.1],[11.7,3.7,18.16]]:
   [[13.8,6.45,10.8],[11.9,3.9,18.1]],profiles=rings.map(p=>outline(...p)),count=profiles[0].length;
  for(let row=0;row<profiles.length-1;row++)for(let i=0;i<count;i++){
   const j=(i+1)%count,a=profiles[row][i],c=profiles[row][j],p=profiles[row+1][i],q=profiles[row+1][j],color=row===0?[134,141,130]:row===profiles.length-2?[193,199,186]:[171,179,166];
   b.triangle(a,c,q,color,{material:{kind:'paint',roughness:.47}});b.triangle(a,q,p,color,{material:{kind:'paint',roughness:.47}});
  }
  for(let i=0;i<count;i++){const j=(i+1)%count;
   b.triangle([0,0,10.8],profiles[0][j],profiles[0][i],[118,125,112],{material:'paint'});
   b.triangle([0,0,rings.at(-1)[2]],profiles.at(-1)[i],profiles.at(-1)[j],[194,200,183],{material:'paint'});
  }

  const angle=Math.atan2(2.55,7.3),crossY=6.45-(14.3-10.8)*2.55/7.3+.12;
  for(const [cw,ch]of[[2.0,6.0],[6.8,1.9]])box(b,[0,crossY,14.3],[cw,.18,ch],RED,d,'paint',.07,{rotation:[angle,0,0]});
  box(b,[0,0,10.65],[27.7,12.7,.55],[98,106,93],d,'metal',.2);
  for(const x of [-9.2,9.2]){box(b,[x,6.25,9.2],[3.0,.7,3.2],[159,137,83],d,'metal',.35,{rotation:[0,x>0?-.15:.15,0]});box(b,[x*.87,6.85,8.7],[1.4,1.6,2.3],STEEL,d,'metal',.3);if(d.q===2)bolt(b,[x,6.71,9.8],.26,d,[Math.PI/2,0,0]);}
  box(b,[0,7.7,8.3],[15.5,1.8,1.8],[43,49,42],d,'leather',.62);
  if(d.q)for(const x of [-11.7,11.7])box(b,[x,6.1,4.7],[1.1,.38,7.2],[114,121,108],d,'metal',.24);
  if(d.q===2){
   for(const x of[-9.6,9.6]){
    for(let n=0;n<5;n++)cyl(b,[x-1.55+n*.64,-6.35,10.75],[x-1.01+n*.64,-6.35,10.75],.43,n%2?STEEL:EDGE,{...d,s:12});
    for(const z of[2,7])bolt(b,[x,6.2,z],.24,d,[Math.PI/2,0,0]);
   }
   for(const x of[-11.2,11.2])for(const y of[-4.7,4.7])box(b,[x,y,.42],[3.5,2.6,.84],[49,55,48],d,'leather',.3);
   for(let n=0;n<11;n++)box(b,[-6.4+n*1.28,8.60,8.3],[.10,.055,1.16],[34,39,34],{...d,q:0},'leather');
  }
 }else{
  box(b,[0,0,h-.3],[w+.4,depth+.4,2.4],[190,195,179],d,'paint',.7);
  for(const side of [-1,1]){const y=side*(depth/2+.12);box(b,[0,y,h*.53],[1.74,.2,7.5],RED,d,'paint',.08);box(b,[0,y,h*.53],[6,.22,2.18],RED,d,'paint',.08);if(d.q)for(const x of [-w*.34,w*.34]){box(b,[x,y,h-2.6],[1.7,.55,4.1],STEEL,d,'metal',.3);box(b,[x,y+side*.32,h-2.7],[.85,.18,1.5],DARK,d,'metal',.1);if(d.q===2)for(const z of [2,h-5])bolt(b,[x,y+side*.15,z],.25,d,[Math.PI/2,0,0]);}}
  if(d.q===2)for(const x of [-w*.37,w*.37])cyl(b,[x-1.6,-depth/2-.15,h-1.4],[x+1.6,-depth/2-.15,h-1.4],.45,STEEL,{...d,s:8});
 }
}
function bottle(b,d,frame){
 // Heavy cobalt-blue glass: rounded base, shoulder, tubular neck, rolled lip.
 const profile=[[0,2.8],[.25,3.32],[.7,3.96],[1.7,4.94],[3.0,5.44],[4.3,5.48],[5.6,5.22],[7.0,4.66],
  [8.0,3.85],[8.9,2.72],[9.8,1.86],[10.5,1.64],[13.8,1.64],[14.05,1.85],[14.35,2.11],[14.75,2.12],[15.0,1.97]];
 b.lathe([0,0,0],d.q?profile:[profile[0],profile[3],profile[5],profile[9],profile[12],profile.at(-1)],
  [7,17,153],{segments:d.s,material:{kind:'glass',roughness:.12,scale:1},smoothProfile:true,cap:false});
 // Thick glass has an actual annular throat, with the cork seated inside it.
 ring(b,[0,0,14.78],1.75,.25,[24,36,179],d,'glass');
 cyl(b,[0,0,14.2],[0,0,16.6],1.49,[113,102,65],d,{kind:'wood',roughness:.89});
 cyl(b,[0,0,0],[0,0,.23],2.8,[7,13,91],d,'glass');
 if(d.q){ring(b,[0,0,1],3.72,.10,[15,26,113],d,'glass');ring(b,[0,0,15.65],1.49,.025,[78,72,42],d,'wood');}
 if(d.q===2)for(let i=0;i<5;i++){const a=i*2.3;ell(b,[Math.cos(a)*2.2,Math.sin(a)*2.2,3.5+(i%3)*1.1],[.12,.12,.19],[34,59,213],{...d,s:8,r:4},'glass',{emissive:.01*frame});}
}

function helmet(b,d){
 const outer=[[3.8,6.9],[4.3,7.02],[5,7.1],[6,7.02],[7,6.8],[8.0,6.36],[9,5.7],[10,4.85],[10.7,4],[11.4,2.8],[12,1.5],[12.3,0]];
 b.lathe([0,0,0],d.q?outer:[outer[0],outer[2],outer[4],outer[6],outer[8],outer.at(-1)],
  [118,118,104],{segments:d.s,material:{kind:'metal',roughness:.43},smoothProfile:true,cap:false});
 // A real inner bowl remains visible below the brim from oblique viewpoints.
 const inner=new MeshBuilder().lathe([0,0,0],[[3.8,6.36],[5.0,6.52],[7,6.23],[9,5.05],[10.7,3.18],[11.7,0]],
  [55,60,53],{segments:d.s,material:'leather',smoothProfile:true,cap:false}).finish('helmet-liner'),v=inner.vertices;
 for(let i=0;i<v.length;i+=51){const offsets=[i,i+34,i+17];
  b.triangle(...offsets.map(j=>Array.from(v.slice(j,j+3))),[55,60,53],
   {material:'leather',normals:offsets.map(j=>Array.from(v.slice(j+3,j+6)).map(x=>-x))});
 }
 ring(b,[0,0,4],6.76,.33,[79,83,72],d,'metal');
 box(b,[0,5.6,3.7],[8,.7,3.7],DARK,d,'plain',.6);
 for(const side of[-1,1]){
  box(b,[side*5.55,2.9,2.3],[2.2,4.8,4.6],[96,101,87],d,'metal',.7,{rotation:[0,side*.2,side*.12]});
  if(d.q)bolt(b,[side*6.6,2.7,3.4],.32,d,[0,Math.PI/2,0]);
 }
 box(b,[0,6.1,2.8],[1.25,1.1,4.9],[135,132,106],d,'metal',.5);
 if(d.q===2){
  const seam=new MeshBuilder(),rows=[];
  for(let i=0;i<9;i++){const a=-1.3+i*.325;rows.push([0,6.1*Math.sin(a),6.6+5.75*Math.cos(a),.10,.12]);}
  loft(seam,rows,[139,139,119],{segments:8,steps:30,material:{kind:'metal',roughness:.38}});b.add(seam.finish('helmet-seam'));
 }
}

function armor(b,d,blue,frame){
 const c=blue?[17,33,167]:[47,157,26],hi=blue?[28,47,195]:[70,181,37],dark=blue?[7,17,73]:[21,75,14];
 // Cast breastplate: paired pectoral volumes, sternum, waist taper, shoulder
 // saddles, rolled neck edge and a continuous inner surface of real thickness.
 const profile=[[7.5,3.5,0,0],[7.9,3.8,1.3,0],[7.9,3.8,2.0,0],[8.1,3.7,4.7,0],
  [8.65,4.3,6.2,0],[9.0,4.1,7.1,0],[9.55,4.7,9.7,0],[9.7,4.8,12.1,0],
  [9.5,4.7,15.3,2.3],[6.8,3.5,16.1,3.3],[3.8,2.45,15.1,3.1],[3.8,2.45,14.4,3.1],
  [6.15,2.8,13.6,2.5],[7.35,3.1,9.8,0],[6.9,2.7,1.0,0],[7.5,3.5,0,0]],n=[8,20,48][d.q],sub=[1,2,3][d.q],steps=(profile.length-1)*sub;
 const value=(t,k)=>{
  const q=Math.max(0,Math.min(profile.length-1,t)),i=Math.min(profile.length-2,Math.floor(q)),u=q-i,
   a=profile[Math.max(0,i-1)][k],bb=profile[i][k],c=profile[i+1][k],dd=profile[Math.min(profile.length-1,i+2)][k];
  return d.q?.5*((2*bb)+(-a+c)*u+(2*a-5*bb+4*c-dd)*u*u+(-a+3*bb-3*c+dd)*u*u*u):bb+(c-bb)*u;
 };
 const point=(t,angle)=>{
  const r=value(t,0),depth=value(t,1),z=value(t,2),drop=value(t,3),sn=Math.sin(angle),front=Math.max(0,sn),
   chest=t<9?Math.exp(-(((z-10.8)/3.4)**2))*(sn>0?2.35:.8)*(.14+.86*Math.sin(2*angle)**2):0,
   sternum=t<9?.26*Math.exp(-((Math.cos(angle)/.20)**2))*front*Math.exp(-(((z-10)/5)**2)):0;
  const dent=t<9?-.10*Math.exp(-1*((angle-1.04)/.16)**2-((z-10.0)/1.4)**2)
   -.07*Math.exp(-1*((angle-2.08)/.13)**2-((z-7.9)/.8)**2):0;
  return[r*Math.cos(angle),sn*(depth+chest+sternum+dent),z-drop*front];
 };
 const sample=(t,a)=>{
  const p=point(t,a),a0=point(t,a-.001),a1=point(t,a+.001),p0=point(Math.max(0,t-.001),a),p1=point(Math.min(15,t+.001),a),
   u=a1.map((v,k)=>v-a0[k]),v=p1.map((x,k)=>x-p0[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  return{p,n:normal};
 };
 for(let row=0;row<steps;row++)for(let i=0;i<n;i++){
  const t=row/sub,a=sample(t,i*TAU/n),z=sample(t,(i+1)*TAU/n),q=sample((row+1)/sub,(i+1)*TAU/n),p=sample((row+1)/sub,i*TAU/n),color=t>=11?dark:t>=8?hi:c;
  b.triangle(a.p,z.p,q.p,color,{material:{kind:'paint',roughness:.41},normals:[a.n,z.n,q.n]});
  b.triangle(a.p,q.p,p.p,color,{material:{kind:'paint',roughness:.41},normals:[a.n,q.n,p.n]});
 }
 for(const side of[-1,1]){
  const shoulder=new MeshBuilder();
  loft(shoulder,[[0,-3.8,-.45,2.7,.32],[0,-2.7,.05,3.8,.68],[0,0,.32,4.15,.92],
   [0,2.7,.05,3.8,.68],[0,3.8,-.45,2.7,.32]],hi,{segments:[8,12,24][d.q],steps:[3,6,14][d.q],sectionPower:2.2,material:{kind:'paint',roughness:.43}});
  b.add(shoulder.finish('shoulder-shell'),{translation:[side*10.4,-.1,14.7],rotation:[0,side*.30,0]});
  if(d.q){box(b,[side*9.0,-2.0,7.0],[.55,2.8,9],dark,d,'leather',.2,{rotation:[0,side*.14,0]});box(b,[side*9.4,-1.8,7.6],[.75,3.2,1.55],[76,82,63],d,'metal',.2);}
  if(d.q===2){for(const y of[-2.1,2.1])bolt(b,[side*8.65,y,16.75],.25,d);for(const z of[3.6,10.6])bolt(b,[side*9.1,-3.5,z],.22,d,[Math.PI/2,0,0]);}
 }
 if(d.q)for(let i=0;i<n;i++){const a=point(1,i*TAU/n),z=point(1,(i+1)*TAU/n);line(b,a,z,.10,hi,d,'paint');}
}

const GLYPHS={A:[[0,0,1,4],[1,4,2,0],[.5,2,1.5,2]],M:[[0,0,0,4],[0,4,1,2],[1,2,2,4],[2,4,2,0]],O:[[0,0,0,4],[0,4,2,4],[2,4,2,0],[2,0,0,0]],S:[[2,4,0,4],[0,4,0,2],[0,2,2,2],[2,2,2,0],[2,0,0,0]],H:[[0,0,0,4],[2,0,2,4],[0,2,2,2]],E:[[0,0,0,4],[0,4,2,4],[0,2,1.6,2],[0,0,2,0]],L:[[0,4,0,0],[0,0,2,0]]};
function lettering(b,text,p,scale,c){const start=p[0]-(text.length*3-1)*scale/2;[...text].forEach((ch,i)=>{for(const[ax,az,bx,bz]of GLYPHS[ch]||[]){const dx=(bx-ax)*scale,dz=(bz-az)*scale;b.box([start+(i*3+(ax+bx)/2)*scale,p[1],p[2]+(az+bz)*scale/2],[.36*scale,.12,Math.hypot(dx,dz)+.2*scale],c,{material:'paint',rotation:[0,Math.atan2(dx,dz),0]});}});}
function cartridge(b,p,d,scale=1){const q=new MeshBuilder();q.lathe([0,0,0],[[0,.75],[.25,.83],[.45,.72],[2.1,.72],[2.35,.59],[3,.43],[3.6,.05]],BRASS,{segments:d.q?10:5,material:'metal'});b.add(q.finish('cartridge'),{translation:p,scale});}
function clip(b,d){box(b,[0,0,4.5],[6,3.6,9],[81,89,79],d,'metal',.55);box(b,[0,0,.65],[7,4.2,1.3],[47,54,47],d,'metal',.25);for(const x of [-2,0,2]){box(b,[x,1.85,4.6],[.64,.24,6.4],DARK,d,'metal',.12);cartridge(b,[x,0,7.8],d,.75);}if(d.q){for(const x of [-2.7,2.7])box(b,[x,0,9],[.55,3.9,1],STEEL,d,'metal',.18);for(let i=0;i<3;i++)box(b,[0,-1.85,2.2+i*1.9],[4.5,.18,.22],[126,132,117],d,'metal',.05);}}
function ammo(b,d){box(b,[0,0,6.3],[28,12,12.6],[51,69,28],d,'paint',.75);box(b,[0,0,13.6],[29.4,13.4,2.8],[75,95,39],d,'paint',.65);if(d.q){for(const x of [-12.8,12.8])box(b,[x,0,6],[.9,12.4,10.5],[34,48,21],d,'metal',.17);box(b,[0,6.3,11.7],[2.7,.85,4.1],BRASS,d,'metal',.3);box(b,[0,6.79,11.4],[1,.15,1.5],DARK,d,'metal',.1);lettering(b,'AMMO',[0,6.15,3.6],1.1,[150,128,65]);}if(d.q===2){for(const x of [-12,12])for(const z of [2,10])bolt(b,[x,6.24,z],.25,d,[Math.PI/2,0,0]);for(const x of [-6,6])box(b,[x,0,15.4],[1.2,1.6,1.8],STEEL,d,'metal',.3);box(b,[0,0,16],[12.7,1.5,1],DARK,d,'metal',.3);}}
function shell(b,p,d,scale=1){const q=new MeshBuilder();q.lathe([0,0,0],[[0,1.1],[.3,1.25],[4.8,1.25],[5,1.28]],[160,23,11],{segments:d.q?12:6,material:'paint'});q.lathe([0,0,0],[[4.8,1.28],[5.1,1.4],[5.4,1.3],[6.8,1.3],[7,1.38],[7.2,1.38]],BRASS,{segments:d.q?12:6,material:'metal'});if(d.q){q.cylinder([0,0,7.21],[0,0,7.26],.43,[100,73,31],{segments:8,material:'metal'});q.torus([0,0,7.24],.58,.05,[230,184,72],{segments:12,sections:4,material:'metal'});}b.add(q.finish('shell'),{translation:p,scale});}
function shellBox(b,d){box(b,[0,0,4.8],[32,11,9.6],[123,127,114],d,'paint',.45);box(b,[-5,0,10.1],[21.7,11.7,1.3],[173,177,160],d,'paint',.35);box(b,[10.6,0,8],[10.2,11.3,5.4],[120,82,40],d,'wood',.3);if(d.q){const label=new MeshBuilder();lettering(label,'SHELLS',[0,0,0],.97,[47,51,43]);b.add(label.finish('shell-box-label'),{translation:[-5.6,5.65,2.4],rotation:[0,0,Math.PI]});box(b,[10.6,0,10.8],[9.1,9.8,.2],[61,41,21],d,'wood',.05);}for(let i=0;i<3;i++)shell(b,[7.7+i*2.9,0,9.1],d,.7);}
function body(b,d,family){
 buildRemains(b,d.q,family);
}
function flame(b,d,center,radius,frame,blast){
 const bright=frame<2?[255,208,70]:frame<4?[238,86,8]:[157,27,4];ell(b,center,[radius*.72,radius*.72,radius*.9],bright,d,'glow',{emissive:1});
 for(let i=0;i<(d.q?7:3);i++){const a=i*2.399+frame*.38,r=radius*(.46+.08*(i%3)),p=[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r,center[2]+Math.sin(a*2)*radius*.36];ell(b,p,[radius*.34,radius*.37,radius*.48],i%2?[236-frame*12,54,4]:[255-frame*14,129-frame*18,8],{...d,s:d.q?10:5,r:d.q?5:3},'glow',{emissive:1});}
 if(blast&&d.q)for(let i=0;i<5;i++){const a=i*2.4+frame*.3;box(b,[Math.cos(a)*radius*.9,Math.sin(a)*radius*.9,center[2]+Math.sin(a)*radius*.4],[2.3,.7,5.5],i%2?STEEL:[89,101,55],d,'metal',.2,{rotation:[a,a*.7,frame]});}
}
const KEY_BLUE=[38,66,168],KEY_YELLOW=[198,170,34],KEY_RED=[170,34,30];
function keyCard(b,d,colour){
  box(b,[0,0,8.4],[9.6,2.8,13],colour,d,'metal',.45);
  box(b,[3.1,0,1.7],[13.4,3.2,3.4],colour,d,'metal',.28);
  for(const x of[5.4,7.0,8.6])box(b,[x,0,1.0],[.8,3.5,1.7],DARK,d,'metal',.06);
  ring(b,[-2.6,0,14.2],1.9,.45,[176,178,168],d,'metal');
  box(b,[0,1.55,9.6],[6.2,.3,4.6],[226,220,178],d,'paint',.08);
  if(d.q===2)for(const x of[-1.9,0,1.9])box(b,[x,1.7,9.6],[.55,.1,3.2],[44,48,42],d,'paint',.02);
  if(d.q)box(b,[0,0,14.9],[9.8,3.0,.7],[210,206,190],d,'metal',.1);
}
function rocketPack(b,d){
  box(b,[0,0,5.2],[21,11,10.4],[72,82,56],d,'paint',.5);
  box(b,[0,0,10.9],[22,12,1.4],[94,106,72],d,'paint',.4);
  for(const x of[-6.4,0,6.4]){
    b.lathe([x,0,11.6],[[0,2.1],[3.4,2.1],[4.1,1.5],[5.4,.5],[5.9,0]],[128,134,120],{segments:d.q?12:6,material:'metal'});
    cyl(b,[x,0,11.6],[x,0,13.6],2.1,[96,104,88],d,'metal');
  }
  if(d.q){lettering(b,'ROCK',[0,5.6,4.4],1.05,BRASS);for(const x of[-9.4,9.4])box(b,[x,0,5.4],[1.1,11.4,9.6],[48,57,38],d,'metal',.16);}
  if(d.q===2)for(const x of[-9.4,9.4])for(const z of[2.4,8.4])bolt(b,[x,5.7,z],.26,d,[Math.PI/2,0,0]);
}
function soulsphere(b,d,frame){
  const pulse=1+.05*Math.sin(frame*1.6);
  ell(b,[0,0,10.5],[7.4*pulse,7.4*pulse,7.4*pulse],[198,44,26],d,'glass',{emissive:.45+.2*(frame%2)});
  ell(b,[0,0,10.5],[3.6,3.6,3.6],[255,198,128],d,'glow',{emissive:1});
  if(d.q)ring(b,[0,0,10.5],7.5*pulse,.42,[236,126,64],d,'glass');
  for(let i=0;i<6;i++){const a=i*TAU/6,c=Math.cos(a),s=Math.sin(a);
    line(b,[c*6.4,s*6.4,10.5],[c*9.4,s*9.4,10.5],.5,[214,74,40],d,'glass');}
  if(d.q===2)for(let i=0;i<4;i++){const a=i*TAU/4+TAU/8;
    line(b,[Math.cos(a)*5.6,Math.sin(a)*5.6,5.2],[Math.cos(a)*7.6,Math.sin(a)*7.6,3.4],.4,[184,52,30],d,'glass');}
}
function backpack(b,d){
  box(b,[0,0,7.5],[19,10,15],[64,74,52],d,'leather',.7);
  box(b,[0,-1.2,12.6],[19.6,10.8,4.6],[82,94,66],d,'leather',.5);
  box(b,[0,5.3,6.2],[13,1.2,9],[46,54,40],d,'leather',.3);
  for(const x of[-5.4,5.4]){box(b,[x,-5.2,13.4],[3.4,1.4,1.6],STEEL,d,'metal',.3);
    box(b,[x,-5.6,7.5],[3.8,1.2,11],[38,44,34],d,'leather',.2);}
  if(d.q){for(const x of[-7,7])box(b,[x,0,15.2],[4.4,9.4,.9],[96,108,78],d,'leather',.2);
    for(let i=0;i<5;i++)box(b,[-6+i*3,-5.85,4.4],[1.1,.2,1.1],[150,140,96],d,'metal',.1);}
  if(d.q===2)for(const x of[-9.6,9.6])for(const z of[3,11])bolt(b,[x,5.1,z],.24,d,[Math.PI/2,0,0]);
}
function candlestick(b,d){
  b.lathe([0,0,0],d.q?[[0,5.2],[.6,5.4],[1.4,4.4],[2.2,2.2],[2.8,1.6],[10,1.5],[10.8,2.4],[11.6,2.6]]
    :[[0,5.2],[2.2,2.2],[10,1.5],[11.6,2.6]],[150,124,52],{segments:d.s,material:'metal'});
  cyl(b,[0,0,11.6],[0,0,19.4],1.9,[214,204,168],d,'paint');
  flame(b,d,[0,0,19.4],1.5,4.6,0,false);
  if(d.q===2)ring(b,[0,0,11.9],2.5,.2,BRASS,d,'metal');
}
function megasuit(b,d){
  box(b,[0,0,14],[15,11,28],[58,120,74],d,'paint',.6);
  b.lathe([0,0,28],[[0,6.4],[1.2,6.6],[3.4,6.2],[5.2,5.4],[6.6,4.2]],[74,140,88],{segments:d.s,material:'paint'});
  ell(b,[0,0,36],[5.6,5.8,5.4],[86,158,102],d,'paint');
  box(b,[0,4.6,36],[7.4,.6,3.6],[198,226,180],d,'glass',.1,{emissive:.2});
  for(const x of[-8.4,8.4])cyl(b,[x,0,6],[x,0,24],2.6,[58,120,74],d,'paint');
  for(const x of[-4.4,4.4])cyl(b,[x,0,0],[x,0,7],3.2,[44,96,60],d,'paint');
  if(d.q){ring(b,[0,0,28.4],6.2,.4,STEEL,d);lettering(b,'SUIT',[0,5.7,12],.9,[214,236,200]);}
}
function visor(b,d){
  box(b,[0,0,3],[14,4,2.4],[52,58,54],d,'metal',.4);
  for(const x of[-4,4]){box(b,[x,1.4,3.4],[5.6,1.4,4.4],[38,44,42],d,'metal',.3);
    box(b,[x,2.2,3.4],[4.6,.5,3.4],[86,196,120],d,'glass',.1,{emissive:.35});}
  if(d.q)for(const x of[-7.4,7.4])box(b,[x,-.6,3],[1.6,3.4,1.8],[36,40,38],d,'metal',.2);
}
function missionMap(b,d){
  box(b,[0,0,10],[14,1.2,19],[216,210,184],d,'paint',.2);
  for(const z of[3,17])cyl(b,[0,-.9,z],[0,.9,z],1.1,[126,110,74],d,'wood');
  if(d.q){for(const y of[-4,0,4])box(b,[0,.7,y],[11,.12,.5],[74,86,110],d,'paint',.02);
    box(b,[2,.75,10],[6,.12,6],[150,60,48],d,'paint',.02);}
}
function bucket(b,d){
  b.lathe([0,0,0],[[0,5],[.5,5.4],[7,7.2],[7.6,7.6],[8.2,7.2]],[176,178,168],{segments:d.s,material:'metal'});
  ring(b,[0,0,8.2],7.2,.35,STEEL,d,'metal');
  for(const y of[-1,1])line(b,[0,y*6.4,8.2],[0,y*6.4,13],.3,STEEL,d,'metal');
  line(b,[0,-6.4,13],[0,6.4,13],.3,STEEL,d,'metal');
  box(b,[0,7.5,4.4],[.4,3.6,1.4],RED,d,'paint',.05);
  box(b,[0,7.5,4.4],[3.6,.4,1.4],RED,d,'paint',.05);
  if(d.q)for(let i=0;i<3;i++){const a=i*TAU/3;bolt(b,[6.6*Math.cos(a),6.6*Math.sin(a),2],.24,d);}
}
function berserkFist(b,d){
  box(b,[0,0,7],[9,10,12],[176,132,96],d,'skin',.9);
  for(const x of[-3,0,3])box(b,[x,3.6,12.4],[2.8,3.2,3.4],[188,144,106],d,'skin',.5);
  box(b,[0,-4.2,4],[9.4,1.6,5],[64,72,58],d,'leather',.4);
  if(d.q)for(const x of[-3,0,3])box(b,[x,5.1,12.6],[2.4,.3,2.6],[120,26,18],d,'paint',.05);
}
function chaingunPickup(b,d){
  box(b,[0,0,4.4],[6.4,15,6.6],[52,58,62],d,'metal',.5);
  box(b,[0,-6.6,2.2],[4.8,6.6,4],[36,41,44],d,'metal',.4);
  for(let i=0;i<3;i++){const a=i*TAU/3;
    cyl(b,[Math.cos(a)*2.1,7,8.8+Math.sin(a)*2.1],[Math.cos(a)*2.1,21,8.8+Math.sin(a)*2.1],1.3,[74,80,84],d,'metal');}
  ring(b,[0,21,8.8],3.4,.5,STEEL,d,'metal');
  cyl(b,[-4.4,2.4,7.2],[-4.4,2.4,13.8],3.4,[62,68,72],d,'metal');
  box(b,[0,9.4,4],[2.4,3.4,3.4],[40,45,48],d,'metal',.3);
  if(d.q){for(let i=0;i<6;i++)box(b,[-4.4,2.4,8+i*.9],[3.7,.42,.42],[178,150,64],d,'metal',.05);
    for(const x of[-2,0,2])box(b,[x,-3.4,7.9],[1.2,4.4,.4],[126,132,132],d,'metal',.04);
    lettering(b,'MG',[0,-7.7,4.6],.8,[196,200,196]);}
}
function launcherPickup(b,d){
  cyl(b,[0,0,9],[0,26,9],3.6,[58,64,68],d,'metal');
  cyl(b,[0,26,9],[0,30,9],2.7,[44,49,52],d,'metal');
  box(b,[0,-3.4,4.6],[4.4,6,4.6],[40,45,48],d,'metal',.4);
  box(b,[0,4.4,1.6],[3.4,7,2.6],[168,86,26],d,'paint',.3);
  cyl(b,[0,20,17],[0,29,17],2.2,[142,72,36],d,'paint');
  ell(b,[0,30.4,17],[1.6,2.4,2.2],[176,96,44],d,'paint');
  for(let i=0;i<3;i++){const f=new MeshBuilder();f.box([0,0,2.4],[.3,3.4,4.8],[126,64,32],{material:'paint'});
    b.add(f.finish('launcher-fin'),{translation:[0,24,17],rotation:[i*TAU/3,0,0]});}
  if(d.q){ring(b,[0,26,9],3.8,.4,BRASS,d,'metal');lettering(b,'RL',[0,-6.6,6.4],.8,[226,226,214]);}
}
function chainsawPickup(b,d){
  box(b,[0,0,5],[7,11,8],[168,86,26],d,'paint',.6);
  box(b,[0,7.4,5.4],[5.4,2.6,5],[54,58,60],d,'metal',.4);
  box(b,[0,14,6.6],[3.4,12,1.6],[150,156,156],d,'metal',.2);
  if(d.q)for(let i=0;i<9;i++)box(b,[(i%2?1:-1)*1.5,8.8+i*1.2,7.6],[.7,.7,.5],[196,200,198],d,'metal',.05);
  box(b,[0,-1.2,10.2],[7.6,7.4,1.2],[64,68,70],d,'metal',.3);
  cyl(b,[-4.4,-1.2,10.2],[4.4,-1.2,10.2],1.1,[46,50,52],d,'metal');
  if(d.q)lettering(b,'SAW',[0,-6.3,6.4],.8,[226,226,214]);
}
function rocketMissile(b,d){
  cyl(b,[0,0,0],[0,14,0],2.6,[136,72,34],d,'paint');
  ell(b,[0,16,0],[1.9,3.4,1.9],[176,96,44],d,'paint');
  cyl(b,[0,-2.2,0],[0,0,0],3,[54,58,60],d,'metal');
  ring(b,[0,4,0],2.8,.3,BRASS,d,'metal');
  for(let i=0;i<3;i++){const f=new MeshBuilder();f.box([0,-1.4,2],[.25,3,2.6],[126,64,32],{material:'paint'});
    b.add(f.finish('rocket-fin'),{rotation:[i*TAU/3,0,0]});}
}
function build(family,frame,key,q){
 const b=new MeshBuilder(),d=cfg(q);if(family==='BAR1')barrel(b,d,frame);else if(family==='COLU')lamp(b,d);else if(family==='ELEC')tech(b,d);else if(family==='CBRA')candles(b,d,frame);else if(family==='STIM'||family==='MEDI')medical(b,d,family==='MEDI');else if(family==='BON1')bottle(b,d,frame);else if(family==='BON2')helmet(b,d);else if(family==='ARM1'||family==='ARM2')armor(b,d,family==='ARM2',frame);else if(family==='CLIP')clip(b,d);else if(family==='AMMO')ammo(b,d);else if(family==='SHEL')for(const x of [-4.5,-1.5,1.5,4.5])shell(b,[x,0,0],d);else if(family==='SBOX')shellBox(b,d);else if(family==='SHOT')b.add(worldShotgunMesh(q),{rotation:[0,0,-Math.PI/2]});else if(family==='BKEY')keyCard(b,d,KEY_BLUE);else if(family==='YKEY')keyCard(b,d,KEY_YELLOW);else if(family==='RKEY')keyCard(b,d,KEY_RED);else if(family==='ROCK')rocketPack(b,d);else if(family==='SOUL')soulsphere(b,d,frame);else if(family==='BPAK')backpack(b,d);else if(family==='CAND')candlestick(b,d);else if(family==='SUIT')megasuit(b,d);else if(family==='PVIS')visor(b,d);else if(family==='PMAP')missionMap(b,d);else if(family==='BROK')bucket(b,d);else if(family==='PINS')berserkFist(b,d);else if(family==='MGUN')chaingunPickup(b,d);else if(family==='LAUN')launcherPickup(b,d);else if(family==='CSAW')chainsawPickup(b,d);else if(family==='MISL')rocketMissile(b,d);else if(['PLAYW','PLAYN','POL5'].includes(family))body(b,d,family);else if(family==='BAL1')flame(b,d,[0,0,0],frame<2?7.3:13+(frame-2)*4,frame,false);else if(family==='BEXP'){if(frame===0){barrel(b,d,0);ell(b,[0,0,31],[5,5,5],[255,163,24],d,'glow',{emissive:1});}else flame(b,d,[0,0,17+frame*2],10+frame*4,frame,true);}const m=ageSurface(b.finish(key),family);m.detail=q;return family==='BAL1'?m:ground(m);
}
export function objectMesh(entity,time=0,detail=2){
 if(!entity||entity.removed||entity.enemy)return null;const sprite=String(entity.sprite||'').toUpperCase();let family=sprite.startsWith('PLAY')?sprite.slice(0,5):sprite.slice(0,4);if(!family)family=entity.projectile?'BAL1':TYPES[entity.type];if(entity.barrel&&entity.state==='exploding')family='BEXP';if(!FAMILIES.has(family))return null;let frame=0;
 if(family==='BEXP')frame=clamp(sprite.startsWith('BEXP')?sprite.charCodeAt(4)-65:Math.floor((entity.stateTime||0)*10),0,4);else if(family==='BAL1')frame=clamp(sprite.startsWith('BAL1')?sprite.charCodeAt(4)-65:entity.alive===false?2:0,0,4);else if(['BAR1','BON1','ARM1','ARM2'].includes(family))frame=clamp((sprite.charCodeAt(4)||65)-65,0,family==='BON1'?3:1);else if(family==='SOUL')frame=clamp((sprite.charCodeAt(4)||65)-65,0,3);else if(family==='CBRA')frame=Math.floor((Number.isFinite(time)?Math.max(0,time):0)*8)%4;
 const q=clamp(Math.round(Number.isFinite(detail)?detail:2),0,2),key=`object:${family}:${frame}:d${q}`;return remember(key,()=>build(family,frame,key,q));
}
export function proceduralObjectCacheStats(){const w=weaponCacheStats();return{entries:cache.size+w.entries,limit:LIMIT+w.limit,bytes:cacheBytes+w.bytes,byteLimit:BYTE_LIMIT+w.byteLimit,objects:{entries:cache.size,limit:LIMIT,bytes:cacheBytes,byteLimit:BYTE_LIMIT},weapons:w};}
