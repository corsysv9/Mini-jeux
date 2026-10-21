// Mini-jeux : interface (vanilla JS). L'état vient de l'API PHP, rafraîchi toutes les 1,5 s.
'use strict';

const API = 'api/index.php';
const POLL_MS = 1500;
const POLL_HIDDEN_MS = 5000;

const GAMES = {
  undercover: { name: 'Undercover', min: 3, max: 20, desc: 'Un mot secret, trouvez les intrus' },
  timebomb: { name: 'Time Bomb', min: 4, max: 8, desc: 'Désamorcez la bombe' },
  loupgarou: { name: 'Loup-garou', min: 5, max: 20, desc: "L'appli fait le meneur" },
};

const AVATAR_COLORS = ['#7a4fd0', '#2f7d8a', '#a3532a', '#3f7d4e', '#2f5d8a', '#a33a6b', '#6b6b2a', '#8a4f2f'];

const ICONS = {
  moon: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
  sound: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6M22 9l-6 6"/></svg>',
  scissors: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
};

const S = {
  session: loadJSON('mj_session'),
  room: null,
  reveal: {},
  draft: {},
  busy: false,
  pollTimer: null,
  installPrompt: null,
  apk: false,
  as: null, // mode test : id du joueur test incarné par l'hôte
};

const app = document.getElementById('app');

// ---------- Utilitaires ----------

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function saveJSON(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* stockage indisponible : on continue sans */ }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function name(id) {
  const p = S.room && S.room.players.find((x) => x.id === id);
  return p ? esc(p.name) : '?';
}
function realMe() { return S.room.realMe !== undefined ? S.room.realMe : S.room.me; }
function isHost() { return S.room && S.room.hostId === realMe(); }
function bots() { return S.room.players.filter((p) => p.bot); }
function settings() { return Array.isArray(S.room.settings) ? {} : S.room.settings; }
function allIds() { return S.room.players.map((p) => p.id); }
function plural(n, word) { return `${n} ${word}${n > 1 ? 's' : ''}`; }
function tally(votes) {
  const count = {};
  Object.keys(votes || {}).forEach((k) => { count[votes[k]] = (count[votes[k]] || 0) + 1; });
  return count;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

async function api(action, data) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action }, data || {})),
  });
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('Serveur injoignable.'); }
  if (!json.ok) throw new Error(json.error || 'Erreur inconnue.');
  return json;
}

// Action sur le salon courant ; met à jour l'affichage avec la réponse.
async function send(action, data) {
  if (S.busy) return;
  S.busy = true;
  try {
    const as = S.as;
    const res = await api(action, Object.assign({ code: S.session.code, token: S.session.token, as }, data || {}));
    if (res.room && as === S.as) setRoom(res.room);
  } catch (e) {
    toast(e.message);
  } finally {
    S.busy = false;
  }
}
function play(type, data) { return send('play', Object.assign({ type }, data || {})); }

function setRoom(room) {
  const prev = S.room;
  // Une réponse de polling partie avant une action peut arriver après : on l'ignore.
  if (prev && prev.code === room.code && room.v < prev.v) return;
  S.room = room;
  // Joueur test retiré : le serveur nous a rendu notre propre point de vue.
  if (S.as && room.me !== S.as) S.as = null;
  // Nouvelle partie : les cartes secrètes sont recachées.
  const newGame = !prev || prev.status !== room.status || (prev.g && room.g && prev.g.phase === 'end' && room.g.phase !== 'end');
  if (newGame) S.reveal = {};
  render();
}

function leaveSession(msg) {
  S.session = null;
  S.room = null;
  S.as = null;
  saveJSON('mj_session', null);
  if (msg) toast(msg);
  render();
}

// ---------- Polling ----------

async function poll() {
  clearTimeout(S.pollTimer);
  if (S.session && !S.busy) {
    try {
      const as = S.as;
      const res = await api('state', { code: S.session.code, token: S.session.token, as, v: S.room ? S.room.v : 0 });
      // Réponse demandée pour un autre joueur (on vient de changer) : ignorée.
      if (res.room && as === S.as) setRoom(res.room);
    } catch (e) {
      if (/n'existe|ne fais pas partie/.test(e.message)) leaveSession(e.message);
    }
  }
  S.pollTimer = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

// ---------- Time Bomb en 3D (chargé seulement quand on en a besoin) ----------

const TB3D = { mod: null, inst: null, loading: null, failed: false, shown: null };

function tb3dWanted() {
  let pref = '1';
  try { pref = localStorage.getItem('mj_tb3d') || '1'; } catch (e) { /* stockage indisponible */ }
  return pref === '1' && !TB3D.failed;
}

function loadTB3D() {
  if (!TB3D.loading) {
    TB3D.loading = import(new URL('assets/timebomb3d/main.js?v=1', document.baseURI).href)
      .then((mod) => { TB3D.mod = mod; })
      .catch(() => { TB3D.failed = true; });
  }
  return TB3D.loading;
}

// Affiche (ou cache) la scène 3D selon l'état du salon ; renvoie true si elle est visible.
function syncTB3D() {
  const r = S.room;
  const want = !!(r && r.status !== 'lobby' && r.game === 'timebomb' && r.g && tb3dWanted() && r.players.some((p) => p.id === r.me));
  if (!want) {
    if (TB3D.inst && TB3D.shown) TB3D.inst.show(null);
    TB3D.shown = null;
    return false;
  }
  if (!TB3D.mod) {
    loadTB3D().then(render);
    return false;
  }
  if (!TB3D.inst) {
    try {
      TB3D.inst = TB3D.mod.createTimeBomb3D({
        style: 'victorien',
        table: 'feutre',
        onChange: () => render(),
        onCut: (target, slot) => play('cut', { target, slot }),
      });
    } catch (e) {
      TB3D.failed = true;
      toast('Vue 3D indisponible sur cet appareil.');
      return false;
    }
  }
  if (TB3D.shown !== r) {
    TB3D.shown = r;
    TB3D.inst.show(r);
  }
  return true;
}

// ---------- Rendu ----------

function render() {
  // Conserve le champ en cours de saisie à travers les rafraîchissements.
  const focused = document.activeElement && document.activeElement.id;
  let html;
  let night = false;
  const in3d = syncTB3D();
  if (!S.session) html = viewHome();
  else if (!S.room) html = '<p class="center muted">Connexion au salon…</p>';
  else if (S.room.status === 'lobby') {
    html = viewLobby();
    if (S.room.game === 'timebomb' && tb3dWanted()) loadTB3D(); // préchargement pendant qu'on attend
  } else if (in3d) html = viewTimeBomb3D();
  else if (S.room.game === 'timebomb' && tb3dWanted() && !TB3D.mod) html = '<p class="center muted">Ouverture de Big Ben…</p>';
  else {
    html = viewGame();
    night = S.room.game === 'loupgarou' && ['night', 'witch'].includes(S.room.g.phase);
  }
  document.body.classList.toggle('night', night);
  document.body.classList.toggle('tb3d', in3d);
  document.querySelector('meta[name=theme-color]').content = in3d ? '#070a1f' : (night ? '#101a3a' : '#16131f');
  app.innerHTML = html;
  if (focused) {
    const el = document.getElementById(focused);
    if (el) {
      el.focus();
      if (el.setSelectionRange && typeof el.value === 'string') el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

function draft(id, fallback) {
  return S.draft[id] !== undefined ? S.draft[id] : (fallback === undefined ? '' : fallback);
}

// Carte à toucher pour révéler une info secrète.
function secret(key, label, value, hint, cls) {
  if (!S.reveal[key]) {
    return `<button class="secret hidden" data-act="toggle" data-key="${key}">
      <span class="label">${label}</span><span class="value">• • • • •</span><span class="hint">Toucher pour voir</span></button>`;
  }
  return `<button class="secret ${cls || ''}" data-act="toggle" data-key="${key}">
    <span class="label">${label}</span><span class="value">${value}</span><span class="hint">${hint || ''} Touche pour cacher.</span></button>`;
}

// Liste de joueurs ; opts.act rend les lignes cliquables.
function items(ids, opts) {
  opts = opts || {};
  return `<div class="list">${ids.map((id) => {
    const cls = ['item'];
    if (opts.selected === id) cls.push('selected');
    if (opts.dead && opts.dead(id)) cls.push('dead');
    const label = `<b>${name(id)}${id === S.room.me ? ' (toi)' : ''}</b>`;
    const right = opts.right ? opts.right(id) : '';
    const pickable = opts.act && (!opts.pick || opts.pick(id));
    if (opts.act) {
      return `<button class="${cls.join(' ')}" ${pickable ? `data-act="${opts.act}" data-id="${id}"` : 'disabled'}>${label}${right}</button>`;
    }
    return `<div class="${cls.join(' ')}">${label}${right}</div>`;
  }).join('')}</div>`;
}

function header(title) {
  return `<div class="topbar"><div class="title">${title}</div>
    <div class="right"><span class="roomcode">${S.room.code}</span>
    ${isHost() ? '<button class="inline secondary" data-act="lobby">Salon</button>' : ''}</div></div>`;
}

function viewHome() {
  const params = new URLSearchParams(location.search);
  const code = draft('code', params.get('r') || '');
  return `
    <div><div class="wordmark">Mini-jeux</div>
    <p class="muted" style="margin-top:6px">Entre amis, chacun sur son téléphone. Pas de compte, juste un code.</p></div>
    <div class="chips"><span class="chip">Undercover</span><span class="chip">Time Bomb</span><span class="chip">Loup-garou</span></div>
    <div class="card">
      <label for="name">Ton pseudo</label>
      <input id="name" maxlength="20" autocomplete="nickname" value="${esc(draft('name', localStorage.getItem('mj_name') || ''))}">
    </div>
    <div class="card">
      <label for="code">Rejoindre un salon</label>
      <input id="code" class="code" placeholder="CODE" maxlength="5" autocapitalize="characters" autocomplete="off" value="${esc(code)}">
      <button data-act="join">Rejoindre</button>
    </div>
    <div class="divider">ou</div>
    <button class="secondary" data-act="create">Créer un salon</button>
    <div class="bottom">
      ${S.apk ? '<a class="ghost-link" href="mini-jeux.apk" download>Télécharger l\'appli Android (APK)</a>' : ''}
      ${S.installPrompt ? '<button class="ghost" data-act="install">Installer l\'appli sur l\'écran d\'accueil</button>' : ''}
    </div>`;
}

// ---------- Salon ----------

function ucDefaults(n) {
  if (n <= 4) return { undercover: 1, mrwhite: 0 };
  if (n <= 6) return { undercover: 1, mrwhite: 1 };
  if (n <= 9) return { undercover: 2, mrwhite: 1 };
  return { undercover: 3, mrwhite: 1 };
}
function lgDefaults(n) {
  return { wolves: n <= 5 ? 1 : (n <= 11 ? 2 : 3), seer: 1, witch: n >= 6 ? 1 : 0, hunter: n >= 7 ? 1 : 0 };
}
function currentSettings() {
  const n = S.room.players.length;
  const s = settings();
  if (S.room.game === 'undercover') return Object.assign(ucDefaults(n), s);
  if (S.room.game === 'loupgarou') return Object.assign(lgDefaults(n), s);
  return {};
}

function statSetting(key, label, value, min, max) {
  if (!isHost()) return `<div><b>${value}</b><span>${label}</span></div>`;
  let opts = '';
  for (let i = min; i <= max; i++) opts += `<option value="${i}" ${i === Number(value) ? 'selected' : ''}>${i}</option>`;
  return `<div><select data-setting="${key}" aria-label="${label}">${opts}</select><span>${label}</span></div>`;
}
function toggleSetting(key, label, value) {
  const on = Number(value) ? 'on' : '';
  if (!isHost()) return `<div class="toggle ${on}">${label}<br><span class="small muted">${on ? 'oui' : 'non'}</span></div>`;
  return `<button class="toggle ${on}" data-act="toggle_setting" data-key="${key}" aria-pressed="${on ? 'true' : 'false'}">${label}<br><span class="small muted">${on ? 'oui' : 'non'}</span></button>`;
}

function viewSettings() {
  const n = S.room.players.length;
  const s = currentSettings();
  if (S.room.game === 'undercover') {
    const civils = Math.max(0, n - s.undercover - s.mrwhite);
    return `<div class="stats">
        <div><b>${civils}</b><span>${civils > 1 ? 'civils' : 'civil'}</span></div>
        ${statSetting('undercover', 'undercover', s.undercover, 0, Math.max(1, Math.floor(n / 2)))}
        ${statSetting('mrwhite', 'Mr White', s.mrwhite, 0, 2)}
      </div>
      <p class="small muted">Les undercovers ont un mot proche de celui des civils et ne savent pas qu'ils sont undercover. Mr White n'a pas de mot.</p>`;
  }
  if (S.room.game === 'loupgarou') {
    const special = Number(s.seer) + Number(s.witch) + Number(s.hunter);
    const villagers = Math.max(0, n - s.wolves - special);
    return `<div class="stats">
        ${statSetting('wolves', s.wolves > 1 ? 'loups' : 'loup', s.wolves, 1, Math.max(1, Math.ceil(n / 2) - 1))}
        <div><b>${villagers}</b><span>villageois</span></div>
        <div><b>${special}</b><span>${special > 1 ? 'rôles spéciaux' : 'rôle spécial'}</span></div>
      </div>
      <div class="toggles">${toggleSetting('seer', 'Voyante', s.seer)}${toggleSetting('witch', 'Sorcière', s.witch)}${toggleSetting('hunter', 'Chasseur', s.hunter)}</div>`;
  }
  const deck = { 4: [3, 2], 5: [3, 2], 6: [4, 2], 7: [5, 3], 8: [5, 3] }[Math.min(8, Math.max(4, n))];
  return `<div class="stats">
      <div><b>${deck[0]}</b><span>Sherlock</span></div>
      <div><b>${deck[1]}</b><span>Moriarty</span></div>
      <div><b>4</b><span>manches</span></div>
    </div>
    <p class="small muted">Trouvez les ${n} fils sans couper Big Ben.${n === 4 || n === 7 ? ' Un rôle est écarté au hasard : personne ne sait combien il y a de Moriarty.' : ''}</p>`;
}

function viewLobby() {
  const r = S.room;
  const meta = GAMES[r.game];
  const n = r.players.length;
  const host = isHost();
  const okCount = n >= meta.min && n <= meta.max;
  return `
    <div class="topbar"><div class="title">Salon</div><button class="inline secondary" data-act="leave">Quitter</button></div>
    <div class="card codecard">
      <div><div class="small muted">Code du salon</div><div class="bigcode">${r.code}</div></div>
      <button data-act="share">Partager</button>
    </div>
    <div class="section">Joueurs (${n})</div>
    <div class="grid2">${r.players.map((p) => `
      <div class="person">
        <span class="avatar" style="background:${AVATAR_COLORS[p.id % AVATAR_COLORS.length]}">${esc(p.name.charAt(0).toUpperCase())}</span>
        <span class="who"><b>${esc(p.name)}</b><span>${[p.id === r.hostId ? 'hôte' : '', p.id === realMe() ? 'toi' : '', p.bot ? 'test' : ''].filter(Boolean).join(' · ') || 'joueur'}</span></span>
        ${host && p.id !== realMe() ? `<button class="kick" data-act="kick" data-id="${p.id}" aria-label="Retirer ${esc(p.name)}">×</button>` : ''}
      </div>`).join('')}
    </div>
    ${host && n < 20 ? '<button class="secondary" data-act="add_bot">Ajouter un joueur test</button>' : ''}
    ${host && bots().length ? '<p class="small muted">Pendant la partie, tu pourras jouer à la place des joueurs test (barre en haut).</p>' : ''}
    <div class="section">Jeu</div>
    <div class="list">${Object.keys(GAMES).map((k) => {
      const tag = host ? 'button' : 'div';
      return `<${tag} class="game ${k === r.game ? 'active' : ''}" ${host ? `data-act="choose" data-game="${k}"` : ''}>
        <span><b>${GAMES[k].name}</b><span>${GAMES[k].desc} · ${GAMES[k].min} à ${GAMES[k].max}</span></span>
        ${k === r.game ? '<span class="badge accent">CHOISI</span>' : ''}
      </${tag}>`;
    }).join('')}
    </div>
    ${viewSettings()}
    <div class="bottom">${host
      ? `<button class="big" data-act="start" ${okCount ? '' : 'disabled'}>Lancer ${meta.name}</button>
         ${okCount ? '' : `<p class="small muted center">${meta.name} se joue de ${meta.min} à ${meta.max} joueurs.</p>`}`
      : `<p class="center muted">En attente que ${name(r.hostId)} lance la partie…</p>`}</div>`;
}

// Mode test : choisir quel joueur on incarne sur ce téléphone.
function asBar() {
  if (!isHost() || !bots().length) return '';
  const me = realMe();
  const ids = [me].concat(bots().map((p) => p.id));
  return `<div class="as-bar"><span class="small muted">Mode test, tu joues :</span><div class="chips">${ids.map((id) =>
    `<button class="chip ${id === S.room.me ? 'on' : ''}" data-act="as" data-id="${id}">${id === me ? 'Moi' : name(id)}</button>`).join('')}</div></div>`;
}

function viewGame() {
  const r = S.room;
  const views = { undercover: viewUndercover, timebomb: viewTimeBomb, loupgarou: viewLoupGarou };
  const ended = r.g.phase === 'end';
  return `
    ${header(GAMES[r.game].name)}
    ${asBar()}
    ${views[r.game](r.g)}
    ${ended ? `<div class="bottom">${isHost()
      ? '<button class="big" data-act="start">Rejouer</button><button class="secondary" data-act="lobby">Changer de jeu</button>'
      : `<p class="center muted">${name(r.hostId)} peut relancer une partie.</p>`}</div>` : ''}`;
}

function endBanner(won, kicker, title, sub) {
  return `<div class="banner ${won ? 'win' : 'lose'}"><span class="small">${kicker}</span><big>${title}</big>${sub ? `<span class="small">${sub}</span>` : ''}</div>`;
}

// ---------- Undercover ----------

const UC_ROLES = { civil: 'Civil', undercover: 'Undercover', mrwhite: 'Mr White' };
const UC_BADGE = { civil: '', undercover: 'red', mrwhite: 'light' };

function viewUndercover(g) {
  const me = S.room.me;
  const alive = g.alive.includes(me);
  const out = {};
  g.eliminated.forEach((e) => { out[e.id] = e.role; });
  const host = isHost();
  let html = g.phase === 'end' ? '' : (g.isMrWhite
    ? secret('uc', 'Ton mot', 'Mr White', "Tu n'as pas de mot : écoute et bluffe !")
    : secret('uc', 'Ton mot', esc(g.word), 'Ne le dis jamais directement.'));

  if (g.phase === 'play') {
    html += `<div class="banner">Tour ${g.round} : chacun donne un indice à voix haute, dans cet ordre.</div>
      <div class="list">${g.order.map((id, i) => `<div class="item" style="justify-content:flex-start"><span class="rank">${i + 1}</span><b>${name(id)}${id === me ? ' (toi)' : ''}</b></div>`).join('')}</div>
      <div class="bottom">${host ? '<button class="big" data-act="uc_vote">Passer au vote</button>' : '<p class="center muted small">L\'hôte lancera le vote quand tout le monde aura parlé.</p>'}</div>`;
  } else if (g.phase === 'vote') {
    const candidates = g.candidates || g.alive;
    html += `<div class="heading">${g.candidates ? 'Égalité ! On revote.' : 'Qui est l\'intrus ?'}</div>`;
    if (alive) {
      html += '<p class="muted small">Touche un joueur pour voter. Tu peux changer d\'avis tant que tout le monde n\'a pas voté.</p>';
      html += items(candidates.filter((id) => id !== me), {
        act: 'uc_pick',
        selected: g.myVote,
        right: (id) => `<span class="note">${id === g.myVote ? 'ton vote' : (g.voted.includes(id) ? 'a voté' : '')}</span>`,
      });
    } else {
      html += '<p class="muted">Tu es éliminé, tu ne votes plus.</p>';
    }
    html += progress(g.voted.length, g.alive.length);
    if (host) html += '<div class="bottom"><button class="secondary" data-act="uc_close">Clôturer le vote (hôte)</button></div>';
  } else if (g.phase === 'mrwhite') {
    html += `<div class="banner">${name(g.lastOut)} était Mr White ! Il tente de deviner le mot des civils.</div>`;
    if (g.lastOut === me) {
      html += `<div class="card"><label for="guess">Le mot des civils</label><input id="guess" autocomplete="off" value="${esc(draft('guess'))}"><button data-act="uc_guess">Proposer</button></div>`;
    }
  } else if (g.phase === 'reveal') {
    const role = out[g.lastOut];
    html += `<div class="banner">${g.lastOut === null
      ? 'Égalité : personne n\'est éliminé.'
      : `${name(g.lastOut)} est éliminé : c'était ${role === 'civil' ? 'un civil' : role === 'undercover' ? 'un undercover' : 'Mr White'}.`}
      ${role === 'mrwhite' ? `<br>Il a proposé « ${esc(g.guess)} » : raté !` : ''}</div>
      ${voteRecap(g.lastVotes)}
      <div class="bottom">${host ? '<button class="big" data-act="uc_next">Tour suivant</button>' : '<p class="center muted small">En attente de l\'hôte pour le tour suivant.</p>'}</div>`;
  } else if (g.phase === 'end') {
    const myRole = g.roles[me];
    const won = g.winner === 'civils' ? myRole === 'civil' : (g.winner === 'mrwhite' ? myRole === 'mrwhite' : myRole !== 'civil');
    const caught = g.eliminated.filter((e) => e.role !== 'civil').map((e) => `${name(e.id)} (${UC_ROLES[e.role]})`);
    const titles = {
      civils: ['Les civils gagnent !', caught.length ? `${caught.join(' et ')} ${caught.length > 1 ? 'sont démasqués' : 'est démasqué'}.` : ''],
      infiltres: ['Les infiltrés gagnent !', 'Il ne reste plus assez de civils.'],
      mrwhite: ['Mr White gagne !', `Il a deviné « ${esc(g.guess)} ».`],
    };
    html += endBanner(won, won ? 'Victoire' : 'Défaite', titles[g.winner][0], titles[g.winner][1]);
    html += `<div class="tiles">
        <div class="card" style="gap:2px"><span class="small muted">Mot des civils</span><b>${esc(g.words.civil)}</b></div>
        <div class="card" style="gap:2px"><span class="small muted">Mot undercover</span><b>${esc(g.words.undercover)}</b></div>
      </div>
      <div class="section">Les rôles</div>
      ${items(allIds(), { right: (id) => `<span class="badge ${UC_BADGE[g.roles[id]]}">${UC_ROLES[g.roles[id]]}</span>` })}`;
    return html;
  }
  if (g.eliminated.length) {
    html += `<div class="section">Éliminés</div>${items(g.eliminated.map((e) => e.id), {
      dead: () => true,
      right: (id) => `<span class="badge ${UC_BADGE[out[id]]}">${UC_ROLES[out[id]]}</span>`,
    })}`;
  }
  return html;
}

function progress(done, total) {
  return `<div class="progress"><div class="bar"><div style="width:${total ? Math.round(100 * done / total) : 0}%"></div></div><span>${done}/${total} ont voté</span></div>`;
}

function voteRecap(votes) {
  if (!votes || Array.isArray(votes)) return '';
  const lines = Object.keys(votes).map((from) => `${name(Number(from))} → ${name(votes[from])}`);
  return lines.length ? `<p class="small muted">Votes : ${lines.join(' · ')}</p>` : '';
}

// ---------- Time Bomb ----------

const TB_CARDS = { wire: ['FIL', 'blue'], safe: ['SANS DANGER', ''], bomb: ['BIG BEN', 'red'] };

// Interface posée par-dessus la scène 3D ; elle suit l'état affiché (en retard sur le serveur
// le temps des animations), pour ne jamais dévoiler une carte avant qu'elle soit retournée.
function viewTimeBomb3D() {
  const v = TB3D.inst.view();
  const g = v.g;
  if (!g) return '';
  const me = S.room.me;
  let html = `<div class="tb-top">
    <div class="tb-stats"><span><b>${g.round}/4</b> manche</span><span><b>${g.wires}/${v.n}</b> fils</span><span><b>${g.cuts}/${v.n}</b> coupes</span></div>
    <div class="tb-tools">
      <button class="tb-btn" data-act="tb_sound" aria-label="${v.sound ? 'Couper le son' : 'Activer le son'}">${v.sound ? ICONS.sound : ICONS.mute}</button>
      <button class="tb-btn" data-act="tb_view" data-mode="0" aria-label="Passer en vue 2D">2D</button>
      ${isHost() ? '<button class="tb-btn" data-act="lobby">Salon</button>' : ''}
    </div></div>
    ${asBar()}`;
  let panel = '';
  if (v.ended) {
    const reasons = { bomb: 'Big Ben a explosé !', wires: 'Tous les fils sont trouvés !', time: 'Le temps est écoulé !' };
    const won = g.winner === g.myRole;
    panel = `${endBanner(won, won ? 'Victoire' : 'Défaite', g.winner === 'sherlock' ? 'Les Sherlock gagnent !' : 'Les Moriarty gagnent !', reasons[g.reason])}
      <div class="chips tb-roles">${allIds().map((id) => `<span class="chip ${g.roles[id] === 'sherlock' ? 'blue' : 'red'}">${name(id)}${id === me ? ' (toi)' : ''} · ${g.roles[id] === 'sherlock' ? 'Sherlock' : 'Moriarty'}</span>`).join('')}</div>
      ${isHost()
    ? '<button class="big" data-act="start">Rejouer</button><button class="secondary" data-act="lobby">Changer de jeu</button>'
    : `<p class="center small">${name(S.room.hostId)} peut relancer une partie.</p>`}`;
  } else if (v.canCut) {
    const targets = allIds().filter((id) => id !== me && g.handSizes[id] > 0);
    panel = `<div class="small"><b>Tu as la pince.</b> Choisis chez qui couper (ou touche une carte).</div>
      <div class="chips">${targets.map((id) => `<button class="chip ${v.selected === id ? 'on' : ''}" data-act="tb_pick" data-id="${id}">${name(id)}</button>`).join('')}</div>
      ${v.selected !== null ? `<button class="big" data-act="tb_confirm">${ICONS.scissors} Couper chez ${name(v.selected)}</button>` : ''}`;
  } else if (v.pending) {
    panel = '<div class="small center">Coupe en cours…</div>';
  } else if (!v.busy && g.phase === 'play') {
    panel = `<div class="small center">${g.pincers === me ? 'Tu as la pince.' : `<b>${name(g.pincers)}</b> a la pince.`} Touche tes cartes ou ta carte rôle pour les regarder.</div>`;
  }
  if (panel) html += `<div class="tb-panel ${v.ended ? 'end' : ''}">${panel}</div>`;
  return html;
}

function viewTimeBomb(g) {
  const me = S.room.me;
  const n = S.room.players.length;
  const sherlock = g.myRole === 'sherlock';
  const c = g.myCards;
  const parts = [];
  if (c.wire) parts.push(plural(c.wire, 'fil'));
  if (c.safe) parts.push(`${c.safe} sans danger`);
  if (c.bomb) parts.push('Big Ben !');
  let html = TB3D.failed ? '' : '<button class="secondary" data-act="tb_view" data-mode="1">Passer en vue 3D (Big Ben)</button>';
  if (g.phase !== 'end') {
    html += `<div class="tiles">
      ${secret('tbrole', 'Ton rôle', sherlock ? 'Sherlock' : 'Moriarty', sherlock ? 'Trouve tous les fils.' : 'Fais couper Big Ben.', sherlock ? 'blue' : 'red')}
      ${secret('tbcards', 'Tes cartes', parts.join('<br>') || 'aucune', 'Annonce-les… ou mens !')}
    </div>`;
  }
  html += `<div class="stats">
    <div><b>${g.round}/4</b><span>manche</span></div>
    <div><b>${g.wires}/${n}</b><span>fils trouvés</span></div>
    <div><b>${g.cuts}/${n}</b><span>coupes</span></div></div>`;

  const last = g.revealed[g.revealed.length - 1];
  if (last) {
    const from = last.from === me ? 'chez toi' : `chez ${name(last.from)}`;
    html += `<div class="banner row"><span>${last.by === me ? 'Tu as coupé' : `${name(last.by)} a coupé`} ${from}</span><span class="badge ${TB_CARDS[last.card][1]}">${TB_CARDS[last.card][0]}</span></div>`;
  }

  if (g.phase === 'end') {
    const reasons = { bomb: 'Big Ben a explosé !', wires: 'Tous les fils sont trouvés !', time: 'Le temps est écoulé !' };
    const won = g.winner === g.myRole;
    html += endBanner(won, won ? 'Victoire' : 'Défaite', g.winner === 'sherlock' ? 'Les Sherlock gagnent !' : 'Les Moriarty gagnent !', reasons[g.reason]);
    html += `<div class="section">Les rôles</div>${items(allIds(), {
      right: (id) => g.roles[id] === 'sherlock' ? '<span class="badge blue">Sherlock</span>' : '<span class="badge red">Moriarty</span>',
    })}`;
    return html;
  }

  const mine = g.pincers === me;
  html += mine
    ? `<div class="banner accent">${ICONS.scissors}<span>Tu as la pince : touche un joueur pour couper une de ses cartes.</span></div>`
    : `<div class="banner">${name(g.pincers)} a la pince.</div>`;
  html += items(allIds(), {
    act: mine ? 'tb_cut' : null,
    pick: (id) => id !== me && g.handSizes[id] > 0,
    right: (id) => `<span class="pips">${'<i></i>'.repeat(g.handSizes[id] || 0)}</span>`,
  });
  if (g.revealed.length > 1) {
    html += `<div class="section">Cartes révélées</div><div class="log">${g.revealed.slice(0, -1).reverse().map((x) =>
      `<div>Manche ${x.round} · chez ${name(x.from)} : <span class="badge ${TB_CARDS[x.card][1]}">${TB_CARDS[x.card][0]}</span></div>`).join('')}</div>`;
  }
  return html;
}

// ---------- Loup-garou ----------

const LG_ROLES = {
  wolf: { name: 'Loup-garou', desc: 'Chaque nuit, mettez-vous d\'accord entre loups pour dévorer un villageois.' },
  villager: { name: 'Villageois', desc: 'Trouvez et éliminez les loups-garous lors des votes du jour.' },
  seer: { name: 'Voyante', desc: 'Chaque nuit, découvre le rôle d\'un joueur.' },
  witch: { name: 'Sorcière', desc: 'Une potion de vie, une potion de mort, une seule fois chacune.' },
  hunter: { name: 'Chasseur', desc: 'Si tu meurs, tu emportes quelqu\'un avec toi.' },
};

function lgKnownRoles(g) {
  const known = {};
  g.events.forEach((e) => {
    if (e.type === 'dawn') e.dead.forEach((d) => { known[d.id] = d.role; });
    if (e.type === 'vote' && e.dead) known[e.dead.id] = e.dead.role;
    if (e.type === 'hunter') known[e.target] = e.role;
  });
  return Object.assign(known, g.roles || {});
}

function lgEventText(e) {
  if (e.type === 'dawn') {
    return e.dead.length
      ? `Nuit ${e.night} : ${e.dead.map((d) => `${name(d.id)} (${LG_ROLES[d.role].name})`).join(' et ')} ${e.dead.length > 1 ? 'sont morts' : 'est mort'}.`
      : `Nuit ${e.night} : personne n'est mort.`;
  }
  if (e.type === 'vote') {
    return e.dead ? `Le village a éliminé ${name(e.dead.id)} (${LG_ROLES[e.dead.role].name}).` : 'Égalité au vote : personne n\'est éliminé.';
  }
  if (e.type === 'hunter') return `Le chasseur ${name(e.by)} a tiré sur ${name(e.target)} (${LG_ROLES[e.role].name}).`;
  return '';
}

function phaseTitle(icon, title, sub) {
  return `<div class="phase">${icon}<span><span class="heading">${title}</span>${sub ? `<span class="small muted">${sub}</span>` : ''}</span></div>`;
}

function viewLoupGarou(g) {
  const me = S.room.me;
  const alive = g.alive.includes(me);
  const known = lgKnownRoles(g);
  const others = g.alive.filter((id) => id !== me);
  const sleeping = '<div class="note-box">Garde les yeux fermés… Touche quand même ton téléphone pour ne trahir personne.</div>';
  let html = '';

  if (g.phase !== 'end') {
    const pack = g.myRole === 'wolf' && g.wolves.length > 1 ? `Ta meute : ${g.wolves.filter((id) => id !== me).map(name).join(', ')}.` : '';
    html += secret('lgrole', 'Ton rôle', LG_ROLES[g.myRole].name, `${LG_ROLES[g.myRole].desc} ${pack}`, g.myRole === 'wolf' ? 'red' : 'blue');
  }
  if (!alive && g.phase !== 'end') {
    html += '<div class="banner">Tu es mort. Tu vois tous les rôles, mais chut !</div>';
  }

  if (g.phase === 'night') {
    html += phaseTitle(ICONS.moon, `Nuit ${g.night}`, 'Le village s\'endort…');
    if (alive && g.myRole === 'wolf') {
      const votes = g.wolfVotes || {};
      const byTarget = {};
      Object.keys(votes).forEach((w) => { (byTarget[votes[w]] = byTarget[votes[w]] || []).push(Number(w) === me ? 'ton vote' : name(Number(w))); });
      html += '<p>Choisissez votre victime. Tous les loups doivent voter pour la même personne.</p>';
      html += items(g.alive.filter((id) => !g.wolves.includes(id)), {
        act: 'lg_wolf', selected: votes[me],
        right: (id) => `<span class="note">${(byTarget[id] || []).join(', ')}</span>`,
      });
    } else if (alive && g.myRole === 'seer' && !g.seerDone) {
      html += '<p>Choisis un joueur dont tu veux découvrir le rôle :</p>';
      html += items(others, { act: 'lg_seer' });
    } else if (alive && g.myRole === 'seer' && !g.seerRead) {
      const last = g.seerLog[g.seerLog.length - 1];
      html += `<div class="banner">${name(last.target)} est ${LG_ROLES[last.role].name}.</div><button data-act="lg_seer_ok">J'ai vu</button>`;
    } else if (alive) {
      html += sleeping;
    }
  } else if (g.phase === 'witch') {
    html += phaseTitle(ICONS.moon, `Nuit ${g.night}`, 'La sorcière se réveille…');
    if (alive && g.myRole === 'witch') {
      html += `<p>${g.victim !== null ? `Les loups ont attaqué <b>${name(g.victim)}</b>.` : 'Les loups n\'ont attaqué personne.'}</p>`;
      const save = !!draft('w_save');
      if (g.potions.life && g.victim !== null) {
        html += `<button class="item ${save ? 'selected' : ''}" data-act="w_save"><b>Potion de vie</b><span class="note">${save ? `sauver ${name(g.victim)}` : 'ne pas utiliser'}</span></button>`;
      }
      if (g.potions.death) {
        html += `<div class="card"><label for="w_kill">Potion de mort</label><select id="w_kill"><option value="">Personne</option>${g.alive.map((id) =>
          `<option value="${id}" ${String(draft('w_kill')) === String(id) ? 'selected' : ''}>${name(id)}</option>`).join('')}</select></div>`;
      }
      html += '<button class="big" data-act="lg_witch">Valider</button>';
    } else if (alive) {
      html += sleeping;
    }
  } else if (g.phase === 'hunter') {
    html += `<div class="banner">${name(g.hunter)} était le chasseur : il emporte quelqu'un avec lui !</div>`;
    if (g.hunter === me) html += items(others, { act: 'lg_hunter' });
  } else if (g.phase === 'day') {
    const dawn = g.events.filter((e) => e.type === 'dawn').pop();
    const count = tally(g.dayVotes);
    const voters = Object.keys(g.dayVotes || {}).length;
    html += phaseTitle(ICONS.sun, `Jour ${g.night}`);
    if (dawn) html += `<div class="banner">${lgEventText(dawn)}</div>`;
    if (alive) html += '<p class="muted small">Débattez, puis votez pour éliminer un suspect.</p>';
    html += items(alive ? others : g.alive, {
      act: alive ? 'lg_vote' : null,
      selected: g.myVote,
      right: (id) => `<span class="note">${id === g.myVote ? 'ton vote' : (count[id] ? `${count[id]} voix` : '')}</span>`,
    });
    html += progress(voters, g.alive.length);
  } else if (g.phase === 'end') {
    const won = (g.winner === 'wolves') === (g.myRole === 'wolf');
    html += endBanner(won, won ? 'Victoire' : 'Défaite', g.winner === 'wolves' ? 'Les loups-garous gagnent !' : 'Le village gagne !');
  }

  if (isHost() && g.phase !== 'end') {
    const labels = { day: 'Clôturer le vote', night: 'Forcer la fin de la nuit', witch: 'Passer la sorcière', hunter: 'Passer le chasseur' };
    html += `<button class="ghost" data-act="lg_force">${labels[g.phase]} (hôte)</button>`;
  }
  if (g.myRole === 'seer' && g.seerLog.length && g.phase !== 'end') {
    html += `<div class="section">Tes visions</div><div class="log">${g.seerLog.map((s) => `<div>Nuit ${s.night} : ${name(s.target)} est ${LG_ROLES[s.role].name}</div>`).join('')}</div>`;
  }
  if (g.phase === 'end' || g.phase === 'day' || !alive) {
    html += `<div class="section">Village</div>${items(allIds(), {
      dead: (id) => !g.alive.includes(id),
      right: (id) => known[id] ? `<span class="badge ${known[id] === 'wolf' ? 'red' : ''}">${LG_ROLES[known[id]].name}</span>` : '',
    })}`;
  }
  if (g.events.length) {
    html += `<div class="section">Journal</div><div class="log">${g.events.slice().reverse().map((e) => `<div>${lgEventText(e)}</div>`).join('')}</div>`;
  }
  return html;
}

// ---------- Événements ----------

app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id) S.draft[el.id] = el.value;
});

app.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.id) S.draft[el.id] = el.value;
  const key = el.dataset.setting;
  if (key) {
    const s = currentSettings();
    s[key] = Number(el.value);
    send('choose', { game: S.room.game, settings: s });
  }
});

app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'code') joinOrCreate('join');
  if (ev.target.id === 'name') joinOrCreate(draft('code') ? 'join' : 'create');
  if (ev.target.id === 'guess') handlers.uc_guess();
});

async function joinOrCreate(action) {
  const pseudo = draft('name', localStorage.getItem('mj_name') || '').trim();
  if (!pseudo) { toast('Choisis un pseudo.'); return; }
  try { localStorage.setItem('mj_name', pseudo); } catch (e) { /* ignoré */ }
  try {
    const res = await api(action, { name: pseudo, code: draft('code', new URLSearchParams(location.search).get('r') || '') });
    S.session = { code: res.code, token: res.token };
    saveJSON('mj_session', S.session);
    history.replaceState(null, '', location.pathname + '?r=' + res.code);
    S.room = null;
    render();
    poll();
  } catch (e) {
    toast(e.message);
  }
}

const handlers = {
  create: () => joinOrCreate('create'),
  join: () => joinOrCreate('join'),
  install: async () => {
    if (!S.installPrompt) return;
    S.installPrompt.prompt();
    S.installPrompt = null;
    render();
  },
  toggle: (el) => { S.reveal[el.dataset.key] = !S.reveal[el.dataset.key]; render(); },
  leave: async () => {
    if (!confirm('Quitter le salon ?')) return;
    try { await api('leave', { code: S.session.code, token: S.session.token }); } catch (e) { /* le salon a peut-être expiré */ }
    history.replaceState(null, '', location.pathname);
    leaveSession();
  },
  share: async () => {
    const url = location.origin + location.pathname + '?r=' + S.room.code;
    if (navigator.share) {
      try { await navigator.share({ title: 'Mini-jeux', text: `Rejoins mon salon ${S.room.code}`, url }); } catch (e) { /* partage annulé */ }
    } else {
      try { await navigator.clipboard.writeText(url); toast('Lien copié !'); } catch (e) { toast(url); }
    }
  },
  kick: (el) => { if (confirm('Retirer ce joueur ?')) send('kick', { target: Number(el.dataset.id) }); },
  add_bot: () => send('add_bot'),
  as: (el) => {
    const id = Number(el.dataset.id);
    S.as = id === realMe() ? null : id;
    S.reveal = {};
    S.room.v = 0; // force le rechargement complet avec le nouveau point de vue
    poll();
  },
  choose: (el) => { if (el.dataset.game !== S.room.game) send('choose', { game: el.dataset.game, settings: {} }); },
  toggle_setting: (el) => {
    const s = currentSettings();
    s[el.dataset.key] = Number(s[el.dataset.key]) ? 0 : 1;
    send('choose', { game: S.room.game, settings: s });
  },
  start: () => send('start', { settings: currentSettings() }),
  lobby: () => { if (S.room.g.phase === 'end' || confirm('Arrêter la partie et revenir au salon ?')) send('lobby'); },
  uc_vote: () => play('to_vote'),
  uc_pick: (el) => play('vote', { target: Number(el.dataset.id) }),
  uc_close: () => { if (confirm('Clôturer le vote maintenant ?')) play('close_vote'); },
  uc_guess: () => { const w = draft('guess').trim(); if (w) { play('guess', { word: w }); S.draft.guess = ''; } },
  uc_next: () => play('next'),
  tb_cut: (el) => play('cut', { target: Number(el.dataset.id) }),
  tb_view: (el) => {
    try { localStorage.setItem('mj_tb3d', el.dataset.mode); } catch (e) { /* ignoré */ }
    render();
  },
  tb_sound: () => TB3D.inst.sound(!TB3D.inst.view().sound),
  tb_pick: (el) => {
    const id = Number(el.dataset.id);
    TB3D.inst.select(TB3D.inst.view().selected === id ? null : id);
  },
  tb_confirm: () => TB3D.inst.confirmCut(),
  lg_wolf: (el) => play('wolf_vote', { target: Number(el.dataset.id) }),
  lg_seer: (el) => play('seer', { target: Number(el.dataset.id) }),
  lg_seer_ok: () => play('seer_ok'),
  w_save: () => { S.draft.w_save = !S.draft.w_save; render(); },
  lg_witch: () => {
    const kill = draft('w_kill');
    play('witch', { save: !!draft('w_save'), target: kill === '' ? null : Number(kill) });
    S.draft.w_save = false;
    S.draft.w_kill = '';
  },
  lg_hunter: (el) => play('hunter', { target: Number(el.dataset.id) }),
  lg_vote: (el) => play('vote', { target: Number(el.dataset.id) }),
  lg_force: () => { if (confirm('Forcer la suite ? Les joueurs qui n\'ont pas agi seront ignorés.')) play('force'); },
};

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = handlers[el.dataset.act];
  if (fn) fn(el);
});

// ---------- Démarrage ----------

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  S.installPrompt = ev;
  if (!S.session) render();
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* hors HTTPS : pas de mode appli */ });
}
// Lien vers l'APK si le fichier a été déposé sur le site (et qu'on n'est pas déjà dans l'appli).
const inApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if (!inApp && /Android/i.test(navigator.userAgent)) {
  fetch('mini-jeux.apk', { method: 'HEAD' }).then((res) => {
    if (res.ok) { S.apk = true; if (!S.session) render(); }
  }).catch(() => { /* pas d'APK */ });
}
const startCode = new URLSearchParams(location.search).get('r');
if (S.session && startCode && S.session.code !== startCode.toUpperCase()) {
  // Lien vers un autre salon : on oublie l'ancien.
  S.session = null;
  saveJSON('mj_session', null);
}
render();
poll();
