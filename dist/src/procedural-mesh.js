/** Procedural triangle primitives. Local axes: X right, Y forward, Z up.
 * Surface coordinates remain in the primitive's own frame through composition,
 * so procedural grain follows the material when a limb or weapon is animated. */
export const MESH_VERTEX_STRIDE = 17;
export const MATERIALS = Object.freeze(Object.fromEntries([
  ['plain',0,.82,0],['skin',1,.64,0],['cloth',2,.94,0],['leather',3,.65,0],
  ['metal',4,.31,.88],['paint',5,.55,.12],['bone',6,.69,0],['glass',7,.13,.12],
  ['wood',8,.73,0],['blood',9,.25,0],['glow',10,.45,0]
].map(([name,kind,roughness,metalness])=>[name,Object.freeze({kind,roughness,metalness,scale:1})])));

const EPS=1e-10, TAU=Math.PI*2, STRIDE=MESH_VERTEX_STRIDE;
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);return length>EPS?a.map(v=>v/length):[0,0,1];};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const steps=(value,fallback,maximum=96)=>clamp(Math.round(value??fallback),3,maximum);

function vector(value,label){
  if(!value||value.length<3||![value[0],value[1],value[2]].every(Number.isFinite))throw new Error(`MeshBuilder: invalid ${label}`);
  return [value[0],value[1],value[2]];
}
function attributes(options){
  let given=options.material??'plain';
  if(typeof given==='string'){
    if(!MATERIALS[given])throw new Error('MeshBuilder: unknown material '+given);
    given=MATERIALS[given];
  }
  if(!given||typeof given!=='object')throw new Error('MeshBuilder: invalid material');
  const kind=typeof given.kind==='string'?MATERIALS[given.kind]?.kind:given.kind??0;
  const base=Object.values(MATERIALS).find(value=>value.kind===kind);
  if(!base)throw new Error('MeshBuilder: invalid surface kind');
  const values=[given.roughness??base.roughness,given.metalness??base.metalness,kind,given.scale??1];
  if(!values.every(Number.isFinite)||values[3]<=0)throw new Error('MeshBuilder: invalid surface parameters');
  values[0]=clamp(values[0],0,1);values[1]=clamp(values[1],0,1);
  return values;
}

/** Euler radians, applied X then Y then Z, about the local origin. */
export function rotateEuler(point,rotation=[0,0,0]){
  const [rx,ry,rz]=rotation;let [x,y,z]=point;
  if(rx){const c=Math.cos(rx),s=Math.sin(rx);[y,z]=[y*c-z*s,y*s+z*c];}
  if(ry){const c=Math.cos(ry),s=Math.sin(ry);[x,z]=[x*c+z*s,-x*s+z*c];}
  if(rz){const c=Math.cos(rz),s=Math.sin(rz);[x,y]=[x*c-y*s,x*s+y*c];}
  return [x,y,z];
}

export class MeshBuilder {
  constructor(){this.data=[];}

  _triangle(a,b,c,color,emissive=0,normals=null,material=null,coords=null){
    const face=cross(sub(b,a),sub(c,a));if(Math.hypot(...face)<=EPS)return this;
    const normal=unit(face),points=[a,b,c],surface=material||attributes({});
    for(let i=0;i<3;i++){
      let n=normals?unit(normals[i]):normal;
      // Sharp profile tangents must not fold across an adjacent face.
      if(dot(face,n)<=EPS)n=normal;
      this.data.push(...points[i],...n,...color,clamp(emissive,0,1),...surface,...(coords?coords[i]:points[i]));
    }
    return this;
  }

  _oriented(a,b,c,color,options,material){
    const face=cross(sub(b.p,a.p),sub(c.p,a.p));
    if(dot(face,plus(plus(a.n,b.n),c.n))<0)[b,c]=[c,b];
    return this._triangle(a.p,b.p,c.p,color,options.emissive||0,[a.n,b.n,c.n],material,[a.s,b.s,c.s]);
  }

  triangle(a,b,c,color,options={}){
    const original=[a,b,c].map(p=>vector(p,'triangle point')),rotation=vector(options.rotation||[0,0,0],'rotation');
    const points=original.map(p=>rotateEuler(p,rotation));
    const normals=options.normals?.map(n=>rotateEuler(vector(n,'triangle normal'),rotation));
    const coords=options.surfaceCoords?.map(p=>vector(p,'surface coordinate'))||original;
    if(normals&&normals.length!==3||coords.length!==3)throw new Error('MeshBuilder: triangle needs three attributes');
    return this._triangle(...points,vector(color,'color'),options.emissive||0,normals,attributes(options),coords);
  }

  box(center,size,color,options={}){
    center=vector(center,'box center');size=vector(size,'box size');color=vector(color,'color');
    if(size.some(v=>v<=0))throw new Error('MeshBuilder: box dimensions must be positive');
    const rotation=vector(options.rotation||[0,0,0],'rotation'),material=attributes(options);
    const signs=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const local=signs.map(sign=>sign.map((v,i)=>v*size[i]/2)),corners=local.map(p=>plus(center,rotateEuler(p,rotation)));
    for(const [a,b,c,d]of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]]){
      this._triangle(corners[a],corners[b],corners[c],color,options.emissive||0,null,material,[local[a],local[b],local[c]]);
      this._triangle(corners[a],corners[c],corners[d],color,options.emissive||0,null,material,[local[a],local[c],local[d]]);
    }
    return this;
  }

  /** Joined flat faces, quarter-cylinder edges and spherical corners. */
  roundedBox(center,size,bevel,color,options={}){
    center=vector(center,'rounded box center');size=vector(size,'rounded box size');color=vector(color,'color');
    if(size.some(v=>v<=0)||!Number.isFinite(bevel)||bevel<0)throw new Error('MeshBuilder: invalid rounded box dimensions');
    if(bevel===0)return this.box(center,size,color,options);
    const half=size.map(v=>v/2),radius=Math.min(bevel,...half),inner=half.map(v=>v-radius);
    const subdivisions=clamp(Math.round(options.bevelSegments??1),1,8),rotation=vector(options.rotation||[0,0,0],'rotation'),material=attributes(options);
    const sample=(p,n)=>({p:plus(center,rotateEuler(p,rotation)),n:rotateEuler(n,rotation),s:p});
    const triangle=(a,b,c)=>this._oriented(a,b,c,color,options,material);
    const quad=(a,b,c,d)=>{triangle(a,b,c);triangle(a,c,d);};
    for(let axis=0;axis<3;axis++)for(const sign of[-1,1]){
      const other=[0,1,2].filter(k=>k!==axis),normal=[0,0,0];normal[axis]=sign;
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(s=>{
        const p=[0,0,0];p[axis]=sign*half[axis];p[other[0]]=s[0]*inner[other[0]];p[other[1]]=s[1]*inner[other[1]];return sample(p,normal);
      });quad(...points);
    }
    for(let axis=0;axis<3;axis++){
      const [j,k]=[0,1,2].filter(index=>index!==axis);
      for(const sj of[-1,1])for(const sk of[-1,1])for(let step=0;step<subdivisions;step++){
        const edge=(theta,end)=>{
          const n=[0,0,0];n[j]=sj*Math.cos(theta);n[k]=sk*Math.sin(theta);
          const p=n.map(v=>v*radius);p[j]+=sj*inner[j];p[k]+=sk*inner[k];p[axis]=end*inner[axis];return sample(p,n);
        };
        const a=step*Math.PI/2/subdivisions,b=(step+1)*Math.PI/2/subdivisions;
        quad(edge(a,-1),edge(b,-1),edge(b,1),edge(a,1));
      }
    }
    for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){
      const corner=(row,column)=>{
        const phi=row*Math.PI/2/subdivisions,theta=column*Math.PI/2/subdivisions;
        const n=[sx*Math.sin(phi)*Math.cos(theta),sy*Math.sin(phi)*Math.sin(theta),sz*Math.cos(phi)];
        return sample(n.map((v,i)=>[sx,sy,sz][i]*inner[i]+radius*v),n);
      };
      for(let row=0;row<subdivisions;row++)for(let col=0;col<subdivisions;col++)quad(corner(row,col),corner(row+1,col),corner(row+1,col+1),corner(row,col+1));
    }
    return this;
  }

  ellipsoid(center,radii,color,options={}){
    center=vector(center,'ellipsoid center');radii=vector(radii,'ellipsoid radii');color=vector(color,'color');
    if(radii.some(v=>v<=0))throw new Error('MeshBuilder: ellipsoid radii must be positive');
    const segments=steps(options.segments,10),rings=clamp(Math.round(options.rings??6),2,64),rotation=vector(options.rotation||[0,0,0],'rotation'),material=attributes(options),rows=[];
    for(let row=0;row<=rings;row++){
      const phi=Math.PI*row/rings,points=[];
      for(let col=0;col<=segments;col++){
        const theta=TAU*(col%segments)/segments,direction=[Math.sin(phi)*Math.cos(theta),Math.sin(phi)*Math.sin(theta),Math.cos(phi)],local=direction.map((v,i)=>v*radii[i]);
        points.push({p:plus(center,rotateEuler(local,rotation)),n:unit(rotateEuler(direction.map((v,i)=>v/radii[i]),rotation)),s:local});
      }rows.push(points);
    }
    for(let row=0;row<rings;row++)for(let col=0;col<segments;col++){
      const a=rows[row][col],b=rows[row][col+1],c=rows[row+1][col+1],d=rows[row+1][col];
      this._oriented(a,d,c,color,options,material);this._oriented(a,c,b,color,options,material);
    }return this;
  }

  /** Elliptical sections along from→to; profile entries are [t,rx,ry]. */
  tube(from,to,profile,color,options={}){
    from=vector(from,'tube start');to=vector(to,'tube end');color=vector(color,'color');
    const length=Math.hypot(...sub(to,from));if(length<=EPS)return this;
    const axis=unit(sub(to,from)),reference=Math.abs(axis[2])<.9?[0,0,1]:[0,1,0],u=unit(cross(reference,axis)),v=cross(axis,u);
    return this._profile(profile,color,options,p=>plus(from,plus(plus(u.map(x=>x*p[0]),v.map(x=>x*p[1])),axis.map(x=>x*p[2]*length))),
      n=>plus(plus(u.map(x=>x*n[0]),v.map(x=>x*n[1])),axis.map(x=>x*n[2])),length);
  }

  /** Radial sections [z,r] around local Z, then rotated about center. */
  lathe(center,profile,color,options={}){
    center=vector(center,'lathe center');color=vector(color,'color');
    if(!Array.isArray(profile)||profile.length<2)throw new Error('MeshBuilder: lathe profile needs two sections');
    const rotation=vector(options.rotation||[0,0,0],'rotation');
    return this._profile(profile.map(row=>[row[0],row[1],row[1]]),color,{smoothProfile:false,...options},
      p=>plus(center,rotateEuler(p,rotation)),n=>rotateEuler(n,rotation),1,false);
  }

  _profile(input,color,options,position,normal,length,normalized=true){
    if(!Array.isArray(input)||input.length<2)throw new Error('MeshBuilder: profile needs two sections');
    const profile=input.map(row=>vector(row,'profile section'));
    for(let i=0;i<profile.length;i++){
      const [t,rx,ry]=profile[i];
      if(rx<0||ry<0||normalized&&(t<0||t>1)||i&&t<profile[i-1][0])throw new Error('MeshBuilder: invalid or unordered profile');
    }
    const segments=steps(options.segments,12),material=attributes(options),smooth=options.smoothProfile!==false;
    const sample=(row,col,strip)=>{
      const [t,rx,ry]=profile[row],theta=TAU*(col%segments)/segments,cos=Math.cos(theta),sin=Math.sin(theta);
      const before=profile[smooth?Math.max(0,row-1):strip],after=profile[smooth?Math.min(profile.length-1,row+1):strip+1];
      const derivative=[(after[1]-before[1])*cos,(after[2]-before[2])*sin,(after[0]-before[0])*length];
      const ex=rx||Math.max(before[1],after[1],EPS),ey=ry||Math.max(before[2],after[2],EPS);
      const n=unit(cross([-ex*sin,ey*cos,0],derivative));
      return {p:position([rx*cos,ry*sin,t]),n:normal(n),s:[rx*cos,ry*sin,t*length]};
    };
    for(let row=0;row<profile.length-1;row++)for(let col=0;col<segments;col++){
      const a=sample(row,col,row),b=sample(row,col+1,row),c=sample(row+1,col+1,row),d=sample(row+1,col,row);
      this._oriented(a,b,c,color,options,material);this._oriented(a,c,d,color,options,material);
    }
    if(options.cap!==false)for(const row of[0,profile.length-1]){
      const sign=row===0?-1:1,n=normal([0,0,sign]),t=profile[row][0],origin={p:position([0,0,t]),n,s:[0,0,t*length]};
      for(let col=0;col<segments;col++){
        const a=sample(row,col,Math.min(row,profile.length-2)),b=sample(row,col+1,Math.min(row,profile.length-2));a.n=b.n=n;
        this._oriented(origin,a,b,color,options,material);
      }
    }return this;
  }

  cylinder(from,to,radius,color,options={}){
    const top=options.topRadius??radius;
    if(!Number.isFinite(radius)||radius<0||!Number.isFinite(top)||top<0)throw new Error('MeshBuilder: cylinder radii must be nonnegative');
    return this.tube(from,to,[[0,radius,radius],[1,top,top]],color,options);
  }
  cone(from,to,radius,color,options={}){return this.cylinder(from,to,radius,color,{...options,topRadius:0});}

  /** Ring in XY, normal Z; rotation orients the whole ring around its center. */
  torus(center,major,minor,color,options={}){
    center=vector(center,'torus center');color=vector(color,'color');
    if(!Number.isFinite(major)||!Number.isFinite(minor)||minor<=0||major<=minor)throw new Error('MeshBuilder: torus requires major > minor > 0');
    const segments=steps(options.segments,16),sections=steps(options.sections,6,32),rotation=vector(options.rotation||[0,0,0],'rotation'),material=attributes(options);
    const sample=(i,j)=>{
      const a=TAU*(i%segments)/segments,b=TAU*(j%sections)/sections,n=[Math.cos(a)*Math.cos(b),Math.sin(a)*Math.cos(b),Math.sin(b)];
      const local=[(major+minor*Math.cos(b))*Math.cos(a),(major+minor*Math.cos(b))*Math.sin(a),minor*Math.sin(b)];
      return {p:plus(center,rotateEuler(local,rotation)),n:rotateEuler(n,rotation),s:local};
    };
    for(let i=0;i<segments;i++)for(let j=0;j<sections;j++){
      const a=sample(i,j),b=sample(i+1,j),c=sample(i+1,j+1),d=sample(i,j+1);
      this._oriented(a,b,c,color,options,material);this._oriented(a,c,d,color,options,material);
    }return this;
  }

  add(mesh,{translation=[0,0,0],rotation=[0,0,0],scale=1}={}){
    if(!mesh||![10,STRIDE].includes(mesh.stride)||!mesh.vertices||mesh.vertices.length%(mesh.stride*3))throw new Error('MeshBuilder: incompatible mesh');
    translation=vector(translation,'translation');rotation=vector(rotation,'rotation');
    scale=typeof scale==='number'?[scale,scale,scale]:vector(scale,'scale');
    if(!scale.every(Number.isFinite)||scale.some(value=>Math.abs(value)<=EPS))throw new Error('MeshBuilder: scale must be finite and nonzero');
    const [sx,sy,sz]=scale,[rx,ry,rz]=rotation,[tx,ty,tz]=translation;
    const reflected=sx*sy*sz<0,stride=mesh.stride,source=mesh.vertices,plain=attributes({});
    const order=reflected?[0,2,1]:[0,1,2],uniform=sx===sy&&sy===sz,identity=rx===0&&ry===0&&rz===0;
    // One matrix per part, not vector arrays and trigonometry per vertex.
    const cx=Math.cos(rx),cy=Math.cos(ry),cz=Math.cos(rz),ax=Math.sin(rx),ay=Math.sin(ry),az=Math.sin(rz);
    const r00=cz*cy,r01=cz*ay*ax-az*cx,r02=cz*ay*cx+az*ax;
    const r10=az*cy,r11=az*ay*ax+cz*cx,r12=az*ay*cx-cz*ax;
    const r20=-ay,r21=cy*ax,r22=cy*cx;
    const m00=r00*sx,m01=r01*sy,m02=r02*sz,m10=r10*sx,m11=r11*sy,m12=r12*sz,m20=r20*sx,m21=r21*sy,m22=r22*sz;
    const normalScale=uniform?Math.sign(sx):1;
    const n00=uniform?r00*normalScale:r00/sx,n01=uniform?r01*normalScale:r01/sy,n02=uniform?r02*normalScale:r02/sz;
    const n10=uniform?r10*normalScale:r10/sx,n11=uniform?r11*normalScale:r11/sy,n12=uniform?r12*normalScale:r12/sz;
    const n20=uniform?r20*normalScale:r20/sx,n21=uniform?r21*normalScale:r21/sy,n22=uniform?r22*normalScale:r22/sz;
    for(let at=0;at<source.length;at+=stride*3)for(let vertex=0;vertex<3;vertex++){
      const i=at+order[vertex]*stride,x=source[i],y=source[i+1],z=source[i+2];
      const px=identity?x*sx+tx:m00*x+m01*y+m02*z+tx;
      const py=identity?y*sy+ty:m10*x+m11*y+m12*z+ty;
      const pz=identity?z*sz+tz:m20*x+m21*y+m22*z+tz;
      const a=source[i+3],b=source[i+4],c=source[i+5];
      let nx=n00*a+n01*b+n02*c,ny=n10*a+n11*b+n12*c,nz=n20*a+n21*b+n22*c;
      if(!uniform){const inverse=1/Math.hypot(nx,ny,nz);nx*=inverse;ny*=inverse;nz*=inverse;}
      this.data.push(px,py,pz,nx,ny,nz,source[i+6]*255,source[i+7]*255,source[i+8]*255,source[i+9]);
      if(stride===STRIDE)this.data.push(source[i+10],source[i+11],source[i+12],source[i+13],source[i+14],source[i+15],source[i+16]);
      else this.data.push(...plain,x,y,z);
    }return this;
  }

  finish(key='procedural-mesh'){
    const vertices=new Float32Array(this.data.length),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<this.data.length;i+=STRIDE){
      for(let k=0;k<STRIDE;k++){
        const value=this.data[i+k];if(!Number.isFinite(value))throw new Error('MeshBuilder: nonfinite vertex');
        vertices[i+k]=k>=6&&k<=8?clamp(value/255,0,1):value;
      }
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertices[i+k]);max[k]=Math.max(max[k],vertices[i+k]);}
    }
    if(!vertices.length){min.fill(0);max.fill(0);}
    return {key:String(key),vertices,stride:STRIDE,triangles:vertices.length/(STRIDE*3),bounds:{min,max}};
  }
}

export default MeshBuilder;
