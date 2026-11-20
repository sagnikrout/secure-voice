import QRCode from 'qrcode';

export const CANONICAL_WEB_URL = 'https://sagnikrout.github.io/secure-voice';

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
 * Check if the runtime environment is running locally or inside a native mobile webview container.
 */
export function isLocalOrNativeEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location) return true;
  const { hostname, protocol } = window.location;
  return (
    !hostname ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    protocol === 'capacitor:' ||
    protocol === 'file:'
  );
}

/**
 * Format a shareable deep-link URL for peer calling.
 * Always resolves to a universally reachable public web address (or active production domain).
 * Prevents scanning on smartphones from resolving to unroutable localhost addresses
 * (which previously caused LocalSend or connection errors).
 */
export function buildCallInviteUrl(peerId: string): string {
  if (!peerId || typeof peerId !== 'string') {
    return CANONICAL_WEB_URL;
  }

  let base = CANONICAL_WEB_URL;
  if (!isLocalOrNativeEnvironment()) {
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/+$/, '');
    base = `${origin}${pathname}`;
  }

  return `${base}/#call=${encodeURIComponent(peerId.trim())}`;
}

/**
 * Extract peer ID from URL hash, query parameter, path, or deep-link URI scheme.
 * Handles:
 * - #call=PEER-ID
 * - ?call=PEER-ID
 * - /call/PEER-ID
 * - securevoice://call/PEER-ID
 * - securevoice://#call=PEER-ID
 */
export function parseCallTargetFromUrl(urlOrHash: string): string | null {
  if (!urlOrHash || typeof urlOrHash !== 'string') return null;
  const match = urlOrHash.match(/(?:[#?&]call=|\/call\/)([A-Za-z0-9\-]+)/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}
