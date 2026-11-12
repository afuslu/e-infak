'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface CartSummaryItem {
  campaignId?: string
  campaignTitle?: string
  amount?: number
  quantity?: number
  currency?: string
}

const SYM: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }

/** /bagis/sepetim: opens the site-wide donation cart drawer and keeps a clear summary on the page. */
export function CartPageClient() {
  const [items, setItems] = useState<CartSummaryItem[] | null>(null)
  useEffect(() => {
    const read = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem('einfak_cart') || '[]')
        setItems(Array.isArray(parsed) ? parsed : [])
      } catch { setItems([]) }
    }
    read()
    window.addEventListener('donation-cart-changed', read)
    const timer = setTimeout(() => window.dispatchEvent(new Event('open-donation-cart')), 50)
    return () => { clearTimeout(timer); window.removeEventListener('donation-cart-changed', read) }
  }, [])
  const count = items?.length ?? null
  return (
    <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="font-heading text-3xl font-bold text-gray-900">Bağış Sepetim</h1>
        <p className="mt-2.5 text-sm text-gray-600 sm:text-base">
          {count === null ? '' : count ? `Sepetinizde ${count} bağış kalemi bulunuyor.` : 'Sepetinizde henüz bağış bulunmuyor.'}
        </p>
        {items && items.length > 0 && (
          <ul className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/70 px-4 text-start text-sm">
            {items.map((it, idx) => (
              <li key={idx} className="flex items-center justify-between gap-3 py-3">
                <span className="font-semibold text-gray-800">
                  {it.campaignTitle || 'Bağış'}
                  {it.quantity && it.quantity > 1 ? <span className="ms-1.5 text-xs text-gray-500">×{it.quantity}</span> : null}
                </span>
                <span className="font-bold text-primary-700">
                  {((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {SYM[it.currency || 'TRY'] || '₺'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {!!count && (
            <button type="button" onClick={() => window.dispatchEvent(new Event('open-donation-cart'))}
              className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">
              Sepeti Aç ve Tamamla
            </button>
          )}
          <Link href="/bagis" className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-400 hover:text-primary-700">
            Bağış Sayfasına Git
          </Link>
        </div>
      </div>
    </section>
  )
}
