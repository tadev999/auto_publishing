import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'studio-theme';
const listeners = new Set<() => void>();

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

const systemQuery = () => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined);

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme) {
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  listeners.forEach((listener) => listener());
}

export function initTheme() {
  const query = systemQuery();
  apply(savedTheme() ?? (query?.matches ? 'dark' : 'light'));
  query?.addEventListener('change', (event) => {
    if (!savedTheme()) apply(event.matches ? 'dark' : 'light');
  });
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies for this session.
  }
  apply(theme);
}

export function useTheme(): Theme {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, currentTheme, () => 'light');
}
