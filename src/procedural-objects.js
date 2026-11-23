/** Detailed Doom-reference props. Every surface is generated geometry/material. */
import {MeshBuilder} from './procedural-mesh.js';
import {weaponMesh,worldShotgunMesh,weaponCacheStats} from './procedural-weapons.js';
export {weaponMesh};
const TAU=Math.PI*2,cache=new Map(),LIMIT=96,BYTE_LIMIT=12*1024*1024;
let cacheBytes=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TYPES={2035:'BAR1',2028:'COLU',48:'ELEC',35:'CBRA',10:'PLAYW',12:'PLAYW',15:'PLAYN',24:'POL5',2011:'STIM',2012:'MEDI',2014:'BON1',2015:'BON2',2018:'ARM1',2019:'ARM2',2007:'CLIP',2048:'AMMO',2008:'SHEL',2049:'SBOX',2001:'SHOT'};
const FAMILIES=new Set([...Object.values(TYPES),'BAL1','BEXP']);
const DARK=[27,31,28],STEEL=[108,113,105],EDGE=[153,159,142],RED=[169,13,7],BRASS=[182,133,49];
const cfg=q=>({q,s:[7,12,20][q],r:[3,5,8][q],thin:[4,6,8][q]});
function remember(key,make){
 if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);return v;}
 const m=make();while(cache.size&&(cache.size>=LIMIT||cacheBytes+m.vertices.byteLength>BYTE_LIMIT)){const k=cache.keys().next().value;cacheBytes-=cache.get(k).vertices.byteLength;cache.delete(k);}
 cache.set(key,m);cacheBytes+=m.vertices.byteLength;return m;
}
const cyl=(b,a,z,r,c,d,material='metal',extra={})=>b.cylinder(a,z,r,c,{segments:d.s,material,...extra});
const ell=(b,p,r,c,d,material='paint',extra={})=>b.ellipsoid(p,r,c,{segments:d.s,rings:d.r,material,...extra});
const box=(b,p,s,c,d,material='paint',bevel=.3,extra={})=>d.q?b.roundedBox(p,s,Math.min(bevel,...s.map(x=>x*.42)),c,{material,bevelSegments:1,...extra}):b.box(p,s,c,{material,...extra});
const ring=(b,p,r,t,c,d,material='metal',extra={})=>b.torus(p,r,t,c,{segments:d.s,sections:d.q===2?6:4,material,...extra});
function line(b,a,z,r,c,d,material='metal'){return b.cylinder(a,z,r,c,{segments:d.thin,material});}
function ground(m){return Math.abs(m.bounds.min[2])<1e-6?m:new MeshBuilder().add(m,{translation:[0,0,-m.bounds.min[2]]}).finish(m.key);}
function bolt(b,p,r,d,rotation=[0,0,0]){
 const h=new MeshBuilder();h.cylinder([0,0,-.08],[0,0,.12],r,EDGE,{segments:d.q===2?6:4,material:'metal'});
 if(d.q===2)h.box([0,0,.14],[r*1.4,.09,.05],DARK,{material:'metal'});
 b.add(h.finish('bolt'),{translation:p,rotation});
}
function barrel(b,d,frame){
 const profile=d.q?[[0,9.65],[.5,10.4],[1.5,10.5],[2.3,9.8],[7.9,9.7],[8.5,10.25],[9.3,10.6],[10.2,10.4],[10.9,9.7],[20,9.7],[20.7,10.45],[21.5,10.6],[22.4,10.3],[23,9.65],[29.5,9.6],[30.2,10.1]]:[[0,10.5],[2,9.8],[29.7,9.8],[30.2,10.3]];
 b.lathe([0,0,0],profile,[104,112,75],{segments:d.s,material:'paint'});
 for(const z of [1,9.4,21.5])ring(b,[0,0,z],10.3,d.q?.35:.22,[67,75,48],d,'metal');
 ring(b,[0,0,31.1],9.95,.85,[144,153,121],d,'metal');
 cyl(b,[0,0,30.3],[0,0,30.6],9.2,[45,77,22],d,'glass',{emissive:.02});
 if(d.q){
  for(let i=0;i<(d.q===2?8:4);i++){const a=i*2.399,r=2+i*.66;ell(b,[Math.cos(a)*r,Math.sin(a)*r,30.7],[.5+(i%3)*.25,.5+(i%3)*.25,.1+((i+frame)%3)*.1],[103,140,56],{...d,s:8,r:3},'glass');}
  for(let i=0;i<8;i++){const a=i*TAU/8,rr=9.8;box(b,[Math.cos(a)*rr,Math.sin(a)*rr,15.2+(i%3)],[.11,.42,3.5+(i%4)],i%2?[53,69,29]:[121,81,35],d,'paint',.04,{rotation:[0,0,a]});}
 }
 if(d.q===2){for(const z of [8.6,21])for(let i=0;i<8;i++){const a=i*TAU/8;bolt(b,[10.5*Math.cos(a),10.5*Math.sin(a),z],.22,d,[Math.PI/2,0,a+Math.PI/2]);}for(const z of [3.2,28.1])ring(b,[0,0,z],9.75,.08,[168,168,126],d,'metal');}
}
function lamp(b,d){
 b.lathe([0,0,0],d.q?[[0,11.7],[.7,12],[2.1,9.4],[3,8],[4.3,7.8],[4.6,5.4],[6.8,5.2],[7.3,4.1],[9.6,3.7],[39.2,3.7],[40,5.8],[41,6.2]]:[[0,12],[3,7],[7,4],[40,4],[41,6.2]],DARK,{segments:d.s,material:'metal'});
 cyl(b,[0,0,41],[0,0,45.8],5.8,[249,243,132],d,'glass',{emissive:.9});
 b.lathe([0,0,0],[[45.8,6.2],[46.6,6.2],[47.4,4.8],[48,3.8]],[47,52,40],{segments:d.s,material:'metal'});
 if(d.q){for(const z of [3.1,4.8,7.2,40.7,46])ring(b,[0,0,z],z<10?(z<4?8:5.3):6,.17,STEEL,d);for(let i=0;i<(d.q===2?8:4);i++){const a=i*TAU/(d.q===2?8:4);line(b,[3.75*Math.cos(a),3.75*Math.sin(a),9],[3.75*Math.cos(a),3.75*Math.sin(a),39],.12,[75,80,69],d);}}
 if(d.q===2)for(let i=0;i<4;i++){const a=i*TAU/4;bolt(b,[7.2*Math.cos(a),7.2*Math.sin(a),2.1],.34,d);line(b,[5.8*Math.cos(a),5.8*Math.sin(a),41],[5.8*Math.cos(a),5.8*Math.sin(a),45.6],.12,[88,88,58],d);}
}
function tech(b,d){
 b.lathe([0,0,0],[[0,14.5],[1.2,15],[5.5,15],[6.1,12],[31.5,12],[33.3,13.5],[35,14],[38,14]],[59,64,59],{segments:d.s,material:'metal'});
 b.lathe([0,0,0],[[122,14],[123,15],[127.2,15],[128,14.6]],DARK,{segments:d.s,material:'metal'});
 const bars=d.q===2?8:4;for(let i=0;i<bars;i++){const a=i*TAU/bars;line(b,[12*Math.cos(a),12*Math.sin(a),37],[12*Math.cos(a),12*Math.sin(a),123],d.q?.62:.9,[48,54,48],d);}
 if(d.q){
  for(const z of [6.8,32.5,36,122.8,126])ring(b,[0,0,z],z<30?12.1:14,.28,EDGE,d,'metal',{sections:4});
  const wires=d.q===2?12:5;for(let i=0;i<wires;i++){const a=i*2.4,r=4.3+(i%4)*1.5,p=[Math.cos(a)*r,Math.sin(a)*r,39],q=[Math.cos(a+.2)*(r+1),Math.sin(a+.2)*(r+1),78],z=[Math.cos(a-.1)*r,Math.sin(a-.1)*r,122];line(b,p,q,.27,i%3?[129,134,121]:[57,64,51],d);line(b,q,z,.27,i%3?[129,134,121]:[57,64,51],d);}
  for(let i=0;i<(d.q===2?14:6);i++){const a=i*2.25,z=43+(i*17)%73,r=6.1,p=[Math.cos(a)*r,Math.sin(a)*r,z];box(b,p,[4.5,.7,4.6],i%3?[90,103,70]:[162,167,148],d,'paint',.1,{rotation:[0,0,a]});if(d.q===2){box(b,[p[0],p[1]+.55,z],[2.1,.7,2.2],[27,32,28],d,'metal',.12,{rotation:[0,0,a]});for(const s of [-1,1])line(b,[p[0]+s*1.6,p[1],z-1.7],[p[0]+s*1.6,p[1],z+1.7],.12,EDGE,d);}}
 }
 if(d.q===2)for(let i=0;i<10;i++){const a=i*TAU/10;line(b,[12.04*Math.cos(a),12.04*Math.sin(a),8],[12.04*Math.cos(a),12.04*Math.sin(a),30],.13,[117,124,112],d);}
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
  const outline=(x,y,z)=>[[-x+.8,-y,z],[x-.8,-y,z],[x,-y+.8,z],[x,y-.8,z],[x-.8,y,z],[-x+.8,y,z],[-x,y-.8,z],[-x,-y+.8,z]];
  const lo=outline(13.8,6.45,10.8),hi=outline(11.9,3.9,18.1);
  for(let i=0;i<8;i++){const j=(i+1)%8,c=i===3?[181,186,171]:[169,174,160];b.triangle(lo[i],lo[j],hi[j],c,{material:'paint'});b.triangle(lo[i],hi[j],hi[i],c,{material:'paint'});b.triangle([0,0,10.8],lo[j],lo[i],[118,125,112],{material:'paint'});b.triangle([0,0,18.1],hi[i],hi[j],[194,200,183],{material:'paint'});}
  const angle=Math.atan2(2.55,7.3),crossY=6.45-(14.3-10.8)*2.55/7.3+.12;
  for(const [cw,ch]of[[2.0,6.0],[6.8,1.9]])box(b,[0,crossY,14.3],[cw,.18,ch],RED,d,'paint',.07,{rotation:[angle,0,0]});
  box(b,[0,0,10.65],[27.7,12.7,.55],[98,106,93],d,'metal',.2);
  for(const x of [-9.2,9.2]){box(b,[x,6.25,9.2],[3.0,.7,3.2],[159,137,83],d,'metal',.35,{rotation:[0,x>0?-.15:.15,0]});box(b,[x*.87,6.85,8.7],[1.4,1.6,2.3],STEEL,d,'metal',.3);if(d.q===2)bolt(b,[x,6.71,9.8],.26,d,[Math.PI/2,0,0]);}
  box(b,[0,7.7,8.3],[15.5,1.8,1.8],[43,49,42],d,'leather',.62);
  if(d.q)for(const x of [-11.7,11.7])box(b,[x,6.1,4.7],[1.1,.38,7.2],[114,121,108],d,'metal',.24);
  if(d.q===2)for(const x of [-9.6,9.6]){cyl(b,[x-1.5,-6.35,10.75],[x+1.5,-6.35,10.75],.45,STEEL,{...d,s:8});for(const z of [2,7])bolt(b,[x,6.2,z],.24,d,[Math.PI/2,0,0]);}
 }else{
  box(b,[0,0,h-.3],[w+.4,depth+.4,2.4],[190,195,179],d,'paint',.7);
  for(const side of [-1,1]){const y=side*(depth/2+.12);box(b,[0,y,h*.53],[1.74,.2,7.5],RED,d,'paint',.08);box(b,[0,y,h*.53],[6,.22,2.18],RED,d,'paint',.08);if(d.q)for(const x of [-w*.34,w*.34]){box(b,[x,y,h-2.6],[1.7,.55,4.1],STEEL,d,'metal',.3);box(b,[x,y+side*.32,h-2.7],[.85,.18,1.5],DARK,d,'metal',.1);if(d.q===2)for(const z of [2,h-5])bolt(b,[x,y+side*.15,z],.25,d,[Math.PI/2,0,0]);}}
  if(d.q===2)for(const x of [-w*.37,w*.37])cyl(b,[x-1.6,-depth/2-.15,h-1.4],[x+1.6,-depth/2-.15,h-1.4],.45,STEEL,{...d,s:8});
 }
}
function bottle(b,d,frame){
 b.lathe([0,0,0],[[0,2.8],[.5,3.6],[1.8,5],[4.2,5.5],[7,4.8],[9.4,2.4],[10.2,1.65],[14,1.65],[14.5,2.15],[15,2.15]],[7,17,153],{segments:d.s,material:{kind:'glass',roughness:.12,scale:1},smoothProfile:true});cyl(b,[0,0,14.8],[0,0,16.6],1.55,[114,111,72],d,'wood');
 if(d.q){ring(b,[0,0,14.5],1.84,.25,[30,43,191],d,'glass');ring(b,[0,0,1],3.72,.14,[15,26,113],d,'glass');}
 if(d.q===2)for(let i=0;i<5;i++){const a=i*2.3;ell(b,[Math.cos(a)*2.2,Math.sin(a)*2.2,3.5+(i%3)*1.1],[.18,.18,.22],[34,59,213],{...d,s:6,r:3},'glass',{emissive:.02*frame});}
}
function helmet(b,d){
 b.lathe([0,0,0],[[3.8,6.9],[5,7.1],[7,6.8],[9,5.7],[10.7,4],[12,1.5],[12.3,.1]],[118,118,104],{segments:d.s,material:'metal',smoothProfile:true});ring(b,[0,0,4],6.9,.45,[79,83,72],d,'metal');box(b,[0,5.6,3.7],[8,.7,3.7],DARK,d,'plain',.6);
 for(const side of [-1,1]){box(b,[side*5.55,2.9,2.3],[2.2,4.8,4.6],[96,101,87],d,'metal',.7,{rotation:[0,side*.2,side*.12]});if(d.q)bolt(b,[side*6.6,2.7,3.4],.32,d,[0,Math.PI/2,0]);}
 box(b,[0,6.1,2.8],[1.25,1.1,4.9],[135,132,106],d,'metal',.5);if(d.q===2)for(let i=0;i<8;i++){const a=-1.3+i*.37;line(b,[0,6.1*Math.sin(a),6.6+5.75*Math.cos(a)],[0,6.1*Math.sin(a+.34),6.6+5.75*Math.cos(a+.34)],.18,[151,146,119],d);}
}
function armor(b,d,blue,frame){
 const c=blue?[17,33,177]:[53,170,29],hi=blue?[28,47,214]:[77,199,41],dark=blue?[7,17,91]:[24,88,16];
 // A single curved breastplate and real hollow neckline, as in ARM1/ARM2.
 const profile=[[7.5,3.5,0,0],[7.9,3.8,1.3,0],[7.9,3.8,2.0,0],[8.1,3.7,4.7,0],[8.65,4.3,6.2,0],[9.0,4.1,7.1,0],[9.55,4.7,9.7,0],[9.7,4.8,12.1,0],[9.5,4.7,15.3,2.3],[6.8,3.5,16.1,3.3],[3.8,2.45,15.1,3.1],[3.8,2.45,14.4,3.1],[6.15,2.8,13.6,2.5],[7.35,3.1,9.8,0],[6.9,2.7,1.0,0],[7.5,3.5,0,0]],n=[8,16,36][d.q];
 const point=(row,i)=>{
  const[r,depth,z,drop]=profile[row],a=i*TAU/n,s=Math.sin(a),front=Math.max(0,s);
  const chest=row<9?Math.exp(-(((z-10)/3.0)**2))*(s>0?2.8:1.4)*(.18+.82*Math.sin(2*a)**2):0;
  return[r*Math.cos(a),s*(depth+chest),z-drop*front];
 };
 const normal=(row,i)=>{const prev=point(Math.max(0,row-1),i),next=point(Math.min(profile.length-1,row+1),i),a=point(row,i-1),z=point(row,i+1),u=z.map((v,k)=>v-a[k]),v=next.map((x,k)=>x-prev[k]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
 for(let row=0;row<profile.length-1;row++)for(let i=0;i<n;i++){
  const a=point(row,i),z=point(row,i+1),q=point(row+1,i+1),p=point(row+1,i),na=normal(row,i),nz=normal(row,i+1),nq=normal(row+1,i+1),np=normal(row+1,i),color=row>=11?dark:row>=8?hi:c;
  b.triangle(a,z,q,color,{material:'paint',normals:[na,nz,nq]});b.triangle(a,q,p,color,{material:'paint',normals:[na,nq,np]});
 }
 for(const side of [-1,1]){
  box(b,[side*10.9,-.1,15.2],[8.2,7.5,3.6],hi,d,'paint',1.65,{rotation:[0,side*.30,0]});
  if(d.q){box(b,[side*9.0,-2.0,7.0],[.55,2.8,9],dark,d,'leather',.2,{rotation:[0,side*.14,0]});box(b,[side*9.4,-1.8,7.6],[.75,3.2,1.55],[76,82,63],d,'metal',.2);}
  if(d.q===2){for(const y of [-2.1,2.1])bolt(b,[side*8.65,y,17.2],.25,d);for(const z of [3.6,10.6])bolt(b,[side*9.1,-3.5,z],.22,d,[Math.PI/2,0,0]);}
 }
 if(d.q)for(let i=0;i<n;i++){const a=point(1,i),z=point(1,i+1);line(b,a,z,.13,hi,d,'paint');}
}
const GLYPHS={A:[[0,0,1,4],[1,4,2,0],[.5,2,1.5,2]],M:[[0,0,0,4],[0,4,1,2],[1,2,2,4],[2,4,2,0]],O:[[0,0,0,4],[0,4,2,4],[2,4,2,0],[2,0,0,0]],S:[[2,4,0,4],[0,4,0,2],[0,2,2,2],[2,2,2,0],[2,0,0,0]],H:[[0,0,0,4],[2,0,2,4],[0,2,2,2]],E:[[0,0,0,4],[0,4,2,4],[0,2,1.6,2],[0,0,2,0]],L:[[0,4,0,0],[0,0,2,0]]};
function lettering(b,text,p,scale,c){const start=p[0]-(text.length*3-1)*scale/2;[...text].forEach((ch,i)=>{for(const[ax,az,bx,bz]of GLYPHS[ch]||[]){const dx=(bx-ax)*scale,dz=(bz-az)*scale;b.box([start+(i*3+(ax+bx)/2)*scale,p[1],p[2]+(az+bz)*scale/2],[.36*scale,.12,Math.hypot(dx,dz)+.2*scale],c,{material:'paint',rotation:[0,Math.atan2(dx,dz),0]});}});}
function cartridge(b,p,d,scale=1){const q=new MeshBuilder();q.lathe([0,0,0],[[0,.75],[.25,.83],[.45,.72],[2.1,.72],[2.35,.59],[3,.43],[3.6,.05]],BRASS,{segments:d.q?10:5,material:'metal'});b.add(q.finish('cartridge'),{translation:p,scale});}
function clip(b,d){box(b,[0,0,4.5],[6,3.6,9],[81,89,79],d,'metal',.55);box(b,[0,0,.65],[7,4.2,1.3],[47,54,47],d,'metal',.25);for(const x of [-2,0,2]){box(b,[x,1.85,4.6],[.64,.24,6.4],DARK,d,'metal',.12);cartridge(b,[x,0,7.8],d,.75);}if(d.q){for(const x of [-2.7,2.7])box(b,[x,0,9],[.55,3.9,1],STEEL,d,'metal',.18);for(let i=0;i<3;i++)box(b,[0,-1.85,2.2+i*1.9],[4.5,.18,.22],[126,132,117],d,'metal',.05);}}
function ammo(b,d){box(b,[0,0,6.3],[28,12,12.6],[51,69,28],d,'paint',.75);box(b,[0,0,13.6],[29.4,13.4,2.8],[75,95,39],d,'paint',.65);if(d.q){for(const x of [-12.8,12.8])box(b,[x,0,6],[.9,12.4,10.5],[34,48,21],d,'metal',.17);box(b,[0,6.3,11.7],[2.7,.85,4.1],BRASS,d,'metal',.3);box(b,[0,6.79,11.4],[1,.15,1.5],DARK,d,'metal',.1);lettering(b,'AMMO',[0,6.15,3.6],1.1,[150,128,65]);}if(d.q===2){for(const x of [-12,12])for(const z of [2,10])bolt(b,[x,6.24,z],.25,d,[Math.PI/2,0,0]);for(const x of [-6,6])box(b,[x,0,15.4],[1.2,1.6,1.8],STEEL,d,'metal',.3);box(b,[0,0,16],[12.7,1.5,1],DARK,d,'metal',.3);}}
function shell(b,p,d,scale=1){const q=new MeshBuilder();q.lathe([0,0,0],[[0,1.1],[.3,1.25],[4.8,1.25],[5,1.28]],[160,23,11],{segments:d.q?12:6,material:'paint'});q.lathe([0,0,0],[[4.8,1.28],[5.1,1.4],[5.4,1.3],[6.8,1.3],[7,1.38],[7.2,1.38]],BRASS,{segments:d.q?12:6,material:'metal'});if(d.q){q.cylinder([0,0,7.21],[0,0,7.26],.43,[100,73,31],{segments:8,material:'metal'});q.torus([0,0,7.24],.58,.05,[230,184,72],{segments:12,sections:4,material:'metal'});}b.add(q.finish('shell'),{translation:p,scale});}
function shellBox(b,d){box(b,[0,0,4.8],[32,11,9.6],[123,127,114],d,'paint',.45);box(b,[-5,0,10.1],[21.7,11.7,1.3],[173,177,160],d,'paint',.35);box(b,[10.6,0,8],[10.2,11.3,5.4],[120,82,40],d,'wood',.3);if(d.q){lettering(b,'SHELLS',[-5.6,5.65,2.4],.97,[47,51,43]);box(b,[10.6,0,10.8],[9.1,9.8,.2],[61,41,21],d,'wood',.05);}for(let i=0;i<3;i++)shell(b,[7.7+i*2.9,0,9.1],d,.7);}
function body(b,d,family){
 ell(b,[0,0,.35],[26,10,.35],[91,9,5],{...d,s:d.q?20:8,r:3},'blood');
 if(family==='POL5'){b.tube([-18,0,2],[16,0,2.5],[[0,2,1],[.25,4,1.5],[.5,5,2],[.8,3,1.6],[1,1.7,1]],[123,18,8],{segments:d.s,material:'blood',smoothProfile:true});for(let i=0;i<(d.q?5:2);i++)ell(b,[-12+i*6,Math.sin(i*2)*3,2.5],[3,2.1,1.6],[143-i*7,21,9],d,'blood');return;}
 const shirt=family==='PLAYN'?[48,113,27]:[114,27,12];b.tube([-10,0,4],[10,0,5.5],[[0,3.8,3.1],[.25,4.8,3.6],[.65,5.6,4.2],[1,4.2,3.6]],shirt,{segments:d.s,material:family==='PLAYN'?'cloth':'blood',smoothProfile:true});
 for(const side of [-1,1]){b.tube([-8,side*3,4],[-21,side*5,3],[[0,2.5,2.3],[.45,2.2,2.1],[1,1.8,1.7]],[43,99,24],{segments:d.s,material:'cloth',smoothProfile:true});box(b,[-23,side*5.2,2.5],[7,4.5,5],DARK,d,'leather',1.6);b.tube([7,side*4,5],[13,side*8,2.8],[[0,2.1,2.1],[.5,1.8,1.7],[1,1.4,1.3]],[151,99,58],{segments:d.s,material:'skin',smoothProfile:true});ell(b,[13.5,side*8.4,2],[2,2.3,1.3],[155,102,61],d,'skin');if(d.q===2)for(let f=0;f<4;f++)line(b,[13+f*.7,side*8.4,2],[14+f*.7,side*10.1,1.8],.24,[142,89,52],d,'skin');}
 ell(b,[15,0,5],[4,3.7,4],[164,117,73],d,'skin');ell(b,[15,-.5,7],[4.3,3.9,2.5],[48,92,24],d,'paint');if(d.q){box(b,[15,3.6,5.2],[3.8,.3,1.1],[46,25,15],d,'skin',.2);ell(b,[6,2,5],[4,2.6,1],[139,18,7],d,'blood');}if(family==='PLAYW')for(const side of [-1,1])for(const x of [-3,0,3])line(b,[x,side*1.5,7],[x+1,side*4.5,9.5],.45,[174,147,102],d,'bone');
}
function flame(b,d,center,radius,frame,blast){
 const bright=frame<2?[255,208,70]:frame<4?[238,86,8]:[157,27,4];ell(b,center,[radius*.72,radius*.72,radius*.9],bright,d,'glow',{emissive:1});
 for(let i=0;i<(d.q?7:3);i++){const a=i*2.399+frame*.38,r=radius*(.46+.08*(i%3)),p=[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r,center[2]+Math.sin(a*2)*radius*.36];ell(b,p,[radius*.34,radius*.37,radius*.48],i%2?[236-frame*12,54,4]:[255-frame*14,129-frame*18,8],{...d,s:d.q?10:5,r:d.q?5:3},'glow',{emissive:1});}
 if(blast&&d.q)for(let i=0;i<5;i++){const a=i*2.4+frame*.3;box(b,[Math.cos(a)*radius*.9,Math.sin(a)*radius*.9,center[2]+Math.sin(a)*radius*.4],[2.3,.7,5.5],i%2?STEEL:[89,101,55],d,'metal',.2,{rotation:[a,a*.7,frame]});}
}
function build(family,frame,key,q){
 const b=new MeshBuilder(),d=cfg(q);if(family==='BAR1')barrel(b,d,frame);else if(family==='COLU')lamp(b,d);else if(family==='ELEC')tech(b,d);else if(family==='CBRA')candles(b,d,frame);else if(family==='STIM'||family==='MEDI')medical(b,d,family==='MEDI');else if(family==='BON1')bottle(b,d,frame);else if(family==='BON2')helmet(b,d);else if(family==='ARM1'||family==='ARM2')armor(b,d,family==='ARM2',frame);else if(family==='CLIP')clip(b,d);else if(family==='AMMO')ammo(b,d);else if(family==='SHEL')for(const x of [-4.5,-1.5,1.5,4.5])shell(b,[x,0,0],d);else if(family==='SBOX')shellBox(b,d);else if(family==='SHOT')b.add(worldShotgunMesh(q),{rotation:[0,0,-Math.PI/2]});else if(['PLAYW','PLAYN','POL5'].includes(family))body(b,d,family);else if(family==='BAL1')flame(b,d,[0,0,0],frame<2?7.3:13+(frame-2)*4,frame,false);else if(family==='BEXP'){if(frame===0){barrel(b,d,0);ell(b,[0,0,31],[5,5,5],[255,163,24],d,'glow',{emissive:1});}else flame(b,d,[0,0,17+frame*2],10+frame*4,frame,true);}const m=b.finish(key);m.detail=q;return family==='BAL1'?m:ground(m);
}
export function objectMesh(entity,time=0,detail=2){
 if(!entity||entity.removed||entity.enemy)return null;const sprite=String(entity.sprite||'').toUpperCase();let family=sprite.startsWith('PLAY')?sprite.slice(0,5):sprite.slice(0,4);if(!family)family=entity.projectile?'BAL1':TYPES[entity.type];if(entity.barrel&&entity.state==='exploding')family='BEXP';if(!FAMILIES.has(family))return null;let frame=0;
 if(family==='BEXP')frame=clamp(sprite.startsWith('BEXP')?sprite.charCodeAt(4)-65:Math.floor((entity.stateTime||0)*10),0,4);else if(family==='BAL1')frame=clamp(sprite.startsWith('BAL1')?sprite.charCodeAt(4)-65:entity.alive===false?2:0,0,4);else if(['BAR1','BON1','ARM1','ARM2'].includes(family))frame=clamp((sprite.charCodeAt(4)||65)-65,0,family==='BON1'?3:1);else if(family==='CBRA')frame=Math.floor((Number.isFinite(time)?Math.max(0,time):0)*8)%4;
 const q=clamp(Math.round(Number.isFinite(detail)?detail:2),0,2),key=`object:${family}:${frame}:d${q}`;return remember(key,()=>build(family,frame,key,q));
}
export function proceduralObjectCacheStats(){const w=weaponCacheStats();return{entries:cache.size+w.entries,limit:LIMIT+w.limit,bytes:cacheBytes+w.bytes,byteLimit:BYTE_LIMIT+w.byteLimit,objects:{entries:cache.size,limit:LIMIT,bytes:cacheBytes,byteLimit:BYTE_LIMIT},weapons:w};}
