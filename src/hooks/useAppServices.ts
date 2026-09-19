import { useState, useEffect, useCallback } from 'react';
import { structuredLogger } from '../utils/structuredLogger';

/**
 * Automatically applies dark or light theme based on device settings.
 */
export function useTheme() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return { darkMode };
}

/**
 * Diagnostic logging hook integrating with structured logger.
 */
export function useLogs() {
  const addLog = useCallback((msg: string, level = 'info') => {
    structuredLogger.log(level as any, 'system-log', { message: msg }, msg);
  }, []);

  return {
    addLog,
    clearLogs: () => structuredLogger.clearLogs(),
    exportLogs: () => structuredLogger.exportLogs(true)
  };
}
