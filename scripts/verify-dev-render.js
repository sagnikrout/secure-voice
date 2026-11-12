import { chromium } from 'playwright';
import fs from 'fs';

async function checkDev() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 440, height: 860 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const buf = await page.screenshot();
  fs.writeFileSync('/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a/dev_server_verification.png', buf);
  await browser.close();
  console.log('Dev server screenshot verified!');
}
checkDev().catch(console.error);
