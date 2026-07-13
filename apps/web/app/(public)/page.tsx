import { headers } from 'next/headers'
import { HicretHome } from '../../components/HicretHome'
import { KardeslikHome } from '../../components/KardeslikHome'
import { EInfakPortal } from '../../components/EInfakPortal'
import type { Campaign } from '@e-infak/api-client'

export const dynamic = 'force-dynamic'

const API_URL = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'

async function getCampaigns(orgSlug: string): Promise<Campaign[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/campaigns?status=active`, {
      headers: {
        'x-organization-slug': orgSlug,
      },
      next: { revalidate: 10 }, // 10 seconds cache revalidation
    })

    if (!res.ok) {
      console.error(`Failed to fetch campaigns: ${res.statusText}`)
      return []
    }

    const data = await res.json()
    return data.items || []
  } catch (e) {
    console.error('Error fetching campaigns from backend API:', e)
    return []
  }
}

async function getPublic<T>(path: string, orgSlug: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/${path}`, {
      headers: { 'x-organization-slug': orgSlug },
      next: { revalidate: 30 },
    })
    if (!res.ok) return fallback
    return await res.json()
  } catch (e) {
    console.error(`Error fetching public/${path} from backend API:`, e)
    return fallback
  }
}

export default async function HomePage() {
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || ''

  if (!orgSlug) {
    return <EInfakPortal />
  }

  const [campaigns, newsPosts, categories] = await Promise.all([
    getCampaigns(orgSlug),
    getPublic('content-posts', orgSlug, [] as any[]),
    getPublic('donation-categories', orgSlug, [] as any[]),
  ])

  if (orgSlug === 'kardeslik-payi') {
    return <KardeslikHome campaigns={campaigns} newsPosts={newsPosts} categories={categories} />
  }

  // Default to Hicret Derneği layout
  return <HicretHome campaigns={campaigns} newsPosts={newsPosts} />
}
