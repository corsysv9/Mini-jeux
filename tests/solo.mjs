// Mode test : un seul téléphone, l'hôte ajoute des joueurs test et joue à leur place.
// node tests/solo.mjs http://127.0.0.1:8099 dossier-captures
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8099';
const out = process.argv[3] || 'captures';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// Ce test lit les rôles dans l'interface 2D (la veillée en 3D a son propre test).
await page.addInitScript(() => localStorage.setItem('mj_lg3d', '0'));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (file) => page.screenshot({ path: `${out}/${file}.png`, fullPage: true });

await page.goto(base);
await page.fill('#name', 'Gwendal');
await page.click('[data-act=create]');
await page.waitForSelector('.bigcode');
for (let i = 1; i <= 4; i++) {
  await page.click('[data-act=add_bot]');
  await page.waitForFunction((n) => document.querySelectorAll('.person').length === n, i + 1);
}
await shot('solo-01-salon');
await page.click('[data-act=choose][data-game=loupgarou]');
await page.waitForSelector('[data-game=loupgarou].active');
await page.click('[data-act=start]');
await page.waitForSelector('.as-bar');

// Chaque joueur voit son propre rôle.
const roles = {};
const chips = await page.$$eval('.as-bar .chip', (els) => els.map((e) => e.dataset.id));
for (const id of chips) {
  await page.click(`.as-bar .chip[data-id="${id}"]`);
  await page.waitForSelector(`.as-bar .chip.on[data-id="${id}"]`);
  await page.click('.secret');
  roles[id] = (await page.textContent('.secret .value')).trim();
}
console.log('Rôles vus :', roles);
await shot('solo-02-partie');
if (new Set(Object.values(roles)).size < 2) errors.push('tous les rôles sont identiques : le changement de joueur ne marche pas');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Mode test OK');
