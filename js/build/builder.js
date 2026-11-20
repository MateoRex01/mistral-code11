import * as THREE from 'three';
import { PART, PARTS, CATS, instPart, paintMat, totalMass, PALETTE } from '../parts/catalog.js';
import { clamp, toast } from '../core/utils.js';
import { sfx } from '../core/sound.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';

/* ---------- orientation helpers ---------- */
export function orientQuat(o) {
  const a = o || [0, 0, 0];
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (a[0] || 0) * Math.PI / 2);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (a[1] || 0) * Math.PI / 2);
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (a[2] || 0) * Math.PI);
  return q.copy(qy).multiply(qx).multiply(qz);
}
/* centro (local del pad) de un bloque */
export function blockCenter(b) {
  const part = PART[b.p];
  const q = orientQuat(b.o);
  const c = new THREE.Vector3((part.size[0] - 1) / 2, (part.size[1] - 1) / 2, (part.size[2] - 1) / 2).applyQuaternion(q);
  return new THREE.Vector3(b.x + c.x, b.y + c.y, b.z + c.z);
}
/* AABB local (rotaciones de 90°: la caja sigue alineada a ejes) */
export function blockAABB(b) {
  const part = PART[b.p];
  const q = orientQuat(b.o);
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
  const s = part.size;
  const hx = (Math.abs(m[0]) * s[0] + Math.abs(m[4]) * s[1] + Math.abs(m[8]) * s[2]) / 2;
  const hy = (Math.abs(m[1]) * s[0] + Math.abs(m[5]) * s[1] + Math.abs(m[9]) * s[2]) / 2;
  const hz = (Math.abs(m[2]) * s[0] + Math.abs(m[6]) * s[1] + Math.abs(m[10]) * s[2]) / 2;
  const c = blockCenter(b);
  return { min: new THREE.Vector3(c.x - hx, c.y - hy, c.z - hz), max: new THREE.Vector3(c.x + hx, c.y + hy, c.z + hz), c, s: [hx, hy, hz] };
}
/* muestra 3D de una creación (menú, galería, vista del mundo) */
export function buildDisplay(data) {
  const root = new THREE.Group();
  if (!data) return root;
  for (const b of data.blocks) {
    const g = instPart(b.p, b.c);
    if (!g) continue;
    g.position.copy(blockCenter(b));
    g.quaternion.copy(orientQuat(b.o));
    root.add(g);
  }
  return root;
}

/* ---------- mini-renderizador para iconos del catálogo ---------- */
let _thumbR = null, _thumbScene = null, _thumbCam = null;
const _thumbCache = new Map();
export function makeThumb(partId, size = 96) {
  if (_thumbCache.has(partId)) return _thumbCache.get(partId);
  if (!_thumbR) {
    _thumbR = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    _thumbR.setSize(size, size);
    _thumbScene = new THREE.Scene();
    _thumbCam = new THREE.PerspectiveCamera(32, 1, .01, 20);
    _thumbCam.position.set(1.7, 1.35, 2.1);
    _thumbCam.lookAt(0, 0, 0);
    _thumbScene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(3, 5, 4); _thumbScene.add(d);
    const d2 = new THREE.DirectionalLight(0x88aaff, 1.2); d2.position.set(-4, 2, -3); _thumbScene.add(d2);
  }
  const g = instPart(partId);
  _thumbScene.add(g);
  const bb = new THREE.Box3().setFromObject(g);
  const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()).length();
  g.position.sub(c);
  _thumbCam.position.set(1.7 * s * .62, 1.2 * s * .62, 2 * s * .62); _thumbCam.lookAt(0, 0, 0);
  _thumbR.render(_thumbScene, _thumbCam);
  const url = _thumbR.domElement.toDataURL();
  _thumbScene.remove(g);
  _thumbCache.set(partId, url);
  return url;
}

const GHOST_OK = new THREE.MeshStandardMaterial({ color: 0x6fd88f, transparent: true, opacity: .55, emissive: 0x1f7040, emissiveIntensity: .5, depthWrite: false });
const GHOST_BAD = new THREE.MeshStandardMaterial({ color: 0xd9543f, transparent: true, opacity: .55, emissive: 0x771511, emissiveIntensity: .5, depthWrite: false });

export class Builder {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('buildRoot');
    this.active = false;
    this.data = null;
    this.padPos = new THREE.Vector3();
    this.tool = 'place';
    this.partId = 'block';
    this.color = PALETTE[0];
    this.orient = [0, 0, 0];
    this.gridScale = 1;
    this.symmetry = false;
    this.sel = new Set();
    this.clipboard = null;
    this.undoStack = [];
    this.redoStack = [];
    this.orbit = { yaw: .7, pitch: .42, dist: 20, target: new THREE.Vector3() };
    this.blockMeshes = [];
    this.ghostCache = new Map();
    this.lastPlace = 0;
    this.ray = new THREE.Raycaster();
    this._thumbQueue = PARTS.slice();
  }

  /* ================= ciclo de vida ================= */
  open(data, padPos, padRotY = 0) {
    this.data = JSON.parse(JSON.stringify(data));
    if (!this.data.blocks.length) this.data.blocks.push({ p: 'block', x: 0, y: 1, z: 0, o: [0, 0, 0], c: PALETTE[0] });
    this.padPos.copy(padPos);
    this.active = true;
    this.sel.clear(); this.undoStack = []; this.redoStack = []; this.partId = 'block'; this.tool = 'place';
    this.orbit.target.set(0, 2, 0);
    this.orbit.dist = Math.max(18, Math.sqrt(this.data.blocks.length) * 2.4);
    this.orbit.yaw = .7 + padRotY;

    this.group = new THREE.Group();
    this.group.position.copy(padPos);
    this.group.rotation.y = 0;
    this.game.scene.add(this.group);
    this.rebuild();

    this.grid = new THREE.GridHelper(42, 42, 0x39597a, 0x24384c);
    this.grid.position.copy(padPos).setY(padPos.y + .03);
    this.game.scene.add(this.grid);
    this.ghostRoot = new THREE.Group();
    this.game.scene.add(this.ghostRoot);
    this.ready = true;
    this.buildUI();
    if (settings.data.showTutorials) toast('Clic: colocar · Rueda: zoom · Botón derecho: orbitar · R/T/V: rotar pieza · X: borrar', 6000);
  }

  close() {
    if (!this.active) return null;
    this.active = false;
    const out = JSON.parse(JSON.stringify(this.data));
    this.game.scene.remove(this.group);
    this.game.scene.remove(this.grid);
    this.game.scene.remove(this.ghostRoot);
    for (const m of this.blockMeshes) this.disposeGroup(m);
    this.blockMeshes = [];
    this.group = null; this.grid = null; this.ghostRoot = null;
    this.root.innerHTML = '';
    this.disposeGhost();
    this.game.camera.position.set(this.padPos.x + 14, this.padPos.y + 10, this.padPos.z + 14);
    return out;
  }

  disposeGroup(g) {
    g.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
  disposeGhost() {
    for (const [, g] of this.ghostCache) this.disposeGroup(g);
    this.ghostCache.clear();
  }

  /* ================= consultas ================= */
  bounds() {
    const bb = new THREE.Box3();
    if (!this.data.blocks.length) return bb.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 2, 2));
    for (const b of this.data.blocks) bb.union(new THREE.Box3().setFromPoints([blockAABB(b).min, blockAABB(b).max]));
    return bb;
  }

  overlapOK(part, x, y, z, o) {
    const a = blockAABB({ p: part.id, x, y, z, o });
    a.min.subScalar(.02); a.max.addScalar(.02);
    for (const b of this.data.blocks) {
      const bb = blockAABB(b);
      if (a.min.x < bb.max.x && a.max.x > bb.min.x && a.min.y < bb.max.y && a.max.y > bb.min.y && a.min.z < bb.max.z && a.max.z > bb.min.z) return false;
    }
    return true;
  }
  touchingGround(x, y, z, o, part) {
    const bb = blockAABB({ p: part.id, x, y, z, o });
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
      const px = this.padPos.x + bb.c.x + i * hl(part, 0), pz = this.padPos.z + bb.c.z + k * hl(part, 0);
      const groundY = this.game.terrain.sampleHeight(px, pz);
      if (bb.min.y + this.padPos.y - .85 < groundY) return true;
    }
    return false;
  }
  touchingBlock(part, x, y, z, o) {
    const a = blockAABB({ p: part.id, x, y, z, o });
    for (const b of this.data.blocks) {
      const bb = blockAABB(b);
      const gapy = Math.max(0, Math.max(a.min.y - bb.max.y, bb.min.y - a.max.y));
      const gapx = Math.max(0, Math.max(a.min.x - bb.max.x, bb.min.x - a.max.x));
      const gapz = Math.max(0, Math.max(a.min.z - bb.max.z, bb.min.z - a.max.z));
      const m = Math.max(gapx, gapy, gapz);
      if (m <= .18) return true;
    }
    return false;
  }

  canPlace(part, x, y, z, o) {
    if (!this.overlapOK(part, x, y, z, o)) return { ok: false, why: 'Ocupado' };
    const limits = settings.data.buildLimits !== false;
    if (!limits) return { ok: true };
    const touch = this.touchingBlock(part, x, y, z, o) || this.touchingGround(part, x, y, z, o, part);
    if (!touch) return { ok: false, why: 'No conecta con nada' };
    if (y - .5 + this.padPos.y < this.game.terrain.sampleHeight(this.padPos.x + x, this.padPos.z + z) - .2) return { ok: false, why: 'Bajo el terreno' };
    return { ok: true };
  }

  quant(v) { return Math.round(v / this.gridScale) * this.gridScale; }

  /* ================= operaciones ================= */
  pushUndo() { this.undoStack.push(JSON.stringify(this.data.blocks)); if (this.undoStack.length > 80) this.undoStack.shift(); this.redoStack.length = 0; }
  undo() { if (!this.undoStack.length) return sfx.deny(); this.redoStack.push(JSON.stringify(this.data.blocks)); this.data.blocks = JSON.parse(this.undoStack.pop()); this.rebuild(); this.sel.clear(); sfx.click(); }
  redo() { if (!this.redoStack.length) return sfx.deny(); this.undoStack.push(JSON.stringify(this.data.blocks)); this.data.blocks = JSON.parse(this.redoStack.pop()); this.rebuild(); this.sel.clear(); sfx.click(); }

  tryPlace(x, y, z, silent = false) {
    const part = PART[this.partId];
    const chk = this.canPlace(part, x, y, z, this.orient);
    if (!chk.ok) { if (!silent) { sfx.deny(); if (chk.why) toast(chk.why); } this.ghostOK = false; return false; }
    const backup = JSON.stringify(this.data.blocks);
    const placed = [{ p: this.partId, x, y, z, o: [...this.orient], c: this.color }];
    if (this.symmetry) {
      const mc = this.mirroredAnchor(x, y, z);
      if (mc && this.canPlace(part, mc[0], mc[1], mc[2], mc[3]).ok) {
        placed.push({ p: this.partId, x: mc[0], y: mc[1], z: mc[2], o: mc[3], c: this.color });
      }
    }
    this.data.blocks.push(...placed);
    if (!silent) sfx.place();
    if (!this.undoStack.length || this.undoStack[this.undoStack.length - 1] !== backup) {
      this.undoStack.push(backup);
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.rebuild();
    this.ghostOK = true;
    return true;
  }

  mirroredAnchor(x, y, z) {
    const part = PART[this.partId];
    const q = orientQuat(this.orient);
    const center = blockCenter({ p: this.partId, x, y, z, o: this.orient });
    const mo = [(4 - this.orient[0]) % 4, this.orient[1], 1 - this.orient[2]];
    const mq = orientQuat(mo);
    const cOff = new THREE.Vector3((part.size[0] - 1) / 2, (part.size[1] - 1) / 2, (part.size[2] - 1) / 2);
    const cR = cOff.clone().applyQuaternion(q);
    const cR2 = cOff.clone().applyQuaternion(mq);
    const mx = -(x + cR.x) - cR2.x, my = y + cR.y - cR2.y, mz = z + cR.z - cR2.z;
    const qs = v => Math.round(v * 2) / 2;
    return [qs(mx), qs(my), qs(mz), mo];
  }

  blockAtPoint(pLocal) {
    let best = -1, bestD = .6;
    for (let i = 0; i < this.data.blocks.length; i++) {
      const bb = blockAABB(this.data.blocks[i]);
      if (pLocal.x > bb.min.x - .1 && pLocal.x < bb.max.x + .1 && pLocal.y > bb.min.y - .1 && pLocal.y < bb.max.y + .1 && pLocal.z > bb.min.z - .1 && pLocal.z < bb.max.z + .1) {
        const d = bb.c.distanceTo(pLocal);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  removeAtPoint(pLocal) {
    const i = this.blockAtPoint(pLocal);
    if (i < 0) return false;
    this.undoStack.push(JSON.stringify(this.data.blocks));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.sel.delete(i);
    this.data.blocks.splice(i, 1);
    sfx.remove();
    this.rebuild();
    return true;
  }
  paintAtPoint(pLocal) {
    const i = this.blockAtPoint(pLocal);
    if (i < 0) return;
    this.data.blocks[i].c = this.color;
    this.rebuild();
    sfx.click();
  }

  /* selección */
  selectAt(pLocal, additive) {
    const i = this.blockAtPoint(pLocal);
    if (!additive) this.sel.clear();
    if (i >= 0) {
      if (this.sel.has(i)) this.sel.delete(i); else this.sel.add(i);
      sfx.click();
    }
    this.rebuild();
  }
  selBB() {
    const bb = new THREE.Box3();
    for (const i of this.sel) {
      const a = blockAABB(this.data.blocks[i]);
      bb.union(new THREE.Box3().setFromPoints([a.min, a.max]));
    }
    return bb;
  }
  moveSelection(dx, dy, dz) {
    if (!this.sel.size) return;
    this.undoStack.push(JSON.stringify(this.data.blocks));
    for (const i of this.sel) {
      const b = this.data.blocks[i];
      b.x += dx; b.y += dy; b.z += dz;
    }
    this.rebuild(); sfx.place();
  }
  rotateSelection(axis) {
    if (!this.sel.size) return;
    this.undoStack.push(JSON.stringify(this.data.blocks));
    for (const i of this.sel) {
      const b = this.data.blocks[i];
      if (axis === 0) b.o[0] = (b.o[0] + 1) % 4;
      else if (axis === 1) b.o[1] = (b.o[1] + 1) % 4;
      else b.o[2] = (b.o[2] + 1) % 2;
    }
    this.rebuild(); sfx.place();
  }
  deleteSelection() {
    if (!this.sel.size) return;
    this.undoStack.push(JSON.stringify(this.data.blocks));
    this.data.blocks = this.data.blocks.filter((b, i) => !this.sel.has(i));
    this.sel.clear();
    this.rebuild(); sfx.remove();
  }
  duplicateSelection() {
    if (!this.sel.size) { toast('Selecciona piezas primero (herramienta Seleccionar)'); return; }
    this.undoStack.push(JSON.stringify(this.data.blocks));
    const news = [];
    for (const i of this.sel) {
      const b = this.data.blocks[i];
      news.push({ ...JSON.parse(JSON.stringify(b)), y: b.y + 2 });
    }
    const base = this.data.blocks.length;
    this.data.blocks.push(...news);
    this.sel.clear();
    for (let i = base; i < this.data.blocks.length; i++) this.sel.add(i);
    this.rebuild(); sfx.spawn();
    toast('Duplicado 2 celdas hacia arriba');
  }
  copySel() {
    if (!this.sel.size) return;
    this.clipboard = [...this.sel].map(i => JSON.parse(JSON.stringify(this.data.blocks[i])));
    toast(`Copiadas ${this.clipboard.length} piezas`);
  }
  pasteSel() {
    if (!this.clipboard || !this.clipboard.length) return;
    const t = this.targetCell;
    if (!t) { toast('Apunta a un sitio para pegar'); return; }
    this.undoStack.push(JSON.stringify(this.data.blocks));
    let mnx = 1e9, mny = 1e9, mnz = 1e9;
    for (const b of this.clipboard) { mnx = Math.min(mnx, b.x); mny = Math.min(mny, b.y); mnz = Math.min(mnz, b.z); }
    for (const b of this.clipboard) {
      this.data.blocks.push({ p: b.p, x: t[0] + (b.x - mnx), y: t[1] + (b.y - mny), z: t[2] + (b.z - mnz), o: [...b.o], c: b.c });
    }
    this.rebuild(); sfx.spawn();
  }

  /* ---------- rebuild visual ---------- */
  rebuild() {
    if (!this.group) return;
    while (this.group.children.length) {
      const c = this.group.children.pop();
      this.disposeGroup(c);
    }
    this.blockMeshes = [];
    for (const b of this.data.blocks) {
      const idx = this.blockMeshes.length;
      const g = instPart(b.p, b.c);
      if (this.sel.has(idx)) g.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
      g.position.copy(blockCenter(b));
      g.quaternion.copy(orientQuat(b.o));
      this.group.add(g);
      this.blockMeshes.push(g);
    }
    this.rebuildSelOutline();
    this.updateMetaUI();
  }
  rebuildSelOutline() {
    if (!this.outline) {
      this.outline = new THREE.Box3Helper(new THREE.Box3(), 0xffd23f);
      this.game.scene.add(this.outline);
    }
    if (!this.sel.size) { this.outline.visible = false; return; }
    this.outline.box.copy(this.selBB());
    this.outline.box.translate(this.padPos);
    this.outline.visible = true;
  }

  updateMetaUI() {
    if (!this.elMeta) return;
    const mass = totalMass(this.data.blocks);
    this.elMeta.textContent = `${this.data.blocks.length} piezas · ${mass.toFixed(0)} kg`;
  }

  /* ================= frame ================= */
  update(dt) {
    if (!this.active) return;
    // orbit
    const sens = .0042 * settings.data.mouseSensitivity * settings.data.camSensitivity;
    if (input.mouse.buttons & 2) {
      this.orbit.yaw -= input.mouse.dx * sens;
      this.orbit.pitch = clamp(this.orbit.pitch + input.mouse.dy * sens * (settings.data.invertY ? -1 : 1), .06, 1.45);
    }
    this.orbit.dist = clamp(this.orbit.dist * (1 + input.mouse.wheel * .09), 6, 90);

    const bb = this.bounds();
    const tc = bb.isEmpty() ? new THREE.Vector3(0, 1.5, 0) : bb.getCenter(new THREE.Vector3()).multiplyScalar(1).add(new THREE.Vector3(0, .5, 0));
    this.orbit.target.lerp(tc, .12);
    const o = this.orbit;
    const cam = this.game.camera;
    cam.position.set(
      this.padPos.x + o.target.x + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
      this.padPos.y + o.target.y + Math.sin(o.pitch) * o.dist,
      this.padPos.z + o.target.z + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist
    );
    cam.lookAt(this.padPos.x + o.target.x, this.padPos.y + o.target.y, this.padPos.z + o.target.z);

    // raycast
    this.ray.setFromCamera(new THREE.Vector2(input.mouse.ndx, input.mouse.ndy), cam);
    const meshes = [];
    for (const m of this.blockMeshes) meshes.push(m);
    const hits = meshes.length ? this.ray.intersectObjects(meshes, true) : [];
    let cell = null, ghostOK = true, blockHit = null;
    if (hits.length) {
      const h = hits[0];
      const pl = this.group.worldToLocal(h.point.clone());
      const nW = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      const nL = nW.clone().applyQuaternion(this.group.quaternion.clone().invert());
      const base = pl.clone().addScaledVector(nL, -.02);
      cell = [this.quant(base.x + nL.x * .52), this.quant(base.y + nL.y * .52), this.quant(base.z + nL.z * .52)];
      blockHit = this.group.worldToLocal(h.point.clone());
    } else {
      const gp = this.rayTerrain();
      if (gp) {
        const pl = this.group.worldToLocal(gp.clone());
        cell = [this.quant(pl.x), this.quant(pl.y + .5), this.quant(pl.z)];
      }
    }
    this.targetCell = cell;

    // ghost
    if (this.tool === 'place' && cell) {
      const part = PART[this.partId];
      const key = this.partId + '|' + this.color;
      let g = this.ghostCache.get(key);
      if (!g) {
        g = instPart(this.partId, this.color);
        this.ghostCache.set(key, g);
        this.ghostRoot.add(g);
      }
      for (const o2 of this._allGhosts()) o2.visible = (o2 === g);
      const q = orientQuat(this.orient);
      const c2 = new THREE.Vector3((part.size[0] - 1) / 2, (part.size[1] - 1) / 2, (part.size[2] - 1) / 2).applyQuaternion(q);
      g.position.copy(this.group.position).add(new THREE.Vector3(cell[0] + c2.x, cell[1] + c2.y, cell[2] + c2.z));
      g.quaternion.copy(q);
      const chk = this.canPlace(part, cell[0], cell[1], cell[2], this.orient);
      ghostOK = chk.ok;
      this.ghostOK = ghostOK;
    } else {
      for (const o2 of this._allGhosts()) o2.visible = false;
    }

    // acciones del ratón
    const now = performance.now();
    const lmb = (input.mouse.buttons & 1) !== 0;
    const lmbDown = input.rawPressed('Mouse0');
    if (lmb && cell) {
      if (this.tool === 'place' && (lmbDown || now - this.lastPlace > 150)) {
        this.tryPlace(cell[0], cell[1], cell[2], !lmbDown);
        this.lastPlace = now;
        this.lastPlaced = cell.join(',');
      }
      if (this.tool === 'delete' && (lmbDown || now - this.lastPlace > 190)) {
        if (blockHit && this.removeAtPoint(blockHit)) this.lastPlace = now;
      }
      if (this.tool === 'paint' && (lmbDown || now - this.lastPlace > 140)) {
        if (blockHit) { this.paintAtPoint(blockHit); this.lastPlace = now; }
      }
      if (this.tool === 'select' && lmbDown && blockHit) this.selectAt(blockHit, input.rawDown('ShiftLeft') || input.rawDown('ShiftRight'));
    }
    if (this.tool === 'delete' || this.tool === 'paint' || this.tool === 'select') {
      this.rebuildSelOutline();
    } else if (this.outline) this.outline.visible = this.sel.size > 0 ? true : false;

    // teclado del editor
    if (input.rawPressed('KeyR')) { this.orient[0] = (this.orient[0] + 1) % 4; sfx.click(); }
    if (input.rawPressed('KeyT')) { this.orient[1] = (this.orient[1] + 1) % 4; sfx.click(); }
    if (input.rawPressed('KeyV')) { this.orient[2] = this.orient[2] ? 0 : 1; sfx.click(); }
    if (input.rawPressed('KeyX')) { this.setTool(this.tool === 'delete' ? 'place' : 'delete'); }
    const ctrl = input.rawDown('ControlLeft') || input.rawDown('ControlRight');
    if (ctrl && input.rawPressed('KeyZ')) this.undo();
    if (ctrl && (input.rawPressed('KeyY') || (input.rawPressed('KeyZ') && input.rawDown('ShiftLeft')))) this.redo();
    if (this.tool === 'select') {
      if (input.rawPressed('Delete')) this.deleteSelection();
      if (ctrl && input.rawPressed('KeyC')) this.copySel();
      if (ctrl && input.rawPressed('KeyV')) this.pasteSel();
      // movimiento por flechas relativo a la cámara
      const fwd = new THREE.Vector3(Math.round(Math.cos(this.orbit.yaw)), 0, Math.round(Math.sin(this.orbit.yaw)));
      const right = new THREE.Vector3(-Math.sin(this.orbit.yaw), 0, Math.cos(this.orbit.yaw)).round();
      if (input.rawPressed('ArrowUp')) this.moveSelection(fwd.x * step, 0, fwd.z * step);
      if (input.rawPressed('ArrowDown')) this.moveSelection(-fwd.x * step, 0, -fwd.z * step);
      if (input.rawPressed('ArrowLeft')) this.moveSelection(-right.x * step, 0, -right.z * step);
      if (input.rawPressed('ArrowRight')) this.moveSelection(right.x * step, 0, right.z * step);
      if (input.rawPressed('PageUp')) this.moveSelection(0, step, 0);
      if (input.rawPressed('PageDown')) this.moveSelection(0, -step, 0);
    }
  }

  _allGhosts() { return [...this.ghostCache.values()]; }

  rayTerrain() {
    const ray = this.ray.ray;
    let t = 4;
    let prev = ray.origin.y - this.game.terrain.sampleHeight(ray.origin.x, ray.origin.z);
    while (t < 420) {
      const p = ray.at(t, new THREE.Vector3());
      const h = this.game.terrain.sampleHeight(p.x, p.z);
      if (p.y <= h) {
        let lo = t - 1.2, hi = t;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) / 2;
          const pm = ray.at(mid, new THREE.Vector3());
          if (pm.y <= this.game.terrain.sampleHeight(pm.x, pm.z)) hi = mid; else lo = mid;
        }
        return ray.at((lo + hi) / 2, new THREE.Vector3());
      }
      t += 1.4;
    }
    return null;
  }

  /* ================= interfaz ================= */
  buildUI() {
    const r = this.root;
    r.innerHTML = `
      <div class="b-top">
        <input id="b-name" type="text" placeholder="Nombre de tu máquina" value="${this.data.name || ''}">
        <span id="b-meta" class="hud-loc clickable" style="pointer-events:none"></span>
        <div style="flex:1"></div>
        <button class="btn small" id="b-sym">Simetría ✦</button>
        <button class="btn small" id="b-snap">Rejilla</button>
        <button class="btn small" id="b-undo">↩ Deshacer</button>
        <button class="btn small" id="b-redo">↪ Rehacer</button>
        <button class="btn small primary" id="b-save">💾 Guardar</button>
        <button class="btn small primary" id="b-test">▶ Probar</button>
        <button class="btn small" id="b-exit">Salir</button>
      </div>
      <div class="b-cat">
        <div class="tabs" id="b-tabs"></div>
        <div class="plist" id="b-plist"></div>
      </div>
      <div class="b-right pprops" id="b-props"></div>
      <div class="b-tools" id="b-tools"></div>
      <div class="b-help">LMB colocar/borrar/pintar/seleccionar · R/T/V rotar · X borrar · Ctrl+Z/Y · Ctrl+C/V · Flechas mueven selección · Esc pausa</div>
    `;
    document.getElementById('b-name').addEventListener('input', e => { this.data.name = e.target.value; });
    document.getElementById('b-save').onclick = () => { this.data.name = document.getElementById('b-name').value; this.game.saveCreation(exportData(this.data)); };
    document.getElementById('b-test').onclick = () => { this.data.name = document.getElementById('b-name').value; this.game.testFromBuilder(exportData(this.data)); };
    document.getElementById('b-exit').onclick = () => this.game.exitBuilder(false);
    document.getElementById('b-undo').onclick = () => this.undo();
    document.getElementById('b-redo').onclick = () => this.redo();
    document.getElementById('b-sym').onclick = () => { this.symmetry = !this.symmetry; document.getElementById('b-sym').classList.toggle('active', this.symmetry); sfx.click(); };
    document.getElementById('b-snap').onclick = () => { this.snap = !this.snap; this.gridScale = this.snap ? 1 : .5; document.getElementById('b-snap').classList.toggle('active', !this.snap); sfx.click(); };
    this.elMeta = document.getElementById('b-meta');

    const toolsEl = document.getElementById('b-tools');
    const tools = [
      ['place', '🔧 Colocar'], ['delete', '🗑 Borrar'], ['paint', '🎨 Pintar'], ['select', '☑ Seleccionar'],
    ];
    for (const [t, label] of tools) {
      const b = document.createElement('button');
      b.className = 'btn tool'; b.dataset.tool = t; b.textContent = label;
      b.onclick = () => { this.setTool(t); sfx.click(); };
      toolsEl.appendChild(b);
    }
    const sep = () => { const s = document.createElement('span'); s.className = 'lbl'; s.textContent = '|'; toolsEl.appendChild(s); };
    sep();
    const gridScales = [['Fina', .5], ['Media', 1], ['Gruesa', 2]];
    for (const [name, v] of gridScales) {
      const b = document.createElement('button');
      b.className = 'btn tool'; b.textContent = name;
      b.onclick = () => { this.gridScale = v; this.snap = v >= 1; this.el_meta_grid(b); sfx.click(); };
      toolsEl.appendChild(b);
    }
    sep();
    const dup = document.createElement('button'); dup.className = 'btn tool'; dup.textContent = '⧉ Duplicar';
    dup.onclick = () => this.duplicateSelection(); toolsEl.appendChild(dup);
    const rot = document.createElement('button'); rot.className = 'btn tool'; rot.textContent = ' ⟳ Rotar selección';
    rot.onclick = () => this.rotateSelection(0); toolsEl.appendChild(rot);
    const delS = document.createElement('button'); delS.className = 'btn tool'; delS.textContent = '✕ Quitar selección';
    delS.onclick = () => this.deleteSelection(); toolsEl.appendChild(delS);

    this.setTool('place');
    this.showCategory('EST');
    this.renderColors();
  }

  el_meta_grid(btn) {
    document.querySelectorAll('#b-tools .btn.tool').forEach(b => { if (['Fina', 'Media', 'Gruesa'].includes(b.textContent.trim())) b.classList.remove('active'); });
    btn.classList.add('active');
    this.rebuildGrid();
  }
  rebuildGrid() {
    if (!this.grid) return;
    this.game.scene.remove(this.grid);
    this.grid.geometry.dispose();
    const span = 40;
    this.grid = new THREE.GridHelper(span, span / this.gridScale, 0x39597a, 0x24384c);
    this.grid.position.copy(this.padPos).setY(this.padPos.y + .03);
    this.game.scene.add(this.grid);
  }

  showCategory(catId) {
    const tabs = document.getElementById('b-tabs');
    const list = document.getElementById('b-plist');
    if (!tabs || !list) return;
    tabs.innerHTML = '';
    for (const c of CATS) {
      const b = document.createElement('button');
      b.className = c.id === catId ? 'on' : '';
      b.textContent = `${c.icon} ${c.name}`;
      b.onclick = () => { sfx.hover(); this.showCategory(c.id); };
      tabs.appendChild(b);
    }
    list.innerHTML = '';
    for (const p of PARTS_BY_CAT(catId)) {
      const d = document.createElement('div');
      d.className = 'pitem' + (p.id === this.partId ? ' sel' : '');
      const src = makeThumb(p.id);
      d.innerHTML = `<img draggable="false" src="${src}"><div class="n">${p.name}</div>`;
      d.onclick = () => { this.partId = p.id; this.tool = 'place'; this.setTool('place'); sfx.click(); this.showCategory(catId); this.renderPartInfo(p); };
      list.appendChild(d);
    }
  }

  renderColors() {
    const el = document.querySelector('.color-row');
    if (!el) return;
    el.innerHTML = '';
    for (const c of PALETTE) {
      const s = document.createElement('div');
      s.className = 'swatch' + (c === this.color ? ' on' : '');
      s.style.background = c; s.dataset.c = c;
      s.onclick = () => this.setColor(c);
      el.appendChild(s);
    }
  }

  renderPartInfo(p) {
    const el = document.getElementById('b-props');
    if (!el) return;
    const rgbText = p.color || '#d0813c';
    el.innerHTML = `
      <div class="nm">${p.name}</div>
      <div class="cat">${(CATS.find(c => c.id === p.cat) || {}).name || ''}</div>
      <div class="stats">
        <span>Peso <b>${p.mass} kg</b></span>
        <span>Tamaño <b>${p.size.join('×')}</b></span>
        <span>Función <b>${fnName(p)}</b></span>
        <span>Pieza nº <b>#${PARTS_INDEX(p.id)}</b></span>
      </div>
      <div class="fn">${p.fn}</div>
      <div class="color-row"></div>
      <div class="row" style="margin-top:10px">
        <input id="b-rgb" type="text" value="${this.color}" style="flex:1;text-transform:uppercase">
        <button class="btn small" id="b-rgbset">Aplicar</button>
      </div>`;
    this.renderColors();
    document.getElementById('b-rgbset').onclick = () => {
      const v = document.getElementById('b-rgb').value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { this.setColor(v); sfx.click(); } else toast('Color HEX inválido (ej. #d0813c)');
    };
    this.renderPartInfoFn = () => this.renderPartInfo(p);
  }
  setTool(t) {
    this.tool = t;
    document.querySelectorAll('#buildRoot .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  }
  setColor(hex) {
    this.color = hex;
    document.querySelectorAll('#buildRoot .swatch').forEach(s => s.classList.toggle('on', s.dataset.c === hex));
    const rgb = document.getElementById('b-rgb');
    if (rgb) rgb.value = hex;
  }
  inputKey(a) { return a; }
}

function hl(part, i) { return Math.max(part.size[0], part.size[2]); }

function PARTS_BY_CAT(cat) { return PARTS.filter(p => p.cat === cat); }
function PARTS_INDEX(id) { return PARTS.findIndex(p => p.id === id) + 1; }
function fnName(p) {
  const pr = p.props || {};
  if (pr.wheel) return pr.steer ? 'Dirección' : 'Rodadura';
  if (pr.engine) return 'Potencia';
  if (pr.wing) return 'Sustentación';
  if (pr.rotor) return 'Ascenso';
  if (pr.airProp) return 'Empuje aire';
  if (pr.waterProp) return 'Empuje agua';
  if (pr.thruster) return 'Propulsión';
  if (pr.buoy) return 'Flotación';
  if (pr.seat) return 'Cabina';
  if (pr.light) return 'Iluminación';
  if (pr.hinge) return 'Articulación';
  if (pr.piston) return 'Empuje lineal';
  if (pr.sensor) return 'Detección';
  return 'Estructura';
}
function exportData(d) { return d; }
