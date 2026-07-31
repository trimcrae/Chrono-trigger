// Scripted playthrough of Chapter 1, driven through the real keyboard path.
//
//   node tools/playthrough.mjs [baseUrl] [outDir]
//
// Walks the chapter start to finish, shooting each beat and failing loudly on
// a page error, a stall, or a step that never reaches the state it expects.
// Requires a static server on baseUrl and playwright installed.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8123';
const OUT = process.argv[3] || '/tmp/play';
mkdirSync(OUT, { recursive: true });

const problems = [];
const log = [];
let shot = 0;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });

page.on('pageerror', e => problems.push(`PAGE ERROR: ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error') problems.push(`CONSOLE ERROR: ${m.text()}`);
  if (m.type() === 'warning') log.push(`warn: ${m.text()}`);
});

const state = () => page.evaluate(() => {
  const S = window.__CT, dlg = window.__CTDLG;
  if (!S) return null;
  return {
    scene: S.scene, map: S.map && S.map.id, lock: S.lock, menu: S.menu,
    x: S.player && Math.round(S.player.x), y: S.player && Math.round(S.player.y),
    tileX: S.player && S.player.tileX, tileY: S.player && S.player.tileY,
    dlg: !!dlg.active, flags: { ...S.flags }, gold: S.gold, silver: S.silver,
    fade: +(S.fade || 0).toFixed(2),
  };
});

async function snap(name) {
  const file = `${OUT}/${String(++shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log.push(`shot ${file} :: ${JSON.stringify(await state())}`);
}

const wait = ms => page.waitForTimeout(ms);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
  await wait(60);
};
const tapKey = async (key, times = 1, gap = 190) => {
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); await wait(gap); }
};

// Mash A until the predicate holds, so cutscene length never has to be guessed.
async function advanceUntil(pred, label, maxPresses = 90) {
  for (let i = 0; i < maxPresses; i++) {
    const s = await state();
    if (s && pred(s)) return s;
    await page.keyboard.press('KeyZ');
    await wait(170);
  }
  problems.push(`STUCK: ${label} — gave up after ${maxPresses} A presses; state ${JSON.stringify(await state())}`);
  return null;
}

// Ask the game itself which tiles are walkable, so the route respects the same
// collision the player does — including NPCs standing in doorways.
const collisionGrid = () => page.evaluate(() => {
  const S = window.__CT, D = window.__CTDBG;
  const grid = [];
  for (let y = 0; y < S.map.h; y++) {
    const row = [];
    for (let x = 0; x < S.map.w; x++) row.push(D.blockedAt(x, y) ? 1 : 0);
    grid.push(row);
  }
  // blockedAt counts NPCs, and NPCs wander. Report them separately so routing
  // can treat a body as a delay rather than as a wall.
  const bodies = S.entities
    .filter(e => e !== S.player && e.solid && !e.hidden)
    .map(e => [e.tileX, e.tileY]);
  return { w: S.map.w, h: S.map.h, grid, bodies, exits: S.map.exits.map(e => [e.x, e.y]) };
});

// Breadth-first route between tiles. Exits are walls unless one is the target,
// otherwise a route can wander back through the door it just came out of.
function route(map, from, to, throughBodies = false) {
  const isBody = (x, y) => map.bodies.some(([bx, by]) => bx === x && by === y);
  const blocked = (x, y) =>
    x < 0 || y < 0 || x >= map.w || y >= map.h ||
    (map.grid[y][x] === 1 && !(throughBodies && isBody(x, y)));
  const isExit = (x, y) =>
    map.exits.some(([ex, ey]) => ex === x && ey === y) && !(x === to[0] && y === to[1]);
  const key = (x, y) => x + ',' + y;
  const prev = new Map([[key(...from), null]]);
  const queue = [from];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === to[0] && y === to[1]) {
      const path = [];
      for (let k = key(x, y); k; k = prev.get(k)) path.unshift(k.split(',').map(Number));
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (blocked(nx, ny) || isExit(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  return null;
}

const DIR_KEY = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };

// The player collides as a 10px box, not as a tile: standing "on" a tile while
// straddling its neighbour means a one-tile gap is still walled off. Before
// stepping along one axis, centre on the other.
async function centreOn(axis) {
  for (let i = 0; i < 6; i++) {
    const s = await state();
    if (!s || s.lock > 0 || s.dlg) return;
    const want = axis === 'x' ? s.tileX * 16 : s.tileY * 16 - 8;
    const have = axis === 'x' ? s.x : s.y;
    const d = want - have;
    if (Math.abs(d) <= 2) return;
    const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft')
                             : (d > 0 ? 'ArrowDown' : 'ArrowUp');
    await hold(key, Math.max(35, Math.min(160, Math.round(Math.abs(d) / 66 * 1000))));
  }
}

// Follow a BFS route one tile at a time, re-planning if the game disagrees.
async function walkTo(tx, ty, label, replans = 16) {
  const first = await state();
  const fromMap = first && first.map;
  for (let attempt = 0; attempt < replans; attempt++) {
    const s = await state();
    if (!s) break;
    if (s.map !== fromMap) { log.push(`walk ${label}: map changed ${fromMap} -> ${s.map}`); return s; }
    if (s.tileX === tx && s.tileY === ty) return s;
    if (s.lock > 0 || s.dlg) { await wait(200); continue; }

    const map = await collisionGrid();
    // Prefer a route that goes around bodies; fall back to one that goes through
    // them and let the step loop wait for them to wander off.
    const path = route(map, [s.tileX, s.tileY], [tx, ty])
              || route(map, [s.tileX, s.tileY], [tx, ty], true);
    if (!path) {
      if (attempt < replans - 1) { await wait(700); continue; }   // may be a body in a doorway
      problems.push(`UNREACHABLE: ${label} — no route from ${s.tileX},${s.tileY} to ${tx},${ty} on ${fromMap}`);
      return s;
    }
    for (let i = 1; i < path.length; i++) {
      const cur = await state();
      if (!cur || cur.map !== fromMap) { log.push(`walk ${label}: map changed mid-route`); return cur; }
      if (cur.lock > 0 || cur.dlg) break;              // a scene took over; re-plan after
      const dx = path[i][0] - cur.tileX, dy = path[i][1] - cur.tileY;
      const key = DIR_KEY[`${Math.sign(dx)},${Math.sign(dy)}`];
      if (!key) break;                                  // drifted off the route; re-plan
      await centreOn(dy !== 0 ? 'x' : 'y');             // square up before the step
      // one tile is 16px at 66px/s, so nudge and verify rather than dead-reckon
      let moved = false;
      for (let push = 0; push < 6 && !moved; push++) {
        await hold(key, 120);
        const now = await state();
        if (!now || now.map !== fromMap) return now;
        moved = now.tileX === path[i][0] && now.tileY === path[i][1];
        if (now.lock > 0 || now.dlg) { moved = true; break; }
        if (push === 2) await wait(450);                // give a wanderer time to move on
      }
      if (!moved) break;                                // blocked: re-plan around it
    }
  }
  const s = await state();
  problems.push(`STUCK: ${label} — wanted ${tx},${ty} on ${fromMap}, reached ${s && s.tileX},${s && s.tileY} on ${s && s.map}`);
  return s;
}

// Poll while tapping A: covers scenes that need pages advanced and choice
// prompts that need confirming before the state moves on.
async function mashUntil(pred, label, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const s = await state();
    if (s && pred(s)) return s;
    await page.keyboard.press('KeyZ');
    await wait(200);
  }
  problems.push(`STUCK: ${label} — state ${JSON.stringify(await state())}`);
  return null;
}

async function waitFor(pred, label, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const s = await state();
    if (s && pred(s)) return s;
    await wait(150);
  }
  problems.push(`TIMEOUT: ${label} — state ${JSON.stringify(await state())}`);
  return null;
}

try {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await wait(1200);
  await snap('title');

  if (!(await state())) problems.push('FATAL: window.__CT missing — cannot observe the game');

  // --- title -> bedroom -------------------------------------------------
  await tapKey('KeyZ', 1);
  await waitFor(s => s.scene === 'field' && s.map === 'room', 'title starts the game');
  await advanceUntil(s => s.lock === 0, 'opening cutscene in the bedroom');
  await snap('bedroom');

  // --- bedroom -> house -------------------------------------------------
  await walkTo(1, 12, 'reach the bedroom stairs');
  await waitFor(s => s.map === 'house', 'stairs lead to the house');
  await snap('house');

  // --- talk to Mom, collect the allowance -------------------------------
  await walkTo(4, 8, 'stand below Mom');
  await hold('ArrowUp', 120);
  await tapKey('KeyZ', 1);
  await advanceUntil(s => s.lock === 0 && s.gold > 0, 'Mom hands over the allowance');
  const afterMom = await state();
  if (!afterMom || afterMom.gold <= 0) problems.push(`STORY: expected gold after Mom, got ${afterMom && afterMom.gold}`);
  await snap('allowance');

  // --- house -> village -------------------------------------------------
  await walkTo(7, 12, 'reach the front door');
  await waitFor(s => s.map === 'world', 'front door leads outside');
  await advanceUntil(s => s.lock === 0, 'settle outdoors');
  await snap('village');

  // --- village -> Leene Square -----------------------------------------
  await walkTo(10, 0, 'reach the north road');
  await waitFor(s => s.map === 'square', 'north road leads to the square');
  await snap('square-arrive');

  // --- the collision with Marle ----------------------------------------
  // The scene fires on crossing into the square proper, so walk in first.
  await walkTo(13, 18, 'walk into the square');
  await mashUntil(s => s.flags.metMarle && s.lock === 0, 'Marle scene plays out', 40000);
  const marle = await state();
  if (!marle || !marle.flags.marleJoined) problems.push(`STORY: Marle never joined, flags ${JSON.stringify(marle && marle.flags)}`);
  await snap('marle');

  // --- the fair: talk to a vendor --------------------------------------
  await walkTo(4, 6, 'stand below the candy stall');
  await centreOn('x');
  await hold('ArrowUp', 140);
  await tapKey('KeyZ', 1);
  await mashUntil(s => s.lock === 0 && !s.dlg, 'candy vendor conversation', 15000);
  await snap('fair');

  // --- Gato ------------------------------------------------------------
  await walkTo(18, 18, 'stand below Gato');
  await centreOn('x');
  await hold('ArrowUp', 140);
  await tapKey('KeyZ', 1);
  // the prompt offers Fight! / Not now, and Fight! is already highlighted
  const inBattle = await mashUntil(s => s.scene === 'battle', 'Gato starts a battle', 15000);
  if (inBattle) {
    await snap('battle');
    // Attack until the battle resolves one way or the other.
    for (let i = 0; i < 160; i++) {
      const s = await state();
      if (!s || s.scene !== 'battle') break;
      await page.keyboard.press('KeyZ');
      await wait(320);
    }
    await waitFor(s => s.scene === 'field', 'battle returns to the field', 12000);
    await snap('after-battle');
  }

  // --- square -> telepod, and the ending --------------------------------
  await mashUntil(s => s.lock === 0 && !s.dlg, 'settle after the battle', 20000);
  const won = await state();
  if (!won || !won.flags.gatoBeaten) problems.push(`STORY: Gato never beaten, flags ${JSON.stringify(won && won.flags)}`);
  if (won && won.silver <= 0) problems.push(`STORY: expected silver points after Gato, got ${won.silver}`);

  await walkTo(12, 0, 'reach the telepod entrance');
  await waitFor(s => s.map === 'telepod', 'entrance leads to the telepod hall');
  await snap('telepod');

  // the demonstration triggers a couple of tiles in, same as the square
  await walkTo(10, 10, 'walk up to the telepod');
  await mashUntil(s => s.flags.telepodStarted, 'telepod demonstration begins', 30000);
  await mashUntil(s => s.flags.gotPendant && s.lock === 0 && !s.dlg, 'Marle vanishes and the pendant is recovered', 90000);
  await snap('gate');

  // the chapter ends by stepping onto the left pad and choosing to enter
  await walkTo(5, 8, 'stand below the left telepod pad');
  await centreOn('x');
  await hold('ArrowUp', 140);
  await tapKey('KeyZ', 1);
  await mashUntil(s => s.scene === 'end', 'entering the gate ends the chapter', 40000);
  await snap('ending');

  const final = await state();
  if (!final || final.scene !== 'end') problems.push(`STORY: chapter never reached the ending, final state ${JSON.stringify(final)}`);
} catch (err) {
  problems.push(`THREW: ${err.message}`);
  await snap('crash');
} finally {
  writeFileSync(`${OUT}/log.txt`, log.join('\n') + '\n');
  await browser.close();
}

console.log(log.join('\n'));
console.log('\n================ PLAYTHROUGH ================');
if (problems.length === 0) {
  console.log('clean run — no errors, no stalls');
} else {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(' - ' + p);
}
process.exit(problems.length ? 1 : 0);
