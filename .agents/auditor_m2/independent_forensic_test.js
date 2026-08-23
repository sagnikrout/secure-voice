import {
  transformOpusSdp,
  configureAudioTransceiver,
  applySenderBitrate,
  getQualityRating,
  generateSafetyCode
} from '../../src/utils/webrtc.js';
import { OPUS_CONFIG } from '../../src/constants/config.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${message}`);
    passed++;
  }
}

async function runForensicChecks() {
  console.log('=== Milestone 2 Forensic Integrity & Stress Verification ===\n');

  // Check 1: Empty / Corrupted SDP Inputs
  assert(transformOpusSdp(null) === null, 'transformOpusSdp(null) returns null');
  assert(transformOpusSdp(undefined) === undefined, 'transformOpusSdp(undefined) returns undefined');
  assert(transformOpusSdp('') === '', 'transformOpusSdp("") returns ""');
  assert(transformOpusSdp(12345) === 12345, 'transformOpusSdp(12345) returns 12345');
  assert(typeof transformOpusSdp({}) === 'object', 'transformOpusSdp({}) returns object');

  // Check 2: CRLF Preservation and RFC 4566 Ordering
  const sdpCrlf = [
    'v=0',
    'o=- 123456 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 101',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10; useinbandfec=0',
    'a=rtpmap:101 telephone-event/8000'
  ].join('\r\n');

  const transformedCrlf = transformOpusSdp(sdpCrlf, {
    bitrate: 6000,
    packetLossPerc: 30,
    bandwidthCapKbps: 10
  });

  assert(transformedCrlf.includes('\r\n'), 'CRLF delimiter preserved');
  assert(!transformedCrlf.includes('\n\n') && !transformedCrlf.includes('\r\r'), 'No corrupt double linebreaks in CRLF');

  const lines = transformedCrlf.split('\r\n');
  const mLine = lines.find(l => l.startsWith('m=audio'));
  assert(mLine.includes('63 111 101'), 'RFC 2198 RED PT 63 prepended before Opus PT 111 in m=audio line');

  const bAsIndex = lines.findIndex(l => l.startsWith('b=AS:'));
  const ptimeIndex = lines.findIndex(l => l.startsWith('a=ptime:'));
  const rtpmapIndex = lines.findIndex(l => l.startsWith('a=rtpmap:111'));
  const fmtpOpusIndex = lines.findIndex(l => l.startsWith('a=fmtp:111'));
  const rtpmapRedIndex = lines.findIndex(l => l.startsWith('a=rtpmap:63'));
  const fmtpRedIndex = lines.findIndex(l => l.startsWith('a=fmtp:63'));

  assert(bAsIndex !== -1 && bAsIndex < rtpmapIndex, 'b=AS strictly precedes a=rtpmap');
  assert(ptimeIndex !== -1 && ptimeIndex < rtpmapIndex, 'a=ptime strictly precedes a=rtpmap');
  assert(lines[bAsIndex] === 'b=AS:10', 'b=AS bandwidth cap is 10 kbps');
  assert(rtpmapRedIndex === rtpmapIndex + 1, 'a=rtpmap:63 immediately follows a=rtpmap:111');
  assert(fmtpRedIndex === fmtpOpusIndex + 1, 'a=fmtp:63 immediately follows a=fmtp:111');

  const opusFmtpLine = lines[fmtpOpusIndex];
  assert(opusFmtpLine.includes('maxaveragebitrate=6000'), 'Opus fmtp contains maxaveragebitrate=6000');
  assert(opusFmtpLine.includes('useinbandfec=1'), 'Opus fmtp contains useinbandfec=1');
  assert(opusFmtpLine.includes('packetlossperc=30'), 'Opus fmtp contains packetlossperc=30');
  assert(opusFmtpLine.includes('usedtx=1'), 'Opus fmtp contains usedtx=1');
  assert(opusFmtpLine.includes('minptime=10'), 'Opus fmtp preserves existing parameters (minptime=10)');

  // Check 3: LF-only SDP Preservation
  const sdpLf = 'v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 111\na=rtpmap:111 opus/48000/2\n';
  const transformedLf = transformOpusSdp(sdpLf);
  assert(transformedLf.includes('\n') && !transformedLf.includes('\r\n'), 'LF delimiter preserved without CRLF introduction');

  // Check 4: Dynamic Opus Payload Type (e.g. PT 96 instead of 111)
  const sdpPt96 = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 96',
    'a=rtpmap:96 opus/48000/2',
    'a=fmtp:96 minptime=20'
  ].join('\r\n');

  const transformedPt96 = transformOpusSdp(sdpPt96, { redPayloadType: 77 });
  assert(transformedPt96.includes('m=audio 9 UDP/TLS/RTP/SAVPF 77 96'), 'Custom RED PT 77 injected for Opus PT 96');
  assert(transformedPt96.includes('a=rtpmap:77 red/48000/2'), 'a=rtpmap:77 red/48000/2 generated');
  assert(transformedPt96.includes('a=fmtp:77 96/96'), 'a=fmtp:77 96/96 mapped to dynamic Opus PT 96');

  // Check 5: Codec Preference Ordering & Safety Checks
  global.RTCRtpReceiver = {
    getCapabilities: (kind) => {
      if (kind === 'audio') {
        return {
          codecs: [
            { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 },
            { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
            { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
            { mimeType: 'audio/telephone-event', clockRate: 8000 }
          ]
        };
      }
      return { codecs: [] };
    }
  };

  let assignedCodecs = null;
  const mockTransceiver = {
    setCodecPreferences: (codecs) => {
      assignedCodecs = codecs;
    }
  };

  const prefResult = configureAudioTransceiver(mockTransceiver);
  assert(prefResult === true, 'configureAudioTransceiver returns true on valid transceiver');
  assert(assignedCodecs[0].mimeType === 'audio/red', 'audio/red is primary codec in preference list');
  assert(assignedCodecs[1].mimeType === 'audio/opus', 'audio/opus is secondary codec in preference list');
  assert(assignedCodecs.length === 4, 'All original codecs retained in preference list for fallback');

  // Check 6: Sender Bitrate Clamping & Priority API
  let appliedParams = null;
  const mockSender = {
    getParameters: () => ({
      encodings: [
        { maxBitrate: 24000, active: true }
      ]
    }),
    setParameters: async (params) => {
      appliedParams = params;
    }
  };

  // Test lower clamp (< 6000 bps)
  await applySenderBitrate(mockSender, 2500);
  assert(appliedParams.encodings[0].maxBitrate === 6000, 'Bitrate < 6000 bps clamped to 6000 bps floor');
  assert(appliedParams.encodings[0].priority === 'high', 'Priority set to high');
  assert(appliedParams.encodings[0].networkPriority === 'high', 'Network priority (DSCP) set to high');

  // Test upper clamp (> 32000 bps)
  await applySenderBitrate(mockSender, 50000);
  assert(appliedParams.encodings[0].maxBitrate === 32000, 'Bitrate > 32000 bps clamped to 32000 bps ceiling');

  // Test NaN / null fallback
  await applySenderBitrate(mockSender, 'invalid_bitrate');
  assert(appliedParams.encodings[0].maxBitrate === 12000, 'Invalid bitrate fallback to default 12000 bps');

  // Check 7: DTLS Fingerprint Preservation & Safety Code Invariant
  const sdpA = 'v=0\r\na=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';
  const sdpB = 'v=0\r\na=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';

  const originalCode = await generateSafetyCode(sdpA, sdpB);
  const mungedA = transformOpusSdp(sdpA, { bitrate: 6000, enableRed: true, packetLossPerc: 50 });
  const mungedB = transformOpusSdp(sdpB, { bitrate: 6000, enableRed: true, packetLossPerc: 50 });
  const postMungeCode = await generateSafetyCode(mungedA, mungedB);

  assert(originalCode !== null && originalCode.length === 5, 'Safety code is 5 digits');
  assert(originalCode === postMungeCode, 'Safety code is 100% identical before and after aggressive SDP transformation');

  // Check 8: Adversarial Edge Cases & Boundary Stress
  // 8.1: Conflicting alias resolution precedence (options.bitrate vs options.maxaveragebitrate)
  const sdpConflict = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111'
  ].join('\r\n');
  const resConflict = transformOpusSdp(sdpConflict, { bitrate: 6000, maxaveragebitrate: 18000 });
  assert(resConflict.includes('maxaveragebitrate=6000'), 'options.bitrate takes precedence over maxaveragebitrate');

  // 8.2: Malformed codec capabilities with null / missing mimeTypes
  global.RTCRtpReceiver = {
    getCapabilities: () => ({
      codecs: [
        null,
        {},
        { mimeType: undefined },
        { mimeType: 'audio/PCMU' },
        { mimeType: 'AUDIO/OPUS' },
        { mimeType: 'Audio/RED' }
      ]
    })
  };
  let edgeCodecs = null;
  const edgeTransceiver = { setCodecPreferences: (c) => { edgeCodecs = c; } };
  const edgeRes = configureAudioTransceiver(edgeTransceiver);
  assert(edgeRes === true, 'configureAudioTransceiver handles sparse / malformed codec capability entries');
  assert(edgeCodecs[0].mimeType === 'Audio/RED', 'Matches mixed-case Audio/RED');
  assert(edgeCodecs[1].mimeType === 'AUDIO/OPUS', 'Matches mixed-case AUDIO/OPUS');

  // 8.3: Repeated SDP transformation idempotence (running 5 times sequentially)
  let multiPassSdp = sdpCrlf;
  for (let i = 0; i < 5; i++) {
    multiPassSdp = transformOpusSdp(multiPassSdp, { bitrate: 6000, packetLossPerc: 40 });
  }
  const multiPassLines = multiPassSdp.split('\r\n');
  const bAsCount = multiPassLines.filter(l => l.startsWith('b=AS:')).length;
  const ptimeCount = multiPassLines.filter(l => l.startsWith('a=ptime:')).length;
  const redFmtpCount = multiPassLines.filter(l => l.startsWith('a=fmtp:63')).length;
  assert(bAsCount === 1, 'Idempotent SDP transformation: exactly 1 b=AS line after 5 passes');
  assert(ptimeCount === 1, 'Idempotent SDP transformation: exactly 1 a=ptime line after 5 passes');
  assert(redFmtpCount === 1, 'Idempotent SDP transformation: exactly 1 a=fmtp:63 line after 5 passes');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runForensicChecks().catch(err => {
  console.error('Forensic test runner error:', err);
  process.exit(1);
});
