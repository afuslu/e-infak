import { ThemeConfig } from './types'

export const hicretTheme: ThemeConfig = {
  slug: 'hicret-dernegi',
  name: 'Hicret Derneği',
  primaryColor: {
    // Kubbe Yeşili — 2026 tasarım paketi (Claude Design)
    50: '#EDF6EE',
    100: '#D6EBD9',
    200: '#B0D8B7',
    300: '#83C08F',
    400: '#4FA25F',
    500: '#2F8B44',
    600: '#1E7A34', // Main brand color
    700: '#166028', // Hover / koyu ton
    800: '#123D1D', // Koyu zemin
    900: '#0E2A14', // En koyu zemin (hero arka planı)
    950: '#081A0C',
  },
  accentColor: {
    // Açık vurgu yeşili
    50: '#F5FAEE',
    100: '#E7F3D6',
    200: '#CBE5AC',
    300: '#A8D48A',
    400: '#8BC763',
    500: '#6CB33F', // Main accent color
    600: '#57922F',
    700: '#437023',
    800: '#2F4F18',
    900: '#1E330F',
    950: '#101C08',
  },
  logo: {
    light: '/images/hicret/logo.jpeg',
    icon: '/images/hicret/logo.jpeg',
  },
  fonts: {
    primary: 'var(--font-primary)', // Public Sans
    heading: 'var(--font-heading)', // Lora
  },
  meta: {
    title: 'Hicret Derneği - Bağış Platformu',
    description: 'Hicret Derneği resmi bağış platformu. Kampanyalarımıza destek olun.',
    keywords: ['hicret', 'dernek', 'bağış', 'yardım', 'eskişehir'],
  },
}
