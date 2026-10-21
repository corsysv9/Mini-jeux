// Time Bomb en 3D, en mode test sur un seul téléphone : node tests/timebomb3d.mjs http://127.0.0.1:8099 dossier-captures
// L'hôte joue à la place des joueurs test jusqu'à la fin de la partie.
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
const shot = (file) => page.screenshot({ path: `${out}/${file}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(base);
await page.fill('#name', 'Gwendal');
await page.click('[data-act=create]');
await page.waitForSelector('.bigcode');
for (let i = 1; i <= 3; i++) {
  await page.click('[data-act=add_bot]');
  await page.waitForFunction((n) => document.querySelectorAll('.person').length === n, i + 1);
}
await page.click('[data-act=choose][data-game=timebomb]');
await page.waitForSelector('[data-game=timebomb].active');
await page.click('[data-act=start]');
await page.waitForSelector('body.tb3d #tb3d canvas', { timeout: 60000 });
await sleep(3000);
await shot('3d-01-distribution');
// Fin de l'intro : le panneau du bas réapparaît.
await page.waitForSelector('.tb-panel', { timeout: 120000 });
await shot('3d-02-table');

let cuts = 0;
let shotReveal = false;
while (!(await page.$('.tb-panel.end')) && cuts < 40) {
  // Qui a la pince ? On prend sa place.
  const holder = await page.evaluate(() => {
    const b = document.querySelector('.tb-panel b');
    return b ? b.textContent.trim() : '';
  });
  if (!(await page.$('[data-act=tb_pick]'))) {
    const chip = holder && holder !== 'Tu as la pince.'
      ? (await page.$(`.as-bar .chip:text-is("${holder}")`)) || (await page.$('.as-bar .chip:text-is("Moi")')) : null;
    if (!chip) { await sleep(500); continue; }
    await chip.click();
    await page.waitForSelector('[data-act=tb_pick]', { timeout: 120000 });
  }
  try {
    await page.click('[data-act=tb_pick]', { timeout: 5000 });
    await page.click('.cardpick [data-act=tb_slot]:first-child', { timeout: 5000 });
    if (!cuts) {
      await sleep(1500);
      await shot('3d-02b-choix-carte');
    }
    await page.click('[data-act=tb_confirm]', { timeout: 5000 });
  } catch (e) {
    continue; // l'interface s'est redessinée entre-temps : on recommence
  }
  cuts++;
  if (!shotReveal) {
    // La carte coupée s'affiche en grand chez tout le monde.
    await page.waitForSelector('.tb3d-caption.show:not(.soft)', { timeout: 120000 });
    await shot('3d-03-carte-revelee');
    shotReveal = true;
  }
  await page.waitForSelector('.tb-panel', { timeout: 120000 });
  if (cuts === 5) await shot('3d-05-manche-2');
}
await page.waitForSelector('.tb-panel.end', { timeout: 180000 });
await shot('3d-04-fin');
const result = await page.textContent('.tb-panel.end .banner');
console.log(`${cuts} coupes, fin :`, result.replace(/\s+/g, ' ').trim());
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Time Bomb 3D OK');
