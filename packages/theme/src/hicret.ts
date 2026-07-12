import { ThemeConfig } from './types'

export const hicretTheme: ThemeConfig = {
  slug: 'hicret-dernegi',
  name: 'Hicret Derneği',
  primaryColor: {
    // Emerald/Green - #065f46 base
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#065f46', // Main brand color
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  accentColor: {
    // Sky Blue - #0284c7 base
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7', // Main accent color
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
  logo: {
    light: '/images/hicret/logo.png',
    icon: '/images/hicret/indir.png',
  },
  fonts: {
    primary: 'Inter',
    heading: 'Outfit',
  },
  meta: {
    title: 'Hicret Derneği - Bağış Platformu',
    description: 'Hicret Derneği resmi bağış platformu. Kampanyalarımıza destek olun.',
    keywords: ['hicret', 'dernek', 'bağış', 'yardım', 'eskişehir'],
  },
}
