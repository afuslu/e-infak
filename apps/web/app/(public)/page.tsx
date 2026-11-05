import type { Campaign } from '@e-infak/api-client'
import { EInfakPortal } from '../../components/EInfakPortal'
import { HomeTemplate } from '../../components/templates/HomeTemplate'
import type { CategoryDto, NewsPostDto } from '../../components/sections/HomeSections'
import { currentLocale, currentOrgSlug, getPublic, getSite, withLang } from '../../lib/public-content'
import { tenantHeaders } from '../../lib/server-api'

export const dynamic = 'force-dynamic'

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

export default async function HomePage() {
  const site = await getSite()
  if (!site) return <EInfakPortal />

  const orgSlug = await currentOrgSlug()
  const locale = await currentLocale()
  const [campaigns, news, categories] = await Promise.all([
    getCampaigns(orgSlug, locale),
    getPublic<NewsPostDto[]>('content-posts?limit=6', []),
    getPublic<CategoryDto[]>('donation-categories', []),
  ])

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: site.name,
    url: site.url,
    logo: site.logo_url ? new URL(site.logo_url, site.url).toString() : undefined,
    potentialAction: { '@type': 'DonateAction', target: `${site.url}/kampanyalar` },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <HomeTemplate data={{ site, locale, campaigns, news, categories }} />
    </>
  )
}
