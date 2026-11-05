'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@e-infak/ui'
import { hasFeature, hasPermission, useAdminAccess } from '../../lib/admin-access'

interface NavItem {
  href: string
  label: string
  icon: string
  feature?: string
  permission?: string
}

// `feature`: package module (app/core/plans.py); `permission`: staff permission (app/api/deps.py).
const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/raporlar', label: 'Raporlar', icon: '📈', feature: 'reports_basic', permission: 'report_read' },
  { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: '📢' },
  { href: '/admin/bagislar', label: 'Bağışlar', icon: '💰' },
  { href: '/admin/makbuzlar', label: 'Makbuzlar', icon: '🧾', feature: 'receipts' },
  { href: '/admin/bagiscilar', label: 'Bağışçılar (CRM)', icon: '👥', feature: 'donor_crm' },
  { href: '/admin/bagis-kalemleri', label: 'Bağış Kalemleri', icon: '🗂️' },
  { href: '/admin/icerikler', label: 'Haber & Blog', icon: '📰', feature: 'website' },
  { href: '/admin/sayfalar', label: 'Sayfalar', icon: '📄', feature: 'website' },
  { href: '/admin/menu', label: 'Menü', icon: '🧭', feature: 'website' },
  { href: '/admin/galeri', label: 'Foto & Video Galeri', icon: '🎞️', feature: 'website' },
  { href: '/admin/gonulluler', label: 'Gönüllü Başvuruları', icon: '🙋', feature: 'website' },
  { href: '/admin/finance', label: 'Kasa & Giderler', icon: '💼' },
  { href: '/admin/reconciliation', label: 'Banka Mutabakatı', icon: '🏛️', feature: 'bank_transactions' },
  { href: '/admin/sms', label: 'SMS Şablonları', icon: '✉️', feature: 'sms' },
  { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: '💬', feature: 'sms' },
  { href: '/admin/kurban', label: 'Kurban Organizasyonu', icon: '🐏', feature: 'kurban' },
  { href: '/admin/sponsorluk', label: 'Sponsorluk & Burs', icon: '🤲', feature: 'sponsorship' },
  { href: '/admin/students', label: 'Hafızlık Öğrencileri', icon: '🎓', feature: 'education' },
  { href: '/admin/wells', label: 'Su Kuyuları', icon: '📍', feature: 'water_well' },
  { href: '/admin/kumbara', label: 'Kumbaralar', icon: '🫙', feature: 'money_box' },
  { href: '/admin/kumanya', label: 'Kumanya Dağıtım', icon: '📦', feature: 'food_aid' },
  { href: '/admin/gorevler', label: 'Görevler & Takvim', icon: '🗓️', feature: 'tasks' },
  { href: '/admin/banners', label: "Slider / Duyuru Banner'ları", icon: '🖼️', feature: 'website' },
  { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: '💳', feature: 'recurring' },
  { href: '/admin/zakat', label: 'Zekât Ayarları', icon: '🪙' },
  { href: '/admin/gorunum', label: 'Görünüm & Tema', icon: '🎨', permission: 'settings_manage' },
  { href: '/admin/site-ayarlari', label: 'Site Ayarları', icon: '⚙️', permission: 'settings_manage' },
  { href: '/admin/odeme-sms', label: 'Ödeme & SMS Hesapları', icon: '🔐', permission: 'settings_manage' },
  { href: '/admin/integrations', label: 'Ayarlar / POS / API', icon: '🔌', permission: 'settings_manage' },
  { href: '/admin/ai', label: 'AI Tahmin Motoru', icon: '🧠' },
  { href: '/admin/users', label: 'Personel & Yetkiler', icon: '🛡️', feature: 'roles' },
  { href: '/admin/paket', label: 'Paket & Kullanım', icon: '📦' },
]

function navItemFor(pathname: string | null) {
  if (!pathname) return undefined
  return NAV_ITEMS
    .filter((item) => item.href !== '/admin' && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

// Admin panel'in kendi sabit markası (E-İnfak yeşili) — mevcut kiracının
// renklerinden bağımsız; `primary-*` sınıflarını burada geçersiz kılar.
const ADMIN_PRIMARY_VARS = {
  '--brand-primary-50': '#E6F5EE',
  '--brand-primary-100': '#C9EBDD',
  '--brand-primary-200': '#9DDCC3',
  '--brand-primary-300': '#6BC9A5',
  '--brand-primary-400': '#3DAE87',
  '--brand-primary-500': '#2FA884',
  '--brand-primary-600': '#0E7A5F',
  '--brand-primary-700': '#0A5C47',
  '--brand-primary-800': '#0A4436',
  '--brand-primary-900': '#073327',
  '--brand-primary-950': '#041D16',
} as React.CSSProperties

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: user, isLoading } = useCurrentUser()
  const { data: access } = useAdminAccess()
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
    try {
      await logout.mutateAsync()
    } catch {
      // Ignore logout errors
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
      router.push('/giris')
    }
  }

  const navItems = NAV_ITEMS.filter((item) => hasFeature(access, item.feature) && hasPermission(access, item.permission))
  const currentItem = navItemFor(pathname)
  const blockedFeature = currentItem && !hasFeature(access, currentItem.feature) ? currentItem : undefined

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
          {access ? (
            <Link href="/admin/paket" className="block hover:text-white">
              {access.plan_label} paket · {access.usage.users}/{access.limits.users} kullanıcı
            </Link>
          ) : (
            'E-İnfak · admin@e-infak.org'
          )}
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
        <main className="flex-1 p-6 overflow-auto min-w-0">
          {blockedFeature ? (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-[#E2E8EE] bg-white p-8 text-center shadow-sm">
              <div className="mb-3 text-4xl">{blockedFeature.icon}</div>
              <h1 className="mb-2 text-xl font-bold text-[#1D2733]">{blockedFeature.label} paketinizde yok</h1>
              <p className="mb-6 text-sm text-[#5F7488]">
                Kurumunuz şu anda <strong>{access?.plan_label}</strong> paketini kullanıyor. Bu modülü kullanmak için
                paketinizi yükseltebilir veya ek modül olarak açtırabilirsiniz.
              </p>
              <Link href="/admin/paket" className="inline-block rounded-lg bg-[#0E7A5F] px-4 py-2 text-sm font-semibold text-white">
                Paketleri karşılaştır
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
