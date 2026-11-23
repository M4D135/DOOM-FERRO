import test from 'node:test';
import assert from 'node:assert/strict';
import {modelVisibility,collectModelBatches,modelForEntity,MODEL_VERTEX_STRIDE} from '../src/procedural-models.js';
import {FerroDoomRenderer} from '../src/ferro-doom-renderer.js';

const view=(extra={})=>({oeil:[0,30/32,0],avant:[0,0,-1],droite:[1,0,0],haut:[0,1,0],tangente:1,largeur:640,hauteur:640,...extra});
const sector={floor:0,light:192,special:0};
const map={sectorAt:()=>sector};

test('frustum retains intersecting bounds and rejects distant geometry before model generation',()=>{
  const entity={type:2035,sprite:'BAR1A0',x:0,y:96,z:0,scale:1};
  assert.equal(modelVisibility(entity,view()).visible,true);
  assert.equal(modelVisibility({...entity,x:140},view()).visible,true,'origin outside image, bounding sphere still intersects');
  assert.equal(modelVisibility({...entity,x:180},view()).visible,false);
  assert.equal(modelVisibility({...entity,y:-20},view()).visible,true,'near-plane intersections are retained');
  assert.equal(modelVisibility({...entity,y:-80},view()).visible,false);
  const unseen={id:'unseen',type:3004,enemy:true,sprite:'POSSA1',x:0,y:-512,z:0,
    get alive(){throw new Error('A rejected actor must not generate a pose');}};
  const batches=collectModelBatches(map,[unseen],0,view());
  assert.equal(batches.length,0);assert.deepEqual(batches.summary,{total:1,visible:0,culled:1,lods:[0,0,0]});
});

test('distance LOD hysteresis is stable on both boundaries and respects apparent scale',()=>{
  const entity={type:2035,sprite:'BAR1A0',x:0,y:288,z:0,scale:1};
  assert.equal(modelVisibility(entity,view(),2).detail,2);
  assert.equal(modelVisibility(entity,view(),1).detail,1);
  assert.equal(modelVisibility({...entity,y:340},view(),2).detail,1);
  assert.equal(modelVisibility({...entity,y:260},view(),1).detail,2);
  assert.equal(modelVisibility({...entity,y:688},view(),0).detail,0);
  assert.equal(modelVisibility({...entity,y:688},view(),1).detail,1);
  assert.equal(modelVisibility({...entity,y:800},view(),1).detail,0);
  assert.equal(modelVisibility({...entity,y:600},view(),0).detail,1);
  const large={...entity,y:576,scale:2};
  assert.equal(modelVisibility(large,view({oeil:[0,60/32,0]}),2).detail,2,'twice the size at twice the distance uses the same close recipe');
  const lod=new WeakMap(),subject={id:'barrel',...entity};
  collectModelBatches(map,[subject],0,view(),lod);
  assert.equal(lod.get(subject),1);
  subject.y=260;collectModelBatches(map,[subject],0,view(),lod);
  assert.equal(lod.get(subject),2);
  subject.y=288;collectModelBatches(map,[subject],0,view(),lod);
  assert.equal(lod.get(subject),2);
});

test('camera movement does not turn actors or swap their surface geometry',()=>{
  const actor={id:'guard',type:3004,base:'POSS',enemy:true,sprite:'POSSA1',alive:true,state:'idle',x:0,y:160,z:0,angle:1.2};
  const a=collectModelBatches(map,[actor],0,view({oeil:[-.5,30/32,0]}))[0];
  const b=collectModelBatches(map,[actor],0,view({oeil:[.5,30/32,0]}))[0];
  assert.equal(a.mesh,b.mesh);
  assert.ok(Math.abs(a.instances[3]-1.2)<1e-6);assert.equal(a.instances[3],b.instances[3]);
  const turned=collectModelBatches(map,[{...actor,angle:2.4}],0,view())[0];
  assert.equal(turned.mesh,a.mesh);assert.notEqual(turned.instances[3],a.instances[3]);
});

test('authored extreme vertices remain visible at grazing frustum edges',()=>{
  const fixtures=[
    {type:2035,sprite:'BAR1A0'},
    {type:48,sprite:'ELECA0'},
    {type:2001,sprite:'SHOTA0'},
    {sprite:'BAL1E0',projectile:true,scale:2},
    {type:3001,base:'TROO',sprite:'TROOG1',enemy:true,alive:true,state:'attack'}
  ];
  for(const fixture of fixtures){
    const entity={id:fixture.sprite,x:0,y:160,z:0,angle:0,scale:1,...fixture},mesh=modelForEntity(entity,0,2);
    assert.ok(mesh,fixture.sprite);
    const extremes=Array.from({length:6},()=>null);
    for(let i=0;i<mesh.vertices.length;i+=MODEL_VERTEX_STRIDE){
      const local=mesh.vertices.subarray(i,i+3),scale=entity.scale;
      // Angle zero maps actor forward to world X and right to world Z.
      const point=[local[1]*scale/32,local[2]*scale/32,-entity.y/32+local[0]*scale/32];
      for(let axis=0;axis<3;axis++)for(const side of[0,1]){
        const index=axis*2+side,old=extremes[index];
        if(!old||(side===0?point[axis]<old[axis]:point[axis]>old[axis]))extremes[index]=point;
      }
    }
    for(const point of extremes){
      const depth=-point[2];assert.ok(depth>0);
      for(const sign of[-1,1]){
        const horizontal=view({oeil:[point[0]-sign*(depth-.001),point[1],0]});
        const vertical=view({oeil:[point[0],point[1]-sign*(depth-.001),0]});
        assert.equal(modelVisibility(entity,horizontal).visible,true,fixture.sprite+' horizontal edge');
        assert.equal(modelVisibility(entity,vertical).visible,true,fixture.sprite+' vertical edge');
      }
    }
  }
});

function fakeGL(){
  let serial=0,bound=null,vao=null;
  const buffers=new Map(),arrays=new Map(),deletedBuffers=[],deletedArrays=[],writes=[];
  return {ARRAY_BUFFER:1,STATIC_DRAW:2,DYNAMIC_DRAW:3,FLOAT:4,buffers,arrays,deletedBuffers,deletedArrays,writes,
    createBuffer(){const id=++serial;buffers.set(id,0);return id;},
    createVertexArray(){const id=++serial;arrays.set(id,new Map());return id;},
    bindVertexArray(id){vao=id;},bindBuffer(_target,id){assert.ok(buffers.has(id));bound=id;},
    enableVertexAttribArray(){},
    vertexAttribPointer(index,size,type,normalized,stride,offset){arrays.get(vao).set(index,{buffer:bound,size,type,normalized,stride,offset});},
    vertexAttribDivisor(index,divisor){arrays.get(vao).get(index).divisor=divisor;},
    bufferData(_target,data,usage){buffers.set(bound,data.byteLength);writes.push({buffer:bound,usage,bytes:data.byteLength,full:true});},
    bufferSubData(_target,offset,data){assert.ok(buffers.get(bound)>=offset+data.byteLength);writes.push({buffer:bound,bytes:data.byteLength,full:false});},
    deleteBuffer(id){assert.ok(buffers.delete(id));deletedBuffers.push(id);},
    deleteVertexArray(id){assert.ok(arrays.delete(id));deletedArrays.push(id);}
  };
}
function cache(limit=500){
  return Object.assign(Object.create(FerroDoomRenderer.prototype),{gl:fakeGL(),modelMeshes:new Map(),modelBytes:0,modelCacheLimit:limit});
}
const batch=(key,count=1)=>({mesh:{key,vertices:new Float32Array(MODEL_VERTEX_STRIDE*3)},instances:new Float32Array(8*count),count});
const actualBytes=renderer=>[...renderer.gl.buffers.values()].reduce((a,b)=>a+b,0);

test('GPU model cache evicts least-recent poses and frees both buffers plus the VAO',()=>{
  const renderer=cache(),a=renderer._uploadModel(batch('a')),b=renderer._uploadModel(batch('b'));
  assert.equal(renderer.modelBytes,actualBytes(renderer));assert.equal(renderer.modelBytes,472);
  const touched=renderer._uploadModel(batch('a'));assert.equal(touched,a);
  assert.equal(renderer.gl.writes.filter(write=>write.buffer===a.buffer).length,1,'static pose uploads only once');
  renderer._uploadModel(batch('c'));
  assert.deepEqual([...renderer.modelMeshes.keys()],['a','c']);
  assert.deepEqual(renderer.gl.deletedBuffers,[b.buffer,b.instancesBuffer]);assert.deepEqual(renderer.gl.deletedArrays,[b.vao]);
  assert.equal(renderer.modelBytes,actualBytes(renderer));assert.ok(renderer.modelBytes<=renderer.modelCacheLimit);
  const attributes=renderer.gl.arrays.get(a.vao);
  assert.equal(attributes.get(4).stride,MODEL_VERTEX_STRIDE*4);assert.equal(attributes.get(4).offset,40);
  assert.equal(attributes.get(5).offset,56);
  assert.equal(attributes.get(6).divisor,1);assert.equal(attributes.get(7).divisor,1);
});

test('growing an existing instance group respects the GPU allocation limit',()=>{
  const renderer=cache(),a=renderer._uploadModel(batch('a'));renderer._uploadModel(batch('b'));
  const grown=renderer._uploadModel(batch('a',3));
  assert.equal(grown,a,'growing instances does not recreate static geometry');
  assert.ok(renderer.modelBytes<=renderer.modelCacheLimit,'instance-buffer growth must evict old poses before exceeding budget');
  assert.ok(renderer.modelMeshes.has('a'),'the just-used pose must remain valid');
  assert.equal(renderer.modelBytes,actualBytes(renderer));
  renderer._uploadModel(batch('a',1));
  assert.equal(renderer.modelBytes,actualBytes(renderer),'retained capacity remains accounted after group shrinkage');
});
