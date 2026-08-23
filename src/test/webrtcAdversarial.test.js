import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transformOpusSdp,
  configureAudioTransceiver,
  applySenderBitrate,
  getQualityRating,
  generateSafetyCode
} from '../utils/webrtc';
import { OPUS_CONFIG } from '../constants/config';

describe('Milestone 2 Adversarial & Stress Testing Suite (Challenger 2)', () => {

  describe('1. SDP Line Ordering & RFC 4566 Structural Integrity', () => {
    it('strictly maintains RFC 4566 grammar order (m= -> c= -> b= -> a=)', () => {
      const complexSdp = [
        'v=0',
        'o=- 482019482 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 101',
        'c=IN IP4 0.0.0.0',
        'a=rtcp:9 IN IP4 0.0.0.0',
        'a=ice-ufrag:f8e7',
        'a=ice-pwd:secretpassword123456789012',
        'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
        'a=setup:actpass',
        'a=mid:0',
        'a=sendrecv',
        'a=rtcp-mux',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10;useinbandfec=1',
        'a=rtpmap:101 telephone-event/8000',
        'a=fmtp:101 0-16'
      ].join('\r\n');

      const transformed = transformOpusSdp(complexSdp, {
        bitrate: 6000,
        bandwidthCapKbps: 12,
        ptime: 60,
        maxptime: 120
      });

      const lines = transformed.split('\r\n');
      const mIdx = lines.findIndex(l => l.startsWith('m=audio'));
      const cIdx = lines.findIndex(l => l.startsWith('c=IN'));
      const bIdx = lines.findIndex(l => l.startsWith('b=AS:12'));
      const ptimeIdx = lines.findIndex(l => l.startsWith('a=ptime:60'));
      const maxptimeIdx = lines.findIndex(l => l.startsWith('a=maxptime:120'));
      const rtcpIdx = lines.findIndex(l => l.startsWith('a=rtcp:9'));
      const rtpmapOpusIdx = lines.findIndex(l => l.startsWith('a=rtpmap:111'));
      const rtpmapRedIdx = lines.findIndex(l => l.startsWith('a=rtpmap:63 red'));
      const fmtpOpusIdx = lines.findIndex(l => l.startsWith('a=fmtp:111'));
      const fmtpRedIdx = lines.findIndex(l => l.startsWith('a=fmtp:63'));

      // Verify strict RFC 4566 line ordering
      expect(mIdx).toBeGreaterThan(-1);
      expect(cIdx).toBeGreaterThan(mIdx); // c= directly follows m=
      expect(bIdx).toBeGreaterThan(cIdx); // b= follows c=
      expect(ptimeIdx).toBeGreaterThan(bIdx); // a=ptime follows b=
      expect(maxptimeIdx).toBeGreaterThan(ptimeIdx); // a=maxptime follows a=ptime
      expect(rtcpIdx).toBeGreaterThan(maxptimeIdx); // general media a= follows ptime/maxptime
      expect(rtpmapOpusIdx).toBeGreaterThan(rtcpIdx); // rtpmap follows general attributes
      expect(rtpmapRedIdx).toBe(rtpmapOpusIdx + 1); // red rtpmap immediately follows opus rtpmap
      expect(fmtpOpusIdx).toBeGreaterThan(rtpmapRedIdx); // fmtp follows rtpmap
      expect(fmtpRedIdx).toBe(fmtpOpusIdx + 1); // red fmtp immediately follows opus fmtp
    });

    it('handles audio section with no initial attributes (bare m= line)', () => {
      const bareSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2'
      ].join('\n');

      const transformed = transformOpusSdp(bareSdp);
      const lines = transformed.split('\n');

      expect(lines[0]).toBe('v=0');
      expect(lines[1]).toBe('m=audio 9 UDP/TLS/RTP/SAVPF 63 111');
      expect(lines[2]).toBe(`b=AS:${OPUS_CONFIG.BANDWIDTH_CAP_KBPS || 16}`);
      expect(lines[3]).toBe(`a=ptime:${OPUS_CONFIG.PTIME || 60}`);
      expect(lines[4]).toBe(`a=maxptime:${OPUS_CONFIG.MAX_PTIME || 120}`);
      expect(lines[5]).toBe('a=rtpmap:111 opus/48000/2');
      expect(lines[6]).toBe('a=rtpmap:63 red/48000/2');
    });

    it('strips legacy/stale b=TIAS and b=AS lines without disrupting other attributes', () => {
      const sdpWithOldBw = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'b=TIAS:64000',
        'b=AS:64',
        'a=mid:0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 maxaveragebitrate=64000'
      ].join('\r\n');

      const transformed = transformOpusSdp(sdpWithOldBw, { bandwidthCapKbps: 8 });

      expect(transformed).not.toContain('b=TIAS:');
      expect(transformed).not.toContain('b=AS:64');
      expect(transformed).toContain('b=AS:8');
      expect((transformed.match(/b=AS:/g) || []).length).toBe(1);
    });

    it('preserves multi-line session header before audio section without modification', () => {
      const sdpSession = [
        'v=0',
        'o=alice 2890844526 2890844526 IN IP4 host.example.com',
        's=SecureVoice Session',
        'i=Encrypted P2P Voice Call',
        'u=https://example.com/alice',
        'e=alice@example.com',
        'c=IN IP4 host.example.com',
        'b=CT:128',
        't=0 0',
        'a=ice-lite',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2'
      ].join('\r\n');

      const transformed = transformOpusSdp(sdpSession);

      expect(transformed).toContain('s=SecureVoice Session');
      expect(transformed).toContain('i=Encrypted P2P Voice Call');
      expect(transformed).toContain('u=https://example.com/alice');
      expect(transformed).toContain('b=CT:128'); // Session-level bandwidth unchanged
      expect(transformed).toContain('a=ice-lite');
      expect(transformed).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 63 111');
      expect(transformed).toContain('b=AS:16'); // Media-level audio bandwidth injected
    });
  });

  describe('2. RED Payload Type Conflicts, Dynamic Aliasing & Negotiation', () => {
    it('handles non-standard Opus payload types (e.g. PT 96, 100, 120, 127)', () => {
      const testPts = [96, 100, 107, 120, 127];

      for (const pt of testPts) {
        const sdp = [
          'v=0',
          `m=audio 9 UDP/TLS/RTP/SAVPF ${pt} 101`,
          `a=rtpmap:${pt} opus/48000/2`,
          `a=fmtp:${pt} minptime=10`
        ].join('\r\n');

        const transformed = transformOpusSdp(sdp, { redPayloadType: 63 });

        expect(transformed).toContain(`m=audio 9 UDP/TLS/RTP/SAVPF 63 ${pt} 101`);
        expect(transformed).toContain('a=rtpmap:63 red/48000/2');
        expect(transformed).toContain(`a=fmtp:63 ${pt}/${pt}`);
        expect(transformed).toContain(`a=fmtp:${pt}`);
      }
    });

    it('allows overriding RED payload type when existing codec is on PT 63 (custom PT 122)', () => {
      const sdpWithPt63 = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'a=rtpmap:63 AMR-WB/16000',
        'a=fmtp:63 octet-align=1'
      ].join('\r\n');

      const transformed = transformOpusSdp(sdpWithPt63, { redPayloadType: 122 });

      expect(transformed).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 122 111 63');
      expect(transformed).toContain('a=rtpmap:122 red/48000/2');
      expect(transformed).toContain('a=fmtp:122 111/111');
      expect(transformed).toContain('a=rtpmap:63 AMR-WB/16000');
    });

    it('preserves existing negotiated RED PT across SDP renegotiation / offer-answer cycles', () => {
      const alreadyNegotiatedSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 122 111 101',
        'a=rtpmap:122 red/48000/2',
        'a=fmtp:122 111/111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 maxaveragebitrate=20000;useinbandfec=1'
      ].join('\r\n');

      // Re-munging with emergency low bitrate
      const remunged = transformOpusSdp(alreadyNegotiatedSdp, {
        bitrate: 6000,
        packetLossPerc: 50
      });

      // Must reuse existing RED PT 122, NOT overwrite with default 63
      expect(remunged).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 122 111 101');
      expect(remunged).toContain('a=rtpmap:122 red/48000/2');
      expect(remunged).toContain('a=fmtp:122 111/111');
      expect(remunged).not.toContain('a=rtpmap:63');
      expect(remunged).toContain('maxaveragebitrate=6000');
      expect(remunged).toContain('packetlossperc=50');
      expect((remunged.match(/a=rtpmap:122/g) || []).length).toBe(1);
    });

    it('handles transition from enableRed=true to enableRed=false cleanly', () => {
      const sdpWithRed = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 63 111 101',
        'a=rtpmap:63 red/48000/2',
        'a=fmtp:63 111/111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const disabled = transformOpusSdp(sdpWithRed, { enableRed: false });

      expect(disabled).not.toContain('63');
      expect(disabled).not.toContain('red/48000');
      expect(disabled).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 111 101');
      expect(disabled).toContain('a=rtpmap:111 opus/48000/2');
      expect(disabled).toContain('maxaveragebitrate=12000');
    });

    it('handles multiple secondary codecs in m= line (G.711, G.722, telephone-event)', () => {
      const richSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 9 0 8 101',
        'a=rtpmap:111 opus/48000/2',
        'a=rtpmap:9 G722/8000',
        'a=rtpmap:0 PCMU/8000',
        'a=rtpmap:8 PCMA/8000',
        'a=rtpmap:101 telephone-event/8000'
      ].join('\r\n');

      const transformed = transformOpusSdp(richSdp, { enableRed: true, redPayloadType: 63 });

      // 63 inserted right before 111; 9, 0, 8, 101 preserved in order
      expect(transformed).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 63 111 9 0 8 101');
      expect(transformed).toContain('a=rtpmap:9 G722/8000');
      expect(transformed).toContain('a=rtpmap:0 PCMU/8000');
      expect(transformed).toContain('a=rtpmap:8 PCMA/8000');
      expect(transformed).toContain('a=rtpmap:101 telephone-event/8000');
    });
  });

  describe('3. Custom ptime and maxptime Boundaries & Aliases', () => {
    it('handles standard Opus packetization values (10, 20, 40, 60, 80, 100, 120)', () => {
      const ptimes = [10, 20, 40, 60, 80, 100, 120];

      for (const pt of ptimes) {
        const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';
        const transformed = transformOpusSdp(sdp, { ptime: pt, maxptime: 120 });
        expect(transformed).toContain(`a=ptime:${pt}`);
        expect(transformed).toContain('a=maxptime:120');
      }
    });

    it('supports maxPtime camelCase alias identically to maxptime', () => {
      const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';
      const transformed = transformOpusSdp(sdp, { maxPtime: 60 });
      expect(transformed).toContain('a=maxptime:60');
    });

    it('replaces existing ptime / maxptime without accumulating duplicates', () => {
      let currentSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';

      // Simulate 5 successive renegotiation passes with different ptimes
      for (let i = 20; i <= 100; i += 20) {
        currentSdp = transformOpusSdp(currentSdp, { ptime: i, maxptime: i + 20 });
        expect((currentSdp.match(/a=ptime:/g) || []).length).toBe(1);
        expect((currentSdp.match(/a=maxptime:/g) || []).length).toBe(1);
        expect(currentSdp).toContain(`a=ptime:${i}`);
        expect(currentSdp).toContain(`a=maxptime:${i + 20}`);
      }
    });

    it('preserves existing minptime inside a=fmtp untouched', () => {
      const sdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=20;maxplaybackrate=48000'
      ].join('\r\n');

      const transformed = transformOpusSdp(sdp, { ptime: 60, maxptime: 120, maxPlaybackRate: 16000 });

      expect(transformed).toContain('minptime=20');
      expect(transformed).toContain('maxplaybackrate=16000');
      expect(transformed).toContain('a=ptime:60');
      expect(transformed).toContain('a=maxptime:120');
    });
  });

  describe('4. Sender Priority Markings & RTCRtpSender Edge Cases', () => {
    it('sets custom priority levels (medium, low, very-low)', async () => {
      const priorities = ['very-low', 'low', 'medium', 'high'];

      for (const p of priorities) {
        const mockSender = {
          getParameters: vi.fn().mockReturnValue({ encodings: [{ maxBitrate: 12000 }] }),
          setParameters: vi.fn().mockResolvedValue(undefined)
        };

        const success = await applySenderBitrate(mockSender, 12000, p);
        expect(success).toBe(true);

        const applied = mockSender.setParameters.mock.calls[0][0];
        expect(applied.encodings[0].priority).toBe(p);
        expect(applied.encodings[0].networkPriority).toBe(p);
      }
    });

    it('defaults to high priority when priority parameter is omitted', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({ encodings: [{ maxBitrate: 12000 }] }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 8000);
      const applied = mockSender.setParameters.mock.calls[0][0];
      expect(applied.encodings[0].priority).toBe('high');
      expect(applied.encodings[0].networkPriority).toBe('high');
    });

    it('handles numeric string bitrates (e.g. "8000")', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({ encodings: [{}] }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, '8000');
      const applied = mockSender.setParameters.mock.calls[0][0];
      expect(applied.encodings[0].maxBitrate).toBe(8000);
    });

    it('handles NaN/invalid bitrate by falling back to 12000 bps default', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({ encodings: [{}] }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 'invalid_bps');
      const applied = mockSender.setParameters.mock.calls[0][0];
      expect(applied.encodings[0].maxBitrate).toBe(12000);
    });

    it('handles getParameters throwing synchronously without unhandled rejection', async () => {
      const throwingSender = {
        getParameters: vi.fn(() => { throw new Error('InvalidStateError'); }),
        setParameters: vi.fn()
      };

      const result = await applySenderBitrate(throwingSender, 6000);
      expect(result).toBe(false);
    });

    it('handles null/undefined encodings property safely', async () => {
      const brokenSender1 = {
        getParameters: vi.fn().mockReturnValue({ encodings: null }),
        setParameters: vi.fn()
      };
      const brokenSender2 = {
        getParameters: vi.fn().mockReturnValue({}),
        setParameters: vi.fn()
      };

      expect(await applySenderBitrate(brokenSender1, 6000)).toBe(false);
      expect(await applySenderBitrate(brokenSender2, 6000)).toBe(false);
    });
  });

  describe('5. Transceiver Codec Preferences Robustness', () => {
    let originalReceiver;

    beforeEach(() => {
      originalReceiver = window.RTCRtpReceiver;
    });

    afterEach(() => {
      window.RTCRtpReceiver = originalReceiver;
      vi.restoreAllMocks();
    });

    it('handles empty codec list from getCapabilities gracefully', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: [] }))
      };
      const transceiver = { setCodecPreferences: vi.fn() };

      const res = configureAudioTransceiver(transceiver);
      expect(res).toBe(false);
      expect(transceiver.setCodecPreferences).not.toHaveBeenCalled();
    });

    it('handles null codecs array gracefully', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: null }))
      };
      const transceiver = { setCodecPreferences: vi.fn() };

      const res = configureAudioTransceiver(transceiver);
      expect(res).toBe(false);
      expect(transceiver.setCodecPreferences).not.toHaveBeenCalled();
    });

    it('handles codec list with missing Opus gracefully', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({
          codecs: [
            { mimeType: 'audio/PCMU', clockRate: 8000 },
            { mimeType: 'audio/PCMA', clockRate: 8000 }
          ]
        }))
      };
      const transceiver = { setCodecPreferences: vi.fn() };

      const res = configureAudioTransceiver(transceiver);
      expect(res).toBe(false);
      expect(transceiver.setCodecPreferences).not.toHaveBeenCalled();
    });
  });

  describe('6. Safety Code Cryptographic Determinism Invariant', () => {
    it('produces identical safety code across extreme SDP transformations', async () => {
      const sdpA = [
        'v=0',
        'a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 maxaveragebitrate=32000'
      ].join('\r\n');

      const sdpB = [
        'v=0',
        'a=fingerprint:sha-256 FF:EE:DD:CC:BB:AA:00:99:88:77:66:55:44:33:22:11:FF:EE:DD:CC:BB:AA:00:99:88:77:66:55:44:33:22:11',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 maxaveragebitrate=32000'
      ].join('\r\n');

      const originalCode = await generateSafetyCode(sdpA, sdpB);

      // Heavily munge both SDPs (bitrate drop to 6kbps, packet loss 50%, ptime 60, RED enabled)
      const mungedA = transformOpusSdp(sdpA, { bitrate: 6000, packetLossPerc: 50, ptime: 60, enableRed: true });
      const mungedB = transformOpusSdp(sdpB, { bitrate: 6000, packetLossPerc: 50, ptime: 60, enableRed: true });

      const mungedCode = await generateSafetyCode(mungedA, mungedB);

      expect(originalCode).toBe(mungedCode);
      expect(originalCode).toMatch(/^\d{5}$/);
    });
  });

  describe('7. Pathological Input Types & Malformed SDP Invariants', () => {
    it('returns pathological non-string inputs unmodified without throwing', () => {
      const nonStringInputs = [
        null,
        undefined,
        0,
        12345,
        true,
        false,
        Symbol('sdp'),
        { sdp: 'v=0' },
        ['v=0'],
        () => 'v=0'
      ];

      for (const input of nonStringInputs) {
        expect(() => {
          const res = transformOpusSdp(input);
          expect(res).toBe(input);
        }).not.toThrow();
      }
    });

    it('handles malformed fmtp strings (spaces, multiple semicolons, empty parameters)', () => {
      const malformedSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111  ; ; minptime = 10 ; maxplaybackrate = 48000 ; ; '
      ].join('\r\n');

      const transformed = transformOpusSdp(malformedSdp, { bitrate: 6000 });

      expect(transformed).toContain('maxaveragebitrate=6000');
      expect(transformed).toContain('minptime=10'); // Normalized paramMap key-value
      expect(transformed).toContain('a=fmtp:63 111/111');
    });

    it('matches Opus codec case-insensitively and regardless of channel count notation', () => {
      const oddCasedSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 OPUS/48000', // Uppercase OPUS and no /2
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(oddCasedSdp);

      expect(transformed).toContain('maxaveragebitrate=12000');
      expect(transformed).toContain('a=rtpmap:63 red/48000/2');
    });

    it('handles duplicate a=rtpmap:111 opus lines without corrupting section', () => {
      const dupSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(dupSdp);
      expect(transformed).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 63 111');
      expect(transformed).toContain('maxaveragebitrate=12000');
    });
  });

  describe('8. Extreme Numerical Clamping & Boundary Tests', () => {
    it('exhaustively clamps sender bitrates across extreme numeric ranges', async () => {
      const cases = [
        { input: 0, expected: 3000 },
        { input: 2999, expected: 3000 },
        { input: 3000, expected: 3000 },
        { input: 3001, expected: 3001 },
        { input: 6000, expected: 6000 },
        { input: 12000, expected: 12000 },
        { input: 31999, expected: 31999 },
        { input: 32000, expected: 32000 },
        { input: 32001, expected: 32000 },
        { input: 100000, expected: 32000 },
        { input: -5000, expected: 3000 },
        { input: Infinity, expected: 32000 },
        { input: -Infinity, expected: 3000 },
        { input: '3000', expected: 3000 },
        { input: '32000', expected: 32000 },
        { input: null, expected: 3000 }, // Number(null) -> 0 -> clamped to 3000
        { input: undefined, expected: 12000 }, // Number(undefined) -> NaN -> default 12000
        { input: 'not-a-number', expected: 12000 } // NaN -> default 12000
      ];

      for (const { input, expected } of cases) {
        const mockSender = {
          getParameters: vi.fn().mockReturnValue({ encodings: [{}] }),
          setParameters: vi.fn().mockResolvedValue(undefined)
        };

        const res = await applySenderBitrate(mockSender, input);
        expect(res).toBe(true);
        const passedParams = mockSender.setParameters.mock.calls[0][0];
        expect(passedParams.encodings[0].maxBitrate).toBe(expected);
      }
    });

    it('evaluates getQualityRating across exact boundary thresholds', () => {
      // < 0.15 is good
      expect(getQualityRating(0)).toBe('good');
      expect(getQualityRating(0.149999)).toBe('good');
      expect(getQualityRating(0.15)).toBe('fair');

      // 0.15 <= rtt < 0.40 is fair
      expect(getQualityRating(0.25)).toBe('fair');
      expect(getQualityRating(0.399999)).toBe('fair');
      expect(getQualityRating(0.40)).toBe('poor');

      // >= 0.40 is poor
      expect(getQualityRating(0.40001)).toBe('poor');
      expect(getQualityRating(10.0)).toBe('poor');
      expect(getQualityRating(Infinity)).toBe('poor');

      // Edge cases
      expect(getQualityRating(-1)).toBe('good');
      expect(getQualityRating(NaN)).toBe('good');
      expect(getQualityRating(null)).toBe('good');
      expect(getQualityRating(undefined)).toBe('good');
    });
  });
});
