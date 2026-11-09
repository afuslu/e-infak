export * from './types'

import type { ColorPalette } from './types'

/** Shades of a palette, from lightest to darkest. 600 is the brand colour itself. */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

// How much white (positive) or black (negative) is mixed into the brand colour per shade.
const MIX: Record<(typeof SHADES)[number], number> = {
  50: 0.94, 100: 0.86, 200: 0.72, 300: 0.55, 400: 0.33, 500: 0.14,
  600: 0, 700: -0.18, 800: -0.35, 900: -0.5, 950: -0.66,
}

// Platform default: E-Medrese's emerald (Tailwind emerald-600) with a teal accent
export const DEFAULT_PRIMARY = '#059669'
export const DEFAULT_ACCENT = '#0D9488'

export function normalizeHex(value: string | null | undefined, fallback: string): string {
  const text = (value || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(text)) return `#${text.slice(1).split('').map((c) => c + c).join('')}`.toUpperCase()
  return fallback
}

function mix(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const target = amount >= 0 ? 255 : 0
  const weight = Math.abs(amount)
  return `#${channels
    .map((c) => Math.round(c + (target - c) * weight).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}

/** A full 50-950 palette derived from one brand colour. */
export function buildPalette(hex: string): ColorPalette {
  const base = normalizeHex(hex, DEFAULT_PRIMARY)
  return Object.fromEntries(SHADES.map((shade) => [shade, mix(base, MIX[shade])])) as unknown as ColorPalette
}

/**
 * CSS custom properties consumed by the Tailwind theme in apps/web/app/globals.css
 * (`primary-*` and `accent-*` utilities read `--brand-primary-*` / `--brand-accent-*`).
 */
export function brandCssVariables(primary?: string | null, accent?: string | null): Record<string, string> {
  const vars: Record<string, string> = {}
  const primaryPalette = buildPalette(normalizeHex(primary, DEFAULT_PRIMARY))
  const accentPalette = buildPalette(normalizeHex(accent, DEFAULT_ACCENT))
  for (const shade of SHADES) {
    vars[`--brand-primary-${shade}`] = primaryPalette[shade]
    vars[`--brand-accent-${shade}`] = accentPalette[shade]
  }
  return vars
}
