// Le loup : un grand loup gris articulé (pattes à trois segments, queue, mâchoire), avec ses allures.
// Corps modelé par sections (poitrail profond, taille fine, croupe), pelage en couches de poils.
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js?v=2';
import { V, TAU, once, Parts } from './geo.js?v=2';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Liseré de lune sur le pelage : la silhouette du loup se détache de la forêt noire.
export const WOLF_RIM = { value: new THREE.Color(0x26304e) };

// Fourrure en coquilles : chaque couche, un peu plus gonflée, ne garde que quelques poils ;
// les couches profondes sont plus sombres (ombre entre les poils).
function furMaterial(map, noise) {
  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = WOLF_RIM;
    shader.uniforms.furNoise = { value: noise };
    shader.vertexShader = 'attribute float shell;\nvarying float vShell;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vShell = shell;',
    );
    shader.fragmentShader = 'uniform vec3 uRim;\nuniform sampler2D furNoise;\nvarying float vShell;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (vShell > 0.001 && texture2D(furNoise, vMapUv * 0.35).r < 0.06 + vShell * 0.9) discard;
        diffuseColor.rgb *= 0.55 + 0.5 * vShell;`)
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5) * (0.35 + 0.65 * vShell);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'lg-wolf-fur';
  return mat;
}

function wolfMats() {
  return once('lg-wolf', () => {
    const strands = TX.texture(TX.furStrands(), [5, 5]);
    const noise = TX.reliefTexture(TX.furNoise(), [1, 1]);
    return {
      fur: furMaterial(strands, noise),
      ear: new THREE.MeshStandardMaterial({ map: strands, vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
      nose: new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 0.3 }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x3a1214, roughness: 0.5 }),
      tongue: new THREE.MeshStandardMaterial({ color: 0xa8404a, roughness: 0.4 }),
      teeth: new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.3 }),
      eye: new THREE.MeshBasicMaterial({ color: 0xffd23a }),
      claw: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.4 }),
      paw: new THREE.MeshStandardMaterial({ map: strands, color: 0x6a5a48, roughness: 1 }),
    };
  });
}

// Interpolation douce d'une suite de valeurs (Catmull-Rom).
function spline(keys, t) {
  const n = keys.length - 1;
  const x = clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const p0 = keys[Math.max(0, i - 1)];
  const p1 = keys[i];
  const p2 = keys[i + 1];
  const p3 = keys[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
}

// Volume par sections le long de z : [z, y, demi-largeur, demi-hauteur, poil, pincement du bas].
// Les extrémités se referment. UV en mètres (tour, longueur) pour une densité de poils régulière.
function loft(keys, rings, around) {
  const col = (k) => keys.map((s) => s[k] || 0);
  const K = [0, 1, 2, 3, 4, 5].map(col);
  const pos = [];
  const uv = [];
  const fur = [];
  let along = 0;
  let prev = null;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const end = Math.min(1, Math.min(t, 1 - t) * rings / 1.5);
    const z = spline(K[0], t);
    const y = spline(K[1], t);
    const w = Math.max(0.001, spline(K[2], t) * Math.sqrt(end));
    const h = Math.max(0.001, spline(K[3], t) * Math.sqrt(end));
    const fl = spline(K[4], t);
    const pinch = spline(K[5], t);
    if (prev) along += Math.hypot(z - prev[0], y - prev[1]);
    prev = [z, y];
    const circ = Math.PI * (w + h);
    for (let i = 0; i <= around; i++) {
      const a = (i / around) * TAU;
      const sa = Math.sin(a);
      const x = w * Math.cos(a) * (sa < 0 ? 1 - pinch * -sa : 1);
      pos.push(x, y + h * sa, z);
      uv.push((i / around) * circ, along);
      fur.push(fl * Math.sqrt(end));
    }
  }
  const idx = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i;
      idx.push(a, a + 1, a + around + 1, a + 1, a + around + 2, a + around + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('fur', new THREE.Float32BufferAttribute(fur, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Couture : même normale de part et d'autre
  const n = g.attributes.normal;
  for (let j = 0; j <= rings; j++) {
    const a = j * (around + 1);
    const b = a + around;
    const v = V(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

// Robe du loup gris : dos sombre et charbonné, flancs fauves, ventre et gorge crème.
const COAT = {
  saddle: new THREE.Color(0x423b35),
  back: new THREE.Color(0x6a6058),
  side: new THREE.Color(0x968874),
  cream: new THREE.Color(0xd8ccb8),
  tan: new THREE.Color(0xb09878),
  dark: new THREE.Color(0x262220),
};
function paint(g, fn) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const out = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const P = V(0, 0, 0);
  const N = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    fn(c, P.fromBufferAttribute(p, i), N.fromBufferAttribute(n, i));
    // Poils grisonnants : léger bruit de teinte
    const k = 0.92 + (Math.sin(P.x * 91 + P.y * 57 + P.z * 73) * 0.5 + 0.5) * 0.16;
    out.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}
const mixC = (c, a, b, t) => c.copy(a).lerp(b, clamp(t, 0, 1));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Empile les couches de poils ; comb : sens du poil (couché vers l'arrière ou le bas).
function shells(g, layers, comb) {
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const U = g.attributes.uv;
  const C = g.attributes.color;
  const F = g.attributes.fur;
  const cnt = P.count;
  const L = layers + 1;
  const pos = new Float32Array(cnt * 3 * L);
  const nor = new Float32Array(cnt * 3 * L);
  const col = new Float32Array(cnt * 3 * L);
  const uv = new Float32Array(cnt * 2 * L);
  const sh = new Float32Array(cnt * L);
  for (let s = 0; s < L; s++) {
    const f = s / layers;
    for (let i = 0; i < cnt; i++) {
      const len = F.getX(i) * f;
      const o = s * cnt + i;
      pos[o * 3] = P.getX(i) + N.getX(i) * len + comb.x * len * f;
      pos[o * 3 + 1] = P.getY(i) + N.getY(i) * len + comb.y * len * f;
      pos[o * 3 + 2] = P.getZ(i) + N.getZ(i) * len + comb.z * len * f;
      nor.set([N.getX(i), N.getY(i), N.getZ(i)], o * 3);
      col.set([C.getX(i), C.getY(i), C.getZ(i)], o * 3);
      uv.set([U.getX(i), U.getY(i)], o * 2);
      sh[o] = f;
    }
  }
  const src = g.index.array;
  const idx = new Uint32Array(src.length * L);
  for (let s = 0; s < L; s++) for (let k = 0; k < src.length; k++) idx[s * src.length + k] = src[k] + s * cnt;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('shell', new THREE.BufferAttribute(sh, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function furry(parent, g, mat, layers, comb) {
  const mesh = new THREE.Mesh(shells(g, layers, comb), mat);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Segment de patte le long de -y : [y, demi-largeur, demi-épaisseur, poil].
function limb(keys, rings) {
  const g = loft(keys.map(([y, w, d, f]) => [y, 0, w, d, f, 0]), rings || 10, 12);
  g.rotateX(Math.PI / 2); // l'axe z du lissage devient -y ; le « haut » de la section regarde vers l'avant
  return g;
}

function paw(p, m, y, z) {
  p.add(new THREE.SphereGeometry(0.036, 14, 10), m.paw, V(0, y, z), [0, 0, 0], V(1, 0.55, 1.4));
  for (let i = -1; i <= 1; i++) p.add(new THREE.ConeGeometry(0.006, 0.02, 5), m.claw, V(i * 0.016, y - 0.01, z + 0.05), [Math.PI / 2, 0, 0]);
}

export function buildWolf() {
  const m = wolfMats();
  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 0.62;
  root.add(torso);
  const w = { group: root, torso, legs: [], tail: [], time: 0, cycle: 0 };

  // Corps : croupe, taille rentrée, poitrail profond, garrot ; crinière plus fournie sur les épaules.
  const body = loft([
    [-0.53, 0.03, 0.04, 0.04, 0.02, 0],
    [-0.46, 0.01, 0.115, 0.13, 0.03, 0.1],
    [-0.33, 0.0, 0.135, 0.155, 0.032, 0.15],
    [-0.17, 0.02, 0.115, 0.125, 0.03, 0.3],
    [0.0, 0.0, 0.12, 0.155, 0.034, 0.3],
    [0.16, -0.03, 0.135, 0.215, 0.045, 0.42],
    [0.3, -0.02, 0.135, 0.22, 0.06, 0.45],
    [0.42, 0.03, 0.115, 0.18, 0.065, 0.3],
    [0.5, 0.07, 0.07, 0.1, 0.05, 0],
  ], 44, 26);
  paint(body, (c, p, n) => {
    mixC(c, COAT.side, COAT.cream, smooth(-0.15, -0.65, n.y) + smooth(0.75, 0.95, n.z) * 0.6);
    c.lerp(COAT.back, smooth(0.15, 0.55, n.y));
    c.lerp(COAT.saddle, smooth(0.5, 0.9, n.y) * smooth(-0.45, -0.1, p.z) * smooth(0.45, 0.15, p.z));
  });
  furry(torso, body, m.fur, 9, V(0, -0.35, -0.9));

  // Cou épais, couvert d'une collerette de poils longs
  const neck = new THREE.Group();
  neck.position.set(0, 0.06, 0.42);
  neck.rotation.x = -0.75;
  torso.add(neck);
  const ng = loft([
    [-0.08, 0, 0.11, 0.14, 0.06, 0.2],
    [0.05, 0, 0.1, 0.12, 0.07, 0.2],
    [0.18, 0, 0.085, 0.095, 0.055, 0.1],
    [0.3, 0.0, 0.07, 0.075, 0.03, 0],
  ], 16, 22);
  paint(ng, (c, p, n) => {
    mixC(c, COAT.side, COAT.cream, smooth(-0.1, -0.7, n.y));
    c.lerp(COAT.back, smooth(0.3, 0.8, n.y));
  });
  furry(neck, ng, m.fur, 9, V(0, -0.5, -1));

  const head = new THREE.Group();
  head.position.set(0, 0, 0.28);
  head.rotation.x = 0.75;
  neck.add(head);
  // Crâne, stop marqué, long museau
  const hg = loft([
    [-0.09, 0.03, 0.05, 0.05, 0.02, 0],
    [-0.04, 0.03, 0.085, 0.075, 0.03, 0.2],
    [0.02, 0.03, 0.085, 0.07, 0.022, 0.25],
    [0.075, 0.012, 0.058, 0.05, 0.01, 0.35],
    [0.12, -0.004, 0.044, 0.04, 0.006, 0.45],
    [0.19, -0.01, 0.034, 0.032, 0.004, 0.5],
    [0.245, -0.012, 0.026, 0.026, 0.003, 0.4],
    [0.265, -0.012, 0.012, 0.014, 0.002, 0],
  ], 30, 22);
  paint(hg, (c, p, n) => {
    mixC(c, COAT.back, COAT.tan, smooth(0.0, 0.12, p.z));
    c.lerp(COAT.cream, smooth(0.2, -0.5, n.y) * smooth(-0.02, 0.06, p.z) + smooth(0.4, 0.8, Math.abs(n.x)) * smooth(0.0, 0.05, p.z) * smooth(0.12, 0.07, p.z) * 0.7);
    c.lerp(COAT.dark, smooth(0.2, 0.25, p.z) * 0.6 + smooth(-0.55, -0.85, n.y) * smooth(0.06, 0.12, p.z) * 0.8);
  });
  furry(head, hg, m.fur, 6, V(0, -0.2, -1));
  // Joues : la collerette s'évase derrière les yeux
  const cheek = loft([
    [-0.07, -0.01, 0.06, 0.05, 0.03, 0],
    [-0.03, -0.015, 0.095, 0.06, 0.045, 0.2],
    [0.02, -0.02, 0.08, 0.045, 0.03, 0.2],
    [0.05, -0.02, 0.04, 0.03, 0.01, 0],
  ], 10, 18);
  paint(cheek, (c, p, n) => { mixC(c, COAT.side, COAT.cream, smooth(0.2, -0.6, n.y) + 0.3); });
  furry(head, cheek, m.fur, 6, V(0, -0.4, -1));

  const hp = new Parts();
  hp.add(new THREE.SphereGeometry(0.02, 14, 10), m.nose, V(0, 0.002, 0.26), [0, 0, 0], V(1.15, 0.8, 0.9));
  hp.add(new THREE.BoxGeometry(0.05, 0.008, 0.15), m.mouth, V(0, -0.036, 0.17));
  for (const s of [-1, 1]) {
    hp.add(new THREE.ConeGeometry(0.0075, 0.034, 6), m.teeth, V(s * 0.022, -0.05, 0.215), [Math.PI, 0, 0]);
    for (let i = 0; i < 3; i++) hp.add(new THREE.ConeGeometry(0.005, 0.015, 5), m.teeth, V(s * 0.026, -0.044, 0.18 - i * 0.03), [Math.PI, 0, 0]);
  }
  hp.build(head, true);
  // Oreilles droites, triangulaires, dos sombre
  for (const s of [-1, 1]) {
    const eg = new THREE.ConeGeometry(0.042, 0.11, 10, 1, true, -Math.PI * 0.8, Math.PI * 1.6);
    eg.scale(1, 1, 0.45);
    paint(eg, (c, p, n) => { mixC(c, COAT.cream, COAT.saddle, smooth(0.2, -0.4, n.z)); c.lerp(COAT.dark, smooth(0.02, 0.05, p.y)); });
    const ear = new THREE.Mesh(eg, m.ear);
    ear.position.set(s * 0.058, 0.11, -0.025);
    ear.rotation.set(-0.15, s * 0.25, -s * 0.28);
    ear.castShadow = true;
    head.add(ear);
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.045, 0.07);
  head.add(jaw);
  const jg = loft([
    [-0.02, -0.005, 0.045, 0.022, 0.012, 0],
    [0.06, -0.008, 0.032, 0.016, 0.006, 0],
    [0.15, -0.006, 0.022, 0.012, 0.003, 0],
    [0.17, -0.004, 0.01, 0.008, 0.002, 0],
  ], 14, 14);
  paint(jg, (c, p, n) => { mixC(c, COAT.cream, COAT.dark, smooth(0.3, 0.8, n.y)); });
  furry(jaw, jg, m.fur, 4, V(0, -0.3, -1));
  const jp = new Parts();
  jp.add(new THREE.SphereGeometry(0.035, 10, 8), m.tongue, V(0, 0.006, 0.07), [0, 0, 0], V(0.75, 0.25, 1.7));
  for (const s of [-1, 1]) {
    jp.add(new THREE.ConeGeometry(0.007, 0.03, 6), m.teeth, V(s * 0.018, 0.016, 0.135));
    for (let i = 0; i < 3; i++) jp.add(new THREE.ConeGeometry(0.005, 0.013, 5), m.teeth, V(s * 0.022, 0.012, 0.1 - i * 0.028));
  }
  jp.build(jaw, true);

  // Yeux en amande qui brillent dans le noir
  const glows = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), m.eye);
    eye.position.set(s * 0.047, 0.05, 0.072);
    eye.scale.set(1.35, 0.7, 0.6);
    eye.rotation.set(0, s * 0.5, s * 0.25);
    head.add(eye);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot(), color: 0xffcc33, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.position.copy(eye.position).add(V(s * 0.004, 0, 0.012));
    glow.scale.set(0.12, 0.12, 1);
    head.add(glow);
    glows.push(glow);
  }
  Object.assign(w, { neck, head, jaw, glows });

  const legPaint = (c, p, n) => { mixC(c, COAT.tan, COAT.cream, smooth(-0.1, -0.8, n.z) * 0.8); c.lerp(COAT.side, smooth(0.0, 0.1, p.y)); };
  // Pattes avant : épaule, coude, poignet
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.1, -0.1, 0.3);
    furry(sh, paint(limb([[-0.06, 0.055, 0.08, 0.025], [0.08, 0.045, 0.058, 0.018], [0.22, 0.032, 0.04, 0.01]]), legPaint), m.fur, 6, V(0, -1, -0.3));
    const el = new THREE.Group();
    el.position.y = -0.21;
    furry(el, paint(limb([[-0.02, 0.034, 0.04, 0.012], [0.12, 0.026, 0.032, 0.007], [0.24, 0.022, 0.026, 0.005]]), legPaint), m.fur, 4, V(0, -1, 0));
    const wr = new THREE.Group();
    wr.position.y = -0.23;
    const p3 = new Parts();
    paw(p3, m, -0.072, 0.02);
    p3.build(wr, true);
    furry(wr, paint(limb([[-0.01, 0.022, 0.026, 0.005], [0.07, 0.022, 0.024, 0.006]], 6), legPaint), m.fur, 3, V(0, -1, 0));
    el.add(wr);
    sh.add(el);
    torso.add(sh);
    w.legs.push({ front: true, side: s, a: sh, b: el, c: wr });
  }
  // Pattes arrière : cuisse musclée et culotte de poils, genou, jarret
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.105, 0.0, -0.36);
    furry(hip, paint(limb([[-0.08, 0.07, 0.125, 0.03], [0.08, 0.058, 0.1, 0.032], [0.24, 0.033, 0.046, 0.014]], 12), (c, p, n) => { mixC(c, COAT.side, COAT.cream, smooth(-0.2, -0.8, n.z) * 0.9); c.lerp(COAT.back, smooth(0.0, 0.08, p.y)); }), m.fur, 7, V(0, -1, -0.5));
    const kn = new THREE.Group();
    kn.position.y = -0.23;
    furry(kn, paint(limb([[-0.02, 0.034, 0.045, 0.012], [0.13, 0.026, 0.034, 0.007], [0.26, 0.02, 0.028, 0.005]]), legPaint), m.fur, 4, V(0, -1, -0.2));
    const hk = new THREE.Group();
    hk.position.y = -0.25;
    const p3 = new Parts();
    paw(p3, m, -0.165, 0.02);
    p3.build(hk, true);
    furry(hk, paint(limb([[-0.01, 0.02, 0.026, 0.005], [0.16, 0.019, 0.022, 0.005]], 8), legPaint), m.fur, 3, V(0, -1, 0));
    kn.add(hk);
    hip.add(kn);
    torso.add(hip);
    w.legs.push({ front: false, side: s, a: hip, b: kn, c: hk });
  }
  // Queue touffue en quatre segments, bout noir
  let parent = torso;
  let at = V(0, 0.05, -0.48);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    t.position.copy(at);
    const r0 = [0.035, 0.045, 0.05, 0.045][i];
    const r1 = [0.045, 0.05, 0.045, 0.01][i];
    const tg = loft([[0.02, 0, r0, r0, 0.035, 0], [-0.06, 0, (r0 + r1) / 2 + 0.005, (r0 + r1) / 2 + 0.005, 0.045, 0], [-0.14, 0, r1, r1, i === 3 ? 0.02 : 0.04, 0]], 8, 14);
    paint(tg, (c, p, n) => { mixC(c, COAT.back, COAT.side, smooth(0.3, -0.6, n.y)); if (i === 3) c.lerp(COAT.dark, smooth(-0.02, -0.1, p.z)); });
    furry(t, tg, m.fur, 8, V(0, -0.2, -1));
    parent.add(t);
    w.tail.push(t);
    parent = t;
    at = V(0, 0, -0.12);
  }

  root.scale.setScalar(1.3);
  return w;
}

// Pose du loup pour une allure donnée. mode : stand, walk, run, crouch, leap, drag, howl, growl.
// k : avancement du cycle de foulée (en tours). o : options (mâchoire, regard, tête).
export function poseWolf(w, mode, k, o) {
  o = o || {};
  const ph = k * TAU;
  let pitch = 0;
  let lift = 0;
  let headX = 0;
  let neckX = -0.75;
  let tailBase = -0.85;
  let tailWave = Math.sin(ph * 0.5) * 0.15;
  const L = w.legs; // 0, 1 : avant gauche/droite ; 2, 3 : arrière gauche/droite
  const set = (leg, a, b, c) => { leg.a.rotation.x = a; leg.b.rotation.x = b; leg.c.rotation.x = c; };
  // Pattes au repos : avant droites, arrière en zigzag
  const rest = () => {
    set(L[0], 0.05, 0, -0.05); set(L[1], 0.05, 0, -0.05);
    set(L[2], -0.4, 0.95, -0.55); set(L[3], -0.4, 0.95, -0.55);
  };
  if (mode === 'run') {
    // Galop : pattes avant ensemble, puis pattes arrière ; le dos ondule.
    pitch = Math.sin(ph) * 0.13;
    lift = Math.max(0, Math.sin(ph + 0.6)) * 0.07;
    L.forEach((leg, i) => {
      const off = (leg.front ? 0 : Math.PI) + (leg.side > 0 ? 0.45 : 0);
      const s = Math.sin(ph + off);
      const fold = Math.max(0, Math.cos(ph + off));
      if (leg.front) set(leg, -s * 0.85, fold * 1.3, -fold * 0.4);
      else set(leg, -0.4 + s * 0.8, 0.95 + fold * 0.7, -0.55 - fold * 0.5);
    });
    neckX = -0.55 + Math.sin(ph) * 0.12;
    headX = 0.35;
    tailBase = -0.35;
    tailWave = Math.sin(ph) * 0.2;
  } else if (mode === 'walk' || mode === 'drag' || mode === 'crouch') {
    // Pas à quatre temps (à reculons pour traîner une proie)
    const dir = mode === 'drag' ? -1 : 1;
    const amp = mode === 'crouch' ? 0.28 : 0.38;
    const offs = [0, 0.5, 0.75, 0.25];
    L.forEach((leg, i) => {
      const a = ph * dir + offs[i] * TAU;
      const s = Math.sin(a);
      const fold = Math.max(0, Math.cos(a));
      if (leg.front) set(leg, -s * amp, fold * 0.9, -fold * 0.3);
      else set(leg, -0.4 + s * amp, 0.95 + fold * 0.5, -0.55 - fold * 0.3);
    });
    pitch = Math.sin(ph * 2) * 0.02;
    lift = Math.abs(Math.sin(ph * 2)) * 0.015;
    if (mode === 'crouch') {
      // À l'affût : avant-train bas, épaules saillantes, tête tendue
      lift -= 0.13;
      pitch += 0.12;
      L.forEach((leg) => { if (leg.front) { leg.a.rotation.x -= 0.5; leg.b.rotation.x += 0.8; leg.c.rotation.x -= 0.3; } else { leg.a.rotation.x -= 0.25; leg.b.rotation.x += 0.35; } });
      neckX = -0.2;
      headX = 0.2;
      tailBase = -1.2;
    } else if (mode === 'drag') {
      lift -= 0.06;
      pitch = -0.08;
      neckX = 0.05;
      headX = 0.5;
      tailBase = -0.7;
    } else {
      neckX = -0.6;
      headX = 0.45;
    }
  } else if (mode === 'leap') {
    // Bond : pattes avant tendues, arrière repoussées
    const e = clamp(k, 0, 1);
    pitch = -0.35 + e * 0.6;
    set(L[0], -1.3, 0.2, 0.1); set(L[1], -1.2, 0.3, 0.1);
    set(L[2], 0.7, 0.4, -0.2); set(L[3], 0.8, 0.35, -0.2);
    neckX = -0.35;
    headX = 0.3;
    tailBase = -0.2;
  } else if (mode === 'howl') {
    rest();
    pitch = -0.15;
    L[2].a.rotation.x = -0.9; L[2].b.rotation.x = 1.6; L[3].a.rotation.x = -0.9; L[3].b.rotation.x = 1.6;
    lift = -0.12;
    neckX = -1.35;
    headX = 0.05;
    tailBase = -1.4;
  } else if (mode === 'growl') {
    rest();
    L.forEach((leg) => { if (leg.front) { leg.a.rotation.x -= 0.25; leg.b.rotation.x += 0.45; } });
    lift = -0.06;
    pitch = 0.08;
    neckX = -0.3 + Math.sin(k * 40) * 0.02;
    headX = 0.25;
    tailBase = -1.25;
  } else {
    rest();
  }
  w.torso.rotation.x = pitch;
  w.torso.position.y = 0.62 + lift;
  w.neck.rotation.x = neckX + (o.neck || 0);
  w.neck.rotation.y = o.yaw || 0;
  w.head.rotation.x = headX + (o.head || 0);
  w.head.rotation.z = o.tilt || 0;
  w.jaw.rotation.x = (o.jaw || 0) * 0.65;
  w.tail.forEach((t, i) => {
    t.rotation.x = i === 0 ? tailBase : -0.12;
    t.rotation.y = tailWave * (i + 1) * 0.5;
  });
  const glow = o.glow === undefined ? 1 : o.glow;
  w.glows.forEach((g) => { g.material.opacity = glow; g.visible = glow > 0.01; });
}

// Position de la gueule (monde) : là où la proie est tenue.
export function mouthPos(w, out) {
  w.group.updateMatrixWorld(true);
  return (out || V(0, 0, 0)).set(0, -0.04, 0.2).applyMatrix4(w.head.matrixWorld);
}
