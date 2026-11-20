import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PART, instPart } from '../parts/catalog.js';
import { blockCenter, blockAABB, orientQuat } from './builder.js';

function gapBetween(a, b) {
  const gapx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
  const gapy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
  const gapz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
  return Math.max(gapx, gapy, gapz);
}

/* grafo de adyacencia; bisagras y pistones son barreras (separan clusters) */
export function clustersOf(blocks) {
  const N = blocks.length;
  const aabbs = blocks.map(blockAABB);
  const barrier = blocks.map(b => !!(PART[b.p].props?.hinge || PART[b.p].props?.piston));
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (gapBetween(aabbs[i], aabbs[j]) <= .34) { adj[i].push(j); adj[j].push(i); }
  }
  const groupOf = new Array(N).fill(-1);
  let gid = 0;
  for (let i = 0; i < N; i++) {
    if (groupOf[i] !== -1) continue;
    const stack = [i];
    groupOf[i] = gid;
    while (stack.length) {
      const n = stack.pop();
      if (barrier[n]) continue;
      for (const m of adj[n]) if (groupOf[m] === -1) { groupOf[m] = gid; stack.push(m); }
    }
    gid++;
  }
  return { groupOf, adj, barrier, count: Math.max(1, gid) };
}

/* ---------- ensamblado ---------- */
export function assemble(vehicle, opts) {
  const { world, scene, pos, yaw = 0 } = opts;
  const blocks = vehicle.blocks;
  const { groupOf, count: nGroups } = clustersOf(blocks);

  const centroids = Array.from({ length: nGroups }, () => new THREE.Vector3());
  const masses = new Array(nGroups).fill(0);
  blocks.forEach((b, i) => {
    const g = groupOf[i];
    const m = PART[b.p].mass;
    centroids[g].addScaledVector(blockCenter(b), m);
    masses[g] += m;
  });
  for (let g = 0; g < nGroups; g++) if (masses[g] > 0) centroids[g].divideScalar(masses[g]);

  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  const inst = {
    id: vehicle.id || ('v' + Math.random().toString(36).slice(2, 8)),
    data: vehicle,
    world, scene,
    groupsCount: nGroups,
    clusters: [],
    constraints: [],
    hingeJoints: [],
    pistonJoints: [],
    wheels: [],
    seats: [],
    thrusters: [],
    rotors: [],
    tailRotors: [],
    airProps: [],
    waterProps: [],
    floats: [],
    wings: [],
    sensors: [],
    lightsRefs: [],
    exhausts: [],
    enginePower: 0, rotorPower: 0, gyro: 0, armor: 0, hull: 0,
    steerBoost: 0, controlBoost: 0, suspBonus: 0,
    controlPitch: 0, controlYaw: 0, navalYaw: 0,
    lightsOn: false,
    spawnPos: pos.clone(),
    integrity: 1,
    totalBlocks: blocks.length,
    aliveBlocks: blocks.length,
  };

  for (let g = 0; g < nGroups; g++) {
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    const body = new CANNON.Body({ mass: Math.max(1, masses[g]), material: world.vehicleMaterial });
    body.linearDamping = .015;
    body.angularDamping = .12;
    let hasGyro = false;
    const wheelDefs = [];

    blocks.forEach((b, i) => {
      if (groupOf[i] !== g) return;
      const part = PART[b.p];
      const pr = part.props || {};
      const bc = blockCenter(b);
      const q = orientQuat(b.o);
      const off = bc.clone().sub(centroids[g]);

      for (const s of part.sh) {
        const shape = new CANNON.Box(new CANNON.Vec3(s[0] / 2, s[1] / 2, s[2] / 2));
        const offv = new THREE.Vector3(s[3], s[4], s[5]).applyQuaternion(q);
        body.addShape(shape,
          new CANNON.Vec3(off.x + offv.x, off.y + offv.y, off.z + offv.z),
          new CANNON.Quaternion(q.x, q.y, q.z, q.w));
      }

      const vm = instPart(b.p, b.c);
      vm.position.copy(off);
      vm.quaternion.copy(q);
      vm.userData.bi = i;
      vm.traverse(o => { if (o.isMesh) o.userData.bi = i; });
      meshGroup.add(vm);

      if (pr.wheel) wheelDefs.push({ i, b, conn: off.clone(), dir: new THREE.Vector3(0, -1, 0).applyQuaternion(q), axle: new THREE.Vector3(1, 0, 0).applyQuaternion(q), radius: pr.wheel.radius, grip: pr.wheel.grip });
      if (pr.engine) inst.enginePower += pr.engine;
      if (pr.thruster) inst.thrusters.push({ g, local: off.clone(), dir: new THREE.Vector3(0, 0, 1).applyQuaternion(q), power: pr.thruster, mesh: vm.getObjectByName('nozzleGlow') });
      if (pr.wing) inst.wings.push({ g, local: off.clone(), area: pr.wing.area, normal: new THREE.Vector3(0, 1, 0).applyQuaternion(q) });
      if (pr.rotor) inst.rotorPower += 1, inst.rotors.push({ g, local: off.clone(), power: 1, mesh: vm.getObjectByName('spin') });
      if (pr.tailRotor) inst.tailRotors.push({ g, local: off.clone(), power: pr.tailRotor, mesh: vm.getObjectByName('spinX') });
      if (pr.airProp) inst.airThr += 1, inst.airProps.push({ g, local: off.clone(), dir: new THREE.Vector3(0, 0, 1).applyQuaternion(q), power: pr.airProp, mesh: vm.getObjectByName('spin') });
      if (pr.waterProp) inst.waterThr += 1, inst.waterProps.push({ g, local: off.clone(), dir: new THREE.Vector3(0, 0, 1).applyQuaternion(q), power: pr.waterProp, mesh: vm.getObjectByName('spin') });
      if (pr.buoy) inst.floats.push({ g, local: off.clone(), vol: pr.buoy });
      if (pr.control === 'pitch') inst.controlPitch += 1;
      if (pr.control === 'yaw') inst.controlYaw += 1, inst.navalYaw += pr.naval ? 2 : .6;
      if (pr.seat) inst.seats.push({ g, local: off.clone(), kind: pr.seat, mesh: vm, first: pr.seat === 'driver' });
      if (pr.gyro) { hasGyro = true; inst.gyro += pr.gyro; }
      if (pr.steerBoost) inst.steerBoost += pr.steerBoost;
      if (pr.controlBoost) inst.controlBoost += pr.controlBoost;
      if (pr.susp) inst.suspBonus += pr.susp;
      if (pr.sensor) inst.sensors.push({ g, local: off.clone(), dir: new THREE.Vector3(0, 0, 1).applyQuaternion(q), range: pr.sensor, mesh: vm.getObjectByName('sensorEye') });
      if (pr.light) {
        let light;
        if (pr.light.type === 'spot') {
          light = new THREE.SpotLight(0xfff2c8, 0, pr.light.range, .45, .5, 1.2);
          light.position.set(0, 0, .2);
          light.target.position.set(0, -.6, 10);
          vm.add(light.target);
        } else {
          light = new THREE.PointLight(0xffe2a8, 0, pr.light.range, 1.6);
        }
        light.intensity = 0;
        vm.add(light);
        inst.lightsRefs.push(light);
      }
      if (pr.exhaust) inst.exhausts.push({ g, local: bc.clone().sub(centroids[g]), mesh: vm });
      if (pr.armor) inst.armor += pr.armor;
    });

    if (hasGyro) body.angularDamping = Math.min(.85, .12 + inst.gyro * .17);
    const cw = centroids[g].clone().applyQuaternion(yawQ);
    body.position.set(pos.x + cw.x, pos.y + cw.y, pos.z + cw.z);
    body.quaternion.set(yawQ.x, yawQ.y, yawQ.z, yawQ.w);
    body.allowSleep = true;
    body.sleepSpeedLimit = .35;
    body.addEventListener('collide', e => inst.onImpact && inst.onImpact(e, inst));
    world.addBody(body);

    const cluster = { g, body, meshGroup, masses: masses[g], centroid: centroids[g].clone() };
    inst.clusters.push(cluster);

    if (wheelDefs.length) {
      const rc = new CANNON.RaycastVehicle({ chassisBody: body, indexUpAxis: 1, indexRightAxis: 0, indexForwardAxis: 2 });
      const anySteerFlag = wheelDefs.some(w => PART[w.b.p].props?.steer);
      wheelDefs.forEach((w) => {
        const steerThis = anySteerFlag ? !!PART[w.b.p].props?.steer : (Math.abs(w.conn.x) > Math.abs(w.conn.z) * .9);
        const options = {
          radius: w.radius,
          directionLocal: (() => { const v = new CANNON.Vec3(w.dir.x, w.dir.y, w.dir.z); v.normalize(); return v; })(),
          suspensionStiffness: 34,
          suspensionRestLength: .36,
          frictionSlip: w.grip,
          dampingRelaxation: 2.7 + inst.suspBonus * .6,
          dampingCompression: 4.6 + inst.suspBonus * .6,
          maxSuspensionForce: 3e5,
          rollInfluence: .015,
          axleLocal: (() => { const v = new CANNON.Vec3(w.axle.x, w.axle.y, w.axle.z); v.normalize(); return v; })(),
          chassisConnectionPointLocal: new CANNON.Vec3(w.conn.x, w.conn.y - w.radius * .5, w.conn.z),
          maxSuspensionTravel: .5,
          customSlidingRotationalSpeed: -32,
          useCustomSlidingRotationalSpeed: true,
        };
        rc.addWheel(options);
        inst.wheels.push({ rcv: rc, wi: rc.wheelInfos.length - 1, cluster, steer: steerThis, radius: w.radius, bi: w.i, mesh: null, spin: 0 });
      });
      rc.addToWorld(world);
      cluster.rcv = rc;
    }
  }

  // bisagras / pistones → constraints entre clusters
  const aabbs = blocks.map(blockAABB);
  blocks.forEach((b, i) => {
    const part = PART[b.p];
    const pr = part.props || {};
    if (!(pr.hinge || pr.piston)) return;
    const myG = groupOf[i];
    let other = -1, bestScore = -1e9;
    for (let j = 0; j < blocks.length; j++) {
      if (j === i || groupOf[j] === myG) continue;
      if (aabbs[i].c.distanceTo(aabbs[j].c) > 2.6) continue;
      const score = aabbs[j].c.distanceTo(centroids[myG]);
      if (score > bestScore) { bestScore = score; other = j; }
    }
    if (other < 0) return;
    const otherG = groupOf[other];
    const q = orientQuat(b.o);
    const pivotA = blockCenter(b).sub(centroids[myG]);
    const pivotB = blockCenter(blocks[other]).sub(centroids[otherG]);
    const cvA = new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z);
    const cvB = new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z);
    let constraint;
    if (pr.hinge) {
      const axv = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const axis = new CANNON.Vec3(axv.x, axv.y, axv.z);
      constraint = new CANNON.HingeConstraint(inst.clusters[myG].body, inst.clusters[otherG].body, { pivotA: cvA, axisA: axis, pivotB: cvB, axisB: axis, maxForce: 1e7 });
      constraint.enableMotor();
      constraint.setMotorMaxForce(150);
      inst.hingeJoints.push({ constraint, target: 0 });
    } else {
      constraint = new CANNON.PointToPointConstraint(inst.clusters[myG].body, cvA, inst.clusters[otherG].body, cvB, 1e7);
      inst.pistonJoints.push({ other, blocksI: i, g: myG, gB: otherG, local: blockCenter(b).sub(centroids[myG]).clone(), dir: new THREE.Vector3(0, 0, 1).applyQuaternion(q), force: pr.piston || 1600 });
    }
    world.addConstraint(constraint);
    inst.constraints.push(constraint);
  });

  for (const w of inst.wheels) {
    w.mesh = instPart(wheelIdFor(w.radius));
    w.mesh.castShadow = true;
    scene.add(w.mesh);
  }

  for (const c of inst.clusters) c.meshGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return inst;
}

export function wheelIdFor(r) {
  if (r < .34) return 'wheelS';
  if (r < .47) return r > .43 ? 'wheelSteer' : 'wheelM';
  return r > .52 ? 'wheelL' : 'wheelOff';
}

/* quita instancias del mundo / escena */
export function disassemble(inst) {
  if (!inst) return;
  for (const c of inst.clusters) {
    if (c.rcv) c.rcv.removeFromWorld(inst.world);
    inst.world.removeBody(c.body);
    inst.scene.remove(c.meshGroup);
    c.meshGroup.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    if (c.rcv) for (const wi of c.rcv.wheelInfos) wi.raycastResult.body = null;
  }
  for (const ct of inst.constraints) inst.world.removeConstraint(ct);
  for (const w of inst.wheels) if (w.mesh) { inst.scene.remove(w.mesh); w.mesh.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
  inst.clusters = []; inst.constraints = []; inst.wheels = [];
}

export function describe(inst) {
  return {
    parts: inst.totalBlocks,
    mass: Math.round(inst.clusters.reduce((a, c) => a + c.masses, 0)),
    power: Math.round(inst.enginePower * 10) / 10,
    seats: inst.seats.length,
    canDrive: inst.seats.some(s => s.kind === 'driver'),
  };
}
