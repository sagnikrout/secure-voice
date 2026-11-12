import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1600 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3333/typography-test.html...');
  await page.goto('http://localhost:3333/typography-test.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // Wait for webfonts to render cleanly

  const outDirs = [
    '/home/sagnik/secure-voice/public/candidates',
    '/mnt/c/Users/sagni/antigravity/SecureVoice/candidates',
    '/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a'
  ];

  // 1. Overview screenshot
  const overviewBuffer = await page.screenshot({ fullPage: true });
  for (const dir of outDirs) {
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'typography_overview.png'), overviewBuffer);
    }
  }
  console.log('Saved typography_overview.png');

  // 2. Individual card screenshots
  const cards = [
    { selector: '.opt-1', filename: 'typography_option_1_plus_jakarta.png' },
    { selector: '.opt-2', filename: 'typography_option_2_swiss_inter.png' },
    { selector: '.opt-3', filename: 'typography_option_3_outfit_editorial.png' },
    { selector: '.opt-4', filename: 'typography_option_4_audiophile_hardware.png' },
    { selector: '.opt-1-alpha', filename: 'typography_option_1_alpha_two_tone_slate.png' },
    { selector: '.opt-1-beta', filename: 'typography_option_1_beta_two_tone_silver.png' },
    { selector: '.opt-1-gamma', filename: 'typography_option_1_gamma_hybrid_outfit.png' },
    { selector: '.opt-1-delta', filename: 'typography_option_1_delta_telemetry.png' },
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
  console.log('All typography cards captured successfully.');
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
