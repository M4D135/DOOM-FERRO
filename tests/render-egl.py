#!/usr/bin/env python3
"""Render production procedural resources with surfaceless software EGL.

This is a native shader and geometry probe, not a browser gameplay capture or
a hardware performance test. No browser is installed or driven by this tool.
The JS extractor calls the production geometry/sprite builders and FERRO camera
helpers. Shader strings are read unchanged from the production host adapter.
The sprite-anchor and doorway views are explicitly controlled fixtures. They
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

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = [
    'src/procedural-resources.js', 'src/procedural-map.js', 'src/e1m1-plan.js',
    'src/procedural-materials.js', 'src/procedural-sprites.js', 'src/procedural-raster.js',
    'src/game.js', 'src/ferro-doom-renderer.js'
]


def source_hashes():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCE_FILES}

EXTRACT = r"""
import fs from 'node:fs';
import {ProceduralResources} from './src/procedural-resources.js';
import {DoomGame} from './src/game.js';
import {FerroDoomRenderer,buildSubsectorPolygons,buildMapGeometry} from './src/ferro-doom-renderer.js';
const source=fs.readFileSync('src/ferro-doom-renderer.js','utf8');
const shaders={};for(const name of ['WORLD_VERTEX','WORLD_FRAGMENT','SKY_VERTEX','SKY_FRAGMENT']){
  const match=source.match(new RegExp('const '+name+'\\s*=\\s*`([\\s\\S]*?)`;'));
  if(!match)throw Error('Shader not found '+name);shaders[name]=match[1];
}
const resources=new ProceduralResources(),map=resources.map(),game=new DoomGame(map,{skill:2});
if(!map.procedural||map.nodes.length)throw Error('Expected a generated map, without imported BSP.');
const groups=buildMapGeometry(resources,map),textures=new Map();
const bytes=x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength).toString('base64');
function tex(kind,name){const key=kind+':'+name;let t=kind==='flat'?resources.flat(name):kind==='sprite'?resources.patch(name):resources.texture(name);
if(!t)throw Error('Missing texture '+key);if(!textures.has(key))textures.set(key,{key,width:t.width,height:t.height,pixels:bytes(t.pixels)});return t;}
for(const group of groups)tex(group.kind,group.name);tex('wall','SKY1');
const scenes=[{name:'base',groups}];
const cases=[{name:'spawn-north',x:1056,y:-3616,z:41,angle:Math.PI/2},
  {name:'spawn-west',x:1056,y:-3616,z:41,angle:Math.PI},
  {name:'courtyard',x:2488,y:-3504,z:-15,angle:Math.PI},
  {name:'start-hall',x:1110.8979591836735,y:-2957.224489795918,z:41,angle:-Math.PI/2}];
for(const flip of [false,true])cases.push({
  name:flip?'sprite-anchor-mirrored':'sprite-anchor-normal',x:1056,y:-3616,z:41,angle:Math.PI/2,
  fixture:{scope:'Isolated procedurally generated sprite anchor fixture; not a played game.',
    entity:{sprite:'TROOH2H8',x:1056,y:-3520,z:0,flip,scale:1,fullbright:false}}
});

// Exercise the real door action in an isolated fixture. No traversal or combat
// is inferred from these still images, and the ordinary views keep the closed mesh.
const door=game.lines[151],doorSector=map.sectors[door.back];
const action=game._openDoor(door);let openingTicks=0;
while(game.actions.get(door.back)?.phase==='up'&&openingTicks<140){game._updateActions(1/70);openingTicks++;}
if(!action||game.actions.get(door.back)?.phase!=='wait'||doorSector.ceiling-doorSector.floor<56)throw Error('Door fixture did not open.');
const openGroups=buildMapGeometry(resources,map);
for(const group of openGroups)tex(group.kind,group.name);
scenes.push({name:'door-open',groups:openGroups});
const doorCells=map.floorPolygons.filter(cell=>cell.sector===door.back),points=doorCells.flatMap(cell=>cell.points);
const center={x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,
  y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2};
const doorway={line:door.id,sector:door.back,floor:doorSector.floor,ceiling:doorSector.ceiling,
  endpoints:[{x:door.ax,y:door.ay},{x:door.bx,y:door.by}],center,openingTicks,stepSeconds:1/70};
const doorCamera={scene:'door-open',x:door.ax-128,y:center.y,z:41,angle:0};
cases.push({...doorCamera,name:'door151-open',fixture:{scope:'Door 151 opened with the production door action; actors omitted for a rendering baseline.',door:doorway}});
for(const flip of [false,true])cases.push({...doorCamera,name:flip?'door151-actor-mirrored':'door151-actor-normal',
  fixture:{scope:'Generated actor placed at the centre of the open doorway for a controlled anchor check. Not a reproduced gameplay encounter.',door:doorway,
    entity:{sprite:'TROOH2H8',...center,z:doorSector.floor,flip,scale:1,fullbright:false}}});

const width=640,height=400,views=[];
for(const camera of cases){
const position=[camera.x/32,camera.z/32,-camera.y/32],axes=FRender.shared.cameraAxes({yaw:Math.PI/2-camera.angle,pitch:0});
const r=axes.right,u=axes.up,f=axes.forward;
const view=new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,
 -(r[0]*position[0]+r[1]*position[1]+r[2]*position[2]),-(u[0]*position[0]+u[1]*position[1]+u[2]*position[2]),f[0]*position[0]+f[1]*position[1]+f[2]*position[2],1]);
const focal=1/Math.tan(70*Math.PI/360),near=.025,far=400,p=new Float32Array(16),vp=new Float32Array(16);
p[0]=focal/(width/height);p[5]=focal;p[10]=(far+near)/(near-far);p[11]=-1;p[14]=2*far*near/(near-far);FRender.shared.multiply(p,view,vp);
const v={oeil:position,droite:r,haut:u,avant:f,tangente:1/focal,largeur:width,hauteur:height,vp};
const adapter=Object.create(FerroDoomRenderer.prototype);adapter.frame={entities:camera.fixture?(camera.fixture.entity?[camera.fixture.entity]:[]):game.entities,time:0};adapter.map=map;adapter.spriteMeshes=new Map();adapter._texture=tex;
adapter._upload=(collection,key,vertices)=>{collection.set(key,{name:key,vertices});};adapter._sprites(v);
const project=(x,y,z)=>{
  const point=[x/32,z/32,-y/32,1],clip=Array.from({length:4},(_,row)=>point.reduce((sum,value,col)=>sum+value*vp[col*4+row],0));
  return {x:(clip[0]/clip[3]+1)*width/2,y:(1-clip[1]/clip[3])*height/2};
};
if(camera.fixture?.entity){
  const fixture=camera.fixture,e=fixture.entity,patch=resources.patch(e.sprite),vertices=adapter.spriteMeshes.get(e.sprite).vertices;
  const offsets=[];for(let i=0;i<vertices.length;i+=7)offsets.push(((vertices[i]-e.x/32)*r[0]+(vertices[i+2]+e.y/32)*r[2])*32);
  fixture.patch={width:patch.width,height:patch.height,leftOffset:patch.leftOffset,topOffset:patch.topOffset};
  fixture.horizontalBoundsDoom=[Math.min(...offsets),Math.max(...offsets)];
  fixture.anchorScreen=project(e.x,e.y,e.z);
}
if(camera.fixture?.door){
  const d=camera.fixture.door;
  camera.fixture.portalScreen=d.endpoints.flatMap(point=>[project(point.x,point.y,d.floor),project(point.x,point.y,d.ceiling)]);
}
views.push({scene:'base',...camera,position,right:r,up:u,forward:f,tangent:1/focal,vp:Array.from(vp),sprites:[...adapter.spriteMeshes].map(([name,m])=>({key:'sprite:'+name,vertices:bytes(m.vertices),count:m.vertices.length/7}))});
}
console.log(JSON.stringify({width,height,shaders,scenes:scenes.map(scene=>({name:scene.name,groups:scene.groups.map(g=>({key:g.key,vertices:bytes(g.vertices),count:g.vertices.length/7}))})),textures:[...textures.values()],views,
engineVersion:FERRO.version,sectors:map.sectors.length,subsectors:map.subsectors.length,mapGenerator:map.generator,resources:resources.stats()}));
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
            ('glViewport',None,[C.c_int,C.c_int,C.c_int,C.c_int]),('glClearColor',None,[C.c_float,C.c_float,C.c_float,C.c_float]),
            ('glClear',None,[C.c_uint]),('glEnable',None,[C.c_uint]),('glDisable',None,[C.c_uint]),
            ('glDepthMask',None,[C.c_ubyte]),('glDepthFunc',None,[C.c_uint]),('glCullFace',None,[C.c_uint]),
            ('glDrawArrays',None,[C.c_uint,C.c_int,C.c_int]),
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
        g=self.gl;handle=C.c_uint();g.glGenTextures(1,C.byref(handle));g.glBindTexture(0x0DE1,handle)
        pixels=base64.b64decode(texture['pixels']);data=C.create_string_buffer(pixels)
        g.glPixelStorei(0x0CF5,1);g.glTexImage2D(0x0DE1,0,0x1908,texture['width'],texture['height'],0,0x1908,0x1401,data)
        g.glTexParameteri(0x0DE1,0x2800,0x2600);g.glTexParameteri(0x0DE1,0x2801,0x2600)
        sprite=texture['key'].startswith('sprite:')
        g.glTexParameteri(0x0DE1,0x2802,0x812F if sprite else 0x2901)
        g.glTexParameteri(0x0DE1,0x2803,0x812F if sprite or texture['key']=='wall:SKY1' else 0x2901)
        return handle.value

    def mesh(self,mesh):
        g=self.gl;vao=C.c_uint();buffer=C.c_uint();g.glGenVertexArrays(1,C.byref(vao));g.glBindVertexArray(vao)
        g.glGenBuffers(1,C.byref(buffer));g.glBindBuffer(0x8892,buffer)
        data=C.create_string_buffer(base64.b64decode(mesh['vertices']));g.glBufferData(0x8892,len(data)-1,data,0x88E4)
        for index,size,offset in [(0,3,0),(1,2,12),(2,1,20),(3,1,24)]:
            g.glEnableVertexAttribArray(index);g.glVertexAttribPointer(index,size,0x1406,0,28,C.c_void_p(offset))
        return {**mesh,'vao':vao.value,'buffer':buffer.value}

    def render(self,world,sky,textures,meshes,view):
        g=self.gl;g.glViewport(0,0,self.width,self.height);g.glDepthMask(1);g.glClearColor(0,0,0,1);g.glClear(0x4000|0x0100)
        g.glDisable(0x0B71);g.glDisable(0x0B44);g.glDisable(0x0BE2);g.glDepthMask(0)
        g.glUseProgram(sky);loc=lambda name:g.glGetUniformLocation(sky,name.encode())
        g.glActiveTexture(0x84C0);g.glBindTexture(0x0DE1,textures['wall:SKY1']);g.glUniform1i(loc('uTexture'),0)
        for name,key in [('uForward','forward'),('uRight','right'),('uUp','up')]:g.glUniform3f(loc(name),*view[key])
        g.glUniform2f(loc('uFov'),view['tangent']*self.width/self.height,view['tangent'])
        g.glDrawArrays(4,0,3)
        g.glEnable(0x0B71);g.glDepthMask(1);g.glDepthFunc(0x0203);g.glEnable(0x0B44);g.glCullFace(0x0405)
        g.glUseProgram(world);loc=lambda name:g.glGetUniformLocation(world,name.encode())
        g.glUniformMatrix4fv(loc('uVP'),1,0,(C.c_float*16)(*view['vp']))
        g.glUniform3f(loc('uEye'),*view['position']);g.glUniform1i(loc('uTexture'),0)
        for name,value in [('uTime',0),('uBrightness',1.2),('uDamage',0),('uFlash',0)]:g.glUniform1f(loc(name),value)
        for mesh in meshes:
            g.glBindTexture(0x0DE1,textures[mesh['key']]);g.glBindVertexArray(mesh['vao']);g.glDrawArrays(4,0,mesh['count'])
        g.glDisable(0x0B44)
        for data in view['sprites']:
            mesh=self.mesh(data);g.glBindTexture(0x0DE1,textures[mesh['key']]);g.glDrawArrays(4,0,mesh['count'])
        pixels=np.empty((self.height,self.width,4),dtype=np.uint8)
        g.glReadPixels(0,0,self.width,self.height,0x1908,0x1401,pixels.ctypes.data_as(C.c_void_p))
        error=g.glGetError();assert error==0,f'OpenGL error {error:#x}'
        return np.flipud(pixels[:,:,:3]).copy()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'docs/qa');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    initial_hashes=source_hashes()
    data=json.loads(subprocess.check_output(['node','--input-type=module','-e',EXTRACT],cwd=ROOT,text=True))
    context=Context(data['width'],data['height']);s=data['shaders']
    world=context.program(s['WORLD_VERTEX'],s['WORLD_FRAGMENT']);sky=context.program(s['SKY_VERTEX'],s['SKY_FRAGMENT'])
    textures={t['key']:context.texture(t) for t in data['textures']}
    meshes={scene['name']:[context.mesh(m) for m in scene['groups']] for scene in data['scenes']}
    results=[];rendered={}
    for view in data['views']:
        pixels=context.render(world,sky,textures,meshes[view['scene']],view);path=args.output/(view['name']+'-egl.png');Image.fromarray(pixels).save(path)
        rendered[view['name']]=pixels
        unique=np.unique(pixels.reshape(-1,3),axis=0).shape[0];assert unique>500,'Expected textured E1M1 geometry'
        result={'name':view['name'],'image':path.name,'camera':{k:view[k] for k in ['x','y','z','angle']},'uniqueColors':unique,'meanRGB':pixels.mean(axis=(0,1)).tolist()}
        if 'fixture' in view:result['fixture']=view['fixture']
        if view['name'].startswith('door151-actor-'):
            # Difference against an identical camera/geometry baseline isolates
            # the visible actor, without relying on a colour or aesthetic threshold.
            mask=np.any(pixels!=rendered['door151-open'],axis=2)
            ys,xs=np.where(mask);assert len(xs)>100,'The centred actor must be visible through the opened doorway'
            portal=view['fixture']['portalScreen'];left=min(point['x'] for point in portal);right=max(point['x'] for point in portal)
            anchor=view['fixture']['anchorScreen'];assert left<anchor['x']<right,'Actor origin must be inside the opening'
            assert xs.min()>=np.floor(left)-1 and xs.max()<=np.ceil(right)+1,'Visible actor pixels must stay between the jambs in this controlled fixture'
            result['fixture']['visibleActor']={'pixels':int(len(xs)),'boundsXY':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],
                'centroidXY':[float(xs.mean()),float(ys.mean())],
                'check':'Visible pixels compared with the identical open-door view without actors; fixed placement, not a combat or AI test.'}
        results.append(result)
    assert source_hashes()==initial_hashes,'Production sources changed while rendering; rerun before reporting a valid snapshot'
    report={'passed':True,'scope':'Native llvmpipe EGL renders of unchanged production host shaders, procedurally constructed map/materials/sprites and FERRO camera helpers. No WAD or reference asset is loaded. Not a browser gameplay capture, full FERRO frame execution, or hardware FPS measurement.',
        'environment':context.info,'size':[data['width'],data['height']],'ferroVersion':data['engineVersion'],'sectors':data['sectors'],'subsectors':data['subsectors'],
        'mapGenerator':data['mapGenerator'],'resources':data['resources'],
        'shaderCompilation':'4 unmodified GLSL ES 3.00 production shaders compiled; 2 programs linked','mapTriangles':sum(m['count']//3 for m in data['scenes'][0]['groups']),
        'sceneTriangles':{scene['name']:sum(m['count']//3 for m in scene['groups']) for scene in data['scenes']},
        'adapterSha256':initial_hashes['src/ferro-doom-renderer.js'],'sourceSha256':initial_hashes,
        'shaderSha256':{name:hashlib.sha256(code.encode()).hexdigest() for name,code in s.items()},'cases':results}
    (args.output/'egl-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
