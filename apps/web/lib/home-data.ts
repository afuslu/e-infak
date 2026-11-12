import 'server-only'
import { cache } from 'react'
import type { Campaign } from '@e-infak/api-client'
import type { CategoryDto, HomeData, NewsPostDto } from '../components/sections/HomeSections'
import { currentLocale, currentOrgSlug, getPublic, withLang, type PublicGalleryItem, type SiteData } from './public-content'
import { tenantHeaders } from './server-api'

const API_URL = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')

async function getCampaigns(orgSlug: string, locale: string): Promise<Campaign[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/${withLang('campaigns?status=active&page_size=100', locale)}`, {
      headers: tenantHeaders(orgSlug),
      next: { revalidate: 10 },
    })
    return res.ok ? (await res.json()).items || [] : []
  } catch {
    return []
  }
}

/** One campaign by slug (any status the public API shows), or null. */
export async function getCampaign(slug: string): Promise<Campaign | null> {
  const orgSlug = await currentOrgSlug()
  if (!orgSlug) return null
  try {
    const res = await fetch(`${API_URL}/api/v1/campaigns/${encodeURIComponent(slug)}`, { headers: tenantHeaders(orgSlug), next: { revalidate: 30 } })
    return res.ok ? ((await res.json()) as Campaign) : null
  } catch {
    return null
  }
}

/** Everything the home sections and dynamic blocks draw from. Cached per request. */
export const loadHomeData = cache(async (site: SiteData): Promise<HomeData> => {
  const orgSlug = await currentOrgSlug()
  const locale = await currentLocale()
  const [campaigns, news, categories, gallery] = await Promise.all([
    getCampaigns(orgSlug, locale),
    getPublic<NewsPostDto[]>('content-posts?limit=12', []),
    getPublic<CategoryDto[]>('donation-categories', []),
    getPublic<PublicGalleryItem[]>('gallery?kind=photo', [], 60),
  ])
  return { site, locale, campaigns, news, categories, gallery: gallery.slice(0, 24) }
})
