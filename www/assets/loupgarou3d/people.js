// Les villageois : assis sur leur rondin, articulés (hanches, genoux, épaules, coudes, tête)
// pour dormir, se réchauffer les mains, désigner un suspect, se lever, tomber ou être emportés.
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js';
import { V, TAU, once, Parts, lathe } from './geo.js';
import { SEAT_Y } from './world.js';

const SKINS = [0xe8b896, 0xc98e66, 0xa8714c, 0x7a4e32, 0xf0cfb0, 0xb87d58, 0x5e3a24, 0xdcaa84];
const HAIRS = [0x2b1d14, 0x6a4024, 0xb07a3a, 0x151515, 0x7a3518, 0xc8b070, 0x3b2a20, 0x8a8a8a];
const TUNICS = [0xc8b896, 0x8a6a4a, 0x6a7a5a, 0x9a5a3a, 0x7a8aa0, 0xb89a6a, 0x9a8a7a, 0x6a4a3a];
const TROUSERS = [0x4a3a2a, 0x3a3a32, 0x5a4a3a, 0x2a2a2a, 0x4a4238];
// Coiffe, cheveux, barbe, robe : un mélange différent pour chaque joueur.
const LOOKS = [
  { head: 'capuche', hair: 'court', beard: 'barbe' },
  { head: 'foulard', hair: 'long', robe: true },
  { head: 'chapeau', hair: 'court', beard: 'moustache' },
  { head: 'nu', hair: 'chignon', robe: true },
  { head: 'bonnet', hair: 'court', beard: 'barbe' },
  { head: 'capuche', hair: 'long', robe: true },
  { head: 'paille', hair: 'court' },
  { head: 'nu', hair: 'tresses', robe: true },
  { head: 'chapeau', hair: 'long', beard: 'barbe' },
  { head: 'bonnet', hair: 'long', robe: true },
  { head: 'nu', hair: 'court', beard: 'moustache' },
  { head: 'capuche', hair: 'chignon', robe: true },
];

const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));

function common() {
  return once('lg-common', () => ({
    white: std({ color: 0xf2eee6, roughness: 0.3 }),
    iris: std({ color: 0x2a1c12, roughness: 0.2 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouth: std({ color: 0x5a1e24, roughness: 0.6 }),
    leather: std({ color: 0x3a2618, roughness: 0.7 }),
    boot: std({ color: 0x2a1c14, roughness: 0.6 }),
    brass: std({ color: 0xc99a48, metalness: 0.9, roughness: 0.35 }),
    straw: std({ map: TX.texture(TX.wool('#c8a55a', 5)), roughness: 0.9 }),
    felt: std({ color: 0x2a2420, roughness: 0.9 }),
    wolfEye: new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    wolfFur: std({ map: TX.texture(TX.fur()), roughness: 1 }),
  }));
}

function avatarMats(color, id) {
  return once(`lg-av-${color}-${id}`, () => {
    const cloak = new THREE.Color(color).multiplyScalar(0.62);
    const scarf = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15);
    return {
      cloak: std({ map: TX.texture(TX.wool('#' + cloak.getHexString(), id + 3)), side: THREE.DoubleSide, roughness: 0.95 }),
      tunic: std({ map: TX.texture(TX.wool('#' + new THREE.Color(TUNICS[id % TUNICS.length]).getHexString(), id + 9)), roughness: 0.9 }),
      trousers: std({ map: TX.texture(TX.wool('#' + new THREE.Color(TROUSERS[id % TROUSERS.length]).getHexString(), id + 13)), roughness: 0.95 }),
      skirt: std({ map: TX.texture(TX.fabric('#' + cloak.clone().multiplyScalar(1.2).getHexString(), id % 2 ? 'rayures' : 'uni', id)), roughness: 0.9, side: THREE.DoubleSide }),
      scarf: std({ map: TX.texture(TX.fabric('#' + scarf.getHexString(), 'carreaux', id)), roughness: 0.9, side: THREE.DoubleSide }),
      skin: std({ color: SKINS[(id * 5 + 1) % SKINS.length], roughness: 0.6 }),
      hair: std({ color: HAIRS[(id * 3) % HAIRS.length], roughness: 0.75 }),
    };
  });
}

function capsule(r, len, seg) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, seg || 10);
  g.translate(0, -len / 2, 0);
  return g;
}

// ---------- Coiffures et couvre-chefs (tête de rayon r, centre à hy) ----------

function hair(kind, p, mm, r, hy) {
  const at = (x, y, z) => V(x, y + hy, z);
  p.add(new THREE.SphereGeometry(r * 1.05, 24, 14, 0, TAU, 0, Math.PI * 0.55), mm.hair, at(0, 0.004, -r * 0.06), [-0.25, 0, 0]);
  if (kind === 'long' || kind === 'tresses') {
    p.add(new THREE.CapsuleGeometry(r * 0.8, r * 1.2, 6, 14), mm.hair, at(0, -r * 0.65, -r * 0.42), [0.15, 0, 0], V(1.15, 1, 0.55));
  }
  if (kind === 'tresses') {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) p.add(new THREE.SphereGeometry(r * 0.17, 8, 6), mm.hair, at(s * r * 0.75, -r * (0.6 + i * 0.3), r * 0.15 - i * r * 0.03));
    }
  }
  if (kind === 'chignon') p.add(new THREE.SphereGeometry(r * 0.38, 14, 10), mm.hair, at(0, r * 0.5, -r * 0.85));
}

function headwear(kind, p, mm, r, hy, c) {
  const at = (x, y, z) => V(x, y + hy, z);
  if (kind === 'chapeau') {
    p.add(new THREE.CylinderGeometry(r * 0.78, r * 0.92, r * 0.85, 22), c.felt, at(0, r * 0.95, -r * 0.05), [-0.08, 0, 0]);
    p.add(new THREE.CylinderGeometry(r * 1.75, r * 1.75, r * 0.06, 28), c.felt, at(0, r * 0.62, -r * 0.03), [-0.08, 0, 0]);
    p.add(new THREE.CylinderGeometry(r * 0.93, r * 0.93, r * 0.16, 22, 1, true), c.leather, at(0, r * 0.7, -r * 0.04), [-0.08, 0, 0]);
  } else if (kind === 'paille') {
    p.add(lathe([[0, r * 0.75], [r * 0.7, r * 0.7], [r * 0.9, r * 0.2], [r * 2.1, r * 0.05], [r * 2.15, 0], [0.0001, 0]], 26), c.straw, at(0, r * 0.62, -r * 0.03), [-0.1, 0, 0]);
  } else if (kind === 'bonnet') {
    p.add(new THREE.SphereGeometry(r * 1.1, 22, 12, 0, TAU, 0, Math.PI * 0.5), mm.scarf, at(0, r * 0.12, -r * 0.04), [-0.2, 0, 0], V(1, 1.25, 1));
    p.add(new THREE.TorusGeometry(r * 1.06, r * 0.13, 8, 26), mm.scarf, at(0, r * 0.18, -r * 0.02), [Math.PI / 2 - 0.2, 0, 0]);
  } else if (kind === 'foulard') {
    p.add(new THREE.SphereGeometry(r * 1.12, 22, 14, Math.PI / 2 + 1.0, TAU - 2.0, 0, Math.PI * 0.62), mm.scarf, at(0, r * 0.02, -r * 0.02), [-0.15, 0, 0]);
    p.add(new THREE.SphereGeometry(r * 0.22, 10, 8), mm.scarf, at(0, -r * 0.55, -r * 0.9));
  } else if (kind === 'capuche') {
    p.add(new THREE.SphereGeometry(r * 1.3, 24, 16, Math.PI / 2 + 0.95, TAU - 1.9, 0, Math.PI * 0.68), mm.cloak, at(0, r * 0.08, -r * 0.12), [-0.12, 0, 0]);
    // Pointe de la capuche
    p.add(new THREE.ConeGeometry(r * 0.35, r * 0.7, 10), mm.cloak, at(0, r * 1.0, -r * 1.05), [-1.2, 0, 0]);
  }
}

function beard(kind, p, mm, r, hy) {
  const at = (x, y, z) => V(x, y + hy, z);
  if (kind === 'barbe') {
    p.add(new THREE.SphereGeometry(r * 0.78, 18, 12, Math.PI / 2 - 1.2, 2.4, Math.PI * 0.5, Math.PI * 0.5), mm.hair, at(0, -r * 0.08, r * 0.2), [0, 0, 0], V(1.05, 1.15, 1));
  }
  if (kind === 'barbe' || kind === 'moustache') {
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([at(0, -r * 0.3, r * 0.95), at(s * r * 0.22, -r * 0.34, r * 0.9), at(s * r * 0.38, -r * 0.42, r * 0.78)]);
      p.add(new THREE.TubeGeometry(curve, 8, r * 0.07, 6), mm.hair);
    }
  }
}

// Pan d'étoffe posé sur les cuisses, qui passe sur les genoux puis tombe devant les tibias ;
// les plis se creusent et l'ourlet s'évase en descendant.
function lapDrape(seed) {
  const path = new THREE.CatmullRomCurve3([V(0, 0.1, 0.03), V(0, 0.105, 0.3), V(0, 0.075, 0.47), V(0, -0.04, 0.54), V(0, -0.2, 0.555), V(0, -0.37, 0.58)]);
  const NU = 30;
  const NV = 28;
  const pos = [];
  const uv = [];
  const ph = seed * 1.7;
  const n = new THREE.Vector3();
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    const c = path.getPointAt(v);
    const t = path.getTangentAt(v);
    n.set(0, t.z, -t.y);
    const down = THREE.MathUtils.smoothstep(v, 0.35, 0.6);
    const hem = THREE.MathUtils.smoothstep(v, 0.5, 1);
    const hw = 0.2 + down * 0.03 + hem * 0.05;
    const d = 0.11 + down * 0.02 + hem * 0.03;
    const wrap = Math.PI * (0.55 + hem * 0.08);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const th = (u - 0.5) * 2 * wrap;
      // Creux entre les deux genoux, puis plis tombants
      const dip = -0.018 * Math.exp(-((th / 0.3) ** 2)) * (1 - hem);
      const fold = (0.004 + hem * 0.016) * Math.sin(th * 6 + ph + v * 1.5) + hem * 0.008 * Math.sin(th * 11 + ph * 2);
      const r = d * Math.cos(th) - d + dip + fold;
      pos.push(Math.sin(th) * hw, c.y + n.y * r, c.z + n.z * r);
      uv.push(u * 1.6, v * 1.6);
    }
  }
  const idx = [];
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i;
      idx.push(a, a + NU + 1, a + 1, a + 1, a + NU + 1, a + NU + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Villageois complet ----------

// style : 'realiste' (proportions adultes) ou 'mignon' (grosse tête, grands yeux, comme Big Ben).
export function buildVillager(player, color, style) {
  const id = player.id;
  const cute = style === 'mignon';
  const look = LOOKS[id % LOOKS.length];
  const mm = avatarMats(color, id);
  const c = common();
  const root = new THREE.Group();
  const av = { group: root, id, look, color, arms: [], legs: [], cute };

  // Bassin : pivot du corps (assis, debout, couché)
  const hips = new THREE.Group();
  hips.position.y = SEAT_Y + 0.08;
  root.add(hips);
  av.hips = hips;
  const spine = new THREE.Group();
  hips.add(spine);
  av.spine = spine;

  const body = new Parts();
  body.add(new THREE.SphereGeometry(0.15, 18, 12), look.robe ? mm.skirt : mm.trousers, V(0, 0.02, -0.01), [0, 0, 0], V(1.08, 0.72, 0.9));
  body.add(lathe([[0.001, 0], [0.15, 0.0], [0.158, 0.1], [0.152, 0.22], [0.168, 0.35], [0.178, 0.44], [0.12, 0.52], [0.05, 0.55], [0.001, 0.55]], 22), mm.tunic, V(0, 0, 0), [0, 0, 0], V(1, 1, 0.74));
  body.add(new THREE.TorusGeometry(0.153, 0.016, 6, 24), c.leather, V(0, 0.12, 0), [Math.PI / 2, 0, 0], V(1, 0.75, 1));
  body.add(new THREE.BoxGeometry(0.03, 0.03, 0.01), c.brass, V(0, 0.12, 0.118));
  body.add(new THREE.BoxGeometry(0.07, 0.08, 0.04), c.leather, V(0.12, 0.06, 0.07), [0, 0.6, 0]);
  // Cape : enveloppe le dos, les épaules et les flancs, ouverte devant ; elle retombe sur le rondin.
  body.add(lathe([[0.1, 0.56], [0.17, 0.53], [0.225, 0.47], [0.245, 0.36], [0.262, 0.2], [0.29, 0.04], [0.33, -0.1], [0.35, -0.16]], 26, Math.PI - 2.35, 4.7), mm.cloak, V(0, 0, -0.015), [0, 0, 0], V(1, 1, 0.84));
  body.add(new THREE.TorusGeometry(0.115, 0.032, 8, 22, Math.PI * 1.35), mm.cloak, V(0, 0.53, -0.005), [Math.PI / 2, 0, Math.PI * 1.325], V(1, 0.85, 1));
  // Pans avant de la cape, de part et d'autre de l'ouverture
  for (const s of [-1, 1]) body.add(new THREE.BoxGeometry(0.06, 0.62, 0.02), mm.cloak, V(s * 0.155, 0.2, 0.14), [0.12, -s * 0.5, s * 0.06]);
  body.add(new THREE.SphereGeometry(0.016, 8, 6), c.brass, V(0, 0.5, 0.1));
  if (look.head !== 'capuche') {
    // Capuche baissée sur les épaules
    body.add(new THREE.TorusGeometry(0.11, 0.045, 8, 20, Math.PI * 1.3), mm.cloak, V(0, 0.53, -0.03), [Math.PI / 2 + 0.4, 0, Math.PI * 1.35]);
  }
  body.build(spine, true);

  // Cou et tête
  const r = cute ? 0.165 : 0.1;
  const neck = new THREE.Group();
  neck.position.set(0, 0.53, 0.01);
  spine.add(neck);
  av.neck = neck;
  const head = new THREE.Group();
  head.position.y = 0.07;
  neck.add(head);
  av.head = head;
  const hy = cute ? r * 0.95 : r * 1.05;
  av.headY = hips.position.y + neck.position.y + head.position.y + hy;
  av.headR = r;
  av.hy = hy;
  const hp = new Parts();
  hp.add(new THREE.CylinderGeometry(0.048, 0.054, 0.12, 12), mm.skin, V(0, 0.0, 0));
  hp.add(new THREE.SphereGeometry(r, 30, 22), mm.skin, V(0, hy, 0), [0, 0, 0], cute ? V(1, 0.98, 0.98) : V(0.86, 1.06, 0.96));
  if (!cute) {
    hp.add(new THREE.SphereGeometry(r * 0.66, 18, 12), mm.skin, V(0, hy - r * 0.5, r * 0.3), [0, 0, 0], V(1, 0.8, 1));
    hp.add(new THREE.SphereGeometry(r * 0.2, 12, 10), mm.skin, V(0, hy - r * 0.05, r * 0.98), [0.3, 0, 0], V(0.75, 1.15, 1));
  } else {
    hp.add(new THREE.SphereGeometry(r * 0.12, 12, 10), mm.skin, V(0, hy - r * 0.12, r * 0.98));
  }
  for (const s of [-1, 1]) {
    hp.add(new THREE.SphereGeometry(r * 0.22, 12, 10), mm.skin, V(s * r * (cute ? 0.97 : 0.86), hy, -r * 0.02), [0, 0, 0], V(0.5, 1, 0.75));
    hp.add(new THREE.CapsuleGeometry(r * 0.05, r * 0.22, 3, 6), mm.hair, V(s * r * 0.34, hy + r * 0.32, r * 0.9), [0, 0, Math.PI / 2 + s * 0.15]);
  }
  hair(look.hair, hp, mm, r, hy);
  if (look.beard) beard(look.beard, hp, mm, r, hy);
  headwear(look.head, hp, mm, r, hy, c);
  hp.build(head, true);
  // Bouche (s'ouvre pour crier ou hurler)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 12, 8), c.mouth);
  mouth.position.set(0, hy - r * (cute ? 0.42 : 0.4), r * (cute ? 0.93 : 0.9));
  mouth.scale.set(1.2, 0.18, 0.5);
  head.add(mouth);
  av.mouth = mouth;
  // Yeux à part, pour cligner, dormir, s'effrayer… ou briller comme ceux d'un loup.
  const eyes = new THREE.Group();
  eyes.position.set(0, hy + r * 0.1, 0);
  const er = cute ? r * 0.2 : r * 0.14;
  const irisList = [];
  for (const s of [-1, 1]) {
    const ex = s * r * 0.36;
    const ez = r * (cute ? 0.85 : 0.82);
    const w = new THREE.Mesh(new THREE.SphereGeometry(er, 14, 10), c.white);
    w.position.set(ex, 0, ez);
    w.scale.set(1, cute ? 1.15 : 0.62, 0.55);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(er * (cute ? 0.62 : 0.7), 12, 8), c.iris);
    iris.position.set(ex, -er * 0.05, ez + er * 0.45);
    iris.scale.set(1, 1, 0.5);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(er * 0.2, 6, 4), c.shine);
    shine.position.set(ex + er * 0.25, er * 0.3, ez + er * 0.7);
    eyes.add(w, iris, shine);
    irisList.push(iris);
  }
  head.add(eyes);
  av.eyes = eyes;
  av.iris = irisList;

  // Bras : épaule puis coude ; pendent le long de -y au repos.
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.19, 0.45, -0.01);
    shoulder.rotation.order = 'YXZ';
    const up = new Parts();
    up.add(capsule(0.056, 0.3, 12), mm.cloak);
    up.add(new THREE.SphereGeometry(0.08, 14, 10), mm.cloak, V(s * 0.01, -0.01, 0), [0, 0, 0], V(1, 0.95, 1.1));
    up.build(shoulder, true);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    const lo = new Parts();
    lo.add(capsule(0.047, 0.25, 12), mm.tunic);
    lo.add(new THREE.TorusGeometry(0.04, 0.012, 6, 14), mm.tunic, V(0, -0.23, 0), [Math.PI / 2, 0, 0]);
    // Main : paume, doigts repliés, pouce
    lo.add(new THREE.SphereGeometry(0.042, 12, 10), mm.skin, V(0, -0.29, 0.005), [0, 0, 0], V(0.85, 1.15, 0.55));
    lo.add(new THREE.CapsuleGeometry(0.014, 0.035, 3, 6), mm.skin, V(-s * 0.03, -0.27, 0.02), [0.3, 0, s * 0.6]);
    lo.build(elbow, true);
    shoulder.add(elbow);
    spine.add(shoulder);
    shoulder.userData = { elbow, side: s };
    av.arms.push(shoulder);
  }

  // Jambes : hanche, genou ; bottes. Assis : cuisses vers l'avant, tibias à la verticale.
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(s * 0.095, 0, 0.0);
    const tp = new Parts();
    tp.add(capsule(look.robe ? 0.092 : 0.08, 0.44, 12), look.robe ? mm.skirt : mm.trousers);
    tp.build(thigh, true);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    const kp = new Parts();
    kp.add(capsule(look.robe ? 0.085 : 0.062, 0.4, 12), look.robe ? mm.skirt : mm.trousers, V(0, 0.01, 0));
    kp.add(new THREE.CylinderGeometry(0.066, 0.056, 0.2, 12), c.boot, V(0, -0.3, 0));
    kp.add(new THREE.SphereGeometry(0.06, 12, 8), c.boot, V(0, -0.41, 0.06), [0, 0, 0], V(0.85, 0.65, 1.9));
    kp.add(new THREE.BoxGeometry(0.1, 0.02, 0.24), c.leather, V(0, -0.445, 0.055));
    kp.build(knee, true);
    thigh.add(knee);
    hips.add(thigh);
    thigh.userData = { knee, side: s };
    av.legs.push(thigh);
  }
  // Assis, la cape (ou la robe) retombe sur les genoux et cache les jambes jusqu'aux bottes.
  const lp = new Parts();
  lp.add(lapDrape(id), look.robe ? mm.skirt : mm.cloak);
  const [lap] = lp.build(hips, true);
  av.skirtPanel = lap;

  // Pose et humeur animées par la scène.
  av.pose = { hipY: hips.position.y, lean: 0.06, headYaw: 0, headPitch: 0.1, sit: 1, arms: 'genoux', mood: null };
  av.cur = { lean: 0.06, headYaw: 0, headPitch: 0.1, sit: 1, armX: [0, 0], armY: [0, 0], armZ: [0, 0], elbow: [0, 0], open: 0, eyes: 1 };
  av.blink = 1 + Math.random() * 3;
  av.phase = Math.random() * TAU;
  return av;
}

// Oreilles et yeux de loup (la meute se reconnaît la nuit, et se dévoile à la fin).
export function wolfify(av, on) {
  const c = common();
  if (on && !av.wolfParts) {
    const g = new THREE.Group();
    const r = av.headR;
    const hy = av.eyes.position.y - r * 0.1;
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, r * 0.75, 8), c.wolfFur);
      ear.position.set(s * r * 0.55, hy + r * 1.05, -r * 0.1);
      ear.rotation.set(-0.15, 0, -s * 0.35);
      ear.scale.set(1, 1, 0.55);
      g.add(ear);
    }
    const glows = [];
    av.iris.forEach((iris) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot(), color: 0xffc830, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.scale.set(r * 0.9, r * 0.9, 1);
      sp.position.copy(iris.position).add(av.eyes.position);
      g.add(sp);
      glows.push(sp);
    });
    av.head.add(g);
    av.wolfParts = g;
  }
  if (av.wolfParts) av.wolfParts.visible = !!on;
  av.iris.forEach((iris) => { iris.material = on ? c.wolfEye : c.iris; });
}

// Stèle de bois plantée derrière la place d'un mort, avec sa carte de rôle et une bougie.
export function buildGrave(cardMat) {
  const g = new THREE.Group();
  const c = common();
  const wood = once('lg-grave-wood', () => std({ color: 0x5a4030, roughness: 0.9 }));
  const p = new Parts();
  p.add(new THREE.BoxGeometry(0.06, 0.95, 0.05), wood, V(0, 0.42, 0));
  p.add(new THREE.BoxGeometry(0.44, 0.06, 0.04), wood, V(0, 0.7, 0));
  p.add(new THREE.CylinderGeometry(0.12, 0.16, 0.06, 10), once('lg-dirt', () => std({ color: 0x3a2c20, roughness: 1 })), V(0, 0.02, 0.1), [0, 0, 0], V(1.4, 1, 2.2));
  p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10), once('lg-wax', () => std({ color: 0xf0e6cc, roughness: 0.6 })), V(0.16, 0.045, 0.22));
  p.build(g, true);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), cardMat);
  card.position.set(0, 0.5, 0.032);
  g.add(card);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot(), color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(0.16, 0.12, 0.22);
  flame.scale.set(0.07, 0.11, 1);
  g.add(flame);
  g.userData = { card, flame, c };
  return g;
}
