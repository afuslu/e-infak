import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { tenantHeaders } from './server-api'
import type { MessageKey } from './i18n'

const API_URL = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')

export async function currentOrgSlug() {
  return (await headers()).get('x-organization-slug') || ''
}

/** Website language chosen by the visitor (middleware: ?lang= or the `lang` cookie). */
export async function currentLocale() {
  const locale = (await headers()).get('x-locale') || 'tr'
  return /^[a-z]{2}$/.test(locale) ? locale : 'tr'
}

/** Appends ?lang= for non-default languages, so cached responses are kept per language. */
export function withLang(path: string, locale: string) {
  if (!locale || locale === 'tr') return path
  return `${path}${path.includes('?') ? '&' : '?'}lang=${locale}`
}

/** GET /api/v1/public/{path} for the current tenant; returns `fallback` on any failure. */
export async function getPublic<T>(path: string, fallback: T, revalidate = 30): Promise<T> {
  const orgSlug = await currentOrgSlug()
  if (!orgSlug) return fallback
  try {
    const res = await fetch(`${API_URL}/api/v1/public/${withLang(path, await currentLocale())}`, {
      headers: tenantHeaders(orgSlug),
      next: { revalidate },
    })
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export interface MenuLink { label: string; url: string; open_in_new_tab: boolean }
export interface PublicMenu { header: MenuLink[]; footer: MenuLink[] }

export interface PublicPost {
  id: string
  kind: 'haber' | 'blog' | 'faaliyet'
  slug: string | null
  title: string
  summary: string | null
  body?: string | null
  image_url: string | null
  gallery_urls: string[]
  video_embed_url: string | null
  published_at: string | null
  seo_title: string | null
  seo_description: string | null
}

export interface PublicPage {
  slug: string
  title: string
  body: string
  blocks?: import('./blocks').Block[] | null
  preview?: boolean
  cover_image_url: string | null
  seo_title: string | null
  seo_description: string | null
  updated_at: string
}

export interface PublicGalleryItem {
  id: string
  kind: 'photo' | 'video'
  title: string
  album: string | null
  image_url: string | null
  thumbnail_url: string | null
  video_embed_url: string | null
}

export interface SiteData {
  slug: string
  name: string
  lang: string
  url: string
  template: 'klasik' | 'kategori' | 'sade'
  tagline: string | null
  primary_color: string
  accent_color: string
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  hero: { badge: string | null; title: string | null; subtitle: string | null; image_url: string | null; cta_label: string | null; cta_url: string | null }
  sections: string[]
  cta_band: { title: string | null; text: string | null; button_label: string | null; button_url: string | null }
  footer_text: string | null
  social_links: Record<string, string>
  languages: string[]
  seo: { title: string | null; description: string | null; keywords: string | null }
  contact: { phone: string | null; email: string | null; address: string | null }
  features: string[]
}

/** The current organisation's website data; null on the platform domain. Cached per request. */
export const getSite = cache(async (): Promise<SiteData | null> => {
  if (!(await currentOrgSlug())) return null
  return getPublic<SiteData | null>('site', null, 60)
})

export function defaultHeaderLinks(t: (key: MessageKey) => string): MenuLink[] {
  return ([
    ['nav.home', '/'], ['nav.projects', '/kampanyalar'], ['nav.news', '/haberler'],
    ['nav.gallery', '/galeri'], ['nav.about', '/hakkimizda'], ['nav.contact', '/iletisim'],
  ] as [MessageKey, string][]).map(([key, url]) => ({ label: t(key), url, open_in_new_tab: false }))
}

export function defaultFooterLinks(t: (key: MessageKey) => string): MenuLink[] {
  return ([
    ['nav.volunteer', '/gonullu'], ['nav.zakat', '/zekat-hesapla'], ['nav.kvkk', '/kvkk'],
    ['nav.privacy', '/gizlilik'], ['nav.terms', '/bagis-kosullari'],
  ] as [MessageKey, string][]).map(([key, url]) => ({ label: t(key), url, open_in_new_tab: false }))
}

