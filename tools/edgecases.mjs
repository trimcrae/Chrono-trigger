// Everything a straight playthrough never touches.
//
//   node tools/edgecases.mjs [baseUrl]
//
// Talks to every NPC, reads every scenery description, fires every exit, works
// the tile interactions and every branch of the prompts, checks the menu and the
// page chrome, runs once on the built-in art, and restarts from the ending to
// prove nothing carries over.

import { open } from './testkit.mjs';

const h = await open(process.argv[2] || 'http://localhost:8125');
const MAPS = ['room', 'house', 'world', 'square', 'telepod'];
const ALL_FLAGS = ['wokeUp', 'gotAllowance', 'metMarle', 'marleJoined'];
// Walking into the telepod hall starts the demonstration, which locks input for
// the length of the scene. Mark it already started when the point is to poke at
// that map rather than to watch the cutscene.
const flagsFor = id => (id === 'telepod' ? [...ALL_FLAGS, 'telepodStarted'] : ALL_FLAGS);

/* ------------------------------------------------------------------ */
/* 1. every NPC on every map answers without throwing                  */
/* ------------------------------------------------------------------ */
for (const id of MAPS) {
  await h.freshStart(flagsFor(id));
  await h.page.evaluate(m => window.__CTDBG.goto(m, 2, 2, 'down'), id);
  await h.wait(300);
  const npcs = await h.page.evaluate(() =>
    window.__CT.entities.filter(e => e.isNpc).map(e => ({ id: e.id, x: e.tileX, y: e.tileY })));
  h.note(`${id}: ${npcs.length} npc(s)`);

  for (const n of npcs) {
    const before = h.problems.length;
    await h.talkToNpc(n.id);
    if (!(await h.page.evaluate(() => window.__CTDLG.active))) h.fail(`NPC: ${id}/${n.id} said nothing`);
    await h.clearDialogue();
    await h.page.evaluate(() => { window.__CTDLG.close && window.__CTDLG.close(); window.__CT.lock = 0; });
    await h.wait(120);
    if (h.problems.length === before) h.cover(`npc: ${id}/${n.id}`);
  }
}

/* ------------------------------------------------------------------ */
/* 2. every piece of scenery with a description                        */
/* ------------------------------------------------------------------ */
for (const id of MAPS) {
  await h.freshStart(flagsFor(id));
  await h.page.evaluate(m => window.__CTDBG.goto(m, 2, 2, 'down'), id);
  await h.wait(250);
  const looks = await h.page.evaluate(() => Object.keys(window.__CT.map.looks || {}));
  if (!looks.length) continue;
  h.note(`${id}: ${looks.length} scenery description(s)`);

  for (const key of looks) {
    const [x, y] = key.split(':')[1].split(',').map(Number);
    await h.faceAndTalk(x, y);
    if (!(await h.page.evaluate(() => window.__CTDLG.active))) h.fail(`LOOK: ${id} ${key} showed nothing`);
    else h.cover(`look: ${id} ${key}`);
    await h.clearDialogue();
    await h.page.evaluate(() => { window.__CTDLG.close && window.__CTDLG.close(); window.__CT.lock = 0; });
    await h.wait(100);
  }
}

/* ------------------------------------------------------------------ */
/* 3. the tile interactions                                            */
/* ------------------------------------------------------------------ */
await h.freshStart(ALL_FLAGS);
await h.page.evaluate(() => { window.__CTDBG.goto('square', 12, 10, 'up'); window.__CT.lock = 0; });
await h.wait(400);
await h.faceAndTalk(12, 9);                       // Leene's Bell sits on 'L' tiles
if (await h.page.evaluate(() => window.__CTDLG.active)) h.cover("tile: Leene's Bell rings");
else h.fail("TILE: Leene's Bell said nothing");
await h.clearDialogue();

await h.freshStart(flagsFor('telepod'));
await h.page.evaluate(() => { window.__CTDBG.goto('telepod', 5, 8, 'up'); window.__CT.lock = 0; });
await h.wait(400);
await h.faceAndTalk(5, 7);
if (await h.page.evaluate(() => window.__CTDLG.active)) h.cover('tile: telepod pad before the gate opens');
else h.fail('TILE: the telepod pad said nothing before the gate opened');
await h.clearDialogue();

// the gate, torn open but with no pendant in hand
await h.freshStart([...ALL_FLAGS, 'telepodStarted', 'telepodDone', 'gateOpen', 'marleVanished']);
await h.page.evaluate(() => { window.__CTDBG.goto('telepod', 5, 8, 'up'); window.__CT.lock = 0; });
await h.wait(400);
await h.faceAndTalk(5, 7);
await h.wait(500);
if ((await h.state()).scene === 'end') h.fail('GATE: entered without the pendant');
else h.cover('gate: refuses to open without the pendant');
await h.clearDialogue();

/* ------------------------------------------------------------------ */
/* 4. Mom, before and after the allowance                              */
/* ------------------------------------------------------------------ */
await h.freshStart();
await h.page.evaluate(() => { window.__CTDBG.goto('house', 4, 9, 'up'); window.__CT.lock = 0; });
await h.wait(400);
await h.faceAndTalk(4, 7);
const paid = await h.settle();
if (paid.gold !== 200) h.fail(`MOM: the first talk paid ${paid.gold}, expected 200`);
else h.cover('mom: the first talk hands over 200 G');
await h.faceAndTalk(4, 7);
const again = await h.settle();
if (again.gold !== 200) h.fail(`MOM: talking again changed the purse to ${again.gold}`);
else h.cover('mom: talking again does not pay twice');

/* ------------------------------------------------------------------ */
/* 5. scripted walks resolve from any starting offset                  */
/* ------------------------------------------------------------------ */
// Cutscenes await these paths. A residual too small to step but too large to
// count as arrival used to satisfy neither test, so the path never resolved and
// the scene hung with input locked — the walk into the gate could softlock.
await h.freshStart();
for (const [ox, oy] of [[1, 1], [1, 0], [0, 1], [3, 3], [0.6, 0.6], [7, 2]]) {
  const r = await h.page.evaluate(async ([ox, oy]) => {
    const pl = window.__CT.player;
    pl.path = null;
    pl.x = 80 + ox; pl.y = 88 + oy; pl.pathSpeed = 40;
    let done = false;
    pl.path = { x: 80, y: 88, res: () => { done = true; } };
    await new Promise(res => setTimeout(res, 1500));
    return { done, x: Math.round(pl.x), y: Math.round(pl.y) };
  }, [ox, oy]);
  if (!r.done) h.fail(`PATH: a scripted walk from +${ox},${oy} never arrived (stopped at ${r.x},${r.y})`);
}
h.cover('paths: scripted walks arrive from off-grid offsets');

/* ------------------------------------------------------------------ */
/* 6. every exit fires                                                 */
/* ------------------------------------------------------------------ */
await h.freshStart(ALL_FLAGS);
for (const id of MAPS) {
  const exits = await h.page.evaluate(m => {
    window.__CTDBG.goto(m, 2, 2, 'down');
    return window.__CT.map.exits.map(e => ({ x: e.x, y: e.y, to: e.to }));
  }, id);
  for (const ex of exits) {
    await h.page.evaluate(m => { window.__CTDBG.goto(m, 2, 2, 'down'); window.__CT.lock = 0; }, id);
    await h.wait(350);
    // step onto the exit tile; loadMap only suppresses the tile it arrived on
    await h.page.evaluate(([x, y]) => {
      const S = window.__CT;
      S.player.x = x * 16; S.player.y = y * 16 - 8; S.lock = 0;
    }, [ex.x, ex.y]);
    if (await h.waitFor(s => s.map === ex.to, `EXIT: ${id} ${ex.x},${ex.y} -> ${ex.to}`, 6000)) {
      h.cover(`exit: ${id} ${ex.x},${ex.y} -> ${ex.to}`);
    }
    await h.wait(200);
  }
}

/* ------------------------------------------------------------------ */
/* 7. the status menu                                                  */
/* ------------------------------------------------------------------ */
await h.freshStart(ALL_FLAGS);
await h.page.evaluate(() => { window.__CTDBG.goto('world', 5, 8, 'down'); window.__CT.lock = 0; });
await h.wait(300);
await h.press('KeyC');
await h.wait(300);
if (!(await h.state()).menu) h.fail('MENU: C did not open the status menu');
else h.cover('menu: opens');
await h.press('KeyC');
await h.wait(300);
if ((await h.state()).menu) h.fail('MENU: C did not close the status menu');
else h.cover('menu: closes');
await h.press('KeyC');
await h.wait(250);
await h.press('KeyX');
await h.wait(300);
if ((await h.state()).menu) h.fail('MENU: B did not close the status menu');
else h.cover('menu: closes with B');

/* ------------------------------------------------------------------ */
/* 8. the page chrome                                                  */
/* ------------------------------------------------------------------ */
await h.freshStart();
const sound = await h.page.evaluate(async () => {
  const btn = document.getElementById('btn-sound');
  const before = btn.textContent;
  btn.click();
  await new Promise(r => setTimeout(r, 200));
  const after = btn.textContent;
  btn.click();
  await new Promise(r => setTimeout(r, 200));
  return { before, after, restored: btn.textContent };
});
if (sound.before === sound.after) h.fail('CHROME: the sound button did not change state');
else h.cover('chrome: the sound button mutes and unmutes');
if (sound.before !== sound.restored) h.fail('CHROME: the sound button did not toggle back');
if (!(await h.page.evaluate(() => !!document.getElementById('btn-full')))) {
  h.fail('CHROME: the fullscreen button is missing');
} else h.cover('chrome: the fullscreen button is present');

/* ------------------------------------------------------------------ */
/* 9. the game still runs on the built-in art                          */
/* ------------------------------------------------------------------ */
await h.freshStart([], '?noassets=1');
const builtIn = await h.page.evaluate(async () => {
  const pix = await import('./js/pix.js');
  const c = pix.charFrame('crono', 'down', 0);
  const t = pix.tileCanvas('.', 0);
  return { char: !!c && c.width === 16 && c.height === 24, tile: !!t && t.width === 16 };
});
if (!builtIn.char || !builtIn.tile) h.fail('NOASSETS: the built-in art did not draw');
else h.cover('art: ?noassets=1 falls back to the drawn art');
if ((await h.state()).scene !== 'field') h.fail('NOASSETS: the chapter did not start on the drawn art');
else h.cover('art: the chapter starts on the drawn art');

/* ------------------------------------------------------------------ */
/* 10. the ending returns to the title and a new run starts clean      */
/* ------------------------------------------------------------------ */
await h.freshStart([...ALL_FLAGS, 'telepodStarted', 'telepodDone', 'gateOpen',
                    'marleVanished', 'gotPendant']);
await h.page.evaluate(() => { window.__CTDBG.goto('telepod', 5, 8, 'up'); window.__CT.lock = 0; });
await h.wait(400);
await h.faceAndTalk(5, 7);
await h.answerChoice(1, 'gate prompt (Not yet)');
await h.wait(400);
if ((await h.state()).scene === 'end') h.fail('GATE: declining still ended the chapter');
else h.cover('gate: declining leaves the chapter running');
await h.clearDialogue();
await h.page.evaluate(() => { window.__CT.lock = 0; });

await h.faceAndTalk(5, 7);
await h.answerChoice(0, 'gate prompt (Enter)');
if (await h.waitFor(s => s.scene === 'end', 'GATE: entering did not end the chapter', 30000)) {
  h.cover('gate: entering ends the chapter');
  await h.wait(3000);                    // the ending fades in before it takes input
  let title = false;
  for (let i = 0; i < 12 && !title; i++) {
    await h.press('KeyZ');
    await h.wait(600);
    title = (await h.state()).scene === 'title';
  }
  if (!title) h.fail(`ENDING: A did not return to the title — ${JSON.stringify(await h.state())}`);
  else {
    h.cover('ending: A returns to the title');
    await h.press('KeyZ');
    if (await h.waitFor(s => s.scene === 'field' && s.map === 'room', 'RESTART: could not start again', 10000)) {
      const fresh = await h.state();
      if (fresh.gold !== 0) h.fail(`RESTART: gold carried over (${fresh.gold})`);
      if (fresh.silver !== 0) h.fail(`RESTART: silver carried over (${fresh.silver})`);
      const stale = Object.keys(fresh.flags).filter(k => k !== 'wokeUp');
      if (stale.length) h.fail(`RESTART: story flags carried over: ${stale.join(', ')}`);
      if (fresh.items.tonic !== 3) h.fail(`RESTART: tonics not reset (${fresh.items.tonic})`);
      if (!stale.length && fresh.gold === 0) h.cover('restart: a second run starts clean');
    }
  }
}

await h.close();
process.exit(h.report('EDGE CASES'));
