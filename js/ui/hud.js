import * as THREE from 'three';
import { clamp } from '../core/utils.js';

/* HUD en juego: velocidad, altura, estabilidad, piezas, minimapa y botones. */
export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hudRoot');
    this.minimap = null;
    this.mapBig = null;
  }

  build() {
    this.root.innerHTML = '';
    const G = this.game;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-loc" id="h-loc">${G.mapName}</div>
      </div>
      <div class="hud-tr">
        <div class="hud-btns clickable">
          <button class="hud-btn" id="h-repair" title="Reparar (R)">🛠</button>
          <button class="hud-btn" id="h-respawn" title="Reaparecer (F)">↻</button>
          <button class="hud-btn" id="h-cam" title="Cámara (C)">🎥</button>
          <button class="hud-btn" id="h-map" title="Mapa (M)">🗺</button>
          <button class="hud-btn" id="h-build" title="Constructor (B)">🧰</button>
          <button class="hud-btn" id="h-pause" title="Pausa (Esc)">⏸</button>
        </div>
      </div>
      <div class="hud-bl">
        <div class="speedo">
          <div class="v" id="h-speed">0</div><div class="u">km/h</div>
          <div class="gauges">
            <div class="gauge" id="h-galt"><i></i><b>ALT</b></div>
            <div class="gauge" id="h-gtilt"><i></i><b>EST</b></div>
            <div class="gauge" id="h-gint"><i></i><b>INT</b></div>
          </div>
        </div>
        <div class="speedo" style="min-width:130px">
          <div style="font-size:11px;color:var(--dim)">VEHÍCULO</div>
          <div id="h-vname" style="font-weight:700;color:#fff">—</div>
          <div id="h-vinfo" style="font-size:11.5px;color:var(--dim)">—</div>
          <div style="font-size:11px;color:var(--dim);margin-top:6px">MOTOR</div>
          <div id="h-vpower" style="font-size:20px;font-weight:800;color:var(--acc)">—</div>
        </div>
      </div>
      <div class="hud-br" id="h-hint"></div>
      <canvas id="minimap" width="220" height="220"></canvas>
    `;
    this.root.appendChild(el);
    document.getElementById('h-repair').onclick = () => G.repairVehicle();
    document.getElementById('h-respawn').onclick = () => G.respawnVehicle();
    document.getElementById('h-cam').onclick = () => G.toggleCamera();
    document.getElementById('h-map').onclick = () => this.toggleBigMap();
    document.getElementById('h-build').onclick = () => G.openBuilder();
    document.getElementById('h-pause').onclick = () => G.togglePause();
    this.buildMinimap();
  }

  buildMinimap() {
    const G = this.game;
    const cv = document.getElementById('minimap');
    if (!cv) return;
    this.minimap = cv;
    cv.classList.add('show');
    const ctx = cv.getContext('2d');
    const t = G.terrain, S = t.S;
    const img = ctx.createImageData(110, 110);
    for (let py = 0; py < 110; py++) for (let px = 0; px < 110; px++) {
      const x = -S / 2 + px / 110 * S, z = -S / 2 + py / 110 * S;
      const h = t.sampleHeight(x, z);
      let r, g, b2;
      if (G.env.waterOn && h < G.env.waterY) { r = 26; g = 62; b2 = 92; }
      else {
        const v = clamp((h - G.env.waterLevel) / 60, 0, 1);
        r = 60 + v * 120; g = 90 + v * 90; b2 = 55 + v * 70;
      }
      const o = (py * 110 + px) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b2; img.data[o + 3] = 255;
    }
    // escala x2 al pintar
    const tmp = document.createElement('canvas'); tmp.width = 110; tmp.height = 110;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, 220, 220);
    this._base = document.createElement('canvas'); this._base.width = 220; this._base.height = 220;
    this._base.getContext('2d').drawImage(cv, 0, 0);
  }

  drawMinimapMarkers() {
    const cv = this.minimap; if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!this._base) return;
    ctx.clearRect(0, 0, 220, 220);
    ctx.drawImage(this._base, 0, 0);
    const G = this.game, S = G.terrain.S;
    const px = v => clamp((v + S / 2) / S * 220, 0, 218);
    ctx.fillStyle = '#ffffff';
    const p = G.player;
    if (p.visible) { ctx.fillRect(px(p.pos.x) - 2, px(p.pos.z) - 2, 4, 4); }
    for (const inst of G.sim.instances) {
      if (!inst.clusters[0] || !inst.clusters[0].body) continue;
      const b = inst.clusters[0].body;
      ctx.fillStyle = inst.isFocus ? '#4ade80' : '#ffb347';
      ctx.beginPath(); ctx.arc(px(b.position.x), px(b.position.z), 4, 0, 7); ctx.fill();
    }
    for (const ch of G.challenges.ringMeshes || []) {
      ctx.fillStyle = '#5eb1ff';
      ctx.beginPath(); ctx.arc(px(ch.position.x), px(ch.position.z), 3, 0, 7); ctx.fill();
    }
  }

  status(s, inst, hint) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('h-speed', Math.round(s.speed));
    const gauge = (id, frac, color) => {
      const e = document.getElementById(id); if (!e) return;
      const i = e.querySelector('i');
      i.style.transform = `scaleX(${clamp(frac, 0, 1)})`;
      if (color) i.style.background = color;
    };
    gauge('h-galt', s.alt / 60);
    gauge('h-gtilt', 1 - s.tilt / 180);
    gauge('h-gint', s.integrity, s.integrity > .66 ? 'linear-gradient(90deg,#4ade80,#a3e635)' : s.integrity > .33 ? 'linear-gradient(90deg,#facc15,#fb923c)' : 'linear-gradient(90deg,#f87171,#dc2626)');
    set('h-vname', inst?.data.name || '—');
    if (inst) {
      const power = Math.round(inst.enginePower * 10) / 10;
      set('h-vinfo', `${s.parts}/${s.totalParts} piezas · ${Math.round(inst.clusters.reduce((a, c) => a + c.masses, 0))} kg`);
      set('h-vpower', power + ' ⚡');
    }
    const hintEl = document.getElementById('h-hint');
    if (hintEl) hintEl.innerHTML = hint || '';
    this.drawMinimapMarkers();
  }

  toggleBigMap() {
    const old = document.getElementById('bigmap');
    if (old) { old.remove(); return; }
    const G = this.game;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dlg panel" style="text-align:center">
      <h2>${G.mapName}</h2>
      <canvas id="bigmap-c" width="480" height="480" style="border-radius:12px;cursor:crosshair;max-width:100%"></canvas>
      <div class="hint" style="margin-top:10px">Clic para teletransportar tu vehículo enfocado · Esc o clic fuera para cerrar</div>
    </div>`;
    ov.id = 'bigmap';
    document.body.appendChild(ov);
    const cv = ov.querySelector('#bigmap-c');
    this._base = null;
    // dibuja el terreno
    const ctx = cv.getContext('2d');
    const t = G.terrain, S = t.S;
    const n = 160;
    const img = ctx.createImageData(n, n);
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const x = -S / 2 + px / n * S, z = -S / 2 + py / n * S;
      const h = t.sampleHeight(x, z);
      let r, g, b2;
      if (G.env.waterOn && h < G.env.waterY) { const d = clamp((G.env.waterY - h) / 26, 0, 1); r = 20 + (1 - d) * 20; g = 60 + (1 - d) * 30; b2 = 100 + (1 - d) * 30; }
      else { const v = clamp((h - G.env.waterLevel) / 55, 0, 1); r = 76 + v * 110; g = 106 + v * 80; b2 = 66 + v * 60; }
      const o = (py * n + px) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b2; img.data[o + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, 480, 480);
    const mark = () => {
      for (const inst of G.sim.instances) {
        const b = inst.clusters[0].body;
        ctx.fillStyle = inst.isFocus ? '#4ade80' : '#ffb347';
        ctx.beginPath(); ctx.arc((b.position.x + S / 2) / S * 480, (b.position.z + S / 2) / S * 480, 5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#fff';
      if (G.player.visible) { ctx.fillRect((G.player.pos.x + S / 2) / S * 480 - 2, (G.player.pos.z + S / 2) / S * 480 - 2, 4, 4); }
      for (const ch of G.challenges.ringMeshes || []) {
        ctx.strokeStyle = '#5eb1ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((ch.position.x + S / 2) / S * 480, (ch.position.z + S / 2) / S * 480, 7, 0, 7); ctx.stroke();
      }
    };
    mark();
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    cv.onclick = e => {
      const rect = cv.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width, fz = (e.clientY - rect.top) / rect.height;
      const x = -S / 2 + fx * S, z = -S / 2 + fz * S;
      G.teleportFocus(x, z);
      ov.remove();
    };
  }
}
