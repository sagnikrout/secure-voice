import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 950 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3333/dialer-keypad-test.html...');
  await page.goto('http://localhost:3333/dialer-keypad-test.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const outDirs = [
    '/home/sagnik/secure-voice/public/candidates',
    '/mnt/c/Users/sagni/antigravity/SecureVoice/candidates',
    '/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a'
  ];

  // 1. Overview
  const overviewBuffer = await page.screenshot({ fullPage: true });
  for (const dir of outDirs) {
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'dialer_overview.png'), overviewBuffer);
    }
  }
  console.log('Saved dialer_overview.png');

  // 2. Individual cards
  const cards = [
    { selector: '.ui-showcase-card:nth-of-type(1)', filename: 'dialer_option_k1_telephone_t9.png' },
    { selector: '.ui-showcase-card:nth-of-type(2)', filename: 'dialer_option_k2_hexadecimal_matrix.png' },
  ];

  for (const card of cards) {
    const el = await page.$(card.selector);
    if (el) {
      const buf = await el.screenshot();
      for (const dir of outDirs) {
        if (fs.existsSync(dir)) {
          fs.writeFileSync(path.join(dir, card.filename), buf);
        }
      }
      console.log(`Saved ${card.filename}`);
    }
  }

  await browser.close();
  console.log('All dialer captures completed.');
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
