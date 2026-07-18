'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCheckoutStatus } from '@e-infak/api-client'

export default function DonationErrorPage() {
  const checkoutId = useSearchParams().get('checkout') || undefined
  const { data } = useCheckoutStatus(checkoutId)
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-xl">
        <div className="text-6xl">!</div>
        <h1 className="mt-4 text-3xl font-black">Ödeme Tamamlanamadı</h1>
        <p className="mt-3 text-slate-600">{data?.failure_message || 'Banka işlemi onaylamadı veya ödeme sayfası kapatıldı.'}</p>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Tekrar denemeden önce banka hareketlerinizi kontrol edin. Belirsiz işlemler banka üzerinden sorgulanır.</p>
        <div className="mt-7 grid gap-3">
          <Link href="/kampanyalar" className="rounded-xl bg-primary-600 px-5 py-3 font-black text-white">Güvenli Şekilde Tekrar Dene</Link>
          <Link href="/iletisim" className="rounded-xl border px-5 py-3 font-bold">Destek Al</Link>
        </div>
      </section>
    </main>
  )
}
