'use client'

import { useEffect } from 'react'
import { Button } from '@e-infak/ui'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

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
