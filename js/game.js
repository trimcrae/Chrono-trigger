// game.js — engine + story for "The Millennial Fair", Chapter 1.

import { TILE, SOLID, charFrame, tileCanvas, prop, makeCanvas } from './pix.js';
import { MAPS } from './maps.js';
import { initInput, keys, tap, clearTaps, onFirstInput } from './input.js';
import { Dialogue, drawBanner, VW, VH, FONT } from './ui.js';
import { playSong, sfx, setEnabled, isEnabled } from './audio.js';
import { makeGatoBattle } from './battle.js';
import { loadAssets } from './assets.js';

/* ------------------------------------------------------------------ */
/* setup                                                               */
/* ------------------------------------------------------------------ */

const view = document.getElementById('game');
const vctx = view.getContext('2d');
const buf = makeCanvas(VW, VH);
const g = buf.x;                 // world (pixel) context
const dlg = new Dialogue();

let scale = 1, offX = 0, offY = 0;

function resize() {
  const wrap = document.getElementById('screen');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cw = wrap.clientWidth, ch = wrap.clientHeight;
  view.width = Math.round(cw * dpr);
  view.height = Math.round(ch * dpr);
  view.style.width = cw + 'px';
  view.style.height = ch + 'px';
  scale = Math.min(view.width / VW, view.height / VH);
  offX = (view.width - VW * scale) / 2;
  offY = (view.height - VH * scale) / 2;
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

const S = {
  scene: 'title',        // title | field | battle | end
  map: null,
  entities: [],
  player: null,
  marle: null,
  cam: { x: 0, y: 0 },
  lock: 0,               // >0 => player input disabled
  fade: 1,               // 1 = fully black
  fadeColor: '#000',
  flash: 0,
  shake: 0,
  banner: null,
  bannerT: 0,
  battle: null,
  time: 0,
  flags: {},
  gold: 0,
  silver: 0,
  items: { tonic: 3 },
  menu: false,
  menuIndex: 0,
  trail: [],
  tweens: [],
  gateProp: null,
  endStage: 0,
};
window.__CT = S;     // handy for debugging / automated smoke tests
window.__CTDLG = dlg;
// tiny debug hook used by the smoke test (and by anyone poking at the console)
window.__CTDBG = {
  goto: (id, x, y, dir) => { S.scene = 'field'; loadMap(id, x, y, dir || 'down'); S.fade = 0; },
  flag: (k, v = true) => { S.flags[k] = v; },
  blockedAt: (x, y) => blocked(S.player, x * 16, y * 16 - 8),
  facing: () => { const [fx, fy] = facingPoint(S.player); const n = npcAt(fx, fy) || npcAt(...facingPoint(S.player, 20)); return { fx, fy, npc: n ? n.id : null }; },
  interact: () => interact(),
};

const mapCache = new Map();
function renderMap(map) {
  let c = mapCache.get(map.id);
  if (c) return c;
  const o = makeCanvas(map.w * TILE, map.h * TILE);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const ch = map.rows[y][x];
      // draw a ground layer under "object" tiles so they blend in
      if ('TWSbqBtgkprsDGwe'.includes(ch)) {
        o.x.drawImage(tileCanvas(map.indoor ? 'f' : '.', x + y * 3), x * TILE, y * TILE);
      }
      o.x.drawImage(tileCanvas(ch, x + y * 3), x * TILE, y * TILE);
    }
  }
  mapCache.set(map.id, o.c);
  return o.c;
}

/* ------------------------------------------------------------------ */
/* entities                                                            */
/* ------------------------------------------------------------------ */

class Entity {
  constructor(o) {
    Object.assign(this, {
      x: 0, y: 0, dir: 'down', char: 'villager1', name: '', frame: 0, animT: 0,
      speed: 62, moving: false, wander: false, wanderT: 2 + Math.random() * 3,
      solid: true, path: null, lines: null, visible: true, follow: false,
      prop: null, pw: 16, ph: 24, hidden: false,
    }, o);
    if (o.tx !== undefined) { this.x = o.tx * TILE; this.y = o.ty * TILE - 8; }
  }
  get cx() { return this.x + 8; }
  get feetY() { return this.y + 22; }
  get tileX() { return Math.floor(this.cx / TILE); }
  get tileY() { return Math.floor((this.y + 20) / TILE); }
}

function box(e) { return { x: e.x + 3, y: e.y + 14, w: 10, h: 9 }; }

function solidTileAt(px, py) {
  const map = S.map;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  const ch = map.rows[ty][tx];
  if (SOLID.has(ch)) return true;
  for (const r of map.solids) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return true;
  return false;
}

function blocked(e, nx, ny) {
  const b = { x: nx + 3, y: ny + 14, w: 10, h: 9 };
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h]];
  for (const [px, py] of pts) if (solidTileAt(px, py)) return true;
  for (const o of S.entities) {
    if (o === e || !o.solid || o.hidden) continue;
    const ob = box(o);
    if (b.x < ob.x + ob.w && b.x + b.w > ob.x && b.y < ob.y + ob.h && b.y + b.h > ob.y) return true;
  }
  return false;
}

function tryMove(e, dx, dy) {
  let moved = false;
  if (dx && !blocked(e, e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (dy && !blocked(e, e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}

function walkTo(e, tx, ty, speed) {
  e.pathSpeed = speed || 62;
  return new Promise(res => { e.path = { x: tx * TILE, y: ty * TILE - 8, res }; });
}

function updatePath(e, dt) {
  if (!e.path) return false;
  const sp = (e.pathSpeed || 62) * dt;
  let dx = e.path.x - e.x, dy = e.path.y - e.y;
  if (Math.abs(dx) <= sp && Math.abs(dy) <= sp) {
    e.x = e.path.x; e.y = e.path.y;
    const r = e.path.res; e.path = null; e.moving = false;
    if (r) r();
    return true;
  }
  // These have to use the same threshold the arrival test above uses. With a
  // larger one, a residual that is too small to step but too large to count as
  // arrival satisfies neither, the path never resolves, and any cutscene
  // awaiting it hangs with input still locked — which softlocked the walk into
  // the gate whenever the player stepped onto the pad even slightly off-grid.
  if (Math.abs(dx) > sp) {
    e.dir = dx > 0 ? 'right' : 'left';
    e.x += Math.sign(dx) * Math.min(sp, Math.abs(dx));
  } else if (Math.abs(dy) > sp) {
    e.dir = dy > 0 ? 'down' : 'up';
    e.y += Math.sign(dy) * Math.min(sp, Math.abs(dy));
  }
  e.moving = true;
  return true;
}

/* ------------------------------------------------------------------ */
/* tweens / effects                                                    */
/* ------------------------------------------------------------------ */

function tween(setter, from, to, dur) {
  return new Promise(res => {
    S.tweens.push({ setter, from, to, dur, t: 0, res });
  });
}
function updateTweens(dt) {
  for (let i = S.tweens.length - 1; i >= 0; i--) {
    const w = S.tweens[i];
    w.t += dt;
    const k = Math.min(1, w.t / w.dur);
    w.setter(w.from + (w.to - w.from) * k);
    if (k >= 1) { S.tweens.splice(i, 1); w.res(); }
  }
}
const fadeOut = (d = 0.45, color = '#000') => { S.fadeColor = color; return tween(v => S.fade = v, S.fade, 1, d); };
const fadeIn = (d = 0.45) => tween(v => S.fade = v, S.fade, 0, d);
const wait = s => new Promise(r => setTimeout(r, s * 1000));
const say = (text, name) => dlg.show(vctx, text, { name });
const ask = (text, name, choices) => dlg.show(vctx, text, { name, choices });

/* ------------------------------------------------------------------ */
/* map loading                                                         */
/* ------------------------------------------------------------------ */

const MUSIC = { room: 'home', house: 'home', world: 'home', square: 'fair', telepod: 'fair' };

function loadMap(id, tx, ty, dir) {
  const map = MAPS[id];
  S.map = map;
  renderMap(map);
  S.entities = [];
  const player = S.player || new Entity({ char: 'crono', name: 'Crono', speed: 62, solid: true });
  S.player = player;
  player.x = tx * TILE; player.y = ty * TILE - 8;
  player.dir = dir || 'down';
  player.path = null;
  // don't re-trigger an exit we happen to land on
  S.arrivedTile = tx + ',' + ty;
  S.entities.push(player);
  S.trail = [];

  for (const n of map.npcs) {
    if (n.needFlag && !S.flags[n.needFlag]) continue;
    if (n.hideFlag && S.flags[n.hideFlag]) continue;
    const e = new Entity({
      ...n, tx: n.x, ty: n.y, char: n.char || 'villager1',
      speed: 34, wander: !!n.wander, isNpc: true,
    });
    e.homeX = e.x; e.homeY = e.y;
    S.entities.push(e);
  }
  if (S.marle && S.flags.marleJoined && !S.flags.marleVanished) {
    S.marle.x = player.x; S.marle.y = player.y;
    S.marle.follow = true;
    S.marle.hidden = false;
    S.entities.push(S.marle);
  }
  if (id === 'telepod' && S.flags.gateOpen) {
    S.gateProp = { x: 6 * TILE - 16, y: 6 * TILE - 20, img: 'gate' };
  } else S.gateProp = null;

  S.banner = map.name; S.bannerT = 2.2;
  playSong(MUSIC[id] || 'home');
  centerCamera(true);
}

function centerCamera(snap) {
  const map = S.map, p = S.player;
  let tx = p.cx - VW / 2, ty = p.y + 12 - VH / 2;
  const maxX = map.w * TILE - VW, maxY = map.h * TILE - VH;
  tx = maxX <= 0 ? maxX / 2 : Math.max(0, Math.min(maxX, tx));
  ty = maxY <= 0 ? maxY / 2 : Math.max(0, Math.min(maxY, ty));
  if (snap) { S.cam.x = tx; S.cam.y = ty; }
  else { S.cam.x += (tx - S.cam.x) * 0.18; S.cam.y += (ty - S.cam.y) * 0.18; }
}

async function changeMap(exit) {
  S.lock++;
  sfx('door');
  await fadeOut(0.35);
  loadMap(exit.to, exit.tx, exit.ty, exit.dir);
  await fadeIn(0.35);
  S.lock--;
  checkAreaEvents();
}

/* ------------------------------------------------------------------ */
/* interaction                                                         */
/* ------------------------------------------------------------------ */

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function facingPoint(e, dist = 13) {
  const [dx, dy] = DIRV[e.dir];
  return [e.cx + dx * dist, e.y + 20 + dy * dist];
}

function npcAt(px, py) {
  for (const o of S.entities) {
    if (o === S.player || o.hidden || !o.isNpc) continue;
    const w = o.prop ? o.pw : 16, h = o.prop ? o.ph : 24;
    const bx = o.x + (16 - w) / 2, by = o.y + 24 - h;
    if (px >= bx - 6 && px <= bx + w + 6 && py >= by - 6 && py <= by + h + 6) return o;
  }
  return null;
}

async function interact() {
  const p = S.player;
  const [fx, fy] = facingPoint(p);
  // a little reach tolerance so talking never feels finicky (especially on touch)
  const target = npcAt(fx, fy) || npcAt(...facingPoint(p, 20)) || npcAt(...facingPoint(p, 6));
  if (target) { await talkTo(target); return; }

  const tx = Math.floor(fx / TILE), ty = Math.floor(fy / TILE);
  if (tx < 0 || ty < 0 || tx >= S.map.w || ty >= S.map.h) return;
  const ch = S.map.rows[ty][tx];

  // Leene's Bell
  if (S.map.id === 'square' && ch === 'L') {
    S.lock++;
    sfx('bell');
    await say("Leene's Bell. It has rung over Guardia for a thousand years.");
    if (S.marle && S.flags.marleJoined) {
      await say('It sounds so sad... but so beautiful.', 'Marle');
    }
    S.lock--;
    return;
  }
  // Telepod pads
  if (S.map.id === 'telepod' && ch === 'G') {
    if (S.flags.gateOpen) { await enterGate(); return; }
    await say('The Telepod hums with energy.');
    return;
  }
  const key = `${ch}:${tx},${ty}`;
  if (S.map.looks && S.map.looks[key]) {
    S.lock++;
    await say(S.map.looks[key]);
    S.lock--;
  }
}

async function talkTo(npc) {
  S.lock++;
  // face the player
  if (!npc.prop) {
    const [dx, dy] = DIRV[S.player.dir];
    npc.dir = dx ? (dx > 0 ? 'left' : 'right') : (dy > 0 ? 'up' : 'down');
  }
  const handler = TALK[S.map.id + ':' + npc.id];
  if (handler) await handler(npc);
  else if (npc.char === 'cat') { sfx('blip'); await say('Meow!', npc.name); }
  else if (npc.lines) {
    for (const l of npc.lines) await say(l, npc.name);
  } else await say('...', npc.name);
  S.lock--;
}

/* ------------------------------------------------------------------ */
/* story: NPC talk handlers                                            */
/* ------------------------------------------------------------------ */

const TALK = {
  'house:mom': async () => {
    if (!S.flags.gotAllowance) {
      await say('Good morning, Crono! Did you sleep well?', 'Mom');
      await say("Today's the big day — the Millennial Fair! It only comes once every hundred years, you know.", 'Mom');
      await say("Lucca and her father have some kind of invention on display. Go and see it!", 'Mom');
      await say("Oh! Don't forget your allowance.", 'Mom');
      sfx('item');
      S.gold += 200;
      S.flags.gotAllowance = true;
      await say('Crono received 200 G!');
      await say('Now off you go. And be careful out there!', 'Mom');
    } else {
      await say("The Fair is north of the village. Have fun, dear — and don't be home too late!", 'Mom');
    }
  },
  'square:candyman': async () => {
    if (S.flags.boughtCandy) { await say('Come back any time, kid!', 'Candy Vendor'); return; }
    const c = await ask('Sweet, sweet candy! Only 10 G a stick. Want one?', 'Candy Vendor', ['Buy (10 G)', 'No thanks']);
    if (c === 0) {
      if (S.gold < 10) { await say("Aw, you're short on cash. Come back later!", 'Candy Vendor'); return; }
      S.gold -= 10;
      S.flags.boughtCandy = true;
      sfx('item');
      await say('Crono bought a candy stick!');
      if (S.flags.marleJoined) await say('Mmm! I have never tasted anything like this at the castle— er, at home!', 'Marle');
    } else await say('Suit yourself, kid!', 'Candy Vendor');
  },
  'square:drinkgirl': async () => {
    const c = await ask('Ice cold soda! 10 G. Thirsty?', 'Soda Vendor', ['Buy (10 G)', 'No thanks']);
    if (c === 0) {
      if (S.gold < 10) { await say('No money, no soda. Sorry!', 'Soda Vendor'); return; }
      S.gold -= 10; sfx('item');
      await say('Crono drank the soda. Refreshing!');
    } else await say('Come back when you get thirsty!', 'Soda Vendor');
  },
  'square:gato': async () => {
    if (S.battleLock) return;
    const c = await ask(
      S.flags.gatoBeaten
        ? '♪ I am Gato. Care to spar again? ♪'
        : '♪ I am Gato, I have metal joints. Beat me up and win 15 silver points! ♪',
      'Gato', ['Fight!', 'Not now']);
    if (c !== 0) { await say('♪ Come back any time, my friend! ♪', 'Gato'); return; }
    const result = await startBattle();
    if (result === 'won') {
      if (!S.flags.gatoBeaten) {
        S.flags.gatoBeaten = true;
        S.silver += 15;
        await say('Crono won 15 Silver Points!');
      } else {
        S.silver += 5;
        await say('Crono won 5 Silver Points!');
      }
      if (S.flags.marleJoined) await say('Wow, you are really strong! Is everyone here like you?', 'Marle');
    } else if (result === 'lost') {
      await say('Gato helps you up. No hard feelings — his circuits are made for it.');
    }
  },
  'telepod:lucca': async () => {
    if (!S.flags.telepodDone) { await say('Just a second, Crono — I have to calibrate the field coils!', 'Lucca'); return; }
    if (S.flags.marleVanished) { await say('The gate is still open! Hurry, Crono — I will hold things together here!', 'Lucca'); return; }
    await say('Amazing, right? Matter transmission! And you are still in one piece!', 'Lucca');
  },
  'telepod:taban': async () => {
    await say('That is my girl! Smartest mind in all of Guardia!', 'Taban');
  },
};

/* ------------------------------------------------------------------ */
/* story: scripted scenes                                              */
/* ------------------------------------------------------------------ */

async function introScene() {
  S.lock++;
  S.fade = 1;
  await wait(0.6);
  await say('Crono.....', '???');
  await say('Crono! Come on, sleepyhead!', '???');
  await say('Good morning, Crono! Today is the day of the Millennial Fair!', 'Mom');
  await fadeIn(1.2);
  await wait(0.4);
  const p = S.player;
  p.dir = 'down';
  await walkTo(p, 4, 6, 40);
  await wait(0.3);
  await say('Crono stretches and hops out of bed. The Fair is waiting!');
  S.flags.wokeUp = true;
  S.lock--;
}

async function marleScene() {
  S.lock++;
  S.flags.metMarle = true;
  const p = S.player;
  p.path = null;
  await walkTo(p, 13, 18, 55);

  const marle = new Entity({ char: 'marle', name: 'Marle', tx: 13, ty: 12, dir: 'down', isNpc: true, speed: 70 });
  S.entities.push(marle);
  await walkTo(marle, 13, 17, 96);
  sfx('hit');
  S.shake = 1;
  // knocked apart
  await Promise.all([
    tween(v => marle.y = v, marle.y, marle.y - 12, 0.18),
    tween(v => p.y = v, p.y, p.y + 10, 0.18),
  ]);
  marle.dir = 'down'; p.dir = 'up';
  await wait(0.4);
  await say('Ouch! Hey, watch where you are— oh!', 'Marle');
  await wait(0.2);
  await say('Her pendant clatters onto the pavement.');
  sfx('item');
  await say('Oh no, my pendant! It is very important to me...', 'Marle');
  await say('Crono picks it up and hands it back.');
  sfx('confirm');
  await say('Thank you! You are very kind. My name is Marle. What is yours?', 'Marle');
  await say('...Crono!', 'Crono');
  await say('Crono! Nice to meet you!', 'Marle');
  const c = await ask('Say... I do not know my way around here at all. Mind if I tag along?', 'Marle',
    ['Sure!', "I'm kind of busy...", '...']);
  if (c === 1) await say('Great, then it is settled! Let us go!', 'Marle');
  else await say('Thanks! I knew you would say yes!', 'Marle');
  await say('Marle joined the party!');
  sfx('win');

  marle.isNpc = false;
  marle.solid = false;
  marle.follow = true;
  S.marle = marle;
  S.flags.marleJoined = true;
  S.lock--;
}

async function telepodScene() {
  S.lock++;
  S.flags.telepodStarted = true;
  const p = S.player;
  p.path = null;
  const lucca = S.entities.find(e => e.id === 'lucca');
  const taban = S.entities.find(e => e.id === 'taban');
  const marle = S.marle;

  await walkTo(p, 10, 10, 60);
  taban.dir = 'down';
  await say('Ladieeees and gentlemen! Feast your eyes on my daughter\'s greatest invention — the TELEPOD!', 'Taban');
  await say('Matter transmission! Step on one pad, appear on the other! Science, folks!', 'Taban');
  lucca.dir = 'down';
  await walkTo(lucca, 10, 5, 60);
  await walkTo(lucca, 8, 8, 60);
  lucca.dir = 'down';
  await say('Crono! Perfect timing. I need a volunteer... I mean, a brave test subject!', 'Lucca');
  await say('Come on, do not be shy! Step onto the left pad.', 'Lucca');

  await walkTo(p, 6, 6, 55);
  p.dir = 'down';
  await wait(0.3);
  await walkTo(lucca, 10, 9, 70);
  lucca.dir = 'up';
  await say('Here goes nothing! Power at maximum!', 'Lucca');
  sfx('zap');
  S.flash = 1;
  await wait(0.35);
  p.hidden = true;
  await wait(0.5);
  p.x = 13 * TILE; p.y = 6 * TILE - 8;
  S.flash = 1;
  sfx('zap');
  p.hidden = false;
  await wait(0.6);
  await say('It worked! Not even a hair out of place!', 'Lucca');
  await say('The crowd cheers wildly!');
  sfx('win');
  await walkTo(p, 10, 10, 60);
  p.dir = 'up';
  S.flags.telepodDone = true;

  // Marle wants a turn
  marle.follow = false;
  await walkTo(marle, 10, 9, 70);
  await say('That looks like fun! Let me try, let me try!', 'Marle');
  await say('Hey! Wait! I have not tested it on— oh, forget it.', 'Lucca');
  await walkTo(marle, 6, 6, 65);
  marle.dir = 'down';
  await wait(0.3);
  await say('Ready when you are!', 'Marle');
  await say('Energizing... now!', 'Lucca');
  sfx('zap');
  S.flash = 1;
  await wait(0.4);

  // the pendant reacts
  S.flags.gateOpen = true;
  S.gateProp = { x: 6 * TILE - 16, y: 6 * TILE - 20, img: 'gate' };
  sfx('gate');
  S.shake = 1.4;
  await say('Her pendant flares with a blinding light!');
  await wait(0.4);
  S.shake = 1.2;
  await say('W-what is happening?! Crono! CRONO—!', 'Marle');
  marle.hidden = true;
  S.flags.marleVanished = true;
  S.flash = 1;
  sfx('gate');
  await wait(0.9);
  await say('Marle vanished into a swirling gate of light!');
  await say('This is not a malfunction... the pendant reacted with the Telepod!', 'Lucca');
  await say('It tore a hole in space itself. A gate! And she fell right through it!', 'Lucca');
  await wait(0.3);
  sfx('item');
  await say('Her pendant lies on the pad, still glowing faintly.');
  await say('Crono picked up the Pendant!');
  S.flags.gotPendant = true;
  await say('Crono! You have to go after her! The pendant is the key — it will hold the gate open!', 'Lucca');
  await say('I will keep this end stable. Whatever happens... come back to me. Both of you!', 'Lucca');
  await walkTo(lucca, 12, 9, 60);
  lucca.dir = 'left';
  await say('Step into the gate when you are ready.');
  S.lock--;
}

async function enterGate() {
  if (!S.flags.gotPendant) { await say('The gate crackles. Something is on the other side...'); return; }
  S.lock++;
  const c = await ask('The gate swirls before you. Enter it?', null, ['Enter the gate', 'Not yet']);
  if (c !== 0) { S.lock--; return; }
  sfx('gate');
  S.shake = 1;
  await walkTo(S.player, 5, 6, 40);
  await wait(0.4);
  S.flash = 1;
  await wait(0.2);
  await fadeOut(1.4, '#ffffff');
  await wait(0.8);
  S.scene = 'end';
  S.endStage = 0;
  S.fadeColor = '#000';
  S.fade = 1;
  playSong('mystic');
  S.lock--;
}

/* trigger zones checked whenever the player moves into a new area */
function checkAreaEvents() {
  if (S.lock > 0) return;
  const id = S.map.id, p = S.player;
  if (id === 'square' && !S.flags.metMarle && p.tileY <= 18) { marleScene(); return; }
  if (id === 'telepod' && !S.flags.telepodStarted && p.tileY <= 11) { telepodScene(); return; }
}

/* ------------------------------------------------------------------ */
/* battle plumbing                                                     */
/* ------------------------------------------------------------------ */

async function startBattle() {
  S.battleLock = true;
  await fadeOut(0.3, '#ffffff');
  S.battle = makeGatoBattle(!!S.flags.marleJoined, S.items);
  S.scene = 'battle';
  S.fade = 0;
  clearTaps();
  const result = await S.battle.done;
  await fadeOut(0.35, '#000');
  S.battle = null;
  S.scene = 'field';
  playSong(MUSIC[S.map.id]);
  await fadeIn(0.35);
  S.battleLock = false;
  return result;
}

/* ------------------------------------------------------------------ */
/* update                                                              */
/* ------------------------------------------------------------------ */

function updateField(dt) {
  const p = S.player;

  // scripted movement
  for (const e of S.entities) updatePath(e, dt);

  const busy = S.lock > 0 || dlg.active;
  if (!busy) {
    const run = keys.b;
    const sp = (run ? 118 : 66) * dt;
    let dx = 0, dy = 0;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    if (dx || dy) {
      if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left';
      else p.dir = dy > 0 ? 'down' : 'up';
      const before = { x: p.x, y: p.y };
      tryMove(p, dx * sp, dy * sp);
      p.moving = (p.x !== before.x || p.y !== before.y);
    } else p.moving = false;

    if (tap('a')) interact();
    if (tap('menu')) { S.menu = !S.menu; sfx('confirm'); }

    // exits
    const tx = p.tileX, ty = Math.floor((p.y + 20) / TILE);
    if (S.arrivedTile && S.arrivedTile !== tx + ',' + ty) S.arrivedTile = null;
    for (const ex of S.map.exits) {
      if (ex.x === tx && ex.y === ty && !S.arrivedTile) {
        if (ex.needFlag && !S.flags[ex.needFlag]) break;
        changeMap(ex);
        break;
      }
    }
    checkAreaEvents();
  } else if (!dlg.active && S.lock > 0) {
    // during cutscenes the player animates only via paths
  }

  // walk animation
  for (const e of S.entities) {
    if (e.moving || e.path) {
      e.animT += dt;
      if (e.animT > 0.14) { e.animT = 0; e.frame = (e.frame + 1) % 4; }
    } else { e.frame = 0; e.animT = 0; }
  }

  // follower trail
  if (S.marle && S.marle.follow && !S.marle.hidden) {
    const last = S.trail[S.trail.length - 1];
    const d = last ? Math.hypot(p.x - last.x, p.y - last.y) : 99;
    if (d >= 2) {
      S.trail.push({ x: p.x, y: p.y, dir: p.dir });
      if (S.trail.length > 30) S.trail.shift();
    }
    const t = S.trail[Math.max(0, S.trail.length - 9)];
    if (t) {
      S.marle.x = t.x; S.marle.y = t.y;
      S.marle.dir = t.dir;
      S.marle.moving = p.moving;
      if (p.moving) {
        S.marle.animT += dt;
        if (S.marle.animT > 0.14) { S.marle.animT = 0; S.marle.frame = (S.marle.frame + 1) % 4; }
      }
    }
  }

  // NPC wandering
  for (const e of S.entities) {
    if (!e.wander || e.path || S.lock > 0) continue;
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = 1.6 + Math.random() * 3.5;
      const d = ['up', 'down', 'left', 'right'][(Math.random() * 4) | 0];
      e.dir = d;
      const [vx, vy] = DIRV[d];
      const nx = e.x + vx * TILE, ny = e.y + vy * TILE;
      if (Math.abs(nx - e.homeX) < TILE * 2.5 && Math.abs(ny - e.homeY) < TILE * 2.5 && !blocked(e, nx, ny)) {
        e.pathSpeed = 30;
        e.path = { x: nx, y: ny, res: null };
      }
    }
  }

  centerCamera(false);
}

function update(dt) {
  S.time += dt;
  updateTweens(dt);
  dlg.update(dt);
  // Presses made during a field cutscene must not queue up and fire the moment
  // the lock lifts — that would skip the next line or trigger a stray
  // interaction. Battles hold the lock too but consume taps themselves.
  if (S.scene === 'field' && S.lock > 0 && !dlg.active) clearTaps();
  S.flash = Math.max(0, S.flash - dt * 2.2);
  S.shake = Math.max(0, S.shake - dt * 2.2);
  if (S.bannerT > 0) S.bannerT -= dt;

  if (S.scene === 'title') {
    if (tap('a') || tap('b') || tap('menu')) {
      sfx('confirm');
      S.scene = 'field';
      S.flags = {}; S.gold = 0; S.silver = 0; S.items = { tonic: 3 };
      S.marle = null; S.player = null;
      loadMap('room', 2, 4, 'down');
      S.fade = 1;
      introScene();
    }
    return;
  }
  if (S.scene === 'battle') { if (S.battle) S.battle.update(dt); return; }
  if (S.scene === 'end') {
    if (S.fade > 0 && !S.tweens.length && S.endStage === 0) { S.endStage = 1; tween(v => S.fade = v, 1, 0, 1.5); }
    if (tap('a') && S.endStage === 1 && S.time > 0) {
      S.endStage = 2;
      fadeOut(0.8).then(() => { S.scene = 'title'; S.fade = 0; playSong('home'); });
    }
    return;
  }
  if (S.menu) {
    if (tap('menu') || tap('b') || tap('a')) { S.menu = false; sfx('cancel'); }
    return;
  }
  updateField(dt);
}

/* ------------------------------------------------------------------ */
/* draw                                                                */
/* ------------------------------------------------------------------ */

function drawField() {
  const map = S.map;
  const sx = S.shake > 0 ? (Math.random() - 0.5) * S.shake * 5 : 0;
  const sy = S.shake > 0 ? (Math.random() - 0.5) * S.shake * 4 : 0;
  g.fillStyle = map.indoor ? '#101018' : '#204030';
  g.fillRect(0, 0, VW, VH);
  g.save();
  g.translate(Math.round(-S.cam.x + sx), Math.round(-S.cam.y + sy));
  g.drawImage(renderMap(map), 0, 0);

  // collect drawables and sort by feet
  const draws = [];
  for (const p of map.props) draws.push({ y: p.y + prop(p.img).height, draw: () => g.drawImage(prop(p.img), p.x, p.y) });
  if (S.gateProp) {
    const gp = S.gateProp;
    draws.push({
      y: gp.y + 52, draw: () => {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.translate(gp.x + 24, gp.y + 24);
        for (let i = 0; i < 3; i++) {
          const sc = (1.15 + Math.sin(S.time * 2.4 + i * 2) * 0.12) * (1 + i * 0.18);
          g.save();
          g.globalAlpha = 0.55 - i * 0.14;
          g.rotate(S.time * (0.7 + i * 0.35) * (i % 2 ? -1 : 1));
          g.scale(sc, sc);
          g.drawImage(prop('gate'), -24, -24);
          g.restore();
        }
        g.restore();
      }
    });
  }
  for (const e of S.entities) {
    if (e.hidden || !e.visible) continue;
    if (e.prop) {
      const img = prop(e.prop);
      const px = e.x + 8 - img.width / 2, py = e.y + 24 - img.height;
      draws.push({ y: e.feetY, draw: () => g.drawImage(img, px, py) });
    } else {
      const img = charFrame(e.char, e.dir, e.moving || e.path ? e.frame : 0);
      draws.push({ y: e.feetY, draw: () => g.drawImage(img, Math.round(e.x), Math.round(e.y)) });
    }
  }
  draws.sort((a, b) => a.y - b.y);
  for (const d of draws) d.draw();
  g.restore();

  // indoor vignette
  if (map.indoor) {
    const grd = g.createRadialGradient(VW / 2, VH / 2, 60, VW / 2, VH / 2, 170);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, VW, VH);
  }
}

function drawTitle() {
  // starry night sky
  g.fillStyle = '#04061a';
  g.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 90; i++) {
    const x = (i * 61) % VW, y = (i * 37) % 130;
    const tw = 0.5 + 0.5 * Math.sin(S.time * 2 + i);
    g.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.7})`;
    g.fillRect(x, y, 1, 1);
  }
  // horizon
  g.fillStyle = '#0a1030';
  g.fillRect(0, 150, VW, VH - 150);
  g.fillStyle = '#101a44';
  for (let x = 0; x < VW; x += 8) {
    const h = 14 + Math.sin(x * 0.05) * 8 + Math.sin(x * 0.13) * 5;
    g.fillRect(x, 150 - h, 8, h);
  }
  // bell tower silhouette
  g.save();
  g.globalAlpha = 0.85;
  g.drawImage(prop('bell'), 190, 96);
  g.restore();
  // Crono looking up
  g.drawImage(charFrame('crono', 'up', 0), 48, 138);
  g.drawImage(charFrame('marle', 'up', 0), 68, 142);
}

function drawEnd() {
  g.fillStyle = '#04061a';
  g.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 60; i++) {
    const x = (i * 97) % VW, y = (i * 53) % VH;
    g.fillStyle = `rgba(160,220,255,${0.2 + 0.5 * Math.abs(Math.sin(S.time + i))})`;
    g.fillRect(x, y, 1, 1);
  }
  g.save();
  g.globalAlpha = 0.5;
  g.translate(VW / 2, 84);
  g.rotate(S.time * 0.3);
  g.scale(1.6, 1.6);
  g.drawImage(prop('gate'), -24, -24);
  g.restore();
}

function drawUI() {
  vctx.setTransform(scale, 0, 0, scale, offX, offY);
  vctx.imageSmoothingEnabled = true;
  vctx.textBaseline = 'top';
  vctx.textAlign = 'left';

  if (S.scene === 'title') {
    vctx.textAlign = 'center';
    vctx.save();
    vctx.shadowColor = '#3060ff';
    vctx.shadowBlur = 14;
    vctx.fillStyle = '#ffffff';
    vctx.font = `bold 26px ${FONT}`;
    vctx.fillText('CHRONO', VW / 2, 26);
    vctx.fillText('TRIGGER', VW / 2, 54);
    vctx.restore();
    vctx.fillStyle = '#ffe070';
    vctx.font = `10px ${FONT}`;
    vctx.fillText('Chapter 1 — The Millennial Fair', VW / 2, 90);
    vctx.fillStyle = 'rgba(255,255,255,' + (0.45 + 0.55 * Math.abs(Math.sin(S.time * 2.2))) + ')';
    vctx.font = `bold 11px ${FONT}`;
    vctx.fillText('PRESS  A  /  TAP  TO  START', VW / 2, 178);
    vctx.fillStyle = '#9fb8e8';
    vctx.font = `7px ${FONT}`;
    vctx.fillText('Arrows / WASD: move    Z: talk    X: run    C: status', VW / 2, 200);
    vctx.fillText('A fan-made tribute — not affiliated with Square Enix', VW / 2, 211);
    vctx.textAlign = 'left';
    return;
  }

  if (S.scene === 'end') {
    vctx.textAlign = 'center';
    vctx.fillStyle = '#ffffff';
    vctx.font = `bold 16px ${FONT}`;
    vctx.fillText('TO BE CONTINUED', VW / 2, 118);
    vctx.font = `9px ${FONT}`;
    vctx.fillStyle = '#ffe070';
    vctx.fillText('End of Chapter 1: The Millennial Fair', VW / 2, 142);
    vctx.fillStyle = '#a8c8ff';
    vctx.font = `8px ${FONT}`;
    vctx.fillText('600 A.D. — The Kingdom of Guardia awaits...', VW / 2, 160);
    vctx.fillStyle = '#ffffff';
    vctx.fillText(`Gold: ${S.gold}    Silver Points: ${S.silver}`, VW / 2, 180);
    vctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * Math.abs(Math.sin(S.time * 2))) + ')';
    vctx.fillText('Press A to return to the title', VW / 2, 200);
    vctx.textAlign = 'left';
    return;
  }

  if (S.scene === 'battle' && S.battle) { S.battle.drawUI(vctx); dlg.draw(vctx, S.time); return; }

  // field HUD
  if (!dlg.active) {
    vctx.font = `7px ${FONT}`;
    const gtxt = `${S.gold} G`, stxt = `${S.silver} SP`;
    const gw = vctx.measureText(gtxt).width, sw = vctx.measureText(stxt).width;
    vctx.fillStyle = 'rgba(0,0,0,0.45)';
    vctx.fillRect(4, 4, gw + sw + 20, 12);
    vctx.fillStyle = '#ffe070';
    vctx.fillText(gtxt, 8, 6);
    vctx.fillStyle = '#c0d8f8';
    vctx.fillText(stxt, 12 + gw, 6);
  }
  if (S.bannerT > 0 && S.fade < 0.6) drawBanner(vctx, S.map.name, Math.min(1, S.bannerT));

  if (S.menu) {
    vctx.fillStyle = 'rgba(8,16,64,0.92)';
    vctx.fillRect(28, 32, VW - 56, 150);
    vctx.strokeStyle = '#fff'; vctx.lineWidth = 1;
    vctx.strokeRect(28.5, 32.5, VW - 57, 149);
    vctx.fillStyle = '#ffe070';
    vctx.font = `10px ${FONT}`;
    vctx.fillText('PARTY', 40, 42);
    vctx.font = `9px ${FONT}`;
    vctx.fillStyle = '#fff';
    vctx.fillText('Crono   HP 70/70   MP 10/10', 40, 62);
    if (S.flags.marleJoined && !S.flags.marleVanished) vctx.fillText('Marle   HP 60/60   MP 12/12', 40, 76);
    vctx.fillStyle = '#ffe070';
    vctx.font = `10px ${FONT}`;
    vctx.fillText('ITEMS', 40, 98);
    vctx.font = `9px ${FONT}`;
    vctx.fillStyle = '#fff';
    vctx.fillText(`Tonic x${S.items.tonic}`, 40, 114);
    if (S.flags.boughtCandy) vctx.fillText('Candy stick', 40, 126);
    if (S.flags.gotPendant) vctx.fillText("Marle's Pendant", 40, 138);
    vctx.fillStyle = '#a8c8ff';
    vctx.font = `8px ${FONT}`;
    vctx.fillText(`Gold ${S.gold}     Silver Points ${S.silver}`, 40, 156);
    vctx.fillText('Press C / MENU to close', 40, 168);
  }

  dlg.draw(vctx, S.time);
}

function draw() {
  if (S.scene === 'title') drawTitle();
  else if (S.scene === 'end') drawEnd();
  else if (S.scene === 'battle' && S.battle) S.battle.draw(g);
  else if (S.map) drawField();

  // flash + fade over the pixel layer
  if (S.flash > 0) {
    g.save();
    g.globalAlpha = Math.min(1, S.flash);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, VW, VH);
    g.restore();
  }
  if (S.fade > 0) {
    g.save();
    g.globalAlpha = Math.min(1, S.fade);
    g.fillStyle = S.fadeColor;
    g.fillRect(0, 0, VW, VH);
    g.restore();
  }

  vctx.setTransform(1, 0, 0, 1, 0, 0);
  vctx.fillStyle = '#000';
  vctx.fillRect(0, 0, view.width, view.height);
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(buf.c, offX, offY, VW * scale, VH * scale);
  drawUI();
}

/* ------------------------------------------------------------------ */
/* main loop                                                           */
/* ------------------------------------------------------------------ */

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

export async function boot() {
  resize();
  initInput(document);

  // Optional sprite sheets override the built-in art (see assets/README.md).
  try {
    const a = await loadAssets();
    if (a.characters || a.tiles || a.props) {
      console.log(`[art] custom assets loaded — ${a.characters} character frames, ${a.tiles} tiles, ${a.props} props`);
    }
  } catch (e) {
    console.warn('[art] asset load failed, using built-in art', e);
  }
  onFirstInput(() => playSong('home'));

  const sound = document.getElementById('btn-sound');
  if (sound) sound.addEventListener('click', () => {
    setEnabled(!isEnabled());
    sound.textContent = isEnabled() ? '♪' : '✕';
    sound.classList.toggle('off', !isEnabled());
  });
  const fs = document.getElementById('btn-full');
  if (fs) fs.addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen || (() => { })).call(el);
    else document.exitFullscreen && document.exitFullscreen();
    setTimeout(resize, 400);
  });

  S.scene = 'title';
  S.fade = 0;
  requestAnimationFrame(frame);
}
