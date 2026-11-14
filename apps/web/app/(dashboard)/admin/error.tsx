'use client'

import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden="true" />
      <h1 className="mb-2 text-xl font-bold text-gray-900">Bu sayfada bir hata oluştu</h1>
      <p className="mb-6 text-sm text-gray-500">
        {error?.message || 'Beklenmeyen bir sorun nedeniyle sayfa yüklenemedi. Lütfen tekrar deneyin.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tekrar Dene
        </button>
        <Link href="/admin" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Genel Bakış&apos;a Dön
        </Link>
      </div>
    </div>
  )
}
