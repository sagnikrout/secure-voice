/**
 * Structured Diagnostics Logger
 *
 * Provides structured JSON logging for WebRTC, Audio DSP, ICE negotiation,
 * and call events. Completely client-side and privacy-preserving (zero server transmission).
 * Logs can be exported by the user for local diagnostics.
 */

import { StructuredLogEntry, StructuredLoggerOptions } from '../types';

export class StructuredLogger {
  private entries: StructuredLogEntry[] = [];
  private maxEntries: number;
  private persistKey: string;
  private enableLocalStorage: boolean;
  private sessionId: string;
  private peerId: string;
  private onLog?: (entry: StructuredLogEntry) => void;

  constructor(options: StructuredLoggerOptions = {}) {
    this.maxEntries = options.maxEntries || 500;
    this.persistKey = options.persistKey || 'securevoice_diagnostics_logs';
    this.enableLocalStorage = options.enableLocalStorage ?? false;
    this.sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.peerId = '';
    this.onLog = options.onLog;

    if (this.enableLocalStorage) {
      this.loadFromStorage();
    }
  }

  /**
   * Set active call session and peer identifiers
   */
  setSession(sessionId: string, peerId?: string): void {
    if (sessionId) this.sessionId = sessionId;
    if (peerId !== undefined) this.peerId = peerId;
  }

  /**
   * Primary structured log ingestion
   */
  log(
    level: 'debug' | 'info' | 'warn' | 'error' | 'ok',
    event: string,
    data: Record<string, any> = {},
    msg?: string
  ): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      event,
      sessionId: this.sessionId,
      peerId: this.peerId || undefined,
      data: Object.keys(data).length > 0 ? data : undefined,
      msg: msg || (data.message ? String(data.message) : undefined)
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    if (this.enableLocalStorage) {
      this.saveToStorage();
    }

    if (typeof this.onLog === 'function') {
      try {
        this.onLog(entry);
      } catch (e) {}
    }

    return entry;
  }

  debug(event: string, data?: Record<string, any>, msg?: string): StructuredLogEntry {
    return this.log('debug', event, data, msg);
  }

  info(event: string, data?: Record<string, any>, msg?: string): StructuredLogEntry {
    return this.log('info', event, data, msg);
  }

  warn(event: string, data?: Record<string, any>, msg?: string): StructuredLogEntry {
    return this.log('warn', event, data, msg);
  }

  error(event: string, data?: Record<string, any>, msg?: string): StructuredLogEntry {
    return this.log('error', event, data, msg);
  }

  ok(event: string, data?: Record<string, any>, msg?: string): StructuredLogEntry {
    return this.log('ok', event, data, msg);
  }

  /**
   * Filter and retrieve structured logs
   */
  getLogs(filter?: { level?: string; event?: string; since?: number }): StructuredLogEntry[] {
    return this.entries.filter(entry => {
      if (filter?.level && entry.level !== filter.level) return false;
      if (filter?.event && !entry.event.toLowerCase().includes(filter.event.toLowerCase())) return false;
      if (filter?.since && new Date(entry.timestamp).getTime() < filter.since) return false;
      return true;
    });
  }

  /**
   * Export logs as a sanitized JSON string without sensitive credentials
   */
  exportLogs(pretty: boolean = true): string {
    const sanitized = this.entries.map(entry => {
      const copy = { ...entry };
      if (copy.data) {
        const redactRecursive = (obj: any): any => {
          if (!obj || typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) return obj.map(redactRecursive);
          const sanitized = { ...obj };
          ['credential', 'password', 'authKey', 'privateKey', 'token', 'secret', 'turn', 'username', 'x', 'y', 'd', 'dp', 'dq', 'qi', 'k', 'ephemeralPublicKey'].forEach(key => {
            delete sanitized[key];
          });
          Object.keys(sanitized).forEach(key => {
            if (typeof sanitized[key] === 'object') {
              sanitized[key] = redactRecursive(sanitized[key]);
            }
          });
          return sanitized;
        };
        copy.data = redactRecursive(copy.data);
      }
      return copy;
    });

    return pretty ? JSON.stringify(sanitized, null, 2) : JSON.stringify(sanitized);
  }

  /**
   * Clear all in-memory and local storage logs
   */
  clearLogs(): void {
    this.entries = [];
    if (this.enableLocalStorage && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.persistKey);
      } catch (e) {}
    }
  }

  /**
   * Persist logs to localStorage with 7-day expiration
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentEntries = this.entries.filter(
        e => new Date(e.timestamp).getTime() > sevenDaysAgo
      );
      window.localStorage.setItem(this.persistKey, JSON.stringify(recentEntries));
    } catch (e) {
      // Storage quota exceeded or disabled in private browsing
    }
  }

  /**
   * Hydrate logs from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const stored = window.localStorage.getItem(this.persistKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          this.entries = parsed.filter(
            e => e && e.timestamp && new Date(e.timestamp).getTime() > sevenDaysAgo
          );
        }
      }
    } catch (e) {}
  }
}

export const structuredLogger = new StructuredLogger();
