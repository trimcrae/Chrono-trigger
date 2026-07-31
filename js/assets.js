// assets.js — optional art override.
//
// The drawing code in pix.js is a fallback. If assets/manifest.json points at
// sprite sheets, their frames are sliced and pushed into the art caches at boot,
// and the game renders those pixels verbatim instead. Nothing here ships with
// art of its own; with an empty manifest the game runs entirely on pix.js.
//
// See assets/README.md for the sheet layout.

import {
  primeChar, primeTile, primeProp, makeCanvas,
  CHAR_ORDER, DIRS, FRAME_W, FRAME_H, FRAMES, TILE_ORDER, TILE,
} from './pix.js';

const loadImage = src => new Promise(res => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => res(null);
  im.src = src;
});

function cut(img, sx, sy, w, h) {
  const { c, x } = makeCanvas(w, h);
  x.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  return c;
}

export async function loadAssets(base = 'assets/') {
  const out = { characters: 0, tiles: 0, props: 0, manifest: false };
  // ?noassets=1 forces the built-in art, handy for comparing the two
  if (new URLSearchParams(location.search).has('noassets')) return out;

  let manifest = null;
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json();
  } catch (e) { /* no manifest: run on the built-in art */ }
  if (!manifest) return out;
  out.manifest = true;

  // --- characters: one row per character, 16 columns (4 dirs x 4 frames) ---
  if (manifest.characters) {
    const img = await loadImage(base + manifest.characters);
    if (img) {
      const order = manifest.characterOrder || CHAR_ORDER;
      const fw = manifest.frameWidth || FRAME_W;
      const fh = manifest.frameHeight || FRAME_H;
      order.forEach((name, row) => {
        DIRS.forEach((dir, d) => {
          for (let f = 0; f < FRAMES; f++) {
            const sx = (d * FRAMES + f) * fw, sy = row * fh;
            if (sx + fw <= img.width && sy + fh <= img.height) {
              primeChar(name, dir, f, cut(img, sx, sy, fw, fh));
              out.characters++;
            }
          }
        });
      });
    }
  }

  // --- tiles: a single row of 16x16 cells, one per tile symbol ---
  if (manifest.tiles) {
    const img = await loadImage(base + manifest.tiles);
    if (img) {
      const order = manifest.tileOrder || TILE_ORDER;
      order.forEach((ch, i) => {
        const sx = i * TILE;
        if (sx + TILE <= img.width) {
          primeTile(ch, cut(img, sx, 0, TILE, TILE));
          out.tiles++;
        }
      });
    }
  }

  // --- props: one file each, any size ---
  for (const [name, file] of Object.entries(manifest.props || {})) {
    if (!file) continue;
    const img = await loadImage(base + file);
    if (img) { primeProp(name, cut(img, 0, 0, img.width, img.height)); out.props++; }
  }

  return out;
}
