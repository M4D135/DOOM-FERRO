import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {proceduralTexture,proceduralFlat} from '../src/procedural-materials.js';
import {createE1M1Map} from '../src/procedural-map.js';

const digest = pixels => createHash('sha256').update(pixels).digest('hex');
const pixel = (image,x,y) => [...image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+4)];
const alphaCount = image => {
  let count=0;for(let i=3;i<image.pixels.length;i+=4)count+=image.pixels[i]===255;return count;
};
function complete(image,name) {
  assert.ok(image,name+' is generated');
  assert.ok(image.pixels instanceof Uint8Array,name+' has RGBA bytes');
  assert.equal(image.pixels.length,image.width*image.height*4,name+' complete buffer');
  assert.deepEqual([image.leftOffset,image.topOffset],[0,0],name+' neutral texture origin');
}

// Independent measured bounds. A dimension change alters wall UV repetition.
const measuredSizes = {
  BIGDOOR2:[128,128],BIGDOOR4:[128,128],BRNBIGC:[128,128],BRNBIGL:[32,128],BRNBIGR:[32,128],
  BROWN1:[128,128],BROWN144:[128,128],BROWN96:[128,128],BROWNGRN:[64,128],
  COMPSPAN:[32,128],COMPTALL:[256,128],COMPTILE:[128,128],COMPUTE1:[128,128],COMPUTE2:[256,56],
  DOOR3:[64,72],DOORSTOP:[8,128],DOORTRAK:[8,128],EXITDOOR:[128,72],EXITSIGN:[64,16],
  LITE3:[32,128],NUKE24:[64,24],PLANET1:[256,128],SKY1:[256,128],SLADWALL:[64,128],
  STARG3:[128,128],STARGR1:[64,128],STARTAN1:[64,128],STARTAN2:[128,128],STARTAN3:[128,128],
  STEP1:[32,8],STEP6:[32,16],SUPPORT2:[64,128],SW1STRTN:[64,128],SW2STRTN:[64,128],TEKWALL1:[128,128],TEKWALL4:[128,128]
};

test('all 36 measured wall dimensions preserve the original material scale',()=>{
  for(const [name,expected] of Object.entries(measuredSizes)){
    const image=proceduralTexture(name);complete(image,name);
    assert.deepEqual([image.width,image.height],expected,name+' measured bounds');
    assert.equal(proceduralTexture(name.toLowerCase()),image,name+' cached by normalized name');
  }
  for(const missing of ['','-','UNKNOWN_WALL'])assert.equal(proceduralTexture(missing),null);
});

test('every generated E1M1 surface is available without the research archive',()=>{
  const map=createE1M1Map();
  const wallNames=new Set(map.sides.flatMap(side=>[side.upper,side.middle,side.lower]).filter(name=>name!=='-'));
  const flatNames=new Set(map.sectors.flatMap(sector=>[sector.floorTexture,sector.ceilingTexture]));
  for(const name of wallNames)complete(proceduralTexture(name),name);
  for(const name of [...flatNames,'NUKAGE1','NUKAGE2']){
    const image=proceduralFlat(name);complete(image,name);assert.deepEqual([image.width,image.height],[64,64]);
    assert.equal(alphaCount(image),4096,name+' opaque floor or ceiling');
  }
  assert.equal(proceduralFlat('UNKNOWN_FLAT'),null);
});

test('brown grilles retain openings while structural walls remain opaque',()=>{
  for(const name of Object.keys(measuredSizes)){
    const image=proceduralTexture(name),ratio=alphaCount(image)/(image.width*image.height);
    if(name==='BRNBIGC')assert.ok(ratio>.65&&ratio<.8,'central diagonal openings');
    else if(/^BRNBIG[LR]$/.test(name))assert.ok(ratio>.88&&ratio<.99,name+' notched side');
    else assert.equal(ratio,1,name+' opaque structural surface');
  }
  const grate=proceduralTexture('BRNBIGC');
  assert.equal(pixel(grate,32,15)[3],255,'continuous top frame');
  assert.equal(pixel(grate,32,124)[3],255,'continuous bottom frame');
});

test('switch lamps change locally and three acid phases have distinct frames',()=>{
  const off=proceduralTexture('SW1STRTN'),on=proceduralTexture('SW2STRTN');
  assert.ok(pixel(off,28,80)[0]>pixel(on,28,80)[0],'red lamp dims after activation');
  assert.ok(pixel(on,28,94)[1]>pixel(off,28,94)[1],'green lamp lights after activation');
  for(let y=0;y<128;y++)for(let x=0;x<64;x++)if(x<21||x>45||y<72||y>103)assert.deepEqual(pixel(off,x,y),pixel(on,x,y),'same surrounding panel');
  const acid=['NUKAGE1','NUKAGE2','NUKAGE3'].map(proceduralFlat);
  assert.equal(new Set(acid.map(image=>digest(image.pixels))).size,3);
  for(const image of acid){
    let green=0;for(let i=0;i<image.pixels.length;i+=4)green+=image.pixels[i+1]>image.pixels[i]*1.6;
    assert.ok(green>4096*.9,'acid remains dark green throughout each phase');
  }
});

test('departure paving has joined grey tile centres and sparse green corrosion',()=>{
  for(const name of ['FLOOR4_8','FLOOR5_1']){
    const image=proceduralFlat(name);
    for(const [x,y] of [[40,16],[40,48],[8,32]]){
      const [r,g,b]=pixel(image,x,y);assert.ok(r>65&&Math.abs(r-g)<8&&Math.abs(g-b)<8,name+' raised grey tile centre');
    }
    assert.ok(pixel(image,32,32)[0]<pixel(image,40,16)[0]*.5,name+' joint meets neighbouring tiles');
    let green=0;for(let i=0;i<image.pixels.length;i+=4)green+=image.pixels[i+1]>image.pixels[i]*1.3;
    assert.ok(green/4096>.01&&green/4096<.07,name+' sparse edge corrosion, not broad green circles');
  }
  const brown=proceduralTexture('BROWN144');let sum=0;
  for(let i=0;i<brown.pixels.length;i+=4)sum+=brown.pixels[i];
  assert.ok(sum/(brown.width*brown.height)<65,'BROWN144 remains a dark corroded surface');
});

test('fresh mathematical material generators reproduce identical buffers',async()=>{
  const fresh=await import('../src/procedural-materials.js?material-determinism');
  for(const name of ['STARTAN3','COMPUTE1','COMPUTE2','PLANET1','BIGDOOR2','BRNBIGC','SKY1'])assert.equal(digest(proceduralTexture(name).pixels),digest(fresh.proceduralTexture(name).pixels),name);
  for(const name of ['FLOOR4_8','FLAT5_5','NUKAGE2','TLITE6_6'])assert.equal(digest(proceduralFlat(name).pixels),digest(fresh.proceduralFlat(name).pixels),name);
});

test('material and interface modules cannot load an image, archive or encoded bitmap',()=>{
  for(const name of ['procedural-materials.js','procedural-interface.js']){
    const source=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|atob|createImageBitmap|readFileSync)\s*\(/,name);
    assert.doesNotMatch(source,/data:image|base64|\.wad['"]|Math\.random\s*\(/i,name);
    assert.doesNotMatch(source,/from\s+['"](?!\.\/procedural-raster\.js)[^'"]+['"]/,name);
  }
});
