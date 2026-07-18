'use client'

import { use } from 'react'
import { useCampaign } from '@e-infak/api-client'
import { QuickDonationForm } from '../../../../components/QuickDonationForm'

export default function DonationPage({ params }: { params: Promise<{ campaign: string }> }) {
  const { campaign: slug } = use(params)
  const { data: campaign, isLoading, error } = useCampaign(slug)

  if (isLoading) return <div className="mx-auto my-20 h-96 max-w-lg animate-pulse rounded-3xl bg-slate-100" />
  if (error || !campaign) return <div className="mx-auto my-20 max-w-lg rounded-2xl bg-red-50 p-8 text-center text-red-700">Kampanya bulunamadı.</div>

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-14">
      <QuickDonationForm
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        suggestedAmounts={campaign.suggested_amounts_cents.map((value) => value / 100)}
        checkoutFieldsSchema={campaign.checkout_fields_schema}
      />
    </main>
  )
}
