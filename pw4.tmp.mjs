import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('file:///workspace/github__MateoRex01__mistral-code11/mekanika.html');
await page.waitForTimeout(2500);
await page.click('#menuRoot button[data-m="sandbox"]');
await page.waitForTimeout(600);
console.log('subpanel html len:', await page.evaluate(() => document.querySelector('.subpanel')?.innerHTML.length || 0));
await page.click('.subpanel .map-picker .mp');
await page.waitForTimeout(8000);
const sandbox = await page.evaluate(() => ({
  menuLeft: !!document.querySelector('.menu-left'),
  hudChildren: document.getElementById('hudRoot')?.children.length || 0,
  minimap: !!document.getElementById('minimap'),
}));
console.log('sandbox:', JSON.stringify(sandbox));
console.log('errores:', errs.length);
errs.slice(0, 12).forEach(e => console.log(e));
await browser.close();
