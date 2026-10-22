// Effets : étincelles, feu, fumée, débris, éclats de verre, confettis.
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js';
import { ROOM, TABLE_Y } from './models.js';

const G = 9.8;

// Nuage de particules à taille fixe ; couleur et transparence par particule.
function particles(scene, max, size, blending, dot) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending }));
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);
  const list = [];
  let next = 0;
  return {
    pts,
    emit(p, v, life, c0, c1, opts) {
      const i = next;
      next = (next + 1) % max;
      list[i] = { p: p.clone(), v: v.clone(), life, age: 0, c0, c1, drag: (opts && opts.drag) || 0.6, lift: (opts && opts.lift) || 0, grav: (opts && opts.grav) || 0 };
    },
    update(dt) {
      let live = 0;
      for (let i = 0; i < max; i++) {
        const q = list[i];
        // Particule éteinte : rangée loin sous la scène pour ne rien dessiner.
        if (!q || q.age >= q.life) { col[i * 4 + 3] = 0; pos[i * 3 + 1] = -1e4; continue; }
        live++;
        q.age += dt;
        q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.v.y += (q.lift - q.grav) * dt;
        q.p.addScaledVector(q.v, dt);
        const t = Math.min(1, q.age / q.life);
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        col[i * 4] = q.c0[0] + (q.c1[0] - q.c0[0]) * t;
        col[i * 4 + 1] = q.c0[1] + (q.c1[1] - q.c0[1]) * t;
        col[i * 4 + 2] = q.c0[2] + (q.c1[2] - q.c0[2]) * t;
        col[i * 4 + 3] = (q.c0[3] + (q.c1[3] - q.c0[3]) * t) * Math.min(1, (1 - t) * 3);
      }
      pts.visible = live > 0;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    clear() { list.length = 0; col.fill(0); geo.attributes.color.needsUpdate = true; },
  };
}

// Morceaux identiques (briques, éclats, confettis) animés en un seul appel de dessin.
function shards(scene, geo, mat, max) {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);
  const items = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  return {
    mesh,
    add(p, v, spin, scale, opts) {
      if (items.length >= max) return;
      items.push(Object.assign({ p: p.clone(), v: v.clone(), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin, s: scale, rest: false }, opts || {}));
      mesh.count = items.length;
    },
    color(i, c) { mesh.setColorAt(i, c); mesh.instanceColor.needsUpdate = true; },
    update(dt) {
      items.forEach((it, i) => {
        if (!it.rest) {
          if (it.flutter) {
            it.v.x += Math.sin(it.r.x * 3) * dt * 0.6;
            it.v.z += Math.cos(it.r.z * 3) * dt * 0.6;
            it.v.multiplyScalar(Math.exp(-2.2 * dt));
            it.v.y -= 2.5 * dt;
          } else {
            it.v.y -= G * dt;
          }
          it.p.addScaledVector(it.v, dt);
          it.r.addScaledVector(it.spin, dt);
          const floor = landing(it.p);
          if (it.p.y < floor) {
            it.p.y = floor;
            if (it.flutter || it.v.length() < 1.2) { it.rest = true; it.r.x = Math.round(it.r.x / Math.PI) * Math.PI + Math.PI / 2; }
            else { it.v.y = -it.v.y * 0.3; it.v.x *= 0.5; it.v.z *= 0.5; it.spin.multiplyScalar(0.5); }
          }
        }
        m4.compose(it.p, q.setFromEuler(e.set(it.r.x, it.r.y, it.r.z)), new THREE.Vector3(it.s, it.s, it.s));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { items.length = 0; mesh.count = 0; },
  };
}

// Hauteur où un objet se pose : la table, le sol de la salle, ou le vide hors de la tour.
function landing(p) {
  const r = Math.hypot(p.x, p.z);
  if (r < 1.0 && p.y > TABLE_Y - 0.1) return TABLE_Y + 0.01;
  if (Math.abs(p.x) < ROOM.half && Math.abs(p.z) < ROOM.half) return 0.02;
  return -60;
}

export function createFx(scene, high) {
  const dot = TX.softDot();
  const fire = particles(scene, high ? 500 : 250, 0.7, THREE.AdditiveBlending, dot);
  const smoke = particles(scene, high ? 260 : 120, 1.4, THREE.NormalBlending, dot);
  const sparks = particles(scene, 240, 0.045, THREE.AdditiveBlending, dot);
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.95 });
  const bricks = shards(scene, new THREE.BoxGeometry(0.3, 0.16, 0.2), brickMat, high ? 220 : 120);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.12, 0, -0.08, -0.06, 0, 0.09, -0.05, 0], 3));
  tri.computeVertexNormals();
  const glass = shards(scene, tri, new THREE.MeshBasicMaterial({ color: 0xffe6c0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }), high ? 260 : 140);
  const confetti = shards(scene, new THREE.PlaneGeometry(0.03, 0.045), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 320);
  const bodies = [];
  const lights = [];

  const api = {
    // Petite gerbe d'étincelles (fil coupé, pince).
    sparks(at, n, color) {
      const c = color || [1, 0.85, 0.4, 1];
      for (let i = 0; i < (n || 30); i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(0.6 + Math.random() * 1.4);
        sparks.emit(at, v, 0.35 + Math.random() * 0.4, c, [1, 0.3, 0.05, 0.6], { drag: 1.2, grav: 4 });
      }
    },
    // Objet de la scène projeté par l'explosion.
    throwObject(obj, v, spin, opts) {
      bodies.push(Object.assign({ obj, v: v.clone(), spin: spin.clone() }, opts || {}));
    },
    fireball(at) {
      for (let i = 0; i < (high ? 260 : 140); i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 7);
        fire.emit(at, v, 0.6 + Math.random() * 1.0, [1, 0.95, 0.7, 1], [0.9, 0.25, 0.05, 0.3], { drag: 2.4, lift: 1.5 });
      }
      for (let i = 0; i < (high ? 120 : 60); i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 3);
        smoke.emit(at.clone().add(v.clone().multiplyScalar(0.2)), v, 2.5 + Math.random() * 2.5, [0.25, 0.2, 0.2, 0.75], [0.08, 0.07, 0.08, 0], { drag: 1.2, lift: 0.6 });
      }
      const light = new THREE.PointLight(0xff8a3a, 60, 0, 1.4);
      light.position.copy(at).add(new THREE.Vector3(0, 0.4, 0));
      scene.add(light);
      lights.push({ light, age: 0 });
    },
    // Feux qui continuent de brûler après l'explosion.
    embers(at, dt) {
      if (Math.random() < dt * 30) {
        const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4));
        fire.emit(p, new THREE.Vector3(0, 0.6 + Math.random(), 0), 0.6 + Math.random() * 0.6, [1, 0.8, 0.3, 0.8], [0.8, 0.2, 0.05, 0], { drag: 1, lift: 0.8 });
        if (Math.random() < 0.4) smoke.emit(p, new THREE.Vector3(0, 0.5, 0), 3, [0.2, 0.18, 0.18, 0.4], [0.1, 0.1, 0.1, 0], { drag: 0.5, lift: 0.4 });
      }
    },
    // Murs, cadrans et plafond qui volent en éclats.
    // rot : rotation de la salle autour de l'axe vertical (les éclats sont en coordonnées monde).
    blowWalls(sides, rot) {
      const { half: HW, height: H, dialY, dialR } = ROOM;
      sides.forEach((side, k) => {
        const a = (k * Math.PI) / 2 + (rot || 0);
        const out = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
        const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
        for (let i = 0; i < (high ? 50 : 28); i++) {
          const x = (Math.random() * 2 - 1) * HW;
          const y = Math.random() * H;
          if (Math.hypot(x, y - dialY) < dialR) continue;
          const p = out.clone().multiplyScalar(HW).addScaledVector(right, x).setY(y);
          const v = out.clone().multiplyScalar(4 + Math.random() * 7).addScaledVector(right, (Math.random() - 0.5) * 4).setY(2 + Math.random() * 5);
          bricks.add(p, v, new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), 0.7 + Math.random() * 1.6);
        }
        for (let i = 0; i < (high ? 60 : 32); i++) {
          const r = Math.sqrt(Math.random()) * dialR;
          const t = Math.random() * Math.PI * 2;
          const p = out.clone().multiplyScalar(HW + 0.4).addScaledVector(right, Math.cos(t) * r).setY(dialY + Math.sin(t) * r);
          const v = out.clone().multiplyScalar(5 + Math.random() * 8).addScaledVector(right, (Math.random() - 0.5) * 5).setY(1 + Math.random() * 5);
          glass.add(p, v, new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14), 0.5 + Math.random() * 1.4);
        }
        // Le pan de mur entier part en arrière, sans tourner : son pivot est au centre de la salle,
        // une rotation le ferait balayer la caméra (vitesse exprimée dans le repère de la salle).
        const local = out.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -(rot || 0));
        api.throwObject(side, local.multiplyScalar(6 + Math.random() * 3).setY(3), new THREE.Vector3(), { pivot: true });
      });
    },
    confetti(at) {
      const colors = [0xf5b83d, 0x4cc38a, 0x2f6fc0, 0xffffff, 0xc83a36, 0xa36be0];
      for (let i = 0; i < 300; i++) {
        const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 2.2 + Math.random() * 1.6, (Math.random() - 0.5) * 3));
        confetti.add(p, new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5), new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), 1, { flutter: true });
        confetti.color(i, new THREE.Color(colors[i % colors.length]));
      }
    },
    update(dt) {
      fire.update(dt);
      smoke.update(dt);
      sparks.update(dt);
      bricks.update(dt);
      glass.update(dt);
      confetti.update(dt);
      for (let i = lights.length - 1; i >= 0; i--) {
        const l = lights[i];
        l.age += dt;
        l.light.intensity = 60 * Math.exp(-l.age * 1.6) * (0.8 + Math.random() * 0.4) + 3;
      }
      bodies.forEach((b) => {
        if (b.rest) return;
        b.v.y -= (b.float ? 3 : G) * dt;
        if (b.float) b.v.multiplyScalar(Math.exp(-1.5 * dt));
        b.obj.position.addScaledVector(b.v, dt);
        b.obj.rotation.x += b.spin.x * dt;
        b.obj.rotation.y += b.spin.y * dt;
        b.obj.rotation.z += b.spin.z * dt;
        if (!b.pivot) {
          const floor = landing(b.obj.position) + (b.lift || 0);
          if (b.obj.position.y < floor) {
            b.obj.position.y = floor;
            if (b.v.length() < 1.5 || b.float) b.rest = true;
            else { b.v.y = -b.v.y * 0.35; b.v.x *= 0.5; b.v.z *= 0.5; b.spin.multiplyScalar(0.5); }
          }
        }
        if (b.obj.position.y < -60) { b.rest = true; b.obj.visible = false; }
      });
    },
    clear() {
      fire.clear(); smoke.clear(); sparks.clear(); bricks.clear(); glass.clear(); confetti.clear();
      lights.forEach((l) => scene.remove(l.light));
      lights.length = 0;
      bodies.length = 0;
    },
  };
  return api;
}
