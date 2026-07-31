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

export const CHARS = {
  crono: {
    skin: '#f0c090', skinDark: '#c08858',
    hair: '#e85018', hairDark: '#a02808', hairStyle: 'spiky',
    shirt: '#f0f0f0', shirtDark: '#b0b8c8',
    pants: '#3060c0', pantsDark: '#204088',
    shoes: '#c0a020', band: '#ffffff', sword: true,
  },
  marle: {
    skin: '#f8d0a0', skinDark: '#d09858',
    hair: '#f8e058', hairDark: '#c8a020', hairStyle: 'ponytail',
    shirt: '#f8f8f8', shirtDark: '#c0c8d8',
    pants: '#f8f8f8', pantsDark: '#c0c8d8',
    shoes: '#20a060', accent: '#20a060', pendant: true,
  },
  lucca: {
    skin: '#f8d0a0', skinDark: '#d09858',
    hair: '#9048c0', hairDark: '#602888', hairStyle: 'helmet',
    shirt: '#e8b048', shirtDark: '#b07820',
    pants: '#804828', pantsDark: '#583018',
    shoes: '#503020', glasses: true, helmet: '#e07030',
  },
  mom: {
    skin: '#f8d0a0', skinDark: '#d09858',
    hair: '#b05828', hairDark: '#803818', hairStyle: 'bob',
    shirt: '#d05070', shirtDark: '#a03050',
    pants: '#d05070', pantsDark: '#a03050',
    shoes: '#804020',
  },
  taban: {
    skin: '#e8b880', skinDark: '#b88850',
    hair: '#403030', hairDark: '#282020', hairStyle: 'bald',
    shirt: '#3878b8', shirtDark: '#204888',
    pants: '#585868', pantsDark: '#383848',
    shoes: '#302828', beard: '#f0f0f0', big: true,
  },
  villager1: {
    skin: '#f0c090', skinDark: '#c08858',
    hair: '#503020', hairDark: '#302010', hairStyle: 'bob',
    shirt: '#50a850', shirtDark: '#307030',
    pants: '#605040', pantsDark: '#403020', shoes: '#402818',
  },
  villager2: {
    skin: '#e8c8a8', skinDark: '#b89878',
    hair: '#f0d060', hairDark: '#c0a030', hairStyle: 'bob',
    shirt: '#b060c0', shirtDark: '#803890',
    pants: '#b060c0', pantsDark: '#803890', shoes: '#503020',
  },
  villager3: {
    skin: '#d8a878', skinDark: '#a87848',
    hair: '#202028', hairDark: '#101018', hairStyle: 'spiky',
    shirt: '#d8a840', shirtDark: '#a87820',
    pants: '#4058a0', pantsDark: '#283878', shoes: '#302020',
  },
  kid: {
    skin: '#f8d0a0', skinDark: '#d09858',
    hair: '#a04828', hairDark: '#702810', hairStyle: 'bob',
    shirt: '#e05040', shirtDark: '#a83028',
    pants: '#4878c8', pantsDark: '#2850a0', shoes: '#403028', small: true,
  },
  guard: {
    skin: '#e8c090', skinDark: '#b89058',
    hair: '#606878', hairDark: '#404858', hairStyle: 'helm',
    shirt: '#8890a0', shirtDark: '#606878',
    pants: '#484858', pantsDark: '#303040', shoes: '#282830',
  },
  cat: { cat: true },
};

function drawHuman(g, c, dir, frame) {
  const step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0);
  const yo = c.small ? 4 : (c.big ? -1 : 0); // vertical body offset (kids are short)
  const H = (v) => v + yo;

  const back = dir === 'up', side = dir === 'left' || dir === 'right';
  const flip = dir === 'left';

  g.save();
  if (flip) { g.translate(16, 0); g.scale(-1, 1); }

  // shadow
  g.globalAlpha = 0.25;
  px(4, 22, 8, 2, '#000000', g);
  g.globalAlpha = 1;

  // --- legs ---
  const legTop = H(18), legBot = 22;
  const l1 = step === 1 ? 1 : 0, l2 = step === -1 ? 1 : 0;
  px(5, legTop + l1, 3, legBot - legTop - l1, c.pants, g);
  px(8, legTop + l2, 3, legBot - legTop - l2, c.pantsDark, g);
  px(5, 22 - (side ? 0 : 0), 3, 2, c.shoes, g);
  px(8, 22, 3, 2, c.shoes, g);
  if (side) { // one leg forward when viewed from the side
    px(6, legTop, 5, legBot - legTop, c.pants, g);
    px(6 + step, 22, 5, 2, c.shoes, g);
  }

  // --- torso ---
  px(4, H(12), 8, H(19) - H(12), c.shirt, g);
  px(4, H(12), 8, 1, c.shirtDark, g);
  px(4, H(18), 8, 1, c.shirtDark, g);
  if (c.accent) px(4, H(13), 8, 1, c.accent, g);
  if (side) { px(4, H(12), 8, H(19) - H(12), c.shirt, g); px(10, H(12), 2, H(19) - H(12), c.shirtDark, g); }

  // --- arms ---
  const swing = step;
  px(3, H(12) + Math.max(0, swing), 2, 5, c.shirtDark, g);
  px(11, H(12) - Math.min(0, swing), 2, 5, c.shirtDark, g);
  px(3, H(17) + Math.max(0, swing), 2, 2, c.skin, g);
  px(11, H(17) - Math.min(0, swing), 2, 2, c.skin, g);

  // --- head ---
  px(4, H(5), 8, 7, c.skin, g);
  px(4, H(11), 8, 1, c.skinDark, g);
  px(3, H(7), 1, 3, c.skin, g);
  px(12, H(7), 1, 3, c.skin, g);

  // face
  if (!back) {
    if (side) {
      px(9, H(8), 1, 2, '#302020', g);
      px(10, H(10), 2, 1, c.skinDark, g);
    } else {
      px(6, H(8), 1, 2, '#302020', g);
      px(9, H(8), 1, 2, '#302020', g);
      px(7, H(10), 2, 1, c.skinDark, g);
    }
  }
  if (c.glasses && !back) {
    px(side ? 8 : 5, H(8), side ? 4 : 6, 2, '#d8e8f8', g);
    px(side ? 8 : 5, H(7), side ? 4 : 6, 1, '#404858', g);
  }
  if (c.beard && !back) px(5, H(10), 6, 2, c.beard, g);

  // --- hair ---
  const hs = c.hairStyle;
  if (hs === 'spiky') {
    px(3, H(3), 10, 4, c.hair, g);
    px(2, H(5), 1, 3, c.hairDark, g);
    px(13, H(5), 1, 3, c.hairDark, g);
    // spikes
    for (const [x, h] of [[2, 3], [4, 5], [6, 6], [8, 5], [10, 4], [12, 3]]) {
      px(x, H(3) - h, 2, h, c.hair, g);
      px(x, H(3) - h, 1, h, c.hairDark, g);
    }
    if (c.band) { px(3, H(6), 10, 2, c.band, g); px(3, H(7), 10, 1, '#c0c8d0', g); }
  } else if (hs === 'ponytail') {
    px(3, H(3), 10, 4, c.hair, g);
    px(3, H(2), 10, 1, c.hairDark, g);
    px(3, H(6), 2, 4, c.hair, g);
    px(11, H(6), 2, 4, c.hair, g);
    // tail behind
    if (back) { px(6, H(6), 4, 12, c.hair, g); px(6, H(6), 1, 12, c.hairDark, g); }
    else if (side) { px(1, H(5), 3, 10, c.hair, g); px(1, H(5), 1, 10, c.hairDark, g); }
    else { px(12, H(5), 3, 9, c.hair, g); px(1, H(5), 3, 9, c.hair, g); }
    if (c.pendant && !back) px(7, H(13), 2, 2, '#f8f070', g);
  } else if (hs === 'helmet') {
    px(3, H(2), 10, 5, c.hair, g);
    px(2, H(4), 12, 4, c.helmet || c.hair, g);
    px(2, H(4), 12, 1, '#f8a860', g);
    px(2, H(7), 12, 1, '#a04818', g);
    if (!back) { px(4, H(8), 2, 2, c.hairDark, g); px(10, H(8), 2, 2, c.hairDark, g); }
  } else if (hs === 'bob') {
    px(3, H(3), 10, 5, c.hair, g);
    px(3, H(2), 10, 1, c.hairDark, g);
    px(2, H(5), 2, 6, c.hair, g);
    px(12, H(5), 2, 6, c.hair, g);
    if (back) px(3, H(3), 10, 9, c.hair, g);
  } else if (hs === 'bald') {
    px(4, H(4), 8, 3, c.skin, g);
    px(3, H(6), 2, 3, c.hair, g);
    px(11, H(6), 2, 3, c.hair, g);
    px(4, H(4), 8, 1, c.skinDark, g);
  } else if (hs === 'helm') {
    px(3, H(2), 10, 6, c.hair, g);
    px(3, H(2), 10, 1, '#a8b0c0', g);
    px(6, H(0), 4, 3, '#c04040', g);
    px(3, H(7), 10, 1, c.hairDark, g);
  }

  // sword on the back
  if (c.sword && !side) {
    px(11, H(9), 2, 9, '#c8d0d8', g);
    px(11, H(9), 1, 9, '#8890a0', g);
    px(10, H(17), 4, 2, '#806030', g);
  } else if (c.sword) {
    px(3, H(10), 2, 8, '#c8d0d8', g);
    px(2, H(17), 4, 2, '#806030', g);
  }

  g.restore();
}

function drawCat(g, dir, frame) {
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const body = '#e8b848', dark = '#b88820';
  px(4, 16, 8, 5, body, g);
  px(4, 20, 8, 1, dark, g);
  px(4, 21, 2, 2, dark, g);
  px(10, 21, 2, 2, dark, g);
  px(3, 14, 6, 5, body, g);          // head
  px(3, 12, 2, 2, body, g);          // ears
  px(7, 12, 2, 2, body, g);
  if (dir !== 'up') { px(4, 15, 1, 1, '#204020', g); px(7, 15, 1, 1, '#204020', g); }
  px(11, 13 + step, 2, 5, body, g);  // tail
}

const charCache = new Map();
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

const propCache = new Map();

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
