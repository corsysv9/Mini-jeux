// Petits outils de modélisation partagés par le décor, les villageois et le loup.
import * as THREE from '../vendor/three.min.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;

// Matériaux et géométries partagés entre les parties (créés une seule fois).
const cache = {};
export function once(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

// Regroupe des géométries placées puis fusionne par matériau (moins d'appels de dessin).
export class Parts {
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
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    // Toutes les géométries fusionnées doivent avoir les mêmes attributs.
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g = g.applyMatrix4(m);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return this;
  }
  // Pièce allongée entre deux points (bras, bâtons, tiges).
  between(a, b, r, mat, seg, r2) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const geo = new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, dir.length(), seg || 8);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    return this.addMatrix(geo, mat, new THREE.Matrix4().compose(a.clone().addScaledVector(dir, 0.5), q, V(1, 1, 1)));
  }
  geometries() {
    const out = new Map();
    for (const [mat, geos] of this.map) {
      geos.forEach((g) => { Object.keys(g.attributes).forEach((k) => { if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); }); });
      const hasColor = geos.some((g) => g.attributes.color);
      if (hasColor) {
        geos.forEach((g) => {
          if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        });
      }
      out.set(mat, THREE.mergeGeometries(geos));
    }
    return out;
  }
  build(parent, shadow) {
    const out = [];
    for (const [mat, geo] of this.geometries()) {
      const mesh = new THREE.Mesh(geo, mat);
      if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
      parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

export function lathe(points, seg, phiStart, phiLength) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg || 20, phiStart || 0, phiLength === undefined ? TAU : phiLength);
}

// Caillou : icosaèdre cabossé, aplati.
export function rock(r, seed, flat) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const p = geo.attributes.position;
  let s = seed || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const moved = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!moved.has(key)) moved.set(key, 0.75 + rnd() * 0.45);
    const k = moved.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * (flat || 0.7), p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  // Normales à moitié lissées : un caillou arrondi, pas un polyèdre.
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) / (flat || 0.7), p.getZ(i)).normalize();
    w.set(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(0.35).addScaledVector(v, 0.65).normalize();
    n.setXYZ(i, w.x, w.y, w.z);
  }
  return geo;
}

// Vent : fait onduler le haut des arbres et de l'herbe (shader modifié, phase par instance).
export function windy(mat, amount, height, clock) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      #else
        float ph = 0.0;
      #endif
      float bend = pow(max(position.y, 0.0) / ${height.toFixed(2)}, 2.0) * ${amount.toFixed(3)};
      transformed.x += sin(uTime * 1.1 + ph) * bend;
      transformed.z += cos(uTime * 0.8 + ph * 1.3) * bend * 0.6;`,
    );
  };
  return mat;
}
