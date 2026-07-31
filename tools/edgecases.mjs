// Edge-case sweep: the paths a straight playthrough never touches.
//
//   node tools/edgecases.mjs [baseUrl]
//
// Talks to every NPC on every map, exercises the menu, declines and accepts
// each prompt, and restarts the chapter from the ending. Uses the __CTDBG hooks
// to set up states that would take a long walk to reach honestly.

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8125';
const problems = [];
const notes = [];

// This container ships a Chromium at a fixed path; a CI runner uses the one
// playwright installs. Prefer an explicit override, then the local build, then
// whatever playwright resolves by itself.
import { existsSync } from 'node:fs';
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = process.env.PLAYWRIGHT_CHROMIUM
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
  : existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {};

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
page.on('pageerror', e => problems.push(`PAGE ERROR: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') problems.push(`CONSOLE ERROR: ${m.text()}`); });

const wait = ms => page.waitForTimeout(ms);
const st = () => page.evaluate(() => {
  const S = window.__CT, dlg = window.__CTDLG;
  return { scene: S.scene, map: S.map && S.map.id, lock: S.lock, menu: S.menu,
           dlg: !!dlg.active, gold: S.gold, silver: S.silver, flags: { ...S.flags },
           items: { ...S.items }, tileX: S.player && S.player.tileX, tileY: S.player && S.player.tileY };
});
const mash = async (n, gap = 160) => { for (let i = 0; i < n; i++) { await page.keyboard.press('KeyZ'); await wait(gap); } };

// Press A only while a box is actually open. Mashing blindly is dangerous here:
// a spare press lands on the field and re-triggers whatever the player is facing.
// A conversation is a chain of separate boxes with async gaps between them, so
// "no box open right now" is not the same as "the scene is over".
async function settle(ms = 20000) {
  const deadline = Date.now() + ms;
  let calm = 0;
  while (Date.now() < deadline) {
    const s = await st();
    if (s.dlg) { await page.keyboard.press('KeyZ'); await wait(180); calm = 0; continue; }
    calm = s.lock === 0 ? calm + 1 : 0;
    if (calm >= 4) return s;
    await wait(200);
  }
  return await st();
}

async function clearDialogue(max = 20) {
  for (let i = 0; i < max; i++) {
    if (!(await page.evaluate(() => window.__CTDLG.active))) return true;
    await page.keyboard.press('KeyZ');
    await wait(180);
  }
  return false;
}

// A choice needs three separate things: the page fully revealed (the first A
// only skips the typewriter), the cursor moved with a *held* key (the menu
// reads key state, not taps), and then a confirm.
async function answerChoice(index, label) {
  // Wait for the prompt, then finish the typewriter directly instead of pressing
  // A for it: an A that lands on the frame the text completes is taken as a
  // confirm, which silently picks whatever option is highlighted.
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => window.__CTDLG.active)) break;
    await wait(150);
  }
  const shown = await page.evaluate(() => {
    const d = window.__CTDLG;
    if (!d.active) return null;
    d.shown = d.pageLen;
    return { choices: d.choices ? d.choices.length : 0, at: d.choiceIndex };
  });
  if (!shown) { problems.push(`CHOICE: ${label} — no prompt on screen`); return false; }
  if (!shown.choices) { problems.push(`CHOICE: ${label} — prompt has no choices`); return false; }
  await wait(120);

  for (let i = 0; i < 8; i++) {
    const at = await page.evaluate(() => window.__CTDLG.choiceIndex);
    if (at === index) break;
    const key = at < index ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(key);
    await wait(140);
    await page.keyboard.up(key);
    await wait(140);
  }
  const finalAt = await page.evaluate(() => window.__CTDLG.choiceIndex);
  if (finalAt !== index) {
    problems.push(`CHOICE: ${label} — cursor stuck on ${finalAt}, wanted ${index}`);
    return false;
  }
  await page.keyboard.press('KeyZ');
  await wait(400);
  return true;
}

// Each section starts from a reload. Cutscenes are async and keep running after
// a forced jump, so sharing one page between sections leaks half-finished scenes
// into the next check and produces failures that are the test's fault.
async function freshStart(flags = []) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await wait(900);
  await page.keyboard.press('KeyZ');
  await wait(600);
  for (let i = 0; i < 60; i++) {
    const s = await st();
    if (s.lock === 0 && s.scene === 'field' && !s.dlg) break;
    await page.keyboard.press('KeyZ');
    await wait(160);
  }
  if (flags.length) {
    await page.evaluate(fs => fs.forEach(f => window.__CTDBG.flag(f, true)), flags);
  }
}

await freshStart();

/* ------------------------------------------------------------------ */
/* 1. every NPC on every map answers without throwing                  */
/* ------------------------------------------------------------------ */
const maps = ['room', 'house', 'world', 'square', 'telepod'];
for (const id of maps) {
  // a clean page per map, then unlock so flag-gated NPCs and lines are reachable
  await freshStart(['wokeUp', 'gotAllowance', 'metMarle', 'marleJoined']);
  await page.evaluate(m => window.__CTDBG.goto(m, 2, 2, 'down'), id);
  await wait(300);
  const npcs = await page.evaluate(() =>
    window.__CT.entities.filter(e => e.isNpc).map(e => ({ id: e.id, x: e.tileX, y: e.tileY })));
  notes.push(`${id}: ${npcs.length} npc(s)`);

  for (const n of npcs) {
    const before = problems.length;
    // stand one tile below and look up at them
    await page.evaluate(({ x, y }) => {
      const S = window.__CT;
      S.player.x = x * 16; S.player.y = (y + 1) * 16 - 8; S.player.dir = 'up';
      S.lock = 0;
    }, n);
    await wait(120);
    await page.evaluate(() => { window.__CTDBG.interact(); });   // do not await the conversation
    await wait(320);
    await clearDialogue();
    await page.evaluate(() => { window.__CTDLG.close && window.__CTDLG.close(); window.__CT.lock = 0; });
    await wait(120);
    if (problems.length > before) notes.push(`  !! ${id}/${n.id} raised an error`);
  }
}

/* ------------------------------------------------------------------ */
/* 1b. scripted walks resolve from any starting offset                 */
/* ------------------------------------------------------------------ */
// Cutscenes await these paths. A residual too small to step but too large to
// count as arrival used to satisfy neither test, so the path never resolved and
// the scene hung with input locked — the walk into the gate could softlock.
await freshStart();
for (const [ox, oy] of [[1, 1], [1, 0], [0, 1], [3, 3], [0.6, 0.6], [7, 2]]) {
  const r = await page.evaluate(async ([ox, oy]) => {
    const pl = window.__CT.player;
    pl.path = null;
    pl.x = 80 + ox; pl.y = 88 + oy; pl.pathSpeed = 40;
    let done = false;
    pl.path = { x: 80, y: 88, res: () => { done = true; } };
    await new Promise(res => setTimeout(res, 1500));
    return { done, x: Math.round(pl.x), y: Math.round(pl.y) };
  }, [ox, oy]);
  if (!r.done) problems.push(`PATH: a scripted walk from +${ox},${oy} never arrived (stopped at ${r.x},${r.y})`);
}
notes.push('scripted paths resolve from off-grid offsets');

/* ------------------------------------------------------------------ */
/* 2. the status menu opens and closes                                 */
/* ------------------------------------------------------------------ */
await freshStart();
await page.evaluate(() => { window.__CTDBG.goto('world', 5, 8, 'down'); window.__CT.lock = 0; });
await wait(300);
await page.keyboard.press('KeyC');
await wait(300);
if (!(await st()).menu) problems.push('MENU: C did not open the status menu');
await page.keyboard.press('KeyC');
await wait(300);
if ((await st()).menu) problems.push('MENU: C did not close the status menu');

/* ------------------------------------------------------------------ */
/* 3. Gato: decline, then fight, then fight again                      */
/* ------------------------------------------------------------------ */
const gatoPrompt = async choice => {
  await page.evaluate(() => {
    const S = window.__CT;
    S.player.x = 18 * 16; S.player.y = 18 * 16 - 8; S.player.dir = 'up'; S.lock = 0;
  });
  await wait(150);
  await page.evaluate(() => { window.__CTDBG.interact(); });   // do not await the conversation
  await wait(500);
  await answerChoice(choice === 'no' ? 1 : 0, `Gato prompt (${choice})`);
};

await freshStart(['metMarle', 'marleJoined']);
await page.evaluate(() => { window.__CTDBG.goto('square', 18, 18, 'up'); window.__CT.lock = 0; });
await wait(600);
await gatoPrompt('no');
let s = await settle();
if (s.scene === 'battle') problems.push('GATO: declining the spar still started the battle');
await page.evaluate(() => { window.__CT.lock = 0; window.__CTDLG.close && window.__CTDLG.close(); });
await wait(200);

await gatoPrompt('yes');
s = await waitForState(x => x.scene === 'battle', 'GATO: accepting did not start a battle', 8000);
if (s) {
  // fight it out
  for (let i = 0; i < 200; i++) {
    const cur = await st();
    if (cur.scene !== 'battle') break;
    await page.keyboard.press('KeyZ');
    await wait(300);
  }
  await waitForState(x => x.scene === 'field', 'GATO: battle never returned to the field', 15000);
  const after = await settle();
  if (!after.flags.gatoBeaten) problems.push('GATO: winning did not set gatoBeaten');
  if (after.silver !== 15) problems.push(`GATO: expected 15 silver for the first win, got ${after.silver}`);

  // second win pays less; make sure the repeat path works at all
  await gatoPrompt('yes');
  const again = await waitForState(x => x.scene === 'battle', 'GATO: could not rematch', 8000);
  if (again) {
    for (let i = 0; i < 200; i++) {
      const cur = await st();
      if (cur.scene !== 'battle') break;
      await page.keyboard.press('KeyZ');
      await wait(300);
    }
    await waitForState(x => x.scene === 'field', 'GATO: rematch never returned to the field', 15000);
    const rematch = await settle();
    if (rematch.silver <= 15) problems.push(`GATO: rematch paid nothing, silver still ${rematch.silver}`);
    notes.push(`gato rematch silver: ${rematch.silver}`);
  }
}

/* ------------------------------------------------------------------ */
/* 3b. fleeing a battle returns to the field                           */
/* ------------------------------------------------------------------ */
await freshStart(['metMarle', 'marleJoined']);
await page.evaluate(() => { window.__CTDBG.goto('square', 18, 18, 'up'); window.__CT.lock = 0; });
await wait(600);
await gatoPrompt('yes');
if (await waitForState(x => x.scene === 'battle', 'RUN: could not start the battle to flee', 10000)) {
  // drive the command menu: Attack, Tech, Item, Run
  let fled = false;
  for (let i = 0; i < 60 && !fled; i++) {
    const menu = await page.evaluate(() => {
      const b = window.__CT.battle;
      return b && b.menu ? { mode: b.menu.mode, index: b.menu.index } : null;
    });
    if (!menu) { await wait(300); continue; }
    if (menu.mode !== 'cmd') { await page.keyboard.press('KeyX'); await wait(200); continue; }
    if (menu.index !== 3) {
      await page.keyboard.down('ArrowDown'); await wait(130); await page.keyboard.up('ArrowDown');
      await wait(150);
      continue;
    }
    await page.keyboard.press('KeyZ');
    await wait(600);
    fled = true;
  }
  if (!fled) problems.push('RUN: never reached the Run command');
  const back = await waitForState(x => x.scene === 'field', 'RUN: fleeing did not return to the field', 20000);
  if (back) {
    const s2 = await settle();
    if (s2.flags.gatoBeaten) problems.push('RUN: fleeing counted as a win');
    notes.push(`fled the battle, silver ${s2.silver}`);
  }
}

/* ------------------------------------------------------------------ */
/* 3c. the game comes up on a phone-sized viewport                     */
/* ------------------------------------------------------------------ */
{
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phoneErrors = [];
  phone.on('pageerror', e => phoneErrors.push(e.message));
  phone.on('console', m => { if (m.type() === 'error') phoneErrors.push(m.text()); });
  await phone.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await phone.waitForTimeout(1500);
  const canvas = await phone.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight,
             dpad: !!document.querySelector('#dpad'), touchClass: document.body.classList.contains('touch') };
  });
  notes.push(`phone canvas ${canvas.cssW}x${canvas.cssH}, dpad ${canvas.dpad}, touch class ${canvas.touchClass}`);
  if (!canvas.w || !canvas.h) problems.push('MOBILE: canvas has no backing size');
  if (!canvas.dpad) problems.push('MOBILE: on-screen d-pad missing');
  if (!canvas.touchClass) problems.push('MOBILE: touch layout class not applied');
  // tap the A button to start, the same way a phone player would
  await phone.tap('#btn-a');
  await phone.waitForTimeout(900);
  const started = await phone.evaluate(() => window.__CT.scene);
  if (started !== 'field') problems.push(`MOBILE: tapping A did not start the game (scene ${started})`);
  for (const e of phoneErrors) problems.push(`MOBILE ERROR: ${e}`);
  await phone.close();
}

/* ------------------------------------------------------------------ */
/* 4. the gate: decline, then enter                                    */
/* ------------------------------------------------------------------ */
await freshStart(['metMarle', 'marleJoined', 'telepodStarted', 'telepodDone',
                  'gateOpen', 'marleVanished', 'gotPendant']);
await page.evaluate(() => { window.__CTDBG.goto('telepod', 5, 8, 'up'); window.__CT.lock = 0; });
await wait(400);
await page.evaluate(() => { window.__CTDBG.interact(); });   // do not await the conversation
await wait(500);
await answerChoice(1, 'gate prompt (Not yet)');
await wait(400);
if ((await st()).scene === 'end') problems.push('GATE: declining still ended the chapter');
await page.evaluate(() => { window.__CT.lock = 0; window.__CTDLG.close && window.__CTDLG.close(); });
await wait(300);

await page.evaluate(() => {
  const S = window.__CT;
  S.player.x = 5 * 16; S.player.y = 8 * 16 - 8; S.player.dir = 'up'; S.lock = 0;
});
await page.evaluate(() => { window.__CTDBG.interact(); });   // do not await the conversation
await wait(500);
await answerChoice(0, 'gate prompt (Enter)');
await waitForState(x => x.scene === 'end', 'GATE: entering did not end the chapter', 25000);

/* ------------------------------------------------------------------ */
/* 5. the ending returns to the title, and a new run starts clean      */
/* ------------------------------------------------------------------ */
await wait(3000);                       // the ending fades in before it accepts input
let backToTitle = null;
for (let i = 0; i < 12 && !backToTitle; i++) {
  await page.keyboard.press('KeyZ');
  await wait(600);
  if ((await st()).scene === 'title') backToTitle = await st();
}
if (!backToTitle) problems.push(`ENDING: A did not return to the title — state ${JSON.stringify(await st())}`);
if (backToTitle) {
  await page.keyboard.press('KeyZ');
  await waitForState(x => x.scene === 'field' && x.map === 'room', 'RESTART: could not start a second run', 10000);
  const fresh = await st();
  if (fresh) {
    if (fresh.gold !== 0) problems.push(`RESTART: gold carried over (${fresh.gold})`);
    if (fresh.silver !== 0) problems.push(`RESTART: silver carried over (${fresh.silver})`);
    const stale = Object.keys(fresh.flags).filter(k => !['wokeUp'].includes(k));
    if (stale.length) problems.push(`RESTART: story flags carried over: ${stale.join(', ')}`);
    if (fresh.items && fresh.items.tonic !== 3) problems.push(`RESTART: tonics not reset (${fresh.items.tonic})`);
  }
}

async function waitForState(pred, label, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const s = await st();
    if (s && pred(s)) return s;
    await wait(200);
  }
  problems.push(`${label} — state ${JSON.stringify(await st())}`);
  return null;
}

await browser.close();

console.log(notes.join('\n'));
console.log('\n================ EDGE CASES ================');
if (!problems.length) console.log('clean — no errors, every path behaved');
else { console.log(`${problems.length} problem(s):`); for (const p of problems) console.log(' - ' + p); }
process.exit(problems.length ? 1 : 0);
