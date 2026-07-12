import { ThemeConfig } from './types'

export const kardeslikTheme: ThemeConfig = {
  slug: 'kardeslik-payi',
  name: 'Kardeşlik Payı',
  primaryColor: {
    // Crimson Red / Kalp Kırmızısı (#E10606)
    50: '#fff5f5',
    100: '#ffe3e3',
    200: '#ffc9c9',
    300: '#ffa3a3',
    400: '#ff7373',
    500: '#ff4444',
    600: '#e10606', // Main brand color (Logodaki ana kırmızı)
    700: '#c00404',
    800: '#9f0202',
    900: '#7e0101',
    950: '#4f0000',
  },
  accentColor: {
    // Slate Anthracite / Koyu Gri (#1E293B)
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b', // Main accent color
    900: '#0f172a',
    950: '#020617',
  },
  logo: {
    light: '/images/kardeslik/logo.png', // The main logo provided by user
    icon: '/images/kardeslik/vakiflogo.png',
  },
  fonts: {
    primary: 'Inter',
    heading: 'var(--font-outfit)', // custom font setup
  },
  meta: {
    title: 'Kardeşlik Payı - Bağış Platformu',
    description: 'Kardeşlik Payı resmi bağış platformu. Yardım kampanyalarımıza katılın.',
    keywords: ['kardeşlik payı', 'vakıf', 'bağış', 'yardım', 'istanbul'],
  },
}
