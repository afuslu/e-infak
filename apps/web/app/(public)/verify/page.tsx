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
    <main className="min-h-[70vh] bg-slate-50 px-4 py-20">
      <div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-900">Makbuz Doğrulama</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Makbuzunuzdaki numarayı girerek tutar, tarih ve maskelenmiş bağışçı bilgilerini
          resmi kayıttan doğrulayabilirsiniz.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label htmlFor="receipt-number" className="block text-sm font-bold text-slate-700">
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
            className="w-full rounded-xl border border-slate-300 px-4 py-3 uppercase outline-none focus:border-emerald-700"
          />
          {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">
            Makbuzu Doğrula
          </button>
        </form>
        <Link href="/iletisim" className="mt-4 inline-flex text-sm font-bold text-emerald-800">
          Yardıma mı ihtiyacınız var?
        </Link>
      </div>
    </main>
  )
}
