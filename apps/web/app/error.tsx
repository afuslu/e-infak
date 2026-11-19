'use client'

import { useEffect } from 'react'
import { Button } from '@e-infak/ui'

function isChunkError(err: Error): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to find Server Action/i.test(err?.message || '')
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const chunkErr = isChunkError(error)

  useEffect(() => {
    console.error(error)
    if (chunkErr) {
      try {
        const last = Number(sessionStorage.getItem('einfak-chunk-reload') || 0)
        if (Date.now() - last > 15_000) {
          sessionStorage.setItem('einfak-chunk-reload', String(Date.now()))
          window.location.reload()
        }
      } catch {
        window.location.reload()
      }
    }
  }, [error, chunkErr])

  if (chunkErr) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <div className="mb-3 text-4xl">🚀</div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Yeni sürüm yayınlandı</h2>
          <p className="mb-6 text-sm text-gray-600">
            Uygulama güncellendi. Devam etmek için sayfayı yenileyin.
          </p>
          <Button size="lg" onClick={() => window.location.reload()}>
            Yeni Sürüme Geç
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-red-600">Hata!</h1>
        <h2 className="mb-4 text-2xl font-semibold text-gray-700">Bir şeyler yanlış gitti</h2>
        <p className="mb-8 text-gray-600">
          Üzgünüz, beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
        </p>
        <Button size="lg" onClick={reset}>
          Tekrar Dene
        </Button>
      </div>
    </div>
  )
}
