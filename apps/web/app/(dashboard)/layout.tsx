'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@e-infak/ui'

// Admin panel'in kendi sabit markası (E-İnfak yeşili) — mevcut kiracının
// (Hicret/Kardeşlik) renklerinden bağımsız; `primary-*` sınıflarını burada geçersiz kılar.
const ADMIN_PRIMARY_VARS = {
  '--color-primary-50': '#E6F5EE',
  '--color-primary-100': '#C9EBDD',
  '--color-primary-200': '#9DDCC3',
  '--color-primary-300': '#6BC9A5',
  '--color-primary-400': '#3DAE87',
  '--color-primary-500': '#2FA884',
  '--color-primary-600': '#0E7A5F',
  '--color-primary-700': '#0A5C47',
  '--color-primary-800': '#0A4436',
  '--color-primary-900': '#073327',
  '--color-primary-950': '#041D16',
} as React.CSSProperties

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
      <div className="flex min-h-screen items-center justify-center bg-[#EEF1F4]">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#0E7A5F]/20 border-t-[#0E7A5F]" />
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

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: '📢' },
    { href: '/admin/bagislar', label: 'Bağışlar', icon: '💰' },
    { href: '/admin/makbuzlar', label: 'Makbuzlar', icon: '🧾' },
    { href: '/admin/bagiscilar', label: 'Bağışçılar (CRM)', icon: '👥' },
    { href: '/admin/bagis-kalemleri', label: 'Bağış Kalemleri', icon: '🗂️' },
    { href: '/admin/icerikler', label: 'İçerikler', icon: '📰' },
    { href: '/admin/finance', label: 'Kasa & Raporlar', icon: '💼' },
    { href: '/admin/sms', label: 'SMS Şablonları', icon: '✉️' },
    { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: '💬' },
    { href: '/admin/kurban', label: 'Kurban Takip', icon: '🐏' },
    { href: '/admin/students', label: 'Öğrenci Sponsorluk', icon: '🎓' },
    { href: '/admin/wells', label: 'Su Kuyusu Takibi', icon: '📍' },
    { href: '/admin/banners', label: "Slider / Duyuru Banner'ları", icon: '🖼️' },
    { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: '💳' },
    { href: '/admin/zakat', label: 'Zekât Ayarları', icon: '🪙' },
    { href: '/admin/site-ayarlari', label: 'Site Ayarları (Görünüm)', icon: '🎨' },
    { href: '/admin/integrations', label: 'Ayarlar / POS / API', icon: '🔌' },
    { href: '/admin/ai', label: 'AI Tahmin Motoru', icon: '🧠' },
    { href: '/admin/users', label: 'Personel Yetkileri', icon: '👥' },
    { href: '/admin/logs', label: 'Güvenlik Günlüğü', icon: '📜' },
  ]

  return (
    <div className="flex min-h-screen bg-[#EEF1F4]" style={ADMIN_PRIMARY_VARS}>
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-[#12202E] text-[#8FA3B5] flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.08]">
          <div className="h-9 w-9 rounded-[9px] flex items-center justify-center text-white font-extrabold text-base" style={{ background: 'linear-gradient(135deg,#0E7A5F,#2FA884)' }}>
            e
          </div>
          <div>
            <div className="text-white font-extrabold text-[16px] tracking-wide">E-İNFAK</div>
            <div className="text-[10px] tracking-[1.5px] text-[#5F7488]">DERNEK OTOMASYONU</div>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 px-2.5 py-3.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-[#8FA3B5] hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/[0.08] text-[11px] text-[#5F7488]">
          E-İnfak v1.0 · admin@e-infak.org
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-[60px] flex-shrink-0 border-b border-[#E2E8EE] bg-white">
          <div className="flex h-full items-center justify-between px-6">
            <h2 className="text-[16px] font-bold text-[#1D2733]">
              Hoş geldiniz, {user.first_name}
            </h2>
            <div className="flex items-center gap-3.5">
              <Link href="/" className="text-[13px] font-semibold border border-[#D8E0E8] px-3.5 py-2 rounded-lg text-[#3D4C5C] hover:border-[#0E7A5F] hover:text-[#0E7A5F] transition-colors">
                Siteyi Görüntüle ↗
              </Link>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[#0E7A5F] text-white flex items-center justify-center font-bold text-[13px]">
                  {user.first_name?.[0]?.toUpperCase() || 'A'}
                </div>
                <span className="text-[13px] font-semibold text-[#1D2733]">{user.first_name}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Çıkış
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto min-w-0">{children}</main>
      </div>
    </div>
  )
}
