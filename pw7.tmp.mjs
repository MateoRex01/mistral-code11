import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
page.on('console', m => { if (m.type() === 'error' && !/favicon|deprecat|dbus/i.test(m.text())) errs.push('console: ' + m.text()); });
await page.goto('file:///workspace/github__MateoRex01__mistral-code11/mekanika.html');
await page.waitForTimeout(2200);
await page.click('#menuRoot button[data-m="sandbox"]');
await page.waitForTimeout(400);
await page.click('.subpanel .map-picker .mp');
await page.waitForTimeout(7000);
await page.keyboard.press('KeyB');
await page.waitForTimeout(700);
const box = await page.locator('#gameCanvas').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * .62);
await page.waitForTimeout(250);
await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height * .62);
await page.waitForTimeout(250);
await page.keyboard.press('KeyR'); await page.waitForTimeout(150);
await page.keyboard.press('KeyT'); await page.waitForTimeout(150);
await page.mouse.click(box.x + box.width / 2 + 80, box.y + box.height * .62);
await page.waitForTimeout(300);
await page.click('#b-test');
await page.waitForTimeout(3500);
const after = await page.evaluate(() => ({
  speedo: document.getElementById('h-speed')?.textContent,
  minimap: !!document.getElementById('minimap'),
  hudLen: document.getElementById('hudRoot')?.innerHTML.length || 0,
}));
console.log('tras Test (piloto sentado):', JSON.stringify(after));
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
const drive = await page.evaluate(() => document.getElementById('h-speed')?.textContent);
console.log('velocidad tras 2.5s acelerando:', drive, 'km/h');
await page.screenshot({ path: '/tmp/e2e2.png' });
console.log('ERRORES:', errs.length);
errs.slice(0, 8).forEach(e => console.log('—', e));
await browser.close();
