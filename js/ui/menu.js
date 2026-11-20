import * as THREE from 'three';
import { toast, fmtTime } from '../core/utils.js';
import { storage } from '../core/save.js';
import { settings, defaults } from '../core/settings.js';
import { defaultBindings, input } from '../core/input.js';
import { sfx } from '../core/sound.js';
import { gallery } from '../parts/gallery.js';
import { totalMass } from '../parts/catalog.js';
import { makeThumb } from '../build/builder.js';

/* ==================== MENÚ PRINCIPAL ==================== */
export class MainMenu {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('menuRoot');
    this.subOpen = false;
  }

  show() {
    this.root.style.display = 'flex';
    this.root.innerHTML = '';
    const left = document.createElement('div');
    left.className = 'menu-left';
    left.innerHTML = `
      <div class="logo"><b>MEKANIK</b><span>taller de máquinas</span></div>
      <div class="tagline">Construye casi cualquier máquina pieza a pieza. Conduce, vuela o navega.</div>
      <nav class="mnav">
        ${[['play', '▶ Jugar'], ['sandbox', '🧰 Sandbox'], ['creations', '📁 Mis creaciones'], ['gallery', '🚗 Galería de vehículos'], ['weditor', '🌍 Editor de mundos'], ['settings', '⚙️ Ajustes'], ['credits', 'ℹ Créditos']]
          .map(([id, label]) => `<button class="btn" data-m="${id}">${label}</button>`).join('')}
      </nav>
      <div class="menu-foot">v1.0 · Three.js + cannon-es · todo se ejecuta en tu navegador</div>`;
    this.root.appendChild(left);
    left.querySelectorAll('button[data-m]').forEach(b => {
      b.onmouseenter = () => sfx.hover();
      b.onclick = () => { sfx.click(); this.openSub(b.dataset.m); };
    });
  }

  closeSub() {
    const el = document.querySelector('.subpanel');
    if (el) { el.classList.remove('open'); setTimeout(() => el.remove(), 360); }
    this.subOpen = false;
  }

  openSub(name) {
    this.closeSub();
    const sp = document.createElement('div');
    sp.className = 'subpanel';
    sp.innerHTML = '<button class="btn small sub-close">✕</button>';
    sp.querySelector('.sub-close').onclick = () => this.closeSub();
    document.body.appendChild(sp);
    requestAnimationFrame(() => sp.classList.add('open'));
    this.subOpen = true;
    const body = document.createElement('div');
    sp.appendChild(body);
    const G = this.game;
    ({ play: () => this.mapPicker(body, m => G.startSandbox(m, null)),
       sandbox: () => this.mapPicker(body, m => G.startSandbox(m, null, true)),
       creations: () => this.creations(body),
       gallery: () => this.showGallery(body),
       weditor: () => this.mapPicker(body, m => G.startWorldEditor(m)),
       settings: () => this.settingsPanel(body),
       credits: () => this.credits(body),
    })[name]();
  }

  /* ---------- selector de mapa ---------- */
  mapPicker(body, cb) {
    body.innerHTML = `<h2>Elige un escenario</h2><div class="hint">Mapas con Dimensiones amplias y exploración libre. Tus mundos editados aparecen abajo.</div>`;
    const grid = document.createElement('div');
    grid.className = 'map-picker';
    for (const m of this.game.MAPS) {
      const d = document.createElement('div');
      d.className = 'mp';
      d.innerHTML = `<div class="ic">${m.icon}</div><div class="nm">${m.name}</div><div class="ds">${m.desc}</div>`;
      d.onclick = () => { sfx.click(); this.closeSub(); cb(m.id); };
      grid.appendChild(d);
    }
    body.appendChild(grid);
    const customs = storage.listMaps();
    if (customs.length) {
      body.insertAdjacentHTML('beforeend', `<h3 class="sec">Mis mundos</h3><div class="map-picker" id="mp-custom"></div>`);
      const cc = body.querySelector('#mp-custom');
      for (const m of customs) {
        const d = document.createElement('div');
        d.className = 'mp';
        d.innerHTML = `<div class="ic">🗺️</div><div class="nm">${m.name}</div><div class="ds">Personal · ${m.baseMapId}</div>`;
        d.onclick = () => { sfx.click(); this.closeSub(); cb('custom:' + m.id); };
        d.oncontextmenu = e => { e.preventDefault(); storage.deleteMap(m.id); toast('Mundo eliminado'); d.remove(); };
        cc.appendChild(d);
      }
    }
  }

  /* ---------- mis creaciones ---------- */
  creations(body) {
    const list = storage.listCreations();
    body.innerHTML = `<h2>Mis creaciones</h2><div class="hint">Guardadas en este navegador. Clic en una tarjeta para acciones.</div>
      <div class="row" style="margin-bottom:10px"><button class="btn small" id="cr-import">📥 Importar JSON</button></div>`;
    body.querySelector('#cr-import').onclick = () => {
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = '.json,application/json';
      fi.onchange = () => {
        const f = fi.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const obj = JSON.parse(String(rd.result));
            if (!obj || !Array.isArray(obj.blocks) || !obj.blocks.length) throw new Error('bad');
            storage.saveCreation({ ...obj, id: storage.newId(), created: Date.now(), mass: totalMass(obj.blocks) });
            toast('Creación importada: ' + (obj.name || 'sin nombre'));
            this.creations(body);
          } catch { toast('Archivo de creación no válido'); }
        };
        rd.readAsText(f);
      };
      fi.click();
    };
    if (!list.length) { body.insertAdjacentHTML('beforeend', '<div class="hint">Aún no guardas nada. Abre el Sandbox y construye tu primera máquina (tecla Probar → Guardar).</div>'); return; }
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const v of list) {
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `
        ${v.thumb ? `<img draggable="false" src="${v.thumb}">` : '<div class="ph">🚙</div>'}
        <div class="nm">${v.name || 'Sin nombre'}</div>
        <div class="meta">${v.blocks.length} piezas · ${Math.round(totalMass(v.blocks))} kg · ${new Date(v.created || Date.now()).toLocaleDateString()}</div>
        <div class="acts">
          <button class="btn small" data-a="load">Cargar</button>
          <button class="btn small" data-a="dup">Duplicar</button>
          <button class="btn small" data-a="exp">⬇</button>
          <button class="btn small danger" data-a="del">🗑</button>
        </div>`;
      c.querySelector('[data-a=load]').onclick = () => {
        sfx.click(); this.closeSub();
        this.mapPickerForCreation(v);
      };
      c.querySelector('[data-a=dup]').onclick = () => {
        const copy = { ...JSON.parse(JSON.stringify(v)), id: storage.newId(), name: (v.name || 'Creación') + ' (copia)', created: Date.now() };
        storage.saveCreation(copy);
        toast('Creación duplicada');
        this.creations(body);
        sfx.click();
      };
      c.querySelector('[data-a=exp]').onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(v, null, 1)], { type: 'application/json' }));
        a.download = ((v.name || 'creacion').replace(/[\\/:*?"<>|]/g, '_')) + '.mekanika.json';
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Creación exportada'); sfx.click();
      };
      c.querySelector('[data-a=del]').onclick = () => { storage.deleteCreation(v.id); this.creations(body); sfx.remove(); };
      cards.appendChild(c);
    }
    body.appendChild(cards);
  }

  mapPickerForCreation(v) {
    const sp = document.createElement('div');
    sp.className = 'subpanel open';
    sp.innerHTML = '<button class="btn small sub-close">✕</button><h2>¿Dónde cargar “' + (v.name || 'Creación') + '”?</h2><div class="hint">Elige el escenario y aparecerá tu máquina allí.</div>';
    document.body.appendChild(sp);
    sp.querySelector('.sub-close').onclick = () => this.closeSub();
    const grid = document.createElement('div');
    grid.className = 'map-picker';
    for (const m of this.game.MAPS) {
      const d = document.createElement('div');
      d.className = 'mp';
      d.innerHTML = `<div class="ic">${m.icon}</div><div class="nm">${m.name}</div>`;
      d.onclick = () => { sfx.click(); this.closeSub(); this.game.startSandbox(m.id, v); };
      grid.appendChild(d);
    }
    sp.appendChild(grid);
  }

  /* ---------- galería ---------- */
  showGallery(body) {
    const items = gallery();
    body.innerHTML = `<h2>Galería de vehículos</h2><div class="hint">Máquinas de fábrica. Cárgalas para examinarlas, modificarlas o guardarlas como tuyas.</div>`;
    const cards = document.createElement('div');
    cards.className = 'cards';
    items.forEach((v, i) => {
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `<div class="ph">${v.cat === 'Avión' ? '🛩️' : v.cat === 'Barco' ? '⛵' : v.cat === 'Helicóptero' ? '🚁' : v.cat === 'Anfibio' ? '🐊' : '🚗'}</div>
        <div class="nm">${v.name}</div><div class="meta">${v.cat} · ${v.blocks.length} piezas</div>
        <div class="acts"><button class="btn small" data-a="use">Usar en arena</button><button class="btn small" data-a="save">Guardar como mía</button></div>`;
      c.querySelector('[data-a=use]').onclick = () => {
        sfx.click(); this.closeSub();
        this.mapPickerWith((m) => this.game.startSandbox(m, { ...JSON.parse(JSON.stringify(v)), id: storage.newId() }));
      };
      c.querySelector('[data-a=save]').onclick = () => {
        const save = { id: storage.newId(), name: v.name, desc: v.desc, blocks: JSON.parse(JSON.stringify(v.blocks)), mass: 0, created: Date.now() };
        this.game.saveCreation(save, true);
        toast('Guardada en Mis creaciones');
        sfx.place();
      };
      cards.appendChild(c);
    });
    body.appendChild(cards);
  }

  mapPickerWith(cb) {
    const sp = document.querySelector('.subpanel');
    sp.innerHTML = '<button class="btn small sub-close">✕</button><h2>¿Qué escenario?</h2>';
    const grid = document.createElement('div');
    grid.className = 'map-picker';
    for (const m of this.game.MAPS) {
      const d = document.createElement('div');
      d.className = 'mp';
      d.innerHTML = `<div class="ic">${m.icon}</div><div class="nm">${m.name}</div>`;
      d.onclick = () => { sfx.click(); this.closeSub(); cb(m.id); };
      grid.appendChild(d);
    }
    sp.appendChild(grid);
  }

  /* ---------- ajustes ---------- */
  settingsPanel(body) {
    const d = settings.data;
    body.innerHTML = `<h2>Ajustes</h2><div class="hint">Todo se aplica en caliente y se guarda.</div>`;
    const row = (label, ctl) => { const r = document.createElement('div'); r.className = 'sett-row'; r.innerHTML = `<span>${label}</span>`; const c = document.createElement('div'); c.className = 'ctl'; c.appendChild(ctl); r.appendChild(c); return r; };
    const seg = (opts, cur, onSet) => {
      const s = document.createElement('div'); s.className = 'seg';
      for (const [val, label] of opts) {
        const b = document.createElement('button');
        b.textContent = label; if (String(cur) === String(val)) b.className = 'on';
        b.onclick = () => { s.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); onSet(val); sfx.click(); };
        s.appendChild(b);
      }
      return s;
    };
    const rng = (min, max, step, cur, onSet) => {
      const w = document.createElement('input'); w.type = 'range'; w.min = min; w.max = max; w.step = step; w.value = cur;
      w.style.width = '170px';
      w.oninput = () => onSet(+w.value);
      return w;
    };
    const chk = (cur, onSet) => {
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!cur;
      c.onchange = () => onSet(c.checked);
      return c;
    };
    const saveSet = () => { settings.save(); this.game.applySettings(); };
    const grp = (title) => { const s = document.createElement('div'); s.className = 'sett-group'; s.innerHTML = `<h3 class="sec">${title}</h3>`; body.appendChild(s); return s; };

    const g1 = grp('Gráficos');
    g1.appendChild(row('Calidad', seg([['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra']], d.quality, v => { d.quality = v; saveSet(); })));
    g1.appendChild(row('Resolución', seg([[.5, '50%'], [.75, '75%'], [1, '100%']], d.resolutionScale, v => { d.resolutionScale = v; saveSet(); })));
    g1.appendChild(row('Pantalla completa', chk(document.fullscreenElement, v => { if (v) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); })));
    g1.appendChild(row('Sombras', chk(d.shadows, v => { d.shadows = v; saveSet(); })));
    g1.appendChild(row('Antialiasing', chk(d.antialias, v => { d.antialias = v; settings.save(); this.game.rebuildRenderer(); toast('Antialias aplicado'); })));
    g1.appendChild(row('Distancia de renderizado', rng(200, 900, 50, d.renderDistance, v => { d.renderDistance = v; saveSet(); })));
    g1.appendChild(row('Densidad de vegetación', rng(0, 1.5, .05, d.vegetationDensity, v => { d.vegetationDensity = v; toast('Se aplicará al (re)cargar el mundo'); settings.save(); })));
    g1.appendChild(row('Efectos visuales', chk(d.visualEffects, v => { d.visualEffects = v; saveSet(); })));
    g1.appendChild(row('Límite de FPS', seg([[0, 'Libre'], [30, '30'], [60, '60']], d.fpsCap, v => { d.fpsCap = v; saveSet(); })));

    const g2 = grp('Sonido');
    g2.appendChild(row('Volumen general', rng(0, 1, .05, d.volumeMaster, v => { d.volumeMaster = v; saveSet(); })));
    g2.appendChild(row('Música', rng(0, 1, .05, d.volumeMusic, v => { d.volumeMusic = v; saveSet(); })));
    g2.appendChild(row('Efectos', rng(0, 1, .05, d.volumeSfx, v => { d.volumeSfx = v; saveSet(); })));
    g2.appendChild(row('Sonidos de vehículos', chk(d.soundVehicles, v => { d.soundVehicles = v; saveSet(); })));
    g2.appendChild(row('Sonido ambiental', chk(d.soundAmbient, v => { d.soundAmbient = v; saveSet(); })));

    const g3 = grp('Controles');
    g3.appendChild(row('Sensibilidad del ratón', rng(.3, 2.5, .05, d.mouseSensitivity, v => { d.mouseSensitivity = v; saveSet(); })));
    g3.appendChild(row('Invertir cámara vertical', chk(d.invertY, v => { d.invertY = v; saveSet(); })));
    g3.appendChild(this.bindPanel());
    g3.appendChild(row('Recargar predeterminados', (() => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Restaurar'; b.onclick = () => { settings.data.bindings = null; settings.save(); toast('Controles restablecidos'); this.settingsPanel(body); }; return b; })()));

    const g4 = grp('Jugabilidad');
    g4.appendChild(row('Tutoriales', chk(d.showTutorials, v => { d.showTutorials = v; saveSet(); })));
    g4.appendChild(row('Indicadores en pantalla', chk(d.showIndicators, v => { d.showIndicators = v; saveSet(); })));
    g4.appendChild(row('Daños físicos', chk(d.physicsDamage, v => { d.physicsDamage = v; saveSet(); })));

    const g5 = grp('Cámara');
    g5.appendChild(row('Modo preferido', seg([['first', '1ª persona'], ['third', '3ª persona'], ['free', 'Libre']], d.camera, v => { d.camera = v; saveSet(); })));
    g5.appendChild(row('Distancia de seguimiento', rng(4, 20, .5, d.camDistance, v => { d.camDistance = v; saveSet(); })));
    g5.appendChild(row('Suavidad', rng(.2, 3, .1, d.camSmooth, v => { d.camSmooth = v; saveSet(); })));
    g5.appendChild(row('Sensibilidad de órbita', rng(.3, 2.5, .05, d.camSensitivity, v => { d.camSensitivity = v; saveSet(); })));
  }

  bindPanel() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%';
    const binds = input.bindings();
    const shown = [['forward', 'Avanzar'], ['back', 'Retroceder'], ['left', 'Girar izquierda'], ['right', 'Girar derecha'], ['brake', 'Frenar / Helic. subir'], ['enter', 'Entrar/salir vehículo'], ['build', 'Abrir constructor'], ['repair', 'Reparar'], ['respawn', 'Reaparecer'], ['camera', 'Cambio de cámara'], ['map', 'Mapa'], ['pause', 'Pausa'], ['boost', 'Turbo'], ['descend', 'Descender']];
    for (const [act, label] of shown) {
      const r = document.createElement('div');
      r.className = 'sett-row';
      r.innerHTML = `<span>${label}</span>`;
      const btn = document.createElement('button');
      btn.className = 'kbd-bind';
      btn.textContent = binds[act]?.replace('Key', '').replace('Digit', '') || '—';
      btn.onclick = () => {
        btn.classList.add('wait'); btn.textContent = 'Pulsa una tecla…';
        input.bindNext(code => {
          const b = { ...(settings.data.bindings || {}) };
          b[act] = code;
          settings.data.bindings = b; settings.save();
          btn.classList.remove('wait');
          btn.textContent = code.replace('Key', '').replace('Digit', '');
          sfx.click();
        });
      };
      r.appendChild(btn);
      wrap.appendChild(r);
    }
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:var(--dim);margin-top:6px';
    note.textContent = 'Rueda sobre el botón y pulsa la tecla nueva. Escape no se puede asignar.';
    wrap.appendChild(note);
    return wrap;
  }

  /* ---------- créditos ---------- */
  credits(body) {
    body.innerHTML = `
      <h2>Créditos</h2>
      <div class="hint" style="line-height:1.8">
        <b>MEKANIK</b> — sandbox de construcción de máquinas.<br><br>
        🧱 Motor gráfico: <b>Three.js</b> (WebGL2, sombras, instancing, shaders).<br>
        ⚙️ Física: <b>cannon-es</b> (cuerpos rígidos, raycast de suspensión, bisagras motorizadas).<br>
        🔊 Audio 100% procedural con WebAudio (motor, viento, lluvia, música generativa).<br>
        🧠 Todo el código es original y propio de este proyecto. Sin assets externos.
        <br><br>Consejo: construye bajo, con motos potentes y ruedas al mismo nivel. Después… ¡rompe las reglas!
      </div>`;
  }
}

/* ==================== PAUSA / ARENA ==================== */
export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.root = null;
  }
  open() {
    if (this.root) return;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dlg panel">
      <h2>⏸ Pausa · ${this.game.mapName}</h2>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:14px">
        <button class="btn primary" id="pm-resume">▶ Reanudar</button>
        <button class="btn" id="pm-build">🧰 Constructor (B)</button>
        <button class="btn" id="pm-repair">🛠 Reparar</button>
        <button class="btn" id="pm-respawn">↻ Reaparecer</button>
      </div>
      <h3 class="sec">Mis máquinas en la arena</h3>
      <div id="pm-vehicles" class="env-list"></div>
      <h3 class="sec">Entorno</h3>
      <div class="env-list" id="pm-env"></div>
      <h3 class="sec">Reajustes rápidos</h3>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn small" id="pm-dmg">Daños: ${settings.data.physicsDamage ? 'ON' : 'OFF'}</button>
        <button class="btn small" id="pm-col">Colisiones: ${this.game.sim?.collisionsOn ? 'ON' : 'OFF'}</button>
        <button class="btn small" id="pm-limits">Límites de construcción: ${settings.data.buildLimits !== false ? 'ON' : 'OFF'}</button>
        <button class="btn small" id="pm-time">Hora: ${this.game.env.time.toFixed(1)} h</button>
      </div>
      <div class="row" style="margin-top:18px">
        <button class="btn" id="pm-settings">⚙️ Ajustes</button>
        <button class="btn danger" id="pm-exit">Salir al menú</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    this.root = ov;
    const G = this.game;

    ov.querySelector('#pm-resume').onclick = () => this.close();
    ov.querySelector('#pm-build').onclick = () => { this.close(); G.openBuilder(); };
    ov.querySelector('#pm-repair').onclick = () => { this.close(); G.repairVehicle(); };
    ov.querySelector('#pm-respawn').onclick = () => { this.close(); G.respawnVehicle(); };
    ov.querySelector('#pm-exit').onclick = () => { this.close(); G.quitToMenu(); };
    ov.querySelector('#pm-settings').onclick = () => { const m = G.mainMenu; this.close(); m.openSub('settings'); };

    const t = ov.querySelector('#pm-time');
    t.onclick = () => {
      const h = (G.env.time + 6) % 24; G.env.autoTime = false; G.env.setTime(h);
      t.textContent = 'Hora: ' + h.toFixed(1) + ' h'; sfx.click();
    };
    ov.querySelector('#pm-dmg').onclick = e => { settings.data.physicsDamage = !settings.data.physicsDamage; settings.save(); e.target.textContent = 'Daños: ' + (settings.data.physicsDamage ? 'ON' : 'OFF'); sfx.click(); };
    ov.querySelector('#pm-col').onclick = e => { G.sim.setCollisions(!G.sim.collisionsOn); e.target.textContent = 'Colisiones: ' + (G.sim.collisionsOn ? 'ON' : 'OFF'); sfx.click(); };
    ov.querySelector('#pm-limits').onclick = e => { settings.data.buildLimits = settings.data.buildLimits === false; settings.save(); e.target.textContent = 'Límites de construcción: ' + (settings.data.buildLimits !== false ? 'ON' : 'OFF'); sfx.click(); };

    this.renderVehicles();
    this.renderEnv();
  }

  renderVehicles() {
    const box = this.root.querySelector('#pm-vehicles');
    const G = this.game;
    box.innerHTML = '';
    if (!G.sim.instances.length) { box.innerHTML = '<div style="color:var(--dim);font-size:13px">No hay máquinas aún. Pulsa Constructor.</div>'; return; }
    G.sim.instances.forEach((inst, i) => {
      const des = describeLite(inst);
      const r = document.createElement('div');
      r.className = 'sett-row';
      r.style.borderBottom = '1px solid rgba(255,255,255,.06)';
      r.innerHTML = `<span>${inst.data.name || 'Máquina'} <span style="color:var(--dim);font-size:11px">· ${des}</span></span>`;
      const ctl = document.createElement('div'); ctl.className = 'ctl';
      const mkBtn = (label, fn) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = label; b.onclick = () => { fn(); sfx.click(); }; ctl.appendChild(b); };
      mkBtn('🚗 Conducir', () => { this.close(); G.enterVehicleIndex(i); });
      mkBtn('⃞ Duplicar', () => G.duplicateVehicle(i));
      mkBtn('⚑ Teleport', () => { this.close(); G.teleportVehicle(i); });
      mkBtn('🗑', () => { G.removeVehicle(i); this.renderVehicles(); });
      r.appendChild(ctl);
      box.appendChild(r);
    });
  }

  renderEnv() {
    const box = this.root.querySelector('#pm-env');
    const G = this.game;
    const row = (label, ctl) => { const r = document.createElement('div'); r.className = 'sett-row'; r.innerHTML = `<span>${label}</span>`; const c = document.createElement('div'); c.className = 'ctl'; c.appendChild(ctl); r.appendChild(c); box.appendChild(r); };
    const grav = document.createElement('input'); grav.type = 'range'; grav.min = 2; grav.max = 30; grav.step = .5; grav.value = G.envGravity || 14; grav.style.width = '150px';
    grav.oninput = () => { G.envGravity = +grav.value; G.applyGravity(); };
    row('Gravedad (m/s²)', grav);
    const hour = document.createElement('input'); hour.type = 'range'; hour.min = 0; hour.max = 24; hour.step = .2; hour.value = G.env.time; hour.style.width = '150px';
    hour.oninput = () => { G.env.autoTime = false; G.env.setTime(+hour.value); };
    row('Hora del día', hour);
    const sel = document.createElement('select'); sel.className = 'fld';
    for (const w of ['clear', 'rain', 'storm', 'fog']) sel.add(new Option({ clear: 'Despejado', rain: 'Lluvia', storm: 'Tormenta', fog: 'Niebla' }[w], w));
    sel.value = G.env.weather;
    sel.onchange = () => { G.env.setWeather(sel.value); sfx.click(); };
    row('Clima', sel);
    const autoTime = document.createElement('input'); autoTime.type = 'checkbox'; autoTime.checked = G.env.autoTime;
    autoTime.onchange = () => { G.env.autoTime = autoTime.checked; };
    row('Ciclo día/noche automático', autoTime);
  }

  close() {
    if (!this.root) return;
    this.root.remove(); this.root = null;
  }
}

function describeLite(inst) {
  const wheels = inst.wheels.length, wings = inst.wings.length, rots = inst.rotors.length;
  const bits = [];
  if (wheels) bits.push(wheels + ' ruedas');
  if (wings) bits.push(wings + ' alas');
  if (rots) bits.push('rotor');
  if (inst.seats.length) bits.push('cabina');
  return bits.join(' · ') || inst.data.blocks.length + ' piezas';
}
