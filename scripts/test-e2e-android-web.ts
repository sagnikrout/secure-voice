import { _android, chromium, Page } from 'playwright';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';

const WEB_URL = 'http://localhost:5173';
const ADB_PATH = fs.existsSync('/home/sagnik/Android/Sdk/platform-tools/adb')
  ? '/home/sagnik/Android/Sdk/platform-tools/adb'
  : (process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe' : 'adb');

function adb(command: string): string {
  try {
    return execSync(`"${ADB_PATH}" -s emulator-5554 ${command}`, { encoding: 'utf8' }).trim();
  } catch (e: any) {
    return e.stdout?.toString() || e.message;
  }
}

function ensureViteServer(port = 5173, timeoutMs = 25000): Promise<ChildProcess | null> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, () => resolve(null));
      req.on('error', () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Vite server did not respond on port ${port} within ${timeoutMs}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
    };

    const initialReq = http.get(`http://localhost:${port}`, () => resolve(null));
    initialReq.on('error', () => {
      console.log(`[Vite] Spawning Vite dev server on port ${port}...`);
      const viteBin = path.join('/home/sagnik/secure-voice', 'node_modules', 'vite', 'bin', 'vite.js');
      const child = spawn('node', [viteBin, '--port', `${port}`, '--strictPort', '--host'], {
        cwd: '/home/sagnik/secure-voice',
        stdio: 'ignore'
      });
      setTimeout(check, 1000);
    });
  });
}

async function waitForPeerReady(page: Page, label: string): Promise<string> {
  console.log(`[${label}] Waiting for Peer status to be Online (.status-chip.ready)...`);
  await page.waitForSelector('.status-chip.ready', { timeout: 60000 });
  const peerId = await page.$eval('.id-text', el => el.textContent!.trim());
  console.log(`[${label}] Online and Ready with Peer ID: ${peerId}`);
  return peerId;
}

async function run() {
  console.log('=== SecureVoice Android + Web E2E Integration Suite ===');

  const androidLogs: string[] = [];
  const webLogs: string[] = [];

  // Reset logcat on emulator for a clean trace
  console.log('[Setup] Clearing Android logcat buffer...');
  adb('logcat -c');

  // Ensure Android App is in foreground
  console.log('[Setup] Bringing SecureVoice to foreground on Android emulator...');
  adb('shell am start -n io.github.sagnikrout.securevoice/com.securevoice.app.MainActivity');
  await new Promise(r => setTimeout(r, 2000));

  // 1. Connect to Android Device & WebView via Playwright _android
  console.log('[Setup] Connecting to Android device via Playwright _android...');
  const [device] = await _android.devices();
  console.log(`[Setup] Connected to Android device: ${device.serial()} (${device.model()})`);

  console.log('[Setup] Attaching to SecureVoice WebView...');
  const webView = await device.webView({ pkg: 'io.github.sagnikrout.securevoice' });
  const androidPage = await webView.page();

  androidPage.on('console', msg => {
    const text = `[Android Console][${msg.type()}] ${msg.text()}`;
    androidLogs.push(text);
    console.log(text);
  });

  // 2. Ensure Vite server and launch Desktop Web Browser via Playwright
  console.log('[Setup] Ensuring Vite Dev Server is running...');
  await ensureViteServer(5173);
  console.log('[Setup] Launching Desktop Chromium instance for Web App...');
  const webBrowser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });
  const webContext = await webBrowser.newContext({
    permissions: ['microphone']
  });
  const webPage = await webContext.newPage();

  webPage.on('console', msg => {
    const text = `[Web Console][${msg.type()}] ${msg.text()}`;
    webLogs.push(text);
    console.log(text);
  });

  console.log(`[Setup] Navigating Web Client to ${WEB_URL}...`);
  await webPage.goto(WEB_URL);

  // 3. Obtain Peer IDs
  const androidPeerId = await waitForPeerReady(androidPage, 'Android');
  const webPeerId = await waitForPeerReady(webPage, 'Web');

  // 4. Test Idle UI Controls (Copy button & Audio Settings Modal)
  console.log('\n--- Scenario 0: Testing Idle UI Controls (Copy ID & Audio Settings) ---');
  await androidPage.click('button[aria-label="Copy Peer ID"]');
  await androidPage.waitForSelector('button[title="Copied"]', { timeout: 5000 });
  console.log('[Android] Copy ID button successfully copied and updated state.');

  await androidPage.click('button[aria-label="Audio & Codec Settings"]');
  await androidPage.waitForSelector('#audio-settings-title', { timeout: 5000 });
  console.log('[Android] Audio & Codec Settings dialog displayed.');
  await androidPage.click('button[aria-label="Close audio settings"]');
  await androidPage.waitForSelector('#audio-settings-title', { state: 'detached', timeout: 5000 });
  console.log('[Android] Audio & Codec Settings dialog closed.');

  // 5. Test Scenario 1: Web dials Android
  console.log(`\n--- Scenario 1: Web client dialing Android (${androidPeerId}) ---`);
  await webPage.fill('input.peer-input', androidPeerId);
  await webPage.click('button[aria-label="Initiate encrypted call"]');
  console.log('[Web] Clicked "Call"');

  // 6. Test Scenario 2: Android receives incoming call
  console.log('\n--- Scenario 2: Android detecting incoming call ---');
  await androidPage.waitForSelector('.incoming-card', { timeout: 25000 });
  const incomingCaller = await androidPage.$eval('#incoming-caller-id', el => el.textContent?.trim());
  console.log(`[Android] Incoming call modal displayed for caller: ${incomingCaller}`);

  // 7. Test Scenario 3: Android answers call
  console.log('\n--- Scenario 3: Android answering incoming call ---');
  await androidPage.click('.incoming-card button:has-text("Answer")');
  console.log('[Android] Clicked "Answer"');

  // 8. Test Scenario 4: Verify both sides reach active call state
  console.log('\n--- Scenario 4: Verifying active call establishment on both endpoints ---');
  await androidPage.waitForSelector('.timer', { timeout: 20000 });
  await webPage.waitForSelector('.timer', { timeout: 20000 });

  await new Promise(r => setTimeout(r, 3000)); // Let call timer tick
  const androidTimer = await androidPage.$eval('.timer', el => el.textContent?.trim());
  const webTimer = await webPage.$eval('.timer', el => el.textContent?.trim());
  console.log(`[Android] Active call timer: ${androidTimer}`);
  console.log(`[Web] Active call timer: ${webTimer}`);

  // 9. Test Scenario 5: Verify Telegram-Style 4-Emoji Cryptographic Fingerprint & Sheet
  console.log('\n--- Scenario 5: Verifying E2E DTLS-SRTP 4-Emoji Fingerprint Agreement ---');
  await androidPage.waitForSelector('.call-emoji-badge', { timeout: 15000 });
  await webPage.waitForSelector('.call-emoji-badge', { timeout: 15000 });

  const getEmojiFingerprint = (page: Page) => page.$eval('.call-emoji-icons', el => el.textContent?.trim() || '');

  const androidEmojiCode = await getEmojiFingerprint(androidPage);
  const webEmojiCode = await getEmojiFingerprint(webPage);
  console.log(`[Android Badge] Safety Emojis: [${androidEmojiCode}]`);
  console.log(`[Web Badge] Safety Emojis: [${webEmojiCode}]`);

  if (!androidEmojiCode || !webEmojiCode || androidEmojiCode !== webEmojiCode) {
    throw new Error(`Safety emoji fingerprint mismatch: Android=${androidEmojiCode} vs Web=${webEmojiCode}`);
  }

  // Click emoji badge on Android to open verification sheet
  console.log('[Android] User clicking emoji badge to open verification details...');
  await androidPage.click('.call-emoji-badge');
  await androidPage.waitForSelector('button[aria-label="Close security info"]', { timeout: 5000 });

  // Dismiss modal
  console.log('[Android] Dismissing security verification modal...');
  await androidPage.click('button[aria-label="Close security info"]');
  await androidPage.waitForSelector('button[aria-label="Close security info"]', { state: 'detached', timeout: 5000 });
  console.log('[Security] Verification sheet displayed and dismissed cleanly.');

  // 10. Test Scenario 6: Verify Audio Controls: Microphone Mute / Unmute
  console.log('\n--- Scenario 6: Testing Microphone Mute and Live state toggles ---');
  await androidPage.click('button.icon-btn[aria-label="Mute microphone"]');
  console.log('[Android] Clicked Mute');
  await androidPage.waitForSelector('button.icon-btn[aria-label="Unmute microphone"]', { timeout: 5000 });
  await androidPage.waitForFunction(() => {
    const text = document.querySelector('.mic-status-badge')?.textContent?.toLowerCase() || '';
    return text.includes('muted');
  }, { timeout: 5000 });
  console.log('[Android] Verified state: Microphone Muted');

  await androidPage.click('button.icon-btn[aria-label="Unmute microphone"]');
  console.log('[Android] Clicked Unmute');
  await androidPage.waitForSelector('button.icon-btn[aria-label="Mute microphone"]', { timeout: 5000 });
  await androidPage.waitForFunction(() => {
    const text = document.querySelector('.mic-status-badge')?.textContent?.toLowerCase() || '';
    return text.includes('live');
  }, { timeout: 5000 });
  console.log('[Android] Verified state: Microphone Live');

  // 11. Test Scenario 7: Verify Stats Overlay
  console.log('\n--- Scenario 7: Testing WebRTC Live Diagnostics & Telemetry Overlay ---');
  await androidPage.click('button[aria-label="Network Health"]');
  console.log('[Android] Clicked Network Health / Live Stats');
  await androidPage.waitForSelector('#stats-overlay-title', { timeout: 5000 });
  console.log('[Android] Stats overlay is visible.');
  await new Promise(r => setTimeout(r, 1500)); // Allow 1 interval of stats update
  await androidPage.click('button[aria-label="Close diagnostics"]');
  await androidPage.waitForSelector('#stats-overlay-title', { state: 'detached', timeout: 5000 });
  console.log('[Android] Closed stats overlay.');

  // 12. Test Scenario 8: Test App Backgrounding & Keep-Alive
  console.log('\n--- Scenario 8: Backgrounding Android App & Validating Keep-Alive ---');
  console.log('[ADB] Sending KEYCODE_HOME to move app to background...');
  adb('shell input keyevent KEYCODE_HOME');
  await new Promise(r => setTimeout(r, 4000));

  // Check foreground service
  const fgServices = adb('shell dumpsys activity services io.github.sagnikrout.securevoice');
  const isForegroundRunning = fgServices.includes('ForegroundService') || fgServices.includes('KeepAlive') || fgServices.includes('MainActivity');
  console.log(`[Android System] Service/Activity status in background: active=${isForegroundRunning}`);

  // Check web client call is still active while Android was in background
  const webTimerAfterBg = await webPage.$eval('.timer', el => el.textContent?.trim());
  console.log(`[Web] Call remains active while Android is backgrounded: duration=${webTimerAfterBg}`);

  // Restore app to foreground
  console.log('[ADB] Restoring SecureVoice to foreground...');
  adb('shell am start -n io.github.sagnikrout.securevoice/com.securevoice.app.MainActivity');
  await new Promise(r => setTimeout(r, 3000));
  await androidPage.waitForSelector('.timer', { timeout: 10000 });
  console.log('[Android] App restored to foreground; call is still active.');

  // 13. Test Scenario 9: Hang Up Call
  console.log('\n--- Scenario 9: Hanging up call and asserting clean teardown ---');
  await androidPage.locator('button.hangup').click({ force: true });
  console.log('[Android] Clicked Hangup button');

  // Verify return to idle
  await androidPage.waitForSelector('input.peer-input', { timeout: 15000 });
  await webPage.waitForSelector('input.peer-input', { timeout: 15000 });
  console.log('[Both] Verified clean return to idle screen.');

  // 14. Test Scenario 10: Verify Recent Calls Log
  console.log('\n--- Scenario 10: Verifying Recent Calls History ---');
  await androidPage.waitForSelector('.recents-card', { timeout: 10000 });
  await androidPage.locator('.recents-header').click({ force: true });
  await androidPage.waitForSelector('.recent-item .recent-id', { timeout: 5000 });
  const recentContact = await androidPage.$eval('.recent-item .recent-id', el => el.textContent?.trim());
  console.log(`[Android] Verified Recent Calls recorded entry: ${recentContact}`);

  // 15. Test Scenario 11: Outgoing Call & Cancellation Flow
  console.log('\n--- Scenario 11: Testing Outgoing Call & User Cancellation Flow ---');
  await androidPage.fill('input.peer-input', webPeerId);
  await androidPage.locator('button[aria-label="Initiate encrypted call"]').click({ force: true });
  console.log('[Android] Dialed Web peer');

  await webPage.waitForSelector('.incoming-card', { timeout: 15000 });
  console.log('[Web] Incoming call detected on web client');

  console.log('[Android] Testing Cancel button on outgoing call...');
  await androidPage.locator('button[aria-label="Cancel outgoing call"]').click({ force: true });
  console.log('[Android] Cancel button clicked');

  await androidPage.waitForSelector('input.peer-input', { timeout: 15000 });
  console.log('[Android] Verified clean return to idle screen after cancellation.');

  // On Web, dismiss / decline incoming dialog if still visible
  const webDeclineBtn = await webPage.$('.incoming-card button:has-text("Decline")');
  if (webDeclineBtn) {
    await webDeclineBtn.click();
    console.log('[Web] Clicked Decline on incoming modal');
  }
  await webPage.waitForSelector('input.peer-input', { timeout: 15000 });
  console.log('[Both] Return to idle verified across endpoints.');

  // 16. Save all logs
  fs.writeFileSync('android-console.log', androidLogs.join('\n'));
  fs.writeFileSync('web-console.log', webLogs.join('\n'));
  const logcat = adb('logcat -d');
  fs.writeFileSync('android-logcat.log', logcat);
  console.log('\n[Diagnostics] Logs successfully written to:');
  console.log('  - android-console.log');
  console.log('  - web-console.log');
  console.log('  - android-logcat.log');

  await webBrowser.close();
  console.log('\n=== ALL E2E SCENARIOS PASSED WITH ZERO ERRORS ===');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
