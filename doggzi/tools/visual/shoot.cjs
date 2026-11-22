// Visual-diff capture for apps/web. Usage:
//   NODE_PATH=$(npm root -g) node shoot.cjs <baseUrl> <outDir> [widths=375,390,768,1440]
// Deterministic: reduced motion forced, fixed demo passport, desktop device, fonts awaited, scroll pass for reveals.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PAGES = [
  ['passport', '/', false],
  ['choose', '/choose', true],
  ['explore', '/explore', true],
  ['fresh-food', '/fresh-food', true],
  ['services', '/services', true],
  ['marketplace', '/marketplace', true],
  ['order', '/orders/00000000-0000-0000-0000-000000000000', true],
  ['not-found', '/nope', true],
];

(async () => {
  const [base, out, w = '375,390,768,1440'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const width of w.split(',').map(Number)) {
    for (const [name, url, withPet] of PAGES) {
      const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      await ctx.addInitScript(`
        localStorage.setItem('dz.tweaks', JSON.stringify({ forceReducedMotion: true, device: 'Desktop' }));
        ${withPet ? `localStorage.setItem('dz.passport', JSON.stringify({ name: 'Bruno', type: 'dog', breed: 'Labrador Retriever', created_at: '' }));` : ''}
        Math.random = () => 0.42;
      `);
      const p = await ctx.newPage();
      await p.route(/i\.ytimg\.com|youtube/, (r) => r.abort());
      await p.goto(base + url, { waitUntil: 'networkidle' });
      await p.evaluate(async () => {
        await document.fonts.ready;
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
        window.scrollTo(0, 0);
        document.querySelectorAll('[aria-label="Preview tweaks"], button').forEach((el) => { if (el.textContent === 'Tweaks') el.style.visibility = 'hidden'; });
        document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      });
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(700);
      await p.screenshot({ path: path.join(out, `${name}@${width}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await b.close();
  console.log('captured', fs.readdirSync(out).length, 'screenshots in', out);
})();
