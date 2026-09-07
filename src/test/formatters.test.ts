import { describe, it, expect } from 'vitest';
import {
  formatTimer,
  formatPeerId,
  sanitizePeerId,
  formatTimestamp
} from '../utils/formatters';

describe('Formatters Utility', () => {
  describe('formatTimer', () => {
    it('formats zero seconds as 00:00', () => {
      expect(formatTimer(0)).toBe('00:00');
    });

    it('formats less than a minute correctly', () => {
      expect(formatTimer(45)).toBe('00:45');
    });

    it('formats minutes and seconds with padding', () => {
      expect(formatTimer(125)).toBe('02:05');
      expect(formatTimer(3600)).toBe('60:00');
    });

    it('handles negative or invalid numbers defensively', () => {
      expect(formatTimer(-10)).toBe('00:00');
      expect(formatTimer(null)).toBe('00:00');
      expect(formatTimer('abc')).toBe('00:00');
    });
  });

  describe('formatPeerId & sanitizePeerId', () => {
    it('formats 6 or 9 character IDs into hyphenated triplets', () => {
      expect(formatPeerId('ABCDEF')).toBe('ABC-DEF');
      expect(formatPeerId('j8hgmjcb7')).toBe('J8H-GMJ-CB7');
    });

    it('strips invalid non-alphanumeric characters', () => {
      expect(sanitizePeerId('ab-cd#ef!')).toBe('ABC-DEF');
    });

    it('handles non-string inputs safely', () => {
      expect(formatPeerId(null)).toBe('');
      expect(formatPeerId(undefined)).toBe('');
    });
  });

  describe('formatTimestamp', () => {
    it('returns a formatted time string for valid timestamp', () => {
      const time = formatTimestamp(Date.now());
      expect(typeof time).toBe('string');
      expect(time.length).toBeGreaterThan(0);
    });

    it('returns empty string for invalid timestamp', () => {
      expect(formatTimestamp('invalid')).toBe('');
    });
  });
});
