import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function generatePngs() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

  const logoSvg = fs.readFileSync(path.join('/home/sagnik/secure-voice/public/logo.svg'), 'utf8');

  // 1. Render 512x512 logo.png
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;display:flex;justify-content:center;align-items:center;width:512px;height:512px;">${logoSvg}</body></html>`);
  const logoBuffer = await page.screenshot({ type: 'png', omitBackground: true });
  fs.writeFileSync(path.join('/home/sagnik/secure-voice/public/logo.png'), logoBuffer);
  console.log('✅ Generated public/logo.png (512x512)');

  // 2. Render 192x192 favicon.png
  await page.setViewportSize({ width: 192, height: 192 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;display:flex;justify-content:center;align-items:center;width:192px;height:192px;">${logoSvg}</body></html>`);
  const favBuffer = await page.screenshot({ type: 'png', omitBackground: true });
  fs.writeFileSync(path.join('/home/sagnik/secure-voice/public/favicon.png'), favBuffer);
  console.log('✅ Generated public/favicon.png (192x192)');

  await browser.close();
}

generatePngs().catch(e => {
  console.error(e);
  process.exit(1);
});
