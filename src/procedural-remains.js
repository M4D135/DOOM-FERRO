/** Analytically reconstructed PLAYN, PLAYW and POL5 remains.
 * The original silhouettes inform the poses: PLAYN is a fallen green marine;
 * PLAYW is a low, torn mass with green fragments, not another intact body.
 * No source picture or sampled mesh is part of this module. */
import {MeshBuilder} from './procedural-mesh.js';
import {implicitMesh,smoothUnion,ellipsoidDistance,loft} from './procedural-object-sculpt.js';

const TAU=Math.PI*2,GREEN=[36,100,28],SKIN=[126,87,63],CLOTH=[69,72,54],LEATHER=[39,36,29];
const opts=q=>({segments:[6,10,18][q],steps:[2,5,12][q]});
const ball=(b,p,r,c,q,material='skin')=>b.ellipsoid(p,r,c,{segments:[6,10,18][q],rings:[3,5,8][q],material});
const box=(b,p,s,c,q,material='metal',rotation=[0,0,0])=>b.roundedBox(p,s,Math.min(.25,...s.map(x=>x*.27)),c,{bevelSegments:q===2?2:1,material,rotation});

/** A closed, uneven meniscus, with coagulated edges. It has thickness and an
 * irregular perimeter even when seen from the side; it is not a flat decal. */
function pool(b,q,rx,ry){
 const n=[12,28,56][q],edge=(i,z)=>{
  const a=i*TAU/n,r=.89+.07*Math.sin(a*5+.8)+.04*Math.cos(a*9-1.2);
  return[Math.cos(a)*rx*r,Math.sin(a)*ry*r,z];
 };
 for(let i=0;i<n;i++){
  const a=edge(i,.045),c=edge(i+1,.045),u=edge(i,0),v=edge(i+1,0),colour=[51+(i%4)*2,5,4];
  b.triangle([0,0,.10],a,c,colour,{material:{kind:'blood',roughness:.67}});
  b.triangle([0,0,0],v,u,[39,4,3],{material:'blood'});
  b.triangle(a,u,v,colour,{material:'blood'});b.triangle(a,v,c,colour,{material:'blood'});
 }
}

function slackHand(b,q,x,y,z,side){
 ball(b,[x,y,z],[1.35,1.9,.66],SKIN,q,{kind:'skin',roughness:.8});
 if(q<2)return;
 for(let f=0;f<4;f++){
  const dx=(f-1.5)*.48,len=1.15+(f===1?.35:f===2?.2:0);
  loft(b,[[x+dx,y-.8,z,.27,.26],[x+dx+.12*side,y-1.4,z-.13,.26,.24],
   [x+dx+.2*side,y-1.0-len,z-.25,.19,.18]],SKIN,
   {segments:q===2?7:5,steps:q===2?5:2,material:{kind:'skin',roughness:.81}});
 }
 loft(b,[[x+side,y+.3,z,.44,.35],[x+side*1.65,y-.25,z-.1,.35,.3],[x+side*1.6,y-.9,z-.22,.23,.2]],
  SKIN,{segments:q===2?8:5,steps:q===2?5:2,material:'skin'});
}

function marineHelmet(b,q){
 const h=new MeshBuilder();
 // The broad grey helmet, dark inset visor and chin frame are recognizable in
 // PLAYN. The unseen rear is reconstructed as the same pressed metal shell.
 ball(h,[0,0,1.3],[3.20,2.85,3.35],SKIN,q,{kind:'skin',roughness:.83});
 h.lathe([0,0,0],[[-1.8,1.55],[-1.0,2.9],[.2,3.4],[.8,3.55],[2.5,3.6],[4.1,2.8],[4.7,.9]],
  [98,102,89],{segments:[6,12,22][q],material:{kind:'paint',roughness:.68},smoothProfile:true});
 if(!q)box(h,[0,3.12,1.95],[5.65,.63,2.0],[13,18,17],q,{kind:'glass',roughness:.32});
 else{
  const band=(lo,hi,inside,outside,colour,material)=>{
   const n=q===2?18:8,point=(i,r,z)=>{const a=-.92+i*1.84/n;return[Math.sin(a)*r,Math.cos(a)*r,z];};
   for(let i=0;i<n;i++){
    const a=point(i,outside,lo),c=point(i+1,outside,lo),u=point(i,outside,hi),v=point(i+1,outside,hi),
     p=point(i,inside,lo),r=point(i+1,inside,lo),s=point(i,inside,hi),t=point(i+1,inside,hi);
    for(const [aa,bb,cc,dd]of[[a,u,v,c],[p,r,t,s],[u,s,t,v],[a,c,r,p]]){
     h.triangle(aa,bb,cc,colour,{material});h.triangle(aa,cc,dd,colour,{material});
    }
    if(i===0){h.triangle(a,p,s,colour,{material});h.triangle(a,s,u,colour,{material});}
    if(i===n-1){h.triangle(c,v,t,colour,{material});h.triangle(c,t,r,colour,{material});}
   }
  };
  band(.65,2.8,3.54,3.68,[12,18,16],{kind:'glass',roughness:.24});
  band(2.8,3.15,3.45,3.79,[121,125,106],{kind:'metal',roughness:.63});
  band(.30,.72,3.42,3.77,[94,98,83],{kind:'metal',roughness:.73});
 }
 if(q){
  for(const side of[-1,1]){
   box(h,[side*3.0,2.55,1.5],[.5,.9,2.75],[110,113,97],q,{kind:'metal',roughness:.64},[0,side*.08,0]);
  }
  box(h,[0,3.43,.5],[2.1,.08,.18],[35,37,30],q,'metal');
 }
 b.add(h.finish('fallen-marine-helmet'),{translation:[-.7,13.7,3.9],rotation:[1.34,-.28,-.15],scale:.91});
}

function marine(b,q){
 const d=opts(q);pool(b,q,8.5,22.5);
 // Body weight flattens the armour and cloth against the floor. Shoulder and
 // hip axes are deliberately offset; the two arms and legs have different poses.
 loft(b,[[.8,-7.2,3.5,3.4,2.45],[.6,-3,3.8,4.4,2.7],[0,3.3,4.3,5.9,3.2],[-.55,8.5,4.0,5.0,2.7]],
  q?CLOTH:GREEN,{...d,material:{kind:'cloth',roughness:.98},displace:(a,t)=>q?.026*Math.sin(a*5+t*17)*Math.sin(Math.PI*t):0});
 if(q){
  loft(b,[[.6,-2.7,4.35,4.25,2.65],[.1,1.1,4.7,5.35,3.0],[-.25,5.7,4.5,5.55,2.9],[-.6,8.1,4.2,4.7,2.5]],
   GREEN,{...d,steps:q===2?14:5,material:{kind:'paint',roughness:.74},sectionPower:2.5,
    displace:(a,t)=>-.025*Math.exp(-1*((t-.47)/.18)**2)*Math.cos(a*2)
      -.062*Math.exp(-1*(Math.cos(a)/.21)**2)*Math.max(0,Math.sin(a))*Math.sin(Math.PI*t)+.009*Math.sin(a*7+t*9)});
  for(const [x,y,z,ry]of[[-5.4,7.5,4.1,.16],[4.6,7.9,3.7,-.23]])
   b.ellipsoid([x,y,z],[2.55,2.6,1.45],GREEN,{segments:d.segments,rings:q===2?7:4,rotation:[0,ry,.1],material:{kind:'paint',roughness:.72}});
 }
 const legs=[[[ -2.6,-6.1,3.5,2.6,2.45],[-3.8,-13.8,2.8,2.25,2.2],[-5.6,-21.7,2.1,1.65,1.65]],
             [[  2.7,-6.0,3.4,2.5,2.35],[5.1,-12.9,3.3,2.2,2.15],[6.2,-20.3,2.0,1.65,1.6]]];
 for(let k=0;k<2;k++){
  const rows=legs[k],ankle=rows[2],side=k?1:-1;
  loft(b,rows,[36,76,28],{...d,steps:[2,6,16][q],material:{kind:'cloth',roughness:.98},
   displace:(a,t)=>q?.038*Math.sin(t*22+Math.sin(a*2)*1.7)*(.3+.7*Math.exp(-1*((t-.55)/.24)**2)):0});
  loft(b,[[ankle[0],ankle[1]+1.2,ankle[2],1.85,1.7],[ankle[0]+side*.3,ankle[1]-1.5,1.8,2.0,1.6],
   [ankle[0]+side*.7,ankle[1]-4.4,1.3,2.1,1.05],[ankle[0]+side*.8,ankle[1]-5.2,1.25,1.5,.85]],
   LEATHER,{...d,steps:[2,4,8][q],sectionPower:2.9,material:{kind:'leather',roughness:.89}});
  if(q){
   loft(b,[[ankle[0],ankle[1]+.3,.6,1.75,.22],[ankle[0]+side*.5,ankle[1]-3.0,.48,2.0,.22],
    [ankle[0]+side*.8,ankle[1]-5.1,.50,1.5,.22]],[20,22,18],{segments:q===2?14:8,steps:q===2?6:3,sectionPower:3,material:'leather'});
   if(q===2)for(let n=0;n<5;n++)box(b,[ankle[0]+side*.15,ankle[1]-.25-n*.47,3.2-n*.06],[2.6,.16,.13],[62,58,45],q,'leather');
  }
 }
 const arms=[[[ -4.8,7.7,3.8,1.95,1.65],[-8.0,2.4,2.5,1.6,1.35],[-7.0,-3.6,1.65,1.05,.8]],
             [[  4.5,8.2,3.3,1.9,1.6],[8.2,5.3,2.4,1.5,1.3],[11.0,2.8,1.5,1.02,.75]]];
 for(let k=0;k<2;k++){
  const rows=arms[k],end=rows[2];
  loft(b,rows,SKIN,{...d,steps:[2,4,10][q],material:{kind:'skin',roughness:.83}});
  if(q){
   loft(b,[rows[0],[...(rows[0].slice(0,3).map((v,i)=>v+(rows[1][i]-v)*.52)),1.95,1.65]],CLOTH,
    {segments:d.segments,steps:q===2?6:3,material:'cloth',displace:(a,t)=>.025*Math.sin(a*4+t*11)});
   slackHand(b,q,end[0],end[1]-.7,1.17,k?1:-1);
  }
 }
 if(q){
  box(b,[.6,-4.8,6.24],[8.35,1.15,.38],LEATHER,q,'leather',[0,0,-.05]);
  box(b,[.25,-4.77,6.5],[1.3,1.35,.2],[82,79,59],q,{kind:'metal',roughness:.65});
  for(const x of[-3,3.6])box(b,[x,-4.5,5.9],[1.5,2,1.5],[53,48,32],q,'leather',[0,.12,0]);
 }
 marineHelmet(b,q);
 // The blood stays at the head and beneath the chest, as in PLAYN, instead of
 // repainting the complete green armour as a second red corpse archetype.
 ball(b,[-.9,14.6,.11],[4.2,3.1,.09],[65,7,4],q,{kind:'blood',roughness:.58});
}

function tornRemains(b,q,family){
 const gibbed=family==='PLAYW',length=gibbed?24:19;pool(b,q,gibbed?7.1:5.8,length);
 const forms=gibbed?[
  [-1,-17,1.3,3.7,5.4,1.25],[1.5,-9.0,1.8,4.7,5.8,1.7],[-1.1,-1.7,1.6,5.9,5.2,1.5],
  [1.4,5.1,2.1,5.0,5.0,2.0],[-1.0,12.8,1.55,4.2,5.4,1.5],[2.0,18.0,1.0,2.4,3.7,.95]]:
  [[0,-13,1.0,3.4,5.8,.9],[-1,-5,1.4,4.5,5.5,1.25],[1,2.3,1.8,4.2,5.3,1.65],[-.5,9.4,1.25,3.6,5.2,1.1]];
 if(!q){for(const [x,y,z,rx,ry,rz]of forms)ball(b,[x,y,z],[rx,ry,rz],[113,14,9],0,{kind:'blood',roughness:.4});}
 else{
  const distance=(x,y,z)=>{
   let d=1e3;for(const p of forms)d=smoothUnion(d,ellipsoidDistance(x,y,z,p.slice(0,3),p.slice(3)),.95);
   if(gibbed)for(const p of[[-1,-8.5,3.05],[2.0,4,3.6],[-1,12.6,2.8]])
    d=Math.max(d,-ellipsoidDistance(x,y,z,p,[1.45,2.05,1.08]));
   const top=Math.max(0,Math.min(1,z*.4));
   return d+.15*top*Math.sin(x*2.2+Math.sin(y*.8))*Math.sin(y*1.7+z*1.1);
  };
  b.add(implicitMesh('coalesced-'+family,{bounds:[[-9,-length-2,-.35],[9,length+2,5.2]],resolution:q===2?[40,62,18]:[18,28,8],distance,
   color:(x,y,z)=>{const shade=.69+.08*Math.min(z,3)+.11*Math.sin(x*.65+y*.41)+.06*Math.cos(y*1.4-z);return[105*shade,13*shade,9*shade];},
   material:{kind:'blood',roughness:.57}}));
 }
 if(gibbed){
  for(const [side,y,height]of[[-1,-10,8.7],[1,-6.5,10.1],[-1,13,7.3]]){
   const strip=new MeshBuilder();
   loft(strip,[[side*2.4,y,1.8,1.9,.72],[side*3.5,y+1.5,height*.54,1.55,.62],[side*3.0,y+3.1,height, .90,.39]],
    [121,43,32],{segments:[5,8,12][q],steps:[2,5,9][q],sectionPower:3.4,material:{kind:'blood',roughness:.64},
     displace:(a,t)=>q?.05*Math.sin(a*3+t*8):0});
   const m=strip.finish('torn-rib'),v=m.vertices;
   for(let i=0;i<v.length;i+=17)if(v[i+2]>height*.72){const t=Math.min(1,(v[i+2]/height-.72)/.28);for(let k=0;k<3;k++)v[i+6+k]+=( [145,123,96][k]/255-v[i+6+k])*t*.84;v[i+10]=.77;}
   b.add(m);
  }
  if(q){
   for(const [x,y,z,rz]of[[-4,-15,2.0,.45],[3.6,-2.1,2.7,-.3],[-3.7,6.6,2.3,.7],[2.2,16.5,3.0,-.6]])
    box(b,[x,y,z],[2.7,3.7,.52],[39,80,25],q,{kind:'paint',roughness:.83},[.25,.3,rz]);
   box(b,[-2.5,15.9,6.9],[3.3,3.0,1.4],[111,111,91],q,{kind:'metal',roughness:.79},[.15,.25,-.4]);
  }
 }
 if(q===2)for(let i=0;i<(gibbed?7:5);i++){
  const y=-length*.7+i*length*.22,x=Math.sin(i*2.1)*3.1;
  loft(b,[[x,y,2.0,.42,.27],[x+.9,y+.7,3.1,.37,.25],[x+.2,y+1.5,2.35,.3,.22]],
   [137,27,18],{segments:8,steps:6,material:{kind:'blood',roughness:.46},displace:(a,t)=>.055*Math.sin(a*2+t*12)});
 }
}

export function buildRemains(builder,quality,family){
 const b=new MeshBuilder();if(family==='PLAYN')marine(b,quality);else tornRemains(b,quality,family);
 builder.add(b.finish('remains:'+family),{rotation:[0,0,-Math.PI/2]});
}
