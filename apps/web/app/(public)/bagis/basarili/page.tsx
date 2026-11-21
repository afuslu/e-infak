'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCheckoutStatus } from '@e-infak/api-client'
import { useEffect, useRef, useState } from 'react'
import { trackConversion } from '../../../../lib/analytics'

export default function DonationSuccessPage() {
  const checkoutId = useSearchParams().get('checkout') || undefined
  const { data, isLoading } = useCheckoutStatus(checkoutId)
  const verified = data?.status === 'paid'
  const wasTracked = useRef(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (verified && !wasTracked.current) {
      trackConversion('payment_succeeded', { checkout_id: checkoutId })
      wasTracked.current = true
      // The bank returned to this page: the paid cart must not be offered again.
      try { localStorage.removeItem('einfak_cart') } catch { /* storage blocked */ }
      window.dispatchEvent(new Event('donation-cart-changed'))
    }
  }, [checkoutId, verified])

  const copyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000)
    }).catch(() => undefined)
  }

  const totalCents = (data?.items || []).reduce((sum, it) => sum + (it.total_amount_cents || 0), 0)
  const totalFormatted = totalCents > 0
    ? (totalCents / 100).toLocaleString('tr-TR', { style: 'currency', currency: data?.currency || 'TRY' })
    : null
  const shareOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:py-16">
      <section className="w-full max-w-xl rounded-2xl border border-gray-200/80 bg-white p-6 text-center shadow-lg sm:p-8">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${verified ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-50 text-primary-700'}`}>
          {verified ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-8 w-8" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-8 w-8 animate-pulse" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
            </svg>
          )}
        </div>

        <h1 className="mt-4 font-heading text-2xl font-bold text-gray-900 sm:text-3xl">
          {verified ? 'Bağışınız Başarıyla Alındı' : 'Ödeme Sonucu Doğrulanıyor'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
          {verified
            ? 'Teşekkür ederiz. Banka onayı doğrulandı ve resmî makbuzlarınız oluşturuldu.'
            : isLoading
              ? 'Lütfen bu sayfayı kapatmayın.'
              : 'Sonuç henüz doğrulanamadı; hesabınızdan iki kez çekim yapılmaz.'}
        </p>

        {verified && totalFormatted && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-800">
            <span>Toplam Bağış:</span>
            <span>{totalFormatted}</span>
          </div>
        )}

        {data && (
          <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4 text-start">
            {data.items.map((item) => {
              const apiBase = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || ''
              const codeQuery = item.verify_code ? `?k=${encodeURIComponent(item.verify_code)}` : ''
              const amount = (item.total_amount_cents / 100).toLocaleString('tr-TR', { style: 'currency', currency: data.currency || 'TRY' })
              const privacyShareText = `${item.campaign_title} kampanyasına destek oldum. Siz de iyiliğe ortak olabilirsiniz: ${shareOrigin}/kampanyalar`
              return (
                <div key={item.campaign_id} className="border-b border-gray-200/70 py-3 first:pt-0 last:border-0 last:pb-0">
                  <div className="flex justify-between gap-3 text-sm">
                    <b className="text-gray-900">{item.campaign_title}</b>
                    <span className="shrink-0 font-bold text-primary-700">{amount}</span>
                  </div>
                  {item.receipt_number && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Link
                        className="inline-flex text-xs font-bold text-primary-700 hover:underline"
                        href={`/verify/receipt/${encodeURIComponent(item.receipt_number)}${codeQuery}`}
                      >
                        Makbuz: {item.receipt_number} →
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyText(item.receipt_number!, item.receipt_number!)}
                        className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        {copiedId === item.receipt_number ? '✓ Kopyalandı' : 'No Kopyala'}
                      </button>
                      <a
                        href={`${apiBase}/api/v1/public/receipts/${encodeURIComponent(item.receipt_number)}/pdf${codeQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        ⬇ Makbuz PDF
                      </a>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(privacyShareText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700 hover:bg-green-100"
                      >
                        WhatsApp&apos;ta Paylaş
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {verified && (
          <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-gray-100 bg-slate-50/80 p-3 text-center text-[11px] text-gray-600">
            <div>
              <div className="font-bold text-emerald-700">1. Makbuz</div>
              <div className="mt-0.5">SMS &amp; e-posta ile iletildi</div>
            </div>
            <div className="border-x border-gray-200 px-1">
              <div className="font-bold text-gray-800">2. Saha Kaydı</div>
              <div className="mt-0.5">Emanetiniz ekibe aktarılır</div>
            </div>
            <div>
              <div className="font-bold text-gray-800">3. Bilgilendirme</div>
              <div className="mt-0.5">Portaldan anlık takip</div>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/portal" className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">
            Bağışçı Portalına Git
          </Link>
          <Link href="/kampanyalar" className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-400 hover:text-primary-700">
            Diğer Kampanyalar
          </Link>
        </div>
      </section>
    </main>
  )
}
