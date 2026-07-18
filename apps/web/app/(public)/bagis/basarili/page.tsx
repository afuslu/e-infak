'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCheckoutStatus } from '@e-infak/api-client'

export default function DonationSuccessPage() {
  const checkoutId = useSearchParams().get('checkout') || undefined
  const { data, isLoading } = useCheckoutStatus(checkoutId)
  const verified = data?.status === 'paid'
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <section className="w-full max-w-xl rounded-3xl border bg-white p-8 text-center shadow-xl">
        <div className="text-6xl">{verified ? '✓' : '⏳'}</div>
        <h1 className="mt-4 text-3xl font-black text-slate-900">{verified ? 'Bağışınız Başarıyla Alındı' : 'Ödeme Sonucu Doğrulanıyor'}</h1>
        <p className="mt-3 text-slate-600">{verified ? 'Teşekkür ederiz. Banka onayı doğrulandı ve makbuzlarınız oluşturuldu.' : isLoading ? 'Lütfen bu sayfayı kapatmayın.' : 'Sonuç henüz doğrulanamadı; hesabınızdan iki kez çekim yapılmaz.'}</p>
        {data && <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">{data.items.map((item) => (
          <div key={item.campaign_id} className="border-b py-3 last:border-0">
            <div className="flex justify-between gap-3"><b>{item.campaign_title}</b><span>{(item.total_amount_cents / 100).toLocaleString('tr-TR')} ₺</span></div>
            {item.receipt_number && <Link className="mt-1 block text-xs font-bold text-emerald-700" href={`/verify/receipt/${item.receipt_number}`}>Makbuz: {item.receipt_number}</Link>}
          </div>
        ))}</div>}
        <div className="mt-7 grid gap-3">
          <Link href="/portal" className="rounded-xl bg-primary-600 px-5 py-3 font-black text-white">Bağışçı Portalına Git</Link>
          <Link href="/kampanyalar" className="rounded-xl border px-5 py-3 font-bold text-slate-700">Diğer Kampanyalar</Link>
        </div>
      </section>
    </main>
  )
}
