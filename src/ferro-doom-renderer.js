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

const WORLD_VERTEX = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLight;
layout(location=3) in float aSpecial;
uniform mat4 uVP;
out vec2 vUV;
out vec3 vPosition;
out float vLight;
flat out int vSpecial;
void main(){vUV=aUV;vPosition=aPosition;vLight=aLight;vSpecial=int(aSpecial+.5);gl_Position=uVP*vec4(aPosition,1.0);}`;
const WORLD_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTexture;
uniform vec3 uEye;
uniform float uTime;
uniform float uBrightness;
uniform float uDamage;
uniform float uFlash;
in vec2 vUV;
in vec3 vPosition;
in float vLight;
flat in int vSpecial;
out vec4 fragColor;
void main(){
 int special=vSpecial%1000;
 float scroll=vSpecial>=1000?uTime*35.0/float(vSpecial/1000):0.0;
 vec4 c=texture(uTexture,vec2(vUV.x+scroll,vUV.y));if(c.a<.5)discard;
 float light=vLight;
 if(special==1){light*=fract(sin(floor(uTime*12.0)+float(special))*173.19)>.72?.4:1.0;}
 if(special==2||special==4||special==12){light*=mod(uTime,1.0)<.17?1.0:.35;}
 if(special==3||special==13){light*=mod(uTime,.5)<.17?1.0:.35;}
 if(special==8){light*=.68+.32*sin(uTime*2.6);}
 float distanceShade=max(.08,light-length(vPosition-uEye)*.005);
 if(vLight>1.1)distanceShade=1.0;
 distanceShade=min(1.0,distanceShade+uFlash*.16);
 vec3 color=c.rgb*distanceShade*uBrightness;
 color=mix(color,vec3(.65,.015,.005),clamp(uDamage,0.0,.55));
 fragColor=vec4(color,1.0);
}`;
const SKY_VERTEX=`#version 300 es
precision highp float;
out vec2 vNDC;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vNDC=p*2.0-1.0;gl_Position=vec4(vNDC,.99999,1.0);}`;
const SKY_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uFov;
in vec2 vNDC;
out vec4 fragColor;
void main(){vec3 d=normalize(uForward+uRight*vNDC.x*uFov.x+uUp*vNDC.y*uFov.y);
float u=atan(d.z,d.x)*.6366197724;float v=clamp(.61-d.y/max(.01,length(d.xz))*.65,0.0,1.0);
fragColor=vec4(texture(uTexture,vec2(u,v)).rgb,1.0);}`;

export class FerroDoomRenderer {
  constructor(canvas,resources,map,{maxPixels=640*400,brightness=1.25}={}) {
    this.canvas=canvas;this.resources=resources;this.map=map;this.brightness=brightness;
    this.engine=globalThis.FERRO.render.create(canvas,{
      resolution:'native',maxPixels,renderScale:1,reflections:false,msaa:0,
      vignette:1,composition:false,cullMargin:0
    });
    if (!this.engine.gl) {this.engine.dispose();throw new Error('Cette version de Doom FERRO nécessite WebGL 2.');}
    this.gl=this.engine.gl;this.stats=this.engine.stats;
    this.stats.host='procedural-e1m1';this.stats.ferroVersion=globalThis.FERRO.version;
    this.engine.resize('low');
    this.engine.setWorld([],[],null);
    this.leaves=buildSubsectorPolygons(map);
    this.textureCache=new Map();this.meshes=new Map();this.spriteMeshes=new Map();
    this.generation=-1;this.sectorHeights='';this.frame={entities:[],time:0};
    this.camera={pos:[0,1.3,0],yaw:0,pitch:0,fov:70,near:.025,far:400};
    this.hook={couleur:(gl,view)=>this._renderPass(gl,view)};
    this._initialize();this._updateMap();
  }

  _initialize() {
    const gl=this.gl;
    this.generation=this.engine.pdr.generation;
    this.worldProgram=this.engine.pdr.programme(WORLD_VERTEX,WORLD_FRAGMENT);
    this.skyProgram=this.engine.pdr.programme(SKY_VERTEX,SKY_FRAGMENT);
    this.uniforms={};this.skyUniforms={};
    for(const n of ['uVP','uTexture','uEye','uTime','uBrightness','uDamage','uFlash']) this.uniforms[n]=gl.getUniformLocation(this.worldProgram,n);
    for(const n of ['uTexture','uForward','uRight','uUp','uFov']) this.skyUniforms[n]=gl.getUniformLocation(this.skyProgram,n);
    this.skyVao=gl.createVertexArray();
    this.textureCache.clear();this.meshes.clear();this.spriteMeshes.clear();this.sectorHeights='';
    this._texture('wall','SKY1');
    for(const name of ['NUKAGE1','NUKAGE2','NUKAGE3'])this._texture('flat',name);
  }

  _texture(kind,name) {
    const key=kind+':'+name;
    if(this.textureCache.has(key))return this.textureCache.get(key);
    const gl=this.gl, texture=gl.createTexture();
    let source=kind==='flat'?this.resources.flat(name):kind==='sprite'?this.resources.patch(name):this.resources.texture(name);
    if(!source){
      source={width:2,height:2,leftOffset:1,topOffset:2,pixels:new Uint8Array([120,100,90,255,80,65,55,255,80,65,55,255,120,100,90,255])};
    }
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,source.pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,kind==='sprite'?gl.CLAMP_TO_EDGE:gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,kind==='sprite'||name==='SKY1'?gl.CLAMP_TO_EDGE:gl.REPEAT);
    const value={texture,...source};this.textureCache.set(key,value);return value;
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
    const groups=buildMapGeometry(this.resources,this.map,this.leaves);
    let triangles=0;
    for(const group of groups){
      const mesh=this._upload(this.meshes,group.key,group.vertices);
      mesh.kind=group.kind;mesh.name=group.name;
      this._texture(group.kind,group.name);triangles+=mesh.count/3;
    }
    this.stats.mapTriangles=triangles;this.stats.mapSubsectors=this.leaves.length;
    this.stats.mapSectors=this.map.sectors.length;
  }

  _animated(name,time) {
    if(/^NUKAGE[1-3]$/.test(name))return 'NUKAGE'+(Math.floor(time*8)%3+1);
    return name;
  }

  _sprites(view) {
    const groups=new Map(),right=view.droite;
    for(const e of this.frame.entities||[]){
      if(e.removed||!e.sprite)continue;
      const dx=e.x*SCALE-view.oeil[0],dz=-e.y*SCALE-view.oeil[2];
      if(dx*view.avant[0]+dz*view.avant[2]<-4)continue;
      const patch=this._texture('sprite',e.sprite),scale=e.scale||1;
      const sector=this.map.sectorAt(e.x,e.y),base=Number.isFinite(e.z)?e.z:sector?.floor||0;
      const top=(base+patch.topOffset*scale)*SCALE,bottom=top-patch.height*scale*SCALE;
      // Mirror around the thing's origin, including asymmetric WAD offsets.
      // Reversing only U makes directional frames jump sideways as they turn.
      const left=-(e.flip?patch.width-patch.leftOffset:patch.leftOffset)*scale*SCALE,width=patch.width*scale*SCALE;
      const x0=e.x*SCALE+right[0]*left,z0=-e.y*SCALE+right[2]*left;
      const x1=x0+right[0]*width,z1=z0+right[2]*width;
      const light=e.fullbright?2:(sector?.light??192)/255;
      const u0=e.flip?1:0,u1=e.flip?0:1;
      let out=groups.get(e.sprite);if(!out){out=[];groups.set(e.sprite,out);}
      for(const p of [[x0,bottom,z0,u0,1],[x1,bottom,z1,u1,1],[x1,top,z1,u1,0],
        [x0,bottom,z0,u0,1],[x1,top,z1,u1,0],[x0,top,z0,u0,0]])out.push(...p,light,0);
    }
    for(const mesh of this.spriteMeshes.values())mesh.count=0;
    for(const [name,values] of groups)this._upload(this.spriteMeshes,name,new Float32Array(values));
    return groups.size;
  }

  _renderPass(gl,view) {
    if(this.generation!==this.engine.pdr.generation)this._initialize();
    this._updateMap();
    const time=this.frame.time||0;
    gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.useProgram(this.skyProgram);gl.bindVertexArray(this.skyVao);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._texture('wall','SKY1').texture);
    const sky=this.skyUniforms;
    gl.uniform1i(sky.uTexture,0);gl.uniform3fv(sky.uForward,view.avant);gl.uniform3fv(sky.uRight,view.droite);gl.uniform3fv(sky.uUp,view.haut);
    gl.uniform2f(sky.uFov,view.tangente*view.largeur/view.hauteur,view.tangente);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    gl.useProgram(this.worldProgram);const u=this.uniforms;
    gl.uniformMatrix4fv(u.uVP,false,view.vp);gl.uniform3fv(u.uEye,view.oeil);gl.uniform1i(u.uTexture,0);
    gl.uniform1f(u.uTime,time);gl.uniform1f(u.uBrightness,this.brightness);
    gl.uniform1f(u.uDamage,this.frame.damage||0);gl.uniform1f(u.uFlash,this.frame.flash||0);
    let calls=1,triangles=1;
    for(const mesh of this.meshes.values()){
      if(!mesh.count)continue;
      gl.bindTexture(gl.TEXTURE_2D,this._texture(mesh.kind,this._animated(mesh.name,time)).texture);
      gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);calls++;triangles+=mesh.count/3;
    }
    this._sprites(view);gl.disable(gl.CULL_FACE);
    for(const [name,mesh] of this.spriteMeshes){
      if(!mesh.count)continue;
      gl.bindTexture(gl.TEXTURE_2D,this._texture('sprite',name).texture);
      gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);calls++;triangles+=mesh.count/3;
    }
    gl.bindVertexArray(null);
    this.stats.generatedTextures=this.textureCache.size;
    return {appels:calls,triangles,instances:this.frame.entities?.length||0};
  }

  draw(camera,frame={}) {
    this.frame=frame;
    this.camera.pos[0]=camera.x*SCALE;this.camera.pos[1]=(camera.z??41)*SCALE;this.camera.pos[2]=-camera.y*SCALE;
    this.camera.yaw=Math.PI/2-(camera.angle||0);this.camera.pitch=camera.pitch||0;
    this.camera.fov=camera.fov||70;
    this.engine.draw(this.camera,[],{time:frame.time||0,bloom:false,shadows:false,reflections:false,
      msaa:false,adaptive:false,groundCover:false,vignette:false,foule:this.hook});
    return this.stats;
  }

  resize(){return this.engine.resize('low');}

  dispose(){
    const gl=this.gl;
    for(const mesh of [...this.meshes.values(),...this.spriteMeshes.values()]){gl.deleteBuffer(mesh.buffer);gl.deleteVertexArray(mesh.vao);}
    for(const texture of this.textureCache.values())gl.deleteTexture(texture.texture);
    gl.deleteVertexArray(this.skyVao);gl.deleteProgram(this.worldProgram);gl.deleteProgram(this.skyProgram);
    this.engine.dispose();
  }
}

export default FerroDoomRenderer;
