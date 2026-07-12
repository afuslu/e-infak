import { ThemeConfig } from './types'

export const hicretTheme: ThemeConfig = {
  slug: 'hicret-dernegi',
  name: 'Hicret Derneği',
  primaryColor: {
    // Forest Green / Kubbe Yeşili (#1B5E20)
    50: '#e8f5e9',
    100: '#c8e6c9',
    200: '#a5d6a7',
    300: '#81c784',
    400: '#66bb6a',
    500: '#4caf50',
    600: '#1b5e20', // Main brand color (Logodaki kubbe yeşili)
    700: '#388e3c',
    800: '#2e7d32',
    900: '#1b5e20',
    950: '#0d2c10',
  },
  accentColor: {
    // Antique Gold / Vurgu Altın Rengi (#D4AF37)
    50: '#fdfbf2',
    100: '#faf6db',
    200: '#f3e9b1',
    300: '#ebd87e',
    400: '#e3c552',
    500: '#d4af37', // Main accent color (Geleneksel altın yaldız)
    600: '#b5902b',
    700: '#917120',
    800: '#6e5218',
    900: '#4b360f',
    950: '#312207',
  },
  logo: {
    light: '/images/hicret/logo.png',
    icon: '/images/hicret/logooo.png', // cropped transparent logo
  },
  fonts: {
    primary: 'Inter',
    heading: 'var(--font-playfair)', // custom font setup
  },
  meta: {
    title: 'Hicret Derneği - Bağış Platformu',
    description: 'Hicret Derneği resmi bağış platformu. Kampanyalarımıza destek olun.',
    keywords: ['hicret', 'dernek', 'bağış', 'yardım', 'eskişehir'],
  },
}
