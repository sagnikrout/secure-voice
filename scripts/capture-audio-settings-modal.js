import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const artifactDir = '/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a';
const windowsCandidateDir = '/mnt/c/Users/sagni/antigravity/SecureVoice/candidates';

async function captureModal() {
  console.log('Connecting to http://127.0.0.1:3000/...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 440, height: 860 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Click the Audio & Codec Settings button
  const settingsBtn = page.locator('button[title="Audio & Codec Settings"]');
  await settingsBtn.click();
  await page.waitForTimeout(600);

  // Click the Test Speaker button to verify it responds and completes chime
  const testSpeakerBtn = page.locator('button:has-text("Test Speaker")');
  if (await testSpeakerBtn.isVisible()) {
    console.log('Found Test Speaker button!');
    await testSpeakerBtn.click();
    await page.waitForTimeout(800);
  }

  const modalScreenshot = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(artifactDir, 'audio_settings_modal_redesign.png'), modalScreenshot);
  if (fs.existsSync(windowsCandidateDir)) {
    fs.writeFileSync(path.join(windowsCandidateDir, 'audio_settings_modal_redesign.png'), modalScreenshot);
  }
  console.log('Saved audio_settings_modal_redesign.png');

  await browser.close();
}

captureModal().catch(console.error);
