import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const artifactDir = '/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a';
const windowsCandidateDir = '/mnt/c/Users/sagni/antigravity/SecureVoice/candidates';

async function captureProduction() {
  console.log('Connecting to http://127.0.0.1:3335/...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 440, height: 860 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3335/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 1. Initial Ready State capture
  const readyBuffer = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(artifactDir, 'production_app_amoled_ready.png'), readyBuffer);
  fs.writeFileSync(path.join(windowsCandidateDir, 'production_app_amoled_ready.png'), readyBuffer);
  console.log('Saved: production_app_amoled_ready.png');

  // 2. Click Copy button and capture copied-grey state
  const copyBtn = page.locator('.id-actions .icon-action-btn').first();
  if (await copyBtn.isVisible({ timeout: 2000 })) {
    await copyBtn.click();
    await page.waitForTimeout(300);
    const copiedBuffer = await page.screenshot({ fullPage: false });
    fs.writeFileSync(path.join(artifactDir, 'production_app_copy_action.png'), copiedBuffer);
    fs.writeFileSync(path.join(windowsCandidateDir, 'production_app_copy_action.png'), copiedBuffer);
    console.log('Saved: production_app_copy_action.png');
  }

  // 3. Type into New Call input to verify auto-hyphenation (Option K3)
  const input = page.locator('input.peer-input');
  if (await input.isVisible({ timeout: 2000 })) {
    await input.fill('u787ztc8m');
    await page.waitForTimeout(300);
    const inputVal = await input.inputValue();
    console.log('Input value after typing "u787ztc8m":', inputVal);
    const typedBuffer = await page.screenshot({ fullPage: false });
    fs.writeFileSync(path.join(artifactDir, 'production_app_auto_hyphenation.png'), typedBuffer);
    fs.writeFileSync(path.join(windowsCandidateDir, 'production_app_auto_hyphenation.png'), typedBuffer);
    console.log('Saved: production_app_auto_hyphenation.png');
  }

  await browser.close();
  console.log('🎉 Production verification screenshots captured successfully!');
}

captureProduction().catch((err) => {
  console.error(err);
  process.exit(1);
});
