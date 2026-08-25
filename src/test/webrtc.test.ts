import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePeerId,
  sanitizePeerId,
  transformOpusSdp,
  configureAudioTransceiver,
  applySenderBitrate,
  getQualityRating,
  generateSafetyCode,
  ICE_SERVERS
} from '../utils/webrtc';
import { OPUS_CONFIG } from '../constants/config';

describe('WebRTC Utilities & Milestone 2 Transport Suite', () => {

  describe('generatePeerId', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('generates a secure 11-character string by default (9 raw chars + 2 hyphens)', () => {
      const id = generatePeerId();
      expect(typeof id).toBe('string');
      expect(id).toHaveLength(11); // XXX-XXX-XXX
    });

    it('throws an error if crypto API is unavailable (no Math.random fallback allowed)', () => {
      vi.stubGlobal('crypto', undefined);
      expect(() => {
        generatePeerId();
      }).toThrowError(/crypto\.getRandomValues/i); 
    });

    it('generates custom length strings', () => {
      expect(generatePeerId(8).replace(/-/g, '')).toHaveLength(8);
      expect(generatePeerId(20).replace(/-/g, '')).toHaveLength(20);
    });

    it('only contains unambiguous uppercase alphanumeric characters and hyphens', () => {
      const allowedRegex = /^[A-HJ-NP-Z2-9-]+$/; // Excludes 0, O, 1, I
      for (let i = 0; i < 20; i++) {
        const id = generatePeerId();
        expect(id).toMatch(allowedRegex);
      }
    });

    it('generates unique random IDs', () => {
      const set = new Set();
      for (let i = 0; i < 100; i++) {
        set.add(generatePeerId());
      }
      expect(set.size).toBe(100);
    });
  });

  describe('sanitizePeerId', () => {
    it('removes invalid characters, formats with hyphens, and trims', () => {
      expect(sanitizePeerId(' a b C-d 12# ')).toBe('ABC-D12');
      expect(sanitizePeerId('123456789')).toBe('123-456-789');
    });

    it('returns empty string for non-string inputs', () => {
      expect(sanitizePeerId(null)).toBe('');
      expect(sanitizePeerId(123)).toBe('');
    });
  });

  describe('transformOpusSdp — Core & Default Parameters', () => {
    it('returns empty/null/non-string sdp safely without mutation', () => {
      expect(transformOpusSdp('')).toBe('');
      expect(transformOpusSdp(null)).toBe(null);
      expect(transformOpusSdp(undefined)).toBe(undefined);
      expect(transformOpusSdp(12345)).toBe(12345);
      expect(transformOpusSdp({})).toEqual({});
    });

    it('injects default Opus parameters and bandwidth constraints into audio section', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain(`b=AS:${OPUS_CONFIG.BANDWIDTH_CAP_KBPS || 16}`);
      expect(transformed).toContain(`a=ptime:${OPUS_CONFIG.PTIME || 60}`);
      expect(transformed).toContain(`a=maxptime:${OPUS_CONFIG.MAX_PTIME || 120}`);
      expect(transformed).toContain(`maxaveragebitrate=${OPUS_CONFIG.MAX_AVERAGE_BITRATE || 12000}`);
      expect(transformed).toContain('useinbandfec=1');
      expect(transformed).toContain('usedtx=1');
      expect(transformed).toContain('stereo=0');
      expect(transformed).toContain('sprop-stereo=0');
      expect(transformed).toContain(`cbr=${OPUS_CONFIG.CBR || '1'}`);
      expect(transformed).toContain(`maxplaybackrate=${OPUS_CONFIG.MAX_PLAYBACK_RATE || '8000'}`);
      expect(transformed).toContain(`sprop-maxcapturerate=${OPUS_CONFIG.SPROP_MAX_CAPTURE_RATE || '8000'}`);
      expect(transformed).toContain('minptime=10'); // Preserves existing params

      // Ordering check: b=AS and a=ptime appear before a=rtpmap
      const bIndex = transformed.indexOf('b=AS:');
      const ptimeIndex = transformed.indexOf('a=ptime:');
      const rtpmapIndex = transformed.indexOf('a=rtpmap:111');
      expect(bIndex).toBeLessThan(rtpmapIndex);
      expect(ptimeIndex).toBeLessThan(rtpmapIndex);
    });

    it('injects RFC 2198 RED attributes by default', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 101',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'a=rtpmap:101 telephone-event/8000',
        'a=fmtp:101 0-15'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      // Verify m=audio format line prepends payload type 63 before 111
      expect(transformed).toMatch(/m=audio 9 UDP\/TLS\/RTP\/SAVPF 63 111/);
      expect(transformed).toContain('a=rtpmap:63 red/48000/2');
      expect(transformed).toContain('a=fmtp:63 111/111');

      // Verify non-Opus codecs remain completely untouched
      expect(transformed).toContain('a=rtpmap:101 telephone-event/8000');
      expect(transformed).toContain('a=fmtp:101 0-15');
    });
  });

  describe('transformOpusSdp — Dynamic Options & Bitrate Tuning', () => {
    it('applies Sub-6kbps Survival Mode parameters (6000 bps, ptime:60, maxplaybackrate:8000)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        bitrate: 6000,
        bandwidthCapKbps: 8,
        ptime: 60,
        maxptime: 120,
        packetLossPerc: 50,
        maxPlaybackRate: 8000,
        spropMaxCaptureRate: 8000
      });

      expect(transformed).toContain('b=AS:8');
      expect(transformed).toContain('a=ptime:60');
      expect(transformed).toContain('a=maxptime:120');
      expect(transformed).toContain('maxaveragebitrate=6000');
      expect(transformed).toContain('packetlossperc=50');
      expect(transformed).toContain('maxplaybackrate=8000');
      expect(transformed).toContain('sprop-maxcapturerate=8000');
    });

    it('applies High Quality Mode parameters (20000 bps, b=AS:24, maxplaybackrate:16000)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        bitrate: 20000,
        bandwidthCapKbps: 24,
        ptime: 40,
        maxptime: 60,
        packetLossPerc: 10,
        maxPlaybackRate: 16000
      });

      expect(transformed).toContain('b=AS:24');
      expect(transformed).toContain('a=ptime:40');
      expect(transformed).toContain('a=maxptime:60');
      expect(transformed).toContain('maxaveragebitrate=20000');
      expect(transformed).toContain('packetlossperc=10');
      expect(transformed).toContain('maxplaybackrate=16000');
    });

    it('supports toggling boolean flags (FEC off, DTX off, CBR on, Stereo on)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        fec: false,
        dtx: false,
        cbr: true,
        stereo: true
      });

      expect(transformed).toContain('useinbandfec=0');
      expect(transformed).toContain('usedtx=0');
      expect(transformed).toContain('cbr=1');
      expect(transformed).toContain('stereo=1');
      expect(transformed).toContain('sprop-stereo=1');
    });

    it('accepts string numbers gracefully without corrupting parameters', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, {
        bitrate: '8000',
        packetLossPerc: '35',
        ptime: '60'
      });

      expect(transformed).toContain('maxaveragebitrate=8000');
      expect(transformed).toContain('packetlossperc=35');
      expect(transformed).toContain('a=ptime:60');
    });
  });

  describe('transformOpusSdp — RFC 2198 RED Injection Mechanics', () => {
    it('dynamically uses the detected Opus payload type when not 111 (e.g. PT 109)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 109',
        'a=rtpmap:109 opus/48000/2',
        'a=fmtp:109 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toMatch(/m=audio 9 UDP\/TLS\/RTP\/SAVPF 63 109/);
      expect(transformed).toContain('a=rtpmap:63 red/48000/2');
      expect(transformed).toContain('a=fmtp:63 109/109');
    });

    it('omits RED injection when enableRed is explicitly false', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, { enableRed: false });

      expect(transformed).not.toContain('a=rtpmap:63 red/48000/2');
      expect(transformed).not.toContain('a=fmtp:63');
      expect(transformed).not.toContain('63 111');
      expect(transformed).toContain('maxaveragebitrate='); // Opus params still applied
    });

    it('prevents duplicate RED injection when SDP already has RED negotiated (idempotence)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 63 111',
        'a=rtpmap:63 red/48000/2',
        'a=fmtp:63 111/111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      // Ensure 63 is not duplicated in m=audio line
      expect(transformed).not.toContain('63 63 111');
      expect((transformed.match(/a=rtpmap:63 red/g) || []).length).toBe(1);
      expect((transformed.match(/a=fmtp:63 111\/111/g) || []).length).toBe(1);
    });

    it('allows custom RED payload type configuration (e.g. PT 122)', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, { redPayloadType: 122 });

      expect(transformed).toMatch(/m=audio 9 UDP\/TLS\/RTP\/SAVPF 122 111/);
      expect(transformed).toContain('a=rtpmap:122 red/48000/2');
      expect(transformed).toContain('a=fmtp:122 111/111');
    });
  });

  describe('transformOpusSdp — Formatting, Line Delimiters & Edge Cases', () => {
    it('strictly preserves CRLF (\\r\\n) line endings', () => {
      const mockSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111\r\n';
      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain('\r\n');
      const lines = transformed.split('\r\n');
      expect(lines.length).toBeGreaterThan(3);
    });

    it('strictly preserves LF (\\n) line endings', () => {
      const mockSdp = 'v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 111\na=rtpmap:111 opus/48000/2\na=fmtp:111\n';
      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain('\n');
      expect(transformed).not.toContain('\r\n');
    });

    it('handles SDP without existing a=fmtp line by generating one', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).toContain('a=fmtp:111');
      expect(transformed).toContain('maxaveragebitrate=');
      expect(transformed).toContain('useinbandfec=1');
    });

    it('leaves non-audio sections (video / datachannel) completely untouched', () => {
      const mockSdp = [
        'v=0',
        'm=video 9 UDP/TLS/RTP/SAVPF 96',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:96 VP8/90000',
        'm=application 9 DTLS/SCTP 5000',
        'a=sctpmap:5000 webrtc-datachannel 1024'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).not.toContain('b=AS:');
      expect(transformed).not.toContain('opus');
      expect(transformed).not.toContain('red/48000');
      expect(transformed).toContain('a=rtpmap:96 VP8/90000');
      expect(transformed).toContain('a=sctpmap:5000 webrtc-datachannel 1024');
    });

    it('handles SDP without any audio media line safely', () => {
      const mockSdp = 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toBe(mockSdp);
    });

    it('handles SDP with non-Opus audio codec (e.g. PCMU only) without crashing or adding RED', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 0 8',
        'a=rtpmap:0 PCMU/8000',
        'a=rtpmap:8 PCMA/8000'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);

      expect(transformed).not.toContain('a=rtpmap:63 red');
      expect(transformed).toContain('a=rtpmap:0 PCMU/8000');
    });

    it('replaces existing b=AS and a=ptime rather than duplicating them', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'b=AS:64',
        'a=ptime:20',
        'a=maxptime:40',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp, { bandwidthCapKbps: 12, ptime: 60, maxptime: 120 });

      expect(transformed).toContain('b=AS:12');
      expect(transformed).not.toContain('b=AS:64');
      expect(transformed).toContain('a=ptime:60');
      expect(transformed).not.toContain('a=ptime:20');
      expect((transformed.match(/b=AS:/g) || []).length).toBe(1);
      expect((transformed.match(/a=ptime:/g) || []).length).toBe(1);
    });

    it('handles multiple audio media blocks safely', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'm=audio 10 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=20'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);
      expect((transformed.match(new RegExp(`b=AS:${OPUS_CONFIG.BANDWIDTH_CAP_KBPS || 8}`, 'g')) || []).length).toBe(2);
      expect((transformed.match(/a=rtpmap:63 red\/48000\/2/g) || []).length).toBe(2);
    });
  });

  describe('configureAudioTransceiver — Codec Preference Ordering', () => {
    let originalRTCRtpReceiver;

    beforeEach(() => {
      originalRTCRtpReceiver = window.RTCRtpReceiver;
    });

    afterEach(() => {
      window.RTCRtpReceiver = originalRTCRtpReceiver;
      vi.restoreAllMocks();
    });

    it('prioritizes audio/red before audio/opus when RED capability is present', () => {
      const mockCodecs = [
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/telephone-event', clockRate: 8000 },
        { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn((kind) => {
          if (kind === 'audio') return { codecs: mockCodecs };
          return { codecs: [] };
        })
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn()
      };

      const result = configureAudioTransceiver(mockTransceiver);

      expect(window.RTCRtpReceiver.getCapabilities).toHaveBeenCalledWith('audio');
      expect(mockTransceiver.setCodecPreferences).toHaveBeenCalledTimes(1);

      const preferred = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(preferred[0].mimeType).toBe('audio/red');
      expect(preferred[1].mimeType).toBe('audio/opus');
      expect(preferred.length).toBe(4);
      expect(result).toBe(true);
    });

    it('prioritizes audio/opus when audio/red is not supported (fallback)', () => {
      const mockCodecs = [
        { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { mimeType: 'audio/telephone-event', clockRate: 8000 },
        { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: mockCodecs }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn()
      };

      const result = configureAudioTransceiver(mockTransceiver);

      expect(mockTransceiver.setCodecPreferences).toHaveBeenCalledTimes(1);
      const preferred = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(preferred[0].mimeType).toBe('audio/opus');
      expect(result).toBe(true);
    });

    it('matches mimeTypes case-insensitively', () => {
      const mockCodecs = [
        { mimeType: 'AUDIO/OPUS', clockRate: 48000, channels: 2 },
        { mimeType: 'Audio/RED', clockRate: 48000, channels: 2 }
      ];

      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: mockCodecs }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn()
      };

      configureAudioTransceiver(mockTransceiver);

      const preferred = mockTransceiver.setCodecPreferences.mock.calls[0][0];
      expect(preferred[0].mimeType).toBe('Audio/RED');
      expect(preferred[1].mimeType).toBe('AUDIO/OPUS');
    });

    it('gracefully returns false when transceiver lacks setCodecPreferences', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({ codecs: [{ mimeType: 'audio/opus' }] }))
      };

      const mockTransceiver = {}; // No setCodecPreferences
      expect(() => {
        const res = configureAudioTransceiver(mockTransceiver);
        expect(res).toBe(false);
      }).not.toThrow();
    });

    it('gracefully returns false when transceiver is null or undefined', () => {
      expect(configureAudioTransceiver(null)).toBe(false);
      expect(configureAudioTransceiver(undefined)).toBe(false);
    });

    it('gracefully returns false when RTCRtpReceiver is undefined', () => {
      window.RTCRtpReceiver = undefined;
      const mockTransceiver = { setCodecPreferences: vi.fn() };
      expect(configureAudioTransceiver(mockTransceiver)).toBe(false);
    });

    it('catches and handles exceptions thrown by setCodecPreferences', () => {
      window.RTCRtpReceiver = {
        getCapabilities: vi.fn(() => ({
          codecs: [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2 }]
        }))
      };

      const mockTransceiver = {
        setCodecPreferences: vi.fn(() => {
          throw new Error('InvalidModificationError');
        })
      };

      expect(() => {
        const res = configureAudioTransceiver(mockTransceiver);
        expect(res).toBe(false);
      }).not.toThrow();
    });
  });

  describe('applySenderBitrate — Sender Encoding Parameters & Priority Marking', () => {
    it('sets maxBitrate, priority: high, and networkPriority: high on audio sender', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      const result = await applySenderBitrate(mockSender, 6000);

      expect(mockSender.getParameters).toHaveBeenCalled();
      expect(mockSender.setParameters).toHaveBeenCalledTimes(1);

      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBe(6000);
      expect(passedParams.encodings[0].priority).toBe('high');
      expect(passedParams.encodings[0].networkPriority).toBe('high');
      expect(result).toBe(true);
    });

    it('clamps bitrates below 3000 bps up to 3000 bps', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 1500);
      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBe(3000);
    });

    it('clamps bitrates above 32000 bps down to upper bound', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 64000);
      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBeLessThanOrEqual(32000);
    });

    it('preserves existing encoding attributes and secondary encodings', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [
            { maxBitrate: 20000, active: true, rid: 'high' },
            { maxBitrate: 10000, active: false, rid: 'low' }
          ]
        }),
        setParameters: vi.fn().mockResolvedValue(undefined)
      };

      await applySenderBitrate(mockSender, 10000);
      const passedParams = mockSender.setParameters.mock.calls[0][0];
      expect(passedParams.encodings[0].maxBitrate).toBe(10000);
      expect(passedParams.encodings[0].active).toBe(true);
      expect(passedParams.encodings[0].rid).toBe('high');
      expect(passedParams.encodings[1].maxBitrate).toBe(10000);
    });

    it('returns false when sender is null, undefined, or missing getParameters', async () => {
      expect(await applySenderBitrate(null, 6000)).toBe(false);
      expect(await applySenderBitrate(undefined, 6000)).toBe(false);
      expect(await applySenderBitrate({}, 6000)).toBe(false);
    });

    it('returns false when getParameters returns no encodings array', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({ encodings: [] }),
        setParameters: vi.fn()
      };

      const result = await applySenderBitrate(mockSender, 6000);
      expect(result).toBe(false);
      expect(mockSender.setParameters).not.toHaveBeenCalled();
    });

    it('catches and handles setParameters rejection gracefully', async () => {
      const mockSender = {
        getParameters: vi.fn().mockReturnValue({
          encodings: [{ maxBitrate: 20000 }]
        }),
        setParameters: vi.fn().mockRejectedValue(new Error('InvalidStateError'))
      };

      const result = await applySenderBitrate(mockSender, 6000);
      expect(result).toBe(false);
    });
  });

  describe('getQualityRating', () => {
    it('returns good for RTT < 0.15s', () => {
      expect(getQualityRating(0.05)).toBe('good');
      expect(getQualityRating(0.149)).toBe('good');
    });

    it('returns fair for RTT between 0.15s and 0.40s', () => {
      expect(getQualityRating(0.15)).toBe('fair');
      expect(getQualityRating(0.39)).toBe('fair');
    });

    it('returns poor for RTT >= 0.40s', () => {
      expect(getQualityRating(0.40)).toBe('poor');
      expect(getQualityRating(1.2)).toBe('poor');
    });

    it('handles invalid / undefined / negative inputs safely', () => {
      expect(getQualityRating(null)).toBe('good');
      expect(getQualityRating(undefined)).toBe('good');
      expect(getQualityRating(-1)).toBe('good');
      expect(getQualityRating('invalid')).toBe('good');
    });
  });

  describe('ICE_SERVERS', () => {
    it('contains STUN and TURN configurations with non-empty credentials', () => {
      expect(ICE_SERVERS.iceServers).toBeDefined();
      expect(ICE_SERVERS.iceServers.length).toBeGreaterThan(3);
      const hasStun = ICE_SERVERS.iceServers.some(s => typeof s.urls === 'string' && s.urls.startsWith('stun:'));
      const turnServers = ICE_SERVERS.iceServers.filter(s => typeof s.urls === 'string' && (s.urls.startsWith('turn:') || s.urls.startsWith('turns:')));
      expect(hasStun).toBe(true);
      expect(turnServers.length).toBeGreaterThan(0);
      turnServers.forEach(server => {
        expect(server.username).toBeDefined();
        expect(server.username.length).toBeGreaterThan(0);
        expect(server.credential).toBeDefined();
        expect(server.credential.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateSafetyCode & Security Invariants', () => {
    it('generates the same 5-digit code regardless of parameter order', async () => {
      const sdpA = 'v=0\r\na=fingerprint:sha-256 00:11:22:33:44:55:66:77\r\nm=audio';
      const sdpB = 'v=0\r\na=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:11:22\r\nm=audio';
      
      const code1 = await generateSafetyCode(sdpA, sdpB);
      const code2 = await generateSafetyCode(sdpB, sdpA);
      
      expect(code1).toBe(code2);
      expect(code1).toMatch(/^\d{6}$/); // 5 digits
    });

    it('returns null if fingerprint is missing', async () => {
      const validSdp = 'v=0\r\na=fingerprint:sha-256 AA:BB\r\nm=audio';
      const invalidSdp = 'v=0\r\nm=audio';
      
      const result = await generateSafetyCode(validSdp, invalidSdp);
      expect(result).toBeNull();
    });

    it('maintains DTLS fingerprint integrity across SDP munging for generateSafetyCode', async () => {
      const baseSdpA = [
        'v=0',
        'a=fingerprint:sha-256 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const baseSdpB = [
        'v=0',
        'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      // Calculate code before munging
      const originalCode = await generateSafetyCode(baseSdpA, baseSdpB);

      // Munge both SDPs with aggressive low-bandwidth & RED options
      const mungedA = transformOpusSdp(baseSdpA, { bitrate: 6000, packetLossPerc: 50, enableRed: true });
      const mungedB = transformOpusSdp(baseSdpB, { bitrate: 6000, packetLossPerc: 50, enableRed: true });

      // Calculate code after munging
      const mungedCode = await generateSafetyCode(mungedA, mungedB);

      expect(mungedCode).toBe(originalCode);
      expect(mungedCode).toMatch(/^\d{6}$/);
    });
  });
});
