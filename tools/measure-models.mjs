/** Reproducible geometry inventory. This does not measure frame rate. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {characterMesh,proceduralCharacterCacheStats} from '../src/procedural-characters.js';
import {objectMesh,weaponMesh,proceduralObjectCacheStats} from '../src/procedural-objects.js';
import {MATERIALS,MESH_VERTEX_STRIDE} from '../src/procedural-mesh.js';

const sources=['src/procedural-mesh.js','src/procedural-characters.js','src/procedural-objects.js',
  'src/procedural-weapons.js','src/procedural-models.js','src/ferro-doom-renderer.js'];
const hashes=()=>Object.fromEntries(sources.map(path=>[path,
  createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex')]));
const before=hashes();
const materialNames=Object.fromEntries(Object.entries(MATERIALS).map(([name,value])=>[value.kind,name]));
function inspect(mesh){
  const kinds=new Set();
  for(let i=12;i<mesh.vertices.length;i+=MESH_VERTEX_STRIDE)kinds.add(mesh.vertices[i]);
  return {triangles:mesh.triangles,bytes:mesh.vertices.byteLength,bounds:mesh.bounds,
    materials:[...kinds].sort((a,b)=>a-b).map(kind=>materialNames[kind])};
}
const characters={};
for(const family of ['POSS','SPOS','TROO']){
  characters[family]=[0,1,2].map(detail=>({detail,...inspect(characterMesh({base:family,
    sprite:family+'A1',enemy:true,alive:true,state:'idle'},0,detail))}));
}
const objects={};
for(const [family,type] of [['BAR1',2035],['COLU',2028],['ELEC',48],['CBRA',35],
  ['PLAYW',10],['PLAYN',15],['POL5',24],['STIM',2011],['MEDI',2012],
  ['BON1',2014],['BON2',2015],['ARM1',2018],['ARM2',2019],['CLIP',2007],
  ['AMMO',2048],['SHEL',2008],['SBOX',2049],['SHOT',2001]]){
  objects[family]=[0,1,2].map(detail=>({detail,...inspect(objectMesh({type},0,detail))}));
}
const weapons={};
for(const kind of ['pistol','shotgun','fist']){
  const poses=[['rest',Infinity],['action',kind==='fist'?.12:.03]];
  if(kind==='shotgun')poses.push(['pump',.3]);
  weapons[kind]=Object.fromEntries(poses.map(([name,phase])=>[name,inspect(weaponMesh(kind,phase))]));
}
if(JSON.stringify(before)!==JSON.stringify(hashes()))throw Error('Sources changed during measurement.');
const actors=proceduralCharacterCacheStats(),props=proceduralObjectCacheStats();
console.log(JSON.stringify({version:JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version,
  scope:'Actual generated vertex buffers. Character counts use the idle A pose; props use the first frame. Animation counts vary. No FPS or hardware performance claim.',
  vertexStride:MESH_VERTEX_STRIDE,detailOrder:'0 distant, 1 intermediate, 2 close',sourceSha256:before,
  limits:{characterBytes:actors.byteLimit,objectBytes:props.objects.byteLimit,
    weaponBytes:props.weapons.byteLimit,modelGpuBytes:64*1024*1024},
  characters,objects,weapons},null,2));
