const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(4000);
  console.log('URL:', p.url());
  const email = await p.locator('#login-email').count();
  const sidebar = await p.locator('nav[aria-label="Main navigation"]').count();
  console.log('#login-email count:', email, '| sidebar count:', sidebar);
  console.log('body:', (await p.locator('body').innerText().catch(() => '')).slice(0, 300).replace(/\n/g, ' | '));
  await b.close();
})();
