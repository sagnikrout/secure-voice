import { useCallback } from 'react';
import { structuredLogger } from '../utils/structuredLogger';

export function useLogs() {
  const addLog = useCallback((msg: string, level = 'info') => {
    structuredLogger.log(level as any, 'system-log', { message: msg }, msg);
  }, []);

  return {
    addLog,
    logs: [],
    showLogs: false,
    clearLogs: () => structuredLogger.clearLogs(),
    toggleLogs: () => {},
    exportLogs: () => structuredLogger.exportLogs(true)
  };
}
