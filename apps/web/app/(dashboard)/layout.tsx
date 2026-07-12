'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@e-infak/ui'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data: user, isLoading } = useCurrentUser()
  const logout = useLogout()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/giris')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const handleLogout = async () => {
    await logout.mutateAsync()
    router.push('/')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-sm">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/admin" className="text-xl font-bold text-primary-600">
            E-İnfak Admin
          </Link>
        </div>

        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <Link
                href="/admin"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                📊 Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/admin/kampanyalar"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                📢 Kampanyalar
              </Link>
            </li>
            <li>
              <Link
                href="/admin/bagislar"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                💰 Bağışlar
              </Link>
            </li>
            <li>
              <Link
                href="/admin/bagiscilar"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                👥 Bağışçılar
              </Link>
            </li>
            <li>
              <Link
                href="/admin/finance"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                💼 Kasa & Raporlar
              </Link>
            </li>
            <li>
              <Link
                href="/admin/sms"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                ✉️ SMS Şablonları
              </Link>
            </li>
            <li>
              <Link
                href="/admin/broadcast"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                💬 Toplu SMS Gönder
              </Link>
            </li>
            <li>
              <Link
                href="/admin/kurban"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                🐏 Kurban Takip
              </Link>
            </li>
            <li>
              <Link
                href="/admin/students"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                🎓 Öğrenci Sponsorluk
              </Link>
            </li>
            <li>
              <Link
                href="/admin/wells"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                📍 Su Kuyusu Takibi
              </Link>
            </li>
            <li>
              <Link
                href="/admin/banners"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                📢 Duyuru Banner'ları
              </Link>
            </li>
            <li>
              <Link
                href="/admin/subscriptions"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                💳 Düzenli Ödemeler
              </Link>
            </li>
            <li>
              <Link
                href="/admin/zakat"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                🪙 Zekat Ayarları
              </Link>
            </li>
            <li>
              <Link
                href="/admin/integrations"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                🔌 Webhook & API Key
              </Link>
            </li>
            <li>
              <Link
                href="/admin/ai"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                🧠 AI Tahmin Motoru
              </Link>
            </li>
            <li>
              <Link
                href="/admin/users"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                👥 Personel Yetkileri
              </Link>
            </li>
            <li>
              <Link
                href="/admin/logs"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                📜 Güvenlik Günlüğü
              </Link>
            </li>
            <li>
              <Link
                href="/admin/ayarlar"
                className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-primary-50 hover:text-primary-700"
              >
                ⚙️ Ayarlar
              </Link>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <header className="h-16 border-b bg-white">
          <div className="flex h-full items-center justify-between px-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Hoş geldiniz, {user.first_name}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Çıkış
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
