'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDownToLine, BarChart3, Beef, Blocks, BookOpen, Calculator, CalendarDays, Coins, Droplets, ExternalLink, FileText, FileUp, Film, FolderOpen, GraduationCap, HandCoins, HandHelping, HeartHandshake, Home, IdCard, Images, KeyRound, Landmark, LayoutDashboard, Lock, LogOut, MailPlus, Megaphone, Menu, MessagesSquare, Monitor, Moon, Newspaper, Package, PackageCheck, Palette, PiggyBank, Plug, Receipt, Repeat, Scale, Send, Settings, ShieldCheck, Sparkles, Sun, Tags, Users, Wallet, type LucideIcon } from 'lucide-react'
import { UiHost } from '../../components/admin/ui'
import { hasFeature, hasPermission, useAdminAccess } from '../../lib/admin-access'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  feature?: string
  permission?: string
}

interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// `feature`: package module (app/core/plans.py); `permission`: staff permission (app/api/deps.py).
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'genel', label: 'Genel', items: [
      { href: '/admin', label: 'Genel Bakış', icon: LayoutDashboard },
      { href: '/admin/raporlar', label: 'Raporlar', icon: BarChart3, feature: 'reports_basic', permission: 'report_read' },
      { href: '/admin/ai', label: 'AI Öngörüleri', icon: Sparkles, feature: 'reports_basic', permission: 'report_read' },
      { href: '/admin/gorevler', label: 'Görevler & Takvim', icon: CalendarDays, feature: 'tasks' },
    ],
  },
  {
    key: 'bagis', label: 'Bağış', items: [
      { href: '/admin/bagislar', label: 'Bağışlar', icon: HandCoins },
      { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: Megaphone },
      { href: '/admin/bagis-kalemleri', label: 'Bağış Kalemleri', icon: Tags },
      { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: Repeat, feature: 'recurring' },
      { href: '/admin/makbuzlar', label: 'Makbuzlar', icon: Receipt, feature: 'receipts' },
      { href: '/admin/makbuz-kocanlari', label: 'Makbuz Koçanları', icon: BookOpen, feature: 'receipts' },
      { href: '/admin/zakat', label: 'Zekât Ayarları', icon: Coins },
    ],
  },
  {
    key: 'kisiler', label: 'Bağışçılar & Üyeler', items: [
      { href: '/admin/bagiscilar', label: 'Bağışçılar (CRM)', icon: Users, feature: 'donor_crm' },
      { href: '/admin/uyeler', label: 'Üyeler & Aidat', icon: IdCard, feature: 'membership' },
      { href: '/admin/veri-aktarma', label: "Excel'den Aktarım", icon: FileUp, feature: 'donor_crm' },
    ],
  },
  {
    key: 'finans', label: 'Finans', items: [
      { href: '/admin/finance', label: 'Kasa & Giderler', icon: Wallet },
      { href: '/admin/muhasebe', label: 'Muhasebe', icon: Calculator, feature: 'accounting' },
      { href: '/admin/gelen-havaleler', label: 'Gelen Havaleler', icon: ArrowDownToLine, feature: 'bank_transactions' },
      { href: '/admin/banka-hesaplari', label: 'Banka Hesapları', icon: Landmark, feature: 'bank_transactions' },
      { href: '/admin/reconciliation', label: 'Banka Mutabakatı', icon: Scale, feature: 'bank_transactions' },
    ],
  },
  {
    key: 'saha', label: 'Saha & Organizasyon', items: [
      { href: '/admin/kurban', label: 'Kurban Organizasyonu', icon: Beef, feature: 'kurban' },
      { href: '/admin/sponsorluk', label: 'Sponsorluk & Burs', icon: HeartHandshake, feature: 'sponsorship' },
      { href: '/admin/students', label: 'Hafızlık Öğrencileri', icon: GraduationCap, feature: 'education' },
      { href: '/admin/wells', label: 'Su Kuyuları', icon: Droplets, feature: 'water_well' },
      { href: '/admin/kumbara', label: 'Kumbaralar', icon: PiggyBank, feature: 'money_box' },
      { href: '/admin/kumanya', label: 'Kumanya Dağıtım', icon: Package, feature: 'food_aid' },
      { href: '/admin/yoksul-takip', label: 'Yoksul Takibi', icon: Home, feature: 'poverty_tracking' },
    ],
  },
  {
    key: 'site', label: 'Web Sitesi', items: [
      { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: Blocks, permission: 'content_manage' },
      { href: '/admin/sayfalar', label: 'Sayfalar', icon: FileText, feature: 'website' },
      { href: '/admin/icerikler', label: 'Haber & Blog', icon: Newspaper, feature: 'website' },
      { href: '/admin/menu', label: 'Menü', icon: Menu, feature: 'website' },
      { href: '/admin/banners', label: "Slider / Duyuru Banner'ları", icon: Images, feature: 'website' },
      { href: '/admin/galeri', label: 'Foto & Video Galeri', icon: Film, feature: 'website' },
      { href: '/admin/medya', label: 'Medya Kütüphanesi', icon: FolderOpen, permission: 'content_manage' },
      { href: '/admin/gorunum', label: 'Görünüm & Tema', icon: Palette, permission: 'settings_manage' },
      { href: '/admin/gonulluler', label: 'Gönüllü Başvuruları', icon: HandHelping, feature: 'website' },
    ],
  },
  {
    key: 'iletisim', label: 'İletişim', items: [
      { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: MessagesSquare, feature: 'sms' },
      { href: '/admin/sms-gonderimleri', label: 'SMS Gönderimleri', icon: Send, feature: 'sms' },
      { href: '/admin/sms', label: 'SMS Şablonları', icon: MailPlus, feature: 'sms' },
    ],
  },
  {
    key: 'ayarlar', label: 'Ayarlar', items: [
      { href: '/admin/site-ayarlari', label: 'Site Ayarları', icon: Settings, permission: 'settings_manage' },
      { href: '/admin/odeme-sms', label: 'Ödeme & SMS Hesapları', icon: KeyRound, permission: 'settings_manage' },
      { href: '/admin/integrations', label: 'Ayarlar / POS / API', icon: Plug, permission: 'settings_manage' },
      { href: '/admin/users', label: 'Personel & Yetkiler', icon: ShieldCheck, feature: 'roles' },
      { href: '/admin/paket', label: 'Paket & Kullanım', icon: PackageCheck },
    ],
  },
]

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

function navItemFor(pathname: string | null) {
  if (!pathname) return undefined
  if (pathname === '/admin') return NAV_ITEMS[0]
  return NAV_ITEMS
    .filter((item) => item.href !== '/admin' && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

const groupOf = (item?: NavItem) => (item ? NAV_GROUPS.find((group) => group.items.includes(item)) : undefined)

/** Search key: lower case without Turkish diacritics, so "bagis" finds "Bağış". */
const searchKey = (text: string) =>
  text.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const MENU_KEY = 'einfak-admin-menu'
const DEFAULT_OPEN = ['genel', 'bagis']

/** Which menu groups are open: the user's choice is remembered in the browser. */
function useOpenGroups(activeGroup?: string) {
  const [open, setOpen] = useState<string[]>(DEFAULT_OPEN)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MENU_KEY) || 'null')
      if (Array.isArray(saved)) setOpen(saved.filter((key) => typeof key === 'string'))
    } catch {
      // storage unavailable: keep the defaults
    }
  }, [])
  // The group of the page being viewed is always shown open.
  useEffect(() => {
    if (activeGroup) setOpen((current) => (current.includes(activeGroup) ? current : [...current, activeGroup]))
  }, [activeGroup])
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
      try { localStorage.setItem(MENU_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  return { open, toggle }
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
const THEME_LABELS: Record<ThemeChoice, [LucideIcon, string]> = { light: [Sun, 'Açık'], dark: [Moon, 'Koyu'], system: [Monitor, 'Sistem'] }

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
  const currentItem = navItemFor(pathname)
  const currentGroup = groupOf(currentItem)
  const menu = useOpenGroups(currentGroup?.key)
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Phone: the menu closes once a page is chosen.
  useEffect(() => {
    setDrawerOpen(false)
    setQuery('')
  }, [pathname])

  // Ctrl/⌘+K jumps to the menu search from anywhere in the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setDrawerOpen(true)
        // the drawer becomes focusable after this render
        setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const [ThemeIcon, themeLabel] = THEME_LABELS[theme.choice]
  const allowed = (item: NavItem) => hasFeature(access, item.feature) && hasPermission(access, item.permission)
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length)
  const blockedFeature = currentItem && !hasFeature(access, currentItem.feature) ? currentItem : undefined
  const blockedPermission = currentItem && !blockedFeature && !hasPermission(access, currentItem.permission) ? currentItem : undefined
  const needle = searchKey(query.trim())
  const results = needle
    ? groups.flatMap((group) => group.items
      .filter((item) => searchKey(`${item.label} ${group.label}`).includes(needle))
      .map((item) => ({ item, group: group.label })))
    : []

  const itemLink = (item: NavItem, hint?: string) => {
    const active = currentItem?.href === item.href
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${
          active ? 'bg-emerald-500/15 text-white shadow-[inset_3px_0_0_#34D399]' : 'text-[#8FA3B5] hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <item.icon className="h-[18px] w-[18px] flex-shrink-0 opacity-90" strokeWidth={1.9} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {hint && <span className="flex-shrink-0 text-[10px] font-medium text-[#5F7488]">{hint}</span>}
      </Link>
    )
  }

  return (
    <div className={`flex min-h-screen bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={ADMIN_PRIMARY_VARS}>
      {drawerOpen && (
        <button type="button" aria-label="Menüyü kapat" onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden" />
      )}

      {/* Sidebar: fixed drawer on phones, static column from lg up */}
      <aside className={`fixed inset-y-0 start-0 z-40 flex w-64 flex-shrink-0 flex-col text-[#8FA3B5] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
      } ${theme.dark ? 'bg-[#0B1220] border-e border-white/[0.06]' : 'bg-[#12202E]'}`}>
        <Link href="/admin" className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.08]">
          <div className="h-9 w-9 rounded-[9px] flex items-center justify-center text-white font-extrabold text-base" style={{ background: 'linear-gradient(135deg,#059669,#34D399)' }}>
            e
          </div>
          <div>
            <div className="text-white font-extrabold text-[16px] tracking-wide">E-İNFAK</div>
            <div className="text-[10px] tracking-[1.5px] text-[#5F7488]">DERNEK OTOMASYONU</div>
          </div>
        </Link>

        <div className="px-3 pt-3">
          <div className="relative">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && results[0]) router.push(results[0].item.href)
                if (event.key === 'Escape') setQuery('')
              }}
              placeholder="Menüde ara…"
              aria-label="Menüde ara"
              className="admin-menu-search w-full rounded-lg border border-white/10 bg-white/[0.06] py-2 ps-3 pe-12 text-[13px] text-white placeholder-[#5F7488] outline-none focus:border-emerald-400/60"
            />
            {!query && (
              <kbd className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 px-1.5 text-[10px] text-[#5F7488] lg:block">Ctrl K</kbd>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {needle ? (
            <div className="flex flex-col gap-0.5">
              {results.map(({ item, group }) => itemLink(item, group))}
              {results.length === 0 && <p className="px-3 py-6 text-center text-[12.5px] text-[#5F7488]">“{query.trim()}” için sonuç yok.</p>}
            </div>
          ) : groups.map((group) => {
            const isOpen = menu.open.includes(group.key)
            return (
              <div key={group.key} className="mb-1">
                <button type="button" onClick={() => menu.toggle(group.key)} aria-expanded={isOpen}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[10.5px] font-bold uppercase tracking-[1.2px] text-[#5F7488] hover:text-white">
                  <span>{group.label}</span>
                  <span className="flex items-center gap-1.5">
                    {!isOpen && <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold tracking-normal">{group.items.length}</span>}
                    <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                      <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
                    </svg>
                  </span>
                </button>
                {isOpen && <div className="flex flex-col gap-0.5">{group.items.map((item) => itemLink(item))}</div>}
              </div>
            )
          })}
        </nav>
        <div className="px-4 py-3.5 border-t border-white/[0.08] text-[11px] text-[#5F7488]">
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
        <header className="sticky top-0 z-20 h-[60px] flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Menüyü aç"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 lg:hidden">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M3 5.5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 4.5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 3.5a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H4Z" />
                </svg>
              </button>
              <div className="min-w-0">
                {currentItem && currentItem.href !== '/admin' ? (
                  <>
                    <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-400">{currentGroup?.label}</div>
                    <h2 className="truncate text-[16px] font-bold leading-tight text-gray-900">{currentItem.label}</h2>
                  </>
                ) : (
                  <h2 className="truncate text-[16px] font-bold text-gray-900">Hoş geldiniz, {user.first_name}</h2>
                )}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
              <button type="button" onClick={theme.cycle} title="Panel teması (Açık → Koyu → Sistem)"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600">
                <ThemeIcon className="h-4 w-4" aria-hidden="true" /><span className="hidden xl:inline">{themeLabel}</span>
              </button>
              <Link href="/" className="hidden items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600 sm:flex">
                Siteyi Görüntüle <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link href="/admin/sifre" title="Şifremi değiştir" className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-gray-50">
                <div className="h-8 w-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-[13px]">
                  {user.first_name?.[0]?.toUpperCase() || 'A'}
                </div>
                <span className="hidden text-[13px] font-semibold text-gray-900 md:inline">{user.first_name}</span>
              </Link>
              <button type="button" onClick={handleLogout} title="Çıkış"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-red-300 hover:text-red-600">
                <LogOut className="h-4 w-4" aria-hidden="true" /><span className="hidden md:inline">Çıkış</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-auto min-w-0">
          {blockedFeature ? (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <blockedFeature.icon className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
              <h1 className="mb-2 text-xl font-bold text-gray-900">{blockedFeature.label} paketinizde yok</h1>
              <p className="mb-6 text-sm text-gray-500">
                Kurumunuz şu anda <strong>{access?.plan_label}</strong> paketini kullanıyor. Bu modülü kullanmak için
                paketinizi yükseltebilir veya ek modül olarak açtırabilirsiniz.
              </p>
              <Link href="/admin/paket" className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
                Paketleri karşılaştır
              </Link>
            </div>
          ) : blockedPermission ? (
            <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <Lock className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
              <h1 className="mb-2 text-xl font-bold text-gray-900">Erişim yetkiniz yok</h1>
              <p className="mb-6 text-sm text-gray-500">
                <strong>{blockedPermission.label}</strong> sayfasını görüntülemek için gerekli personel yetkisine sahip değilsiniz.
              </p>
              <Link href="/admin" className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
                Genel Bakış&apos;a dön
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      {/* Dialogs and messages render here so they inherit the panel theme. */}
      <div id="admin-portal" />
      <UiHost />
    </div>
  )
}
