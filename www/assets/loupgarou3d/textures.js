// Textures du Loup-garou, dessinées au canvas : aucune image à télécharger.
import { rng, texture, reliefTexture, softDot, fabric } from '../timebomb3d/textures.js';

export { rng, texture, reliefTexture, softDot, fabric };

export const CARD_W = 256;
export const CARD_H = 360;
const FONT = "'Outfit', system-ui, sans-serif";
const TAU = Math.PI * 2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Grain : petites taches claires et sombres.
function grain(ctx, w, h, n, alpha, r, size) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * alpha})`;
    const s = (size || 2) * (0.5 + r());
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

// ---------- Bois ----------

// Écorce de pin : plaques brunes séparées de crevasses sombres (couleur + relief).
export function bark(seed) {
  const W = 256;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const [b, bx] = canvas(W, H);
  const r = rng(seed || 7);
  ctx.fillStyle = '#4a3526';
  ctx.fillRect(0, 0, W, H);
  bx.fillStyle = '#808080';
  bx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = r() * H;
    const w = 14 + r() * 26;
    const h = 30 + r() * 70;
    const l = 22 + r() * 18;
    ctx.fillStyle = `hsl(${20 + r() * 14}, ${18 + r() * 14}%, ${l}%)`;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, (r() - 0.5) * 0.2, 0, TAU);
    ctx.fill();
    bx.fillStyle = `rgb(${150 + r() * 80},${150 + r() * 80},${150 + r() * 80})`;
    bx.beginPath();
    bx.ellipse(x, y, w / 2, h / 2, 0, 0, TAU);
    bx.fill();
  }
  // Crevasses verticales
  ctx.strokeStyle = 'rgba(12,8,6,.85)';
  bx.strokeStyle = '#000';
  for (let i = 0; i < 26; i++) {
    let x = r() * W;
    ctx.lineWidth = 1.5 + r() * 3;
    bx.lineWidth = ctx.lineWidth + 2;
    ctx.beginPath();
    bx.beginPath();
    ctx.moveTo(x, -10);
    bx.moveTo(x, -10);
    for (let y = 0; y <= H + 20; y += 20) {
      x += (r() - 0.5) * 14;
      ctx.lineTo(x, y);
      bx.lineTo(x, y);
    }
    ctx.stroke();
    bx.stroke();
  }
  grain(ctx, W, H, 4000, 0.12, r);
  return { color: c, bump: b };
}

// Bouleau : blanc, marques noires horizontales.
export function birch() {
  const [c, ctx] = canvas(128, 512);
  const r = rng(19);
  ctx.fillStyle = '#d8d4c8';
  ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(20,18,16,${0.4 + r() * 0.5})`;
    const y = r() * 512;
    ctx.fillRect(r() * 128, y, 8 + r() * 40, 1.5 + r() * 4);
  }
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = 'rgba(30,26,22,.8)';
    ctx.beginPath();
    ctx.ellipse(r() * 128, r() * 512, 6 + r() * 14, 3 + r() * 8, 0, 0, TAU);
    ctx.fill();
  }
  grain(ctx, 128, 512, 1500, 0.1, r);
  return c;
}

// Bout d'un rondin : cernes du bois et liseré d'écorce.
export function logEnd() {
  const [c, ctx] = canvas(128, 128);
  const r = rng(23);
  ctx.fillStyle = '#3a281c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#b08a5c';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, TAU);
  ctx.fill();
  for (let k = 4; k < 56; k += 3 + r() * 3) {
    ctx.strokeStyle = `rgba(90,60,30,${0.3 + r() * 0.4})`;
    ctx.lineWidth = 1 + r();
    ctx.beginPath();
    ctx.ellipse(64 + (r() - 0.5) * 3, 64 + (r() - 0.5) * 3, k, k * (0.95 + r() * 0.05), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(60,35,20,.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
    ctx.stroke();
  }
  return c;
}

// Bûches du feu : bois carbonisé (couleur) et braises dans les fentes (émission).
export function charred() {
  const [c, ctx] = canvas(256, 256);
  const [e, ex] = canvas(256, 256);
  const r = rng(29);
  ctx.fillStyle = '#16110e';
  ctx.fillRect(0, 0, 256, 256);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, 256, 256);
  // Écailles de charbon
  for (let y = 0; y < 256; y += 14) {
    for (let x = (y / 14) % 2 ? 0 : 10; x < 256; x += 20) {
      ctx.fillStyle = `hsl(20, 8%, ${6 + r() * 10}%)`;
      ctx.fillRect(x + 1, y + 1, 18, 12);
      if (r() < 0.55) {
        const g = ex.createLinearGradient(x, y, x, y + 14);
        g.addColorStop(0, 'rgba(255,90,10,0)');
        g.addColorStop(0.5, `rgba(255,${100 + r() * 90},20,${0.5 + r() * 0.5})`);
        g.addColorStop(1, 'rgba(255,90,10,0)');
        ex.fillStyle = g;
        ex.fillRect(x - 1, y - 1, 22, 3);
        ex.fillRect(x - 1, y, 3, 14);
      }
    }
  }
  // Bout encore brun d'un côté
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(90,60,35,0)');
  g.addColorStop(0.75, 'rgba(90,60,35,0)');
  g.addColorStop(1, 'rgba(90,60,35,.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, 3000, 0.1, r);
  return { color: c, emissive: e };
}

// Lit de braises au centre du foyer.
export function embers() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(31);
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, '#ffcf6a');
  g.addColorStop(0.3, '#ff7a1e');
  g.addColorStop(0.6, '#8a2408');
  g.addColorStop(1, 'rgba(20,10,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 110;
    ctx.fillStyle = r() < 0.6 ? `rgba(30,12,8,${0.5 + r() * 0.5})` : `rgba(255,${150 + r() * 100},60,${0.5 + r() * 0.5})`;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + r() * 7, 0, TAU);
    ctx.fill();
  }
  return c;
}

// ---------- Sol, herbe, fougères, branches ----------

// Sol de la clairière (répété) : terre, aiguilles de pin, brins d'herbe, cailloux.
export function groundDetail() {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [b, bx] = canvas(S, S);
  const r = rng(37);
  ctx.fillStyle = '#4a3c2c';
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#808080';
  bx.fillRect(0, 0, S, S);
  // Taches de terre et de mousse (répétées sur les bords pour raccorder les tuiles)
  const blob = (x, y, rad, col) => {
    for (const dx of [-S, 0, S]) {
      for (const dy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
  };
  for (let i = 0; i < 40; i++) blob(r() * S, r() * S, 30 + r() * 80, r() < 0.5 ? 'rgba(70,80,40,.45)' : 'rgba(40,30,20,.5)');
  // Aiguilles et brindilles
  for (let i = 0; i < 2600; i++) {
    const x = r() * S;
    const y = r() * S;
    const a = r() * TAU;
    const l = 4 + r() * 10;
    ctx.strokeStyle = `hsla(${25 + r() * 20}, ${30 + r() * 30}%, ${18 + r() * 25}%, ${0.5 + r() * 0.5})`;
    ctx.lineWidth = 0.8 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // Brins d'herbe
  for (let i = 0; i < 1400; i++) {
    const x = r() * S;
    const y = r() * S;
    ctx.strokeStyle = `hsla(${70 + r() * 30}, ${30 + r() * 25}%, ${20 + r() * 20}%, ${0.6 + r() * 0.4})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 4, y - 5 - r() * 7);
    ctx.stroke();
  }
  // Cailloux
  for (let i = 0; i < 120; i++) {
    const x = r() * S;
    const y = r() * S;
    const s = 1.5 + r() * 4;
    ctx.fillStyle = `hsl(30, 6%, ${30 + r() * 25}%)`;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.7, r() * 3, 0, TAU);
    ctx.fill();
    bx.fillStyle = '#fff';
    bx.beginPath();
    bx.ellipse(x, y, s, s * 0.7, 0, 0, TAU);
    bx.fill();
  }
  grain(ctx, S, S, 9000, 0.1, r, 1.5);
  grain(bx, S, S, 9000, 0.5, r, 2);
  return { color: c, bump: b };
}

// Touffe d'herbe (transparente) : brins courbés depuis le pied.
export function grassTuft(seed) {
  const [c, ctx] = canvas(128, 128);
  const r = rng(seed || 41);
  for (let i = 0; i < 46; i++) {
    const x0 = 64 + (r() - 0.5) * 40;
    const h = 50 + r() * 74;
    const bend = (r() - 0.5) * 50;
    const w = 2 + r() * 3;
    ctx.fillStyle = `hsl(${68 + r() * 34}, ${35 + r() * 25}%, ${22 + r() * 26}%)`;
    ctx.beginPath();
    ctx.moveTo(x0 - w, 128);
    ctx.quadraticCurveTo(x0 + bend * 0.3, 128 - h * 0.6, x0 + bend, 128 - h);
    ctx.quadraticCurveTo(x0 + bend * 0.3 + w * 0.5, 128 - h * 0.6, x0 + w, 128);
    ctx.fill();
  }
  return c;
}

// Fougère : folioles de part et d'autre d'une tige.
export function fern() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(43);
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI / 2 + (f - 3) * 0.32 + (r() - 0.5) * 0.15;
    const len = 150 + r() * 80;
    ctx.save();
    ctx.translate(128, 250);
    ctx.rotate(a + Math.PI / 2);
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const y = -t * len;
      const bend = t * t * 30 * (f - 3) * 0.3;
      const leaf = (1 - t) * 30 + 6;
      ctx.fillStyle = `hsl(${95 + r() * 20}, ${40 + r() * 15}%, ${24 + t * 16 + r() * 6}%)`;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(bend + s * leaf * 0.5, y, leaf * 0.5, 4.5, s * 0.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#3d5a24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(0, -len / 2, len * 0.09 * (f - 3) * 0.3, -len);
    ctx.stroke();
    ctx.restore();
  }
  return c;
}

// Rameau de sapin vu de dessus : tige centrale (à gauche le tronc), rameaux et aiguilles serrées.
export function branchCard(seed) {
  const W = 256;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  const r = rng(seed || 47);
  ctx.lineCap = 'round';
  const needles = (x0, y0, x1, y1, len, density, light) => {
    const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / density);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const nl = len * (1 - t * 0.45) * (0.7 + r() * 0.5);
      for (const s of [-1, 1]) {
        const na = ang + s * (0.75 + r() * 0.5) - 0.25 * s * t;
        ctx.strokeStyle = `hsl(${118 + r() * 34}, ${28 + r() * 22}%, ${light + r() * 12 + t * 8}%)`;
        ctx.lineWidth = 1.7 + r() * 0.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
        ctx.stroke();
      }
    }
  };
  // Silhouette en fer de lance : rameaux latéraux de plus en plus courts vers la pointe
  const y = H / 2;
  for (let i = 0; i < 11; i++) {
    const t = (i + 0.6) / 11.5;
    const x = 8 + t * (W - 30);
    const s = i % 2 ? 1 : -1;
    const len = (1 - t) * 62 + 14;
    const a = s * (0.75 + r() * 0.3);
    const x1 = x + Math.cos(a) * len * 0.75;
    const y1 = y + Math.sin(a) * len;
    needles(x, y, x1, y1, 11, 2.0, 9);
    ctx.strokeStyle = '#2a1e14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  needles(4, y, W - 12, y, 14, 1.6, 12);
  ctx.strokeStyle = '#33241a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(2, y);
  ctx.lineTo(W - 20, y);
  ctx.stroke();
  return c;
}

// Feuillage de feuillu (chêne) : amas de feuilles, transparent sur les bords.
export function leafCluster(seed) {
  const [c, ctx] = canvas(256, 256);
  const r = rng(seed || 53);
  for (let i = 0; i < 700; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 112;
    const x = 128 + Math.cos(a) * d;
    const y = 128 + Math.sin(a) * d;
    ctx.fillStyle = `hsl(${85 + r() * 35}, ${30 + r() * 25}%, ${12 + r() * 16 + (1 - d / 112) * 8}%)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + r() * 5, 3 + r() * 2.5, r() * 3, 0, TAU);
    ctx.fill();
  }
  return c;
}

// ---------- Ciel ----------

export function moon() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(59);
  const g = ctx.createRadialGradient(118, 116, 10, 128, 128, 100);
  g.addColorStop(0, '#fffdf2');
  g.addColorStop(0.85, '#e8e6da');
  g.addColorStop(1, '#c9c6b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Mers lunaires et cratères
  for (const [x, y, s] of [[100, 95, 34], [150, 120, 28], [120, 160, 22], [170, 80, 16], [80, 140, 14]]) {
    ctx.fillStyle = 'rgba(140,140,150,.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.8, r(), 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = 40 + r() * 176;
    const y = 40 + r() * 176;
    const s = 1 + r() * 5;
    ctx.strokeStyle = 'rgba(120,120,130,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  return c;
}

// Collines lointaines et cimes de sapins sur tout le tour de l'horizon.
export function horizon(W, H) {
  const [c, ctx] = canvas(W, H);
  const r = rng(61);
  const ridge = (base, amp, color, trees, scale) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const pts = [];
    for (let x = 0; x <= W; x += 8) {
      const t = (x / W) * TAU;
      const y = base - amp * (0.5 + 0.3 * Math.sin(t * 2 + scale) + 0.15 * Math.sin(t * 5 + scale * 3) + 0.05 * Math.sin(t * 13));
      pts.push([x, y]);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
    // Petits sapins sur la crête
    for (let i = 0; i < trees; i++) {
      const x = r() * W;
      const p = pts[Math.min(pts.length - 1, Math.round(x / 8))];
      const h = (8 + r() * 14) * scale;
      ctx.beginPath();
      ctx.moveTo(x - h * 0.22, p[1] + 2);
      ctx.lineTo(x, p[1] - h);
      ctx.lineTo(x + h * 0.22, p[1] + 2);
      ctx.fill();
    }
  };
  ridge(H * 0.62, H * 0.42, '#1c2236', 0, 1);
  ridge(H * 0.8, H * 0.3, '#141a2a', 500, 1.6);
  ridge(H * 0.95, H * 0.18, '#0d1220', 900, 2.4);
  return c;
}

// ---------- Fourrure du loup ----------

// Gris-brun sur le dos (haut de la texture), plus clair sous le ventre (bas).
export function fur() {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const r = rng(67);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b2724');
  g.addColorStop(0.35, '#5a524a');
  g.addColorStop(0.7, '#8a8074');
  g.addColorStop(1, '#b8ad9c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const x = r() * W;
    const y = r() * H;
    const l = 5 + r() * 9;
    const a = Math.PI / 2 + (r() - 0.5) * 0.5;
    const light = y / H;
    ctx.strokeStyle = r() < 0.5
      ? `rgba(20,16,14,${0.25 + r() * 0.35})`
      : `rgba(${180 + light * 60},${170 + light * 55},${150 + light * 50},${0.12 + r() * 0.25})`;
    ctx.lineWidth = 1 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return c;
}

// Mèches du pelage, couchées dans le sens du poil (vers le bas de la texture) ; la couleur vient des sommets.
export function furStrands() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const r = rng(71);
  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) {
    const x = r() * S;
    const y = r() * S;
    const l = 6 + r() * 14;
    const v = r() < 0.4 ? 110 + r() * 80 : 225 + r() * 30;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.4})`;
    ctx.lineWidth = 0.8 + r() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 4, y + l * 0.5, x + (r() - 0.5) * 6, y + l);
    ctx.stroke();
  }
  return c;
}

// Densité des poils (valeurs brutes) : chaque couche de fourrure ne garde que les points assez clairs.
export function furNoise() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const r = rng(73);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = Math.pow(r(), 0.8) * 255;
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- Tissus des villageois ----------

// Laine ou lin grossier : trame visible.
export function wool(base, seed) {
  const [c, ctx] = canvas(128, 128);
  const r = rng(seed || 71);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 3) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`;
    ctx.fillRect(0, y, 128, 1);
  }
  for (let x = 0; x < 128; x += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`;
    ctx.fillRect(x, 0, 1, 128);
  }
  grain(ctx, 128, 128, 1400, 0.12, r);
  return c;
}

// ---------- Cartes de rôle ----------

export const ROLE_INFO = {
  wolf: { name: 'Loup-garou', bg: '#5a1418', ink: '#ffd9c8' },
  villager: { name: 'Villageois', bg: '#3a4a2a', ink: '#f2ead0' },
  seer: { name: 'Voyante', bg: '#3a2a6a', ink: '#ece2ff' },
  witch: { name: 'Sorcière', bg: '#1f4a40', ink: '#dff5e8' },
  hunter: { name: 'Chasseur', bg: '#5a3a1a', ink: '#fbe8c8' },
};

function cardFrame(bg) {
  const [c, ctx] = canvas(CARD_W, CARD_H);
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 22);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.38, 10, CARD_W / 2, CARD_H / 2, CARD_H * 0.75);
  g.addColorStop(0, 'rgba(255,240,200,.28)');
  g.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  grain(ctx, CARD_W, CARD_H, 2500, 0.08, rng(73));
  ctx.restore();
  roundRect(ctx, 12, 12, CARD_W - 24, CARD_H - 24, 14);
  ctx.strokeStyle = '#d9a640';
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRect(ctx, 18, 18, CARD_W - 36, CARD_H - 36, 10);
  ctx.strokeStyle = 'rgba(217,166,64,.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return [c, ctx];
}

// Tête de loup hurlant (profil tourné vers la gauche, museau levé).
function wolfHead(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(30, 60);
  ctx.lineTo(20, 20);
  ctx.lineTo(4, -6);
  ctx.lineTo(-10, -30);
  ctx.lineTo(-44, -66);
  ctx.lineTo(-40, -56);
  ctx.lineTo(-26, -34);
  ctx.lineTo(-30, -26);
  ctx.lineTo(-46, -40);
  ctx.lineTo(-30, -14);
  ctx.lineTo(-14, -4);
  ctx.lineTo(-8, 8);
  ctx.lineTo(4, 4);
  ctx.lineTo(10, -4);
  ctx.lineTo(20, -16);
  ctx.lineTo(26, -40);
  ctx.lineTo(34, -12);
  ctx.lineTo(44, 4);
  ctx.lineTo(52, 30);
  ctx.lineTo(50, 60);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoleArt(ctx, role, ink) {
  const cx = CARD_W / 2;
  const cy = 150;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (role === 'wolf') {
    ctx.fillStyle = 'rgba(255,230,190,.9)';
    ctx.beginPath();
    ctx.arc(cx + 22, cy - 36, 48, 0, TAU);
    ctx.fill();
    wolfHead(ctx, cx - 4, cy + 22, 1.15, '#1a0a0a');
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.arc(cx - 12, cy - 4, 3, 0, TAU);
    ctx.fill();
  } else if (role === 'villager') {
    // Maison à colombages et sa fenêtre allumée
    ctx.fillStyle = '#e8d9b0';
    ctx.fillRect(cx - 50, cy - 20, 100, 74);
    ctx.fillStyle = '#4a2a18';
    ctx.beginPath();
    ctx.moveTo(cx - 64, cy - 16);
    ctx.lineTo(cx, cy - 72);
    ctx.lineTo(cx + 64, cy - 16);
    ctx.fill();
    ctx.strokeStyle = '#4a2a18';
    ctx.lineWidth = 5;
    ctx.strokeRect(cx - 50, cy - 20, 100, 74);
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy + 10); ctx.lineTo(cx + 50, cy + 10);
    ctx.moveTo(cx - 50, cy - 20); ctx.lineTo(cx - 20, cy + 10);
    ctx.moveTo(cx + 50, cy - 20); ctx.lineTo(cx + 20, cy + 10);
    ctx.stroke();
    ctx.fillStyle = '#5a3420';
    ctx.fillRect(cx - 14, cy + 20, 28, 34);
    ctx.fillStyle = '#ffc04a';
    ctx.fillRect(cx + 22, cy + 18, 18, 18);
    ctx.fillRect(cx - 40, cy + 18, 18, 18);
    // Fourche
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + 78, cy + 60); ctx.lineTo(cx + 66, cy - 40);
    ctx.moveTo(cx + 56, cy - 38); ctx.lineTo(cx + 76, cy - 42);
    for (const dx of [56, 66, 76]) { ctx.moveTo(cx + dx, cy - 40); ctx.lineTo(cx + dx - 2, cy - 64); }
    ctx.stroke();
  } else if (role === 'seer') {
    // Boule de cristal et œil
    const g = ctx.createRadialGradient(cx - 14, cy - 22, 4, cx, cy - 6, 56);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#b9a2ff');
    g.addColorStop(1, '#4a2aa0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 56, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d9a640';
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy + 62); ctx.lineTo(cx - 32, cy + 40); ctx.lineTo(cx + 32, cy + 40); ctx.lineTo(cx + 46, cy + 62);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6, 30, 15, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a1460';
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + 4, cy - 10, 3.5, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 74, cy - 6 + Math.sin(a) * 74, 2.5, 0, TAU);
      ctx.fill();
    }
  } else if (role === 'witch') {
    // Deux fioles : vie (verte) et mort (violette)
    const bottle = (x, col, tall) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, cy + 20, 32, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - 10, cy - 30 - tall, 20, 40 + tall);
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(x - 12, cy - 42 - tall, 24, 14);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.ellipse(x - 12, cy + 10, 7, 13, 0.4, 0, TAU);
      ctx.fill();
    };
    bottle(cx - 40, '#3fd07a', 10);
    bottle(cx + 40, '#9a3ad0', 0);
    ctx.fillStyle = ink;
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('♥', cx - 40, cy + 30);
    ctx.fillText('☠', cx + 40, cy + 30);
  } else if (role === 'hunter') {
    // Chapeau à plume et fusil
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx - 76, cy + 56); ctx.lineTo(cx + 70, cy - 58);
    ctx.stroke();
    ctx.strokeStyle = '#6a4424';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(cx - 80, cy + 60); ctx.lineTo(cx - 40, cy + 28);
    ctx.stroke();
    ctx.fillStyle = '#3a5a2a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 66, 16, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 38, cy + 4);
    ctx.quadraticCurveTo(cx - 34, cy - 46, cx, cy - 46);
    ctx.quadraticCurveTo(cx + 34, cy - 46, cx + 38, cy + 4);
    ctx.fill();
    ctx.fillStyle = '#8a2a1a';
    ctx.fillRect(cx - 38, cy - 8, 76, 10);
    ctx.fillStyle = '#e8d090';
    ctx.beginPath();
    ctx.moveTo(cx + 26, cy - 6);
    ctx.quadraticCurveTo(cx + 66, cy - 60, cx + 46, cy - 82);
    ctx.quadraticCurveTo(cx + 40, cy - 40, cx + 20, cy - 8);
    ctx.fill();
  }
}

export function roleCard(role) {
  const info = ROLE_INFO[role];
  const [c, ctx] = cardFrame(info.bg);
  drawRoleArt(ctx, role, info.ink);
  ctx.fillStyle = info.ink;
  ctx.font = `800 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.name.toUpperCase(), CARD_W / 2, CARD_H - 62, CARD_W - 50);
  return c;
}

// Dos des cartes : pleine lune au-dessus des sapins (rien qui ressemble à un rôle).
export function cardBack() {
  const [c, ctx] = cardFrame('#1a1830');
  const cx = CARD_W / 2;
  const g = ctx.createRadialGradient(cx, 150, 10, cx, 150, 80);
  g.addColorStop(0, '#fff6d8');
  g.addColorStop(0.6, '#f5d27a');
  g.addColorStop(1, 'rgba(245,184,61,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, 150, 80, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#15122a';
  [[-62, 0.8], [-24, 1.15], [22, 1], [60, 0.75]].forEach(([dx, k]) => {
    for (let i = 0; i < 3; i++) {
      const w = (30 - i * 7) * k;
      const top = 250 - (60 + i * 26) * k;
      ctx.beginPath();
      ctx.moveTo(cx + dx - w, top + 46 * k);
      ctx.lineTo(cx + dx, top);
      ctx.lineTo(cx + dx + w, top + 46 * k);
      ctx.closePath();
      ctx.fill();
    }
  });
  ctx.fillRect(cx - 100, 246, 200, 14);
  ctx.fillStyle = 'rgba(245,184,61,.85)';
  ctx.font = `800 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('THIERCELIEUX', cx, CARD_H - 56);
  return c;
}

// ---------- Étiquettes ----------

// Nom au-dessus de la tête ; rôle et croix si le joueur est mort.
export function nameTag(name, color, role, dead) {
  const [c, ctx] = canvas(512, 160);
  ctx.font = `700 52px ${FONT}`;
  const label = role ? ROLE_INFO[role].name : '';
  const tw = Math.min(400, ctx.measureText(name).width);
  const w = Math.max(tw + 100, label ? 260 : 0);
  const x = (512 - w) / 2;
  const h = label ? 132 : 96;
  roundRect(ctx, x, 14, w, h, 46);
  ctx.fillStyle = role ? `${ROLE_INFO[role].bg}e6` : 'rgba(22,19,31,.82)';
  if (dead) ctx.fillStyle = 'rgba(40,40,46,.85)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = dead ? '#8a8a96' : color;
  ctx.stroke();
  ctx.fillStyle = dead ? '#8a8a96' : color;
  ctx.beginPath();
  ctx.arc(x + 44, 62, 15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dead ? '#c8c8d0' : '#f3effa';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(name, x + 72, 64, w - 92);
  if (label) {
    ctx.font = `600 32px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = dead ? '#b8b8c2' : '#ffe2a8';
    ctx.fillText((dead ? '✝ ' : '') + label, 256, 116);
  }
  return c;
}

// Petit marqueur au-dessus d'une tête : nombre de voix, patte des loups, cible…
export function badge(text, bg, fg) {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.stroke();
  ctx.fillStyle = fg || '#fff';
  ctx.font = `800 62px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  return c;
}

// Empreinte de patte (vote des loups).
export function paw(color) {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(64, 80, 26, 22, 0, 0, TAU);
  ctx.fill();
  for (const [x, y, a] of [[30, 50, -0.4], [52, 32, -0.15], [76, 32, 0.15], [98, 50, 0.4]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 15, a, 0, TAU);
    ctx.fill();
  }
  return c;
}

// Fenêtre allumée d'une maison du village.
export function windowGlow() {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#ffb54a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(30, 0, 4, 64);
  ctx.fillRect(0, 30, 64, 4);
  return c;
}

// Ombre allongée projetée au sol par le feu (sombre au pied, s'estompe au loin).
export function shadowStreak() {
  const [c, ctx] = canvas(64, 256);
  for (let y = 0; y < 256; y++) {
    const t = y / 256;
    const a = Math.pow(t, 0.7) * 0.85;
    const w = 18 + (1 - t) * 10;
    const g = ctx.createLinearGradient(32 - w, 0, 32 + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 64, 1);
  }
  return c;
}
