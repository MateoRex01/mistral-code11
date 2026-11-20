import { fbm, clamp, lerp, mulberry32 } from '../core/utils.js';

/*
 Cada mapa provee:
  - height(x,z): altura analítica (m)
  - water: bool + waterLevel
  - flatten: rects aplanados (pistas, puertos, explanadas)
  - roads: polilíneas (se aplanan y se dibujan)
  - scatter(rnd, api): vegetación, rocas, edificios
  - chals: desafíos generados
  - sky: tinte de ambiente
*/

function key(x, z) { return `${x.toFixed(1)},${z.toFixed(1)}`; }

/* helper: distancia mínima de (x,z) a una polilínea (lo usa terrain.js para allanar carreteras) */
export function distToPoly(x, z, pts) {
  let best = 1e9, bi = 0, bf = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bi = i; bf = t; }
  }
  return { d: best, seg: bi, f: bf };
}

/* genera polilínea con curvas suaves hacia puntos de control */
function smoothPath(ctrl, steps = 6) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const a = ctrl[i], b = ctrl[i + 1];
    for (let s = 0; s < steps; s++) out.push([lerp(a[0], b[0], s / steps), lerp(a[1], b[1], s / steps)]);
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

export function makeMaps() {
  const maps = [];

  /* ================= ISLA TROPICAL ================= */
  const tropRoad = smoothPath([[-60, 120], [0, 150], [80, 120], [110, 40], [120, -40], [70, -110], [-20, -120], [-100, -80], [-115, 0], [-60, 120]], 5);
  const tropCross = smoothPath([[0, 150], [0, 60], [0, -10], [0, -60], [0, -118]], 6);
  maps.push({
    id: 'tropical', name: 'Isla Tropical', icon: '🌴',
    desc: 'Playas, palmeras, jungla y un aeródromo costero. Todo terreno en un solo anillo.',
    size: 560, grid: 128, seed: 11, water: true, waterLevel: 0,
    palette: { deep: 0x1a4a66, sand: 0xd8c084, low: 0x4f9d5b, mid: 0x3f7f4f, high: 0x7d838c, road: 0x3c4046 },
    sun: { skyTop: 0x3f7fd0, skyBot: 0xbfe0f0 },
    spawn: [0, -30],
    height(x, z) {
      const r = Math.hypot(x, z) / 260;
      const n = fbm(x * .012, z * .012, 11, 4);
      let h = -14 + n * 46;
      const island = clamp((0.95 - r) * 2.2, -1, 1);
      h = h * (island * .55 + .5) - Math.max(0, r - .9) * 60;
      const mtn = Math.pow(clamp(1 - Math.hypot(x + 60, z + 140) / 150, 0, 1), 2) * (30 + fbm(x * .05, z * .05, 33, 3) * 55);
      h += mtn;
      const river = clamp(1 - Math.abs(Math.sin(x * .01) * 30 + x * .12 - z) / 26, 0, 1) * (r < .8 ? 1 : 0);
      h -= river * 16;
      return h;
    },
    flatten: [
      { x: 150, z: 90, w: 90, d: 14, y: 4 },            // aeródromo
      { x: -150, z: -10, w: 40, d: 26, y: 2.5 },        // puerto
    ],
    roads: [
      { pts: tropRoad, w: 7, dashes: 1 },
      { pts: tropCross, w: 6, dashes: 1 },
      { pts: smoothPath([[150, 90], [150, 20], [120, -40]], 4), w: 6, dashes: 1 },
    ],
    scatter(rnd, api) {
      for (let i = 0; i < 240; i++) {
        const x = (rnd() - .5) * 500, z = (rnd() - .5) * 500;
        const h = this.height(x, z);
        if (h < 3 || h > 26) continue;
        if (rnd() < .3) api.palm(x, z, .8 + rnd() * .7); else api.pine(x, z, .8 + rnd() * .8);
      }
      for (let i = 0; i < 60; i++) {
        const x = (rnd() - .5) * 500, z = (rnd() - .5) * 500;
        const h = this.height(x, z);
        if (h > 2 && h < 40) api.rock(x, z, .6 + rnd() * 1.6);
      }
      api.hangar(150, 90, 0);
      api.dock(-150, -10, 0);
      api.platform(60, -140, 0, 8);
    },
    chals(api) {
      return [
        api.race('anillo-tropical', 'Anillo Tropical', this.roads[0].pts, 8),
        api.flight('vuelo-jungla', 'Vuelo sobre la Jungla', 6, 55, 260),
        api.float('flotacion-costa', 'Prueba de Flotación', [ [20, -195], [60, -185], [90, -160], [120, -120] ]),
      ];
    },
  });

  /* ================= DESIERTO ================= */
  const desRoad = smoothPath([[-140, -140], [0, -60], [130, -70], [170, 40], [60, 140], [-70, 130], [-150, 20], [-140, -140]], 5);
  maps.push({
    id: 'desierto', name: 'Desierto', icon: '🏜️',
    desc: 'Dunas infinitas, un cañón y una zona de pruebas con rampas. Rey del salto.',
    size: 560, grid: 128, seed: 27, water: false, waterLevel: -40,
    palette: { deep: 0x6a4b2a, sand: 0xd9b36c, low: 0xcf9c50, mid: 0xb87f3f, high: 0x96632f, road: 0x4a4540 },
    sun: { skyTop: 0x2f6bb5, skyBot: 0xf0d0a0 },
    spawn: [0, 0],
    height(x, z) {
      const dunes = Math.sin(x * .045 + fbm(x * .02, z * .02, 27, 2) * 3) * 6 + fbm(x * .02, z * .02, 27, 4) * 24;
      const mesa = Math.pow(clamp(1 - Math.hypot(x - 150, z - 150) / 120, 0, 1), 3) * 55;
      const canyon = -17 * clamp(1 - Math.abs(fbm(x * .008, z * .008, 43, 3) * 140 - 60) / 24, 0, 1) * clamp(1 - Math.hypot(x - 150, z - 150) / 150, 0, 1);
      return 2 + dunes + mesa + canyon;
    },
    flatten: [{ x: -60, z: 60, w: 80, d: 60, y: 3 }],
    roads: [{ pts: desRoad, w: 8, dashes: 1 },
            { pts: smoothPath([[-60, 60], [20, 20], [90, 40]], 5), w: 6, dashes: 0 }],
    scatter(rnd, api) {
      for (let i = 0; i < 70; i++) {
        const x = (rnd() - .5) * 520, z = (rnd() - .5) * 520;
        const h = this.height(x, z);
        if (h > 40 || h < 0) continue;
        api.cactus(x, z, .7 + rnd() * .6);
      }
      for (let i = 0; i < 40; i++) api.rock((rnd() - .5) * 520, (rnd() - .5) * 520, .7 + rnd() * 2.2);
      api.platform(-60, 60, 0, 16);
      api.ramp(-30, 84, 0, 0);
      api.ramp(-90, 36, 0, Math.PI / 2);
      api.cones(-60, 30, 0, 8);
    },
    chals(api) {
      return [
        api.race('circuito-dunas', 'Circuito de las Dunas', this.roads[0].pts, 9),
        api.flight('salto-canion', 'Vuelo sobre el Cañón', 5, 60, 240),
        api.rally('rally-rocoso', 'Rally Rocoso', [[0, 0], [60, -80], [130, 90], [20, 130], [-90, 90], [0, 0]]),
      ];
    },
  });

  /* ================= MONTAÑAS ================= */
  const mntRoad = smoothPath([[-40, 170], [0, 90], [-60, 30], [0, -40], [-50, -110], [40, -160], [40, -40], [40, 80], [-40, 170]], 5);
  maps.push({
    id: 'montanas', name: 'Alta Montaña', icon: '🏔️',
    desc: 'Cumbres nevadas, caminos al borde del vacío y puentes colgantes.',
    size: 560, grid: 128, seed: 53, water: true, waterLevel: 6,
    palette: { deep: 0x14303f, sand: 0x9aa0a0, low: 0x5c7a4e, mid: 0x4c6b40, high: 0x8d949c, road: 0x55534e },
    sun: { skyTop: 0x2f6cd8, skyBot: 0xcfe3f2 },
    spawn: [0, 140],
    height(x, z) {
      const n = fbm(x * .008, z * .008, 53, 5);
      let h = n * 95 - 25;
      h += Math.max(0, 70 - Math.abs(z) * .35) * (fbm(x * .02, z * .02, 7, 3) * .8 + .4);
      const lake = -clamp(1 - Math.hypot(x + 130, z - 120) / 70, 0, 1) * 22;
      return h + lake * (h < 20 ? 1 : 0);
    },
    flatten: [{ x: 0, z: 150, w: 50, d: 40, y: 22 }],
    roads: [{ pts: mntRoad, w: 6.5, dashes: 1 }],
    bridges: [
      { pts: [[-20, 20], [30, 12]], y: 24, w: 6 },
    ],
    scatter(rnd, api) {
      for (let i = 0; i < 180; i++) {
        const x = (rnd() - .5) * 500, z = (rnd() - .5) * 500;
        const h = this.height(x, z);
        if (h < 10 || h > 55) continue;
        api.pine(x, z, 1 + rnd() * 1.1);
      }
      for (let i = 0; i < 50; i++) {
        const x = (rnd() - .5) * 500, z = (rnd() - .5) * 500;
        if (this.height(x, z) > 8) api.rock(x, z, 1 + rnd() * 2.4);
      }
      api.platform(0, 150, 0, 10);
    },
    chals(api) {
      return [
        api.race('camino-precipicio', 'Camino del Precipicio', this.roads[0].pts, 10),
        api.flight('vuelo-alpino', 'Vuelo Alpino', 7, 90, 260),
        api.rally('rally-bosque', 'Rally del Bosque', [[0, 140], [-60, 40], [40, -60], [-40, -150], [30, -60], [0, 140]]),
      ];
    },
  });

  /* ================= OCÉANO ================= */
  const ocRoad = smoothPath([[-40, 130], [30, 120], [70, 70], [60, 10], [0, -10], [-40, 40], [-40, 130]], 5);
  maps.push({
    id: 'oceano', name: 'Archipiélago', icon: '🌊',
    desc: 'Mar abierto, islotes, un puerto comercial y profundidades submarinas.',
    size: 700, grid: 128, seed: 71, water: true, waterLevel: 0,
    palette: { deep: 0x0d3a52, sand: 0xd8c084, low: 0x4f9d5b, mid: 0x498a52, high: 0x86929c, road: 0x3c4046 },
    sun: { skyTop: 0x2f77cc, skyBot: 0xaadef2 },
    spawn: [0, -6],
    height(x, z) {
      const isles = [-90, -60, 60, 60, 170, 40, -130, -120, 120, -150];
      let h = -34;
      for (let i = 0; i < isles.length; i += 2) {
        const d = Math.hypot(x - isles[i], z - isles[i + 1]);
        const R = 52 + fbm(x * .03, z * .03, 71 + i, 2) * 26;
        h = Math.max(h, (12 + fbm(x * .04, z * .04, 71 + i, 3) * 26) * clamp(1 - d / R, 0, 1) ** (i === 0 ? 1 : 1.6) - (i === 0 ? 0 : 3));
      }
      h += fbm(x * .05, z * .05, 72, 3) * 4 - 2;
      return h;
    },
    flatten: [{ x: -150, z: 20, w: 46, d: 34, y: 3 }],
    roads: [{ pts: ocRoad, w: 6, dashes: 1 }],
    scatter(rnd, api) {
      for (let i = 0; i < 120; i++) {
        const x = (rnd() - .5) * 620, z = (rnd() - .5) * 620;
        const h = this.height(x, z);
        if (h < 2 || h > 24) continue;
        api.palm(x, z, .9 + rnd() * .8);
      }
      api.dock(-150, 20, 0); api.dock(-150, 60, 2);
      api.cranes(-150, 40, 0, 2);
      api.platform(60, 60, 0, 9);
      for (let i = 0; i < 10; i++) api.buoy((rnd() - .5) * 600, (rnd() - .5) * 600, 0);
    },
    chals(api) {
      return [
        api.race('vueltas-puerto', 'Vueltas al Puerto', this.roads[0].pts, 7),
        api.float('regata-isla', 'Regata entre Islas', [ [0, -60], [90, -40], [140, 50], [60, 140], [-60, 120], [-140, 40] ]),
        api.flight('vuelo-oceano', 'Travesía del Mar', 6, 60, 300),
      ];
    },
  });

  /* ================= ZONA INDUSTRIAL ================= */
  const indRoad = smoothPath([[-170, -170], [170, -170], [170, 170], [-170, 170], [-170, -170]], 4);
  const indCross = smoothPath([[-170, 0], [170, 0]], 4);
  maps.push({
    id: 'industrial', name: 'Zona Industrial', icon: '🏭',
    desc: 'Fábricas, naves, grúas pórtico y bancos de prueba sobre asfalto infinito.',
    size: 560, grid: 128, seed: 97, water: false, waterLevel: -50,
    palette: { deep: 0x3a4046, sand: 0x6a7078, low: 0x5b636b, mid: 0x515a62, high: 0x4a5258, road: 0x33373c },
    sun: { skyTop: 0x4a86c8, skyBot: 0xd8cfc2 },
    spawn: [0, 0],
    height(x, z) {
      const n = fbm(x * .01, z * .01, 97, 3);
      return 2 + n * 5 - Math.pow(clamp((Math.hypot(x, z) - 200) / 120, 0, 1), 2) * 40;
    },
    flatten: [
      { x: -120, z: -100, w: 160, d: 120, y: 2.5 },
      { x: 0, z: 0, w: 300, d: 200, y: 3 },
      { x: 120, z: 120, w: 90, d: 90, y: 2.5 },
    ],
    roads: [
      { pts: indRoad, w: 9, dashes: 1 },
      { pts: indCross, w: 8, dashes: 1 },
      { pts: smoothPath([[-170, 90], [170, 90]], 4), w: 7, dashes: 0 },
    ],
    scatter(rnd, api) {
      const spots = [[-120, -140], [-60, -140], [0, -140], [60, -140], [-120, -60], [-60, -60], [90, -60], [140, -60]];
      spots.forEach((s, i) => api.factory(s[0], s[1], 0, i % 2));
      [[-150, 40], [-80, 40], [-10, 40], [60, 40]].forEach((s, i) => api.warehouse(s[0], s[1], Math.PI / 2, i % 2));
      api.cranes(-40, 110, 0, 3);
      api.platform(120, 120, 0, 14);
      api.ramp(120, 90, 0, 0); api.ramp(150, 120, 0, Math.PI / 2);
      api.cones(120, 60, 0, 12);
      for (let i = 0; i < 24; i++) api.rockbox((rnd() - .5) * 400 + 160, (rnd() - .5) * 400 + 160, 0, 1 + rnd() * 2);
    },
    chals(api) {
      return [
        api.race('h-piloto', 'Circuito del Piloto', this.roads[0].pts, 8),
        api.stability('banco-gruas', 'Banco de las Grúas', [[-40, 110], [40, 110]]),
        api.sprint('sprnt-industrial', 'Sprint del Asfalto', smoothPath([[-170, 0], [170, 0]], 4)),
      ];
    },
  });

  return maps;
}

export function buildChallengeAPI() {
  const rings = (pts, n, lift = 2, r = 6) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
      const f = t * (pts.length - 1) - i;
      out.push({
        x: lerp(pts[i][0], pts[i + 1][0], f),
        z: lerp(pts[i][1], pts[i + 1][1], f),
        y: 2, r,
      });
    }
    return out;
  };
  return {
    race: (id, name, pts, n) => ({ id, type: 'race', name, rings: rings(pts, n) }),
    sprint: (id, name, pts) => ({ id, type: 'speed', name, rings: rings(pts, 5) }),
    rally: (id, name, pts) => ({ id, type: 'rally', name, rings: rings(pts, 6) }),
    flight: (id, name, n, h, spread) => {
      const ringsA = [];
      for (let k = 1; k <= n; k++) {
        const a = k / n * Math.PI * 2;
        ringsA.push({ x: Math.cos(a) * spread * .6, z: Math.sin(a) * spread * .6, y: h - Math.sin(k) * 12, r: 16 });
      }
      return { id, type: 'flight', name, rings: ringsA };
    },
    float: (id, name, pts) => ({ id, type: 'float', name, rings: pts.map(p => ({ x: p[0], z: p[1], y: 0, r: 14 })) }),
    stability: (id, name, pts) => ({ id, type: 'stability', name, rings: pts.map(p => ({ x: p[0], z: p[1], y: 3, r: 22 })) }),
  };
}
