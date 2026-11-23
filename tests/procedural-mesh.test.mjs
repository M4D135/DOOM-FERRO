import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuilder,MESH_VERTEX_STRIDE,MATERIALS,rotateEuler} from '../src/procedural-mesh.js';

const STRIDE=MESH_VERTEX_STRIDE;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const sub=(a,b)=>a.map((value,i)=>value-b[i]);
const color=[114,147,183];
const pointKey=p=>p.map(value=>Math.round(value*1e5)).join(',');

/** Check topology as well as normals: every welded edge belongs to exactly two
 * oppositely directed triangles. This catches cracks hidden by flat colors. */
function inspect(mesh,{closed=true}={}){
  assert.equal(mesh.stride,17);assert.equal(mesh.vertices.length,mesh.triangles*STRIDE*3);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],edges=new Map();
  let volume=0;
  for(let at=0;at<mesh.vertices.length;at+=STRIDE*3){
    const vertices=[0,1,2].map(index=>Array.from(mesh.vertices.slice(at+index*STRIDE,at+(index+1)*STRIDE)));
    const positions=vertices.map(v=>v.slice(0,3));
    const face=cross(sub(positions[1],positions[0]),sub(positions[2],positions[0]));
    assert.ok(Math.hypot(...face)>1e-8,mesh.key+' nondegenerate triangle');
    volume+=dot(positions[0],cross(positions[1],positions[2]))/6;
    for(const vertex of vertices){
      assert.ok(vertex.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...vertex.slice(3,6))-1)<1e-5,mesh.key+' unit normal');
      assert.ok(dot(face,vertex.slice(3,6))>0,mesh.key+' winding agrees with normals');
      assert.ok(vertex.slice(6,12).every(v=>v>=0&&v<=1));
      assert.ok(Number.isInteger(vertex[12])&&vertex[12]>=0&&vertex[12]<=10);
      assert.ok(vertex[13]>0);
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],vertex[k]);max[k]=Math.max(max[k],vertex[k]);}
    }
    for(let i=0;i<3;i++){
      const a=pointKey(positions[i]),b=pointKey(positions[(i+1)%3]),key=[a,b].sort().join('|');
      const edge=edges.get(key)||{count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);
    }
  }
  assert.deepEqual(mesh.bounds,{min,max});
  if(closed)for(const [key,edge]of edges){assert.equal(edge.count,2,mesh.key+' welded edge '+key);assert.equal(edge.direction,0,mesh.key+' consistent edge '+key);}
  return {volume,edges};
}

test('closed primitives retain outward topology and physical bounds with the expanded material format',()=>{
  const samples=[
    new MeshBuilder().box([0,0,0],[8,6,4],color,{material:'metal'}).finish('box'),
    new MeshBuilder().ellipsoid([0,0,0],[2,3,4],color,{segments:16,rings:8,material:'skin'}).finish('ellipsoid'),
    new MeshBuilder().cylinder([1,2,3],[5,-4,8],2,color,{segments:16,topRadius:.7,material:'bone'}).finish('frustum'),
    new MeshBuilder().cone([0,0,0],[0,0,5],2,color,{segments:16}).finish('cone'),
    new MeshBuilder().torus([0,0,0],4,.6,color,{segments:24,sections:16,material:'metal'}).finish('torus')
  ];
  for(const mesh of samples)assert.ok(inspect(mesh).volume>0,mesh.key);
  assert.equal(inspect(samples[0]).volume,192);
  assert.ok(Math.abs(inspect(samples[4]).volume-2*Math.PI*Math.PI*4*.6*.6)<2,'torus approximates analytic volume');
});

test('rounded boxes join faces, bevels and corner patches without hidden overlaps or cracks',()=>{
  for(const bevelSegments of[1,2,4]){
    const mesh=new MeshBuilder().roundedBox([0,0,0],[8,6,4],.5,color,{bevelSegments,material:'paint'}).finish('rounded-'+bevelSegments);
    const {volume}=inspect(mesh);
    assert.deepEqual(mesh.bounds,{min:[-4,-3,-2],max:[4,3,2]});
    assert.ok(volume>178&&volume<192);
    assert.equal(mesh.triangles,12+24*bevelSegments+8*(2*bevelSegments*bevelSegments-bevelSegments));
    // A rounded solid has no original box corner at (+/-4,+/-3,+/-2).
    for(let i=0;i<mesh.vertices.length;i+=STRIDE)assert.ok(Math.abs(mesh.vertices[i])<4||Math.abs(mesh.vertices[i+1])<3||Math.abs(mesh.vertices[i+2])<2);
  }
  const sphere=new MeshBuilder().roundedBox([0,0,0],[4,4,4],2,color,{bevelSegments:4}).finish('max-bevel');
  const {volume}=inspect(sphere);assert.ok(volume>28&&volume<34);
  const plain=new MeshBuilder().roundedBox([0,0,0],[8,6,4],0,color).finish('zero-bevel');
  assert.equal(plain.triangles,12);assert.equal(inspect(plain).volume,192);
});

test('elliptical tubes follow a measured profile and remain closed along an oblique axis',()=>{
  const profile=[[0,1.4,2],[.15,2.2,2.8],[.5,3,2.4],[.8,1.8,1.6],[1,.8,.9]];
  for(const smoothProfile of[true,false]){
    const mesh=new MeshBuilder().tube([2,-3,1],[7,4,19],profile,color,{segments:16,smoothProfile,material:'cloth'}).finish('tube-'+smoothProfile);
    assert.ok(inspect(mesh).volume>150);
  }
  const closed=new MeshBuilder().tube([0,0,0],[0,0,10],profile,color,{segments:16}).finish('closed');
  const open=new MeshBuilder().tube([0,0,0],[0,0,10],profile,color,{segments:16,cap:false}).finish('open');
  assert.equal(closed.triangles-open.triangles,32);
  const {edges}=inspect(open,{closed:false});assert.equal([...edges.values()].filter(edge=>edge.count===1).length,32);
  const tip=new MeshBuilder().tube([0,0,0],[0,0,10],[[0,0,0],[.5,3,2],[1,0,0]],color).finish('closed-tips');
  assert.ok(inspect(tip).volume>40);
});

test('lathed metal profiles preserve flat flanges and can be rotated onto a barrel axis',()=>{
  const profile=[[-3,2],[-2,2],[-2,3],[-1.5,3],[-1.5,2],[2,2],[2.5,1.6],[3,1.6]];
  const mesh=new MeshBuilder().lathe([0,0,0],profile,color,{segments:16,material:'metal'}).finish('flanged');
  const original=inspect(mesh);assert.ok(original.volume>70);
  const rotated=new MeshBuilder().lathe([5,7,11],profile,color,{segments:16,rotation:[Math.PI/2,0,0],material:'metal'}).finish('flanged-rotated');
  assert.ok(Math.abs(inspect(rotated).volume-original.volume)<1e-4);
  assert.deepEqual(rotated.bounds,{min:[2,4,8],max:[8,10,14]});
});

test('material coordinates stay attached through nonuniform scaling, reflection and articulation',()=>{
  const source=new MeshBuilder().roundedBox([0,0,0],[4,6,8],.4,color,{material:{kind:'wood',roughness:.37,metalness:.2,scale:2.5},emissive:.3}).finish('material');
  const transformed=new MeshBuilder().add(source,{translation:[7,-4,3],rotation:[.3,.5,-.8],scale:[-2,.5,3]}).finish('articulated');
  const before=inspect(source).volume,after=inspect(transformed).volume;
  assert.ok(Math.abs(after-before*3)<1e-3);
  for(let triangle=0;triangle<source.triangles;triangle++)for(let vertex=0;vertex<3;vertex++){
    const original=(triangle*3+[0,2,1][vertex])*STRIDE,current=(triangle*3+vertex)*STRIDE;
    assert.deepEqual(Array.from(transformed.vertices.slice(current+6,current+17)),Array.from(source.vertices.slice(original+6,original+17)));
  }
  assert.equal(source.vertices[12],MATERIALS.wood.kind);assert.equal(source.vertices[13],2.5);
  assert.ok(Object.isFrozen(MATERIALS)&&Object.isFrozen(MATERIALS.skin));
});

test('public triangles carry authored smooth normals and local surface coordinates through rotation',()=>{
  const normals=[[0,0,1],[0,.1,1],[.1,0,1]],coords=[[4,5,6],[7,8,9],[10,11,12]],rotation=[.6,.2,0];
  const mesh=new MeshBuilder().triangle([0,0,0],[3,0,0],[0,4,0],color,{normals,surfaceCoords:coords,rotation,material:'skin'}).finish('custom-surface');
  inspect(mesh,{closed:false});
  for(let i=0;i<3;i++){
    assert.deepEqual(Array.from(mesh.vertices.slice(i*STRIDE+14,i*STRIDE+17)),coords[i]);
    const expected=rotateEuler(normals[i],rotation),length=Math.hypot(...expected);
    for(let k=0;k<3;k++)assert.ok(Math.abs(mesh.vertices[i*STRIDE+3+k]-expected[k]/length)<1e-6);
  }
});

test('legacy meshes convert without changing color and all procedural outputs are deterministic',()=>{
  const source=new MeshBuilder().box([0,0,0],[2,4,6],color).finish('original');
  const old=new Float32Array(source.triangles*30);
  for(let i=0;i<source.vertices.length/STRIDE;i++)old.set(source.vertices.slice(i*STRIDE,i*STRIDE+10),i*10);
  const converted=new MeshBuilder().add({stride:10,vertices:old}).finish('converted');
  assert.equal(inspect(converted).volume,48);
  assert.deepEqual(converted.bounds,source.bounds);
  for(let i=0;i<converted.vertices.length;i+=STRIDE)assert.deepEqual(Array.from(converted.vertices.slice(i,i+10)),Array.from(source.vertices.slice(i,i+10)));
  const create=()=>new MeshBuilder().torus([1,2,3],3,.4,color,{segments:13,sections:5,material:'leather',rotation:[.2,.4,.7]}).finish('repeat');
  assert.deepEqual(create(),create());
  assert.throws(()=>new MeshBuilder().box([0,0,0],[1,1,1],color,{material:'unknown'}),/material/);
  assert.throws(()=>new MeshBuilder().tube([0,0,0],[0,0,1],[[0,1,1],[.8,1,1],[.4,1,1]],color),/profile/);
  assert.throws(()=>new MeshBuilder().add(source,{scale:[1,0,1]}),/scale/);
});
