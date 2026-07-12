import { headers } from 'next/headers'
import { HicretHome } from '../../components/HicretHome'
import { KardeslikHome } from '../../components/KardeslikHome'
import type { Campaign } from '@e-infak/api-client'

export const dynamic = 'force-dynamic'

async function getCampaigns(orgSlug: string): Promise<Campaign[]> {
  const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'
  try {
    const res = await fetch(`${apiUrl}/api/v1/campaigns?status=active`, {
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

export default async function HomePage() {
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || 'hicret-dernegi'

  // Fetch campaigns filtered by the current organization slug
  const campaigns = await getCampaigns(orgSlug)

  if (orgSlug === 'kardeslik-payi') {
    return <KardeslikHome campaigns={campaigns} />
  }

  // Default to Hicret Derneği layout
  return <HicretHome campaigns={campaigns} />
}
