/**
 * String, Time, and Identifier Formatting Utilities
 */
import { PEER_ID_ALPHABET } from '../constants/config';

/**
 * Format active call seconds into a readable MM:SS string
 * @param {number} seconds
 * @returns {string} e.g. "03:45"
 */
export function formatTimer(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a raw string into hyphenated chunks of 3 uppercase characters (e.g., J8H-GMJ-CB7)
 * @param {string} id
 * @returns {string}
 */
export function formatPeerId(id) {
  if (typeof id !== 'string') return '';
  const sanitized = id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const chunks = sanitized.match(/.{1,3}/g);
  return chunks ? chunks.join('-') : sanitized;
}

/**
 * Sanitize and format peer ID input from user
 * @param {string} input
 * @returns {string}
 */
export function sanitizePeerId(input) {
  return formatPeerId(input);
}

/**
 * Format a verbal 5-digit MITM Safety Code (e.g. 12345 -> 12-345)
 * @param {string|number} code
 * @returns {string}
 */
export function formatSafetyCode(code) {
  if (!code) return '';
  const str = String(code);
  return str.length >= 5 ? `${str.substring(0, 2)}-${str.substring(2)}` : str;
}

/**
 * Format timestamp into localized HH:MM time string
 * @param {number|string|Date} timestamp
 * @returns {string}
 */
export function formatTimestamp(timestamp) {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}
