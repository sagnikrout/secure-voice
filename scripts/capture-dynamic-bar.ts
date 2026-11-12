import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3333/dynamic-status-bar-test.html...');
  await page.goto('http://localhost:3333/dynamic-status-bar-test.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const outDirs = [
    '/home/sagnik/secure-voice/public/candidates',
    '/mnt/c/Users/sagni/antigravity/SecureVoice/candidates',
    '/home/sagnik/.gemini/antigravity-cli/brain/b1152ddf-af30-4092-a80d-8b323bd62d2a'
  ];

  // 1. Overview in READY state
  const overviewBuffer = await page.screenshot({ fullPage: true });
  for (const dir of outDirs) {
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'dynamic_bar_overview.png'), overviewBuffer);
    }
  }
  console.log('Saved dynamic_bar_overview.png');

  // 2. Individual card screenshots (Ready state)
  const cards = [
    { selector: '.opt-s1', filename: 'dynamic_option_s1_sliders_h.png' },
    { selector: '.opt-s2', filename: 'dynamic_option_s2_sliders_v.png' },
    { selector: '.opt-s3', filename: 'dynamic_option_s3_settings2.png' },
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

  // 3. Capture States for Option S1 (Recommended)
  const states = [
    { stateClass: 'state-ready', filename: 'dynamic_state_1_ready_emerald.png' },
    { stateClass: 'state-connecting', filename: 'dynamic_state_2_connecting_amber.png' },
    { stateClass: 'state-incall', filename: 'dynamic_state_3_incall_cyan.png' },
    { stateClass: 'state-error', filename: 'dynamic_state_4_error_crimson.png' },
  ];

  for (const s of states) {
    await page.evaluate((cls) => {
      document.querySelectorAll('.brand-accent-bar').forEach(bar => {
        bar.className = 'brand-accent-bar ' + cls;
      });
    }, s.stateClass);
    await page.waitForTimeout(150);

    const s1Card = await page.$('.opt-s1');
    if (s1Card) {
      const buf = await s1Card.screenshot();
      for (const dir of outDirs) {
        if (fs.existsSync(dir)) {
          fs.writeFileSync(path.join(dir, s.filename), buf);
        }
      }
      console.log(`Saved ${s.filename}`);
    }
  }

  // 4. Capture Copy Button Interaction (Idle vs Copied-Grey)
  const copyPeerBox = await page.$('.opt-s1 .mock-peer-box');
  if (copyPeerBox) {
    const idleBuf = await copyPeerBox.screenshot();
    for (const dir of outDirs) {
      if (fs.existsSync(dir)) {
        fs.writeFileSync(path.join(dir, 'copy_button_idle_blue.png'), idleBuf);
      }
    }
    console.log('Saved copy_button_idle_blue.png');

    // Trigger click on copy button
    const copyBtn = await page.$('.opt-s1 .icon-action-btn.btn-primary');
    if (copyBtn) {
      await copyBtn.click();
      await page.waitForTimeout(100);
      const copiedBuf = await copyPeerBox.screenshot();
      for (const dir of outDirs) {
        if (fs.existsSync(dir)) {
          fs.writeFileSync(path.join(dir, 'copy_button_copied_grey.png'), copiedBuf);
        }
      }
      console.log('Saved copy_button_copied_grey.png');
    }
  }

  await browser.close();
  console.log('All dynamic status bar and copy captures completed.');
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
