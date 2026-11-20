import * as THREE from 'three';
import { fmtTime, toast } from '../core/utils.js';
import { storage } from '../core/save.js';
import { sfx } from '../core/sound.js';

/* Anillos de desafío + cronómetro + récords. */
export class Challenges {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hudRoot');
    this.list = [];
    this.meshes = [];
    this.active = null;
    this.ringIdx = 0;
    this.t0 = 0;
    this.el = null;
  }

  load(mapDef) {
    this.clear();
    if (typeof mapDef.chals === 'function') this.list = mapDef.chals(this.game.chAPI);
    else if (Array.isArray(mapDef.chals)) this.list = mapDef.chals;
    else this.list = [];
    if (!this.list.length) return;
    this.buildPanel();
  }

  clear() {
    for (const m of this.meshes) { this.game.scene.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    this.list = []; this.active = null;
  }

  buildPanel() {
    const old = document.getElementById('chalPanel');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'chalPanel';
    el.className = 'hud-chal clickable';
    el.style.cssText = 'position:absolute;top:70px;right:14px;min-width:230px';
    const mapId = this.game.mapId;
    let html = `<div class="t">DESAFÍOS DE ${this.game.mapName.toUpperCase()}</div>`;
    for (const c of this.list) {
      const rec = storage.getRecord(mapId, c.id);
      html += `<div class="row" style="justify-content:space-between;margin-top:8px;font-size:13px">
        <span style="color:var(--txt)">${c.name}</span>
        <span style="color:var(--dim)">${rec?.best ? '🏆 ' + fmtTime(rec.best.ms) : '—'}</span>
        <button class="btn small" data-chal="${c.id}">Correr</button></div>`;
    }
    html += `<div style="margin-top:10px;font-size:11px;color:var(--dim)">Cruza los anillos en orden</div>`;
    el.innerHTML = html;
    this.root.appendChild(el);
    el.querySelectorAll('button[data-chal]').forEach(b => {
      b.onclick = () => this.start(b.dataset.chal);
    });
    this.el = el;
  }

  start(id) {
    const c = this.list.find(x => x.id === id);
    if (!c) return;
    this.active = c;
    this.ringIdx = 0;
    this.t0 = performance.now();
    this.buildRings();
    toast('Desafío: ' + c.name + ' — ¡A por el primer anillo!');
    sfx.checkpoint();
  }

  buildRings() {
    for (const m of this.ringMeshes || []) { this.game.scene.remove(m); m.geometry.dispose(); }
    this.ringMeshes = [];
    if (!this.active) return;
    const mapDef = this.game.mapDef;
    this.active.rings.forEach((r, i) => {
      let y = r.y;
      if (r.y <= 1) y = this.game.terrain.sampleHeight(r.x, r.z) + 2.6;
      else if (this.active.type === 'flight') y = Math.max(r.y, mapDef.waterLevel + 20);
      else y = this.game.terrain.sampleHeight(r.x, r.z) + 2.6;
      const geo = new THREE.TorusGeometry(r.r, .5, 8, 26);
      const mat = new THREE.MeshStandardMaterial({ color: i === 0 ? 0xffd23f : 0x5eb1ff, emissive: i === 0 ? 0xcc9a10 : 0x1a4a80, emissiveIntensity: 1.1 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(r.x, y, r.z);
      this.game.scene.add(m);
      this.ringMeshes.push(m);
    });
  }

  update() {
    if (!this.active) return;
    const inst = this.game.sim.instances.find(v => v.isFocus);
    if (!inst || !this.ringMeshes) return;
    const body = inst.clusters[0].body;
    const r = this.active.rings[this.ringIdx];
    if (!r) return;
    const m = this.ringMeshes[this.ringIdx];
    const flat = this.active.type !== 'float';
    const dxm = body.position.x - m.position.x, dzm = body.position.z - m.position.z;
    const dym = flat ? 0 : body.position.y - m.position.y;
    const dist = Math.hypot(dxm, dym, dzm);
    if (dist < r.r) {
      sfx.checkpoint();
      this.ringIdx++;
      if (this.ringIdx >= this.active.rings.length) {
        const ms = performance.now() - this.t0;
        const rec = storage.setRecord(this.game.mapId, this.active.id, this.game.playerName, ms);
        toast(`🏁 ${this.active.name} completado: ${fmtTime(ms)} · récord: ${rec.best ? fmtTime(rec.best.ms) : '—'}`, 4200);
        sfx.finish();
        this.active = null;
        this.buildRings();
        if (this.hudEl) this.hudEl.remove();
        return;
      }
      this.ringMeshes.forEach((mm, i) => {
        mm.material.emissiveIntensity = i === this.ringIdx ? 1.6 : .5;
        mm.material.color.setHex(i === this.ringIdx ? 0xffd23f : 0x5eb1ff);
      });
    }
    const dt = (performance.now() - this.t0) / 1000;
    if (!this.hudEl) {
      this.hudEl = document.createElement('div');
      this.hudEl.className = 'hud-chal clickable';
      this.hudEl.style.cssText = 'position:absolute;top:70px;left:14px;pointer-events:none';
      this.game.hudRoot.appendChild(this.hudEl);
    }
    this.hudEl.innerHTML = `<div class="t">${this.active.name}</div><div class="v">${dt.toFixed(1)}s</div><div style="font-size:11px;color:var(--dim)">anillo ${this.ringIdx + 1}/${this.active.rings.length}</div>`;
  }
}
