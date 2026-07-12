'use client'

import { Card } from '@e-infak/ui'

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <div className="mb-2 text-sm text-gray-600">Bugün</div>
          <div className="mb-1 text-3xl font-bold text-gray-900">15,250 ₺</div>
          <div className="text-sm text-green-600">↑ 12.5% dünden</div>
        </Card>

        <Card className="p-6">
          <div className="mb-2 text-sm text-gray-600">Bu Ay</div>
          <div className="mb-1 text-3xl font-bold text-gray-900">425,890 ₺</div>
          <div className="text-sm text-green-600">↑ 8.2% geçen aydan</div>
        </Card>

        <Card className="p-6">
          <div className="mb-2 text-sm text-gray-600">Toplam Bağışçı</div>
          <div className="mb-1 text-3xl font-bold text-gray-900">1,247</div>
          <div className="text-sm text-blue-600">↑ 23 yeni bağışçı</div>
        </Card>

        <Card className="p-6">
          <div className="mb-2 text-sm text-gray-600">Aktif Kampanya</div>
          <div className="mb-1 text-3xl font-bold text-gray-900">12</div>
          <div className="text-sm text-gray-600">3 tamamlandı</div>
        </Card>
      </div>

      {/* Recent Donations */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Son Bağışlar</h2>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0">
              <div>
                <div className="font-medium">Ahmet Y***</div>
                <div className="text-sm text-gray-600">Eğitim Kampanyası</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-primary-600">500 ₺</div>
                <div className="text-xs text-gray-500">2 saat önce</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
