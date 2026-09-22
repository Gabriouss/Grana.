const { test } = require('playwright/test');

test('web probe', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:8082/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log(`url=${page.url()}`);
  console.log(`title=${await page.title()}`);
  console.log((await page.locator('body').innerText()).slice(0, 3000));
  await page.screenshot({ path: 'E:/Grana-temporarios/prints/web-probe.png', fullPage: true });
});
