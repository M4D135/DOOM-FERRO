import { surfaceDetail, surfaceDetailCacheStats } from './procedural-surface-detail.js';
import { buildLightingRig, sceneLighting, weaponShadowProjection } from './procedural-lighting.js';
import { WORLD_VERTEX, WORLD_FRAGMENT, MODEL_VERTEX, MODEL_FRAGMENT, SKY_VERTEX, SKY_FRAGMENT, SHADOW_VERTEX, SHADOW_FRAGMENT, POST_VERTEX, POST_FRAGMENT } from './procedural-shaders.js';
import { collectModelBatches, collectShadowBatches, viewWeaponBatch, MODEL_VERTEX_STRIDE } from './procedural-models.js';
/**
 * DOOM host adapter for canonical FERRO 0.3.33.
 *
 * FERRO owns the WebGL context, frame lifecycle, projection, camera, render
 * target, resolution budget, shader compilation and statistics. Generated surfaces
 * enter its documented host geometry hook (fx.foule.couleur); no engine source
 * is patched, no second renderer/context is hidden behind the FERRO name.
 */
import '../vendor/ferro/fmath.js';
import '../vendor/ferro/surface.js';
import '../vendor/ferro/renderer.js';
import '../vendor/ferro/engine.js';

const SCALE = 1 / 32;
const EPSILON = 0.00001;
const TAU = Math.PI * 2;

function clipPolygon(points, x, y, dx, dy, side) {
  if (points.length < 3) return [];
  const result = [];
  const sign = side === 0 ? -1 : 1;
  const distance = p => sign * (dx * (p.y - y) - dy * (p.x - x));
  let previous = points[points.length - 1], a = distance(previous);
  for (const current of points) {
    const b = distance(current);
    if ((a >= -EPSILON) !== (b >= -EPSILON)) {
      const ratio = a / (a - b);
      result.push({ x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio });
    }
    if (b >= -EPSILON) result.push(current);
    previous = current; a = b;
  }
  return result.filter((p, i) => {
    const q = result[(i + result.length - 1) % result.length];
    return !q || Math.hypot(p.x - q.x, p.y - q.y) > EPSILON;
  });
}

/** Procedural cells, or the archival BSP adapter used by reference tests. */
export function buildSubsectorPolygons(map) {
  if (map.floorPolygons) return map.floorPolygons;
  const xs = map.vertices.map(v => v.x), ys = map.vertices.map(v => v.y);
  const lowX = Math.min(...xs) - 128, highX = Math.max(...xs) + 128;
  const lowY = Math.min(...ys) - 128, highY = Math.max(...ys) + 128;
  const bounds = [{x:lowX,y:lowY},{x:highX,y:lowY},{x:highX,y:highY},{x:lowX,y:highY}];
  const leaves = new Array(map.subsectors.length);
  function visit(child, polygon, depth = 0) {
    if (depth > map.nodes.length + 2 || polygon.length < 3) return;
    if (child & 0x8000 || map.nodes.length === 0) {
      const index = map.nodes.length === 0 ? 0 : child & 0x7fff;
      const sub = map.subsectors[index];
      if (!sub) return;
      for (let i = sub.first; i < sub.first + sub.count; i++) {
        const seg = map.segs[i], a = map.vertices[seg.v1], b = map.vertices[seg.v2];
        polygon = clipPolygon(polygon, a.x, a.y, b.x-a.x, b.y-a.y, 0);
        if (polygon.length < 3) return;
      }
      leaves[index] = { sector: sub.sector, points: polygon, subsector: index };
      return;
    }
    const node = map.nodes[child];
    if (!node) return;
    visit(node.rightChild, clipPolygon(polygon,node.x,node.y,node.dx,node.dy,0),depth+1);
    visit(node.leftChild, clipPolygon(polygon,node.x,node.y,node.dx,node.dy,1),depth+1);
  }
  visit(map.nodes.length ? map.nodes.length-1 : 0x8000, bounds);
  return leaves.filter(Boolean);
}

function textureSize(resources, name, kind) {
  const t = kind === 'flat' ? resources.flat(name) : resources.texture(name);
  return t || { width:64, height:64 };
}

/** Geometry is rebuilt only while sector heights actually change. */
export function buildMapGeometry(resources, map, leaves = buildSubsectorPolygons(map)) {
  const groups = new Map();
  const group = (kind,name) => {
    const key = kind+':'+name;
    if (!groups.has(key)) groups.set(key,{key,kind,name,vertices:[]});
    return groups.get(key).vertices;
  };
  function vertex(out,x,height,y,u,v,light,special) {
    out.push(x*SCALE,height*SCALE,-y*SCALE,u,v,light,special);
  }
  for (const leaf of leaves) {
    const sector = map.sectors[leaf.sector];
    if (!sector) continue;
    for (const ceiling of [false,true]) {
      const name = ceiling ? sector.ceilingTexture : sector.floorTexture;
      if (!name || name === 'F_SKY1') continue;
      const out = group('flat',name), height = ceiling ? sector.ceiling : sector.floor;
      const points = leaf.points;
      for (let i=1;i<points.length-1;i++) {
        // Doom XY -> world X,-Z flips winding: CCW in Doom faces up.
        const triangle = ceiling ? [points[0],points[i+1],points[i]] : [points[0],points[i],points[i+1]];
        for (const p of triangle) vertex(out,p.x,height,p.y,p.x/64,-p.y/64,sector.light/255,sector.special);
      }
    }
  }
  function wall(a,b,bottom,top,name,kind,side,sector,line,back) {
    if (!name || name==='-' || top <= bottom+EPSILON) return;
    const dimensions=textureSize(resources,name,'wall'), out=group('wall',name);
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    const u0=side.xOffset/dimensions.width,u1=(side.xOffset+length)/dimensions.width;
    let textureTop=sector.ceiling;
    if (kind==='solid') textureTop=(line.flags&16)?sector.floor+dimensions.height:sector.ceiling;
    if (kind==='upper') textureTop=(line.flags&8)?sector.ceiling:back.ceiling+dimensions.height;
    if (kind==='lower') textureTop=(line.flags&16)?sector.ceiling:back.floor;
    if (kind==='middle') {
      textureTop=(line.flags&16)?Math.max(sector.floor,back.floor)+dimensions.height:Math.min(sector.ceiling,back.ceiling);
      top=Math.min(top,textureTop+side.yOffset);
      bottom=Math.max(bottom,textureTop+side.yOffset-dimensions.height);
      if (top <= bottom+EPSILON) return;
    }
    const v0=(textureTop-bottom+side.yOffset)/dimensions.height;
    const v1=(textureTop-top+side.yOffset)/dimensions.height;
    const orientation = Math.abs(a.y-b.y)<EPSILON ? -16/255 : Math.abs(a.x-b.x)<EPSILON ? 16/255 : 0;
    const light=Math.max(0.08,Math.min(1,sector.light/255+orientation));
    const pts=[[a.x,bottom,a.y,u0,v0],[b.x,bottom,b.y,u1,v0],[b.x,top,b.y,u1,v1],
      [a.x,bottom,a.y,u0,v0],[b.x,top,b.y,u1,v1],[a.x,top,a.y,u0,v1]];
    // Store scrolling width above the sector-special field. The WAD offsets
    // remain immutable; Doom's type48 scrolls one texel per 35Hz game tic.
    const special=sector.special+(line.special===48?dimensions.width*1000:0);
    for(const p of pts) vertex(out,...p,light,special);
  }
  for (const line of map.lines) {
    for (const left of [false,true]) {
      const sideIndex=left?line.left:line.right;
      if (sideIndex<0) continue;
      const side=map.sides[sideIndex], sector=map.sectors[side.sector];
      const other=left?line.right:line.left;
      const a=map.vertices[left?line.v2:line.v1], b=map.vertices[left?line.v1:line.v2];
      if (other<0) {
        wall(a,b,sector.floor,sector.ceiling,side.middle,'solid',side,sector,line,null);
        continue;
      }
      const back=map.sectors[map.sides[other].sector];
      if (back.floor>sector.floor) wall(a,b,sector.floor,Math.min(back.floor,sector.ceiling),side.lower,'lower',side,sector,line,back);
      if (back.ceiling<sector.ceiling && !(sector.ceilingTexture==='F_SKY1' && back.ceilingTexture==='F_SKY1'))
        wall(a,b,Math.max(back.ceiling,sector.floor),sector.ceiling,side.upper,'upper',side,sector,line,back);
      wall(a,b,Math.max(sector.floor,back.floor),Math.min(sector.ceiling,back.ceiling),side.middle,'middle',side,sector,line,back);
    }
  }
  return [...groups.values()].map(g=>({...g,vertices:new Float32Array(g.vertices)}));
}

export class FerroDoomRenderer {
  constructor(canvas,resources,map,{maxPixels=1280*800,brightness=1.2}={}) {
    this.canvas=canvas;this.resources=resources;this.map=map;this.brightness=brightness;
    this.compact=maxPixels<=640*400;this.surfaceMaxSize=this.compact?256:1024;
    this.shadowSize=this.compact?512:1024;
    this.engine=globalThis.FERRO.render.create(canvas,{
      resolution:'native',maxPixels,renderScale:1,reflections:false,msaa:0,
      vignette:1,composition:false,cullMargin:0
    });
    if (!this.engine.gl) {this.engine.dispose();throw new Error('Cette version de Doom FERRO nécessite WebGL 2.');}
    this.gl=this.engine.gl;this.stats=this.engine.stats;
    this.stats.host='procedural-e1m1';this.stats.ferroVersion=globalThis.FERRO.version;
    this.engine.resize('low');this.engine.setWorld([],[],null);
    this.leaves=buildSubsectorPolygons(map);this.lightingRig=buildLightingRig(map);
    this.textureCache=new Map();this.meshes=new Map();this.modelMeshes=new Map();
    this.modelBytes=0;this.modelCacheLimit=64*1024*1024;this.lodState=new WeakMap();
    this.generation=-1;this.sectorHeights='';this.frame={entities:[],time:0};
    this.camera={pos:[0,1.3,0],yaw:0,pitch:0,fov:70,near:.025,far:400};
    this.hook={couleur:(gl,view)=>this._renderPass(gl,view)};
    this._initialize();this._updateMap();
  }

  _locations(program,names) {
    return Object.fromEntries(names.map(n=>[n,this.gl.getUniformLocation(program,/^uLights$|^uLightColors$/.test(n)?n+'[0]':n)]));
  }

  _initialize() {
    const gl=this.gl;
    this.generation=this.engine.pdr.generation;
    this.worldProgram=this.engine.pdr.programme(WORLD_VERTEX,WORLD_FRAGMENT);
    this.skyProgram=this.engine.pdr.programme(SKY_VERTEX,SKY_FRAGMENT);
    this.modelProgram=this.engine.pdr.programme(MODEL_VERTEX,MODEL_FRAGMENT);
    this.shadowProgram=this.engine.pdr.programme(SHADOW_VERTEX,SHADOW_FRAGMENT);
    this.postProgram=this.engine.pdr.programme(POST_VERTEX,POST_FRAGMENT);
    const common=['uVP','uEye','uTime','uBrightness','uDamage','uFlash','uAmbient','uOutdoor','uLights','uLightColors','uLightCount',
      'uShadow','uShadowVP','uShadowTexel','uShadowEnabled','uSelfShadow','uSelfShadowVP','uSelfShadowTexel','uSelfShadowEnabled','uAOOutput'];
    this.uniforms=this._locations(this.worldProgram,[...common,'uTexture','uNormalRoughness','uSurface','uHeightUV','uRelief']);
    this.modelUniforms=this._locations(this.modelProgram,[...common,'uRight','uForward','uUp','uViewModel']);
    this.skyUniforms=this._locations(this.skyProgram,['uForward','uRight','uUp','uFov','uTime']);
    this.shadowUniforms=this._locations(this.shadowProgram,['uVP','uTexture','uModel','uViewModel','uEye','uRight','uForward','uUp','uTime','uAlphaTest']);
    this.postUniforms=this._locations(this.postProgram,['uScene','uDepth','uNormal','uRight','uUp','uForward','uPixel','uFov','uNearFar','uContactAO']);
    this.skyVao=gl.createVertexArray();
    this.anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
    this.textureCache.clear();this.textureBytes=0;this.meshes.clear();this.modelMeshes.clear();this.modelBytes=0;
    this.lodState=new WeakMap();this.sectorHeights='';this.sceneTarget=null;this.shadowTarget=null;this.weaponShadowTarget=null;
  }

  _texture(kind,name) {
    const key=kind+':'+name;
    if(this.textureCache.has(key))return this.textureCache.get(key);
    const gl=this.gl;
    let base=kind==='flat'?this.resources.flat(name):this.resources.texture(name);
    if(!base)base={width:2,height:2,pixels:new Uint8Array([120,100,90,255,80,65,55,255,80,65,55,255,120,100,90,255])};
    const source=surfaceDetail(kind,name,base,{maxSize:this.surfaceMaxSize});
    const upload=pixels=>{
      const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      if(this.anisotropy)gl.texParameterf(gl.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return texture;
    };
    // Keep GPU handles only: holding source arrays here would defeat the CPU LRU.
    const value={texture:upload(source.pixels),normal:upload(source.normalRoughness),surface:upload(source.surface),
      width:source.width,height:source.height,baseWidth:source.baseWidth,baseHeight:source.baseHeight,heightScale:source.heightScale};
    this.textureBytes+=Math.ceil(source.width*source.height*12*4/3);
    this.textureCache.set(key,value);return value;
  }

  _target(width,height,depthOnly=false) {
    const gl=this.gl,framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    const allocate=(depth,attachment=gl.COLOR_ATTACHMENT0)=>{
      const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,depth?gl.DEPTH_COMPONENT24:gl.RGBA8,width,height,0,depth?gl.DEPTH_COMPONENT:gl.RGBA,depth?gl.UNSIGNED_INT:gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,depth?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,depth?gl.NEAREST:gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(depthOnly){
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      }
      gl.framebufferTexture2D(gl.FRAMEBUFFER,depth?gl.DEPTH_ATTACHMENT:attachment,gl.TEXTURE_2D,t,0);return t;
    };
    const depth=allocate(true),color=depthOnly?null:allocate(false),normal=depthOnly?null:allocate(false,gl.COLOR_ATTACHMENT1);
    gl.drawBuffers(depthOnly?[gl.NONE]:[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.readBuffer(depthOnly?gl.NONE:gl.COLOR_ATTACHMENT0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Cible de rendu FERRO incomplète.');
    return {framebuffer,depth,color,normal,width,height};
  }

  _deleteTarget(target) {
    if(!target)return;this.gl.deleteFramebuffer(target.framebuffer);this.gl.deleteTexture(target.depth);if(target.color)this.gl.deleteTexture(target.color);if(target.normal)this.gl.deleteTexture(target.normal);
  }

  _ensureTargets(width,height) {
    if(!this.sceneTarget||this.sceneTarget.width!==width||this.sceneTarget.height!==height){
      this._deleteTarget(this.sceneTarget);this.sceneTarget=this._target(width,height);
    }
    if(!this.shadowTarget)this.shadowTarget=this._target(this.shadowSize,this.shadowSize,true);
    if(!this.weaponShadowTarget)this.weaponShadowTarget=this._target(512,512,true);
  }

  _upload(collection,key,vertices) {
    const gl=this.gl;
    let mesh=collection.get(key);
    if(!mesh){
      mesh={buffer:gl.createBuffer(),vao:gl.createVertexArray(),capacity:0,count:0};collection.set(key,mesh);
      gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      for(const [index,size,offset] of [[0,3,0],[1,2,12],[2,1,20],[3,1,24]]){
        gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,28,offset);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    if(vertices.byteLength>mesh.capacity){gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);mesh.capacity=vertices.byteLength;}
    else if(vertices.byteLength)gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);
    mesh.count=vertices.length/7;
    return mesh;
  }


  _updateMap() {
    const signature=(this.map.revision||0)+'|'+this.map.sectors.map(s=>s.floor+','+s.ceiling).join(';');
    if(signature===this.sectorHeights)return;
    this.sectorHeights=signature;
    for(const mesh of this.meshes.values())mesh.count=0;
    const groups=buildMapGeometry(this.resources,this.map,this.leaves);let triangles=0;
    for(const group of groups){
      const mesh=this._upload(this.meshes,group.key,group.vertices);mesh.kind=group.kind;mesh.name=group.name;triangles+=mesh.count/3;
    }
    this.stats.mapTriangles=triangles;this.stats.mapSubsectors=this.leaves.length;this.stats.mapSectors=this.map.sectors.length;
  }

  _animated(name,time) {return /^NUKAGE[1-3]$/.test(name)?'NUKAGE'+(Math.floor(time*8)%3+1):name;}

  _uploadModel(batch) {
    const gl=this.gl,source=batch.mesh;
    let mesh=this.modelMeshes.get(source.key);
    if(!mesh){
      this._trimModelCache(source.vertices.byteLength+batch.instances.byteLength);
      mesh={buffer:gl.createBuffer(),instancesBuffer:gl.createBuffer(),vao:gl.createVertexArray(),capacity:0,bytes:source.vertices.byteLength,count:source.vertices.length/MODEL_VERTEX_STRIDE};
      gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,source.vertices,gl.STATIC_DRAW);
      for(const [index,size,offset] of [[0,3,0],[1,3,12],[2,3,24],[3,1,36],[4,4,40],[5,3,56]]){
        gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,MODEL_VERTEX_STRIDE*4,offset);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instancesBuffer);
      for(const [index,offset] of [[6,0],[7,16]]){
        gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,4,gl.FLOAT,false,32,offset);gl.vertexAttribDivisor(index,1);
      }
      this.modelBytes+=mesh.bytes;
    }
    this.modelMeshes.delete(source.key);this.modelMeshes.set(source.key,mesh);
    if(batch.instances.byteLength>mesh.capacity)this._trimModelCache(batch.instances.byteLength-mesh.capacity,source.key);
    gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instancesBuffer);
    if(batch.instances.byteLength>mesh.capacity){gl.bufferData(gl.ARRAY_BUFFER,batch.instances,gl.DYNAMIC_DRAW);this.modelBytes+=batch.instances.byteLength-mesh.capacity;mesh.capacity=batch.instances.byteLength;}
    else gl.bufferSubData(gl.ARRAY_BUFFER,0,batch.instances);
    mesh.instances=batch.count;return mesh;
  }

  _trimModelCache(incoming,protectedKey=null) {
    while(this.modelMeshes.size&&this.modelBytes+incoming>this.modelCacheLimit){
      const entry=[...this.modelMeshes].find(([key])=>key!==protectedKey);
      if(!entry)break; // One authored mesh always fits; never delete the active draw's buffers.
      const [key,mesh]=entry;
      this.gl.deleteBuffer(mesh.buffer);this.gl.deleteBuffer(mesh.instancesBuffer);this.gl.deleteVertexArray(mesh.vao);
      this.modelBytes-=mesh.bytes+mesh.capacity;this.modelMeshes.delete(key);
    }
  }


  /** Precompute high-resolution maps and reusable sculpted parts while showing
   * real progress. Yield between recipes so the loading screen remains usable. */
  async prepareModels(progress=()=>{}) {
    const tasks=[...this.meshes.values()].map(m=>()=>this._texture(m.kind,m.name));
    for(const name of ['NUKAGE1','NUKAGE2','NUKAGE3'])tasks.push(()=>this._texture('flat',name));
    for(const kind of ['pistol','shotgun','fist'])for(const phase of [Infinity,0])tasks.push(()=>this._uploadModel(viewWeaponBatch({kind,phase})));
    for(const family of ['POSS','SPOS','TROO'])tasks.push(()=>{
      const actor={id:family,base:family,sprite:family+'A1',enemy:true,alive:true,state:'idle',x:0,y:0,z:0};
      for(const batch of collectModelBatches(this.map,[actor],0))this._uploadModel(batch);
    });
    for(let i=0;i<tasks.length;i++){
      progress(i,tasks.length);await new Promise(resolve=>globalThis.requestAnimationFrame(resolve));tasks[i]();
    }
    progress(tasks.length,tasks.length);
  }

  _bindSurface(material) {
    const gl=this.gl;
    [material.texture,material.normal,material.surface].forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);});
  }

  _lightingUniforms(u,view,lighting,aoOutput) {
    const gl=this.gl;
    gl.uniformMatrix4fv(u.uVP,false,view.vp);gl.uniform3fv(u.uEye,view.oeil);
    gl.uniform1f(u.uTime,this.frame.time||0);gl.uniform1f(u.uBrightness,this.brightness);
    gl.uniform1f(u.uDamage,this.frame.damage||0);gl.uniform1f(u.uFlash,this.frame.flash||0);
    gl.uniform1f(u.uAmbient,lighting.ambient);gl.uniform1f(u.uOutdoor,lighting.outdoor);
    gl.uniform4fv(u.uLights,lighting.positions);gl.uniform4fv(u.uLightColors,lighting.colors);gl.uniform1i(u.uLightCount,lighting.count);
    gl.uniformMatrix4fv(u.uShadowVP,false,lighting.shadowVP);gl.uniform2f(u.uShadowTexel,1/this.shadowSize,1/this.shadowSize);
    gl.uniform1i(u.uShadowEnabled,1);gl.uniform1i(u.uAOOutput,aoOutput?1:0);gl.uniform1i(u.uShadow,3);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.shadowTarget.depth);
    gl.uniform1i(u.uSelfShadow,4);gl.uniform1i(u.uSelfShadowEnabled,!aoOutput&&lighting.weaponShadowVP?1:0);
    gl.uniformMatrix4fv(u.uSelfShadowVP,false,lighting.weaponShadowVP||lighting.shadowVP);gl.uniform2f(u.uSelfShadowTexel,1/512,1/512);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.weaponShadowTarget.depth);
  }

  _modelAxes(u,view) {
    this.gl.uniform3fv(u.uEye,view.oeil);this.gl.uniform3fv(u.uRight,view.droite);
    this.gl.uniform3fv(u.uForward,view.avant);this.gl.uniform3fv(u.uUp,view.haut);
  }

  _drawBatch(batch) {
    const mesh=this._uploadModel(batch);this.gl.drawArraysInstanced(this.gl.TRIANGLES,0,mesh.count,mesh.instances);
    return mesh.count*mesh.instances/3;
  }

  _shadowPass(view,lighting,batches,weaponOnly=null) {
    const gl=this.gl,u=this.shadowUniforms,target=weaponOnly?this.weaponShadowTarget:this.shadowTarget;
    // Unbind depth map before rendering into it; WebGL disallows feedback loops.
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,target.width,target.height);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.shadowProgram);gl.uniformMatrix4fv(u.uVP,false,weaponOnly?lighting.weaponShadowVP:lighting.shadowVP);
    this._modelAxes(u,view);gl.uniform1f(u.uTime,this.frame.time||0);gl.uniform1i(u.uTexture,0);
    let calls=0,triangles=0;
    if(!weaponOnly){
      gl.uniform1i(u.uModel,0);gl.uniform1i(u.uViewModel,0);gl.uniform1i(u.uAlphaTest,1);
      for(const mesh of this.meshes.values())if(mesh.count){
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._texture(mesh.kind,this._animated(mesh.name,this.frame.time||0)).texture);
        gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);calls++;triangles+=mesh.count/3;
      }
    }
    gl.uniform1i(u.uModel,1);gl.uniform1i(u.uAlphaTest,0);gl.uniform1i(u.uViewModel,weaponOnly?1:0);
    for(const batch of weaponOnly?[weaponOnly]:batches){triangles+=this._drawBatch(batch);calls++;}
    return {calls,triangles};
  }

  _renderPass(gl,view) {
    const parent=gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport=gl.getParameter(gl.VIEWPORT);
    if(this.generation!==this.engine.pdr.generation)this._initialize();
    this._updateMap();this._ensureTargets(view.largeur,view.hauteur);
    const time=this.frame.time||0,batches=collectModelBatches(this.map,this.frame.entities||[],time,view,this.lodState);
    const weapon=viewWeaponBatch(this.frame.weapon,time),lighting=sceneLighting(this.lightingRig,view,this.frame.entities||[],time,this.frame.weapon);
    if(weapon)lighting.weaponShadowVP=weaponShadowProjection(lighting.positions.subarray(0,3),view,weapon);
    gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
    const casters=collectShadowBatches(this.map,this.frame.entities||[],time,lighting,batches);
    const shadow=this._shadowPass(view,lighting,casters);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.sceneTarget.framebuffer);gl.viewport(0,0,view.largeur,view.hauteur);
    gl.depthMask(true);gl.clearColor(.07,.08,.09,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
    gl.useProgram(this.skyProgram);gl.bindVertexArray(this.skyVao);const sky=this.skyUniforms;
    gl.uniform3fv(sky.uForward,view.avant);gl.uniform3fv(sky.uRight,view.droite);gl.uniform3fv(sky.uUp,view.haut);
    gl.uniform2f(sky.uFov,view.tangente*view.largeur/view.hauteur,view.tangente);gl.uniform1f(sky.uTime,time);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    gl.useProgram(this.worldProgram);const u=this.uniforms;this._lightingUniforms(u,view,lighting,true);
    gl.uniform1i(u.uTexture,0);gl.uniform1i(u.uNormalRoughness,1);gl.uniform1i(u.uSurface,2);gl.uniform1i(u.uRelief,this.compact?0:1);
    let calls=1+shadow.calls,triangles=1+shadow.triangles,modelTriangles=0,modelCalls=0,instances=0;
    for(const mesh of this.meshes.values())if(mesh.count){
      const material=this._texture(mesh.kind,this._animated(mesh.name,time));this._bindSurface(material);
      gl.uniform2f(u.uHeightUV,material.heightScale/material.baseWidth,material.heightScale/material.baseHeight);
      gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);calls++;triangles+=mesh.count/3;
    }
    gl.useProgram(this.modelProgram);this._lightingUniforms(this.modelUniforms,view,lighting,true);this._modelAxes(this.modelUniforms,view);
    gl.uniform1i(this.modelUniforms.uViewModel,0);
    for(const batch of batches){modelTriangles+=this._drawBatch(batch);modelCalls++;instances+=batch.count;}
    // Contact AO affects the indirect-light fraction saved in alpha; direct
    // highlights and luminous panels keep their intensity. Present into FERRO's target.
    gl.bindFramebuffer(gl.FRAMEBUFFER,parent);gl.viewport(...viewport);
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.useProgram(this.postProgram);gl.bindVertexArray(this.skyVao);
    const post=this.postUniforms;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.sceneTarget.color);gl.uniform1i(post.uScene,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.sceneTarget.depth);gl.uniform1i(post.uDepth,1);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.sceneTarget.normal);gl.uniform1i(post.uNormal,2);
    gl.uniform3fv(post.uRight,view.droite);gl.uniform3fv(post.uUp,view.haut);gl.uniform3fv(post.uForward,view.avant);
    gl.uniform2f(post.uPixel,1/view.largeur,1/view.hauteur);gl.uniform2f(post.uFov,view.tangente*view.largeur/view.hauteur,view.tangente);
    gl.uniform2f(post.uNearFar,this.camera.near,this.camera.far);gl.uniform1i(post.uContactAO,this.compact?0:1);gl.drawArrays(gl.TRIANGLES,0,3);calls++;triangles++;
    if(weapon){
      // Fit the hand/weapon shadow separately so tiny contacts retain detail.
      // It also receives the room shadow, without casting giant world shadows.
      const w=this._shadowPass(view,lighting,[],weapon);calls+=w.calls;triangles+=w.triangles;
      gl.bindFramebuffer(gl.FRAMEBUFFER,parent);gl.viewport(...viewport);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.useProgram(this.modelProgram);
      this._lightingUniforms(this.modelUniforms,view,lighting,false);this._modelAxes(this.modelUniforms,view);gl.uniform1i(this.modelUniforms.uViewModel,1);
      modelTriangles+=this._drawBatch(weapon);modelCalls++;
    }
    calls+=modelCalls;triangles+=modelTriangles;gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);
    Object.assign(this.stats,{modelTriangles,modelInstances:instances,modelDrawCalls:modelCalls,generatedModels:this.modelMeshes.size,worldBillboards:0,
      modelBytes:this.modelBytes,modelCacheLimit:this.modelCacheLimit,modelCulled:batches.summary.culled,modelLods:batches.summary.lods,
      generatedTextures:this.textureCache.size,surfaceTextureBytes:this.textureBytes,surfaceCPUBytes:surfaceDetailCacheStats().bytes,
      localLights:lighting.count,shadowResolution:this.shadowSize,contactAO:!this.compact,physicallyBasedMaterials:true});
    return {appels:calls,triangles,instances};
  }

  draw(camera,frame={}) {
    this.frame=frame;
    this.camera.pos[0]=camera.x*SCALE;this.camera.pos[1]=(camera.z??41)*SCALE;this.camera.pos[2]=-camera.y*SCALE;
    this.camera.yaw=Math.PI/2-(camera.angle||0);this.camera.pitch=camera.pitch||0;this.camera.fov=camera.fov||70;
    this.engine.draw(this.camera,[],{time:frame.time||0,bloom:false,shadows:false,reflections:false,
      msaa:false,adaptive:false,groundCover:false,vignette:false,foule:this.hook});
    return this.stats;
  }

  resize(){return this.engine.resize('low');}

  dispose(){
    const gl=this.gl;
    for(const mesh of [...this.meshes.values(),...this.modelMeshes.values()]){gl.deleteBuffer(mesh.buffer);if(mesh.instancesBuffer)gl.deleteBuffer(mesh.instancesBuffer);gl.deleteVertexArray(mesh.vao);}
    for(const texture of this.textureCache.values())for(const t of [texture.texture,texture.normal,texture.surface])gl.deleteTexture(t);
    this._deleteTarget(this.sceneTarget);this._deleteTarget(this.shadowTarget);this._deleteTarget(this.weaponShadowTarget);gl.deleteVertexArray(this.skyVao);
    for(const p of [this.worldProgram,this.skyProgram,this.modelProgram,this.shadowProgram,this.postProgram])gl.deleteProgram(p);
    this.engine.dispose();
  }
}

export default FerroDoomRenderer;
