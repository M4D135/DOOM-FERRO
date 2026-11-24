/** Analytic sculpting for the close props and hands. No sampled or stored model. */
import {MATERIALS,MESH_VERTEX_STRIDE} from './procedural-mesh.js?v=0.5.0-c0b972f9f86b';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
export function smoothUnion(a,b,k=.3){
  const h=Math.max(k-Math.abs(a-b),0)/k;
  return Math.min(a,b)-h*h*k*.25;
}
export function ellipsoidDistance(x,y,z,c,r){
  x-=c[0];y-=c[1];z-=c[2];
  const k0=Math.hypot(x/r[0],y/r[1],z/r[2]);
  if(k0<1e-8)return-Math.min(...r);
  const k1=Math.hypot(x/(r[0]*r[0]),y/(r[1]*r[1]),z/(r[2]*r[2]));
  return k0*(k0-1)/Math.max(k1,1e-8);
}
export function capsuleDistance(x,y,z,a,b,ra,rb=ra){
  const ax=x-a[0],ay=y-a[1],az=z-a[2],bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2];
  const t=clamp((ax*bx+ay*by+az*bz)/(bx*bx+by*by+bz*bz),0,1);
  return Math.hypot(ax-bx*t,ay-by*t,az-bz*t)-mix(ra,rb,t);
}
export function roundedBoxDistance(x,y,z,c,r,bevel=.15){
  const a=Math.abs(x-c[0])-r[0]+bevel,b=Math.abs(y-c[1])-r[1]+bevel,d=Math.abs(z-c[2])-r[2]+bevel;
  return Math.hypot(Math.max(a,0),Math.max(b,0),Math.max(d,0))+Math.min(Math.max(a,b,d),0)-bevel;
}

/** A continuous dual-grid surface of a deterministic analytic scalar field.
 * One averaged surface vertex per active cell makes adjacent cells share their
 * positions and gradient normals without a six-tetrahedra triangle explosion. */
export function implicitMesh(key,{bounds,resolution=[34,46,38],distance,color,material='skin',emissive=0}){
  const [nx,ny,nz]=resolution,[lo,hi]=bounds,dx=(hi[0]-lo[0])/nx,dy=(hi[1]-lo[1])/ny,dz=(hi[2]-lo[2])/nz;
  const sx=nx+1,sy=ny+1,plane=sx*sy,total=plane*(nz+1),field=new Float32Array(total);
  const index=(x,y,z)=>x+sx*y+plane*z;
  for(let z=0;z<=nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    const value=distance(lo[0]+x*dx,lo[1]+y*dy,lo[2]+z*dz);
    if(!Number.isFinite(value))throw Error('Non-finite procedural sculpt field');
    field[index(x,y,z)]=value;
  }
  const mat=typeof material==='string'?MATERIALS[material]:{...MATERIALS[material.kind],...material};
  if(!mat)throw Error('Unknown sculpt material');
  const data=[],epsilon=Math.min(dx,dy,dz)*.16,cells=new Array(nx*ny*nz);
  const cellIndex=(x,y,z)=>x+nx*y+nx*ny*z;
  const gradient=(x,y,z)=>[distance(x+epsilon,y,z)-distance(x-epsilon,y,z),
    distance(x,y+epsilon,z)-distance(x,y-epsilon,z),distance(x,y,z+epsilon)-distance(x,y,z-epsilon)];
  const makeVertex=p=>{
    const [x,y,z]=p,n=gradient(x,y,z),length=Math.hypot(...n)||1;
    for(let k=0;k<3;k++)n[k]/=length;
    const c=typeof color==='function'?color(x,y,z):color;
    return [...p,...n,...c.map(v=>clamp(v/255,0,1)),emissive,
      mat.roughness,mat.metalness,typeof mat.kind==='string'?MATERIALS[mat.kind].kind:mat.kind,mat.scale??1,...p];
  };
  const triangle=(a,b,c)=>{
    if(!a||!b||!c)throw Error('Sculpt surface reaches sampling boundary');
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
    if(Math.hypot(...normal)<1e-9)return;
    if(normal.reduce((s,v,i)=>s+v*(a[3+i]+b[3+i]+c[3+i]),0)<0)[b,c]=[c,b];
    data.push(...a,...b,...c);
  };
  const offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const ids=offsets.map(o=>index(x+o[0],y+o[1],z+o[2])),p=[0,0,0];let count=0;
    for(const [a,b]of edges){
      const va=field[ids[a]],vb=field[ids[b]];if((va<0)===(vb<0))continue;
      const t=va/(va-vb);for(let k=0;k<3;k++)p[k]+=mix(offsets[a][k],offsets[b][k],t);count++;
    }
    if(!count)continue;
    p[0]=lo[0]+(x+p[0]/count)*dx;p[1]=lo[1]+(y+p[1]/count)*dy;p[2]=lo[2]+(z+p[2]/count)*dz;
    const n=gradient(...p),length=Math.hypot(...n)||1,d=distance(...p);
    // A restrained projection preserves rounded fingertips at modest sampling.
    for(let k=0;k<3;k++)p[k]-=n[k]/length*clamp(d,-Math.min(dx,dy,dz)*.2,Math.min(dx,dy,dz)*.2);
    cells[cellIndex(x,y,z)]=makeVertex(p);
  }
  const quad=(positions)=>{const [a,b,c,d]=positions.map(p=>cells[cellIndex(...p)]);triangle(a,b,c);triangle(a,c,d);};
  for(let z=1;z<nz;z++)for(let y=1;y<ny;y++)for(let x=0;x<nx;x++)
    if((field[index(x,y,z)]<0)!==(field[index(x+1,y,z)]<0))quad([[x,y-1,z-1],[x,y,z-1],[x,y,z],[x,y-1,z]]);
  for(let z=1;z<nz;z++)for(let y=0;y<ny;y++)for(let x=1;x<nx;x++)
    if((field[index(x,y,z)]<0)!==(field[index(x,y+1,z)]<0))quad([[x-1,y,z-1],[x-1,y,z],[x,y,z],[x,y,z-1]]);
  for(let z=0;z<nz;z++)for(let y=1;y<ny;y++)for(let x=1;x<nx;x++)
    if((field[index(x,y,z)]<0)!==(field[index(x,y,z+1)]<0))quad([[x-1,y-1,z],[x,y-1,z],[x,y,z],[x-1,y,z]]);
  const vertices=new Float32Array(data),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<vertices.length;i+=MESH_VERTEX_STRIDE)for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[i+k]);max[k]=Math.max(max[k],vertices[i+k]);}
  if(!vertices.length)throw Error('Empty procedural sculpt');
  return{key,vertices,stride:MESH_VERTEX_STRIDE,triangles:vertices.length/(MESH_VERTEX_STRIDE*3),bounds:{min,max}};
}

/** A continuous rounded section swept along a Catmull-Rom centreline.
 * Input rows: [x,y,z,radiusX,radiusZ]. Normals come from the actual displaced
 * surface, keeping skin, wood grooves and seams coherent with the silhouette. */
export function loft(builder,rows,color,{segments=24,steps=32,material='wood',displace=null,closed=true,sectionPower=2}={}){
  const at=(t,k)=>{
    const q=clamp(t,0,1)*(rows.length-1),i=Math.min(rows.length-2,Math.floor(q)),u=q-i;
    const a=rows[Math.max(0,i-1)][k],b=rows[i][k],c=rows[i+1][k],d=rows[Math.min(rows.length-1,i+2)][k];
    return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
  };
  const point=(theta,t)=>{
    const cx=at(t,0),cy=at(t,1),cz=at(t,2),rx=Math.max(.03,at(t,3)),rz=Math.max(.03,at(t,4));
    let radial=displace?1+displace(theta,t):1;
    const cosine=Math.cos(theta),sine=Math.sin(theta),power=2/sectionPower;
    return[cx+Math.sign(cosine)*Math.abs(cosine)**power*rx*radial,cy,cz+Math.sign(sine)*Math.abs(sine)**power*rz*radial];
  };
  const sample=(theta,t)=>{
    const e=.0001,p=point(theta,t),a=point(theta+e,t),b=point(theta-e,t),
      c=point(theta,Math.min(1,t+e)),d=point(theta,Math.max(0,t-e));
    const u=a.map((v,i)=>v-b[i]),v=c.map((q,i)=>q-d[i]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n)||1;n=n.map(x=>x/length);
    if(n[0]*Math.cos(theta)+n[2]*Math.sin(theta)<0)n=n.map(x=>-x);
    return{p,n,s:[p[0]-at(t,0),p[2]-at(t,2),p[1]-rows[0][1]]};
  };
  const grid=[];
  for(let j=0;j<=steps;j++){const row=[];for(let i=0;i<=segments;i++)row.push(sample(i*Math.PI*2/segments,j/steps));grid.push(row);}
  const emit=(a,b,c)=>{
    const ux=b.p[0]-a.p[0],uy=b.p[1]-a.p[1],uz=b.p[2]-a.p[2],vx=c.p[0]-a.p[0],vy=c.p[1]-a.p[1],vz=c.p[2]-a.p[2];
    const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
    if(n.reduce((s,v,i)=>s+v*(a.n[i]+b.n[i]+c.n[i]),0)<0)[b,c]=[c,b];
    builder.triangle(a.p,b.p,c.p,color,{normals:[a.n,b.n,c.n],surfaceCoords:[a.s,b.s,c.s],material});
  };
  for(let j=0;j<steps;j++)for(let i=0;i<segments;i++){
    emit(grid[j][i],grid[j+1][i],grid[j+1][i+1]);emit(grid[j][i],grid[j+1][i+1],grid[j][i+1]);
  }
  if(closed)for(const [j,sign]of [[0,-1],[steps,1]]){
    const t=j/steps,p=[at(t,0),at(t,1),at(t,2)],n=[0,sign*Math.sign(rows.at(-1)[1]-rows[0][1]),0],center={p,n,s:[0,0,p[1]-rows[0][1]]};
    for(let i=0;i<segments;i++)emit(center,{...grid[j][i],n},{...grid[j][i+1],n});
  }
  return builder;
}
