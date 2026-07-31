// input.js — keyboard, on-screen D-pad and buttons, unified into one state object.

export const keys = { up: false, down: false, left: false, right: false, a: false, b: false, menu: false };
const pressed = { a: false, b: false, menu: false }; // edge-triggered
const held = {};

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyZ: 'a', Enter: 'a', Space: 'a', KeyJ: 'a',
  KeyX: 'b', ShiftLeft: 'b', ShiftRight: 'b', KeyK: 'b',
  KeyC: 'menu', Escape: 'menu', KeyM: 'menu',
};

let firstInputHandlers = [];
export function onFirstInput(fn) { firstInputHandlers.push(fn); }
let gotFirst = false;
function fireFirst() {
  if (gotFirst) return;
  gotFirst = true;
  firstInputHandlers.forEach(f => f());
  firstInputHandlers = [];
}

export function initInput(root) {
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    fireFirst();
    if (!held[k]) { if (k === 'a' || k === 'b' || k === 'menu') pressed[k] = true; }
    held[k] = true;
    keys[k] = true;
  });
  addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    held[k] = false;
    keys[k] = false;
  });
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    for (const k in held) held[k] = false;
  });

  // --- touch controls ---
  const bind = (el, k) => {
    if (!el) return;
    const on = ev => {
      ev.preventDefault();
      fireFirst();
      if (!keys[k] && (k === 'a' || k === 'b' || k === 'menu')) pressed[k] = true;
      keys[k] = true;
      el.classList.add('down');
    };
    const off = ev => {
      ev.preventDefault();
      keys[k] = false;
      el.classList.remove('down');
    };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  };
  bind(root.querySelector('#btn-a'), 'a');
  bind(root.querySelector('#btn-b'), 'b');
  bind(root.querySelector('#btn-menu'), 'menu');

  // Analog-ish D-pad: track the touch position inside the pad and derive direction.
  const pad = root.querySelector('#dpad');
  if (pad) {
    const setFromPoint = (cx, cy) => {
      const r = pad.getBoundingClientRect();
      const dx = (cx - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (cy - (r.top + r.height / 2)) / (r.height / 2);
      const dead = 0.28;
      keys.left = dx < -dead; keys.right = dx > dead;
      keys.up = dy < -dead; keys.down = dy > dead;
      pad.dataset.dir =
        (keys.up ? 'u' : keys.down ? 'd' : '') + (keys.left ? 'l' : keys.right ? 'r' : '');
    };
    const clear = () => {
      keys.up = keys.down = keys.left = keys.right = false;
      pad.dataset.dir = '';
    };
    const move = ev => {
      ev.preventDefault();
      fireFirst();
      const t = ev.touches ? ev.touches[0] : ev;
      if (t) setFromPoint(t.clientX, t.clientY);
    };
    pad.addEventListener('touchstart', move, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', e => { e.preventDefault(); clear(); }, { passive: false });
    pad.addEventListener('touchcancel', e => { e.preventDefault(); clear(); }, { passive: false });
    let mouseDown = false;
    pad.addEventListener('mousedown', e => { mouseDown = true; move(e); });
    addEventListener('mousemove', e => { if (mouseDown) move(e); });
    addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; clear(); } });
  }

  addEventListener('touchstart', fireFirst, { passive: true });
  addEventListener('mousedown', fireFirst);
}

// consume an edge-triggered press
export function tap(k) {
  if (pressed[k]) { pressed[k] = false; return true; }
  return false;
}
export function clearTaps() { pressed.a = pressed.b = pressed.menu = false; }
export function anyPressed() { return pressed.a || pressed.b || pressed.menu; }
