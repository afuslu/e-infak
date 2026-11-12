'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCheckoutStatus } from '@e-infak/api-client'
import { useEffect, useRef } from 'react'
import { trackConversion } from '../../../../lib/analytics'

export default function DonationErrorPage() {
  const checkoutId = useSearchParams().get('checkout') || undefined
  const { data } = useCheckoutStatus(checkoutId)
  const wasTracked = useRef(false)
  useEffect(() => {
    if (checkoutId && !wasTracked.current) {
      trackConversion('payment_failed', { checkout_id: checkoutId })
      wasTracked.current = true
    }
  }, [checkoutId])
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
      <section className="w-full max-w-lg rounded-2xl border border-gray-200/80 bg-white p-6 text-center shadow-lg sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-8 w-8" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="mt-4 font-heading text-2xl font-bold text-gray-900 sm:text-3xl">Ödeme Tamamlanamadı</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-gray-600 sm:text-base">{data?.failure_message || 'Banka işlemi onaylamadı veya ödeme sayfası kapatıldı.'}</p>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Tekrar denemeden önce banka hareketlerinizi kontrol edin. Belirsiz işlemler banka üzerinden sorgulanır.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link href="/kampanyalar" className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">Tekrar Dene</Link>
          <Link href="/iletisim" className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-400 hover:text-primary-700">Destek Al</Link>
        </div>
      </section>
    </main>
  )
}
