#!/usr/bin/env python3
"""Render production procedural resources with surfaceless software EGL.

This is a native shader and geometry probe, not a browser gameplay capture or
a hardware performance test. No browser is installed or driven by this tool.
The JS extractor calls the production geometry/model builders and FERRO camera
helpers. Shader strings are imported unchanged from the production shader module.
The studio and doorway views are explicitly controlled fixtures. They
place a generated actor in the constructed map without simulating a played game
or purporting to reproduce a user-reported encounter.
"""
import argparse
import base64
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import re

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
def source_hashes():
    # Include every current module; new sculpt/surface helpers must not fall out
    # of provenance when the runtime import graph grows.
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted((ROOT / 'src').glob('*.js'))}


EXTRACT = r"""
import fs from 'node:fs';
import {ProceduralResources} from './src/procedural-resources.js';
import {EPISODE_PLANS} from './src/episode-plans.js';
import {DoomGame} from './src/game.js';
import {collectModelBatches,collectShadowBatches,viewWeaponBatch,modelForEntity,MODEL_VERTEX_STRIDE} from './src/procedural-models.js';
import {buildMapGeometry} from './src/ferro-doom-renderer.js';
import {DOOM_SHADERS as shaders} from './src/procedural-shaders.js';
import {surfaceDetail} from './src/procedural-surface-detail.js';
import {buildLightingRig,sceneLighting,studioLighting,weaponShadowProjection} from './src/procedural-lighting.js';
const requestedViews=(process.env.DOOM_QA_VIEWS||'').split(',').filter(Boolean);
const needsWorld=!requestedViews.length||requestedViews.some(n=>n.startsWith('door')||!/(?:-front|-side|-back|-portrait|-detail)$/.test(n));
const resources=new ProceduralResources(),map=resources.map(),game=new DoomGame(map,{skill:2});
const snapshotHeights=()=>map.sectors.map(s=>({floor:s.floor,ceiling:s.ceiling}));
const applyHeights=heights=>map.sectors.forEach((sector,i)=>Object.assign(sector,heights[i]));
const groups=buildMapGeometry(resources,map),textures=new Map(),catalog=new Map();
const BLOB_DIR=process.env.DOOM_QA_BLOBS;
let blobSeq=0;
const bytes=x=>{const raw=Buffer.from(x.buffer,x.byteOffset,x.byteLength);
 if(!BLOB_DIR)return raw.toString('base64');
 const ref='b'+(blobSeq++)+'.b64';fs.writeFileSync(BLOB_DIR+'/'+ref,raw.toString('base64'));return ref;};
// E1M1 is qualified: a missing material there is a regression. The eight other
// surveyed levels still use names the material library has not been written
// for; they render with the same 2x2 placeholder the production renderer uses
// and are reported as a measured gap instead of being silently hidden.
const PLACEHOLDER={width:2,height:2,pixels:new Uint8Array([120,100,90,255,80,65,55,255,80,65,55,255,120,100,90,255])};
const missingMaterials=new Map();
function tex(kind,name,mapId){if(!needsWorld)return;const key=kind+':'+name;let t=kind==='flat'?resources.flat(name):resources.texture(name);
 if(!t){if(!mapId||mapId==='E1M1')throw Error('Missing generated material '+key);
  if(!missingMaterials.has(key))missingMaterials.set(key,[]);if(!missingMaterials.get(key).includes(mapId))missingMaterials.get(key).push(mapId);t=PLACEHOLDER;}
 if(!textures.has(key)){const d=surfaceDetail(kind,name,t);textures.set(key,{key,width:d.width,height:d.height,baseWidth:d.baseWidth,baseHeight:d.baseHeight,heightScale:d.heightScale,pixels:bytes(d.pixels),normalRoughness:bytes(d.normalRoughness),surface:bytes(d.surface)});}}
function pack(batch){if(!batch)return null;const m=batch.mesh;
 if(!catalog.has(m.key))catalog.set(m.key,{key:m.key,vertices:bytes(m.vertices),stride:m.stride,count:m.vertices.length/m.stride,bounds:m.bounds});
 return {key:m.key,instances:bytes(batch.instances),count:batch.count};}
for(const g of groups)tex(g.kind,g.name);
const scenes=[{name:'base',groups,heights:snapshotHeights()}];
const cases=[{name:'spawn-north',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'pistol'},
 {name:'spawn-west',x:1056,y:-3616,z:41,angle:Math.PI,weapon:'shotgun'},
 {name:'courtyard',x:2488,y:-3504,z:-15,angle:Math.PI,weapon:'pistol'},
 {name:'start-hall',x:1110.8979591836735,y:-2957.224489795918,z:41,angle:-Math.PI/2,weapon:'fist'},
 {name:'shotgun-reload',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'shotgun',phase:.3},
 {name:'pistol-fire',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'pistol',phase:.03},
 {name:'shotgun-fire',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'shotgun',phase:.03},
 {name:'fist-punch',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'fist',phase:.12},
 {name:'chaingun-fire',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'chaingun',phase:.03},
 {name:'launcher-fire',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'launcher',phase:.03},
 {name:'chainsaw-swing',x:1056,y:-3616,z:41,angle:Math.PI/2,weapon:'chainsaw',phase:.05}];
// Same generated mesh, fixed actor heading; the camera alone orbits it.
for(const family of ['POSS','SPOS','TROO','SARG','BOSS'])for(const [view,dx,dy,angle] of [
 ['front',0,88,-Math.PI/2],['side',88,0,Math.PI],['back',0,-88,Math.PI/2]]){
 cases.push({name:family.toLowerCase()+'-'+view,x:1056+dx,y:-3616+dy,z:28,angle,studio:true,
  fixture:{scope:'One fixed 3D actor, viewed from independent camera positions; no view-dependent bitmap or mesh substitution.',
   entity:{id:family,base:family,enemy:true,sprite:family+'A1',alive:true,state:'idle',fullbright:true,x:1056,y:-3616,z:0,angle:Math.PI/2}}});
}
// The upper-arm skin and sleeve must stay nested when the elbow moves forward
// to aim. Side and rear views expose intersections hidden by the front view.
for(const family of ['POSS','SPOS','SARG'])for(const [view,dx,dy,angle] of [
 ['side',88,0,Math.PI],['back',0,-88,Math.PI/2]]){
 cases.push({name:family.toLowerCase()+'-attack-'+view,x:1056+dx,y:-3616+dy,z:28,angle,studio:true,
  fixture:{scope:'Production attack pose viewed from the side and rear to inspect the moving upper-arm/sleeve junction.',
   entity:{id:family+'-attack',base:family,enemy:true,sprite:family+'F1',alive:true,state:'attack',fullbright:true,x:1056,y:-3616,z:0,angle:Math.PI/2}}});
}
for(const family of ['POSS','SPOS','TROO','SARG','BOSS']){
 cases.push({name:family.toLowerCase()+'-portrait',x:1062,y:-3589,z:49,angle:Math.atan2(-27,-6),studio:true,
  fixture:{scope:'Close study of actual generated head geometry and procedural surface materials.',
   entity:{id:family,base:family,enemy:true,sprite:family+'A1',alive:true,state:'idle',fullbright:true,x:1056,y:-3616,z:0,angle:Math.PI/2}}});
}
for(const [family,type] of [['BAR1',2035],['COLU',2028],['ELEC',48],['MEDI',2012],['BON1',2014],['BON2',2015],['ARM1',2018],['SBOX',2049],['PLAYW',10],['PLAYN',15],['POL5',24],
 ['BKEY',5],['YKEY',6],['RKEY',13],['BPAK',8],['ROCK',2010],['SOUL',2013],['BROK',2046],['PINS',2024],['SUIT',2025],['PMAP',2026],['PVIS',2045],['CAND',34],
 ['MGUN',2002],['LAUN',2003],['CSAW',2005]]){
 const entity={id:family,type,sprite:family+'A0',fullbright:true,x:1056,y:-3616,z:0,angle:Math.PI/2};
 const mesh=modelForEntity(entity),h=mesh.bounds.max[2],w=Math.max(mesh.bounds.max[0]-mesh.bounds.min[0],mesh.bounds.max[1]-mesh.bounds.min[1]);
 const remains=/^PLAY|^POL5/.test(family);
 const distance=remains?50:Math.max(h*.82,w*.82)+w*.35,dx=distance*.6,dy=distance*.8,z=remains?24:h*.72;
 cases.push({name:family.toLowerCase()+'-detail',x:entity.x+dx,y:entity.y+dy,z,angle:Math.atan2(-dy,-dx),pitch:Math.atan2(h*.5-z,distance),studio:true,
  fixture:{scope:'Close three-quarter view of an actual generated prop; uniform studio sector light.',entity}});
}
const door=game.lines[151],sector=map.sectors[door.back];game._openDoor(door);let ticks=0;
while(game.actions.get(door.back)?.phase==='up'&&ticks<140){game._updateActions(1/70);ticks++;}
if(sector.ceiling-sector.floor<56)throw Error('Door did not open');
const openGroups=buildMapGeometry(resources,map);for(const g of openGroups)tex(g.kind,g.name);
scenes.push({name:'door-open',groups:openGroups,heights:snapshotHeights()});
const points=map.floorPolygons.filter(p=>p.sector===door.back).flatMap(p=>p.points);
const center={x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2};
const doorway={line:door.id,sector:door.back,floor:sector.floor,ceiling:sector.ceiling,endpoints:[{x:door.ax,y:door.ay},{x:door.bx,y:door.by}],center,ticks};
const camera={scene:'door-open',x:door.ax-128,y:center.y,z:41,angle:0};
cases.push({...camera,name:'door151-open',fixture:{scope:'Door opened by production action, empty passage baseline.',door:doorway}});
for(const [pose,angle] of [['front',Math.PI],['side',Math.PI/2]])cases.push({...camera,name:'door151-model-'+pose,
 fixture:{scope:'3D imp deliberately centred in doorway for an occlusion/anchor check; not a reproduced player encounter.',door:doorway,
 entity:{id:'door-model',base:'TROO',enemy:true,sprite:'TROOA1',alive:true,state:'idle',...center,z:sector.floor,angle}}});
// State fixtures use real player actions to move secret-sector geometry. The
// camera is placed for inspection, not presented as a continuous played run.
function secretSnapshots(){
 const qaMap=resources.map(),qa=new DoomGame(qaMap,{skill:2}),snapshots={};
 const place=(x,y,angle)=>{const s=qaMap.sectorAt(x,y);Object.assign(qa.player,{x,y,z:s.floor,sector:s.id,vz:0,angle});};
 const advance=(seconds,input={})=>{for(let n=0;n<Math.ceil(seconds*70);n++)qa.update(1/70,input);};
 const save=name=>snapshots[name]={heights:qaMap.sectors.map(s=>({floor:s.floor,ceiling:s.ceiling})),
  actions:[...qa.actions].map(([id,a])=>({sector:id,...a})),
  player:{x:qa.player.x,y:qa.player.y,z:qa.player.z,sector:qa.player.sector},time:qa.time};
 place(2988,-3840,Math.PI);save('secret68-closed');qa.update(1/70,{use:true});advance(1);save('secret68-open');
 qa.restart();place(3008,-4120,-Math.PI/2);advance(.6,{forward:1});advance(1.2);save('secret69-open');
 place(2896,-2940,-Math.PI/2);advance(.3,{forward:1});advance(1.2);save('secret70-low');
 place(3488,-3872,0);advance(.32,{forward:1});advance(4);save('secret70-high');
 if(snapshots['secret68-open'].heights[68].ceiling!==44||snapshots['secret69-open'].heights[59].floor!==-40||
  snapshots['secret70-low'].heights[70].floor!==-48||snapshots['secret70-high'].heights[70].floor!==104||
  snapshots['secret70-high'].player.z!==104)throw Error('Invalid secret QA state');
 return snapshots;
}
const secretCameras={
 'secret68-closed':{x:2988,y:-3840,z:17,angle:Math.PI},
 'secret68-open':{x:2988,y:-3840,z:17,angle:Math.PI},
 'secret69-open':{x:3424,y:-3856,z:-7,angle:Math.PI},
 'secret70-low':{x:3488,y:-3872,z:-7,angle:0},
 'secret70-high':{x:3648,y:-3808,z:145,angle:Math.PI/2}
};
for(const [name,state]of Object.entries(secretSnapshots())){
 applyHeights(state.heights);const secretGroups=buildMapGeometry(resources,map);for(const g of secretGroups)tex(g.kind,g.name);
 scenes.push({name,groups:secretGroups,heights:state.heights});
 cases.push({name,scene:name,...secretCameras[name],weapon:'pistol',mapEntities:true,
  fixture:{scope:'Inspection camera; secret mechanism operated by real use/crossing/update. Continuous gameplay is verified separately.',state}});
}
// One arrival camera per surveyed level: the real player start of a real game,
// so the eight levels beyond E1M1 are also proven as rendered pixels.
const otherMaps=new Map(),otherGames=new Map();
for(const id of Object.keys(EPISODE_PLANS)){
 const other=resources.map(id),qa=new DoomGame(other,{skill:2}),p=qa.player;
 otherMaps.set(id,other);const name=id.toLowerCase()+'-arrival';otherGames.set(name,qa);
 const groups=buildMapGeometry(resources,other);for(const g of groups)tex(g.kind,g.name,id);
 scenes.push({name,groups,heights:other.sectors.map(s=>({floor:s.floor,ceiling:s.ceiling}))});
 cases.push({name,scene:name,mapId:id,x:p.x,y:p.y,z:p.z+41,angle:p.angle,weapon:'pistol',
  fixture:{scope:`Arrival camera at the generated player start of ${id}; geometry, lighting and models come from the production map build.`}});
}
const requested=(process.env.DOOM_QA_VIEWS||'').split(',').filter(Boolean),wanted=new Set(requested);
for(const name of requested)if(!cases.some(camera=>camera.name===name))throw Error('Unknown QA view: '+name);
if(requested.some(name=>name.startsWith('door151-model-')))wanted.add('door151-open');
const width=1280,height=800,views=[];
for(const camera of cases.filter(camera=>!wanted.size||wanted.has(camera.name))){
  const activeMap=camera.mapId?otherMaps.get(camera.mapId):map;
  if(!camera.mapId)applyHeights(scenes.find(s=>s.name===(camera.scene||'base')).heights);
  const rig=buildLightingRig(activeMap);
 const position=[camera.x/32,camera.z/32,-camera.y/32],axes=FRender.shared.cameraAxes({yaw:Math.PI/2-camera.angle,pitch:camera.pitch||0});
 const r=axes.right,u=axes.up,f=axes.forward;
 const v=new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,
  -(r[0]*position[0]+r[1]*position[1]+r[2]*position[2]),-(u[0]*position[0]+u[1]*position[1]+u[2]*position[2]),f[0]*position[0]+f[1]*position[1]+f[2]*position[2],1]);
 const focal=1/Math.tan(70*Math.PI/360),near=.025,far=400,p=new Float32Array(16),vp=new Float32Array(16);
 p[0]=focal/(width/height);p[5]=focal;p[10]=(far+near)/(near-far);p[11]=-1;p[14]=2*far*near/(near-far);FRender.shared.multiply(p,v,vp);
 const project=(x,y,z)=>{const point=[x/32,z/32,-y/32,1],c=Array.from({length:4},(_,row)=>point.reduce((sum,value,col)=>sum+value*vp[col*4+row],0));return{x:(c[0]/c[3]+1)*width/2,y:(1-c[1]/c[3])*height/2};};
 const entities=camera.fixture&&!camera.mapEntities?(camera.fixture.entity?[camera.fixture.entity]:[]):game.entities;
 const renderView={oeil:position,avant:f,droite:r,haut:u,tangente:1/focal,largeur:width,hauteur:height};
 const batches=collectModelBatches(activeMap,entities,0,renderView),models=batches.map(pack);
 if(camera.fixture?.entity){const e=camera.fixture.entity;camera.fixture.anchorScreen=project(e.x,e.y,e.z);camera.fixture.meshKeys=models.map(m=>m.key);}
 if(camera.fixture?.door){const d=camera.fixture.door;camera.fixture.portalScreen=d.endpoints.flatMap(p=>[project(p.x,p.y,d.floor),project(p.x,p.y,d.ceiling)]);}
 const e=camera.fixture?.entity,target=e?[e.x/32,((e.z||0)+(camera.name.endsWith('portrait')?49:28))/32,-e.y/32]:null;
 const lights=camera.studio?studioLighting(renderView,target):sceneLighting(rig,renderView,entities,0,camera.weapon?{kind:camera.weapon,phase:camera.phase??Infinity}:null);
 const weaponBatch=viewWeaponBatch(camera.weapon?{kind:camera.weapon,phase:camera.phase??Infinity}:null,0);
 if(weaponBatch)lights.weaponShadowVP=Array.from(weaponShadowProjection(lights.positions.subarray(0,3),renderView,weaponBatch));
 const shadowModels=(camera.studio?batches:collectShadowBatches(activeMap,entities,0,lights,batches)).map(pack);
 const lighting={...lights,positions:Array.from(lights.positions),colors:Array.from(lights.colors),shadowVP:Array.from(lights.shadowVP)};
 views.push({scene:'base',...camera,position,right:r,up:u,forward:f,tangent:1/focal,vp:Array.from(vp),models,visibility:batches.summary,lighting,shadowModels,
  weaponModel:pack(weaponBatch)});
}
console.log(JSON.stringify({width,height,missingMaterials:[...missingMaterials].map(([name,maps])=>({name,maps})),shaders,models:[...catalog.values()],scenes:scenes.map(s=>({name:s.name,groups:s.groups.map(g=>({key:g.key,vertices:bytes(g.vertices),count:g.vertices.length/7}))})),textures:[...textures.values()],views,
 engineVersion:FERRO.version,sectors:map.sectors.length,subsectors:map.subsectors.length,mapGenerator:map.generator,resources:resources.stats(),modelVertexStride:MODEL_VERTEX_STRIDE}));
"""


class Context:
    def __init__(self, width, height):
        os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE', '1')
        os.environ.setdefault('LP_NUM_THREADS', '1')
        self.egl=C.CDLL('libEGL.so.1');self.gl=C.CDLL('libGL.so.1')
        self.ef('eglGetProcAddress',C.c_void_p,C.c_char_p)
        display=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(self.egl.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
        self.display=display(0x31DD,None,None);major=C.c_int();minor=C.c_int()
        self.ef('eglInitialize',C.c_uint,C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int))
        assert self.egl.eglInitialize(self.display,C.byref(major),C.byref(minor)),'EGL initialization'
        self.ef('eglBindAPI',C.c_uint,C.c_uint);assert self.egl.eglBindAPI(0x30A2),'OpenGL API'
        self.ef('eglChooseConfig',C.c_uint,C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int))
        attrs=(C.c_int*13)(0x3033,1,0x3040,8,0x3024,8,0x3023,8,0x3022,8,0x3025,24,0x3038)
        config=C.c_void_p();count=C.c_int()
        assert self.egl.eglChooseConfig(self.display,attrs,C.byref(config),1,C.byref(count)) and count.value,'EGL config'
        self.ef('eglCreatePbufferSurface',C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))
        self.surface=self.egl.eglCreatePbufferSurface(self.display,config,(C.c_int*5)(0x3057,width,0x3056,height,0x3038))
        self.ef('eglCreateContext',C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int))
        self.context=self.egl.eglCreateContext(self.display,config,None,(C.c_int*5)(0x3098,3,0x30FB,3,0x3038))
        self.ef('eglMakeCurrent',C.c_uint,C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p)
        assert self.egl.eglMakeCurrent(self.display,self.surface,self.surface,self.context),'EGL current'
        self.width=width;self.height=height
        for name,result,args in [
            ('glGetString',C.c_char_p,[C.c_uint]),('glGetError',C.c_uint,[]),
            ('glCreateShader',C.c_uint,[C.c_uint]),
            ('glShaderSource',None,[C.c_uint,C.c_int,C.POINTER(C.c_char_p),C.POINTER(C.c_int)]),
            ('glCompileShader',None,[C.c_uint]),('glGetShaderiv',None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)]),
            ('glGetShaderInfoLog',None,[C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_char_p]),
            ('glCreateProgram',C.c_uint,[]),('glAttachShader',None,[C.c_uint,C.c_uint]),('glLinkProgram',None,[C.c_uint]),
            ('glGetProgramiv',None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)]),
            ('glGetProgramInfoLog',None,[C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_char_p]),
            ('glUseProgram',None,[C.c_uint]),('glGenVertexArrays',None,[C.c_int,C.POINTER(C.c_uint)]),
            ('glBindVertexArray',None,[C.c_uint]),('glGenBuffers',None,[C.c_int,C.POINTER(C.c_uint)]),
            ('glBindBuffer',None,[C.c_uint,C.c_uint]),('glBufferData',None,[C.c_uint,C.c_ssize_t,C.c_void_p,C.c_uint]),
            ('glEnableVertexAttribArray',None,[C.c_uint]),
            ('glVertexAttribPointer',None,[C.c_uint,C.c_int,C.c_uint,C.c_ubyte,C.c_int,C.c_void_p]),
            ('glGenTextures',None,[C.c_int,C.POINTER(C.c_uint)]),('glBindTexture',None,[C.c_uint,C.c_uint]),
            ('glActiveTexture',None,[C.c_uint]),('glPixelStorei',None,[C.c_uint,C.c_int]),
            ('glTexImage2D',None,[C.c_uint,C.c_int,C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p]),
            ('glTexParameteri',None,[C.c_uint,C.c_uint,C.c_int]),('glGetUniformLocation',C.c_int,[C.c_uint,C.c_char_p]),
            ('glUniform1i',None,[C.c_int,C.c_int]),('glUniform1f',None,[C.c_int,C.c_float]),
            ('glUniform2f',None,[C.c_int,C.c_float,C.c_float]),('glUniform3f',None,[C.c_int,C.c_float,C.c_float,C.c_float]),
            ('glUniformMatrix4fv',None,[C.c_int,C.c_int,C.c_ubyte,C.POINTER(C.c_float)]),
            ('glUniform4fv',None,[C.c_int,C.c_int,C.POINTER(C.c_float)]),
            ('glGenerateMipmap',None,[C.c_uint]),
            ('glGenFramebuffers',None,[C.c_int,C.POINTER(C.c_uint)]),('glBindFramebuffer',None,[C.c_uint,C.c_uint]),
            ('glFramebufferTexture2D',None,[C.c_uint,C.c_uint,C.c_uint,C.c_uint,C.c_int]),
            ('glCheckFramebufferStatus',C.c_uint,[C.c_uint]),('glDrawBuffers',None,[C.c_int,C.POINTER(C.c_uint)]),('glReadBuffer',None,[C.c_uint]),
            ('glViewport',None,[C.c_int,C.c_int,C.c_int,C.c_int]),('glClearColor',None,[C.c_float,C.c_float,C.c_float,C.c_float]),
            ('glClear',None,[C.c_uint]),('glEnable',None,[C.c_uint]),('glDisable',None,[C.c_uint]),
            ('glDepthMask',None,[C.c_ubyte]),('glDepthFunc',None,[C.c_uint]),('glCullFace',None,[C.c_uint]),
            ('glDrawArrays',None,[C.c_uint,C.c_int,C.c_int]),
            ('glDrawArraysInstanced',None,[C.c_uint,C.c_int,C.c_int,C.c_int]),
            ('glVertexAttribDivisor',None,[C.c_uint,C.c_uint]),
            ('glReadPixels',None,[C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p]),
        ]:self.fn(name,result,*args)
        self.info={'renderer':self.gl.glGetString(0x1F01).decode(),'version':self.gl.glGetString(0x1F02).decode(),'egl':f'{major.value}.{minor.value}'}

    def ef(self,name,result,*args):
        f=getattr(self.egl,name);f.restype=result;f.argtypes=list(args)

    def fn(self,name,result,*args):
        f=getattr(self.gl,name);f.restype=result;f.argtypes=list(args)

    def program(self,vertex,fragment):
        g=self.gl;program=g.glCreateProgram()
        for stage,source in [(0x8B31,vertex),(0x8B30,fragment)]:
            shader=g.glCreateShader(stage);encoded=C.c_char_p(source.encode())
            g.glShaderSource(shader,1,C.byref(encoded),None);g.glCompileShader(shader)
            valid=C.c_int();g.glGetShaderiv(shader,0x8B81,C.byref(valid))
            if not valid.value:
                log=C.create_string_buffer(65536);g.glGetShaderInfoLog(shader,len(log),None,log);raise AssertionError(log.value.decode())
            g.glAttachShader(program,shader)
        g.glLinkProgram(program);valid=C.c_int();g.glGetProgramiv(program,0x8B82,C.byref(valid))
        if not valid.value:
            log=C.create_string_buffer(65536);g.glGetProgramInfoLog(program,len(log),None,log);raise AssertionError(log.value.decode())
        return program

    def texture(self,texture):
        g=self.gl;handles={}
        for key in ['pixels','normalRoughness','surface']:
            handle=C.c_uint();g.glGenTextures(1,C.byref(handle));g.glBindTexture(0x0DE1,handle)
            pixels=base64.b64decode(texture[key]);data=C.create_string_buffer(pixels)
            g.glPixelStorei(0x0CF5,1);g.glTexImage2D(0x0DE1,0,0x8058,texture['width'],texture['height'],0,0x1908,0x1401,data)
            g.glTexParameteri(0x0DE1,0x2800,0x2601);g.glTexParameteri(0x0DE1,0x2801,0x2703)
            g.glTexParameteri(0x0DE1,0x2802,0x2901);g.glTexParameteri(0x0DE1,0x2803,0x2901);g.glGenerateMipmap(0x0DE1)
            handles[key]=handle.value
        return {**handles,'heightUV':[texture['heightScale']/texture['baseWidth'],texture['heightScale']/texture['baseHeight']]}

    def target(self,width,height,depth_only=False):
        g=self.gl;fb=C.c_uint();g.glGenFramebuffers(1,C.byref(fb));g.glBindFramebuffer(0x8D40,fb)
        def allocate(depth,attachment=0x8CE0):
            t=C.c_uint();g.glGenTextures(1,C.byref(t));g.glBindTexture(0x0DE1,t)
            g.glTexImage2D(0x0DE1,0,0x81A6 if depth else 0x8058,width,height,0,0x1902 if depth else 0x1908,0x1405 if depth else 0x1401,None)
            for name in [0x2800,0x2801]:g.glTexParameteri(0x0DE1,name,0x2600 if depth else 0x2601)
            for name in [0x2802,0x2803]:g.glTexParameteri(0x0DE1,name,0x812F)
            if depth_only:
                g.glTexParameteri(0x0DE1,0x884C,0x884E);g.glTexParameteri(0x0DE1,0x884D,0x0203)
                for name in [0x2800,0x2801]:g.glTexParameteri(0x0DE1,name,0x2601)
            g.glFramebufferTexture2D(0x8D40,0x8D00 if depth else attachment,0x0DE1,t,0)
            return t.value
        depth=allocate(True);color=None if depth_only else allocate(False);normal=None if depth_only else allocate(False,0x8CE1)
        attachments=[0] if depth_only else [0x8CE0,0x8CE1];g.glDrawBuffers(len(attachments),(C.c_uint*len(attachments))(*attachments));g.glReadBuffer(attachments[0])
        assert g.glCheckFramebufferStatus(0x8D40)==0x8CD5,'Incomplete framebuffer'
        return {'framebuffer':fb.value,'depth':depth,'color':color,'normal':normal}

    def mesh(self,mesh):
        g=self.gl;vao=C.c_uint();buffer=C.c_uint();g.glGenVertexArrays(1,C.byref(vao));g.glBindVertexArray(vao)
        g.glGenBuffers(1,C.byref(buffer));g.glBindBuffer(0x8892,buffer)
        data=C.create_string_buffer(base64.b64decode(mesh['vertices']));g.glBufferData(0x8892,len(data)-1,data,0x88E4)
        for index,size,offset in [(0,3,0),(1,2,12),(2,1,20),(3,1,24)]:
            g.glEnableVertexAttribArray(index);g.glVertexAttribPointer(index,size,0x1406,0,28,C.c_void_p(offset))
        return {**mesh,'vao':vao.value,'buffer':buffer.value}

    def model(self,model):
        g=self.gl;vao=C.c_uint();vertex=C.c_uint();instances=C.c_uint()
        g.glGenVertexArrays(1,C.byref(vao));g.glBindVertexArray(vao)
        g.glGenBuffers(1,C.byref(vertex));g.glBindBuffer(0x8892,vertex)
        data=C.create_string_buffer(base64.b64decode(model['vertices']));g.glBufferData(0x8892,len(data)-1,data,0x88E4)
        for index,size,offset in [(0,3,0),(1,3,12),(2,3,24),(3,1,36),(4,4,40),(5,3,56)]:
            g.glEnableVertexAttribArray(index);g.glVertexAttribPointer(index,size,0x1406,0,model['stride']*4,C.c_void_p(offset))
        g.glGenBuffers(1,C.byref(instances));g.glBindBuffer(0x8892,instances)
        for index,offset in [(6,0),(7,16)]:
            g.glEnableVertexAttribArray(index);g.glVertexAttribPointer(index,4,0x1406,0,32,C.c_void_p(offset));g.glVertexAttribDivisor(index,1)
        return {**model,'vao':vao.value,'buffer':vertex.value,'instancesBuffer':instances.value}

    def draw_model(self,model,batch):
        g=self.gl;g.glBindVertexArray(model['vao']);g.glBindBuffer(0x8892,model['instancesBuffer'])
        data=C.create_string_buffer(base64.b64decode(batch['instances']));g.glBufferData(0x8892,len(data)-1,data,0x88E8)
        g.glDrawArraysInstanced(4,0,model['count'],batch['count'])

    def render(self,programs,textures,meshes,models,view):
        g=self.gl;world,sky,model_program,shadow,post=programs
        if not hasattr(self,'scene'):
            self.scene=self.target(self.width,self.height);self.shadow=self.target(1024,1024,True);self.weapon_shadow=self.target(512,512,True)
            self.screen=C.c_uint();g.glGenVertexArrays(1,C.byref(self.screen))
        lighting=view['lighting']
        def axes(program):
            for name,key in [('uEye','position'),('uRight','right'),('uForward','forward'),('uUp','up')]:
                g.glUniform3f(g.glGetUniformLocation(program,name.encode()),*view[key])
        def uniforms(program,ao=True):
            loc=lambda n:g.glGetUniformLocation(program,n.encode());axes(program)
            g.glUniformMatrix4fv(loc('uVP'),1,0,(C.c_float*16)(*view['vp']))
            g.glUniformMatrix4fv(loc('uShadowVP'),1,0,(C.c_float*16)(*lighting['shadowVP']))
            g.glUniform4fv(loc('uLights[0]'),6,(C.c_float*24)(*lighting['positions']))
            g.glUniform4fv(loc('uLightColors[0]'),6,(C.c_float*24)(*lighting['colors']))
            for name,value in [('uTime',0),('uBrightness',1.2),('uDamage',0),('uFlash',0),('uAmbient',lighting['ambient']),('uOutdoor',lighting['outdoor']),('uFogDensity',lighting['fogDensity'])]:g.glUniform1f(loc(name),value)
            g.glUniform3f(loc('uFogColor'),*lighting['fogColor'])
            for name,value in [('uShadow',3),('uShadowEnabled',0 if os.environ.get('DOOM_QA_NO_SHADOWS') else 1),('uAOOutput',int(ao)),('uLightCount',lighting['count'])]:g.glUniform1i(loc(name),value)
            g.glUniform1i(loc('uSelfShadow'),4);g.glUniform1i(loc('uSelfShadowEnabled'),int(not ao and 'weaponShadowVP' in lighting));
            g.glUniformMatrix4fv(loc('uSelfShadowVP'),1,0,(C.c_float*16)(*lighting.get('weaponShadowVP',lighting['shadowVP'])));g.glUniform2f(loc('uSelfShadowTexel'),1/512,1/512)
            g.glActiveTexture(0x84C4);g.glBindTexture(0x0DE1,self.weapon_shadow['depth'])
            g.glUniform2f(loc('uShadowTexel'),1/1024,1/1024);g.glActiveTexture(0x84C3);g.glBindTexture(0x0DE1,self.shadow['depth'])
        def shadow_pass(weapon=None):
            g.glActiveTexture(0x84C3);g.glBindTexture(0x0DE1,0)
            g.glActiveTexture(0x84C4);g.glBindTexture(0x0DE1,0)
            target=self.weapon_shadow if weapon else self.shadow;size=512 if weapon else 1024
            g.glBindFramebuffer(0x8D40,target['framebuffer']);g.glViewport(0,0,size,size)
            g.glEnable(0x0B71);g.glDepthMask(1);g.glDepthFunc(0x0203);g.glDisable(0x0B44);g.glDisable(0x0BE2)
            g.glClear(0x0100)
            g.glUseProgram(shadow);loc=lambda n:g.glGetUniformLocation(shadow,n.encode());axes(shadow)
            g.glUniformMatrix4fv(loc('uVP'),1,0,(C.c_float*16)(*lighting['weaponShadowVP' if weapon else 'shadowVP']));g.glUniform1f(loc('uTime'),0);g.glUniform1i(loc('uTexture'),0)
            if weapon is None and not view.get('studio'):
                g.glUniform1i(loc('uModel'),0);g.glUniform1i(loc('uViewModel'),0);g.glUniform1i(loc('uAlphaTest'),1)
                for mesh in meshes:
                    g.glActiveTexture(0x84C0);g.glBindTexture(0x0DE1,textures[mesh['key']]['pixels']);g.glBindVertexArray(mesh['vao']);g.glDrawArrays(4,0,mesh['count'])
            g.glUniform1i(loc('uModel'),1);g.glUniform1i(loc('uViewModel'),int(weapon is not None));g.glUniform1i(loc('uAlphaTest'),0)
            for batch in [weapon] if weapon else view['shadowModels']:self.draw_model(models[batch['key']],batch)
        shadow_pass()
        g.glBindFramebuffer(0x8D40,self.scene['framebuffer']);g.glViewport(0,0,self.width,self.height)
        g.glDepthMask(1);g.glClearColor(.07,.08,.09,0);g.glClear(0x4000|0x0100)
        g.glDisable(0x0B71);g.glDisable(0x0B44);g.glDisable(0x0BE2);g.glDepthMask(0)
        if not view.get('studio'):
            g.glUseProgram(sky);loc=lambda name:g.glGetUniformLocation(sky,name.encode());axes(sky)
            g.glUniform2f(loc('uFov'),view['tangent']*self.width/self.height,view['tangent']);g.glUniform1f(loc('uTime'),0)
            g.glBindVertexArray(self.screen);g.glDrawArrays(4,0,3)
        g.glEnable(0x0B71);g.glDepthMask(1);g.glDepthFunc(0x0203);g.glEnable(0x0B44);g.glCullFace(0x0405)
        if not view.get('studio'):
            g.glUseProgram(world);loc=lambda name:g.glGetUniformLocation(world,name.encode());uniforms(world)
            for name,value in [('uTexture',0),('uNormalRoughness',1),('uSurface',2),('uRelief',1)]:g.glUniform1i(loc(name),value)
            for mesh in meshes:
                material=textures[mesh['key']]
                for i,key in enumerate(['pixels','normalRoughness','surface']):g.glActiveTexture(0x84C0+i);g.glBindTexture(0x0DE1,material[key])
                g.glUniform2f(loc('uHeightUV'),*material['heightUV']);g.glBindVertexArray(mesh['vao']);g.glDrawArrays(4,0,mesh['count'])
        g.glUseProgram(model_program);uniforms(model_program);g.glUniform1i(g.glGetUniformLocation(model_program,b'uViewModel'),0)
        for batch in view['models']:self.draw_model(models[batch['key']],batch)
        g.glBindFramebuffer(0x8D40,0);g.glViewport(0,0,self.width,self.height);g.glDisable(0x0B71);g.glDepthMask(0);g.glDisable(0x0B44)
        g.glUseProgram(post);g.glBindVertexArray(self.screen);loc=lambda name:g.glGetUniformLocation(post,name.encode())
        for i,(name,key) in enumerate([('uScene','color'),('uDepth','depth'),('uNormal','normal')]):
            g.glActiveTexture(0x84C0+i);g.glBindTexture(0x0DE1,self.scene[key]);g.glUniform1i(loc(name),i)
        axes(post);g.glUniform2f(loc('uPixel'),1/self.width,1/self.height);g.glUniform2f(loc('uFov'),view['tangent']*self.width/self.height,view['tangent'])
        g.glUniform2f(loc('uNearFar'),.025,400);g.glUniform1i(loc('uContactAO'),0 if os.environ.get('DOOM_QA_NO_AO') else 1);g.glDrawArrays(4,0,3)
        if view.get('weaponModel'):
            batch=view['weaponModel'];shadow_pass(batch)
            g.glBindFramebuffer(0x8D40,0);g.glViewport(0,0,self.width,self.height);g.glEnable(0x0B71);g.glDepthMask(1);g.glClear(0x0100);g.glEnable(0x0B44);g.glCullFace(0x0405)
            g.glUseProgram(model_program);uniforms(model_program,False);g.glUniform1i(g.glGetUniformLocation(model_program,b'uViewModel'),1)
            self.draw_model(models[batch['key']],batch)
        pixels=np.empty((self.height,self.width,4),dtype=np.uint8)
        g.glReadPixels(0,0,self.width,self.height,0x1908,0x1401,pixels.ctypes.data_as(C.c_void_p))
        error=g.glGetError();assert error==0,f'OpenGL error {error:#x}'
        return np.flipud(pixels[:,:,:3]).copy()


BLOB_REF=re.compile(r'b\d+\.b64')


def resolve_blobs(node,blobs):
    if isinstance(node,dict): return {k:resolve_blobs(v,blobs) for k,v in node.items()}
    if isinstance(node,list): return [resolve_blobs(v,blobs) for v in node]
    if isinstance(node,str) and BLOB_REF.fullmatch(node):
        return (Path(blobs)/node).read_text()
    return node


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'docs/qa')
    parser.add_argument('--views',default='',help='Comma-separated view names for focused visual iteration; omit for full qualification.')
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    initial_hashes=source_hashes()
    blobs=tempfile.mkdtemp(prefix='doom-qa-blobs-')
    extraction=subprocess.run(['node','--input-type=module','-e',EXTRACT],cwd=ROOT,text=True,capture_output=True,env={**os.environ,'DOOM_QA_VIEWS':args.views,'DOOM_QA_BLOBS':blobs})
    if extraction.returncode:
        raise SystemExit('Production model extraction failed:\n'+extraction.stderr)
    data=resolve_blobs(json.loads(extraction.stdout),blobs)
    shutil.rmtree(blobs,ignore_errors=True)
    context=Context(data['width'],data['height']);s=data['shaders']
    world=context.program(s['WORLD_VERTEX'],s['WORLD_FRAGMENT']);sky=context.program(s['SKY_VERTEX'],s['SKY_FRAGMENT'])
    model_program=context.program(s['MODEL_VERTEX'],s['MODEL_FRAGMENT'])
    shadow=context.program(s['SHADOW_VERTEX'],s['SHADOW_FRAGMENT']);post=context.program(s['POST_VERTEX'],s['POST_FRAGMENT'])
    programs=(world,sky,model_program,shadow,post);models={m['key']:context.model(m) for m in data['models']}
    textures={t['key']:context.texture(t) for t in data['textures']}
    meshes={scene['name']:[context.mesh(m) for m in scene['groups']] for scene in data['scenes']}
    results=[];rendered={}
    for view in data['views']:
        pixels=context.render(programs,textures,meshes[view['scene']],models,view);path=args.output/(view['name']+'-egl.png');Image.fromarray(pixels).save(path)
        rendered[view['name']]=pixels
        unique=np.unique(pixels.reshape(-1,3),axis=0).shape[0];assert unique>(30 if view.get('studio') else 500),'Expected visible shaded geometry'
        result={'name':view['name'],'image':path.name,'camera':{k:view.get(k,0) for k in ['x','y','z','angle','pitch']},'uniqueColors':unique,'meanRGB':pixels.mean(axis=(0,1)).tolist(),
            'visibility':view['visibility'],'submittedModelTriangles':sum(models[batch['key']]['count']//3*batch['count'] for batch in view['models'])}
        if 'fixture' in view:result['fixture']=view['fixture']
        if view['name'].startswith('door151-model-'):
            # Difference against an identical camera/geometry baseline isolates
            # the visible actor, without relying on a colour or aesthetic threshold.
            mask=np.any(pixels!=rendered['door151-open'],axis=2)
            ys,xs=np.where(mask);assert len(xs)>100,'The centred actor must be visible through the opened doorway'
            portal=view['fixture']['portalScreen'];left=min(point['x'] for point in portal);right=max(point['x'] for point in portal)
            anchor=view['fixture']['anchorScreen'];assert left<anchor['x']<right,'Actor origin must be inside the opening'
            inside=(xs>=np.floor(left)-1)&(xs<=np.ceil(right)+1)
            assert np.count_nonzero(inside)>100,'Actor must visibly change pixels inside the opening; shadows may extend outside it'
            result['fixture']['visibleActor']={'pixels':int(len(xs)),'boundsXY':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],
                'centroidXY':[float(xs.mean()),float(ys.mean())],
                'pixelsInsideOpening':int(np.count_nonzero(inside)),
                'check':'Actor and shadow differences from the identical open-door baseline. Actor anchor and visible changes inside the opening checked; shadows can extend beyond jambs. Not a combat or AI test.'}
        results.append(result)
    assert source_hashes()==initial_hashes,'Production sources changed while rendering; rerun before reporting a valid snapshot'
    report={'passed':True,'scope':'Native llvmpipe EGL renders of unchanged production host shaders, procedurally constructed map/materials and instanced 3D models and FERRO camera helpers. No WAD or reference asset is loaded. Not a browser gameplay capture, full FERRO frame execution, or hardware FPS measurement.',
        'diagnosticOverrides':{'shadowsDisabled':bool(os.environ.get('DOOM_QA_NO_SHADOWS')),'contactAODisabled':bool(os.environ.get('DOOM_QA_NO_AO'))},
        'environment':context.info,'size':[data['width'],data['height']],'ferroVersion':data['engineVersion'],'sectors':data['sectors'],'subsectors':data['subsectors'],
        'mapGenerator':data['mapGenerator'],'resources':data['resources'],'modelMeshes':len(models),'worldBillboards':0,
        'modelVertexStride':data['modelVertexStride'],'materialCoordinates':'primitive-local surface coordinates preserved through pose transforms',
        'shaderCompilation':'10 unmodified GLSL ES 3.00 production shaders compiled; 5 programs linked',
        'missingMaterials':data['missingMaterials'],
        'passes':['1024px primary-light depth shadow with 3x3 PCF','linear-light GGX/Smith/Schlick world and model materials','procedural HD albedo, tangent normal, roughness, metallic, AO, emission and height','scene color/smooth-normal/depth targets','12-sample screen contact AO and edge filtering','512px fitted view-weapon self-shadow combined with room shadow','analytic distance haze; disabled in model studios'],
        'textureMipBytes':sum(t['width']*t['height']*12*4//3 for t in data['textures']),'mapTriangles':sum(m['count']//3 for m in data['scenes'][0]['groups']),
        'sceneTriangles':{scene['name']:sum(m['count']//3 for m in scene['groups']) for scene in data['scenes']},
        'adapterSha256':initial_hashes['src/ferro-doom-renderer.js'],'sourceSha256':initial_hashes,
        'shaderSha256':{name:hashlib.sha256(code.encode()).hexdigest() for name,code in s.items()},'cases':results}
    (args.output/'egl-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
