'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Lock, type LucideIcon, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, X } from 'lucide-react'
import { UiHost } from '../../components/admin/ui'
import { groupOf, NAV_GROUPS, navItemFor, type NavItem, searchKey } from '../../components/admin/admin-nav'
import { AdminCommandPalette, AdminNotificationsBell, AdminProfileMenu } from '../../components/admin/AdminShellWidgets'
import { hasFeature, hasPermission, useAdminAccess } from '../../lib/admin-access'

const MENU_KEY = 'einfak-admin-menu'
const COLLAPSE_KEY = 'einfak-admin-sidebar-collapsed'
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
// In dark mode the light tints (50–200) come from .admin-dark (globals.css); an inline value would win over it.
const ADMIN_PRIMARY_VARS_DARK = Object.fromEntries(
  Object.entries(ADMIN_PRIMARY_VARS).filter(([key]) => !/-(50|100|200)$/.test(key)),
) as React.CSSProperties

type ThemeChoice = 'light' | 'dark' | 'system'
const THEME_KEY = 'einfak-admin-tema'
const THEME_LABELS: Record<ThemeChoice, [LucideIcon, string]> = { light: [Sun, 'Açık'], dark: [Moon, 'Koyu'], system: [Monitor, 'Sistem'] }

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Panel teması: kullanıcının seçimi (tarayıcıda saklanır) ya da işletim sisteminin ayarı. */
function useAdminTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('light')
  const [systemDark, setSystemDark] = useState(false)
  useIsomorphicLayoutEffect(() => {
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    } catch {
      // ignore
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Update browser tab title to match the active admin page.
  useEffect(() => {
    document.title = currentItem ? `${currentItem.label} · E-İnfak` : 'Yönetim Paneli · E-İnfak'
  }, [currentItem])

  // Phone: the menu closes once a page is chosen.
  useEffect(() => {
    setDrawerOpen(false)
    setQuery('')
  }, [pathname])

  // Ctrl/⌘+K opens the command palette from anywhere in the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
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
      <div className={`flex min-h-screen items-center justify-center bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={theme.dark ? ADMIN_PRIMARY_VARS_DARK : ADMIN_PRIMARY_VARS}>
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

  const roleLabel = access?.builtin_roles?.find((r) => r.key === access?.me?.role)?.label || access?.me?.role

  const itemLink = (item: NavItem, hint?: string) => {
    const active = currentItem?.href === item.href
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center rounded-lg py-2 text-[13.5px] font-semibold transition-colors ${
          collapsed ? 'lg:justify-center lg:px-2 px-3 gap-2.5' : 'gap-2.5 px-3'
        } ${
          active ? 'bg-emerald-500/15 text-white shadow-[inset_3px_0_0_#34D399]' : 'text-[#8FA3B5] hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <item.icon className="h-[18px] w-[18px] flex-shrink-0 opacity-90" strokeWidth={1.9} aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
        {hint && !collapsed && <span className="flex-shrink-0 text-[10px] font-medium text-[#5F7488]">{hint}</span>}
      </Link>
    )
  }

  return (
    <div className={`flex min-h-screen bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={theme.dark ? ADMIN_PRIMARY_VARS_DARK : ADMIN_PRIMARY_VARS}>
      {drawerOpen && (
        <button type="button" aria-label="Menüyü kapat" onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden" />
      )}

      {/* Sidebar: fixed drawer on phones, collapsible column from lg up */}
      <aside className={`fixed inset-y-0 start-0 z-40 flex flex-shrink-0 flex-col text-[#8FA3B5] transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        collapsed ? 'w-64 lg:w-[68px]' : 'w-64'
      } ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
      } ${theme.dark ? 'bg-[#0B1220] border-e border-white/[0.06]' : 'bg-[#12202E]'}`}>
        <div className={`flex items-center justify-between border-b border-white/[0.08] py-4 ${collapsed ? 'px-4 lg:justify-center lg:px-2' : 'px-4'}`}>
          <Link href="/admin" className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-[9px] flex items-center justify-center text-white font-extrabold text-base" style={{ background: 'linear-gradient(135deg,#059669,#34D399)' }}>
              e
            </div>
            <div className={collapsed ? 'lg:hidden' : ''}>
              <div className="text-white font-extrabold text-[16px] tracking-wide">E-İNFAK</div>
              <div className="text-[10px] tracking-[1.5px] text-[#5F7488]">DERNEK OTOMASYONU</div>
            </div>
          </Link>
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Menüyü kapat"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8FA3B5] hover:bg-white/10 hover:text-white lg:hidden">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {!collapsed && (
            <button type="button" onClick={toggleCollapsed} title="Menüyü daralt" aria-label="Menüyü daralt"
              className="hidden h-7 w-7 items-center justify-center rounded-md text-[#5F7488] hover:bg-white/10 hover:text-white lg:flex">
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="hidden justify-center pt-2.5 lg:flex">
            <button type="button" onClick={toggleCollapsed} title="Menüyü genişlet" aria-label="Menüyü genişlet"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5F7488] hover:bg-white/10 hover:text-white">
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className={`px-3 pt-3 ${collapsed ? 'lg:hidden' : ''}`}>
          <div className="relative">
            <input
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
          {needle && !collapsed ? (
            <div className="flex flex-col gap-0.5">
              {results.map(({ item, group }) => itemLink(item, group))}
              {results.length === 0 && <p className="px-3 py-6 text-center text-[12.5px] text-[#5F7488]">“{query.trim()}” için sonuç yok.</p>}
            </div>
          ) : collapsed ? (
            <div className="hidden flex-col gap-1 lg:flex">
              {groups.flatMap((group) => group.items).map((item) => itemLink(item))}
            </div>
          ) : null}

          <div className={collapsed ? 'lg:hidden' : ''}>
            {!needle && groups.map((group) => {
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
          </div>
        </nav>

        <div className={`border-t border-white/[0.08] px-4 py-3.5 text-[11px] text-[#5F7488] ${collapsed ? 'lg:hidden' : ''}`}>
          {access ? (
            <Link href="/admin/paket" className="block truncate hover:text-white">
              {access.plan_label} paket · {access.usage.users}/{access.limits.users} kullanıcı
            </Link>
          ) : (
            <span>E-İnfak Yönetim</span>
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
            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-2.5">
              <button type="button" onClick={() => setPaletteOpen(true)} title="Hızlı arama (Ctrl/⌘ + K)"
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:border-primary-600 hover:text-gray-900">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Hızlı git…</span>
                <kbd className="hidden rounded border border-gray-200 px-1.5 text-[10px] font-semibold text-gray-400 lg:inline">⌘K</kbd>
              </button>
              <AdminNotificationsBell />
              <button type="button" onClick={theme.cycle} title="Panel teması (Açık → Koyu → Sistem)"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600">
                <ThemeIcon className="h-4 w-4" aria-hidden="true" /><span className="hidden xl:inline">{themeLabel}</span>
              </button>
              <Link href="/" className="hidden items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600 sm:flex">
                Siteyi Görüntüle <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <AdminProfileMenu
                firstName={user.first_name}
                lastName={user.last_name}
                email={user.email}
                roleLabel={roleLabel}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-clip min-w-0">
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
      <AdminCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        groups={groups}
        onCycleTheme={theme.cycle}
      />
      <UiHost />
    </div>
  )
}
