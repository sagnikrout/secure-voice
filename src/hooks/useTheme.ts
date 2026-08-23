import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/config';

export function useTheme() {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      if (saved !== null) return saved === 'dark';
    } catch (e) {}
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, darkMode ? 'dark' : 'light');
    } catch (e) {}
  }, [darkMode]);

  const toggleTheme = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  return { darkMode, toggleTheme };
}
