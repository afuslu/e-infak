'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ReceiptVerifyLanding() {
  const router = useRouter()
  const [receiptNumber, setReceiptNumber] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = receiptNumber.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{4,64}$/.test(normalized)) {
      setError('Geçerli bir makbuz numarası giriniz.')
      return
    }
    router.push(`/verify/receipt/${encodeURIComponent(normalized)}`)
  }

  return (
    <main className="min-h-[70vh] bg-gray-50 px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
        <h1 className="font-heading text-2xl font-bold text-gray-900 sm:text-3xl">Makbuz Doğrulama</h1>
        <p className="mt-2.5 text-sm leading-6 text-gray-600">
          Makbuzunuzdaki numarayı girerek tutar, tarih ve maskelenmiş bağışçı bilgilerini
          resmi kayıttan doğrulayabilirsiniz.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label htmlFor="receipt-number" className="block text-sm font-semibold text-gray-700">
            Makbuz numarası
          </label>
          <input
            id="receipt-number"
            value={receiptNumber}
            onChange={(event) => {
              setReceiptNumber(event.target.value)
              setError('')
            }}
            autoComplete="off"
            placeholder="Örn. HCR-2026-000123"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm font-semibold uppercase text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/15"
          />
          {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">
            Makbuzu Doğrula
          </button>
        </form>
        <Link href="/iletisim" className="mt-4 inline-flex text-sm font-semibold text-primary-700 hover:underline">
          Yardıma mı ihtiyacınız var?
        </Link>
      </div>
    </main>
  )
}
