export * from './types'
export * from './hicret'
export * from './kardeslik'

import { ThemeConfig } from './types'
import { hicretTheme } from './hicret'
import { kardeslikTheme } from './kardeslik'

export const themes: Record<string, ThemeConfig> = {
  'hicret-dernegi': hicretTheme,
  'kardeslik-payi': kardeslikTheme,
}

export function getTheme(slug: string): ThemeConfig | null {
  return themes[slug] || null
}

export function getCSSVariables(theme: ThemeConfig): Record<string, string> {
  return {
    '--color-primary-50': theme.primaryColor[50],
    '--color-primary-100': theme.primaryColor[100],
    '--color-primary-200': theme.primaryColor[200],
    '--color-primary-300': theme.primaryColor[300],
    '--color-primary-400': theme.primaryColor[400],
    '--color-primary-500': theme.primaryColor[500],
    '--color-primary-600': theme.primaryColor[600],
    '--color-primary-700': theme.primaryColor[700],
    '--color-primary-800': theme.primaryColor[800],
    '--color-primary-900': theme.primaryColor[900],
    '--color-primary-950': theme.primaryColor[950],
    '--color-accent-50': theme.accentColor[50],
    '--color-accent-100': theme.accentColor[100],
    '--color-accent-200': theme.accentColor[200],
    '--color-accent-300': theme.accentColor[300],
    '--color-accent-400': theme.accentColor[400],
    '--color-accent-500': theme.accentColor[500],
    '--color-accent-600': theme.accentColor[600],
    '--color-accent-700': theme.accentColor[700],
    '--color-accent-800': theme.accentColor[800],
    '--color-accent-900': theme.accentColor[900],
    '--color-accent-950': theme.accentColor[950],
    '--font-primary': theme.fonts.primary,
    '--font-heading': theme.fonts.heading,
  }
}
