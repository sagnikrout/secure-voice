import { useState, useCallback } from 'react';
import { TIMINGS } from '../constants/config';
import { structuredLogger } from '../utils/structuredLogger';

export function useLogs() {
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);

  const addLog = useCallback((msg, level = 'info') => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Mirror to structured client diagnostics
    structuredLogger.log(level as any, 'system-log', { message: msg }, msg);

    setLogs(prev => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time, msg, level },
      ...prev.slice(0, TIMINGS.MAX_LOG_ENTRIES - 1)
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    structuredLogger.clearLogs();
  }, []);

  const toggleLogs = useCallback(() => {
    setShowLogs(prev => !prev);
  }, []);

  const exportLogs = useCallback(() => {
    return structuredLogger.exportLogs(true);
  }, []);

  return { logs, showLogs, addLog, clearLogs, toggleLogs, exportLogs };
}
