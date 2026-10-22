// Loup-garou en 3D (la veillée), en mode test sur un seul téléphone : node tests/loupgarou3d.mjs http://127.0.0.1:8099 dossier-captures
// L'hôte joue à tour de rôle à la place des joueurs test jusqu'à la fin de la partie.
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8099';
const out = process.argv[3] || 'captures';
const width = Number(process.argv[4] || 390);
const height = Number(process.argv[5] || 844);
// WebGL logiciel : marche sans carte graphique.
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
const shot = (file) => page.screenshot({ path: `${out}/${file}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(base);
await page.fill('#name', 'Gwendal');
await page.click('[data-act=create]');
await page.waitForSelector('.bigcode');
for (let i = 1; i <= 5; i++) {
  await page.click('[data-act=add_bot]');
  await page.waitForFunction((n) => document.querySelectorAll('.person').length === n, i + 1);
}
await page.click('[data-act=choose][data-game=loupgarou]');
await page.waitForSelector('[data-game=loupgarou].active');
await page.click('[data-act=start]');
await page.waitForSelector('body.lg3d #lg3d canvas', { timeout: 60000 });
await sleep(2500);
await shot('lg3d-01-intro');
// Fin de l'intro (rôle dévoilé, tombée de la nuit) : le panneau du bas apparaît.
await page.waitForSelector('.tb-panel', { timeout: 180000 });
await shot('lg3d-02-nuit');

// Agit pour le joueur affiché, s'il a quelque chose à faire ; renvoie true si une action est partie.
async function act() {
  for (const sel of ['[data-act=lg3d_witch]', '[data-act=lg_seer_ok]']) {
    if (await page.$(sel)) { await page.click(sel); return true; }
  }
  const chip = await page.$('.tb-panel [data-act=lg3d_pick]:not(.on)');
  if (!chip) return false;
  await chip.click();
  const btn = await page.waitForSelector('[data-act=lg3d_confirm]', { timeout: 4000 }).catch(() => null);
  if (!btn) return false;
  await btn.click();
  return true;
}

const seen = new Set();
let rounds = 0;
while (!(await page.$('.tb-panel.end')) && rounds < 60) {
  rounds++;
  const ids = await page.$$eval('.as-bar .chip', (els) => els.map((e) => e.dataset.id));
  let acted = false;
  for (const id of ids) {
    if (await page.$('.tb-panel.end')) break;
    try {
      await page.click(`.as-bar .chip[data-id="${id}"]`);
      await page.waitForSelector(`.as-bar .chip.on[data-id="${id}"]`, { timeout: 10000 });
      await page.waitForSelector('.tb-panel', { timeout: 180000 });
      const phase = await page.textContent('.tb-stats span');
      if (await act()) {
        acted = true;
        await sleep(400);
      }
      // Une capture par moment de la partie
      for (const [key, file] of [['jour', 'lg3d-04-jour'], ['nuit', 'lg3d-03-nuit-action']]) {
        if (phase.includes(key) && !seen.has(key) && (await page.$('.tb-panel'))) { seen.add(key); await shot(file); }
      }
    } catch (e) {
      // L'interface s'est redessinée entre-temps : on passe au joueur suivant.
    }
  }
  if (!acted && !(await page.$('.tb-panel.end'))) {
    // Personne ne peut plus agir : l'hôte force la suite.
    await page.click('[data-act=lg_force]', { timeout: 5000 }).catch(() => {});
  }
}
await page.waitForSelector('.tb-panel.end', { timeout: 180000 });
await sleep(1500);
await shot('lg3d-06-fin');
const result = await page.textContent('.tb-panel.end .banner big');
console.log(`${rounds} tours, fin : ${result.trim()}`);
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Loup-garou 3D OK');
