import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PART, instPart, totalMass } from '../parts/catalog.js';
import { assemble, disassemble, wheelIdFor } from '../build/assembly.js';
import { blockCenter, orientQuat } from '../build/builder.js';
import { clamp, uid } from '../core/utils.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { sfx, updateEngineAudio } from '../core/sound.js';

const GRAV = 14;

/* pequeñas partículas compartidas (polvo, chispas, humo) */
class Particles {
  constructor(scene, max = 420) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: .5, vertexColors: true, transparent: true, opacity: .85, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  emit(p, v, color, life = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= dt * 3;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class VehicleSim {
  constructor({ world, scene, env, terrain, camera }) {
    this.world = world;
    this.scene = scene;
    this.env = env;
    this.terrain = terrain;
    this.camera = camera;
    this.instances = [];
    this.debris = [];
    this.particles = new Particles(scene);
    this.collisionsOn = true;
    this.damageOn = settings.data.physicsDamage;
    this.fpCamera = false;
    this.camOrbit = { yaw: 0, pitch: .25, dist: settings.data.camDistance };
  }

  spawn(data, pos, yaw = 0) {
    const inst = assemble(data, { world: this.world, scene: this.scene, pos, yaw });
    inst.hp = new Map();
    inst.origData = JSON.parse(JSON.stringify(data));
    inst.impactCd = 0;
    inst.spawnPos = pos.clone();
    inst.spawnYaw = yaw;
    inst.isFocus = false;
    for (let i = 0; i < data.blocks.length; i++) {
      const b = data.blocks[i];
      const pr = PART[b.p].props || {};
      let hp = 14;
      if (pr.armor) hp += pr.armor * 6;
      if (pr.wheel) hp = 10;
      if (partIsStructural(b.p)) hp = 22;
      inst.hp.set(i, hp);
    }
    inst.hpInit = Array.from(inst.hp.values()).reduce((s, v) => s + v, 0);
    inst.totalBlocks = data.blocks.length;
    inst.integrity = 1;
    inst.onImpact = (e, self) => this.handleImpact(inst, e);
    this.instances.push(inst);
    sfx.spawn();
    return inst;
  }

  remove(inst) {
    const i = this.instances.indexOf(inst);
    if (i >= 0) this.instances.splice(i, 1);
    disassemble(inst);
  }

  rebuild(inst, newData, pos, yaw) {
    const i = this.instances.indexOf(inst);
    if (i >= 0) this.instances.splice(i, 1);
    disassemble(inst);
    const fresh = this.spawn(newData, pos, yaw);
    fresh.isFocus = inst.isFocus;
    return fresh;
  }

  repair(inst) {
    const pos = this.focusPos(inst);
    const fresh = this.rebuild(inst, JSON.parse(JSON.stringify(inst.origData)), pos, yawOf(inst));
    sfx.spawn();
    return fresh;
  }
  respawn(inst) {
    const pos = inst.spawnPos.clone();
    const fresh = this.rebuild(inst, JSON.parse(JSON.stringify(inst.origData)), pos, inst.spawnYaw);
    sfx.spawn();
    return fresh;
  }

  focusPos(inst) {
    const c = inst.clusters[0];
    return new THREE.Vector3(c.body.position.x, c.body.position.y, c.body.position.z);
  }

  handleImpact(inst, e) {
    if (!this.damageOn) return;
    if (inst.impactCd > 0) return;
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact < 7.5) return;
    inst.impactCd = .4;
    sfx.crash();
    const p = new THREE.Vector3(e.body?.position?.x || 0, e.body?.position?.y || 0, e.body?.position?.z || 0);
    for (let k = 0; k < 6; k++) {
      this.particles.emit(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 5, (Math.random() - .5) * 6), 0xffc060, .7);
    }
    // daña el bloque con menos armor del cluster golpeado
    if (Math.random() < .5) return;
    const cluster = inst.clusters.find(c => c.body === e.target || c.body === e.body);
    if (!cluster) return;
    let worst = -1, worstHp = 1e9;
    cluster.meshGroup.children.forEach(vm => {
      const bi = vm.userData.bi;
      const hp = inst.hp.get(bi);
      if (hp != null && hp < worstHp) { worstHp = hp; worst = bi; }
    });
    if (worst < 0) return;
    const nhp = worstHp - impact * 1.6;
    inst.hp.set(worst, nhp);
    if (nhp <= 0) this.detachBlock(inst, worst);
    this.updateIntegrity(inst);
  }

  detachBlock(inst, bi) {
    const b = inst.data.blocks[bi];
    if (!b) return;
    const part = PART[b.p];
    const c = inst.clusters.find(cl => cl.meshGroup.children.some(v => v.userData.bi === bi));
    if (!c) return;
    // escombro físico
    const world = this.world;
    const q = c.body.quaternion;
    const off = blockCenter(b).sub(c.centroid);
    const rot = orientQuat(b.o);
    const worldOff = new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    const wp = new THREE.Vector3(c.body.position.x + worldOff.x, c.body.position.y + worldOff.y, c.body.position.z + worldOff.z);
    const body = new CANNON.Body({ mass: Math.max(1.5, part.mass), material: this.world.vehicleMaterial });
    for (const s of part.sh) {
      body.addShape(new CANNON.Box(new CANNON.Vec3(s[0] / 2, s[1] / 2, s[2] / 2)), new CANNON.Vec3(s[3], s[4], s[5]), new CANNON.Quaternion(rot.x, rot.y, rot.z, rot.w));
    }
    body.position.set(wp.x, wp.y, wp.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.velocity.set(c.body.velocity.x + (Math.random() - .5) * 4, 2 + Math.random() * 3, c.body.velocity.z + (Math.random() - .5) * 4);
    body.angularVelocity.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    world.addBody(body);
    const mesh = instPart(b.p, b.c);
    mesh.position.copy(wp); mesh.quaternion.set(q.x, q.y, q.z, q.w);
    this.scene.add(mesh);
    this.debris.push({ body, mesh, ttl: 22 });

    // quita del vehículo
    inst.data.blocks.splice(bi, 1);
    const alive = this.rebuild(inst, JSON.parse(JSON.stringify(inst.data)), this.focusPos(inst), yawOf(inst));
    Object.assign(inst, alive);
  }

  updateIntegrity(inst) {
    let hpSum = 0;
    for (const [, v] of inst.hp) hpSum += Math.max(0, v);
    inst.aliveBlocks = inst.data.blocks.length;
    inst.integrity = clamp(hpSum / Math.max(1, inst.hpInit || 1), 0, 1);
  }

  setCollisions(on) {
    this.collisionsOn = on;
    for (const inst of this.instances) for (const c of inst.clusters) c.body.collisionResponse = on;
  }

  update(dt) {
    this.damageOn = settings.data.physicsDamage;
    for (const inst of this.instances) {
      inst.impactCd = Math.max(0, inst.impactCd - dt);
      this.updateMeshes(inst, dt);
      if (inst.isFocus) this.drive(inst, dt);
      else this.idle(inst, dt);
    }
    // escombros
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.ttl -= dt;
      d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
      d.mesh.rotation.y += dt;
      if (d.ttl <= 0 || d.body.position.y < -80) {
        this.world.removeBody(d.body);
        this.scene.remove(d.mesh);
        this.debris.splice(i, 1);
      }
    }
    this.particles.update(dt);
  }

  updateMeshes(inst, dt) {
    for (const c of inst.clusters) {
      c.meshGroup.position.set(c.body.position.x, c.body.position.y, c.body.position.z);
      c.meshGroup.quaternion.set(c.body.quaternion.x, c.body.quaternion.y, c.body.quaternion.z, c.body.quaternion.w);
    }
    for (const w of inst.wheels) {
      if (!w.mesh) continue;
      w.rcv.updateWheelTransform(w.wi);
      const t = w.rcv.wheelInfos[w.wi].worldTransform;
      w.mesh.position.set(t.position.x, t.position.y, t.position.z);
      w.mesh.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
      const speed = w.rcv.wheelInfos[w.wi].deltaRotation || 0;
      w.mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), speed);
    }
    // animación de rotores / hélices
    const spin = dt * (inst.isFocus ? ((input.isDown('forward') ? 46 : 5) + inst.rotorPower * 6) : 2);
    for (const r of inst.rotors) if (r.mesh) r.mesh.rotation.z += spin;
    for (const r of inst.tailRotors) if (r.mesh) r.mesh.rotation.x += spin * 1.4;
    for (const r of inst.airProps) if (r.mesh) r.mesh.rotation.z += spin * 1.2;
    for (const r of inst.waterProps) if (r.mesh) r.mesh.rotation.z += spin * (inst.clusters[r.g].body.position.y < this.env.waterY + 1 ? 3 : 1);
    for (const t of inst.thrusters) {
      if (t.mesh) {
        const active = inst.isFocus && input.isDown('forward');
        t.mesh.scale.setScalar(active ? 1 + Math.sin(performance.now() / 60) * .25 : .7);
      }
    }
    for (const s of inst.sensors) if (s.mesh) s.mesh.scale.setScalar(inst.sensorActive ? 1.18 : 1);
    // luces
    const on = inst.lightsOn;
    for (const l of inst.lightsRefs) l.intensity = on ? l.type === 'SpotLight' ? 3 : 2.2 : 0;
  }

  /* sin conductor: freno leve */
  idle(inst) {
    for (const w of inst.wheels) if (w.steer) w.rcv.setSteeringValue(0, w.wi);
  }

  /* ---------- control del vehículo enfocado ---------- */
  drive(inst, dt) {
    const kb = key => input.isDown(key);
    const fwd = kb('forward'), back = kb('back'), left = kb('left'), right = kb('right');
    const brake = kb('brake') && !inst.rotors.length && !inst.floats.length;
    const boost = kb('boost') ? 1.55 : 1;
    const throttle = (fwd ? 1 : 0) - (back ? 1 : 0);
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    const up = kb('brake');
    const down = kb('descend');
    inst.lastThrottle = throttle; inst.lastSpeed = this.status(inst).speed;

    for (const c of inst.clusters) c.body.wakeUp();

    // ruedas
    const wheels = inst.wheels;
    if (wheels.length) {
      const totalF = throttle * (2200 + inst.enginePower * 1050) * boost;
      const per = totalF / wheels.length;
      const steerAmt = steer * (.52 + inst.steerBoost * .12);
      const groundedCount = wheels.filter(w => w.rcv.wheelInfos[w.wi].isInContact).length;
      for (const w of wheels) {
        if (w.steer) w.rcv.setSteeringValue(steerAmt, w.wi);
        if (groundedCount > 0) {
          w.rcv.applyEngineForce(per, w.wi);
          w.rcv.setBrake(brake ? 26 : .2, w.wi);
        } else {
          w.rcv.applyEngineForce(0, w.wi);
          w.rcv.setBrake(.05, w.wi);
        }
        // polvo al derrapar
        if (groundedCount > 0 && Math.abs(throttle) > 0 && Math.random() < dt * 8) {
          const info = w.rcv.wheelInfos[w.wi];
          const t = info.worldTransform.position;
          this.particles.emit(new THREE.Vector3(t.x, t.y - w.radius, t.z), new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 2, (Math.random() - .5) * 2), 0xc9b390, .8);
        }
      }
    }

    // propulsores (dirección fija de la pieza)
    if (throttle !== 0) {
      for (const t of inst.thrusters) {
        const body = inst.clusters[t.g].body;
        const dir = worldDir(body, t.dir).multiplyScalar(t.power * (throttle > 0 ? 1 : -.6) * boost);
        const wp = worldPoint(body, t.local);
        body.applyForce(new CANNON.Vec3(dir.x, dir.y, dir.z), new CANNON.Vec3(wp.x, wp.y, wp.z));
        if (Math.random() < dt * 26) this.particles.emit(wp.clone(), dir.clone().multiplyScalar(-.06).add(new THREE.Vector3(0, .5, 0)).normalize().multiplyScalar(4), 0xffb066, .5);
      }
      // hélices reforzadas
      for (const p of inst.airProps) {
        const body = inst.clusters[p.g].body;
        if (body.position.y < this.env.waterY + .5) continue;
        const dir = worldDir(body, p.dir).multiplyScalar(p.power * throttle * boost);
        const wp = worldPoint(body, p.local);
        body.applyForce(new CANNON.Vec3(dir.x, dir.y, dir.z), new CANNON.Vec3(wp.x, wp.y, wp.z));
      }
      // hélices navales
      const anyFloat = inst.clusters.some(c => c.body.position.y < this.env.waterY + .8);
      for (const p of inst.waterProps) {
        const body = inst.clusters[p.g].body;
        if (!(anyFloat || body.position.y < this.env.waterY + .6)) continue;
        const dir = worldDir(body, p.dir).multiplyScalar(p.power * throttle * boost);
        const wp = worldPoint(body, p.local);
        body.applyForce(new CANNON.Vec3(dir.x, dir.y, dir.z), new CANNON.Vec3(wp.x, wp.y, wp.z));
      }
    }

    // rotores (helicópteros)
    if (inst.rotors.length) {
      for (const r of inst.rotors) {
        const body = inst.clusters[r.g].body;
        const acc = up ? 20.5 : down ? 5.5 : 14.6;
        const force = body.mass * acc / inst.rotors.length;
        const wp = worldPoint(body, r.local);
        body.applyForce(new CANNON.Vec3(0, force, 0), new CANNON.Vec3(wp.x, wp.y, wp.z));
      }
      const body = inst.clusters[0].body;
      const yawT = steer * (900 + inst.tailRotors.reduce((a, r) => a + r.power, 0) * 2600) * (up ? 1 : .35);
      body.torque.y += yawT;
      body.torque.x += throttle * 24000;
    }

    // control aéreo con alas
    const speed = bodySpeed(inst);
    if (speed > 8 && inst.wings.length > 0) {
      const body = inst.clusters[0].body;
      const airFactor = clamp(speed / 28, 0, 1.6);
      const au = worldDir(body, new THREE.Vector3(0, 1, 0));
      const right = worldDir(body, new THREE.Vector3(1, 0, 0));
      const pitchIn = (back ? 1 : 0) - (fwd ? 1 : 0);
      body.torque.x += right.x * pitchIn * (6000 + inst.controlPitch * 5200) * airFactor * inst.clusters[0].masses * .02;
      body.torque.y += steer * (4200 + inst.controlYaw * 4200) * airFactor * inst.clusters[0].masses * .02;
    }

    // bisagras y pistones
    const hIn = (kb('hingeT') ? 1 : 0) - (kb('hingeNeg') ? 1 : 0);
    for (const hj of inst.hingeJoints) hj.constraint.setMotorSpeed(hIn * 1.4);
    const pIn = (kb('pistonT') ? 1 : 0) - (kb('pistonNeg') ? 1 : 0);
    for (const pj of inst.pistonJoints) {
      const body = inst.clusters[pj.gB].body;
      const dir = worldDir(body, pj.dir).multiplyScalar(pIn * pj.force);
      const wp = worldPoint(body, pj.local);
      body.applyForce(new CANNON.Vec3(dir.x, dir.y, dir.z), new CANNON.Vec3(wp.x, wp.y, wp.z));
    }

    // interruptor de luces
    if (input.rawPressed('KeyX') && inst.lightsRefs.length) inst.lightsOn = !inst.lightsOn;

    // sensores → contrapropulsores
    for (const s of inst.sensors) {
      const body = inst.clusters[s.g].body;
      const from = worldPoint(body, s.local);
      const to = from.clone().add(worldDir(body, s.dir).multiplyScalar(s.range));
      const result = new CANNON.RaycastResult();
      this.world.raycastClosest(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z), { skipBackfaces: true }, result);
      inst.sensorActive = result.hasHit && result.distance < s.range;
    }

    updateEngineAudio(true, throttle, this.status(inst).speed, inst.rotors.length > 0);

    // sonido del viento / agua en la HUD
    inst.dust = inst.dust || 0;
  }

  status(inst) {
    const body = inst.clusters[0].body;
    const speed = Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z);
    const gh = this.terrain.sampleHeight(body.position.x, body.position.z);
    const q = body.quaternion;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    const tilt = Math.acos(clamp(up.y, -1, 1)) * 180 / Math.PI;
    const inWater = this.env.waterOn && body.position.y < this.env.waterY + .6;
    return {
      speed: speed * 3.6,
      speedMs: speed,
      alt: body.position.y - gh,
      y: body.position.y,
      tilt,
      integrity: inst.integrity,
      inWater,
      parts: inst.aliveBlocks,
      totalParts: inst.totalBlocks,
      hasSeat: inst.seats.some(s => s.kind === 'driver'),
    };
  }

  /* ---------- fuerzas pasivas: alas, flotación ---------- */
  passive(dt) {
    const waterY = this.env.waterOn ? this.env.waterY : -1e9;
    for (const inst of this.instances) {
      // alas
      for (const w of inst.wings) {
        if (w.g >= inst.clusters.length) continue;
        const body = inst.clusters[w.g].body;
        const wp = worldPoint(body, w.local);
        const nrm = worldDir(body, w.normal);
        const vel = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
        if (vel.length() < 3.5) continue;
        const u = vel.clone().normalize();
        const sinA = clamp(u.dot(nrm.clone().negate()), -1, 1);
        const liftDir = nrm.clone().sub(u.clone().multiplyScalar(nrm.dot(u)));
        if (liftDir.lengthSq() > 1e-4) {
          liftDir.normalize();
          const V2 = vel.lengthSq();
          let lift = 1.05 * V2 * w.area * Math.abs(sinA) * .13;
          const cap = body.mass * 45 / inst.wings.length;
          lift = Math.min(lift, cap);
          body.applyForce(new CANNON.Vec3(liftDir.x * lift, liftDir.y * lift, liftDir.z * lift), new CANNON.Vec3(wp.x, wp.y, wp.z));
        }
        const dragK = .5 * .04 * w.area;
        body.applyForce(new CANNON.Vec3(-u.x * dragK * vel.lengthSq(), -u.y * dragK * vel.lengthSq(), -u.z * dragK * vel.lengthSq()), new CANNON.Vec3(wp.x, wp.y, wp.z));
      }

      // flotadores
      if (inst.floats.length && this.env.waterOn) {
        for (const f of inst.floats) {
          const body = inst.clusters[f.g].body;
          const wp = worldPoint(body, f.local);
          const depth = waterY - wp.y;
          if (depth > 0) {
            const subm = clamp(depth, 0, .8);
            const force = f.vol * 2100 * subm;
            body.applyForce(new CANNON.Vec3(0, force, 0), new CANNON.Vec3(wp.x, wp.y, wp.z));
            const damp = f.vol * 160 * subm;
            body.applyForce(new CANNON.Vec3(-body.velocity.x * damp, -body.velocity.y * damp, -body.velocity.z * damp), new CANNON.Vec3(wp.x, wp.y, wp.z));
            if (Math.abs(body.velocity.y) > 4 && Math.random() < dt * 10) {
              this.particles.emit(wp.clone(), new THREE.Vector3((Math.random() - .5) * 3, 2, (Math.random() - .5) * 3), 0xbfe8ff, .6);
            }
          }
        }
        // casco aporta flotación
        if (inst.hull > 0) {
          const body = inst.clusters[0].body;
          const depth = waterY - body.position.y;
          if (depth > 0) body.applyForce(new CANNON.Vec3(0, Math.min(depth, .7) * inst.hull * 950, 0), body.position);
        }
      }
    }
  }
}

/* helpers de transformación */
function worldPoint(body, local) {
  const q = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  return new THREE.Vector3(local.x, local.y, local.z).applyQuaternion(q).add(new THREE.Vector3(body.position.x, body.position.y, body.position.z));
}
function worldDir(body, local) {
  const q = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  return new THREE.Vector3(local.x, local.y, local.z).applyQuaternion(q);
}
function bodySpeed(inst) {
  const v = inst.clusters[0].body.velocity;
  return Math.hypot(v.x, v.y, v.z);
}
function yawOf(inst) {
  const q = new THREE.Quaternion(inst.clusters[0].body.quaternion.x, inst.clusters[0].body.quaternion.y, inst.clusters[0].body.quaternion.z, inst.clusters[0].body.quaternion.w);
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return e.y;
}
function partIsStructural(id) { return ['block', 'blockR', 'blockTall', 'blockLarge', 'wedge', 'wedgeL', 'hull', 'blockSmall', 'panel'].includes(id); }
