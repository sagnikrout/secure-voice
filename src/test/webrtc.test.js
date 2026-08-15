import { describe, it, expect } from 'vitest';
import {
  generatePeerId,
  sanitizePeerId,
  transformOpusSdp,
  getQualityRating,
  ICE_SERVERS
} from '../utils/webrtc';

describe('WebRTC Utilities', () => {
  describe('generatePeerId', () => {
    it('generates a 6-character string by default', () => {
      const id = generatePeerId();
      expect(typeof id).toBe('string');
      expect(id).toHaveLength(6);
    });

    it('generates custom length strings', () => {
      expect(generatePeerId(8)).toHaveLength(8);
      expect(generatePeerId(4)).toHaveLength(4);
    });

    it('only contains unambiguous uppercase alphanumeric characters', () => {
      const allowedRegex = /^[A-HJ-NP-Z2-9]+$/; // Excludes 0, O, 1, I
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
    it('converts lowercase to uppercase', () => {
      expect(sanitizePeerId('abc123')).toBe('ABC123');
    });

    it('strips invalid characters and whitespace', () => {
      expect(sanitizePeerId('  a-b_c #1!2@3  ')).toBe('ABC123');
    });

    it('handles non-string inputs safely', () => {
      expect(sanitizePeerId(null)).toBe('');
      expect(sanitizePeerId(undefined)).toBe('');
      expect(sanitizePeerId(12345)).toBe('');
    });
  });

  describe('transformOpusSdp', () => {
    it('returns empty/null sdp safely', () => {
      expect(transformOpusSdp('')).toBe('');
      expect(transformOpusSdp(null)).toBe(null);
    });

    it('injects b=AS:16 bandwidth cap in audio section', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10;useinbandfec=1'
      ].join('\r\n');

      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toContain('b=AS:16');
      expect(transformed).toContain('maxaveragebitrate=12000');
      expect(transformed).toContain('usedtx=1');
      expect(transformed).toContain('stereo=0');
    });

    it('handles SDP formatted with \n line breaks and bare fmtp lines', () => {
      const mockSdp = [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=fmtp:111'
      ].join('\n');

      const transformed = transformOpusSdp(mockSdp);
      expect(transformed).toContain('b=AS:16');
      expect(transformed).toContain('maxaveragebitrate=12000');
      expect(transformed).toContain('usedtx=1');
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
});
