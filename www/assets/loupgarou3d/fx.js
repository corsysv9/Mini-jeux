// Effets : flammes du feu (shader), étincelles, fumée, lucioles, brume, poussière, coup de fusil.
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js?v=2';
import { V, TAU } from './geo.js?v=2';

const FLAME_VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Flamme procédurale : bruit fractal qui monte, découpé en forme de goutte, dégradé blanc-jaune-rouge.
const FLAME_FRAG = `uniform float uTime; uniform float uSeed; uniform float uPower;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 uv = vUv;
  float t = uTime;
  vec2 q = vec2(uv.x * 2.6 + uSeed, uv.y * 2.0 - t * 1.7);
  float n = fbm(q + vec2(fbm(q * 1.6 + vec2(t * 0.5, 0.0)), 0.0) * 0.9);
  float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.55 * uv.y;
  float width = mix(0.9, 0.05, pow(uv.y, 0.75));
  float shape = 1.0 - smoothstep(width * 0.45, width, abs(x));
  shape *= smoothstep(0.0, 0.1, uv.y);
  float f = shape * (n * 1.5 - uv.y * 0.95 + 0.25) * uPower;
  f = clamp(f, 0.0, 1.0);
  vec3 col = mix(vec3(0.55, 0.05, 0.0), vec3(1.0, 0.38, 0.04), smoothstep(0.05, 0.35, f));
  col = mix(col, vec3(1.0, 0.78, 0.32), smoothstep(0.35, 0.7, f));
  col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.0, f));
  gl_FragColor = vec4(col * smoothstep(0.0, 0.25, f) * 1.4, 1.0);
}`;

// Nuage de particules à taille fixe ; couleur et transparence par particule.
function particles(parent, max, size, blending, dot, attenuate) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ size, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: attenuate !== false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  const list = [];
  let next = 0;
  return {
    pts,
    emit(p, v, life, c0, c1, opts) {
      const i = next;
      next = (next + 1) % max;
      list[i] = { p: p.clone(), v: v.clone(), life, age: 0, c0, c1, drag: (opts && opts.drag) || 0.6, lift: (opts && opts.lift) || 0, grav: (opts && opts.grav) || 0, swirl: (opts && opts.swirl) || 0, seed: Math.random() * 10 };
    },
    update(dt, time) {
      for (let i = 0; i < max; i++) {
        const q = list[i];
        if (!q || q.age >= q.life) { col[i * 4 + 3] = 0; pos[i * 3 + 1] = -1e4; continue; }
        q.age += dt;
        q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.v.y += (q.lift - q.grav) * dt;
        if (q.swirl) {
          q.v.x += Math.sin(time * 3 + q.seed + q.p.y * 4) * q.swirl * dt;
          q.v.z += Math.cos(time * 2.7 + q.seed * 1.3 + q.p.y * 3) * q.swirl * dt;
        }
        q.p.addScaledVector(q.v, dt);
        const t = Math.min(1, q.age / q.life);
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        col[i * 4] = q.c0[0] + (q.c1[0] - q.c0[0]) * t;
        col[i * 4 + 1] = q.c0[1] + (q.c1[1] - q.c0[1]) * t;
        col[i * 4 + 2] = q.c0[2] + (q.c1[2] - q.c0[2]) * t;
        col[i * 4 + 3] = (q.c0[3] + (q.c1[3] - q.c0[3]) * t) * Math.min(1, (1 - t) * 3, q.age * 6);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    clear() { list.length = 0; col.fill(0); geo.attributes.color.needsUpdate = true; },
  };
}

export function createFx(scene, high) {
  const group = new THREE.Group();
  scene.add(group);
  const dot = TX.softDot();
  const fire = { power: 1, base: 1, time: 0 }; // base : feu sans la peur du loup (règle la fumée)

  // Flammes : plans tournés vers la caméra, chacun avec son propre bruit.
  const flames = [];
  const flameGroup = new THREE.Group();
  group.add(flameGroup);
  [[0, 1.0, 1.25, 0], [0.1, 0.7, 0.95, 3.1], [-0.12, 0.65, 0.85, 7.3], [0.02, 0.5, 1.15, 11.7]].forEach(([dx, w, h, seed], i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uPower: { value: 1 } },
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(dx, 0.04, (i % 2 ? 0.05 : -0.05));
    mesh.renderOrder = 5;
    flameGroup.add(mesh);
    flames.push({ mesh, mat, speed: 1 + i * 0.13, base: h });
  });
  // Halo lumineux autour du feu
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xff7a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, fog: false }));
  glow.scale.set(3.2, 3.2, 1);
  glow.position.y = 0.55;
  group.add(glow);

  const sparks = particles(group, high ? 220 : 120, 0.035, THREE.AdditiveBlending, dot);
  const smoke = particles(group, high ? 90 : 45, 1.1, THREE.NormalBlending, dot);
  const dust = particles(group, 260, 0.12, THREE.NormalBlending, dot);
  const flies = particles(group, 60, 0.05, THREE.AdditiveBlending, dot);
  const glints = particles(group, 80, 0.06, THREE.AdditiveBlending, dot);

  // Brume au ras du sol, entre les arbres.
  const mist = [];
  const mistMat = new THREE.SpriteMaterial({ map: dot, color: 0x9aa8c8, transparent: true, depthWrite: false, opacity: 0.09 });
  for (let i = 0; i < (high ? 26 : 14); i++) {
    const s = new THREE.Sprite(mistMat);
    const a = Math.random() * TAU;
    const d = 6 + Math.random() * 14;
    s.position.set(Math.sin(a) * d, 0.4 + Math.random() * 0.6, Math.cos(a) * d);
    s.scale.set(7 + Math.random() * 5, 2.2 + Math.random(), 1);
    s.userData = { a, d, speed: (Math.random() - 0.5) * 0.02 };
    group.add(s);
    mist.push(s);
  }

  // Lucioles
  const flyList = [];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * TAU;
    flyList.push({ a, d: 4 + Math.random() * 6, h: 0.3 + Math.random() * 1.6, s: 0.1 + Math.random() * 0.2, ph: Math.random() * TAU });
  }

  // Éclair du fusil
  const muzzle = new THREE.PointLight(0xffc070, 0, 0, 2);
  group.add(muzzle);
  let muzzleT = 0;

  let sparkAcc = 0;
  let smokeAcc = 0;
  let flyAcc = 0;
  const api = {
    group,
    fire,
    flameGroup,
    update(dt, time, camera, night) {
      fire.time = time;
      const p = fire.power;
      const camPos = camera.getWorldPosition(V(0, 0, 0));
      flames.forEach((f, i) => {
        f.mat.uniforms.uTime.value = time * f.speed;
        f.mat.uniforms.uPower.value = p * (0.95 + Math.sin(time * 7.3 + i) * 0.05);
        f.mesh.rotation.y = Math.atan2(camPos.x - f.mesh.position.x, camPos.z - f.mesh.position.z) + (i - 1.5) * 0.35;
        f.mesh.scale.y = 0.3 + 0.7 * p;
        f.mesh.scale.x = 0.6 + 0.4 * p;
      });
      glow.material.opacity = 0.18 + 0.2 * p * (0.9 + Math.sin(time * 11) * 0.1);
      // Étincelles qui montent en tourbillonnant
      sparkAcc += dt * 26 * p;
      while (sparkAcc > 1) {
        sparkAcc--;
        const a = Math.random() * TAU;
        sparks.emit(V(Math.cos(a) * 0.15, 0.25 + Math.random() * 0.3, Math.sin(a) * 0.15), V((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4),
          1.0 + Math.random() * 1.6, [1, 0.8, 0.35, 1], [1, 0.25, 0.05, 0.5], { drag: 0.4, swirl: 2.2, lift: 0.1 });
      }
      smokeAcc += dt * (3 + (1 - fire.base) * 4);
      while (smokeAcc > 1) {
        smokeAcc--;
        smoke.emit(V((Math.random() - 0.5) * 0.2, 0.9 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2), V((Math.random() - 0.5) * 0.15, 0.45 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15),
          4 + Math.random() * 3, [0.32, 0.3, 0.3, 0.18], [0.5, 0.5, 0.52, 0], { drag: 0.15, swirl: 0.25, lift: 0.04 });
      }
      // Lucioles, la nuit seulement
      flyAcc += dt;
      if (flyAcc > 0.05) {
        flyAcc = 0;
        flyList.forEach((f) => {
          const on = night * Math.max(0, Math.sin(time * 1.3 + f.ph * 3));
          if (on < 0.2) return;
          const a = f.a + time * f.s * 0.2;
          const pt = V(Math.sin(a) * f.d, f.h + Math.sin(time * 0.9 + f.ph) * 0.3, Math.cos(a) * f.d);
          flies.emit(pt, V(0, 0, 0), 0.12, [0.75, 1, 0.4, on], [0.75, 1, 0.4, on], { drag: 0 });
        });
      }
      mist.forEach((s) => {
        s.userData.a += s.userData.speed * dt;
        s.position.x = Math.sin(s.userData.a) * s.userData.d;
        s.position.z = Math.cos(s.userData.a) * s.userData.d;
      });
      if (muzzleT > 0) {
        muzzleT -= dt;
        muzzle.intensity = Math.max(0, muzzleT) * 300;
      }
      sparks.update(dt, time);
      smoke.update(dt, time);
      dust.update(dt, time);
      flies.update(dt, time);
      glints.update(dt, time);
    },
    setMist(color, opacity) {
      mistMat.color.setHex(color);
      mistMat.opacity = opacity;
    },
    // Nuage de poussière ou de feuilles (le loup qui jaillit, quelqu'un qui tombe).
    puff(at, n, color, spread) {
      const c = color || [0.45, 0.4, 0.35, 0.5];
      for (let i = 0; i < (n || 20); i++) {
        const v = V(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar((spread || 1) * (0.4 + Math.random()));
        dust.emit(at.clone().add(V((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3)), v, 0.8 + Math.random() * 0.8, c, [c[0], c[1], c[2], 0], { drag: 2.5, lift: 0.2 });
      }
    },
    // Bouffée d'étincelles colorées (vision de la voyante, potions de la sorcière).
    magic(at, color, n) {
      for (let i = 0; i < (n || 40); i++) {
        const a = Math.random() * TAU;
        glints.emit(at.clone().add(V(Math.cos(a) * 0.25, Math.random() * 0.4, Math.sin(a) * 0.25)), V(Math.cos(a) * 0.2, 0.3 + Math.random() * 0.6, Math.sin(a) * 0.2),
          0.8 + Math.random() * 0.8, color.concat(1), color.concat(0), { drag: 1, swirl: 1.5 });
      }
    },
    shot(at) {
      muzzle.position.copy(at);
      muzzleT = 0.12;
      for (let i = 0; i < 16; i++) {
        smoke.emit(at.clone(), V((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6), 1.5 + Math.random(), [0.8, 0.78, 0.75, 0.4], [0.6, 0.6, 0.6, 0], { drag: 1.5, lift: 0.1 });
      }
      for (let i = 0; i < 12; i++) sparks.emit(at.clone(), V(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(4), 0.15, [1, 0.9, 0.5, 1], [1, 0.4, 0.1, 0], { drag: 3 });
    },
    clear() {
      sparks.clear(); smoke.clear(); dust.clear(); flies.clear(); glints.clear();
    },
  };
  return api;
}
