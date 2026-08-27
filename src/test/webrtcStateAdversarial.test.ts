import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transformOpusSdp,
  configureAudioTransceiver,
  applySenderBitrate,
  getQualityRating,
  generateSafetyCode,
  generatePeerId,
  sanitizePeerId
} from '../utils/webrtc';
import { OPUS_CONFIG } from '../constants/config';

describe('WebRTC Adversarial Stress Suite — Milestone 2 (R1 Transport)', () => {

  describe('1. Pathological & Malformed SDP Inputs to transformOpusSdp', () => {

    it('handles explicit null options parameter without throwing', () => {
      const validSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      let result;
      expect(() => {
        result = transformOpusSdp(validSdp, null);
      }).not.toThrow();

      if (result) {
        expect(result).toContain(`maxaveragebitrate=${OPUS_CONFIG.MAX_AVERAGE_BITRATE || 6000}`);
        expect(result).toContain('useinbandfec=1');
      }
    });

    it('handles non-object options parameters (primitive numbers, booleans, strings, symbols, arrays)', () => {
      const validSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2'
      ].join('\r\n');

      const pathologicalOptions = [
        12345,
        'random-string',
        true,
        false,
        [1, 2, 3],
        Symbol('opt'),
        () => {}
      ];

      for (const opt of pathologicalOptions) {
        expect(() => {
          const res = transformOpusSdp(validSdp, opt);
          expect(typeof res).toBe('string');
        }).not.toThrow();
      }
    });

    it('handles completely malformed / empty / single-line SDP inputs', () => {
      const inputs = [
        '',
        '   ',
        '\r\n\r\n\r\n',
        'INVALID_SDP_NO_LINES',
        'm=audio',
        'm=audio 9',
        'm=audio 9 UDP/TLS/RTP/SAVPF',
        'v=0\nm=audio 0 UDP/TLS/RTP/SAVPF 0\n', // Rejected audio section (port 0)
        'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n'
      ];

      for (const sdp of inputs) {
        expect(() => {
          const res = transformOpusSdp(sdp);
          expect(typeof res).toBe('string');
        }).not.toThrow();
      }
    });

    it('handles malformed / corrupted a=fmtp lines gracefully', () => {
      const corruptedFmtps = [
        'a=fmtp:111',
        'a=fmtp:111 ',
        'a=fmtp:111 ;;;;;;;',
        'a=fmtp:111 ====',
        'a=fmtp:111 =123;=456;;',
        'a=fmtp:111 valuelessKey1;valuelessKey2',
        'a=fmtp:111 maxaveragebitrate=not-a-number;stereo=invalid',
        'a=fmtp:111 minptime=10;unknown_custom_param=foo=bar'
      ];

      for (const fmtpLine of corruptedFmtps) {
        const sdp = [
          'v=0',
          'm=audio 9 UDP/TLS/RTP/SAVPF 111',
          'a=rtpmap:111 opus/48000/2',
          fmtpLine
        ].join('\r\n');

        expect(() => {
          const res = transformOpusSdp(sdp, { bitrate: 6000, packetLossPerc: 30 });
          expect(res).toContain('maxaveragebitrate=6000');
          expect(res).toContain('packetlossperc=30');
          expect(res).toContain('useinbandfec=1');
          expect(res).toContain('usedtx=1');
        }).not.toThrow();
      }
    });

    it('handles multiple audio sections with mixed codecs and uppercase/lowercase MIME types', () => {
      const sdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 9',
        'a=rtpmap:111 OPUS/48000/2',
        'a=rtpmap:9 G722/8000',
        'm=video 9 UDP/TLS/RTP/SAVPF 96',
        'a=rtpmap:96 VP8/90000',
        'm=audio 11 UDP/TLS/RTP/SAVPF 112 0',
        'a=rtpmap:112 opus/48000/2',
        'a=rtpmap:0 PCMU/8000'
      ].join('\r\n');

      const res = transformOpusSdp(sdp, { bitrate: 8000 });
      expect(res).toContain(`b=AS:${OPUS_CONFIG.BANDWIDTH_CAP_KBPS || 8}`);
      expect(res).toContain('a=rtpmap:63 red/48000/2');
      expect(res).toContain('a=rtpmap:9 G722/8000');
      expect(res).toContain('a=rtpmap:96 VP8/90000');
      expect(res).toContain('a=rtpmap:0 PCMU/8000');
    });

    it('handles multiple Opus payload types in a single audio section without breaking SDP format', () => {
      const sdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 112',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'a=rtpmap:112 opus/48000/2',
        'a=fmtp:112 minptime=20'
      ].join('\r\n');

      expect(() => {
        const res = transformOpusSdp(sdp, { bitrate: 6000 });
        expect(res).toContain('maxaveragebitrate=6000');
      }).not.toThrow();
    });

    it('handles large SDP without regex catastrophe or performance degradation', () => {
      const header = 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\n';
      const audioSection = [
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      // Generate 5000 lines of candidate / attribute noise
      const noise = Array.from({ length: 5000 }, (_, i) => `a=candidate:${i} 1 UDP 2122260223 192.168.1.${i % 250} ${10000 + i} typ host`).join('\r\n');
      const largeSdp = `${header}\r\n${audioSection}\r\n${noise}\r\n`;

      const t0 = performance.now();
      const res = transformOpusSdp(largeSdp, { bitrate: 6000 });
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(200); // Must complete within 200ms
      expect(res).toContain('maxaveragebitrate=6000');
      expect(res).toContain('a=candidate:4999');
    });

    it('maintains strict line ordering: b=AS and a=ptime strictly precede a=rtpmap/a=fmtp', () => {
      const sdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtcp:9 IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'a=ssrc:12345 cname:voice'
      ].join('\r\n');

      const res = transformOpusSdp(sdp);
      const lines = res.split('\r\n');

      const bIndex = lines.findIndex(l => l.startsWith('b=AS:'));
      const ptimeIndex = lines.findIndex(l => l.startsWith('a=ptime:'));
      const maxptimeIndex = lines.findIndex(l => l.startsWith('a=maxptime:'));
      const rtpmapIndex = lines.findIndex(l => l.startsWith('a=rtpmap:111'));
      const fmtpIndex = lines.findIndex(l => l.startsWith('a=fmtp:111'));

      expect(bIndex).toBeGreaterThan(-1);
      expect(ptimeIndex).toBeGreaterThan(-1);
      expect(maxptimeIndex).toBeGreaterThan(-1);
      expect(rtpmapIndex).toBeGreaterThan(-1);
      expect(fmtpIndex).toBeGreaterThan(-1);

      // RFC 4566 compliance: b=AS precedes attributes; ptime precedes rtpmap/fmtp
      expect(bIndex).toBeLessThan(rtpmapIndex);
      expect(ptimeIndex).toBeLessThan(rtpmapIndex);
      expect(maxptimeIndex).toBeLessThan(rtpmapIndex);
      expect(rtpmapIndex).toBeLessThan(fmtpIndex);
    });
  });

  describe('2. Extreme Values and Boundary Conditions for transformOpusSdp Options', () => {

    it('handles extreme and boundary bitrate values gracefully', () => {
      const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';

      const cases = [
        { opt: { bitrate: 0 }, expected: 'maxaveragebitrate=0' },
        { opt: { bitrate: 6000 }, expected: 'maxaveragebitrate=6000' },
        { opt: { bitrate: 12000 }, expected: 'maxaveragebitrate=12000' },
        { opt: { bitrate: 32000 }, expected: 'maxaveragebitrate=32000' },
        { opt: { bitrate: -1000 }, expected: 'maxaveragebitrate=-1000' },
        { opt: { maxaveragebitrate: '5000' }, expected: 'maxaveragebitrate=5000' },
        { opt: { bitrate: '  8000  ' }, expected: 'maxaveragebitrate=  8000  ' }
      ];

      for (const { opt, expected } of cases) {
        const res = transformOpusSdp(sdp, opt);
        expect(res).toContain(expected);
      }
    });

    it('handles boundary packet loss percentages (0 to 100)', () => {
      const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';

      expect(transformOpusSdp(sdp, { packetLossPerc: 0 })).toContain('packetlossperc=0');
      expect(transformOpusSdp(sdp, { packetLossPerc: 50 })).toContain('packetlossperc=50');
      expect(transformOpusSdp(sdp, { packetLossPerc: 100 })).toContain('packetlossperc=100');
    });

    it('handles various truthy and falsy boolean options representations', () => {
      const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';

      // Truthy representations
      const truthyRes = transformOpusSdp(sdp, { fec: 'true', dtx: 1, cbr: '1', stereo: true });
      expect(truthyRes).toContain('useinbandfec=1');
      expect(truthyRes).toContain('usedtx=1');
      expect(truthyRes).toContain('cbr=1');
      expect(truthyRes).toContain('stereo=1');

      // Falsy representations
      const falsyRes = transformOpusSdp(sdp, { fec: 'false', dtx: 0, cbr: '0', stereo: false });
      expect(falsyRes).toContain('useinbandfec=0');
      expect(falsyRes).toContain('usedtx=0');
      expect(falsyRes).toContain('cbr=0');
      expect(falsyRes).toContain('stereo=0');
    });
  });

  describe('3. Adversarial configureAudioTransceiver Robustness', () => {
    let originalRTCRtpReceiver;

    beforeEach(() => {
      originalRTCRtpReceiver = window.RTCRtpReceiver;
    });

    afterEach(() => {
      window.RTCRtpReceiver = originalRTCRtpReceiver;
      vi.restoreAllMocks();
    });

    it('handles pathological inputs to transceiver without throwing uncaught exceptions', () => {
      const badTransceivers = [
        null,
        undefined,
        123,
        'string',
        true,
        false,
        [],
        {},
        { setCodecPreferences: 'not-a-function' },
        { setCodecPreferences: null }
      ];

      for (const bad of badTransceivers) {
        expect(() => {
          const res = configureAudioTransceiver(bad);
          expect(res).toBe(false);
        }).not.toThrow();
      }
    });

    it('handles corrupted RTCRtpReceiver capabilities (null, empty, malformed codec objects)', () => {
      const corruptedCapabilities = [
        null,
        undefined,
        {},
        { codecs: null },
        { codecs: 'not-an-array' },
        { codecs: [] },
        { codecs: [null, undefined, 123, 'str', {}] },
        { codecs: [{ mimeType: null }, { mimeType: undefined }, { mimeType: 123 }] }
      ];

      for (const cap of corruptedCapabilities) {
        window.RTCRtpReceiver = {
          getCapabilities: vi.fn(() => cap)
        };

        const mockTransceiver = { setCodecPreferences: vi.fn() };
        expect(() => {
          const res = configureAudioTransceiver(mockTransceiver);
          expect(res).toBe(false);
          expect(mockTransceiver.setCodecPreferences).not.toHaveBeenCalled();
        }).not.toThrow();
      }
    });

    it('handles RTCRtpReceiver.getCapabilities throwing an error', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => {
          throw new Error('SecurityError: Not allowed');
        })
      };

      const mockTransceiver = { setCodecPreferences: vi.fn() };
      expect(() => {
        const res = configureAudioTransceiver(mockTransceiver);
        expect(res).toBe(false);
      }).not.toThrow();
    });

    it('handles setCodecPreferences throwing TypeError or InvalidModificationError', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({
          codecs: [
            { mimeType: 'audio/opus', clockRate: 48000, channels: 2 }
          ]
        }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn(() => {
          throw new TypeError('Invalid codec list');
        })
      };

      expect(() => {
        const res = configureAudioTransceiver(mockTransceiver);
        expect(res).toBe(false);
      }).not.toThrow();
    });

    it('preserves all non-matching codecs in preference list to prevent codec dropping', () => {
      const mockCodecs = [
        { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 },
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/telephone-event', clockRate: 8000 },
        { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/CN', clockRate: 8000 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: mockCodecs }))
      };

      const mockTransceiver = { setCodecPreferences: vi.fn() };
      const success = configureAudioTransceiver(mockTransceiver);

      expect(success).toBe(true);
      const passedList = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(passedList).toHaveLength(5);
      expect(passedList[0].mimeType).toBe('audio/red');
      expect(passedList[1].mimeType).toBe('audio/opus');
      expect(passedList).toContain(mockCodecs[0]);
      expect(passedList).toContain(mockCodecs[2]);
      expect(passedList).toContain(mockCodecs[4]);
    });
  });

  describe('4. Adversarial applySenderBitrate Sender Constraints & Fault Tolerance', () => {

    it('handles pathological sender inputs gracefully without throwing', async () => {
      const badSenders = [
        null,
        undefined,
        123,
        'string',
        true,
        [],
        {},
        { getParameters: null, setParameters: null },
        { getParameters: () => ({}), setParameters: null }
      ];

      for (const bad of badSenders) {
        await expect(applySenderBitrate(bad, 6000)).resolves.toBe(false);
      }
    });

    it('clamps extreme out-of-range bitrates to [3000, 32000]', async () => {
      const mockSender = {
        getParameters: vi.fn(() => ({ encodings: [{}] })),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      // Sub-3000 bitrates
      await applySenderBitrate(mockSender, -50000);
      expect(mockSender.setParameters.mock.calls[0][0].encodings[0].maxBitrate).toBe(3000);

      await applySenderBitrate(mockSender, 0);
      expect(mockSender.setParameters.mock.calls[1][0].encodings[0].maxBitrate).toBe(3000);

      await applySenderBitrate(mockSender, 100);
      expect(mockSender.setParameters.mock.calls[2][0].encodings[0].maxBitrate).toBe(3000);

      await applySenderBitrate(mockSender, 2999);
      expect(mockSender.setParameters.mock.calls[3][0].encodings[0].maxBitrate).toBe(3000);

      // Above-32000 bitrates
      await applySenderBitrate(mockSender, 32001);
      expect(mockSender.setParameters.mock.calls[4][0].encodings[0].maxBitrate).toBe(32000);

      await applySenderBitrate(mockSender, 1000000);
      expect(mockSender.setParameters.mock.calls[5][0].encodings[0].maxBitrate).toBe(32000);

      await applySenderBitrate(mockSender, Infinity);
      expect(mockSender.setParameters.mock.calls[6][0].encodings[0].maxBitrate).toBe(32000);
    });

    it('falls back to default 12000 bps for non-numeric/NaN bitrate inputs', async () => {
      const mockSender = {
        getParameters: vi.fn(() => ({ encodings: [{}] })),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 'invalid_bitrate');
      expect(mockSender.setParameters.mock.calls[0][0].encodings[0].maxBitrate).toBe(12000);

      await applySenderBitrate(mockSender, NaN);
      expect(mockSender.setParameters.mock.calls[1][0].encodings[0].maxBitrate).toBe(12000);

      await applySenderBitrate(mockSender, undefined);
      expect(mockSender.setParameters.mock.calls[2][0].encodings[0].maxBitrate).toBe(12000);
    });

    it('handles sender.getParameters returning corrupt encodings array elements', async () => {
      const corruptedEncodings = [
        null,
        undefined,
        [],
        [null],
        [undefined]
      ];

      for (const enc of corruptedEncodings) {
        const mockSender = {
          getParameters: vi.fn(() => ({ encodings: enc })),
          setParameters: vi.fn().mockResolvedValue(undefined)
        };

        await expect(applySenderBitrate(mockSender, 6000)).resolves.toBe(false);
      }
    });

    it('handles sender.setParameters asynchronous rejection without uncaught promise rejection', async () => {
      const mockSender = {
        getParameters: vi.fn(() => ({ encodings: [{ maxBitrate: 20000 }] })),
        setParameters: vi.fn().mockRejectedValue(new Error('RTCError: Network connection terminated'))
      };

      const res = await applySenderBitrate(mockSender, 6000);
      expect(res).toBe(false);
    });

    it('survives rapid concurrent invocations of applySenderBitrate on the same sender', async () => {
      let callCount = 0;
      const mockSender = {
        getParameters: vi.fn(() => ({ encodings: [{ maxBitrate: 20000 }] })),
        setParameters: vi.fn().mockImplementation(async () => {
          callCount++;
          await new Promise(r => setTimeout(r, 5));
        })
      };

      const promises = [
        applySenderBitrate(mockSender, 6000),
        applySenderBitrate(mockSender, 8000),
        applySenderBitrate(mockSender, 12000),
        applySenderBitrate(mockSender, 20000),
        applySenderBitrate(mockSender, 32000)
      ];

      const results = await Promise.all(promises);
      expect(results.every(r => r === true)).toBe(true);
      expect(callCount).toBe(5);
    });
  });

  describe('5. getQualityRating and generateSafetyCode Boundary Tests', () => {

    it('tests getQualityRating boundary thresholds and invalid inputs', () => {
      expect(getQualityRating(0)).toBe('good');
      expect(getQualityRating(0.1499)).toBe('good');
      expect(getQualityRating(0.1500)).toBe('fair');
      expect(getQualityRating(0.3999)).toBe('fair');
      expect(getQualityRating(0.4000)).toBe('poor');
      expect(getQualityRating(10.0)).toBe('poor');

      // Invalid inputs
      expect(getQualityRating(null)).toBe('good');
      expect(getQualityRating(undefined)).toBe('good');
      expect(getQualityRating(-0.5)).toBe('good');
      expect(getQualityRating('bad')).toBe('good');
      expect(getQualityRating(NaN)).toBe('good');
    });

    it('generateSafetyCode handles malformed SDPs, non-string types, missing fingerprints, and whitespace', async () => {
      const sdpWithFp = 'v=0\r\na=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99\r\nm=audio';
      const sdpNoFp = 'v=0\r\nm=audio';

      expect(await generateSafetyCode(null, sdpWithFp)).toBeNull();
      expect(await generateSafetyCode(sdpWithFp, null)).toBeNull();
      expect(await generateSafetyCode(sdpNoFp, sdpWithFp)).toBeNull();
      expect(await generateSafetyCode(sdpWithFp, sdpNoFp)).toBeNull();
      expect(await generateSafetyCode('', '')).toBeNull();
      expect(await generateSafetyCode(12345, sdpWithFp)).toBeNull();
      expect(await generateSafetyCode({}, sdpWithFp)).toBeNull();
      expect(await generateSafetyCode(sdpWithFp, true)).toBeNull();
    });

    it('generatePeerId produces collision-free IDs across 500 samples', () => {
      const ids = new Set();
      for (let i = 0; i < 500; i++) {
        ids.add(generatePeerId());
      }
      expect(ids.size).toBe(500);
    });

    it('sanitizePeerId handles weird characters and boundaries', () => {
      expect(sanitizePeerId('---')).toBe('');
      expect(sanitizePeerId('!!!@@@###$$$')).toBe('');
      expect(sanitizePeerId('ABC123DEF456GHI789')).toBe('ABC-123-DEF-456-GHI-789');
      expect(sanitizePeerId('a-b-c-d-e-f-g-h-i')).toBe('ABC-DEF-GHI');
    });
  });
});
