'use client'

import { useCampaigns } from '@e-infak/api-client'
import { CampaignCard } from './CampaignCard'

interface CampaignListProps {
  featured?: boolean
  limit?: number
  category?: string
}

export function CampaignList({ featured, limit, category }: CampaignListProps) {
  const { data, isLoading, error } = useCampaigns({
    featured,
    page_size: limit || 25,
    status: 'active',
    category: category || undefined,
  })

  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-96 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-center">
        <p className="text-red-600">Kampanyalar yüklenirken bir hata oluştu.</p>
      </div>
    )
  }

  if (!data?.items?.length) {
    return (
      <div className="rounded-lg bg-gray-50 p-12 text-center">
        <p className="text-gray-600">Henüz aktif kampanya bulunmamaktadır.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {data.items.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  )
}
