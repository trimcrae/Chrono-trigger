// Shared plumbing for the browser tests.
//
// Everything here drives the game the way a player does — real key events, real
// dialogue boxes — and reads state through the __CT / __CTDLG / __CTDBG handles
// that js/game.js exposes. The only liberties taken are setting story flags and
// jumping between maps, so a check does not need a five minute walk to reach the
// state it is about.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

// This container ships a Chromium at a fixed path; a CI runner uses the one
// playwright installs. Prefer an explicit override, then the local build, then
// whatever playwright resolves by itself.
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
export const launchOpts = process.env.PLAYWRIGHT_CHROMIUM
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
  : existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {};

export async function open(base, viewport = { width: 512, height: 448 }) {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport });
  const problems = [];
  const notes = [];
  const covered = [];
  page.on('pageerror', e => problems.push(`PAGE ERROR: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') problems.push(`CONSOLE ERROR: ${m.text()}`);
  });
  return new Harness(browser, page, base, problems, notes, covered);
}

class Harness {
  constructor(browser, page, base, problems, notes, covered) {
    Object.assign(this, { browser, page, base, problems, notes, covered });
  }

  wait(ms) { return this.page.waitForTimeout(ms); }

  fail(msg) { this.problems.push(msg); }
  note(msg) { this.notes.push(msg); }
  /** Record that a named branch of the game was actually exercised. */
  cover(what) { if (!this.covered.includes(what)) this.covered.push(what); }

  state() {
    return this.page.evaluate(() => {
      const S = window.__CT, dlg = window.__CTDLG;
      if (!S) return null;
      return {
        scene: S.scene, map: S.map && S.map.id, lock: S.lock, menu: S.menu,
        dlg: !!dlg.active, flags: { ...S.flags }, gold: S.gold, silver: S.silver,
        items: { ...S.items }, tileX: S.player && S.player.tileX,
        tileY: S.player && S.player.tileY,
      };
    });
  }

  async hold(key, ms) {
    await this.page.keyboard.down(key);
    await this.wait(ms);
    await this.page.keyboard.up(key);
    await this.wait(60);
  }

  press(key) { return this.page.keyboard.press(key); }

  /** Press A only while a box is open: a spare press re-triggers the field. */
  async clearDialogue(max = 25) {
    for (let i = 0; i < max; i++) {
      if (!(await this.page.evaluate(() => window.__CTDLG.active))) return true;
      await this.press('KeyZ');
      await this.wait(180);
    }
    return false;
  }

  /** A conversation is a chain of boxes with gaps; wait for the whole scene. */
  async settle(ms = 20000) {
    const deadline = Date.now() + ms;
    let calm = 0;
    while (Date.now() < deadline) {
      const s = await this.state();
      if (s.dlg) { await this.press('KeyZ'); await this.wait(180); calm = 0; continue; }
      calm = s.lock === 0 ? calm + 1 : 0;
      if (calm >= 4) return s;
      await this.wait(200);
    }
    return this.state();
  }

  async waitFor(pred, label, ms = 10000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const s = await this.state();
      if (s && pred(s)) return s;
      await this.wait(150);
    }
    this.fail(`${label} — state ${JSON.stringify(await this.state())}`);
    return null;
  }

  /**
   * Answer a choice box. Three separate things have to happen: the page has to
   * be fully revealed, the cursor moved with a *held* key because the menu reads
   * key state rather than taps, and only then a confirm. The typewriter is
   * finished directly rather than with an A press — an A landing on the frame
   * the text completes is taken as a confirm and silently picks the highlighted
   * option.
   */
  async answerChoice(index, label) {
    for (let i = 0; i < 30; i++) {
      if (await this.page.evaluate(() => window.__CTDLG.active)) break;
      await this.wait(150);
    }
    const shown = await this.page.evaluate(() => {
      const d = window.__CTDLG;
      if (!d.active) return null;
      d.shown = d.pageLen;
      return { choices: d.choices ? d.choices.length : 0 };
    });
    if (!shown) { this.fail(`CHOICE: ${label} — no prompt on screen`); return false; }
    if (!shown.choices) { this.fail(`CHOICE: ${label} — prompt has no choices`); return false; }
    await this.wait(120);

    for (let i = 0; i < 8; i++) {
      const at = await this.page.evaluate(() => window.__CTDLG.choiceIndex);
      if (at === index) break;
      const key = at < index ? 'ArrowDown' : 'ArrowUp';
      await this.hold(key, 140);
      await this.wait(120);
    }
    const at = await this.page.evaluate(() => window.__CTDLG.choiceIndex);
    if (at !== index) {
      this.fail(`CHOICE: ${label} — cursor stuck on ${at}, wanted ${index}`);
      return false;
    }
    await this.press('KeyZ');
    await this.wait(400);
    return true;
  }

  /**
   * Reload and clear the opening cutscene. Sections start fresh because scenes
   * are async and keep running after a forced jump, leaking half-finished state
   * into whatever check comes next.
   */
  async freshStart(flags = [], query = '') {
    await this.page.goto(`${this.base}/index.html${query}`, { waitUntil: 'networkidle' });
    await this.wait(900);
    await this.press('KeyZ');
    await this.wait(600);
    for (let i = 0; i < 60; i++) {
      const s = await this.state();
      if (s.lock === 0 && s.scene === 'field' && !s.dlg) break;
      await this.press('KeyZ');
      await this.wait(160);
    }
    if (flags.length) {
      await this.page.evaluate(fs => fs.forEach(f => window.__CTDBG.flag(f, true)), flags);
    }
  }

  /**
   * Stand next to a tile, face it, and interact.
   *
   * The side matters: standing on an exit tile teleports the player to another
   * map before the interaction happens, which silently moves every later check
   * to the wrong map. Sides that are exits, or off the grid, are skipped.
   */
  async faceAndTalk(tx, ty) {
    const placed = await this.page.evaluate(([x, y]) => {
      const S = window.__CT, m = S.map;
      const sides = [
        { dir: 'up', sx: x, sy: y + 1 },
        { dir: 'down', sx: x, sy: y - 1 },
        { dir: 'left', sx: x + 1, sy: y },
        { dir: 'right', sx: x - 1, sy: y },
      ];
      for (const s of sides) {
        if (s.sx < 0 || s.sy < 0 || s.sx >= m.w || s.sy >= m.h) continue;
        if (m.exits.some(e => e.x === s.sx && e.y === s.sy)) continue;
        S.player.x = s.sx * 16; S.player.y = s.sy * 16 - 8;
        S.player.dir = s.dir; S.lock = 0;
        return s.dir;
      }
      return null;
    }, [tx, ty]);
    if (!placed) { this.fail(`REACH: nowhere to stand beside ${tx},${ty}`); return false; }
    await this.wait(140);
    // interact() returns a promise that only settles when the conversation ends,
    // and page.evaluate awaits it, so it must be fired without being awaited.
    await this.page.evaluate(() => { window.__CTDBG.interact(); });
    await this.wait(320);
    return true;
  }

  /**
   * Talk to an NPC by id, reading its position at the moment of approach — most
   * of them wander, so a position sampled even a second earlier is stale.
   */
  async talkToNpc(id) {
    const at = await this.page.evaluate(npc => {
      const e = window.__CT.entities.find(x => x.id === npc);
      return e ? { x: e.tileX, y: e.tileY } : null;
    }, id);
    if (!at) { this.fail(`REACH: no npc '${id}' on this map`); return false; }
    return this.faceAndTalk(at.x, at.y);
  }

  report(title) {
    console.log(this.notes.join('\n'));
    if (this.covered.length) {
      console.log(`\ncovered (${this.covered.length}):`);
      for (const c of this.covered) console.log('  - ' + c);
    }
    console.log(`\n================ ${title} ================`);
    if (!this.problems.length) {
      console.log('clean — no errors, every path behaved');
      return 0;
    }
    console.log(`${this.problems.length} problem(s):`);
    for (const p of this.problems) console.log(' - ' + p);
    return 1;
  }

  close() { return this.browser.close(); }
}
