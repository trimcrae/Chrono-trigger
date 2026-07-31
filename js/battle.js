// battle.js — a compact ATB battle, used for the Gato exhibition match at the Fair.

import { charFrame, prop, tileCanvas } from './pix.js';
import { keys, tap } from './input.js';
import { sfx, playSong } from './audio.js';
import { VW, VH, FONT } from './ui.js';

const COMMANDS = ['Attack', 'Tech', 'Item', 'Run'];

export class Battle {
  constructor(party, enemy, opts = {}) {
    this.party = party.map((p, i) => ({
      ...p,
      atb: i === 0 ? 0.35 : 0.1,
      x: 168 + i * 22, y: 116 + i * 26,
      hx: 0, flash: 0, anim: 0,
    }));
    this.enemy = { ...enemy, flash: 0, anim: 0, atb: 0 };
    this.pops = [];
    this.log = opts.intro || '';
    this.logT = 2.2;
    this.menu = null;       // {member, index, mode:'cmd'|'tech'|'item', sub:0}
    this.state = 'fight';   // fight | won | lost | fled | done
    this.t = 0;
    this.endT = 0;
    this.result = null;
    this.shake = 0;
    this.busy = 0;          // freeze ATB during an action animation
    this.done = new Promise(res => { this._res = res; });
  }

  say(msg, dur = 2.2) { this.log = msg; this.logT = dur; }

  pop(x, y, text, color) { this.pops.push({ x, y, text, color, t: 0 }); }

  aliveParty() { return this.party.filter(p => p.hp > 0); }

  update(dt) {
    this.t += dt;
    this.logT -= dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.busy = Math.max(0, this.busy - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 1.1);
    for (const m of this.party) { m.flash = Math.max(0, m.flash - dt * 4); m.anim = Math.max(0, m.anim - dt * 2.6); }
    this.enemy.flash = Math.max(0, this.enemy.flash - dt * 4);
    this.enemy.anim = Math.max(0, this.enemy.anim - dt * 2.6);

    if (this.state !== 'fight') {
      this.endT -= dt;
      if (this.endT <= 0 && this._res) { const r = this._res; this._res = null; r(this.result); }
      return;
    }

    if (this.menu) { this.updateMenu(dt); return; }
    if (this.busy > 0) return;

    // ATB
    for (const m of this.party) {
      if (m.hp <= 0) continue;
      m.atb = Math.min(1, m.atb + dt / m.tick);
      if (m.atb >= 1 && !this.menu) this.menu = { member: m, index: 0, mode: 'cmd', sub: 0 };
    }
    if (this.enemy.hp > 0) {
      this.enemy.atb += dt / this.enemy.tick;
      if (this.enemy.atb >= 1) { this.enemy.atb = 0; this.enemyTurn(); }
    }
  }

  updateMenu(dt) {
    const m = this.menu;
    const list = m.mode === 'cmd' ? COMMANDS
      : m.mode === 'tech' ? [m.member.tech.name + '  ' + m.member.tech.mp + 'MP', 'Back']
        : ['Tonic  x' + this.items.tonic, 'Back'];
    if (this.repeat === undefined) this.repeat = 0;
    this.repeat -= dt;
    if (this.repeat <= 0) {
      if (keys.down) { m.index = (m.index + 1) % list.length; sfx('blip'); this.repeat = 0.16; }
      else if (keys.up) { m.index = (m.index - 1 + list.length) % list.length; sfx('blip'); this.repeat = 0.16; }
    }
    if (tap('b')) {
      if (m.mode !== 'cmd') { m.mode = 'cmd'; m.index = 0; sfx('cancel'); }
      return;
    }
    if (!tap('a')) return;
    sfx('confirm');
    if (m.mode === 'cmd') {
      const cmd = COMMANDS[m.index];
      if (cmd === 'Attack') { this.menu = null; this.attack(m.member); }
      else if (cmd === 'Tech') { m.mode = 'tech'; m.index = 0; }
      else if (cmd === 'Item') { m.mode = 'item'; m.index = 0; }
      else if (cmd === 'Run') {
        this.menu = null;
        this.state = 'fled'; this.result = 'fled'; this.endT = 1.2;
        this.say('Got away safely!', 2);
      }
    } else if (m.mode === 'tech') {
      if (m.index === 1) { m.mode = 'cmd'; m.index = 0; return; }
      if (m.member.mp < m.member.tech.mp) { this.say('Not enough MP!', 1.4); return; }
      this.menu = null;
      this.useTech(m.member);
    } else {
      if (m.index === 1 || this.items.tonic <= 0) { m.mode = 'cmd'; m.index = 0; return; }
      this.items.tonic--;
      this.menu = null;
      const target = this.aliveParty().reduce((a, b) => (a.hp / a.maxhp < b.hp / b.maxhp ? a : b));
      target.hp = Math.min(target.maxhp, target.hp + 30);
      this.pop(target.x, target.y, '+30', '#70f088');
      sfx('item');
      this.say(m.member.name + ' used a Tonic!', 1.6);
      m.member.atb = 0;
      this.busy = 0.6;
    }
  }

  attack(m) {
    m.atb = 0;
    m.anim = 1;
    this.busy = 0.75;
    sfx('slash');
    const crit = Math.random() < 0.12;
    const dmg = Math.round((m.atk + Math.random() * 6) * (crit ? 2 : 1));
    this.hurtEnemy(dmg, crit);
    this.say(m.name + (crit ? ' — CRITICAL!' : ' attacks!'), 1.4);
  }

  useTech(m) {
    m.atb = 0; m.mp -= m.tech.mp; m.anim = 1;
    this.busy = 1.0;
    if (m.tech.heal) {
      const target = this.aliveParty().reduce((a, b) => (a.hp / a.maxhp < b.hp / b.maxhp ? a : b));
      target.hp = Math.min(target.maxhp, target.hp + m.tech.heal);
      this.pop(target.x, target.y, '+' + m.tech.heal, '#70f088');
      sfx('item');
    } else {
      sfx('zap');
      this.shake = 1;
      this.hurtEnemy(m.tech.dmg + Math.round(Math.random() * 8), false);
    }
    this.say(m.name + ' used ' + m.tech.name + '!', 1.6);
  }

  hurtEnemy(dmg, crit) {
    this.enemy.hp -= dmg;
    this.enemy.flash = 1;
    this.enemy.anim = 1;
    this.shake = Math.max(this.shake, crit ? 1 : 0.6);
    this.pop(this.enemy.x + 16, this.enemy.y, String(dmg), crit ? '#ffd040' : '#ffffff');
    sfx('hit');
    if (this.enemy.hp <= 0) {
      this.enemy.hp = 0;
      this.state = 'won';
      this.result = 'won';
      this.endT = 3.2;
      this.menu = null;
      this.say(this.enemy.defeatMsg || 'Victory!', 3.2);
      sfx('win');
    }
  }

  enemyTurn() {
    if (this.state !== 'fight') return;
    const alive = this.aliveParty();
    if (!alive.length) return;
    // Gato likes to sing more than he likes to fight
    if (Math.random() < 0.34 && this.enemy.songs) {
      this.enemy.anim = 1;
      this.say(this.enemy.songs[(Math.random() * this.enemy.songs.length) | 0], 2.4);
      sfx('blip');
      return;
    }
    const t = alive[(Math.random() * alive.length) | 0];
    const dmg = Math.max(1, Math.round(this.enemy.atk + Math.random() * 5));
    t.hp = Math.max(0, t.hp - dmg);
    t.flash = 1;
    this.enemy.anim = 1;
    this.pop(t.x, t.y - 6, String(dmg), '#ff8080');
    sfx('hit');
    this.shake = 0.5;
    this.say(this.enemy.name + "'s " + (this.enemy.attackName || 'attack') + '!', 1.6);
    if (!this.aliveParty().length) {
      this.state = 'lost'; this.result = 'lost'; this.endT = 3.2;
      this.say(this.enemy.loseMsg || 'You were beaten...', 3.2);
    }
  }

  /* ---------------- rendering ---------------- */

  draw(g) {
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 4 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 3 : 0;
    g.save();
    g.translate(sx, sy);

    // fairground floor
    for (let y = 0; y < VH / 16 + 1; y++)
      for (let x = 0; x < VW / 16 + 1; x++)
        g.drawImage(tileCanvas(y < 4 ? '.' : 'P', x + y * 7), x * 16, y * 16);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, VW, 64);
    // spectators along the back
    for (let i = 0; i < 8; i++) {
      const nm = ['villager1', 'villager2', 'villager3', 'kid', 'guard'][i % 5];
      const bob = Math.sin(this.t * 3 + i) > 0 ? 0 : 1;
      g.drawImage(charFrame(nm, 'down', 0), 8 + i * 31, 26 + bob);
    }

    // enemy
    const e = this.enemy;
    const img = prop(e.sprite);
    const ex = e.x + (e.anim > 0 ? Math.sin(e.anim * 12) * 3 : 0);
    const ey = e.y - img.height + 16 + Math.sin(this.t * 2) * 1.5;
    if (this.state === 'won') {
      g.save();
      g.globalAlpha = Math.max(0, this.endT / 3.2);
      g.drawImage(img, ex, ey);
      g.restore();
    } else {
      g.drawImage(img, ex, ey);
      if (e.flash > 0) {
        g.save();
        g.globalAlpha = e.flash * 0.8;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(img, ex, ey);
        g.restore();
      }
    }

    // party
    for (const m of this.party) {
      const lunge = m.anim > 0 ? Math.sin(Math.min(1, m.anim) * Math.PI) * 26 : 0;
      const px = m.x - lunge;
      const walk = m.hp > 0 ? (Math.sin(this.t * 5 + m.x) > 0 ? 0 : 2) : 0;
      const py = m.y - 24;
      g.save();
      if (m.hp <= 0) { g.globalAlpha = 0.5; }
      g.drawImage(charFrame(m.char, 'left', walk), px, py);
      if (m.flash > 0) {
        g.globalAlpha = m.flash * 0.7;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(charFrame(m.char, 'left', walk), px, py);
      }
      g.restore();
      if (m.anim > 0 && !m.tech.heal) {
        g.save();
        g.globalAlpha = m.anim * 0.9;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(px - 6, py + 12, 16, -0.9, 0.9);
        g.stroke();
        g.restore();
      }
    }
    g.restore();
  }

  drawUI(g) {
    // damage / heal numbers
    for (const p of this.pops) {
      g.save();
      g.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      g.font = `bold 11px ${FONT}`;
      g.textAlign = 'center';
      g.fillStyle = '#000';
      g.fillText(p.text, p.x + 1, p.y - p.t * 22 + 1);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y - p.t * 22);
      g.restore();
    }
    g.textAlign = 'left';
    g.textBaseline = 'top';

    // enemy HP bar
    const e = this.enemy;
    if (this.state === 'fight') {
      g.fillStyle = 'rgba(8,16,48,0.8)';
      g.fillRect(8, 8, 92, 20);
      g.strokeStyle = '#fff'; g.lineWidth = 1;
      g.strokeRect(8.5, 8.5, 91, 19);
      g.font = `8px ${FONT}`;
      g.fillStyle = '#fff';
      g.fillText(e.name, 13, 11);
      g.fillStyle = '#402020';
      g.fillRect(13, 21, 82, 4);
      g.fillStyle = '#e04040';
      g.fillRect(13, 21, 82 * Math.max(0, e.hp / e.maxhp), 4);
    }

    // party status panel
    const px0 = VW - 104, py0 = 8;
    g.fillStyle = 'rgba(8,16,48,0.8)';
    g.fillRect(px0, py0, 96, 14 + this.party.length * 20);
    g.strokeStyle = '#fff';
    g.strokeRect(px0 + 0.5, py0 + 0.5, 95, 13 + this.party.length * 20);
    this.party.forEach((m, i) => {
      const y = py0 + 6 + i * 20;
      g.font = `7px ${FONT}`;
      g.fillStyle = m.hp > 0 ? '#fff' : '#ff8080';
      g.fillText(m.name, px0 + 5, y);
      g.fillStyle = '#ffe070';
      g.fillText(m.hp + '/' + m.maxhp + '  MP ' + m.mp, px0 + 44, y);
      // ATB gauge
      g.fillStyle = '#203050';
      g.fillRect(px0 + 5, y + 11, 86, 3);
      g.fillStyle = m.atb >= 1 ? '#ffe070' : '#60c8f0';
      g.fillRect(px0 + 5, y + 11, 86 * m.atb, 3);
    });

    // command menu
    if (this.menu) {
      const m = this.menu;
      const list = m.mode === 'cmd' ? COMMANDS
        : m.mode === 'tech' ? [m.member.tech.name + '  ' + m.member.tech.mp + 'MP', 'Back']
          : ['Tonic x' + this.items.tonic, 'Back'];
      const w = 92, h = 12 + list.length * 12;
      const x = 10, y = VH - h - 34;
      g.fillStyle = 'rgba(16,32,96,0.92)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#fff';
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.font = `8px ${FONT}`;
      list.forEach((c, i) => {
        g.fillStyle = i === m.index ? '#ffe070' : '#ffffff';
        g.fillText((i === m.index ? '▶' : ' ') + c, x + 6, y + 7 + i * 12);
      });
      g.fillStyle = '#a0d8ff';
      g.fillText(m.member.name, x + 6, y - 11);
    }

    // message line
    if (this.logT > 0 && this.log) {
      g.font = `9px ${FONT}`;
      const w = g.measureText(this.log).width + 20;
      const x = VW / 2 - w / 2, y = VH - 26;
      g.fillStyle = 'rgba(8,16,48,0.9)';
      g.fillRect(x, y, w, 18);
      g.strokeStyle = '#fff';
      g.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.fillText(this.log, x + 10, y + 10);
      g.textBaseline = 'top';
    }
  }
}

export function makeGatoBattle(hasMarle, items) {
  const party = [{
    name: 'Crono', char: 'crono', hp: 70, maxhp: 70, mp: 10, maxmp: 10,
    atk: 11, tick: 3.2, tech: { name: 'Cyclone', mp: 2, dmg: 22 },
  }];
  if (hasMarle) party.push({
    name: 'Marle', char: 'marle', hp: 60, maxhp: 60, mp: 12, maxmp: 12,
    atk: 8, tick: 3.6, tech: { name: 'Aura', mp: 1, heal: 28 },
  });
  const b = new Battle(party, {
    name: 'Gato', sprite: 'gato', hp: 78, maxhp: 78, atk: 6, tick: 4.4,
    x: 58, y: 148, attackName: 'Robo Punch',
    songs: [
      '♪ I am Gato, I have metal joints! ♪',
      '♪ Beat me up and win 15 silver points! ♪',
      '♪ My name is Gato, I love to sing! ♪',
    ],
    defeatMsg: 'Gato powers down with a whirr!',
    loseMsg: 'Gato: You lose! Try again, pal!',
  }, { intro: 'Gato steps into the ring!' });
  b.items = items;
  playSong('battle');
  return b;
}
