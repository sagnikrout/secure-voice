import { useState, useCallback } from 'react';
import { TIMINGS } from '../constants/config';

export function useLogs() {
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);

  const addLog = useCallback((msg, level = 'info') => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setLogs(prev => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time, msg, level },
      ...prev.slice(0, TIMINGS.MAX_LOG_ENTRIES - 1)
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const toggleLogs = useCallback(() => {
    setShowLogs(prev => !prev);
  }, []);

  return { logs, showLogs, addLog, clearLogs, toggleLogs };
}
