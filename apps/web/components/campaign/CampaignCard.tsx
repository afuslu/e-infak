'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@e-infak/ui'
import type { Campaign } from '@e-infak/api-client'
import { SYMBOL, type CurrencyCode, useSiteCurrency } from '../blocks/DonationBlocks'

interface CampaignCardProps {
  campaign: Campaign
}

const CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }

export function CampaignCard({ campaign }: CampaignCardProps) {
  const { currency: siteCurrency, convert } = useSiteCurrency()
  const baseCurrency = ((campaign.currency || 'TRY').toUpperCase()) as CurrencyCode
  const canConvert = baseCurrency === 'TRY' || baseCurrency === 'USD' || baseCurrency === 'EUR'
  const convertedCollected = canConvert ? convert(campaign.collected_lira, baseCurrency) : null
  const convertedTarget = canConvert ? convert(campaign.target_lira, baseCurrency) : null
  const displayCollected = convertedCollected ?? campaign.collected_lira
  const displayTarget = convertedTarget ?? campaign.target_lira
  const displaySym = convertedCollected !== null
    ? SYMBOL[siteCurrency]
    : (CURRENCY_SYMBOL[baseCurrency] || baseCurrency)
  const pct = Math.min(Math.round(campaign.progress_percentage || 0), 100)
  return (
    <Link href={`/kampanyalar/${campaign.slug}`} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-primary-50">
          {campaign.cover_image_url ? (
            <Image
              src={campaign.cover_image_url}
              unoptimized={/^https?:\/\//.test(campaign.cover_image_url || '')}
              alt={campaign.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-primary-50">
              <span className="text-sm font-medium text-primary-400">Görsel Yok</span>
            </div>
          )}
          {campaign.is_featured && (
            <div className="absolute end-3 top-3 rounded-full bg-accent-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
              Öne Çıkan
            </div>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col p-5">
          <h3 className="mb-2 line-clamp-2 font-heading text-lg font-bold text-gray-900 group-hover:text-primary-700">
            {campaign.title}
          </h3>
          <p className="mb-4 line-clamp-2 text-sm text-gray-600">
            {campaign.summary}
          </p>

          {campaign.show_collected && (
            <div className="mt-auto rounded-xl bg-gray-50 p-3 text-xs">
              <div className="mb-1.5 flex items-center justify-between gap-2 font-semibold">
                <span className="text-primary-700">
                  {Math.round(displayCollected).toLocaleString('tr-TR')} {displaySym}
                </span>
                <span className="text-gray-500">
                  Hedef: {Math.round(displayTarget).toLocaleString('tr-TR')} {displaySym} · %{pct}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-primary-600 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="p-5 pt-0">
          <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white shadow-sm transition-colors group-hover:bg-primary-700">
            <span aria-hidden>♥</span> Bağış Yap
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
