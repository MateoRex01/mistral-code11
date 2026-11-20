import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });

await page.goto('file:///workspace/github__MateoRex01__mistral-code11/mekanika.html');
await page.waitForTimeout(2500);

await page.click('#menuRoot button[data-m="sandbox"]');
await page.waitForTimeout(600);
await page.click('.subpanel .map-picker .mp');
await page.waitForTimeout(6000);

const sandbox = await page.evaluate(() => ({
  hudRoot: !!document.getElementById('hudRoot')?.children.length,
  hudButtons: [...document.querySelectorAll('#hudRoot .hbtn, #hudRoot button')].length,
  speed: document.getElementById('h-speed')?.textContent,
  minimap: !!document.getElementById('minimap'),
  canvasDrawsCanvas: (() => { const c = document.getElementById('gameCanvas'); return c && c.width > 0; })(),
}));
console.log('sandbox:', JSON.stringify(sandbox));

await page.keyboard.press('KeyB');
await page.waitForTimeout(800);
const builder = await page.evaluate(() => ({
  open: !!document.getElementById('b-name'),
  tools: document.querySelectorAll('#buildRoot .tool').length,
  parts: document.querySelectorAll('#buildRoot .plist > *').length,
  cats: [...document.querySelectorAll('#buildRoot .cat, #buildRoot [data-cat]')].map(e => e.textContent?.slice(0, 12)),
}));
console.log('builder:', JSON.stringify(builder));

const canvas = document ? null : null;
const box = await page.locator('#gameCanvas').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * .62);
await page.waitForTimeout(300);
await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height * .62);
await page.waitForTimeout(600);

await page.click('#b-test');
await page.waitForTimeout(3500);
const after = await page.evaluate(() => ({
  speed: document.getElementById('h-speed')?.textContent,
  vname: document.getElementById('h-veh')?.textContent || document.getElementById('vname')?.textContent,
  hudRoot: document.getElementById('hudRoot')?.innerHTML.length,
}));
console.log('tras Test:', JSON.stringify(after));

await page.screenshot({ path: '/tmp/e2e.png' });
console.log('acciones sobre canvas hechas · errores totales:', errs.length);
errs.slice(0, 10).forEach(e => console.log(e));
await browser.close();
