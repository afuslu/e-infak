import { getTheme, getCSSVariables, type ThemeConfig } from '@e-infak/theme'

export function loadTheme(orgSlug: string): ThemeConfig | null {
  return getTheme(orgSlug)
}

export function applyTheme(theme: ThemeConfig) {
  if (typeof window === 'undefined') return

  const root = document.documentElement
  const cssVars = getCSSVariables(theme)

  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

export function getOrgSlugFromCookie(): string | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  const orgCookie = cookies.find((c) => c.trim().startsWith('org-slug='))

  if (!orgCookie) return null

  return orgCookie.split('=')[1]
}
