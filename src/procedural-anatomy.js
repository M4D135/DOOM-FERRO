/** Analytic anatomical surfaces; no sampled images or imported mesh coordinates.
 * X is right, Y is forward, Z is up. Colours, pores, wounds and folds are fields.
 */
import {MeshBuilder, MATERIALS, MESH_VERTEX_STRIDE as S} from './procedural-mesh.js';
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),gauss=(x,s)=>Math.exp(-((x/s)**2));
const tone=(c,f)=>c.map(x=>x*f);

/** Rest-space skin pigmentation. The same field follows a bent limb instead
 * of swimming with the camera or becoming an attached decal. Broad mottling
 * does the useful work at game distance; fine grain only breaks uniformity. */
export function dermalColour(p,color,demonic=false){
  const[x,y,z]=p;
  const broad=Math.sin(x*.73+Math.sin(z*.39+y*.31))*Math.sin(z*.62-y*.83);
  const grain=Math.sin(x*5.3+Math.sin(z*4.1))*Math.sin(z*6.9+y*2.7);
  let c=tone(color,1+broad*(demonic?.075:.033)+grain*.011);
  if(demonic){
    const crease=gauss(Math.sin(z*.86+x*.37+Math.sin(y*.6)),.18);
    c=mix(c,[64,45,30],crease*.11);
  }else{
    const bruise=gauss(x-1.55*Math.sin(z*.42+y*.19),.75)*gauss(Math.sin(z*.36+.9),.29);
    c=mix(c,[105,111,96],bruise*.16);
    const vessel=gauss(x-(.62*Math.sin(z*.68)+.24*Math.sin(z*1.8)),.055)*gauss(z-12,8);
    c=mix(c,[92,107,96],vessel*.16);
  }
  return c;
}
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

/** Evaluate the actual front envelope so attached cloth can follow it. */
export function anatomicalFront(profile,x,z,deform=null){
  const [rx,front,,cy=0]=sampleProfile(profile,z),a=Math.acos(clamp(x/Math.max(.02,rx),-.99999,.99999));
  const p=[x,cy+Math.sin(a)*front,z];return(deform?deform(p,a,0):p)[1];
}

/** Smooth closed finger/arm along a Bézier-like centre curve, not a bead chain. */
export function anatomicalSweep(path,radii,{detail=2,color=[170,138,110],material='skin',fold=0,colours=null,rows=null,columns=null,key='anatomical-sweep'}={}){
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
  return revolution(point,(p,a,t)=>colours?colours(p,a,t):color,rows??[4,8,16][detail],columns??[5,8,12][detail],key,material);
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
  const b=new MeshBuilder(),e=new Surface('skin'),white=new Surface('glass'),size=demonic?.70:.61,height=demonic?.16:.125;
  const side=Math.sign(x),y=faceAt(x,z)+.22,cols=[8,12,26][d],rings=[1,2,5][d],sclera=demonic?[128,45,15]:[145,148,126];
  const lidTilt=demonic?.10:.07;
  // A convex almond patch exposes only the part of the globe between the lids.
  // There is no complete white bead protruding through the orbit in profile.
  const visible=(a,r)=>[x+Math.cos(a)*size*r,y+.085-.16*r*r,z+Math.sin(a)*height*r*(1-.20*Math.abs(Math.cos(a)))+side*Math.cos(a)*size*r*lidTilt];
  const gridWhite=[];
  for(let r=0;r<=rings;r++){
    const row=[];for(let i=0;i<=cols;i++){
      const a=i*TAU/cols,t=Math.max(.001,r/rings),p=visible(a,t);
      const edge=gauss(Math.abs(Math.cos(a)*t)-.90,.2);
      row.push({p,n:norm([(p[0]-x)*.45,1,(p[2]-z)*1.2]),c:mix(sclera,demonic?[110,29,12]:[125,67,57],edge*.34)});
    }gridWhite.push(row);
  }
  for(let r=0;r<rings;r++)for(let i=0;i<cols;i++){white.triangle(gridWhite[r][i],gridWhite[r+1][i],gridWhite[r+1][i+1]);white.triangle(gridWhite[r][i],gridWhite[r+1][i+1],gridWhite[r][i+1]);}
  b.add(white.finish('visible-sclera'));
  const point=(a,t)=>{
    const width=size+t*.34,h=height+t*(Math.sin(a)>0?.36:.29),xx=x+Math.cos(a)*width,zz=z+Math.sin(a)*h*(1-.20*Math.abs(Math.cos(a)))+side*(xx-x)*lidTilt;
    const outer=faceAt(xx,zz)+.012,inner=y-.075,bulge=(Math.sin(a)>0?.065:.035)*Math.sin(t*Math.PI);
    return [xx,inner+(outer-inner)*t+bulge,zz];
  };
  const grid=[];
  for(let row=0;row<=rings;row++){
    const line=[];for(let i=0;i<=cols;i++){
      const a=i*TAU/cols,t=row/rings,p=point(a,t),da=sub(point(a+.0001,t),point(a-.0001,t)),dt=sub(point(a,Math.min(1,t+.0001)),point(a,Math.max(0,t-.0001)));
      let n=norm(cross(da,dt));if(n[1]<0)n=n.map(v=>-v);
      const rim=demonic?[70,37,22]:[107,80,70];
      line.push({p,n,c:mix(rim,dermalColour(p,skin,demonic),Math.min(1,t*1.8))});
    }grid.push(line);
  }
  for(let r=0;r<rings;r++)for(let c=0;c<cols;c++){e.triangle(grid[r][c],grid[r][c+1],grid[r+1][c+1]);e.triangle(grid[r][c],grid[r+1][c+1],grid[r+1][c]);}
  b.add(e.finish('eyelids'));
  // Iris fibres are a continuous corneal patch, not dozens of tiny rods.
  // Its vertical radius fits behind the narrow lids, so it cannot protrude.
  const iris=new Surface('glass'),ir=demonic?.17:.18,iz=height*.92,segments=[8,14,26][d],bands=[2,3,5][d],eyeGrid=[];
  for(let ring=0;ring<=bands;ring++){
    const line=[],r=Math.max(.001,ring/bands);
    for(let i=0;i<=segments;i++){
      const a=i*TAU/segments,xx=x+Math.cos(a)*ir*r,zz=z+Math.sin(a)*iz*r+side*(xx-x)*lidTilt;
      const pupil=r<(demonic?.34:.29),fibre=.86+.14*Math.sin(a*13+r*5)**2;
      let c=pupil?[12,14,11]:tone(demonic?[231,76,9]:[112,118,91],fibre);
      if(r>.82)c=mix(c,demonic?[120,31,8]:[65,73,53],(r-.82)*3);
      line.push({p:[xx,y+.09+.012*(1-r*r),zz],n:[0,1,0],c,emissive:demonic&&!pupil?.105:0});
    }eyeGrid.push(line);
  }
  for(let r=0;r<bands;r++)for(let i=0;i<segments;i++){
    iris.triangle(eyeGrid[r][i],eyeGrid[r+1][i],eyeGrid[r+1][i+1]);
    iris.triangle(eyeGrid[r][i],eyeGrid[r+1][i+1],eyeGrid[r][i+1]);
  }
  b.add(iris.finish('recessed-iris'));
  return b.finish('orbital-eye');
}

export function sculptedHead(guard,d,dead=false,imp=false,open=false){
  const b=new MeshBuilder(),skin=imp?[108,76,44]:guard?[170,129,102]:[163,146,121];
  // The cranium, cheek, masseter, jaw and neck are one envelope. Distinct
  // profiles keep the bald shotgun guard from being the rifleman with no hair.
  const profile=imp?[[-2.3,1.55,1.55,2.2,-2.6],[-.3,1.62,1.72,2.20,-.55],[.75,2.15,2.25,2.35,-.05],[1.8,2.82,2.55,2.55,.12],[3.9,3.30,2.45,2.65,.04],[5.7,3.38,2.26,2.85,-.20],[7.1,3.78,2.65,2.96,-.38],[8.5,3.33,2.58,2.90,-.40],[9.5,1.70,1.72,1.86,-.40],[9.9,.04,.04,.04,-.40]]:
    [[-1.9,1.54,1.35,1.55,-.74],[-.1,1.49,1.30,1.62,-.64],[1.0,1.85,2.22,1.72,-.32],[2.0,guard?2.75:2.48,2.37,2.12,-.17],[3.8,3.05,2.08,2.66,-.02],[5.1,3.23,2.16,2.86,0],[6.4,3.07,2.18,2.98,-.10],[7.7,3.18,2.62,2.98,-.17],[8.9,2.64,2.54,2.56,-.20],[9.62,1.40,1.53,1.57,-.20],[9.9,.05,.05,.05,-.20]];
  const z0=profile[0][0],zHeight=profile.at(-1)[0]-z0,mouthZ=imp?(open?3.50:3.68):2.98,mouthH=imp?(open?1.55:1.08):(dead?.51:.38),mouthW=imp?1.83:guard?1.37:1.28;
  const mouthCurve=x=>-.10*(x/mouthW)**2+(imp?.018:guard?-.062:.075)*x;
  const deformation=(x,z)=>{
    let y=0;
    const ax=Math.abs(x),eyes=imp?1.40:1.24,eyeZ=imp?6.62:5.96;
    y-=(imp?.61:.53)*gauss(ax-eyes,.77)*gauss(z-eyeZ,.53);
    y+=(imp?.87:.40)*gauss(ax-eyes,.93)*gauss(z-(eyeZ+.48+.11*ax),.32);
    y+=(imp?.30:.21)*gauss(x,.34)*gauss(z-(eyeZ+.53),.73);
    y-=(imp?.18:.22)*gauss(ax-2.66,.42)*gauss(z-6.85,.74); // temples
    y+=(imp?.68:.55)*gauss(ax-1.98,.66)*gauss(z-4.96,.56); // cheekbone
    y-=(imp?.57:.42)*gauss(ax-2.08,.51)*gauss(z-3.78,.72);
    y+=(imp?.19:.31)*gauss(ax-2.10,.55)*gauss(z-2.31,.52); // masseter
    y+=(imp?.40:.64)*gauss(x,.36)*gauss(z-5.27,.88);
    y+=(imp?.54:.83)*gauss(x,imp?.74:.48)*gauss(z-4.48,.35);
    y+=(imp?.24:.31)*gauss(ax-.47,.24)*gauss(z-4.25,.22);
    y-=.23*gauss(ax-.40,.13)*gauss(z-4.13,.11);
    y+=.15*gauss(x,1.2)*gauss(z-3.58,.55);
    const dz=z-mouthZ-mouthCurve(x),localH=mouthH*Math.sqrt(Math.max(.02,1-(x/mouthW)**2));
    y-=(imp?1.50:.84)*Math.exp(-((x/mouthW)**4)-((dz/Math.max(.04,localH))**4));
    y+=(imp?.17:.12)*gauss(x,mouthW)*gauss(dz-localH,imp?.19:.12);
    y+=(imp?.25:.16)*gauss(x,mouthW)*gauss(dz+localH,imp?.22:.14);
    y+=(imp?.36:.44)*gauss(x,1.17)*gauss(z-(imp?1.25:1.72),.44);
    const naso=.62+.41*(4.22-z);y-=.12*gauss(ax-naso,.13)*gauss(z-3.73,.63);
    y-=.08*gauss(x,.16)*gauss(z-3.76,.23); // philtrum
    if(!imp){
      y-=.07*gauss(x-(guard?-2.37:2.37),.22)*gauss(z-4.52,.78);
      y+=.11*gauss(ax-(.85+.18*(1-z)),.18)*gauss(z+.55,1.35); // neck tendons
    }
    if(d===2){
      y-=.024*Math.pow(.5+.5*Math.cos(z*9+x*.35),4)*gauss(z-7.63,.56)*gauss(x,2.3);
      y-=.06*gauss(ax-2.18,.16)*gauss(z-eyeZ,.32);
      y-=.045*gauss(ax-.33,.095)*gauss(z-6.98,.5);
      if(imp)y-=.10*gauss(ax-(1.85+.16*(z-4)),.16)*gauss(z-5.13,1.45);
    }
    return y;
  };
  const point=(a,t)=>{
    const z=z0+t*zHeight,[rx,front,back,cy]=sampleProfile(profile,z),x=Math.cos(a)*Math.max(.02,rx),s=Math.sin(a);
    const frontal=Math.pow(Math.max(0,s),5);let y=cy+s*(s>=0?front:back)+deformation(x,z)*frontal;
    if(imp)y+=.075*Math.sin(z*2.8+x*.9)*frontal*gauss(z-7.7,1.3);
    return [x,y,z];
  };
  const faceAt=(x,z)=>{const [rx]=sampleProfile(profile,z);return point(Math.acos(clamp(x/Math.max(.02,rx),-.99999,.99999)),clamp((z-z0)/zHeight,0,1))[1];};
  const colours=(p,a)=>{
    const[x,y,z]=p,front=Math.max(0,Math.sin(a)),ax=Math.abs(x),dz=z-mouthZ-mouthCurve(x),localH=mouthH*Math.sqrt(Math.max(.02,1-(x/mouthW)**2));
    let color=dermalColour(p,skin,imp);const mottled=.5+.5*Math.sin(x*5.8+Math.sin(z*6.1))*Math.sin(z*8.7-x*3.1);
    const blush=gauss(ax-2.0,.8)*gauss(z-4.9,.75)+.55*gauss(x,.7)*gauss(z-4.2,.5);
    color=color.map((c,k)=>c*(.982+.022*mottled)*(1+(k===0?.035:-.035)*blush*front));
    const cavity=clamp((1-(x/mouthW)**4-(dz/localH)**4)*6,0,1)*front**8;
    color=mix(color,imp?[20,12,8]:[43,22,19],cavity);
    const nostril=gauss(ax-.4,.14)*gauss(z-4.13,.12)*front**8;color=mix(color,imp?[28,19,12]:[56,33,26],nostril*.9);
    const lip=gauss(x,mouthW)*Math.max(gauss(dz-localH,.13),gauss(dz+localH,.16))*front**8;
    color=mix(color,imp?[76,36,24]:[115,61,52],lip*.72);
    if(!imp){
      const socket=gauss(ax-1.24,.84)*gauss(z-5.95,.66)*front**5;color=mix(color,[86,77,65],socket*.53);
      const hollow=gauss(ax-2.10,.56)*gauss(z-3.8,.73)*front**4;color=mix(color,[103,100,80],hollow*.29);
      const stubble=gauss(z-2.4,1.2)*front*(.35+.65*gauss(ax-1.5,1.6));color=mix(color,[87,95,78],stubble*(guard?.19:.16));
      const gash=gauss(x-(guard?-2.55:2.55),.30)*gauss(z-4.65,.88)*front;
      color=mix(color,[88,32,25],gash*(.65+.35*mottled));
      const blood=gauss(x-(guard?-.68:.75)-.16*Math.sin(z*3),.28)*gauss(z-2.37,.95)*front**8;
      color=mix(color,[87,31,22],blood*.68);
      if(dead)color=mix(color,[97,48,36],gauss(x-.5,1)*gauss(z-3.6,1.3)*front*.6);
    }else{
      const orbit=gauss(ax-1.40,.92)*gauss(z-6.62,.73)*front**5;
      color=mix(color,[48,32,21],orbit*.43);
      const muzzle=gauss(x,1.95)*gauss(z-3.53,1.63)*front**7;
      color=mix(color,[80,47,27],muzzle*.24);
    }
    return color;
  };
  // Spend the existing angular samples on the face, where a nose, orbit and
  // lip need them. The back of the cranium stays smooth with fewer samples.
  const faceAngle=a=>a+(d===2?.32:0)*Math.cos(a);
  b.add(revolution((a,t)=>point(faceAngle(a),t),(p,a,t)=>colours(p,faceAngle(a),t),[imp?8:10,22,66][d],[imp?10:12,24,64][d],'continuous-sculpted-head',{kind:'skin',roughness:imp?.86:.79}));
  if(!imp)for(const side of[-1,1])b.add(ear(side,d,skin));
  for(const side of[-1,1]){
    const x=side*(imp?1.40:1.24),z=imp?6.62:5.96;b.add(eyeMesh(x,z,faceAt,skin,d,imp));
    if(d&&!imp){
      const brow=new MeshBuilder(),colour=imp?[76,46,27]:guard?[75,57,42]:[56,66,35];
      const points=Array.from({length:d===2?9:4},(_,i)=>{const u=i/(d===2?8:3),xx=side*(.52+1.73*u),zz=6.31+.39*u-.055*Math.sin(u*Math.PI);return[xx,faceAt(xx,zz)+.018,zz];});
      brow.add(anatomicalSweep(points,points.map((_,i)=>.025+.073*Math.sin(Math.PI*(i+.7)/(points.length+.5))),{detail:d,color:colour,material:'cloth',rows:d===2?16:5,columns:5}));b.add(brow.finish('brows'));
    }
  }
  const count=d===0?4:d===1?6:10;
  for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*(imp?3.1:1.78)/count,curve=mouthCurve(x),y=faceAt(x,mouthZ+mouthH+curve)-(imp?.48:.14);
    if(imp){
      const arc=Math.sqrt(1-.55*(x/mouthW)**2),top=[x,y,mouthZ+mouthH*.83*arc+curve],bottom=[x,y-.10,mouthZ-mouthH*.82*arc+curve];
      const length=(i===1||i===count-2)?.83:.47+.12*Math.sin(i*2.9);
      b.cone(top,[x*.97,y+.08,top[2]-length],.19,[173-i%3*7,154-i%2*9,112],{segments:[4,6,10][d],material:'bone'});
      b.cone(bottom,[x*.97,y+.05,bottom[2]+length*.76],.16,[153,132-i%3*5,93],{segments:[4,6,10][d],material:'bone'});
    }else{
      const width=1.78/count*.86,height=(dead?.26:.23)*(i%4===1?.72:1);
      if(d)b.roundedBox([x,y-.05,mouthZ+mouthH*.52+curve],[width,.17,height],.029,[155-i%3*9,143-i%2*8,112],{material:'bone',rotation:[.03*Math.sin(i*2),0,-x*.12]});
      else b.box([x,y-.05,mouthZ+mouthH*.42+curve],[width,.15,height],[177,166,143],{material:'bone'});
      if(d===2&&dead)b.roundedBox([x,y-.13,mouthZ-mouthH*.70+curve],[width*.93,.15,.12],.026,[158,141,119],{material:'bone'});
    }
  }
  if(!guard&&!imp){
    const hairline=a=>7.74-1.35*(1-Math.max(0,Math.sin(a)))+.11*Math.sin(a*7)+.05*Math.sin(a*17);
    const hairPoint=(a,t)=>{const z=hairline(a)+(9.94-hairline(a))*t,p=point(a,clamp((z-z0)/zHeight,0,1)),grain=d===2?.012*Math.sin(a*51+t*27):0,root=1.004+.012*Math.min(1,t*7);return[p[0]*(root+grain*.10),p[1]*(root+grain*.10),p[2]+.035+grain];};
    b.add(revolution(hairPoint,(p,a,t)=>mix(tone([39,49,27],.76+.24*Math.sin(a*79+t*17)**2),tone(skin,.64),(1-Math.min(1,t*18))*.38),[3,7,16][d],[12,24,64][d],'cropped-hair',{kind:'cloth',roughness:.99,scale:.14}));
    if(d===2)for(let i=0;i<96;i++){
      const a=i*2.399,t=.02+.96*((i*.6180339)%1),p=hairPoint(a,t),q=hairPoint(a+.015,.025+t*.975);
      q[0]*=1.009;q[1]*=1.009;q[2]+=.035;
      b.cylinder(p,q,.012,[45+i%5*4,55+i%7*3,28+i%4*3],{segments:3,topRadius:.002,material:{kind:'cloth',roughness:.99,scale:.14}});
    }
  }
  return b.finish(imp?'sculpted-demon-head':'sculpted-human-head');
}
