'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
  }, []);

  const apply = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('rfq.theme', next);
    } catch {
      /* private browsing */
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={() => apply(theme === 'dark' ? 'light' : 'dark')}
      className="min-h-9 rounded-xs border border-line px-3 text-mini text-ink-2 transition-colors hover:bg-raised hover:text-ink"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
