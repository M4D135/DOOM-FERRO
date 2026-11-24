/**
 * Anatomical, articulated Doom character recipes. Every silhouette and small
 * feature is a generated volume; materials are analytic, never sampled artwork.
 * Local axes are X right, Y forward, Z up. Authored view suffixes do not turn a
 * mesh towards the camera. Three geometric detail levels share the same rig.
 */
import {MeshBuilder, rotateEuler, MESH_VERTEX_STRIDE} from './procedural-mesh.js?v=0.5.0-c0b972f9f86b';
import {sculptedHead, anatomicalLoft, anatomicalSweep, tailoredPanel} from './procedural-anatomy.js?v=0.5.0-c0b972f9f86b';

const FAMILY = {3004:'POSS',9:'SPOS',3001:'TROO'};
const LIMIT_BYTES = 64 * 1024 * 1024, PART_BYTES = 32 * 1024 * 1024, LIMIT_ENTRIES = 768;
const cache = new Map(),parts = new Map(); let cacheBytes = 0,partBytes = 0,poseBuilds=0,partBuilds=0,partEvictions=0;
const TAU = Math.PI * 2;
const BONE = [202,185,145], BLOOD = [112,22,13], DARK_BLOOD = [57,10,7];
const METAL = [68,75,72], DARK_METAL = [25,30,28], EDGE = [120,128,120];
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = a => {const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const tone = (c,f) => c.map(v=>v*f);
const bell=(x,s)=>Math.exp(-((x/s)**2));
const level = value => clamp(Math.round(Number.isFinite(value)?value:2),0,2);
function remember(key, create) {
  const fixed=key.startsWith('part:'),collection=fixed?parts:cache;
  if(collection.has(key)) {const value=collection.get(key);collection.delete(key);collection.set(key,value);return value;}
  const value=create(),bytes=value.vertices.byteLength;
  if(fixed)partBuilds++;else poseBuilds++;
  while(collection.size&&((fixed?partBytes:cacheBytes)+bytes>PART_BYTES||collection.size>=(fixed?640:128))) {
    const oldest=collection.keys().next().value,oldBytes=collection.get(oldest).vertices.byteLength;
    if(fixed){partBytes-=oldBytes;partEvictions++;}else cacheBytes-=oldBytes;collection.delete(oldest);
  }
  collection.set(key,value);if(fixed)partBytes+=bytes;else cacheBytes+=bytes;return value;
}

/** Poses only copy and transform immutable vertices; no intermediate JS array. */
class PoseAssembler extends MeshBuilder {
  constructor(){super();this.parts=[];}
  add(mesh,options={}){this.parts.push({mesh,options});return this;}
  finish(key='articulated-character'){
    const chunks=this.parts.slice();if(this.data.length)chunks.unshift({mesh:super.finish('pose-details'),options:{}});
    const vertices=new Float32Array(chunks.reduce((n,p)=>n+p.mesh.vertices.length,0));
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let at=0;
    for(const {mesh,options}of chunks){
      const source=mesh.vertices,rotation=options.rotation||[0,0,0],translation=options.translation||[0,0,0];
      const scale=Array.isArray(options.scale)?options.scale:[options.scale??1,options.scale??1,options.scale??1];
      const [rx,ry,rz]=rotation,cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
      const m=[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];
      vertices.set(source,at);const uniform=scale[0]===scale[1]&&scale[1]===scale[2],bend=options.bend?bendFrame(options.bend):null,planes=bend?new Map():null;
      for(let i=0;i<source.length;i+=MESH_VERTEX_STRIDE){
        if(bend){
          const z=source[i+2];let plane=planes.get(z);
          if(!plane){
            plane=bendPlane(bend,z);const e=.002,lo=bendPlane(bend,Math.max(0,z-e)),hi=bendPlane(bend,Math.min(bend.length,z+e)),span=Math.min(bend.length,z+e)-Math.max(0,z-e);
            plane.dp=sub(hi.p,lo.p).map(x=>x/span);plane.du=sub(hi.u,lo.u).map(x=>x/span);plane.dv=sub(hi.v,lo.v).map(x=>x/span);planes.set(z,plane);
          }
          const {p,u,v,w}=plane,x=source[i],y=source[i+1],j=at+i;
          for(let k=0;k<3;k++)vertices[j+k]=p[k]+u[k]*x+v[k]*y;
          const jx=plane.dp[0]+plane.du[0]*x+plane.dv[0]*y,jy=plane.dp[1]+plane.du[1]*x+plane.dv[1]*y,jz=plane.dp[2]+plane.du[2]*x+plane.dv[2]*y,a=source[i+3],bb=source[i+4],c=source[i+5];
          let nx=(v[1]*jz-v[2]*jy)*a+(jy*u[2]-jz*u[1])*bb+w[0]*c,ny=(v[2]*jx-v[0]*jz)*a+(jz*u[0]-jx*u[2])*bb+w[1]*c,nz=(v[0]*jy-v[1]*jx)*a+(jx*u[1]-jy*u[0])*bb+w[2]*c;
          const inv=1/Math.hypot(nx,ny,nz);vertices[j+3]=nx*inv;vertices[j+4]=ny*inv;vertices[j+5]=nz*inv;
          for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[j+k]);max[k]=Math.max(max[k],vertices[j+k]);}
          continue;
        }
        const x=source[i]*scale[0],y=source[i+1]*scale[1],z=source[i+2]*scale[2],j=at+i;
        vertices[j]=m[0]*x+m[1]*y+m[2]*z+translation[0];vertices[j+1]=m[3]*x+m[4]*y+m[5]*z+translation[1];vertices[j+2]=m[6]*x+m[7]*y+m[8]*z+translation[2];
        const a=source[i+3]/scale[0],b=source[i+4]/scale[1],c=source[i+5]/scale[2];let nx=m[0]*a+m[1]*b+m[2]*c,ny=m[3]*a+m[4]*b+m[5]*c,nz=m[6]*a+m[7]*b+m[8]*c;
        const inv=uniform?Math.abs(scale[0]):1/Math.hypot(nx,ny,nz);vertices[j+3]=nx*inv;vertices[j+4]=ny*inv;vertices[j+5]=nz*inv;
        for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[j+k]);max[k]=Math.max(max[k],vertices[j+k]);}
      }
      // A coarse distance mesh can span the tight, hidden shoulder-root bend
      // with a single triangle. Keep its corner normal on the visible side
      // of that actual posed triangle, just as MeshBuilder does at a cap.
      if(bend)for(let j=at;j<at+source.length;j+=MESH_VERTEX_STRIDE*3){
        const s=MESH_VERTEX_STRIDE,ax=vertices[j+s]-vertices[j],ay=vertices[j+s+1]-vertices[j+1],az=vertices[j+s+2]-vertices[j+2],bx=vertices[j+2*s]-vertices[j],by=vertices[j+2*s+1]-vertices[j+1],bz=vertices[j+2*s+2]-vertices[j+2];
        const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,inv=1/Math.hypot(nx,ny,nz);
        for(let k=0;k<3;k++){const i=j+k*s+3;if(nx*vertices[i]+ny*vertices[i+1]+nz*vertices[i+2]<=0){vertices[i]=nx*inv;vertices[i+1]=ny*inv;vertices[i+2]=nz*inv;}}
      }
      at+=source.length;
    }
    return {key,vertices,stride:MESH_VERTEX_STRIDE,triangles:vertices.length/(3*MESH_VERTEX_STRIDE),bounds:{min,max}};
  }
}
// Smooth the orientation through a joint. Every ring is transformed once;
// thousands of duplicated triangle vertices reuse its tiny local frame.
function bendFrame(rig){
  const[a,b,c]=rig.points,first=unit(sub(b,a)),last=unit(sub(c,b)),reference=Math.abs(first[1])>.9?[0,0,1]:[0,1,0],u0=unit(cross(reference,first));
  let n=cross(first,last);if(Math.hypot(...n)<.0001)n=u0;else n=unit(n);
  const bin=cross(n,first),weightN=u0.reduce((s,x,k)=>s+x*n[k],0),weightB=u0.reduce((s,x,k)=>s+x*bin[k],0);
  return{...rig,n,weightN,weightB};
}
function bendPlane({points,length=24,joint=.52,n,weightN,weightB},z){
  const t=clamp(z/length,0,1),[a,b,c]=points,first=t<=joint,u=first?t/joint:(t-joint)/(1-joint);
  const start=first?a:b,end=first?b:c,delta=sub(end,start),span=Math.hypot(...delta),middle=unit(add(unit(sub(b,a)),unit(sub(c,b))));
  const m0=first?delta:middle.map(v=>v*span),m1=first?middle.map(v=>v*span):delta;
  const u2=u*u,u3=u2*u,p=start.map((v,k)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*m0[k]+(-2*u3+3*u2)*end[k]+(u3-u2)*m1[k]);
  const w=unit(start.map((v,k)=>(6*u2-6*u)*v+(3*u2-4*u+1)*m0[k]+(-6*u2+6*u)*end[k]+(3*u2-2*u)*m1[k]));
  const bin=cross(n,w),right=unit(n.map((x,k)=>x*weightN+bin[k]*weightB)),front=cross(w,right);
  return{p,u:right,v:front,w};
}
const partKey=(name,...values)=>'part:'+name+':'+JSON.stringify(values);
function along(from,to){const length=Math.hypot(...sub(to,from));return{translation:from,rotation:[0,Math.acos(clamp((to[2]-from[2])/length,-1,1)),Math.atan2(to[1]-from[1],to[0]-from[0])],scale:[1,1,length/10]};}
function ell(b,c,r,color,d,material='skin',extra={}) {
  const {rotation,...shape}=extra,key=partKey('ellipsoid',r,color,d,material,shape);
  const mesh=remember(key,()=>new MeshBuilder().ellipsoid([0,0,0],r,color,{segments:[6,10,20][d],rings:[3,5,9][d],material,...shape}).finish(key));
  return b.add(mesh,{translation:c,rotation});
}
function cylinder(b,a,z,r,color,d,material='skin',extra={}) {
  if(Math.hypot(...sub(z,a))<1e-8)return b;
  const key=partKey('cylinder',r,color,d,material,extra),mesh=remember(key,()=>new MeshBuilder().cylinder([0,0,0],[0,0,10],r,color,{segments:[5,8,12][d],material,...extra}).finish(key));
  return b.add(mesh,along(a,z));
}
function stroke(b,points,r,color,d,material='skin') {
  for(let i=1;i<points.length;i++)cylinder(b,points[i-1],points[i],r,color,Math.min(d,1),material);
}
function rounded(b,c,size,bevel,color,d,material='cloth',extra={}) {
  return d?b.roundedBox(c,size,bevel,color,{material,...extra}):b.box(c,size,color,{material,...extra});
}
function limb(b,a,z,radii,color,d,material='skin') {
  const key=partKey('limb',radii,color,d,material),mesh=remember(key,()=>new MeshBuilder().tube([0,0,0],[0,0,10],radii,color,{segments:[6,10,22][d],smoothProfile:true,material}).finish(key));
  return b.add(mesh,along(a,z));
}
function frameFor(entity,time,family) {
  const frames=family==='TROO'?'IJKLM':'HIJKL';
  let frame=typeof entity.sprite==='string'?entity.sprite[4]:null;
  if(entity.alive===false||entity.state==='dead'||entity.state==='dying') {
    if(!frames.includes(frame||'?'))frame=frames[Math.min(4,Math.floor(Math.max(0,entity.stateTime??.75)/.15))];
  }else if(!frame||!/^[A-Z]$/.test(frame)) {
    if(entity.state==='pain')frame=family==='TROO'?'H':'G';
    else if(entity.state==='attack')frame='F';
    else frame=entity.state==='chase'||entity.state==='walk'?'ABCD'[Math.floor(Math.max(0,time)*7)%4]:'A';
  }
  const dead=frames.includes(frame),pain=frame===(family==='TROO'?'H':'G');
  const attack=(family==='TROO'?'EFG':'EF').includes(frame),idle=!dead&&!pain&&!attack&&entity.state==='idle';
  const walk=Math.max(0,'ABCD'.indexOf(frame));
  return {frame,dead,pain,attack,idle,deathIndex:frames.indexOf(frame),
    step:dead?2.2:attack||pain?.7:idle?1:[.65,1,-.65,-1][walk]*4.1,
    lift:idle||attack||pain||dead?0:[0,1.7,0,-1.7][walk]};
}

/** The torso is one shaped surface, including pelvis, chest and trapezius. */
function torso(b,imp,color,d) {
  const profile=imp?
    [[23.4,5.8,3.0,3.2,-.7],[25.5,7.05,3.6,3.8,-.7],[27.3,7.55,3.9,4.0,-.7],[30.5,6.0,3.3,3.8,-.7],[34.5,6.8,3.9,4.7,-.6],[38.5,8.3,4.7,5.3,-.8],[41.7,9.8,4.6,5.3,-1.0],[43.8,9.2,4.1,5.2,-1.1],[46,5.7,3.1,4.8,-.8],[47.5,2.6,2.1,2.8,.2]]:
    [[23.8,5.5,3.0,3.1,-.4],[25.6,6.75,3.6,3.7,-.4],[27.0,7.10,3.75,3.8,-.35],[29.1,6.7,3.85,3.7,-.1],[32.5,7.2,4.0,3.9,0],[37.0,8.25,4.55,4.3,0],[40.9,8.7,4.45,4.25,-.1],[43.0,9.0,3.9,3.7,-.2],[44.0,8.0,2.85,3.1,-.25],[45.1,3.1,1.8,1.95,-.35],[45.6,1.85,1.45,1.55,-.35]];
  const deform=(p,a)=>{
    let[x,y,z]=p;const front=Math.max(0,Math.sin(a)),back=Math.max(0,-Math.sin(a)),ax=Math.abs(x);
    if(imp){
      // Pectorals, sternum, serratus, lower ribs, abdomen and scapulae remain
      // connected: only the single skin envelope is displaced.
      y+=front**4*(.73*bell(ax-3.8,2.6)*bell(z-39.4,2.3)-.34*bell(x,.72)*bell(z-38.1,5.4));
      y+=front**5*.33*bell(ax-2.0,1.2)*(bell(z-35.2,.9)+bell(z-33.0,.9)+bell(z-30.9,.9));
      y-=front**4*.20*bell(ax-4.65,.60)*bell(z-33.3,4.1);
      y+=front**3*.12*Math.cos((z+ax*.34)*3.3)*bell(ax-5.3,1.2)*bell(z-35,3.1);
      y-=back**3*(.34*bell(ax-4.3,2.1)*bell(z-41.4,2.7)-.18*bell(x,.65)*bell(z-38,6));
      x*=1+.025*bell(z-27.0,1.4)*Math.cos(a*4);
    }else{
      const waist=bell(z-30.0,2.4),armpit=bell(ax-6.7,1.4)*bell(z-38,3.1);
      const folds=.18*Math.sin(z*3.0+ax*.55)*waist+.10*Math.sin(z*2.1-ax*.8)*armpit;
      const frontSeam=-.045*bell(x,.16)*bell(z-36,6.9);
      y+=front**3*(folds+frontSeam)+back**3*.11*Math.sin(z*2.0+ax*.6)*waist;
      x*=1+.011*Math.sin(z*2.7+a*.8)*waist;
    }
    return[x,y,z];
  };
  const colours=(p,a)=>{
    const[x,y,z]=p,front=Math.max(0,Math.sin(a));let c=tone(color,.98+.018*Math.sin(z*.71+x*.45));
    if(!imp){
      if(z<28.5)c=familyPants(color);
      const edge=Math.sin(x*7.7+z*6.1)*.12+Math.sin(z*11.3)*.08;
      const wound=bell((x+.3)/(2.1+edge),1)*bell((z-39.7)/(2.7+edge),1)*front**12;
      c=mix(c,[83,26,20],clamp((wound-.19)*1.9,0,.92));
    }
    return c;
  };
  b.add(anatomicalLoft(profile,{detail:d,color,material:imp?'skin':'cloth',deform,colours,rows:[8,14,36][d],columns:[8,16,36][d],key:imp?'continuous-musculature':'draped-shirt'}));
}
function familyPants(shirt){return shirt[0]<80?[35,39,35]:[91,102,67];}

/** A reusable continuous limb, smoothly deformed through its actual joint. */
function jointedLimb(b,points,color,d,kind='arm',material='skin'){
  const leg=kind==='leg',imp=kind==='imp-leg'||kind==='imp-arm',isLeg=leg||kind==='imp-leg';
  const profile=isLeg?
    [[0,.42,.45,.45,0],[1.5,2.55,2.5,2.55,0],[3.5,3.40,3.3,3.4,0],[7,3.25,3.0,3.25,0],[11.3,2.65,2.75,2.8,0],[13,2.75,2.8,2.8,0],[16.5,3.05,2.65,3.05,0],[20.5,2.25,2.0,2.2,0],[24,2.1,1.95,2.05,0]]:
    [[0,2.75,2.65,2.75,0],[2,2.95,2.7,2.8,0],[5,2.75,2.55,2.7,0],[9,2.0,1.85,2.0,0],[11.0,2.05,1.85,2.0,0],[13.3,2.5,2.0,2.3,0],[16.2,2.1,1.8,2.0,0],[20,1.3,1.25,1.25,0]];
  if(imp)for(const p of profile){p[1]*=1.1;p[2]*=1.05;p[3]*=1.06;}
  if(kind==='imp-arm'){profile[0]=[0,.65,.65,.65,0];profile[1]=[2.8,3.15,2.85,2.95,0];}
  const key=partKey('continuous-limb',color,d,kind,material),length=isLeg?24:20;
  const mesh=remember(key,()=>anatomicalLoft(profile,{
    detail:d,color,material,rows:[8,12,24][d],columns:[6,10,18][d],key,
    deform:(p,a)=>{
      let[x,y,z]=p;
      if(material==='cloth'){
        const knee=bell(z-12,2.0),hem=bell(z-22.7,1.25),compression=.45+.55*Math.max(0,-Math.sin(a));
        const fold=.052*Math.sin(z*3.1+Math.sin(a)*2+Math.cos(a*2))*knee*compression+.032*Math.sin(z*5.4-a)*hem+.014*Math.cos(a*2)*bell(z-6,3.7);
        x*=1+fold;y*=1+fold;
      }else{
        const front=Math.max(0,Math.sin(a));
        y+=front**3*(.15*bell(z-(isLeg?4.7:4.4),2.5)-.14*bell(z-(isLeg?12:10),.48));
        y-=front**4*.055*bell(x,.21)*bell(z-(isLeg?17.4:15.0),3.0);
      }
      return[x,y,z];
    },colours:(p,a)=>{
      const[x,y,z]=p,front=Math.max(0,Math.sin(a));let c=tone(color,.97+.03*bell(z-5,3));
      if(material==='cloth'){
        c=tone(c,1-.10*bell(Math.abs(Math.cos(a))-.98,.06));
        const stain=bell(x-.5,1.1)*bell(z-4.5,2.1)*front**10;
        c=mix(c,[87,29,20],stain*.72);
      }return c;
    }
  }));
  b.add(mesh,{bend:{points,length,joint:isLeg?.51:.52}});
}

/** Thin irregular stains follow a material surface, without image decals. */
function wound(b,center,rx,rz,d,seed=0,depth=.12) {
  const n=[6,9,14][d],rim=[],back=[];
  for(let i=0;i<n;i++) {
    const a=i*TAU/n,r=.82+.13*Math.sin(i*2.73+seed)+.06*Math.sin(i*5.1-seed);
    rim.push([center[0]+Math.cos(a)*rx*r,center[1]+depth*(.7+.3*Math.cos(a*3)),center[2]+Math.sin(a)*rz*r]);
    back.push([rim[i][0],center[1]-.04,rim[i][2]]);
  }
  const top=[center[0],center[1]+depth,center[2]],bottom=[center[0],center[1]-.04,center[2]];
  for(let i=0;i<n;i++) {
    const next=(i+1)%n;
    b.triangle(top,rim[next],rim[i],BLOOD,{material:'blood'});
    b.triangle(bottom,back[i],back[next],DARK_BLOOD,{material:'blood'});
    b.triangle(rim[i],back[next],back[i],DARK_BLOOD,{material:'blood'});
    b.triangle(rim[i],rim[next],back[next],DARK_BLOOD,{material:'blood'});
  }
}
function humanHead(guard,d,dead) {
  return remember(`part:human-head:${guard}:${d}:${dead}`,()=>sculptedHead(guard,d,dead));
}

function firearm(guard,firing,d) {
  return remember(`part:firearm:${guard}:${firing}:${d}`,()=>{
    const b=new MeshBuilder(),wood=guard?[87,52,27]:[53,61,43];
    rounded(b,[0,-6.6,-.45],[3.5,6.5,3.8],.45,wood,d,guard?'wood':'paint',{rotation:[.1,0,0]});
    rounded(b,[0,-9.8,-.4],[3.7,.62,3.9],.18,DARK_METAL,d,'leather');
    rounded(b,[0,0,0],[3.15,7.5,3.1],.27,METAL,d,'metal');
    rounded(b,[0,-1.9,-2.6],[1.85,2.4,3.9],.28,DARK_METAL,d,'leather',{rotation:[-.22,0,0]});
    cylinder(b,[0,3.9,.6],[0,guard?18.7:21,.6],guard?1.02:.82,METAL,d,'metal');
    if(guard) {
      cylinder(b,[0,3.8,-1],[0,12.8,-1],.65,DARK_METAL,d,'metal');
      limb(b,[0,4.2,-.6],[0,9.6,-.6],[[0,1.35,1.25],[.12,1.65,1.4],[.88,1.65,1.4],[1,1.35,1.2]],wood,d,'wood');
      if(d)for(let i=0;i<5;i++)cylinder(b,[0,4.7+i*.95,-.6],[0,4.95+i*.95,-.6],1.67,[55,33,18],0,'wood');
    }else {
      rounded(b,[0,6,-.1],[2.5,5.2,2.6],.18,[39,46,38],d,'paint');
      rounded(b,[0,1.2,-3.2],[2.1,2.7,4.15],.2,DARK_METAL,d,'metal',{rotation:[-.14,0,0]});
      if(d)for(const side of [-1,1])for(let i=0;i<3;i++)rounded(b,[side*1.3,4.3+i*1.1,.1],[.12,.64,.55],.04,[9,13,11],1,'metal');
    }
    const end=guard?18.7:21;
    cylinder(b,[0,end+.01,.6],[0,end+.17,.6],guard?.73:.55,[7,10,8],d,'metal');
    if(d&&(d===2||guard)) {
      for(const y of [-2.9,1.9])for(const side of [-1,1])cylinder(b,[side*1.57,y,.4],[side*1.65,y,.4],.19,EDGE,0,'metal');
      rounded(b,[0,end-1.3,1.65],[.42,1.1,1.1],.07,EDGE,1,'metal');
      rounded(b,[0,1.1,1.62],[1.2,4,.3],.1,EDGE,1,'metal');
      stroke(b,[[1.55,-1.8,-1.55],[1.55,.8,-1.55],[1.55,1,-3.6],[1.55,-1.3,-3.6]],.18,METAL,0,'metal');
      b.box([1.58,.4,-.3],[.08,1.5,.55],[10,14,12],{material:'metal'});
      cylinder(b,[1.5,.5,.0],[2.3,.3,.1],.2,EDGE,0,'metal');
      if(d===2)for(const side of [-1,1])for(let z=0;z<4;z++)stroke(b,[[side*1.03,0.3,-2.1-z*.65],[side*1.03,2.3,-2.3-z*.65]],.055,[91,100,93],0,'metal');
    }
    if(firing) {
      b.cone([0,end+.2,.6],[0,end+6.7,.6],2.65,[255,144,22],{segments:[5,7,10][d],emissive:1,material:'glow'});
      ell(b,[0,end+2.1,.6],[1.15,2.45,1.15],[255,234,132],Math.max(0,d-1),'glow',{emissive:1});
    }
    return b.finish('detailed-infantry-weapon');
  });
}
function gripHands(b,d,skin,dead) {
  if(!d){
    ell(b,[1.6,-2.0,-2.0],[1.1,1.45,1.7],skin,0);
    ell(b,[0,7,-2.1],[1.95,1.75,1.0],skin,0);return;
  }
  // Palm and thenar volume taper into the wrist; the fingers are single swept
  // skins, with joint creases in their profile rather than beads at knuckles.
  b.add(anatomicalLoft([[-3.7,.56,.85,.80,-2.15],[-3.0,.80,1.1,.92,-2.05],[-1.7,1.0,1.30,1.12,-1.95],[-.55,.78,1.08,1.0,-1.90],[-.3,.30,.55,.55,-1.95]],{detail:d,color:skin,rows:[5,7,14][d],columns:[6,8,14][d]}),{translation:[1.65,0,0]});
  const fingers=d===2?4:3;
  for(let i=0;i<fingers;i++){
    const z=-.72-i*(fingers===4?.64:.94);
    const path=[[1.70,-1.05,z],[1.02,-.33,z-.08],[.05,-.28,z-.17],[-.67,-.7,z-.24],[-.76,-1.14,z-.27]];
    b.add(anatomicalSweep(path,[.31,.31,.285,.235,.12],{detail:d,color:skin,rows:d===2?14:6,columns:d===2?8:5,fold:d===2?.025:0}));
    if(d===2)stroke(b,[[.86,-.048,z+.14],[.71,-.025,z+.12],[.56,-.05,z+.08]],.018,tone(skin,.72),0);
  }
  b.add(anatomicalSweep([[2.0,-2.82,-1.18],[2.20,-2.24,-.36],[1.68,-1.55,.08],[.82,-1.20,-.02]],[.49,.43,.34,.15],{detail:d,color:skin,rows:d===2?14:6,columns:d===2?8:5}));
  ell(b,[0,7.05,-2.35],[1.80,1.86,.86],skin,d===2?1:0);
  for(let i=0;i<fingers;i++){
    const y=5.70+i*(fingers===4?.86:1.29),length=i===0?.90:i===3?.89:1;
    b.add(anatomicalSweep([[-1.38,y,-2.24],[-1.91,y,-1.17],[-1.94,y,.04],[-1.42,y,.63*length],[-.95,y,.60*length]],[.32,.33,.29,.245,.12],{detail:d,color:skin,rows:d===2?14:6,columns:d===2?8:5,fold:d===2?.025:0}));
    if(d===2)rounded(b,[-1.11,y,.675*length],[.30,.36,.045],.025,[158,129,107],1,'bone');
  }
  b.add(anatomicalSweep([[1.30,5.8,-2.25],[1.95,5.97,-1.25],[1.83,6.51,-.12],[1.38,7.07,.22]],[.48,.45,.35,.16],{detail:d,color:skin,rows:d===2?14:6,columns:d===2?8:5}));
}
function buildBoots(b,ankle,lift,d) {
  const leather=[91,36,25],shade=[48,27,22];
  rounded(b,[0,2.0,.58],[5.65,8.9,1.16],.42,shade,d,'leather');
  b.add(anatomicalLoft([[.55,2.67,6.15,2.22,0],[1.4,2.85,6.45,2.42,0],[2.3,2.87,6.25,2.48,0],[3.25,2.7,5.05,2.4,0],[4.05,2.52,3.28,2.35,0],[5.2,2.43,2.48,2.31,0],[7.25,2.48,2.42,2.35,0]],{
    detail:d,color:leather,material:'leather',rows:[5,10,18][d],columns:[6,12,22][d],
    deform:(p,a)=>{const front=Math.max(0,Math.sin(a)),f=.04*Math.sin(p[2]*5.7+a)*bell(p[2]-4.1,.7);return[p[0],p[1]*(1+f*front),p[2]];},key:'leather-vamp-and-shaft'}));
  if(d){
    b.add(tailoredPanel((u,v)=>[(-1+u*2)*.94,2.47+.75*(1-v),3.92+v*2.75],{detail:d,color:tone(leather,.81),key:'boot-tongue',thickness:.07}));
    for(let i=0;i<(d===2?5:2);i++){
      const z=4.12+i*(d===2?.53:1.59),y=3.13-(z-4.12)*.26;
      stroke(b,[[-.92,y,z],[.92,y+.01,z+.27]],.055,[33,27,22],0,'cloth');
      stroke(b,[[.92,y,z],[-.92,y+.01,z+.27]],.055,[33,27,22],0,'cloth');
      if(d===2)for(const side of[-1,1])cylinder(b,[side*1.0,y-.03,z],[side*1.0,y+.04,z],.105,[112,99,77],0,'metal');
    }
    if(d===2)for(const side of[-1,1])for(let i=0;i<4;i++)rounded(b,[side*2.70,-.7+i*1.9,.58],[.14,.66,.35],.04,[78,58,43],1,'leather');
  }
}
function boots(b,ankle,lift,d){
  const mesh=remember(`part:boots:${d}`,()=>{const part=new MeshBuilder();buildBoots(part,[0,0,0],0,d);return part.finish('red-leather-boots');});
  b.add(mesh,{translation:[ankle[0],ankle[1],lift]});
}

function human(family,pose,d) {
  const b=new PoseAssembler(),guard=family==='SPOS',shirt=guard?[44,49,46]:[145,135,108],shirtLight=tone(shirt,1.08);
  const pants=guard?[35,39,35]:[91,102,67],skin=guard?[184,139,115]:[180,157,136];
  for(const side of[-1,1]){
    const stride=pose.step*side,lift=Math.max(0,pose.lift*side),hip=[side*4.15,-.45,27.0],knee=[side*4.8,stride*.45+1.0,15.4+lift*.25],ankle=[side*5.2,stride,4.8+lift];
    jointedLimb(b,[hip,knee,ankle],pants,d,'leg','cloth');
    boots(b,ankle,lift,d);
  }
  const body=remember(`part:human-body:${family}:${d}`,()=>{
    const b=new MeshBuilder();torso(b,false,shirt,d);
    b.tube([0,-.12,27.7],[0,-.10,28.9],[[0,6.82,3.9],[1,6.88,4.0]],[60,58,39],{segments:[8,16,32][d],material:'leather'});
    rounded(b,[0,3.98,28.3],[2.1,.38,1.42],.15,[129,120,84],d,'metal');
    if(d)rounded(b,[0,4.2,28.3],[1.36,.10,.78],.10,[61,57,39],1,'metal');
    if(d){
      const surfaceY=(x,z)=>4.45*Math.sqrt(Math.max(.06,1-(x/8.70)**2))+.10;
      for(const side of[-1,1]){
        const pocket=(u,v)=>{const x=side*(2.8+u*3.00),z=36.8+v*3.6;return[x,surfaceY(x,z)+.08+.10*Math.sin(u*Math.PI)*Math.sin(v*Math.PI),z];};
        b.add(tailoredPanel(pocket,{color:tone(shirt,.94),detail:d,key:'sewn-breast-pocket'}));
        const flap=(u,v)=>{const x=side*(2.68+u*3.2),z=39.65+v*.88-.24*Math.sin(u*Math.PI);return[x,surfaceY(x,z)+.18+.06*Math.sin(v*Math.PI),z];};
        b.add(tailoredPanel(flap,{color:shirtLight,detail:d,key:'folded-pocket-flap'}));
        const collar=(u,v)=>{const upper=mix([1.55,1.85,45.18],[3.4,2.95,43.8],u),lower=mix([.64,4.39,42.6],[2.65,4.07,41.9],u),p=mix(upper,lower,v);return[side*p[0],p[1]+.13*Math.sin(v*Math.PI),p[2]];};
        b.add(tailoredPanel(collar,{color:shirtLight,detail:d,key:'folded-collar',thickness:.09}));
        if(d===2){
          for(const u of[.05,.95])stroke(b,Array.from({length:8},(_,i)=>{const p=pocket(u,.03+i*.94/7);return[p[0],p[1]+.016,p[2]];}),.022,tone(shirt,.68),0,'cloth');
          stroke(b,Array.from({length:9},(_,i)=>{const p=pocket(.04+i*.92/8,.04);return[p[0],p[1]+.016,p[2]];}),.022,tone(shirt,.68),0,'cloth');
          rounded(b,[side*4.85,3.05,28.45],[.5,.20,2.1],.08,pants,1,'cloth');
        }
      }
      if(d===2)for(const z of[31.3,33.9,36.5,41.4])cylinder(b,[0,4.46,z],[0,4.56,z],.115,[87,81,62],0,'metal');
    }
    return b.finish('tailored-infantry-torso');
  });
  b.add(body);
  const gunOrigin=pose.dead?[0,7,25.5]:pose.attack?[1.9,7.2,33.5]:[1.5,8.3,35.8];
  const gunRotation=pose.dead?[.2,0,1.35]:pose.attack?[0,0,.1]:[.38,0,1.2];
  const localWrists=[[2.55,-3.0,-2.35],[0,5.7,-3.15]],wrists=localWrists.map(p=>add(gunOrigin,rotateEuler(p,gunRotation)));
  for(let i=0;i<2;i++){
    const side=i===0?1:-1,shoulder=[side*8.15,0,42.1],wrist=wrists[i];
    const elbow=pose.dead?[side*11.9,1.8,31.0]:[side*10.95,3.7+(pose.attack?1.1:0),34.4],cuff=mix(shoulder,elbow,.50),sleeveRoot=[side*7.45,-.12,43.2];
    jointedLimb(b,[shoulder,elbow,wrist],skin,d,'arm');
    const sleeve=remember(partKey('tailored-sleeve',shirt,d),()=>anatomicalLoft([[0,.35,.35,.35,0],[.8,2.60,2.5,2.5,0],[2.0,3.25,3.13,3.10,0],[3.2,3.18,3.08,3.0,0],[4.8,2.90,2.85,2.8,0],[5.0,2.92,2.87,2.82,0]],{
      detail:d,color:shirt,material:'cloth',rows:[4,6,12][d],columns:[6,10,20][d],
      deform:(p,a)=>{const r=.035*Math.sin(p[2]*4+a*.7)*bell(p[2]-3.8,1.0);return[p[0]*(1+r),p[1]*(1+r),p[2]];},
      colours:p=>tone(shirt,p[2]>4.75?.83:1),key:'fitted-shirt-sleeve'}));
    b.add(sleeve,{...along(sleeveRoot,cuff),scale:[1,1,Math.hypot(...sub(cuff,sleeveRoot))/5]});
  }
  const hands=remember(`part:hands:${guard}:${d}`,()=>{const part=new MeshBuilder();gripHands(part,d,skin,false);return part.finish('hands-on-weapon');});
  b.add(firearm(guard,pose.frame==='F'&&!pose.dead,d),{translation:gunOrigin,rotation:gunRotation});
  b.add(hands,{translation:gunOrigin,rotation:gunRotation});
  b.add(humanHead(guard,d,pose.dead),{translation:[0,pose.pain?-1:0,45.8],rotation:[pose.pain?.24:0,0,pose.pain?.1:0]});
  if(pose.dead)wound(b,[0,4.6,35.0],4.2,4.2,d,7,.17);
  return b.finish('detailed-human');
}

function impHead(d,dead,open) {
  // Death and attack use the same open anatomical jaw; retaining a duplicate
  // head for an unused state would displace the immutable LODs from the cache.
  return remember(`part:imp-head:${d}:${open}`,()=>sculptedHead(false,d,false,true,open));
}

function impHand(b,wrist,side,d,skin,attack){
  const mesh=remember(partKey('anatomical-imp-hand',side,d,skin,attack),()=>{
    const p=new MeshBuilder();
    p.add(anatomicalLoft([[-3.15,1.6,1.0,1.0,.35],[-2.1,2.3,1.35,1.3,.2],[-.7,2.2,1.45,1.35,0],[.8,1.55,1.32,1.3,0]],{detail:d,color:skin,rows:[4,6,12][d],columns:[5,8,16][d]}));
    for(let i=0;i<(d?4:3);i++){
      const offset=(i-(d?1.5:1))*1.17,reach=attack?.65:0;
      const path=[[offset,.70,-2.4],[offset*1.13,1.28,-3.6],[offset*1.18,2.15+reach,-4.2],[offset*1.12,2.8+reach,-4.35]];
      p.add(anatomicalSweep(path,[.49,.47,.36,.23],{detail:d,color:skin,rows:[2,6,12][d],columns:[4,6,8][d]}));
      p.add(anatomicalSweep([path.at(-1),[offset,3.52+reach,-4.55],[offset*.93,3.74+reach,-5.25]],[.28,.17,.018],{detail:d,color:BONE,material:'bone',rows:[2,4,8][d],columns:[3,5,8][d]}));
    }
    if(d){
      const path=[[side*1.60,-.25,-.1],[side*2.76,.30,-1.1],[side*3.0,1.25,-2.30]];
      p.add(anatomicalSweep(path,[.65,.55,.35],{detail:d,color:skin,rows:d===2?12:6,columns:d===2?8:5}));
      p.add(anatomicalSweep([path.at(-1),[side*2.9,2.25,-2.75],[side*2.55,2.55,-3.3]],[.36,.2,.016],{detail:d,color:BONE,material:'bone',rows:d===2?8:4,columns:6}));
    }
    return p.finish('clawed-anatomical-hand');
  });
  b.add(mesh,{translation:wrist});
}
function imp(pose,d) {
  const b=new PoseAssembler(),skin=[119,80,42],light=[130,86,46],shade=[89,56,29];
  for(const side of[-1,1]){
    const stride=pose.step*side,lift=Math.max(0,pose.lift*side),hip=[side*3.5,-.7,28.7],knee=[side*5.2,3.3+stride*.5,15.3+lift*.3],ankle=[side*5.7,-1+stride,4.4+lift];
    jointedLimb(b,[hip,knee,ankle],skin,d,'imp-leg');
    const foot=remember(partKey('anatomical-imp-foot',d),()=>{
      const p=new MeshBuilder();
      p.add(anatomicalLoft([[.05,2.6,4.8,2.0,0],[.7,3.1,6.0,2.2,0],[1.7,3.2,6.4,2.3,0],[2.6,3.15,5.6,2.4,0],[3.7,2.5,3.9,2.3,0],[5.8,2.1,1.95,2.1,0]],{detail:d,color:skin,rows:[4,8,16][d],columns:[6,12,22][d]}));
      for(const toe of[-1,0,1]){
        const root=[toe*1.8,5.7,1.5],tip=[toe*2.05,8.45,.88];
        p.add(anatomicalSweep([root,[toe*1.97,7.4,1.4],tip],[.63,.40,.02],{detail:d,color:BONE,material:'bone',rows:[2,4,8][d],columns:[3,5,8][d]}));
      }return p.finish('sculpted-clawed-foot');
    });
    b.add(foot,{translation:[ankle[0],ankle[1],lift]});
    limb(b,[knee[0]+side*.6,knee[1]+2.4,knee[2]],[knee[0]+side*1.6,knee[1]+5.8,knee[2]+.7],[[0,.8,.8],[.5,.42,.42],[1,.02,.02]],BONE,d,'bone');
  }
  const body=remember(`part:imp-body:${d}`,()=>{
    const b=new MeshBuilder();torso(b,true,skin,d);
    for(const side of[-1,1])for(const[base,tip,r]of[
      [[side*7.1,-.8,43.1],[side*15.7,-1.1,49.0],1.40],
      [[side*8.0,-1.4,40.6],[side*16.5,-2.0,42.3],1.10],
      [[side*5.0,-3.6,43.6],[side*8.0,-7.7,46.8],.95]]){
      b.add(anatomicalSweep([base,mix(base,tip,.48),tip],[r,r*.54,.018],{detail:d,color:BONE,material:'bone',rows:[2,5,10][d],columns:[4,6,10][d]}));
    }
    return b.finish('continuous-imp-torso');
  });
  b.add(body);
  let elbows=[[12.0,3.2,35.5],[-12.0,3.2,35.5]],wrists=[[13.1,6.6,28.3],[-13.1,6.6,28.3]];
  if(pose.attack) {
    if(pose.frame==='E'){elbows=[[17.5,2,35.5],[-11.6,6,37.1]];wrists=[[23,7,31.8],[-5.2,9.4,38.8]];}
    else if(pose.frame==='F'){elbows=[[11.5,10,37.5],[-11.4,5.1,34.5]];wrists=[[6.4,19.4,38.8],[-5.8,8.4,32.4]];}
    else{elbows=[[11.2,11.5,39.1],[-12.5,3.7,34.3]];wrists=[[5.7,23.1,40.8],[-13.6,7,28.1]];}
  }else if(pose.pain){elbows=[[13.6,3.1,35.5],[-13.4,1.5,34.7]];wrists=[[6.2,9.5,34.7],[-18,4.1,28.8]];}
  else if(pose.dead){elbows=[[14.1,0,33.1],[-14.4,2,32.3]];wrists=[[17.3,1,23.5],[-17.1,3,25]];}
  for(let i=0;i<2;i++){
    const side=i===0?1:-1,shoulder=[side*7.2,-.2,43.2],elbow=elbows[i],wrist=wrists[i];
    jointedLimb(b,[shoulder,elbow,wrist],skin,d,'imp-arm');
    const quill=mix(shoulder,elbow,.76);
    limb(b,[quill[0]+side*1.8,quill[1]-1,quill[2]],[quill[0]+side*5.1,quill[1]-2,quill[2]+1.3],[[0,.85,.85],[.45,.48,.48],[1,.025,.025]],BONE,d,'bone');
    impHand(b,wrist,side,d,skin,pose.attack);
  }
  b.add(impHead(d,pose.dead,pose.attack||pose.dead),{translation:[0,3.3,45.25],rotation:[pose.pain?.3:0,0,pose.pain?.1:0]});
  if(pose.dead)wound(b,[0,4.1,35.3],4.6,4.7,d,10,.16);
  return b.finish('sculpted-imp');
}

/** Rigid posing touches only position/normal channels, never resamples material coordinates. */
function groundPose(source,key,pose,d) {
  let vertices=source.vertices;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const collapse=pose.dead?[.18,.38,.65,.88,1][Math.max(0,pose.deathIndex)]:0;
  if(pose.dead) {
    const cx=Math.cos(collapse*Math.PI/2),sx=Math.sin(collapse*Math.PI/2),cz=Math.cos(collapse*.12),sz=Math.sin(collapse*.12);
    for(let i=0;i<vertices.length;i+=MESH_VERTEX_STRIDE){
      const x=vertices[i],y=vertices[i+1]*cx-vertices[i+2]*sx,z=vertices[i+1]*sx+vertices[i+2]*cx;
      const nx=vertices[i+3],ny=vertices[i+4]*cx-vertices[i+5]*sx,nz=vertices[i+4]*sx+vertices[i+5]*cx;
      vertices[i]=x*cz-y*sz;vertices[i+1]=x*sz+y*cz;vertices[i+2]=z;
      vertices[i+3]=nx*cz-ny*sz;vertices[i+4]=nx*sz+ny*cz;vertices[i+5]=nz;
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[i+k]);max[k]=Math.max(max[k],vertices[i+k]);}
    }
  }else {for(let k=0;k<3;k++){min[k]=source.bounds.min[k];max[k]=source.bounds.max[k];}}
  const offset=pose.dead?[-(min[0]+max[0])*.5,-(min[1]+max[1])*.5,-min[2]]:[0,0,-min[2]];
  if(offset.some(value=>value!==0)) {
    min.fill(Infinity);max.fill(-Infinity);
    for(let i=0;i<vertices.length;i+=MESH_VERTEX_STRIDE)for(let k=0;k<3;k++){
      vertices[i+k]+=offset[k];min[k]=Math.min(min[k],vertices[i+k]);max[k]=Math.max(max[k],vertices[i+k]);
    }
  }
  if(collapse>.8){
    const b=new MeshBuilder();ell(b,[0,0,.22],[10.5,12.8,.22],DARK_BLOOD,Math.max(0,d-1),'blood');
    const pool=b.finish('blood-pool'),combined=new Float32Array(vertices.length+pool.vertices.length);
    combined.set(vertices);combined.set(pool.vertices,vertices.length);vertices=combined;
    for(let k=0;k<3;k++){min[k]=Math.min(min[k],pool.bounds.min[k]);max[k]=Math.max(max[k],pool.bounds.max[k]);}
  }
  return {key,vertices,stride:MESH_VERTEX_STRIDE,triangles:vertices.length/(3*MESH_VERTEX_STRIDE),bounds:{min,max},detail:d};
}
export function characterMesh(entity,time=0,detail=2) {
  if(!entity||entity.removed)return null;
  const family=FAMILY[entity.type]||entity.base||String(entity.sprite||'').slice(0,4);
  if(!['POSS','SPOS','TROO'].includes(family))return null;
  const d=level(detail),pose=frameFor(entity,time,family),key=`character:${family}:${pose.frame}:${pose.idle?'idle':'pose'}:lod${d}`;
  return remember(key,()=>groundPose(family==='TROO'?imp(pose,d):human(family,pose,d),key,pose,d));
}
export function proceduralCharacterCacheStats(){return {entries:cache.size+parts.size,limit:LIMIT_ENTRIES,bytes:cacheBytes+partBytes,byteLimit:LIMIT_BYTES,parts:{entries:parts.size,bytes:partBytes,byteLimit:PART_BYTES,builds:partBuilds,evictions:partEvictions},poses:{entries:cache.size,bytes:cacheBytes,byteLimit:PART_BYTES,builds:poseBuilds}};}
export default characterMesh;
