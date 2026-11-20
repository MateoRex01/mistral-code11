import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/* Sistema de props: instanciación (árboles/rocas) + estáticos colisionables (edificios, grúas, muelles). */
export class PropSystem {
  constructor(scene, world, terrain, quality) {
    this.scene = scene; this.world = world; this.terrain = terrain;
    this.veggieBudget = quality === 'low' ? .35 : quality === 'medium' ? .6 : quality === 'ultra' ? 1.2 : 1;
    this.reset();
  }
  reset() {
    if (this.statics && this.world) for (const b of this.statics) this.world.removeBody(b);
    if (this.meshes) for (const m of this.meshes) { if (m.parent) m.parent.remove(m); }
    this.groups = new Map();
    this.statics = [];
    this.meshes = [];
    this.built = [];
    _count = 0;
  }
  disposeMeshes() {
    for (const m of this.meshes) { this.scene.remove(m); m.geometry && m.geometry.dispose(); }
    this.meshes = [];
  }

  /* --- api de scatter/mapas --- */
  pine(x, z, s) { this._pos('pineT', x, z, s); this._pos('pineF', x, z, s); }
  palm(x, z, s) { this._pos('palmT', x, z, s); this._pos('palmF', x, z, s); }
  cactus(x, z, s) { this._pos('cactus', x, z, s); }
  rock(x, z, s) { this._pos('rock', x, z, s); }
  rockbox(x, z, y, s) { this.built.push({ t: 'rockbox', x, z, y, s }); this.addBuilding(x, z, y, 2 * s, 2 * s, 2 * s, 0x8f9aa5, 'metal'); }
  cone(x, z, y, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this._posAt('cone', x + Math.cos(a) * 8, z + Math.sin(a) * 8, y, 1); } }
  factory(x, z, y, alt) { this.built.push({ t: 'factory', x, z, y, alt }); this.addBuilding(x, z, y, alt ? 14 : 10, 20 + (x % 3) * 4, 18, alt ? 0x7a6a5c : 0x6b7684, 'build', alt ? 2 : 1, alt ? 6 : 8); }
  warehouse(x, z, y, alt) { this.built.push({ t: 'warehouse', x, z, y, alt }); this.addBuilding(x, z, y, 12, 16, 30, alt ? 0x5f6b76 : 0x6d7d8a, 'build'); }
  hangar(x, z, y) { this.built.push({ t: 'hangar', x, z, y }); this.addBuilding(x, z, y, 10, 30, 20, 0x7d8a96, 'hangar'); }
  crane(x, z, y) { this.built.push({ t: 'crane', x, z, y }); this.addCrane(x, z, y); }
  cranes(x, z, y, n) { for (let i = 0; i < n; i++) this.addCrane(x + i * 30 - n * 15, z, y); }
  platform(x, z, y, s) {
    const h = this.terrain ? this.terrain.sampleHeight(x, z) : (y || 0);
    this.built.push({ t: 'platform', x, z, y, s });
    this.addBuilding(x, z, h, s, 1.2, s, 0x7d8a96, 'metal');
  }
  dock(x, z, y) {
    const wl = this.waterLevel != null ? this.waterLevel : (this.terrain ? 0 : 0);
    this.built.push({ t: 'dock', x, z, y });
    const baseH = 2;
    this.addBuilding(x, z, baseH, 14, 1, 10, 0x8a6438, 'wood');
    this.addBuilding(x - 6, z + 8, baseH, 24, 1, 4, 0x8a6438, 'wood');
  }
  buoy(x, z, y) { this._posAt('buoy', x, z, 0, 1); }
  ramp(x, z, y, rot = 0) {
    const base = y ? y : (this.terrain ? this.terrain.sampleHeight(x, z) : 0);
    this.built.push({ t: 'ramp', x, z, y, rot });
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: .75, metalness: .15 });
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.42, rot, 0));
    const m = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 15), mat);
    m.quaternion.copy(q);
    m.position.set(x, base + 2.4, z);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m); this.meshes.push(m);
    const body = new CANNON.Body({ mass: 0, material: this.world.groundMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(3, .5, 7.5)));
    body.position.set(x, base + 2.4, z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    this.world.addBody(body); this.statics.push(body);
  }

  _pos(type, x, z, s) {
    const y = this.terrain.sampleHeight(x, z);
    this._posAt(type, x, z, y, s);
  }
  _posAt(type, x, z, y, s) {
    if (!this.groups.has(type)) this.groups.set(type, []);
    this.groups.get(type).push({ x, y, z, s, ry: Math.random() * Math.PI * 2 });
  }

  addBuilding(x, z, y, h, w, d, color, kind = 'build', chimneys = 0, chimneyH = 6) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: kind === 'metal' ? .5 : .05 });
    const root = new THREE.Group();
    if (kind === 'hangar') {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 14, 1, false, 0, Math.PI), mat);
      g.rotation.z = Math.PI / 2; g.rotation.y = Math.PI / 2;
      g.position.y = 0; g.castShadow = true; root.add(g);
    } else {
      const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      g.position.y = h / 2; g.castShadow = true; g.receiveShadow = true; root.add(g);
    }
    if (chimneys) {
      const cm = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: .9 });
      for (let i = 0; i < chimneys; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, chimneyH + i, 10), cm);
        c.position.set(-w / 2 + 3 + i * 4, h + (chimneyH + i) / 2, -d / 2 + 3);
        c.castShadow = true; root.add(c);
      }
    }
    root.position.set(x, y || 0, z);
    this.scene.add(root); this.meshes.push(root);
    const shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
    const body = new CANNON.Body({ mass: 0, material: this.world.groundMaterial });
    body.addShape(shape);
    body.position.set(x, (y || 0) + h / 2, z);
    this.world.addBody(body);
    this.statics.push(body);
  }

  addCrane(x, z, y) {
    const base = this.terrain ? this.terrain.sampleHeight(x, z) : 0;
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a13b, roughness: .6, metalness: .4 });
    const root = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 26, 2.4), mat); mast.position.y = 13; mast.castShadow = true; root.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 1.6), mat); arm.position.set(12, 26, 0); arm.castShadow = true; root.add(arm);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0x3f4a55, roughness: .7 })); cabin.position.set(3, 24, 0); cabin.castShadow = true; root.add(cabin);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(.1, 10, .1), new THREE.MeshStandardMaterial({ color: 0x222222 })); cable.position.set(20, 20, 0); root.add(cable);
    root.position.set(x, base, z);
    this.scene.add(root); this.meshes.push(root);
    const shape = new CANNON.Box(new CANNON.Vec3(1.4, 13, 1.4));
    const body = new CANNON.Body({ mass: 0, material: this.world.groundMaterial });
    body.addShape(shape);
    body.position.set(x, base + 13, z);
    this.world.addBody(body);
    this.statics.push(body);
  }

  finalize() {
    this.disposeMeshes();
    for (const [type, list] of this.groups) {
      if (!list.length) continue;
      const geoGeo = PROTO[type]();
      const useCount = Math.min(list.length, Math.max(1, Math.ceil(list.length * (PROTO_VEG.includes(type) ? this.veggieBudget : 1))));
      const mat = MATS[type]();
      const im = new THREE.InstancedMesh(geoGeo, mat, useCount);
      im.castShadow = true; im.receiveShadow = true;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < useCount; i++) {
        const it = list[i];
        e.set(0, it.ry, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
        im.setMatrixAt(i, m4);
        if (COLLIDERS[type]) {
          const col = COLLIDERS[type];
          const shape = new CANNON.Cylinder(col.r * it.s, col.r * it.s, col.h * it.s, 8);
          const body = new CANNON.Body({ mass: 0, material: this.world.groundMaterial });
          body.addShape(shape);
          body.position.set(it.x, it.y + col.h * it.s / 2, it.z);
          this.world.addBody(body); this.statics.push(body);
        }
      }
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im); this.meshes.push(im);
    }
  }

  serialized() {
    const out = this.built.map(b => ({ ...b }));
    for (const [type, list] of this.groups) for (const it of list) out.push({ t: type, x: it.x, y: it.y, z: it.z, s: it.s });
    return out;
  }
  load(list) {
    this.reset();
    for (const it of (list || [])) {
      if (typeof it.t !== 'string') continue;
      // reconstruye edificios/grúas aparte (no instanciados)
      if (BUILDING_TYPES.includes(it.t)) continue;
      this._posAt(it.t, it.x, it.z, it.y, it.s);
    }
    this.finalize();
  }
}

let _count = 0;

const PROTO_VEG = ['pineT', 'pineF', 'palmT', 'palmF', 'cactus', 'rock', 'cone', 'buoy'];
const BUILDING_TYPES = [];
const MATS = {
  pineT: () => new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: .9 }),
  pineF: () => new THREE.MeshStandardMaterial({ color: 0x2f6b3f, roughness: .9 }),
  palmT: () => new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: .9 }),
  palmF: () => new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: .85, side: THREE.DoubleSide }),
  cactus: () => new THREE.MeshStandardMaterial({ color: 0x4f8f4a, roughness: .8 }),
  rock: () => new THREE.MeshStandardMaterial({ color: 0x8d8f92, roughness: .95 }),
  cone: () => new THREE.MeshStandardMaterial({ color: 0xe07b28, roughness: .6 }),
  buoy: () => new THREE.MeshStandardMaterial({ color: 0xd9443a, roughness: .6 }),
};
const PROTO = {
  pineT: () => new THREE.CylinderGeometry(.25, .4, 2.4, 6).translate(0, 1.2, 0),
  pineF: () => new THREE.ConeGeometry(2, 5.4, 7).translate(0, 4.6, 0),
  palmT: () => new THREE.CylinderGeometry(.18, .3, 5, 6).translate(0, 2.5, 0),
  palmF: () => new THREE.ConeGeometry(2.6, .8, 5).translate(0, 4.9, 0),
  cactus: () => new THREE.CylinderGeometry(.45, .55, 3.4, 8).translate(0, 1.7, 0),
  rock: () => new THREE.DodecahedronGeometry(1.1, 0).translate(0, .7, 0),
  cone: () => new THREE.ConeGeometry(.4, .9, 8).translate(0, .45, 0),
  buoy: () => new THREE.SphereGeometry(.6, 10, 8).translate(0, .4, 0),
};
const COLLIDERS = {
  pineT: { r: .35, h: 2.4 },
  palmT: { r: .3, h: 5 },
  cactus: { r: .5, h: 3.4 },
  rock: { r: 1, h: 1.6 },
  buoy: { r: .6, h: 1 },
};
