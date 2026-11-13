// Przebieg end-to-end w prawdziwej przeglądarce (Chromium + Playwright).
// Uruchomienie:  npm run build && npm run preview   (w drugim terminalu)
//                node tests/e2e/playthrough.mjs
// Zrzuty ekranu trafiają do test-results/ (poza gitem).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results');
mkdirSync(DIR, { recursive: true });
const URL_ = process.env.HM404_URL ?? 'http://localhost:4173/?debug=1';
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Rozpocznij' }).click();
  await page.waitForTimeout(1800);
  const sub = await page.evaluate(() => window.__hm404.gameStore.getState().subtitle?.text ?? null);
  log('subtitle after 1.8s:', sub);
  await page.screenshot({ path: `${DIR}/s1-intro.png` });

  const st = () => page.evaluate(() => window.__hm404.getGameState());
  const ui = (fn, ...args) => page.evaluate(fn, ...args);

  // 1) Telefon
  await ui(() => window.__hm404.engine.debugLookAt('phone'));
  await page.waitForTimeout(1200);
  await ui(() => window.__hm404.engine.debugActivate('phone'));
  await page.waitForTimeout(900);
  let s = await st();
  log('after phone: phoneHeard', s.flags.phoneHeard, 'clock', s.puzzles.clock, 'overlay', await ui(() => window.__hm404.gameStore.getState().overlay?.kind));
  await page.screenshot({ path: `${DIR}/s2-phone.png` });
  await ui(() => window.__hm404.gameStore.getState().setOverlay(null));
  await page.waitForTimeout(900);

  // 2) Klucz
  await ui(() => window.__hm404.engine.debugLookAt('key'));
  await page.waitForTimeout(1000);
  await ui(() => window.__hm404.engine.debugActivate('key'));
  await page.waitForTimeout(400);
  await ui(() => window.__hm404.gameStore.getState().setOverlay(null));
  s = await st();
  log('inventory after key:', JSON.stringify(s.inventory));

  // 3) Zegar – UI: wartość przez panel (dispatch jak przyciski)
  await ui(() => window.__hm404.engine.debugLookAt('clock'));
  await page.waitForTimeout(1000);
  await ui(() => window.__hm404.engine.debugActivate('clock'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/s3-clock.png` });
  // Klikamy przyciski w panelu zegara: godzina 11 (już jest), minuty +35 (12 -> 47), PM
  const plus = page.getByRole('button', { name: 'Minuty więcej' });
  for (let i = 0; i < 35; i++) await plus.click();
  await page.getByRole('button', { name: 'AM → PM' }).click();
  await page.waitForTimeout(300);
  s = await st();
  log('clock:', JSON.stringify(s.clock), 'clock puzzle', s.puzzles.clock, 'note in inv', s.inventory.includes('note'));
  await page.screenshot({ path: `${DIR}/s3b-clock-solved.png` });
  await ui(() => window.__hm404.gameStore.getState().setOverlay(null));
  await page.waitForTimeout(900);

  // 4) Książki – błędna kolejność, potem poprawna
  await ui(() => window.__hm404.engine.debugLookAt('books'));
  await page.waitForTimeout(1000);
  await ui(() => window.__hm404.engine.debugActivate('books', 'OKO'));
  await page.waitForTimeout(200);
  s = await st();
  log('books wrong pull -> wrongs', s.flags.bookPullsWrong, 'order', JSON.stringify(s.progress.bookOrder));
  for (const sym of ['KLUCZ', 'OKO', 'FALA', 'KSIĘŻYC']) {
    await ui((x) => window.__hm404.engine.debugActivate('books', x), sym);
    await page.waitForTimeout(150);
  }
  s = await st();
  log('books solved:', s.puzzles.books, 'drawerKey', s.inventory.includes('drawerKey'));
  await page.screenshot({ path: `${DIR}/s4-books.png` });
  await page.waitForTimeout(900);

  // 5) Radio – strojenie i kolejność przez UI
  await ui(() => window.__hm404.engine.debugLookAt('radio'));
  await page.waitForTimeout(1000);
  await ui(() => window.__hm404.engine.debugActivate('radio'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/s5-radio.png` });
  for (const f of [92.4, 101.8, 88.6]) {
    await page.locator('.radio__slider input').fill(String(f));
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: '1974' }).click();
  await page.getByRole('button', { name: '1989' }).click();
  await page.getByRole('button', { name: '2026' }).click();
  await page.waitForTimeout(300);
  s = await st();
  log('radio:', s.puzzles.radio, 'tuned', JSON.stringify(s.progress.radioTuned), 'bolt', s.inventory.includes('bolt'));
  await ui(() => window.__hm404.gameStore.getState().setOverlay(null));
  await page.waitForTimeout(900);

  // 6) Lustro – 3 różnice w odbiciu (klik w strefy)
  await ui(() => window.__hm404.engine.debugLookAt('mirror'));
  await page.waitForTimeout(1000);
  await ui(() => window.__hm404.engine.debugActivate('mirror'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/s6-mirror.png` });
  const zones = page.locator('.mirror-zone');
  const n = await zones.count();
  log('mirror zones', n);
  for (let i = 0; i < n; i++) { await zones.nth(i).click({ force: true }); await page.waitForTimeout(150); }
  s = await st();
  log('mirror:', s.puzzles.mirror, 'shift', s.puzzles.shift, 'roomReversed', s.flags.roomReversed);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/s7-reversed.png` });

  // 7) Przywrócenie pokoju: obraz, fotel, zegar; potem decyzja
  await ui(() => window.__hm404.engine.debugLookAt('painting'));
  await page.waitForTimeout(900);
  await ui(() => window.__hm404.engine.debugActivate('painting'));
  await page.waitForTimeout(300);
  await ui(() => window.__hm404.engine.debugLookAt('chair'));
  await page.waitForTimeout(900);
  await ui(() => window.__hm404.engine.debugActivate('chair'));
  await page.waitForTimeout(300);
  await ui(() => window.__hm404.engine.debugLookAt('clock'));
  await page.waitForTimeout(900);
  await ui(() => window.__hm404.engine.debugActivate('clock'));
  await page.waitForTimeout(400);
  const minus = page.getByRole('button', { name: 'Minuty mniej' });
  // z 47 -> 23:47 już jest, ale po odwróceniu zegar się cofa: ustawiamy ponownie
  const cl = await st();
  log('clock while reversed:', JSON.stringify(cl.clock), 'flags', cl.flags.paintingFlipped, cl.flags.chairMoved, cl.flags.clockReversed);
  await ui(() => window.__hm404.gameStore.getState().dispatch({ type: 'clockSet', clock: { hour12: 11, minute: 47, pm: true } }));
  await page.waitForTimeout(200);
  s = await st();
  log('restored? shift', s.puzzles.shift, 'painting', s.flags.paintingFlipped, 'chair', s.flags.chairMoved, 'clockRev', s.flags.clockReversed);
  await ui(() => window.__hm404.gameStore.getState().setOverlay(null));
  await page.waitForTimeout(600);
  void minus;
  await ui(() => window.__hm404.gameStore.getState().setOverlay({ kind: 'decision', source: 'phone' }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/s8-decision.png` });
  await page.getByRole('button', { name: /Zachowaj wspomnienie/ }).click();
  await page.waitForTimeout(400);
  s = await st();
  log('decision', s.decision, 'shift', s.puzzles.shift, 'exit', s.puzzles.exit, 'truths', JSON.stringify(s.truths));

  // 8) Lustro jako drzwi -> zakończenie PRAWDA
  await ui(() => window.__hm404.engine.debugLookAt('mirror'));
  await page.waitForTimeout(900);
  await ui(() => window.__hm404.engine.debugActivate('mirror'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/s9-cinema-truth.png` });
  await page.waitForTimeout(9000);
  s = await st();
  log('ENDING:', s.ending, 'phase', s.phase);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/s10-ending-truth.png` });
  log('ERRORS:', errors.length ? errors.slice(0, 20).join('\n') : 'none');
  await browser.close();
  const fails = [];
  if (errors.length) fails.push('console errors');
  if (!s || s.ending !== 'truth') fails.push('ending truth not reached');
  if (fails.length) { console.error('FAILED:', fails.join(', ')); process.exitCode = 1; }
  else console.log('OK: pełny przebieg do zakończenia PRAWDA bez błędów');
})().catch((e) => { console.error('SCRIPT FAIL', e); process.exit(1); });
