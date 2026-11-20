export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const gkey = (x, y, z) => x + ',' + y + ',' + z;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, smooth(xf)), lerp(c, d, smooth(xf)), smooth(yf));
}
export function fbm(x, y, seed = 0, oct = 4) {
  let v = 0, amp = .5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * valueNoise(x * f, y * f, seed + i * 101); amp *= .5; f *= 2; }
  return v;
}

export function fmtTime(ms) {
  if (ms == null) return '—';
  const s = ms / 1000, m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}

export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  const d = document.createElement('div');
  d.className = 'toast-msg'; d.textContent = msg;
  el.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .4s'; setTimeout(() => d.remove(), 400); }, ms);
}
