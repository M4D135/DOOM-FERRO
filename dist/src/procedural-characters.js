/**
 * Anatomical, articulated Doom character recipes. Every silhouette and small
 * feature is a generated volume; materials are analytic, never sampled artwork.
 * Local axes are X right, Y forward, Z up. Authored view suffixes do not turn a
 * mesh towards the camera. Three geometric detail levels share the same rig.
 */
import {MeshBuilder, rotateEuler, MESH_VERTEX_STRIDE} from './procedural-mesh.js?v=0.4.0-f3ce9999b077';

const FAMILY = {3004:'POSS',9:'SPOS',3001:'TROO'};
const LIMIT_BYTES = 32 * 1024 * 1024, LIMIT_ENTRIES = 96;
const cache = new Map(); let cacheBytes = 0;
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
const level = value => clamp(Math.round(Number.isFinite(value)?value:2),0,2);
function remember(key, create) {
  if(cache.has(key)) {const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  const value=create(),bytes=value.vertices.byteLength;
  while(cache.size&&(cacheBytes+bytes>LIMIT_BYTES||cache.size>=LIMIT_ENTRIES)) {
    const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).vertices.byteLength;cache.delete(oldest);
  }
  cache.set(key,value);cacheBytes+=bytes;return value;
}
function ell(b,c,r,color,d,material='skin',extra={}) {
  return b.ellipsoid(c,r,color,{segments:[6,8,14][d],rings:[3,4,6][d],material,...extra});
}
function cylinder(b,a,z,r,color,d,material='skin',extra={}) {
  return b.cylinder(a,z,r,color,{segments:[5,6,8][d],material,...extra});
}
function stroke(b,points,r,color,d,material='skin') {
  for(let i=1;i<points.length;i++)cylinder(b,points[i-1],points[i],r,color,Math.min(d,1),material);
}
function rounded(b,c,size,bevel,color,d,material='cloth',extra={}) {
  return d?b.roundedBox(c,size,bevel,color,{material,...extra}):b.box(c,size,color,{material,...extra});
}
function limb(b,a,z,radii,color,d,material='skin') {
  return b.tube(a,z,radii,color,{segments:[6,8,12][d],smoothProfile:true,material});
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

/** Smooth closed parametric skin, with actual recesses rather than floating pads. */
function skinSurface(b,point,colorAt,rows,columns,material='skin') {
  const grid=[];
  for(let row=0;row<=rows;row++) {
    const v=row/rows,list=[];
    for(let col=0;col<=columns;col++) {
      const angle=TAU*(col%columns)/columns,p=point(angle,v),e=.0001;
      const along=sub(point(angle+e,v),point(angle-e,v));
      const vertical=sub(point(angle,Math.min(1,v+e)),point(angle,Math.max(0,v-e)));
      list.push({p,n:unit(cross(along,vertical))});
    }
    grid.push(list);
  }
  const emit=(a,c,d)=>{
    const center=a.p.map((v,i)=>(v+c.p[i]+d.p[i])/3),color=colorAt(center);
    b.triangle(a.p,c.p,d.p,color,{normals:[a.n,c.n,d.n],surfaceCoords:[a.p,c.p,d.p],material});
  };
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const a=grid[row][col],c=grid[row][col+1],d=grid[row+1][col+1],e=grid[row+1][col];
    emit(a,c,d);emit(a,d,e);
  }
  for(const [row,normal]of [[0,[0,0,-1]],[rows,[0,0,1]]]) {
    const ring=grid[row],center=[0,0,0];
    for(let i=0;i<columns;i++)for(let k=0;k<3;k++)center[k]+=ring[i].p[k]/columns;
    for(let col=0;col<columns;col++) {
      const a=ring[col].p,c=ring[col+1].p,points=row?[center,a,c]:[center,c,a];
      b.triangle(...points,colorAt(center),{normals:[normal,normal,normal],surfaceCoords:points,material});
    }
  }
}
function profileAt(profile,t) {
  for(let i=1;i<profile.length;i++)if(t<=profile[i][0]) {
    const a=profile[i-1],b=profile[i],u=clamp((t-a[0])/(b[0]-a[0]),0,1),p=profile[Math.max(0,i-2)],n=profile[Math.min(profile.length-1,i+1)];
    return [1,2].map(k=>Math.max(.025,.5*((2*a[k])+(-p[k]+b[k])*u+(2*p[k]-5*a[k]+4*b[k]-n[k])*u*u+(-p[k]+3*a[k]-3*b[k]+n[k])*u*u*u)));
  }
  return profile.at(-1).slice(1);
}
function torso(b,imp,color,d) {
  const z0=imp?26.0:27.0,z1=imp?46.0:45.0;
  const profile=imp?[[0,6.4,3.8],[.19,6.1,3.7],[.43,7.4,4.5],[.68,9.2,5.1],[.83,9.5,5.1],[1,5.2,3.1]]:
    [[0,6.7,3.9],[.2,7.0,4.1],[.47,8.5,4.6],[.73,9.2,4.7],[.89,9.1,4.4],[1,5.1,2.8]];
  const point=(angle,t)=>{
    const [rx,ry]=profileAt(profile,t),x=Math.cos(angle)*rx,z=z0+(z1-z0)*t,front=Math.max(0,Math.sin(angle));
    let y=Math.sin(angle)*ry-(imp?.75:0);
    if(imp) {
      const chest=Math.exp(-1*((z-39.6)/3.4)**2),center=Math.exp(-1*(x/1.1)**2);
      y+=front**4*(.72*chest*(1-.65*center)-.3*center*Math.exp(-1*((z-36)/6)**2));
      y+=front**6*.19*Math.cos((z-30.1)*2.05)*Math.exp(-1*((z-33)/4.7)**2)*(1-Math.exp(-1*(x/.55)**2));
      y-=.16*front**6*Math.exp(-1*((Math.abs(x)-4.8)/.8)**2)*Math.exp(-1*((z-33)/5)**2);
    } else if(d) {
      y+=front**4*(.16*Math.sin(z*2.0+x*.6)+.1*Math.sin(z*3.4-x*.3))*Math.exp(-1*((z-30)/6)**2);
    }
    return [x,y,z];
  };
  skinSurface(b,point,p=>tone(color,imp?.96+.055*Math.sin(p[2]*.48):.97+.025*Math.sin(p[0]*.7+p[2])),[6,10,18][d],[8,12,22][d],imp?'skin':'cloth');
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
function eye(b,x,y,z,skin,d,demonic=false) {
  ell(b,[x,y,z],[.82,.12,.38],demonic?[43,19,8]:[88,57,34],Math.max(0,d-1),'skin');
  ell(b,[x,y+.09,z-.03],[.55,.14,.22],demonic?[220,102,31]:[205,183,136],Math.max(0,d-1),'glass');
  ell(b,[x,y+.23,z-.03],[demonic?.19:.15,.045,.17],demonic?[230,35,5]:[44,20,12],0,'glass',{segments:6,rings:3,emissive:demonic?.15:0});
  if(d) {
    stroke(b,[[x-.8,y+.1,z+.1],[x-.29,y+.2,z+.25],[x+.36,y+.2,z+.21],[x+.8,y+.08,z+.04]],.085,skin,0);
    stroke(b,[[x-.72,y+.09,z-.13],[x,y+.2,z-.27],[x+.7,y+.08,z-.14]],.075,tone(skin,.85),0);
    if(d===2)ell(b,[x-.13,y+.28,z+.03],[.05,.025,.05],[241,228,179],0,'glass',{segments:5,rings:3});
  }
}
function humanHead(guard,d,dead) {
  return remember(`part:human-head:${guard}:${d}:${dead}`,()=>{
    const b=new MeshBuilder(),skin=guard?[193,148,108]:[187,166,127],shade=tone(skin,.8);
    cylinder(b,[0,0,-1.1],[0,.05,1.8],2.0,shade,d,'skin',{topRadius:2.4});
    const profile=[[0,2.0,1.9],[.14,2.6,2.5],[.34,3.35,2.95],[.58,3.65,3.15],[.79,3.6,3.1],[.94,2.7,2.35],[1,.04,.04]];
    const point=(angle,t)=>{
      const [rx,ry]=profileAt(profile,t),x=Math.cos(angle)*rx,z=t*9.0,front=Math.max(0,Math.sin(angle));
      let y=Math.sin(angle)*ry;
      y+=.3*front**4*Math.exp(-1*((Math.abs(x)-2.45)/.8)**2)*Math.exp(-1*((z-4.7)/1.1)**2);
      y-=.27*front**5*Math.exp(-1*((Math.abs(x)-1.55)/.9)**2)*Math.exp(-1*((z-6.0)/.7)**2);
      y-=.61*front**8*Math.exp(-1*(x/1.3)**2-((z-2.45)/.48)**2);
      return [x,y,z];
    };
    skinSurface(b,point,p=>{
      if(p[1]>1.7&&(p[0]/1.32)**2+((p[2]-2.45)/.42)**2<1)return [51,22,13];
      const f=.95+.04*Math.sin(p[2]*.8)+.035*Math.cos(p[0]);return tone(skin,f);
    },[8,12,24][d],[8,14,28][d],'skin');
    const facePoint=(x,z,offset=0)=>{const [rx]=profileAt(profile,z/9),q=point(Math.acos(clamp(x/rx,-.999,.999)),z/9);q[1]+=offset;return q;};
    for(const side of [-1,1]) {
      ell(b,[side*3.6,-.03,4.9],[.62,.8,1.12],skin,Math.max(0,d-1));
      if(d) {
        ell(b,[side*3.97,.34,4.9],[.18,.28,.65],shade,Math.max(0,d-1));
        stroke(b,[[side*3.96,.31,4.35],[side*4.12,.26,4.94],[side*3.94,.22,5.54]],.12,tone(skin,1.1),0);
      }
      eye(b,side*1.4,2.83,6.05,skin,d);
      ell(b,[side*1.5,2.8,6.78],[1.34,.38,.31],shade,Math.max(0,d-1),'skin',{rotation:[0,side*.12,side*.04]});
      if(d)stroke(b,[facePoint(side*.65,6.65,.08),facePoint(side*1.5,6.87,.13),facePoint(side*2.45,6.73,.08)],.09,guard?[110,76,49]:[86,92,49],0,'cloth');
      if(d===2) {
        stroke(b,[facePoint(side*2.15,5.12,.018),facePoint(side*2.55,4.36,.018),facePoint(side*2.0,3.3,.018)],.045,tone(skin,.65),0);
        stroke(b,[facePoint(side*.7,3.45,.015),facePoint(side*1.1,3.03,.015),facePoint(side*1.66,2.58,.015)],.045,tone(skin,.73),0);
      }
    }
    ell(b,[0,2.98,5.05],[.4,.34,1.05],tone(skin,1.06),d);
    ell(b,[0,3.28,4.19],[.5,.43,.36],skin,d);
    for(const side of [-1,1]) {
      ell(b,[side*.38,3.26,4.0],[.29,.28,.22],shade,Math.max(0,d-1));
      if(d)ell(b,[side*.36,3.49,3.94],[.13,.07,.09],[56,31,19],0,{kind:'skin',roughness:.9});
    }
    ell(b,[0,2.36,1.42],[1.45,.3,.42],skin,d);
    if(d) {
      stroke(b,[facePoint(-1.4,2.72,.06),facePoint(-.6,2.86,.09),facePoint(0,2.77,.12),facePoint(.65,2.87,.09),facePoint(1.4,2.69,.06)],.085,[137,84,52],0);
      stroke(b,[facePoint(-1.25,2.12,.08),facePoint(0,2.01,.12),facePoint(1.25,2.12,.08)],.095,[151,96,62],0);
      const count=d===2?6:1;
      for(let i=0;i<count;i++) {
        const x=count===1?0:-1.12+i*.45;
        rounded(b,[x,2.69-Math.abs(x)*.06,2.59-Math.abs(x)*.025],[count===1?2.5:.38,.2,.33],.055,[207,185,137],d===2?1:0,'bone');
      }
    }else b.box([0,2.7,2.61],[2.3,.15,.32],BONE,{material:'bone'});
    if(!guard) {
      // Low flat-top haircut: shallow hair volume follows the scalp, never a cap.
      b.tube([0,-.2,7.85],[0,-.2,9.16],[[0,3.43,2.55],[.58,3.28,2.45],[1,3.0,2.25]],[66,82,41],{segments:[8,14,22][d],material:{kind:'cloth',scale:2.3}});
      if(d)for(const side of [-1,1])ell(b,[side*3.34,-.15,7.78],[.15,1.33,.69],[47,64,32],Math.max(0,d-1),'cloth');

    } else if(d===2) {
      // Brow creases on an exposed bald forehead, restrained enough at game scale.
      for(const z of [7.45,7.81])stroke(b,[facePoint(-1.8,z,.012),facePoint(-.6,z+.06,.012),facePoint(.6,z+.06,.012),facePoint(1.8,z,.012)],.04,tone(skin,.75),0);
    }
    if(d)wound(b,[guard?-2.6:2.75,2.1,4.5],.65,1.1,d,3,.06);
    if(dead)wound(b,[.7,2.85,3.1],1.9,2.1,d,8,.12);
    return b.finish('detailed-human-head');
  });
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
  const bloodSkin=skin.map((v,i)=>v*(i===0?.85:.6));
  if(!d) {
    ell(b,[1.8,-1.8,-2.3],[1.45,1.8,1.9],bloodSkin,0);
    ell(b,[0,7,-2.05],[2.2,1.8,1.3],bloodSkin,0);return;
  }
  // Trigger hand: fingers wind around the actual grip, index follows its guard.
  ell(b,[1.8,-2,-2.0],[1.05,1.65,1.7],skin,Math.max(0,d-1));
  for(let i=0;i<(d===2?4:2);i++) {
    const z=-.65-i*(d===2?.7:1.8);
    stroke(b,[[1.45,-.95,z],[.65,-.3,z-.12],[-.6,-.55,z-.23],[-.85,-1.2,z-.3]],.34,bloodSkin,d);
    if(d===2)ell(b,[.8,-.31,z],[.4,.36,.38],skin,0);
  }
  stroke(b,[[2.0,-2.7,-.5],[1.6,-1.8,.1],[.65,-1.45,.1]],.45,skin,d);
  // Support hand wraps the fore-end; the palm remains below the weapon.
  ell(b,[0,7.0,-2.25],[2.0,1.9,1.0],skin,Math.max(0,d-1));
  for(let i=0;i<(d===2?4:2);i++) {
    const y=5.65+i*(d===2?.91:2.7);
    stroke(b,[[-1.7,y,-2.1],[-2.1,y,-.55],[-1.65,y,.65],[-.9,y,.8]],.34,bloodSkin,d);
    if(d===2)ell(b,[-2.0,y,-.55],[.4,.39,.42],skin,0);
  }
  stroke(b,[[1.5,5.9,-2.1],[2.0,6.3,-.8],[1.45,7.0,.2]],.46,skin,d);
  if(d===2) {
    for(let i=0;i<4;i++)rounded(b,[-1.12,5.65+i*.91,.86],[.58,.5,.09],.035,[155,116,77],1,'bone');
    wound(b,[1.9,-.72,-2.1],.45,1.05,1,4,.07);
  }
}
function buildBoots(b,ankle,lift,d) {
  const leather=[100,36,23],shade=[56,27,21];
  rounded(b,[ankle[0],ankle[1]+2.1,.65+lift],[5.8,8.7,1.3],.45,shade,d,'leather');
  ell(b,[ankle[0],ankle[1]+2.7,2.35+lift],[3.02,5.05,2.2],leather,d,'leather');
  limb(b,[ankle[0],ankle[1],2.7+lift],[ankle[0],ankle[1],7.4+lift],[[0,2.65,2.65],[.5,2.6,2.55],[1,2.75,2.5]],leather,d,'leather');
  if(d) {
    rounded(b,[ankle[0],ankle[1]+2.38,5.2+lift],[2.5,.42,3.35],.18,tone(leather,.82),1,'leather');
    for(let i=0;i<(d===2?4:1);i++) {
      const z=3.8+lift+i*(d===2?.72:1.35);
      stroke(b,[[ankle[0]-1.05,ankle[1]+2.68,z],[ankle[0]+1.05,ankle[1]+2.68,z+.35]],.085,[39,28,21],0,'cloth');
      stroke(b,[[ankle[0]+1.05,ankle[1]+2.68,z],[ankle[0]-1.05,ankle[1]+2.68,z+.35]],.085,[39,28,21],0,'cloth');
    }
    if(d===2)for(const side of [-1,1])for(let i=0;i<4;i++)rounded(b,[ankle[0]+side*2.9,ankle[1]-.6+i*1.8,.75+lift],[.16,.7,.42],.06,[93,65,48],1,'leather');
  }
}
function boots(b,ankle,lift,d){
  const mesh=remember(`part:boots:${d}`,()=>{const part=new MeshBuilder();buildBoots(part,[0,0,0],0,d);return part.finish('red-leather-boots');});
  b.add(mesh,{translation:[ankle[0],ankle[1],lift]});
}

function human(family,pose,d) {
  const b=new MeshBuilder(),guard=family==='SPOS',shirt=guard?[44,49,46]:[145,135,108],shirtLight=tone(shirt,1.12);
  const pants=guard?[35,39,35]:[91,102,67],skin=guard?[192,145,100]:[184,160,114];
  for(const side of [-1,1]) {
    const stride=pose.step*side,lift=Math.max(0,pose.lift*side),hip=[side*4.3,-.45,27.3],knee=[side*5.0,stride*.45+1.0,15.4+lift*.25],ankle=[side*5.4,stride,4.8+lift];
    limb(b,hip,knee,[[0,3.75,3.7],[.25,3.95,3.75],[.65,3.5,3.4],[1,3.02,3.0]],pants,d,'cloth');
    limb(b,knee,ankle,[[0,3.02,3.0],[.18,3.14,3.1],[.48,3.0,2.8],[.82,2.55,2.45],[1,2.55,2.4]],pants,d,'cloth');
    if(d)ell(b,knee,[3.02,3.0,2.1],pants,Math.max(0,d-1),'cloth');
    boots(b,ankle,lift,d);
    const thigh=mix(hip,knee,.5);
    wound(b,[thigh[0]+side*.6,thigh[1]+3.36,thigh[2]],1.15,2.65,d,side+2,.1);
    if(d) {
      stroke(b,[[hip[0]+side*3.3,hip[1],hip[2]],[knee[0]+side*2.95,knee[1],knee[2]],[ankle[0]+side*2.47,ankle[1],ankle[2]+2.1]],.1,tone(pants,.65),0,'cloth');
      for(const offset of [-1.0,1.0])stroke(b,[[knee[0]-2.0,knee[1]+2.6,knee[2]+offset],[knee[0],knee[1]+3.05,knee[2]+offset+.3],[knee[0]+2.0,knee[1]+2.6,knee[2]+offset-.1]],.13,tone(pants,1.15),0,'cloth');
      if(d===2) {
        rounded(b,[thigh[0]+side*3.15,thigh[1],thigh[2]+1.3],[.45,3.7,4.3],.3,tone(pants,.89),1,'cloth');
        rounded(b,[thigh[0]+side*3.43,thigh[1],thigh[2]+3.0],[.14,3.8,.85],.1,tone(pants,1.1),1,'cloth');
      }
    }
  }
  const body=remember(`part:human-body:${family}:${d}`,()=>{
    const b=new MeshBuilder();
  ell(b,[0,-.4,27.0],[7.15,4.1,3.65],pants,d,'cloth');
  torso(b,false,shirt,d);
  b.tube([0,0,27.5],[0,0,28.9],[[0,6.95,4.05],[1,7.04,4.1]],[60,58,39],{segments:[8,14,22][d],material:'leather'});
  rounded(b,[0,4.13,28.2],[2.5,.6,1.65],.19,[134,124,82],d,'metal');
  if(d)rounded(b,[0,4.47,28.2],[1.55,.12,.83],.12,[61,57,39],1,'metal');
  wound(b,[-.15,4.72,39.9],2.5,3.1,d,11,.1);
  if(d) {
    for(const side of [-1,1]) {
      if(d===2){
        rounded(b,[side*4.3,4.36,38.65],[3.15,.3,3.9],.25,tone(shirt,.85),1,'cloth');
        rounded(b,[side*4.3,4.62,40.35],[3.32,.22,.75],.16,shirtLight,1,'cloth');
      }
      stroke(b,[[side*1.55,2.65,44.4],[side*3.15,3.66,42.55],[side*.45,4.26,41.95]],.26,shirtLight,0,'cloth');
      if(d===2)rounded(b,[side*4.8,3.35,28.3],[.6,.35,2.5],.1,pants,1,'cloth');
      if(d===2) {
        stroke(b,[[side*5.8,-3.8,42.0],[side*7.5,-3.95,37.4],[side*6.3,-3.8,30.5]],.08,tone(shirt,.73),0,'cloth');
        for(const z of [31.2,33.4,35.6])ell(b,[side*.16,4.36,z],[.19,.12,.19],[75,68,52],0,'metal',{segments:6,rings:3});
      }
    }
    for(let i=0;i<(d===2?5:1);i++)stroke(b,[[-5.2+i*.35,3.75,30+i*.7],[-1.4,4.25,30.7+i*.7],[3.8-i*.2,3.7,30.1+i*.7]],.11,tone(shirt,.83),0,'cloth');
  }
    return b.finish('clothed-torso');
  });
  b.add(body);
  const gunOrigin=pose.dead?[0,7,25.5]:pose.attack?[1.9,7.2,33.5]:[1.5,8.3,35.8];
  const gunRotation=pose.dead?[.2,0,1.35]:pose.attack?[0,0,.1]:[.38,0,1.2];
  const localWrists=[[2.55,-3.0,-2.35],[0,5.7,-3.15]],wrists=localWrists.map(p=>add(gunOrigin,rotateEuler(p,gunRotation)));
  for(let i=0;i<2;i++) {
    const side=i===0?1:-1,shoulder=[side*9.0,.0,42.0],wrist=wrists[i];
    const elbow=pose.dead?[side*12.7,1.8,31.0]:[side*11.65,3.6+(pose.attack?1.2:0),34.4];
    const cuff=mix(shoulder,elbow,.49);
    if(d)ell(b,[side*8.6,0,42.35],[3.75,3.65,2.8],shirt,Math.max(0,d-1),'cloth');
    limb(b,shoulder,cuff,[[0,3.7,3.8],[.3,3.9,3.8],[.8,3.5,3.4],[1,3.25,3.1]],shirt,d,'cloth');
    limb(b,cuff,elbow,[[0,2.95,2.9],[.45,3.2,2.95],[.8,2.65,2.55],[1,2.6,2.5]],skin,d);
    if(d)ell(b,elbow,[2.58,2.5,2.2],skin,Math.max(0,d-1));
    limb(b,elbow,wrist,[[0,2.6,2.5],[.18,2.7,2.45],[.5,2.35,2.15],[.8,1.7,1.65],[1,1.6,1.55]],skin,d);
    if(d) {
      const line=mix(shoulder,cuff,.92);
      cylinder(b,line,cuff,3.28,tone(shirt,.75),0,'cloth',{topRadius:3.25});
      const fore=mix(elbow,wrist,.53);
      ell(b,[fore[0],fore[1]+1.35,fore[2]+.1],[.8,.65,2.45],tone(skin,1.04),Math.max(0,d-1));
      if(d===2)stroke(b,[add(mix(elbow,wrist,.25),[side*.6,1.7,0]),add(mix(elbow,wrist,.52),[side*.3,1.7,0]),add(mix(elbow,wrist,.8),[0,1.3,0])],.07,tone(skin,.76),0);
    }
  }
  const hands=remember(`part:hands:${guard}:${d}`,()=>{const part=new MeshBuilder();gripHands(part,d,skin,false);return part.finish('hands-on-weapon');});
  b.add(firearm(guard,pose.frame==='F'&&!pose.dead,d),{translation:gunOrigin,rotation:gunRotation});
  b.add(hands,{translation:gunOrigin,rotation:gunRotation});
  b.add(humanHead(guard,d,pose.dead),{translation:[0,pose.pain?-1:0,46.0],rotation:[pose.pain?.24:0,0,pose.pain?.1:0]});
  if(pose.dead)wound(b,[0,4.6,35.0],4.2,4.2,d,7,.17);
  return b.finish('detailed-human');
}

function impHead(d,dead,open) {
  return remember(`part:imp-head:${d}:${dead}:${open}`,()=>{
    const b=new MeshBuilder(),skin=[126,83,39],shade=[88,53,22],mouthH=open?2.6:1.24,mouthZ=open?3.5:3.86,mouthW=open?2.28:1.98;
    const profile=[[0,2.45,1.8],[.15,3.15,2.5],[.4,3.8,3.1],[.7,4.2,3.15],[.9,3.4,2.8],[1,.04,.04]];
    const point=(angle,t)=>{
      const [rx,ry]=profileAt(profile,t),x=Math.cos(angle)*rx,z=t*9.85,front=Math.max(0,Math.sin(angle));
      let y=Math.sin(angle)*ry;
      y-=(open?1.65:1.25)*front**6*Math.exp(-1*(x/(mouthW*.92))**4-((z-mouthZ)/mouthH)**2);
      y+=.36*front**3*Math.exp(-1*((Math.abs(x)-2.65)/.7)**2-((z-4.9)/2.7)**2);
      return [x,y,z];
    };
    skinSurface(b,point,p=>p[1]>.6&&(p[0]/mouthW)**2+((p[2]-mouthZ)/(mouthH*.97))**2<1?[43,15,8]:tone(skin,.93+.075*Math.sin(p[2]*.45)),[8,12,20][d],[8,14,26][d],'skin');
    const facePoint=(x,z,offset=0)=>{const [rx]=profileAt(profile,z/9.85),q=point(Math.acos(clamp(x/rx,-.999,.999)),z/9.85);q[1]+=offset;return q;};
    for(const side of [-1,1]) {
      eye(b,side*1.55,2.95,7.0,skin,d,true);
      ell(b,[side*1.75,2.96,7.75],[1.78,.5,.48],shade,d,'skin',{rotation:[0,side*.17,side*.07]});
      ell(b,[side*2.7,2.6,5.1],[.88,.42,1.55],skin,Math.max(0,d-1));
      if(d) {
        stroke(b,[facePoint(side*2.8,6.15,.06),facePoint(side*3.15,4.65,.07),facePoint(side*2.35,open?1.7:2.55,.06)],.14,tone(skin,.78),0);
        stroke(b,[[side*.95,3.48,7.6],[side*1.65,3.42,7.9],[side*2.78,2.89,8.0]],.1,tone(skin,1.14),0);
      }
    }
    ell(b,[0,3.0,6.15],[1.15,.65,.65],shade,d);
    if(d)for(const side of [-1,1])ell(b,[side*.55,3.56,5.98],[.28,.14,.18],[39,17,8],0,'skin');
    ell(b,[0,2.18,open?1.03:2.38],[open?2.4:1.85,open?.7:.5,open?.6:.42],skin,d);
    ell(b,[0,1.85,open?2.0:3.18],[open?1.2:.95,.3,open?.4:.24],[143,39,22],Math.max(0,d-1),'blood');
    const count=[4,6,8][d];
    for(let i=0;i<count;i++) {
      const x=(i-(count-1)/2)*(d===2?.48:d===1?.64:.9)*(open?1:.9),edge=Math.abs(x)/2;
      const top=[x,(open?3.15:2.94)-edge*.18,(open?5.6:4.82)-edge*.3],bottom=[x,(open?3.03:2.84)-edge*.13,(open?1.48:2.96)+edge*.23];
      const fang=i===0||i===count-1;
      b.cone(top,[x*.98,top[1]+.14,top[2]-(fang?(open?1.35:.82):(open?.8:.47))],fang?.32:.25,BONE,{segments:[4,5,7][d],material:'bone'});
      b.cone(bottom,[x*.97,bottom[1]+.13,bottom[2]+(fang?(open?1.08:.62):(open?.62:.36))],fang?.29:.23,tone(BONE,.87),{segments:[4,5,7][d],material:'bone'});
    }
    if(d===2) {
      for(const side of [-1,1])for(let i=0;i<3;i++)stroke(b,[[side*(.7+i*.35),3.0,8.75-i*.2],[side*(1.3+i*.4),3.19,8.4-i*.18],[side*(2.2+i*.35),2.95,8.3-i*.2]],.055,shade,0);
      stroke(b,[[0,3.24,8.55],[0,3.47,7.9],[0,3.34,7.1]],.085,tone(skin,.65),0);
    }
    if(dead)wound(b,[1.9,2.9,4.5],1.1,2.25,d,5,.1);
    return b.finish('sculpted-imp-head');
  });
}
function impHand(b,wrist,side,d,skin,attack) {
  ell(b,wrist,[2.42,1.85,2.5],skin,d);
  if(!d) {
    for(const f of [-1,0,1])b.cone([wrist[0]+f*1.45,wrist[1]+1.2,wrist[2]-1.3],[wrist[0]+f*1.6,wrist[1]+3.3,wrist[2]-4.0],.6,BONE,{segments:4,material:'bone'});
    return;
  }
  for(let i=0;i<4;i++) {
    const offset=(i-1.5)*1.2,base=[wrist[0]+offset,wrist[1]+.9,wrist[2]-.8];
    const knuckle=[base[0]+offset*.1,base[1]+1.0,base[2]-1.65];
    const tip=[base[0]+offset*.15,base[1]+2.15+(attack?.9:0),base[2]-2.8];
    cylinder(b,base,knuckle,.53,skin,d,'skin',{topRadius:.45});
    cylinder(b,knuckle,tip,.45,tone(skin,.91),d,'skin',{topRadius:.32});
    if(d===2)ell(b,knuckle,[.62,.55,.65],tone(skin,1.09),0);
    b.cone(tip,[tip[0]+offset*.1,tip[1]+1.5,tip[2]-1.15],.37,BONE,{segments:[4,6,8][d],material:'bone'});
  }
  const thumb=[wrist[0]+side*2.0,wrist[1]-.25,wrist[2]+.1],thumbTip=[thumb[0]+side*1.6,thumb[1]+1.4,thumb[2]-1.5];
  cylinder(b,thumb,thumbTip,.7,skin,d,'skin',{topRadius:.5});
  b.cone(thumbTip,[thumbTip[0]-side*.5,thumbTip[1]+1.5,thumbTip[2]-1.25],.45,BONE,{segments:6,material:'bone'});
}
function imp(pose,d) {
  const b=new MeshBuilder(),skin=[119,80,34],light=[137,93,42],shade=[89,56,24];
  for(const side of [-1,1]) {
    const stride=pose.step*side,lift=Math.max(0,pose.lift*side),hip=[side*4.45,-1.4,27],knee=[side*5.2,3.3+stride*.5,15.3+lift*.3],ankle=[side*5.7,-1+stride,4.4+lift];
    limb(b,hip,knee,[[0,3.8,3.8],[.26,4.25,4.15],[.62,3.85,3.75],[.84,3.35,3.1],[1,3.0,3.0]],skin,d);
    limb(b,knee,ankle,[[0,3,3],[.24,3.35,3.0],[.5,2.9,2.6],[.84,2.2,2.1],[1,2.15,2.0]],skin,d);
    if(d)ell(b,knee,[3.0,3.0,2.15],skin,Math.max(0,d-1));
    ell(b,[ankle[0],ankle[1]+2.5,2.36+lift],[3.45,5.4,2.35],skin,d);
    for(const toe of [-1,0,1]) {
      const base=[ankle[0]+toe*1.85,ankle[1]+6.0,1.9+lift],end=[base[0]+toe*.2,base[1]+2.6,1.0+lift];
      b.cone(base,end,.68,BONE,{segments:[4,6,9][d],material:'bone'});
      if(d)ell(b,[base[0],base[1]-.7,base[2]+.1],[.83,1.8,.8],light,Math.max(0,d-1));
    }
    b.cone([knee[0]+side*.6,knee[1]+2.7,knee[2]],[knee[0]+side*1.6,knee[1]+5.8,knee[2]+.7],.9,BONE,{segments:[4,6,9][d],material:'bone'});
    if(d) {
      stroke(b,[add(mix(hip,knee,.25),[side*.5,3.0,0]),add(mix(hip,knee,.6),[side*.1,3.25,0]),add(mix(hip,knee,.85),[0,2.4,0])],.11,shade,0);
      stroke(b,[add(mix(knee,ankle,.2),[0,2.6,0]),add(mix(knee,ankle,.55),[0,2.35,0]),add(mix(knee,ankle,.8),[0,1.95,0])],.12,light,0);
    }
  }
  const body=remember(`part:imp-body:${d}`,()=>{
    const b=new MeshBuilder();
  ell(b,[0,-1.05,26.4],[6.7,4.0,3.6],skin,d);
  torso(b,true,skin,d);
  ell(b,[0,-3.25,43],[7.6,3.65,4.0],shade,d);
  for(const side of [-1,1]) {
    ell(b,[side*8.9,-.05,42.8],[4.15,3.9,3.8],light,d);
    for(const [base,tip,r] of [
      [[side*10.0,-.2,45],[side*15.7,-.9,49.0],1.5],
      [[side*11.4,-1.3,40.7],[side*16.5,-2.0,42.3],1.2],
      [[side*6.1,-4.5,43.7],[side*8.0,-7.7,46],1.0]]) {
      if(d)ell(b,base,[r*1.1,r,r*.65],shade,Math.max(0,d-1));
      limb(b,base,tip,[[0,r,r],[.42,r*.61,r*.62],[.8,r*.22,r*.23],[1,.035,.035]],BONE,d,'bone');
    }
    if(d) {
      stroke(b,[[side*1.3,4.7,38],[side*3.5,5.1,37.2],[side*6.3,3.8,37.6]],.09,shade,0);
      for(let i=0;i<3;i++)stroke(b,[[side*5.2,3.45,34.5-i*1.4],[side*6.1,3.15,33.9-i*1.4],[side*6.6,2.9,33.0-i*1.4]],.075,shade,0);
      if(d===2)stroke(b,[[side*3.5,-5.7,41],[side*5.3,-5.6,38],[side*5,-4.7,34.8]],.12,tone(skin,1.04),0);
    }
  }
    return b.finish('sculpted-imp-torso');
  });
  b.add(body);
  let elbows=[[12.0,3.2,35.5],[-12.0,3.2,35.5]],wrists=[[13.1,6.6,28.3],[-13.1,6.6,28.3]];
  if(pose.attack) {
    if(pose.frame==='E'){elbows=[[17.5,2,35.5],[-11.6,6,37.1]];wrists=[[23,7,31.8],[-5.2,9.4,38.8]];}
    else if(pose.frame==='F'){elbows=[[11.5,10,37.5],[-11.4,5.1,34.5]];wrists=[[6.4,19.4,38.8],[-5.8,8.4,32.4]];}
    else{elbows=[[11.2,11.5,39.1],[-12.5,3.7,34.3]];wrists=[[5.7,23.1,40.8],[-13.6,7,28.1]];}
  }else if(pose.pain){elbows=[[13.6,3.1,35.5],[-13.4,1.5,34.7]];wrists=[[6.2,9.5,34.7],[-18,4.1,28.8]];}
  else if(pose.dead){elbows=[[14.1,0,33.1],[-14.4,2,32.3]];wrists=[[17.3,1,23.5],[-17.1,3,25]];}
  for(let i=0;i<2;i++) {
    const side=i===0?1:-1,shoulder=[side*9.1,.1,42.4],elbow=elbows[i],wrist=wrists[i];
    limb(b,shoulder,elbow,[[0,3.6,3.6],[.25,3.85,3.7],[.5,3.6,3.45],[.83,2.7,2.7],[1,2.55,2.6]],skin,d);
    if(d)ell(b,elbow,[2.6,2.6,2.1],skin,Math.max(0,d-1));
    limb(b,elbow,wrist,[[0,2.55,2.6],[.3,2.95,2.65],[.6,2.5,2.2],[1,1.8,1.65]],skin,d);
    const quill=mix(shoulder,elbow,.76);
    limb(b,[quill[0]+side*1.8,quill[1]-1,quill[2]],[quill[0]+side*5.1,quill[1]-2,quill[2]+1.3],[[0,.9,.9],[.45,.55,.55],[1,.03,.03]],BONE,d,'bone');
    impHand(b,wrist,side,d,light,pose.attack);
    if(d)stroke(b,[add(mix(elbow,wrist,.18),[side*.4,2.1,.1]),add(mix(elbow,wrist,.52),[side*.2,2,.1]),add(mix(elbow,wrist,.86),[0,1.5,.1])],.11,shade,0);
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
export function proceduralCharacterCacheStats(){return {entries:cache.size,limit:LIMIT_ENTRIES,bytes:cacheBytes,byteLimit:LIMIT_BYTES};}
export default characterMesh;
