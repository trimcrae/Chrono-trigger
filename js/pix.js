// pix.js — procedural pixel-art generation for characters and tiles.
// Everything is drawn at runtime into offscreen canvases, then cached.

export const TILE = 16;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { c, x };
}

// tiny deterministic RNG so texture noise is stable between frames
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const px = (x, y, w, h, col, g) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

/* ------------------------------------------------------------------ */
/* CHARACTERS                                                          */
/* ------------------------------------------------------------------ */

// Frame layout: 16 wide x 24 tall. Feet rest on y=23.
// dirs: down, up, left, right. frames: 0..3 (0/2 = stand, 1 = left step, 3 = right step)

/* ---------- palette helpers: every tone is derived from one base colour ---------- */
const _hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const _rgb = (r, g, b) => '#' + [r, g, b]
  .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function mix(a, b, t) {
  const A = _hx(a), B = _hx(b);
  return _rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const dk = (c, t = 0.3) => mix(c, '#170f1a', t);
export const lt = (c, t = 0.25) => mix(c, '#fffdf2', t);

// SNES-era sprites outline in a dark tint of the material, not pure black.
const OUT = '#2b1d26';

export const CHARS = {
  crono: {
    skin: '#f6cb9c', hair: '#f0571c', top: '#2f6f96', bottom: '#efe9d8',
    shoes: '#8a5a2c', style: 'spiky', band: '#f4f2ec', sash: '#d8b23a', sword: true,
  },
  marle: {
    skin: '#fad7a8', hair: '#f5d95e', top: '#f2f0e6', bottom: '#cdb782',
    shoes: '#7a4a28', style: 'ponytail', trim: '#2fa46a', pendant: true,
  },
  lucca: {
    skin: '#fad7a8', hair: '#8b46bd', top: '#e9b652', bottom: '#8a5330',
    shoes: '#5a3520', style: 'helmet', helmet: '#e3702e', glasses: true,
  },
  mom: {
    skin: '#fad7a8', hair: '#b3592b', top: '#c9527a', bottom: '#a33f60',
    shoes: '#7a4426', style: 'bob',
  },
  taban: {
    skin: '#e9b981', hair: '#3d3130', top: '#3b7ab8', bottom: '#5b5b6a',
    shoes: '#332a28', style: 'bald', beard: '#f0efe8', big: true,
  },
  villager1: {
    skin: '#f1c496', hair: '#54331f', top: '#4fa356', bottom: '#63523f',
    shoes: '#40291a', style: 'bob',
  },
  villager2: {
    skin: '#e9cbaa', hair: '#efd268', top: '#a95fc0', bottom: '#7c3f8e',
    shoes: '#523322', style: 'bob',
  },
  villager3: {
    skin: '#d9a97a', hair: '#232228', top: '#d8a63f', bottom: '#3f5aa0',
    shoes: '#31221f', style: 'spiky',
  },
  kid: {
    skin: '#fad7a8', hair: '#a54a29', top: '#e0503f', bottom: '#4a79c8',
    shoes: '#3f3028', style: 'bob', small: true,
  },
  guard: {
    skin: '#e9c191', hair: '#6a7280', top: '#8a93a3', bottom: '#4a4a58',
    shoes: '#2b2b32', style: 'helm',
  },
  cat: { cat: true },
};

/* ------------------------------------------------------------------ *
 * Field sprite: 16x24, feet planted on y=23.
 * Proportions follow the SNES look — a big head roughly a third of the
 * body, a short torso, an outline in a dark tint, one light source from
 * the upper left, and a four frame walk cycle with a one pixel body bob.
 * ------------------------------------------------------------------ */
function drawHuman(g, c, dir, frame) {
  const back = dir === 'up';
  const side = dir === 'left' || dir === 'right';
  const flip = dir === 'left';
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;   // which foot leads
  const bob = step ? 1 : 0;                              // body lifts mid-stride

  const skin = c.skin, skinD = dk(skin, 0.2), skinL = lt(skin, 0.16);
  const hair = c.hair, hairD = dk(hair, 0.34), hairL = lt(hair, 0.3);
  const top = c.top, topD = dk(top, 0.28), topL = lt(top, 0.16);
  const bot = c.bottom, botD = dk(bot, 0.28);
  const shoe = c.shoes, shoeD = dk(shoe, 0.28);

  g.save();
  if (flip) { g.translate(16, 0); g.scale(-1, 1); }

  // outlined block: silhouette first, fill inset by a pixel, shade down the right
  const shp = (x, y, w, h, fill, shade) => {
    if (h <= 0) return;
    px(x, y, w, h, OUT, g);
    if (w > 2 && h > 2) {
      px(x + 1, y + 1, w - 2, h - 2, fill, g);
      if (shade) px(x + w - 2, y + 1, 1, h - 2, shade, g);
    }
  };

  /* --- vertical layout ---------------------------------------------
     0..3   hair spikes / helmet plume
     hy..   head, 10 tall
     12..17 torso        18..20 legs        20..23 shoes
     ------------------------------------------------------------------ */
  const drop = c.small ? 3 : c.big ? -1 : 0;
  const Y = v => v + drop - bob;          // head/torso/arms ride the bob
  const G = v => v + drop;                // feet stay planted
  const hy = c.style === 'spiky' ? 4 : c.style === 'helm' ? 3 : 2;

  // ground shadow
  g.globalAlpha = 0.22;
  px(4, G(21), 8, 2, '#000000', g);
  px(3, G(22), 10, 1, '#000000', g);
  g.globalAlpha = 1;

  /* ---- legs: one block with a stride gap, so they read at 16px ---- */
  const hip = Y(17), sole = G(21);
  const legW = side ? 6 : 8, legX = side ? 5 : 4;
  shp(legX, hip, legW, sole - hip + 1, bot, botD);
  if (!side) {
    // stride gap slides left/right with the step
    px(7 + step, hip + 1, 2, sole - hip - 1, OUT, g);
  }
  // shoes
  if (side) {
    shp(4 + step * 2, G(20), 7, 3, shoe, shoeD);
    shp(4 - step, G(20), 5, 3, dk(shoe, 0.15), shoeD);
  } else {
    shp(3, G(20) - (step > 0 ? 1 : 0), 5, 3, shoe, shoeD);
    shp(8, G(20) - (step < 0 ? 1 : 0), 5, 3, shoe, shoeD);
  }

  /* ---- far arm (behind the body on side views) ---- */
  const armY = Y(11), swing = step;
  if (side) shp(6, armY + 1 - swing, 3, 6, topD, dk(top, 0.45));

  /* ---- torso ---- */
  if (side) shp(5, Y(11), 6, 7, top, topD);
  else {
    shp(3, Y(11), 10, 7, top, topD);
    px(3, Y(11), 1, 1, OUT, g); px(12, Y(11), 1, 1, OUT, g);   // rounded shoulders
    px(4, Y(12), 3, 1, topL, g);
  }
  if (c.trim) {
    px(side ? 6 : 4, Y(12), side ? 4 : 8, 1, c.trim, g);
    if (!side && !back) px(7, Y(13), 2, 4, c.trim, g);
  }
  if (c.sash) px(side ? 6 : 4, Y(15), side ? 5 : 8, 2, c.sash, g);

  /* ---- near arms ---- */
  if (side) {
    shp(7, armY + 1 + swing, 3, 6, top, topD);
    px(8, armY + 6 + swing, 2, 2, skin, g);
  } else {
    shp(1, armY + Math.max(0, swing), 3, 7, top, topD);
    shp(12, armY - Math.min(0, swing), 3, 7, top, topD);
    px(2, armY + 5 + Math.max(0, swing), 2, 2, skin, g);
    px(13, armY + 5 - Math.min(0, swing), 2, 2, skin, g);
  }

  /* ---- long hair that hangs behind the head ---- */
  if (c.style === 'ponytail' && !back) {
    const tx = side ? 1 : 12;
    px(tx, Y(hy + 2), 3, 11, hair, g);
    px(tx, Y(hy + 2), 1, 11, hairL, g);
    px(tx + 2, Y(hy + 2), 1, 11, hairD, g);
    px(tx, Y(hy + 12), 3, 2, hairD, g);
  }

  /* ---- head ---- */
  const hw = side ? 9 : 10, hx0 = side ? 3 : 3;
  shp(hx0, Y(hy), hw, 10, skin, skinD);
  px(hx0, Y(hy), 1, 1, OUT, g); px(hx0 + hw - 1, Y(hy), 1, 1, OUT, g);
  px(hx0 + 1, Y(hy + 1), 2, 1, skinL, g);

  /* ---- face ---- */
  if (!back) {
    const ey = Y(hy + 5);
    if (side) {
      px(8, ey, 2, 3, OUT, g);
      px(8, ey, 1, 2, '#ffffff', g);
      px(9, ey + 3, 2, 1, skinD, g);
    } else {
      px(5, ey, 2, 3, OUT, g); px(9, ey, 2, 3, OUT, g);
      px(5, ey, 1, 2, '#ffffff', g); px(9, ey, 1, 2, '#ffffff', g);
      px(7, ey + 3, 2, 1, skinD, g);
    }
  }
  if (c.glasses && !back) {
    const ey = Y(hy + 4);
    px(side ? 7 : 4, ey, side ? 5 : 8, 4, dk('#7fd0ee', 0.6), g);
    px(side ? 8 : 5, ey + 1, side ? 3 : 2, 2, '#d6eefb', g);
    if (!side) px(9, ey + 1, 2, 2, '#d6eefb', g);
  }
  if (c.beard && !back) {
    px(4, Y(hy + 7), 8, 3, c.beard, g);
    px(4, Y(hy + 7), 8, 1, dk(c.beard, 0.18), g);
  }

  /* ---- hair ---- */
  const style = c.style;
  if (style === 'spiky') {
    px(3, Y(hy), 10, 3, hair, g);
    px(4, Y(hy + 1), 4, 1, hairL, g);
    px(3, Y(hy + 2), 10, 1, hairD, g);
    const spikes = side ? [[3, 3], [5, 4], [7, 4], [9, 3], [11, 2]]
      : [[2, 3], [4, 4], [6, 4], [8, 4], [10, 3], [12, 2]];
    for (const [x, h] of spikes) {
      px(x, Y(hy) - h, 2, h + 1, hair, g);
      px(x, Y(hy) - h, 1, h, hairL, g);
      px(x + 1, Y(hy) - h, 1, 1, hairD, g);
    }
    px(2, Y(hy + 1), 1, 3, hairD, g);
    px(13, Y(hy + 1), 1, 3, hairD, g);
    if (c.band) {
      px(3, Y(hy + 3), 10, 2, c.band, g);
      px(3, Y(hy + 4), 10, 1, dk(c.band, 0.2), g);
      px(12, Y(hy + 3), 2, 6, c.band, g);                 // trailing tie
      px(13, Y(hy + 5), 1, 4, dk(c.band, 0.2), g);
    }
    if (back) { px(3, Y(hy), 10, 5, hair, g); px(3, Y(hy + 4), 10, 1, hairD, g); }
  } else if (style === 'ponytail') {
    px(3, Y(hy - 1), 10, 4, hair, g);
    px(3, Y(hy - 1), 10, 1, hairD, g);
    px(4, Y(hy), 4, 1, hairL, g);
    px(2, Y(hy + 1), 2, 4, hair, g);
    px(12, Y(hy + 1), 2, 4, hair, g);
    px(13, Y(hy + 1), 1, 4, hairD, g);
    if (back) {
      px(3, Y(hy), 10, 8, hair, g);
      px(6, Y(hy + 6), 4, 10, hair, g);
      px(6, Y(hy + 6), 1, 10, hairL, g);
      px(9, Y(hy + 6), 1, 10, hairD, g);
      px(6, Y(hy + 15), 4, 2, hairD, g);
    }
    if (c.pendant && !back) {
      px(7, Y(13), 2, 2, '#f7e37a', g);
      px(7, Y(13), 1, 1, '#fff8c8', g);
    }
  } else if (style === 'helmet') {
    px(3, Y(hy - 1), 10, 3, hair, g);                     // hair above the rim
    px(2, Y(hy + 6), 3, 4, hair, g);                      // hair below the rim
    px(11, Y(hy + 6), 3, 4, hair, g);
    shp(2, Y(hy - 2), 12, 6, c.helmet || hair, dk(c.helmet || hair, 0.3));
    px(3, Y(hy - 1), 8, 1, lt(c.helmet || hair, 0.4), g);
    px(2, Y(hy + 3), 12, 1, dk(c.helmet || hair, 0.5), g);
    px(1, Y(hy), 1, 3, dk(c.helmet || hair, 0.35), g);
    px(14, Y(hy), 1, 3, dk(c.helmet || hair, 0.35), g);
  } else if (style === 'bob') {
    px(3, Y(hy - 1), 10, 4, hair, g);
    px(3, Y(hy - 1), 10, 1, hairD, g);
    px(4, Y(hy), 4, 1, hairL, g);
    px(2, Y(hy + 1), 2, 7, hair, g);
    px(12, Y(hy + 1), 2, 7, hair, g);
    px(13, Y(hy + 1), 1, 7, hairD, g);
    if (back) { px(3, Y(hy), 10, 9, hair, g); px(4, Y(hy + 1), 3, 7, hairL, g); }
  } else if (style === 'bald') {
    px(4, Y(hy), 8, 2, skinL, g);
    px(2, Y(hy + 2), 2, 4, hair, g);
    px(12, Y(hy + 2), 2, 4, hair, g);
  } else if (style === 'helm') {
    shp(2, Y(hy - 2), 12, 7, c.hair, dk(c.hair, 0.3));
    px(3, Y(hy - 1), 9, 1, lt(c.hair, 0.45), g);
    px(6, Y(hy - 5), 4, 4, '#b8433b', g);                 // plume
    px(6, Y(hy - 5), 2, 4, '#d8615a', g);
    if (!back) px(4, Y(hy + 3), 8, 2, dk(c.hair, 0.55), g);
  }

  /* ---- Crono's katana rides on his back ---- */
  if (c.sword) {
    if (back) {
      px(4, Y(11), 2, 9, '#c9d2da', g);
      px(4, Y(11), 1, 9, '#8f99a6', g);
      px(3, Y(10), 4, 2, '#7b5326', g);
      px(3, Y(19), 4, 2, '#7b5326', g);
    } else if (side) {
      px(3, Y(11), 2, 8, '#8f99a6', g);
      px(2, Y(10), 4, 2, '#7b5326', g);
    } else {
      px(12, Y(hy + 6), 2, 5, '#8f99a6', g);              // hilt over the shoulder
      px(11, Y(hy + 9), 4, 2, '#7b5326', g);
    }
  }

  g.restore();
}

function drawCat(g, dir, frame) {
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const body = '#e2a83e', bodyD = dk(body, 0.3), bodyL = lt(body, 0.25);
  g.globalAlpha = 0.22; px(4, 21, 8, 2, '#000000', g); g.globalAlpha = 1;
  // body
  px(3, 14, 10, 8, OUT, g);
  px(4, 15, 8, 6, body, g);
  px(10, 15, 1, 6, bodyD, g);
  px(5, 15, 3, 2, bodyL, g);
  px(4, 21, 2, 2, OUT, g); px(10, 21, 2, 2, OUT, g);
  // head
  px(2, 10, 8, 7, OUT, g);
  px(3, 11, 6, 5, body, g);
  px(8, 11, 1, 5, bodyD, g);
  px(2, 8, 3, 3, OUT, g); px(7, 8, 3, 3, OUT, g);
  px(3, 9, 1, 2, '#f0b9a8', g); px(8, 9, 1, 2, '#f0b9a8', g);
  if (dir !== 'up') {
    px(4, 12, 1, 2, '#26351f', g); px(7, 12, 1, 2, '#26351f', g);
    px(5, 14, 2, 1, '#c9764f', g);
  }
  // tail
  px(12, 12 + step, 2, 6, OUT, g);
  px(12, 13 + step, 1, 4, body, g);
}

/* ------------------------------------------------------------------ *
 * Optional art override.
 * Every drawing routine below is a fallback. If a sprite sheet has been
 * supplied (see js/assets.js and assets/README.md) its frames are pushed
 * into these caches at boot and used verbatim instead.
 * ------------------------------------------------------------------ */
export const CHAR_ORDER = Object.keys(CHARS);
export const DIRS = ['down', 'up', 'left', 'right'];
export const FRAME_W = 16, FRAME_H = 24, FRAMES = 4;

const charCache = new Map();
export function primeChar(name, dir, frame, canvas) { charCache.set(name + dir + frame, canvas); }
export function primeTile(ch, canvas) { for (let i = 0; i < 8; i++) tileCache.set(ch + ':' + i, canvas); }
export function primeProp(name, canvas) { propCache.set(name, canvas); }

export function charFrame(name, dir, frame) {
  const key = name + dir + frame;
  let f = charCache.get(key);
  if (f) return f;
  const { c, x } = makeCanvas(16, 24);
  const def = CHARS[name] || CHARS.villager1;
  if (def.cat) drawCat(x, dir, frame); else drawHuman(x, def, dir, frame);
  charCache.set(key, c);
  return c;
}

/* ------------------------------------------------------------------ */
/* TILES                                                               */
/* ------------------------------------------------------------------ */

const tileCache = new Map();
const propCache = new Map();

const TILE_DRAW = {
  // --- outdoor ---
  '.': (g, r) => { // grass
    px(0, 0, 16, 16, '#3c9038', g);
    for (let i = 0; i < 22; i++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0;
      px(x, y, 1, 1, r() > .5 ? '#48a840' : '#308030', g);
    }
  },
  ',': (g, r) => { // flowered grass
    TILE_DRAW['.'](g, r);
    for (let i = 0; i < 3; i++) {
      const x = 2 + ((r() * 12) | 0), y = 2 + ((r() * 12) | 0);
      px(x, y, 2, 2, ['#f8f070', '#f8a0c0', '#f8f8f8'][(r() * 3) | 0], g);
    }
  },
  '=': (g, r) => { // dirt path
    px(0, 0, 16, 16, '#c8a068', g);
    for (let i = 0; i < 26; i++) px((r() * 16) | 0, (r() * 16) | 0, 1, 1, r() > .5 ? '#d8b078' : '#b08850', g);
  },
  'P': (g, r) => { // stone pavement
    px(0, 0, 16, 16, '#b8b0a0', g);
    px(0, 0, 16, 1, '#9890 80'.replace(' ', ''), g);
    px(0, 8, 16, 1, '#989080', g);
    px(0, 0, 1, 16, '#989080', g);
    px(8, 8, 1, 8, '#989080', g);
    for (let i = 0; i < 12; i++) px((r() * 16) | 0, (r() * 16) | 0, 1, 1, '#c8c0b0', g);
  },
  'T': (g, r) => { // tree
    TILE_DRAW['.'](g, r);
    px(6, 10, 4, 6, '#785030', g);
    px(2, 1, 12, 10, '#207028', g);
    px(3, 0, 10, 3, '#2c8434', g);
    for (let i = 0; i < 16; i++) px(2 + ((r() * 12) | 0), 1 + ((r() * 9) | 0), 2, 2, r() > .5 ? '#38a040' : '#186020', g);
  },
  '~': (g, r) => { // water
    px(0, 0, 16, 16, '#2858b8', g);
    for (let i = 0; i < 10; i++) px((r() * 16) | 0, (r() * 16) | 0, 3, 1, '#4880e0', g);
    px(0, 4, 16, 1, '#3868c8', g);
  },
  'C': (g, r) => { // cliff / rock
    px(0, 0, 16, 16, '#9c8464', g);
    px(0, 0, 16, 3, '#b89c78', g);
    px(0, 13, 16, 3, '#7c6448', g);
    for (let i = 0; i < 14; i++) px((r() * 16) | 0, (r() * 16) | 0, 2, 1, '#8c7454', g);
  },
  'W': (g, r) => { // fence
    TILE_DRAW['.'](g, r);
    px(0, 6, 16, 3, '#a07840', g);
    px(2, 2, 3, 12, '#8c6434', g);
    px(11, 2, 3, 12, '#8c6434', g);
  },
  'S': (g, r) => { // sign
    TILE_DRAW['.'](g, r);
    px(7, 8, 2, 7, '#8c6434', g);
    px(2, 2, 12, 8, '#c89858', g);
    px(2, 2, 12, 1, '#e8bc78', g);
    px(4, 5, 8, 1, '#7c5424', g);
    px(4, 7, 6, 1, '#7c5424', g);
  },
  'H': (g, r) => { // house wall
    px(0, 0, 16, 16, '#e0d0a8', g);
    px(0, 0, 16, 1, '#c0b088', g);
    for (let i = 0; i < 10; i++) px((r() * 16) | 0, (r() * 16) | 0, 2, 1, '#d0c098', g);
  },
  'R': (g, r) => { // roof
    px(0, 0, 16, 16, '#c04838', g);
    px(0, 0, 16, 2, '#e06850', g);
    px(0, 7, 16, 2, '#a03828', g);
    px(0, 15, 16, 1, '#883020', g);
    for (let i = 0; i < 4; i++) px(i * 4, 2, 1, 5, '#a03828', g);
    for (let i = 0; i < 4; i++) px(2 + i * 4, 9, 1, 6, '#a03828', g);
  },
  'w': (g, r) => { // window
    TILE_DRAW['H'](g, r);
    px(3, 3, 10, 9, '#404858', g);
    px(4, 4, 8, 7, '#78a8d8', g);
    px(4, 4, 4, 3, '#a8d0f0', g);
    px(7, 3, 2, 9, '#8c6434', g);
  },
  'D': (g, r) => { // door
    px(0, 0, 16, 16, '#8c5c30', g);
    px(1, 1, 14, 15, '#a87840', g);
    px(1, 1, 14, 1, '#c89858', g);
    px(11, 8, 2, 2, '#f8d858', g);
    px(7, 1, 2, 15, '#8c5c30', g);
  },
  // --- interior ---
  'f': (g, r) => { // wood floor
    px(0, 0, 16, 16, '#c89058', g);
    px(0, 0, 16, 1, '#d8a068', g);
    px(0, 7, 16, 1, '#a87840', g);
    px(0, 15, 16, 1, '#a87840', g);
    for (let i = 0; i < 8; i++) px((r() * 16) | 0, (r() * 16) | 0, 3, 1, '#b88448', g);
  },
  '#': (g, r) => { // interior wall
    px(0, 0, 16, 16, '#7888b0', g);
    px(0, 0, 16, 2, '#98a8d0', g);
    px(0, 14, 16, 2, '#586890', g);
    for (let i = 0; i < 8; i++) px((r() * 16) | 0, (r() * 16) | 0, 2, 1, '#8898c0', g);
  },
  'r': (g, r) => { // rug
    px(0, 0, 16, 16, '#b04858', g);
    px(0, 0, 16, 2, '#d06878', g);
    px(0, 14, 16, 2, '#883040', g);
    px(4, 4, 8, 8, '#d8a060', g);
    px(6, 6, 4, 4, '#b04858', g);
  },
  'b': (g, r) => { // bed — head end (pillow)
    px(0, 0, 16, 16, '#8c5c30', g);
    px(1, 2, 14, 14, '#e8e8f0', g);
    px(2, 3, 12, 7, '#f8f8f8', g);
    px(2, 3, 12, 1, '#ffffff', g);
    px(1, 11, 14, 5, '#4878c8', g);
    px(1, 11, 14, 1, '#68a0e8', g);
  },
  'q': (g, r) => { // bed — foot end (blanket)
    px(0, 0, 16, 16, '#8c5c30', g);
    px(1, 0, 14, 13, '#4878c8', g);
    px(1, 0, 14, 1, '#68a0e8', g);
    px(1, 6, 14, 1, '#3868b8', g);
    px(1, 13, 14, 3, '#e8e8f0', g);
    for (let i = 0; i < 6; i++) px(2 + i * 2, 2 + ((i * 5) % 9), 1, 1, '#5888d8', g);
  },
  's': (g, r) => { // stairs
    px(0, 0, 16, 16, '#a08868', g);
    for (let i = 0; i < 4; i++) { px(0, i * 4, 16, 3, '#c0a880', g); px(0, i * 4 + 3, 16, 1, '#786048', g); }
  },
  'B': (g, r) => { // bookshelf
    px(0, 0, 16, 16, '#8c5c30', g);
    px(1, 1, 14, 6, '#5c3c20', g);
    px(1, 9, 14, 6, '#5c3c20', g);
    const cols = ['#c04040', '#40a050', '#4060c0', '#c0a040', '#a050c0'];
    for (let i = 0; i < 5; i++) px(2 + i * 3, 2, 2, 5, cols[i], g);
    for (let i = 0; i < 5; i++) px(2 + i * 3, 10, 2, 5, cols[(i + 2) % 5], g);
  },
  't': (g, r) => { // table
    px(0, 0, 16, 16, '#c89058', g);
    px(0, 1, 16, 12, '#d8a870', g);
    px(0, 1, 16, 2, '#e8c090', g);
    px(0, 12, 16, 2, '#a87840', g);
    px(1, 13, 3, 3, '#8c5c30', g);
    px(12, 13, 3, 3, '#8c5c30', g);
  },
  'g': (g, r) => { // dining table with breakfast
    px(0, 0, 16, 16, '#c89058', g);
    px(0, 0, 16, 14, '#e0b880', g);
    px(0, 0, 16, 2, '#f0d0a0', g);
    px(0, 12, 16, 2, '#a87840', g);
    if (r() > .5) { px(4, 4, 8, 6, '#f8f8f0', g); px(6, 6, 4, 3, '#e0a040', g); }
    else { px(5, 3, 6, 7, '#d8d8e8', g); px(11, 5, 3, 2, '#d8d8e8', g); }
  },
  'k': (g, r) => { // kitchen counter / stove
    px(0, 0, 16, 16, '#a0a8b8', g);
    px(0, 0, 16, 3, '#c0c8d8', g);
    px(2, 5, 5, 5, '#404850', g);
    px(9, 5, 5, 5, '#404850', g);
    px(3, 6, 3, 3, '#c04030', g);
    px(0, 14, 16, 2, '#788090', g);
  },
  'p': (g, r) => { // potted plant
    px(0, 0, 16, 16, '#c89058', g);
    px(4, 10, 8, 6, '#b06038', g);
    px(4, 10, 8, 1, '#d08050', g);
    px(3, 2, 10, 8, '#308040', g);
    for (let i = 0; i < 8; i++) px(3 + ((r() * 9) | 0), 2 + ((r() * 7) | 0), 2, 2, '#48a850', g);
  },
  // --- fair ---
  'e': (g, r) => { // tent
    px(0, 0, 16, 16, '#e8e8f0', g);
    px(0, 0, 5, 16, '#d84850', g);
    px(11, 0, 5, 16, '#d84850', g);
    px(0, 0, 16, 2, '#f8f8f8', g);
    px(0, 14, 16, 2, '#b8b8c8', g);
  },
  'E': (g, r) => { // tent top / awning
    px(0, 0, 16, 16, '#3878c8', g);
    px(0, 0, 16, 3, '#5898e8', g);
    px(0, 6, 16, 3, '#2858a8', g);
    px(0, 12, 16, 4, '#f8d858', g);
    px(0, 12, 16, 1, '#f8f0a0', g);
  },
  'c': (g, r) => { // stall counter
    px(0, 0, 16, 16, '#a87038', g);
    px(0, 0, 16, 4, '#c89058', g);
    px(0, 4, 16, 1, '#804c20', g);
    for (let i = 0; i < 4; i++) px(i * 4 + 1, 6, 2, 10, '#8c5c28', g);
  },
  'L': (g, r) => { // bell tower stone
    px(0, 0, 16, 16, '#d0c8b8', g);
    px(0, 0, 16, 2, '#e8e0d0', g);
    px(0, 7, 16, 1, '#a89880', g);
    px(0, 15, 16, 1, '#a89880', g);
    px(7, 8, 1, 7, '#a89880', g);
  },
  'G': (g, r) => { // telepod platform
    px(0, 0, 16, 16, '#606878', g);
    px(0, 0, 16, 2, '#808898', g);
    px(2, 4, 12, 8, '#404858', g);
    px(3, 5, 10, 6, '#50c8d8', g);
    px(4, 6, 8, 4, '#a0f0f8', g);
  },
  'M': (g, r) => { // machinery
    px(0, 0, 16, 16, '#707888', g);
    px(0, 0, 16, 2, '#909aa8', g);
    px(2, 3, 5, 5, '#303840', g);
    px(3, 4, 3, 3, '#f05040', g);
    px(9, 3, 5, 5, '#303840', g);
    px(10, 4, 3, 3, '#40f070', g);
    px(2, 10, 12, 3, '#404850', g);
    for (let i = 0; i < 4; i++) px(3 + i * 3, 11, 2, 1, '#f8d040', g);
  },
  'x': (g) => { px(0, 0, 16, 16, '#000000', g); },
};

export const SOLID = new Set(['#', 'T', '~', 'C', 'W', 'S', 'H', 'R', 'w', 'B', 't', 'g', 'k', 'p', 'b', 'q', 'e', 'E', 'c', 'L', 'M', 'x']);

export const TILE_ORDER = Object.keys(TILE_DRAW);

export function tileCanvas(ch, seedIndex) {
  const key = ch + ':' + (seedIndex % 8);
  let t = tileCache.get(key);
  if (t) return t;
  const { c, x } = makeCanvas(16, 16);
  const draw = TILE_DRAW[ch] || TILE_DRAW['.'];
  draw(x, rng(seedIndex * 2654435761 + ch.charCodeAt(0) * 40503));
  tileCache.set(key, c);
  return c;
}

/* ------------------------------------------------------------------ */
/* PROPS (multi-tile objects drawn on top of the tile layer)           */
/* ------------------------------------------------------------------ */

export const PROP_NAMES = ['bell', 'gato', 'gate', 'balloon'];

export function prop(name) {
  let p = propCache.get(name);
  if (p) return p;
  let out;
  if (name === 'bell') {
    const { c, x: g } = makeCanvas(48, 64);
    // stone tower
    px(8, 20, 32, 44, '#d0c8b8', g);
    px(8, 20, 32, 2, '#f0e8d8', g);
    px(4, 14, 40, 8, '#c0b8a8', g);
    px(4, 14, 40, 2, '#e8e0d0', g);
    px(12, 0, 24, 16, '#b8b0a0', g);
    // arches
    px(14, 24, 8, 16, '#585048', g);
    px(26, 24, 8, 16, '#585048', g);
    // roof
    for (let i = 0; i < 8; i++) px(12 + i, 8 - i, 24 - i * 2, 2, '#4878c8', g);
    px(22, 0, 4, 4, '#f8d858', g);
    // the bell
    px(18, 26, 12, 12, '#e8c060', g);
    px(18, 26, 12, 2, '#f8e090', g);
    px(16, 36, 16, 3, '#c89830', g);
    px(23, 39, 2, 3, '#a87820', g);
    for (let i = 0; i < 20; i++) px(8 + ((i * 7) % 32), 22 + ((i * 13) % 40), 2, 1, '#b8b0a0', g);
    out = c;
  } else if (name === 'gato') {
    const { c, x: g } = makeCanvas(40, 48);
    px(6, 12, 28, 26, '#d8a020', g);   // body
    px(6, 12, 28, 3, '#f8c840', g);
    px(6, 34, 28, 4, '#a87810', g);
    px(10, 4, 20, 12, '#e8b830', g);   // head
    px(10, 4, 20, 2, '#f8d860', g);
    px(13, 8, 5, 4, '#303038', g);     // eyes
    px(22, 8, 5, 4, '#303038', g);
    px(14, 9, 2, 2, '#f04040', g);
    px(23, 9, 2, 2, '#f04040', g);
    px(16, 0, 3, 5, '#c04030', g);     // ears
    px(21, 0, 3, 5, '#c04030', g);
    px(12, 18, 16, 10, '#405060', g);  // chest panel
    px(14, 20, 12, 6, '#50c8d8', g);
    px(0, 14, 8, 6, '#b88818', g);     // arms
    px(32, 14, 8, 6, '#b88818', g);
    px(0, 20, 6, 6, '#909098', g);
    px(34, 20, 6, 6, '#909098', g);
    px(10, 38, 8, 8, '#808890', g);    // legs
    px(22, 38, 8, 8, '#808890', g);
    out = c;
  } else if (name === 'gate') {
    const { c, x: g } = makeCanvas(48, 48);
    // soft core
    for (let i = 10; i > 0; i--) {
      g.globalAlpha = 0.10;
      g.fillStyle = i % 2 ? '#50e0f8' : '#2050c8';
      g.beginPath();
      g.ellipse(24, 24, i * 2.0, i * 2.4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // spiral arms
    g.globalAlpha = 1;
    for (let arm = 0; arm < 3; arm++) {
      for (let t = 0; t < 90; t++) {
        const a = arm * (Math.PI * 2 / 3) + t * 0.09;
        const r = 2 + t * 0.22;
        const px2 = Math.round(24 + Math.cos(a) * r);
        const py2 = Math.round(24 + Math.sin(a) * r * 1.15);
        g.fillStyle = t < 30 ? '#ffffff' : t < 60 ? '#a0f0ff' : '#4090f0';
        g.fillRect(px2, py2, 2, 2);
      }
    }
    out = c;
  } else if (name === 'balloon') {
    const { c, x: g } = makeCanvas(16, 24);
    px(4, 0, 8, 10, '#e04858', g);
    px(5, 1, 3, 3, '#f8a0a8', g);
    px(7, 10, 2, 14, '#f0f0f0', g);
    out = c;
  }
  propCache.set(name, out);
  return out;
}
