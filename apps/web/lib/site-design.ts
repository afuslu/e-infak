import type { CSSProperties } from 'react'

/** Site-wide design tokens from Görünüm & Tema (see `Design` in services/backend/app/services/site.py). */
export interface SiteDesign {
  body_font: string
  heading_font: string
  radius: 'none' | 'small' | 'medium' | 'large' | 'pill'
  container: 'narrow' | 'normal' | 'wide' | 'full'
  page_color: string
  text_color: string
  heading_weight: string
  heading_case: 'normal' | 'uppercase'
}

export const DEFAULT_DESIGN: SiteDesign = {
  body_font: 'public-sans', heading_font: 'lora', radius: 'medium', container: 'normal',
  page_color: '#FAFAF9', text_color: '#111827', heading_weight: '700', heading_case: 'normal',
}

const CONTAINERS = { narrow: 1080, normal: 1200, wide: 1320, full: 1440 }
// Tailwind's default radius scale (rem) multiplied per choice.
const RADIUS_BASE = { sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1, '3xl': 1.5 }
const RADIUS_FACTOR = { none: 0, small: 0.5, medium: 1, large: 1.5, pill: 2.25 }
const FONT_KEY = /^[a-z-]{2,20}$/
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * CSS variables for an element wrapping the public site. Fonts, radius and container
 * width are read by Tailwind utilities (`font-sans`, `font-heading`, `rounded-*`,
 * `max-w-[var(--site-container)]`); headings pick up weight and case in globals.css.
 */
export function siteDesignStyle(design?: Partial<SiteDesign> | null): CSSProperties {
  const d = { ...DEFAULT_DESIGN, ...(design || {}) }
  const vars: Record<string, string> = {}
  if (FONT_KEY.test(d.body_font)) vars['--font-primary-family'] = `var(--ff-${d.body_font})`
  if (FONT_KEY.test(d.heading_font)) vars['--font-heading-family'] = `var(--ff-${d.heading_font})`
  const factor = RADIUS_FACTOR[d.radius] ?? 1
  for (const [name, rem] of Object.entries(RADIUS_BASE)) vars[`--radius-${name}`] = `${+(rem * factor).toFixed(3)}rem`
  vars['--site-container'] = `${CONTAINERS[d.container] ?? 1200}px`
  vars['--site-heading-weight'] = /^[5-9]00$/.test(d.heading_weight) ? d.heading_weight : '700'
  vars['--site-heading-case'] = d.heading_case === 'uppercase' ? 'uppercase' : 'none'
  vars['--site-page'] = HEX.test(d.page_color) ? d.page_color : DEFAULT_DESIGN.page_color
  vars['--site-text'] = HEX.test(d.text_color) ? d.text_color : DEFAULT_DESIGN.text_color
  return vars as CSSProperties
}
