import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { clamp, lerp } from '../core/utils.js';

export class Terrain {
  constructor(scene, world, def, edits = null) {
    this.scene = scene; this.world = world; this.def = def;
    const N = this.def.grid, S = this.def.size;
    this.N = N; this.S = S; this.el = S / N; this.half = S / 2;

    this.heights = new Float32Array((N + 1) * (N + 1));
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const x = -this.half + i * this.el;
      const z = this.half - j * this.el;
      this.heights[j * (N + 1) + i] = this.sampleBase(x, z);
    }
    this.applyFlatten();
    if (edits && edits.heightDeltas) {
      for (const d of edits.heightDeltas) this.heights[d.j * (N + 1) + d.i] = d.v;
    }
    this.buildMesh();
    this.buildPhysics();
    this.buildRoads();
    this.buildBridges();
  }

  sampleBase(x, z) { return this.def.height(x, z); }

  applyFlatten() {
    if (!this.def.flatten) return;
    const N = this.N, el = this.el;
    for (const f of this.def.flatten) {
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = -this.half + i * el, z = this.half - j * el;
        const inx = Math.abs(x - f.x) < f.w / 2, inz = Math.abs(z - f.z) < f.d / 2;
        if (!inx && !inz) continue;
        const ex = clamp((f.w / 2 - Math.abs(x - f.x)) / 16, 0, 1);
        const ez = clamp((f.d / 2 - Math.abs(z - f.z)) / 16, 0, 1);
        const t = Math.min(inx ? ex : 0, inz ? ez : 0);
        const idx = j * (N + 1) + i;
        this.heights[idx] = lerp(this.heights[idx], f.y, clamp(t, 0, 1));
      }
    }
  }

  idx(i, j) { return this.heights[j * (this.N + 1) + i]; }
  worldFromIJ(i, j) { return [-this.half + i * this.el, this.half - j * this.el]; }

  buildMesh() {
    const N = this.N, S = this.S;
    const vc = (N + 1) * (N + 1);
    const pos = new Float32Array(vc * 3);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const [x, z] = this.worldFromIJ(i, j);
      const o = (j * (N + 1) + i) * 3;
      pos[o] = x; pos[o + 1] = this.heights[j * (N + 1) + i]; pos[o + 2] = z;
    }
    const idxArr = new Uint32Array(N * N * 6);
    let k = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + (N + 1), d = c + 1;
      idxArr[k++] = a; idxArr[k++] = c; idxArr[k++] = b;
      idxArr[k++] = b; idxArr[k++] = c; idxArr[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
    geo.computeVertexNormals();
    const col = new Float32Array(vc * 3);
    const P = this.def.palette;
    const Cdeep = new THREE.Color(P.deep), Csand = new THREE.Color(P.sand), Clow = new THREE.Color(P.low),
      Cmid = new THREE.Color(P.mid), Chigh = new THREE.Color(P.high);
    const nrm = geo.attributes.normal;
    for (let v = 0; v < vc; v++) {
      const h = pos[v * 3 + 1];
      const slope = 1 - Math.abs(nrm.getY(v));
      const c = new THREE.Color();
      if (this.def.water && h < this.def.waterLevel + 1.5) c.copy(Csand);
      else if (h < this.def.waterLevel + 4 && this.def.water) c.lerpColors(Csand, Clow, clamp((h - this.def.waterLevel - 1.5) / 2.5, 0, 1));
      else if (h < 18) c.lerpColors(Clow, Cmid, clamp(h / 18, 0, 1));
      else c.lerpColors(Cmid, Chigh, clamp((h - 18) / 50, 0, 1));
      if (slope > .45) c.lerp(Chigh, clamp((slope - .45) * 2.2, 0, .85));
      if (h > 55) c.lerp(new THREE.Color(0xeef2f6), clamp((h - 55) / 30, 0, .9));
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'terrainMesh';
    this.scene.add(this.mesh);
  }

  buildPhysics() {
    const N = this.N;
    const data = [];
    for (let i = 0; i <= N; i++) {
      const colArr = [];
      for (let j = 0; j <= N; j++) colArr.push(this.heights[j * (N + 1) + i]);
      data.push(colArr);
    }
    const shape = new CANNON.Heightfield(data, { elementSize: this.el });
    this.hfShape = shape;
    const body = new CANNON.Body({ mass: 0, material: this.world.groundMaterial });
    body.addShape(shape);
    body.position.set(-this.half, 0, this.half);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.hfBody = body;
    this.world.addBody(body);
  }

  syncPhysicsShape() {
    const N = this.N;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) this.hfShape.data[i][j] = this.heights[j * (N + 1) + i];
    try { this.hfShape.update && this.hfShape.update(); } catch { /* api antigua */ }
    this.hfBody.updateAABB();
  }

  sampleHeight(x, z) {
    const N = this.N, el = this.el, S = this.S, half = this.half;
    const fx = clamp((x + half) / el, 0, N - 1e-4);
    const fz = clamp((half - z) / el, 0, N - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fxx => fxx - Math.floor(fxx), tz = tzz => tzz - Math.floor(tzz);
    const dx = fx - i, dz = fz - j;
    const h00 = this.idx(i, j), h10 = this.idx(i + 1, j), h01 = this.idx(i, j + 1), h11 = this.idx(i + 1, j + 1);
    return lerp(lerp(h00, h10, dx), lerp(h01, h11, dx), dz);
  }

  buildRoads() {
    if (!this.def.roads) return;
    const N = this.N;
    for (const road of this.def.roads) {
      const pts = road.pts.map(p => [p[0], p[1], this.sampleBase(p[0], p[1])]);
      for (let pass = 0; pass < 6; pass++) {
        for (let s = 1; s < pts.length - 1; s++) {
          pts[s][2] = (pts[s - 1][2] + pts[s][2] * 2 + pts[s + 1][2]) / 4;
        }
      }
      const reach = road.w * 1.6;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const [x, z] = this.worldFromIJ(i, j);
        const { d, seg, f } = distToPoly(x, z, pts);
        if (d > reach) continue;
        const t = (1 - d / reach) ** 1.3;
        const target = lerp(pts[seg][2], pts[Math.min(seg + 1, pts.length - 1)][2], f);
        const idx = j * (N + 1) + i;
        this.heights[idx] = lerp(this.heights[idx], target, t * .92);
      }
    }
    this.syncPhysicsShape();
    this.rebuildPositionsAndColors();
    for (const road of this.def.roads) this.buildRoadRibbon(road);
  }

  buildRoadRibbon({ pts, w, dashes }) {
    const geoPos = [], geoIdx = [], uv = [];
    const up = new THREE.Vector3(0, 1, 0);
    let v = 0;
    for (let s = 0; s < pts.length; s++) {
      const p = pts[s], pn = pts[Math.min(s + 1, pts.length - 1)], pp = pts[Math.max(s - 1, 0)];
      const dir = new THREE.Vector2(pn[0] - pp[0], pn[1] - pp[1]).normalize();
      const per = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(w / 2);
      const h = this.sampleHeight(p[0], p[1]) + .08;
      geoPos.push(p[0] + per.x, h, p[1] + per.y, p[0] - per.x, h, p[1] - per.y);
      uv.push(0, s * .3, 1, s * .3);
      if (s < pts.length - 1) {
        geoIdx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
      v += 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(geoPos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(geoIdx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: this.def.palette.road, roughness: .9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (dashes) {
      const dashGeo = [];
      const di = [];
      let vi = 0;
      for (let s = 0; s < pts.length - 1; s += 2) {
        const p = pts[s], pn = pts[Math.min(s + 1, pts.length - 1)];
        const dir = new THREE.Vector2(pn[0] - p[0], pn[1] - p[1]).normalize();
        const per = new THREE.Vector2(-dir.y, dir.x);
        const h = this.sampleHeight(p[0], p[1]) + .1;
        dashGeo.push(p[0] + per.x * 1.4, h, p[1] + per.y * 1.4, p[0] - per.x * 1.4, h, p[1] - per.y * 1.4, pn[0] + per.x * 1.4, this.sampleHeight(pn[0], pn[1]) + .1, pn[1] + per.y * 1.4, pn[0] - per.x * 1.4, this.sampleHeight(pn[0], pn[1]) + .1, pn[1] - per.y * 1.4);
        di.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
        vi += 4;
      }
      if (dashGeo.length) {
        const dg = new THREE.BufferGeometry();
        dg.setAttribute('position', new THREE.Float32BufferAttribute(dashGeo, 3));
        dg.setIndex(di);
        dg.computeVertexNormals();
        const dm = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0xd8d4b8, roughness: .8 }));
        this.scene.add(dm);
      }
    }
  }

  buildBridges() {
    if (!this.def.bridges) return;
    for (const b of this.def.bridges) {
      const a = b.pts[0], c = b.pts[1];
      for (let s = 0; s < 24; s++) {
        const t = s / 23;
        const x = lerp(a[0], c[0], t), z = lerp(a[1], c[1], t);
        const block = new THREE.Mesh(G_box(b.w, .5, 20 / 23 * Math.hypot(c[0] - a[0], c[1] - a[1])), new THREE.MeshStandardMaterial({ color: 0x6a5438, roughness: .85 }));
        block.position.set(x, b.y, z);
        block.rotation.y = -Math.atan2(c[0] - a[0], c[1] - a[1]) + Math.PI / 2;
        block.castShadow = true;
        this.scene.add(block);
        const shape = new CANNON.Box(new CANNON.Vec3(b.w / 2, .3, Math.hypot(c[0] - a[0], c[1] - a[1]) / 46));
        const body = new CANNON.Body({ mass: 0, material: this.world.groundMaterial });
        body.addShape(shape);
        body.position.set(x, b.y - .25, z);
        body.quaternion.copy(block.quaternion);
        this.world.addBody(body);
      }
    }
    function G_box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  }

  rebuildPositionsAndColors() {
    const N = this.N;
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) pos.setY(j * (N + 1) + i, this.heights[j * (N + 1) + i]);
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    const nrm = this.mesh.geometry.attributes.normal;
    const P = this.def.palette;
    const Cdeep = new THREE.Color(P.deep), Csand = new THREE.Color(P.sand), Clow = new THREE.Color(P.low),
      Cmid = new THREE.Color(P.mid), Chigh = new THREE.Color(P.high);
    const col = this.mesh.geometry.attributes.color;
    const vc = (N + 1) * (N + 1);
    for (let v = 0; v < vc; v++) {
      const h = pos.getY(v);
      const slope = 1 - Math.abs(nrm.getY(v));
      const c = new THREE.Color();
      if (this.def.water && h < this.def.waterLevel + 1.5) c.copy(Csand);
      else if (h < this.def.waterLevel + 4 && this.def.water) c.lerpColors(Csand, Clow, clamp((h - this.def.waterLevel - 1.5) / 2.5, 0, 1));
      else if (h < 18) c.lerpColors(Clow, Cmid, clamp(h / 18, 0, 1));
      else c.lerpColors(Cmid, Chigh, clamp((h - 18) / 50, 0, 1));
      if (slope > .45) c.lerp(Chigh, clamp((slope - .45) * 2.2, 0, .85));
      if (h > 55) c.lerp(new THREE.Color(0xeef2f6), clamp((h - 55) / 30, 0, .9));
      col.setXYZ(v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  editHeight(x, z, delta, radius = 12) {
    const N = this.N;
    let changed = false;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const [wx, wz] = this.worldFromIJ(i, j);
      const d = Math.hypot(wx - x, wz - z);
      if (d > radius) continue;
      const t = (1 - d / radius) ** 1.5;
      const idx = j * (N + 1) + i;
      const before = this.heights[idx];
      this.heights[idx] = clamp(before + delta * t, -60, 140);
      if (before !== this.heights[idx]) changed = true;
    }
    if (changed) { this.rebuildPositionsAndColors(); this.syncPhysicsShape(); }
    return changed;
  }
  flattenAt(x, z, radius = 14) {
    const h = this.sampleHeight(x, z);
    const N = this.N;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const [wx, wz] = this.worldFromIJ(i, j);
      const d = Math.hypot(wx - x, wz - z);
      if (d > radius) continue;
      const t = (1 - d / radius) ** 1.2;
      const idx = j * (N + 1) + i;
      this.heights[idx] = lerp(this.heights[idx], h, t);
    }
    this.rebuildPositionsAndColors(); this.syncPhysicsShape();
  }
  heightDeltaRegister() { /* deltas se guardan desde el editor */ }
}
