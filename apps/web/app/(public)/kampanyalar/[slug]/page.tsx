'use client'

import { use } from 'react'
import { useCampaign } from '@e-infak/api-client'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@e-infak/ui'

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const { data: campaign, isLoading, error } = useCampaign(slug)

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="animate-pulse">
          <div className="mb-8 h-96 rounded-xl bg-gray-200" />
          <div className="mb-4 h-12 w-3/4 rounded bg-gray-200" />
          <div className="h-6 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="rounded-lg bg-red-50 p-8 text-center">
          <p className="text-lg text-red-600">Kampanya bulunamadı.</p>
          <Link href="/kampanyalar" className="mt-4 inline-block">
            <Button variant="outline">Kampanyalara Dön</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Image */}
      <div className="relative h-96 w-full overflow-hidden bg-gray-200">
        {campaign.cover_image_url ? (
          <Image
            src={campaign.cover_image_url}
            alt={campaign.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-primary-100">
            <span className="text-2xl text-primary-300">Görsel Yok</span>
          </div>
        )}
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="mb-4 inline-block rounded-full bg-primary-100 px-4 py-1 text-sm font-medium text-primary-700">
              {campaign.category}
            </div>
            
            <h1 className="mb-4 text-4xl font-bold text-gray-900">{campaign.title}</h1>
            
            <p className="mb-8 text-xl text-gray-600">{campaign.summary}</p>

            <div className="prose prose-lg max-w-none">
              <div
                className="text-gray-700"
                dangerouslySetInnerHTML={{ __html: campaign.story || '' }}
              />
            </div>
          </div>

          {/* Sidebar - Donation Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-xl bg-white p-6 shadow-lg">
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-3xl font-bold text-primary-600">
                    {campaign.collected_lira.toLocaleString('tr-TR')} ₺
                  </span>
                  <span className="text-sm text-gray-500">
                    {campaign.progress_percentage.toFixed(0)}%
                  </span>
                </div>
                
                <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-primary-500 transition-all duration-500"
                    style={{ width: `${Math.min(campaign.progress_percentage, 100)}%` }}
                  />
                </div>
                
                <p className="text-sm text-gray-600">
                  Hedef: {campaign.target_lira.toLocaleString('tr-TR')} ₺
                </p>
              </div>

              {/* Suggested Amounts */}
              {campaign.suggested_amounts_cents.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">Hızlı Bağış</p>
                  <div className="grid grid-cols-2 gap-2">
                    {campaign.suggested_amounts_cents.map((amount) => (
                      <button
                        key={amount}
                        className="rounded-lg border-2 border-gray-200 py-2 text-center font-semibold text-gray-700 transition-colors hover:border-primary-500 hover:bg-primary-50 hover:text-primary-700"
                      >
                        {(amount / 100).toLocaleString('tr-TR')} ₺
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Link href={`/bagis/${campaign.slug}`}>
                <Button size="lg" className="w-full">
                  Bağış Yap
                </Button>
              </Link>

              <div className="mt-4 rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-600">
                  Bağışlarınız vergi indirimi kapsamındadır. 
                  Bağış makbuzunuz e-posta adresinize gönderilecektir.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
