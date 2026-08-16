import { describe, it, expect, vi } from 'vitest';
import {
  generatePeerId,
  sanitizePeerId,
  transformOpusSdp,
  getQualityRating,
  ICE_SERVERS
} from '../utils/webrtc';

describe('WebRTC Utilities', () => {
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

  describe('transformOpusSdp', () => {
    it('returns empty/null sdp safely', () => {
      expect(transformOpusSdp('')).toBe('');
      expect(transformOpusSdp(null)).toBe(null);
    });

    it('injects b=AS:16, ptime=40, and in-band FEC into Opus audio section', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toContain('b=AS:16');
      expect(transformed).toContain('a=ptime:40');
      expect(transformed).toContain('maxaveragebitrate=12000');
      expect(transformed).toContain('useinbandfec=1');
      expect(transformed).toContain('usedtx=1');
      expect(transformed).toContain('stereo=0');
      
      // Ensure strict ordering: b= and ptime come before a=rtpmap
      const bIndex = transformed.indexOf('b=AS:16');
      const firstAIndex = transformed.indexOf('a=rtpmap:111');
      expect(bIndex).toBeLessThan(firstAIndex);
    });

    it('handles SDP formatted with \\n line breaks and bare fmtp lines', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111'
      ].join('\n');

      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toContain('b=AS:16');
      expect(transformed).toContain('a=ptime:40');
      expect(transformed).toContain('maxaveragebitrate=12000');
      expect(transformed).toContain('usedtx=1');
      expect(transformed).not.toContain('\r\n'); // Verify delimiter preservation
    });

    it('preserves non-audio sections untouched', () => {
      const mockSdp = [
        'v=0',
        'm=video 9 UDP/TLS/RTP/SAVPF 96',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:96 VP8/90000'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).not.toContain('b=AS:16');
      expect(transformed).not.toContain('maxaveragebitrate');
    });

    it('does not corrupt non-Opus codecs', () => {
      const mockSdp = [
        'v=0',
        'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 101',
        'c=IN IP4 0.0.0.0',
        'a=rtcp:9 IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10',
        'a=rtpmap:101 telephone-event/8000',
        'a=fmtp:101 0-15',
        'a=ssrc:12345 cname:foo'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toContain('b=AS:16');
      expect(transformed).toContain('a=ptime:40');
      expect(transformed).toContain('useinbandfec=1');
      expect(transformed).toContain('a=fmtp:101 0-15'); // Telephone-event remains untouched
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
    it('contains STUN and TURN configurations', () => {
      expect(ICE_SERVERS.iceServers).toBeDefined();
      expect(ICE_SERVERS.iceServers.length).toBeGreaterThan(3);
      const hasStun = ICE_SERVERS.iceServers.some(s => typeof s.urls === 'string' && s.urls.startsWith('stun:'));
      const hasTurn = ICE_SERVERS.iceServers.some(s => typeof s.urls === 'string' && s.urls.startsWith('turn:'));
      expect(hasStun).toBe(true);
      expect(hasTurn).toBe(true);
    });
  });

  describe('generateSafetyCode', () => {
    it('generates the same 5-digit code regardless of parameter order', async () => {
      const { generateSafetyCode } = await import('../utils/webrtc');
      
      const sdpA = 'v=0\r\na=fingerprint:sha-256 00:11:22:33:44:55:66:77\r\nm=audio';
      const sdpB = 'v=0\r\na=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:11:22\r\nm=audio';
      
      const code1 = await generateSafetyCode(sdpA, sdpB);
      const code2 = await generateSafetyCode(sdpB, sdpA);
      
      expect(code1).toBe(code2);
      expect(code1).toMatch(/^\d{5}$/); // 5 digits
    });

    it('returns null if fingerprint is missing', async () => {
      const { generateSafetyCode } = await import('../utils/webrtc');
      const validSdp = 'v=0\r\na=fingerprint:sha-256 AA:BB\r\nm=audio';
      const invalidSdp = 'v=0\r\nm=audio';
      
      const result = await generateSafetyCode(validSdp, invalidSdp);
      expect(result).toBeNull();
    });
  });
});
