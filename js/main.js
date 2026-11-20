import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { uid, clamp, lerp, damp, toast } from './core/utils.js';
import { settings } from './core/settings.js';
import { input } from './core/input.js';
import { initAudio, sfx, applyVolumes, musicTick, resumeAudio, updateEngineAudio } from './core/sound.js';
import { storage } from './core/save.js';
import { PART, totalMass } from './parts/catalog.js';
import { gallery } from './parts/gallery.js';
import { makeMaps, buildChallengeAPI } from './world/maps.js';
import { Terrain } from './world/terrain.js';
import { PropSystem } from './world/props.js';
import { Environment } from './world/environment.js';
import { WorldEditor } from './world/editor.js';
import { Builder, buildDisplay } from './build/builder.js';
import { VehicleSim } from './sim/driving.js';
import { Challenges } from './sim/challenges.js';
import { MainMenu, PauseMenu } from './ui/menu.js';
import { HUD } from './ui/hud.js';

const QE = new THREE.Quaternion();

class Game {
  constructor() {
    this.mode = 'boot'; // menu | sandbox | build | weditor
    this.MAPS = makeMaps();
    this.chAPI = buildChallengeAPI();
    this.mapId = null; this.customMapId = null; this.mapDef = null; this.mapName = '';
    this.envGravity = 14;
    this.playerName = 'Tú';
    this.seated = false;
    this.camMode = null; // null=sigue settings, 'first' | 'third'
    this.fpsAcc = 0; this.lastFpsT = performance.now(); this.frames = 0; this.fps = 60;

    this.boot();
  }

  /* ---------------- inicial ---------------- */
  boot() {
    this.initRenderer();
    // escena del menú (showroom)
    this.menuScene = new THREE.Scene();
    this.menuCamera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .1, 300);
    this.menuCamera.position.set(6.5, 2.6, 7.5);
    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x30363f, .9);
    this.menuScene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(6, 9, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.DirectionalLight(0x7799ff, 1.6); rim.position.set(-8, 3, -6);
    this.menuScene.add(key, rim);
    const podGeo = new THREE.CylinderGeometry(4.2, 4.6, .5, 40);
    const podium = new THREE.Mesh(podGeo, new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: .35, metalness: .55 }));
    podium.position.y = -.25; podium.receiveShadow = true;
    this.menuScene.add(podium);
    const grid = new THREE.GridHelper(60, 60, 0x22303f, 0x1a2430);
    grid.position.y = -.5;
    this.menuScene.add(grid);
    this.menuVehicle = null;
    this.menuYaw = 0;

    this.mainMenu = new MainMenu(this);
    this.pauseMenu = new PauseMenu(this);
    this.hud = new HUD(this);
    this.hudRoot = document.getElementById('hudRoot');
    this.player = { pos: new THREE.Vector3(), yaw: 0, vy: 0, visible: false, mesh: null };
    this.builder = new Builder(this);
    this.worldEditor = new WorldEditor(this);
    this.sim = new VehicleSim({ world: null, scene: null, env: null, terrain: null, camera: this.camera });

    input.init(document.getElementById('app'));
    window.addEventListener('pointerdown', () => { initAudio(); resumeAudio(); }, { once: false });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('keydown', () => { initAudio(); }, { once: true });

    this.mainMenu.show();
    this.loadMenuShowcase();
    setTimeout(() => document.getElementById('loading').classList.add('hide'), 700);

    this.clock = new THREE.Clock();
    this._loop = this.loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.data.antialias, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    this.renderer.domElement.id = 'gameCanvas';
    const app = document.getElementById('app');
    app.innerHTML = ''; app.appendChild(this.renderer.domElement);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.onResize();
  }

  rebuildRenderer() {
    const canvas = this.renderer.domElement;
    const rot = this.camera ? { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() } : null;
    this.renderer.dispose();
    this.initRenderer();
    if (this.camera && rot) { this.camera.position.copy(rot.pos); this.camera.quaternion.copy(rot.quat); }
  }

  applySettings() {
    const d = settings.data;
    applyVolumes();
    this.onResize();
    this.applyGravity();
    if (this.env) {
      this.env.sun.castShadow = d.shadows;
      const q = d.quality;
      const size = q === 'low' ? 512 : q === 'medium' ? 1024 : q === 'high' ? 2048 : 4096;
      this.env.sun.shadow.mapSize.set(size, size);
      if (this.env.sun.shadow.map) { this.env.sun.shadow.map.dispose(); this.env.sun.shadow.map = null; }
      this.scene.fog.far = d.renderDistance;
      if (this.camera) this.camera.far = d.renderDistance + 400;
    }
    this.camOrbitDist = d.camDistance;
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * (settings.data.resolutionScale || 1));
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.menuCamera.aspect = w / h; this.menuCamera.updateProjectionMatrix();
  }

  applyGravity() {
    if (this.world) this.world.gravity.set(0, -(this.envGravity || 14), 0);
  }

  /* ---------------- showroom del menú ---------------- */
  loadMenuShowcase() {
    if (this.menuVehicle) this.menuScene.remove(this.menuVehicle);
    const items = gallery();
    const pick = items[Math.floor(Math.random() * items.length)];
    this.menuVehicle = buildDisplay(pick);
    this.menuVehicle.position.y = .2;
    this.menuScene.add(this.menuVehicle);
    this.menuModelName = pick.name;
  }

  /* ---------------- mundo ---------------- */
  getMapDef(id) {
    if (id.startsWith('custom:')) {
      const saved = storage.listMaps().find(m => m.id === id.slice(7));
      if (!saved) return this.MAPS[0];
      const base = this.MAPS.find(m => m.id === saved.baseMapId) || this.MAPS[0];
      return { ...base, id: 'custom:' + saved.id, name: saved.name, custom: { id: saved.id, name: saved.name, baseMapId: saved.baseMapId, waterLevel: saved.waterLevel, props: saved.props, heights: saved.heights } };
    }
    return this.MAPS.find(m => m.id === id) || this.MAPS[0];
  }

  startSandbox(mapId, creation = null, showcase = false) {
    this.loadMap(mapId);
    // vehículo inicial
    if (creation) {
      this.spawnCreation(creation, new THREE.Vector3(this.spawnPoint.x, this.spawnPoint.y + 3, this.spawnPoint.z));
    } else {
      const preset = showcase ? gallery()[0] : null;
      if (preset) {
        this.spawnCreation({ ...JSON.parse(JSON.stringify(preset)), id: uid(), name: preset.name }, new THREE.Vector3(this.spawnPoint.x + 10, this.spawnPoint.y + 3, this.spawnPoint.z));
      }
    }
    this.enterSandbox();
  }

  loadMap(mapId) {
    this.clearWorld();
    this.mapId = mapId;
    this.customMapId = mapId.startsWith('custom:') ? mapId.slice(7) : null;
    this.mapDef = this.getMapDef(mapId);
    this.mapName = this.mapDef.name;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .12, settings.data.renderDistance + 600);
    this.onResize();

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -(this.envGravity), 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 10;
    this.world.defaultContactMaterial.friction = .5;
    this.world.groundMaterial = new CANNON.Material('ground');
    this.world.vehicleMaterial = new CANNON.Material('vehicle');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.world.groundMaterial, this.world.vehicleMaterial, { friction: .4, restitution: .08 }));

    this.terrain = new Terrain(this.scene, this.world, this.mapDef, this.mapDef.custom || null);
    if (this.mapDef.custom && this.mapDef.custom.heights) {
      this.terrain.heights.set(this.mapDef.custom.heights.slice());
      this.terrain.rebuildPositionsAndColors();
      this.terrain.syncPhysicsShape();
    }
    this.env = new Environment(this.scene);
    this.env.buildWater(this.scene, this.mapDef);
    this.env.autoTime = false;
    this.env.setTime(11);
    this.env.setWeather('clear');
    this.env.shadowRefs = { sun: this.env.sun };

    this.props = new PropSystem(this.scene, this.world, this.terrain, settings.data.quality);
    this.props.veggieBudget = Math.min(1, settings.data.vegetationDensity);
    this.props.waterLevel = this.mapDef.waterLevel;
    if (this.mapDef.custom) {
      for (const p of (this.mapDef.custom.props || [])) Props_loadItem(this.props, p);
      this.props.finalize();
    } else {
      const rndSeedless = ((seed) => { let s = seed * 7919; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(this.mapDef.seed);
      const api = Object.assign(Object.create(this.props), {
        cones: (x, z, y, n) => this.props.cone(x, z, y, n),
      });
      this.mapDef.scatter(rndSeedless, api);
      this.props.finalize();
    }

    const sp = this.mapDef.spawn || [0, 0];
    this.spawnPoint = new THREE.Vector3(sp[0], this.terrain.sampleHeight(sp[0], sp[1]) + 1, sp[1]);

    this.sim.world = this.world;
    this.sim.scene = this.scene;
    this.sim.env = this.env;
    this.sim.terrain = this.terrain;
    this.sim.camera = this.camera;
    this.sim.instances = [];
    this.sim.collisionsOn = true;
    this.challenges = new Challenges(this);
    this.challenges.load(this.mapDef);

    this.scene.background = null;
    this.sunShadowQuality();
  }

  sunShadowQuality() {
    const q = settings.data.quality;
    const size = { low: 512, medium: 1024, high: 2048, ultra: 4096 }[q] || 2048;
    this.env.sun.shadow.mapSize.set(size, size);
    this.env.sun.castShadow = settings.data.shadows;
    if (!settings.data.shadows) this.renderer.shadowMap.enabled = false;
    else this.renderer.shadowMap.enabled = true;
  }

  clearWorld() {
    if (this.scene) {
      this.scene.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    this.scene = null; this.world = null; this.terrain = null; this.env = null; this.props = null;
    this.sim && (this.sim.instances = []);
  }

  enterSandbox() {
    this.mode = 'sandbox';
    this.mainMenu.closeSub();
    document.getElementById('menuRoot').innerHTML = '';
    this.seated = false;
    const p = this.player;
    if (!p.mesh) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .8, 6, 12), new THREE.MeshStandardMaterial({ color: 0xe0a33f, roughness: .6 }));
      body.position.y = .95; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(.21, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8b28f, roughness: .6 }));
      head.position.y = 1.68; head.castShadow = true;
      g.add(body, head);
      p.mesh = g;
    }
    p.mesh.visible = true;
    p.pos.copy(this.spawnPoint);
    p.pos.y = this.terrain.sampleHeight(p.pos.x, p.pos.z);
    this.scene.add(p.mesh);
    this.camMode = null;
    this.camOrbit = { yaw: 0, pitch: .18, dist: settings.data.camDistance };
    this.hud.build();
    this.playerInstructions();
  }

  playerInstructions() {
    if (!settings.data.showTutorials) return;
    toast('WASD camina · E para entrar en una máquina · B crea una nueva', 6000);
  }

  quitToMenu() {
    this.mode = 'menu';
    this.builder.close();
    this.worldEditor.exit();
    this.pauseMenu.close();
    this.hud.root.innerHTML = '';
    this.clearWorld();
    this.player.mesh && (this.player.mesh.visible = false);
    this.mainMenu.show();
    this.loadMenuShowcase();
  }

  togglePause() {
    if (this.mode === 'menu') return;
    if (this.builder.active) { this.builder.close(); this.enterSandbox(); return; }
    if (this.pauseMenu.root) this.pauseMenu.close();
    else this.pauseMenu.open();
  }

  /* ---------------- vehículos ---------------- */
  spawnCreation(data, pos, yaw = 0) {
    const d = JSON.parse(JSON.stringify(data));
    d.id = d.id || uid();
    if (!d.created) d.created = Date.now();
    d.mass = totalMass(d.blocks);
    const inst = this.sim.spawn(d, pos, yaw);
    return inst;
  }

  saveCreation(data, keepOpen = false) {
    const d = JSON.parse(JSON.stringify(data));
    d.id = d.id || uid();
    d.mass = totalMass(d.blocks);
    d.created = d.created || Date.now();
    d.parts = d.blocks.length;
    d.thumb = this.captureThumb();
    const ok = storage.saveCreation(d);
    toast(ok ? `Guardado: ${d.name} (${d.parts} piezas)` : 'Error al guardar');
    sfx.place();
  }

  captureThumb() {
    this.renderer.render(this.mode === 'menu' ? this.menuScene : this.scene, this.mode === 'menu' ? this.menuCamera : this.camera);
    try {
      const src = this.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 300; c.height = 170;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, (src.width - src.height * (300 / 170)) / 2, 0, src.height * (300 / 170), src.height, 0, 0, 300, 170);
      return c.toDataURL('image/jpeg', .6);
    } catch { return null; }
  }

  updateFocus(inst) {
    for (const i of this.sim.instances) i.isFocus = (i === inst);
  }

  nearestVehicle(maxD = 8) {
    let best = null, bd = maxD;
    const ref = this.seated ? null : this.player.pos;
    for (const inst of this.sim.instances) {
      const b = inst.clusters[0].body;
      const d = ref ? Math.hypot(b.position.x - ref.x, b.position.y - ref.y, b.position.z - ref.z) : 0;
      if (d < bd) { bd = d; best = inst; }
    }
    return best;
  }

  enterVehicleIndex(i) {
    const inst = this.sim.instances[i];
    if (!inst) return;
    this.updateFocus(inst);
    this.seated = true;
    if (inst.seats.length) {
      const s = inst.seats.find(s => s.kind === 'driver') || inst.seats[0];
      this.activeSeatIdx = inst.seats.indexOf(s);
      if (this.player.mesh) this.player.mesh.visible = false;
    }
    toast('Conduciendo: ' + (inst.data.name || 'máquina') + ' · E para bajar', 2400);
  }

  exitVehicle() {
    this.seated = false;
    const inst = this.sim.instances.find(i => i.isFocus);
    if (inst) {
      const b = inst.clusters[0].body;
      this.player.pos.set(b.position.x + 2.4, b.position.y + 1.4, b.position.z + 2.4);
      if (this.player.mesh) this.player.mesh.visible = true;
      this.player.ghostExit = true;
    }
  }

  repairVehicle() {
    const inst = this.sim.instances.find(i => i.isFocus) || this.nearestVehicle(30);
    if (!inst) return toast('No hay máquina que reparar');
    const fresh = this.sim.repair(inst);
    this.updateFocus(fresh);
    toast('Máquina reparada');
  }
  respawnVehicle() {
    const inst = this.sim.instances.find(i => i.isFocus) || this.nearestVehicle(30);
    if (!inst) return toast('No hay máquina que reaparecer');
    const fresh = this.sim.respawn(inst);
    this.updateFocus(fresh);
    toast('Máquina vuelta al punto de nacimiento');
  }
  removeVehicle(i) {
    const inst = this.sim.instances[i];
    if (!inst) return;
    this.sim.remove(inst);
    toast('Vehículo eliminado');
  }
  duplicateVehicle(i) {
    const inst = this.sim.instances[i];
    if (!inst) return;
    const pos = new THREE.Vector3(inst.clusters[0].body.position.x + 6, inst.clusters[0].body.position.y + 2, inst.clusters[0].body.position.z + 6);
    const data = JSON.parse(JSON.stringify(inst.origData));
    data.id = uid(); data.name = (inst.data.name || 'Máquina') + ' II';
    const fresh = this.spawnCreation(data, pos, 0);
    toast('Vehículo duplicado');
  }
  teleportVehicle(i) {
    const inst = this.sim.instances[i];
    if (!inst) return;
    const b = inst.clusters[0].body;
    b.position.set(this.player.pos.x + 4, this.player.pos.y + 2, this.player.pos.z + 4);
    b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
    toast('Vehículo teletransportado a tu posición');
  }
  teleportFocus(x, z) {
    const inst = this.sim.instances.find(i => i.isFocus);
    if (!inst) return;
    const b = inst.clusters[0].body;
    b.position.set(x, this.terrain.sampleHeight(x, z) + 2.5, z);
    b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
  }
  toggleCamera() {
    this.camMode = this.camMode === 'first' ? 'third' : 'first';
    this.fpYaw = null;
    toast(this.camMode === 'first' ? 'Cámara: 1ª persona' : 'Cámara: 3ª persona', 1400);
  }

  /* ---------------- builder ---------------- */
  openBuilder() {
    if (this.mode !== 'sandbox') return;
    let inst = this.sim.instances.find(i => i.isFocus);
    let data, pos, yaw = 0;
    if (inst) {
      data = JSON.parse(JSON.stringify(inst.origData));
      pos = new THREE.Vector3(inst.clusters[0].body.position.x, this.terrain.sampleHeight(inst.clusters[0].body.position.x, inst.clusters[0].body.position.z), inst.clusters[0].body.position.z);
      yaw = Math.atan2(inst.clusters[0].body.quaternion.z, inst.clusters[0].body.quaternion.w) * 2;
      this.sim.remove(inst);
    } else {
      const near = this.nearestVehicle(40);
      if (near) {
        data = JSON.parse(JSON.stringify(near.origData));
        pos = new THREE.Vector3(near.clusters[0].body.position.x, this.terrain.sampleHeight(near.clusters[0].body.position.x, near.clusters[0].body.position.z), near.clusters[0].body.position.z);
        this.sim.remove(near);
      } else {
        data = { id: uid(), name: 'Mi máquina', desc: '', blocks: [{ p: 'block', x: 0, y: 1, z: 0, o: [0, 0, 0], c: '#c9553f' }], mass: 0 };
        pos = new THREE.Vector3(this.player.pos.x + 6, this.terrain.sampleHeight(this.player.pos.x + 6, this.player.pos.z - 2) + .4, this.player.pos.z - 2);
      }
    }
    this.seated = false;
    this.mode = 'build';
    if (this.player.mesh) this.player.mesh.visible = false;
    this.builder.open(data, pos, yaw);
    this.hud.root.innerHTML = '';
  }

  exitBuilder(test = false) {
    const data = this.builder.close();
    if (!data) return;
    this.mode = 'sandbox';
    if (test) {
      const pos = new THREE.Vector3(this.builder.padPos.x, this.terrain.sampleHeight(this.builder.padPos.x, this.builder.padPos.z) + 2, this.builder.padPos.z);
      const inst = this.spawnCreation(data, pos, 0);
      this.updateFocus(inst);
      this.enterVehicleIndex(this.sim.instances.indexOf(inst));
    } else {
      const pos = new THREE.Vector3(this.builder.padPos.x, this.terrain.sampleHeight(this.builder.padPos.x, this.builder.padPos.z) + 2, this.builder.padPos.z);
      this.spawnCreation(data, pos, 0);
      if (this.player.mesh) this.player.mesh.visible = true;
      this.hud.build();
    }
  }

  testFromBuilder(data) {
    this.exitBuilder(true);
  }

  /* ---------------- editor de mundos ---------------- */
  startWorldEditor(mapId) {
    this.loadMap(mapId);
    this.mode = 'weditor';
    if (this.player.mesh) this.player.mesh.visible = false;
    this.worldEditor.enter();
  }
  stopWorldEditor() {
    this.worldEditor.exit();
    this.enterSandbox();
  }

  /* ---------------- bucle ---------------- */
  loop() {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const rawDt = this.clock.getDelta();
    if (settings.data.fpsCap > 0) {
      this.fpsAcc += rawDt;
      if (this.fpsAcc < 1 / settings.data.fpsCap) return;
      var dt = this.fpsAcc;
      this.fpsAcc = 0;
    } else {
      dt = Math.min(rawDt, 1 / 20);
    }
    this.frames++;
    if (now - this.lastFpsT > 500) { this.fps = this.frames * 1000 / (now - this.lastFpsT); this.frames = 0; this.lastFpsT = now; }

    const t = now / 1000;
    if (this.mode === 'menu') {
      this.menuYaw += (0.12 + (input.mouse.buttons & 2 ? 0 : 0)) * dt;
      if (this.menuVehicle) {
        this.menuVehicle.rotation.y = this.menuYaw;
        this.menuVehicle.position.y = .2 + Math.sin(t * 1.6) * .04;
      }
      this.menuCamera.position.set(Math.cos(t * .08) * 8.2, 2.7 + Math.sin(t * .2) * .3, Math.sin(t * .08) * 8.2);
      this.menuCamera.lookAt(0, 1, 0);
      this.renderer.render(this.menuScene, this.menuCamera);
      musicTick(t, true);
      input.endFrame();
      return;
    }
    if (!this.scene) { input.endFrame(); return; }
    musicTick(t, false);

    // global key shortcuts
    if (input.wasPressed('pause')) this.togglePause();
    if (this.mode === 'sandbox' || this.seated) {
      if (input.wasPressed('build')) this.openBuilder();
      if (input.wasPressed('enter')) { if (this.seated) this.exitVehicle(); else { const n = this.nearestVehicle(7); if (n) this.enterVehicleIndex(this.sim.instances.indexOf(n)); else toast('Acércate a una máquina para pilotarla'); } }
      if (input.wasPressed('repair')) this.repairVehicle();
      if (input.wasPressed('respawn')) this.respawnVehicle();
      if (input.wasPressed('camera')) this.toggleCamera();
      if (input.wasPressed('map')) this.hud.toggleBigMap();
    }

    // físicas
    if (this.world && this.mode !== 'weditor') {
      this.sim.passive(dt);
      this.world.step(1 / 60, Math.min(dt, .05), 3);
      this.sim.update(dt);
    }
    if (this.mode === 'weditor') this.worldEditor.update(dt);

    // jugador
    if (!this.seated && this.mode === 'sandbox') this.updatePlayer(dt);
    this.updateCamera(dt);

    // entorno
    if (this.env) {
      const camP = this.camera.position;
      this.env.update(dt, settings.data.quality, new THREE.Vector3(camP.x, camP.y, camP.z));
    }

    // HUD
    if (this.mode === 'sandbox') {
      const inst = this.sim.instances.find(i => i.isFocus);
      if (inst) {
        this.sim.instances.forEach(i => { if (i !== inst) i.isFocus = false; });
        const st = this.sim.status(inst);
        const hint = this.seated
          ? 'W/S acelera · A/D dirección · ESPACIO frenar (o ascender) · SHIFT turbo · E salir'
          : 'E para pilotar · B constructor · ⏸';
        this.hud.status(st, inst, settings.data.showIndicators ? hint : '');
        if (!this.seated) updateEngineAudio(false, 0, 0, false);
      } else {
        updateEngineAudio(false, 0, 0, false);
      }
      if (this.seated && !inst) this.seated = false;
    }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p.mesh) return;
    const spd = 7.4;
    const k = input;
    const fwd = (k.isDown('forward') ? 1 : 0) - (k.isDown('back') ? 1 : 0);
    const str = (k.isDown('right') ? 1 : 0) - (k.isDown('left') ? 1 : 0);
    if (input.mouse.buttons & 2) p.yaw -= input.mouse.dx * .0032 * settings.data.mouseSensitivity;
    if (fwd || str) {
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      p.pos.x += (str * cos - fwd * sin) * spd * dt;
      p.pos.z += (-fwd * cos - str * sin) * spd * dt;
      p.walking = true;
    } else p.walking = false;
    const ground = this.terrain.sampleHeight(p.pos.x, p.pos.z);
    const inWater = this.env.waterOn && ground < this.env.waterY && p.pos.y < this.env.waterY + .4;
    p.vy -= 22 * dt;
    if (k.wasPressed('brake') && p.pos.y <= ground + 1.35) { p.vy = 8.4; sfx.place(); }
    p.pos.y += p.vy * dt;
    const floor = Math.max(ground + 1.14, this.env.waterOn ? this.env.waterY + .8 : -1e9);
    if (p.pos.y < floor) { p.pos.y = floor; p.vy = 0; }
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.children[0].rotation.x = p.walking ? Math.sin(performance.now() / 90) * .12 : 0;
    p.mesh.visible = true;
    this.player.desktop = true;
  }

  updateCamera(dt) {
    const cam = this.camera;
    const d = settings.data;
    let targetPos, lookAt;
    const inst = this.sim.instances.find(i => i.isFocus);
    if (this.mode === 'weditor') return;
    if (inst && inst.clusters[0] && inst.clusters[0].body) {
      const b = inst.clusters[0].body;
      const bp = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
      const bq = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const mode = this.camMode || d.camera;
      if (mode === 'first' || (mode === 'free' && this.seated)) {
        let seat = inst.seats[0];
        if (inst.seats.length > 1) seat = inst.seats.find(s => s.kind === 'driver') || seat;
        const seatW = new THREE.Vector3(seat.local.x, seat.local.y + 1.1, seat.local.z).applyQuaternion(bq).add(bp);
        if (this.seated) cam.position.copy(seatW);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq);
        if (this.fpYaw == null) this.fpYaw = Math.atan2(fwd.x, fwd.z);
        if (input.mouse.buttons & 2) {
          this.fpYaw -= input.mouse.dx * .003 * d.mouseSensitivity;
        }
        const yaw = this.fpYaw;
        cam.lookAt(seatW.x + Math.sin(yaw) * 10, seatW.y + .2, seatW.z + Math.cos(yaw) * 10);
        return;
      }
      // tercera persona con muelle orbital
      const o = this.camOrbit;
      if (input.mouse.buttons & 2) {
        o.yaw += input.mouse.dx * .0045 * d.mouseSensitivity * d.camSensitivity;
        o.pitch = clamp(o.pitch + input.mouse.dy * .0045 * d.mouseSensitivity * d.camSensitivity * (d.invertY ? -1 : 1), -.5, 1.42);
      }
      o.dist = clamp(o.dist * (1 + input.mouse.wheel * .08), 3, 60);
      const k = d.camSmooth * 5 * dt;
      const dist = o.dist * (1 + clamp(Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) * .03, 0, .8));
      const desired = new THREE.Vector3(
        bp.x + Math.cos(o.yaw) * Math.cos(o.pitch) * dist,
        bp.y + 2.6 + Math.sin(o.pitch) * dist,
        bp.z + Math.sin(o.yaw) * Math.cos(o.pitch) * dist
      );
      const minY = this.terrain.sampleHeight(desired.x, desired.z) + 1.1;
      if (desired.y < minY) desired.y = minY;
      cam.position.lerp(desired, clamp(k, .04, .5));
      cam.lookAt(bp.x, bp.y + 1.1, bp.z);
      return;
    }
    // cámara detrás del jugador
    const p = this.player;
    const o = this.camOrbit;
    if (input.mouse.buttons & 2) {
      o.yaw -= 0; // yaw se mueve en updatePlayer
    }
    o.pitch = clamp(o.pitch + (input.mouse.buttons & 2 ? input.mouse.dy * .003 * d.mouseSensitivity : 0), -.4, 1.3);
    o.dist = clamp(o.dist * (1 + input.mouse.wheel * .08), 3, 30);
    const dist = o.dist;
    const ty = p.pos.y + 1.2;
    const desired = new THREE.Vector3(
      p.pos.x - Math.sin(p.yaw) * Math.cos(o.pitch) * dist,
      ty + Math.sin(o.pitch) * dist + 1.2,
      p.pos.z - Math.cos(p.yaw) * Math.cos(o.pitch) * dist
    );
    const minY = this.terrain.sampleHeight(desired.x, desired.z) + .9;
    if (desired.y < minY) desired.y = minY;
    cam.position.lerp(desired, .18);
    cam.lookAt(p.pos.x, p.pos.y + 1.2, p.pos.z);
  }
}

/* cargar props guardados (de mundos custom y ediciones) */
function Props_loadItem(props, p) {
  if (!p || !p.t || p.t === 'pineF' || p.t === 'palmF') return;
  switch (p.t) {
    case 'pineT': props.pine(p.x, p.z, p.s); break;
    case 'palmT': props.palm(p.x, p.z, p.s); break;
    case 'cactus': props._posAt('cactus', p.x, p.z, p.y, p.s); break;
    case 'rock': props._posAt('rock', p.x, p.z, p.y, p.s); break;
    case 'cone': props._posAt('cone', p.x, p.z, p.y, p.s); break;
    case 'buoy': props.buoy(p.x, p.z, p.y); break;
    case 'factory': props.factory(p.x, p.z, p.y, p.alt); break;
    case 'warehouse': props.warehouse(p.x, p.z, p.y, p.alt); break;
    case 'hangar': props.hangar(p.x, p.z, p.y); break;
    case 'crane': props.crane(p.x, p.z, p.y); break;
    case 'dock': props.dock(p.x, p.z, p.y); break;
    case 'platform': props.platform(p.x, p.z, p.y, p.s); break;
    case 'rockbox': props.rockbox(p.x, p.z, p.y, p.s); break;
    case 'ramp': props.ramp(p.x, p.z, p.y, p.rot); break;
  }
}

new Game();
