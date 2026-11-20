import * as THREE from 'three';

export const CELL = 1;

/* ---------- geometrías base (cacheadas por tamaño cuando se pueda) ---------- */
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 10, axis = 'y') => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    return g;
  },
  sph: (r, seg = 12) => new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)),
  cone: (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  torus: (r, t) => new THREE.TorusGeometry(r, t, 8, 18),
  wedge: (w, h, d) => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(-d / 2, h); s.lineTo(d / 2, 0); s.lineTo(-d / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, -h / 2, d / 2);
    g.rotateY(Math.PI / 2);
    return g;
  },
  dome: (r) => new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
};

/* ---------- materiales singleton ---------- */
let _mats = null;
export function mats() {
  if (_mats) return _mats;
  const mk = (c, r = .55, m = .08) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  _mats = {
    dark: mk(0x232a33, .7, .25),
    metal: mk(0x8a97a5, .32, .85),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: .08, metalness: .1, transparent: true, opacity: .45 }),
    rubber: mk(0x1b1e23, .92, .02),
    glow: new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffdf8a, emissiveIntensity: 1.6, roughness: .3 }),
    redE: new THREE.MeshStandardMaterial({ color: 0xd9443a, emissive: 0xd9443a, emissiveIntensity: .9, roughness: .4 }),
    orange: mk(0xe07b28, .6, .2),
    blueE: new THREE.MeshStandardMaterial({ color: 0x5eb1ff, emissive: 0x2277cc, emissiveIntensity: .8 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x74d0ff, emissive: 0x2a77b8, emissiveIntensity: 1.2 }),
    greenE: new THREE.MeshStandardMaterial({ color: 0x66ff99, emissive: 0x22cc55, emissiveIntensity: 1.5 }),
    rocket: new THREE.MeshStandardMaterial({ color: 0xc98aff, emissive: 0x9040ff, emissiveIntensity: 2.4 }),
    jet: new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff7b1c, emissiveIntensity: 2.4 }),
  };
  return _mats;
}

/* caché de materiales de pintura */
const _paint = new Map();
export function paintMat(hex) {
  if (_paint.has(hex)) return _paint.get(hex);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: .5, metalness: .18 });
  _paint.set(hex, m);
  return m;
}
export const PALETTE = ['#c9553f', '#d0813c', '#e0c531', '#4f9d5b', '#3f7fbf', '#7a4fbf', '#57c785', '#8fa5b4', '#2a3140', '#e2e8ee', '#c46a9a', '#f0f4f8'];

/* ---------- ayudantes de construcción ---------- */
function mkM(g, p) {
  const M = mats();
  const primary = p || M.dark;
  return {
    M,
    box: (w, h, d, x = 0, y = 0, z = 0, mat) => { const e = new THREE.Mesh(G.box(w, h, d), mat || primary); e.position.set(x, y, z); g.add(e); return e; },
    cyl: (r1, r2, h, x = 0, y = 0, z = 0, axis = 'y', seg = 10, mat) => { const e = new THREE.Mesh(G.cyl(r1, r2, h, seg, axis), mat || primary); e.position.set(x, y, z); g.add(e); return e; },
    sph: (r, x = 0, y = 0, z = 0, mat) => { const e = new THREE.Mesh(G.sph(r), mat || primary); e.position.set(x, y, z); g.add(e); return e; },
    wedge: (w, h, d, x = 0, y = 0, z = 0, mat) => { const e = new THREE.Mesh(G.wedge(w, h, d), mat || primary); e.position.set(x, y, z); g.add(e); return e; },
    dome: (r, x = 0, y = 0, z = 0, mat) => { const e = new THREE.Mesh(G.dome(r), mat || primary); e.position.set(x, y, z); g.add(e); return e; },
    raw: (geo, x = 0, y = 0, z = 0, mat) => { const e = new THREE.Mesh(geo, mat || primary); e.position.set(x, y, z); g.add(e); return e; },
  };
}
function solidBox(part, g, p) {
  const M = mats();
  const s = part.size;
  g.add(new THREE.Mesh(G.box(s[0] * .96, s[1] * .96, s[2] * .96), p || M.dark));
}
/* rueda con eje lateral X (montaje por defecto en coches) */
function wheelMesh(h, r, w) {
  h.cyl(r, r, w, 0, 0, 0, 'x', 18, h.M.rubber);
  h.cyl(r * .45, r * .45, w * 1.12, 0, 0, 0, 'x', 10, h.M.metal);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const b = h.box(w * .5, r * 1.2, .09, 0, 0, 0, h.M.dark);
    b.rotation.x = a;
  }
}

/* firma de physics-shapes por pieza; offsets relativos al centro de la huella */
const B1 = [[1, 1, 1, 0, 0, 0]];

/* ---------- CATÁLOGO ---------- */
export const CATS = [
  { id: 'EST', name: 'Estructura', icon: '🧱' },
  { id: 'MOV', name: 'Movimiento', icon: '⚙️' },
  { id: 'AER', name: 'Aeronáutica', icon: '🛩️' },
  { id: 'MAR', name: 'Marítimo', icon: '⚓' },
  { id: 'CTR', name: 'Control', icon: '🎮' },
  { id: 'DEC', name: 'Decoración', icon: '💡' },
];

const _defs = [
  // ===== ESTRUCTURA =====
  { id: 'block', cat: 'EST', name: 'Bloque', size: [1, 1, 1], mass: 4, color: '#d0813c',
    fn: 'Estructura base. Une todas las piezas del vehículo.', sh: B1, draw: function (g, p) { return solidBox(this, g, p); } },
  { id: 'blockR', cat: 'EST', name: 'Bloque rectangular', size: [2, 1, 1], mass: 8, color: '#d0813c',
    fn: 'Viga larga de dos celdas.', sh: [[2, 1, 1, 0, 0, 0]], draw: function (g, p) { return solidBox(this, g, p); } },
  { id: 'blockTall', cat: 'EST', name: 'Bloque alto', size: [1, 2, 1], mass: 8, color: '#d0813c',
    fn: 'Columna de dos celdas.', sh: [[1, 2, 1, 0, 0, 0]], draw: function (g, p) { return solidBox(this, g, p); } },
  { id: 'blockSmall', cat: 'EST', name: 'Bloque pequeño', size: [1, 1, 1], mass: 1.4, color: '#c9a55c',
    fn: 'Cubito ligero anclado a una esquina: relleno y detalle.', sh: [[.5, .5, .5, -.24, -.24, -.24]],
    draw: (g, p) => { const h = mkM(g, p); h.box(.5, .5, .5, -.22, -.22, -.22); } },
  { id: 'blockLarge', cat: 'EST', name: 'Bloque grande', size: [2, 2, 2], mass: 26, color: '#a8763e',
    fn: 'Gran volumen estructural, muy robusto.', sh: [[2, 2, 2, 0, 0, 0]], draw: function (g, p) { return solidBox(this, g, p); } },
  { id: 'wedge', cat: 'EST', name: 'Cuña', size: [1, 1, 1], mass: 3, color: '#d0813c',
    fn: 'Superficie inclinada: morros, rampas y faldones.', sh: [[1, .5, .5, 0, -.25, .25]],
    draw: (g, p) => { const h = mkM(g, p); h.wedge(1, 1, 1); } },
  { id: 'wedgeInv', cat: 'EST', name: 'Cuña invertida', size: [1, 1, 1], mass: 3, color: '#d0813c',
    fn: 'Inclinada invertida para bajos y cortavientos.', sh: [[1, .5, .5, 0, .25, .25]],
    draw: (g, p) => { const h = mkM(g, p); const w = h.wedge(1, 1, 1); w.rotation.x = Math.PI; } },
  { id: 'wedgeL', cat: 'EST', name: 'Cuña larga', size: [2, 1, 1], mass: 6, color: '#d0813c',
    fn: 'Rampa suave de dos celdas.', sh: [[2, .5, .8, 0, -.25, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.wedge(1, .5, 2, -.5, .25, 0); h.wedge(1, .5, 2, .5, .25, 0); } },
  { id: 'corner', cat: 'EST', name: 'Esquina biselada', size: [1, 1, 1], mass: 3.5, color: '#d0813c',
    fn: 'Esquina con chaflán de 45°.', sh: [[1, 1, .5, 0, 0, .25]],
    draw: (g, p) => { const h = mkM(g, p); h.wedge(.36, 1, 1, -.32, 0, 0); h.box(.64, 1, 1, .3, 0, 0); } },
  { id: 'pyramid', cat: 'EST', name: 'Pico', size: [1, 1, 1], mass: 2.4, color: '#d0813c',
    fn: 'Remate piramidal.', sh: [[.6, 1, .6, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.raw(new THREE.ConeGeometry(.68, 1, 4).rotateY(Math.PI / 4)); } },
  { id: 'curve', cat: 'EST', name: 'Bloque curvo', size: [1, 1, 1], mass: 3.5, color: '#d0813c',
    fn: 'Superficie curva de 90°, ideal para carenas.', sh: [[1, 1, .5, 0, .25, .25]],
    draw: (g, p) => { const h = mkM(g, p); h.raw(new THREE.CylinderGeometry(1.05, 1.05, 1, 10, 1, false, Math.PI * 1.25, Math.PI / 2).rotateZ(-Math.PI / 4)); h.box(1, .3, .3, 0, -.4, -.4); } },
  { id: 'panel', cat: 'EST', name: 'Panel', size: [1, 1, 1], mass: .9, color: '#b8c0cc',
    fn: 'Cubierta fina y ligera.', sh: [[1, 1, .14, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.02, 1.02, .14); } },
  { id: 'plate2', cat: 'EST', name: 'Plancha 2×2', size: [2, 1, 1], mass: 1.7, color: '#b8c0cc',
    fn: 'Cubierta ancha de dos celdas.', sh: [[2, .14, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(2.02, .14, 1.02); } },
  { id: 'grille', cat: 'EST', name: 'Rejilla', size: [1, 1, 1], mass: 1.3, color: '#6b7684',
    fn: 'Panel ventilado: refrigera motores cercanos.', sh: [[1, 1, .3, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1, 1, .1); for (let i = -2; i <= 2; i++) h.box(.12, .9, .12, 0, 0, i * .2, h.M.dark); } },
  { id: 'ballJoint', cat: 'EST', name: 'Rótula', size: [1, 1, 1], mass: 2, color: '#94a3b3',
    fn: 'Conector esférico: empalma piezas en cualquier ángulo.', sh: [[.9, .9, .9, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.sph(.42, 0, 0, 0, h.M.metal); h.cyl(.2, .25, .3, 0, .45, 0); h.cyl(.2, .25, .3, 0, -.45, 0); } },
  { id: 'connector', cat: 'EST', name: 'Conector', size: [1, 1, 1], mass: 1.6, color: '#94a3b3',
    fn: 'Piñón de unión: empalma tubos y ejes.', sh: [[.7, .7, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.cyl(.3, .34, .6, 0, 0, -.1, 'z', 8, h.M.metal); h.cyl(.12, .09, .5, 0, 0, .3, 'z', 8, h.M.metal); } },
  { id: 'spare', cat: 'EST', name: 'Rueda de repuesto', size: [1, 1, 1], mass: 9, color: '#3a4450',
    fn: 'Rueda decorativa montada en el bastidor.', sh: [[.8, .8, .5, 0, 0, 0]],
    draw: (g) => { const h = mkM(g); wheelMesh(h, .42, .35); } },

  // ===== MOVIMIENTO =====
  { id: 'wheelS', cat: 'MOV', name: 'Rueda pequeña', size: [1, 1, 1], mass: 6, color: '#1b1e23',
    fn: 'Rueda ligera r=0,30. Tracción con motores conectados.', props: { wheel: { radius: .3, grip: 2.2, off: false } },
    draw: (g) => { wheelMesh(mkM(g), .3, .3); } },
  { id: 'wheelM', cat: 'MOV', name: 'Rueda media', size: [1, 1, 1], mass: 10, color: '#1b1e23',
    fn: 'Rueda estándar r=0,42. Buena relación velocidad/agarre.', props: { wheel: { radius: .42, grip: 2.4, off: false } },
    draw: (g) => { wheelMesh(mkM(g), .42, .4); } },
  { id: 'wheelL', cat: 'MOV', name: 'Rueda grande', size: [1, 1, 1], mass: 15, color: '#1b1e23',
    fn: 'Rueda grande r=0,56. Rapidísima en asfalto.', props: { wheel: { radius: .56, grip: 2.3, off: false } },
    draw: (g) => { wheelMesh(mkM(g), .56, .5); } },
  { id: 'wheelOff', cat: 'MOV', name: 'Rueda todoterreno', size: [1, 1, 1], mass: 14, color: '#23262b',
    fn: 'Neumático con tacos: agarre extra fuera del asfalto.', props: { wheel: { radius: .5, grip: 3.2, off: true } },
    draw: (g) => { const h = mkM(g); h.cyl(.5, .5, 1.1, 0, 0, 0, 'x', 16, h.M.rubber); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; h.box(1.14, .16, .18, 0, Math.sin(a) * .45, Math.cos(a) * .45, h.M.dark).rotation.x = -a; } h.cyl(.22, .22, 1.2, 0, 0, 0, 'x', 10, h.M.metal); } },
  { id: 'wheelSteer', cat: 'MOV', name: 'Rueda direccional', size: [1, 1, 1], mass: 11, color: '#2b3a4a',
    fn: 'Rueda orientable con marcas azules: gira siempre con A/D.', props: { wheel: { radius: .45, grip: 2.5, off: false }, steer: true },
    draw: (g) => { const h = mkM(g); wheelMesh(h, .45, .4); for (let i = 0; i < 4; i++) h.box(.16, .18, .28, .38 * Math.cos(i * 1.57 + .7), .38 * Math.sin(i * 1.57 + .7), 0, h.M.blueE); } },
  { id: 'axle', cat: 'MOV', name: 'Eje', size: [1, 1, 1], mass: 4, color: '#8a97a5',
    fn: 'Transmite giro de motores a ruedas con hebras cercanas (= pequeño motor).', props: { engine: .6 },
    draw: (g) => { const h = mkM(g); h.cyl(.14, .14, 1.6, 0, 0, 0, 'x', 10, h.M.metal); h.cyl(.24, .24, .3, 0, 0, 0, 'z', 8, h.M.dark); } },
  { id: 'suspension', cat: 'MOV', name: 'Suspensión', size: [1, 1, 1], mass: 6, color: '#445466',
    fn: 'Amortiguador: suaviza los impactos de las ruedas cercanas.', props: { susp: 1 },
    draw: (g) => { const h = mkM(g); h.cyl(.2, .2, .55, 0, .2, 0, 'y', 8, h.M.metal); h.cyl(.26, .26, .5, 0, -.25, 0, 'y', 8, h.M.dark); h.cyl(.34, .34, .16, 0, .48, 0, 'y', 8, h.M.orange); h.cyl(.34, .34, .16, 0, -.5, 0, 'y', 8, h.M.orange); } },
  { id: 'hinge', cat: 'MOV', name: 'Bisagra motorizada', size: [1, 1, 1], mass: 5, color: '#94a3b3',
    fn: 'Articula el grupo de piezas detrás de ella. Acciónala con ← → al conducir.', props: { hinge: 1 },
    draw: (g) => { const h = mkM(g); h.cyl(.2, .2, 1.04, 0, 0, 0, 'x', 10, h.M.metal); h.box(.5, 1.02, .5, .3, 0, 0, h.M.dark); h.box(1.02, .3, .5, 0, 0, 0, h.M.metal); } },
  { id: 'piston', cat: 'MOV', name: 'Pistón telescópico', size: [1, 1, 1], mass: 6, color: '#c9b45c',
    fn: 'Empuje lineal wanneer pulsas ↑ ↓: empuja la máquina en su eje.', props: { piston: 2400 },
    draw: (g) => { const h = mkM(g); h.cyl(.26, .28, .6, 0, -.2, 0, 'z', 10, h.M.dark); h.cyl(.14, .14, .8, .25, 0, 0, 'z', 10, h.M.metal); h.cyl(.2, .22, .25, .55, 0, 0, 'z', 10, h.M.orange); } },
  { id: 'engineS', cat: 'MOV', name: 'Motor pequeño', size: [1, 1, 1], mass: 14, color: '#b0533a',
    fn: 'Potencia +1: impulsa ruedas cercanas.', props: { engine: 1 },
    draw: (g, p) => { const h = mkM(g, p || mats().orange); solidBox({ size: [1, 1, 1] }, g, p || mats().orange); for (let i = -1; i <= 1; i++) h.box(1.04, .12, .34, 0, i * .3, 0, h.M.dark); } },
  { id: 'engineV', cat: 'MOV', name: 'Motor V8', size: [1, 1, 1], mass: 22, color: '#8f9aa6',
    fn: 'Potencia +2.2: motor deportivo con culatas visibles.', props: { engine: 2.2 },
    draw: (g, p) => { const h = mkM(g, p); h.box(.96, .8, .96, 0, -.08, 0); h.cyl(.22, .22, 1.1, -.22, .4, 0, 'z', 8, h.M.dark); h.cyl(.22, .22, 1.1, .22, .4, 0, 'z', 8, h.M.dark); h.cyl(.5, .5, .26, 0, .2, .56, 'z', 10, h.M.metal); } },
  { id: 'engineL', cat: 'MOV', name: 'Motor diésel grande', size: [2, 1, 1], mass: 40, color: '#5c6670',
    fn: 'Potencia +4.5: para camiones y máquinas pesadas.', props: { engine: 4.5 },
    sh: [[2, 1, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.92, .9, .96, 0, -.04, 0); for (let i = 0; i < 3; i++) h.cyl(.28, .28, 1.06, -.7 + i * .7, .35, 0, 'x', 8, h.M.dark); h.cyl(.16, .16, 1.1, -.95, .1, 0, 'y', 8, h.M.metal); } },
  { id: 'rotorPower', cat: 'MOV', name: 'Giro-motor', size: [1, 1, 1], mass: 16, color: '#6b8fa5',
    fn: 'Fuerza de rotor +2: alimenta rotores y hélices cercanas.', props: { rotorPower: 2 },
    draw: (g, p) => { const h = mkM(g, p); solidBox({ size: [1, 1, 1] }, g, p); h.cyl(.36, .44, 1.1, 0, 0, 0, 'z', 12, h.M.metal); h.cyl(.09, .13, 1.3, 0, .5, 0, 'y', 8, h.M.dark); } },
  { id: 'thruster', cat: 'MOV', name: 'Propulsor', size: [1, 1, 1], mass: 8, color: '#c46a2c',
    fn: 'Empuja hacia su cara abierta mientras aceleras (W).', props: { thruster: 950 },
    draw: (g) => { const h = mkM(g); h.cyl(.3, .42, .8, 0, 0, -.05, 'z', 12, h.M.metal); h.cyl(.42, .34, .3, 0, 0, .3, 'z', 12, h.M.dark); h.cyl(.3, .3, .1, 0, 0, .46, 'z', 10, h.M.jet).name = 'nozzleGlow'; } },
  { id: 'thrusterBig', cat: 'MOV', name: 'Turbo cohete', size: [1, 1, 1], mass: 14, color: '#8a4bbf',
    fn: 'Empuje enorme en línea recta. Manipúlalo con cabeza fría.', props: { thruster: 2500 },
    draw: (g) => { const h = mkM(g); h.cyl(.36, .46, 1, 0, 0, -.05, 'z', 12, h.M.metal); h.cyl(.5, .4, .3, 0, 0, .32, 'z', 12, h.M.dark); h.cyl(.34, .34, .12, 0, 0, .5, 'z', 10, h.M.rocket).name = 'nozzleGlow'; } },

  // ===== AERONÁUTICA =====
  { id: 'wingS', cat: 'AER', name: 'Ala pequeña', size: [1, 1, 1], mass: 4, color: '#cfd6df',
    fn: 'Sustentación ligera: necesitas velocidad para volar.', props: { wing: { area: 1.3 } }, sh: [[1, .12, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.02, .1, 1.02); h.wedge(1.02, .1, .4, 0, .06, -.32, h.M.redE); } },
  { id: 'wingM', cat: 'AER', name: 'Ala media', size: [1, 1, 1], mass: 7, color: '#cfd6df',
    fn: 'Sustentación media con punta alar marcada.', props: { wing: { area: 2.6 } }, sh: [[1, .14, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(.3, .12, 1.02, .35, 0, 0); h.box(.7, .12, .84, -.14, 0, -.08); h.wedge(.7, .12, .3, -.14, .06, -.5, h.M.redE); } },
  { id: 'wingL', cat: 'AER', name: 'Ala grande', size: [1, 1, 1], mass: 11, color: '#cfd6df',
    fn: 'Sustentación máxima por celda.', props: { wing: { area: 4.3 } }, sh: [[1, .16, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(.26, .14, 1.04, .36, 0, 0); h.box(.74, .14, .94, -.12, 0, 0); h.wedge(.74, .14, .42, -.12, .07, -.4, h.M.redE); h.box(.18, .32, .18, .46, -.16, 0, h.M.dark); } },
  { id: 'aileron', cat: 'AER', name: 'Alerón', size: [1, 1, 1], mass: 3, color: '#e0b34c',
    fn: 'Control de cabeceo (morro arriba/abajo) con W/S en vuelo.', props: { control: 'pitch' }, sh: [[1, .1, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.02, .09, .6, 0, 0, .2); h.box(1.02, .09, .34, 0, .02, -.28, h.M.redE); } },
  { id: 'rudder', cat: 'AER', name: 'Timón aéreo', size: [1, 1, 1], mass: 3, color: '#e0b34c',
    fn: 'Control de guiñada con A/D en vuelo.', props: { control: 'yaw' }, sh: [[.12, 1, .8, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(.09, 1.02, .6, 0, .08, .12); h.box(.09, 1, .3, 0, .08, -.3, h.M.redE); } },
  { id: 'stabilizer', cat: 'AER', name: 'Estabilizador', size: [1, 1, 1], mass: 4, color: '#b8c0cc',
    fn: 'Amortigua el cabeceo y añade algo de sustentación.', props: { wing: { area: .8 }, control: 'pitch', stabilizer: 1 }, sh: [[1, .12, .7, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.02, .1, .55, 0, -.18, .1); h.box(.12, .66, .55, 0, .16, .1); } },
  { id: 'propeller', cat: 'AER', name: 'Hélice', size: [1, 1, 1], mass: 8, color: '#94a3b3',
    fn: 'Tira de la máquina hacia su eje con acelerador (W). Gira de verdad.', props: { airProp: 1500 },
    draw: (g) => { const h = mkM(g); h.cyl(.16, .2, .5, 0, 0, .05, 'z', 10, h.M.metal); h.cyl(.06, .06, .5, 0, 0, -.28, 'z', 8, h.M.dark); const spin = new THREE.Group(); spin.name = 'spin'; g.add(spin); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(G.box(.16, 1.15, .05), h.M.dark); b.rotation.z = i * 2.094; b.position.z = -.34; spin.add(b); } } },
  { id: 'propellerBig', cat: 'AER', name: 'Hélice grande', size: [1, 1, 1], mass: 13, color: '#7d8894',
    fn: 'Doble empuje de hélice para aviones pesados.', props: { airProp: 3200 },
    draw: (g) => { const h = mkM(g); h.cyl(.22, .3, .7, 0, 0, .05, 'z', 12, h.M.metal); const spin = new THREE.Group(); spin.name = 'spin'; g.add(spin); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(G.box(.18, 1.5, .06), h.M.dark); b.rotation.z = i * 1.57; b.position.z = -.4; spin.add(b); } } },
  { id: 'rotorMain', cat: 'AER', name: 'Rotor principal', size: [1, 1, 1], mass: 15, color: '#93a1ad',
    fn: 'Empuje vertical: el ascensor de helicópteros (ESPACIO para subir). Giro animado.', props: { rotor: 1 },
    draw: (g) => { const h = mkM(g); h.cyl(.3, .36, .3, 0, 0, .32, 'z', 10, h.M.metal); h.cyl(.09, .09, .9, 0, 0, 0, 'z', 8, h.M.dark); const spin = new THREE.Group(); spin.name = 'spin'; spin.position.z = -.35; g.add(spin); const m1 = new THREE.Mesh(G.box(2.3, .07, .16), h.M.dark); const b2 = m1.clone(); b2.rotation.z = Math.PI / 2; const top = new THREE.Mesh(G.cyl(.05, .05, .2, 8, 'z'), h.M.metal); top.position.z = .08; spin.add(m1, b2, top); } },
  { id: 'rotorTail', cat: 'AER', name: 'Rotor de cola', size: [1, 1, 1], mass: 6, color: '#93a1ad',
    fn: 'Control de guiñada para helicópteros (A/D).', props: { tailRotor: .6 },
    draw: (g) => { const h = mkM(g); h.cyl(.1, .1, .4, 0, 0, 0, 'x', 8, h.M.metal); const spin = new THREE.Group(); spin.name = 'spinX'; g.add(spin); for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(G.box(.06, .9, .12), h.M.dark); spin.add(b); } } },
  { id: 'gyro', cat: 'AER', name: 'Giroscopio', size: [1, 1, 1], mass: 9, color: '#7fa7c9',
    fn: 'Estabiliza la rotación de la máquina en vuelo (menos balanceo).', props: { gyro: 1 },
    draw: (g) => { const h = mkM(g); h.box(.66, .66, .66, 0, 0, 0, h.M.dark); const r1 = new THREE.Mesh(G.torus(.42, .07), h.M.metal); r1.rotation.x = Math.PI / 2; g.add(r1); g.add(new THREE.Mesh(G.torus(.42, .07), h.M.metal)); } },

  // ===== MARÍTIMO =====
  { id: 'float', cat: 'MAR', name: 'Flotador', size: [1, 1, 1], mass: 3, color: '#e07b28',
    fn: 'Empuje de flotación: mantiene la pieza sobre el agua.', props: { buoy: 2 }, sh: [[1, .9, .9, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.cyl(.42, .42, 1.02, 0, 0, 0, 'x', 12); h.cyl(.12, .12, .5, 0, .48, 0, 'y', 8, h.M.dark); } },
  { id: 'pontoon', cat: 'MAR', name: 'Pontón', size: [2, 1, 1], mass: 6, color: '#e07b28',
    fn: 'Flotador ancho de dos celdas: base de barcos estables.', props: { buoy: 4.2 }, sh: [[2, .9, .9, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p || mats().orange); h.cyl(.46, .46, 2.04, 0, 0, 0, 'x', 12); h.cyl(.13, .17, .8, 0, .55, 0, 'y', 8, h.M.dark); } },
  { id: 'hull', cat: 'MAR', name: 'Casco de barco', size: [2, 1, 1], mass: 9, color: '#4a6b8a',
    fn: 'Quilla con morro en V: corta las olas.', props: { buoy: 5.5, hull: 1 }, sh: [[2, 1, 1, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.4, .8, 1.03); h.wedge(.56, .8, 1.03, .9, 0, 0); } },
  { id: 'hullSide', cat: 'MAR', name: 'Chapa naval', size: [1, 1, 1], mass: 4, color: '#4a6b8a',
    fn: 'Panel estanco: cierra costados y cubiertas.', props: { buoy: .7 }, sh: [[1, 1, .25, 0, 0, 0]],
    draw: (g, p) => { const h = mkM(g, p); h.box(1.02, .82, .22); h.box(1.02, .18, .34, 0, .5, 0); } },
  { id: 'propWater', cat: 'MAR', name: 'Hélice acuática', size: [1, 1, 1], mass: 7, color: '#8fa5b4',
    fn: 'Propulsión naval: empuja con fuerza bajo el agua (W).', props: { waterProp: 1400 },
    draw: (g) => { const h = mkM(g); h.cyl(.2, .26, .5, 0, 0, -.1, 'z', 10, h.M.metal); const spin = new THREE.Group(); spin.name = 'spin'; spin.position.z = .1; g.add(spin); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(G.box(.5, .14, .05), h.M.redE); b.rotation.z = i * 2.094; spin.add(b); } } },
  { id: 'rudderNav', cat: 'MAR', name: 'Timón naval', size: [1, 1, 1], mass: 4, color: '#8fa5b4',
    fn: 'Gobierno en el agua (A/D), más eficaz con velocidad.', props: { control: 'yaw', naval: 1 }, sh: [[.1, 1, .8, 0, 0, 0]],
    draw: (g) => { const h = mkM(g); h.box(.1, 1.05, .8, 0, -.1, 0, h.M.metal); h.box(.3, .3, .26, .08, -.5, 0, h.M.metal); } },

  // ===== CONTROL =====
  { id: 'seatDriver', cat: 'CTR', name: 'Asiento de conductor', size: [1, 1, 1], mass: 8, color: '#3f4c5c',
    fn: 'Punto de control principal: siéntate con E. Dirige todo lo conectado.', props: { seat: 'driver' },
    draw: (g) => { const h = mkM(g); h.box(.9, .18, .8, 0, -.3, -.05, h.M.dark); h.box(.22, 1.05, .8, -.36, .2, -.05, h.M.dark); h.box(.7, .16, .5, 0, -.15, .4, h.M.redE); h.box(.08, .3, .08, .3, -.05, .3, h.M.metal); } },
  { id: 'seatPass', cat: 'CTR', name: 'Asiento de pasajero', size: [1, 1, 1], mass: 7, color: '#3f4c5c',
    fn: 'Asiento secundario: entra con E para cambiar de cabina.', props: { seat: 'passenger' },
    draw: (g) => { const h = mkM(g); h.box(.9, .18, .8, 0, -.3, -.05, h.M.dark); h.box(.22, 1.05, .8, -.36, .2, -.05, h.M.dark); h.box(.7, .16, .5, 0, -.15, .4, h.M.dark); } },
  { id: 'steerWheel', cat: 'CTR', name: 'Volante', size: [1, 1, 1], mass: 2, color: '#232a33',
    fn: 'Refuerza la respuesta de dirección de las ruedas cercanas.', props: { steerBoost: 1 },
    draw: (g) => { const h = mkM(g); const ring = new THREE.Mesh(G.torus(.3, .055), h.M.dark); ring.position.z = -.3; g.add(ring); h.box(.54, .07, .07, 0, 0, -.3, h.M.metal); h.cyl(.06, .06, .28, 0, 0, -.18, 'z', 8, h.M.metal); } },
  { id: 'console', cat: 'CTR', name: 'Consola de control', size: [1, 1, 1], mass: 4, color: '#2e3946',
    fn: 'Panel de mando: mejora la respuesta de todo el vehículo (+control).', props: { controlBoost: 1 },
    draw: (g) => { const h = mkM(g); h.box(1, .5, .4, 0, -.24, .25, h.M.dark); h.box(.9, .4, .06, 0, 0, -.25); const s = new THREE.Mesh(G.box(.7, .28, .02), h.M.screen); s.position.set(0, .02, -.29); g.add(s); } },
  { id: 'sensor', cat: 'CTR', name: 'Sensor de proximidad', size: [1, 1, 1], mass: 4, color: '#57c785',
    fn: 'Detecta obstáculos delante (<7 m) y dispara los propulsores de retroceso.', props: { sensor: 7 },
    draw: (g) => { const h = mkM(g); h.box(.9, .9, .3, 0, 0, .3, h.M.dark); h.cyl(.2, .28, .22, 0, 0, 0, 'z', 12, h.M.greenE).name = 'sensorEye'; } },
  { id: 'switch', cat: 'CTR', name: 'Interruptor', size: [1, 1, 1], mass: 2, color: '#c9473f',
    fn: 'Pulsador rojo (tecla X al conducir): enciende y apaga las luces del vehículo.', props: { trigger: 'lights' },
    draw: (g) => { const h = mkM(g); h.box(.4, .9, .9, .26, 0, 0, h.M.dark); h.cyl(.11, .11, .22, .15, 0, 0, 'x', 10, h.M.redE); } },
  { id: 'actuator', cat: 'CTR', name: 'Activador', size: [1, 1, 1], mass: 3, color: '#79b8c4',
    fn: 'Módulo secuenciador: gobierna bisagras y pistones de la máquina (X alterna su modo).', props: { actuator: 1 },
    draw: (g) => { const h = mkM(g); h.box(.7, .7, .7, -.12, 0, 0, h.M.dark); h.cyl(.14, .18, .5, .35, 0, 0, 'x', 10, h.M.orange); h.sph(.12, .5, 0, 0, h.M.glow); } },

  // ===== DECORACIÓN =====
  { id: 'light', cat: 'DEC', name: 'Luz', size: [1, 1, 1], mass: 2, color: '#ffe7a3',
    fn: 'Foco omnidireccional: ilumina de noche (o al pulsar X).', props: { light: { range: 18, intensity: 2.2, type: 'point' } },
    draw: (g) => { const h = mkM(g); h.box(.6, .6, .3, 0, 0, -.3, h.M.dark); h.sph(.32, 0, 0, .1, h.M.glow); } },
  { id: 'headlight', cat: 'DEC', name: 'Faro', size: [1, 1, 1], mass: 2.5, color: '#ffe7a3',
    fn: 'Faro direccional con cono de luz largo.', props: { light: { range: 50, intensity: 3, type: 'spot' } },
    draw: (g) => { const h = mkM(g); h.cyl(.3, .34, .3, 0, 0, 0, 'z', 12, h.M.metal); h.cyl(.26, .26, .06, 0, 0, .17, 'z', 12, h.M.glow); h.box(.84, .42, .22, 0, 0, -.32, h.M.dark); } },
  { id: 'lightbar', cat: 'DEC', name: 'Barra luminosa', size: [2, 1, 1], mass: 4, color: '#ff9d3c',
    fn: 'Barra estroboscópica naranja: máxima visibilidad.', props: { light: { range: 24, intensity: 2.6, type: 'strip' } },
    sh: [[2, .7, .5, 0, 0, 0]],
    draw: (g) => { const h = mkM(g); h.box(1.9, .28, .3, 0, -.2, 0, h.M.dark); for (let i = 0; i < 4; i++) h.box(.38, .26, .22, (i - 1.5) * .47, .1, 0, i % 2 ? h.M.orange : h.M.redE); } },
  { id: 'window', cat: 'DEC', name: 'Ventana', size: [1, 1, 1], mass: 1.5, color: '#9fd8ff',
    fn: 'Cristal transparente: cabinas con visibilidad.', draw: (g) => { const h = mkM(g); h.box(1.02, 1.02, .1, 0, 0, 0, mats().glass); h.box(.08, 1.04, 1.02, 0, 0, 0, h.M.dark); h.box(1.04, .08, 1.02, 0, 0, 0, h.M.dark); } },
  { id: 'dome', cat: 'DEC', name: 'Cúpula de cristal', size: [1, 1, 1], mass: 2.5, color: '#9fd8ff',
    fn: 'Globo de observación transparente.', draw: (g) => { const h = mkM(g); h.dome(.5, 0, -.42, 0, mats().glass); h.cyl(.52, .56, .16, 0, -.5, 0, 'y', 14, h.M.metal); } },
  { id: 'paintStripe', cat: 'DEC', name: 'Franja decorativa', size: [1, 1, 1], mass: .5, color: '#d9443a',
    fn: 'Línea de pintura para dar carácter a tu carrocería.', sh: [[1, .25, .3, 0, 0, .38]],
    draw: (g, p) => { const h = mkM(g, p || mats().redE); h.box(1.04, .22, .06, 0, 0, .48, mats().redE); } },
  { id: 'hazard', cat: 'DEC', name: 'Señal de peligro', size: [1, 1, 1], mass: .8, color: '#e0c531',
    fn: 'Placa de señalización con franjas de aviso.', sh: [[1, 1, .14, 0, 0, .42]],
    draw: (g) => { const h = mkM(g); h.box(1.04, .8, .1, 0, 0, .44, h.M.dark); for (let i = -2; i <= 2; i++) h.box(.18, .78, .05, i * .2, 0, .49, i % 2 ? h.M.dark : h.M.orange); } },
  { id: 'antenna', cat: 'DEC', name: 'Antena', size: [1, 1, 1], mass: 1, color: '#94a3b3',
    fn: 'Mástil con baliza intermitente.', sh: [[.2, 1, .2, 0, 0, 0]],
    draw: (g) => { const h = mkM(g); h.cyl(.05, .07, .9, 0, .3, 0, 'y', 8, h.M.metal); h.sph(.12, 0, .78, 0, h.M.redE); } },
  { id: 'exhaust', cat: 'DEC', name: 'Tubo de escape', size: [1, 1, 1], mass: 2, color: '#5c6670',
    fn: 'Emite humo cuando el motor trabaja.', props: { exhaust: 1 },
    draw: (g) => { const h = mkM(g); h.cyl(.16, .16, .7, 0, 0, 0, 'z', 10, h.M.metal); h.cyl(.2, .2, .12, 0, 0, .35, 'z', 10, h.M.dark); } },
  { id: 'bumper', cat: 'DEC', name: 'Defensa', size: [1, 1, 1], mass: 5, color: '#3f4a56',
    fn: 'Barra protectora: absorbe golpes frontales.', sh: [[.5, 1, 1, 0, 0, 0]],
    draw: (g) => { const h = mkM(g); h.cyl(.13, .13, 1.04, .3, 0, 0, 'x', 10, h.M.metal); h.cyl(.13, .13, 1.04, -.3, 0, 0, 'x', 10, h.M.metal); h.cyl(.13, .13, .68, 0, 0, 0, 'y', 10, h.M.metal); } },
];

export const PARTS = _defs;
export const PART = {};
for (const p of PARTS) {
  PART[p.id] = p;
  if (!p.sh) p.sh = [[p.size[0] * .96, p.size[1] * .96, p.size[2] * .96, 0, 0, 0]];
}

export function instPart(partId, color) {
  const part = PART[partId];
  if (!part) return null;
  const g = new THREE.Group();
  part.draw(g, color ? paintMat(color) : null);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
export function totalMass(blockList) { let m = 0; for (const b of blockList) m += PART[b.p]?.mass || 0; return m; }
export function countParts(blocks) { return blocks.length; }
