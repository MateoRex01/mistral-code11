import * as THREE from 'three';
import { toast } from '../core/utils.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { sfx } from '../core/sound.js';
import { storage } from '../core/save.js';

/* Editor de mundos: modifica terreno y coloca objetos sobre el mapa activo. */
const TOOLS = [
  { id: 'pine', label: '🌲 Pino', kind: 'prop' },
  { id: 'palm', label: '🌴 Palmera', kind: 'prop' },
  { id: 'cactus', label: '🌵 Cactus', kind: 'prop' },
  { id: 'rock', label: '🪨 Roca', kind: 'prop' },
  { id: 'factory', label: '🏭 Fábrica', kind: 'prop' },
  { id: 'warehouse', label: '🏚 Nave', kind: 'prop' },
  { id: 'crane', label: '🏗 Grúa', kind: 'prop' },
  { id: 'cone', label: '🛑 Conos', kind: 'prop' },
  { id: 'raise', label: '⬆ Subir', kind: 'brush' },
  { id: 'lower', label: '⬇ Bajar', kind: 'brush' },
  { id: 'flat', label: '🟰 Nivelar', kind: 'brush' },
  { id: 'erase', label: '🧹 Borrar', kind: 'brush' },
];

export class WorldEditor {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('buildRoot');
    this.active = false;
    this.tool = 'raise';
    this.brush = 16;
    this.strength = 6;
    this.orbit = { yaw: .8, pitch: .5, dist: 60, target: new THREE.Vector3() };
    this.ray = new THREE.Raycaster();
    this.marker = null;
    this.lastApply = 0;
    this.edited = false;
  }

  enter() {
    this.active = true;
    this.edited = false;
    this.orbit.target.copy(this.game.camera.position).multiplyScalar(0).set(this.game.spawnPoint.x, this.game.terrain.sampleHeight(this.game.spawnPoint.x, this.game.spawnPoint.z), this.game.spawnPoint.z);
    this.orbit.dist = 60;
    this.buildUI();
    if (!this.marker) {
      this.marker = new THREE.Mesh(new THREE.RingGeometry(1, 1.35, 26),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .8, side: THREE.DoubleSide }));
      this.marker.rotation.x = -Math.PI / 2;
      this.game.scene.add(this.marker);
      this.markerGhost = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 26),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35, side: THREE.DoubleSide }));
      this.markerGhost.rotation.x = -Math.PI / 2;
      this.game.scene.add(this.markerGhost);
    }
    this.marker.visible = this.markerGhost.visible = true;
    toast('Editor de mundos: pincel LMB · derecha orbita · rueda zoom', 4200);
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.root.innerHTML = '';
    if (this.marker) { this.marker.visible = false; this.markerGhost.visible = false; }
  }

  buildUI() {
    const r = this.root;
    const btns = TOOLS.map(t => `<button class="btn tool ${t.id === this.tool ? 'active' : ''}" data-tool="${t.id}">${t.label}</button>`).join('');
    r.innerHTML = `
      <div class="b-top">
        <div class="hud-loc">Editor de mundos</div>
        <div style="flex:1"></div>
        <input id="we-name" type="text" placeholder="Nombre del mundo" value="${this.game.mapName} (edit.)" style="width:220px">
        <button class="btn small primary" id="we-save">💾 Guardar mundo</button>
        <button class="btn small" id="we-exit">✕ Salir</button>
      </div>
      <div class="b-tools">
        ${btns}
        <span class="lbl">Pincel</span>
        <input id="we-brush" type="range" min="6" max="46" value="${this.brush}" style="width:110px">
        <span class="lbl">Fuerza</span>
        <input id="we-str" type="range" min="1" max="18" value="${this.strength}" style="width:110px">
        <span class="lbl">Agua</span>
        <input id="we-water" type="range" min="-40" max="20" value="${this.game.env.waterY}" style="width:110px">
      </div>`;
    document.querySelectorAll('#buildRoot .tool').forEach(b => {
      b.onclick = () => {
        this.tool = b.dataset.tool;
        document.querySelectorAll('#buildRoot .tool').forEach(x => x.classList.toggle('active', x.dataset.tool === this.tool));
        sfx.click();
      };
    });
    document.getElementById('we-brush').oninput = e => this.brush = +e.target.value;
    document.getElementById('we-str').oninput = e => this.strength = +e.target.value;
    document.getElementById('we-water').oninput = e => { this.game.env.setWater(+e.target.value); this.edited = true; };
    document.getElementById('we-save').onclick = () => this.save();
    document.getElementById('we-exit').onclick = () => this.game.stopWorldEditor();
  }

  save() {
    const name = document.getElementById('we-name').value || 'Mundo sin nombre';
    const spec = {
      id: this.game.customMapId || storage.newId(),
      name,
      baseMapId: this.game.mapId,
      waterLevel: this.game.env.waterY,
      props: this.game.props.serialized(),
      heights: Array.from(this.game.terrain.heights, v => Math.round(v * 10) / 10),
    };
    if (storage.saveMap(spec)) toast('Mundo guardado: ' + name); else toast('No se pudo guardar (almacenamiento lleno)');
    this.edited = false;
    this.game.customMapId = spec.id;
  }

  update(dt) {
    if (!this.active) return;
    const cam = this.game.camera;
    const sens = settings.data.mouseSensitivity * .0042;
    if (input.mouse.buttons & 2) {
      this.orbit.yaw -= input.mouse.dx * sens;
      this.orbit.pitch = Math.max(.1, Math.min(1.4, this.orbit.pitch + input.mouse.dy * sens));
    }
    this.orbit.dist = Math.max(10, Math.min(220, this.orbit.dist * (1 + input.mouse.wheel * .09)));
    const t = this.orbit.target;
    cam.position.set(
      t.x + Math.cos(this.orbit.yaw) * Math.cos(this.orbit.pitch) * this.orbit.dist,
      t.y + Math.sin(this.orbit.pitch) * this.orbit.dist,
      t.z + Math.sin(this.orbit.yaw) * Math.cos(this.orbit.pitch) * this.orbit.dist
    );
    cam.lookAt(t);

    this.ray.setFromCamera(new THREE.Vector2(input.mouse.ndx, input.mouse.ndy), cam);
    const hit = this.terrainHit();
    if (hit) {
      this.marker.position.set(hit.x, hit.y + .1, hit.z);
      this.markerGhost.position.set(hit.x, hit.y + .15, hit.z);
      this.marker.scale.setScalar(this.tool.startsWith('prop') || this.tool === 'erase' ? 1.6 : this.brush / 16 * 4);
      this.markerGhost.scale.setScalar(this.marker.scale.x * 1.25);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normalIndex === 1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0));
      this.marker.rotation.set(-Math.PI / 2, 0, 0);
    } else {
      this.marker.visible = this.markerGhost.visible = false;
      return;
    }
    this.marker.visible = this.markerGhost.visible = true;

    const lmb = (input.mouse.buttons & 1) && (input.rawPressed('Mouse0') || performance.now() - this.lastApply > 140);
    if (!lmb) return;
    this.lastApply = performance.now();
    const tool = this.tool;
    if (tool === 'raise') { this.game.terrain.editHeight(hit.x, hit.z, this.strength, this.brush); this.edited = true; }
    else if (tool === 'lower') { this.game.terrain.editHeight(hit.x, hit.z, -this.strength, this.brush); this.edited = true; }
    else if (tool === 'flat') { this.game.terrain.flattenAt(hit.x, hit.z, this.brush); this.edited = true; sfx.place(); }
    else if (tool === 'erase') {
      const spec = this.game.props.serialized();
      const keep = spec.filter(p => Math.hypot(p.x - hit.x, p.z - hit.z) > 5);
      if (keep.length !== spec.length) {
        this.game.props.reset();
        for (const p of keep) {
          if (p.t === 'pineT') this.game.props.pine(p.x, p.z, p.s);
          else if (p.t === 'palmT') this.game.props.palm(p.x, p.z, p.s);
          else Props_readd(this.game.props, p);
        }
        this.game.props.finalize();
        this.edited = true;
        sfx.remove();
      }
    } else {
      const y = hit.y;
      const props = this.game.props;
      if (tool === 'pine') props.pine(hit.x, hit.z, 1);
      else if (tool === 'palm') props.palm(hit.x, hit.z, 1);
      else if (tool === 'cactus') props.cactus(hit.x, hit.z, 1);
      else if (tool === 'rock') props.rock(hit.x, hit.z, 1);
      else if (tool === 'factory') props.factory(hit.x, hit.z, y - .1, Math.random() < .5);
      else if (tool === 'warehouse') props.warehouse(hit.x, hit.z, y - .1, Math.random() < .5);
      else if (tool === 'crane') props.crane(hit.x, hit.z, y);
      else if (tool === 'cone') props.cone(hit.x, hit.z, y, 6);
      props.finalize();
      this.edited = true;
      sfx.place();
    }
  }

  terrainHit() {
    this.ray.setFromCamera(new THREE.Vector2(input.mouse.ndx, input.mouse.ndy), this.game.camera);
    const ray = this.ray.ray;
    let t = 2;
    while (t < 600) {
      const p = ray.at(t, new THREE.Vector3());
      const h = this.game.terrain.sampleHeight(p.x, p.z);
      if (p.y <= h) {
        let lo = Math.max(0, t - 2), hi = t;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          const pm = ray.at(mid, new THREE.Vector3());
          if (pm.y <= this.game.terrain.sampleHeight(pm.x, pm.z)) hi = mid; else lo = mid;
        }
        const pt = ray.at((lo + hi) / 2, new THREE.Vector3());
        return { x: pt.x, y: this.game.terrain.sampleHeight(pt.x, pt.z), z: pt.z };
      }
      t += 2.4;
    }
    return null;
  }
}

/* re-añadir props específicos al reconstruir tras borrar */
function Props_readd(pr, p) {
  const t = p.t;
  if (t === 'pineF' || t === 'palmF') return;
  if (t === 'cactus') pr.cactus(p.x, p.z, p.s);
  else if (t === 'rock') pr.rock(p.x, p.z, p.s);
  else if (t === 'cone') pr._posAt('cone', p.x, p.z, p.y, p.s);
  else if (t === 'buoy') pr.buoy(p.x, p.z, p.y);
  else if (t === 'factory') pr.factory(p.x, p.z, p.y, p.alt);
  else if (t === 'warehouse') pr.warehouse(p.x, p.z, p.y, p.alt);
  else if (t === 'hangar') pr.hangar(p.x, p.z, p.y);
  else if (t === 'crane') pr.crane(p.x, p.z, p.y);
  else if (t === 'dock') pr.dock(p.x, p.z, p.y);
  else if (t === 'platform') pr.platform(p.x, p.z, p.y, p.s);
  else if (t === 'rockbox') pr.rockbox(p.x, p.z, p.y, p.s);
  else if (t === 'ramp') pr.ramp(p.x, p.z, p.y, p.rot);
}
