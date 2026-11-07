import { describe, it, expect } from 'vitest';
import { generateQrCodeDataUrl, buildCallInviteUrl, parseCallTargetFromUrl } from '../utils/qrCode';

describe('QR Code & Deep Link Utilities', () => {
  it('generates a valid data URL for a peer ID', async () => {
    const dataUrl = await generateQrCodeDataUrl('ABC-DEF-GHI');
    expect(dataUrl).toBeTypeOf('string');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('generates a valid data URL with custom options', async () => {
    const dataUrl = await generateQrCodeDataUrl('https://example.com/#call=XYZ-123-456', {
      width: 320,
      margin: 1,
      color: { dark: '#003366', light: '#ffffff' }
    });
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('rejects invalid or empty string inputs', async () => {
    await expect(generateQrCodeDataUrl('')).rejects.toThrow('Valid string required');
    await expect(generateQrCodeDataUrl(null as any)).rejects.toThrow('Valid string required');
  });

  it('formats call invite URLs correctly', () => {
    const url = buildCallInviteUrl('ABC-DEF-GHI');
    expect(url).toContain('#call=ABC-DEF-GHI');
  });

  it('parses call target from valid URLs and hashes', () => {
    expect(parseCallTargetFromUrl('#call=ABC-DEF-GHI')).toBe('ABC-DEF-GHI');
    expect(parseCallTargetFromUrl('https://app.securevoice.io/#call=XYZ-456-789')).toBe('XYZ-456-789');
    expect(parseCallTargetFromUrl('https://app.securevoice.io/path#call=123-456-789')).toBe('123-456-789');
  });

  it('returns null when URL does not contain a call target', () => {
    expect(parseCallTargetFromUrl('')).toBeNull();
    expect(parseCallTargetFromUrl('https://example.com/')).toBeNull();
    expect(parseCallTargetFromUrl('#settings')).toBeNull();
  });
});
