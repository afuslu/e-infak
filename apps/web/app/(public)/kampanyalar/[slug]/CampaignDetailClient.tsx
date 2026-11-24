'use client'

import { useState } from 'react'
import { useCampaign, useOrgSettings, type Campaign } from '@e-infak/api-client'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@e-infak/ui'
import { ApproxCurrency, CURRENCY_SYMBOL } from '../../../../components/site/ApproxCurrency'
import { FormattedStory } from '../../../../components/FormattedStory'
import { translator } from '../../../../lib/i18n'
import { useSiteCurrency } from '../../../../components/blocks/DonationBlocks'
import { DonationChoiceFields, useDonationChoice } from '../../../../components/donation-choice'
import { cartLimits } from '../../../../lib/donation-options'
import { InstallmentCard } from './InstallmentCard'

export default function CampaignDetailClient({ slug, locale = 'tr', initial }: { slug: string; locale?: string; initial?: Campaign | null }) {
  const t = translator(locale)
  const query = useCampaign(slug)
  // Rendered on the server with the campaign already loaded (search engines see the content);
  // the client query only refreshes it.
  const campaign = query.data ?? initial ?? undefined
  const isLoading = query.isLoading && !campaign
  const error = campaign ? null : query.error
  const { data: orgSettings } = useOrgSettings()
  const taxDeduction = orgSettings?.legal?.tax_deduction_eligible === true
  const [customAmount, setCustomAmount] = useState('')
  const [justAdded, setJustAdded] = useState<number | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const curSymbol = CURRENCY_SYMBOL[campaign?.currency || 'TRY'] || '₺'

  const addToCart = (amountCents: number) => {
    if (!campaign || amountCents <= 0) return
    window.dispatchEvent(new CustomEvent('add-to-donation-cart', {
      detail: {
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        amount: amountCents / 100,
        quantity: 1,
        currency: campaign.currency || 'TRY',
      },
    }))
    setJustAdded(amountCents)
    setTimeout(() => setJustAdded((cur) => (cur === amountCents ? null : cur)), 2500)
  }

  const { currency: siteCurrency, convert } = useSiteCurrency()
  const toSite = (n: number) => convert(n, 'TRY')
  const own = useDonationChoice(campaign, siteCurrency, toSite, locale)
  const [ownError, setOwnError] = useState('')
  const addOwn = () => {
    if (!campaign || !own.options || !own.result) return
    const problem = own.validate()
    setOwnError(problem)
    if (problem || own.result.unit == null) return
    window.dispatchEvent(new CustomEvent('add-to-donation-cart', {
      detail: {
        campaignId: campaign.id, campaignTitle: `${campaign.title}${own.result.suffix}`, amount: own.result.unit,
        quantity: own.result.quantity, metadata: own.result.metadata, currency: siteCurrency, ...cartLimits(own.options),
      },
    }))
    setJustAdded(0)
    setTimeout(() => setJustAdded((cur) => (cur === 0 ? null : cur)), 2500)
  }

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
            unoptimized={/^https?:\/\//.test(campaign.cover_image_url || '')}
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

            {campaign.story && (
              <div className="prose prose-lg max-w-none">
                <FormattedStory text={campaign.story} className="text-base" />
              </div>
            )}
          </div>

          {/* Sidebar - Donation Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-xl bg-white p-6 shadow-lg">
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-3xl font-bold text-primary-600">
                    {campaign.collected_lira.toLocaleString('tr-TR')} {CURRENCY_SYMBOL[campaign.currency || 'TRY']}
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

                {campaign.target_lira > 0 && (
                  <p className="text-sm text-gray-600">
                    {t('campaign.target')}: {campaign.target_lira.toLocaleString('tr-TR')} {CURRENCY_SYMBOL[campaign.currency || 'TRY']}
                    {' '}<ApproxCurrency amount={campaign.target_lira} currency={campaign.currency || 'TRY'} className="text-xs text-gray-400" />
                  </p>
                )}
              </div>

              <InstallmentCard campaignId={campaign.id} campaignTitle={campaign.title} />
              {own.options ? (
                <div className="mb-3">
                  <DonationChoiceFields state={own} campaign={campaign} currency={siteCurrency} convert={toSite} locale={locale} />
                  {ownError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{ownError}</p>}
                  <button type="button" onClick={addOwn}
                    className="mt-3 w-full rounded-lg bg-primary-50 px-3.5 py-2.5 text-sm font-bold text-primary-700 transition hover:bg-primary-100">
                    {justAdded === 0 ? '✓ Eklendi' : '+ Sepete Ekle'}
                  </button>
                </div>
              ) : (<>
              {/* Suggested Amounts */}
              {campaign.suggested_amounts_cents.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">Hızlı Bağış</p>
                  <div className="grid grid-cols-2 gap-2">
                    {campaign.suggested_amounts_cents.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => addToCart(amount)}
                        className={`rounded-lg border-2 py-2 text-center font-semibold transition-colors ${
                          justAdded === amount
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 text-gray-700 hover:border-primary-500 hover:bg-primary-50 hover:text-primary-700'
                        }`}
                      >
                        {justAdded === amount ? '✓ Eklendi' : `${(amount / 100).toLocaleString('tr-TR')} ${curSymbol}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Amount Quick Add */}
              {campaign.allow_custom_amount !== false && <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const n = Number(customAmount.replace(/\./g, '').replace(',', '.'))
                  if (Number.isFinite(n) && n > 0) {
                    addToCart(Math.round(n * 100))
                    setCustomAmount('')
                  }
                }}
                className="mb-3 flex gap-2"
              >
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder={`Özel tutar (${curSymbol})`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!customAmount || Number(customAmount) <= 0}
                  className="shrink-0 rounded-lg bg-primary-50 px-3.5 py-2 text-xs font-bold text-primary-700 transition hover:bg-primary-100 disabled:opacity-40"
                >
                  + Sepete Ekle
                </button>
              </form>}
              </>)}

              <Link href={`/bagis/${campaign.slug}`}>
                <Button size="lg" className="w-full">
                  Bağış Yap
                </Button>
              </Link>

              {justAdded !== null && (
                <Link
                  href="/bagis/sepetim"
                  className="mt-2 flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Sepete Git &amp; Ödemeyi Tamamla →
                </Link>
              )}

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${campaign.title} kampanyasına destek olun: ${typeof window !== 'undefined' ? window.location.href : `/kampanyalar/${campaign.slug}`}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-800 transition-colors hover:bg-green-100"
                >
                  WhatsApp&apos;ta Paylaş
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? window.location.href : `/kampanyalar/${campaign.slug}`
                    navigator.clipboard?.writeText(url).then(() => {
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }).catch(() => undefined)
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {linkCopied ? '✓ Link Kopyalandı' : '🔗 Linki Kopyala'}
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-600">
                  {taxDeduction && <>Bağışlarınız vergi indirimi kapsamındadır.{' '}</>}
                  Bağış makbuzunuz SMS ve e-posta ile anında iletilir; bağışçı panelinizden de dilediğiniz zaman indirebilirsiniz.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
