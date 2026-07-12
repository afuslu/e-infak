import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@e-infak/ui'

export const metadata: Metadata = {
  title: 'Ana Sayfa | E-İnfak',
}

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-50 to-accent-50 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-5xl font-bold text-gray-900">
              Hayır Projelerine <span className="text-primary-600">Destek Ol</span>
            </h1>
            <p className="mb-8 text-xl text-gray-600">
              Güvenilir bağış platformumuz ile ihtiyaç sahiplerine ulaşın, 
              hayırlı işlere ortak olun.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link href="/kampanyalar">
                <Button size="lg" className="w-full sm:w-auto">
                  Kampanyaları İncele
                </Button>
              </Link>
              <Link href="/hakkimizda">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Hakkımızda
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-b bg-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="mb-2 text-4xl font-bold text-primary-600">1,250+</div>
              <div className="text-gray-600">Aktif Bağışçı</div>
            </div>
            <div className="text-center">
              <div className="mb-2 text-4xl font-bold text-primary-600">85</div>
              <div className="text-gray-600">Tamamlanan Proje</div>
            </div>
            <div className="text-center">
              <div className="mb-2 text-4xl font-bold text-primary-600">2.5M₺</div>
              <div className="text-gray-600">Toplanan Bağış</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Campaigns */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-3xl font-bold text-gray-900">Öne Çıkan Kampanyalar</h2>
            <p className="text-gray-600">Acil destek bekleyen projelerimiz</p>
          </div>
          
          <div className="mb-8">
            <div className="rounded-lg bg-primary-50 p-6 text-center">
              <p className="text-gray-700">
                Kampanyalar yükleniyor...
              </p>
            </div>
          </div>

          <div className="text-center">
            <Link href="/kampanyalar">
              <Button variant="outline" size="lg">
                Tüm Kampanyaları Gör
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary-600 py-16 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">Düzenli Bağışçımız Ol</h2>
          <p className="mb-8 text-lg text-primary-100">
            Aylık düzenli bağış yaparak sürdürülebilir yardım zincirine katıl
          </p>
          <Button size="lg" variant="secondary">
            Düzenli Bağış Başlat
          </Button>
        </div>
      </section>
    </div>
  )
}
