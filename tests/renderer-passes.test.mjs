import test from 'node:test';
import assert from 'node:assert/strict';
import {FerroDoomRenderer,buildSubsectorPolygons} from '../src/ferro-doom-renderer.js';
import {ProceduralResources} from '../src/procedural-resources.js';
import {buildLightingRig} from '../src/procedural-lighting.js';

/** State-level WebGL2 integration probe. It executes the production host pass,
 * but does not rasterize or claim to compile GLSL. Uniforms/samplers and fragment
 * outputs are reflected from the actual shader sources supplied to programme().
 * Every draw checks live resources, framebuffer completeness, vertex bounds and
 * texture feedback, including samplers behind dynamic uniform branches (as in
 * WebGL's conservative draw validation). Pixel/shader correctness is EGL's job. */
function strictGL(){
  const gl={
    FRAMEBUFFER:0x8D40,FRAMEBUFFER_BINDING:0x8CA6,FRAMEBUFFER_COMPLETE:0x8CD5,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT:0x8CD6,FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER:0x8CDB,
    COLOR_ATTACHMENT0:0x8CE0,COLOR_ATTACHMENT1:0x8CE1,DEPTH_ATTACHMENT:0x8D00,NONE:0,
    TEXTURE0:0x84C0,TEXTURE1:0x84C1,TEXTURE2:0x84C2,TEXTURE3:0x84C3,TEXTURE4:0x84C4,
    TEXTURE_2D:0x0DE1,RGBA8:0x8058,RGBA:0x1908,DEPTH_COMPONENT24:0x81A6,DEPTH_COMPONENT:0x1902,
    UNSIGNED_BYTE:0x1401,UNSIGNED_INT:0x1405,FLOAT:0x1406,
    TEXTURE_MIN_FILTER:0x2801,TEXTURE_MAG_FILTER:0x2800,TEXTURE_WRAP_S:0x2802,TEXTURE_WRAP_T:0x2803,
    LINEAR:0x2601,NEAREST:0x2600,LINEAR_MIPMAP_LINEAR:0x2703,REPEAT:0x2901,CLAMP_TO_EDGE:0x812F,
    ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88E4,DYNAMIC_DRAW:0x88E8,VIEWPORT:0x0BA2,
    DEPTH_TEST:0x0B71,CULL_FACE:0x0B44,BLEND:0x0BE2,SCISSOR_TEST:0x0C11,
    LEQUAL:0x0203,BACK:0x0405,TRIANGLES:4,COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x0100,UNPACK_ALIGNMENT:0x0CF5
  };
  const textures=new Map(),framebuffers=new Map(),buffers=new Map(),arrays=new Map(),programs=new Map();
  const bindings=new Map(),draws=[],clears=[],deleted=new Set();
  let next=0,framebuffer=null,vao=null,arrayBuffer=null,program=null,unit=0,viewport=[0,0,1,1],writeDepth=true;
  const enabled=new Set(),handle=kind=>Object.freeze({kind,id:++next});
  const alive=(registry,value,kind)=>{assert(registry.has(value),`${kind} is live`);return registry.get(value);};
  const texture=()=>alive(textures,bindings.get(unit),'bound texture');
  const fb=()=>alive(framebuffers,framebuffer,'bound framebuffer');
  const uniform=(location,values)=>{
    if(location===null)return;
    assert.equal(location.program,program,'uniform belongs to the current program');
    assert(values.every(Number.isFinite),'uniform values must be finite');
    alive(programs,program,'program').values.set(location.name,values.length===1?values[0]:[...values]);
  };
  const remove=(registry,value,kind)=>{
    if(value===null)return;
    assert(registry.delete(value),`${kind} deleted exactly once`);deleted.add(value);
  };
  function status(){
    if(framebuffer===null)return gl.FRAMEBUFFER_COMPLETE;
    const target=fb(),sizes=[];
    if(!target.attachments.size)return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
    for(const [attachment,value]of target.attachments){
      const image=textures.get(value);
      if(!image?.width||!image?.height)return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      if((attachment===gl.DEPTH_ATTACHMENT)!==(image.internalFormat===gl.DEPTH_COMPONENT24))return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      sizes.push(image.width+':'+image.height);
    }
    if(new Set(sizes).size!==1)return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
    for(const attachment of target.drawBuffers)if(attachment!==gl.NONE&&!target.attachments.has(attachment))return gl.FRAMEBUFFER_INCOMPLETE_DRAW_BUFFER;
    if(target.readBuffer!==gl.NONE&&!target.attachments.has(target.readBuffer))return gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
    return gl.FRAMEBUFFER_COMPLETE;
  }
  function draw(mode,first,count,instances=1){
    assert.equal(mode,gl.TRIANGLES);assert(Number.isInteger(count)&&count>=0);assert(Number.isInteger(instances)&&instances>0);
    const p=alive(programs,program,'draw program');alive(arrays,vao,'draw VAO');
    gl.beforeDraw?.({program,framebuffer,viewport:[...viewport]});
    assert.equal(status(),gl.FRAMEBUFFER_COMPLETE,'draw framebuffer is complete');
    assert(viewport[2]>0&&viewport[3]>0,'draw viewport is nonempty');
    const attached=framebuffer===null?new Set():new Set(fb().attachments.values()),sampled=new Map();
    for(const name of p.samplers){
      const index=p.values.get(name)??0,value=bindings.get(index);
      assert(Number.isInteger(index)&&index>=0&&index<16,`${name} has a valid texture unit`);
      const image=alive(textures,value,`sampler ${name} texture`);
      assert(image.width&&image.height,`sampler ${name} texture is initialized`);
      assert(!attached.has(value),`texture feedback: ${name} samples an attachment of the draw framebuffer`);
      if(image.parameters.get(gl.TEXTURE_MIN_FILTER)===gl.LINEAR_MIPMAP_LINEAR)assert(image.mipmaps,`${name} has mipmaps`);
      sampled.set(name,value);
    }
    for(const attribute of arrays.get(vao).values())if(attribute.enabled){
      const storage=alive(buffers,attribute.buffer,'vertex buffer');
      const last=attribute.divisor?Math.floor((instances-1)/attribute.divisor):first+count-1;
      if(count)assert(attribute.offset+last*(attribute.stride||attribute.size*4)+attribute.size*4<=storage.bytes,'draw stays inside vertex/instance buffer');
    }
    draws.push({program,framebuffer,viewport:[...viewport],sampled,uniforms:new Map(p.values),outputs:new Set(p.outputs),
      attachments:framebuffer===null?new Map():new Map(fb().attachments),
      drawBuffers:framebuffer===null?[gl.BACK]:[...fb().drawBuffers],depthTest:enabled.has(gl.DEPTH_TEST),writeDepth,count,instances});
  }
  Object.assign(gl,{
    textures,framebuffers,buffers,arrays,programs,draws,clears,deleted,beforeDraw:null,
    programme(vertex,fragment){
      const value=handle('program'),uniforms=new Map(),source=vertex+'\n'+fragment;
      for(const match of source.matchAll(/uniform\s+(\w+)\s+([^;]+);/g))for(const declaration of match[2].split(',')){
        const m=declaration.trim().match(/^(\w+)(?:\[(\d+)\])?$/);assert(m,'supported uniform declaration');
        uniforms.set(m[1],{type:match[1],count:Number(m[2]||1)});
      }
      const withoutDeclarations=source.replace(/uniform\s+\w+\s+[^;]+;/g,''),samplers=[];
      for(const[name,info]of uniforms)if(info.type.startsWith('sampler')&&new RegExp('\\b'+name+'\\b').test(withoutDeclarations))samplers.push(name);
      const outputs=[...fragment.matchAll(/layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*out\s+/g)].map(m=>Number(m[1]));
      if(!outputs.length&&/\bout\s+vec4\s+\w+\s*;/.test(fragment))outputs.push(0);
      programs.set(value,{uniforms,samplers,outputs,values:new Map()});return value;
    },
    getUniformLocation(value,name){const p=alive(programs,value,'program'),key=name.replace(/\[0\]$/,'');return p.uniforms.has(key)?{program:value,name:key}:null;},
    useProgram(value){alive(programs,value,'program');program=value;},
    deleteProgram(value){remove(programs,value,'program');if(program===value)program=null;},
    uniform1i(loc,value){assert(Number.isInteger(value));uniform(loc,[value]);},uniform1f(loc,value){uniform(loc,[value]);},
    uniform2f(loc,a,b){uniform(loc,[a,b]);},uniform3fv(loc,data){assert.equal(data.length,3);uniform(loc,[...data]);},
    uniform4fv(loc,data){assert.equal(data.length%4,0);uniform(loc,[...data]);},
    uniformMatrix4fv(loc,transpose,data){assert.equal(transpose,false,'WebGL matrices are not transposed');assert.equal(data.length,16);uniform(loc,[...data]);},
    createTexture(){const value=handle('texture');textures.set(value,{parameters:new Map(),width:0,height:0});return value;},
    activeTexture(value){unit=value-gl.TEXTURE0;assert(Number.isInteger(unit)&&unit>=0&&unit<16);},
    bindTexture(target,value){assert.equal(target,gl.TEXTURE_2D);if(value!==null)alive(textures,value,'texture');bindings.set(unit,value);},
    texImage2D(target,level,internalFormat,width,height,border,format,type,pixels){
      assert.equal(target,gl.TEXTURE_2D);assert.equal(level,0);assert.equal(border,0);assert(width>0&&height>0);
      const depth=internalFormat===gl.DEPTH_COMPONENT24;
      assert.equal(format,depth?gl.DEPTH_COMPONENT:gl.RGBA);assert.equal(type,depth?gl.UNSIGNED_INT:gl.UNSIGNED_BYTE);
      if(pixels!==null)assert.equal(pixels.byteLength,width*height*4);
      Object.assign(texture(),{width,height,internalFormat,uploadBytes:pixels?.byteLength||0,mipmaps:false});
    },
    texParameteri(target,name,value){assert.equal(target,gl.TEXTURE_2D);texture().parameters.set(name,value);},
    generateMipmap(target){assert.equal(target,gl.TEXTURE_2D);assert(texture().width>0);texture().mipmaps=true;},
    deleteTexture(value){remove(textures,value,'texture');for(const[index,bound]of bindings)if(bound===value)bindings.set(index,null);},
    pixelStorei(name,value){assert.equal(name,gl.UNPACK_ALIGNMENT);assert([1,2,4,8].includes(value));},
    getExtension(){return null;},
    createFramebuffer(){const value=handle('framebuffer');framebuffers.set(value,{attachments:new Map(),drawBuffers:[gl.COLOR_ATTACHMENT0],readBuffer:gl.COLOR_ATTACHMENT0});return value;},
    bindFramebuffer(target,value){assert.equal(target,gl.FRAMEBUFFER);if(value!==null)alive(framebuffers,value,'framebuffer');framebuffer=value;},
    framebufferTexture2D(target,attachment,textureTarget,value,level){
      assert.equal(target,gl.FRAMEBUFFER);assert.equal(textureTarget,gl.TEXTURE_2D);assert.equal(level,0);
      if(value===null)fb().attachments.delete(attachment);else{alive(textures,value,'attachment texture');fb().attachments.set(attachment,value);}
    },
    drawBuffers(values){fb().drawBuffers=[...values];},readBuffer(value){fb().readBuffer=value;},
    checkFramebufferStatus(target){assert.equal(target,gl.FRAMEBUFFER);return status();},
    deleteFramebuffer(value){remove(framebuffers,value,'framebuffer');if(framebuffer===value)framebuffer=null;},
    createBuffer(){const value=handle('buffer');buffers.set(value,{bytes:0});return value;},
    bindBuffer(target,value){assert.equal(target,gl.ARRAY_BUFFER);alive(buffers,value,'buffer');arrayBuffer=value;},
    bufferData(target,data){assert.equal(target,gl.ARRAY_BUFFER);alive(buffers,arrayBuffer,'buffer').bytes=data.byteLength;},
    bufferSubData(target,offset,data){assert.equal(target,gl.ARRAY_BUFFER);assert(offset+data.byteLength<=alive(buffers,arrayBuffer,'buffer').bytes);},
    deleteBuffer(value){remove(buffers,value,'buffer');if(arrayBuffer===value)arrayBuffer=null;},
    createVertexArray(){const value=handle('vao');arrays.set(value,new Map());return value;},
    bindVertexArray(value){if(value!==null)alive(arrays,value,'VAO');vao=value;},
    enableVertexAttribArray(index){const attributes=alive(arrays,vao,'VAO');attributes.set(index,{...attributes.get(index),enabled:true});},
    vertexAttribPointer(index,size,type,normalized,stride,offset){
      assert.equal(type,gl.FLOAT);assert.equal(normalized,false);alive(buffers,arrayBuffer,'attribute buffer');
      const attributes=alive(arrays,vao,'VAO');attributes.set(index,{...attributes.get(index),size,stride,offset,buffer:arrayBuffer,divisor:0});
    },
    vertexAttribDivisor(index,divisor){alive(arrays,vao,'VAO').get(index).divisor=divisor;},
    deleteVertexArray(value){remove(arrays,value,'VAO');if(vao===value)vao=null;},
    viewport(...value){assert.equal(value.length,4);assert(value.every(Number.isFinite));viewport=[...value];},
    getParameter(name){if(name===gl.FRAMEBUFFER_BINDING)return framebuffer;if(name===gl.VIEWPORT)return new Int32Array(viewport);throw Error('Unmodelled GL parameter '+name);},
    enable(cap){enabled.add(cap);},disable(cap){enabled.delete(cap);},depthMask(value){writeDepth=!!value;},
    depthFunc(value){assert.equal(value,gl.LEQUAL);},cullFace(value){assert.equal(value,gl.BACK);},clearColor(){},
    clear(mask){assert.equal(status(),gl.FRAMEBUFFER_COMPLETE,'cleared framebuffer is complete');clears.push({framebuffer,mask,writeDepth});},
    drawArrays:draw,drawArraysInstanced:draw
  });
  return gl;
}

function fixture(){
  const gl=strictGL(),resources=new ProceduralResources();
  const points=[{x:-128,y:-128},{x:128,y:-128},{x:128,y:384},{x:-128,y:384}];
  const sector={id:0,floor:0,ceiling:128,floorTexture:'FLOOR4_8',ceilingTexture:'CEIL3_5',light:192,special:0};
  const map={revision:0,vertices:points,sectors:[sector],floorPolygons:[{sector:0,points}],sectorAt:()=>sector,
    sides:points.map(()=>({sector:0,xOffset:0,yOffset:0,middle:'STARTAN3',upper:'-',lower:'-'})),
    lines:points.map((_,i)=>({v1:i,v2:(i+1)%4,right:i,left:-1,flags:0,special:0}))};
  const engine={pdr:{generation:1,programme:(v,f)=>gl.programme(v,f)},disposed:false,resizes:[],
    resize(value){this.resizes.push(value);return value;},dispose(){this.disposed=true;}};
  const renderer=Object.assign(Object.create(FerroDoomRenderer.prototype),{
    gl,engine,resources,map,brightness:1.2,compact:false,surfaceMaxSize:16,shadowSize:1024,
    leaves:buildSubsectorPolygons(map),lightingRig:buildLightingRig(map),textureCache:new Map(),meshes:new Map(),modelMeshes:new Map(),
    modelBytes:0,modelCacheLimit:64*1024*1024,lodState:new WeakMap(),generation:-1,sectorHeights:'',stats:{},
    camera:{near:.025,far:400},frame:{time:.2,entities:[{id:'barrel',type:2035,x:0,y:128,z:0,angle:0}],weapon:{kind:'pistol',phase:Infinity}}
  });
  renderer._initialize();
  const vp=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const view={vp,oeil:[0,41/32,0],droite:[1,0,0],avant:[0,0,-1],haut:[0,1,0],tangente:Math.tan(35*Math.PI/180),largeur:160,hauteur:96};
  // A separately owned FERRO target with a non-default viewport catches code
  // that restores the canvas/zero viewport instead of the actual host target.
  const parent=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,parent);
  const parentTextures=[];
  for(const depth of[false,true]){
    const value=gl.createTexture();parentTextures.push(value);gl.bindTexture(gl.TEXTURE_2D,value);
    gl.texImage2D(gl.TEXTURE_2D,0,depth?gl.DEPTH_COMPONENT24:gl.RGBA8,400,240,0,depth?gl.DEPTH_COMPONENT:gl.RGBA,depth?gl.UNSIGNED_INT:gl.UNSIGNED_BYTE,null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,depth?gl.DEPTH_ATTACHMENT:gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,value,0);
  }
  const parentViewport=[11,7,160,96];gl.viewport(...parentViewport);
  return {gl,renderer,engine,view,parent,parentTextures,parentViewport};
}
const texturesOf=target=>[target.depth,target.color,target.normal].filter(Boolean);
const noStagingArrays=(value,seen=new Set())=>{
  if(value===null||typeof value!=='object'||seen.has(value))return true;
  if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return false;
  seen.add(value);const values=value instanceof Map?[...value.values()]:Object.values(value);
  return values.every(v=>noStagingArrays(v,seen));
};

function verifyTarget(gl,target,color){
  const record=gl.framebuffers.get(target.framebuffer);assert(record,'target framebuffer is live');
  assert.equal(record.attachments.get(gl.DEPTH_ATTACHMENT),target.depth);
  assert.equal(gl.textures.get(target.depth).internalFormat,gl.DEPTH_COMPONENT24);
  assert.deepEqual(record.drawBuffers,color?[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]:[gl.NONE]);
  if(color){
    assert.equal(record.attachments.get(gl.COLOR_ATTACHMENT0),target.color);
    assert.equal(record.attachments.get(gl.COLOR_ATTACHMENT1),target.normal);
    assert.notEqual(target.color,target.normal,'normals do not alias the colour image');
  }
  for(const texture of texturesOf(target))assert.deepEqual([gl.textures.get(texture).width,gl.textures.get(texture).height],[target.width,target.height]);
}

// No render method is stubbed: this exercises _initialize, _updateMap, targets,
// both shadow passes, real procedural meshes, surface uploads and presentation.
test('host pass keeps MRT/depth complete, avoids texture feedback and restores the FERRO target',t=>{
  const f=fixture(),{gl,renderer,view,parent,parentViewport}=f;t.after(()=>renderer.dispose());
  const result=renderer._renderPass(gl,view);
  assert.equal(result.appels,gl.draws.length,'reported draws match actual submitted passes');
  assert(result.triangles>0&&result.instances>0);
  verifyTarget(gl,renderer.sceneTarget,true);verifyTarget(gl,renderer.shadowTarget,false);verifyTarget(gl,renderer.weaponShadowTarget,false);
  assert.notEqual(renderer.shadowTarget.framebuffer,renderer.weaponShadowTarget.framebuffer);
  assert.deepEqual([renderer.weaponShadowTarget.width,renderer.weaponShadowTarget.height],[512,512]);
  const sceneDraws=gl.draws.filter(d=>d.framebuffer===renderer.sceneTarget.framebuffer);
  assert(sceneDraws.some(d=>d.program===renderer.worldProgram)&&sceneDraws.some(d=>d.program===renderer.modelProgram));
  for(const draw of sceneDraws)assert(draw.outputs.has(0)&&draw.outputs.has(1),'every colour pass supplies both scene colour and normals');
  const post=gl.draws.find(d=>d.program===renderer.postProgram);assert(post);
  assert.equal(post.framebuffer,parent);assert.deepEqual(post.viewport,parentViewport);
  assert.equal(post.sampled.get('uScene'),renderer.sceneTarget.color);
  assert.equal(post.sampled.get('uDepth'),renderer.sceneTarget.depth);
  assert.equal(post.sampled.get('uNormal'),renderer.sceneTarget.normal);
  const weapon=gl.draws.find(d=>d.program===renderer.modelProgram&&d.uniforms.get('uViewModel')===1);assert(weapon);
  assert.equal(weapon.framebuffer,parent);assert(weapon.depthTest&&weapon.writeDepth);
  assert.equal(weapon.sampled.get('uShadow'),renderer.shadowTarget.depth);
  assert.equal(weapon.sampled.get('uSelfShadow'),renderer.weaponShadowTarget.depth);
  assert.equal(weapon.uniforms.get('uSelfShadowEnabled'),1);
  assert(gl.draws.some(d=>d.program===renderer.shadowProgram&&d.framebuffer===renderer.weaponShadowTarget.framebuffer));
  assert.equal(gl.getParameter(gl.FRAMEBUFFER_BINDING),parent);assert.deepEqual([...gl.getParameter(gl.VIEWPORT)],parentViewport);
  // A subsequent no-weapon frame begins with all post-process/shadow samplers
  // still bound. It must remain safe and also restore the default framebuffer.
  const scene=renderer.sceneTarget,shadow=renderer.shadowTarget,self=renderer.weaponShadowTarget,at=gl.draws.length;
  renderer.frame.weapon=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,view.largeur,view.hauteur);
  renderer._renderPass(gl,view);
  assert.equal(renderer.sceneTarget,scene);assert.equal(renderer.shadowTarget,shadow);assert.equal(renderer.weaponShadowTarget,self);
  assert.equal(gl.getParameter(gl.FRAMEBUFFER_BINDING),null);assert.deepEqual([...gl.getParameter(gl.VIEWPORT)],[0,0,view.largeur,view.hauteur]);
  assert(!gl.draws.slice(at).some(d=>d.program===renderer.modelProgram&&d.uniforms.get('uViewModel')===1));
});

test('resize replaces all scene attachments, dispose frees owned GPU resources, texture cache retains handles only',()=>{
  const {gl,renderer,engine,view,parent,parentTextures,parentViewport}=fixture();renderer._renderPass(gl,view);
  assert(renderer.textureCache.size>=3,'floor, ceiling and wall material uploads were exercised');
  assert(noStagingArrays(renderer.textureCache),'GPU material cache must not pin CPU raster arrays');
  const scene=renderer.sceneTarget,oldScene=[scene.framebuffer,...texturesOf(scene)],shadow=renderer.shadowTarget,self=renderer.weaponShadowTarget;
  renderer.resize();assert.deepEqual(engine.resizes,['low']);
  gl.bindFramebuffer(gl.FRAMEBUFFER,parent);gl.viewport(...parentViewport);
  renderer._renderPass(gl,{...view,largeur:192,hauteur:112});
  assert.notEqual(renderer.sceneTarget,scene);verifyTarget(gl,renderer.sceneTarget,true);
  for(const resource of oldScene)assert(gl.deleted.has(resource),'resize deletes the old colour, normal, depth and FBO');
  assert.equal(renderer.shadowTarget,shadow);assert.equal(renderer.weaponShadowTarget,self,'fixed shadow targets survive a scene resize');
  assert.equal(gl.getParameter(gl.FRAMEBUFFER_BINDING),parent);assert.deepEqual([...gl.getParameter(gl.VIEWPORT)],parentViewport);
  assert(noStagingArrays(renderer.textureCache));
  renderer.dispose();assert(engine.disposed);
  assert.deepEqual(new Set(gl.textures.keys()),new Set(parentTextures),'all owned textures freed, host textures preserved');
  assert.deepEqual([...gl.framebuffers.keys()],[parent],'all owned FBOs freed, host FBO preserved');
  for(const registry of[gl.buffers,gl.arrays,gl.programs])assert.equal(registry.size,0,'owned buffer/VAO/program allocations are released');
});

test('state probe detects a feedback regression during the actual host pass',t=>{
  const {gl,renderer,view}=fixture();t.after(()=>renderer.dispose());
  gl.beforeDraw=({program})=>{
    if(program!==renderer.postProgram)return;
    gl.beforeDraw=null;
    // Fault injection: simulate forgetting to leave the scene target before
    // sampling its colour/depth/normal attachments in the post-process draw.
    gl.bindFramebuffer(gl.FRAMEBUFFER,renderer.sceneTarget.framebuffer);
  };
  assert.throws(()=>renderer._renderPass(gl,view),/texture feedback:/);
});

test('state probe detects a missing MRT attachment before geometry is submitted',t=>{
  const {gl,renderer,view}=fixture();t.after(()=>renderer.dispose());
  gl.beforeDraw=({program})=>{
    if(program!==renderer.worldProgram)return;
    gl.beforeDraw=null;
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,null,0);
  };
  assert.throws(()=>renderer._renderPass(gl,view),/draw framebuffer is complete/);
});
