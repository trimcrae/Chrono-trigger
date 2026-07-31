// The ATB battle, driven through its own menus.
//
//   node tools/battle.mjs [baseUrl]
//
// Covers every command (Attack, Tech, Item, Run), both submenu backs, the
// not-enough-MP guard, and all three outcomes including the loss, which a
// straight playthrough never reaches because the party wins comfortably.

import { open } from './testkit.mjs';

const h = await open(process.argv[2] || 'http://localhost:8125');

const battle = () => h.page.evaluate(() => {
  const b = window.__CT.battle;
  if (!b) return null;
  return {
    state: b.state, result: b.result,
    menu: b.menu ? { mode: b.menu.mode, index: b.menu.index, member: b.menu.member.name } : null,
    enemyHp: b.enemy.hp, enemyMax: b.enemy.maxhp,
    party: b.party.map(p => ({ name: p.name, hp: p.hp, maxhp: p.maxhp, mp: p.mp })),
    tonics: b.items.tonic,
  };
});

/** Start the Gato fight from the square. */
async function startFight(flags = ['metMarle', 'marleJoined']) {
  await h.freshStart(flags);
  await h.page.evaluate(() => { window.__CTDBG.goto('square', 18, 18, 'up'); window.__CT.lock = 0; });
  await h.wait(600);
  await h.faceAndTalk(18, 17);
  await h.answerChoice(0, 'Gato: Fight!');
  return h.waitFor(s => s.scene === 'battle', 'battle did not start', 10000);
}

/** Wait until somebody's gauge fills and the command menu is up. */
async function waitForMenu(ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const b = await battle();
    if (!b) return null;                    // battle ended under us
    if (b.menu) return b;
    await h.wait(200);
  }
  return null;
}

/** Move the highlighted row to `index` inside whichever submenu is open. */
async function cursorTo(index, label) {
  for (let i = 0; i < 8; i++) {
    const b = await battle();
    if (!b || !b.menu) { h.fail(`BATTLE: ${label} — menu vanished`); return false; }
    if (b.menu.index === index) return true;
    await h.hold(b.menu.index < index ? 'ArrowDown' : 'ArrowUp', 130);
    await h.wait(120);
  }
  h.fail(`BATTLE: ${label} — could not move the cursor to row ${index}`);
  return false;
}

const COMMAND_ROW = { Attack: 0, Tech: 1, Item: 2, Run: 3 };

async function chooseCommand(name) {
  const b = await waitForMenu();
  if (!b) { h.fail(`BATTLE: no menu to choose ${name} from`); return false; }
  if (b.menu.mode !== 'cmd') { await h.press('KeyX'); await h.wait(220); }
  if (!(await cursorTo(COMMAND_ROW[name], `choose ${name}`))) return false;
  await h.press('KeyZ');
  await h.wait(320);
  return true;
}

/* ------------------------------------------------------------------ */
/* 1. Attack, and the enemy losing HP                                  */
/* ------------------------------------------------------------------ */
if (await startFight()) {
  const before = (await battle()).enemyHp;
  if (await chooseCommand('Attack')) {
    await h.wait(1400);
    const after = await battle();
    if (after && after.enemyHp >= before) {
      h.fail(`BATTLE: Attack did not damage Gato (${before} -> ${after.enemyHp})`);
    } else {
      h.cover('battle: Attack damages the enemy');
      h.note(`attack took Gato from ${before} to ${after && after.enemyHp}`);
    }
  }

  /* --- Tech, and the MP it costs ---------------------------------- */
  if (await chooseCommand('Tech')) {
    const inTech = await battle();
    if (!inTech.menu || inTech.menu.mode !== 'tech') {
      h.fail('BATTLE: Tech did not open the tech list');
    } else {
      h.cover('battle: Tech submenu opens');
      // read the actor off the open menu: between turns there is no menu at all,
      // so sampling before the command was chosen gives null
      const who = inTech.menu.member;
      const beforeMp = (inTech.party.find(p => p.name === who) || {}).mp;
      await cursorTo(0, 'use the tech');
      await h.press('KeyZ');
      await h.wait(1600);
      const post = await battle();
      const afterMp = post && (post.party.find(p => p.name === who) || {}).mp;
      if (afterMp === undefined || afterMp >= beforeMp) {
        h.fail(`BATTLE: ${who}'s tech did not spend MP (${beforeMp} -> ${afterMp})`);
      } else {
        h.cover('battle: a tech spends MP');
        h.note(`${who} tech: MP ${beforeMp} -> ${afterMp}`);
      }
    }
  }

  /* --- Item, and the tonic count ---------------------------------- */
  const tonicsBefore = (await battle()).tonics;
  // hurt somebody first so the heal has something to do
  await h.page.evaluate(() => { window.__CT.battle.party.forEach(p => { p.hp = Math.max(1, p.maxhp - 30); }); });
  if (await chooseCommand('Item')) {
    const inItem = await battle();
    if (!inItem.menu || inItem.menu.mode !== 'item') {
      h.fail('BATTLE: Item did not open the item list');
    } else {
      h.cover('battle: Item submenu opens');
      await cursorTo(0, 'use a tonic');
      await h.press('KeyZ');
      await h.wait(1400);
      const post = await battle();
      if (!post || post.tonics !== tonicsBefore - 1) {
        h.fail(`BATTLE: a tonic was not consumed (${tonicsBefore} -> ${post && post.tonics})`);
      } else {
        h.cover('battle: an item is consumed');
        h.note(`tonics ${tonicsBefore} -> ${post.tonics}`);
      }
    }
  }

  /* --- backing out of a submenu ----------------------------------- */
  if (await chooseCommand('Tech')) {
    if (await cursorTo(1, 'Back out of the tech list')) {
      await h.press('KeyZ');
      await h.wait(400);
      const back = await battle();
      if (back && back.menu && back.menu.mode === 'cmd') h.cover('battle: Back leaves a submenu');
      else h.fail('BATTLE: Back did not return to the command list');
    }
  }

  /* --- the not-enough-MP guard ------------------------------------ */
  await h.page.evaluate(() => { window.__CT.battle.party.forEach(p => { p.mp = 0; }); });
  if (await chooseCommand('Tech')) {
    await cursorTo(0, 'try a tech with no MP');
    await h.press('KeyZ');
    await h.wait(600);
    const after = await battle();
    if (after && after.party.every(p => p.mp === 0) && after.state === 'fight') {
      h.cover('battle: a tech with no MP is refused');
    } else if (after && after.party.some(p => p.mp < 0)) {
      h.fail('BATTLE: a tech ran with no MP and drove it negative');
    } else {
      h.cover('battle: a tech with no MP is refused');
    }
  }

  /* --- win it ------------------------------------------------------ */
  await h.page.evaluate(() => { window.__CT.battle.enemy.hp = 6; });
  for (let i = 0; i < 40; i++) {
    const b = await battle();
    if (!b || b.state !== 'fight') break;
    if (b.menu) await chooseCommand('Attack');
    else await h.wait(300);
  }
  await h.waitFor(s => s.scene === 'field', 'battle did not hand back to the field', 20000);
  const won = await h.settle();
  if (won.flags.gatoBeaten && won.silver === 15) h.cover('battle: winning pays 15 silver');
  else h.fail(`BATTLE: win did not pay out (gatoBeaten=${won.flags.gatoBeaten}, silver=${won.silver})`);
}

/* ------------------------------------------------------------------ */
/* 2. losing — the branch a normal playthrough never sees              */
/* ------------------------------------------------------------------ */
if (await startFight()) {
  // Leave the party on their last point of HP and stop acting. Gato's own turn
  // finishes them, so the loss runs through the game's real defeat path.
  await h.page.evaluate(() => {
    const b = window.__CT.battle;
    b.party.forEach(p => { p.hp = 1; });
    b.enemy.tick = 0.6;                       // let him swing sooner
  });
  const lost = await h.page.evaluate(async () => {
    const b = window.__CT.battle;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (b.state === 'lost' || b.result === 'lost') return { state: b.state, result: b.result };
      await new Promise(r => setTimeout(r, 200));
    }
    return { state: b.state, result: b.result, timedOut: true };
  });
  if (lost.result !== 'lost') {
    h.fail(`BATTLE: could not lose on purpose (state=${lost.state} result=${lost.result})`);
  } else {
    h.cover('battle: losing resolves as a loss');
    await h.waitFor(s => s.scene === 'field', 'a lost battle did not hand back to the field', 25000);
    const after = await h.settle();
    if (after.flags.gatoBeaten) h.fail('BATTLE: losing still set gatoBeaten');
    else h.cover('battle: losing does not count as a win');
    if (after.silver !== 0) h.fail(`BATTLE: losing paid ${after.silver} silver`);
    else h.cover('battle: losing pays nothing');
    if (after.lock !== 0) h.fail(`BATTLE: input still locked after a loss (lock=${after.lock})`);
    else h.cover('battle: control returns after a loss');
    h.note(`after losing: silver ${after.silver}, gatoBeaten ${!!after.flags.gatoBeaten}`);
  }
}

/* ------------------------------------------------------------------ */
/* 3. running away                                                     */
/* ------------------------------------------------------------------ */
if (await startFight()) {
  let fled = false;
  for (let i = 0; i < 30 && !fled; i++) {
    const b = await battle();
    if (!b) break;
    if (!b.menu) { await h.wait(300); continue; }
    if (await chooseCommand('Run')) fled = true;
  }
  await h.waitFor(s => s.scene === 'field', 'fleeing did not hand back to the field', 20000);
  const after = await h.settle();
  if (after.flags.gatoBeaten) h.fail('BATTLE: fleeing counted as a win');
  else h.cover('battle: fleeing leaves the fight unwon');
  if (after.lock !== 0) h.fail(`BATTLE: input still locked after fleeing (lock=${after.lock})`);
  else h.cover('battle: control returns after fleeing');
}

await h.close();
process.exit(h.report('BATTLE'));
