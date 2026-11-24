/** Analytic anatomical surfaces; no sampled images or imported mesh coordinates.
 * X is right, Y is forward, Z is up. Colours, pores, wounds and folds are fields.
 */
import {MeshBuilder, MATERIALS, MESH_VERTEX_STRIDE as S} from './procedural-mesh.js';
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),gauss=(x,s)=>Math.exp(-((x/s)**2));
const tone=(c,f)=>c.map(x=>x*f);
function sampleProfile(points,z){
  if(z<=points[0][0])return points[0].slice(1);
  if(z>=points.at(-1)[0])return points.at(-1).slice(1);
  const i=Math.min(points.length-1,Math.max(1,points.findIndex(p=>p[0]>=z)));
  const a=points[i-1],b=points[i],p=points[Math.max(0,i-2)],n=points[Math.min(points.length-1,i+1)],u=clamp((z-a[0])/(b[0]-a[0]),0,1);
  return a.slice(1).map((_,k)=>{
    k++;const span=b[0]-a[0],m0=(b[k]-p[k])/(b[0]-p[0])*span,m1=(n[k]-a[k])/(n[0]-a[0])*span,u2=u*u,u3=u2*u;
    return(2*u3-3*u2+1)*a[k]+(u3-2*u2+u)*m0+(-2*u3+3*u2)*b[k]+(u3-u2)*m1;
  });
}

/** Keeps a colour at every vertex rather than making flat triangular patches. */
class Surface {
  constructor(material='skin'){this.data=[];this.material=typeof material==='string'?MATERIALS[material]:{...MATERIALS[material.kind],...material,kind:MATERIALS[material.kind]?.kind??material.kind};}
  triangle(a,b,c){
    let face=cross(sub(b.p,a.p),sub(c.p,a.p));if(Math.hypot(...face)<1e-8)return;
    const avg=a.n.map((x,i)=>x+b.n[i]+c.n[i]);
    if(face[0]*avg[0]+face[1]*avg[1]+face[2]*avg[2]<0){[b,c]=[c,b];face=face.map(x=>-x);}
    for(const v of[a,b,c]){
      let normal=v.n;if(normal[0]*face[0]+normal[1]*face[1]+normal[2]*face[2]<=1e-9)normal=norm(face);
      const m=v.material||this.material;
      this.data.push(...v.p,...normal,...v.c.map(x=>clamp(x/255,0,1)),v.emissive||0,m.roughness,m.metalness,m.kind,m.scale||1,...(v.s||v.p));
    }
  }
  finish(key){
    const vertices=new Float32Array(this.data),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<vertices.length;i+=S)for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[i+k]);max[k]=Math.max(max[k],vertices[i+k]);}
    return {key,vertices,stride:S,triangles:vertices.length/(S*3),bounds:{min,max}};
  }
}
function revolution(point,colour,rows,columns,key,material='skin'){
  const surface=new Surface(material),grid=[];
  for(let row=0;row<=rows;row++){
    const t=row/rows,line=[];
    for(let col=0;col<=columns;col++){
      const a=(col%columns)*TAU/columns,p=point(a,t),e=.00005;
      const tangent=sub(point(a+e,t),point(a-e,t)),vertical=sub(point(a,Math.min(1,t+e)),point(a,Math.max(0,t-e)));
      const c=colour(p,a,t),n=norm(cross(tangent,vertical));
      line.push({p,n,c:Array.isArray(c)?c:c.color,material:c.material,s:p});
    }grid.push(line);
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const a=grid[row][col],b=grid[row][col+1],c=grid[row+1][col+1],d=grid[row+1][col];
    surface.triangle(a,b,c);surface.triangle(a,c,d);
  }
  for(const row of[0,rows]){
    const ring=grid[row],p=[0,0,0],neighbour=[0,0,0];
    for(let i=0;i<columns;i++)for(let k=0;k<3;k++)p[k]+=ring[i].p[k]/columns;
    for(let i=0;i<columns;i++)for(let k=0;k<3;k++)neighbour[k]+=grid[row?rows-1:1][i].p[k]/columns;
    const normal=norm(sub(p,neighbour));
    const centre={p,n:normal,c:ring[0].c};
    for(let i=0;i<columns;i++)surface.triangle(centre,{...ring[i],n:normal},{...ring[i+1],n:normal});
  }
  return surface.finish(key);
}

/** Continuous ellipsoidal loft with an anatomically variable front/back depth. */
export function anatomicalLoft(profile,{detail=2,color=[170,138,110],material='skin',deform=null,colours=null,rows=null,columns=null,key='anatomical-loft'}={}){
  const bottom=profile[0][0],height=profile.at(-1)[0]-bottom;
  const point=(a,t)=>{
    const z=bottom+t*height,[rx,front,back,cy=0]=sampleProfile(profile,z),x=Math.cos(a)*Math.max(.02,rx),sin=Math.sin(a);
    let p=[x,cy+sin*(sin>=0?front:back),z];if(deform)p=deform(p,a,t);return p;
  };
  return revolution(point,(p,a,t)=>colours?colours(p,a,t):color,rows??[7,14,34][detail],columns??[8,16,32][detail],key,material);
}

/** Smooth closed finger/arm along a Bézier-like centre curve, not a bead chain. */
export function anatomicalSweep(path,radii,{detail=2,color=[170,138,110],material='skin',fold=0,rows=null,columns=null,key='anatomical-sweep'}={}){
  const sample=t=>{
    const u=t*(path.length-1),i=Math.min(path.length-2,Math.floor(u)),v=u-i,a=path[i],b=path[i+1],p=path[Math.max(0,i-1)],n=path[Math.min(path.length-1,i+2)];
    const point=a.map((x,k)=>.5*(2*x+(-p[k]+b[k])*v+(2*p[k]-5*x+4*b[k]-n[k])*v*v+(-p[k]+3*x-3*b[k]+n[k])*v*v*v));
    const radius=radii[i]+(radii[i+1]-radii[i])*(v*v*(3-2*v));return {point,radius};
  };
  const overall=norm(sub(path.at(-1),path[0])),reference=Math.abs(overall[2])>.85?[0,1,0]:[0,0,1];
  const point=(angle,t)=>{
    const {point:p,radius:r}=sample(t),ahead=sample(Math.min(1,t+.001)).point,behind=sample(Math.max(0,t-.001)).point;
    const axis=norm(sub(ahead,behind)),u=norm(cross(reference,axis)),v=cross(axis,u);
    const ripple=1+fold*Math.sin(t*TAU*6+Math.sin(angle*3)*.5)*Math.sin(Math.PI*t)**2;
    return p.map((x,k)=>x+(u[k]*Math.cos(angle)+v[k]*Math.sin(angle)*.9)*r*ripple);
  };
  return revolution(point,()=>color,rows??[4,8,16][detail],columns??[5,8,12][detail],key,material);
}

/** Thin sewn or folded cloth with a curved front and a closed reverse. */
export function tailoredPanel(point,{color=[140,132,110],detail=2,thickness=.055,key='tailored-panel'}={}){
  const s=new Surface('cloth'),steps=[1,2,5][detail],front=[],back=[];
  for(let row=0;row<=steps;row++){
    const f=[],r=[];for(let col=0;col<=steps;col++){
      const u=col/steps,v=row/steps,p=point(u,v),du=sub(point(Math.min(1,u+.0001),v),point(Math.max(0,u-.0001),v)),dv=sub(point(u,Math.min(1,v+.0001)),point(u,Math.max(0,v-.0001)));
      let n=norm(cross(du,dv));if(n[1]<0)n=n.map(x=>-x);
      f.push({p,n,c:color});r.push({p:p.map((x,k)=>x-n[k]*thickness),n:n.map(x=>-x),c:tone(color,.94)});
    }front.push(f);back.push(r);
  }
  for(let row=0;row<steps;row++)for(let col=0;col<steps;col++)for(const grid of[front,back]){
    s.triangle(grid[row][col],grid[row][col+1],grid[row+1][col+1]);s.triangle(grid[row][col],grid[row+1][col+1],grid[row+1][col]);
  }
  const edges=[];
  for(let i=0;i<steps;i++)edges.push([[0,i],[0,i+1]],[[steps,i],[steps,i+1]],[[i,0],[i+1,0]],[[i,steps],[i+1,steps]]);
  for(const[a,b]of edges){
    const points=[front[a[0]][a[1]],front[b[0]][b[1]],back[b[0]][b[1]],back[a[0]][a[1]]],normal=norm(cross(sub(points[1].p,points[0].p),sub(points[2].p,points[0].p))),v=points.map(p=>({...p,n:normal}));
    s.triangle(v[0],v[1],v[2]);s.triangle(v[0],v[2],v[3]);
  }
  return s.finish(key);
}

function ear(side,d,skin){
  const b=new MeshBuilder(),s=new Surface('skin'),rings=[4,5,10][d],cols=[8,12,24][d];
  if(!d)return b.ellipsoid([side*3.13,-.10,4.92],[.30,.45,.91],skin,{segments:6,rings:4,material:'skin'}).finish('distant-ear');
  const point=(a,t,back=false)=>{
    const r=.035+t*.965,z=Math.sin(a)*.94*r,y=Math.cos(a)*.48*r-.12-.10*z;
    const helix=.16*gauss(r-.82,.13),concha=-.055*gauss(r-.38,.24),anti=.075*gauss(r-.55-.08*Math.sin(a*2),.12);
    return [side*(3.11+(back?-.10:.07+helix+concha+anti)),y,4.92+z];
  };
  for(const back of[false,true]){
    const grid=[];
    for(let row=0;row<=rings;row++){
      const line=[];for(let c=0;c<=cols;c++){
        const a=c*TAU/cols,t=row/rings,p=point(a,t,back),da=sub(point(a+.001,t,back),point(a-.001,t,back)),dt=sub(point(a,Math.min(1,t+.001),back),point(a,Math.max(0,t-.001),back));
        let n=norm(cross(da,dt));if(n[0]*side*(back?-1:1)<0)n=n.map(x=>-x);
        const shade=back?.86:.90+.09*t-.09*gauss(t-.35,.2);line.push({p,n,c:[skin[0]*shade,skin[1]*shade*.93,skin[2]*shade*.94]});
      }grid.push(line);
    }
    for(let r=0;r<rings;r++)for(let c=0;c<cols;c++){s.triangle(grid[r][c],grid[r+1][c],grid[r+1][c+1]);s.triangle(grid[r][c],grid[r+1][c+1],grid[r][c+1]);}
  }
  for(const radius of[0,1])for(let c=0;c<cols;c++){
    const a=c*TAU/cols,z=(c+1)*TAU/cols,p=[point(a,radius),point(z,radius),point(z,radius,true),point(a,radius,true)],n=norm(sub(p[0],[side*3.2,-.12,4.95]));
    const v=p.map(p=>({p,n,c:tone(skin,.91)}));s.triangle(v[0],v[1],v[2]);s.triangle(v[0],v[2],v[3]);
  }
  b.add(s.finish('sculpted-ear'));
  b.ellipsoid([side*3.23,.20,4.72],[.14,.19,.23],tone(skin,.97),{segments:8,rings:5,material:'skin'});
  return b.finish('sculpted-ear');
}

function eyeMesh(x,z,faceAt,skin,d,demonic=false){
  const b=new MeshBuilder(),e=new Surface('skin'),white=new Surface('glass'),size=demonic?.78:.65,height=demonic?.19:.185;
  const y=faceAt(x,z)+.27,cols=[8,12,26][d],rings=[1,2,5][d],sclera=demonic?[159,73,25]:[187,184,165];
  // A convex almond patch exposes only the part of the globe between the lids.
  // There is no complete white bead protruding through the orbit in profile.
  const visible=(a,r)=>[x+Math.cos(a)*size*r,y+.10-.18*r*r,z+Math.sin(a)*height*r*(1-.20*Math.abs(Math.cos(a)))];
  const gridWhite=[];
  for(let r=0;r<=rings;r++){
    const row=[];for(let i=0;i<=cols;i++){
      const a=i*TAU/cols,t=Math.max(.001,r/rings),p=visible(a,t);
      row.push({p,n:norm([(p[0]-x)*.45,1,(p[2]-z)*1.2]),c:sclera});
    }gridWhite.push(row);
  }
  for(let r=0;r<rings;r++)for(let i=0;i<cols;i++){white.triangle(gridWhite[r][i],gridWhite[r+1][i],gridWhite[r+1][i+1]);white.triangle(gridWhite[r][i],gridWhite[r+1][i+1],gridWhite[r][i+1]);}
  b.add(white.finish('visible-sclera'));
  const point=(a,t)=>{
    const width=size+t*.32,h=height+t*(Math.sin(a)>0?.34:.29),xx=x+Math.cos(a)*width,zz=z+Math.sin(a)*h*(1-.20*Math.abs(Math.cos(a)));
    const outer=faceAt(xx,zz)+.012,inner=y-.08,bulge=.035*Math.sin(t*Math.PI);
    return [xx,inner+(outer-inner)*t+bulge,zz];
  };
  const grid=[];
  for(let row=0;row<=rings;row++){
    const line=[];for(let i=0;i<=cols;i++){
      const a=i*TAU/cols,t=row/rings,p=point(a,t),da=sub(point(a+.0001,t),point(a-.0001,t)),dt=sub(point(a,Math.min(1,t+.0001)),point(a,Math.max(0,t-.0001)));
      let n=norm(cross(da,dt));if(n[1]<0)n=n.map(v=>-v);
      line.push({p,n,c:mix([skin[0]*.91,skin[1]*.79,skin[2]*.78],skin,Math.min(1,t*3.2))});
    }grid.push(line);
  }
  for(let r=0;r<rings;r++)for(let c=0;c<cols;c++){e.triangle(grid[r][c],grid[r][c+1],grid[r+1][c+1]);e.triangle(grid[r][c],grid[r+1][c+1],grid[r+1][c]);}
  b.add(e.finish('eyelids'));
  const iris=demonic?.15:.155,pupil=demonic?.055:.065;
  b.cylinder([x,y+.092,z],[x,y+.109,z],iris,demonic?[230,57,4]:[65,61,43],{segments:[6,12,24][d],material:'glass',emissive:demonic?.14:0});
  b.cylinder([x,y+.11,z],[x,y+.114,z],pupil,[9,10,8],{segments:[6,10,20][d],material:'glass'});
  if(d===2)for(let i=0;i<12;i++){
    const a=i*TAU/12,pa=[x+Math.cos(a)*iris*.57,y+.112,z+Math.sin(a)*iris*.57],pb=[x+Math.cos(a)*iris*.94,y+.112,z+Math.sin(a)*iris*.94];
    b.cylinder(pa,pb,.008,demonic?[241,130,28]:[104+i%3*8,88,48],{segments:3,material:'glass'});
  }
  return b.finish('orbital-eye');
}

export function sculptedHead(guard,d,dead=false,imp=false,open=false){
  const b=new MeshBuilder(),skin=imp?[125,82,46]:guard?[184,139,115]:[180,157,136];
  const profile=imp?[[-2.3,1.55,1.6,2.2,-2.5],[0,1.80,1.70,2.10,-.30],[1.2,2.55,2.75,2.45,0],[2.4,3.05,2.80,2.6,.1],[4.4,3.30,2.55,2.8,0],[6.4,3.8,2.55,2.9,-.1],[7.7,3.9,2.7,2.95,-.2],[8.8,3.3,2.2,2.5,-.3],[9.6,1.60,1.50,1.60,-.3],[9.9,.04,.04,.04,-.3]]:
    [[-1.9,1.63,1.4,1.55,-.7],[-.1,1.65,1.45,1.6,-.6],[1.1,2.0,2.25,1.7,-.35],[2.2,2.7,2.4,2.05,-.15],[4.2,3.18,2.28,2.75,0],[5.8,3.18,2.06,3.0,0],[7.4,3.18,2.65,3.0,-.1],[8.7,2.85,2.65,2.65,-.14],[9.55,1.75,1.8,1.8,-.14],[9.9,.05,.05,.05,-.14]];
  const z0=profile[0][0],zHeight=profile.at(-1)[0]-z0,mouthZ=imp?(open?3.6:3.7):3.0,mouthH=imp?(open?1.50:.62):(dead?.36:.16),mouthW=imp?1.90:1.28;
  const deformation=(x,z)=>{
    let y=0;
    const ax=Math.abs(x),eyes=imp?1.40:1.24,eyeZ=imp?6.75:5.95;
    y-=.46*gauss(ax-eyes,.80)*gauss(z-eyeZ,.55);
    y+=(imp?.76:.29)*gauss(ax-eyes,1.00)*gauss(z-(eyeZ+.60),.40);
    y+=.20*gauss(x,.35)*gauss(z-(eyeZ+.4),.8);
    y+=(imp?.70:.42)*gauss(ax-1.9,.75)*gauss(z-4.9,.72);
    y-=(imp?.44:.20)*gauss(ax-2.15,.55)*gauss(z-3.65,.72);
    y+=(imp?.48:.58)*gauss(x,.39)*gauss(z-5.25,1.05);
    y+=(imp?.78:.92)*gauss(x,imp?.79:.50)*gauss(z-4.36,.43);
    y+=.35*gauss(ax-.5,.23)*gauss(z-4.16,.22);
    y-=.23*gauss(ax-.4,.12)*gauss(z-4.06,.095);
    y+=.15*gauss(x,1.2)*gauss(z-3.45,.62);
    const curve=-.07*(x/mouthW)**2,dz=z-mouthZ-curve,localH=mouthH*Math.sqrt(Math.max(.02,1-(x/mouthW)**2));
    y-=(imp?1.20:.58)*Math.exp(-((x/mouthW)**4)-((dz/Math.max(.04,localH))**4));
    y+=(imp?.19:.13)*gauss(x,mouthW)*gauss(dz-localH,imp?.19:.12);
    y+=(imp?.23:.18)*gauss(x,mouthW)*gauss(dz+localH,imp?.22:.14);
    y+=(imp?.35:.38)*gauss(x,1.25)*gauss(z-(imp?1.4:1.8),.52);
    const naso=.55+.32*(4.1-z);y-=.075*gauss(ax-naso,.09)*gauss(z-3.7,.55);
    if(d===2){
      y-=.015*Math.pow(.5+.5*Math.cos(z*10+x*.2),4)*gauss(z-7.55,.58)*gauss(x,2.2);
      y-=.045*gauss(ax-2.20,.20)*gauss(z-eyeZ,.32);
      if(imp)y-=.07*gauss(ax-(1.9+.18*(z-4)),.12)*gauss(z-5.2,1.5);
    }
    return y;
  };
  const point=(a,t)=>{
    const z=z0+t*zHeight,[rx,front,back,cy]=sampleProfile(profile,z),x=Math.cos(a)*Math.max(.02,rx),s=Math.sin(a);
    const frontal=Math.pow(Math.max(0,s),5);let y=cy+s*(s>=0?front:back)+deformation(x,z)*frontal;
    if(imp)y+=.055*Math.sin(z*2.8+x*.9)*frontal*gauss(z-7.7,1.3);
    return [x,y,z];
  };
  const faceAt=(x,z)=>{const [rx]=sampleProfile(profile,z);return point(Math.acos(clamp(x/Math.max(.02,rx),-.99999,.99999)),clamp((z-z0)/zHeight,0,1))[1];};
  const colours=(p,a)=>{
    const[x,y,z]=p,front=Math.max(0,Math.sin(a)),ax=Math.abs(x),dz=z-mouthZ+.07*(x/mouthW)**2,localH=mouthH*Math.sqrt(Math.max(.02,1-(x/mouthW)**2));
    let color=skin.slice();const mottled=.5+.5*Math.sin(x*5.8+Math.sin(z*6.1))*Math.sin(z*8.7-x*3.1);
    const blush=gauss(ax-2.0,.8)*gauss(z-4.9,.75)+.55*gauss(x,.7)*gauss(z-4.2,.5);
    color=color.map((c,k)=>c*(.982+.022*mottled)*(1+(k===0?.035:-.035)*blush*front));
    const cavity=clamp((1-(x/mouthW)**4-(dz/localH)**4)*6,0,1)*front**8;
    color=mix(color,imp?[31,14,10]:[63,31,27],cavity);
    const nostril=gauss(ax-.4,.13)*gauss(z-4.05,.11)*front**8;color=mix(color,imp?[32,20,13]:[67,38,30],nostril*.85);
    const lip=gauss(x,mouthW)*Math.max(gauss(dz-localH,.13),gauss(dz+localH,.16))*front**8;
    color=mix(color,imp?[100,49,31]:[139,84,72],lip*.65);
    if(!imp){
      const socket=gauss(ax-1.24,.9)*gauss(z-5.95,.65)*front**5;color=mix(color,[133,111,99],socket*.33);
      const stubble=gauss(z-2.4,1.2)*front*(.35+.65*gauss(ax-1.5,1.6));color=mix(color,[101,105,91],stubble*(guard?.14:.11));
      const gash=gauss(x-(guard?-2.55:2.55),.30)*gauss(z-4.65,.88)*front;
      color=mix(color,[94,31,24],gash*(.7+.3*mottled));
      if(dead)color=mix(color,[97,48,36],gauss(x-.5,1)*gauss(z-3.6,1.3)*front*.6);
    }
    return color;
  };
  b.add(revolution(point,colours,[imp?8:10,22,66][d],[imp?10:12,24,64][d],'continuous-sculpted-head',{kind:'skin',roughness:imp?.79:.71}));
  if(!imp)for(const side of[-1,1])b.add(ear(side,d,skin));
  for(const side of[-1,1]){
    const x=side*(imp?1.40:1.24),z=imp?6.75:5.95;b.add(eyeMesh(x,z,faceAt,skin,d,imp));
    if(d&&!imp){
      const brow=new MeshBuilder(),colour=imp?[76,46,27]:guard?[75,57,42]:[56,66,35];
      const points=Array.from({length:d===2?9:4},(_,i)=>{const u=i/(d===2?8:3),xx=side*(.52+1.73*u),zz=(imp?7.27:6.54)-.09*Math.sin(u*Math.PI)+.11*u;return[xx,faceAt(xx,zz)+.035,zz];});
      brow.add(anatomicalSweep(points,points.map((_,i)=>.032+.07*Math.sin(Math.PI*(i+.4)/(points.length))),{detail:d,color:colour,material:'cloth',rows:d===2?16:5,columns:5}));b.add(brow.finish('brows'));
    }
  }
  const count=d===0?4:d===1?6:10;
  for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*(imp?3.1:1.78)/count,curve=-.07*(x/mouthW)**2,y=faceAt(x,mouthZ+mouthH)-(imp?.44:.17);
    if(imp){
      const arc=Math.sqrt(1-.55*(x/mouthW)**2),top=[x,y,mouthZ+mouthH*.83*arc+curve],bottom=[x,y-.10,mouthZ-mouthH*.82*arc+curve];
      const length=(i===0||i===count-1)?.77:.43+.055*Math.sin(i*2.9);
      b.cone(top,[x*.97,y+.08,top[2]-length],.20,[191,172,130],{segments:[4,6,10][d],material:'bone'});
      b.cone(bottom,[x*.97,y+.05,bottom[2]+length*.75],.17,[169,149,111],{segments:[4,6,10][d],material:'bone'});
    }else{
      const width=1.78/count*.91,height=dead?.25:.16;
      if(d)b.roundedBox([x,y-.05,mouthZ+mouthH*.42+curve],[width,.17,height],.029,[177-i%3*5,166-i%2*6,143],{material:'bone',rotation:[0,0,-x*.12]});
      else b.box([x,y-.05,mouthZ+mouthH*.42+curve],[width,.15,height],[177,166,143],{material:'bone'});
      if(d===2&&dead)b.roundedBox([x,y-.13,mouthZ-mouthH*.70+curve],[width*.93,.15,.12],.026,[158,141,119],{material:'bone'});
    }
  }
  if(!guard&&!imp){
    const hairline=a=>7.75-1.35*(1-Math.max(0,Math.sin(a)))+.055*Math.sin(a*7);
    const hairPoint=(a,t)=>{const z=hairline(a)+(9.94-hairline(a))*t,p=point(a,clamp((z-z0)/zHeight,0,1)),grain=d===2?.004*Math.sin(a*51+t*27):0;return[p[0]*(1.014+grain*.08),p[1]*(1.014+grain*.08),p[2]+.045+grain];};
    b.add(revolution(hairPoint,(p,a,t)=>tone([43,55,29],.82+.18*Math.sin(a*79+t*17)**2),[3,7,16][d],[12,24,64][d],'cropped-hair',{kind:'cloth',roughness:.99,scale:.14}));
    if(d===2)for(let i=0;i<144;i++){
      const a=i*2.399,t=.02+.96*((i*.6180339)%1),p=hairPoint(a,t),q=hairPoint(a+.015,.025+t*.975);
      q[0]*=1.009;q[1]*=1.009;q[2]+=.035;
      b.cylinder(p,q,.012,[45+i%5*4,55+i%7*3,28+i%4*3],{segments:3,topRadius:.002,material:{kind:'cloth',roughness:.99,scale:.14}});
    }
  }
  return b.finish(imp?'sculpted-demon-head':'sculpted-human-head');
}
