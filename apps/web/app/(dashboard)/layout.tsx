'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
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
  { href: '/admin/makbuz-kocanlari', label: 'Makbuz Koçanları', icon: '📒', feature: 'receipts' },
  { href: '/admin/bagiscilar', label: 'Bağışçılar (CRM)', icon: '👥', feature: 'donor_crm' },
  { href: '/admin/uyeler', label: 'Üyeler & Aidat', icon: '🪪', feature: 'membership' },
  { href: '/admin/veri-aktarma', label: "Excel'den Aktarım", icon: '📥', feature: 'donor_crm' },
  { href: '/admin/bagis-kalemleri', label: 'Bağış Kalemleri', icon: '🗂️' },
  { href: '/admin/icerikler', label: 'Haber & Blog', icon: '📰', feature: 'website' },
  { href: '/admin/sayfalar', label: 'Sayfalar', icon: '📄', feature: 'website' },
  { href: '/admin/menu', label: 'Menü', icon: '🧭', feature: 'website' },
  { href: '/admin/galeri', label: 'Foto & Video Galeri', icon: '🎞️', feature: 'website' },
  { href: '/admin/gonulluler', label: 'Gönüllü Başvuruları', icon: '🙋', feature: 'website' },
  { href: '/admin/finance', label: 'Kasa & Giderler', icon: '💼' },
  { href: '/admin/muhasebe', label: 'Muhasebe', icon: '📚', feature: 'accounting' },
  { href: '/admin/gelen-havaleler', label: 'Gelen Havaleler', icon: '📨', feature: 'bank_transactions' },
  { href: '/admin/banka-hesaplari', label: 'Banka Hesapları', icon: '🏦', feature: 'bank_transactions' },
  { href: '/admin/reconciliation', label: 'Banka Mutabakatı', icon: '🏛️', feature: 'bank_transactions' },
  { href: '/admin/sms', label: 'SMS Şablonları', icon: '✉️', feature: 'sms' },
  { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: '💬', feature: 'sms' },
  { href: '/admin/kurban', label: 'Kurban Organizasyonu', icon: '🐏', feature: 'kurban' },
  { href: '/admin/sponsorluk', label: 'Sponsorluk & Burs', icon: '🤲', feature: 'sponsorship' },
  { href: '/admin/students', label: 'Hafızlık Öğrencileri', icon: '🎓', feature: 'education' },
  { href: '/admin/wells', label: 'Su Kuyuları', icon: '📍', feature: 'water_well' },
  { href: '/admin/kumbara', label: 'Kumbaralar', icon: '🫙', feature: 'money_box' },
  { href: '/admin/kumanya', label: 'Kumanya Dağıtım', icon: '📦', feature: 'food_aid' },
  { href: '/admin/yoksul-takip', label: 'Yoksul Takibi', icon: '🏠', feature: 'poverty_tracking' },
  { href: '/admin/gorevler', label: 'Görevler & Takvim', icon: '🗓️', feature: 'tasks' },
  { href: '/admin/banners', label: "Slider / Duyuru Banner'ları", icon: '🖼️', feature: 'website' },
  { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: '💳', feature: 'recurring' },
  { href: '/admin/zakat', label: 'Zekât Ayarları', icon: '🪙' },
  { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: '🧩', permission: 'content_manage' },
  { href: '/admin/gorunum', label: 'Görünüm & Tema', icon: '🎨', permission: 'settings_manage' },
  { href: '/admin/medya', label: 'Medya Kütüphanesi', icon: '🖼️', permission: 'content_manage' },
  { href: '/admin/site-ayarlari', label: 'Site Ayarları', icon: '⚙️', permission: 'settings_manage' },
  { href: '/admin/odeme-sms', label: 'Ödeme & SMS Hesapları', icon: '🔐', permission: 'settings_manage' },
  { href: '/admin/integrations', label: 'Ayarlar / POS / API', icon: '🔌', permission: 'settings_manage' },
  { href: '/admin/users', label: 'Personel & Yetkiler', icon: '🛡️', feature: 'roles' },
  { href: '/admin/paket', label: 'Paket & Kullanım', icon: '📦' },
]

function navItemFor(pathname: string | null) {
  if (!pathname) return undefined
  return NAV_ITEMS
    .filter((item) => item.href !== '/admin' && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

// Admin panel'in kendi sabit markası (E-Medrese ile aynı zümrüt yeşili) — mevcut
// kiracının renklerinden bağımsız; `primary-*` sınıflarını burada geçersiz kılar.
const ADMIN_PRIMARY_VARS = {
  '--brand-primary-50': '#ECFDF5',
  '--brand-primary-100': '#D1FAE5',
  '--brand-primary-200': '#A7F3D0',
  '--brand-primary-300': '#6EE7B7',
  '--brand-primary-400': '#34D399',
  '--brand-primary-500': '#10B981',
  '--brand-primary-600': '#059669',
  '--brand-primary-700': '#047857',
  '--brand-primary-800': '#065F46',
  '--brand-primary-900': '#064E3B',
  '--brand-primary-950': '#022C22',
} as React.CSSProperties

type ThemeChoice = 'light' | 'dark' | 'system'
const THEME_KEY = 'einfak-admin-tema'
const THEME_LABELS: Record<ThemeChoice, string> = { light: '☀️ Açık', dark: '🌙 Koyu', system: '🖥️ Sistem' }

/** Panel teması: kullanıcının seçimi (tarayıcıda saklanır) ya da işletim sisteminin ayarı. */
function useAdminTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('light')
  const [systemDark, setSystemDark] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'light' || saved === 'dark' || saved === 'system') setChoice(saved)
    } catch {
      // storage unavailable: stay on light
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(query.matches)
    const onChange = () => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  const cycle = () => {
    const next: ThemeChoice = choice === 'light' ? 'dark' : choice === 'dark' ? 'system' : 'light'
    setChoice(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* ignore */ }
  }
  return { choice, dark: choice === 'dark' || (choice === 'system' && systemDark), cycle }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: user, isLoading } = useCurrentUser()
  const { data: access } = useAdminAccess()
  const logout = useLogout()
  const theme = useAdminTheme()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/giris')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className={`flex min-h-screen items-center justify-center bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={ADMIN_PRIMARY_VARS}>
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary-600/20 border-t-primary-600" />
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
    <div className={`flex min-h-screen bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={ADMIN_PRIMARY_VARS}>
      {/* Sidebar */}
      <aside className={`w-60 flex-shrink-0 text-[#8FA3B5] flex flex-col ${theme.dark ? 'bg-[#0B1220] border-e border-white/[0.06]' : 'bg-[#12202E]'}`}>
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.08]">
          <div className="h-9 w-9 rounded-[9px] flex items-center justify-center text-white font-extrabold text-base" style={{ background: 'linear-gradient(135deg,#059669,#34D399)' }}>
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
        <header className="h-[60px] flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex h-full items-center justify-between px-6">
            <h2 className="text-[16px] font-bold text-gray-900">
              Hoş geldiniz, {user.first_name}
            </h2>
            <div className="flex items-center gap-3.5">
              <button type="button" onClick={theme.cycle} title="Panel teması (Açık → Koyu → Sistem)"
                className="text-[13px] font-semibold border border-gray-200 px-3 py-2 rounded-lg text-gray-600 hover:border-primary-600 hover:text-primary-600 transition-colors">
                {THEME_LABELS[theme.choice]}
              </button>
              <Link href="/" className="text-[13px] font-semibold border border-gray-200 px-3.5 py-2 rounded-lg text-gray-600 hover:border-primary-600 hover:text-primary-600 transition-colors">
                Siteyi Görüntüle ↗
              </Link>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-[13px]">
                  {user.first_name?.[0]?.toUpperCase() || 'A'}
                </div>
                <span className="text-[13px] font-semibold text-gray-900">{user.first_name}</span>
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
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <div className="mb-3 text-4xl">{blockedFeature.icon}</div>
              <h1 className="mb-2 text-xl font-bold text-gray-900">{blockedFeature.label} paketinizde yok</h1>
              <p className="mb-6 text-sm text-gray-500">
                Kurumunuz şu anda <strong>{access?.plan_label}</strong> paketini kullanıyor. Bu modülü kullanmak için
                paketinizi yükseltebilir veya ek modül olarak açtırabilirsiniz.
              </p>
              <Link href="/admin/paket" className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
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
