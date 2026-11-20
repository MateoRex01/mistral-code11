import * as THREE from 'three';
import { clamp, lerp } from '../core/utils.js';

const V_SKY = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const F_SKY = `
uniform vec3 topColor; uniform vec3 botColor; uniform vec3 sunDir;
uniform float sunI; varying vec3 vDir;
void main() {
  float t = clamp(vDir.y * 1.4 + .25, 0., 1.);
  vec3 col = mix(botColor, topColor, t);
  float sun = pow(max(dot(vDir, normalize(sunDir)), 0.), 90.) * 3. + pow(max(dot(vDir, normalize(sunDir)), 0.), 6.) * .3;
  col += vec3(1., .8, .55) * sun * sunI;
  gl_FragColor = vec4(col, 1.);
}`;

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.time = 10;           // horas
    this.autoTime = true;
    this.timeScale = .04;     // horas por segundo
    this.weather = 'clear';
    this.waterY = 0;
    this.waterOn = false;

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3f4a3a, .8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 500;
    const sc = this.sun.shadow.camera;
    sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120;
    this.sun.shadow.bias = -.0004;
    scene.add(this.sun); scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0x334455, .25);
    scene.add(this.ambient);

    // cúpula
    this.skyGeo = new THREE.SphereGeometry(900, 24, 14);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: V_SKY, fragmentShader: F_SKY, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3f7fd0) },
        botColor: { value: new THREE.Color(0xbfe0f0) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunI: { value: 1 },
      },
    });
    this.dome = new THREE.Mesh(this.skyGeo, this.skyMat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // estrellas
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(870);
      if (v.y < 30) v.y = Math.abs(v.y) + 30;
      sp.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    scene.add(this.stars);

    // nubes
    const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: .85, fog: false });
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 26);
    this.cloudSeeds = [];
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 26; i++) {
      const s = { x: (Math.random() - .5) * 900, y: 130 + Math.random() * 90, z: (Math.random() - .5) * 900, sx: 30 + Math.random() * 50, sy: 8 + Math.random() * 8, v: 2 + Math.random() * 3 };
      this.cloudSeeds.push(s);
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(s.sx, s.sy, s.sx * .7));
      this.clouds.setMatrixAt(i, m4);
    }
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);

    // lluvia
    const rainN = 1400;
    const rp = new Float32Array(rainN * 3);
    for (let i = 0; i < rainN; i++) { rp[i * 3] = (Math.random() - .5) * 160; rp[i * 3 + 1] = Math.random() * 90; rp[i * 3 + 2] = (Math.random() - .5) * 160; }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaccee, size: .18, transparent: true, opacity: 0, fog: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainGeo = rainGeo;
    this.flashT = 0;

    scene.fog = new THREE.Fog(0xbfe0f0, 100, 600);
  }

  setWater(y) { this.waterY = y; this.waterOn = true; }
  addWaterMesh(mesh) { this.water = mesh; }
  removeWater() { if (this.water) { this.scene.remove(this.water); this.water = null; } this.waterOn = false; }

  setWeather(w) {
    this.weather = w;
    this.rain.visible = (w === 'rain' || w === 'storm');
    this.rain.material.opacity = w === 'storm' ? .55 : .35;
    if (w === 'fog') { this.scene.fog.near = 8; this.scene.fog.far = 120; }
    else { this.scene.fog.near = 80; this.scene.fog.far = 640; }
    this.clouds.material.opacity = w === 'clear' ? .85 : 1;
  }

  setTime(h) { this.time = clamp(h, 0, 24); }

  update(dt, quality, cameraPos) {
    if (this.autoTime) this.time = (this.time + this.timeScale * dt) % 24;
    const t = this.time;
    const ang = (t / 24) * Math.PI * 2 - Math.PI / 2;
    const sunDir = new THREE.Vector3(Math.cos(ang) * .8, Math.sin(ang), Math.cos(ang) * .3 + .4).normalize();
    const dayF = clamp(sunDir.y * 2.2, 0, 1);
    const duskF = clamp(1 - Math.abs(sunDir.y) * 3.5, 0, 1);

    this.sun.position.copy(sunDir).multiplyScalar(280).add(cameraPos || new THREE.Vector3());
    this.sun.target.position.copy(cameraPos || new THREE.Vector3());
    this.sun.intensity = 2.4 * dayF;
    this.sun.color.setHSL(.09, .6 - duskF * .1, .55 + duskF * .25);
    this.hemi.intensity = .25 + dayF * .7;
    this.ambient.intensity = .12 + (1 - dayF) * .16;
    if (this.weather === 'storm') this.sun.intensity *= .35;

    // colores del cielo
    const top = new THREE.Color(0x0a1526).lerp(new THREE.Color(0x3f7fd0), dayF).lerp(new THREE.Color(0xd06a3a), duskF * .5);
    const bot = new THREE.Color(0x101826).lerp(new THREE.Color(0xbfe0f0), dayF).lerp(new THREE.Color(0xffb070), duskF * .8);
    this.skyMat.uniforms.topColor.value.copy(top);
    this.skyMat.uniforms.botColor.value.copy(bot);
    this.skyMat.uniforms.sunDir.value.copy(sunDir);
    this.skyMat.uniforms.sunI.value = .4 + dayF;
    this.dome.position.copy(cameraPos || new THREE.Vector3());
    this.stars.position.copy(cameraPos || new THREE.Vector3());
    this.stars.material.opacity = clamp(1 - dayF * 2, 0, .9);

    if (this.scene.fog.far > 200) this.scene.fog.color.copy(dayF > .3 ? bot : new THREE.Color(0x0e1622));

    // nubes a la deriva
    if (quality !== 'low' && this.cloudSeeds) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < this.cloudSeeds.length; i++) {
        const s = this.cloudSeeds[i];
        s.x += s.v * dt * (this.weather === 'storm' ? 5 : 1);
        if (s.x > 600) s.x = -600;
        m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.sx, s.sy, s.sx * .7));
        this.clouds.setMatrixAt(i, m4);
      }
      this.clouds.instanceMatrix.needsUpdate = true;
      this.clouds.position.y = 0;
    }

    // lluvia
    if (this.rain.visible) {
      const p = this.rainGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 60;
        if (y < 0) y = 90 + Math.random() * 10;
        p.setY(i, y);
      }
      p.needsUpdate = true;
      this.rain.position.set(cameraPos?.x || 0, cameraPos?.y || 0, cameraPos?.z || 0);
      this.flashT -= dt;
      if (this.weather === 'storm' && Math.random() < dt * .15) {
        this.flashT = .12;
        this.ambient.intensity = 2.2;
      }
    }

    // agua
    if (this.water && this.water.visible) {
      const g = this.water.geometry;
      const pos = g.attributes.position;
      const time = performance.now() / 1000;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getY(i); // plano aún sin rotar
        pos.setZ(i, Math.sin(x * .12 + time * 1.4) * .3 + Math.sin(z * .1 + time * .9) * .28);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      this.water.position.y = this.waterY;
    }
  }

  buildWater(scene, def) {
    this.removeWater();
    if (!def.water) return;
    const size = def.size * 2.4;
    const geo = new THREE.PlaneGeometry(size, size, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.palette.deep), roughness: .12, metalness: .35,
      transparent: true, opacity: .86,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = def.waterLevel;
    mesh.receiveShadow = false;
    scene.add(mesh);
    this.water = mesh;
    this.waterY = def.waterLevel;
    this.waterOn = true;
    this.setWater(def.waterLevel);
  }
}
