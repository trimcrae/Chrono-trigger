// ui.js — dialogue windows, choices and HUD, drawn on the high-res overlay canvas
// using the same 256x224 virtual coordinate space as the world canvas.

import { tap, keys } from './input.js';
import { sfx } from './audio.js';

export const VW = 256, VH = 224;
// No web fonts: the page must work offline / on GitHub Pages with zero requests.
export const FONT = '"Verdana", "DejaVu Sans", "Segoe UI", system-ui, sans-serif';

export class Dialogue {
  constructor() {
    this.active = false;
    this.pages = [];
    this.page = 0;
    this.shown = 0;
    this.name = '';
    this.choices = null;
    this.choiceIndex = 0;
    this.resolve = null;
    this.speed = 46; // chars per second
    this.holdRepeat = 0;
  }

  measure(g, text) {
    return g.measureText(text).width;
  }

  wrap(g, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if (w === '\n') { lines.push(line); line = ''; continue; }
      const t = line ? line + ' ' + w : w;
      if (this.measure(g, t) > maxW && line) { lines.push(line); line = w; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  // show(text, {name}) -> Promise
  show(g, text, opts = {}) {
    g.font = `9px ${FONT}`;
    const raw = String(text).split('\n');
    let lines = [];
    for (const r of raw) lines = lines.concat(this.wrap(g, r, VW - 40));
    this.pages = [];
    for (let i = 0; i < lines.length; i += 3) this.pages.push(lines.slice(i, i + 3));
    if (!this.pages.length) this.pages = [['']];
    this.page = 0;
    this.shown = 0;
    this.name = opts.name || '';
    this.choices = opts.choices || null;
    this.choiceIndex = 0;
    this.active = true;
    return new Promise(res => { this.resolve = res; });
  }

  get pageText() { return this.pages[this.page].join('\n'); }
  get pageLen() { return this.pages[this.page].join('').length + this.pages[this.page].length - 1; }

  update(dt) {
    if (!this.active) return;
    const full = this.shown >= this.pageLen;
    if (!full) {
      this.shown += this.speed * dt;
      if (tap('a') || tap('b')) this.shown = this.pageLen;
      return;
    }
    this.shown = this.pageLen;

    if (this.choices && this.page === this.pages.length - 1) {
      this.holdRepeat -= dt;
      const move = d => {
        this.choiceIndex = (this.choiceIndex + d + this.choices.length) % this.choices.length;
        sfx('blip');
        this.holdRepeat = 0.18;
      };
      if (this.holdRepeat <= 0) {
        if (keys.down) move(1);
        else if (keys.up) move(-1);
      }
      if (tap('a')) {
        sfx('confirm');
        this.close(this.choiceIndex);
      }
      return;
    }
    if (tap('a') || tap('b')) {
      if (this.page < this.pages.length - 1) { this.page++; this.shown = 0; sfx('blip'); }
      else { sfx('blip'); this.close(0); }
    }
  }

  close(v) {
    this.active = false;
    const r = this.resolve;
    this.resolve = null;
    if (r) r(v);
  }

  draw(g, t) {
    if (!this.active) return;
    const lines = this.pages[this.page];
    const onLastPage = this.page === this.pages.length - 1;
    const showChoices = !!this.choices && onLastPage;
    const nameH = this.name ? 13 : 0;
    // size the window to whatever it actually has to hold
    // three text lines are always reserved so the window doesn't jump between pages
    const boxH = 14 + nameH + 3 * 12 + (showChoices ? this.choices.length * 12 + 4 : 0);
    const x = 12, y = VH - boxH - 10, w = VW - 24, h = boxH;

    // CT-style window: deep blue gradient, white double border
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, 'rgba(24,48,132,0.95)');
    grd.addColorStop(1, 'rgba(8,20,72,0.95)');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    g.lineWidth = 1;
    g.strokeStyle = '#ffffff';
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.strokeStyle = 'rgba(120,180,255,0.9)';
    g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);

    g.textBaseline = 'top';
    let ty = y + 9;
    if (this.name) {
      g.font = `8px ${FONT}`;
      g.fillStyle = '#ffe070';
      g.fillText(this.name, x + 9, y + 5);
      ty = y + 18;
    }
    g.font = `9px ${FONT}`;
    g.fillStyle = '#ffffff';
    let budget = Math.floor(this.shown);
    for (const line of lines) {
      const n = Math.max(0, Math.min(line.length, budget));
      if (n > 0) g.fillText(line.slice(0, n), x + 9, ty);
      budget -= line.length + 1;
      ty += 12;
      if (budget <= 0) break;
    }

    if (showChoices && this.shown >= this.pageLen) {
      let cy = y + 9 + nameH + lines.length * 12 + 4;
      this.choices.forEach((c, i) => {
        g.fillStyle = i === this.choiceIndex ? '#ffe070' : '#ffffff';
        g.fillText((i === this.choiceIndex ? '▶ ' : '  ') + c, x + 16, cy);
        cy += 12;
      });
    } else if (this.shown >= this.pageLen) {
      g.fillStyle = '#ffe070';
      const bob = Math.sin(t * 6) > 0 ? 0 : 1;
      g.fillText('▼', x + w - 18, y + h - 14 + bob);
    }
  }
}

export function drawCaption(g, text, sub, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `12px ${FONT}`;
  g.fillStyle = '#ffffff';
  g.shadowColor = '#000'; g.shadowBlur = 6;
  g.fillText(text, VW / 2, VH / 2 - 8);
  if (sub) {
    g.font = `8px ${FONT}`;
    g.fillStyle = '#ffe070';
    g.fillText(sub, VW / 2, VH / 2 + 12);
  }
  g.restore();
  g.textAlign = 'left';
}

export function drawBanner(g, text, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.font = `8px ${FONT}`;
  const w = g.measureText(text).width + 16;
  g.fillStyle = 'rgba(8,20,72,0.85)';
  g.fillRect(VW / 2 - w / 2, 8, w, 16);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  g.strokeRect(VW / 2 - w / 2 + 0.5, 8.5, w - 1, 15);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, VW / 2, 17);
  g.restore();
  g.textAlign = 'left';
}
