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
  TEKWALL1:[128,128], TEKWALL4:[128,128],
  BROWNHUG:[64,128], DOORRED:[8,128], LITE4:[16,128], LITE5:[16,128], LITEBLU3:[16,128],
  METAL1:[64,128], STARG1:[64,128], STEP3:[32,8], STEP5:[32,16],
  DOOR1:[64,72], GRAYTALL:[128,128], NUKESLAD:[64,128], PLAT1:[128,128],
  SLADRIP2:[64,128], SLADPOIS:[64,128], STONE2:[128,128], STONE3:[128,128],
  DOORBLU:[8,128], DOORYEL:[8,128], STONE:[256,128], STEP2:[32,8], STEP4:[32,16],
  SW1COMP:[64,128], SW1BRNGN:[64,128], SW1SLAD:[64,128], SW1STON1:[64,128],
  SW1PIPE:[128,128], TEKWALL2:[128,128], TEKWALL5:[128,128]
});
export const FLAT_NAMES = Object.freeze(['CEIL3_5','CEIL3_1','CEIL4_3','CEIL5_1','CEIL5_2','CONS1_1','CONS1_5','CONS1_7','FLAT10','FLAT14','FLAT18','FLAT20','FLAT22','FLAT23','FLAT5_4','FLAT5_5','MFLR8_1',
  'FLOOR0_3','FLOOR1_1','FLOOR3_3','FLOOR4_1','FLOOR4_5','FLOOR4_8','FLOOR5_1','FLOOR5_2','FLOOR5_3','FLOOR5_4',
  'FLOOR6_1','FLOOR6_2','FLOOR7_1','FLOOR7_2',
  'NUKAGE1','NUKAGE2','NUKAGE3','STEP1','STEP2','TLITE6_1','TLITE6_4','TLITE6_5','TLITE6_6','F_SKY1']);
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

function wallSwitch(image,x,y,button=[200,0,0]) {
  image.bevel(x,y,22,28,[119,119,111]);
  image.bevel(x+3,y+3,16,22,[57,57,51],true);
  image.bevel(x+7,y+8,8,12,button);
  image.rect(x+9,y+10,4,2,shade(button,1.5));
}
function copperPipes(image,width,height,seed) {
  image.rect(0,0,width,height,(x,y)=>grain([64,42,18],x,y,seed,1.2));
  for(let x=2;x<width;x+=9){
    const copper=smoothNoise(x/9,0,seed+3)>.42;
    const base=copper?[150,96,44]:[86,88,80];
    image.rect(x,0,6,height,(px,yy)=>shade(base,.55+smoothNoise(px/2,yy/11,seed+5)*.55,rough(px,yy,seed)*.8));
    image.rect(x+1,0,1,height,shade(base,1.5));
    image.rect(x+5,0,1,height,shade(base,.4));
    for(let y=mod(x*7,26);y<height;y+=26)image.rect(x-1,y,8,4,(px,yy)=>grain(shade(base,1.1),px,yy,seed+7));
  }
  for(let y=6;y<height;y+=31)for(let x=4;x<width;x+=17)
    if(noise(x,y,seed+9)>.5)image.rect(x,y,3,height-y,(px,yy)=>shade([54,96,44],.5+noise(px,yy,seed+11)*.5));
}
function denseTechwall(image,seed) {
  const bronze=[122,100,54],dark=[26,22,12];
  image.rect(0,0,128,128,(x,y)=>grain(dark,x,y,seed,1.1));
  for(let channel=0;channel<21;channel++){
    const x=channel*6+1,w=channel%4===0?4:2;
    const base=channel%3===0?bronze:channel%3===1?[88,94,70]:[142,134,102];
    image.rect(x,0,w,128,(px,yy)=>shade(base,.42+smoothNoise(px/2,yy/13,seed+channel)*.66,rough(px,yy,seed)*.7));
    image.rect(x,0,1,128,shade(base,1.45));
    for(let y=mod(channel*17,23);y<128;y+=23)image.rect(x-1,y,w+2,4,(px,yy)=>grain(shade(base,1.15),px,yy,seed+3));
  }
  for(let row=0;row<4;row++){
    const y=14+row*31;
    image.rect(0,y,128,3,(x,yy)=>shade([96,88,60],.4+smoothNoise(x/7,yy/3,seed+7)*.6));
    image.rect(0,y,128,1,shade([150,140,96],1.1));
    for(let x=mod(row*23,19);x<128;x+=19)image.rect(x,y-1,4,5,[54,48,28]);
  }
  for(let box=0;box<6;box++){
    const bx=mod(box*43+11,110),by=mod(box*29+7,104),bw=12+2*(box%3)*4,bh=10+2*(box%2)*3;
    image.bevel(bx,by,bw,bh,[74,66,42],true);
    for(let y=by+2;y<by+bh-2;y+=3)image.rect(bx+2,y,bw-4,1,shade([120,110,72],.8+noise(bx,y,seed+11)*.5));
    if(box%2)image.rect(bx+bw-4,by+2,2,2,box%3?[188,22,14]:[36,150,44]);
  }
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
  else if(name==='STEP5'){
    image.rect(0,0,32,16,(x,y)=>grain([34,26,14],x,y,seed,1.2));
    for(const y of [1,9]){
      for(let x=0;x<32;x+=8){
        image.rect(x+1,y,6,6,(px,yy)=>grain([88,62,26],px,yy,seed+2,1.1));
        image.rect(x+1,y,6,1,[132,104,56]);image.rect(x+1,y+5,6,1,[26,18,8]);
        image.rect(x+2,y+2,3,2,[158,126,66]);image.rect(x+2,y+3,3,1,[80,56,20]);
      }
    }
  }else if(name==='STEP3'){
    image.rect(0,0,32,8,(x,y)=>grain([62,46,22],x,y,seed,1.3));
    image.rect(0,0,32,1,[104,84,46]);image.rect(0,7,32,1,[26,18,8]);
    for(let x=0;x<32;x+=8)image.rect(x,3,4,1,[52,38,18]);
  }else if(name==='LITE4'){
    image.rect(0,0,16,128,(x,y)=>grain([38,38,36],x,y,seed));
    image.rect(1,0,14,58,[20,20,18]);image.rect(1,58,14,70,[20,20,18]);
    for(let y=2;y<56;y+=7){image.rect(4,y,8,3,(x,yy)=>shade([236,236,228],.84+smoothNoise(x/3,yy/3,seed)*.3));
      image.rect(4,y,8,1,[255,255,250]);}
    image.rect(3,60,10,64,(x,y)=>shade([232,232,224],.66+bell(y-32,24)*.5+smoothNoise(x/2,y/6,seed+3)*.22));
    image.rect(3,60,10,1,[255,255,252]);image.rect(3,123,10,1,[126,126,120]);
  }else if(name==='LITE5'){
    image.rect(0,0,16,128,(x,y)=>grain([34,34,32],x,y,seed));
    for(let y=1;y<128;y+=8){
      image.rect(2,y,12,6,(x,yy)=>shade([238,238,230],.78+smoothNoise(x/2,yy/4,seed+5)*.32));
      image.rect(2,y,12,1,[255,255,252]);image.rect(2,y+5,12,1,[118,118,112]);
    }
  }else if(name==='LITEBLU3'){
    image.rect(0,0,16,128,(x,y)=>grain([104,80,46],x,y,seed,1.2));
    image.rect(6,0,4,128,[14,20,104]);
    for(let y=0;y<128;y++)for(let x=6;x<10;x++){
      const n=smoothNoise(x/2,y/9,seed+7);
      image.pixel(x,y,shade([16,38,186],.46+n*.7+bell(mod(y,64)-32,20)*.25,rough(x,y,seed)*.4));}
    image.rect(4,60,8,4,(x,y)=>grain([104,80,46],x,y,seed,1.2));
    image.rect(2,0,4,128,[66,48,24]);image.rect(10,0,4,128,[66,48,24]);
  }else if(name==='DOORRED'){
    image.rect(0,0,8,128,(x,y)=>brushed([96,96,92],x,y,seed));
    image.rect(0,0,1,128,[54,54,50]);image.rect(7,0,1,128,[54,54,50]);
    for(let y=3;y<126;y+=8){
      image.rect(2,y,4,5,[58,6,4]);
      for(let yy=y;yy<y+5;yy++)for(let x=2;x<6;x++)image.pixel(x,yy,shade([182,18,12],.5+noise(x,yy,seed+9)*.7));
      image.rect(2,y,4,1,[238,80,60]);image.rect(2,y+4,4,1,[40,4,2]);
    }
  }else if(name==='METAL1'){
    image.rect(0,0,64,128,(x,y)=>grain([34,36,34],x,y,seed,1.1));
    for(let col=-1;col<4;col++)for(let row=-1;row<8;row++){
      const cx=col*22,cy=row*24+(mod(col,2)?12:0),r=13.4;
      const pts=[0,1,2,3,4,5].map(i=>[cx+r*Math.cos(i*TAU/6),cy+r*Math.sin(i*TAU/6)]);
      for(let i=0;i<6;i++){const a=pts[i],b=pts[(i+1)%6];image.line(a[0],a[1],b[0],b[1],2,[24,26,22]);}
      for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(128,cy+r);y++)for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(64,cx+r);x++){
        if(Math.hypot(x+.5-cx,y+.5-cy)>r)continue;
        const near=r-Math.hypot(x+.5-cx,y+.5-cy);
        const moss=near<3.4&&smoothNoise(x/2.5,y/2.5,seed+13)>.6;
        image.pixel(x,y,moss?shade([52,74,32],.55+noise(x,y,seed+15)*.6)
          :shade([58,60,58],.4+smoothNoise(x/4,y/6,seed+11)*.44+Math.max(0,near-1)*.04,rough(x,y,seed)*.9));}
    }
  }else if(name==='BROWNHUG'){
    image.rect(0,0,64,128,(x,y)=>grain(shade([74,54,28],.84+smoothNoise(x*.8,y/23,seed)*.3),x,y,seed,1.3));
  }else if(name==='STARG1'){
    image.rect(0,0,64,128,(x,y)=>grain([34,40,26],x,y,seed,1.1));
    for(let x=0;x<64;x++)if(noise(x,0,seed+3)>.62)image.rect(x,0,1,128,shade([54,60,42],.9));
    for(const [px,py] of [[3,3],[34,3],[3,66],[34,66]]){
      roundedPanel(image,px,py,27,58,[62,70,50],seed+7,true);
      image.rect(px+1,py,25,1,[112,92,86]);
      image.rect(px+1,py+56,25,1,[36,42,30]);
      for(let x=px+3;x<px+25;x+=4)image.rect(x,py+4,1,50,shade([70,78,56],.9));
    }
  }else if(/^STAR/.test(name))starWall(image,name);
  else if(/^SW[12]STRTN$/.test(name)){starWall(image,'STARTAN1');switchPlate(image,name[2]==='2');}
  else if(name==='NUKESLAD'||name==='SLADRIP2'||name==='SLADPOIS'){
    brownWall(image,'SLADWALL');
    const seed=seedOf(name);
    if(name==='NUKESLAD'){
      for(let x=0;x<64;x+=16)image.rect(x+6,110,4,4,shade([30,120,26],.55+noise(x,0,seed+3)*.5));
      for(let y=118;y<128;y++)for(let x=0;x<64;x++){
        const n=smoothNoise(x/3,y/2,seed);
        if(n>.4)image.pixel(x,y,shade([26,150,32],.4+n*.9,rough(x,y,seed)*.5));}
    }else if(name==='SLADRIP2'){
      image.rect(20,62,24,48,[5,8,3]);
      for(let x=21;x<43;x+=4)image.rect(x,62,2,14,[9,11,7]);
      for(let x=21;x<43;x++){
        if(noise(x,3,seed+9)<.42)continue;
        const len=14+Math.floor(noise(x,0,seed+5)*24);
        for(let y=70;y<70+len;y++){
          const n=smoothNoise(x/2,y/3,seed+7);
          image.pixel(x,y,shade([24,150,30],.35+n*.9+bell(y-62-len,3)*.6,rough(x,y,seed)*.6));}
      }
    }else{
      const cx=32,cy=50;
      image.polygon([[cx,cy-16],[cx+19,cy+12],[cx-19,cy+12]],(x,y)=>shade([214,168,26],.7+smoothNoise(x/3,y/3,seed)*.42,rough(x,y,seed)*.8));
      image.polygon([[cx,cy-12],[cx+15,cy+9],[cx-15,cy+9]],[24,20,6]);
      image.text('POISON',cx-9,cy-8,4,[232,186,32]);
      image.ellipse(cx,cy+4,3,2.4,[226,220,192]);
      image.rect(cx-2,cy+6,4,1,[226,220,192]);
      image.rect(cx-2,cy+3,1,1,[16,14,4]);image.rect(cx+1,cy+3,1,1,[16,14,4]);
    }
  }else if(name==='STONE2'){
    image.rect(0,0,128,128,(x,y)=>grain([86,86,84],x,y,seed,1.3));
    for(let row=0;row<8;row++){
      const y=row*16;image.rect(0,y,128,1,[32,32,30]);image.rect(0,y+1,128,1,[106,106,102]);
      for(let x=mod(row*17,32);x<128;x+=32){image.rect(x,y,1,16,[38,38,36]);image.rect(x+1,y,1,16,[112,112,108]);}
    }
    for(let i=0;i<520;i++){const x=Math.floor(noise(i,0,seed+3)*128),y=Math.floor(noise(i,1,seed+5)*128);
      image.pixel(x,y,shade([86,86,84],.5+noise(i,2,seed)*.8));}
  }else if(name==='STONE3'){
    image.rect(0,0,128,128,(x,y)=>grain([86,92,80],x,y,seed,1.2));
    for(let x=0;x<128;x+=16){
      image.rect(x,0,1,128,[34,38,30]);image.rect(x+1,0,1,128,[104,110,96]);
      for(let y=0;y<128;y++)if(noise(x,y,seed+7)>.8)image.rect(x+2,y,12,1,shade([76,84,68],.85));
    }
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const moss=smoothNoise(x/4,y/5,seed+11);
      if(moss>.88)image.pixel(x,y,shade([66,86,50],.66+moss*.34,rough(x,y,seed)*.45));}
  }else if(name==='GRAYTALL'){
    image.rect(0,0,128,128,(x,y)=>grain([140,140,136],x,y,seed,1.2));
    for(let x=0;x<128;x++)if(smoothNoise(x*.7,0,seed+3)>.62)image.rect(x,0,1,128,shade([118,118,114],.9));
    for(let y=0;y<128;y++)for(let x=99;x<103;x++)image.pixel(x,y,shade([126,20,14],.55+noise(x,y,seed+9)*.7));
  }else if(name==='PLAT1'){
    image.rect(0,0,128,128,(x,y)=>grain([92,94,92],x,y,seed,1.1));
    for(const y of [0,116]){
      image.rect(0,y,128,12,(x,yy)=>grain([78,80,78],x,yy,seed+2));
      for(let x=6;x<128;x+=16)screw(image,x,y+5);
    }
    for(const x of [8,112]){
      image.rect(x,12,10,104,(px,yy)=>shade([150,96,44],.6+smoothNoise(px/2,yy/9,seed+5)*.5,rough(px,yy,seed)*.7));
      image.rect(x+1,12,3,104,[196,142,80]);
      for(const y of [12,52,104])image.rect(x-1,y,12,8,(px,yy)=>grain([168,110,52],px,yy,seed+7));
    }
    for(let x=34;x<58;x+=4)image.rect(x,16,3,2,[186,26,18]);
    image.rect(64,16,10,2,[36,150,44]);
    image.bevel(38,52,18,12,[70,72,70],true);
    for(let i=0;i<9;i++)image.line(39+i*2,53,41+i*2,63,1,[196,164,26]);
    pipe(image,[[70,40],[86,40],[86,70]],3,[110,112,110]);
    image.rect(96,60,16,20,(x,y)=>grain([64,66,64],x,y,seed+9));
    for(let y=62;y<78;y+=3)image.rect(98,y,12,1,[36,38,36]);
  }else if(name==='DOOR1'){
    const tan=[176,138,96];
    image.rect(0,0,64,72,(x,y)=>grain([150,150,146],x,y,seed,1.1));
    image.polygon([[8,10],[8,60],[28,35]],(x,y)=>grain(shade(tan,.82),x,y,seed+7));
    image.polygon([[56,10],[56,60],[36,35]],(x,y)=>grain(shade(tan,.82),x,y,seed+7));
    image.line(8,8,56,62,4,(x,y)=>grain(tan,x,y,seed+5));
    image.line(56,8,8,62,4,(x,y)=>grain(tan,x,y,seed+5));
    image.rect(0,0,64,6,(x,y)=>grain(tan,x,y,seed));
    image.rect(0,0,6,72,(x,y)=>grain(tan,x,y,seed));
    image.rect(58,0,6,72,(x,y)=>grain(tan,x,y,seed));
    image.rect(0,64,64,8,(x,y)=>grain([120,120,116],x,y,seed+3));
    image.rect(0,0,64,1,[206,176,132]);image.rect(0,71,64,1,[70,58,40]);
  }else if(/^BROWN|^SLAD/.test(name))brownWall(image,name);
  else if(/^BRNBIG/.test(name))brownGrille(image,name);
  else if(/^COMP/.test(name))computers(image,name);
  else if(name==='PLANET1')planetWall(image);
  else if(name==='DOORBLU'||name==='DOORYEL'){
    const blue=name==='DOORBLU',stud=blue?[24,54,190]:[196,158,26];
    image.rect(0,0,8,128,(x,y)=>brushed([96,96,92],x,y,seed));
    image.rect(0,0,1,128,[54,54,50]);image.rect(7,0,1,128,[54,54,50]);
    for(let y=3;y<126;y+=8){
      image.rect(2,y,4,5,shade(stud,.35));
      for(let yy=y;yy<y+5;yy++)for(let x=2;x<6;x++)image.pixel(x,yy,shade(stud,.5+noise(x,yy,seed+9)*.8));
      image.rect(2,y,4,1,shade(stud,1.6));image.rect(2,y+4,4,1,shade(stud,.25));
    }
  }else if(/DOOR/.test(name))doors(image,name);
  else if(name==='STEP2'){
    image.rect(0,0,32,8,(x,y)=>grain([58,42,20],x,y,seed,1.3));
    image.rect(0,0,32,1,[112,90,50]);image.rect(0,7,32,1,[26,18,8]);
    for(let x=1;x<32;x+=4){image.rect(x,3,2,2,[148,116,62]);image.rect(x,4,2,1,[74,54,22]);}
  }else if(name==='STEP4'){
    image.rect(0,0,32,16,(x,y)=>grain([124,124,120],x,y,seed,1.1));
    image.rect(0,0,32,1,[156,156,150]);image.rect(0,14,32,2,[54,54,52]);
    image.rect(0,10,32,1,[96,96,92]);
    for(let x=0;x<32;x+=4)image.rect(x,2,1,8,shade([108,108,104],.9));
  }else if(name==='STONE'){
    image.rect(0,0,256,128,(x,y)=>grain([126,126,122],x,y,seed,1.25));
    for(let x=0;x<256;x++)if(smoothNoise(x*.6,0,seed+3)>.55)image.rect(x,0,1,128,shade([104,104,100],.9));
    for(let y=0;y<128;y++)for(let x=0;x<256;x++)if(noise(x*2,y*2,seed+7)>.9)image.pixel(x,y,shade([126,126,122],1.3));
    image.rect(0,58,256,6,(x,y)=>grain([150,150,144],x,y,seed+5));
    image.rect(0,58,256,1,[186,186,180]);image.rect(0,63,256,1,[70,70,66]);
  }else if(name==='SW1COMP'){
    image.rect(0,0,64,128,(x,y)=>grain([34,36,34],x,y,seed,1.1));
    image.bevel(4,4,56,56,[46,48,44],true);
    consoleScreen(image,9,9,22,18,seed,.5);consoleScreen(image,34,9,22,18,seed+3,.42);
    image.rect(12,32,40,10,(x,y)=>grain([150,132,96],x,y,seed+5));
    keyboard(image,14,44,16,12,seed+7);
    image.rect(36,44,16,12,(x,y)=>grain([70,74,68],x,y,seed+9));
    switchPlate(image,false);
  }else if(name==='SW1BRNGN'){
    brownWall(image,'BROWNGRN');
    for(let x=0;x<64;x+=7)for(let y=0;y<128;y++)
      if(noise(x,y,seed+5)>.86)image.rect(x,y,1,3,[126,72,26]);
    wallSwitch(image,21,72,[36,120,36]);
  }else if(name==='SW1SLAD'){
    brownWall(image,'SLADWALL');
    wallSwitch(image,21,72,[200,0,0]);
  }else if(name==='SW1STON1'){
    image.rect(0,0,64,128,(x,y)=>grain([76,76,74],x,y,seed,1.3));
    for(let row=0;row<8;row++){
      const y=row*16;image.rect(0,y,64,1,[28,28,26]);image.rect(0,y+1,64,1,[96,96,92]);
      for(let x=mod(row*17,32);x<64;x+=32)image.rect(x,y,1,16,[32,32,30]);
    }
    switchPlate(image,false);
  }else if(name==='SW1PIPE'){
    copperPipes(image,128,128,seed);
    image.rect(46,64,36,44,(x,y)=>grain([104,106,102],x,y,seed+13,1.1));
    image.bevel(48,66,32,40,[124,126,122]);
    image.rect(58,72,12,18,[40,42,40]);image.rect(60,74,8,14,[188,10,8]);
    image.rect(63,92,2,8,[70,72,68]);image.rect(59,99,10,3,[96,98,94]);
    for(const [x,y] of [[52,70],[72,70],[52,100],[72,100]])screw(image,x,y,[150,152,148]);
  }else if(name==='TEKWALL2'||name==='TEKWALL5'){
    denseTechwall(image,seed);
    if(name==='TEKWALL2'){
      for(const [cx,cy] of [[26,18],[102,18]]){
        image.bevel(cx-9,cy-9,18,18,[86,78,52]);
        image.ellipse(cx,cy,6,6,[26,26,22],true);
        image.line(cx,cy,cx+4,cy-3,1,[196,180,120]);
      }
      image.bevel(46,44,36,26,[92,84,56],true);
      for(let y=48;y<68;y+=4)image.rect(50,y,28,2,[140,128,84]);
      for(const [x,y] of [[18,96],[104,88],[62,108]])image.rect(x,y,6,6,shade([110,100,64],1.1));
    }else{
      image.bevel(18,78,40,40,[84,76,50]);
      image.ellipse(38,98,15,15,[52,48,30],true);
      for(let i=0;i<8;i++){const a=i*TAU/8;
        image.line(38+Math.cos(a)*6,98+Math.sin(a)*6,38+Math.cos(a)*14,98+Math.sin(a)*14,2,[128,116,74]);}
      image.ellipse(38,98,4,4,[150,138,92]);
      for(const [x,y] of [[96,26],[110,26],[96,40],[110,54]])image.rect(x,y,4,4,[188,22,14]);
      image.bevel(78,64,30,22,[86,78,50],true);
      for(let y=68;y<84;y+=3)image.rect(81,y,24,1,[132,120,80]);
    }
  }else if(/^TEK/.test(name))technicalWall(image,name);
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

function brushedBase(image,seed,tint=[118,118,114]) {
  image.rect(0,0,64,64,(x,y)=>brushed(tint,x,y,seed));
  for(const y of [0,32])image.rect(0,y,64,1,[84,84,80]);
}
function consoleScreen(image,x,y,w,h,seed,density=.58) {
  image.bevel(x,y,w,h,[58,58,54],true);image.rect(x+2,y+2,w-4,h-4,[6,9,6]);
  for(let py=y+3;py<y+h-3;py+=2)for(let px=x+3;px<x+w-3;px+=2){
    const n=noise(px,py,seed);if(n>density)image.rect(px,py,1,1,shade([26,168,46],.45+n*.85));}
}
function blueBar(image,x,y,w,h) {
  image.rect(x,y,w,h,[10,14,84]);
  for(let px=x+1;px<x+w-1;px+=3)image.rect(px,y+1,2,Math.max(1,h-2),[28,50,186]);
}
function bluePad(image,x,y,size,blue=true) {
  image.bevel(x,y,size,size,[70,70,66],true);
  image.rect(x+2,y+2,size-4,size-4,blue?[16,26,142]:[92,92,88]);
  if(blue)image.rect(x+3,y+3,size-6,2,[52,84,214]);
}
function consoleFlat(image,variant) {
  const seed=seedOf('CONS1_'+variant);
  brushedBase(image,seed);
  if(variant===1){
    blueBar(image,17,5,20,3);blueBar(image,41,5,10,3);
    consoleScreen(image,20,20,22,20,seed,.56);
    keyboard(image,46,22,12,14,seed);
    bluePad(image,5,22,8,true);bluePad(image,5,34,8,false);
    bluePad(image,24,46,7,true);bluePad(image,34,46,7,false);
  }else if(variant===5){
    keyboard(image,6,20,12,14,seed);
    consoleScreen(image,22,20,20,20,seed,.56);
    bluePad(image,48,22,8,true);bluePad(image,48,34,8,false);
    blueBar(image,17,54,20,3);blueBar(image,41,54,10,3);
  }else{
    image.rect(4,10,4,44,[16,24,120]);for(let y=12;y<52;y+=6)image.rect(5,y,2,4,[54,86,214]);
    keyboard(image,16,10,12,12,seed);keyboard(image,44,10,12,12,seed+3);
    consoleScreen(image,24,26,20,20,seed,.5);
    bluePad(image,24,50,7,true);bluePad(image,34,50,7,false);bluePad(image,44,50,7,false);
  }
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(noise(x,y,seed+9)>.985)image.pixel(x,y,[150,150,146]);
}
function hexFloor(image,seed) {
  image.rect(0,0,64,64,(x,y)=>grain([96,74,34],x,y,seed,1.1));
  for(let col=-1;col<4;col++)for(let row=-1;row<5;row++){
    const cx=col*22,cy=row*24+(mod(col,2)?12:0),r=13.4;
    const pts=[0,1,2,3,4,5].map(i=>[cx+r*Math.cos(i*TAU/6),cy+r*Math.sin(i*TAU/6)]);
    for(let i=0;i<6;i++){const a=pts[i],b=pts[(i+1)%6];image.line(a[0],a[1],b[0],b[1],1,[50,36,12]);}
  }
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(noise(x*3,y*3,seed+7)>.92)image.pixel(x,y,shade([122,98,48],1.15));
}
function louverFloor(image,name) {
  const cool=name==='FLOOR4_5',base=cool?[88,86,70]:[112,90,54],slat=cool?[112,110,90]:[136,110,70];
  image.rect(0,0,64,64,(x,y)=>grain(base,x,y,seedOf(name),1.2));
  for(let y=1;y<64;y+=4){
    image.rect(0,y,42,2,shade(slat,1,(noise(0,y,7)-.5)*8));
    image.rect(0,y+2,42,1,[42,36,24]);
    image.rect(45,y,17,2,shade(slat,.82));image.rect(45,y+2,17,1,[42,36,24]);
  }
  image.rect(43,0,1,64,[48,40,26]);
  for(let i=0;i<9;i++){
    const rx=Math.floor(noise(i,0,seedOf(name)+3)*46),ry=Math.floor(noise(i,1,seedOf(name)+5)*60);
    for(let k=0;k<6;k++)image.rect(mod(rx,64),mod(ry+k,64),1,1,[138,78,22]);
  }
}
function slabFloor(image,seed,base,rows,weights) {
  image.rect(0,0,64,64,(x,y)=>grain(base,x,y,seed,1.15));
  const h=64/rows;
  for(let row=0;row<rows;row++){
    const y=Math.round(row*h);image.rect(0,y,64,1,shade(base,.4));
    let x=mod(Math.round(noise(row,0,seed+2)*weights[row%weights.length]),64);
    for(let guard=0;x<64&&guard<64;guard++){
      const w=weights[(row*7+Math.floor(x))%weights.length];
      if(!(w>0))throw new Error('slabFloor needs positive slab widths');
      image.rect(Math.round(x),y,1,Math.round(h),shade(base,.4));x+=w;
    }
  }
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(noise(x*3,y*3,seed+5)>.96)image.pixel(x,y,shade(base,1.2));
}
function gratingFlat(image,seed) {
  image.rect(0,0,64,64,(x,y)=>grain([96,96,90],x,y,seed));
  for(const x0 of [5,35]){
    image.rect(x0,0,24,64,(x,y)=>grain([48,38,12],x,y,seed+4,1.1));
    for(let y=1;y<64;y+=2)for(let x=x0+1;x<x0+23;x+=2)if(noise(x,y,seed+6)>.55)image.rect(x,y,1,1,[86,70,28]);
    image.rect(x0,0,1,64,[28,22,8]);image.rect(x0+23,0,1,64,[28,22,8]);
  }
  image.rect(30,0,4,64,(x,y)=>grain([96,96,90],x,y,seed));
}
function blueDisc(image,seed) {
  image.rect(0,0,64,64,(x,y)=>brushed([122,122,118],x,y,seed));
  const cx=31.5,cy=31.5,r=26;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy);
    if(d>r+1.5)continue;
    if(d>r-.5){image.pixel(x,y,shade([96,96,92],.8+smoothNoise(x/3,y/3,seed)*.3));continue;}
    const notch=(Math.abs(dx)<1.6||Math.abs(dy)<1.6)&&d>r-4;
    if(notch){image.pixel(x,y,[104,104,100]);continue;}
    const mottle=smoothNoise(x/2.5,y/7,seed+11),streak=smoothNoise(x/9,y/1.5,seed+12);
    image.pixel(x,y,shade([12,28,164],.5+mottle*.5+streak*.26+bell(d-r+3,1.4)*.4,rough(x,y,seed)*.7));
  }
}

export function proceduralFlat(value) {
  const name=String(value||'').toUpperCase();if(!FLAT_NAMES.includes(name))return null;if(flats.has(name))return flats.get(name);
  const image=new Raster(64,64),seed=seedOf(name);
  if(/^NUKAGE/.test(name))acid(image,(Number(name.at(-1))-1)*TAU/3);
  else if(/^CONS1_/.test(name))consoleFlat(image,Number(name.at(-1)));
  else if(name==='MFLR8_1'){
    image.rect(0,0,64,64,(x,y)=>{const fleck=noise(x*3,y*3,seed+7);
      return shade([74,74,72],.6+smoothNoise(x/3,y/3,seed)*.5+(fleck>.86?.3:0),rough(x,y,seed)*1.5);});
    for(const x of [20,41])image.rect(x,0,2,64,[26,26,25]);
    for(const y of [0,31])image.rect(0,y,64,2,[26,26,25]);
  }else if(name==='FLOOR4_5'||name==='FLOOR4_1')louverFloor(image,name);
  else if(name==='FLOOR5_3')hexFloor(image,seed);
  else if(name==='FLOOR5_4')slabFloor(image,seed,[100,70,32],4,[13,19,23]);
  else if(name==='FLOOR0_3')slabFloor(image,seed,[110,110,106],4,[11,17,21]);
  else if(name==='FLOOR3_3'){
    image.rect(0,0,64,64,(x,y)=>grain([142,122,88],x,y,seed,1.2));
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const moss=smoothNoise(x/3+y/6,y/3,seed+21);
      if(moss>.72&&noise(x,y,seed+22)>.55)image.pixel(x,y,shade([92,108,60],.66+moss*.45,rough(x,y,seed)*.5));}
  }else if(name==='FLAT10'){
    image.rect(0,0,64,64,(x,y)=>{const n=noise(x*2,y*2,seed),m=smoothNoise(x/3,y/3,seed+3);
      return shade(n>.52?[58,40,14]:[24,18,8],.55+m*.6,(n-.5)*26);});
  }else if(name==='FLAT22')blueDisc(image,seed);
  else if(name==='FLAT5_4'){
    image.rect(0,0,64,64,(x,y)=>grain([128,128,124],x,y,seed,1.3));
    for(let x=0;x<64;x++)if(noise(x,0,seed+3)>.72)image.rect(x,0,1,64,shade([104,104,100],.9));
  }else if(name==='CEIL4_3'){
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const d=Math.hypot(x+.5-31.5,y+.5-31.5),glow=clamp(1-d/30);
      image.pixel(x,y,[6+glow*16,8+glow*26,34+glow*150+noise(x,y,seed)*22]);
    }
    for(let x=0;x<64;x+=4)image.rect(x,0,1,64,[2,3,14]);
    for(let y=0;y<64;y+=4)image.rect(0,y,64,1,[2,3,14]);
  }else if(name==='FLOOR6_1'){
    image.rect(0,0,64,64,(x,y)=>{const n=noise(x*3,y*3,seed),m=smoothNoise(x/4,y/4,seed+3);
      return shade(n>.52?[118,14,8]:[30,5,3],.6+m*.6,(n-.5)*18);});
  }
  else if(name==='STEP1')gratingFlat(image,seed);
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
