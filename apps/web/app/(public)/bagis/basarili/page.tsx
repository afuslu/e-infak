import Link from 'next/link'
import { Button } from '@e-infak/ui'

export default function DonationSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-10 w-10 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-gray-900">Bağışınız Başarılı!</h1>
        <p className="mb-8 text-lg text-gray-600">
          Katkınız için teşekkür ederiz. Bağış makbuzunuz e-posta adresinize gönderilecektir.
        </p>

        <div className="mb-8 rounded-lg bg-primary-50 p-6">
          <p className="text-sm text-primary-900">
            Allah sizden razı olsun. Hayırlı işlerinizin devamını dileriz.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/kampanyalar">
            <Button size="lg" className="w-full">
              Diğer Kampanyalara Göz At
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
