// Test de l'interface avec 5 téléphones simulés : node tests/ui.mjs http://127.0.0.1:8099 dossier-captures
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:8099';
const out = process.argv[3] || 'captures';
const browser = await chromium.launch();
const errors = [];
const phones = [];
const names = ['Gwendal', 'Léa', 'Max', 'Inès', 'Tom'];

for (const n of names) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  // Ce test suit l'interface 2D de Time Bomb (la vue 3D a son propre test).
  await ctx.addInitScript(() => localStorage.setItem('mj_tb3d', '0'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${n}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${n}: ${m.text()}`); });
  phones.push(page);
}
const [host, ...guests] = phones;
const shot = (page, file) => page.screenshot({ path: `${out}/${file}.png`, fullPage: true });

await host.goto(base);
await shot(host, '00-accueil');
await host.fill('#name', 'Gwendal');
await host.click('[data-act=create]');
await host.waitForSelector('.bigcode');
const code = (await host.textContent('.bigcode')).trim();
for (let i = 0; i < guests.length; i++) {
  await guests[i].goto(`${base}/?r=${code}`);
  await guests[i].fill('#name', names[i + 1]);
  await guests[i].click('[data-act=join]');
  await guests[i].waitForSelector('.bigcode');
}
await host.waitForFunction(() => document.querySelectorAll('.person').length === 5);
await shot(host, '01-salon');

// Undercover
await host.click('[data-act=start]');
for (const p of phones) await p.waitForSelector('.secret');
await host.click('.secret');
await shot(host, '02-undercover-mot');
await shot(phones[1], '02b-undercover-cache');
await host.click('[data-act=uc_vote]');
for (const p of phones) await p.waitForSelector('[data-act=uc_pick]');
await guests[0].click('[data-act=uc_pick]');
await guests[0].waitForSelector('.item.selected');
await shot(guests[0], '03-undercover-vote');
host.once('dialog', (d) => d.accept());
await host.click('[data-act=lobby]');
await host.waitForSelector('.bigcode');

// Time Bomb
await host.click('[data-game=timebomb]');
await host.waitForSelector('.game.active[data-game=timebomb]');
await host.click('[data-act=start]');
for (const p of phones) await p.waitForSelector('.stats');
let cutter = null;
for (const p of phones) if (await p.$('[data-act=tb_cut]')) cutter = p;
await cutter.click('[data-act=tb_cut]');
await cutter.waitForSelector('.banner.row .badge');
await cutter.click('.secret');
await cutter.click('.tiles .secret:nth-child(2)');
await shot(cutter, '04-timebomb');
// On coupe jusqu'à la fin de la partie.
for (let turn = 0; turn < 40; turn++) {
  if (await host.$('.banner.win, .banner.lose')) break;
  for (const p of phones) {
    const btn = await p.$('[data-act=tb_cut]');
    if (btn) { await btn.click(); await p.waitForTimeout(300); break; }
  }
  await host.waitForTimeout(1700);
}
await host.waitForSelector('.banner.win, .banner.lose');
await shot(host, '04b-timebomb-fin');
host.once('dialog', (d) => d.accept());
await host.click('[data-act=lobby]');
await host.waitForSelector('.bigcode');

// Loup-garou
await host.click('[data-game=loupgarou]');
await host.waitForSelector('.game.active[data-game=loupgarou]');
await host.click('[data-act=start]');
for (const p of phones) await p.waitForSelector('.phase');
for (const p of phones) {
  if (await p.$('[data-act=lg_wolf]')) {
    await p.click('.secret');
    await p.click('[data-act=lg_wolf]');
    await p.waitForSelector('.item.selected');
    await shot(p, '05-loup-nuit');
  }
}
for (const p of phones) {
  if (await p.$('[data-act=lg_seer]')) {
    await p.click('[data-act=lg_seer]');
    await p.click('[data-act=lg_seer_ok]');
  }
}
await host.waitForFunction(() => document.body.textContent.includes('Jour') || document.body.textContent.includes('sorcière'), null, { timeout: 8000 });
await shot(host, '06-loup-suite');
for (const p of phones) {
  if (await p.$('[data-act=lg_witch]')) { await p.click('[data-act=w_save]').catch(() => {}); await shot(p, '06b-sorciere'); await p.click('[data-act=lg_witch]'); }
}
await host.waitForSelector('.progress', { timeout: 8000 });
await shot(host, '07-loup-jour');

console.log(errors.length ? 'Erreurs :\n' + errors.join('\n') : 'Aucune erreur JS.');
await browser.close();
