import { ThemeConfig } from './types'

export const kardeslikTheme: ThemeConfig = {
  slug: 'kardeslik-payi',
  name: 'Kardeşlik Payı',
  primaryColor: {
    // Kalp Kırmızısı / Bordo — 2026 tasarım paketi (Claude Design)
    50: '#FDF6F5',
    100: '#FBEDEB',
    200: '#F5D2CE',
    300: '#EBA9A1',
    400: '#DE7A70',
    500: '#D14840',
    600: '#C2181B', // Main brand color
    700: '#961114', // Hover / koyu ton
    800: '#4A0D0F', // Bordo zemin
    900: '#300809', // En koyu bordo zemin
    950: '#1D0405',
  },
  accentColor: {
    // Açık vurgu kırmızısı
    50: '#FEF1F0',
    100: '#FCD9D6',
    200: '#F7B0AA',
    300: '#F0827A',
    400: '#EE5A52',
    500: '#E2423C', // Main accent color
    600: '#C23129',
    700: '#9C2822',
    800: '#74211D',
    900: '#3F1613',
    950: '#240C0A',
  },
  logo: {
    light: '/images/kardeslik/logo.jpeg',
    icon: '/images/kardeslik/logo.jpeg',
  },
  fonts: {
    primary: 'var(--font-primary)', // Public Sans
    heading: 'var(--font-heading)', // Lora
  },
  meta: {
    title: 'Kardeşlik Payı - Bağış Platformu',
    description: 'Kardeşlik Payı resmi bağış platformu. Yardım kampanyalarımıza katılın.',
    keywords: ['kardeşlik payı', 'vakıf', 'bağış', 'yardım', 'istanbul'],
  },
}
