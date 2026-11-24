/**
 * Continuous, physically separated surface recipes for the generated E1M1.
 *
 * All dimensions below are Doom texture units. They describe the panels,
 * paving, rails and controls visible in the original designs; no sampled
 * reference artwork is stored or read. The legacy resource supplies its UV
 * extent and, for small instrument graphics, its already procedural colour.
 *
 * pixels:           sRGB base colour / coverage
 * normalRoughness:  tangent normal XYZ in [0,255] / perceptual roughness
 * surface:          metalness / ambient occlusion / emission / height
 * Height = (surface.A / 255 - .5) * heightScale, in Doom units.
 * Normals already include that physical scale. Tangent Y follows image V.
 */
import {clamp, noise, seedOf} from './procedural-raster.js';

export const SURFACE_DETAIL_BUDGET = 48 * 1024 * 1024;
const cache = new Map();
let cacheBytes = 0, generations = 0, hits = 0, evictions = 0, peakWorkingBytes = 0;
const TAU = Math.PI * 2, SQRT2 = Math.SQRT2;
const mod = (a, b) => ((a % b) + b) % b;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const normHash = (x, y, seed) => noise(x, y, seed) * 2 - 1;

// Periodic continuous value noise. Wrapping in reference units means the
// microscopic surface joins at texture boundaries, even with a non-square map.
function grain(x, y, size, seed, width, height) {
  const sx = width / Math.max(1, Math.round(width / size));
  const sy = height / Math.max(1, Math.round(height / size));
  const px = x / sx, py = y / sy, ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const nx = Math.round(width / sx), ny = Math.round(height / sy);
  const a = noise(mod(ix, nx), mod(iy, ny), seed), b = noise(mod(ix + 1, nx), mod(iy, ny), seed);
  const c = noise(mod(ix, nx), mod(iy + 1, ny), seed), d = noise(mod(ix + 1, nx), mod(iy + 1, ny), seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function roundedDistance(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - halfWidth + radius;
  const qy = Math.abs(y - cy) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy;
  const t = ll ? clamp(((x - ax) * dx + (y - ay) * dy) / ll) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function polygonDistance(x, y, points) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    distance = Math.min(distance, segmentDistance(x, y, a[0], a[1], b[0], b[1]));
  }
  return inside ? -distance : distance;
}

function set(out, color, h = 0, roughness = .55, metal = .05, ao = 1, emission = 0, alpha = 255) {
  out[0] = color[0]; out[1] = color[1]; out[2] = color[2]; out[3] = h;
  out[4] = roughness; out[5] = metal; out[6] = ao; out[7] = emission; out[8] = alpha;
}

function tint(out, color, amount) {
  out[0] = lerp(out[0], color[0], amount); out[1] = lerp(out[1], color[1], amount); out[2] = lerp(out[2], color[2], amount);
}

// A rolled panel edge is represented in height. No highlight or directional
// lighting is painted into its albedo; the renderer illuminates the bevel.
function panel(out, distance, color, top = .45, bevel = .85, roughness = .46, metal = .05) {
  if (distance > .45) return;
  const mask = 1 - smooth(-.12, .35, distance);
  const rise = smooth(0, bevel, -distance);
  tint(out, color, mask);
  out[3] = lerp(out[3], lerp(-.32, top, rise), mask);
  out[4] = lerp(out[4], roughness, mask);
  out[5] = lerp(out[5], metal, mask);
  out[6] = lerp(out[6], lerp(.67, 1, smooth(0, bevel * 1.6, -distance)), mask);
  // A restrained exposed metal rim where stamped paint is worn through.
  const wear = Math.exp(-Math.pow((-distance - .3) / .14, 2)) * .28;
  tint(out, [145, 143, 130], wear);
  out[5] = Math.max(out[5], wear * .75);
}

// Folded sheet has a fine assembly gap and a short rolled lip, rather than
// the deep, broad rubber-like channels appropriate to a heavy door recess.
function stampedPanel(out,distance,color,top=.16,bevel=.5,metal=.08,roughness=.47){
  if(distance>.18)return;
  const mask=1-smooth(-.05,.17,distance),rise=smooth(0,bevel,-distance);
  tint(out,color,mask);out[3]=lerp(out[3],lerp(-.11,top,rise),mask);
  out[4]=lerp(out[4],roughness,mask);out[5]=lerp(out[5],metal,mask);
  out[6]=lerp(out[6],lerp(.88,1,smooth(0,bevel*.9,-distance)),mask);
  const lip=Math.exp(-Math.pow((-distance-.12)/.085,2))*.2;
  tint(out,[151,152,137],lip);out[5]=Math.max(out[5],lip*.95);
}

function bolt(out, x, y, cx, cy, radius = .63, seed = 0) {
  const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
  if (r > radius + .34) return;
  const angle = Math.atan2(dy, dx), hex = Math.cos(mod(angle + Math.PI / 6, Math.PI / 3) - Math.PI / 6);
  const d = r * hex - radius * .88;
  if (d > 0) { out[3] -= (1 - smooth(0, .3, d)) * .13; out[6] *= .78; return; }
  const cut = Math.abs(dx * Math.cos(seed) + dy * Math.sin(seed)) < .105 && r < radius * .65;
  tint(out, cut ? [42, 43, 40] : [137, 138, 128], .95);
  out[3] += cut ? .09 : .26 * smooth(0, .18, -d);
  out[4] = cut ? .61 : .29; out[5] = .88; out[6] = cut ? .65 : 1;
}

function brush(out, x, y, seed, width, height, amount = 1) {
  const micro = normHash(Math.floor(x * 7), Math.floor(y * 7), seed);
  const strand = normHash(Math.floor(x * 5), 0, seed + 17);
  const drift = grain(x, y, 8, seed + 9, width, height) - .5;
  const variation = (micro * .75 + strand * .85 + drift * 3) * amount;
  out[0] += variation; out[1] += variation; out[2] += variation;
  out[3] += (micro * .006 + strand * .013) * amount;
  out[4] = clamp(out[4] + (strand * .025 + drift * .06) * amount, .12, .95);
  // Sub-millimetric drag marks and occasional tiny impacts affect the BRDF
  // more than pigment. Their sparse cells are jittered, never a visible grid.
  if(out[7]<.07&&out[6]>.8){
    const cx=Math.floor(x/7),cy=Math.floor(y/11),chance=noise(cx,cy,seed+501);
    if(chance>.73){
      const angle=normHash(cx,cy,seed+502)*.7,dx=x-(cx+.5)*7,dy=y-(cy+.5)*11;
      const along=dx*Math.cos(angle)+dy*Math.sin(angle),across=-dx*Math.sin(angle)+dy*Math.cos(angle);
      const length=1+noise(cx,cy,seed+503)*2.1;
      const mark=(1-smooth(.028,.13,Math.abs(across)))*(1-smooth(length-.35,length,Math.abs(along)))*amount;
      out[3]-=mark*.022;out[4]=lerp(out[4],.28,mark*.5);
      tint(out,[142,143,132],mark*.12);out[5]=Math.max(out[5],mark*.45);
    }
    if(chance>.96){
      const px=x-(cx+.28)*7,py=y-(cy+.71)*11,pit=1-smooth(.09,.26,Math.hypot(px,py));
      out[3]-=.055*pit;out[6]*=1-.13*pit;tint(out,[67,65,51],pit*.22);
    }
  }
}

function concrete(out, x, y, seed, width, height, strength = 1) {
  const fine = normHash(Math.floor(x * 6), Math.floor(y * 6), seed);
  const aggregate = grain(x, y, .7, seed + 27, width, height);
  const cloud = grain(x, y, 7.2, seed + 47, width, height) - .5;
  const pores = smooth(.8, .98, grain(x, y, .43, seed + 37, width, height));
  const delta = (fine * 2 + (aggregate - .5) * 8 + cloud * 11 - pores * 12) * strength;
  out[0] += delta; out[1] += delta; out[2] += delta * .92;
  out[3] += ((aggregate - .5) * .08 + fine * .008 - pores * .065) * strength;
  out[4] = clamp(out[4] + (aggregate - .5) * .08 + pores * .05, .4, .98);
  out[6] *= 1 - pores * .12;
}

function sampleBase(base, x, y, out) {
  const ix = Math.floor(x - .5), iy = Math.floor(y - .5), fx = x - .5 - ix, fy = y - .5 - iy;
  const xa = mod(ix, base.width), xb = mod(ix + 1, base.width), ya = mod(iy, base.height), yb = mod(iy + 1, base.height);
  const a = (ya * base.width + xa) * 4, b = (ya * base.width + xb) * 4;
  const c = (yb * base.width + xa) * 4, d = (yb * base.width + xb) * 4;
  for (let k = 0; k < 3; k++) out[k] = lerp(lerp(base.pixels[a+k],base.pixels[b+k],fx),lerp(base.pixels[c+k],base.pixels[d+k],fx),fy);
  out[8] = lerp(lerp(base.pixels[a+3],base.pixels[b+3],fx),lerp(base.pixels[c+3],base.pixels[d+3],fx),fy);
}

function starSampler(name, width, height, seed) {
  const baseName = /^SW[12]/.test(name) ? 'STARTAN1' : name;
  const colorAt = column => {
    if (baseName === 'STARGR1') return [132, 133, 130];
    if (baseName === 'STARG3') return column % 4 === 0 || column % 4 === 3 ? [121, 126, 100] : [134, 135, 130];
    if (baseName === 'STARTAN3') return column % 4 === 0 || column % 4 === 3 ? [130, 108, 82] : [130, 132, 127];
    return [128, 104, 73];
  };
  const colors = Array.from({length:Math.ceil(width/32)}, (_,i)=>colorAt(i));
  return (x, y, out) => {
    const column = Math.floor(x/32), localX = mod(x,32), color = colors[column];
    set(out, [color[0]*.82,color[1]*.82,color[2]*.82], .015, .58, .15, .96);
    // The four characteristic stamped sections in each 32-unit column.
    stampedPanel(out,roundedDistance(localX,y,16,6.5,15.65,5.75,1.15),color,.25,.68,.52,.36);
    stampedPanel(out,roundedDistance(localX,y,16,29,15.65,14.65,.8),color,.16,.48,.08,.47);
    stampedPanel(out,roundedDistance(localX,y,16,63.5,15.65,5.75,1.15),color,.25,.68,.52,.36);
    stampedPanel(out,roundedDistance(localX,y,16,92,15.65,20.65,.8),color,.16,.48,.08,.47);
    const verticalGap=1-smooth(.07,.34,Math.min(localX,32-localX));
    out[3]-=verticalGap*.22;out[6]*=1-verticalGap*.15;tint(out,[67,68,56],verticalGap*.28);
    const panelRow=y>16&&y<42?0:y>74&&y<111?1:-1;
    if(panelRow>=0&&localX>2&&localX<30){
      const top=panelRow===0?16:74,bottom=panelRow===0?42:111;
      const fade=smooth(top,top+2,y)*(1-smooth(bottom-2,bottom,y));
      // Shallow stamped vertical folds make the original long streaks catch
      // light as metal, without turning the whole plate into corrugated sheet.
      for(const foldX of [4.5,11,21,27]){
        const groove=Math.exp(-(((localX-foldX)/.48)**2))*fade;
        out[3]-=.046*groove;out[4]-=.035*groove;
        tint(out,[color[0]*.91,color[1]*.91,color[2]*.91],groove*.24);
      }
      out[3]+=.025*Math.sin((localX-2)/28*Math.PI)*fade;
    }
    if ((y > 45 && y < 55) || y > 116) {
      stampedPanel(out,roundedDistance(localX,y,16,y>116?122:50,15.65,y>116?5.8:4.8,.2),[color[0]*.84,color[1]*.84,color[2]*.83],.04,.28,.25,.57);
      // Fine etched rows belong to the original lower and intermediate trims.
      const ridges = Math.exp(-Math.pow((mod(x,.95)-.475)/.1,2));
      out[3] += ridges*.012; out[4] += .015*ridges;
    }
    brush(out,x,y,seed,width,height,.82);
    // Vertical weathering remains soft and sparse rather than zebra stripes.
    const run = smooth(.63,.91,grain(x,y*.125,3.2,seed+102,width,height));
    const weather = run * (y < 44 ? smooth(18,41,y) : smooth(75,110,y)) * .09;
    tint(out,[81,72,54],weather); out[4] += weather*.25;
    if (baseName==='STARTAN2') {
      if (y>=46&&y<=53&&(x<63||x>98)) {
        const ox=x<63?2:98, ww=x<63?60:28;
        panel(out,roundedDistance(x,y,ox+ww*.5,49.5,ww*.5,3.5,.35),[79,66,45],.12,.45,.5,.3);
        if(y>47.5&&y<51.5&&x>ox+2&&x<ox+ww-2&&mod(x-ox,4)<1.35) {
          tint(out,[24,26,21],.9);out[3]=-.52;out[6]=.58;
        }
      }
      if(x>70&&x<92&&y>81&&y<105) {
        panel(out,roundedDistance(x,y,81,93,11,12,.7),[66,60,43],.18,.65,.6,.1);
        if(x>74&&x<89&&mod(x-74,5)<1.8){out[3]=.42;tint(out,[123,119,99],.85);out[5]=.8;}
        if((Math.abs(y-86)<.7||Math.abs(y-99)<.7)&&x>74&&x<89&&mod(x-74,5)<1.9){tint(out,[125,24,13],.96);out[7]=.12;}
      }
    }
    if (/^SW[12]/.test(name)) {
      if(x>20.6&&x<46.4&&y>71.6&&y<104.4) {
        panel(out,roundedDistance(x,y,33.5,88,12.5,16,.6),[90,91,81],.8,.7,.43,.78);
        if (x>24&&x<35&&y>75&&y<99) {set(out,[25,30,24],-.3,.4,.3,.6);}
        const on=name==='SW2STRTN';
        if(x>26&&x<34&&y>77&&y<85) {panel(out,roundedDistance(x,y,30,81,4,4,.7),on?[63,13,7]:[176,14,5],.38,.6,.22,0);out[7]=on?.03:.7;}
        if(x>26&&x<34&&y>91&&y<99) {panel(out,roundedDistance(x,y,30,95,4,4,.7),on?[50,124,18]:[20,40,11],.38,.6,.22,0);out[7]=on?.65:.015;}
        panel(out,roundedDistance(x,y,40,on?92.5:81.5,2,1.5,.3),[150,147,126],.93,.35,.25,.88);
        bolt(out,x,y,22.3,73.7,.47,.4);bolt(out,x,y,44.7,102.1,.47,.4);
      }
    }
  };
}

function hexFloorSampler(name,width,height,seed) {
  const brown=name==='FLOOR5_2', rust=name==='FLOOR5_1';
  return (x,y,out)=>{
    let edge=-Infinity,tx=0,ty=0;
    for(let col=-1;col<=3;col++)for(let row=-1;row<=3;row++){
      const cx=8+col*32,cy=row*32+(mod(col,2)?16:0),dx=x-cx,dy=y-cy;
      const d=Math.min(16-Math.abs(dy),(24-Math.abs(dx)-Math.abs(dy))/SQRT2);
      if(d>edge){edge=d;tx=mod(col,2);ty=mod(row,2);}
    }
    const tileShade=normHash(tx,ty,seed)*2.4;
    const color=brown?[109+tileShade,81+tileShade,42+tileShade]:[90+tileShade,93+tileShade,89+tileShade];
    set(out,brown?[46,35,21]:[30,34,30],-.5,.85,0,.61);
    const bevel=smooth(.35,1.6,edge);
    const inside=smooth(.15,.5,edge);
    tint(out,color,inside);out[3]=lerp(-.5,.17,bevel);
    out[6]=lerp(.6,1,smooth(.25,3.2,edge));out[4]=lerp(.89,brown?.73:.65,inside);
    concrete(out,x,y,seed,width,height,.64);
    // Hairline mineral cracks run within the paving, with zero metalness.
    const fissure=Math.abs(grain(x,y,4.2,seed+61,width,height)-.48);
    const crack=(1-smooth(.006,.021,fissure))*smooth(1.4,3,edge)*smooth(.56,.8,grain(x,y,12,seed+73,width,height));
    tint(out,[42,43,35],crack*.18);out[3]-=crack*.055;
    const edgeRegion=1-smooth(1.1,5.2,edge);
    const stain=smooth(.7,.88,grain(x,y,3.5,seed+39,width,height))*edgeRegion;
    tint(out,brown||rust?[126,74,31]:[37,58,29],stain*(rust?.55:.35));out[4]+=stain*.08;
  };
}

function slabSampler(name,width,height,seed) {
  return (x,y,out)=>{
    if(name==='FLAT20') {
      set(out,[54,57,53],-.3,.64,.2,.7);
      panel(out,roundedDistance(mod(x,8),mod(y,8),4,4,3.65,3.65,.24),[104,107,101],.24,.6,.5,.58);
      brush(out,x,y,seed,width,height,.5);return;
    }
    if(name==='FLAT23') {
      set(out,[119,122,116],0,.38,.83);brush(out,x,y,seed,width,height,1);return;
    }
    const stone=name==='FLAT18',base=stone?[116,116,109]:[76,78,73];
    set(out,[32,34,31],-.44,.89,0,.65);
    if(stone)panel(out,roundedDistance(x,mod(y,32),32,16,31.2,15.2,.45),base,.17,.8,.77,0);
    else {
      const xEdge=Math.min(Math.abs(x-17),Math.abs(x-49));
      const yEdge=x<17||x>49?Math.abs(y-12):Math.abs(y-58);
      const edge=Math.min(xEdge,yEdge);
      tint(out,base,smooth(.3,.95,edge));out[3]=lerp(-.45,.13,smooth(.3,1.4,edge));out[6]=lerp(.65,1,smooth(.3,2.2,edge));out[4]=.82;
    }
    concrete(out,x,y,seed,width,height,stone?.95:.75);
  };
}

function stoneSampler(name,width,height,seed) {
  const dark=name==='CEIL5_1'||name==='CEIL5_2',blue=name==='FLAT14'||name==='FLOOR1_1';
  const color=blue?[7,10,87]:name==='CEIL5_1'?[39,40,37]:name==='CEIL5_2'?[54,47,28]:name==='FLOOR6_2'?[31,34,31]:name==='FLOOR7_2'?[77,83,49]:name==='FLAT5_5'?[113,87,52]:[82,63,34];
  return (x,y,out)=>{
    set(out,color,0,blue?.56:.86,0);
    concrete(out,x,y,seed,width,height,dark?.8:1.2);
    const mineral=grain(x,y,3.7,seed+101,width,height),broad=grain(x,y,13,seed+111,width,height);
    if(name==='FLOOR6_2'){
      const fractured=grain(x,y,1.55,seed+171,width,height)*.67+grain(x,y,4.5,seed+172,width,height)*.26+grain(x,y,.48,seed+173,width,height)*.07;
      const ridge=Math.pow(clamp(1-Math.abs(fractured-.49)*5.8),2);
      tint(out,[145,150,140],ridge*.86);out[3]+=(ridge-.5)*.28;out[4]=.82-ridge*.12;
    }else if(!dark&&!blue) {
      const vein=1-smooth(.018,name==='FLOOR6_2'?.135:.05,Math.abs(mineral+(.5-broad)*.16-.52));
      tint(out,name==='FLOOR6_2'?[147,152,142]:[129,107,69],vein*(name==='FLOOR6_2'?.82:.16));
      out[3]+=(mineral-.5)*.12;out[4]-=vein*.05;
    }
    if(name==='FLOOR7_2'){
      const wx=x+(grain(x,y,12,seed+200,width,height)-.5)*8;
      const wy=y+(grain(x,y,12,seed+210,width,height)-.5)*8;
      const cell=width/5,gx=Math.floor(wx/cell),gy=Math.floor(wy/cell);let a=1e9,b=1e9;
      for(let cy=gy-1;cy<=gy+1;cy++)for(let cx=gx-1;cx<=gx+1;cx++){
        const hx=noise(mod(cx,5),mod(cy,5),seed+212),hy=noise(mod(cx,5),mod(cy,5),seed+213);
        const d=Math.hypot(wx-(cx+hx*.6+.2)*cell,wy-(cy+hy*.6+.2)*cell);
        if(d<a){b=a;a=d;}else if(d<b)b=d;
      }
      const edge=b-a,face=smooth(.4,1.5,edge);
      tint(out,[33,34,22],1-face);out[3]+=lerp(-.48,.17,smooth(.2,3,edge));out[6]*=lerp(.62,1,face);
    }
    if(name==='FLOOR1_1'){
      const ring=Math.abs(Math.hypot((x-32)/1.2,y-32)-17)<6;
      const arrow=x>23&&x<48&&Math.abs(y-32)<(48-x)*.53;
      if(ring&&!arrow&&!(x>17&&x<24&&y<24)){tint(out,[10,12,142],.9);out[3]+=.018;out[4]=.46;}
    }
  };
}

function liquidSampler(name,width,height,seed) {
  const phase=(Number(name.slice(-1))-1)*TAU/3;
  return (x,y,out)=>{
    const wx=x+Math.sin(y/width*TAU+phase)*3.3,wy=y+Math.cos(x/width*TAU-phase)*2.7;
    const broad=grain(wx,wy,9,seedOf('NUKAGE'),width,height),fine=grain(wx,wy,2.8,seedOf('NUKAGE')+41,width,height);
    const veins=1-smooth(.012,.09,Math.abs(broad-.54));
    set(out,[8+fine*7,45+broad*48+veins*16,5+fine*8],(broad-.5)*.33+(fine-.5)*.035,.19+fine*.07,0,1,.08+veins*.12);
    const bubbles=smooth(.9,.99,grain(wx,wy,1.4,seedOf('NUKAGE')+88,width,height));
    tint(out,[49,109,25],bubbles*.35);out[3]+=bubbles*.08;out[4]+=.03*bubbles;
  };
}

function lightSampler(name,width,height,seed) {
  const red=name==='TLITE6_5',multiple=name==='TLITE6_5'||name==='TLITE6_6',brown=name==='TLITE6_4'||name==='TLITE6_6';
  return(x,y,out)=>{
    set(out,brown?[54,47,28]:[39,40,37],0,.87,0);
    concrete(out,x,y,seed,width,height,.65);
    const cx=multiple?Math.floor(x/32)*32+16:32,cy=multiple?Math.floor(y/32)*32+16:32;
    const d=multiple?Math.hypot(x-cx,y-cy)-3.9:(Math.abs(x-cx)+Math.abs(y-cy)-13)/SQRT2;
    if(d<1.5){tint(out,[29,32,26],1-smooth(.8,1.5,d));out[3]=-.28;out[6]=.65;out[5]=.45;out[4]=.44;}
    if(d<.6){panel(out,d,red?[185,13,7]:[223,190,153],.03,.45,.24,0);out[7]=(1-smooth(-.5,.35,d))*(red?.8:1);out[6]=1;
      const rib=Math.cos((x-y)*TAU/.85);out[3]+=.016*rib;out[4]+=.018*rib;}
  };
}

// Build vector mechanical details once, then evaluate their signed distances
// at the final sampling resolution. These are measurements/construction rules,
// not an encoded raster or a mesh imported from another renderer.
function designBuilder() {
  const shapes=[];
  const box=(x,y,w,h,color,top=.5,bevel=.45,rough=.4,metal=.8,radius=.3,emission=0)=>{
    shapes.push({type:0,x:x+w*.5,y:y+h*.5,rx:w*.5,ry:h*.5,radius,color,top,bevel,rough,metal,emission,minX:x-.5,maxX:x+w+.5,minY:y-.5,maxY:y+h+.5});
  };
  const pipe=(ax,ay,bx,by,radius,color,top=.8,rough=.3,metal=.85)=>{
    shapes.push({type:1,ax,ay,bx,by,radius,color,top,rough,metal,minX:Math.min(ax,bx)-radius-.5,maxX:Math.max(ax,bx)+radius+.5,minY:Math.min(ay,by)-radius-.5,maxY:Math.max(ay,by)+radius+.5});
  };
  const polygon=(points,color,top=-.35,bevel=.6,rough=.6,metal=.5)=>{
    shapes.push({type:2,points,color,top,bevel,rough,metal,emission:0,minX:Math.min(...points.map(p=>p[0]))-.5,maxX:Math.max(...points.map(p=>p[0]))+.5,minY:Math.min(...points.map(p=>p[1]))-.5,maxY:Math.max(...points.map(p=>p[1]))+.5});
  };
  const circle=(x,y,radius,color,top=.4,bevel=.4,rough=.4,metal=.8,emission=0)=>{
    shapes.push({type:3,x,y,radius,color,top,bevel,rough,metal,emission,minX:x-radius-.5,maxX:x+radius+.5,minY:y-radius-.5,maxY:y+radius+.5});
  };
  const frame=(x,y,w,h,color,top=.55,thickness=.9,inner=[34,37,32])=>{
    box(x,y,w,h,color,top,.4,.38,.8,.3);
    box(x+thickness,y+thickness,w-2*thickness,h-2*thickness,inner,-.3,.35,.57,.2,.25);
  };
  const polyline=(points,radius,color,top=.8,rough=.3,metal=.85)=>{
    for(let i=1;i<points.length;i++)pipe(...points[i-1],...points[i],radius,color,top,rough,metal);
  };
  return{shapes,box,pipe,polygon,circle,frame,polyline};
}

function paintDesign(shapes,x,y,out) {
  for(const s of shapes) {
    if(x<s.minX||x>s.maxX||y<s.minY||y>s.maxY)continue;
    if(s.type===1){
      const d=segmentDistance(x,y,s.ax,s.ay,s.bx,s.by),edge=s.radius-d;
      if(edge<-.2)continue;
      const mask=smooth(-.2,.15,edge),profile=Math.sqrt(clamp(1-(d/s.radius)**2));
      tint(out,s.color,mask);out[3]=lerp(out[3],-.08+s.top*profile,mask);
      out[4]=lerp(out[4],s.rough,mask);out[5]=lerp(out[5],s.metal,mask);out[6]=lerp(out[6],lerp(.68,1,smooth(0,.6,edge)),mask);out[7]=0;
      continue;
    }
    const distance=s.type===0?roundedDistance(x,y,s.x,s.y,s.rx,s.ry,s.radius):s.type===2?polygonDistance(x,y,s.points):Math.hypot(x-s.x,y-s.y)-s.radius;
    if(distance>.4)continue;
    panel(out,distance,s.color,s.top,s.bevel,s.rough,s.metal);
    out[7]=lerp(out[7],s.emission||0,1-smooth(-.2,.35,distance));
  }
}

function bigDoorSampler(name,width,height,seed) {
  const bronze=name==='BIGDOOR4',base=bronze?[102,79,41]:[102,105,100];
  const steel=bronze?[124,96,52]:[128,132,126],dark=bronze?[52,41,25]:[47,51,46];
  const d=designBuilder();
  d.polygon([[15,36],[34,20],[69,20],[69,91],[85,91],[95,104],[78,115],[16,115]],dark,-.65,.65,.72,.35);
  // The original upper header and 13 narrow ventilation apertures.
  d.box(1,0,126,16,base,.35,.6,.44,.65);
  for(let x=12;x<112;x+=9)d.frame(x,2,6.7,10.8,steel,.55,.65,dark);
  d.box(0,15,128,2,steel,.62,.36,.32,.87);
  d.box(0,17.1,128,.55,dark,-.55,.14,.7,.3);
  for(const x of [2,7,119,125])d.pipe(x,18,x,116,.68,steel,.67,.28,.92);
  const pistons=[[44,23,89,4.5],[58,22,84,4.4],[74,22,88,3.3],[88,23,87,4],[104,32,87,4.1]];
  for(const [cx,top,bottom,radius] of pistons){
    d.pipe(cx,top,cx,bottom,radius,steel,.89,.28,.9);
    for(const yy of [top,bottom])d.box(cx-radius-1,yy-1.2,radius*2+2,2.4,base,1,.45,.3,.87);
    d.box(cx-radius-.6,bottom-21,radius*2+1.2,3.4,steel,1,.4,.32,.85);
  }
  d.polyline([[17,38],[17,48],[28,52],[40,52],[40,89],[47,94],[47,108],[56,113],[79,113],[91,106]],2.4,steel,.96,.32,.86);
  d.box(36.6,43.8,12.6,21.8,base,.78,.6,.42,.75);
  d.frame(40.7,48.5,5.4,8.5,steel,.94,.6,[29,31,27]);
  d.box(42.4,50.3,1,5.6,[112,15,8],.5,.14,.38,.1,0,.16);
  d.box(44.1,50.3,.8,5.6,[93,12,7],.5,.13,.38,.1,0,.12);
  d.frame(14,82,25,30,base,.5,1.2,dark);
  for(let xx=17;xx<37;xx+=3.8)d.box(xx,84,1,14,steel,.55,.25,.45,.75);
  for(const yy of [89,94])d.box(15.8,yy,21.5,.8,steel,.6,.22,.4,.8);
  d.frame(52,24,10,18,steel,.67,.9,base);
  for(let yy=27;yy<38;yy+=2)d.box(57,yy,2.3,.65,dark,-.2,.12,.6,.1);
  d.frame(27.5,54.5,9.5,22,steel,.7,.85,[29,31,27]);
  d.box(30,58,3.8,12,[78,8,5],.05,.3,.36,.1,.1,.05);
  d.box(28.4,71,7.6,1.4,[124,20,10],.53,.2,.3,0,.1,.1);
  d.frame(94,91,15,7,steel,.55,.85,[26,28,24]);
  d.polyline([[97,21],[111,35]],1.8,[130,116,73],.6,.68,.1);
  d.box(0,116,128,2.1,steel,.72,.4,.35,.85);
  d.frame(11,119.3,36,7.2,steel,.75,1.15,[25,27,23]);
  d.frame(81,119.3,36,7.2,steel,.75,1.15,[25,27,23]);
  for(let x=51;x<77;x+=2.7)d.box(x,120,1.15,5.5,dark,-.25,.15,.65,.2);
  for(const xx of [1,122])d.frame(xx,120,5,6,steel,.55,.7,[93,14,8]);
  return(x,y,out)=>{
    const rib=(Math.cos(x*TAU/5.1)+1)*.5;
    set(out,base,(rib-.5)*.09,.42,.78);
    paintDesign(d.shapes,x,y,out);
    // Painted safety bands are part of the reference doors, not extra decals.
    if((y>120.7&&y<124.7&&((x>12.5&&x<45.5)||(x>82.5&&x<115.5)))||(x>95&&x<108&&y>92&&y<96)){
      const yellow=mod(x+y,8)<4;
      tint(out,yellow?[159,130,42]:[25,28,24],.93);out[4]=.67;out[5]=.03;out[3]=.08;
    }
    for(const yy of [3.5,6.5,9.5])if(x>105.5&&x<114.5&&Math.abs(y-yy)<.55){tint(out,[134,15,7],.95);out[7]=.1;out[3]=.59;out[4]=.32;out[5]=0;}
    if((x>39&&x<45&&y>89&&y<106&&mod(y,4)<1)||(x<11&&y>105&&y<111&&mod(y,3)<1)||(x>116&&y>105&&y<111&&mod(y,3)<1)){
      tint(out,[133,18,9],.9);out[5]=.05;out[7]=.055;
    }
    if(y>20&&y<116){bolt(out,x,y,4.5,Math.floor((y-20)/10)*10+24.5,.47,.9);bolt(out,x,y,122,Math.floor((y-20)/10)*10+24.5,.47,.9);}
    brush(out,x,y,seed,width,height,.65);
    const oxide=smooth(.75,.93,grain(x,y,.74,seed+200,width,height))*.09;
    tint(out,[113,66,28],oxide);out[4]+=oxide*.4;out[5]*=1-oxide;
  };
}

function doorSampler(name,width,height,seed) {
  const d=designBuilder();
  if(name==='DOOR3'){
    d.frame(8,9,48,53,[132,135,128],.48,.8,[105,109,103]);
    d.box(8.8,9.8,46.4,51.4,[105,109,103],.18,.45,.35,.88,.25);
    for(let x=16;x<56;x+=10)d.frame(x,12,2.4,6.6,[141,143,137],.53,.35,[33,36,31]);
    d.box(8,61,48,1.35,[146,148,140],.61,.26,.29,.88);
    d.box(8,67,48,1.3,[111,115,107],.51,.3,.35,.85);
    for(const x of [18,39,52])d.box(x,64,1.5,5,[36,40,34],-.45,.3,.72,.2);
    d.frame(45,40,14,15,[132,133,123],.8,.8,[67,72,64]);
    d.box(47,42,4,9,[152,152,139],1,.5,.28,.88);
    d.box(54,42,6,4,[138,140,128],.91,.4,.31,.84);
    return(x,y,out)=>{
      set(out,[126,129,122],.05,.34,.88);
      paintDesign(d.shapes,x,y,out);
      // Shallow vertical pressed channels replace the old baked white bloom.
      if(x>9&&x<55&&y>20&&y<60)out[3]+=.13*Math.cos((x-2)*TAU/7);
      brush(out,x,y,seed,width,height,.85);
      bolt(out,x,y,9.4,10.3,.46,.5);bolt(out,x,y,54.5,59.8,.46,.5);
    };
  }
  // Exit machinery: left pressure vessel, its loop pipe and gauge, a right
  // piston bank, and the full-height white strip are the identifying layout.
  const olive=[106,105,66],steel=[149,147,111],dark=[34,39,26];
  d.polygon([[8,3],[46,3],[55,12],[50,22],[55,39],[48,60],[8,60],[3,51],[8,30],[4,14]],olive,.42,.65,.55,.65);
  d.polyline([[5,5],[11,1],[45,1],[54,6],[51,18],[45,22],[51,32],[54,45],[49,56],[42,61],[10,61],[5,54],[4,38],[7,22],[5,5]],1.4,steel,.8,.34,.88);
  d.circle(31,12,10,steel,.75,.65,.29,.9);d.circle(31,12,8.2,dark,.18,.45,.22,0);
  for(let i=0;i<11;i++){const a=Math.PI*.15+i*Math.PI*1.7/10;d.pipe(31+Math.cos(a)*6.1,12+Math.sin(a)*6.1,31+Math.cos(a)*7,12+Math.sin(a)*7,.22,[158,161,109],.31,.42,.05);}
  d.pipe(31,12,35,8,.31,[179,168,103],.4,.37,.1);
  d.circle(31,12,.75,steel,.48,.2,.26,.9);
  d.frame(20,31,24,21,steel,.75,1.2,[76,74,38]);
  d.box(23,34,18,15,[145,121,50],.39,.5,.66,.05);
  d.frame(8,61,45,8,steel,.62,.9,[38,42,29]);
  for(let x=12;x<50;x+=3)d.box(x,62.5,1.1,4.8,olive,.57,.2,.42,.75);
  for(const x of [64,74,85,92,103])d.pipe(x,0,x,72,x===85?2.2:1.2,steel,.78,.26,.91);
  d.box(70,33,23,4,olive,.95,.5,.4,.75);d.box(70,40,23,4,olive,.95,.5,.4,.75);
  d.box(71,34.5,21,1,[90,16,8],1.02,.18,.37,.1);
  d.box(71,41.5,21,1,[90,16,8],1.02,.18,.37,.1);
  d.frame(114,1,12,70,[124,128,113],.75,1.2,[207,213,182]);
  d.box(116,3,8,66,[196,206,178],.55,.7,.23,0,.5,.92);
  return(x,y,out)=>{
    set(out,[45,48,30],-.2,.68,.38);
    paintDesign(d.shapes,x,y,out);
    if(x>23&&x<41&&y>34&&y<49){const stripe=mod(x+y,13)<5;tint(out,stripe?[194,154,51]:[82,83,43],.85);out[5]=.04;out[4]=.62;}
    brush(out,x,y,seed,width,height,.55);
    for(const [cx,cy] of [[12,5],[46,7],[8,54],[47,56],[117,2],[124,70]])bolt(out,x,y,cx,cy,.6,.5);
  };
}

function brownSampler(name,width,height,seed) {
  const green=name==='BROWNGRN'||name==='SLADWALL',dark=name==='BROWN144'||name==='BROWN96',grille=/^BRNBIG/.test(name);
  const base=green?[59,65,38]:dark?[59,51,31]:[118,97,68];
  return(x,y,out)=>{
    set(out,base,0,.69,green?.42:.6);
    brush(out,x,y,seed,width,height,dark?.6:.85);
    const cloud=grain(x,y,18,seed+70,width,height),fineOxide=grain(x,y,.52,seed+20,width,height);
    if(name==='BROWN1'){
      const seam=Math.min(Math.abs(y-16),Math.abs(y-72),Math.min(y,height-y));
      out[3]-=.45*(1-smooth(.1,.75,seam));out[6]*=lerp(.71,1,smooth(.2,1.2,seam));
      const right=smooth(43,68,x)*(1-smooth(109,126,x));
      const streak=grain(x,y*.16,3.7,seed+20,width,height*.16),broken=streak*.8+fineOxide*.2;
      const rust=smooth(.43,.7,broken)*right*.52;
      tint(out,[136,80,38],rust);out[5]*=1-rust;out[4]+=.18*rust;
      const verdigris=smooth(.62,.82,grain(x,y*.14,4.2,seed+21,width,height*.14)*.83+fineOxide*.17)*right*.54;
      tint(out,[83,107,88],verdigris);out[5]*=1-verdigris;out[4]+=.14*verdigris;
    }else{
      const oxide=smooth(.67,.91,fineOxide)*.4;
      tint(out,green?[58,80,39]:[110,71,30],oxide);out[4]+=.12*oxide;out[5]*=1-oxide;
      const change=(cloud-.5)*(dark?3:8);out[0]+=change;out[1]+=change;out[2]+=change*.7;
      if(dark){const patina=smooth(.73,.94,grain(x,y,.7,seed+31,width,height))*.23;tint(out,[65,79,64],patina);out[3]-=patina*.05;out[4]+=.09*patina;}
    }
    if(name==='BROWN96'){
      panel(out,roundedDistance(mod(x,16),y,8,12,6,11,1.4),[71,62,37],.4,.8,.62,.45);
      const seam=Math.abs(y-29.5);out[3]-=.45*(1-smooth(.1,.85,seam));out[6]*=lerp(.65,1,smooth(.2,1.4,seam));
    }
    if(name==='SLADWALL'){
      const seam=Math.min(mod(y,32),32-mod(y,32));out[3]-=.43*(1-smooth(.2,1.25,seam));out[6]*=lerp(.68,1,smooth(.3,2,seam));
    }
    if(grille){
      let openDistance=-100;
      if(y>31&&y<119){
        if(name==='BRNBIGC'){const q=mod(x+y,32);openDistance=Math.min(q-16,30-q,y-31,119-y)/SQRT2;}
        else{const tooth=Math.abs(mod(y-32,32)-16)*.52;openDistance=Math.min(name==='BRNBIGL'?x-26-tooth:6.5-tooth-x,y-31,119-y);}
      }
      out[8]=255*(1-smooth(-.12,.12,openDistance));
      const rolled=Math.exp(-Math.pow((openDistance+.7)/.45,2));out[3]+=.3*rolled;out[4]-=.13*rolled;out[5]=Math.max(out[5],rolled*.88);
      if(y>25&&y<30||y>119&&y<122){out[3]+=.34;out[5]=.8;}
      bolt(out,x,y,mod(x,16)<8?Math.floor(x/16)*16+4:Math.floor(x/16)*16+12,27.5,.56,.4);
    }
  };
}

function trimSampler(name,width,height,seed) {
  const exit=name==='EXITSIGN';
  const d=designBuilder();
  if(exit){
    d.frame(1,1,29,14,[100,103,93],.42,.8,[16,22,17]);
    const letters=[[[[0,0],[4,0]],[[0,0],[0,7]],[[0,3.5],[3,3.5]],[[0,7],[4,7]]],[[[0,0],[4,7]],[[4,0],[0,7]]],[[[0,0],[4,0]],[[2,0],[2,7]],[[0,7],[4,7]]],[[[0,0],[4,0]],[[2,0],[2,7]]]];
    for(let i=0;i<4;i++)for(const stroke of letters[i])for(let j=1;j<stroke.length;j++)d.pipe(3+i*6+stroke[j-1][0],4+stroke[j-1][1],3+i*6+stroke[j][0],4+stroke[j][1],.42,[171,11,5],.3,.24,0);
    for(let x=34;x<64;x+=8)d.frame(x,1,6.5,14,[89,93,85],.42,.65,[43,48,41]);
  }
  return(x,y,out)=>{
    set(out,[91,94,84],.02,.45,.72);
    if(name==='DOORSTOP'){
      const q=Math.abs(x-4)/3.7;out[3]=.45*Math.sqrt(clamp(1-q*q));out[4]=.31;out[5]=.89;
      if(x<.8||x>7.2){tint(out,[43,46,39],.7);out[3]=-.3;out[6]=.7;}
    }else if(name==='DOORTRAK'){
      set(out,[41,44,37],-.35,.65,.7);
      for(const cx of [1.6,6.2])panel(out,Math.abs(x-cx)-.52,[121,125,111],.48,.35,.28,.9);
      if(mod(y,5)<.65)panel(out,-.4,[90,94,80],.25,.3,.39,.82);
    }else if(name==='SUPPORT2'){
      const xx=mod(x,16);
      set(out,[50,56,49],-.25,.53,.8);
      panel(out,roundedDistance(xx,64,7.5,64,6.8,64,.5),[128,132,120],.5,.65,.36,.83);
      if(xx>10&&xx<14&&mod(y,16)>3&&mod(y,16)<11){set(out,[47,53,45],-.35,.55,.7,.75);bolt(out,x,y,Math.floor(x/16)*16+12,Math.floor(y/16)*16+7,.95,.7);}
    }else if(name==='LITE3'){
      set(out,[94,98,88],0,.48,.7);
      panel(out,roundedDistance(x,mod(y,8),16,4,13.7,3.4,.5),[49,55,43],-.17,.5,.58,.6);
      if(x>5&&x<28&&mod(y,8)>2.8&&mod(y,8)<5.2){panel(out,roundedDistance(x,mod(y,8),16.5,4,11.5,1.2,.4),[183,192,151],.2,.4,.25,0);out[7]=.85;}
    }else if(exit){paintDesign(d.shapes,x,y,out);if(x<30&&out[0]>100&&out[1]<35){out[7]=.95;out[5]=0;}}
    else if(name==='STEP1'){
      set(out,[86,72,49],0,.62,.35);
      if(y<1||y>6.6){out[3]=-.25;out[6]=.7;tint(out,[38,39,28],.5);}else out[3]=.15*Math.sin(y/8*Math.PI);
    }else if(name==='STEP6'){
      set(out,[126,113,84],0,.74,.02);concrete(out,x,y,seed,width,height,.75);
      const seam=Math.min(Math.abs(y-1),Math.abs(y-7),Math.abs(y-13));out[3]-=.33*(1-smooth(.15,.65,seam));out[6]*=lerp(.7,1,smooth(.2,1,seam));
    }else if(name==='NUKE24'){
      set(out,[67,72,40],0,.8,.08);concrete(out,x,y,seed,width,height,.7);
      const wet=smooth(.44,.75,grain(x,y,4,seed+48,width,height))*smooth(1,20,y);tint(out,[25,66,20],wet*.75);out[4]=lerp(out[4],.25,wet);out[3]+=.02*wet;
    }
    if(name!=='STEP6'&&name!=='NUKE24')brush(out,x,y,seed,width,height,.5);
  };
}

function stepFloorSampler(width,height,seed){return(x,y,out)=>{
  set(out,[108,113,102],.15,.46,.7);
  const yy=mod(y,32),inside=roundedDistance(x,yy,32,16,28,12.5,.35);
  if(inside<.5){panel(out,inside,[40,34,18],-.35,.45,.76,.15);if(inside<-.8){
    const rib=Math.min(mod(x,3.8),3.8-mod(x,3.8));
    panel(out,rib-.55,[88,70,32],.3,.45,.59,.56);
    if(mod(yy,6)<.75)panel(out,-.25,[76,61,28],.35,.3,.61,.53);
  }}
  brush(out,x,y,seed,width,height,.6);
};}

function computerSampler(name,width,height,seed) {
  const d=designBuilder(),screens=[],circuits=[];
  const dark=[35,39,32],steel=[118,123,112],cabinet=[58,63,54];
  const screen=(x,y,w,h,mode='terminal',screenSeed=1,color=[48,127,25])=>{
    d.frame(x-1.5,y-1.5,w+3,h+3,steel,.46,1.1,[12,19,11]);
    screens.push({x,y,w,h,mode,seed:screenSeed,color});
  };
  const keyboard=(x,y,w,h,keySeed)=>{
    d.box(x,y,w,h,[31,29,17],-.12,.25,.68,.1);
    for(let yy=y+.75;yy<y+h-1;yy+=2.7)for(let xx=x+.75;xx<x+w-1;xx+=2.9){
      const brightness=.82+noise(xx*7,yy*7,keySeed)*.18;
      d.box(xx,yy,1.75,1.35,[144*brightness,105*brightness,54*brightness],.32,.24,.57,.05,.18);
    }
  };
  const rack=(x,y,w,h,rackSeed,mode=0)=>{
    d.frame(x,y,w,h,[84,87,75],.38,.85,[19,23,15]);
    keyboard(x+2,y+2,Math.min(20,w*.25),h-4,rackSeed);
    if(mode)screen(x+w*.32,y+2.5,Math.max(5,w*.42),h-5,mode===1?'wave':'terminal',rackSeed,mode===1?[57,133,23]:[16,33,174]);
    else for(let col=0;col<3;col++){
      const bx=x+w*.31+col*w*.21;
      d.box(bx,y+2.5,w*.13,h-5,[53,45,23],.16,.32,.6,.06);
      d.box(bx+.7,y+3.5,w*.09,.85,[139,101,38],.31,.17,.46,.2,.1,.08);
      d.circle(bx+w*.065,y+h-3.1,.55,[175,121,40],.42,.18,.24,0,.2);
    }
    d.box(x+w-9,y+2.5,6.5,h-5,[28,29,18],.05,.3,.62,.15);
    d.circle(x+w-6.5,y+h-3.1,.54,[180,130,45],.43,.19,.25,0,.3);
  };
  const vent=(x,y,w,h)=>{
    d.frame(x,y,w,h,[88,93,79],.37,.8,[19,25,17]);
    for(let yy=y+2;yy<y+h-1;yy+=2.2)d.box(x+1.5,yy,w-3,.7,[111,117,93],.36,.25,.43,.8);
  };
  const circuitry=(x,y,w,h,circuitSeed)=>{
    d.box(x,y,w,h,[14,23,11],-.3,.35,.78,.05);
    circuits.push({x,y,w,h,seed:circuitSeed});
  };
  if(name==='COMPSPAN'){
    for(const y of [0,64])d.box(.35,y+.35,31.3,62.3,cabinet,.34,.58,.56,.57);
  }else if(name==='COMPTILE'){
    for(const x of [0,94])for(const y of [0,64])d.box(x+.3,y+.3,33.4,62.4,cabinet,.34,.55,.56,.55);
  }else if(name==='COMPUTE1'){
    for(const yy of [0,50,62,114,126])d.box(0,yy,128,1.2,steel,.4,.3,.33,.86);
    screen(6,4,43,25,'uac',71,[16,27,151]);rack(6,33,44,12,11);
    d.frame(77,3,47,44,steel,.32,.9,[88,94,82]);
    for(const x of [80,113,119])d.box(x,5,.6,40,[58,65,54],-.25,.18,.58,.55);
    circuitry(88,6,11,16,52);circuits.push({x:104,y:28,w:11,h:13,seed:41});
    d.box(87,26,29,17,[22,28,18],-.3,.35,.7,.15);
    d.polyline([[89,39],[95,35],[99,29]],.75,[144,147,123],.65,.34,.86);
    d.circle(104,34,.55,[24,157,8],.52,.2,.23,0,.7);d.circle(104,37,.55,[180,18,8],.52,.2,.23,0,.55);
    for(let row=0;row<3;row++)rack(6,69+row*15,45,12,35+row,row===1?1:row===2?2:0);
    rack(79,69,44,12,75);rack(79,84,45,7,54);
    for(const x of [79,101])for(const y of [93,102])d.frame(x,y,22,10,steel,.35,.7,[88,94,81]);
  }else if(name==='COMPUTE2'){
    for(let col=0;col<4;col++)for(let row=0;row<2;row++)rack(col*64+2,row*19+3,61,16,col+row*9,col===3?1:col===1?2:0);
    for(let col=0;col<13;col++)vent(3+col*19,44,14,10);
  }else if(name==='COMPTALL'){
    for(let x=0;x<256;x+=64)for(let y=0;y<128;y+=64)d.box(x+.35,y+.35,63.3,63.3,cabinet,.27,.6,.57,.62);
    vent(5,7,20,24);vent(5,38,20,22);d.frame(32.5,5.5,56,52,steel,.46,1.1,[16,22,11]);circuits.push({x:34,y:7,w:53,h:49,seed:81});
    d.frame(99,7,55,49,[79,85,68],.4,.85,[50,57,41]);
    d.box(109,12,34,10,[118,101,39],.42,.45,.66,.03);
    d.frame(135,34,10,12,[77,85,65],.3,.7,[30,37,23]);d.box(137,37,5,5,[95,103,77],.6,.5,.45,.6);
    vent(166,8,18,22);vent(166,39,18,20);screen(198,7,49,28,'terminal',88,[68,126,24]);
    d.frame(6.5,69.5,51,50,steel,.46,1.1,[16,22,11]);circuits.push({x:8,y:71,w:48,h:47,seed:51});vent(84,80,18,16);vent(84,102,18,13);
    for(let row=0;row<3;row++)for(let col=0;col<2;col++)rack(130+col*64,73+row*15,61,12,20+row*4+col,row===1&&col===0?2:0);
  }else if(name==='PLANET1'){
    for(let row=0;row<2;row++)for(let col=0;col<3;col++)screen(5+col*64,7+row*64,54,53,['uac','mars','planetgrid','sand','heat','earth'][row*3+col],51+row*3+col,[45,118,26]);
  }
  return(x,y,out)=>{
    set(out,name==='COMPUTE1'||name==='PLANET1'?[124,128,119]:cabinet,.03,.48,.65);
    paintDesign(d.shapes,x,y,out);
    if(name==='COMPTILE'){
      const edge=30-(Math.floor(y/8)%2?10:0);
      if(x>=edge&&x<=128-edge){
        set(out,[5,10,42],-.26,.41,.14);
        const trace=Math.min(mod(x,7),7-mod(x,7))<.23||Math.min(mod(y,11),11-mod(y,11))<.22||(mod(x,13)<.4&&mod(y,4)<3);
        if(trace){set(out,[12,24,103],-.15,.39,.52,1,.025);}
        if(mod(x,13)<1.1&&mod(y,11)<1.15){set(out,[40,64,126],.06,.33,.75);}
      }
    }
    for(const c of circuits){
      if(x<c.x||x>c.x+c.w||y<c.y||y>c.y+c.h)continue;
      set(out,[12,22,10],-.27,.72,.03,.93);
      const xx=x-c.x,yy=y-c.y,wire=Math.floor(xx/2),sx=wire*2+.45,top=noise(wire,1,c.seed)*c.h*.3,stop=c.h*(.55+noise(wire,2,c.seed)*.4);
      if(yy>top&&yy<stop&&Math.abs(xx-sx)<.2){tint(out,wire%4?[140,153,106]:[72,98,37],.95);out[3]=-.11;out[4]=.38;out[5]=.83;}
      const part=Math.floor(yy/7);
      if(yy>top+2&&yy<stop&&mod(yy-top-2,7)<1.5&&Math.abs(xx-sx)<.9&&noise(wire,part,c.seed)>.46){
        panel(out,roundedDistance(xx,mod(yy-top-2,7),sx,.75,.9,.75,.15),[110,122,83],.24,.25,.48,.6);
      }
      const chipX=mod(xx+noise(1,3,c.seed)*3,11),chipY=mod(yy+noise(4,3,c.seed)*7,14);
      if(chipX>2&&chipX<8&&chipY>5&&chipY<8.4){panel(out,roundedDistance(chipX,chipY,5,6.7,3,1.7,.15),[37,45,26],.32,.25,.62,.06);}
    }
    for(const s of screens){
      if(x<s.x||x>s.x+s.w||y<s.y||y>s.y+s.h)continue;
      const xx=x-s.x,yy=y-s.y,u=xx/s.w,v=yy/s.h;
      set(out,[4,11,6],-.17+.07*(1-(2*u-1)**2)*(1-(2*v-1)**2),.19,0,1,.09);
      let phosphor=0,color=s.color;
      if(s.mode==='wave'){
        const target=s.h*.51+Math.sin(xx*.43+s.seed)*s.h*.18;
        phosphor=1-smooth(.12,.45,Math.abs(yy-target));
        const grid=(Math.min(mod(xx,5),5-mod(xx,5))<.1||Math.min(mod(yy,3),3-mod(yy,3))<.1);if(grid)phosphor=Math.max(phosphor,.13);
      }else if(s.mode==='uac'){
        color=[13,24,151];
        const cx=s.w*.5,cy=s.h*.43,rr=Math.min(s.w*.22,s.h*.29);
        const left=Math.hypot((xx-cx+rr*.35)/(rr*.66),(yy-cy)/(rr*.55)),right=Math.hypot((xx-cx-rr*.32)/(rr*.66),(yy-cy)/(rr*.55));
        const arrow=xx>cx-rr*.4&&xx<cx+rr*.55&&Math.abs(yy-cy)<(cx+rr*.55-xx)*.6;
        if((left<1||right<1)&&!arrow)phosphor=.85;
        if(yy>s.h*.75)phosphor=Math.max(phosphor,terminalPhosphor(xx,yy-s.h*.75,s.seed)*.8);
      }else if(s.mode==='mars'||s.mode==='sand'||s.mode==='earth'){
        const cx=s.w*.5,cy=s.h*.42,r=s.h*.38,dx=(xx-cx)/r,dy=(yy-cy)/r,rr=dx*dx+dy*dy;
        if(rr<1){
          const relief=Math.sqrt(1-rr),light=.22+.78*clamp(dx*.35-dy*.3+relief*.82),mineral=grain(xx,yy,3.8,s.seed,64,64);
          color=s.mode==='mars'?[173+mineral*25,51+mineral*24,24]:s.mode==='sand'?[165+mineral*22,145+mineral*13,94]:mineral>.52?[133,144,114]:[39,73,85];
          tint(out,color,light*.82);out[7]=.7;phosphor=0;
        }
        if(yy>s.h*.78){color=[49,126,23];phosphor=terminalPhosphor(xx,yy-s.h*.78,s.seed);}
      }else if(s.mode==='heat'){
        const t=clamp((grain(xx,yy,7,s.seed,64,64)-.35)*2.5);tint(out,[172,39,22],t);out[7]=.65;
        if(yy>s.h*.8){color=[47,126,22];phosphor=terminalPhosphor(xx,yy-s.h*.8,s.seed);}
      }else if(s.mode==='planetgrid'){
        for(const [cx,cy,kind] of [[33,15,0],[11,31,1],[26,31,2],[11,45,0],[26,45,2]]){
          const rr=Math.hypot(xx-cx,yy-cy);
          if(rr<5){color=kind===2?[138,59,32]:kind===1?[143,126,82]:[113,126,87];phosphor=(.3+Math.sqrt(clamp(1-rr*rr/25))*.6);}
        }
        if((xx<20&&yy<20)||(xx>37&&yy>27&&yy<49))phosphor=terminalPhosphor(xx,yy,s.seed);
      }else phosphor=terminalPhosphor(xx,yy,s.seed);
      if(phosphor>0){tint(out,color,phosphor);out[7]=Math.max(out[7],phosphor*.8);}
      // Real surface stays glass-flat; printed pixels never turn into bumps.
      const scan=.96+.04*Math.cos(yy*TAU/.52);out[0]*=scan;out[1]*=scan;out[2]*=scan;
      out[4]=.17+.015*Math.cos(xx*.7);out[5]=0;
    }
    if(name==='COMPTALL'&&x>109&&x<143&&y>12&&y<22){tint(out,mod(x+y,14)<7?[168,133,42]:[26,31,20],.95);out[4]=.64;out[5]=.04;}
    if(out[7]<.07)brush(out,x,y,seed,width,height,.55);
    // Cabinet hardware is outside CRTs and does not create false display glow.
    if((name==='COMPTALL'||name==='COMPSPAN')&&(mod(y,64)<4||mod(y,64)>60)){
      bolt(out,x,y,Math.floor(x/(name==='COMPSPAN'?32:64))*(name==='COMPSPAN'?32:64)+2.6,Math.floor(y/64)*64+(mod(y,64)<4?2.5:61.5),.47,.7);
    }
  };
}

function terminalPhosphor(x,y,seed){
  const col=Math.floor(x/2.8),row=Math.floor(y/3.6),px=mod(x,2.8),py=mod(y,3.6),n=noise(col,row,seed);
  if(n<.28||px>1.9||py>2.3)return 0;
  const vertical=(px<.35||px>1.55)&&(py<2.3),bars=(py<.3||(n>.5&&Math.abs(py-1.1)<.18)||py>2.02);
  return (vertical||bars) ? .6+n*.4 : 0;
}

function technicalSampler(name,width,height,seed){
  const bronze=name==='TEKWALL4',d=designBuilder();
  for(let channel=0;channel<19;channel++){
    const x=channel*7+1,y=4+noise(channel,2,seed)*65,turn=(channel%2?1:-1)*(3+noise(channel,8,seed)*5);
    const color=bronze?[118,94,52]:channel%3?[106,119,91]:[151,148,111];
    d.polyline([[x,-5],[x,y],[x+turn,y+8],[x+turn,y+29],[x,y+37],[x,133]],channel%4===0?1.4:.45,color,channel%4===0?.75:.34,.38,.83);
    for(let part=0;part<4;part++){
      const py=mod(part*31+channel*13,128);
      d.frame(x-2,py,5,12,[color[0]*.67,color[1]*.67,color[2]*.67],.49,.55,[26,34,20]);
      if(channel%3===0)for(let yy=py+2;yy<py+10;yy+=3)d.box(x-1,yy,3,.65,color,.6,.18,.34,.85);
      else d.box(x-.25,py+3,.7,6,color,.63,.22,.34,.85);
    }
  }
  if(!bronze){
    for(const x of [44,48,92,113])d.pipe(x,0,x,128,.95,[136,143,116],.62,.28,.9);
    d.box(0,25,47,7,[76,89,48],.57,.55,.59,.36);
    d.box(0,31,47,5,[18,28,13],-.4,.4,.78,.03);
    for(let y=6;y<128;y+=11)d.box(114,y,12,1.5,[145,167,123],.62,.25,.41,.77);
    for(let y=45;y<125;y+=5)d.polyline([[6,y],[12,y+3],[19,y+1],[25,y+5],[34,y+4]],.37,[99,113,75],.42,.39,.8);
  }
  return(x,y,out)=>{
    set(out,bronze?[41,36,21]:[22,30,17],-.35,.79,.06,.88);
    paintDesign(d.shapes,x,y,out);brush(out,x,y,seed,width,height,.5);
  };
}

function fallbackSampler(name,width,height,seed,base) {
  return(x,y,out)=>{
    set(out,[80,80,75],0,.52,.5);sampleBase(base,x,y,out);
    brush(out,x,y,seed,width,height,.7);
  };
}

function chooseSampler(kind,name,width,height,seed,base) {
  if(/^STAR|^SW[12]STRTN$/.test(name))return{sample:starSampler(name,width,height,seed),heightScale:/^SW/.test(name)?2.6:1.2};
  if(/^FLOOR(?:4_8|5_[12])$/.test(name))return{sample:hexFloorSampler(name,width,height,seed),heightScale:1.6};
  if(/^(?:FLAT18|FLAT20|FLAT23|CEIL3_5)$/.test(name))return{sample:slabSampler(name,width,height,seed),heightScale:1.4};
  if(/^NUKAGE[123]$/.test(name))return{sample:liquidSampler(name,width,height,seed),heightScale:1};
  if(/^TLITE6_/.test(name))return{sample:lightSampler(name,width,height,seed),heightScale:1};
  if(name==='STEP2')return{sample:stepFloorSampler(width,height,seed),heightScale:1.4};
  if(kind==='flat')return{sample:stoneSampler(name,width,height,seed),heightScale:name==='FLOOR7_2'?1.8:1};
  if(/^BIGDOOR[24]$/.test(name))return{sample:bigDoorSampler(name,width,height,seed),heightScale:2.8};
  if(name==='DOOR3'||name==='EXITDOOR')return{sample:doorSampler(name,width,height,seed),heightScale:2.6};
  if(/^(?:BROWN|BRNBIG|SLADWALL)/.test(name))return{sample:brownSampler(name,width,height,seed),heightScale:1.8};
  if(/^(?:DOORSTOP|DOORTRAK|SUPPORT2|LITE3|EXITSIGN|STEP1|STEP6|NUKE24)$/.test(name))return{sample:trimSampler(name,width,height,seed),heightScale:1.8};
  if(/^(?:COMP|PLANET1)/.test(name))return{sample:computerSampler(name,width,height,seed),heightScale:1.6};
  if(/^TEKWALL[14]$/.test(name))return{sample:technicalSampler(name,width,height,seed),heightScale:2};
  return{sample:fallbackSampler(name,width,height,seed,base),heightScale:1.8};
}

export function surfaceDetail(kind,name,baseResource,{maxSize=1024}={}) {
  const keyName=String(name||'').toUpperCase();
  if(!baseResource?.pixels||!baseResource.width||!baseResource.height||keyName==='SKY1'||keyName==='F_SKY1')return null;
  const category=kind==='flat'?'flat':'texture';
  const cap=Number.isFinite(maxSize)?Math.max(16,Math.min(1024,Math.floor(maxSize))):1024;
  const key=`${category}:${keyName}:${baseResource.width}x${baseResource.height}:${cap}`;
  if(cache.has(key)){const item=cache.get(key);cache.delete(key);cache.set(key,item);hits++;return item;}
  const baseWidth=baseResource.width,baseHeight=baseResource.height;
  const scale=Math.min(category==='flat'?8:4,cap/Math.max(baseWidth,baseHeight),Math.sqrt(524288/(baseWidth*baseHeight)));
  const width=Math.max(1,Math.round(baseWidth*scale)),height=Math.max(1,Math.round(baseHeight*scale));
  const count=width*height,workingBytes=count*16;
  // Evict before allocation, including the temporary Float32 height field.
  // Uploaders should retain GPU handles rather than these CPU staging arrays.
  while(cache.size&&cacheBytes+workingBytes>SURFACE_DETAIL_BUDGET){const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).byteLength;cache.delete(oldest);evictions++;}
  peakWorkingBytes=Math.max(peakWorkingBytes,cacheBytes+workingBytes);
  const pixels=new Uint8Array(count*4),normalRoughness=new Uint8Array(count*4),surface=new Uint8Array(count*4);
  const heights=new Float32Array(count),seed=seedOf(/^SW[12]STRTN$/.test(keyName)?'STARTAN1':keyName);
  const {sample,heightScale}=chooseSampler(category,keyName,baseWidth,baseHeight,seed,baseResource),out=new Float64Array(9);
  const ux=baseWidth/width,vy=baseHeight/height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x,at=index*4;
    sample((x+.5)*ux,(y+.5)*vy,out);
    pixels[at]=clamp(Math.round(out[0]),0,255);pixels[at+1]=clamp(Math.round(out[1]),0,255);pixels[at+2]=clamp(Math.round(out[2]),0,255);pixels[at+3]=clamp(Math.round(out[8]),0,255);
    heights[index]=out[3];normalRoughness[at+3]=Math.round(clamp(out[4],.09,.98)*255);
    surface[at]=Math.round(clamp(out[5])*255);surface[at+1]=Math.round(clamp(out[6])*255);surface[at+2]=Math.round(clamp(out[7])*255);surface[at+3]=Math.round(clamp(.5+out[3]/heightScale)*255);
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    const dx=(heights[y*width+mod(x+1,width)]-heights[y*width+mod(x-1,width)])/(2*ux);
    const dy=(heights[mod(y+1,height)*width+x]-heights[mod(y-1,height)*width+x])/(2*vy);
    const length=Math.hypot(dx,dy,1);
    normalRoughness[at]=Math.round((.5-.5*dx/length)*255);normalRoughness[at+1]=Math.round((.5-.5*dy/length)*255);normalRoughness[at+2]=Math.round((.5+.5/length)*255);
  }
  const result=Object.freeze({name:keyName,kind:category,width,height,baseWidth,baseHeight,pixels,normalRoughness,surface,heightScale,byteLength:pixels.byteLength+normalRoughness.byteLength+surface.byteLength});
  while(cache.size&&cacheBytes+result.byteLength>SURFACE_DETAIL_BUDGET){const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).byteLength;cache.delete(oldest);evictions++;}
  cache.set(key,result);cacheBytes+=result.byteLength;generations++;return result;
}

export function surfaceDetailCacheStats(){return Object.freeze({entries:cache.size,bytes:cacheBytes,budget:SURFACE_DETAIL_BUDGET,peakWorkingBytes,generations,hits,evictions});}
export function clearSurfaceDetailCache(){cache.clear();cacheBytes=0;generations=0;hits=0;evictions=0;peakWorkingBytes=0;}
