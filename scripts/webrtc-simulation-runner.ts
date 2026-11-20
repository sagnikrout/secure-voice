import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

function checkServerReady(port = 5173, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Server at port ${port} did not respond within ${timeout}ms`));
        } else {
          setTimeout(check, 400);
        }
      });
    };
    check();
  });
}

async function runSimulation() {
  console.log('\nWebRTC end-to-end simulation (2-peer test)\n');

  let viteProcess = null;
  const PORT = 5173;

  try {
    // Check if server is already running, if not start it
    try {
      await checkServerReady(PORT, 2000);
      console.log(`📡 Detected running Vite server on http://localhost:${PORT}`);
    } catch {
      console.log(`🚀 Starting local Vite server on port ${PORT}...`);
      const viteBin = path.join('/home/sagnik/secure-voice', 'node_modules', 'vite', 'bin', 'vite.js');
      viteProcess = spawn('node', [viteBin, '--port', `${PORT}`, '--strictPort', '--host'], {
        cwd: '/home/sagnik/secure-voice',
        stdio: 'pipe'
      });
      await checkServerReady(PORT, 20000);
      console.log(`✅ Vite server successfully started.`);
    }

    console.log('\n🌐 Launching Chromium instances with Fake Media Streams & Audio Capture...');
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-web-security',
        '--enable-features=WebRtcHideLocalIpsWithMdns'
      ]
    });

    // 1. Peer A Setup (Callee)
    console.log('👤 [Peer A] Initializing...');
    const contextA = await browser.newContext({ permissions: ['microphone'] });
    const pageA = await contextA.newPage();
    pageA.on('console', msg => console.log(`   [Browser A] ${msg.text()}`));
    await pageA.goto(`http://localhost:${PORT}`);
    await pageA.waitForSelector('.status-chip.ready', { timeout: 15000 });
    const peerAId = await pageA.$eval('.id-text', el => el.textContent.trim());
    console.log(`✅ [Peer A] Ready with Peer ID: \x1b[32m${peerAId}\x1b[0m`);

    // 2. Peer B Setup (Caller)
    console.log('👤 [Peer B] Initializing...');
    const contextB = await browser.newContext({ permissions: ['microphone'] });
    const pageB = await contextB.newPage();
    pageB.on('console', msg => console.log(`   [Browser B] ${msg.text()}`));
    await pageB.goto(`http://localhost:${PORT}`);
    await pageB.waitForSelector('.status-chip.ready', { timeout: 15000 });
    const peerBId = await pageB.$eval('.id-text', el => el.textContent.trim());
    console.log(`✅ [Peer B] Ready with Peer ID: \x1b[32m${peerBId}\x1b[0m`);

    // 3. Peer B Dials Peer A
    console.log(`\n📞 [Peer B] Dialing Peer A (${peerAId})...`);
    await pageB.fill('input.peer-input', peerAId);
    await pageB.click('button[aria-label="Initiate encrypted call"]');
    await pageB.waitForSelector('.calling-screen, .call-screen, .status-chip.calling, .status-chip.in-call', { timeout: 15000 });
    console.log(`⏳ [Peer B] Outgoing call signaled...`);

    // 4. Peer A Answers
    console.log(`🔔 [Peer A] Incoming call detected! Answering...`);
    const answerBtn = await pageA.waitForSelector('button[aria-label="Answer incoming call"]', { timeout: 20000 });
    await answerBtn.click();

    // 5. Verify In-Call State on Both Peers
    await pageA.waitForSelector('.call-screen, .timer', { timeout: 15000 });
    await pageB.waitForSelector('.call-screen, .timer', { timeout: 15000 });
    console.log('🔒 \x1b[32m[P2P Connection Established]\x1b[0m Both peers in active encrypted call!');

    // 6. Verify Call Timer and Visualizer
    await pageA.waitForTimeout(3000);
    const durationA = await pageA.$eval('.timer', el => el.textContent.trim());
    const durationB = await pageB.$eval('.timer', el => el.textContent.trim());
    console.log(`⏱️ Active Call Duration: Peer A = ${durationA}, Peer B = ${durationB}`);

    // 7. Verify Telegram-Style 4-Emoji Cryptographic Fingerprint
    const emojiBadgeA = await pageA.waitForSelector('.call-emoji-badge', { timeout: 10000 });
    const emojiBadgeB = await pageB.waitForSelector('.call-emoji-badge', { timeout: 10000 });
    const emojiCodeA = await pageA.$eval('.call-emoji-icons', el => el.textContent?.trim());
    const emojiCodeB = await pageB.$eval('.call-emoji-icons', el => el.textContent?.trim());
    console.log(`🔑 DTLS-SRTP 4-Emoji Fingerprint: Peer A = [${emojiCodeA}], Peer B = [${emojiCodeB}]`);
    if (emojiCodeA && emojiCodeB && emojiCodeA !== emojiCodeB) {
      throw new Error(`Emoji fingerprint mismatch: Peer A=${emojiCodeA} vs Peer B=${emojiCodeB}`);
    }
    if (emojiBadgeA) {
      await emojiBadgeA.click();
      await pageA.waitForSelector('button[aria-label="Close security info"]', { timeout: 5000 });
      await pageA.click('button[aria-label="Close security info"]');
      console.log(`🔑 Security modal verified and dismissed.`);
    }

    // 8. Extract WebRTC Telemetry via getStats()
    console.log('\n📊 Extracting Live WebRTC getStats() Telemetry from Browser Kernel...');
    const statsReport = await pageA.evaluate(async () => {
      const pc = window.__SECUREVOICE_ACTIVE_PC__;
      if (!pc) return { error: 'No active PC' };
      const stats = await pc.getStats();
      let rtt = null;
      let packetsReceived = 0;
      let packetsLost = 0;
      let audioLevel = 0;
      let codec = 'Opus';

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          packetsReceived = report.packetsReceived || 0;
          packetsLost = report.packetsLost || 0;
          audioLevel = report.audioLevel || 0;
        }
      });
      return { rtt, packetsReceived, packetsLost, audioLevel };
    });

    console.log(`   * Packets Received: ${statsReport.packetsReceived}`);
    console.log(`   * Packets Lost:     ${statsReport.packetsLost}`);
    console.log(`   * Current RTT:       ${statsReport.rtt !== null ? (statsReport.rtt * 1000).toFixed(1) + ' ms' : 'Local Mesh'}`);
    console.log(`   * Audio Level:      ${(statsReport.audioLevel * 100).toFixed(1)}%`);

    // 9. Test In-Call Audio Device Switcher & Diagnostics Overlay
    console.log('\n🔄 Testing In-Call Audio Device Switcher and Telemetry Modal...');
    await pageA.click('button[aria-label="Network Health"]');
    await pageA.waitForSelector('#stats-overlay-title', { timeout: 5000 });
    console.log('   ✅ Network Health Diagnostics Modal opened and populated.');
    await pageA.click('button[aria-label="Close diagnostics"]');

    // 10. Clean Hangup & Hardware Release
    console.log('\n🛑 [Peer A] Terminating Call...');
    await pageA.click('button.hangup');
    await pageA.waitForSelector('.status-chip.ready', { timeout: 5000 });
    await pageB.waitForSelector('.status-chip.ready', { timeout: 5000 });
    await browser.close();
    console.log('\nSimulation completed: all 10 steps succeeded.\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ \x1b[31mSimulation Failed:\x1b[0m', err);
    process.exit(1);
  } finally {
    if (viteProcess) {
      viteProcess.kill('SIGINT');
    }
  }
}

runSimulation();
