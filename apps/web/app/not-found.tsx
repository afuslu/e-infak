import Link from 'next/link'
import { Button } from '@e-infak/ui'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-gray-900">404</h1>
        <h2 className="mb-4 text-2xl font-semibold text-gray-700">Sayfa Bulunamadı</h2>
        <p className="mb-8 text-gray-600">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link href="/">
          <Button size="lg">Ana Sayfaya Dön</Button>
        </Link>
      </div>
    </div>
  )
}
