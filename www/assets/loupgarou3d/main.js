// Loup-garou en 3D : veillée autour d'un feu de camp, dans une clairière, la nuit.
// Le serveur reste la référence ; la scène rejoue à son rythme les morts du journal
// (le loup qui emporte sa victime, le bannissement, le coup de fusil du chasseur).
import * as THREE from '../vendor/three.min.js?v=2';
import * as TX from './textures.js';
import * as WD from './world.js';
import { buildVillager, wolfify, buildGrave } from './people.js';
import { buildWolf, poseWolf, mouthPos, WOLF_RIM } from './wolf.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { V, TAU } from './geo.js';

const COLORS = ['#7a4fd0', '#2f7d8a', '#a3532a', '#3f7d4e', '#2f5d8a', '#a33a6b', '#6b6b2a', '#8a4f2f'];
const ROLE = TX.ROLE_INFO;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const EASE = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in: (t) => t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};
const Y = V(0, 1, 0);
let SHADOW_GEO = null;

// Ciel, brouillard et lumières : 0 nuit, 1 aube (ou crépuscule), 2 jour.
const SKY = [
  { top: 0x03050d, horizon: 0x1a2442, bottom: 0x06080e, glow: 0x2a3a66, fog: 0x0a0f1e, fogD: 0.052, hemiSky: 0x4a5a9a, hemiGround: 0x0c0a08, hemi: 0.55, moon: 0.5, sun: 0, stars: 1, fire: 1, exposure: 1.15, mist: 0.07 },
  { top: 0x26365e, horizon: 0xe8946a, bottom: 0x1a1410, glow: 0xff9a5a, fog: 0x4a3c4c, fogD: 0.042, hemiSky: 0x9a8ab0, hemiGround: 0x2a2018, hemi: 0.9, moon: 0.12, sun: 1.1, stars: 0.12, fire: 0.85, exposure: 1.1, mist: 0.1 },
  { top: 0x5a8ac8, horizon: 0xcfd9e0, bottom: 0x2a2a22, glow: 0xfff0d0, fog: 0x95a3ae, fogD: 0.03, hemiSky: 0xcfe0ff, hemiGround: 0x4a3c2a, hemi: 1.7, moon: 0, sun: 2.4, stars: 0, fire: 0.5, exposure: 1.0, mist: 0.12 },
];
const MOON_DIR = V(-0.32, 0.27, -1).normalize();
const SUN_DIR = [V(0.7, 0.03, -1).normalize(), V(0.45, 0.55, -0.7).normalize()];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* non pris en charge */ }
}

// Carte à deux faces : recto ou verso selon le côté vu.
function cardMaterial(front, back) {
  const mat = new THREE.MeshBasicMaterial({ map: front, side: THREE.DoubleSide, alphaTest: 0.5, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.backMap = { value: back };
    shader.fragmentShader = 'uniform sampler2D backMap;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      'vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( backMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) );\n\tdiffuseColor *= sampledDiffuseColor;',
    );
  };
  return mat;
}

// Morts du journal (dans l'ordre) et rôles connus de tous.
function deaths(events) {
  const out = [];
  events.forEach((e) => {
    if (e.type === 'dawn') e.dead.forEach((d) => out.push({ id: d.id, role: d.role }));
    if (e.type === 'vote' && e.dead) out.push({ id: e.dead.id, role: e.dead.role });
    if (e.type === 'hunter') out.push({ id: e.target, role: e.role });
  });
  return out;
}

export function createLoupGarou3D(opts) {
  const options = Object.assign({ style: 'realiste' }, opts || {});
  const high = options.quality ? options.quality === 'high' : !((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3);

  const container = document.createElement('div');
  container.id = 'lg3d';
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
  container.appendChild(renderer.domElement);
  // Calques HTML : éclair (rouge quand on est attaqué), voile de fantôme, légende.
  const flashEl = document.createElement('div');
  flashEl.className = 'lg3d-flash';
  const ghostEl = document.createElement('div');
  ghostEl.className = 'lg3d-ghost';
  const captionEl = document.createElement('div');
  captionEl.className = 'tb3d-caption';
  container.append(ghostEl, flashEl, captionEl);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050d);
  scene.fog = new THREE.FogExp2(0x0a0f1e, 0.05);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  const audio = createAudio();
  const sky = WD.buildSky(high);
  scene.add(sky.group);
  const fx = createFx(scene, high);

  // Lumières : ciel, lune, soleil, et le feu qui vacille.
  const hemi = new THREE.HemisphereLight(0x4a5a9a, 0x0c0a08, 0.5);
  const moonLight = new THREE.DirectionalLight(0x8aa0e0, 0.5);
  moonLight.position.copy(MOON_DIR).multiplyScalar(30);
  const sunLight = new THREE.DirectionalLight(0xffd8a8, 0);
  const fireLight = new THREE.PointLight(0xff9a55, 18, 0, 2);
  fireLight.position.set(0, 0.75, 0);
  const emberLight = new THREE.PointLight(0xff5a18, 5, 0, 2);
  emberLight.position.set(0, 0.18, 0);
  scene.add(hemi, moonLight, sunLight, fireLight, emberLight);

  const cards = {};
  const back = TX.texture(TX.cardBack());
  Object.keys(ROLE).forEach((r) => { cards[r] = cardMaterial(TX.texture(TX.roleCard(r)), back); });
  cards.unknown = cardMaterial(back, back);
  const shadowTex = TX.texture(TX.shadowStreak());

  const S = {
    room: null, g: null, shown: null, me: null, ids: [], n: 0, offset: 0,
    k: 0, // nombre d'événements du journal déjà joués à l'écran
    gen: 0, anims: [], running: false, world: null, active: false, raf: 0, time: 0,
    tod: 0, blood: 0, stir: -99, accuse: null, ghost: false, myDeathPlayed: false,
    selected: null, pending: false, lifted: false, liftT: 0,
    yaw: 0, yawTarget: 0, pitch: 0, dragging: false, lastDrag: -10, shake: 0,
    fear: 0, fearTarget: 0, // un loup approche : le feu se recroqueville et on se redresse pour voir
    introPending: false, ended: false, endPlayed: false, seerSeen: 0, vision: null,
    camOverride: null, speaker: null, nextSpeaker: 0, audioReady: false,
    perf: { frames: 0, time: 0, done: !!options.quality },
  };

  // ---------- Petit moteur d'animation (suit l'horloge de la scène) ----------

  function anim(dur, fn, easing) {
    return new Promise((resolve) => { S.anims.push({ start: S.time, dur, fn, easing, resolve }); });
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

  // ---------- Construction d'une partie ----------

  function clearWorld() {
    if (!S.world) return;
    scene.remove(S.world.group, S.world.myCard);
    // Libère la mémoire graphique (une géométrie partagée sera simplement renvoyée à la carte si elle resert).
    S.world.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    S.world = null;
  }

  function angleOf(id) {
    return S.ids.indexOf(id) * (TAU / S.n) + S.offset;
  }
  function outward(id) {
    const a = angleOf(id);
    return V(Math.sin(a), 0, Math.cos(a));
  }
  function seatPos(id, extra) {
    return outward(id).multiplyScalar(S.world.R + (extra || 0));
  }
  function nameOf(id) {
    const p = S.room && S.room.players.find((x) => x.id === id);
    return p ? p.name : '?';
  }

  function build(room) {
    clearWorld();
    fx.clear();
    S.gen++;
    S.anims = [];
    S.running = false;
    S.selected = null;
    S.lifted = false;
    S.ended = false;
    S.endPlayed = false;
    S.vision = null;
    S.seerSeen = 0;
    S.stir = -99;
    S.accuse = null;
    S.blood = 0;
    S.fearTarget = 0;
    S.camOverride = null;
    S.myDeathPlayed = false;
    setGhost(false);
    setCaption(null);
    const ids = room.players.map((p) => p.id);
    const n = ids.length;
    S.ids = ids;
    S.n = n;
    S.me = room.me;
    S.offset = -ids.indexOf(room.me) * (TAU / n);
    const R = WD.seatRadius(n);
    const W = { group: new THREE.Group(), R, avatars: {}, seats: {}, graves: {}, tags: {}, badges: {}, shadows: {}, floating: {} };
    S.world = W;
    scene.add(W.group);
    const world = WD.buildWorld(R, high);
    W.group.add(world.group);
    const pit = WD.buildFirePit();
    W.group.add(pit.group);
    W.pit = pit;

    room.players.forEach((p, i) => {
      const a = angleOf(p.id);
      const seat = WD.buildSeat(i % 4 === 3 ? 'stump' : 'log', 31 + p.id * 7);
      seat.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
      seat.rotation.y += a;
      W.group.add(seat);
      W.seats[p.id] = seat;
      if (p.id === room.me) return;
      const color = COLORS[p.id % COLORS.length];
      const av = buildVillager(p, color, options.style);
      av.group.position.copy(seat.position);
      av.group.rotation.order = 'YXZ';
      av.group.rotation.y = a + Math.PI;
      av.angle = a;
      av.name = p.name;
      W.group.add(av.group);
      W.avatars[p.id] = av;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.texture(TX.nameTag(p.name, color)), depthTest: false, transparent: true, sizeAttenuation: false }));
      tag.scale.set(0.2, 0.0625, 1);
      tag.renderOrder = 10;
      tag.userData.key = '';
      W.group.add(tag);
      W.tags[p.id] = tag;
      // Ombre portée par le feu, allongée vers l'extérieur
      if (!SHADOW_GEO) SHADOW_GEO = new THREE.PlaneGeometry(0.75, 2.1).translate(0, 1.05, 0).rotateX(-Math.PI / 2);
      const sh = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.6 }));
      sh.position.set(Math.sin(a) * (R - 0.05), 0.012, Math.cos(a) * (R - 0.05));
      sh.rotation.y = a + Math.PI;
      W.group.add(sh);
      W.shadows[p.id] = sh;
    });

    // Deux loups : le second sert quand la nuit fait deux victimes, ou pour hurler à la fin.
    W.wolves = [0, 1].map(() => {
      const w = buildWolf();
      w.group.visible = false;
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ map: TX.softDot(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(0.9, 1.9, 1);
      w.blob = blob;
      blob.visible = false;
      W.group.add(w.group, blob);
      return w;
    });

    // Ma carte rôle, tenue en main, face cachée
    W.myCard = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.169), cards.unknown);
    W.myCard.renderOrder = 20;
    W.myCard.material.depthTest = false;
    scene.add(W.myCard);
    W.myCardMats = {};

    // Anneau doré sous le joueur sélectionné
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf5b83d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    W.group.add(ring);
    W.ring = ring;
    frame(true);
  }

  // ---------- État affiché ----------

  // Ce que l'écran montre : la partie telle qu'elle était après k événements du journal.
  function derive() {
    const g = S.g;
    const k = S.k;
    const evs = g.events.slice(0, k);
    const done = k >= g.events.length;
    const dead = deaths(evs);
    const deadIds = dead.map((d) => d.id);
    const D = {
      done, events: evs, dead, myRole: g.myRole,
      alive: S.ids.filter((id) => !deadIds.includes(id)),
      night: evs.filter((e) => e.type === 'dawn').length + 1,
      roles: {}, winner: null, wolves: g.wolves || null,
    };
    dead.forEach((d) => { D.roles[d.id] = d.role; });
    if (done) {
      Object.assign(D, { phase: g.phase, night: g.night, winner: g.winner, dayVotes: g.dayVotes || {}, myVote: g.myVote, hunter: g.hunter });
      if (g.roles) Object.assign(D.roles, g.roles);
    } else {
      const e = g.events[k];
      D.phase = e.type === 'dawn' ? 'night' : (e.type === 'hunter' ? 'hunter' : 'day');
      if (e.type === 'dawn') D.night = e.night;
      D.hunter = e.type === 'hunter' ? e.by : null;
      D.dayVotes = e.type === 'vote' ? e.votes || {} : {};
    }
    D.meAlive = D.alive.includes(S.me);
    D.myDead = !D.meAlive;
    return D;
  }

  function todFor(D) {
    if (D.phase === 'night' || D.phase === 'witch') return 0;
    if (D.phase === 'end') return D.winner === 'wolves' ? 0 : 2;
    if (D.phase === 'hunter') return S.tod;
    return 2;
  }

  function refresh() {
    if (!S.world) return;
    const D = derive();
    S.shown = D;
    // Les morts déjà joués : leur stèle est plantée, leur personnage a disparu.
    D.dead.forEach((d) => {
      const av = S.world.avatars[d.id];
      if (av && !av.scripted) av.group.visible = false;
      plantGrave(d.id, d.role);
    });
    S.ids.forEach((id) => {
      const av = S.world.avatars[id];
      if (av && !av.scripted && D.alive.includes(id)) av.group.visible = true;
      if (S.world.graves[id] && D.alive.includes(id)) {
        S.world.group.remove(S.world.graves[id]);
        delete S.world.graves[id];
      }
    });
    if (D.myDead && !S.running) setGhost(true);
    if (!D.myDead) setGhost(false);
    if (S.selected !== null && !canPick().includes(S.selected)) S.selected = null;
    changed();
  }

  // Rôles que je connais : morts, ma meute, mes visions, tout le monde si je suis mort ou à la fin.
  function knownRoles() {
    const D = S.shown;
    const out = Object.assign({}, D.roles);
    if (D.wolves && S.g.myRole === 'wolf') D.wolves.forEach((id) => { out[id] = 'wolf'; });
    if (S.g.seerLog) S.g.seerLog.slice(0, S.seerSeen).forEach((s) => { out[s.target] = s.role; });
    return out;
  }

  function plantGrave(id, role) {
    const W = S.world;
    if (W.graves[id]) return;
    const gr = buildGrave(cards[role]);
    gr.position.copy(seatPos(id, 0.42));
    gr.rotation.y = angleOf(id);
    W.group.add(gr);
    W.graves[id] = gr;
  }

  // ---------- Caméra ----------

  function frame(snap) {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = clamp((1.3 - camera.aspect) / 0.8, 0, 1); // 0 : paysage, 1 : portrait
    camera.fov = options.fov ? Number(options.fov) : lerp(56, 80, t);
    S.baseFov = camera.fov;
    camera.updateProjectionMatrix();
    const W = S.world;
    if (!W) return;
    S.view = {
      t,
      dist: W.R + lerp(0.35, 1.0, t) + Number(options.back || 0),
      height: lerp(1.4, 1.75, t) + Number(options.up || 0),
      look: V(0, lerp(0.6, 0.5, t), -lerp(0.7, 0.45, t)),
    };
    S.view.pitch = Math.atan2(S.view.look.y - S.view.height, S.view.dist - S.view.look.z);
    if (snap) rig.rotation.y = angleOf(S.me);
  }

  function updateCamera(dt) {
    const v = S.view;
    S.shake *= Math.exp(-2.5 * dt);
    const sh = S.shake;
    rig.rotation.y = angleOf(S.me);
    if (!S.dragging && S.time - S.lastDrag > 3) {
      S.yaw = lerp(S.yaw, S.yawTarget, damp(1.6, dt));
      S.pitch = lerp(S.pitch, 0, damp(1.6, dt));
    }
    // Quand le loup attaque, on resserre le cadre sur la scène.
    const fov = S.baseFov * (1 - (S.camOverride ? 0 : 0.25 * S.fear));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const o = S.camOverride;
    if (o) {
      camera.position.copy(o.pos);
      camera.rotation.set(o.pitch, o.yaw, o.roll || 0);
    } else {
      const breath = Math.sin(S.time * 0.5) * 0.01;
      camera.position.set((Math.random() - 0.5) * sh * 0.08, v.height + S.fear * 0.7 + breath + (Math.random() - 0.5) * sh * 0.08, v.dist - S.fear * 0.2);
      camera.rotation.set(v.pitch + S.pitch + Math.sin(S.time * 0.37) * 0.004, S.yaw + Math.sin(S.time * 0.23) * 0.006, (Math.random() - 0.5) * sh * 0.03);
    }
  }

  // Angle de tête minimal pour voir un joueur (ou un point) ; center : le mettre au milieu de l'écran.
  function yawToward(target, center) {
    if (target === S.me || !S.world) return 0;
    const p = typeof target === 'number' ? (S.world.avatars[target] ? headPos(target) : seatPos(target)) : target;
    rig.updateMatrixWorld();
    const local = rig.worldToLocal(p.clone());
    const yaw = Math.atan2(-(local.x - camera.position.x), -(local.z - camera.position.z));
    const half = center ? 0 : Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) - 0.15;
    if (Math.abs(yaw) < half) return 0;
    return yaw - Math.sign(yaw) * half;
  }

  function headPos(id) {
    const av = S.world.avatars[id];
    av.group.updateMatrixWorld(true);
    return av.head.localToWorld(V(0, av.hy, 0.02));
  }

  // Position de ma carte rôle : en main (bas de l'écran) ou levée devant les yeux.
  function cardSpot(lift) {
    const d = 0.42;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    const low = { pos: V(-w * 0.34, -h * 0.36, -d), rot: new THREE.Euler(-0.5, 0.2, 0.22), scale: Math.min(1.1, h * 0.3 / 0.169), flip: Math.PI };
    const up = { pos: V(0, h * 0.05, -d), rot: new THREE.Euler(0, 0, 0), scale: Math.min(h * 0.5 / 0.169, w * 0.56 / 0.12), flip: 0 };
    const e = EASE.inOut(lift);
    camera.updateWorldMatrix(true, false);
    const pos = low.pos.clone().lerp(up.pos, e).applyMatrix4(camera.matrixWorld);
    const q = camera.getWorldQuaternion(new THREE.Quaternion())
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lerp(low.rot.x, 0, e), lerp(low.rot.y, 0, e), lerp(low.rot.z, 0, e))))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Y, lerp(low.flip, up.flip, e)));
    return { pos, q, scale: lerp(low.scale, up.scale, e) };
  }

  function placeMyCard(dt) {
    const W = S.world;
    const target = S.lifted ? 1 : 0;
    S.liftT = clamp(S.liftT + (target ? dt : -dt) * 2.6, 0, 1);
    const role = S.g && S.g.myRole;
    if (role && W.myCard.material !== cards[role]) W.myCard.material = cards[role];
    const sp = cardSpot(S.liftT);
    W.myCard.position.copy(sp.pos);
    W.myCard.quaternion.copy(sp.q);
    W.myCard.scale.setScalar(sp.scale);
    W.myCard.visible = !!role && !S.camOverride;
  }

  // ---------- Personnages ----------

  // Bras : [x, y, z, coude] pour une pose donnée (s = -1 gauche, 1 droite).
  function armPose(kind, s, t) {
    switch (kind) {
      case 'chauffe': return [-1.12, 0, -s * 0.2, -0.55];
      case 'croises': return [-0.72, 0, -s * 0.4, -1.5];
      case 'leve': return [-2.85 + Math.sin(t * 6 + s) * 0.12, 0, s * 0.35, -0.25];
      case 'peur': return [-1.25, 0, -s * 0.3, -2.0];
      case 'pendre': return [0.03, 0, s * 0.07, -0.15];
      case 'traine': return [-1.05 + Math.sin(t * 9 + s * 2) * 0.4, 0, s * 0.35, -0.35 + Math.sin(t * 7 + s) * 0.3]; // tend les bras vers le feu
      case 'fusil': return s > 0 ? [-1.45, 0, -0.12, -0.2] : [-1.3, 0, 0.5, -0.75];
      case 'parle': return s > 0 ? [-0.95 + Math.sin(t * 3.1) * 0.25, 0, -0.1, -1.25 + Math.sin(t * 4.3) * 0.25] : [-0.6, 0, 0.1, -0.85];
      default: return [-0.6, 0, -s * 0.1, -0.85]; // mains sur les genoux
    }
  }

  // Pointe le bras droit vers un point (coordonnées monde).
  function pointArm(av, target) {
    const sh = av.arms[1];
    av.group.updateMatrixWorld(true);
    const local = av.spine.worldToLocal(target.clone()).sub(sh.position).normalize();
    const yaw = Math.atan2(local.x, local.z);
    const alpha = Math.acos(clamp(-local.y, -1, 1));
    return [-alpha, yaw, 0, -0.1];
  }

  // Choisit la pose de chacun selon le moment de la partie.
  function wantedPose(av, id) {
    const D = S.shown;
    const P = { sit: 1, lean: 0.06, look: null, arms: ['genoux', 'genoux'], eyes: 1, open: 0, wolf: false };
    if (!D) return P;
    const night = S.tod < 0.6;
    const stirred = S.time - S.stir < 30;
    const known = knownRoles();
    const packMate = S.g.myRole === 'wolf' && known[id] === 'wolf';
    if (S.endState) {
      const won = (known[id] === 'wolf') === (S.endState === 'wolves');
      if (S.endState === 'wolves' && known[id] === 'wolf') {
        Object.assign(P, { sit: 0, lean: -0.25, arms: ['pendre', 'pendre'], open: 0.9, wolf: true, howl: true });
      } else if (won) {
        Object.assign(P, { sit: 0, lean: -0.05, arms: ['leve', 'leve'], open: 0.5, cheer: true });
      } else {
        Object.assign(P, { lean: 0.3, arms: ['peur', 'peur'], eyes: 1.3, look: S.endState === 'wolves' ? 'wolves' : null });
      }
      return P;
    }
    if (stirred && night) {
      Object.assign(P, { lean: -0.12, arms: ['peur', 'peur'], eyes: 1.35, open: 0.4, look: S.stirAt });
      return P;
    }
    if (night && (D.phase === 'night' || D.phase === 'witch' || D.phase === 'hunter')) {
      if (packMate && D.alive.includes(S.me)) {
        // Ma meute veille avec moi, les yeux jaunes.
        Object.assign(P, { lean: 0.15, arms: ['genoux', 'genoux'], wolf: true, look: 'pack' });
      } else {
        Object.assign(P, { lean: 0.38, arms: ['croises', 'croises'], eyes: 0.08, pitch: 0.55 });
      }
      return P;
    }
    if (S.tod < 1.6 && !night) {
      Object.assign(P, { arms: ['chauffe', 'chauffe'] });
      return P;
    }
    if (D.phase === 'day' && D.dayVotes && D.dayVotes[id] !== undefined && S.world.avatars[D.dayVotes[id]] !== undefined) {
      Object.assign(P, { pointAt: D.dayVotes[id], look: D.dayVotes[id] });
    } else if (D.phase === 'day' && D.dayVotes && D.dayVotes[id] === S.me) {
      Object.assign(P, { pointAt: 'me', look: 'me' });
    }
    if (S.accuse !== null && id !== S.accuse) Object.assign(P, { pointAt: S.accuse, look: S.accuse });
    if (S.speaker === id && !P.pointAt) Object.assign(P, { arms: ['genoux', 'parle'], talk: true });
    if (!P.pointAt && S.tod > 1.6 && id % 3 === 0) P.arms = ['chauffe', 'chauffe'];
    return P;
  }

  function animateAvatars(dt) {
    const W = S.world;
    const camPos = camera.getWorldPosition(V(0, 0, 0));
    // De jour, quelqu'un parle de temps en temps ; les autres le regardent.
    if (S.time > S.nextSpeaker) {
      const alive = S.shown ? S.shown.alive.filter((id) => W.avatars[id]) : [];
      S.speaker = S.tod > 1.6 && alive.length && Math.random() < 0.8 ? alive[Math.floor(Math.random() * alive.length)] : null;
      S.nextSpeaker = S.time + 2.5 + Math.random() * 3;
    }
    Object.keys(W.avatars).forEach((key) => {
      const id = Number(key);
      const av = W.avatars[id];
      if (!av.group.visible) return;
      const P = av.scripted ? av.scriptPose : wantedPose(av, id);
      const C = av.cur;
      const k = damp(av.scripted ? 10 : 4, dt);
      av.phase += dt;
      C.sit = lerp(C.sit, P.sit, damp(av.scripted ? 8 : 3, dt));
      C.lean = lerp(C.lean, P.lean + Math.sin(av.phase * 1.7) * 0.012, k);
      C.open = lerp(C.open, P.talk ? Math.abs(Math.sin(S.time * 11 + id)) * 0.5 : P.open, damp(12, dt));
      // Regard
      let target = null;
      if (P.look === 'me') target = camPos;
      else if (typeof P.look === 'number' && W.avatars[P.look]) target = headPos(P.look);
      else if (P.look instanceof THREE.Vector3) target = P.look;
      else if (P.look === 'pack') {
        const mates = (S.shown.wolves || []).filter((x) => x !== id);
        const mate = mates[Math.floor(av.phase / 3) % Math.max(1, mates.length)];
        target = mate === S.me || mate === undefined ? camPos : (W.avatars[mate] ? headPos(mate) : camPos);
      } else {
        av.lookTimer = (av.lookTimer || 0) - dt;
        if (av.lookTimer < 0) {
          av.lookTimer = 1.5 + Math.random() * 3;
          const opts = [V(0, 0.5, 0), camPos];
          if (S.speaker !== null && S.speaker !== id && W.avatars[S.speaker]) opts.push(headPos(S.speaker), headPos(S.speaker));
          S.shown.alive.forEach((o) => { if (o !== id && W.avatars[o] && Math.random() < 0.3) opts.push(headPos(o)); });
          av.lookAt = opts[Math.floor(Math.random() * opts.length)];
        }
        target = av.lookAt;
      }
      let yaw = 0;
      let pitch = P.pitch || 0.12;
      if (target && P.pitch === undefined) {
        av.group.updateMatrixWorld(true);
        const local = av.group.worldToLocal(target.clone());
        local.y -= av.headY;
        yaw = clamp(Math.atan2(local.x, local.z), -1.2, 1.2);
        pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.6, 0.6);
      }
      if (P.howl) pitch = -0.9;
      C.headYaw = lerp(C.headYaw, yaw, damp(5, dt));
      C.headPitch = lerp(C.headPitch, pitch, damp(4, dt));
      // Bras
      [0, 1].forEach((i) => {
        const s = i === 0 ? -1 : 1;
        let a;
        if (P.pointAt !== undefined && i === 1) {
          const tp = P.pointAt === 'me' ? camPos : (W.avatars[P.pointAt] ? headPos(P.pointAt) : seatPos(P.pointAt).setY(1));
          a = pointArm(av, tp);
        } else {
          a = armPose(P.arms[i], s, S.time + av.phase);
        }
        C.armX[i] = lerp(C.armX[i], a[0], k);
        C.armY[i] = lerp(C.armY[i], a[1], k);
        C.armZ[i] = lerp(C.armZ[i], a[2], k);
        C.elbow[i] = lerp(C.elbow[i], a[3], k);
        const arm = av.arms[i];
        arm.rotation.set(C.armX[i], C.armY[i], C.armZ[i]);
        arm.userData.elbow.rotation.x = C.elbow[i];
      });
      // Jambes et bassin : assis, debout, ou en marche
      const walk = av.walk || 0;
      const wp = S.time * 5.5;
      av.legs.forEach((leg, i) => {
        const sw = Math.sin(wp + i * Math.PI) * 0.55 * walk;
        leg.rotation.x = lerp(sw, -1.62, C.sit) + (av.legSpread || 0);
        leg.rotation.z = (i ? -1 : 1) * 0.04 * C.sit;
        leg.userData.knee.rotation.x = lerp(Math.max(0, Math.sin(wp + i * Math.PI + 1.2)) * 0.8 * walk, 1.66, C.sit);
      });
      av.hips.position.y = lerp(0.93 + Math.abs(Math.sin(wp)) * 0.025 * walk, WD.SEAT_Y + 0.08, C.sit);
      av.hips.position.z = (1 - C.sit) * 0.16;
      if (av.skirtPanel) av.skirtPanel.visible = C.sit > 0.75;
      const hop = P.cheer ? Math.abs(Math.sin(S.time * 4.5 + av.phase)) * 0.06 : 0;
      av.hips.position.y += hop;
      av.spine.rotation.x = C.lean;
      av.spine.scale.y = 1 + Math.sin(av.phase * 1.7) * 0.01;
      av.neck.rotation.y = C.headYaw * 0.35;
      av.head.rotation.set(C.headPitch, C.headYaw * 0.65, 0);
      // Yeux : clignement, sommeil, frayeur ; bouche
      av.blink -= dt;
      if (av.blink < 0) av.blink = 2 + Math.random() * 4;
      const eyes = P.eyes < 0.5 ? P.eyes : (av.blink < 0.12 ? 0.1 : P.eyes);
      C.eyes = lerp(C.eyes, eyes, damp(18, dt));
      av.eyes.scale.set(P.eyes > 1 ? 1.15 : 1, C.eyes, 1);
      av.mouth.scale.y = 0.18 + C.open * 1.1;
      av.mouth.scale.x = 1.2 - C.open * 0.4;
      if (!!P.wolf !== !!av.isWolf) { wolfify(av, P.wolf); av.isWolf = !!P.wolf; }
    });
  }

  // Étiquettes au-dessus des têtes, ombres du feu, marqueurs de votes et anneau de sélection.
  function updateOverlays(dt) {
    const W = S.world;
    const D = S.shown;
    if (!D) return;
    const known = knownRoles();
    const counts = {};
    let badgeKind = null;
    if (!S.running && D.done) {
      if (D.phase === 'day') { badgeKind = 'vote'; Object.values(D.dayVotes || {}).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); }
      if (D.phase === 'night' && S.g.myRole === 'wolf' && D.meAlive) { badgeKind = 'paw'; Object.values(S.g.wolfVotes || {}).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); }
      if (D.phase === 'witch' && S.g.myRole === 'witch' && S.g.victim !== null && S.g.victim !== undefined) { badgeKind = 'victim'; counts[S.g.victim] = 1; }
    }
    Object.keys(W.avatars).forEach((key) => {
      const id = Number(key);
      const av = W.avatars[id];
      const tag = W.tags[id];
      const dead = !D.alive.includes(id);
      const role = known[id] || null;
      const tkey = `${role}|${dead}`;
      if (tag.userData.key !== tkey) {
        tag.userData.key = tkey;
        tag.material.map = TX.texture(TX.nameTag(av.name, COLORS[id % COLORS.length], role, dead));
        tag.material.needsUpdate = true;
        tag.scale.set(0.2, 0.0625, 1);
      }
      const grave = W.graves[id];
      if (av.group.visible) {
        const hp = headPos(id);
        tag.position.copy(hp).setY(hp.y + (av.cute ? 0.38 : 0.3));
      } else if (grave) {
        tag.position.copy(grave.position).setY(1.25);
      }
      tag.visible = (av.group.visible || !!grave) && !S.camOverride && S.liftT < 0.2;
      // Ombre du feu
      const sh = W.shadows[id];
      sh.visible = av.group.visible && !av.scripted;
      sh.material.opacity = 0.55 * (1 - clamp(S.tod - 1, 0, 1)) * (0.9 + Math.sin(S.time * 13 + id) * 0.05);
      sh.scale.y = 0.8 + fx.fire.power * 0.4 + Math.sin(S.time * 9 + id) * 0.04;
      // Marqueur au-dessus de la tête
      const n = counts[id] || 0;
      let badge = W.badges[id];
      const bkey = n ? `${badgeKind}${n}` : '';
      if (!badge && bkey) {
        badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }));
        badge.renderOrder = 11;
        badge.scale.set(0.055, 0.055, 1);
        W.group.add(badge);
        W.badges[id] = badge;
      }
      if (badge) {
        if (badge.userData.key !== bkey && bkey) {
          badge.userData.key = bkey;
          const tex = badgeKind === 'paw' ? TX.badge(String(n), '#8a1a1a') : badgeKind === 'victim' ? TX.badge('☠', '#a01818') : TX.badge(String(n), '#c8503a');
          badge.material.map = TX.texture(tex);
          badge.material.needsUpdate = true;
        }
        badge.visible = !!bkey && tag.visible;
        badge.position.copy(tag.position).setY(tag.position.y + 0.17 + Math.sin(S.time * 3) * 0.01);
      }
    });
    // Anneau sous le joueur choisi
    const sel = S.selected;
    W.ring.visible = sel !== null && !!W.avatars[sel] && W.avatars[sel].group.visible;
    if (W.ring.visible) {
      W.ring.position.copy(seatPos(sel, 0.05)).setY(0.03);
      W.ring.scale.setScalar(1 + Math.sin(S.time * 4) * 0.05);
    }
    // Cartes flottantes (visions de la voyante, rôles révélés)
    Object.keys(W.floating).forEach((key) => {
      const f = W.floating[key];
      const camPos = camera.getWorldPosition(V(0, 0, 0));
      f.mesh.position.y = f.y + Math.sin(S.time * 2 + f.phase) * 0.03;
      f.mesh.lookAt(camPos.x, f.mesh.position.y, camPos.z);
      if (f.flip !== undefined) f.mesh.rotateY(f.flip);
    });
  }

  function floatCard(key, at, role, flipIn) {
    const W = S.world;
    let f = W.floating[key];
    if (!f) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), cards[role]);
      mesh.renderOrder = 9;
      W.group.add(mesh);
      f = { mesh, y: at.y, phase: Math.random() * TAU, flip: flipIn ? Math.PI : 0 };
      W.floating[key] = f;
    }
    f.mesh.position.copy(at);
    f.y = at.y;
    if (flipIn) anim(0.7, (e) => { f.flip = Math.PI * (1 - e); }, EASE.inOut);
    return f;
  }

  function dropFloating(key) {
    const W = S.world;
    const f = W.floating[key];
    if (!f) return;
    W.group.remove(f.mesh);
    delete W.floating[key];
  }

  // ---------- Temps qu'il fait ----------

  const tmpC = new THREE.Color();
  const tmpC2 = new THREE.Color();
  function mixHex(a, b, t, out) {
    return out.setHex(a).lerp(tmpC2.setHex(b), t);
  }

  function applySky() {
    const x = clamp(S.tod, 0, 2);
    const i = Math.min(1, Math.floor(x));
    const f = x - i;
    const A = SKY[i];
    const B = SKY[i + 1];
    const mix = (k) => lerp(A[k], B[k], f);
    const vec = (k) => WD.srgb(A[k]).lerp(WD.srgb(B[k]), f);
    const u = sky.uniforms;
    u.top.value.copy(vec('top'));
    u.horizon.value.copy(vec('horizon'));
    u.bottom.value.copy(vec('bottom'));
    u.glow.value.copy(vec('glow'));
    const sunDir = SUN_DIR[0].clone().lerp(SUN_DIR[1], clamp(x - 1, 0, 1)).normalize();
    u.glowDir.value.copy(x < 0.5 ? MOON_DIR : sunDir);
    // Lune de sang quand les loups gagnent
    if (S.blood > 0) {
      u.glow.value.lerp(V(0.5, 0.05, 0.03), S.blood);
      u.horizon.value.lerp(V(0.25, 0.06, 0.06), S.blood * 0.7);
      u.glowDir.value.copy(MOON_DIR);
    }
    mixHex(A.fog, B.fog, f, scene.fog.color);
    if (S.blood > 0) scene.fog.color.lerp(tmpC.setHex(0x2a0a0c), S.blood * 0.6);
    scene.fog.density = mix('fogD');
    scene.background.copy(scene.fog.color);
    mixHex(A.hemiSky, B.hemiSky, f, hemi.color);
    mixHex(A.hemiGround, B.hemiGround, f, hemi.groundColor);
    hemi.intensity = mix('hemi');
    moonLight.intensity = mix('moon');
    if (S.blood > 0) moonLight.color.setHex(0x8aa0e0).lerp(tmpC.setHex(0xff3a2a), S.blood);
    sunLight.intensity = mix('sun');
    sunLight.position.copy(sunDir).multiplyScalar(30);
    sky.stars.material.opacity = mix('stars');
    sky.stars.visible = sky.stars.material.opacity > 0.01;
    sky.moon.position.copy(MOON_DIR).multiplyScalar(80);
    sky.halo.position.copy(sky.moon.position);
    sky.moon.material.opacity = clamp(1 - x, 0, 1) * 0.95 + 0.05 * (x < 1.5 ? 1 : 0);
    sky.moon.material.color.setHex(0xffffff).lerp(tmpC.setHex(0xff5a3a), S.blood);
    sky.halo.material.opacity = clamp(1 - x, 0, 1) * 0.45 + S.blood * 0.3;
    sky.halo.material.color.setHex(0x7a90d0).lerp(tmpC.setHex(0xc8281c), S.blood);
    sky.sun.position.copy(sunDir).multiplyScalar(80);
    sky.sun.material.opacity = clamp(x - 0.4, 0, 1);
    sky.hills.material.color.setScalar(0.35 + 0.65 * clamp(x / 2, 0, 1));
    WOLF_RIM.value.setHex(0x26304e).multiplyScalar(clamp(1 - x * 0.6, 0.2, 1));
    fx.fire.base = mix('fire');
    fx.fire.power = fx.fire.base * (1 - 0.5 * S.fear);
    renderer.toneMappingExposure = mix('exposure');
    fx.setMist(x < 1 ? 0x8a9ac0 : 0xe8e4e0, mix('mist'));
    audio.setNight(clamp(1 - x, 0, 1));
    audio.setFire(fx.fire.power);
  }

  function flicker() {
    const t = S.time;
    const p = fx.fire.power;
    const f = 0.82 + Math.sin(t * 13) * 0.07 + Math.sin(t * 29 + 1) * 0.05 + Math.sin(t * 7.3) * 0.06 + (Math.random() - 0.5) * 0.05;
    fireLight.intensity = 10 * p * f;
    fireLight.position.x = Math.sin(t * 5.1) * 0.05;
    fireLight.position.z = Math.cos(t * 4.3) * 0.05;
    emberLight.intensity = 2.2 * p * (0.9 + Math.sin(t * 3) * 0.1);
    if (S.world) S.world.pit.charred.emissiveIntensity = (0.9 + 0.5 * p) * f;
  }

  function toTime(target, dur) {
    const from = S.tod;
    return anim(dur, (e) => { S.tod = lerp(from, target, e); }, EASE.inOut);
  }

  // ---------- Légende ----------

  function setCaption(title, sub, tone, dur) {
    clearTimeout(setCaption.timer);
    if (!title) {
      captionEl.classList.remove('show');
      return;
    }
    captionEl.className = `tb3d-caption show ${tone || ''}`;
    // Espace insécable avant ! ? : ; (le point d'exclamation ne part pas seul à la ligne)
    const fr = (t) => esc(t).replace(/ ([!?:;])/g, '\u00a0$1');
    captionEl.innerHTML = `<b>${fr(title)}</b>${sub ? `<span>${fr(sub)}</span>` : ''}`;
    if (dur) setCaption.timer = setTimeout(() => captionEl.classList.remove('show'), dur * 1000);
  }

  function flash(color, dur) {
    flashEl.style.background = color || '#fff6dc';
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '1';
    void flashEl.offsetWidth;
    flashEl.style.transition = `opacity ${dur || 1.2}s ease-out`;
    flashEl.style.opacity = '0';
  }

  function blackout(on, dur) {
    flashEl.style.background = '#000';
    flashEl.style.transition = `opacity ${dur || 0.8}s ease`;
    flashEl.style.opacity = on ? '1' : '0';
  }

  function setGhost(on) {
    S.ghost = on;
    ghostEl.classList.toggle('show', !!on);
  }

  function roleText(role) {
    return ROLE[role] ? ROLE[role].name : '?';
  }

  // ---------- Le loup ----------

  function placeWolf(w, pos, yaw) {
    w.group.position.copy(pos);
    w.group.rotation.y = yaw;
    w.blob.position.set(pos.x, (pos.y > 0.05 ? WD.heightAt(pos.x, pos.z) : pos.y) + 0.02, pos.z);
    w.blob.rotation.z = -yaw;
    w.blob.visible = w.group.visible;
  }

  const yawOf = (dir) => Math.atan2(dir.x, dir.z);
  const ground = (p) => p.setY(WD.heightAt(p.x, p.z));

  // Le loup sort du bois derrière sa victime, l'attrape et l'emporte dans la forêt.
  async function wolfTakes(id, w, seed, gen, delay) {
    const W = S.world;
    const av = W.avatars[id];
    if (!av) return;
    const rnd = TX.rng(seed);
    const u = outward(id);
    const a = angleOf(id);
    const tg = V(Math.cos(a), 0, -Math.sin(a));
    const seat = seatPos(id);
    // Le loup arrive et repart en biais, du côté où on le voit de profil (pas caché derrière sa proie).
    const look = seat.clone().sub(camera.getWorldPosition(V(0, 0, 0))).setY(0).normalize();
    const slant = 0.7 + rnd() * 0.3;
    const away = (s) => u.clone().addScaledVector(tg, s * slant).normalize();
    const side = Math.abs(away(-1).dot(look)) < Math.abs(away(1).dot(look)) ? -1 : 1;
    const dir = away(side);
    const start = ground(seat.clone().addScaledVector(u, 6.5).addScaledVector(tg, side * 2.4));
    const near = ground(seat.clone().addScaledVector(u, 2.2).addScaledVector(tg, side * 0.9));
    const behind = seat.clone().addScaledVector(u, 0.5).addScaledVector(tg, side * 0.3);
    if (delay) await wait(delay);
    if (gen !== S.gen) return;
    // 1. Deux yeux jaunes dans l'obscurité.
    S.fearTarget = 1;
    w.group.visible = true;
    placeWolf(w, start, yawOf(seat.clone().sub(start)));
    S.yawTarget = yawToward(id, true);
    S.lastDrag = -10;
    audio.heartbeat(3);
    audio.growl(2.4, 0.35);
    await anim(2.4, (e, t) => { poseWolf(w, 'growl', S.time, { glow: clamp(t * 2, 0, 1), jaw: 0.2 + Math.sin(S.time * 3) * 0.1, neck: -0.1 }); });
    if (gen !== S.gen) return;
    // 2. Il fonce vers sa proie.
    audio.rustle(0.15);
    audio.steps(6, 0.2);
    const t0 = S.time;
    await anim(1.25, (e) => {
      const p = start.clone().lerp(near, e);
      ground(p);
      placeWolf(w, p, yawOf(near.clone().sub(start)));
      poseWolf(w, 'run', (S.time - t0) * 2.6, { jaw: 0.3 });
    }, EASE.in);
    if (gen !== S.gen) return;
    // 3. Bond : la gueule se referme sur le col.
    audio.snarl();
    av.scripted = true;
    av.scriptPose = { sit: 1, lean: -0.1, arms: ['peur', 'peur'], eyes: 1.35, open: 0.8, pitch: -0.3 };
    const collar = () => av.group.localToWorld(V(0, av.headY - 0.24, -0.05));
    const yawIn = yawOf(seat.clone().sub(behind));
    await anim(0.32, (e) => {
      const p = near.clone().lerp(behind, e);
      p.y = Math.sin(Math.PI * e) * 0.35;
      placeWolf(w, p, yawIn);
      poseWolf(w, 'leap', e, { jaw: 1 - e * 0.6 });
    });
    if (gen !== S.gen) return;
    audio.bite();
    audio.scream();
    vibrate([60, 30, 120]);
    S.stir = S.time;
    S.stirAt = seat.clone().setY(0.9);
    fx.puff(seat.clone().setY(0.4), 22, [0.35, 0.3, 0.25, 0.3], 1.2);
    // 4. Il tire : la victime bascule en arrière, par-dessus son rondin.
    const lie = (tilt) => new THREE.Euler(-tilt, a + Math.PI, 0, 'YXZ');
    const g0 = av.group.position.clone();
    const q0 = av.group.quaternion.clone();
    av.scriptPose = { sit: 0, lean: 0, arms: ['traine', 'traine'], eyes: 1.35, open: 0.9, pitch: -0.5 };
    const holdAt = (out) => {
      // La tête de la victime suit la gueule du loup ; les pieds traînent au sol.
      const m = mouthPos(w);
      const tilt = Math.PI / 2 - Math.asin(clamp((m.y - 0.08) / 1.5, 0.05, 0.7));
      const q = new THREE.Quaternion().setFromEuler(lie(tilt));
      const off = V(0, av.headY - 0.22, -0.04).applyQuaternion(q);
      out.pos = m.sub(off);
      out.q = q;
      return out;
    };
    const tmp = {};
    await anim(0.55, (e) => {
      const p = behind.clone().addScaledVector(dir, e * 0.45);
      placeWolf(w, p, yawIn);
      poseWolf(w, 'drag', 0, { jaw: 0.35, head: 0.15 * e });
      holdAt(tmp);
      av.group.position.lerpVectors(g0, tmp.pos, EASE.out(e));
      av.group.quaternion.slerpQuaternions(q0, tmp.q, EASE.out(e));
    });
    if (gen !== S.gen) return;
    // 5. Et l'emporte à reculons dans la forêt, jusqu'à disparaître dans le brouillard.
    audio.drag(3.6);
    audio.growl(3.2, 0.25);
    const from = behind.clone().addScaledVector(dir, 0.45);
    const far = ground(seat.clone().addScaledVector(dir, 11));
    const t1 = S.time;
    await anim(3.8, (e) => {
      const p = from.clone().lerp(far, e);
      ground(p);
      placeWolf(w, p, yawOf(seat.clone().sub(p)) + Math.sin(S.time * 3) * 0.08);
      poseWolf(w, 'drag', (S.time - t1) * 1.5, { jaw: 0.35, head: 0.15, yaw: Math.sin(S.time * 5) * 0.12 });
      holdAt(tmp);
      av.group.position.copy(tmp.pos);
      av.group.quaternion.copy(tmp.q);
      // Le regard suit le loup et sa proie jusqu'à l'orée du bois.
      if (S.time - S.lastDrag > 3) S.yawTarget = yawToward(w.group.position.clone().lerp(tmp.pos, 0.5), true);
      const fade = clamp((e - 0.75) / 0.25, 0, 1);
      if (fade > 0.9) { av.group.visible = false; w.group.visible = false; w.blob.visible = false; }
    }, EASE.in);
    av.group.visible = false;
    w.group.visible = false;
    w.blob.visible = false;
    av.scripted = false;
    S.fearTarget = 0;
    S.yawTarget = 0;
  }

  // C'est moi qu'on emporte : le loup traverse la clairière et me saute dessus.
  async function wolfTakesMe(w, seed, gen) {
    const W = S.world;
    const rnd = TX.rng(seed);
    const side = rnd() < 0.5 ? -1 : 1;
    const start = ground(V(side * 2.4, 0, -(W.R + 4.5)));
    const near = ground(V(side * 1.0, 0, W.R - 1.1));
    S.yawTarget = 0;
    S.lastDrag = -10;
    w.group.visible = true;
    placeWolf(w, start, yawOf(V(0, 0, W.R).sub(start)));
    audio.heartbeat(4);
    audio.growl(2.6, 0.4);
    await anim(2.6, (e, t) => { poseWolf(w, 'growl', S.time, { glow: clamp(t * 2, 0, 1), jaw: 0.25 + Math.sin(S.time * 3) * 0.1, neck: -0.05 }); });
    if (gen !== S.gen) return;
    audio.rustle(0.15);
    audio.steps(7, 0.2);
    const t0 = S.time;
    await anim(1.5, (e) => {
      const p = start.clone().lerp(near, e);
      ground(p);
      placeWolf(w, p, yawOf(near.clone().sub(start)));
      poseWolf(w, 'run', (S.time - t0) * 2.6, { jaw: 0.4 });
    }, EASE.in);
    if (gen !== S.gen) return;
    audio.snarl();
    camera.updateWorldMatrix(true, false);
    const cam = camera.getWorldPosition(V(0, 0, 0));
    const leapTo = cam.clone().add(V(0, -0.9, -0.55));
    await anim(0.3, (e) => {
      const p = near.clone().lerp(leapTo, e);
      p.y += Math.sin(Math.PI * e) * 0.3;
      placeWolf(w, p, yawOf(cam.clone().sub(near)));
      poseWolf(w, 'leap', e, { jaw: 1 });
    });
    if (gen !== S.gen) return;
    // Choc : écran rouge, secousse, puis on est traîné loin du feu.
    audio.bite();
    flash('#7a0000', 1.6);
    vibrate([200, 60, 300]);
    S.shake = 1.4;
    w.group.visible = false;
    w.blob.visible = false;
    audio.drag(3.2);
    audio.growl(3, 0.45);
    setCaption('Le loup t\'emporte !', null, 'red');
    rig.updateMatrixWorld();
    const c0 = camera.position.clone();
    await anim(3.2, (e, t) => {
      const back = EASE.in(t) * 9;
      S.camOverride = {
        pos: V(c0.x + Math.sin(S.time * 7) * 0.05, lerp(c0.y, 0.32, EASE.out(clamp(t * 3, 0, 1))) + Math.abs(Math.sin(S.time * 9)) * 0.05, c0.z + back),
        pitch: lerp(S.view.pitch, 0.05, EASE.out(clamp(t * 3, 0, 1))) + Math.sin(S.time * 11) * 0.03,
        yaw: Math.sin(S.time * 2.3) * 0.15,
        roll: 0.25 * Math.sin(S.time * 1.7),
      };
      if (t > 0.65 && !S.blackDone) { S.blackDone = true; blackout(true, 0.9); }
    });
    S.blackDone = false;
    if (gen !== S.gen) return;
    setCaption('Tu as été dévoré !', 'Tu es mort : tu vois maintenant tous les rôles.', 'red');
    await wait(1.6);
    S.camOverride = null;
    S.myDeathPlayed = true;
    setGhost(true);
    blackout(false, 1.2);
  }

  // Un loup rôde, mais personne n'est mort : la sorcière veillait.
  async function wolfProwls(w, gen) {
    const W = S.world;
    const p = ground(V(-2.5, 0, -(W.R + 5)));
    S.fearTarget = 0.5;
    w.group.visible = true;
    placeWolf(w, p, yawOf(V(0, 0, 0).sub(p)));
    audio.growl(2, 0.3);
    await anim(2.4, (e, t) => { poseWolf(w, 'growl', S.time, { glow: Math.sin(Math.PI * t), jaw: 0.15 }); });
    S.fearTarget = 0;
    w.group.visible = false;
    w.blob.visible = false;
  }

  // ---------- Événements du journal ----------

  async function playDawn(e, gen) {
    const W = S.world;
    S.selected = null;
    S.lifted = false;
    setCaption(`Nuit ${e.night}`, 'Les loups-garous rôdent…', 'soft');
    if (S.tod > 0.2) await toTime(0, 1.2);
    await wait(0.8);
    if (gen !== S.gen) return;
    const victims = e.dead.map((d) => d.id);
    if (!victims.length) {
      await wolfProwls(W.wolves[0], gen);
    } else {
      // Toutes les morts de la nuit passent par le loup : on ne trahit pas la potion de la sorcière.
      await Promise.all(victims.map((id, i) => (id === S.me
        ? wolfTakesMe(W.wolves[i], e.night * 13 + id, gen)
        : wolfTakes(id, W.wolves[i], e.night * 13 + id, gen, i * 1.6))));
    }
    if (gen !== S.gen) return;
    // Le jour se lève.
    setCaption(null);
    audio.bells(4);
    S.stir = -99;
    await toTime(2, 4.2);
    if (gen !== S.gen) return;
    S.k++;
    refresh();
    const names = e.dead.map((d) => `${d.id === S.me ? 'toi' : nameOf(d.id)} (${roleText(d.role)})`);
    if (e.dead.length) {
      setCaption(`Jour ${e.night}`, `${e.dead.length > 1 ? 'Morts cette nuit' : 'Mort cette nuit'} : ${names.join(' et ')}`, 'gold', 4.5);
      const first = e.dead.find((d) => d.id !== S.me);
      if (first) S.yawTarget = yawToward(seatPos(first.id, 0.4).setY(0.8));
    } else {
      setCaption(`Jour ${e.night}`, 'Personne n\'est mort cette nuit !', 'green', 4);
    }
    await wait(2.2);
  }

  async function playVote(e, gen) {
    const W = S.world;
    S.selected = null;
    if (!e.dead) {
      audio.vote();
      setCaption('Égalité', 'Personne n\'est éliminé.', 'soft', 3);
      await wait(2.5);
      S.k++;
      refresh();
      return;
    }
    const id = e.dead.id;
    const role = e.dead.role;
    audio.vote();
    S.accuse = id;
    S.yawTarget = id === S.me ? 0 : yawToward(id);
    S.lastDrag = -10;
    setCaption(id === S.me ? 'Le village t\'a désigné…' : `Le village désigne ${nameOf(id)}`, null, 'soft');
    await wait(1.6);
    if (gen !== S.gen) return;
    audio.gasp();
    const av = W.avatars[id];
    if (av) {
      av.scripted = true;
      av.scriptPose = { sit: 0, lean: 0.25, arms: ['pendre', 'pendre'], eyes: 1, open: 0, pitch: 0.35 };
      await wait(0.9);
      floatCard('ban', headPos(id).add(V(0, 0.45, 0)), role, true);
    } else {
      setGhost(true);
    }
    audio.swish();
    setCaption(id === S.me ? 'Tu es éliminé !' : `${nameOf(id)} est éliminé`, `C'était : ${roleText(role)}`, role === 'wolf' ? 'green' : 'red');
    await wait(2.6);
    if (gen !== S.gen) return;
    dropFloating('ban');
    S.accuse = null;
    if (av) {
      // Il quitte le cercle et s'enfonce dans les bois.
      const a = angleOf(id);
      const from = av.group.position.clone();
      const to = ground(seatPos(id, 7));
      await anim(0.6, (e2) => { av.group.rotation.y = a + Math.PI - Math.PI * e2; });
      av.walk = 1;
      av.scriptPose = { sit: 0, lean: 0.12, arms: ['pendre', 'pendre'], eyes: 1, open: 0, pitch: 0.3 };
      await anim(4, (e2) => {
        av.group.position.lerpVectors(from, to, e2);
        ground(av.group.position);
        if (e2 > 0.85) av.group.visible = false;
      });
      av.walk = 0;
      av.group.visible = false;
      av.scripted = false;
      av.group.rotation.y = a + Math.PI;
    }
    setCaption(null);
    S.k++;
    refresh();
  }

  async function playHunter(e, gen) {
    const W = S.world;
    S.selected = null;
    const shooter = W.avatars[e.by];
    const target = W.avatars[e.target];
    setCaption(e.by === S.me ? 'Tu tires…' : `${nameOf(e.by)} épaule son fusil…`, null, 'soft');
    S.yawTarget = e.target === S.me ? 0 : yawToward(e.target);
    let muzzle = seatPos(e.by, 0.4).setY(1.4);
    if (shooter) {
      showHunter(e.by, e.target);
      await wait(1.4);
      muzzle = shooter.rifleTip ? shooter.rifleTip.getWorldPosition(V(0, 0, 0)) : muzzle;
    } else {
      await wait(1);
    }
    if (gen !== S.gen) return;
    audio.gunshot();
    fx.shot(muzzle);
    flash('#fff2c8', 0.4);
    S.shake = 0.5;
    vibrate(80);
    if (target) {
      target.scripted = true;
      target.scriptPose = { sit: 1, lean: -1.45, arms: ['pendre', 'pendre'], eyes: 0.1, open: 0.4, pitch: -0.2 };
      audio.gasp();
      await wait(1.6);
      fx.puff(target.group.position.clone().setY(0.3), 30, [0.4, 0.38, 0.35, 0.4], 1.2);
      target.group.visible = false;
      target.scripted = false;
    } else if (e.target === S.me) {
      const p0 = S.view.pitch;
      await anim(0.8, (k) => { S.camOverride = { pos: V(0, lerp(S.view.height, 0.5, k), S.view.dist + k * 0.4), pitch: lerp(p0, 0.9, k), yaw: 0, roll: k * 0.4 }; }, EASE.in);
      blackout(true, 0.6);
      await wait(1);
      S.camOverride = null;
      setGhost(true);
      blackout(false, 1);
    }
    hideHunter(e.by);
    setCaption(`${e.by === S.me ? 'Tu as' : `${nameOf(e.by)} a`} tiré sur ${e.target === S.me ? 'toi' : nameOf(e.target)}`, `C'était : ${roleText(e.role)}`, 'red', 3.5);
    await wait(1.5);
    S.k++;
    refresh();
  }

  // Le chasseur, debout près de sa stèle, fusil en main.
  function showHunter(id, aimAt) {
    const W = S.world;
    const av = W.avatars[id];
    if (!av) return;
    av.group.visible = true;
    av.group.position.copy(seatPos(id, 0.3));
    av.group.quaternion.setFromEuler(new THREE.Euler(0, angleOf(id) + Math.PI, 0, 'YXZ'));
    av.scripted = true;
    av.scriptPose = { sit: 0, lean: 0, arms: ['fusil', 'fusil'], eyes: 1, open: 0, look: aimAt };
    if (!av.rifle) {
      const r = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.8, roughness: 0.4 });
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), steel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.42;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.45), wood);
      stock.position.set(0, -0.02, -0.05);
      const tip = new THREE.Object3D();
      tip.position.z = 0.8;
      r.add(barrel, stock, tip);
      av.arms[1].userData.elbow.add(r);
      r.position.set(0, -0.27, 0.02);
      r.rotation.x = -Math.PI / 2;
      av.rifle = r;
      av.rifleTip = tip;
    }
    av.rifle.visible = true;
    if (typeof aimAt === 'number' && W.avatars[aimAt]) av.scriptPose.pointAt = aimAt;
  }

  function hideHunter(id) {
    const av = S.world.avatars[id];
    if (!av || !av.rifle) return;
    av.rifle.visible = false;
    av.scripted = false;
    av.group.visible = false;
  }

  // ---------- Début, tombée de la nuit, visions, fin ----------

  async function intro(gen) {
    S.tod = 1;
    setCaption('La nuit tombe sur Thiercelieux', 'Chacun découvre son rôle en secret…', 'gold', 3);
    await wait(1.2);
    if (gen !== S.gen) return;
    audio.swish();
    S.lifted = true;
    const role = S.g.myRole;
    await wait(1.1);
    if (gen !== S.gen) return;
    setCaption(`Tu es ${role === 'villager' ? 'Villageois' : roleText(role)}`, describe(role), role === 'wolf' ? 'red' : 'blue');
    await wait(3.2);
    if (gen !== S.gen) return;
    S.lifted = false;
    audio.swish();
    await nightfall(gen);
  }

  function describe(role) {
    return {
      wolf: 'Chaque nuit, dévore un villageois avec ta meute.',
      villager: 'Démasque les loups-garous lors des votes du jour.',
      seer: 'Chaque nuit, découvre le rôle d\'un joueur.',
      witch: 'Une potion de vie, une potion de mort.',
      hunter: 'Si tu meurs, tu emportes quelqu\'un avec toi.',
    }[role] || '';
  }

  async function nightfall(gen) {
    audio.dusk();
    const D = S.shown;
    setCaption(`Nuit ${D ? D.night : 1}`, 'Le village s\'endort…', 'soft', 3.5);
    await toTime(0, 3.2);
  }

  async function daybreak(gen) {
    audio.bells(3);
    await toTime(2, 3);
  }

  async function playVision(gen) {
    const W = S.world;
    const log = S.g.seerLog;
    const v = log[S.seerSeen];
    S.seerSeen++;
    if (!v || v.night !== S.g.night || !W.avatars[v.target]) { refresh(); return; }
    S.yawTarget = yawToward(v.target);
    S.lastDrag = -10;
    const at = headPos(v.target).add(V(0, 0.5, 0));
    audio.magic();
    fx.magic(headPos(v.target), [0.7, 0.5, 1]);
    floatCard('vision', at, v.role, true);
    S.vision = { night: v.night, target: v.target };
    setCaption(`${nameOf(v.target)} est ${roleText(v.role)}`, 'Ta vision de la nuit', 'blue', 4);
    await wait(1.2);
    refresh();
  }

  async function playEnd(gen) {
    const W = S.world;
    const g = S.g;
    S.selected = null;
    S.lifted = false;
    dropFloating('vision');
    await wait(0.4);
    if (gen !== S.gen) return;
    const wolvesWin = g.winner === 'wolves';
    if (wolvesWin) {
      if (S.tod > 0.2) await toTime(0, 2.2);
      anim(2.5, (e) => { S.blood = e; });
      S.endState = 'wolves';
      audio.howls();
      // Deux loups hurlent à la lune, à l'orée du bois.
      W.wolves.forEach((w, i) => {
        const p = ground(V((i ? 1 : -1) * 1.7, 0, -(W.R + 2.4)));
        w.group.visible = true;
        placeWolf(w, p, yawOf(V(0, 0, 0).sub(p)) + (i ? -0.5 : 0.5));
        poseWolf(w, 'howl', 0, { jaw: 0.8, glow: 1 });
      });
    } else {
      if (S.tod < 1.8) await daybreak(gen);
      S.endState = 'village';
      audio.peal();
    }
    // Tous les rôles se dévoilent au-dessus des têtes.
    const roles = g.roles || {};
    S.shown.alive.forEach((id, i) => {
      if (!W.avatars[id] || !roles[id]) return;
      setTimeout(() => { if (S.world === W) floatCard(`end${id}`, headPos(id).add(V(0, 0.55, 0)), roles[id], true); }, i * 150);
    });
    const won = (g.myRole === 'wolf') === wolvesWin;
    setCaption(wolvesWin ? 'Les loups-garous gagnent !' : 'Le village gagne !', won ? 'Victoire !' : 'Défaite…', wolvesWin ? 'red' : 'green');
    await wait(3.2);
    if (gen !== S.gen) return;
    S.ended = true;
    setCaption(null);
    changed();
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
        } else if (S.k < g.events.length) {
          // Gros retard (onglet en arrière-plan) : on saute aux derniers événements.
          if (g.events.length - S.k > 2) {
            S.k = g.events.length - 1;
            refresh();
          }
          const e = g.events[S.k];
          if (e.type === 'dawn') await playDawn(e, gen);
          else if (e.type === 'vote') await playVote(e, gen);
          else if (e.type === 'hunter') await playHunter(e, gen);
          else { S.k++; refresh(); }
        } else if (g.phase === 'end') {
          if (!S.endPlayed) {
            S.endPlayed = true;
            await playEnd(gen);
          }
          break;
        } else if (g.myRole === 'seer' && g.seerLog && S.seerSeen < g.seerLog.length) {
          await playVision(gen);
        } else if (Math.abs(todFor(S.shown) - S.tod) > 0.05) {
          if (todFor(S.shown) < S.tod) await nightfall(gen);
          else await daybreak(gen);
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

  function ambient(dt) {
    WD.clock.value = S.time;
    S.fear = lerp(S.fear, S.fearTarget, damp(1.4, dt));
    flicker();
    applySky();
    const D = S.shown;
    // Le chasseur attend, fusil en main, qu'on lui désigne sa cible.
    if (D && D.done && D.phase === 'hunter' && S.world.avatars[D.hunter] && !S.running) {
      const av = S.world.avatars[D.hunter];
      if (!av.rifle || !av.rifle.visible) showHunter(D.hunter, null);
      av.scriptPose.look = S.selected !== null && S.world.avatars[S.selected] ? S.selected : null;
      av.scriptPose.pointAt = av.scriptPose.look === null ? undefined : av.scriptPose.look;
    }
    if (S.vision && (!D || (D.phase !== 'night' && D.phase !== 'witch') || S.g.night !== S.vision.night)) {
      dropFloating('vision');
      S.vision = null;
    }
    // Les loups de la fin hurlent par intervalles.
    if (S.endState === 'wolves') {
      S.world.wolves.forEach((w, i) => { if (w.group.visible) poseWolf(w, 'howl', 0, { jaw: 0.5 + Math.sin(S.time * 0.8 + i) * 0.4, glow: 1, neck: Math.sin(S.time * 0.5 + i) * 0.1 }); });
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
    step(dt);
  }

  function step(dt) {
    S.time += dt;
    if (!S.world) return;
    updateCamera(dt);
    runAnims();
    ambient(dt);
    animateAvatars(dt);
    updateOverlays(dt);
    placeMyCard(dt);
    fx.update(dt, S.time, camera, clamp(1 - S.tod, 0, 1));
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
    down = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch, moved: false };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) down.moved = true;
    if (down.moved) {
      S.dragging = true;
      S.yaw = clamp(down.yaw + (dx / container.clientWidth) * 2.4, -1.5, 1.5);
      S.pitch = clamp(down.pitch + (dy / container.clientHeight) * 1.2, -0.25, 0.6);
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
    if (!W || S.camOverride) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), camera);
    const targets = [{ obj: W.myCard, id: 'card' }];
    Object.keys(W.avatars).forEach((key) => {
      const av = W.avatars[key];
      if (av.group.visible) av.group.traverse((o) => { if (o.isMesh) targets.push({ obj: o, id: Number(key) }); });
    });
    const hits = ray.intersectObjects(targets.map((t) => t.obj), false);
    if (!hits.length) {
      if (S.lifted) toggleRole();
      return;
    }
    const hit = targets.find((t) => t.obj === hits[0].object);
    if (hit.id === 'card') { toggleRole(); return; }
    if (canPick().includes(hit.id)) select(S.selected === hit.id ? null : hit.id);
  }

  // Joueurs que je peux désigner maintenant (vote, victime, vision, tir, poison).
  function canPick() {
    const D = S.shown;
    const g = S.g;
    if (!D || !D.done || S.running || S.pending) return [];
    const others = D.alive.filter((id) => id !== S.me);
    if (D.phase === 'hunter') return D.hunter === S.me ? others : [];
    if (!D.meAlive) return [];
    if (D.phase === 'night' && g.myRole === 'wolf') return D.alive.filter((id) => !(g.wolves || []).includes(id));
    if (D.phase === 'night' && g.myRole === 'seer' && !g.seerDone) return others;
    if (D.phase === 'witch' && g.myRole === 'witch' && g.potions && g.potions.death) return D.alive.slice();
    if (D.phase === 'day') return others;
    return [];
  }

  function select(id) {
    if (id !== null && !canPick().includes(id)) return;
    S.selected = id;
    if (id !== null && id !== S.me) S.yawTarget = yawToward(id);
    S.lastDrag = -10;
    audio.click();
    changed();
  }

  // Envoie le choix au serveur ; le type d'action dépend du moment.
  function confirm(extra) {
    const D = S.shown;
    const g = S.g;
    if (!D || S.pending) return;
    let type = null;
    if (D.phase === 'hunter') type = 'hunter';
    else if (D.phase === 'night' && g.myRole === 'wolf') type = 'wolf_vote';
    else if (D.phase === 'night' && g.myRole === 'seer') type = 'seer';
    else if (D.phase === 'witch') type = 'witch';
    else if (D.phase === 'day') type = 'vote';
    if (!type || (type !== 'witch' && S.selected === null)) return;
    const data = type === 'witch' ? Object.assign({ target: S.selected }, extra || {}) : { target: S.selected };
    S.pending = true;
    if (type !== 'vote' && type !== 'wolf_vote') S.selected = null;
    changed();
    Promise.resolve(options.onAct && options.onAct(type, data)).finally(() => {
      S.pending = false;
      changed();
    });
  }

  function toggleRole() {
    S.lifted = !S.lifted;
    audio.swish();
    changed();
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
      || g.events.length < S.k || (S.g.phase === 'end' && g.phase !== 'end') || g.night < S.g.night;
    S.room = room;
    S.g = g;
    if (fresh) {
      S.endState = null;
      build(room);
      S.k = g.events.length;
      S.introPending = g.events.length === 0 && g.night === 1 && g.phase === 'night' && !seatChange;
      S.seerSeen = g.seerLog ? g.seerLog.length : 0;
      refresh();
      S.tod = todFor(S.shown);
      if (g.phase === 'end') {
        S.endPlayed = false;
      }
    } else if (!S.running) {
      refresh();
    }
    run();
    changed();
  }

  function view() {
    return {
      g: S.shown,
      selected: S.selected,
      canPick: canPick(),
      pending: S.pending,
      busy: S.running,
      ended: S.ended,
      lifted: S.lifted,
      sound: audio.on,
      known: S.shown ? knownRoles() : {},
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
    select: (id) => select(id),
    confirm,
    toggleRole,
    sound,
    resize: () => frame(false),
    debug: { S, camera, scene, renderer, step, start, stop, poseWolf, placeWolf, wolfTakes, wolfTakesMe, refresh, frame, applySky, fx, audio, floatCard },
  };
}
