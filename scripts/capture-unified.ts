import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1100 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3333/...');
  await page.goto('http://localhost:3333/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const outDirs = [
    '/home/sagnik/secure-voice/public/candidates',
    '/mnt/c/Users/sagni/antigravity/SecureVoice/candidates',
    '/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a'
  ];

  const overviewBuffer = await page.screenshot({ fullPage: true });
  for (const dir of outDirs) {
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'unified_design_system_preview.png'), overviewBuffer);
    }
  }
  console.log('Saved unified_design_system_preview.png');

  await browser.close();
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
