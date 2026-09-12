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
      className="num h-6 border border-line px-1.5 text-micro text-ink-3 transition-colors hover:border-line-hi hover:text-ink"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? 'DARK' : 'LIGHT'}
    </button>
  );
}
