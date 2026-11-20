import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('file:///workspace/github__MateoRex01__mistral-code11/mekanika.html');
await page.waitForTimeout(4000);
const st = await page.evaluate(() => ({
  loading: document.getElementById('loading')?.className,
  menuBtns: document.querySelectorAll('#menuRoot .btn').length,
  canvas: !!document.getElementById('gameCanvas'),
}));
console.log('estado:', JSON.stringify(st));
console.log('errores:', errs.length ? errs.slice(0, 8) : '(ninguno)');
await page.screenshot({ path: '/tmp/menu.png' });
await browser.close();
