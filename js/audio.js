// audio.js — tiny WebAudio chiptune engine (original tunes, SNES-ish square/tri voices)

let ctx = null, master = null, playing = null, timer = null, enabled = true;

const N = {}; // note name -> frequency
(() => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let o = 1; o <= 7; o++) {
    for (let i = 0; i < 12; i++) {
      N[names[i] + o] = 440 * Math.pow(2, (o - 4) + (i - 9) / 12);
    }
  }
})();

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function voice(freq, t, dur, type, gain, detune = 0) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.setValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(t, dur, gain) {
  const len = Math.max(1, (ctx.sampleRate * dur) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = gain;
  s.buffer = buf; s.connect(g); g.connect(master);
  s.start(t);
}

// --- songs: [note|null, beats] with a bass line; all original melodies ---
const SONGS = {
  home: {
    bpm: 96, wave: 'triangle',
    mel: [['E4', 1], ['G4', 1], ['B4', 2], ['A4', 1], ['G4', 1], ['E4', 2],
      ['D4', 1], ['E4', 1], ['G4', 2], ['F#4', 2], [null, 2],
      ['E4', 1], ['G4', 1], ['B4', 2], ['C5', 1], ['B4', 1], ['A4', 2],
      ['G4', 1], ['F#4', 1], ['E4', 2], ['E4', 4]],
    bass: [['E2', 2], ['B2', 2], ['C3', 2], ['G2', 2], ['A2', 2], ['E2', 2], ['B2', 2], ['B2', 2],
      ['E2', 2], ['B2', 2], ['A2', 2], ['F#2', 2], ['G2', 2], ['D3', 2], ['E2', 4]],
  },
  fair: {
    bpm: 132, wave: 'square',
    mel: [['G4', 1], ['A4', .5], ['B4', .5], ['D5', 1], ['B4', 1], ['A4', 1], ['G4', 1], ['E4', 2],
      ['D4', 1], ['E4', .5], ['G4', .5], ['A4', 1], ['B4', 1], ['G4', 2], [null, 1],
      ['B4', 1], ['D5', .5], ['E5', .5], ['G5', 1], ['E5', 1], ['D5', 1], ['B4', 1], ['A4', 2],
      ['G4', 1], ['A4', 1], ['B4', 1], ['A4', 1], ['G4', 4]],
    bass: [['G2', 1], ['D3', 1], ['G2', 1], ['D3', 1], ['C3', 1], ['G3', 1], ['C3', 1], ['G3', 1],
      ['D3', 1], ['A3', 1], ['D3', 1], ['A3', 1], ['G2', 1], ['D3', 1], ['G2', 1], ['G2', 1]],
    perc: true,
  },
  battle: {
    bpm: 168, wave: 'sawtooth',
    mel: [['A4', .5], ['A4', .5], ['C5', .5], ['E5', .5], ['D5', 1], ['A4', 1],
      ['G4', .5], ['A4', .5], ['C5', 1], ['B4', 2],
      ['A4', .5], ['C5', .5], ['E5', .5], ['A5', .5], ['G5', 1], ['E5', 1],
      ['D5', .5], ['C5', .5], ['B4', 1], ['A4', 2]],
    bass: [['A2', .5], ['A2', .5], ['A2', .5], ['A2', .5], ['G2', .5], ['G2', .5], ['G2', .5], ['G2', .5],
      ['F2', .5], ['F2', .5], ['F2', .5], ['F2', .5], ['E2', .5], ['E2', .5], ['E2', .5], ['E2', .5]],
    perc: true,
  },
  mystic: {
    bpm: 72, wave: 'sine',
    mel: [['A4', 2], ['C5', 2], ['E5', 2], ['D5', 2], ['C5', 4], ['B4', 2], ['A4', 2],
      ['E4', 2], ['G4', 2], ['B4', 4], ['A4', 4]],
    bass: [['A2', 4], ['F2', 4], ['C3', 4], ['E2', 4], ['A2', 4], ['G2', 4]],
  },
};

function schedule(song, startTime, loopLen) {
  const beat = 60 / song.bpm;
  let t = startTime;
  for (const [n, d] of song.mel) {
    if (n) {
      voice(N[n], t, d * beat * 0.92, song.wave, 0.16);
      voice(N[n] * 2, t, d * beat * 0.5, 'square', 0.03, 6);
    }
    t += d * beat;
  }
  let bt = startTime;
  const melLen = song.mel.reduce((a, b) => a + b[1], 0);
  while (bt < startTime + melLen * beat) {
    for (const [n, d] of song.bass) {
      if (bt >= startTime + melLen * beat) break;
      voice(N[n], bt, d * beat * 0.85, 'triangle', 0.20);
      bt += d * beat;
    }
  }
  if (song.perc) {
    for (let i = 0; i < melLen * 2; i++) {
      noise(startTime + i * beat * 0.5, 0.05, i % 2 ? 0.05 : 0.11);
    }
  }
  return melLen * beat;
}

export function playSong(name) {
  if (playing === name) return;
  playing = name;
  if (!enabled) return;
  ensure();
  stopLoop();
  const song = SONGS[name];
  if (!song) return;
  const loop = () => {
    if (playing !== name || !enabled) return;
    const len = schedule(song, ctx.currentTime + 0.05, 0);
    timer = setTimeout(loop, len * 1000 - 60);
  };
  loop();
}

function stopLoop() { if (timer) { clearTimeout(timer); timer = null; } }

export function setEnabled(v) {
  enabled = v;
  if (!v) { stopLoop(); if (master) master.gain.value = 0; }
  else {
    ensure();
    master.gain.value = 0.22;
    const p = playing; playing = null;
    if (p) playSong(p);
  }
}
export function isEnabled() { return enabled; }
export function currentSong() { return playing; }

// --- sound effects ---
export function sfx(kind) {
  if (!enabled) return;
  ensure();
  const t = ctx.currentTime;
  switch (kind) {
    case 'blip': voice(N['E5'], t, 0.05, 'square', 0.10); break;
    case 'confirm': voice(N['C5'], t, 0.06, 'square', 0.12); voice(N['G5'], t + 0.05, 0.09, 'square', 0.12); break;
    case 'cancel': voice(N['G4'], t, 0.07, 'square', 0.10); voice(N['C4'], t + 0.05, 0.10, 'square', 0.10); break;
    case 'door': noise(t, 0.18, 0.10); voice(N['C3'], t, 0.14, 'triangle', 0.08); break;
    case 'item': ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => voice(N[n], t + i * 0.06, 0.16, 'square', 0.11)); break;
    case 'hit': noise(t, 0.10, 0.20); voice(N['A2'], t, 0.10, 'sawtooth', 0.12); break;
    case 'slash': noise(t, 0.13, 0.16); voice(N['E5'], t, 0.06, 'sawtooth', 0.08); break;
    case 'zap': {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.45);
      break;
    }
    case 'gate': {
      for (let i = 0; i < 6; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120 + i * 90, t + i * 0.06);
        o.frequency.exponentialRampToValueAtTime(60 + i * 40, t + 1.4);
        g.gain.setValueAtTime(0.08, t + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        o.connect(g); g.connect(master); o.start(t + i * 0.06); o.stop(t + 1.7);
      }
      noise(t, 1.2, 0.09);
      break;
    }
    case 'bell': [['E5', 0], ['B5', 0.28], ['G5', 0.56], ['E5', 0.84]].forEach(([n, d]) => {
      voice(N[n], t + d, 1.6, 'sine', 0.13);
      voice(N[n] * 1.5, t + d, 0.9, 'sine', 0.04);
    }); break;
    case 'win': ['C5', 'D5', 'E5', 'G5', 'C6'].forEach((n, i) => voice(N[n], t + i * 0.10, 0.35, 'square', 0.13)); break;
  }
}
