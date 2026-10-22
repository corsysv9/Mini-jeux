// Textures dessinées au canvas : aucune image à télécharger.
import * as THREE from '../vendor/three.min.js?v=2';

export const CARD_W = 256;
export const CARD_H = 360;
const FONT = "'Outfit', system-ui, sans-serif";

// Hasard reproductible : la même ville et les mêmes briques sur tous les téléphones.
export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function texture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Carte de relief : valeurs brutes, sans conversion de couleurs.
export function reliefTexture(c, repeat) {
  const t = texture(c, repeat);
  t.colorSpace = THREE.NoColorSpace;
  return t;
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

// ---------- Big Ben (silhouette réutilisée sur les cartes et dans la ville) ----------

export function drawBigBen(ctx, cx, base, h, color, face) {
  const w = h * 0.16;
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, base - h * 0.62, w, h * 0.62);
  ctx.fillRect(cx - w * 0.62, base - h * 0.78, w * 1.24, h * 0.17);
  ctx.fillRect(cx - w * 0.5, base - h * 0.86, w, h * 0.08);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.55, base - h * 0.86);
  ctx.lineTo(cx, base - h);
  ctx.lineTo(cx + w * 0.55, base - h * 0.86);
  ctx.fill();
  if (face) {
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, base - h * 0.695, w * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Cartes ----------

function cardBase(bg, border) {
  const [c, ctx] = canvas(CARD_W, CARD_H);
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 24);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.4, 10, CARD_W / 2, CARD_H / 2, CARD_H * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,.18)');
  g.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 14);
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();
  return [c, ctx];
}

function label(ctx, text, y, size, color) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CARD_W / 2, y);
}

function cardBack(title) {
  const [c, ctx] = cardBase('#2b1d3f', '#f5b83d');
  ctx.save();
  roundRect(ctx, 22, 22, CARD_W - 44, CARD_H - 44, 10);
  ctx.clip();
  ctx.strokeStyle = 'rgba(245,184,61,.16)';
  ctx.lineWidth = 2;
  for (let i = -CARD_H; i < CARD_W + CARD_H; i += 22) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - CARD_H, CARD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + CARD_H, CARD_H); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#2b1d3f';
  ctx.beginPath();
  ctx.ellipse(CARD_W / 2, CARD_H / 2, 70, 104, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#f5b83d';
  ctx.stroke();
  drawBigBen(ctx, CARD_W / 2, CARD_H / 2 + 62, 140, '#f5b83d', '#2b1d3f');
  label(ctx, title, CARD_H / 2 + 80, 20, '#f5b83d');
  return c;
}

function cable(ctx, color, cut) {
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(40, 120);
    ctx.bezierCurveTo(110, 40, 150, 230, 216, 150);
  };
  ctx.save();
  if (cut) {
    ctx.beginPath();
    ctx.rect(0, 0, 118, CARD_H);
    ctx.rect(140, 0, CARD_W, CARD_H);
    ctx.clip();
  }
  ctx.strokeStyle = 'rgba(0,0,0,.3)';
  ctx.lineWidth = 22;
  ctx.translate(0, 6);
  path(); ctx.stroke();
  ctx.translate(0, -6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 18;
  path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 5;
  ctx.translate(0, -4);
  path(); ctx.stroke();
  ctx.restore();
  if (cut) {
    ctx.fillStyle = '#e8a25a';
    ctx.fillRect(112, 128, 10, 14);
    ctx.fillRect(136, 128, 10, 14);
    ctx.strokeStyle = '#fff6c2';
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(129 + Math.cos(a) * 10, 128 + Math.sin(a) * 10);
      ctx.lineTo(129 + Math.cos(a) * 26, 128 + Math.sin(a) * 26);
      ctx.stroke();
    }
  }
}

function cardWire() {
  const [c, ctx] = cardBase('#2f6fc0', '#ffffff');
  cable(ctx, '#f5b83d', true);
  label(ctx, 'FIL', 262, 64, '#ffffff');
  label(ctx, 'désamorçage', 312, 22, 'rgba(255,255,255,.85)');
  return c;
}

function cardSafe() {
  const [c, ctx] = cardBase('#d8d0c0', '#6d6478');
  cable(ctx, '#7b7486', false);
  label(ctx, 'SANS', 250, 46, '#3a3446');
  label(ctx, 'DANGER', 296, 46, '#3a3446');
  return c;
}

function cardBomb() {
  const [c, ctx] = cardBase('#c83a36', '#ffd9a0');
  ctx.save();
  ctx.translate(CARD_W / 2, 150);
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 62 : 112;
    const a = (i / 24) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawBigBen(ctx, CARD_W / 2, 236, 190, '#2a1414', '#ffe9a8');
  label(ctx, 'BIG BEN', 286, 46, '#ffffff');
  label(ctx, 'BOUM !', 326, 24, '#ffe0c0');
  return c;
}

function deerstalker(ctx, x, y) {
  ctx.fillStyle = '#c89a5a';
  ctx.beginPath();
  ctx.ellipse(x, y, 74, 52, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 96, y - 4, 192, 16);
  ctx.strokeStyle = '#7d5a2c';
  ctx.lineWidth = 3;
  for (let i = -60; i <= 60; i += 20) {
    ctx.beginPath(); ctx.moveTo(x + i, y - 46); ctx.lineTo(x + i * 1.1, y + 8); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x - 74, y - 20); ctx.lineTo(x + 74, y - 20); ctx.stroke();
  ctx.fillStyle = '#5b3d1c';
  ctx.beginPath(); ctx.arc(x, y - 52, 8, 0, Math.PI * 2); ctx.fill();
}

function cardRole(role) {
  const sherlock = role === 'sherlock';
  const [c, ctx] = cardBase(sherlock ? '#2f6fc0' : '#c83a36', '#ffffff');
  if (sherlock) {
    deerstalker(ctx, CARD_W / 2, 128);
    // pipe
    ctx.strokeStyle = '#3a2414';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(84, 190); ctx.quadraticCurveTo(130, 205, 160, 186); ctx.stroke();
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(152, 160, 28, 32);
    // loupe
    ctx.strokeStyle = '#f5b83d';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(190, 64, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(206, 80); ctx.lineTo(226, 100); ctx.stroke();
  } else {
    ctx.fillStyle = '#16131f';
    ctx.fillRect(CARD_W / 2 - 56, 46, 112, 110);
    ctx.fillRect(CARD_W / 2 - 92, 150, 184, 16);
    ctx.fillStyle = '#c83a36';
    ctx.fillRect(CARD_W / 2 - 56, 128, 112, 12);
    // moustache
    ctx.fillStyle = '#16131f';
    ctx.beginPath();
    ctx.moveTo(CARD_W / 2, 196);
    ctx.bezierCurveTo(CARD_W / 2 - 30, 176, CARD_W / 2 - 70, 216, CARD_W / 2 - 84, 190);
    ctx.bezierCurveTo(CARD_W / 2 - 70, 232, CARD_W / 2 - 24, 218, CARD_W / 2, 206);
    ctx.bezierCurveTo(CARD_W / 2 + 24, 218, CARD_W / 2 + 70, 232, CARD_W / 2 + 84, 190);
    ctx.bezierCurveTo(CARD_W / 2 + 70, 216, CARD_W / 2 + 30, 176, CARD_W / 2, 196);
    ctx.fill();
  }
  label(ctx, sherlock ? 'SHERLOCK' : 'MORIARTY', 266, 40, '#ffffff');
  label(ctx, sherlock ? 'Trouve tous les fils' : 'Fais sauter Big Ben', 312, 21, 'rgba(255,255,255,.9)');
  return c;
}

export function cardTextures() {
  return {
    back: texture(cardBack('TIME BOMB')),
    roleBack: texture(cardBack('RÔLE')),
    wire: texture(cardWire()),
    safe: texture(cardSafe()),
    bomb: texture(cardBomb()),
    sherlock: texture(cardRole('sherlock')),
    moriarty: texture(cardRole('moriarty')),
  };
}

// ---------- Matériaux de la salle ----------

// Briques et leur relief (carte de bosses) dessinés avec le même tirage.
export function bricks() {
  const [c, ctx] = canvas(512, 512);
  const [b, bx] = canvas(512, 512);
  const r = rng(7);
  ctx.fillStyle = '#2a201b';
  ctx.fillRect(0, 0, 512, 512);
  bx.fillStyle = '#000';
  bx.fillRect(0, 0, 512, 512);
  const bw = 64;
  const bh = 32;
  for (let y = 0; y < 512; y += bh) {
    const off = (y / bh) % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 512 + bw; x += bw) {
      const l = 28 + r() * 16;
      ctx.fillStyle = `hsl(${16 + r() * 16}, ${20 + r() * 20}%, ${l}%)`;
      ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.2})`;
      ctx.fillRect(x + off + 2, y + bh / 2, bw - 4, bh / 2 - 2);
      ctx.fillStyle = `rgba(255,220,190,${r() * 0.06})`;
      ctx.fillRect(x + off + 2, y + 2, bw - 4, 4);
      const g = bx.createLinearGradient(0, y, 0, y + bh);
      const v = 150 + r() * 80;
      g.addColorStop(0, `rgb(${v},${v},${v})`);
      g.addColorStop(1, `rgb(${v - 40},${v - 40},${v - 40})`);
      bx.fillStyle = g;
      bx.fillRect(x + off + 3, y + 3, bw - 6, bh - 6);
    }
  }
  for (let i = 0; i < 4000; i++) {
    const x = r() * 512;
    const y = r() * 512;
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,230,200'},${r() * 0.1})`;
    ctx.fillRect(x, y, 2, 2);
    bx.fillStyle = `rgba(0,0,0,${r() * 0.35})`;
    bx.fillRect(x, y, 3, 3);
  }
  return { color: c, bump: b };
}

export function planks(hue, light, sat) {
  const [c, ctx] = canvas(512, 512);
  const [b, bx] = canvas(512, 512);
  const r = rng(11 + hue + light);
  const pw = 64;
  bx.fillStyle = '#fff';
  bx.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += pw) {
    const l = light + r() * 6;
    ctx.fillStyle = `hsl(${hue}, ${sat || 42}%, ${l}%)`;
    ctx.fillRect(x, 0, pw, 512);
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = `hsla(${hue}, ${sat || 40}%, ${l - 5 - r() * 7}%, .55)`;
      ctx.lineWidth = 0.8 + r() * 2;
      ctx.beginPath();
      const gx = x + 4 + r() * (pw - 8);
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + r() * 10 - 5, 170, gx + r() * 10 - 5, 340, gx + r() * 6 - 3, 512);
      ctx.stroke();
    }
    if (r() < 0.4) {
      ctx.fillStyle = `hsla(${hue}, 45%, ${l - 10}%, .7)`;
      ctx.beginPath();
      ctx.ellipse(x + pw / 2, r() * 512, 5, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(x, 0, 2, 512);
    bx.fillStyle = '#000';
    bx.fillRect(x, 0, 3, 512);
    const cut = r() * 512;
    ctx.fillRect(x, cut, pw, 2);
    bx.fillRect(x, cut, pw, 3);
  }
  return { color: c, bump: b };
}

// Tissu : tweed, rayures ou uni texturé.
export function fabric(base, kind, seed) {
  const [c, ctx] = canvas(128, 128);
  const r = rng(seed || 3);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  if (kind === 'rayures') {
    for (let x = 0; x < 128; x += 16) {
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(x, 0, 2, 128);
    }
  } else if (kind === 'carreaux') {
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(x, 0, 8, 128);
      ctx.fillRect(0, x, 128, 8);
      ctx.fillStyle = 'rgba(255,220,160,.12)';
      ctx.fillRect(x + 16, 0, 2, 128);
      ctx.fillRect(0, x + 16, 128, 2);
    }
  }
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.09})`;
    ctx.fillRect(r() * 128, r() * 128, 2, 1);
  }
  return c;
}

// Velours capitonné des fauteuils.
export function velvet() {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#6a1a2c');
  g.addColorStop(1, '#4a1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const cx = x * 64 + (y % 2 ? 32 : 0) + 16;
      const cy = y * 64 + 32;
      const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
      rg.addColorStop(0, 'rgba(0,0,0,.45)');
      rg.addColorStop(0.25, 'rgba(0,0,0,.1)');
      rg.addColorStop(1, 'rgba(255,200,210,.06)');
      ctx.fillStyle = rg;
      ctx.fillRect(cx - 32, cy - 32, 64, 64);
      ctx.fillStyle = '#c9963a';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

export function felt(color) {
  const [c, ctx] = canvas(256, 256);
  const r = rng(5);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`;
    ctx.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  return c;
}

// Feutre de la table avec frise dorée sur le pourtour.
export function tableTop(color) {
  const [c, ctx] = canvas(1024, 1024);
  const r = rng(5);
  ctx.translate(512, 512);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 512, 0, Math.PI * 2); ctx.fill();
  const v = ctx.createRadialGradient(0, 0, 100, 0, 0, 512);
  v.addColorStop(0, 'rgba(255,255,255,.06)');
  v.addColorStop(1, 'rgba(0,0,0,.3)');
  ctx.fillStyle = v;
  ctx.fill();
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`;
    ctx.fillRect(r() * 1024 - 512, r() * 1024 - 512, 2, 2);
  }
  ctx.strokeStyle = 'rgba(214,170,80,.85)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 486, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 462, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 72; i++) {
    ctx.save();
    ctx.rotate((i / 72) * Math.PI * 2);
    ctx.strokeStyle = 'rgba(214,170,80,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -474); ctx.quadraticCurveTo(0, -458, 10, -474);
    ctx.stroke();
    ctx.fillStyle = 'rgba(214,170,80,.8)';
    ctx.beginPath(); ctx.arc(0, -474, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(214,170,80,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i / 8) * Math.PI * 2);
    ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(10, -170); ctx.lineTo(0, -190); ctx.lineTo(-10, -170); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  return c;
}

export function rug() {
  const [c, ctx] = canvas(512, 512);
  ctx.translate(256, 256);
  ctx.fillStyle = '#5a1f2e';
  ctx.beginPath(); ctx.arc(0, 0, 254, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9963a';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(0, 0, 236, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 214, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 32; i++) {
    ctx.save();
    ctx.rotate((i / 32) * Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#c9963a' : '#2f6f6a';
    ctx.beginPath();
    ctx.moveTo(0, 196); ctx.lineTo(10, 180); ctx.lineTo(0, 164); ctx.lineTo(-10, 180);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(201,150,58,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.stroke();
  return c;
}

// ---------- Cadran de Big Ben vu de l'intérieur (chiffres à l'envers) ----------

export function dial(size) {
  const [c, ctx] = canvas(size, size);
  const R = size / 2;
  ctx.translate(R, R);
  ctx.scale(size / 1024, size / 1024);
  const r = 508;
  // Verre opalin très légèrement teinté : on voit la ville à travers.
  ctx.fillStyle = 'rgba(255,232,190,.10)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,236,200,.30)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2); ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2, true); ctx.fill();
  const iron = '#17130f';
  ctx.strokeStyle = iron;
  ctx.fillStyle = iron;
  const ring = (rr, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke(); };
  ring(r - 10, 22);
  ring(r * 0.95, 10);
  ring(r * 0.76, 12);
  ring(r * 0.52, 8);
  ring(r * 0.26, 8);
  // Graduations des minutes
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    ctx.lineWidth = i % 5 ? 4 : 9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.lineTo(Math.cos(a) * r * (i % 5 ? 0.98 : 0.995), Math.sin(a) * r * (i % 5 ? 0.98 : 0.995));
    ctx.stroke();
  }
  // Chiffres romains en miroir (on les voit par derrière)
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.font = `700 70px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  numerals.forEach((n, i) => {
    const a = -(i / 12) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -r * 0.855);
    ctx.scale(-1, 1);
    ctx.fillText(n, 0, 0);
    ctx.restore();
  });
  // Remplage gothique entre les anneaux
  ctx.lineWidth = 7;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26);
    ctx.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
    ctx.stroke();
    const b = a + Math.PI / 24;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(Math.cos(b) * r * 0.64, Math.sin(b) * r * 0.64, r * 0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 7;
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.39, Math.sin(a) * r * 0.39, r * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2); ctx.fill();
  return c;
}

// ---------- Londres la nuit, sur 360° ----------

export function london(W, H) {
  const [c, ctx] = canvas(W, H);
  const r = rng(1859);
  const hz = H * 0.56; // ligne d'horizon
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#070a1f');
  sky.addColorStop(0.55, '#1b1840');
  sky.addColorStop(0.85, '#4a2c55');
  sky.addColorStop(1, '#a35a52');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hz);
  for (let i = 0; i < W / 6; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`;
    const s = r() < 0.1 ? 2.2 : 1.2;
    ctx.fillRect(r() * W, r() * hz * 0.6, s * W / 4096, s * W / 4096);
  }
  const k = W / 4096;
  // Lune
  const mx = W * 0.14;
  const my = hz * 0.32;
  const halo = ctx.createRadialGradient(mx, my, 10 * k, mx, my, 160 * k);
  halo.addColorStop(0, 'rgba(255,244,214,.55)');
  halo.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 160 * k, my - 160 * k, 320 * k, 320 * k);
  ctx.fillStyle = '#fff4d6';
  ctx.beginPath(); ctx.arc(mx, my, 34 * k, 0, Math.PI * 2); ctx.fill();
  // Nuages éclairés par la ville
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = hz * (0.15 + r() * 0.6);
    const w = (200 + r() * 500) * k;
    ctx.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 40},${110 + r() * 40},${0.06 + r() * 0.1})`;
    for (const dx of [0, -W, W]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, w, w * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const glow = ctx.createLinearGradient(0, hz - 140 * k, 0, hz + 10);
  glow.addColorStop(0, 'rgba(255,140,90,0)');
  glow.addColorStop(1, 'rgba(255,150,100,.35)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, hz - 140 * k, W, 150 * k);

  // Sol de la ville sous l'horizon
  const ground = ctx.createLinearGradient(0, hz, 0, H);
  ground.addColorStop(0, '#231a33');
  ground.addColorStop(1, '#0b0912');
  ctx.fillStyle = ground;
  ctx.fillRect(0, hz, W, H - hz);

  const wrap = (fn) => { fn(0); fn(-W); fn(W); };
  const windows = (x, y, w, h, density, warm) => {
    const n = Math.floor((w * h) / (90 * k * k) * density);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = warm
        ? `rgba(255,${190 + r() * 50},${110 + r() * 60},${0.5 + r() * 0.5})`
        : `rgba(${200 + r() * 55},${210 + r() * 45},255,${0.4 + r() * 0.5})`;
      ctx.fillRect(x + r() * w, y + r() * h, 2.2 * k, 3 * k);
    }
  };

  // Couches de bâtiments, du plus lointain au plus proche
  const layers = [
    { y: hz, hMin: 10, hMax: 46, color: '#2a2346', light: 0.35 },
    { y: hz + 6 * k, hMin: 14, hMax: 70, color: '#1f1a35', light: 0.6 },
  ];
  layers.forEach((L) => {
    let x = 0;
    while (x < W) {
      const w = (14 + r() * 40) * k;
      const h = (L.hMin + r() * (L.hMax - L.hMin)) * k;
      const bx = x;
      wrap((dx) => {
        ctx.fillStyle = L.color;
        ctx.fillRect(bx + dx, L.y - h, w + 1, h + 4 * k);
      });
      windows(bx, L.y - h, w, h, L.light, r() < 0.7);
      x += w;
    }
  });

  // Monuments
  const landmark = (u, fn) => wrap((dx) => fn(u * W + dx));
  // The Shard
  landmark(0.32, (x) => {
    ctx.fillStyle = '#2c3352';
    ctx.beginPath();
    ctx.moveTo(x - 34 * k, hz + 4 * k); ctx.lineTo(x - 3 * k, hz - 250 * k); ctx.lineTo(x + 3 * k, hz - 250 * k); ctx.lineTo(x + 30 * k, hz + 4 * k);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,210,255,.5)';
    for (let i = 0; i < 70; i++) ctx.fillRect(x - 26 * k + r() * 52 * k * (1 - i / 80), hz - i * 3.4 * k, 2 * k, 2 * k);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(x - 2 * k, hz - 256 * k, 4 * k, 5 * k);
  });
  // Saint-Paul
  landmark(0.46, (x) => {
    ctx.fillStyle = '#2b2440';
    ctx.fillRect(x - 60 * k, hz - 40 * k, 120 * k, 44 * k);
    ctx.fillRect(x - 30 * k, hz - 70 * k, 60 * k, 30 * k);
    ctx.beginPath(); ctx.ellipse(x, hz - 70 * k, 34 * k, 40 * k, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 4 * k, hz - 130 * k, 8 * k, 22 * k);
    ctx.fillStyle = 'rgba(255,220,160,.35)';
    ctx.beginPath(); ctx.ellipse(x, hz - 72 * k, 30 * k, 34 * k, 0, Math.PI, 0); ctx.fill();
  });
  // Le Gherkin et les tours de la City
  landmark(0.52, (x) => {
    ctx.fillStyle = '#26304d';
    ctx.beginPath(); ctx.ellipse(x, hz - 70 * k, 22 * k, 80 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2b48';
    ctx.fillRect(x + 30 * k, hz - 170 * k, 36 * k, 172 * k);
    ctx.fillRect(x - 80 * k, hz - 130 * k, 30 * k, 132 * k);
    windows(x + 30 * k, hz - 170 * k, 36 * k, 170 * k, 1.6, false);
    windows(x - 80 * k, hz - 130 * k, 30 * k, 130 * k, 1.6, true);
  });
  // Canary Wharf au loin
  landmark(0.6, (x) => {
    [[-40, 150], [0, 190], [40, 140]].forEach(([dx, h]) => {
      ctx.fillStyle = '#28294a';
      ctx.fillRect(x + dx * k - 14 * k, hz - h * k, 28 * k, h * k);
      windows(x + dx * k - 14 * k, hz - h * k, 28 * k, h * k, 1.2, false);
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(x + dx * k - 2 * k, hz - h * k - 6 * k, 4 * k, 4 * k);
    });
    ctx.fillStyle = '#2f3050';
    ctx.beginPath(); ctx.moveTo(x - 16 * k, hz - 190 * k); ctx.lineTo(x, hz - 214 * k); ctx.lineTo(x + 16 * k, hz - 190 * k); ctx.fill();
  });
  // La Tamise et le London Eye
  const riverY = hz + 34 * k;
  ctx.fillStyle = '#0d1430';
  ctx.beginPath();
  ctx.moveTo(W * 0.62, hz + 8 * k);
  ctx.bezierCurveTo(W * 0.72, hz + 40 * k, W * 0.8, H, W * 0.86, H);
  ctx.lineTo(W * 0.98, H);
  ctx.bezierCurveTo(W * 0.92, H * 0.8, W * 0.84, riverY, W * 0.98, hz + 10 * k);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 220; i++) {
    const t = r();
    const x = W * (0.7 + t * 0.22) + (r() - 0.5) * 80 * k;
    const y = hz + 20 * k + t * (H - hz) * 0.8;
    ctx.fillStyle = `rgba(255,${170 + r() * 70},${120 + r() * 80},${0.15 + r() * 0.3})`;
    ctx.fillRect(x, y, (6 + r() * 20) * k, 1.5 * k);
  }
  // pont de Westminster
  ctx.fillStyle = '#1a1830';
  ctx.fillRect(W * 0.68, hz + 52 * k, W * 0.2, 9 * k);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(255,214,140,.9)';
    ctx.fillRect(W * 0.68 + (i / 40) * W * 0.2, hz + 48 * k, 2.5 * k, 3 * k);
  }
  landmark(0.79, (x) => {
    const cy = hz - 40 * k;
    const R = 120 * k;
    ctx.strokeStyle = 'rgba(120,170,255,.85)';
    ctx.lineWidth = 3.5 * k;
    ctx.beginPath(); ctx.arc(x, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2 * k;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      ctx.fillStyle = 'rgba(200,225,255,.95)';
      ctx.fillRect(x + Math.cos(a) * R - 3 * k, cy + Math.sin(a) * R - 3 * k, 6 * k, 6 * k);
    }
    ctx.strokeStyle = 'rgba(60,70,110,.9)';
    ctx.lineWidth = 6 * k;
    ctx.beginPath(); ctx.moveTo(x - 40 * k, hz + 90 * k); ctx.lineTo(x, cy); ctx.lineTo(x + 40 * k, hz + 90 * k); ctx.stroke();
  });
  // Abbaye de Westminster
  landmark(0.06, (x) => {
    ctx.fillStyle = '#231d36';
    ctx.fillRect(x - 70 * k, hz - 30 * k, 140 * k, 50 * k);
    [-40, 40].forEach((dx) => {
      ctx.fillRect(x + dx * k - 12 * k, hz - 100 * k, 24 * k, 80 * k);
      ctx.beginPath(); ctx.moveTo(x + dx * k - 14 * k, hz - 100 * k); ctx.lineTo(x + dx * k, hz - 124 * k); ctx.lineTo(x + dx * k + 14 * k, hz - 100 * k); ctx.fill();
    });
    windows(x - 70 * k, hz - 30 * k, 140 * k, 40 * k, 0.8, true);
  });
  // Tour de la BBC (BT Tower)
  landmark(0.94, (x) => {
    ctx.fillStyle = '#2a2a48';
    ctx.fillRect(x - 6 * k, hz - 200 * k, 12 * k, 204 * k);
    ctx.fillRect(x - 12 * k, hz - 190 * k, 24 * k, 40 * k);
    ctx.fillStyle = 'rgba(150,200,255,.9)';
    ctx.fillRect(x - 12 * k, hz - 176 * k, 24 * k, 3 * k);
  });

  // Toits du Parlement juste en dessous de nous
  ctx.fillStyle = '#120f1d';
  let x = 0;
  while (x < W) {
    const w = (30 + r() * 60) * k;
    const top = hz + (60 + r() * 50) * k;
    const bx = x;
    wrap((dx) => {
      ctx.fillRect(bx + dx, top, w + 1, H - top);
      if (r() < 0.6) {
        for (let s = 0; s < 3; s++) {
          const sx = bx + dx + (s + 0.5) * (w / 3);
          ctx.beginPath(); ctx.moveTo(sx - 4 * k, top); ctx.lineTo(sx, top - (14 + r() * 20) * k); ctx.lineTo(sx + 4 * k, top); ctx.fill();
        }
      }
    });
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(255,${180 + r() * 50},110,${0.5 + r() * 0.5})`;
      ctx.fillRect(bx + r() * w, top + (8 + r() * 60) * k, 3 * k, 6 * k);
    }
    ctx.fillStyle = '#120f1d';
    x += w;
  }
  return c;
}

// ---------- Étiquettes, écran de la bombe, particules ----------

export function nameTag(name, color, role) {
  const [c, ctx] = canvas(512, 128);
  ctx.font = `700 54px ${FONT}`;
  const tw = Math.min(400, ctx.measureText(name).width);
  const w = tw + 110;
  const x = (512 - w) / 2;
  roundRect(ctx, x, 14, w, 100, 50);
  ctx.fillStyle = role === 'sherlock' ? 'rgba(47,111,192,.92)' : role === 'moriarty' ? 'rgba(200,58,54,.92)' : 'rgba(22,19,31,.82)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x + 46, 64, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f3effa';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 76, 66, 400);
  return c;
}

export function bombScreen() {
  const [c, ctx] = canvas(256, 128);
  const t = texture(c);
  t.draw = (text, color) => {
    ctx.fillStyle = '#100808';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = `800 84px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,60,40,.12)';
    ctx.fillText('88:88', 128, 68);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 68);
    ctx.shadowBlur = 0;
    t.needsUpdate = true;
  };
  t.draw('00:00', '#ff3b2f');
  return t;
}

export function softDot() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texture(c);
}
