/**
 * Analytic reconstructions of the E1M1 surface families, with measured dimensions.
 * Geometry, coherent noise and lighting produce every runtime pixel. The original
 * archive is a visual research reference only; these are not pixel-identical art.
 */
import { Raster, clamp, mix, shade, seedOf, noise, smoothNoise } from './procedural-raster.js';

// Measured metadata, not sampled artwork.
export const TEXTURE_DIMENSIONS = Object.freeze({
  BIGDOOR2:[128,128], BIGDOOR4:[128,128], BRNBIGC:[128,128], BRNBIGL:[32,128], BRNBIGR:[32,128],
  BROWN1:[128,128], BROWN144:[128,128], BROWN96:[128,128], BROWNGRN:[64,128],
  COMPSPAN:[32,128], COMPTALL:[256,128], COMPTILE:[128,128], COMPUTE1:[128,128], COMPUTE2:[256,56],
  DOOR3:[64,72], DOORSTOP:[8,128], DOORTRAK:[8,128], EXITDOOR:[128,72], EXITSIGN:[64,16],
  LITE3:[32,128], NUKE24:[64,24], PLANET1:[256,128], SKY1:[256,128], SLADWALL:[64,128],
  STARG3:[128,128], STARGR1:[64,128], STARTAN1:[64,128], STARTAN2:[128,128], STARTAN3:[128,128],
  STEP1:[32,8], STEP6:[32,16], SUPPORT2:[64,128], SW1STRTN:[64,128], SW2STRTN:[64,128],
  TEKWALL1:[128,128], TEKWALL4:[128,128]
});
export const FLAT_NAMES = Object.freeze(['CEIL3_5','CEIL5_1','CEIL5_2','FLAT14','FLAT18','FLAT20','FLAT23','FLAT5_5',
  'FLOOR1_1','FLOOR4_8','FLOOR5_1','FLOOR5_2','FLOOR6_2','FLOOR7_1','FLOOR7_2',
  'NUKAGE1','NUKAGE2','NUKAGE3','STEP2','TLITE6_1','TLITE6_4','TLITE6_5','TLITE6_6','F_SKY1']);
const walls=new Map(),flats=new Map(),TAU=Math.PI*2;
const mod=(x,m)=>(x%m+m)%m;
const rough=(x,y,seed)=>(noise(x,y,seed)-.5)*13;
const bell=(x,scale=1)=>Math.exp(-(x*x)/(scale*scale));

function grain(base,x,y,seed,amount=1) {
  return shade(base,.78+smoothNoise(x/4,y/5,seed)*.32,rough(x,y,seed)*amount);
}
function brushed(base,x,y,seed) {
  const long=smoothNoise(x*.5,y/39,seed),fine=noise(x,Math.floor(y/16),seed+1);
  return shade(base,.7+long*.48+fine*.14,rough(x,y,seed)*.5);
}
function screw(image,x,y,color=[141,141,139]) {
  image.rect(x,y,2,2,[33,31,27]);image.pixel(x,y,color);image.pixel(x+1,y+1,[69,66,58]);
}
function pipe(image,points,width,color) {
  for(let i=1;i<points.length;i++){
    const [a,b]=[points[i-1],points[i]];
    image.line(a[0],a[1],b[0],b[1],width+2,shade(color,.27));
    image.line(a[0],a[1],b[0],b[1],width,color);
    image.line(a[0]-1,a[1]-1,b[0]-1,b[1]-1,Math.max(1,width*.25),shade(color,1.42));
  }
}
function roundedPanel(image,x,y,w,h,base,seed,header=false) {
  const radius=header?3:2.8;
  for(let py=Math.floor(y);py<y+h;py++)for(let px=Math.floor(x);px<x+w;px++){
    const dx=Math.abs(px+.5-(x+w/2))-(w/2-radius),dy=Math.abs(py+.5-(y+h/2))-(h/2-radius);
    const distance=-(Math.min(Math.max(dx,dy),0)+Math.hypot(Math.max(dx,0),Math.max(dy,0))-radius);
    if(distance<0)continue;
    const edge=clamp(distance/3.7),highlight=bell(py-y-3,header?2.2:2.5);
    const vertical=.88+smoothNoise(px*.65,py/37,seed)*.18;
    image.pixel(px,py,shade(base,(.55+.41*edge+.61*highlight)*vertical,(noise(px,0,seed+13)-.5)*9+rough(px,py,seed)*.7));
  }
}

function starWall(image,name) {
  const green=name==='STARG3',gray=name==='STARGR1',rust=name==='STARTAN3',seed=seedOf('STAR-PANELS');
  const columnColor=column=>gray?[126,126,126]:rust?(column%4===0||column%4===3?[129,108,83]:[126,126,123]):
    green?(column%4===0||column%4===3?[119,124,98]:[134,134,129]):[123,99,68];
  image.rect(0,0,image.width,128,(x,y)=>brushed(shade(columnColor(Math.floor(x/32)),.69),x,y,seed));
  for(let col=0;col<image.width/32;col++){
    const x=col*32,base=columnColor(col);
    for(const [y,h,header] of [[1,11,true],[15,28,false],[58,11,true],[72,40,false]])roundedPanel(image,x+1,y,30,h,base,seed+col,header);
    for(const [y,h]of [[45,10],[116,12]])image.rect(x+1,y,30,h,(px,py)=>grain(shade(base,.84),px,py,seed,1.2));
    for(const y of [43,56,113]){image.rect(x,y,32,2,shade(base,.48));image.rect(x+2,y+2,28,1,shade(base,.78));}
    if(rust||green){
      const oxide=green?[111,112,58]:[141,88,42];
      for(let line=0;line<10;line++){
        const px=x+3+noise(line,col,71)*25,top=noise(line,col,82)*12,stop=20+noise(line,col,91)*90;
        for(let y=top|0;y<stop;y++)if((y<43||y>58&&y<113)&&noise(px,y,915)>.1){
          const at=(y*image.width+(px|0))*4;
          image.pixel(px,y,mix([...image.pixels.slice(at,at+3)],oxide,.3+noise(line,col,18)*.29));
        }
      }
    }
  }
  if(name==='STARTAN2'){
    image.bevel(2,46,60,7,[70,59,40],true);
    for(let x=7;x<59;x+=4)image.rect(x,48,2,4,[32,30,22]);
    image.rect(7,47,10,1,[150,142,106]);image.bevel(98,46,28,7,[82,64,39]);image.rect(100,49,24,2,[38,32,20]);
    image.bevel(70,81,22,24,[100,84,59],true);
    for(let x=74;x<91;x+=5){image.rect(x,83,2,20,[62,61,53]);image.rect(x,86,2,2,[145,29,18]);image.rect(x,98,2,2,[145,29,18]);}
  }
}

function brownWall(image,name) {
  const seed=seedOf('BROWN-METAL'),green=name==='BROWNGRN'||name==='SLADWALL';
  const base=green?[43,49,28]:name==='BROWN1'?[116,96,68]:[58,49,29];
  image.rect(0,0,image.width,image.height,(x,y)=>{
    const streak=smoothNoise(x*.6,y/45,seed),long=noise(x,0,seed+6);
    let color=shade(base,.74+streak*.32+long*.1,rough(x,y,seed)*1.4);
    if(name==='BROWN1'){
      const panelY=y<16?y/16:y<72?(y-16)/56:(y-72)/56;
      color=shade(color,.72+Math.sin(panelY*Math.PI)*.33);
      const oxide=smoothNoise(x/3,y/17,seed+7),right=clamp((x-48)/62);
      color=mix(color,oxide>.5?[148,91,43]:[85,107,91],right*.58*clamp(Math.abs(oxide-.5)*6));
    }
    else if(name==='BROWN144'){
      // Fine corrosion flecks, with no invented panel divisions or broad rails.
      color=mix(color,[37,46,43],smoothNoise(x/8,y/9,819)*.37);
      if(noise(x,y,815)>.78)color=shade([35,49,45],.75+noise(x,y,816)*.5);
    }
    if(green&&noise(x,Math.floor(y/6),seed+7)>.81)color=shade([44,76,22],.6+noise(x,y,seed));
    return color;
  });
  if(name==='BROWN1'){
    for(const y of [16,72]){image.rect(0,y,image.width,1,[51,43,26]);image.rect(0,y+1,image.width,1,[128,103,70]);}
  }else if(name!=='BROWN144'){
    for(const top of name==='SLADWALL'?[0,32,64,96]:[0]){
      for(let x=0;x<image.width;x+=16)roundedPanel(image,x+2,top+1,12,green?24:23,shade(base,1.25),seed+x,false);
      image.rect(0,top+29,image.width,1,shade(base,.32));image.rect(0,top+30,image.width,1,shade(base,1.17));
    }
  }
}

function brownGrille(image,name) {
  brownWall(image,'BROWN96');
  const empty=(x,y)=>{
    if(y<31||y>119)return false;
    if(name==='BRNBIGC')return mod(x+y,32)>16&&mod(x+y,32)<30;
    const tooth=Math.abs(mod(y-32,32)-16)*.52;
    return name==='BRNBIGL'?x>26+tooth:x<6.5-tooth;
  };
  for(let y=30;y<121;y++)for(let x=0;x<image.width;x++){
    if(empty(x,y))image.pixel(x,y,[0,0,0,0]);
    else if(empty(x+1,y)||empty(x,y+1))image.pixel(x,y,[91,90,68]);
    else if(empty(x-1,y)||empty(x,y-1))image.pixel(x,y,[29,31,24]);
  }
  image.rect(0,122,image.width,2,[40,38,23]);image.rect(0,124,image.width,1,[93,74,38]);
}

function computerBase(image,bright=true) {
  image.rect(0,0,image.width,image.height,(x,y)=>shade(brushed(bright?[128,128,126]:[48,48,46],x,y,96),.74+.34*bell(mod(y,64)-33,23)));
}
function screen(image,x,y,w,h) {
  image.bevel(x-2,y-2,w+4,h+4,[87,87,84],true);image.rect(x,y,w,h,[0,0,0]);
  image.polygon([[x,y],[x+w*.37,y],[x,y+h*.34]],(px,py)=>shade([113,113,113],clamp(1-(px-x)/(w*.37)-(py-y)/(h*.34))*.62));
}
function terminal(image,x,y,w,h,seed,color=[41,100,20]) {
  for(let py=0;py<h;py+=3)for(let px=0;px<w;px+=3){
    const n=noise(px,py,seed);if(n>.36)image.rect(x+px,y+py,n>.73?2:1,2,shade(color,.55+n*.45));
  }
}
function uac(image,cx,cy,size,color=[0,0,117],background=[0,0,0]) {
  image.ellipse(cx-size*.35,cy,size*.6,size*.5,color);image.ellipse(cx+size*.32,cy,size*.6,size*.5,color);
  image.polygon([[cx-size*.35,cy-size*.32],[cx+size*.45,cy],[cx-size*.35,cy+size*.32]],background);
}
function keyboard(image,x,y,w,h,seed) {
  image.rect(x,y,w,h,[36,25,7]);
  for(let py=1;py<h;py+=3)for(let px=1;px<w;px+=3)image.rect(x+px,y+py,2,1.5,shade([143,92,41],.6+noise(px,py,seed)*.4));
}
function rack(image,x,y,w,h,seed,mode=0) {
  image.bevel(x,y,w,h,[72,72,65],true);image.rect(x+2,y+2,w-4,h-4,[9,9,4]);
  keyboard(image,x+3,y+3,Math.min(20,w*.25),h-6,seed);
  if(mode){
    const sw=Math.max(5,w*.42),sx=x+w*.32;
    image.rect(sx,y+3,sw,h-6,mode===2?[0,0,61]:[8,36,3]);
    if(mode===1)for(let px=0;px<sw;px++)image.pixel(sx+px,y+h*.5+Math.sin(px*.7+seed)*h*.18,[34,81,10]);
    else terminal(image,sx+2,y+4,sw-3,h-7,seed,[0,0,113]);
  }else for(let col=0;col<3;col++){
    const bx=x+w*.31+col*w*.21;image.rect(bx,y+3,w*.12,h-6,[25,20,5]);image.rect(bx+1,y+4,w*.08,1,[111,77,22]);image.pixel(bx+2,y+h-4,[157,101,25]);
  }
  image.rect(x+w-11,y+3,8,h-6,[10,9,2]);image.pixel(x+w-9,y+h-4,[185,123,34]);
}
function vent(image,x,y,w,h) {
  image.bevel(x,y,w,h,[45,45,41],true);
  for(let row=2;row<h-1;row+=2){image.rect(x+2,y+row,w-4,1,[12,13,11]);image.rect(x+2,y+row+1,w-4,1,[64,62,49]);}
}
function circuitry(image,x,y,w,h,seed) {
  image.rect(x,y,w,h,[4,6,3]);
  for(let wire=0;wire<w/2;wire++){
    const px=x+wire*2,top=y+noise(wire,1,seed)*h*.3,stop=y+h*(.55+noise(wire,2,seed)*.4);
    image.line(px,top,px,stop,1,shade(wire%4?[143,150,110]:[50,63,22],.3+noise(wire,3,seed)*.7));
    for(let py=top+3;py<stop;py+=7)if(noise(wire,py,seed)>.5)image.rect(px-1,py,3,2,[129,133,101]);
  }
  for(let part=0;part<8;part++){
    const px=x+2+noise(part,4,seed)*(w-12),py=y+3+noise(part,5,seed)*(h-10);
    image.bevel(px,py,6+noise(part,6,seed)*7,4,[63,69,40]);
  }
}
function computers(image,name) {
  computerBase(image,name!=='COMPTALL'&&name!=='COMPUTE2'&&name!=='COMPSPAN'&&name!=='COMPTILE');
  if(name==='COMPSPAN'){
    for(const y of [0,64])image.bevel(0,y,32,63,[45,45,43]);return;
  }
  if(name==='COMPTILE'){
    for(const x of [0,94])for(const y of [0,64])image.bevel(x,y,34,63,[45,45,43]);
    for(let y=0;y<128;y++)for(let x=20;x<108;x++){
      const edge=30-(Math.floor(y/8)%2?10:0);if(x<edge||x>128-edge)continue;
      image.pixel(x,y,x%7===0||y%11===0||x%13===0&&y%4<3?[0,0,75+noise(x,y,43)*43]:[0,0,18+noise(x,y,71)*23]);
    }return;
  }
  if(name==='COMPUTE1'){
    for(const y of [0,50,62,114,126]){image.rect(0,y,128,1,[160,160,154]);image.rect(0,y+1,128,1,[67,67,64]);}
    screen(image,6,4,43,25);uac(image,28,14,10);terminal(image,12,22,31,3,71,[0,0,101]);rack(image,6,33,44,12,11,0);
    image.bevel(77,3,47,44,[115,115,110],true);for(const x of [80,113,119])image.rect(x,5,1,40,[90,90,87]);
    image.rect(88,6,11,16,[0,0,0]);circuitry(image,89,7,9,14,52);
    image.rect(87,26,29,17,[0,0,0]);pipe(image,[[89,39],[95,35],[99,29]],2,[130,130,117]);circuitry(image,104,28,11,13,41);
    image.pixel(104,34,[11,126,0]);image.pixel(104,37,[181,9,0]);
    for(let row=0;row<3;row++)rack(image,6,69+row*15,45,12,35+row,row===1?1:row===2?2:0);
    rack(image,79,69,44,12,75);rack(image,79,84,45,7,54);
    for(const x of [79,101])for(const y of [93,102])image.bevel(x,y,22,10,[115,115,110],true);
    return;
  }
  if(name==='COMPUTE2'){
    for(let col=0;col<4;col++)for(let row=0;row<2;row++)rack(image,col*64+2,row*19+3,61,16,col+row*9,col===3?1:col===1?2:0);
    for(let col=0;col<13;col++)vent(image,3+col*19,44,14,10);return;
  }
  // Two rows of four 64-unit cabinets.
  for(let x=0;x<256;x+=64)for(let y=0;y<128;y+=64)image.bevel(x,y,64,64,[46,46,42]);
  vent(image,5,7,20,24);vent(image,5,38,20,22);screen(image,34,7,53,49);circuitry(image,35,9,51,45,81);
  image.bevel(99,7,55,49,[49,49,43]);image.rect(109,12,34,10,(x,y)=>mod(x+y,14)<7?[167,129,34]:[12,12,9]);
  image.bevel(135,34,10,12,[38,38,32],true);image.bevel(137,37,5,5,[52,52,43]);
  vent(image,166,8,18,22);vent(image,166,39,18,20);screen(image,198,7,49,28);
  terminal(image,201,12,20,17,88,[54,81,15]);image.bevel(224,11,17,19,[29,40,9]);terminal(image,227,14,11,12,20,[68,85,15]);
  screen(image,8,71,48,47);circuitry(image,9,73,46,43,51);vent(image,84,80,18,16);vent(image,84,102,18,13);
  for(let row=0;row<3;row++)for(let col=0;col<2;col++)rack(image,130+col*64,73+row*15,61,12,20+row*4+col,row===1&&col===0?2:0);
}

function planet(image,cx,cy,radius,kind,seed) {
  image.ellipse(cx,cy,radius,radius,(x,y)=>{
    const u=(x-cx)/radius,v=(y-cy)/radius,z=Math.sqrt(clamp(1-u*u-v*v));
    const n=smoothNoise(x/4,y/4,seed),small=smoothNoise(x,y,seed+1);
    let color=kind==='mars'?[128+48*n,31+14*n,18]:kind==='sand'?[140,122,82]:[58,63,52];
    if(kind==='earth')color=n>.57?mix([125,129,119],[212,204,171],small):mix([14,18,18],[77,82,76],n);
    if(kind==='mars'&&small>.72)color=[196,100,28];
    return shade(color,.2+clamp(u*.4-v*.3+z*.82),rough(x,y,seed)*1.2);
  });
}
function planetWall(image) {
  computerBase(image);for(let row=0;row<2;row++)for(let col=0;col<3;col++)screen(image,5+col*64,7+row*64,54,53);
  uac(image,31,27,13);terminal(image,14,39,38,13,21,[45,96,22]);planet(image,94,28,22,'mars',61);
  for(let x=0;x<7;x++)image.rect(73+x*3,54-x%3*3,2,4+x%3*3,[149,87,7]);terminal(image,103,43,18,13,71,[46,91,16]);
  terminal(image,137,13,16,14,51,[36,92,13]);image.bevel(157,13,18,18,[22,43,12],true);planet(image,166,22,5,'earth',93);
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
    image.bevel(138+col*15,32+row*14,13,13,[44,49,27],true);planet(image,144+col*15,38+row*14,5,col===1?'mars':row?'earth':'sand',row+col*4);
  }
  terminal(image,170,35,10,20,71,[34,88,13]);planet(image,30,94,21,'sand',121);
  terminal(image,11,111,18,10,13,[43,90,20]);terminal(image,43,109,12,13,23,[46,92,25]);
  image.rect(69,71,54,53,(x,y)=>{
    const n=smoothNoise(x/6,y/6,92)*.7+smoothNoise(x/2,y/2,123)*.3,heat=clamp((n-.41)*3.6);
    return mix([10,9,6],[175,39,28],heat).map((v,i)=>v+(i===0?1:.65)*noise(x,y,51)*22);
  });
  terminal(image,102,111,17,10,121,[43,85,18]);planet(image,159,96,24,'earth',410);terminal(image,135,104,18,18,84,[38,84,18]);
  for(let y=101;y<123;y+=5)image.rect(180,y,5,3,[163,0,0]);
}

function bigDoor(image,bronze) {
  const tone=g=>bronze?[g*1.05,g*.81,g*.49]:[g,g,g*.97];
  image.rect(0,0,128,128,(x,y)=>brushed(tone(93),x,y,450));
  for(const x of [2,7,119,125]){
    image.rect(x,0,2,128,tone(40));image.rect(x+1,0,1,128,tone(133));for(let y=5;y<125;y+=10)screw(image,x-1,y,tone(138));
  }
  image.rect(0,15,128,2,tone(34));image.rect(0,17,128,1,tone(129));
  for(let x=12;x<102;x+=9){image.bevel(x,0,7,13,tone(92),true);image.rect(x+2,2,1,9,tone(118));}
  for(let x=14;x<39;x+=4)image.pixel(x,2,[91,0,0]);image.rect(53,10,11,2,[88,0,0]);
  for(let y=2;y<14;y+=4){image.rect(104,y,10,2,[113,0,0]);image.rect(104,y,10,1,[155,44,21]);}
  image.polygon([[15,36],[34,20],[69,20],[69,91],[85,91],[95,104],[78,115],[16,115]],tone(67));
  pipe(image,[[17,38],[17,48],[28,52],[40,52],[40,89],[47,94],[47,108],[56,113],[79,113],[91,106]],5,tone(111));
  for(const [x,top,bottom,w]of [[32,24,48,6],[44,24,43,8],[57,20,88,11],[73,18,88,10],[86,22,91,8],[103,27,116,9]]){
    image.rect(x-w/2,top,w,bottom-top,(px,py)=>shade(tone(112),.49+.55*Math.sin((px-x+w/2+.5)/w*Math.PI),rough(px,py,63)*.45));
    image.rect(x-w/2-1,top,1,bottom-top,tone(31));for(const y of [top,bottom-2])image.bevel(x-w/2-2,y,w+4,3,tone(85));
  }
  for(const x of [60,87,104]){image.ellipse(x,66,6,3,tone(119),true);image.rect(x-5,67,10,3,tone(58));pipe(image,[[x,72],[x,77]],3,tone(130));}
  image.bevel(50,24,15,19,tone(98),true);image.bevel(57,30,5,9,tone(89));for(let y=31;y<39;y+=2)image.rect(59,y,1,1,tone(55));
  image.bevel(14,80,26,33,tone(80));for(let x=19;x<38;x+=4)image.bevel(x,83,2,18,tone(88),true);
  for(let y=87;y<99;y+=4)image.rect(11,y,25,1,tone(46));image.bevel(26,58,11,22,tone(69),true);
  image.rect(28,59,2,11,[110,0,0]);image.rect(26,71,10,5,[86,0,0]);image.rect(26,75,10,1,[154,57,13]);
  image.bevel(42,46,7,12,tone(97));image.rect(44,53,1,4,[122,0,0]);image.rect(46,53,1,4,[113,0,0]);
  for(let y=84;y<103;y+=5){image.rect(43,y,5,2,[121,0,0]);image.rect(43,y+2,5,1,tone(120));}
  image.bevel(96,90,18,9,tone(48),true);image.rect(99,92,13,4,(x,y)=>mod(x+y,8)<4?[158,115,32]:[32,32,21]);
  pipe(image,[[98,19],[107,31],[111,37]],3,bronze?[104,78,36]:[126,113,86]);for(const x of [7,117])for(const y of [102,106])image.rect(x,y,7,1,[128,0,0]);
  image.rect(0,114,128,2,tone(132));image.rect(0,116,128,2,tone(31));
  for(const x of [11,82]){image.bevel(x,118,34,7,tone(47),true);image.rect(x+1,120,32,3,(px,py)=>mod(px+py,8)<4?[183,134,31]:[24,24,18]);}
  for(const x of [3,123]){image.bevel(x-1,119,5,7,tone(90));image.rect(x,121,3,4,[115,0,0]);}
  image.bevel(49,116,29,9,tone(98));for(let x=51;x<77;x+=3)image.rect(x,118,1,4,tone(43));image.polygon([[43,128],[49,123],[78,123],[85,128]],tone(48));
}

function doors(image,name) {
  if(name==='BIGDOOR2'||name==='BIGDOOR4'){bigDoor(image,name==='BIGDOOR4');return;}
  if(name==='DOORSTOP'){
    image.rect(0,0,8,128,(x,y)=>shade([126,126,121],.25+.66*bell(x-3,1.9),rough(x,y,51)*.6));return;
  }
  if(name==='DOORTRAK'){
    image.rect(0,0,8,128,[13,14,11]);for(const x of [1,5]){image.rect(x,0,1,128,[86,87,76]);image.rect(x+1,0,1,128,[38,39,31]);}
    for(let y=0;y<128;y+=5){image.rect(1,y,5,1,[108,108,94]);image.pixel(3,y+2,[57,59,48]);}return;
  }
  if(name==='DOOR3'){
    image.rect(0,0,64,72,(x,y)=>shade(brushed([139,139,135],x,y,186),(.5+.64*bell(y-36,27))*(.48+.55*Math.sin(Math.PI*x/64))));
    for(const x of [8,56]){image.rect(x,8,1,57,[56,56,52]);image.rect(x+1,9,1,56,[117,117,110]);}
    for(const y of [9,61,67]){image.rect(9,y,46,1,[69,69,64]);image.rect(9,y+1,46,1,[125,125,115]);}
    for(let x=16;x<56;x+=10)image.rect(x,12,2,7,(px,py)=>shade([63,63,58],.55+(py-12)/12));
    image.bevel(45,40,14,15,[102,102,95],true);image.bevel(47,42,4,9,[82,82,74]);image.rect(49,43,1,5,[49,49,43]);
    image.bevel(54,42,6,4,[73,73,66]);image.rect(46,54,2,5,[94,69,31]);for(const x of [18,39,52])image.bevel(x,65,2,5,[64,64,57],true);return;
  }
  image.rect(0,0,128,72,(x,y)=>grain([34,32,19],x,y,521));
  for(const x of [4,58,69,78,92,105])pipe(image,[[x,0],[x-1,20],[x+1,37],[x,72]],3,[115,110,81]);
  pipe(image,[[7,4],[13,1],[51,1],[59,6],[59,17],[51,22],[54,38],[48,55],[13,55],[6,47],[6,29],[12,21],[10,7]],4,[148,143,103]);
  image.ellipse(31,13,13,11,[84,87,57],true);image.ellipse(31,12,9,7,[13,19,9]);
  for(let i=0;i<8;i++){const a=i*TAU/8;image.line(31+Math.cos(a)*4,12+Math.sin(a)*3,31+Math.cos(a)*8,12+Math.sin(a)*6,1,[155,153,108]);}
  image.bevel(20,31,24,21,[149,139,84]);image.bevel(22,33,20,17,[80,72,40],true);image.rect(24,35,16,13,(x,y)=>mod(x+y,18)<9?[152,104,26]:[104,104,62]);
  for(let x=12;x<53;x+=4){image.bevel(x,56,3,5,[129,129,91]);image.rect(x+1,57,1,3,[57,61,35]);}
  pipe(image,[[4,71],[5,65],[12,63],[52,63],[61,67],[61,71]],3,[155,153,116]);
  for(const x of [80,88])image.rect(x,0,5,70,(px,py)=>shade([159,163,146],.45+.5*Math.sin((px-x+.5)/5*Math.PI)));
  for(const y of [34,42]){image.bevel(76,y,22,5,[74,76,48]);image.rect(77,y+2,19,1,[96,0,0]);}
  image.bevel(113,2,14,68,[112,112,104]);image.rect(116,5,8,62,(x,y)=>shade([206,206,194],.75+.23*Math.sin((x-116)/8*Math.PI)));
}

function switchPlate(image,on) {
  image.bevel(21,72,25,32,[119,119,111]);image.bevel(24,75,10,24,[57,57,51],true);
  image.bevel(26,77,8,8,on?[103,0,0]:[200,0,0]);image.bevel(26,91,8,8,on?[56,106,26]:[21,46,12]);
  image.rect(39,79,2,18,[63,63,54]);image.rect(40,80,1,15,[93,93,82]);image.bevel(38,on?91:80,4,3,[137,132,105]);
}
function technicalWall(image,name) {
  const bronze=name==='TEKWALL4',seed=seedOf(name);image.rect(0,0,128,128,(x,y)=>grain(bronze?[35,29,15]:[15,18,12],x,y,seed));
  for(let channel=0;channel<19;channel++){
    const x=channel*7+1,y=4+noise(channel,2,seed)*65,turn=(channel%2?1:-1)*(3+noise(channel,8,seed)*5);
    const base=bronze?[116,92,48]:channel%3?[98,108,84]:[150,145,111];
    pipe(image,[[x,-5],[x,y],[x+turn,y+8],[x+turn,y+29],[x,y+37],[x,133]],channel%4===0?3:1,base);
    for(let part=0;part<4;part++){
      const py=mod(part*31+channel*13,128);image.bevel(x-2,py,5,12,shade(base,.54),true);
      if(channel%3===0)for(let yy=py+2;yy<py+10;yy+=3)image.rect(x-1,yy,3,1,shade(base,1.2));else image.rect(x,py+3,1,6,shade(base,1.1));
    }
  }
  if(!bronze){
    for(const x of [44,48,92,113])pipe(image,[[x,0],[x,128]],2,[130,135,115]);image.bevel(0,25,47,7,[67,76,44]);image.rect(0,31,47,5,[8,13,5]);
    for(let y=6;y<128;y+=11)image.rect(114,y,12,2,[149,167,126]);
    for(let y=45;y<125;y+=5)pipe(image,[[6,y],[12,y+3],[19,y+1],[25,y+5],[34,y+4]],1,[91,98,68]);
  }
}

function sky(image) {
  const ridge=(x,points)=>{
    for(let i=1;i<points.length;i++)if(x<=points[i][0]){
      const t=clamp((x-points[i-1][0])/(points[i][0]-points[i-1][0])),u=t*t*(3-2*t);return points[i-1][1]*(1-u)+points[i][1]*u;
    }return points.at(-1)[1];
  };
  const far=[[0,50],[34,23],[62,18],[82,20],[99,36],[119,52],[151,43],[178,52],[204,32],[233,29],[256,47]];
  const front=[[0,39],[10,43],[27,84],[44,122],[66,126],[86,105],[107,37],[121,29],[140,26],[151,36],[163,78],[177,112],[191,89],[211,43],[226,27],[246,25],[256,39]];
  for(let y=0;y<128;y++)for(let x=0;x<256;x++){
    const haze=smoothNoise(x/17,y/11,718),fine=noise(x,y,999);let color=shade([188,188,182],.91+haze*.07,(fine-.5)*8);
    const back=ridge(x,far)+(smoothNoise(x/3,0,92)-.5)*3;
    if(y>back){const rock=smoothNoise(x/8,y/6,741)*.35+smoothNoise(x/2,y/2,742)*.23;color=shade([125,125,117],.65+rock+clamp((y-back)/70)*.1,(fine-.5)*9);}
    const peak=ridge(x,front)+(smoothNoise(x/2,0,53)-.5)*4;
    if(y>peak){
      const n=smoothNoise(x/6,y/4,822),fracture=smoothNoise(x/1.7+y*.12,y/2.3,824),slope=.35+.5*n+.24*fracture,lichen=smoothNoise(x/3,y/3,825)>.64;
      color=shade(lichen?[69,68,37]:[52,55,47],slope,(fine-.5)*15);if(y<peak+2)color=shade(color,1.18);if(fracture<.28)color=shade(color,.5);
    }
    image.pixel(x,y,color);
  }
}

export function proceduralTexture(value) {
  const name=String(value||'').toUpperCase(),size=TEXTURE_DIMENSIONS[name];if(!size)return null;if(walls.has(name))return walls.get(name);
  const image=new Raster(...size),seed=seedOf(name);
  if(name==='SKY1')sky(image);
  else if(/^STAR/.test(name))starWall(image,name);
  else if(/^SW[12]STRTN$/.test(name)){starWall(image,'STARTAN1');switchPlate(image,name[2]==='2');}
  else if(/^BROWN|^SLAD/.test(name))brownWall(image,name);
  else if(/^BRNBIG/.test(name))brownGrille(image,name);
  else if(/^COMP/.test(name))computers(image,name);
  else if(name==='PLANET1')planetWall(image);
  else if(/DOOR/.test(name))doors(image,name);
  else if(/^TEK/.test(name))technicalWall(image,name);
  else if(name==='EXITSIGN'){
    image.rect(0,0,64,16,[43,43,40]);image.bevel(0,1,32,14,[47,47,42],true);image.rect(2,3,28,10,[29,0,0]);
    image.text('EXIT',3,3,8,(x,y)=>shade([184,0,0],.65+noise(x,y,53)*.32),1.6,.8);
    for(let x=35;x<64;x+=8)image.bevel(x,1,6,14,[45,45,42],true);
  }else if(name==='LITE3'){
    image.rect(0,0,32,128,[75,75,71]);for(let y=0;y<128;y+=8){image.bevel(1,y,30,8,[104,104,98]);image.bevel(3,y+2,26,4,[198,198,188],true);image.rect(5,y+3,23,2,[222,222,210]);}
  }else if(name==='NUKE24'){
    image.rect(0,0,64,24,(x,y)=>{const n=smoothNoise(x/3,y/3,64),blend=clamp((y-7+n*8)/17);return shade(mix([91,67,27],[35,101,19],blend),.54+n*.55,rough(x,y,66));});
  }else if(name==='STEP1'){
    image.rect(0,0,32,1,[81,81,71]);image.rect(0,1,32,2,[19,20,15]);image.rect(0,3,32,5,(x,y)=>shade([137,82,29],.31+.73*bell(x-16,7),rough(x,y,67)*.25));
  }else if(name==='STEP6'){
    image.rect(0,0,32,16,(x,y)=>grain([98,75,42],x,y,seed,1.4));for(const y of [1,7,13]){image.rect(0,y,32,1,[123,98,60]);image.rect(0,y+1,32,1,[63,49,27]);}
    for(let row=0;row<3;row++)for(let x=mod(row*11,19);x<32;x+=19)image.rect(x,row*6,1,5,[62,49,29]);
  }else if(name==='SUPPORT2'){
    image.rect(0,0,64,128,(x,y)=>shade(brushed([119,119,114],x,y,61),.38+.67*Math.sin((mod(x,16)+.5)/16*Math.PI)));
    for(let x=10;x<64;x+=16)for(let y=4;y<128;y+=16){image.bevel(x-2,y,6,8,[78,78,71],true);image.rect(x,y+2,2,5,[103,103,95]);}
  }
  const result=image.result(name);walls.set(name,result);return result;
}

function ceilingColor(x,y,brown=false) {
  const seed=381,n=noise(x,y,seed),base=brown?[51,43,22]:[36,36,34];
  if(brown&&n>.77)return shade([38,43,36],.8+noise(x,y,41)*.3);
  return shade(base,n>.78?.46:.72+n*.35,(noise(x,y,41)-.5)*5);
}
function blueFloor(x,y) {
  const n=smoothNoise(x/3,y/3,632,24)*.65+noise(x,y,531)*.35;return [0,0,19+Math.pow(n,2)*137];
}
function floorPanels(image,name) {
  const brown=name==='FLOOR5_2',rust=name==='FLOOR5_1';image.rect(0,0,64,64,brown?[68,49,23]:[29,26,15]);
  // Six-sided tiles: 48×32 bounds, 32-unit column pitch and 16-unit stagger.
  // Their diagonal edges meet; there are no circular islands or uncovered gaps.
  for(let col=-1;col<3;col++)for(let row=-1;row<3;row++){
    const cx=8+col*32,cy=row*32+(mod(col,2)?16:0);
    image.polygon([[cx-8,cy-16],[cx+8,cy-16],[cx+24,cy],[cx+8,cy+16],[cx-8,cy+16],[cx-24,cy]],(x,y)=>{
      const dx=x+.5-cx,dy=y+.5-cy,n=smoothNoise(x/3,y/3,71,32),edge=Math.min(16-Math.abs(dy),(24-Math.abs(dx)-Math.abs(dy))/Math.SQRT2);
      let color=brown?[105,77,36]:[81,84,80];
      const gloss=Math.exp(-((dx+5)**2/140+(dy-1)**2/75));
      const glow=brown?.83+n*.13:.53+gloss*.6+n*.13;
      if(rust&&smoothNoise(x/8,y/8,81,8)>.57&&edge<7)color=[92,70,29];
      if(!brown&&edge<9&&smoothNoise(x/4,y/4,94,16)<.14&&noise(x,y,19)>.17)color=[17,34,9];
      return shade(color,edge<1?(brown?.68:.29):edge<2?(brown?.95:dy<0?.98:.58):glow,rough(x,y,41)*.6);
    });
  }
}
function acid(image,phase) {
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const px=x+4.7*Math.sin(y*TAU/32+phase)+3*Math.sin((x+y)*TAU/32+phase*.5);
    const py=y+4.3*Math.sin(x*TAU/32-phase)+3*Math.cos((x-y)*TAU/32-phase*.5);
    const gx=Math.floor(px/16),gy=Math.floor(py/16);let first=1e6,second=1e6;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
      const ix=gx+i,iy=gy+j,sx=mod(ix,4),sy=mod(iy,4),cx=ix*16+8+(noise(sx,sy,791)-.5)*9+Math.sin(phase+sx+sy)*1.8,cy=iy*16+8+(noise(sx,sy,895)-.5)*9+Math.cos(phase+sx-sy)*1.8;
      const d=Math.hypot(px-cx,py-cy);if(d<first){second=first;first=d;}else if(d<second)second=d;
    }
    const ripple=smoothNoise(x/3,y/3,91,32),broad=smoothNoise(x/8,y/8,95,8);
    const vein=bell(second-first,1.5+broad*4)*( .37+ripple*.63);
    image.pixel(x,y,shade([5+vein*14,17+vein*59,2+vein*7],.7+ripple*.4,rough(x,y,92)*.65));
  }
}

export function proceduralFlat(value) {
  const name=String(value||'').toUpperCase();if(!FLAT_NAMES.includes(name))return null;if(flats.has(name))return flats.get(name);
  const image=new Raster(64,64),seed=seedOf(name);
  if(/^NUKAGE/.test(name))acid(image,(Number(name.at(-1))-1)*TAU/3);
  else if(name==='FLAT14'||name==='FLOOR1_1'){
    image.rect(0,0,64,64,blueFloor);if(name==='FLOOR1_1')uac(image,32,32,23,[0,0,159],blueFloor);
  }else if(/^FLOOR[45]_/.test(name))floorPanels(image,name);
  else if(name==='FLOOR6_2'){
    image.rect(0,0,64,64,(x,y)=>{const n=smoothNoise(x/2,y/2,182,32)*.7+smoothNoise(x/5,y/4,186,16)*.3,ridge=Math.pow(clamp(1-Math.abs(n-.49)*5),1.5),light=12+ridge*128;return [light,light,light*.94];});
  }else if(name==='FLOOR7_1')image.rect(0,0,64,64,(x,y)=>grain([78,57,26],x,y,seed,1.4));
  else if(name==='FLOOR7_2'){
    image.rect(0,0,64,64,(x,y)=>{
      const px=x+4*Math.sin(y*.18),py=y+4*Math.sin(x*.2),gx=Math.floor(px/20),gy=Math.floor(py/20);let distance=1e3;
      for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
        const cx=(gx+i)*20+10+(noise(gx+i,gy+j,15)-.5)*10,cy=(gy+j)*20+10+(noise(gx+i,gy+j,16)-.5)*10;distance=Math.min(distance,Math.hypot((px-cx)*.9,py-cy));
      }
      const n=smoothNoise(x/4,y/4,29,16),crack=clamp((13-distance)*.15);return shade([74,79,45],.25+crack*.52+n*.3,(noise(x,y,45)-.5)*19);
    });
  }else if(name==='STEP2'){
    image.rect(0,0,64,64,(x,y)=>grain([99,99,91],x,y,71));for(const y of [4,36]){
      image.bevel(4,y,56,25,[49,38,13],true);for(let yy=y+2;yy<y+23;yy+=2)for(let x=6;x<59;x+=4)image.rect(x,yy,3,1,[67+noise(x,yy,53)*12,50,18]);
    }
  }else if(/^TLITE6_/.test(name)){
    const kind=Number(name.at(-1)),brown=kind===4||kind===6;
    image.rect(0,0,64,64,(x,y)=>{
      const base=ceilingColor(x,y,brown);let light=0;
      if(kind===1||kind===4)light=clamp((17-Math.abs(x-32)-Math.abs(y-32))/5);
      else for(const cx of [16,48])for(const cy of [16,48])light=Math.max(light,Math.exp(-((x-cx)**2+(y-cy)**2)/22));
      return mix(base,kind===5?[255,9,0]:[255,208,174],light).map((v,i)=>kind===5&&i>0?v+Math.pow(light,5)*90:v);
    });
  }else if(name==='CEIL5_1'||name==='CEIL5_2'||name==='F_SKY1')image.rect(0,0,64,64,(x,y)=>ceilingColor(x,y,name==='CEIL5_2'));
  else if(name==='CEIL3_5'){
    image.rect(0,0,64,64,(x,y)=>grain([61,61,58],x,y,381));for(const x of [17,49]){image.rect(x,0,2,64,[28,28,26]);image.rect(x+2,0,1,64,[63,63,59]);}
    image.rect(0,12,17,2,[35,35,31]);image.rect(20,58,29,2,[30,30,27]);image.rect(21,60,27,1,[76,76,69]);
  }else if(name==='FLAT18'){
    image.rect(0,0,64,64,(x,y)=>grain([106,106,100],x,y,394,1.5));for(const y of [1,33]){image.bevel(1,y,62,30,[112,112,105],true);image.rect(3,y+2,58,26,(x,yy)=>grain([106,106,100],x,yy,394,1.5));}
  }else if(name==='FLAT20'){
    image.rect(0,0,64,64,(x,y)=>{const px=x%8,py=y%8;return px===0||py===0?[148,148,139]:px===7||py===7?[67,67,61]:grain([107,107,100],x,y,73,1.2);});
  }else if(name==='FLAT23')image.rect(0,0,64,64,(x,y)=>shade([133,133,127],(.5+bell(y-32,26)*.51)*(.96+noise(x,Math.floor(y/32),392)*.06),rough(x,y,394)*.3));
  else if(name==='FLAT5_5'){
    // Rough brown stone: irregular mineral fragments, without a manufactured grid.
    image.rect(0,0,64,64,(x,y)=>{
      const coarse=smoothNoise(x/3,y/3,91,32),fleck=noise(x,y,73),crease=smoothNoise(x/1.4,y/2.5,75,64);
      return shade([112,85,49],.48+coarse*.43+fleck*.34+(crease>.7?.15:0),rough(x,y,71)*1.6);
    });
  }
  const result=image.result(name);flats.set(name,result);return result;
}
