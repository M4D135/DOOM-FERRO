/** Industrial surfaces constructed mathematically; no imported image resources. */
import { Raster, clamp, mix, shade, seedOf, noise, smoothNoise } from './procedural-raster.js';

const walls = new Map(), flats = new Map(), TAU = Math.PI * 2;
const metal = [92, 104, 101], brown = [112, 88, 58], olive = [83, 94, 61];

function grain(base, x, y, seed, strength = 14) {
  return shade(base, .84 + smoothNoise(x / 11, y / 11, seed) * .27, (noise(x, y, seed) - .5) * strength);
}
function rivet(image, x, y, radius = 2) {
  image.ellipse(x, y, radius + 1, radius + 1, [25, 29, 27]);
  image.ellipse(x, y - .5, radius, radius, [162, 167, 149], true);
  image.pixel(x, y, [66, 74, 67]);
}
function screen(image, x, y, width, height, seed, blue = false) {
  const phosphor = blue ? [103, 182, 202] : [108, 213, 102];
  image.bevel(x - 3, y - 3, width + 6, height + 6, [67, 78, 74], true);
  image.rect(x, y, width, height, (px, py) => {
    const u = (px - x) / width, v = (py - y) / height;
    const vignette = clamp(1 - Math.hypot(u - .5, v - .5));
    return shade(phosphor, .05 + vignette * .12 + (py % 2 ? .018 : 0));
  });
  for (let row = 0; row < 4; row++) {
    const length = 5 + Math.floor(noise(row, 11, seed) * Math.max(1, width - 11));
    image.rect(x + 3, y + 3 + row * 3, length, 1, shade(phosphor, .7 - row * .08));
  }
  for (let column = 0; column < 9; column++) {
    const bar = 2 + noise(column, 9, seed) * Math.max(1, height / 3);
    image.rect(x + 3 + column * (width - 5) / 9, y + height - 3 - bar, 2, bar, shade(phosphor, .5 + column / 18));
  }
  image.rect(x + 1, y + 1, width - 2, 1, shade(phosphor, .6));
}

function sky(name) {
  const image = new Raster(512, 256), seed = seedOf('FERRO-HANGAR-SKY');
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const u = x / image.width, h = y / image.height;
    const cloud = smoothNoise(u * 8, h * 4, seed, 8) * .6 + smoothNoise(u * 32, h * 16, seed + 1, 32) * .25;
    let color = mix([46, 58, 66], [184, 170, 137], clamp(h * 1.7));
    color = shade(color, .74 + cloud * .48);
    const far = 137 + 16 * Math.sin(TAU * u * 3 + .3) + 12 * Math.sin(TAU * u * 7) + 6 * Math.cos(TAU * u * 17);
    const near = 180 + 18 * Math.sin(TAU * u * 2 + 2) + 12 * Math.sin(TAU * u * 11 + 1);
    if (y > far) {
      const ridge = Math.sin(x * .11 + y * .045) * .12 + smoothNoise(u * 32, h * 20, seed + 2, 32) * .27;
      color = shade([100, 108, 102], .5 + ridge + clamp((y - far) / 55) * .23);
      if (y - far < 3 + 3 * Math.sin(x * .12)) color = shade([145, 151, 139], .7 + ridge);
    }
    if (y > near) color = shade([62, 70, 63], .6 + smoothNoise(u * 32, h * 20, seed + 3, 32) * .6);
    if (y > 224) color = shade([32, 40, 36], .7 + noise(x, y, seed) * .3);
    image.pixel(x, y, color);
  }
  // A low silhouette of the installation, generated from its bay indices.
  for (let bay = 0; bay < 18; bay++) {
    const x = bay * 31 + 5, height = 5 + Math.floor(noise(bay, 2, seed) * 20);
    image.rect(x, 235 - height, 18, height + 21, [30, 37, 34]);
    if (bay % 3 === 0) image.line(x + 9, 235 - height, x + 9, 222 - height, 1, [27, 34, 32]);
    for (let lamp = 0; lamp < 3; lamp++) image.pixel(x + 4 + lamp * 5, 237 - height, [130, 127, 78]);
  }
  return image.result(name);
}

function textureSize(name) {
  if (name === 'EXITSIGN') return [64, 16];
  if (/^STEP/.test(name)) return [64, 16];
  if (name === 'COMPSPAN') return [128, 16];
  if (name === 'DOORTRAK') return [8, 128];
  if (name === 'DOORSTOP') return [16, 128];
  if (/^SUPPORT|^LITE/.test(name)) return [32, 128];
  if (name === 'EXITDOOR' || name === 'DOOR3') return [64, 72];
  return [128, 128];
}

export function proceduralTexture(value) {
  const name = String(value || '').toUpperCase();
  if (!name || name === '-') return null;
  if (walls.has(name)) return walls.get(name);
  if (name === 'SKY1') { const result = sky(name); walls.set(name, result); return result; }
  const [width, height] = textureSize(name), image = new Raster(width, height), seed = seedOf(name.replace(/^SW[12]/, 'SW'));
  const isComputer = /COMP|TEK|PLANET/.test(name), isDoor = /DOOR/.test(name), isLight = /^LITE/.test(name);
  const isStone = /ROCK|STONE|BROWN144|BRNBIG/.test(name), isGreen = /GRN|GR1|STARG|SLAD|NUKE/.test(name);
  const base = isComputer ? [52, 65, 62] : isDoor ? metal : isGreen ? olive : /BROWN|START|SW/.test(name) ? brown : metal;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let color = grain(base, x, y, seed);
    if (isStone) {
      const row = Math.floor(y / 32), brick = (x + (row % 2) * 32) % 64, by = y % 32;
      const rough = smoothNoise(x / 5, y / 5, seed) * .25 + smoothNoise(x / 17, y / 17, seed) * .35;
      color = shade([118, 97, 68], .5 + rough, (noise(x, y, seed) - .5) * 20);
      if (brick < 2 || by < 2) color = [39, 40, 31];
      else if (brick === 2 || by === 2) color = shade(color, 1.32);
      else if (brick > 61 || by > 29) color = shade(color, .65);
    } else {
      const px = x % 32, py = y % 64;
      const panelVariation = .9 + noise(Math.floor(x / 32), Math.floor(y / 64), seed) * .2;
      color = shade(color, panelVariation);
      if (px === 0 || py === 0) color = shade(color, .32);
      else if (px === 1 || py === 1) color = shade(color, 1.45);
      else if (px === 31 || py === 63) color = shade(color, .55);
      if (/START|STARG|STARGR/.test(name)) {
        const band = y % 24;
        if (band < 3) color = shade(color, band === 1 ? 1.4 : .4);
        else color = shade(color, 1 + Math.sin((band - 3) / 21 * Math.PI) * .13);
      }
      if (/SUPPORT|DOORTRAK|DOORSTOP|COMPSPAN|STEP/.test(name)) {
        const stripe = /STEP/.test(name) ? y % 5 : x % 8;
        color = shade(base, stripe < 2 ? .35 : stripe < 4 ? 1.35 : .72, noise(x, y, seed) * 9);
      }
    }
    image.pixel(x, y, color);
  }
  if (!isStone && width >= 32 && height > 16) {
    for (let y = 6; y < height; y += 64) for (let x = 5; x < width; x += 32) { rivet(image, x, y, 1.5); rivet(image, x + 21, y + 51, 1.5); }
  }
  if (isDoor && width >= 64) {
    const seam = width / 2;
    image.bevel(7, 7, width - 14, height - 17, [85, 94, 87], true);
    for (const side of [-1, 1]) {
      const x = side < 0 ? 10 : seam + 2, panelWidth = seam - 12;
      image.bevel(x, 11, panelWidth, height - 30, side < 0 ? [113, 121, 108] : [91, 102, 95]);
      for (let y = 17; y < height - 25; y += 14) image.rect(x + 4, y, panelWidth - 8, 2, [53, 63, 58]);
      image.line(x + 3, 14, x + panelWidth - 4, height - 23, 4, [56, 68, 62]);
      image.line(x + 3, 13, x + panelWidth - 4, height - 24, 1, [169, 177, 150]);
    }
    image.rect(seam - 1, 5, 2, height - 13, [15, 22, 20]);
    image.rect(6, height - 12, width - 12, 7, (x, y) => (Math.floor((x + y) / 8) % 2) ? [157, 135, 48] : [35, 40, 29]);
    image.bevel(seam - 11, 8, 22, 8, [38, 49, 44]);
    image.rect(seam - 8, 10, 16, 3, name === 'BIGDOOR4' ? [154, 41, 29] : [82, 153, 88]);
    if (name === 'EXITDOOR') image.text('EXIT', 19, 22, 8, [209, 203, 169], 1.1, 1);
  }
  if (isComputer) {
    if (/TEK/.test(name)) {
      for (let cable = 0; cable < 16; cable++) {
        const x = 4 + cable * 8, bend = 15 + noise(cable, 2, seed) * 80;
        image.line(x, 0, x, bend, 3, cable % 3 ? [58, 77, 64] : [118, 79, 44]);
        image.line(x, bend, x + 5, bend + 8, 3, [46, 55, 48]);
        image.line(x + 5, bend + 8, x + 5, 128, 3, [83, 93, 73]);
        for (let y = 13; y < 128; y += 31) image.bevel(x - 2, y, 6, 5, [130, 137, 111]);
      }
      screen(image, 18, 24, 40, 29, seed, true); screen(image, 73, 75, 36, 28, seed + 4);
    } else if (name === 'COMPTALL') {
      screen(image, 12, 12, 46, 52, seed); screen(image, 72, 12, 44, 52, seed + 2, true);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++) image.bevel(11 + col * 9, 77 + row * 7, 6, 4, col % 4 === 0 ? [113, 85, 49] : [71, 92, 78]);
    } else if (name !== 'COMPSPAN') {
      for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) screen(image, 9 + column * 64, 8 + row * 64, 46, 38, seed + row * 7 + column, column === 1);
      for (let y = 51; y < 128; y += 64) for (let x = 10; x < 124; x += 8) image.bevel(x, y, 4, 5, (x % 24) ? [120, 132, 112] : [169, 65, 33]);
    }
    if (name === 'PLANET1') {
      image.bevel(13, 10, 102, 104, [26, 37, 34], true);
      image.ellipse(64, 62, 38, 38, (x, y) => {
        const u = (x - 64) / 38, v = (y - 62) / 38, n = smoothNoise(u * 9 + 12, v * 8 + 12, seed);
        return shade(n > .52 ? [126, 156, 95] : [53, 107, 116], .3 + .8 * clamp(-u * .5 - v * .4 + Math.sqrt(clamp(1 - u * u - v * v))));
      });
      image.text('ORBIT', 29, 100, 6, [128, 170, 135], 1, 1);
    }
  }
  if (isLight) {
    for (const x of [6, 19]) {
      image.bevel(x - 2, 4, 9, height - 8, [29, 37, 31], true);
      image.rect(x, 7, 5, height - 14, (px, py) => shade([219, 235, 175], .72 + .24 * Math.sin((px - x + 1) * .6) - (py % 16 === 0 ? .3 : 0)));
    }
  }
  if (/^SW[12]/.test(name)) {
    const on = name[2] === '2';
    image.bevel(35, 29, 58, 76, [81, 89, 76]);
    image.bevel(41, 35, 46, 64, [24, 31, 26], true);
    image.ellipse(64, 45, 7, 5, on ? [143, 236, 105] : [222, 63, 39], true);
    image.bevel(58, 57, 12, 24, [63, 71, 65], true);
    image.line(64, 69, 64 + (on ? 5 : -5), on ? 57 : 82, 5, [172, 177, 157]);
    image.ellipse(64 + (on ? 5 : -5), on ? 57 : 82, 6, 4, [128, 138, 115], true);
    image.text(on ? 'ON' : 'OFF', on ? 58 : 53, 88, 5, on ? [145, 198, 117] : [161, 97, 76], 1, 2);
    for (const x of [38, 90]) for (const y of [32, 102]) rivet(image, x, y, 1.5);
  }
  if (name === 'EXITSIGN') {
    image.bevel(0, 0, 64, 16, [61, 28, 21]); image.rect(3, 3, 58, 10, (x,y)=>grain([122,39,26],x,y,seed,9));
    image.text('EXIT', 15, 4, 7, [227, 220, 177], 1.3, 2);
  }
  if (name === 'NUKE24') {
    for (let x = 16; x < 128; x += 32) {
      image.bevel(x - 10, 38, 21, 37, [146, 157, 54]);
      image.ellipse(x, 56, 3, 3, [29, 42, 23]);
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3;
        image.polygon([[x + Math.cos(a) * 4, 56 + Math.sin(a) * 4], [x + Math.cos(a - .45) * 9, 56 + Math.sin(a - .45) * 9], [x + Math.cos(a + .45) * 9, 56 + Math.sin(a + .45) * 9]], [29, 42, 23]);
      }
    }
  }
  const result = image.result(name); walls.set(name, result); return result;
}

export function proceduralFlat(value) {
  const name = String(value || '').toUpperCase();
  if (!name || name === '-') return null;
  if (flats.has(name)) return flats.get(name);
  const image = new Raster(64, 64), seed = seedOf(name.replace(/[123]$/, '')), toxic = /^NUKAGE/.test(name);
  const phase = ((Number(name.at(-1)) || 1) - 1) * TAU / 3;
  const isLamp = /^TLITE/.test(name), isStone = /FLOOR7|ROCK|STONE/.test(name), isGrate = /FLOOR1|FLAT5|FLOOR6/.test(name);
  const base = /FLOOR5|STEP/.test(name) ? [90, 83, 60] : /FLAT14/.test(name) ? [59, 87, 105] : /FLAT20/.test(name) ? [107, 61, 42] : /CEIL/.test(name) ? [93, 102, 87] : [80, 88, 79];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    let color = grain(base, x, y, seed, 16);
    if (toxic) {
      const u = x / 64 * TAU, v = y / 64 * TAU;
      const flow = Math.sin(u * 2 + Math.sin(v + phase) + phase) + Math.cos(v * 3 + Math.cos(u - phase) - phase) * .6;
      const foam = Math.pow(clamp(1 - Math.abs(flow) * 2), 5);
      color = [30 + foam * 55 + flow * 7, 87 + foam * 90 + flow * 20, 12 + foam * 27];
      color = shade(color, .85 + noise(x, y, seed) * .2);
    } else if (isStone) {
      const n = smoothNoise(x / 8, y / 8, seed, 8), veins = Math.abs(Math.sin((x + y) * .23 + n * 7));
      color = shade([105, 97, 73], .55 + n * .5 + (veins < .07 ? -.25 : 0), noise(x, y, seed) * 10);
    } else if (isGrate) {
      if (x % 8 > 2 && y % 8 > 2) color = shade([39, 45, 35], .7 + noise(x, y, seed) * .3);
      else color = shade(color, x % 8 === 0 || y % 8 === 0 ? 1.5 : .7);
    } else {
      const size = /FLOOR4|FLAT18/.test(name) ? 16 : 32, px = x % size, py = y % size;
      if (px === 0 || py === 0) color = shade(color, .32);
      else if (px === 1 || py === 1) color = shade(color, 1.45);
      else if (px === size - 1 || py === size - 1) color = shade(color, .65);
    }
    image.pixel(x, y, color);
  }
  if (toxic) {
    for (let bubble = 0; bubble < 7; bubble++) {
      const x = 4 + noise(bubble, 1, seed) * 55 + Math.sin(phase + bubble) * 2;
      const y = 4 + noise(bubble, 2, seed) * 55 + Math.cos(phase + bubble) * 2;
      const radius = 1.5 + (Math.sin(phase + bubble * 2) + 1) * 1.2;
      image.ellipse(x, y, radius, radius * .65, [121, 175, 39], true);
    }
  } else if (isLamp) {
    image.bevel(5, 8, 54, 48, [31, 41, 34], true);
    for (let row = 0; row < 3; row++) {
      image.bevel(9, 12 + row * 13, 46, 9, [103, 120, 83]);
      image.rect(11, 14 + row * 13, 42, 5, (x, y) => shade([210, 228, 169], .8 + .16 * Math.cos((y % 13) * .5) - (x % 11 === 0 ? .22 : 0)));
    }
  } else if (!isStone) {
    for (const x of [4, 59]) for (const y of [4, 59]) rivet(image, x, y, 1);
  }
  const result = image.result(name); flats.set(name, result); return result;
}
