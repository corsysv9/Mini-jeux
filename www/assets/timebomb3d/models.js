// Objets de la scène : salle des horloges, table, personnages, pince, bombe, cartes.
// Les pièces fixes sont fusionnées par matériau pour limiter les appels de dessin.
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js';

export const TABLE_Y = 0.76;
export const CARD_SIZE = [0.12, 0.169];
export const ROOM = { half: 4.2, height: 5.2, dialY: 2.6, dialR: 1.85 };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (o) => new THREE.MeshStandardMaterial(o);

// Matériaux et textures partagés entre les parties (créés une seule fois).
const cache = {};
function once(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

function mats(high) {
  return once('mats', () => {
    const brick = TX.bricks();
    const floor = TX.planks(24, 20);
    const panel = TX.planks(18, 16, 48);
    const darkWood = TX.planks(14, 13, 40);
    return {
      brick: std({ map: TX.texture(brick.color, [0.62, 0.62]), bumpMap: TX.reliefTexture(brick.bump, [0.62, 0.62]), bumpScale: 3, roughness: 0.95 }),
      stone: std({ color: 0xb8a690, map: TX.texture(brick.color, [1.4, 1.4]), roughness: 0.9 }),
      stoneIn: std({ color: 0xa89680, map: TX.texture(brick.color, [1.2, 0.3]), roughness: 0.9, side: THREE.BackSide }),
      floor: std({ map: TX.texture(floor.color, [5, 5]), bumpMap: TX.reliefTexture(floor.bump, [5, 5]), bumpScale: 2, roughness: 0.7 }),
      panel: std({ map: TX.texture(panel.color, [1, 1]), roughness: 0.55 }),
      wood: std({ map: TX.texture(darkWood.color, [1, 1]), roughness: 0.6 }),
      woodPlain: std({ color: 0x3a2214, roughness: 0.55 }),
      beam: std({ map: TX.texture(darkWood.color, [4, 0.3]), roughness: 0.7 }),
      brass: std({ color: 0xc99a48, metalness: 1, roughness: 0.32 }),
      iron: std({ color: 0x2c2824, metalness: 0.8, roughness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0, depthWrite: false }),
      rug: std({ map: TX.texture(TX.rug()), roughness: 1 }),
      velvet: std({ map: TX.texture(TX.velvet(), [1, 1]), roughness: 0.85 }),
      rope: std({ color: 0x9a7a4a, roughness: 1 }),
      crate: std({ map: TX.texture(TX.planks(30, 34, 35).color, [0.6, 0.6]), roughness: 0.85 }),
      dial: new THREE.MeshBasicMaterial({ map: TX.texture(TX.dial(high ? 1024 : 512)), transparent: true, depthWrite: false, fog: false }),
      hands: new THREE.MeshBasicMaterial({ color: 0x0c0a10, fog: false }),
    };
  });
}

// Regroupe des géométries placées puis fusionne par matériau.
class Parts {
  constructor() { this.map = new Map(); }
  add(geo, mat, pos, rot, scale) {
    const m = new THREE.Matrix4().compose(
      pos || V(0, 0, 0),
      new THREE.Quaternion().setFromEuler(rot instanceof THREE.Euler ? rot : new THREE.Euler(...(rot || [0, 0, 0]))),
      typeof scale === 'number' ? V(scale, scale, scale) : (scale || V(1, 1, 1)),
    );
    return this.addMatrix(geo, mat, m);
  }
  addMatrix(geo, mat, m) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return this;
  }
  // Pièce allongée entre deux points (bras, barreaux, tiges).
  between(a, b, r, mat, seg) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const geo = new THREE.CylinderGeometry(r, r, dir.length(), seg || 8);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    return this.addMatrix(geo, mat, new THREE.Matrix4().compose(a.clone().addScaledVector(dir, 0.5), q, V(1, 1, 1)));
  }
  build(parent, shadow) {
    const out = [];
    for (const [mat, geos] of this.map) {
      const mesh = new THREE.Mesh(THREE.mergeGeometries(geos), mat);
      if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

function lathe(points, seg) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg || 20);
}

function gearGeometry(r, teeth, depth) {
  const d = depth || 0.05;
  const s = new THREE.Shape();
  const inner = r * 0.86;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    [[inner, a], [r, a + step * 0.15], [r, a + step * 0.45], [inner, a + step * 0.6]].forEach(([rr, aa], j) => {
      if (i === 0 && j === 0) s.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      else s.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
    });
  }
  s.closePath();
  const holes = r > 0.2 ? 6 : 4;
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.17, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const axle = new THREE.Path();
  axle.absarc(0, 0, r * 0.08, 0, Math.PI * 2, true);
  s.holes.push(axle);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 5 });
  geo.translate(0, 0, -d / 2);
  return geo;
}

// ---------- Salle des horloges ----------

export function buildRoom(opts) {
  const { half: HW, height: H, dialY, dialR } = ROOM;
  const m = mats(opts.high);
  const g = new THREE.Group();
  const parts = { sides: [], faces: [], hands: [], gears: [], props: [], flames: null };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HW * 2), m.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  parts.floor = floor;
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), m.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.004;
  rug.receiveShadow = true;
  g.add(rug);
  parts.rug = rug;

  // Plafond à caissons et trappe vers le beffroi
  const ceil = new Parts();
  ceil.add(new THREE.PlaneGeometry(HW * 2, HW * 2), m.panel, V(0, H, 0), [Math.PI / 2, 0, 0]);
  for (let i = -3; i <= 3; i++) {
    ceil.add(new THREE.BoxGeometry(HW * 2, 0.22, 0.2), m.beam, V(0, H - 0.11, i * 1.2));
    ceil.add(new THREE.BoxGeometry(0.2, 0.18, HW * 2), m.beam, V(i * 1.2, H - 0.09, 0));
  }
  for (const z of [-2.4, 2.4]) ceil.add(new THREE.BoxGeometry(HW * 2, 0.36, 0.34), m.wood, V(0, H - 0.4, z));
  ceil.add(new THREE.BoxGeometry(0.9, 0.06, 0.9), m.woodPlain, V(-HW + 0.9, H - 0.24, HW - 0.9));
  const ceiling = new THREE.Group();
  ceil.build(ceiling);
  g.add(ceiling);
  parts.ceiling = ceiling;

  // Les quatre murs, chacun percé de son cadran
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-HW, 0); wallShape.lineTo(HW, 0); wallShape.lineTo(HW, H); wallShape.lineTo(-HW, H); wallShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, dialY, dialR + 0.12, 0, Math.PI * 2, true);
  wallShape.holes.push(hole);
  const wallGeo = new THREE.ShapeGeometry(wallShape, 32);
  const minute = new THREE.PlaneGeometry(0.09, 1.55).translate(0, 0.62, 0);
  const hour = new THREE.PlaneGeometry(0.14, 1.0).translate(0, 0.4, 0);
  const sconceSpots = [];

  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group();
    side.rotation.y = (k * Math.PI) / 2;
    const wall = new THREE.Mesh(wallGeo, m.brick);
    wall.position.z = -HW;
    wall.receiveShadow = true;
    side.add(wall);
    const p = new Parts();
    // Embrasure, encadrement de pierre et anneau de fonte riveté
    p.add(new THREE.CylinderGeometry(dialR + 0.12, dialR, 0.55, 64, 1, true), m.stoneIn, V(0, dialY, -HW - 0.275), [Math.PI / 2, 0, 0]);
    p.add(new THREE.TorusGeometry(dialR + 0.17, 0.11, 10, 72), m.stone, V(0, dialY, -HW + 0.02));
    p.add(new THREE.TorusGeometry(dialR + 0.33, 0.05, 8, 72), m.stone, V(0, dialY, -HW + 0.01));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(new THREE.BoxGeometry(0.22, 0.32, 0.16), m.stone, V(Math.cos(a) * (dialR + 0.24), dialY + Math.sin(a) * (dialR + 0.24), -HW + 0.04), [0, 0, a + Math.PI / 2]);
    }
    p.add(new THREE.TorusGeometry(dialR - 0.02, 0.06, 8, 72), m.iron, V(0, dialY, -HW - 0.48));
    const rivet = new THREE.SphereGeometry(0.018, 6, 4);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      p.add(rivet, m.brass, V(Math.cos(a) * (dialR - 0.02), dialY + Math.sin(a) * (dialR - 0.02), -HW - 0.42));
    }
    // Rebord de fenêtre
    p.add(new THREE.BoxGeometry(2.2, 0.1, 0.42), m.stone, V(0, dialY - dialR - 0.15, -HW + 0.1));
    p.add(new THREE.BoxGeometry(1.4, 0.24, 0.1), m.stone, V(0, dialY - dialR - 0.32, -HW + 0.05));
    // Boiseries de part et d'autre du cadran
    for (const s of [-1, 1]) {
      const x0 = s * 2.25;
      const x1 = s * (HW - 0.32);
      const cx = (x0 + x1) / 2;
      const w = Math.abs(x1 - x0);
      p.add(new THREE.BoxGeometry(w, 1.25, 0.05), m.panel, V(cx, 0.625, -HW + 0.025));
      p.add(new THREE.BoxGeometry(w + 0.04, 0.12, 0.09), m.wood, V(cx, 0.06, -HW + 0.045));
      p.add(new THREE.BoxGeometry(w + 0.06, 0.07, 0.1), m.wood, V(cx, 1.27, -HW + 0.05));
      p.add(new THREE.CylinderGeometry(0.035, 0.035, w + 0.06, 8), m.wood, V(cx, 1.32, -HW + 0.08), [0, 0, Math.PI / 2]);
      for (let j = 0; j < 2; j++) {
        const px = Math.min(x0, x1) + (j + 0.5) * (w / 2);
        const pw = w / 2 - 0.16;
        p.add(new THREE.BoxGeometry(pw, 0.86, 0.03), m.panel, V(px, 0.66, -HW + 0.05));
        for (const [dx, dy, bw, bh] of [[0, 0.45, pw + 0.06, 0.04], [0, -0.45, pw + 0.06, 0.04], [pw / 2 + 0.01, 0, 0.04, 0.9], [-pw / 2 - 0.01, 0, 0.04, 0.9]]) {
          p.add(new THREE.BoxGeometry(bw, bh, 0.05), m.wood, V(px + dx, 0.66 + dy, -HW + 0.06));
        }
      }
      sconceSpots.push({ k, x: s * 3.0 });
    }
    // Pilastre d'angle et corniche
    p.add(new THREE.BoxGeometry(0.5, H, 0.5), m.stone, V(HW - 0.25, H / 2, -HW + 0.25));
    p.add(new THREE.BoxGeometry(0.62, 0.18, 0.62), m.stone, V(HW - 0.25, H - 0.6, -HW + 0.25));
    p.add(new THREE.BoxGeometry(0.62, 0.2, 0.62), m.stone, V(HW - 0.25, 0.1, -HW + 0.25));
    p.add(new THREE.BoxGeometry(HW * 2, 0.16, 0.22), m.stone, V(0, H - 0.6, -HW + 0.11));
    p.add(new THREE.BoxGeometry(HW * 2, 0.08, 0.32), m.stone, V(0, H - 0.5, -HW + 0.16));
    // Arbre de transmission de l'horloge vers le mécanisme central
    p.between(V(0, dialY, -HW - 0.45), V(0, 3.15, -0.28), 0.035, m.iron, 10);
    p.add(new THREE.BoxGeometry(0.22, 0.22, 0.2), m.brass, V(0, dialY, -HW - 0.36));
    p.build(side, true);
    // Verre du cadran et aiguilles (à l'extérieur, vues de dos)
    const face = new THREE.Mesh(new THREE.CircleGeometry(dialR, 64), m.dial);
    face.position.set(0, dialY, -HW - 0.5);
    face.renderOrder = 2;
    side.add(face);
    parts.faces.push(face);
    const hands = new THREE.Group();
    hands.position.set(0, dialY, -HW - 0.62);
    const mh = new THREE.Mesh(minute, m.hands);
    const hh = new THREE.Mesh(hour, m.hands);
    hh.position.z = -0.02;
    hands.add(mh, hh);
    side.add(hands);
    parts.hands.push({ minute: mh, hour: hh, group: hands });
    parts.sides.push(side);
    g.add(side);
  }

  // Appliques murales (flammes dessinées par un seul nuage de points)
  const sc = new Parts();
  const flamePos = [];
  sconceSpots.forEach(({ k, x }) => {
    const a = (k * Math.PI) / 2;
    const place = (lx, ly, lz) => V(lx, ly, lz).applyAxisAngle(V(0, 1, 0), a);
    sc.add(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), m.brass, place(x, 2.05, -HW + 0.01), new THREE.Euler(Math.PI / 2, a, 0, 'YXZ'));
    sc.between(place(x, 2.0, -HW + 0.02), place(x, 1.95, -HW + 0.2), 0.012, m.brass);
    sc.add(lathe([[0, 0], [0.05, 0.01], [0.06, 0.04], [0.03, 0.05]], 14), m.brass, place(x, 1.93, -HW + 0.22));
    sc.add(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 14, 1, true), m.glass, place(x, 2.06, -HW + 0.22));
    flamePos.push(place(x, 2.03, -HW + 0.22));
  });
  sc.build(g);
  const flames = new THREE.Points(new THREE.BufferGeometry().setFromPoints(flamePos), new THREE.PointsMaterial({ map: TX.softDot(), color: 0xffb04a, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(flames);
  parts.flames = flames;

  // Mécanisme central : boîte de renvoi d'où partent les quatre arbres
  const clock = new THREE.Group();
  clock.position.set(0, 3.15, 0);
  const cp = new Parts();
  cp.add(new THREE.BoxGeometry(0.56, 0.4, 0.56), m.brass);
  cp.add(new THREE.BoxGeometry(0.62, 0.05, 0.62), m.iron, V(0, 0.22, 0));
  cp.add(new THREE.BoxGeometry(0.62, 0.05, 0.62), m.iron, V(0, -0.22, 0));
  cp.add(new THREE.CylinderGeometry(0.05, 0.05, H - 3.15, 10), m.iron, V(0, (H - 3.15) / 2, 0));
  cp.build(clock, true);
  for (let k = 0; k < 4; k++) {
    const gear = new THREE.Mesh(gearGeometry(0.17, 18, 0.03), m.brass);
    const a = (k * Math.PI) / 2;
    gear.position.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
    gear.rotation.y = a;
    gear.userData.speed = k % 2 ? 0.5 : -0.5;
    clock.add(gear);
    parts.gears.push(gear);
  }
  g.add(clock);
  parts.clockwork = clock;

  // Lampe suspendue sous le mécanisme
  const lamp = new THREE.Group();
  lamp.position.y = 2.75;
  const lp = new Parts();
  lp.add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), m.iron, V(0, 0.2, 0));
  for (let i = 0; i < 3; i++) lp.add(new THREE.TorusGeometry(0.02, 0.006, 6, 10), m.brass, V(0, 0.25 + i * 0.035, 0), [0, i * 1.57, 0]);
  lp.add(lathe([[0.02, 0.07], [0.1, 0.05], [0.36, -0.12], [0.38, -0.14], [0.37, -0.15]], 32), std({ color: 0x1f4a35, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  lp.add(new THREE.TorusGeometry(0.375, 0.012, 6, 40), m.brass, V(0, -0.145, 0), [Math.PI / 2, 0, 0]);
  lp.build(lamp, true);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
  bulb.position.y = -0.08;
  lamp.add(bulb);
  g.add(lamp);
  parts.lamp = lamp;
  parts.bulb = bulb;

  // Engrenages muraux
  const wallGears = [[-1, 3.9, -2.95, 0.62, 28], [-1, 3.25, -3.62, 0.34, 15], [1, 4.0, 2.95, 0.55, 24], [1, 3.48, 3.62, 0.3, 13], [1, 1.75, -3.25, 0.42, 18]];
  for (const [s, y, z, r, teeth] of wallGears) {
    const gear = new THREE.Mesh(gearGeometry(r, teeth), m.brass);
    gear.position.set(s * (HW - 0.06), y, z);
    gear.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    gear.userData.speed = (teeth % 2 ? -1 : 1) * 0.1 * (0.6 / r);
    gear.castShadow = true;
    parts.gears.push(gear);
    g.add(gear);
  }

  // Balancier dans un coin, derrière une rambarde
  const pend = new THREE.Group();
  pend.position.set(HW - 0.85, 4.75, -HW + 0.85);
  const pp = new Parts();
  pp.add(new THREE.CylinderGeometry(0.018, 0.018, 3.6, 8), m.brass, V(0, -1.8, 0));
  pp.add(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 32), m.brass, V(0, -3.6, 0), [Math.PI / 2, 0, 0]);
  pp.build(pend, true);
  pend.rotation.y = Math.PI / 4;
  g.add(pend);
  parts.pendulum = pend;
  const rail = new Parts();
  for (const [a, b] of [[V(HW - 1.5, 0, -HW + 0.4), V(HW - 1.5, 0, -HW + 1.5)], [V(HW - 1.5, 0, -HW + 1.5), V(HW - 0.4, 0, -HW + 1.5)]]) {
    rail.between(a.clone().setY(0.95), b.clone().setY(0.95), 0.025, m.brass);
    rail.between(a.clone().setY(0.5), b.clone().setY(0.5), 0.015, m.brass);
    for (let t = 0; t <= 1.001; t += 0.25) {
      const pnt = a.clone().lerp(b, t);
      rail.between(pnt.clone().setY(0), pnt.clone().setY(0.95), 0.02, m.iron);
    }
  }
  rail.build(g);

  // Accessoires : échelle, caisses, gramophone, portemanteau
  const props = new THREE.Group();
  const pr = new Parts();
  const lx = -HW + 0.9;
  const lz = HW - 0.6;
  for (const dx of [-0.24, 0.24]) pr.between(V(lx + dx, 0, lz + 0.5), V(lx + dx, H - 0.25, lz - 0.1), 0.03, m.wood);
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    pr.between(V(lx - 0.24, t * (H - 0.25), lz + 0.5 - t * 0.6), V(lx + 0.24, t * (H - 0.25), lz + 0.5 - t * 0.6), 0.018, m.wood);
  }
  pr.add(new THREE.BoxGeometry(0.6, 0.6, 0.6), m.crate, V(-HW + 0.75, 0.3, -HW + 1.4), [0, 0.2, 0]);
  pr.add(new THREE.BoxGeometry(0.45, 0.45, 0.45), m.crate, V(-HW + 0.8, 0.83, -HW + 1.35), [0, -0.3, 0]);
  pr.add(new THREE.BoxGeometry(0.5, 0.4, 0.5), m.crate, V(-HW + 1.5, 0.2, -HW + 0.7), [0, 0.5, 0]);
  pr.add(new THREE.TorusGeometry(0.14, 0.04, 8, 20), m.rope, V(-HW + 0.8, 1.09, -HW + 1.35), [Math.PI / 2, 0, 0]);
  pr.add(new THREE.TorusGeometry(0.1, 0.035, 8, 20), m.rope, V(-HW + 0.8, 1.15, -HW + 1.35), [Math.PI / 2, 0, 0]);
  const gx = HW - 0.9;
  const gz = HW - 0.9;
  pr.add(lathe([[0, 0], [0.3, 0], [0.3, 0.03], [0.05, 0.05], [0.04, 0.7], [0.25, 0.72], [0.27, 0.76], [0, 0.76]], 24), m.wood, V(gx, 0, gz));
  pr.add(new THREE.BoxGeometry(0.42, 0.2, 0.42), m.wood, V(gx, 0.86, gz));
  pr.add(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 32), std({ color: 0x111111, roughness: 0.3 }), V(gx, 0.965, gz));
  pr.add(lathe([[0.02, 0], [0.025, 0.12], [0.05, 0.3], [0.12, 0.44], [0.3, 0.55], [0.31, 0.56]], 28), m.brass, V(gx - 0.12, 1.0, gz - 0.12), [-0.9, -0.8, 0]);
  const cx = -HW + 0.6;
  const cz = 0.2;
  pr.add(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), m.wood, V(cx, 0.95, cz));
  pr.add(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 16), m.wood, V(cx, 0.02, cz));
  for (let i = 0; i < 4; i++) pr.between(V(cx, 1.78, cz), V(cx + Math.cos(i * 1.57) * 0.16, 1.88, cz + Math.sin(i * 1.57) * 0.16), 0.012, m.brass);
  pr.add(lathe([[0, 1.78], [0.12, 1.7], [0.2, 1.3], [0.24, 0.9], [0.2, 0.86], [0, 0.86]], 18), std({ map: TX.texture(TX.fabric('#3b3b46', 'carreaux', 9)), roughness: 0.95 }), V(cx + 0.06, 0, cz), [0, 0, 0], V(1, 1, 0.6));
  pr.add(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x1c1a20, roughness: 0.8 }), V(cx, 1.92, cz));
  pr.add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), std({ color: 0x1c1a20, roughness: 0.8 }), V(cx, 1.92, cz));
  pr.build(props, true);
  g.add(props);
  parts.props.push(props);

  return { group: g, parts };
}

// Ville et ciel tout autour de la tour
export function buildCity(high) {
  const tex = once('city', () => {
    const t = TX.texture(TX.london(high ? 4096 : 2048, high ? 1024 : 512));
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.x = -1;
    return t;
  });
  const city = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 50, 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  city.position.y = 4.4;
  return city;
}

// Reflets du laiton et du bois : une petite salle chaude éclairée par la lampe et les cadrans.
export function environment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x2a1c18, side: THREE.BackSide })));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(6) }));
  lamp.position.y = 2.4;
  env.add(lamp);
  const moon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a78c8).multiplyScalar(1.5) });
  for (let k = 0; k < 4; k++) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), moon);
    const a = (k * Math.PI) / 2;
    d.position.set(Math.sin(a) * 4.9, 0.6, Math.cos(a) * 4.9);
    d.lookAt(0, 0.6, 0);
    env.add(d);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return tex;
}

// ---------- Table et fauteuils ----------

export function buildTable(R, style) {
  const m = mats();
  const g = new THREE.Group();
  const p = new Parts();
  p.add(new THREE.CylinderGeometry(R, R * 0.985, 0.06, 72), m.wood, V(0, TABLE_Y - 0.03, 0));
  p.add(new THREE.TorusGeometry(R, 0.03, 8, 96), m.wood, V(0, TABLE_Y - 0.02, 0), [Math.PI / 2, 0, 0]);
  p.add(new THREE.TorusGeometry(R * 0.985, 0.012, 6, 96), m.brass, V(0, TABLE_Y - 0.055, 0), [Math.PI / 2, 0, 0]);
  p.add(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.09, 72, 1, true), m.wood, V(0, TABLE_Y - 0.1, 0));
  p.add(lathe([[0.05, 0.08], [0.17, 0.1], [0.12, 0.16], [0.1, 0.24], [0.15, 0.32], [0.15, 0.36], [0.1, 0.42], [0.09, 0.56], [0.14, 0.62], [0.12, 0.68], [0.05, 0.7]], 24), m.wood);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const curve = new THREE.CatmullRomCurve3([V(0, 0.15, 0).addScaledVector(dir, 0.1), V(0, 0.12, 0).addScaledVector(dir, 0.3), V(0, 0.06, 0).addScaledVector(dir, 0.48), V(0, 0.05, 0).addScaledVector(dir, 0.56)]);
    p.add(new THREE.TubeGeometry(curve, 12, 0.04, 8), m.wood);
    p.add(new THREE.SphereGeometry(0.05, 12, 8), m.brass, V(0, 0.045, 0).addScaledVector(dir, 0.58));
  }
  p.build(g, true);
  const topTex = once('top-' + style, () => {
    const t = TX.texture(TX.tableTop(style === 'cuir' ? '#5a1f2e' : '#1d5a3c'));
    t.anisotropy = 8;
    return t;
  });
  const felt = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 72), std({ map: topTex, roughness: 0.95 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = TABLE_Y + 0.0006;
  felt.receiveShadow = true;
  g.add(felt);
  return g;
}

export function buildChair() {
  const m = mats();
  const geos = once('chair', () => {
    const p = new Parts();
    const leg = lathe([[0.02, 0], [0.028, 0.04], [0.02, 0.12], [0.03, 0.2], [0.022, 0.3], [0.026, 0.42], [0.022, 0.44]], 10);
    for (const [x, z] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) p.add(leg, m.wood, V(x, 0, z));
    p.add(new THREE.BoxGeometry(0.48, 0.05, 0.44), m.wood, V(0, 0.44, 0));
    p.add(new THREE.SphereGeometry(0.25, 20, 10), m.velvet, V(0, 0.48, 0.01), [0, 0, 0], V(0.95, 0.16, 0.86));
    for (const x of [-0.21, 0.21]) p.between(V(x, 0.44, -0.2), V(x * 1.08, 1.12, -0.27), 0.022, m.wood);
    p.add(new THREE.TorusGeometry(0.23, 0.022, 8, 20, Math.PI), m.wood, V(0, 1.1, -0.27), [0.12, 0, 0]);
    p.add(new THREE.SphereGeometry(0.26, 20, 14), m.velvet, V(0, 0.82, -0.25), [0.12, 0, 0], V(0.84, 1.08, 0.16));
    p.add(new THREE.SphereGeometry(0.025, 8, 6), m.brass, V(0, 1.36, -0.3));
    const merged = new Map();
    p.map.forEach((list, mat) => merged.set(mat, THREE.mergeGeometries(list)));
    return merged;
  });
  const g = new THREE.Group();
  geos.forEach((geo, mat) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  });
  return g;
}

// ---------- Personnages ----------

const SKINS = [0xf2c9a0, 0xd9a27a, 0xb87a50, 0x8a5636, 0xf6d6bb, 0xc48c62, 0x6e4228, 0xe8b890];
const HAIRS = [0x2b1d14, 0x6a4024, 0xc98a3a, 0x151515, 0x8a3b1f, 0xd8c07a, 0x3b2a20, 0x9a9a9a];
const IRIS = [0x4a7ac8, 0x5a3a20, 0x3f8a5a, 0x2a2a2a, 0x7a5a2a, 0x5a8ab8];
const VESTS = [0xe8e0d0, 0x7a2a2a, 0x2a3a5a, 0xc9a050, 0x3a4a2a, 0x5a2a4a, 0x2a2a2a, 0x8a6a3a];
// Accessoires du style « victorien » (jamais de haut-de-forme ni de casquette de Sherlock : ils révèlent les rôles à la fin).
const VICTORIAN = [['melon', 'moustache', 'noeud'], ['bonnet', 'collier', 'fleur'], ['casquette', 'echarpe', 'barbe'], ['beret', 'lunettes', 'cravate'], ['canotier', 'noeud', 'moustache'], ['lunettes', 'broche', 'cravate'], ['casquette', 'pipe', 'barbe'], ['melon', 'monocle', 'cravate']];

function avatarMats(color, id) {
  return once('av-' + color + '-' + id, () => {
    const c = new THREE.Color(color);
    return {
      jacket: std({ color: 0xffffff, map: TX.texture(TX.fabric('#' + c.getHexString(), ['uni', 'carreaux', 'rayures'][id % 3], id)), roughness: 0.9 }),
      lapel: std({ color: c.clone().multiplyScalar(0.62), roughness: 0.75 }),
      vest: std({ color: VESTS[id % VESTS.length], roughness: 0.8 }),
      skin: std({ color: SKINS[(id * 5 + 1) % SKINS.length], roughness: 0.62 }),
      hair: std({ color: HAIRS[(id * 3) % HAIRS.length], roughness: 0.7 }),
      iris: std({ color: IRIS[id % IRIS.length], roughness: 0.3 }),
      lacquer: std({ color, roughness: 0.18, metalness: 0.05 }),
    };
  });
}

function common() {
  return once('common', () => ({
    white: std({ color: 0xf6f3ee, roughness: 0.6 }),
    eyeWhite: std({ color: 0xffffff, roughness: 0.25 }),
    pupil: std({ color: 0x0a0a0e, roughness: 0.2 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cheek: new THREE.MeshBasicMaterial({ color: 0xff7a8a, transparent: true, opacity: 0.32, depthWrite: false }),
    mouth: std({ color: 0x6a2232, roughness: 0.5 }),
    dark: std({ color: 0x1c1a20, roughness: 0.7 }),
    gold: std({ color: 0xd9a640, metalness: 1, roughness: 0.3 }),
    red: std({ color: 0xa3253a, roughness: 0.7 }),
    straw: std({ color: 0xd9b86a, roughness: 0.85 }),
    tweed: std({ map: TX.texture(TX.fabric('#6b5a44', 'carreaux', 4)), roughness: 0.95 }),
    pearl: std({ color: 0xf4efe6, roughness: 0.2, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }),
    pipe: std({ color: 0x4a2a14, roughness: 0.5 }),
  }));
}

// Coiffures, posées sur une tête de rayon r centrée en (0, hy, 0).
function hairStyle(kind, p, mm, r, hy) {
  const at = (x, y, z) => V(x, y + hy, z);
  const cap = (phiLen) => p.add(new THREE.SphereGeometry(r * 1.06, 24, 14, 0, Math.PI * 2, 0, phiLen), mm.hair, at(0, 0.01, -0.01), [-0.35, 0, 0]);
  const fringe = () => {
    for (let i = -2; i <= 2; i++) p.add(new THREE.SphereGeometry(r * 0.32, 10, 8), mm.hair, at(i * r * 0.22, r * 0.62, r * 0.68 - Math.abs(i) * 0.012), [0, 0, 0], V(1, 0.6, 0.7));
  };
  switch (kind) {
    case 0: cap(Math.PI * 0.52); p.add(new THREE.CapsuleGeometry(r * 0.22, r * 0.9, 4, 10), mm.hair, at(-r * 0.25, r * 0.66, r * 0.55), [0, 0, 1.2]); break;
    case 1: cap(Math.PI * 0.55); fringe(); p.add(new THREE.CapsuleGeometry(r * 0.75, r * 0.9, 6, 14), mm.hair, at(0, -r * 0.35, -r * 0.45), [0, 0, 0], V(1.15, 1, 0.6)); break;
    case 2:
      cap(Math.PI * 0.5);
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.add(new THREE.SphereGeometry(r * 0.3, 10, 8), mm.hair, at(Math.cos(a) * r * 0.82, r * 0.5 + Math.sin(i * 1.7) * r * 0.15, Math.sin(a) * r * 0.82 - r * 0.1)); }
      break;
    case 3: cap(Math.PI * 0.55); fringe(); p.add(new THREE.SphereGeometry(r * 0.42, 14, 10), mm.hair, at(0, r * 0.9, -r * 0.55)); break;
    case 4:
      cap(Math.PI * 0.5);
      for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; p.add(new THREE.ConeGeometry(r * 0.16, r * 0.45, 8), mm.hair, at(Math.sin(a) * r * 0.55, r * 1.0, Math.cos(a) * r * 0.2 - r * 0.1), [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6]); }
      break;
    case 5: cap(Math.PI * 0.58); fringe(); for (const s of [-1, 1]) p.add(new THREE.SphereGeometry(r * 0.55, 14, 10), mm.hair, at(s * r * 0.72, -r * 0.05, -r * 0.1), [0, 0, 0], V(0.55, 1.2, 1)); break;
    case 6:
      for (const s of [-1, 1]) p.add(new THREE.SphereGeometry(r * 0.5, 12, 10), mm.hair, at(s * r * 0.8, r * 0.15, -r * 0.2), [0, 0, 0], V(0.4, 0.8, 1.1));
      p.add(new THREE.SphereGeometry(r * 0.75, 14, 10), mm.hair, at(0, -r * 0.15, -r * 0.55), [0, 0, 0], V(1.1, 0.8, 0.5));
      break;
    default:
      cap(Math.PI * 0.55); fringe();
      p.add(new THREE.CapsuleGeometry(r * 0.2, r * 1.0, 4, 10), mm.hair, at(0, r * 0.1, -r * 1.05), [0.4, 0, 0]);
      p.add(new THREE.TorusGeometry(r * 0.15, r * 0.05, 6, 12), common().red, at(0, r * 0.62, -r * 0.92), [0.9, 0, 0]);
  }
}

function accessory(kind, head, torso, r, mm, hy) {
  const c = common();
  if (['melon', 'casquette', 'beret', 'canotier', 'bonnet'].includes(kind)) {
    const hat = new THREE.Group();
    const p = new Parts();
    if (kind === 'melon') {
      p.add(new THREE.SphereGeometry(r * 0.82, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.dark, V(0, 0, 0), [0, 0, 0], V(1, 0.95, 1));
      p.add(lathe([[r * 0.8, 0.0], [r * 1.25, -0.005], [r * 1.32, 0.02], [r * 1.3, 0.03]], 28), c.dark);
      p.add(new THREE.CylinderGeometry(r * 0.83, r * 0.83, r * 0.18, 24, 1, true), c.red, V(0, r * 0.08, 0));
      hat.position.set(0, hy + r * 0.78, -0.01);
      hat.rotation.x = -0.12;
    } else if (kind === 'casquette') {
      p.add(new THREE.SphereGeometry(r * 1.02, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), c.tweed, V(0, 0, 0), [0, 0, 0], V(1, 0.55, 1.08));
      p.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), c.tweed, V(0, 0.005, r * 0.62), [0.18, 0, 0]);
      p.add(new THREE.SphereGeometry(0.012, 8, 6), c.tweed, V(0, r * 0.55, 0));
      hat.position.set(0, hy + r * 0.6, 0);
    } else if (kind === 'beret') {
      p.add(new THREE.SphereGeometry(r * 0.98, 20, 10), c.red, V(0, 0, 0), [0, 0, 0.25], V(1.08, 0.3, 1.08));
      p.add(new THREE.CylinderGeometry(0.008, 0.012, 0.03, 6), c.red, V(-0.02, r * 0.3, 0));
      hat.position.set(-r * 0.1, hy + r * 0.78, -0.01);
    } else if (kind === 'canotier') {
      p.add(new THREE.CylinderGeometry(r * 0.72, r * 0.76, r * 0.42, 28), c.straw, V(0, r * 0.21, 0));
      p.add(new THREE.CylinderGeometry(r * 1.28, r * 1.28, 0.01, 32), c.straw);
      p.add(new THREE.CylinderGeometry(r * 0.765, r * 0.77, r * 0.13, 28, 1, true), mm.jacket, V(0, r * 0.09, 0));
      hat.position.set(0, hy + r * 0.8, 0);
    } else {
      p.add(new THREE.SphereGeometry(r * 1.12, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), c.straw, V(0, 0, 0), [-0.75, 0, 0]);
      p.add(new THREE.TorusGeometry(r * 1.0, 0.012, 6, 30), c.red, V(0, -r * 0.1, 0.02), [-0.75 + Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) p.between(V(s * r * 0.85, -r * 0.2, r * 0.2), V(s * r * 0.15, -r * 1.05, r * 0.55), 0.008, c.red);
      p.add(new THREE.TorusGeometry(0.025, 0.01, 6, 10), c.red, V(r * 0.15, -r * 1.05, r * 0.6), [0, 0, 0], V(1.8, 1, 1));
      hat.position.set(0, hy + r * 0.12, -0.01);
    }
    p.build(hat, true);
    head.add(hat);
    return hat;
  }
  const p = new Parts();
  const at = (x, y, z) => V(x, y + hy, z);
  let target = head;
  switch (kind) {
    case 'moustache':
      for (const s of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([at(0, -r * 0.2, r * 0.97), at(s * r * 0.2, -r * 0.24, r * 0.96), at(s * r * 0.38, -r * 0.18, r * 0.88), at(s * r * 0.45, -r * 0.06, r * 0.82)]);
        p.add(new THREE.TubeGeometry(curve, 10, r * 0.055, 6), mm.hair);
      }
      break;
    case 'barbe':
      p.add(new THREE.SphereGeometry(r * 0.72, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mm.hair, at(0, -r * 0.15, r * 0.25), [-0.25, 0, 0], V(1.05, 1.1, 0.95));
      break;
    case 'monocle':
      p.add(new THREE.TorusGeometry(r * 0.2, r * 0.025, 6, 20), c.gold, at(r * 0.38, r * 0.08, r * 0.98), [0, 0.35, 0]);
      p.add(new THREE.CircleGeometry(r * 0.19, 16), c.glass, at(r * 0.38, r * 0.08, r * 0.98), [0, 0.35, 0]);
      p.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([at(r * 0.5, -r * 0.1, r * 0.95), at(r * 0.7, -r * 0.6, r * 0.7), at(r * 0.6, -r * 1.2, r * 0.5)]), 10, 0.003, 4), c.gold);
      break;
    case 'lunettes':
      for (const s of [-1, 1]) {
        p.add(new THREE.TorusGeometry(r * 0.19, r * 0.025, 6, 20), c.dark, at(s * r * 0.37, r * 0.08, r * 0.98), [0, s * 0.35, 0]);
        p.add(new THREE.CircleGeometry(r * 0.18, 16), c.glass, at(s * r * 0.37, r * 0.08, r * 0.98), [0, s * 0.35, 0]);
        p.between(at(s * r * 0.55, r * 0.1, r * 0.85), at(s * r * 0.93, r * 0.12, r * 0.1), 0.004, c.dark, 4);
      }
      p.between(at(-r * 0.2, r * 0.12, r * 1.02), at(r * 0.2, r * 0.12, r * 1.02), 0.004, c.dark, 4);
      break;
    case 'pipe':
      p.between(at(r * 0.2, -r * 0.35, r * 0.95), at(r * 0.55, -r * 0.55, r * 1.3), 0.008, c.pipe, 6);
      p.add(new THREE.CylinderGeometry(0.026, 0.02, 0.06, 12), c.pipe, at(r * 0.6, -r * 0.42, r * 1.33));
      break;
    case 'noeud':
      target = torso;
      for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.035, 0.07, 10), c.red, V(s * 0.034, 0.955, 0.125), [0, 0, s * Math.PI / 2]);
      p.add(new THREE.SphereGeometry(0.014, 8, 6), c.red, V(0, 0.955, 0.13));
      break;
    case 'cravate':
      target = torso;
      p.add(new THREE.SphereGeometry(0.02, 8, 6), c.red, V(0, 0.95, 0.135));
      p.add(new THREE.ConeGeometry(0.03, 0.14, 4), c.red, V(0, 0.87, 0.14), [Math.PI + 0.12, Math.PI / 4, 0], V(1, 1, 0.3));
      break;
    case 'echarpe':
      target = torso;
      p.add(new THREE.TorusGeometry(0.1, 0.035, 10, 24), c.tweed, V(0, 0.97, 0.005), [Math.PI / 2, 0, 0], V(1.25, 1.1, 1));
      p.add(new THREE.BoxGeometry(0.07, 0.24, 0.025), c.tweed, V(0.07, 0.84, 0.15), [0.15, 0, 0.12]);
      break;
    case 'collier':
      target = torso;
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * 0.15 + (i / 17) * Math.PI * 0.7;
        p.add(new THREE.SphereGeometry(0.011, 8, 6), c.pearl, V(Math.cos(a) * 0.1, 0.92 - Math.sin(a) * 0.04, Math.sin(a) * 0.09 + 0.02));
      }
      break;
    case 'fleur':
    case 'broche':
      target = torso;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        p.add(new THREE.SphereGeometry(0.014, 8, 6), kind === 'fleur' ? c.red : c.gold, V(0.08 + Math.cos(a) * 0.014, 0.86 + Math.sin(a) * 0.014, 0.142));
      }
      p.add(new THREE.SphereGeometry(0.01, 8, 6), c.gold, V(0.08, 0.86, 0.15));
      break;
    default:
  }
  p.build(target, true);
  return null;
}

// Un petit personnage assis, tourné vers +z (le centre de la table une fois placé).
export function buildAvatar(player, color, style) {
  const id = player.id;
  const mm = avatarMats(color, id);
  const c = common();
  const g = new THREE.Group();
  const a = { group: g, arms: [], hats: [], eyes: null, color };
  const torso = new THREE.Group();
  g.add(torso);
  a.torso = torso;
  const pawn = style === 'pion';
  const r = pawn ? 0.15 : 0.165;
  const skin = pawn ? mm.lacquer : mm.skin;

  const body = new Parts();
  if (pawn) {
    body.add(lathe([[0, 0.47], [0.21, 0.47], [0.21, 0.5], [0.17, 0.54], [0.11, 0.67], [0.085, 0.82], [0.15, 0.86], [0.15, 0.89], [0.06, 0.93], [0, 0.93]], 32), mm.lacquer);
  } else {
    // Veste, gilet, chemise et col
    body.add(lathe([[0, 0.47], [0.17, 0.47], [0.2, 0.56], [0.2, 0.7], [0.18, 0.84], [0.15, 0.93], [0.09, 0.98], [0, 0.99]], 28), mm.jacket, V(0, 0, 0), [0, 0, 0], V(1, 1, 0.86));
    body.add(new THREE.CylinderGeometry(0.183, 0.2, 0.3, 20, 1, true, -0.62, 1.24), mm.vest, V(0, 0.7, 0.004), [0, 0, 0], V(1, 1, 0.87));
    body.add(new THREE.CylinderGeometry(0.155, 0.185, 0.14, 16, 1, true, -0.3, 0.6), c.white, V(0, 0.9, 0.006), [0, 0, 0], V(1, 1, 0.88));
    for (const s of [-1, 1]) {
      body.add(new THREE.BoxGeometry(0.05, 0.3, 0.012), mm.lapel, V(s * 0.085, 0.78, 0.16), [-0.25, s * 0.35, s * 0.32]);
      body.add(new THREE.BoxGeometry(0.045, 0.04, 0.012), c.white, V(s * 0.04, 0.965, 0.11), [-0.3, s * 0.4, s * 0.6]);
    }
    for (let i = 0; i < 4; i++) body.add(new THREE.SphereGeometry(0.011, 8, 6), c.gold, V(0, 0.84 - i * 0.07, 0.172 + i * 0.004));
    body.add(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 14), mm.skin, V(0, 1.0, 0));
  }
  body.build(torso, true);

  // Tête : visage, oreilles, nez, sourcils, bouche, cheveux ; pivot au cou.
  const head = new THREE.Group();
  head.position.y = pawn ? 1.04 : 1.0;
  const hy = pawn ? 0 : 0.13;
  a.headY = head.position.y + hy;
  const hp = new Parts();
  hp.add(new THREE.SphereGeometry(r, 32, 24), skin, V(0, hy, 0), [0, 0, 0], V(1, 1.03, 0.97));
  if (!pawn) {
    for (const s of [-1, 1]) hp.add(new THREE.SphereGeometry(r * 0.22, 12, 10), skin, V(s * r * 0.97, hy, -r * 0.05), [0, 0, 0], V(0.55, 1, 0.8));
    hp.add(new THREE.SphereGeometry(r * 0.15, 12, 10), skin, V(0, hy - r * 0.05, r * 0.97), [0, 0, 0], V(1, 0.9, 0.9));
    hairStyle(id % 8, hp, mm, r, hy);
  }
  for (const s of [-1, 1]) {
    hp.add(new THREE.CircleGeometry(r * 0.16, 16), c.cheek, V(s * r * 0.58, hy - r * 0.2, r * 0.82), [0, s * 0.62, 0]);
    hp.add(new THREE.CapsuleGeometry(r * 0.045, r * 0.22, 3, 6), pawn ? c.dark : mm.hair, V(s * r * 0.37, hy + r * 0.38, r * 0.9), [0, 0, Math.PI / 2 + s * 0.12]);
  }
  hp.add(new THREE.TorusGeometry(r * 0.17, r * 0.035, 6, 16, Math.PI), c.mouth, V(0, hy - r * 0.32, r * 0.93), [0.1, 0, Math.PI]);
  hp.build(head, true);
  // Yeux à part pour pouvoir cligner
  const eyes = new THREE.Group();
  eyes.position.set(0, hy + r * 0.08, 0);
  const ep = new Parts();
  for (const s of [-1, 1]) {
    const ex = s * r * 0.37;
    const ez = r * 0.86;
    ep.add(new THREE.SphereGeometry(r * 0.19, 16, 12), c.eyeWhite, V(ex, 0, ez), [0, 0, 0], V(1, 1.15, 0.6));
    ep.add(new THREE.SphereGeometry(r * 0.12, 14, 10), mm.iris, V(ex, -r * 0.01, ez + r * 0.08), [0, 0, 0], V(1, 1.1, 0.5));
    ep.add(new THREE.SphereGeometry(r * 0.065, 10, 8), c.pupil, V(ex, -r * 0.01, ez + r * 0.12), [0, 0, 0], V(1, 1.1, 0.5));
    ep.add(new THREE.SphereGeometry(r * 0.03, 6, 4), c.shine, V(ex + r * 0.05, r * 0.06, ez + r * 0.14));
  }
  ep.build(eyes);
  head.add(eyes);
  a.eyes = eyes;
  torso.add(head);
  a.head = head;

  if (style === 'victorien') {
    for (const kind of VICTORIAN[id % VICTORIAN.length]) {
      const hat = accessory(kind, head, torso, r, mm, hy);
      if (hat) a.hats.push(hat);
    }
  }

  // Bras articulés (épaule puis coude) ; le droit se lève pour tenir la pince.
  if (!pawn) {
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.175, 0.88, 0.0);
      const elbowAt = V(s * 0.05, -0.14, 0.12);
      const up = new Parts();
      up.between(V(0, 0, 0), elbowAt, 0.048, mm.jacket, 12);
      up.add(new THREE.SphereGeometry(0.052, 12, 10), mm.jacket);
      up.add(new THREE.SphereGeometry(0.048, 12, 10), mm.jacket, elbowAt);
      up.build(shoulder, true);
      const elbow = new THREE.Group();
      elbow.position.copy(elbowAt);
      const wristAt = V(-s * 0.06, TABLE_Y + 0.035 - 0.74, 0.24);
      const lo = new Parts();
      lo.between(V(0, 0, 0), wristAt, 0.042, mm.jacket, 12);
      const cuffRot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), wristAt.clone().normalize()));
      lo.add(new THREE.TorusGeometry(0.038, 0.012, 6, 14), c.white, wristAt.clone().multiplyScalar(0.92), cuffRot);
      lo.add(new THREE.SphereGeometry(0.048, 14, 10), mm.skin, wristAt.clone().add(V(0, -0.005, 0.03)), [0, 0, 0], V(0.95, 0.65, 1.15));
      lo.add(new THREE.CapsuleGeometry(0.014, 0.03, 3, 6), mm.skin, wristAt.clone().add(V(-s * 0.04, 0.0, 0.02)), [0.3, 0, s * 0.9]);
      lo.build(elbow, true);
      const hand = new THREE.Object3D();
      hand.position.copy(wristAt).add(V(0, 0, 0.03));
      elbow.add(hand);
      shoulder.add(elbow);
      shoulder.userData = { hand, elbow };
      torso.add(shoulder);
      a.arms.push(shoulder);
    }
  }

  g.add(buildChair());
  return a;
}

// Chapeaux révélés à la fin : casquette de Sherlock ou haut-de-forme de Moriarty.
export function roleHat(role) {
  const hat = new THREE.Group();
  const p = new Parts();
  if (role === 'sherlock') {
    const tweed = once('deer', () => std({ map: TX.texture(TX.fabric('#a88452', 'carreaux', 12)), roughness: 0.95 }));
    p.add(new THREE.SphereGeometry(0.18, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), tweed, V(0, 0, 0), [0, 0, 0], V(1.02, 0.85, 1.1));
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 18, 1, false, 0, Math.PI), tweed, V(0, 0.005, s * 0.17), [s * 0.25, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    for (const s of [-1, 1]) p.add(new THREE.SphereGeometry(0.06, 10, 8), tweed, V(s * 0.15, 0.08, 0), [0, 0, s * 0.5], V(0.3, 1, 0.8));
    p.add(new THREE.SphereGeometry(0.018, 8, 6), tweed, V(0, 0.155, 0));
    hat.position.y = 0.1;
  } else {
    const black = once('silk', () => std({ color: 0x121016, roughness: 0.35 }));
    p.add(new THREE.CylinderGeometry(0.135, 0.12, 0.28, 28), black, V(0, 0.14, 0));
    p.add(lathe([[0.11, 0], [0.22, -0.004], [0.24, 0.02], [0.235, 0.03]], 28), black);
    p.add(new THREE.CylinderGeometry(0.124, 0.122, 0.05, 28, 1, true), common().red, V(0, 0.04, 0));
    hat.position.y = 0.13;
  }
  p.build(hat, true);
  return hat;
}

// ---------- Pince coupante ----------

export function buildPincers() {
  const g = new THREE.Group();
  const red = once('grip', () => std({ color: 0xc8302a, roughness: 0.5 }));
  const steel = once('steel', () => std({ color: 0xc0c8d0, metalness: 1, roughness: 0.25 }));
  const jaws = [];
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    const p = new Parts();
    p.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.02, 0), V(s * 0.01, -0.07, 0), V(s * 0.018, -0.14, 0)]), 10, 0.012, 8), steel);
    p.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * 0.004, -0.04, 0), V(s * 0.012, -0.09, 0), V(s * 0.018, -0.15, 0)]), 10, 0.016, 10), red);
    p.add(new THREE.SphereGeometry(0.016, 10, 8), red, V(s * 0.018, -0.15, 0));
    p.add(new THREE.ConeGeometry(0.014, 0.06, 4), steel, V(-s * 0.004, 0.03, 0), [0, Math.PI / 4, -s * 0.12], V(1, 1, 0.5));
    p.build(half);
    half.rotation.z = s * 0.16;
    g.add(half);
    jaws.push(half);
  }
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.032, 12), steel);
  pivot.rotation.x = Math.PI / 2;
  g.add(pivot);
  g.userData.open = (t) => { jaws[0].rotation.z = -0.03 - 0.22 * t; jaws[1].rotation.z = 0.03 + 0.22 * t; };
  g.userData.open(0.6);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// ---------- Bombe au centre de la table ----------

const WIRE_COLORS = [0xd93a30, 0x2f6fc0, 0x3fae5a, 0xf5c33d, 0xf0f0f0, 0xe87a2a, 0x9a4fd0, 0x2a2a2a];

export function buildBomb(n) {
  const g = new THREE.Group();
  g.position.y = TABLE_Y;
  const m = mats();
  const dyn = once('dyn', () => std({ color: 0xb02820, roughness: 0.75 }));
  const paper = once('paper', () => std({ color: 0xe8d8b0, roughness: 0.9 }));
  const p = new Parts();
  const L = 0.22;
  [[0.024, -0.025], [0.024, 0.025], [0.066, 0], [0.066, -0.05], [0.066, 0.05]].forEach(([y, z]) => {
    p.add(new THREE.CylinderGeometry(0.023, 0.023, L, 16), dyn, V(0, y, z), [0, 0, Math.PI / 2]);
    for (const x of [-L / 2, L / 2]) p.add(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 16), paper, V(x, y, z), [0, 0, Math.PI / 2]);
    p.add(new THREE.CylinderGeometry(0.0235, 0.0235, 0.05, 16, 1, true), paper, V(0.05, y, z), [0, 0, Math.PI / 2]);
  });
  for (const x of [-0.065, 0.065]) p.add(new THREE.TorusGeometry(0.062, 0.007, 6, 24), common().dark, V(x, 0.047, 0), [0, Math.PI / 2, 0], V(1, 0.75, 1.05));
  // Réveil : deux cloches et un marteau
  for (const s of [-1, 1]) {
    p.add(new THREE.SphereGeometry(0.022, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.brass, V(s * 0.035, 0.155, 0), [0, 0, s * 0.4]);
    p.between(V(0, 0.145, 0), V(s * 0.03, 0.16, 0), 0.003, m.brass, 4);
  }
  p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 4), m.brass, V(0, 0.16, 0));
  p.build(g, true);

  const screen = TX.bombScreen();
  const scr = new THREE.MeshBasicMaterial({ map: screen });
  const timer = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.11), [scr, scr, m.brass, m.brass, scr, scr]);
  timer.position.y = 0.118;
  timer.castShadow = true;
  g.add(timer);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  led.position.set(0.045, 0.147, 0.045);
  g.add(led);

  const wires = [];
  for (let i = 0; i < n; i++) {
    // Aucun fil côté +z : c'est la face de l'écran tournée vers moi.
    const a = Math.PI / 2 + 0.7 + (i / Math.max(1, n - 1)) * (Math.PI * 2 - 1.4);
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const curve = new THREE.CatmullRomCurve3([
      V(0, 0.118, 0).addScaledVector(dir, 0.05),
      V(0, 0.13, 0).addScaledVector(dir, 0.1),
      V(0, 0.06, 0).addScaledVector(dir, 0.14),
      V(0, 0.045, 0).addScaledVector(dir, 0.075),
    ]);
    const mat = once('wire' + i, () => std({ color: WIRE_COLORS[i % WIRE_COLORS.length], roughness: 0.45 }));
    const half = (t0, t1) => {
      const pts = [];
      for (let k = 0; k <= 8; k++) pts.push(curve.getPoint(t0 + ((t1 - t0) * k) / 8));
      return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0045, 6), mat);
    };
    const w = { a: half(0, 0.47), b: half(0.53, 1), cut: false, at: curve.getPoint(0.5), dir };
    g.add(w.a, w.b);
    wires.push(w);
  }
  return { group: g, screen, led, wires, timer };
}

// ---------- Cartes (recto ou verso selon le côté vu) ----------

let cardGeo = null;
export function cardGeometry() {
  if (!cardGeo) cardGeo = new THREE.PlaneGeometry(CARD_SIZE[0], CARD_SIZE[1]);
  return cardGeo;
}

export function cardMaterial(front, back, bright) {
  const params = { map: front, alphaTest: 0.5, side: THREE.DoubleSide };
  const mat = bright ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial(Object.assign(params, { roughness: 0.55 }));
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.backMap = { value: back };
    shader.fragmentShader = 'uniform sampler2D backMap;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      'vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( backMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) );\n\tdiffuseColor *= sampledDiffuseColor;',
    );
  };
  return mat;
}
