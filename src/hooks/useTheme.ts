import { useState, useEffect, useCallback } from 'react';

export function useTheme() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('securevoice_theme');
    return saved ? saved === 'dark' : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('securevoice_theme')) setDarkMode(e.matches);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('securevoice_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  return { darkMode, toggleTheme };
}
