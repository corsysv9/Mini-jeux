// Le décor : clairière, feu de camp, forêt de sapins, vallée et village au loin, ciel de nuit ou de jour.
// Tout est construit autour du feu (origine) ; la vallée s'ouvre vers -z, face à ma place.
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js?v=2';
import { V, TAU, once, Parts, lathe, rock, windy } from './geo.js?v=2';

export const SEAT_Y = 0.37; // dessus des rondins
export const VISTA = 0.42; // demi-angle de la trouée vers la vallée (radians)
export const clock = { value: 0 }; // temps partagé par les shaders (vent)

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function seatRadius(n) {
  return Math.max(1.75, (n * 0.8) / TAU);
}

// Relief doux au-delà de la clairière (plat autour du feu) ; la vallée descend vers le village.
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const k = smooth(8, 18, r);
  const hills = (Math.sin(x * 0.13) + Math.sin(z * 0.11 + 1.3) + Math.sin((x + z) * 0.07 + 0.5)) * 0.45;
  const valley = z < 0 ? -smooth(10, 30, -z) * 2.2 * Math.exp(-(x * x) / 400) : 0;
  return k * hills + valley;
}

function inVista(x, z) {
  return z < 0 && Math.abs(Math.atan2(x, -z)) < VISTA;
}

// Couleurs sRGB écrites telles quelles par les shaders maison.
export function srgb(hex) {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

function mats(high) {
  return once('lg-mats', () => {
    const b = TX.bark(7);
    const g = TX.groundDetail();
    const Mat = high ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    const card = (map, extra) => windy(new THREE.MeshLambertMaterial(Object.assign({ map: TX.texture(map), alphaTest: 0.42, side: THREE.DoubleSide }, extra || {})), 0.06, 1, clock);
    const logEnd = TX.texture(TX.logEnd());
    return {
      ground: new Mat(Object.assign({ map: TX.texture(g.color, [1, 1]), vertexColors: true }, high ? { bumpMap: TX.reliefTexture(g.bump, [1, 1]), bumpScale: 1.5, roughness: 1 } : {})),
      log: new THREE.MeshStandardMaterial({ map: TX.texture(b.color, [2, 1]), bumpMap: TX.reliefTexture(b.bump, [2, 1]), bumpScale: 2.5, roughness: 0.95 }),
      logEnd: new THREE.MeshStandardMaterial({ map: logEnd, roughness: 0.9 }),
      trunk: new THREE.MeshLambertMaterial({ map: TX.texture(b.color, [1, 3]) }),
      birch: new THREE.MeshLambertMaterial({ map: TX.texture(TX.birch(), [1, 2]) }),
      core: windy(new THREE.MeshLambertMaterial({ color: 0x34482c, vertexColors: true }), 0.35, 12, clock),
      needles: windy(new THREE.MeshLambertMaterial({ map: TX.texture(TX.branchCard(47)), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true }), 0.35, 12, clock),
      leaves: windy(new THREE.MeshLambertMaterial({ map: TX.texture(TX.leafCluster(53)), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true }), 0.3, 9, clock),
      grass: card(TX.grassTuft(41)),
      fern: card(TX.fern()),
      bush: windy(new THREE.MeshLambertMaterial({ map: TX.texture(TX.leafCluster(59)), alphaTest: 0.45, side: THREE.DoubleSide }), 0.05, 1, clock),
      stone: new THREE.MeshStandardMaterial({ color: 0x5a5652, roughness: 0.95, vertexColors: true }),
      rockFar: new THREE.MeshLambertMaterial({ color: 0x6a6660 }),
      ash: new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 1 }),
      wall: new THREE.MeshLambertMaterial({ color: 0xb8a888 }),
      timber: new THREE.MeshLambertMaterial({ color: 0x3a2618 }),
      roof: new THREE.MeshLambertMaterial({ color: 0x3a2a26 }),
      slate: new THREE.MeshLambertMaterial({ color: 0x3a3e48 }),
      window: new THREE.MeshBasicMaterial({ map: TX.texture(TX.windowGlow()), color: 0xffffff, fog: false }),
      cap: new THREE.MeshStandardMaterial({ color: 0xb8241c, roughness: 0.5 }),
      stem: new THREE.MeshStandardMaterial({ color: 0xece4d0, roughness: 0.8 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.7, roughness: 0.5 }),
    };
  });
}

// ---------- Sol ----------

function buildGround(R, m) {
  const rings = 46;
  const seg = 120;
  const pos = [];
  const col = [];
  const uv = [];
  const radius = (i) => 80 * Math.pow(i / rings, 2.1);
  const c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const r = radius(i);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      pos.push(x, heightAt(x, z), z);
      uv.push(x / 2.6, z / 2.6);
      // Cendres près du feu, terre battue autour des rondins, herbe, puis sous-bois.
      const ash = 1 - smooth(0.45, 0.8, r);
      const trampled = 1 - smooth(R + 0.4, R + 1.6, r);
      const forest = smooth(R + 4, R + 7, r) * (inVista(x, z) ? 0.25 : 1);
      const path = z < -R && Math.abs(x + Math.sin(z * 0.3) * 0.6) < 0.8 ? 1 : 0;
      c.setRGB(0.92, 1.0, 0.72); // herbe
      c.lerp(new THREE.Color(0.78, 0.72, 0.62), forest);
      c.lerp(new THREE.Color(1.15, 1.0, 0.85), Math.max(trampled, path * 0.85));
      c.lerp(new THREE.Color(0.32, 0.3, 0.3), ash);
      col.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      const cc = (i + 1) * seg + j;
      const d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m.ground);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- Arbres (géométries modèles, dupliquées par instances) ----------

function shadeByReach(geo, maxR, H, dark) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const reach = Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / Math.max(0.3, maxR * (1 - y / H) + 0.3));
    const k = dark + (1 - dark) * (0.35 + 0.65 * reach) * (0.75 + 0.25 * (y / H));
    col.set([k, k * 1.02, k * 0.95], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function pineGeometry(H, baseR, tiers, cards, droop, seed) {
  const r = TX.rng(seed);
  const p = new Parts();
  const key = {};
  const y0 = H * 0.16;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = y0 + (H - y0 - 1.1) * f;
    const rad = baseR * Math.pow(1 - f, 0.9) + 0.35;
    const n = Math.max(4, Math.round(cards * (1 - f * 0.4)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r() * 0.6 + t * 1.3;
      const g = new THREE.PlaneGeometry(rad, rad * 0.8);
      g.translate(rad / 2 - 0.05, 0, 0);
      g.rotateX(-Math.PI / 2);
      g.rotateX((r() - 0.5) * 1.1);
      g.rotateZ(-(droop + r() * 0.2) * (0.6 + f * 0.5));
      g.rotateY(a);
      g.translate(0, y + (r() - 0.5) * 0.25, 0);
      p.addMatrix(g, key, new THREE.Matrix4());
    }
  }
  // Pointe
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(1.5, 0.7);
    g.rotateZ(Math.PI / 2);
    g.rotateY((k / 3) * Math.PI);
    g.translate(0, H - 0.75, 0);
    p.addMatrix(g, key, new THREE.Matrix4());
  }
  return shadeByReach(p.geometries().get(key), baseR, H, 0.38);
}

// Cœur sombre et plein du houppier : de profil, les rameaux ne laissent plus voir le ciel au travers.
function pineCore(H, baseR) {
  const y0 = H * 0.16;
  const h = H - y0 - 0.9;
  const g = new THREE.ConeGeometry(baseR * 0.62 + 0.2, h, 9, 4, true);
  g.translate(0, y0 + h / 2 + 0.1, 0);
  return shadeByReach(g, baseR, H, 0.25);
}

function birchGeometry(seed) {
  const r = TX.rng(seed);
  const p = new Parts();
  const key = {};
  for (let k = 0; k < 16; k++) {
    const y = 4.2 + r() * 4.8;
    const a = r() * TAU;
    const d = 0.3 + r() * 1.3 * (1 - (y - 4.2) / 6);
    const s = 1.4 + r() * 1.2;
    const g = new THREE.PlaneGeometry(s, s);
    g.rotateY(r() * Math.PI);
    g.rotateX((r() - 0.5) * 0.8);
    g.translate(Math.sin(a) * d, y, Math.cos(a) * d);
    p.addMatrix(g, key, new THREE.Matrix4());
  }
  return shadeByReach(p.geometries().get(key), 1.6, 9.5, 0.45);
}

function trunkGeometry(H, r0, r1, branches, seed) {
  const r = TX.rng(seed);
  const p = new Parts();
  const key = {};
  p.add(new THREE.CylinderGeometry(r1, r0, H, 9, 4), key, V(0, H / 2, 0));
  // Racines
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + r();
    p.between(V(0, 0.5, 0), V(Math.sin(a) * r0 * 2.6, -0.05, Math.cos(a) * r0 * 2.6), r0 * 0.45, key, 6, r0 * 0.15);
  }
  for (let k = 0; k < branches; k++) {
    const y = H * (0.35 + r() * 0.5);
    const a = r() * TAU;
    const l = 0.6 + r() * 1.2;
    p.between(V(0, y, 0), V(Math.sin(a) * l, y + l * 0.5, Math.cos(a) * l), r1 * 1.4, key, 5, 0.01);
  }
  return p.geometries().get(key);
}

function crossed(w, h, planes) {
  const p = new Parts();
  const key = {};
  for (let k = 0; k < planes; k++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateY((k / planes) * Math.PI);
    p.addMatrix(g, key, new THREE.Matrix4());
  }
  const geo = p.geometries().get(key);
  // Normales vers le haut : l'herbe s'éclaire de la même façon quel que soit son angle.
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return geo;
}

function instanced(geo, mat, list, high) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  list.forEach((it, i) => {
    q.setFromAxisAngle(V(0, 1, 0), it.rot);
    m4.compose(V(it.x, it.y, it.z), q, V(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sx || 1)));
    mesh.setMatrixAt(i, m4);
    if (it.tint !== undefined) mesh.setColorAt(i, c.setHSL(it.hue || 0.3, it.sat || 0.2, it.tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // les instances couvrent toute la scène
  mesh.castShadow = false;
  mesh.receiveShadow = !!high;
  return mesh;
}

// Points répartis sans se chevaucher (échantillonnage par grille).
function scatter(count, rMin, rMax, minDist, seed, accept) {
  const r = TX.rng(seed);
  const cell = minDist;
  const grid = new Map();
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    const rad = Math.sqrt(rMin * rMin + r() * (rMax * rMax - rMin * rMin));
    const a = r() * TAU;
    const x = Math.sin(a) * rad;
    const z = Math.cos(a) * rad;
    if (accept && !accept(x, z, rad, r)) continue;
    const gx = Math.floor(x / cell);
    const gz = Math.floor(z / cell);
    let ok = true;
    for (let i = -1; i <= 1 && ok; i++) {
      for (let j = -1; j <= 1 && ok; j++) {
        const list = grid.get(`${gx + i},${gz + j}`);
        if (list) list.forEach((pt) => { if ((pt[0] - x) ** 2 + (pt[1] - z) ** 2 < minDist * minDist) ok = false; });
      }
    }
    if (!ok) continue;
    const k = `${gx},${gz}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z]);
    out.push({ x, z, rad, a, rnd: r });
  }
  return out;
}

function buildForest(R, m, high) {
  const g = new THREE.Group();
  const edge = R + 4.2;
  // La vallée reste dégagée ; quelques arbres seulement sur ses flancs.
  const pts = scatter(high ? 420 : 230, edge, 46, 1.55, 101, (x, z, rad, r) => {
    if (inVista(x, z)) return false;
    return rad < 30 || r() < 0.55;
  });
  const pine = { trunk: [], top: [] };
  const spruce = { trunk: [], top: [] };
  const birch = { trunk: [], top: [] };
  pts.forEach((p) => {
    const t = p.rnd();
    const kind = t < 0.62 ? pine : (t < 0.84 ? spruce : birch);
    const s = 0.75 + p.rnd() * 0.6 + Math.min(0.4, (p.rad - edge) * 0.02);
    const it = { x: p.x, y: heightAt(p.x, p.z) - 0.1, z: p.z, s, sy: 0.9 + p.rnd() * 0.3, rot: p.rnd() * TAU };
    kind.trunk.push(it);
    kind.top.push(Object.assign({ tint: 0.42 + p.rnd() * 0.14, hue: 0.25 + p.rnd() * 0.08, sat: 0.12 + p.rnd() * 0.12 }, it));
  });
  const geo = once('lg-trees', () => ({
    pineTrunk: trunkGeometry(11, 0.3, 0.06, 0, 3),
    pineTop: pineGeometry(11, 2.7, 14, 9, 0.32, 5),
    spruceTrunk: trunkGeometry(14, 0.26, 0.05, 0, 7),
    spruceTop: pineGeometry(14, 2.2, 17, 9, 0.55, 9),
    pineCore: pineCore(11, 2.7),
    spruceCore: pineCore(14, 2.2),
    birchTrunk: trunkGeometry(9.5, 0.14, 0.05, 5, 11),
    birchTop: birchGeometry(13),
  }));
  g.add(instanced(geo.pineTrunk, m.trunk, pine.trunk), instanced(geo.pineTop, m.needles, pine.top), instanced(geo.pineCore, m.core, pine.top));
  g.add(instanced(geo.spruceTrunk, m.trunk, spruce.trunk), instanced(geo.spruceTop, m.needles, spruce.top), instanced(geo.spruceCore, m.core, spruce.top));
  g.add(instanced(geo.birchTrunk, m.birch, birch.trunk), instanced(geo.birchTop, m.leaves, birch.top));

  // Sous-bois : herbe, fougères, buissons, rochers.
  const grass = scatter(high ? 1600 : 700, R + 0.55, 22, 0.28, 103, (x, z, rad, r) => rad < R + 6 || r() < 0.5).map((p) => ({
    x: p.x, y: heightAt(p.x, p.z), z: p.z, s: 0.7 + p.rnd() * 0.7, rot: p.rnd() * TAU, tint: 0.4 + p.rnd() * 0.25, hue: 0.2 + p.rnd() * 0.08, sat: 0.3,
  }));
  g.add(instanced(once('lg-grass', () => crossed(0.5, 0.36, 2)), m.grass, grass));
  const ferns = scatter(high ? 170 : 80, R + 2.4, 20, 0.9, 107, (x, z) => !inVista(x, z) || Math.hypot(x, z) < R + 6).map((p) => ({
    x: p.x, y: heightAt(p.x, p.z) - 0.05, z: p.z, s: 0.8 + p.rnd() * 0.7, rot: p.rnd() * TAU, tint: 0.45 + p.rnd() * 0.2, hue: 0.27, sat: 0.3,
  }));
  g.add(instanced(once('lg-fern', () => crossed(1.1, 0.75, 3)), m.fern, ferns));
  const bushes = scatter(high ? 70 : 35, R + 3.2, 24, 1.8, 109).map((p) => ({
    x: p.x, y: heightAt(p.x, p.z) - 0.15, z: p.z, s: 0.8 + p.rnd() * 0.9, sy: 0.7, rot: p.rnd() * TAU,
  }));
  g.add(instanced(once('lg-bush', () => crossed(1.6, 1.4, 4)), m.bush, bushes));
  const rocks = scatter(40, R + 2.5, 26, 2, 113).map((p) => ({ x: p.x, y: heightAt(p.x, p.z) - 0.05, z: p.z, s: 0.5 + p.rnd() * 1.4, rot: p.rnd() * TAU }));
  g.add(instanced(once('lg-rock', () => rock(0.4, 5, 0.6)), m.rockFar, rocks));
  return g;
}

// ---------- Feu de camp (sans les flammes, animées par fx.js) ----------

export function buildFirePit() {
  const m = mats();
  const g = new THREE.Group();
  const cm = once('lg-charred', () => {
    const t = TX.charred();
    return new THREE.MeshStandardMaterial({ map: TX.texture(t.color), emissiveMap: TX.texture(t.emissive), emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.95 });
  });
  const stones = new Parts();
  const r = TX.rng(17);
  for (let i = 0; i < 17; i++) {
    const a = (i / 17) * TAU + r() * 0.1;
    const geo = rock(0.075 + r() * 0.03, 20 + i, 0.7);
    // Pierres noircies par la suie sur leur face intérieure
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let k = 0; k < geo.attributes.position.count; k++) {
      const v = 0.8 + r() * 0.2 - Math.max(0, geo.attributes.position.getY(k)) * 3;
      col.set([v, v * 0.97, v * 0.94], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    stones.add(geo, m.stone, V(Math.sin(a) * 0.55, 0.035, Math.cos(a) * 0.55), [r() * 0.4, a, r() * 0.3]);
  }
  stones.build(g, true);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.52, 32), m.ash);
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.012;
  g.add(ash);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ map: TX.texture(TX.embers()), transparent: true, depthWrite: false }));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.02;
  g.add(bed);
  // Bûches en tipi et deux bûches couchées
  const logs = new Parts();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const base = V(Math.sin(a) * 0.34, 0.03, Math.cos(a) * 0.34);
    const top = V(Math.sin(a) * 0.04, 0.5 + (i % 2) * 0.05, Math.cos(a) * 0.04);
    logs.between(base, top, 0.045, cm, 8, 0.03);
  }
  logs.between(V(-0.42, 0.06, -0.12), V(0.4, 0.07, 0.16), 0.055, cm, 9);
  logs.between(V(-0.2, 0.05, 0.38), V(0.25, 0.06, -0.38), 0.05, cm, 9);
  logs.build(g, true);
  return { group: g, bed, charred: cm };
}

// ---------- Places assises : rondins et souches ----------

export function buildSeat(kind, seed) {
  const m = mats();
  const g = new THREE.Group();
  const r = TX.rng(seed);
  if (kind === 'stump') {
    const geo = new THREE.CylinderGeometry(0.22, 0.25, SEAT_Y, 14);
    const s = new THREE.Mesh(geo, [m.log, m.logEnd, m.logEnd]);
    s.position.y = SEAT_Y / 2;
    s.castShadow = true;
    s.receiveShadow = true;
    g.add(s);
  } else {
    const len = 0.78 + r() * 0.12;
    const rad = SEAT_Y / 2;
    const geo = new THREE.CylinderGeometry(rad, rad * 1.05, len, 16);
    const s = new THREE.Mesh(geo, [m.log, m.logEnd, m.logEnd]);
    s.rotation.z = Math.PI / 2;
    s.rotation.x = (r() - 0.5) * 0.3;
    s.position.y = rad;
    s.castShadow = true;
    s.receiveShadow = true;
    g.add(s);
    // Une petite branche cassée
    const p = new Parts();
    p.between(V(len * 0.25, rad * 1.6, 0.02), V(len * 0.35, rad * 2.2, -0.12), 0.02, m.log, 5, 0.008);
    p.build(g, true);
  }
  g.rotation.y += (r() - 0.5) * 0.15;
  return g;
}

// Accessoires autour de la clairière : tas de bois, hache, lanterne, champignons.
function buildProps(R, m) {
  const g = new THREE.Group();
  const p = new Parts();
  // Tas de bûches derrière les places, vers la gauche
  const a0 = Math.PI * 0.62;
  const wx = Math.sin(a0) * (R + 1.5);
  const wz = Math.cos(a0) * (R + 1.5);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4 - row; k++) {
      const off = (k - (3 - row) / 2) * 0.2;
      const c = V(wx, 0.1 + row * 0.17, wz).add(V(Math.cos(a0), 0, -Math.sin(a0)).multiplyScalar(off));
      p.add(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 10), m.log, c, new THREE.Euler(Math.PI / 2, a0, 0, 'YXZ'));
    }
  }
  // Souche avec une hache plantée
  const a1 = -Math.PI * 0.7;
  const sx = Math.sin(a1) * (R + 1.8);
  const sz = Math.cos(a1) * (R + 1.8);
  p.add(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 14), m.log, V(sx, 0.22, sz));
  p.add(new THREE.CylinderGeometry(0.28, 0.28, 0.01, 14), m.logEnd, V(sx, 0.455, sz));
  p.between(V(sx + 0.02, 0.44, sz), V(sx + 0.3, 0.85, sz + 0.1), 0.018, m.timber, 6);
  p.add(new THREE.BoxGeometry(0.16, 0.1, 0.02), m.iron, V(sx + 0.02, 0.47, sz), [0, 0.3, 0.9]);
  // Champignons au pied d'un rondin
  const r = TX.rng(5);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.3 + r() * 0.4;
    const d = R + 0.9 + r() * 0.5;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const h = 0.05 + r() * 0.06;
    p.add(new THREE.CylinderGeometry(0.012, 0.016, h, 6), m.stem, V(x, h / 2, z));
    p.add(new THREE.SphereGeometry(0.04 + r() * 0.02, 10, 6, 0, TAU, 0, Math.PI / 2), m.cap, V(x, h, z), [0, 0, 0], V(1, 0.6, 1));
  }
  p.build(g, true);
  return g;
}

// ---------- Le village, au bout de la vallée ----------

function buildVillage(m) {
  const g = new THREE.Group();
  const p = new Parts();
  const r = TX.rng(71);
  const roofGeo = (w, d, h) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.3, 0); s.lineTo(0, h); s.lineTo(w / 2 + 0.3, 0); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: d + 0.4, bevelEnabled: false });
    geo.translate(0, 0, -(d + 0.4) / 2);
    return geo;
  };
  const houses = [[-9, -36, 0.4], [-4.5, -40, -0.2], [4, -37, 0.3], [9.5, -41, -0.4], [-13, -44, 0.6], [14, -46, -0.1], [0.5, -48, 0]];
  houses.forEach(([x, z, rot], i) => {
    const w = 3 + r() * 1.5;
    const d = 3 + r();
    const h = 2.2 + r() * 0.8;
    const y = heightAt(x, z);
    const e = new THREE.Euler(0, rot, 0);
    const at = (lx, ly, lz) => V(lx, ly, lz).applyEuler(e).add(V(x, y, z));
    p.add(new THREE.BoxGeometry(w, h, d), m.wall, at(0, h / 2, 0), e);
    p.add(roofGeo(w, d, 1.6 + r() * 0.6), i % 2 ? m.slate : m.roof, at(0, h, 0), e);
    p.add(new THREE.BoxGeometry(0.5, 1.4, 0.5), m.timber, at(w * 0.25, h + 1.0, 0), e);
    for (const wx of [-w * 0.28, w * 0.28]) {
      if (r() < 0.75) p.add(new THREE.PlaneGeometry(0.5, 0.55), m.window, at(wx, h * 0.55, d / 2 + 0.02), e);
    }
    p.add(new THREE.BoxGeometry(w + 0.05, 0.12, d + 0.05), m.timber, at(0, h * 0.5, 0), e);
  });
  // Église : nef, clocher et flèche
  const cx = -1.5;
  const cz = -54;
  const cy = heightAt(cx, cz);
  p.add(new THREE.BoxGeometry(5, 5, 9), m.wall, V(cx, cy + 2.5, cz));
  p.add(roofGeo(5, 9, 3), m.slate, V(cx, cy + 5, cz));
  p.add(new THREE.BoxGeometry(2.4, 9, 2.4), m.wall, V(cx, cy + 4.5, cz + 5));
  p.add(new THREE.ConeGeometry(1.9, 6, 4), m.slate, V(cx, cy + 12, cz + 5), [0, Math.PI / 4, 0]);
  p.add(new THREE.PlaneGeometry(0.8, 1.4), m.window, V(cx, cy + 6.5, cz + 6.22));
  p.build(g);
  return g;
}

// ---------- Ciel ----------

export function buildSky(high) {
  const g = new THREE.Group();
  const uniforms = {
    top: { value: srgb(0x03050d) },
    horizon: { value: srgb(0x1b2440) },
    bottom: { value: srgb(0x05070c) },
    glowDir: { value: V(0, 0.2, -1).normalize() },
    glow: { value: srgb(0x223355) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 16), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 glowDir; uniform vec3 glow;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, top, smoothstep(-0.02, 0.55, d.y));
        c = mix(c, bottom, smoothstep(0.0, -0.25, d.y));
        float g = max(dot(d, normalize(glowDir)), 0.0);
        c += glow * (pow(g, 5.0) * 0.45 + pow(g, 48.0) * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }));
  sky.renderOrder = -10;
  g.add(sky);
  // Étoiles
  const N = high ? 1400 : 800;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const r = TX.rng(83);
  for (let i = 0; i < N; i++) {
    const u = r();
    const y = 0.05 + u * u * 0.95 + 0.0;
    const a = r() * TAU;
    const h = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * h * 88, y * 88, Math.sin(a) * h * 88], i * 3);
    const b = 0.35 + r() * 0.65;
    col.set([b, b, b * (0.9 + r() * 0.2)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false, map: TX.softDot() }));
  stars.renderOrder = -9;
  g.add(stars);
  // Lune, son halo, et le soleil
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.texture(TX.moon()), fog: false, depthWrite: false, transparent: true }));
  moon.scale.set(5.5, 5.5, 1);
  moon.renderOrder = -8;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot(), color: 0x7a90d0, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  halo.scale.set(26, 26, 1);
  halo.renderOrder = -8;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot(), color: 0xffd8a0, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  sun.scale.set(22, 22, 1);
  sun.renderOrder = -8;
  g.add(moon, halo, sun);
  // Collines à l'horizon
  const hills = new THREE.Mesh(new THREE.CylinderGeometry(80, 80, 22, 64, 1, true), new THREE.MeshBasicMaterial({
    map: TX.texture(TX.horizon(high ? 4096 : 2048, 256)), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  hills.position.y = 6;
  hills.renderOrder = -7;
  g.add(hills);
  return { group: g, uniforms, stars, moon, halo, sun, hills };
}

// ---------- Ensemble ----------

export function buildWorld(R, high) {
  const m = mats(high);
  const g = new THREE.Group();
  g.add(buildGround(R, m));
  g.add(buildForest(R, m, high));
  g.add(buildProps(R, m));
  g.add(buildVillage(m));
  return { group: g };
}
