import Link from 'next/link'
import { Button } from '@e-infak/ui'

export default function DonationErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-10 w-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-gray-900">İşlem Başarısız</h1>
        <p className="mb-8 text-lg text-gray-600">
          Bağış işleminiz tamamlanamadı. Lütfen bilgilerinizi kontrol edip tekrar deneyin.
        </p>

        <div className="mb-8 rounded-lg bg-red-50 p-6">
          <p className="text-sm text-red-900">
            Sorun devam ederse lütfen banka kartınızın internet ödemelerine açık olduğundan emin
            olun veya bizimle iletişime geçin.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/kampanyalar">
            <Button size="lg" className="w-full">
              Tekrar Dene
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="outline" className="w-full">
              Ana Sayfaya Dön
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
