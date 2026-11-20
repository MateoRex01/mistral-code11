import { settings } from './settings.js';

export const defaultBindings = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  brake: 'Space', enter: 'KeyE', build: 'KeyB', repair: 'KeyR',
  respawn: 'KeyF', camera: 'KeyC', map: 'KeyM', pause: 'Escape',
  boost: 'ShiftLeft', descend: 'ControlLeft',
  rotYaw: 'KeyT', rotPitch: 'KeyG', rotRoll: 'KeyV',
  deleteTool: 'KeyX', lightTool: 'KeyL', hingeT: 'ArrowLeft', hingeNeg: 'ArrowRight',
  pistonT: 'ArrowUp', pistonNeg: 'ArrowDown',
};

export const input = {
  down: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, ndx: 0, ndy: 0, dx: 0, dy: 0, wheel: 0, buttons: 0 },
  enabled: true,
  _capture: null,

  bindings: () => ({ ...defaultBindings, ...(settings.data.bindings || {}) }),

  init(el) {
    window.addEventListener('keydown', e => {
      if (this._capture) { e.preventDefault(); const c = this._capture; this._capture = null; c(e.code); return; }
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); });
    el.addEventListener('mousemove', e => {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      this.mouse.dx += dx; this.mouse.dy += dy;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.ndx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ndy = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    el.addEventListener('mousedown', e => { this.mouse.buttons |= (1 << e.button); this.pressed.add('Mouse' + e.button); });
    window.addEventListener('mouseup', e => { this.mouse.buttons &= ~(1 << e.button); });
    el.addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  },

  isDown(action) {
    const b = this.bindings()[action];
    if (Array.isArray(b)) return b.some(k => this.down.has(k));
    return this.down.has(b) || this._altCheck(action);
  },
  wasPressed(action) {
    const b = this.bindings()[action];
    return b && (this.pressed.has(b));
  },
  _altCheck(action) {
    if (action === 'boost') return this.down.has('ShiftRight');
    if (action === 'descend') return this.down.has('ControlRight');
    return false;
  },

  bindNext(cb) { this._capture = cb; },

  rawDown(code) { return this.down.has(code); },
  rawPressed(code) { return this.pressed.has(code); },

  endFrame() {
    this.pressed.clear();
    this.mouse.wheel = 0;
    this.mouse.dx = 0; this.mouse.dy = 0;
  },
};
