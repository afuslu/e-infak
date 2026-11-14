'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCheckoutStatus } from '@e-infak/api-client'
import { useEffect, useRef } from 'react'
import { trackConversion } from '../../../../lib/analytics'

export default function DonationSuccessPage() {
  const checkoutId = useSearchParams().get('checkout') || undefined
  const { data, isLoading } = useCheckoutStatus(checkoutId)
  const verified = data?.status === 'paid'
  const wasTracked = useRef(false)
  useEffect(() => {
    if (verified && !wasTracked.current) {
      trackConversion('payment_succeeded', { checkout_id: checkoutId })
      wasTracked.current = true
    }
  }, [checkoutId, verified])
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
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
        <h1 className="mt-4 font-heading text-2xl font-bold text-gray-900 sm:text-3xl">{verified ? 'Bağışınız Başarıyla Alındı' : 'Ödeme Sonucu Doğrulanıyor'}</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-gray-600 sm:text-base">{verified ? 'Teşekkür ederiz. Banka onayı doğrulandı ve makbuzlarınız oluşturuldu.' : isLoading ? 'Lütfen bu sayfayı kapatmayın.' : 'Sonuç henüz doğrulanamadı; hesabınızdan iki kez çekim yapılmaz.'}</p>
        {data && <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4 text-start">{data.items.map((item) => {
          const apiBase = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || ''
          const shareOrigin = typeof window !== 'undefined' ? window.location.origin : ''
          return (
            <div key={item.campaign_id} className="border-b border-gray-200/70 py-3 last:border-0">
              <div className="flex justify-between gap-3 text-sm"><b className="text-gray-900">{item.campaign_title}</b><span className="font-bold text-primary-700">{(item.total_amount_cents / 100).toLocaleString('tr-TR')} ₺</span></div>
              {item.receipt_number && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link className="inline-flex text-xs font-bold text-primary-700 hover:underline" href={`/verify/receipt/${item.receipt_number}`}>Makbuzu Doğrula: {item.receipt_number} →</Link>
                  <a
                    href={`${apiBase}/api/v1/public/receipts/${encodeURIComponent(item.receipt_number)}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    ⬇ Resmi PDF
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${item.campaign_title} kampanyasına ${(item.total_amount_cents / 100).toLocaleString('tr-TR')} ₺ bağışta bulundum. Makbuz: ${shareOrigin}/verify/receipt/${encodeURIComponent(item.receipt_number)}`)}`}
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
        })}</div>}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link href="/portal" className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">Bağışçı Portalına Git</Link>
          <Link href="/kampanyalar" className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-400 hover:text-primary-700">Diğer Kampanyalar</Link>
        </div>
      </section>
    </main>
  )
}
