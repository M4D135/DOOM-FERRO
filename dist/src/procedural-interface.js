/**
 * Doom-style interface rebuilt with vector construction and deterministic shading.
 * The archived artwork was inspected only as a reference: no sampled pixels,
 * font bitmap, encoded image, world sprite or first-person weapon is stored here.
 * These recipes preserve measured bounds; they are not pixel-identical copies.
 */
import { Raster, clamp, mix, shade, noise, smoothNoise } from './procedural-raster.js?v=0.3.0-663ad4ffe1db';

const cache = new Map();

function glyphMask(value, width = 14, height = 16) {
  const mask = new Raster(width, height), ink = [255,255,255];
  const polygon = points => mask.polygon(points, ink);
  const hole = points => mask.polygon(points, [0,0,0,0]);
  switch (value) {
    case '0':
      polygon([[4,0],[8,0],[11,2],[12,5],[12,11],[9,14],[3,14],[0,11],[0,5],[1,2]]);
      hole([[5,4],[7,4],[8,5],[8,10],[7,11],[5,11],[4,10],[4,6]]); break;
    case '1':
      polygon([[3,0],[9,0],[9,14],[3,14],[3,5],[0,5],[0,2]]); break;
    case '2':
      polygon([[0,0],[8,0],[12,3],[12,6],[9,9],[4,11],[12,11],[12,14],[0,14],[0,9],[4,6],[8,5],[8,4],[0,4]]); break;
    case '3':
      polygon([[0,0],[8,0],[12,3],[12,11],[9,14],[0,14],[0,11],[8,11],[8,9],[3,9],[3,6],[8,6],[8,4],[0,4]]); break;
    case '4':
      polygon([[0,0],[4,0],[4,6],[8,6],[8,0],[12,0],[12,14],[8,14],[8,10],[0,10]]); break;
    case '5':
      polygon([[0,0],[12,0],[12,4],[4,4],[4,6],[9,6],[12,9],[12,11],[9,14],[0,14],[0,11],[8,11],[8,10],[0,10]]); break;
    case '6':
      polygon([[4,0],[12,0],[12,4],[5,4],[4,6],[9,6],[12,9],[12,11],[9,14],[3,14],[0,11],[0,5]]);
      hole([[4,9],[8,9],[8,11],[4,11]]); break;
    case '7':
      polygon([[0,0],[8,0],[12,3],[12,14],[8,14],[8,5],[6,4],[0,4]]); break;
    case '8':
      polygon([[3,0],[9,0],[12,3],[11,6],[9,7],[12,9],[12,11],[9,14],[3,14],[0,11],[0,9],[3,7],[1,6],[0,3]]);
      hole([[4,3],[8,3],[8,5],[4,5]]); hole([[4,9],[8,9],[8,11],[4,11]]); break;
    case '9':
      polygon([[3,0],[9,0],[12,3],[12,11],[9,14],[0,14],[0,11],[8,11],[8,9],[3,9],[0,6],[0,3]]);
      hole([[4,3],[8,3],[8,6],[4,6]]); break;
    case '%':
      polygon([[0,0],[3,0],[4,2],[3,4],[1,4],[0,3]]);
      polygon([[9,10],[12,10],[13,12],[12,14],[9,14],[8,12]]);
      polygon([[10,1],[12,1],[12,4],[3,13],[0,14],[0,11]]); break;
  }
  return mask;
}

function largeDigit(name) {
  const symbol = name === 'STTPRCNT' ? '%' : name.at(-1);
  const image = new Raster(symbol === '1' ? 11 : 14, 16, symbol === '1' ? -1 : 0, 0);
  const mask = glyphMask(symbol, image.width, image.height);
  const on = (x,y) => x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.pixels[(y*mask.width+x)*4+3];
  for (let y=0;y<16;y++) for(let x=0;x<image.width;x++) if(on(x,y)) image.pixel(x+1,y+1,[45,45,45]);
  for (let y=0;y<16;y++) for(let x=0;x<image.width;x++) if(on(x,y)) {
    const upper = !on(x,y-1), left = !on(x-1,y), lower = !on(x,y+1), right = !on(x+1,y);
    const edge = upper || left || lower || right;
    let red = 152 + 26 * smoothNoise(x/3,y/3,77) - y*.9;
    if (edge) red *= upper ? .66 : left ? .58 : .38;
    else if(!on(x,y-2)) red += 37;
    image.pixel(x,y,[red,0,0]);
  }
  return image.result(name);
}

function smallDigit(name) {
  const image = new Raster(4,6), glyph = new Raster(4,6);
  // Three columns plus a one-pixel cast shadow. Stroke membership keeps 5/9
  // and 6/8 distinct at the original four-by-six patch dimensions.
  const value=Number(name.at(-1)),ink=[255,255,255];
  if([0,2,3,5,6,7,8,9].includes(value))glyph.rect(0,0,3,1,ink);
  if([0,1,2,3,4,7,8,9].includes(value))glyph.rect(2,0,1,3,ink);
  if([0,1,3,4,5,6,7,8,9].includes(value))glyph.rect(2,2,1,3,ink);
  if([0,2,3,5,6,8,9].includes(value))glyph.rect(0,4,3,1,ink);
  if([0,2,6,8].includes(value))glyph.rect(0,2,1,3,ink);
  if([0,4,5,6,8,9].includes(value))glyph.rect(0,0,1,3,ink);
  if([2,3,4,5,6,8,9].includes(value))glyph.rect(0,2,3,1,ink);
  if(value===1)glyph.pixel(1,1,ink);
  const gray = name.startsWith('STGNUM');
  for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(glyph.pixels[(y*4+x)*4+3])image.pixel(x+1,y+1,[55,0,0]);
  for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(glyph.pixels[(y*4+x)*4+3])image.pixel(x,y,gray?[139,139,139]:[255,255,140]);
  return image.result(name);
}

function statusBar(name) {
  const image = new Raster(320,32);
  image.rect(0,0,320,32,(x,y)=>{
    const mottling = smoothNoise(x/5,y/5,312)*.31 + smoothNoise(x/1.4,y/2,291)*.24;
    return shade([102,102,102],.46+mottling,(noise(x,y,71)-.5)*25);
  });
  // Single-player composition: the ARMS label occupies the original STARMS area.
  for(const x of [0,44,104,142,178,236,248,319]){
    image.rect(x,0,1,32,[135,135,135]);
    image.rect(x+1,0,1,32,[37,37,37]);
    image.rect(x+2,0,1,32,[76,76,76]);
  }
  image.rect(0,0,320,1,[125,125,125]);
  image.rect(0,31,320,1,[38,38,38]);
  image.rect(144,2,33,30,[0,0,0,0]);
  image.rect(144,1,33,1,[152,152,152]);
  const label = (text,x,y,height=4)=>{
    image.text(text,x+1,y+1,height,[35,35,35],1,.7);
    image.text(text,x,y,height,[170,170,170],1,.7);
  };
  label('AMMO',8,24); label('HEALTH',55,24); label('ARMS',111,24); label('ARMOR',184,24);
  for(let row=0;row<4;row++){
    const y=4+row*6;
    label(['BULL','SHEL','ROCK','CELL'][row],253,y,4);
    image.line(297,y+4,299,y+1,1,[42,42,42]);
    image.line(296,y+4,298,y+1,1,[166,166,166]);
    image.bevel(239,1+row*8,7,7,[79,79,79],true);
  }
  return image.result(name);
}

function face(name) {
  const dead = name === 'STFDEAD0', hurt = name.startsWith('STFOUCH');
  const level = dead ? 4 : Number(name.startsWith('STFST') ? name[5] : name[7]);
  const height = hurt || dead || level >= 3 ? 31 : level === 2 ? 30 : 29;
  const image = new Raster(24,height,-5,height >= 31 ? -1 : -2);
  const gaze = name.startsWith('STFST') ? [0,1,-1][Number(name.at(-1))] : 0;
  const shift = gaze*.65, lower = height-29;
  const skin=[196,145,90], dark=[77,45,20], pale=[235,184,124];
  // Broad jaw, ears, cheek planes and bare scalp; all relief is analytic.
  image.ellipse(2.5,17+lower*.5,2,4,[145,99,54],true);
  image.ellipse(21.5,17+lower*.5,2,4,[145,99,54],true);
  const outline=[[4,7],[6,3],[17,2],[21,7],[22,16],[20,23+lower],[17,27+lower],[13,29+lower],[9,28+lower],[5,25],[2,18]];
  image.polygon(outline,(x,y)=>{
    const u=(x-12)/10,v=(y-14)/(15+lower);
    const cheek=Math.exp(-((Math.abs(u)-.47)**2*20+(v-.2)**2*15));
    const ridge=Math.exp(-u*u*50)*Math.exp(-((v-.04)**2)*5);
    return shade(skin,.62+.27*Math.sqrt(clamp(1-u*u))+.14*cheek+.13*ridge,(noise(x,y,31)-.5)*13);
  });
  // Short brown hair with a combed, irregular hairline; never a helmet or cap.
  image.polygon([[3,10],[3,5],[6,1],[10,0],[17,0],[20,3],[21,7],[20,12],[18,8],[15,9],[13,6],[11,8],[8,6],[6,10]],(x,y)=>{
    const streak=smoothNoise(x*.7+y*.4,y*.24,902);
    return shade([122,77,34],.55+streak*.67+Math.exp(-((x-11)**2/48+y*y/25))*.3);
  });
  image.line(4,8,4,16,1,[98,65,33]); image.line(20,8,20,15,1,[72,45,20]);
  image.line(6,10,10,11,1,[217,166,105]); image.line(14,10,18,10,1,[212,157,95]);
  for(const side of [-1,1]){
    const eye=12+side*4+shift;
    image.ellipse(eye,14,3,2,[93,60,30]);
    image.line(eye-side*2.4,13.6,eye+side*1.6,11.7,1.8,[44,28,13]);
    if(dead){ image.line(eye-2,14,eye+2,14,2,[116,0,0]); }
    else {
      image.rect(eye-1.5,14,3,1.5,[215,205,159]);
      image.rect(eye+gaze*.4-.3,14,1.5,1.5,[21,24,19]);
    }
    image.line(eye-2,17,eye+1,17,1,[226,169,107]);
    image.line(eye-side,19,eye+side*2,21,1,[125,78,37]);
  }
  image.polygon([[11+shift,14],[13+shift,14],[14+shift,19],[12+shift,21],[10+shift,19]],(x,y)=>shade(skin,.86+(13-x)*.08));
  image.line(11+shift,16,11+shift,19,1,pale);
  image.pixel(10+shift,20,dark); image.pixel(13+shift,20,dark);
  const mouthY=23+lower*.5;
  if(hurt){
    image.ellipse(12+shift,mouthY+1,4,4,[61,24,12]);
    image.ellipse(12+shift,mouthY+1,2.7,3.2,[12,9,5]);
    image.rect(10+shift,mouthY-2,4,1,[222,207,161]);
    image.rect(11+shift,mouthY+3,3,1,[158,41,28]);
  }else{
    image.line(8+shift,mouthY,16+shift,mouthY,1.4,[105,64,31]);
    image.line(9+shift,mouthY-1,15+shift,mouthY-1,1,[213,163,108]);
    image.line(9+shift,mouthY+2,15+shift,mouthY+2,1,[231,177,120]);
    image.line(10+shift,mouthY+3,14+shift,mouthY+3,1,[107,72,39]);
  }
  if(level>0){
    image.ellipse(5,15,2+level*.25,1.5,[126,51-level*5,31]);
    image.line(19,16,18,20+level,1,[119,37,18]);
    if(level>=2) image.line(10,21,11,26,1,[140,34,18]);
    if(level>=3){
      image.polygon([[6,3],[10,1],[15,2],[17,5],[16,10],[12,9],[10,13],[8,7]],(x,y)=>shade(skin,.7+noise(x,y,73)*.4));
      image.line(16,11,17,19,2,[132,23,12]);
      image.line(9,22,9,29,2,[137,22,15]);
    }
    if(level===4){image.line(15,23,14,30,2,[160,17,9]);image.line(6,11,7,17,1,[147,10,5]);}
  }
  if(dead){
    image.line(6,14,8,20,2,[145,0,0]);image.line(17,14,16,20,2,[141,0,0]);
    image.ellipse(12,25,4,3,[136,23,18]);image.line(10,26,14,26,1,[219,132,114]);
  }
  return image.result(name);
}

function logo(name) {
  const image=new Raster(123,60),mask=new Raster(123,60),ink=[255,255,255];
  const letter=(outer,inner)=>{mask.polygon(outer,ink);if(inner)mask.polygon(inner,[0,0,0,0]);};
  letter([[2,1],[24,1],[29,5],[29,40],[2,56]],[[11,10],[20,10],[20,34],[11,40]]);
  letter([[32,1],[56,1],[60,5],[60,41],[46,47],[31,41]],[[40,10],[51,10],[51,34],[46,37],[40,34]]);
  letter([[64,1],[86,1],[90,5],[90,41],[76,47],[62,41],[62,5]],[[70,10],[81,10],[81,34],[76,37],[70,34]]);
  letter([[93,1],[103,1],[108,17],[113,1],[121,1],[121,56],[113,52],[113,30],[107,44],[101,28],[101,48],[92,42]]);
  const on=(x,y)=>x>=0&&y>=0&&x<123&&y<60&&mask.pixels[(y*123+x)*4+3];
  // The extrusion follows the tall outside corners and the shallow central point.
  for(let y=0;y<60;y++)for(let x=0;x<123;x++)if(on(x,y)){
    for(let step=3;step>0;step--) image.pixel(x+1,y+step,shade([117,81,29],.55+noise(x,y,48)*.4));
  }
  for(let y=0;y<60;y++)for(let x=0;x<123;x++)if(on(x,y)){
    let distance=4;
    for(let d=1;d<=3;d++)if(!on(x-d,y)||!on(x+d,y)||!on(x,y-d)||!on(x,y+d)){distance=d;break;}
    const split=24+4*Math.sin(x*.12)+noise(x,0,514)*3;
    let color=y<split?[0,0,92]:mix([133,71,25],[209,164,75],clamp((y-split)/25));
    if(distance===1)color=y<5?[5,5,158]:[225,182,91];
    else if(distance===2)color=y<split?[48,19,28]:[101,62,25];
    const detail=smoothNoise(x/2.2,y/2.2,394)*.25+noise(x,y,215)*.35;
    image.pixel(x,y,shade(color,.57+detail));
  }
  return image.result(name);
}

export function hasProceduralPatch(value) {
  return /^(?:STBAR|STTPRCNT|M_DOOM|ST(?:TNUM|YSNUM|GNUM)[0-9]|STFST[0-4][0-2]|STFOUCH[0-4]|STFDEAD0)$/.test(String(value||'').toUpperCase());
}

export function proceduralPatch(value) {
  const name=String(value||'').toUpperCase();
  if(!hasProceduralPatch(name))return null;
  if(cache.has(name))return cache.get(name);
  const result=name==='STBAR'?statusBar(name):name==='M_DOOM'?logo(name):name.startsWith('STF')?face(name):name.startsWith('STT')?largeDigit(name):smallDigit(name);
  cache.set(name,result);return result;
}
