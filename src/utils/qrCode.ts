import QRCode from 'qrcode';

export interface QrCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

/**
 * Generate a high-contrast QR Code Data URL.
 */
export async function generateQrCodeDataUrl(
  text: string,
  options: QrCodeOptions = {}
): Promise<string> {
  if (!text || typeof text !== 'string') {
    throw new Error('Valid string required for QR generation');
  }

  const {
    width = 280,
    margin = 2,
    color = { dark: '#0a0f1d', light: '#ffffff' }
  } = options;

  return QRCode.toDataURL(text, {
    width,
    margin,
    color,
    errorCorrectionLevel: 'M'
  });
}

/**
 * Format a shareable deep-link URL for peer calling.
 */
export function buildCallInviteUrl(peerId: string): string {
  if (typeof window === 'undefined') {
    return `https://securevoice.local/#call=${peerId}`;
  }
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base.replace(/\/+$/, '')}/#call=${peerId}`;
}

/**
 * Extract peer ID from URL hash or deep-link parameter.
 */
export function parseCallTargetFromUrl(urlOrHash: string): string | null {
  if (!urlOrHash) return null;
  const match = urlOrHash.match(/#call=([A-Za-z0-9\-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}
