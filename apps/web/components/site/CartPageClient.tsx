'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/** /bagis/sepetim: opens the site-wide donation cart drawer and keeps a short summary on the page. */
export function CartPageClient() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    const read = () => {
      try {
        const items = JSON.parse(localStorage.getItem('einfak_cart') || '[]')
        setCount(Array.isArray(items) ? items.length : 0)
      } catch { setCount(0) }
    }
    read()
    window.addEventListener('donation-cart-changed', read)
    const timer = setTimeout(() => window.dispatchEvent(new Event('open-donation-cart')), 50)
    return () => { clearTimeout(timer); window.removeEventListener('donation-cart-changed', read) }
  }, [])
  return (
    <section className="mx-auto max-w-xl px-6 py-20 text-center">
      <h1 className="font-heading text-4xl font-bold">Bağış Sepetim</h1>
      <p className="mt-4 text-gray-600">
        {count === null ? '' : count ? `Sepetinizde ${count} bağış var.` : 'Sepetiniz boş.'}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {!!count && (
          <button type="button" onClick={() => window.dispatchEvent(new Event('open-donation-cart'))}
            className="rounded-full bg-primary-700 px-7 py-3 font-semibold text-white">Sepeti aç ve bağışı tamamla</button>
        )}
        <Link href="/bagis" className="rounded-full border-2 border-primary-700 px-7 py-3 font-semibold">Bağış yap</Link>
      </div>
    </section>
  )
}
