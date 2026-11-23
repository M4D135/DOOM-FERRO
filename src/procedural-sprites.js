/** Procedural actors, objects and interface. No sampled or embedded artwork. */
import { Raster, clamp, mix, shade, noise, seedOf } from './procedural-raster.js';

const cache = new Map(), TAU = Math.PI * 2;

/** Orthographic ray intersection with small ellipsoids and limb capsules. */
class Volumes {
  constructor(rotation, collapse, seed, width = 80, height = 72) {
    this.image = new Raster(width, height, width / 2, height - 2);
    this.depth = new Float32Array(width * height); this.depth.fill(-Infinity);
    this.angle = (Math.max(1, rotation) - 1) * Math.PI / 4;
    this.c = Math.cos(this.angle); this.s = Math.sin(this.angle);
    this.collapse = collapse; this.seed = seed;
  }
  bodyPoint(point) {
    const [x, y, z] = point, angle = this.collapse * Math.PI * .48;
    return [x * Math.cos(angle) + (z - 27) * Math.sin(angle), y,
      z * Math.cos(angle) - x * Math.sin(angle) * .35 + 7 * Math.sin(angle)];
  }
  project(point) {
    const [x, y, z] = this.bodyPoint(point);
    return [this.image.width / 2 + this.c * x - this.s * y, this.image.topOffset - z, this.s * x + this.c * y];
  }
  paint(x, y, depth, normal, color, material) {
    const at = y * this.image.width + x;
    if (depth <= this.depth[at]) return;
    this.depth[at] = depth;
    const length = Math.hypot(...normal) || 1, nx = normal[0] / length, ny = normal[1] / length, nz = normal[2] / length;
    const light = clamp(-nx * .36 - ny * .55 + nz * .76);
    const grain = (noise(x, y, this.seed) - .5) * (material === 'metal' ? 6 : 10);
    const specular = material === 'metal' ? Math.pow(clamp(-nx * .15 - ny * .25 + nz * .95), 18) * 58 : 0;
    this.image.pixel(x, y, material === 'glow' ? shade(color, 1, grain * .2) : shade(color, .27 + light * .82, grain + specular));
  }
  ellipsoid(point, radii, color, material = 'cloth') {
    const center = this.project(point), t = this.collapse;
    let [rx, ry, rz] = radii;
    [rx, rz] = [rx * (1 - t) + rz * t, rz * (1 - t) + rx * .7 * t];
    const c = this.c, s = this.s, horizontal = Math.hypot(rx * c, ry * s);
    const a = s * s / (rx * rx) + c * c / (ry * ry);
    for (let y = Math.max(0, Math.floor(center[1] - rz)); y <= Math.min(this.image.height - 1, Math.ceil(center[1] + rz)); y++) {
      for (let x = Math.max(0, Math.floor(center[0] - horizontal)); x <= Math.min(this.image.width - 1, Math.ceil(center[0] + horizontal)); x++) {
        const u = x + .5 - center[0], v = center[1] - y - .5;
        const b = 2 * u * c * s * (1 / (rx * rx) - 1 / (ry * ry));
        const q = u * u * (c * c / (rx * rx) + s * s / (ry * ry)) + v * v / (rz * rz) - 1;
        const discriminant = b * b - 4 * a * q;
        if (discriminant < 0) continue;
        const d = (-b + Math.sqrt(discriminant)) / (2 * a);
        const lx = (c * u + s * d) / (rx * rx), ly = (-s * u + c * d) / (ry * ry), lz = v / (rz * rz);
        this.paint(x, y, center[2] + d, [c * lx - s * ly, -lz, s * lx + c * ly], color, material);
      }
    }
  }
  capsule(from, to, radius, color, material = 'cloth') {
    const a = this.project(from), b = this.project(to), ba = b.map((value, i) => value - a[i]);
    const length2 = ba.reduce((sum, value) => sum + value * value, 0), projected2 = ba[0] ** 2 + ba[1] ** 2;
    for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1]) - radius)); y <= Math.min(this.image.height - 1, Math.ceil(Math.max(a[1], b[1]) + radius)); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0]) - radius)); x <= Math.min(this.image.width - 1, Math.ceil(Math.max(a[0], b[0]) + radius)); x++) {
        const ox = x + .5 - a[0], oy = y + .5 - a[1], oz = -a[2];
        const dot = ba[0] * ox + ba[1] * oy + ba[2] * oz;
        const bb = length2 * oz - dot * ba[2];
        const cc = length2 * (ox * ox + oy * oy + oz * oz) - dot * dot - radius * radius * length2;
        const disc = bb * bb - projected2 * cc;
        let depth = -Infinity;
        if (projected2 > 1e-7 && disc >= 0) for (const sign of [1, -1]) {
          const hit = (-bb + sign * Math.sqrt(disc)) / projected2, position = dot + hit * ba[2];
          if (position >= 0 && position <= length2) depth = Math.max(depth, hit);
        }
        for (const end of [a, b]) {
          const disk = radius * radius - (x + .5 - end[0]) ** 2 - (y + .5 - end[1]) ** 2;
          if (disk >= 0) depth = Math.max(depth, end[2] + Math.sqrt(disk));
        }
        if (!Number.isFinite(depth)) continue;
        const position = length2 ? clamp((ba[0] * ox + ba[1] * oy + ba[2] * (depth - a[2])) / length2) : 0;
        const normal = [ox - ba[0] * position, oy - ba[1] * position, depth - a[2] - ba[2] * position];
        this.paint(x, y, depth, normal, color, material);
      }
    }
  }
  finish(name) {
    // Dark silhouettes stay legible against both concrete and bright acid.
    const pixels = this.image.pixels, copy = pixels.slice(), width = this.image.width;
    for (let y = 1; y < this.image.height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const at = (y * width + x) * 4;
      if (!copy[at + 3]) continue;
      if (!copy[at + 7] || !copy[at + width * 4 + 3]) {
        pixels[at] *= .68; pixels[at + 1] *= .68; pixels[at + 2] *= .68;
      }
    }
    return this.image.result(name);
  }
}

function character(name, family, frame, rotation) {
  const monster = family === 'TROO', guard = family === 'SPOS';
  const deathStart = monster ? 'I' : 'H', dying = frame >= deathStart;
  const collapse = dying ? clamp((frame.charCodeAt(0) - deathStart.charCodeAt(0) + 1) / 5) : 0;
  const volume = new Volumes(rotation || 1, collapse, seedOf(family));
  const e = (...args) => volume.ellipsoid(...args), c = (...args) => volume.capsule(...args);
  const skin = monster ? [153, 91, 54] : guard ? [165, 135, 102] : [171, 162, 126];
  const suit = monster ? [130, 69, 42] : guard ? [83, 93, 86] : [114, 113, 69];
  const armor = guard ? [138, 145, 128] : [96, 112, 73], boots = [40, 44, 35];
  const attacking = monster ? 'EFG'.includes(frame) : 'EF'.includes(frame);
  const phase = 'ABCD'.includes(frame) ? (frame.charCodeAt(0) - 65) * Math.PI / 2 : 0;
  const stride = Math.sin(phase) * (attacking ? 0 : 3), sway = Math.cos(phase) * .7;
  for (const side of [-1, 1]) {
    const foot = [side * 5.8, side * stride + 1, 3 + Math.max(0, side * stride) * .45];
    const knee = [side * 5.2, -side * stride * .45, 14];
    c([side * 4.5, 0, 27], knee, monster ? 3.6 : 4.1, suit);
    c(knee, foot, monster ? 3 : 3.6, suit);
    e(foot, [monster ? 4.6 : 4.2, 6, 3], monster ? skin : boots, monster ? 'skin' : 'metal');
    if (monster) for (let toe = -1; toe <= 1; toe++) c([foot[0] + toe * 2, foot[1] + 3, foot[2]], [foot[0] + toe * 2, foot[1] + 7, foot[2] - 1], .9, [192, 171, 119]);
    else e([side * 5.2, 3, 15], [4, 1.2, 4.5], guard ? [91, 106, 91] : [72, 82, 52], 'metal');
  }
  e([0, 0, 27], [8.5, 5.4, 6], suit);
  e([0, -.5, 37 + sway], [monster ? 10.7 : 9, monster ? 6.3 : 5.3, 11.5], monster ? skin : suit);
  if (monster) {
    for (const side of [-1, 1]) {
      e([side * 4.3, 5, 40], [4.7, 2.6, 4.8], skin);
      for (let rib = 0; rib < 3; rib++) c([side * 1, 5, 35 - rib * 2.7], [side * 6, 3.8, 34 - rib * 2.7], .75, [83, 43, 28]);
    }
  } else {
    e([0, 4.7, 39], [8.5, 2.1, 7.6], armor, 'metal');
    e([0, -4.8, 38], [6.7, 2.5, 8], shade(armor, .7), 'metal');
    c([-7.5, 5.2, 43], [-6, 5.2, 28], 1.2, [53, 58, 40]);
    c([7.5, 5.2, 43], [6, 5.2, 28], 1.2, [53, 58, 40]);
    e([0, 5.8, 27], [8, 1.2, 1.6], [62, 60, 39], 'metal');
    e([0, 7, 27], [2, .6, 1.4], [172, 154, 92], 'metal');
    for (const side of [-1, 1]) e([side * 6, 6, 30], [2, 1.8, 3], [81, 86, 58]);
  }
  const gunHeight = attacking ? 42 : 32;
  for (const side of [-1, 1]) {
    const shoulder = [side * 9.7, -.3, 44 + sway];
    const elbow = monster ? [side * (attacking ? 11 : 14), attacking ? 9 : -side * stride, attacking ? 39 : 33] : [side * 11, 3, gunHeight - 1];
    const hand = monster ? [side * (attacking ? 8 : 13), attacking ? 18 : 4 + side * stride, attacking ? 40 : 25] : [side * 2.8, 8 + (side > 0 ? 1 : -2), gunHeight];
    c(shoulder, elbow, monster ? 4 : 3.5, monster ? skin : suit);
    c(elbow, hand, monster ? 3.3 : 2.8, skin);
    e(hand, [3.1, 2.7, 3.4], skin);
    if (guard) e(shoulder, [4.9, 4, 4.6], armor, 'metal');
    if (monster) {
      for (let spike = 0; spike < 3; spike++) c([side * (10 + spike), -.8, 44 - spike * 2], [side * (15 + spike), -1.3, 49 - spike * 2], 1.2, [180, 162, 117]);
      for (let finger = 0; finger < 3; finger++) c([hand[0] + (finger - 1) * 1.4, hand[1] + 1, hand[2] - 1], [hand[0] + (finger - 1) * 2, hand[1] + 3, hand[2] - 5], .85, [198, 179, 128]);
    }
  }
  if (!monster) {
    c([0, 5, gunHeight], [0, guard ? 21 : 18, gunHeight], guard ? 2.2 : 1.7, [58, 63, 60], 'metal');
    e([0, 7, gunHeight - 1.7], [2.8, 6, 2.7], guard ? [111, 72, 37] : [54, 59, 46], 'metal');
    c([0, 10, gunHeight + 2], [0, guard ? 21 : 18, gunHeight + 2], .6, [157, 164, 145], 'metal');
    if (frame === 'F') e([0, guard ? 24 : 21, gunHeight], [3.5, 5, 3.5], [255, 187, 47], 'glow');
  }
  e([0, 0, 48], [3.4, 3.3, 3.4], skin);
  e([0, monster ? 2 : 0, 53], [monster ? 6 : 5.2, monster ? 5.1 : 4.7, 6.6], skin, 'skin');
  if (!monster) {
    e([0, -.4, 57.3], [5.7, 4.8, 3.1], guard ? [70, 83, 64] : [76, 86, 43]);
    e([0, -2.2, 53], [5.6, 3, 4.3], guard ? [65, 78, 61] : [71, 77, 37]);
  } else {
    e([0, 6, 50.4], [4.7, 2.6, 3.3], [134, 65, 39]);
    for (const side of [-1, 1]) c([side * 4, 0, 57], [side * 7, -1, 61], 1.1, [188, 164, 112]);
  }
  for (const side of [-1, 1]) {
    e([side * 2.3, monster ? 6.2 : 4.2, 54.2], [1.8, .8, 1.4], [39, 27, 19]);
    e([side * 2.3, monster ? 6.9 : 4.8, 54.3], [.9, .4, .65], monster ? [250, 88, 26] : [198, 185, 77], 'glow');
    c([side * .8, monster ? 6.4 : 4.5, 55.6], [side * 3.7, monster ? 5.8 : 4.2, 55.2], .75, shade(skin, .6));
  }
  e([0, monster ? 7.4 : 5.5, 52.3], [1.2, 1.2, 1.8], shade(skin, 1.12));
  e([0, monster ? 7.5 : 4.7, 49.8], [monster ? 3.2 : 2, .7, monster ? 1.4 : .65], [42, 23, 17]);
  if (monster) for (const side of [-1, 1]) c([side * 1.8, 8, 50.8], [side * 1.6, 8, 49.1], .65, [221, 203, 143]);
  if ((!monster && frame === 'G') || (monster && frame === 'H') || dying) {
    e([-2, 5, 51], [1.7, .5, 1.3], [124, 36, 23]);
    c([-1, 5.1, 50], [-2, 5, 47], .7, [119, 27, 19]);
  }
  return volume.finish(name);
}

function box(image, x, y, width, height, base) {
  image.polygon([[x,y+3],[x+4,y],[x+width,y],[x+width,y+height-3],[x+width-4,y+height],[x,y+height]], [29,34,27]);
  image.bevel(x+1,y+4,width-5,height-5,base);
  image.polygon([[x+1,y+3],[x+5,y+1],[x+width-2,y+1],[x+width-5,y+3]], shade(base,1.35));
  image.polygon([[x+width-4,y+4],[x+width-1,y+1],[x+width-1,y+height-4],[x+width-4,y+height-1]],shade(base,.55));
}
function cross(image, cx, cy, size, color) {
  image.rect(cx-size/2,cy-size/6,size,size/3,color); image.rect(cx-size/6,cy-size/2,size/3,size,color);
}
function pickup(name, family, frame) {
  const phase = (frame.charCodeAt(0)-65)*TAU/6, pulse = .9 + .12*Math.cos(phase);
  let width=32,height=28;
  if (family==='STIM') [width,height]=[24,22];
  if (family==='BON1') [width,height]=[20,26];
  if (family==='BON2') [width,height]=[24,20];
  if (/ARM/.test(family)) [width,height]=[38,40];
  if (family==='CLIP') [width,height]=[16,24];
  if (family==='SHEL') [width,height]=[22,15];
  if (family==='SHOT') [width,height]=[64,22];
  const image = new Raster(width,height,width/2,height-1), center=width/2;
  if (family==='STIM'||family==='MEDI') {
    box(image,2,4,width-4,height-5,[176,177,150]);
    image.bevel(center-4,1,8,4,[102,112,95],true);
    cross(image,center-1,height*.57,family==='STIM'?9:13,[161,39,29]);
    image.rect(3,height-5,width-10,1,[79,89,73]);
  } else if (family==='BON1') {
    image.ellipse(center,17,7,8,[29,55,75],true);
    image.ellipse(center,17,5,6,shade([69,156,204],pulse),true);
    image.bevel(center-3,3,6,8,[91,139,147]); image.bevel(center-4,2,8,3,[165,181,168]);
    image.line(center-3,13,center-3,19,1,[172,221,226]);
    image.ellipse(center+2,19-Math.sin(phase)*2,1,1,[201,235,209]);
  } else if (family==='BON2') {
    image.ellipse(center,11,10,8,shade([98,135,70],pulse),true);
    image.rect(3,11,18,5,[34,45,30]); image.line(5,10,18,10,1,[174,187,116]);
    image.rect(8,12,8,2,[66,90,54]); image.ellipse(5,14,2,3,[119,138,78],true);
  } else if (/ARM/.test(family)) {
    const blue=family==='ARM2',base=shade(blue?[63,113,172]:[70,138,74],pulse);
    image.polygon([[7,5],[14,2],[15,8],[23,8],[24,2],[31,5],[35,17],[29,22],[28,37],[10,37],[9,22],[3,17]],shade(base,.5));
    image.polygon([[9,5],[14,4],[16,10],[22,10],[24,4],[29,6],[28,34],[11,34]],(x,y)=>shade(base,.75+(1-Math.abs(x-center)/19)*.4+(noise(x,y,35)-.5)*.12));
    image.bevel(12,13,14,9,shade(base,1.12));
    for(let row=0;row<3;row++)image.bevel(12,24+row*3,14,2,shade(base,.85));
    image.line(9,8,8,18,3,shade(base,1.35));image.line(29,8,30,18,3,shade(base,.85));
    image.rect(16,15,6,1,[175,194,164]);
  } else if (family==='CLIP') {
    image.polygon([[4,3],[12,3],[11,22],[3,22]], [42,49,40]);
    image.bevel(4,5,7,16,[102,113,91]);
    for(let y=7;y<21;y+=3)image.line(5,y,9,y-1,1,[44,56,44]);
    image.ellipse(8,3,2,3,[190,151,65],true);
  } else if (family==='SHEL') {
    for(let i=0;i<4;i++) {image.bevel(2+i*5,4,4,9,[146,51,36]);image.bevel(2+i*5,3,4,3,[189,153,76]);image.pixel(3+i*5,5,[208,91,52]);}
  } else if (family==='AMMO'||family==='SBOX') {
    const base=family==='AMMO'?[93,113,61]:[127,75,47]; box(image,1,5,30,22,base);
    image.bevel(4,10,22,11,shade(base,.7));
    for(let i=0;i<5;i++) {image.rect(6+i*4,13,2,6,[184,155,85]);image.ellipse(7+i*4,12,1.2,2,[215,183,112],true);}
    image.line(5,7,26,7,1,[179,179,126]);
  } else if (family==='SHOT') {
    image.polygon([[3,12],[21,9],[28,10],[25,18],[17,19],[14,15],[3,18]], [91,58,34]);
    image.line(20,10,60,6,4,[51,60,56]); image.line(20,8,60,4,1,[164,176,158]);
    image.line(31,12,49,10,5,[118,83,43]);
    for(let x=33;x<48;x+=3)image.line(x,10,x,13,1,[55,48,31]);
    image.line(22,13,23,16,2,[35,40,33]);
  }
  return image.result(name);
}

function barrel(name, frame) {
  const image=new Raster(32,46,16,45), glow=frame==='B'?1.12:.92;
  image.ellipse(16,41,13,4,[36,43,28]);
  image.rect(3,7,26,34,(x,y)=>shade([72,100,48],.4+.7*Math.sqrt(clamp(1-((x-16)/14)**2)),(noise(x,y,123)-.5)*9));
  for(const y of [9,35])image.rect(3,y,26,3,(x)=>shade([128,136,108],.4+.8*Math.sqrt(clamp(1-((x-16)/14)**2))));
  image.ellipse(16,7,13,5,[127,138,102],true);image.ellipse(16,7,10,3,[51,77,32],true);
  image.ellipse(11,7,2,1.5,[179,185,133],true);
  image.bevel(10,17,12,13,shade([159,166,61],glow));
  image.ellipse(16,23.5,2,2,[37,49,23]);
  for(let i=0;i<3;i++){const angle=i*TAU/3;image.polygon([[16+Math.cos(angle)*2.5,23.5+Math.sin(angle)*2.5],[16+Math.cos(angle-.5)*5,23.5+Math.sin(angle-.5)*5],[16+Math.cos(angle+.5)*5,23.5+Math.sin(angle+.5)*5]],[37,49,23]);}
  image.line(6,13,6,31,1,[139,153,90]);return image.result(name);
}

function explosion(name, frame, projectile=false) {
  const stage=projectile?'ABCDE'.indexOf(frame):'ABCDE'.indexOf(frame),step=Math.max(0,stage);
  const width=projectile?40:80,height=projectile?40:80,cx=width/2,cy=height/2;
  const image=new Raster(width,height,cx,projectile?26:65),seed=seedOf(projectile?'ORB':'BURST');
  const radius=projectile?(stage<2?10:10+(stage-2)*3):[14,23,31,27,22][step];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=x+.5-cx,dy=y+.5-cy,angle=Math.atan2(dy,dx),d=Math.hypot(dx,dy);
    const ripple=1+.13*Math.sin(angle*7+step)+.09*Math.cos(angle*11-step*.6);
    const edge=radius*ripple, n=noise(x,y,seed+step);
    if(d>edge||((!projectile&&step===4)&&n<.28))continue;
    const t=d/edge;
    const smoke=!projectile&&step>2&&t>.38;
    const color=smoke?mix([92,76,52],[39,40,32],t):t<.35?mix([255,249,178],[255,185,50],t/.35):mix([255,160,28],[132,32,15],(t-.35)/.65);
    image.pixel(x,y,shade(color,.85+n*.25));
  }
  return image.result(name);
}

function scenery(name,family) {
  if(family==='PLAY')return character(name,'POSS','L',1);
  if(family==='POL5') {
    const image=new Raster(40,16,20,15);
    for(let i=0;i<12;i++)image.ellipse(5+noise(i,1,8)*29,8+noise(i,2,8)*4,3+noise(i,3,8)*6,1+noise(i,4,8)*3,[72+noise(i,5,8)*35,24,18],true);
    return image.result(name);
  }
  const width=family==='ELEC'?48:32,height=family==='ELEC'?128:family==='CBRA'?60:48;
  const image=new Raster(width,height,width/2,height),cx=width/2;
  if(family==='ELEC') {
    image.polygon([[5,7],[12,1],[36,1],[43,7],[41,120],[46,126],[2,126],[7,120]],[38,49,42]);
    image.bevel(8,9,32,110,[72,86,71]);image.bevel(12,14,24,40,[23,39,32],true);
    image.rect(14,16,20,36,(x,y)=>shade([48,128,76],.3+(x%2)*.09+noise(x,y,12)*.2));
    for(let y=20;y<47;y+=5)image.line(16,y,23+noise(y,0,2)*9,y,1,[115,205,118]);
    image.bevel(12,60,24,29,[52,65,52],true);
    for(let y=64;y<86;y+=4)image.rect(15,y,18,2,[21,32,25]);
    for(const y of [96,104,112])for(const x of [15,24,32])image.ellipse(x,y,1.6,1.6,x===24?[171,171,69]:[76,131,78],true);
    image.bevel(4,120,40,7,[90,101,77]);image.rect(12,2,24,4,[121,141,111]);
  } else if(family==='COLU') {
    image.ellipse(cx,44,13,4,[43,56,36],true);image.bevel(cx-7,17,14,25,[103,121,81]);
    image.line(cx-3,19,cx-3,41,2,[171,182,114]);image.ellipse(cx,18,11,4,[58,75,42],true);
    image.ellipse(cx,10,10,10,[160,209,92],true);image.ellipse(cx-2,7,5,5,[229,238,163],true);
    image.rect(cx-10,17,20,2,[153,181,94]);
  } else {
    image.ellipse(cx,57,10,3,[112,110,67],true);image.line(cx,55,cx,25,4,[139,131,71]);
    image.line(cx,38,cx-8,29,3,[142,132,70]);image.line(cx,38,cx+8,29,3,[142,132,70]);
    for(const [x,y] of [[cx-8,24],[cx,14],[cx+8,24]]) {image.bevel(x-2,y,4,9,[210,196,139]);image.ellipse(x,y-4,3,6,[238,157,40],true);image.ellipse(x,y-3,1.4,3,[255,242,144]);}
  }
  return image.result(name);
}

function digit(name) {
  const large=name.startsWith('STTNUM'),gray=name.startsWith('STGNUM'),value=Number(name.at(-1));
  const image=new Raster(large?14:4,large?16:6),base=large?[211,57,37]:gray?[91,94,78]:[206,184,86];
  if(large) {
    image.text(value,3,2,13,[41,20,14],3.2,.1);
    image.text(value,2,1,13,(x,y)=>shade(base,1.1-y*.027),2.6,.1);
  } else image.text(value,0,0,5,base,.8,.1);
  return image.result(name);
}

function face(name) {
  const image=new Raster(24,30,-5,-1),dead=name==='STFDEAD0',hurt=name.startsWith('STFOUCH');
  const level=Number((name.match(/STFST(\d)|STFOUCH(\d)/)||[]).slice(1).find(Boolean)||0);
  const gaze=name.startsWith('STFST')?(Number(name.at(-1))-1):0;
  const skin=[189-level*10,155-level*11,104-level*8];
  image.ellipse(12,17,10,13,[57,56,36]);image.ellipse(12,16,8,12,skin,true);
  image.rect(4,4,16,5,[53,65,39]);image.ellipse(12,5,9,5,[79,90,49],true);
  image.line(5,8,18,8,1,[140,144,82]);
  for(const side of [-1,1]) {
    const eye=12+side*4+gaze*.5;
    image.line(eye-2,11,eye+1,12,1,[65,51,30]);
    image.rect(eye-1,13,3,2,dead?[77,47,29]:[220,214,155]);
    if(!dead)image.pixel(eye+gaze,13,[30,39,28]);
  }
  image.line(12,13,11,19,2,shade(skin,.85));image.pixel(12,18,shade(skin,1.5));
  image.ellipse(12,23,hurt?4:3,hurt?3:1,dead?[96,39,24]:[65,42,23]);
  if(!hurt&&!dead)image.line(10,22,14,22,1,[191,183,132]);
  if(level>0||dead)for(let scar=0;scar<(dead?5:level);scar++)image.line(5+scar*3,16+scar%2,7+scar*3,20+scar,1,[126,39,26]);
  return image.result(name);
}

function statusBar(name) {
  const image=new Raster(320,32);
  image.rect(0,0,320,32,(x,y)=>shade([89,95,75],.75+noise(x,y,451)*.18+(y<2?.45:0)));
  for(const [x,w] of [[1,44],[47,57],[106,34],[142,36],[180,57],[239,80]]) {
    image.bevel(x,1,w,30,[72,80,62],true);image.rect(x+2,3,w-4,26,(px,py)=>shade([68,76,59],.85+noise(px,py,77)*.18));
  }
  image.bevel(146,1,28,30,[102,110,82]);
  for(const [label,x] of [['AMMO',7],['HEALTH',52],['ARMS',110],['ARMOR',186]])image.text(label,x,24,4,[174,173,131],.9,1);
  for(const [row,label] of ['BULL','SHEL','ROCK','CELL'].entries())image.text(label,242,5+row*6,3,[160,164,120],.7,.5);
  for(const x of [2,102,138,178,235,317])for(const y of [3,28])image.ellipse(x,y,1.2,1.2,[142,149,115],true);
  return image.result(name);
}

function logo(name) {
  const image=new Raster(192,72),text='DOOM';
  image.text(text,10,12,48,[13,21,23],13,11);
  image.text(text,8,7,48,[42,59,64],11,11);
  image.text(text,7,5,48,(x,y)=>{
    const top=y<30,middle=top?mix([224,194,97],[149,117,53],y/30):mix([134,157,154],[55,77,84],(y-30)/30);
    return shade(middle,.9+noise(x,y,97)*.16);
  },8.8,11);
  image.text('FERRO',75,64,5,[158,172,154],1,2);
  return image.result(name);
}

function weapon(name,family,frame) {
  const image=new Raster(320,168),recoil=frame==='B'?-8:0;
  if(family==='PISF'||family==='SHTF') {
    const cx=160,cy=family==='PISF'?93:105,scale=family==='SHTF'?1.3:1;
    for(let ray=0;ray<9;ray++){
      const a=ray*TAU/9,r=(ray%2?13:20)*scale;
      image.polygon([[cx+Math.cos(a-.18)*5,cy+Math.sin(a-.18)*5],[cx+Math.cos(a)*r,cy+Math.sin(a)*r],[cx+Math.cos(a+.18)*5,cy+Math.sin(a+.18)*5]],[240,132,24]);
    }
    image.ellipse(cx,cy,8*scale,11*scale,[255,205,61]);image.ellipse(cx,cy,4*scale,6*scale,[255,249,188]);
    return image.result(name);
  }
  const skin=[174,136,84];
  if(family==='PUNG') {
    const striking=frame!=='A',cx=striking?163:209,cy=striking?105:143;
    image.polygon([[cx-8,168],[cx+33,168],[cx+18,cy+7],[cx-6,cy+4]],(x,y)=>shade(skin,.65+(x-cx+15)/65));
    image.ellipse(cx,cy,19,15,skin,true);
    for(let finger=0;finger<4;finger++){image.ellipse(cx-13+finger*8,cy-7,5,8,shade(skin,1+finger*.025),true);image.line(cx-12+finger*8,cy-4,cx-10+finger*8,cy+1,1,shade(skin,.5));}
    image.ellipse(cx+16,cy+4,7,7,skin,true);image.line(cx-10,cy+8,cx+9,cy+9,1,shade(skin,.5));
    return image.result(name);
  }
  if(family==='PISG') {
    image.polygon([[126,168],[181,168],[179,145+recoil],[170,129+recoil],[146,132+recoil]],(x,y)=>shade(skin,.5+.6*clamp((x-127)/48)));
    image.ellipse(157,146+recoil,18,14,skin,true);
    image.polygon([[145,140+recoil],[173,140+recoil],[169,165],[151,165]],[38,43,31]);
    for(let row=0;row<5;row++)image.line(149,144+row*3+recoil,169,143+row*3+recoil,1,[89,91,62]);
    image.polygon([[145,141+recoil],[139,116+recoil],[149,94+recoil],[169,94+recoil],[179,116+recoil],[173,141+recoil]],(x,y)=>shade([117,126,117],.4+.9*(1-Math.abs(x-157)/23)+(noise(x,y,13)-.5)*.05));
    image.polygon([[145,115+recoil],[151,96+recoil],[167,96+recoil],[173,115+recoil]],[71,82,76]);
    image.rect(145,118+recoil,28,7,[32,43,37]);image.rect(150,119+recoil,18,2,[143,153,137]);
    image.bevel(151,97+recoil,16,9,[43,53,47],true);image.ellipse(159,101+recoil,4,2,[11,20,17]);
    image.bevel(157,92+recoil,4,5,[161,172,150]);image.line(143,117+recoil,146,136+recoil,1,[190,192,157]);
    for(let finger=0;finger<3;finger++)image.ellipse(171,146+finger*5+recoil,7,3.3,skin,true);
  } else {
    const pumping=frame!=='A',shift=frame==='C'?-31:frame==='D'?-18:frame==='B'?-12:0,up=pumping?-12:0;
    image.polygon([[105,168],[143,168],[152+shift,141+up],[134+shift,133+up]],(x,y)=>shade(skin,.6+(x-105)/65));
    image.polygon([[183,168],[216,168],[188+shift,143+up],[171+shift,141+up]],(x,y)=>shade(skin,.65+(216-x)/80));
    image.polygon([[136+shift,168],[182+shift,168],[175+shift,135+up],[166+shift,107+up],[154+shift,107+up],[145+shift,135+up]],(x,y)=>shade([111,120,107],.42+.8*(1-Math.abs(x-(159+shift))/23)));
    image.polygon([[152+shift,109+up],[168+shift,109+up],[178+shift,147+up],[141+shift,147+up]],(x,y)=>shade([55,66,58],.6+.6*(1-Math.abs(x-(160+shift))/20)));
    image.line(154+shift,108+up,147+shift,145+up,2,[179,187,159]);
    image.bevel(154+shift,105+up,12,7,[51,60,51],true);image.ellipse(160+shift,109+up,4,2,[13,21,16]);
    image.bevel(158+shift,102+up,4,5,[185,190,150]);
    image.polygon([[140+shift,139+up],[178+shift,139+up],[184+shift,154+up],[134+shift,154+up]],(x,y)=>shade([119,82,43],.7+.5*(1-Math.abs(x-(158+shift))/28)));
    for(let y=142+up;y<154+up;y+=3)image.line(137+shift,y,181+shift,y,1,[55,47,29]);
    image.ellipse(139+shift,149+up,11,7,skin,true);image.ellipse(178+shift,154+up,10,8,skin,true);
    for(let finger=0;finger<3;finger++)image.line(133+shift,146+up+finger*3,144+shift,146+up+finger*3,1,shade(skin,.6));
  }
  return image.result(name);
}

export function hasProceduralPatch(value) {
  return /^(?:POSS|SPOS|TROO)[A-Z][0-8](?:[A-Z][0-8])?$|^(?:STIM|MEDI|BON1|BON2|ARM1|ARM2|CLIP|AMMO|SHEL|SBOX|SHOT|BAR1|BEXP|BAL1|ELEC|COLU|CBRA|PLAY|POL5|PISG|PISF|SHTG|SHTF|PUNG)[A-Z][0-8]$|^ST(?:TNUM|YSNUM|GNUM)\d$|^STF(?:ST\d[0-2]|OUCH\d|DEAD0)$|^(?:STBAR|STTPRCNT|M_DOOM)$/.test(String(value||'').toUpperCase());
}

export function proceduralPatch(value) {
  const name=String(value||'').toUpperCase();
  if(!hasProceduralPatch(name))return null;
  const key=/^(POSS|SPOS|TROO)/.test(name)?name.slice(0,6):name;
  if(cache.has(key))return cache.get(key);
  const family=name.slice(0,4),frame=name[4]||'A';let result;
  if(/^(POSS|SPOS|TROO)/.test(name))result=character(name,family,frame,Number(name[5]));
  else if(/^(STIM|MEDI|BON1|BON2|ARM1|ARM2|CLIP|AMMO|SHEL|SBOX|SHOT)/.test(name))result=pickup(name,family,frame);
  else if(family==='BAR1')result=barrel(name,frame);
  else if(family==='BEXP'||family==='BAL1')result=explosion(name,frame,family==='BAL1');
  else if(/^(ELEC|COLU|CBRA|PLAY|POL5)/.test(name))result=scenery(name,family);
  else if(/^(PISG|PISF|SHTG|SHTF|PUNG)/.test(name))result=weapon(name,family,frame);
  else if(/^ST(TNUM|YSNUM|GNUM)/.test(name))result=digit(name);
  else if(name.startsWith('STF'))result=face(name);
  else if(name==='STBAR')result=statusBar(name);
  else if(name==='M_DOOM')result=logo(name);
  else if(name==='STTPRCNT'){
    const image=new Raster(14,16);image.line(3,13,11,2,2,[191,57,35]);image.ellipse(3,3,2.5,2.5,[214,70,45],true);image.ellipse(10,12,2.5,2.5,[214,70,45],true);result=image.result(name);
  }
  cache.set(key,result);return result;
}
