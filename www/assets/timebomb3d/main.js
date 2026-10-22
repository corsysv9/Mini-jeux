// Time Bomb en 3D : la salle des horloges de Big Ben, vue à la 1ère personne.
// Le serveur reste la référence ; cette scène rejoue à son rythme les cartes révélées.
import * as THREE from '../vendor/three.min.js?v=2';
import * as M from './models.js?v=2';
import * as TX from './textures.js?v=2';
import { createAudio } from './audio.js?v=2';
import { createFx } from './fx.js?v=2';

const TAU = Math.PI * 2;
const COLORS = ['#7a4fd0', '#2f7d8a', '#a3532a', '#3f7d4e', '#2f5d8a', '#a33a6b', '#6b6b2a', '#8a4f2f'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const Y = new THREE.Vector3(0, 1, 0);
const EASE = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};
// Le paquet flotte au-dessus de la bombe pendant les distributions.
const DECK = new THREE.Vector3(0, M.TABLE_Y + 0.34, 0);
const CARD_TITLES = { wire: ['Un fil !', 'blue'], safe: ['Sans danger', ''], bomb: ['BIG BEN !', 'red'] };
const TEMPO = [1, 0.85, 0.7, 0.55];

function flatQuat(angle, faceUp, q) {
  q = q || new THREE.Quaternion();
  q.setFromAxisAngle(Y, angle);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  if (!faceUp) q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
  return q;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* non pris en charge */ }
}

export function createTimeBomb3D(opts) {
  const options = Object.assign({ style: 'victorien', table: 'feutre' }, opts || {});
  const high = options.quality ? options.quality === 'high' : !((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3);

  const container = document.createElement('div');
  container.id = 'tb3d';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL indisponible');
  }
  document.body.appendChild(container);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  // Calques HTML : éclair blanc de l'explosion et légende des cartes révélées.
  const flashEl = document.createElement('div');
  flashEl.className = 'tb3d-flash';
  const captionEl = document.createElement('div');
  captionEl.className = 'tb3d-caption';
  container.append(flashEl, captionEl);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a1f);
  scene.environment = M.environment(renderer);
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 120);
  camera.rotation.order = 'YXZ';
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  const audio = createAudio();
  const fx = createFx(scene, high);

  const cards = TX.cardTextures();
  Object.values(cards).forEach((t) => { t.anisotropy = maxAniso; });
  const faces = { unknown: 'back', wire: 'wire', safe: 'safe', bomb: 'bomb', role: 'roleBack', sherlock: 'sherlock', moriarty: 'moriarty' };
  const cardMats = {};
  const brightMats = {}; // cartes tenues devant les yeux : toujours bien lisibles
  Object.keys(faces).forEach((k) => {
    const back = ['role', 'sherlock', 'moriarty'].includes(k) ? cards.roleBack : cards.back;
    cardMats[k] = M.cardMaterial(cards[faces[k]], back);
    brightMats[k] = M.cardMaterial(cards[faces[k]], back, true);
  });

  const city = M.buildCity(high);
  scene.add(city);

  const S = {
    room: null, g: null, shown: null, me: null, ids: [], n: 0, offset: 0,
    k: 0, // nombre de cartes révélées déjà jouées à l'écran
    gen: 0, anims: [], running: false, taking: null, myCards: {},
    lifted: false, selected: null, selSlot: 0, pending: false,
    yaw: 0, yawTarget: 0, dragging: false, lastDrag: -10, time: 0,
    world: null, active: false, raf: 0, shake: 0, kick: 0,
    introPending: false, endPlayed: false, ended: false, blown: false,
    hemi: 1, lightning: 0, nextThunder: 14, audioReady: false,
    perf: { frames: 0, time: 0, done: !!options.quality },
  };

  // ---------- Petit moteur d'animation (suit l'horloge de la scène) ----------

  function anim(dur, fn, easing) {
    return new Promise((resolve) => {
      S.anims.push({ start: S.time, dur, fn, easing, resolve });
    });
  }
  const wait = (s) => anim(s, null);

  function runAnims() {
    const list = S.anims;
    S.anims = [];
    const keep = [];
    list.forEach((a) => {
      const t = a.dur > 0 ? clamp((S.time - a.start) / a.dur, 0, 1) : 1;
      if (a.fn) a.fn(a.easing ? a.easing(t) : t, t);
      if (t >= 1) a.resolve();
      else keep.push(a);
    });
    S.anims = keep.concat(S.anims);
  }

  // Déplace un objet vers une cible fixe ou recalculée à chaque image (devant la caméra).
  function fly(obj, target, dur, o) {
    o = o || {};
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const s0 = obj.scale.x;
    return anim(dur, (e, t) => {
      const tg = typeof target === 'function' ? target() : target;
      obj.position.lerpVectors(p0, tg.pos, e);
      if (o.arc) obj.position.y += Math.sin(Math.PI * e) * o.arc;
      obj.quaternion.slerpQuaternions(q0, tg.quat, e);
      const s = lerp(s0, tg.scale || 1, e);
      obj.scale.set(s, s, s);
      if (o.step) o.step(e, t);
    }, o.ease || EASE.inOut);
  }

  // Emplacement d'une carte montrée en grand à tous, au centre de l'écran.
  // flip = 0 : face visible ; flip = π : dos visible.
  function eyeSpot(flip) {
    const d = 0.4;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    const scale = Math.min((h * 0.48) / M.CARD_SIZE[1], (w * 0.56) / M.CARD_SIZE[0]);
    camera.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(0, h * 0.07, -d).applyMatrix4(camera.matrixWorld);
    const quat = camera.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(Y, flip || 0));
    return { pos, quat, scale };
  }

  // ---------- Construction d'une partie ----------

  function clearWorld() {
    if (!S.world) return;
    scene.remove(S.world.group);
    S.world.group.traverse((o) => {
      if (o.geometry && o.geometry !== M.cardGeometry()) o.geometry.dispose();
    });
    S.world = null;
  }

  function build(room) {
    clearWorld();
    fx.clear();
    S.gen++;
    S.anims = [];
    S.running = false;
    S.taking = null;
    S.lifted = false;
    S.selected = null;
    S.ended = false;
    S.endPlayed = false;
    S.blown = false;
    S.closeUp = false;
    S.shake = 0;
    S.kick = 0;
    S.hemi = 1;
    city.material.color.setScalar(1);
    setCaption(null);
    const ids = room.players.map((p) => p.id);
    const n = ids.length;
    const W = { group: new THREE.Group(), avatars: {}, hands: {}, roles: {}, revealed: [] };
    S.world = W;
    S.ids = ids;
    S.n = n;
    S.me = room.me;
    S.offset = -ids.indexOf(room.me) * (TAU / n);
    W.R = n >= 7 ? 1.12 : 1.0;
    W.seatR = W.R + 0.3;
    W.handR = W.R - 0.22;
    scene.add(W.group);

    const roomObj = M.buildRoom({ high });
    W.room = roomObj;
    W.group.add(roomObj.group);
    // Une fenêtre-cadran face à moi.
    roomObj.group.rotation.y = angleOf(room.me);

    W.table = M.buildTable(W.R, options.table);
    W.group.add(W.table);
    W.bomb = M.buildBomb(n);
    W.bomb.group.rotation.y = angleOf(room.me);
    W.group.add(W.bomb.group);

    const hemi = new THREE.HemisphereLight(0x7a78c0, 0x2a1810, 1.0);
    W.group.add(hemi);
    const spot = new THREE.SpotLight(0xffc27a, 16, 0, 1.05, 0.65, 1.6);
    spot.position.set(0, 2.62, 0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = high;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.4;
    spot.shadow.camera.far = 4;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    W.group.add(spot, spot.target);
    const fill = new THREE.PointLight(0xffb070, 5, 0, 1.2);
    fill.position.set(0, 2.5, 0);
    W.group.add(fill);
    W.lights = { hemi, spot, fill };

    room.players.forEach((p) => {
      const a = angleOf(p.id);
      W.hands[p.id] = [];
      const color = COLORS[p.id % COLORS.length];
      if (p.id !== room.me) {
        const av = M.buildAvatar(p, color, options.style);
        av.group.position.set(Math.sin(a) * W.seatR, 0, Math.cos(a) * W.seatR);
        av.group.rotation.y = a + Math.PI;
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.texture(TX.nameTag(p.name, color)), depthTest: false, transparent: true, sizeAttenuation: false }));
        tag.scale.set(0.2, 0.05, 1);
        tag.position.y = av.headY + 0.3;
        tag.renderOrder = 10;
        av.group.add(tag);
        av.tag = tag;
        av.name = p.name;
        av.blink = 1 + Math.random() * 3;
        av.phase = Math.random() * TAU;
        W.avatars[p.id] = av;
        W.group.add(av.group);
      }
      const role = new THREE.Mesh(M.cardGeometry(), cardMats.role);
      role.position.copy(DECK);
      role.userData.wait = 0;
      W.roles[p.id] = role;
      W.group.add(role);
    });

    W.pincers = M.buildPincers();
    W.pincers.position.copy(DECK);
    W.group.add(W.pincers);
    W.pincersTarget = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

    W.dust = dust();
    W.group.add(W.dust);
    W.rain = rain(high ? 700 : 300);
    W.group.add(W.rain);

    frame(true);
  }

  function angleOf(id) {
    return S.ids.indexOf(id) * (TAU / S.n) + S.offset;
  }

  function nameOf(id) {
    const p = S.room && S.room.players.find((x) => x.id === id);
    return p ? p.name : '?';
  }

  // ---------- État affiché ----------

  // Reconstitue la partie telle qu'elle était après k cartes révélées : l'écran rejoue
  // les coupes une à une, avec du retard sur le serveur.
  function derive(g, k) {
    const rev = g.revealed;
    const done = k >= rev.length;
    const D = { revealed: rev.slice(0, k), myRole: g.myRole, phase: 'play', winner: null, reason: null, roles: null };
    if (done) {
      Object.assign(D, { round: g.round, cuts: g.cuts, pincers: g.pincers, phase: g.phase, winner: g.winner, reason: g.reason, roles: g.roles || null });
    } else {
      D.round = Math.floor(k / S.n) + 1;
      D.cuts = k % S.n;
      D.pincers = k ? rev[k - 1].from : rev[0].by;
    }
    D.wires = D.revealed.filter((r) => r.card === 'wire').length;
    D.handSizes = {};
    S.ids.forEach((id) => {
      // 5 cartes chacun à la 1ère manche, une de moins à chaque manche.
      D.handSizes[id] = done ? (g.handSizes[id] || 0) : 6 - D.round - D.revealed.filter((r) => r.round === D.round && r.from === id).length;
    });
    D.myCards = myCardsAt(D.round, k);
    return D;
  }

  // Mes cartes à un moment passé de la manche, d'après le dernier état connu de cette manche.
  function myCardsAt(round, k) {
    const known = S.myCards[round];
    if (!known) return null;
    const c = Object.assign({ bomb: 0, wire: 0, safe: 0 }, known.cards);
    const rev = S.g.revealed;
    for (let i = k; i < known.len; i++) if (rev[i].from === S.me && rev[i].round === round) c[rev[i].card]++;
    for (let i = known.len; i < k; i++) if (rev[i].from === S.me && rev[i].round === round) c[rev[i].card]--;
    return c;
  }

  function refresh(mode) {
    const D = derive(S.g, S.k);
    S.shown = D;
    if (mode !== 'nohands') syncHands(D, mode === 'deal');
    placeRevealed(D);
    audio.tempo(TEMPO[D.round - 1] || 1);
    if (!S.running) S.yawTarget = S.selected !== null ? yawToward(S.selected) : (D.pincers === S.me ? 0 : yawToward(D.pincers));
    changed();
  }

  // ---------- Cartes en main ----------

  function syncHands(D, deal) {
    const W = S.world;
    const added = [];
    S.ids.forEach((id) => {
      const hand = W.hands[id];
      const taking = S.taking && S.taking.from === id ? 1 : 0;
      const count = Math.max(0, (D.handSizes[id] || 0) - taking);
      while (hand.length > count) W.group.remove(hand.pop().mesh);
      while (hand.length < count) {
        const mesh = new THREE.Mesh(M.cardGeometry(), cardMats.unknown);
        mesh.position.copy(DECK);
        W.group.add(mesh);
        const c = { mesh, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, speed: 7, wait: 0 };
        hand.push(c);
        added.push({ c, id, j: hand.length - 1 });
      }
      if (id === S.me) {
        const types = myTypes(D);
        hand.forEach((c, i) => { c.type = (types && types[i]) || 'unknown'; });
      }
    });
    if (deal && added.length) {
      // Distribution façon croupier : une carte par joueur, tour après tour.
      added.sort((a, b) => a.j - b.j || S.ids.indexOf(a.id) - S.ids.indexOf(b.id));
      added.forEach((x, i) => { x.c.wait = S.time + 0.1 + i * 0.055; x.c.speed = 9; });
      audio.deal(added.length);
    }
    return 0.7 + added.length * 0.055;
  }

  function myTypes(D) {
    if (!D.myCards) return null;
    const c = Object.assign({}, D.myCards);
    if (S.taking && S.taking.from === S.me && c[S.taking.card] > 0) c[S.taking.card]--;
    const out = [];
    ['bomb', 'wire', 'safe'].forEach((t) => { for (let i = 0; i < (c[t] || 0); i++) out.push(t); });
    return out;
  }

  const tmpQ = new THREE.Quaternion();
  function layoutCards() {
    const W = S.world;
    const arc = (TAU * W.handR) / S.n;
    S.ids.forEach((id) => {
      const hand = W.hands[id];
      const a = angleOf(id);
      const u = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const c = hand.length;
      const step = Math.min(0.135, (arc * 0.86) / (c + 1.4));
      const mine = id === S.me;
      hand.forEach((card, k) => {
        if (card.flying) return;
        if (S.time < card.wait) {
          card.pos.copy(DECK);
          card.pos.y += k * 0.001;
          flatQuat(a, false, card.quat);
          card.scale = 1;
          card.inCamera = false;
          return;
        }
        // Mes cartes et ma carte rôle ne se montrent jamais en même temps.
        if (mine && S.lifted === 'cards') return fanSpot(card, k, c);
        const off = (k - (c - 1) / 2) * step + step * 0.6;
        card.pos.copy(u).multiplyScalar(W.handR).addScaledVector(t, off);
        card.pos.y = M.TABLE_Y + 0.003 + k * 0.0004;
        if (S.selected === id && S.selSlot === k) card.pos.y += 0.08;
        flatQuat(a, false, card.quat);
        card.scale = 1;
        card.inCamera = false;
      });
      const role = W.roles[id];
      if (role.userData.flying) return;
      if (S.time < role.userData.wait) {
        role.userData.target = { pos: DECK, quat: flatQuat(a, false), scale: 1 };
      } else if (mine && S.lifted === 'role') {
        const spot = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
        fanSpot(spot, 0, 1);
        role.userData.target = spot;
        role.userData.type = S.g.myRole;
      } else {
        const off = (-(c - 1) / 2 - 1) * step - 0.01 + step * 0.6;
        const pos = new THREE.Vector3().copy(u).multiplyScalar(W.handR).addScaledVector(t, off);
        pos.y = M.TABLE_Y + 0.003;
        role.userData.target = { pos, quat: flatQuat(a, !!role.userData.faceUp), scale: 1 };
        if (!role.userData.faceUp) role.userData.type = mine ? S.g.myRole : 'role';
      }
    });
  }

  // Éventail de mes cartes devant les yeux (coordonnées monde calculées depuis la caméra).
  function fanSpot(card, i, total) {
    const d = 0.42;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    const scale = Math.min(1.25, (w * 0.92) / (M.CARD_SIZE[0] + (total - 1) * M.CARD_SIZE[0] * 0.58));
    const step = M.CARD_SIZE[0] * 0.58 * scale;
    const x = (i - (total - 1) / 2) * step;
    const local = new THREE.Vector3(x, -h * 0.08 - Math.abs(x) * 0.18, -d - i * 0.002);
    camera.updateWorldMatrix(true, false);
    card.pos.copy(local).applyMatrix4(camera.matrixWorld);
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -x * 1.6);
    card.quat.copy(camera.getWorldQuaternion(tmpQ)).multiply(rot);
    card.scale = scale;
    card.inCamera = true;
  }

  function followCards(dt) {
    const W = S.world;
    const step = (obj, target, speed) => {
      const k = damp(speed, dt);
      obj.position.lerp(target.pos, k);
      obj.quaternion.slerp(target.quat, k);
      const s = lerp(obj.scale.x, target.scale || 1, k);
      obj.scale.set(s, s, s);
    };
    S.ids.forEach((id) => {
      W.hands[id].forEach((c) => {
        if (c.flying) return;
        c.mesh.material = (c.inCamera ? brightMats : cardMats)[c.type || 'unknown'];
        step(c.mesh, c, c.inCamera ? 14 : c.speed);
      });
      const role = W.roles[id];
      const t = role.userData.target;
      if (t && !role.userData.flying) {
        role.material = (t.inCamera ? brightMats : cardMats)[role.userData.type || 'role'];
        step(role, t, 9);
      }
    });
  }

  // Carte à couper : la place visée chez les autres ; chez moi, une carte du bon type.
  function pickSlot(r, hand) {
    const want = typeof r.slot === 'number' ? clamp(r.slot, 0, hand.length - 1) : Math.floor(hand.length / 2);
    if (r.from !== S.me) return want;
    let best = -1;
    hand.forEach((c, i) => {
      if (c.type === r.card && (best < 0 || Math.abs(i - want) < Math.abs(best - want))) best = i;
    });
    return best < 0 ? want : best;
  }

  // ---------- Cartes révélées au centre ----------

  function revealedSpot(i, r) {
    const rev = S.g.revealed;
    const a0 = angleOf(S.me);
    if (r.card === 'wire') {
      const idx = rev.slice(0, i + 1).filter((x) => x.card === 'wire').length - 1;
      const a = a0 + Math.PI + ((idx + 0.5) / S.n) * TAU;
      const rr = 0.34;
      return {
        pos: new THREE.Vector3(Math.sin(a) * rr, M.TABLE_Y + 0.002, Math.cos(a) * rr),
        quat: flatQuat(a0, true),
      };
    }
    const idx = rev.slice(0, i + 1).filter((x) => x.card !== 'wire').length - 1;
    const rnd = TX.rng(31 + i * 7);
    const a = a0 + 0.62 + (rnd() - 0.5) * 0.25;
    const rr = 0.58 + (rnd() - 0.5) * 0.05;
    const q = flatQuat(a0 + (rnd() - 0.5) * 0.7, true);
    return { pos: new THREE.Vector3(Math.sin(a) * rr, M.TABLE_Y + 0.004 + idx * 0.0012, Math.cos(a) * rr), quat: q };
  }

  function placeRevealed(D) {
    const W = S.world;
    if (S.blown) return;
    W.revealed.forEach((m) => W.group.remove(m));
    W.revealed = [];
    D.revealed.forEach((r, i) => {
      const m = new THREE.Mesh(M.cardGeometry(), cardMats[r.card]);
      const spot = revealedSpot(i, r);
      m.position.copy(spot.pos);
      m.quaternion.copy(spot.quat);
      W.group.add(m);
      W.revealed.push(m);
    });
    W.bomb.wires.forEach((w, i) => setWireCut(w, i < D.wires));
    updateBombScreen(D);
  }

  function setWireCut(w, cut) {
    w.cut = cut;
    w.a.position.set(0, 0, 0);
    w.b.position.set(0, 0, 0);
    if (cut) {
      w.a.position.y = 0.004;
      w.b.position.y = -0.006;
      w.a.position.addScaledVector(w.dir, -0.003);
      w.b.position.addScaledVector(w.dir, 0.005);
    }
  }

  // Compte à rebours : coupes restantes avant la fin de la 4e manche.
  function updateBombScreen(D) {
    if (S.ended || S.endPlayed) return;
    const left = Math.max(0, 4 * S.n - ((D.round - 1) * S.n + D.cuts));
    S.world.bomb.screen.draw(`00:${String(left).padStart(2, '0')}`, '#ff3b2f');
  }

  // ---------- Pince ----------

  function placePincers(dt) {
    const W = S.world;
    const p = W.pincers;
    const holder = p.userData.flying || !S.shown ? null : S.shown.pincers;
    Object.keys(W.avatars).forEach((id) => { W.avatars[id].raise = Number(id) === holder ? 1 : 0; });
    if (holder === null) return;
    const tgt = W.pincersTarget;
    if (holder === S.me) {
      const a = angleOf(S.me);
      const u = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      tgt.pos.copy(u).multiplyScalar(W.R - 0.02).addScaledVector(t, 0.26);
      tgt.pos.y = M.TABLE_Y + 0.07;
      tgt.quat.setFromEuler(new THREE.Euler(-1.1, a + 0.5, 0, 'YXZ'));
    } else if (W.avatars[holder]) {
      const av = W.avatars[holder];
      const arm = av.arms[1];
      if (arm) {
        arm.userData.hand.getWorldPosition(tgt.pos);
        tgt.pos.y += 0.06;
      } else {
        tgt.pos.set(0.16, 1.0, 0.3).applyMatrix4(av.group.matrixWorld);
      }
      av.group.getWorldQuaternion(tgt.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, -0.5)));
    }
    const k = damp(8, dt);
    p.position.lerp(tgt.pos, k);
    p.quaternion.slerp(tgt.quat, k);
  }

  // ---------- Caméra ----------

  function frame(snap) {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const t = clamp((1.3 - aspect) / 0.8, 0, 1); // 0 : paysage, 1 : portrait
    camera.fov = options.fov ? Number(options.fov) : lerp(52, 70, t);
    camera.updateProjectionMatrix();
    const W = S.world;
    if (!W) return;
    S.view = {
      t,
      dist: W.seatR + lerp(0.75, Number(options.pd || 0.95), t),
      height: lerp(1.45, Number(options.ph || 1.9), t),
      look: new THREE.Vector3(0, M.TABLE_Y + lerp(0.12, 0.02, t), -lerp(0.1, 0.25, t)),
    };
    S.view.pitch = Math.atan2(S.view.look.y - S.view.height, S.view.dist - S.view.look.z);
    if (snap) rig.rotation.y = angleOf(S.me);
  }

  function updateCamera(dt) {
    const v = S.view;
    S.shake *= Math.exp(-2.2 * dt);
    S.kick *= Math.exp(-1.2 * dt);
    const sh = S.shake;
    camera.position.set((Math.random() - 0.5) * sh * 0.08, v.height + (Math.random() - 0.5) * sh * 0.08, v.dist);
    const targetAngle = angleOf(S.me);
    let d = targetAngle - rig.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rig.rotation.y += d * damp(3, dt);
    if (!S.dragging && S.time - S.lastDrag > 3) S.yaw = lerp(S.yaw, S.yawTarget, damp(1.6, dt));
    const sway = Math.sin(S.time * 0.4) * 0.006;
    camera.rotation.set(v.pitch + sway + S.kick * 0.35, S.yaw + Math.sin(S.time * 0.27) * 0.008, (Math.random() - 0.5) * sh * 0.03);
  }

  // ---------- Personnages ----------

  function animateAvatars(dt) {
    const W = S.world;
    const holder = S.shown ? S.shown.pincers : null;
    Object.keys(W.avatars).forEach((key) => {
      const id = Number(key);
      const av = W.avatars[id];
      av.phase += dt;
      // Les étiquettes passent devant tout : on les cache quand une carte est montrée en grand.
      av.tag.visible = !S.closeUp;
      av.blink -= dt;
      const shocked = S.time - (av.shockAt || -9) < 1.2;
      av.eyes.scale.set(shocked ? 1.25 : 1, av.blink < 0.12 && !shocked ? 0.12 : (shocked ? 1.3 : 1), 1);
      if (av.blink < 0) av.blink = 2 + Math.random() * 4;
      // Petit saut de joie, ou sautillement continu quand on a gagné.
      const h = S.time - (av.hopAt || -9);
      let hop = h < 0.45 ? Math.sin((h / 0.45) * Math.PI) * 0.06 : 0;
      if (av.mood === 'cheer') hop = Math.abs(Math.sin(S.time * 4.5 + av.phase)) * 0.05;
      av.torso.position.y = hop;
      av.torso.scale.y = 1 + Math.sin(av.phase * 1.8) * 0.012;
      av.torso.rotation.x = lerp(av.torso.rotation.x, av.mood === 'slump' ? 0.2 : 0, damp(3, dt));
      // Regard : la personne qui a la pince, sinon le centre de la table.
      av.lookTimer = (av.lookTimer || 0) - dt;
      if (av.lookTimer < 0) {
        av.lookTimer = 1.5 + Math.random() * 3;
        const choices = [new THREE.Vector3(0, M.TABLE_Y, 0)];
        if (holder !== null && holder !== id) choices.push(holder === S.me ? camera.getWorldPosition(new THREE.Vector3()) : headPos(holder));
        const others = S.ids.filter((x) => x !== id);
        const o = others[Math.floor(Math.random() * others.length)];
        choices.push(o === S.me ? camera.getWorldPosition(new THREE.Vector3()) : headPos(o));
        av.lookAt = choices[Math.floor(Math.random() * choices.length)];
      }
      if (av.focus) av.lookAt = av.focus;
      if (av.lookAt && !av.blown) {
        const local = av.group.worldToLocal(av.lookAt.clone());
        local.y -= av.headY;
        const yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1);
        let pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.5, 0.6);
        if (av.mood === 'slump') pitch = 0.45;
        if (av.mood === 'cheer') pitch = -0.25;
        av.head.rotation.y = lerp(av.head.rotation.y, av.mood ? 0 : yaw, damp(5, dt));
        av.head.rotation.x = lerp(av.head.rotation.x, pitch, damp(5, dt));
      }
      // Bras : celui qui a la pince la lève ; les gagnants lèvent les deux bras.
      av.arms.forEach((arm, i) => {
        const s = i === 0 ? -1 : 1;
        const cheer = av.mood === 'cheer' ? 1 : 0;
        const raise = i === 1 && !cheer ? (av.raise || 0) : 0;
        arm.userData.raise = lerp(arm.userData.raise || 0, raise, damp(6, dt));
        arm.userData.cheer = lerp(arm.userData.cheer || 0, cheer, damp(5, dt));
        const r = arm.userData.raise;
        const c = arm.userData.cheer;
        const wave = c ? Math.sin(S.time * 6 + i) * 0.15 : 0;
        arm.rotation.x = -0.42 * r - 2.6 * c + wave;
        arm.rotation.z = 0.12 * r - s * 0.3 * c;
        arm.userData.elbow.rotation.x = -0.62 * r + 1.2 * c;
      });
      // Après l'explosion : éjectés au-dessus de Londres, ils flottent doucement.
      if (av.blown) {
        const b = av.blown;
        const e = EASE.out(clamp((S.time - b.t0) / 2.6, 0, 1));
        av.group.position.lerpVectors(b.from, b.to, e);
        av.group.position.y += Math.sin(S.time * 1.3 + av.phase) * 0.06 * e;
        av.group.rotation.y = b.rot + Math.sin(S.time * 0.5 + av.phase) * 0.5 * e + b.spin * (1 - e) * 6;
        av.group.rotation.z = Math.sin(S.time * 0.9 + av.phase) * 0.18 * e;
      }
    });
  }

  function headPos(id) {
    const av = S.world.avatars[id];
    return av.group.position.clone().setY(av.group.position.y + av.headY);
  }

  // ---------- Déroulé d'une coupe ----------

  function setCaption(title, sub, tone, dur) {
    clearTimeout(setCaption.timer);
    if (!title) {
      captionEl.classList.remove('show');
      return;
    }
    captionEl.className = `tb3d-caption show ${tone || ''}`;
    captionEl.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    if (dur) setCaption.timer = setTimeout(() => captionEl.classList.remove('show'), dur * 1000);
  }

  function cutText(r, past) {
    const by = nameOf(r.by);
    const from = nameOf(r.from);
    if (r.by === S.me) return past ? `Tu as coupé chez ${from}` : `Tu coupes chez ${from}…`;
    if (r.from === S.me) return past ? `${by} a coupé chez toi` : `${by} coupe chez toi…`;
    return past ? `${by} a coupé chez ${from}` : `${by} coupe chez ${from}…`;
  }

  async function playReveal(i, gen) {
    const W = S.world;
    const g = S.g;
    const r = g.revealed[i];
    const hand = W.hands[r.from];
    if (!hand || !hand.length) {
      S.k = i + 1;
      refresh();
      return;
    }
    S.lifted = false;
    S.selected = null;
    changed();
    const slot = pickSlot(r, hand);
    const card = hand[slot];
    const mesh = card.mesh;
    const ends = g.phase === 'end' && i === g.revealed.length - 1;

    // 1. La pince part vers la carte visée ; tout le monde regarde.
    S.yawTarget = r.from === S.me ? 0 : yawToward(r.from);
    S.lastDrag = -10;
    setCaption(cutText(r, false), null, 'soft');
    const focus = mesh.position.clone();
    Object.values(W.avatars).forEach((av) => { av.focus = focus; });
    const p = W.pincers;
    p.userData.flying = true;
    const above = mesh.position.clone().setY(M.TABLE_Y + 0.08);
    const pq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angleOf(r.from) + 0.5, Math.PI, 'YXZ'));
    await fly(p, { pos: above, quat: pq }, 0.75, { arc: 0.22 });
    if (gen !== S.gen) return;

    // 2. Clac !
    await anim(0.1, (e) => p.userData.open(0.6 + 0.4 * e));
    audio.snip();
    await anim(0.08, (e) => p.userData.open(1 - e));
    if (gen !== S.gen) return;
    fx.sparks(above.clone().setY(M.TABLE_Y + 0.02), 12);
    vibrate(15);

    // 3. La carte quitte la main et vient devant les yeux de tous, encore face cachée.
    hand.splice(slot, 1);
    card.flying = true;
    S.taking = { from: r.from, card: r.card };
    mesh.material = cardMats[r.card];
    mesh.scale.setScalar(1);
    await fly(mesh, { pos: mesh.position.clone().setY(M.TABLE_Y + 0.1), quat: mesh.quaternion.clone() }, 0.2, { ease: EASE.out });
    if (gen !== S.gen) return;
    audio.swish();
    S.closeUp = true;
    await fly(mesh, () => eyeSpot(Math.PI), 0.55, { arc: 0.06, step: (e) => { if (e > 0.75) mesh.material = brightMats[r.card]; } });
    if (gen !== S.gen) return;

    // 4. Suspense, puis on la retourne.
    audio.suspense(0.65);
    await anim(0.65, (e) => {
      const s = eyeSpot(Math.PI);
      mesh.position.copy(s.pos);
      mesh.position.x += Math.sin(S.time * 47) * 0.0012 * e;
      mesh.quaternion.copy(s.quat);
      mesh.scale.setScalar(s.scale);
    });
    if (gen !== S.gen) return;
    await anim(0.42, (e) => {
      const s = eyeSpot(Math.PI * (1 - e));
      mesh.position.copy(s.pos);
      mesh.quaternion.copy(s.quat);
      mesh.scale.setScalar(s.scale * (1 + 0.12 * Math.sin(Math.PI * e)));
    }, EASE.inOut);
    if (gen !== S.gen) return;
    ({ wire: audio.wire, safe: audio.safe, bomb: audio.bombCard })[r.card]();
    const [title, tone] = CARD_TITLES[r.card];
    setCaption(title, cutText(r, true), tone, r.card === 'bomb' ? 0 : 2.4);
    if (r.card === 'wire') {
      vibrate(40);
      Object.values(W.avatars).forEach((av) => { av.hopAt = S.time + Math.random() * 0.2; });
    } else if (r.card === 'bomb') {
      vibrate([120, 60, 240]);
      Object.values(W.avatars).forEach((av) => { av.shockAt = S.time; av.hopAt = S.time; });
    }
    await anim(r.card === 'bomb' ? 1.3 : 1.05, () => {
      const s = eyeSpot(0);
      mesh.position.copy(s.pos);
      mesh.quaternion.copy(s.quat);
      mesh.scale.setScalar(s.scale);
    });
    if (gen !== S.gen) return;

    // 5. La carte se pose sur la table ; un fil trouvé est coupé sur la bombe.
    mesh.material = cardMats[r.card];
    S.closeUp = false;
    await fly(mesh, revealedSpot(i, r), 0.55, { arc: 0.1 });
    if (gen !== S.gen) return;
    W.group.remove(mesh);
    Object.values(W.avatars).forEach((av) => { av.focus = null; });
    S.taking = null;
    if (r.card === 'wire') {
      const w = W.bomb.wires[S.shown.wires];
      if (w) {
        fx.sparks(W.bomb.group.localToWorld(w.at.clone()), 24, [0.7, 0.85, 1, 1]);
        audio.snip();
      }
    }
    S.k = i + 1;
    p.userData.flying = false;
    if ((i + 1) % S.n === 0 && !ends) {
      await newRound(gen);
    } else {
      refresh();
    }
  }

  // Fin de manche : Big Ben sonne, les cartes sont ramassées, mélangées et redistribuées.
  async function newRound(gen) {
    const W = S.world;
    const next = Math.floor(S.k / S.n) + 1;
    refresh('nohands');
    setCaption(`Manche ${next}`, 'On ramasse, on mélange, on redistribue', 'gold', 3);
    audio.quarters();
    S.lifted = false;
    const all = [];
    S.ids.forEach((id) => {
      W.hands[id].forEach((c) => { c.flying = true; all.push(c); });
      W.hands[id] = [];
    });
    await Promise.all(all.map((c, j) => wait(j * 0.03).then(() => {
      if (gen !== S.gen) return null;
      return fly(c.mesh, { pos: DECK.clone().setY(DECK.y + j * 0.0012), quat: flatQuat(angleOf(S.me), false) }, 0.45, { arc: 0.12 });
    })));
    if (gen !== S.gen) return;
    audio.swish();
    audio.swish(0.18);
    await anim(0.5, (e) => { all.forEach((c, j) => { c.mesh.position.x = Math.sin(e * Math.PI * 2 + j) * 0.03 * Math.sin(e * Math.PI); }); });
    if (gen !== S.gen) return;
    all.forEach((c) => W.group.remove(c.mesh));
    const d = syncHands(S.shown, true);
    await wait(d);
  }

  // Début de partie : rôles puis cartes distribués, et je découvre mon rôle en secret.
  async function intro(gen) {
    const W = S.world;
    audio.quarters();
    setCaption('Manche 1', 'Distribution des rôles…', 'gold', 2.6);
    S.ids.forEach((id, j) => { W.roles[id].userData.wait = S.time + 0.3 + j * 0.12; });
    audio.deal(S.n);
    await wait(0.6 + S.n * 0.12);
    if (gen !== S.gen) return;
    await wait(syncHands(S.shown, true));
    if (gen !== S.gen) return;
    // Mon rôle, rien que pour moi.
    const role = W.roles[S.me];
    const mine = S.g.myRole;
    role.userData.flying = true;
    role.material = cardMats[mine];
    S.closeUp = true;
    await fly(role, () => eyeSpot(Math.PI), 0.55, { arc: 0.06, step: (e) => { if (e > 0.75) role.material = brightMats[mine]; } });
    if (gen !== S.gen) return;
    audio.swish();
    await anim(0.45, (e) => {
      const s = eyeSpot(Math.PI * (1 - e));
      role.position.copy(s.pos);
      role.quaternion.copy(s.quat);
      role.scale.setScalar(s.scale);
    }, EASE.inOut);
    setCaption(mine === 'sherlock' ? 'Tu es Sherlock' : 'Tu es Moriarty',
      mine === 'sherlock' ? 'Trouve tous les fils avec les autres Sherlock.' : 'Fais couper Big Ben… sans te faire repérer.',
      mine === 'sherlock' ? 'blue' : 'red', 3);
    await anim(2.6, () => {
      const s = eyeSpot(0);
      role.position.copy(s.pos);
      role.quaternion.copy(s.quat);
      role.scale.setScalar(s.scale);
    });
    if (gen !== S.gen) return;
    role.material = cardMats.role;
    role.userData.flying = false;
    S.closeUp = false;
  }

  // ---------- Fin de partie ----------

  async function playEnd(gen) {
    const g = S.g;
    S.lifted = false;
    S.selected = null;
    await wait(0.3);
    if (gen !== S.gen) return;
    if (g.winner === 'moriarty') await explode(gen, g.reason);
    else await defuse(gen);
    if (gen !== S.gen) return;
    revealRoles(g.roles || {}, g.winner);
    await wait(1.8);
    if (gen !== S.gen) return;
    S.ended = true;
    setCaption(null); // le panneau de fin prend le relais
    changed();
  }

  async function explode(gen, reason) {
    const W = S.world;
    const bomb = W.bomb;
    S.yawTarget = 0;
    S.lastDrag = -10;
    if (reason === 'time') {
      setCaption('Plus de temps !', 'La 4e manche est finie : Big Ben va sauter…', 'red');
      audio.bongs(1);
      await wait(1.2);
      if (gen !== S.gen) return;
    }
    // Compte à rebours affolé
    for (let s = 3; s > 0; s--) {
      bomb.screen.draw(`00:0${s}`, '#ff3b2f');
      audio.click();
      S.shake = 0.15 * (4 - s);
      vibrate(30);
      await wait(0.42);
      if (gen !== S.gen) return;
    }
    bomb.screen.draw('BOUM', '#ff3b2f');
    S.endPlayed = true;
    // BOUM : éclair, boule de feu, les murs et le plafond s'envolent.
    flash();
    audio.boom();
    vibrate([400, 80, 300]);
    S.shake = 1.4;
    S.kick = 1;
    S.blown = true;
    const at = new THREE.Vector3(0, M.TABLE_Y + 0.12, 0);
    fx.fireball(at);
    bomb.group.visible = false;
    const room = W.room;
    const parts = room.parts;
    const rot = room.group.rotation.y;
    fx.blowWalls(parts.sides, rot);
    const rnd = (a) => (Math.random() - 0.5) * a;
    const tracked = new Set([parts.floor, parts.rug].concat(parts.sides));
    const toss = (o, v, spin) => {
      if (!o) return;
      tracked.add(o);
      fx.throwObject(o, v, spin || new THREE.Vector3(rnd(3), rnd(3), rnd(3)), { pivot: true });
    };
    // Les groupes dont le pivot est au centre de la salle partent sans tourner (sinon ils balaient la caméra).
    const still = new THREE.Vector3();
    toss(parts.ceiling, new THREE.Vector3(rnd(1), 9, rnd(1)), still);
    toss(parts.clockwork, new THREE.Vector3(rnd(3), 7, rnd(3)), still);
    toss(parts.lamp, new THREE.Vector3(rnd(4), 6, rnd(4)));
    toss(parts.pendulum, new THREE.Vector3(5, 4, -5));
    parts.props.forEach((o) => toss(o, new THREE.Vector3(rnd(6), 2, rnd(6)).add(o.position.clone().setY(0).normalize().multiplyScalar(-8)), still));
    parts.gears.forEach((o) => {
      if (o.parent !== room.group) return;
      toss(o, o.position.clone().setY(0).normalize().multiplyScalar(6).setY(3 + Math.random() * 3));
    });
    // Ce qui reste accroché aux murs disparaît dans la fumée.
    room.group.children.forEach((o) => { if (!tracked.has(o)) o.visible = false; });
    // Cartes et pince projetées sur la table et le plancher
    const fling = (m, power) => {
      const out = m.position.clone().setY(0);
      if (out.lengthSq() < 0.001) out.set(rnd(1), 0, rnd(1));
      out.normalize().multiplyScalar(power * (0.6 + Math.random())).setY(1.5 + Math.random() * 2.5);
      fx.throwObject(m, out, new THREE.Vector3(rnd(16), rnd(16), rnd(16)), { lift: 0.002 });
    };
    S.ids.forEach((id) => W.hands[id].forEach((c) => { c.flying = true; fling(c.mesh, 2.2); }));
    W.revealed.forEach((m) => fling(m, 2.5));
    W.pincers.userData.flying = true;
    fling(W.pincers, 3);
    // Les personnages et leurs chaises sont éjectés au-dessus de la ville.
    Object.keys(W.avatars).forEach((id) => {
      const av = W.avatars[id];
      const out = av.group.position.clone().setY(0).normalize();
      av.blown = {
        t0: S.time,
        from: av.group.position.clone(),
        to: out.multiplyScalar(2.2 + Math.random() * 0.4).setY(0.25 + Math.random() * 0.4),
        rot: av.group.rotation.y,
        spin: rnd(2),
      };
      av.shockAt = S.time;
    });
    // Lumières : plus de lampe, la lune et les flammes prennent le relais.
    W.lights.spot.intensity = 0;
    S.hemi = 1.5;
    setCaption('BOUM !', 'Big Ben a explosé', 'red');
    await wait(2.6);
  }

  async function defuse(gen) {
    const W = S.world;
    S.endPlayed = true;
    W.bomb.screen.draw('STOP', '#4cff8a');
    W.bomb.led.visible = false;
    audio.victory();
    vibrate([60, 40, 60]);
    setCaption('Bombe désamorcée !', 'Tous les fils ont été coupés', 'green');
    fx.confetti(new THREE.Vector3(0, M.TABLE_Y, 0));
    W.lights.spot.intensity = 24;
    Object.values(W.avatars).forEach((av) => { av.hopAt = S.time + Math.random() * 0.3; });
    await wait(2.2);
  }

  // Les rôles se dévoilent : cartes retournées, chapeaux de Sherlock ou de Moriarty.
  function revealRoles(roles, winner) {
    const W = S.world;
    S.ids.forEach((id) => {
      const role = roles[id];
      if (!role) return;
      const card = W.roles[id];
      card.userData.faceUp = true;
      card.userData.type = role;
      const av = W.avatars[id];
      if (!av) return;
      av.hats.forEach((h) => { h.visible = false; });
      const hat = M.roleHat(role);
      hat.position.y += av.headY - av.head.position.y;
      av.head.add(hat);
      const y = hat.position.y;
      anim(0.5, (e) => { hat.scale.setScalar(Math.max(0.01, e)); hat.position.y = y + (1 - e) * 0.25; }, EASE.back);
      av.tag.material.map = TX.texture(TX.nameTag(av.name, COLORS[id % COLORS.length], role));
      av.tag.material.needsUpdate = true;
      av.mood = role === winner ? 'cheer' : 'slump';
    });
    const won = roles[S.me] === winner;
    setCaption(winner === 'sherlock' ? 'Les Sherlock gagnent !' : 'Les Moriarty gagnent !', won ? 'Victoire !' : 'Défaite…', won ? 'green' : 'red');
  }

  function flash() {
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '1';
    void flashEl.offsetWidth;
    flashEl.style.transition = 'opacity 1.4s ease-out';
    flashEl.style.opacity = '0';
  }

  // ---------- File des animations ----------

  async function run() {
    if (S.running || !S.world) return;
    S.running = true;
    const gen = S.gen;
    changed();
    try {
      while (gen === S.gen) {
        const g = S.g;
        if (S.introPending) {
          S.introPending = false;
          await intro(gen);
        } else if (S.k < g.revealed.length) {
          // Gros retard (onglet en arrière-plan) : on saute aux dernières coupes.
          if (g.revealed.length - S.k > 2) {
            S.k = g.revealed.length - 1;
            refresh();
          }
          await playReveal(S.k, gen);
        } else if (g.phase === 'end' && !S.endPlayed && !S.ended) {
          await playEnd(gen);
        } else {
          break;
        }
      }
    } finally {
      if (gen === S.gen) {
        S.running = false;
        if (S.world) refresh();
      }
    }
  }

  // ---------- Ambiance ----------

  function dust() {
    const N = 160;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(Math.random()) * 1.3;
      const a = Math.random() * TAU;
      pos.set([Math.cos(a) * r, 0.8 + Math.random() * 1.3, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ map: TX.softDot(), size: 0.018, color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  function rain(N) {
    const pos = new Float32Array(N * 6);
    const geo = new THREE.BufferGeometry();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const r = 4.9 + Math.random() * 7;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = Math.random() * 9 - 2;
      pos.set([x, y, z, x + 0.03, y - 0.35, z], i * 6);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9aa8d8, transparent: true, opacity: 0.35, fog: false }));
    lines.frustumCulled = false;
    return lines;
  }

  function ambient(dt) {
    const W = S.world;
    const parts = W.room.parts;
    parts.gears.forEach((gr) => { gr.rotation.z += gr.userData.speed * dt; });
    parts.pendulum.rotation.x = Math.sin((S.time * Math.PI) / 1.0) * 0.12;
    const now = new Date();
    const m = now.getMinutes() + now.getSeconds() / 60;
    const h = (now.getHours() % 12) + m / 60;
    parts.hands.forEach((hd) => { hd.minute.rotation.z = (m / 60) * TAU; hd.hour.rotation.z = (h / 12) * TAU; });
    parts.flames.material.size = 0.22 * (1 + Math.sin(S.time * 13) * 0.06 + Math.sin(S.time * 29) * 0.04);
    const p = W.rain.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) {
      let y = p.getY(i) - dt * 9;
      if (y < -3) y += 11;
      p.setY(i, y);
      p.setY(i + 1, y - 0.35);
    }
    p.needsUpdate = true;
    W.dust.rotation.y += dt * 0.03;
    if (!S.endPlayed) {
      const left = S.shown ? 4 * S.n - ((S.shown.round - 1) * S.n + S.shown.cuts) : 99;
      const rate = left <= S.n ? 3 : 1; // la diode s'affole pendant la dernière manche
      W.bomb.led.visible = ((S.time * rate) % 1) < 0.5;
    }
    // Orage : éclair sur la ville puis tonnerre
    S.nextThunder -= dt;
    if (S.nextThunder < 0) {
      S.nextThunder = 18 + Math.random() * 25;
      S.lightning = 0.4;
      setTimeout(() => { if (S.active) audio.thunder(); }, 350 + Math.random() * 900);
    }
    let bolt = 0;
    if (S.lightning > 0) {
      S.lightning -= dt;
      bolt = S.lightning > 0.3 || (S.lightning < 0.18 && S.lightning > 0.1) ? 1 : 0;
    }
    city.material.color.setScalar(1 + bolt * 1.4);
    W.lights.hemi.intensity = S.hemi + bolt * 2.2;
    if (S.blown) {
      fx.embers(new THREE.Vector3(0, M.TABLE_Y, 0), dt);
      W.lights.fill.color.setHex(0xff7a30);
      W.lights.fill.intensity = 6 + Math.sin(S.time * 17) * 1.2 + Math.sin(S.time * 7.3) * 1.5;
      W.lights.fill.position.y = 1.2;
    }
  }

  // Téléphone qui peine : on baisse la résolution une fois pour toutes.
  function watchPerf(dt) {
    const pf = S.perf;
    if (pf.done) return;
    pf.frames++;
    pf.time += dt;
    if (pf.time < 4) return;
    pf.done = true;
    if (pf.frames / pf.time < 28 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      frame(false);
    }
  }

  // ---------- Boucle ----------

  let last = 0;
  function loop(ts) {
    S.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    S.time += dt;
    if (!S.world) return;
    updateCamera(dt);
    runAnims();
    layoutCards();
    followCards(dt);
    placePincers(dt);
    animateAvatars(dt);
    ambient(dt);
    fx.update(dt);
    watchPerf(dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (S.raf) return;
    last = 0;
    S.raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(S.raf);
    S.raf = 0;
  }

  window.addEventListener('resize', () => frame(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.ambience(false);
    else if (S.active && S.audioReady) audio.ambience(true);
  });
  // Le son ne peut démarrer qu'après un geste de l'utilisateur.
  const unlock = () => {
    S.audioReady = true;
    audio.unlock();
    if (S.active && !document.hidden) audio.ambience(true);
  };
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  // ---------- Entrées tactiles ----------

  const ray = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, yaw: S.yaw, moved: false };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 8 || Math.abs(e.clientY - down.y) > 8) down.moved = true;
    if (down.moved) {
      S.dragging = true;
      S.yaw = clamp(down.yaw + (dx / container.clientWidth) * 2.2, -1.35, 1.35);
    }
  });
  const release = (e) => {
    if (down && !down.moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
    if (down && down.moved) S.lastDrag = S.time;
    down = null;
    S.dragging = false;
  };
  renderer.domElement.addEventListener('pointerup', release);
  renderer.domElement.addEventListener('pointercancel', release);

  function tap(x, y) {
    const W = S.world;
    if (!W || S.blown) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), camera);
    const targets = [];
    S.ids.forEach((id) => {
      W.hands[id].forEach((c, k) => targets.push({ obj: c.mesh, id, k }));
      targets.push({ obj: W.roles[id], id, k: -1 });
      if (W.avatars[id]) W.avatars[id].torso.traverse((o) => { if (o.isMesh) targets.push({ obj: o, id, k: null }); });
    });
    const hits = ray.intersectObjects(targets.map((t) => t.obj), false);
    if (!hits.length) return;
    const hit = targets.find((t) => t.obj === hits[0].object);
    if (hit.id === S.me) {
      if (!S.running) toggleHand(hit.k === -1 ? 'role' : 'cards');
      return;
    }
    if (canCut() && W.hands[hit.id].length) {
      const k = hit.k === null || hit.k < 0 ? Math.floor(W.hands[hit.id].length / 2) : hit.k;
      if (S.selected === hit.id && S.selSlot === k) confirmCut();
      else select(hit.id, k);
    }
  }

  function canCut() {
    const D = S.shown;
    return !!D && !S.running && D.phase === 'play' && S.g.phase === 'play' && D.pincers === S.me
      && S.k === S.g.revealed.length && !S.pending;
  }

  function select(id, k) {
    if (id !== null && (id === S.me || !S.world.hands[id] || !S.world.hands[id].length)) return;
    S.selected = id;
    S.selSlot = id === null ? 0 : (k === undefined ? Math.floor(S.world.hands[id].length / 2) : k);
    S.yawTarget = id === null ? 0 : yawToward(id);
    S.lastDrag = -10;
    audio.click();
    changed();
  }

  function confirmCut() {
    if (!canCut() || S.selected === null) return;
    S.pending = true;
    const target = S.selected;
    const slot = S.selSlot;
    S.selected = null;
    changed();
    Promise.resolve(options.onCut && options.onCut(target, slot)).finally(() => {
      S.pending = false;
      changed();
    });
  }

  // v : 'cards', 'role' ou false. Toucher ce qui est déjà levé le repose.
  function toggleHand(v) {
    const what = v === undefined || v === true ? 'cards' : v;
    S.lifted = what && S.lifted !== what ? what : false;
    audio.swish();
    changed();
  }

  // Angle de tête minimal pour voir un joueur.
  function yawToward(id) {
    if (id === S.me || !S.world || !S.world.avatars[id]) return 0;
    rig.updateMatrixWorld();
    const local = rig.worldToLocal(headPos(id));
    const yaw = Math.atan2(-(local.x - camera.position.x), -(local.z - camera.position.z));
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) - 0.12;
    if (Math.abs(yaw) < half) return 0;
    return yaw - Math.sign(yaw) * half;
  }

  function changed() {
    if (options.onChange) options.onChange();
  }

  // ---------- Synchronisation avec l'état du serveur ----------

  function show(room) {
    if (!room) {
      S.active = false;
      container.hidden = true;
      audio.ambience(false);
      setCaption(null);
      stop();
      return;
    }
    container.hidden = false;
    S.active = true;
    start();
    if (S.audioReady && !document.hidden) audio.ambience(true);
    const g = room.g;
    const seatChange = !!S.world && room.me !== S.me;
    const fresh = !S.world || !S.g || seatChange || room.players.length !== S.n || room.players.some((p) => !S.ids.includes(p.id))
      || g.revealed.length < S.k || (S.g.phase === 'end' && g.phase !== 'end');
    S.room = room;
    S.g = g;
    if (fresh) {
      S.myCards = {};
      build(room);
      S.myCards[g.round] = { cards: g.myCards, len: g.revealed.length };
      S.k = g.revealed.length;
      S.introPending = g.revealed.length === 0 && g.phase === 'play' && !seatChange;
      refresh(S.introPending ? 'nohands' : undefined);
    } else {
      S.myCards[g.round] = { cards: g.myCards, len: g.revealed.length };
      if (!S.running) refresh();
    }
    run();
    changed();
  }

  // Ordre des cartes du joueur visé, de gauche à droite à l'écran (pour les boutons).
  function slotOrder(id) {
    const hand = S.world && S.world.hands[id];
    if (!hand) return [];
    camera.updateWorldMatrix(true, false);
    return hand.map((c, k) => ({ k, x: c.pos.clone().project(camera).x })).sort((a, b) => a.x - b.x).map((o) => o.k);
  }

  function view() {
    return {
      selSlot: S.selSlot,
      slots: S.selected !== null ? slotOrder(S.selected) : [],
      g: S.shown,
      n: S.n,
      lifted: S.lifted,
      selected: S.selected,
      canCut: canCut(),
      pending: S.pending,
      busy: S.running,
      ended: S.ended,
      sound: audio.on,
    };
  }

  function sound(v) {
    audio.setOn(v);
    if (v) {
      S.audioReady = true;
      if (S.active) audio.ambience(true);
    }
    changed();
  }

  return {
    show,
    view,
    select: (id, k) => select(id, k),
    confirmCut,
    toggleHand,
    sound,
    resize: () => frame(false),
    debug: { S, camera, scene, renderer },
  };
}
