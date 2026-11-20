import { settings } from './settings.js';

let ctx = null;
let master, musicG, sfxG, engG, ambG;
let engineOsc = null, engineOsc2 = null, engineLfo = null, engineFilter = null;
let windGain = null, windSrc = null;
let ambGain = null;
const musicTimer = { next: 0 };

function now() { return ctx.currentTime; }

export function initAudio() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch { return; }
  master = ctx.createGain(); master.connect(ctx.destination);
  musicG = ctx.createGain(); sfxG = ctx.createGain(); engG = ctx.createGain(); ambG = ctx.createGain();
  musicG.connect(master); sfxG.connect(master); engG.connect(master); ambG.connect(master);
  applyVolumes();

  // viento procedural
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  windSrc = ctx.createBufferSource(); windSrc.buffer = buf; windSrc.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 600; wf.Q.value = .4;
  windGain = ctx.createGain(); windGain.gain.value = 0;
  windSrc.connect(wf); wf.connect(windGain); windGain.connect(ambG); windSrc.start();

  // motor
  engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 40;
  engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 81;
  engineLfo = ctx.createGain(); engineLfo.gain.value = .5;
  engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
  engineFilter.connect(engineLfo); engineLfo.connect(engG);
  engineOsc.start(); engineOsc2.start();
  engG.gain.value = 0;
}

export function applyVolumes() {
  if (!ctx) return;
  master.gain.value = settings.data.volumeMaster;
  musicG.gain.value = settings.data.volumeMusic * .5;
  sfxG.gain.value = settings.data.volumeSfx;
  engG.gain.value = 0;
  ambG.gain.value = settings.data.volumeAmb * settings.data.volumeSfx;
}

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function beep(freq, dur, type = 'sine', vol = .5, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, now());
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now() + dur);
  g.gain.setValueAtTime(vol, now());
  g.gain.exponentialRampToValueAtTime(.001, now() + dur);
  o.connect(g); g.connect(sfxG); o.start(); o.stop(now() + dur + .02);
}

export const sfx = {
  click: () => beep(880, .05, 'sine', .22),
  hover: () => beep(520, .04, 'sine', .1),
  place: () => beep(240, .12, 'triangle', .5, 160),
  remove: () => beep(300, .12, 'triangle', .4, -180),
  deny: () => beep(140, .16, 'square', .3),
  checkpoint: () => { beep(660, .1, 'sine', .5); setTimeout(() => beep(990, .16, 'sine', .5), 90); },
  finish: () => { beep(520, .12, 'sine', .5); setTimeout(() => beep(660, .12, 'sine', .5), 110); setTimeout(() => beep(880, .3, 'sine', .6), 220); },
  crash: () => { if (!ctx) return; const b = ctx.createBufferSource(); const buf = ctx.createBuffer(1, 4410, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); b.buffer = buf; const g = ctx.createGain(); g.gain.value = .5; b.connect(g); g.connect(sfxG); b.start(); },
  spawn: () => beep(330, .3, 'triangle', .4, 220),
};

export function updateEngineAudio(active, throttle, speed, rotor) {
  if (!ctx) return;
  const t = now();
  if (active && (settings.data.soundVehicles)) {
    const f = 38 + Math.abs(throttle) * 55 + speed * 1.6 + (rotor ? 30 : 0);
    engineOsc.frequency.setTargetAtTime(f, t, .08);
    engineOsc2.frequency.setTargetAtTime(f * 2.02, t, .08);
    engineFilter.frequency.setTargetAtTime(300 + Math.abs(throttle) * 900 + speed * 20, t, .1);
    engG.gain.setTargetAtTime(.05 + Math.abs(throttle) * .09, t, .15);
  } else {
    engG.gain.setTargetAtTime(0, t, .1);
  }
  windGain.gain.setTargetAtTime(Math.min(.5, speed * .012), t, .2);
}

export function updateAmbient(rain, night) {
  ambGain = ambGain || null;
  if (!ctx) return;
  windGain.gain.setTargetAtTime(rain ? .18 : .04, now(), .5);
}

export function musicTick(t, inMenu) {
  if (!ctx || settings.data.volumeMusic <= 0) return;
  if (t < musicTimer.next) return;
  musicTimer.next = t + (inMenu ? 3.6 : 5.2) + Math.random() * 2;
  const notes = inMenu ? [261, 311, 349, 392, 466] : [196, 233, 261, 293];
  const base = notes[Math.floor(Math.random() * notes.length)];
  const seq = [0, Math.random() < .6 ? 4 : 3, 7, Math.random() < .5 ? 11 : 12];
  seq.forEach((iv, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = base * Math.pow(2, iv / 12);
    const st = now() + i * .45;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(.16, st + .05);
    g.gain.exponentialRampToValueAtTime(.001, st + 1.9);
    o.connect(g); g.connect(musicG); o.start(st); o.stop(st + 2);
  });
}
