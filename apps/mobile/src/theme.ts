import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getItem, setItem } from '@/lib/storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export const KEY_THEME_MODE = 'einfak_theme_mode';

// Web admin panelinin sabit zümrüt paleti (apps/web/app/(dashboard)/layout.tsx).
export const lightColors = {
  primary: '#059669',
  primaryDark: '#047857',
  primaryDeep: '#065F46',
  primarySoft: '#ECFDF5',
  primaryLine: '#A7F3D0',
  accent: '#0D9488',
  bg: '#F6F8F7',
  card: '#FFFFFF',
  text: '#0E1B17',
  muted: '#5B6B66',
  faint: '#8A9792',
  line: '#E3E8E6',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warn: '#B45309',
  warnSoft: '#FFFBEB',
  info: '#1D4ED8',
  infoSoft: '#EFF6FF',
  white: '#FFFFFF',
};

// Web .admin-dark (globals.css) ile aynı slate + zümrüt koyu tema paleti.
export const darkColors: typeof lightColors = {
  primary: '#10B981',
  primaryDark: '#34D399',
  primaryDeep: '#6EE7B7',
  primarySoft: 'rgba(16, 185, 129, 0.16)',
  primaryLine: 'rgba(52, 211, 153, 0.35)',
  accent: '#2DD4BF',
  bg: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  faint: '#64748B',
  line: '#334155',
  danger: '#F87171',
  dangerSoft: 'rgba(239, 68, 68, 0.16)',
  warn: '#FCD34D',
  warnSoft: 'rgba(245, 158, 11, 0.16)',
  info: '#93C5FD',
  infoSoft: 'rgba(59, 130, 246, 0.16)',
  white: '#FFFFFF',
};

export type ThemeColors = typeof lightColors;

// Geriye dönük uyumluluk için varsayılan export (yeni/güncel bileşenler useTheme() kullanır).
export const colors = lightColors;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 };

type ThemeContextValue = {
  mode: ThemeMode;
  dark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  dark: false,
  colors: lightColors,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    getItem(KEY_THEME_MODE).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void setItem(KEY_THEME_MODE, next);
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const value = useMemo<ThemeContextValue>(
    () => ({ mode, dark, colors: dark ? darkColors : lightColors, setMode }),
    [mode, dark, setMode]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
