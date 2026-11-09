import 'server-only'
import type { Campaign } from '@e-infak/api-client'
import type { CategoryDto, HomeData, NewsPostDto } from '../components/sections/HomeSections'
import { currentLocale, currentOrgSlug, getPublic, withLang, type SiteData } from './public-content'
import { tenantHeaders } from './server-api'

const API_URL = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')

async function getCampaigns(orgSlug: string, locale: string): Promise<Campaign[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/${withLang('campaigns?status=active', locale)}`, {
      headers: tenantHeaders(orgSlug),
      next: { revalidate: 10 },
    })
    return res.ok ? (await res.json()).items || [] : []
  } catch {
    return []
  }
}

/** Everything the home sections and dynamic blocks draw from. */
export async function loadHomeData(site: SiteData): Promise<HomeData> {
  const orgSlug = await currentOrgSlug()
  const locale = await currentLocale()
  const [campaigns, news, categories] = await Promise.all([
    getCampaigns(orgSlug, locale),
    getPublic<NewsPostDto[]>('content-posts?limit=12', []),
    getPublic<CategoryDto[]>('donation-categories', []),
  ])
  return { site, locale, campaigns, news, categories }
}
