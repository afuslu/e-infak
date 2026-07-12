import { ThemeConfig } from './types'

export const kardeslikTheme: ThemeConfig = {
  slug: 'kardeslik-payi',
  name: 'Kardeşlik Payı',
  primaryColor: {
    // Red - #DC2626 base
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626', // Main brand color
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },
  accentColor: {
    // Orange - #F59E0B base
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b', // Main accent color
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },
  logo: {
    light: '/images/kardeslik/logo-new.png',
    icon: '/images/kardeslik/vakiflogo.png',
  },
  fonts: {
    primary: 'Inter',
    heading: 'Outfit',
  },
  meta: {
    title: 'Kardeşlik Payı - Bağış Platformu',
    description: 'Kardeşlik Payı resmi bağış platformu. Yardım kampanyalarımıza katılın.',
    keywords: ['kardeşlik payı', 'vakıf', 'bağış', 'yardım', 'istanbul'],
  },
}
