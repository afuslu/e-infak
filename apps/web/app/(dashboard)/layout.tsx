'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronsLeft, ChevronsRight, ExternalLink, Lock, type LucideIcon, Monitor, Moon, Search, Sun, X } from 'lucide-react'
import { UiHost } from '../../components/admin/ui'
import { IncomingCallPopup } from '../../components/admin/IncomingCallPopup'
import { groupOf, NAV_RAIL, navItemFor, type NavItem, type NavRail, railOf, searchKey } from '../../components/admin/admin-nav'
import { AdminCommandPalette, AdminNotificationsBell, AdminProfileMenu } from '../../components/admin/AdminShellWidgets'
import SimulationBanner from '../../components/admin/SimulationBanner'
import { exitSimulation, getSimulation, renewSimulation } from '../../lib/simulation'
import { hasFeature, hasModule, hasPermission, useAdminAccess, v1Get, adminGet } from '../../lib/admin-access'

const COLLAPSE_KEY = 'einfak-admin-sidebar-collapsed'

/** Reports the query string; Suspense keeps useSearchParams from forcing the whole layout client-only. */
function SearchWatcher({ onChange }: { onChange: (search: string) => void }) {
  const params = useSearchParams()
  const search = params.toString()
  useEffect(() => { onChange(search) }, [search, onChange])
  return null
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
  const { data: siteBrandRes } = useQuery({
    queryKey: ['admin-site-brand'],
    queryFn: () => v1Get<{ name?: string; logo_url?: string | null }>('/public/site'),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const { data: platformNotices } = useQuery({
    queryKey: ['admin-platform-notices'],
    queryFn: async () => (await adminGet<{ id: string; title: string; message: string; level: string; maintenance_mode: boolean }[]>('/platform-notices')).data,
    staleTime: 5 * 60_000,
    retry: false,
    enabled: !!user,
  })
  const siteBrand = siteBrandRes?.data
  const logout = useLogout()
  const theme = useAdminTheme()
  const [search, setSearch] = useState('')
  const currentItem = navItemFor(pathname, search)
  const currentGroup = groupOf(currentItem)
  const currentRail = railOf(currentItem)
  const [openRail, setOpenRail] = useState<string | undefined>(currentRail?.key)
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  /** Sub-panel hidden: only the icon rail shows. */
  const [collapsed, setCollapsed] = useState(false)

  // The sub-panel follows the page being viewed.
  useEffect(() => { setOpenRail(currentRail?.key) }, [currentRail?.key])

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    } catch {
      // ignore
    }
  }, [])

  const setPanelHidden = (next: boolean) => {
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
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
      // Kurum simülasyonu: an expired token is renewed from the platform session, else back to it.
      if (getSimulation()) {
        renewSimulation().then((token) => (token ? window.location.reload() : exitSimulation()))
        return
      }
      router.push('/giris')
    }
  }, [user, isLoading, router])

  // Temporary password (new account or reset by someone else): only /admin/sifre is open.
  // Platform support sessions are exempt, as on the server.
  const [support, setSupport] = useState(false)
  useEffect(() => {
    try { setSupport(sessionStorage.getItem('support_session') === '1' || !!getSimulation()) } catch { /* ignore */ }
  }, [])
  const mustChangePassword = !!user?.must_change_password && !support
  useEffect(() => {
    if (mustChangePassword && pathname !== '/admin/sifre') router.replace('/admin/sifre')
  }, [mustChangePassword, pathname, router])

  if (isLoading) {
    return (
      <div className={`flex min-h-screen bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={theme.dark ? ADMIN_PRIMARY_VARS_DARK : ADMIN_PRIMARY_VARS}>
        <aside className={`hidden w-64 shrink-0 border-e p-4 lg:block ${theme.dark ? 'border-white/[0.06] bg-[#0B1220]' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-3 pb-4">
            <div className={`h-9 w-9 animate-pulse rounded-lg ${theme.dark ? 'bg-white/10' : 'bg-gray-200'}`} />
            <div className="space-y-1.5">
              <div className={`h-3.5 w-24 animate-pulse rounded ${theme.dark ? 'bg-white/10' : 'bg-gray-200'}`} />
              <div className={`h-2.5 w-20 animate-pulse rounded ${theme.dark ? 'bg-white/5' : 'bg-gray-100'}`} />
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`h-9 animate-pulse rounded-lg ${theme.dark ? 'bg-white/[0.05]' : 'bg-gray-100'}`} />
            ))}
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <div className={`h-[60px] border-b px-6 flex items-center justify-between ${theme.dark ? 'border-white/[0.06] bg-[#0F172A]' : 'border-gray-200 bg-white'}`}>
            <div className={`h-4 w-36 animate-pulse rounded ${theme.dark ? 'bg-white/10' : 'bg-gray-200'}`} />
            <div className={`h-8 w-28 animate-pulse rounded-lg ${theme.dark ? 'bg-white/10' : 'bg-gray-100'}`} />
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-primary-600/20 border-t-primary-600" />
              <p className={`text-sm font-medium ${theme.dark ? 'text-[#8FA3B5]' : 'text-gray-500'}`}>Panel yükleniyor…</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (mustChangePassword) {
    return (
      <div className={`min-h-screen bg-gray-100 px-4 py-10 ${theme.dark ? 'admin-dark' : ''}`} style={theme.dark ? ADMIN_PRIMARY_VARS_DARK : ADMIN_PRIMARY_VARS}>
        <div className="mx-auto max-w-lg space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Geçici şifreyle giriş yaptınız.</p>
            <p className="mt-1">Panele devam etmek için önce kendi şifrenizi belirleyin.</p>
          </div>
          {pathname === '/admin/sifre' ? children : null}
          <button type="button" onClick={() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); window.location.href = '/giris' }}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800">Çıkış yap</button>
        </div>
        <div id="admin-portal" />
      </div>
    )
  }

  const handleLogout = async () => {
    // Simulation: back to the platform console; the organisation admin's sessions stay open.
    if (getSimulation()) {
      exitSimulation()
      return
    }
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
  const permitted = (item: NavItem) => hasPermission(access, item.permission) && hasModule(access, item.module)
  // Menu entries appear once access is known; a page is only reported blocked after that too.
  const allowed = (item: NavItem) => !!access && hasFeature(access, item.feature) && permitted(item)
  const rails: NavRail[] = NAV_RAIL
    .map((rail) => ({
      ...rail,
      sections: rail.sections
        .map((section) => ({ ...section, items: section.items.filter(allowed) }))
        .filter((section) => section.items.length),
    }))
    .filter((rail) => rail.sections.length)
  const groups = rails.map((rail) => ({ key: rail.key, label: rail.label, items: rail.sections.flatMap((s) => s.items) }))
  const blockedFeature = access && currentItem && !hasFeature(access, currentItem.feature) ? currentItem : undefined
  const blockedPermission = access && currentItem && !blockedFeature && !permitted(currentItem) ? currentItem : undefined
  const needle = searchKey(query.trim())
  const results = needle
    ? groups.flatMap((group) => group.items
      .filter((item) => searchKey(`${item.label} ${group.label}`).includes(needle))
      .map((item) => ({ item, group: group.label })))
    : []
  const shownRail = rails.find((rail) => rail.key === openRail) ?? rails.find((rail) => rail.key === currentRail?.key)
  // The sub-panel shows on phones always; from lg up the user may hide it.
  // Single-page icons (Anasayfa, Takvim…) have nothing to list beside them.
  const panelVisible = !!needle || (!!shownRail && shownRail.sections.flatMap((s) => s.items).length > 1)

  const roleLabel = access?.builtin_roles?.find((r) => r.key === access?.me?.role)?.label || access?.me?.role

  const itemLink = (item: NavItem, hint?: string) => {
    const active = currentItem === item
    const itemTone = theme.dark
      ? active
        ? 'bg-emerald-500/15 text-white shadow-[inset_3px_0_0_#34D399]'
        : 'text-[#8FA3B5] hover:bg-white/[0.06] hover:text-white'
      : active
        ? 'bg-primary-600 text-white shadow-sm'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    const hintTone = theme.dark ? 'text-[#5F7488]' : active ? 'text-white/80' : 'text-gray-400'

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${itemTone}`}
      >
        <item.icon className="h-[18px] w-[18px] flex-shrink-0 opacity-90" strokeWidth={1.9} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {hint && <span className={`flex-shrink-0 text-[10px] font-medium ${hintTone}`}>{hint}</span>}
      </Link>
    )
  }

  // A rail icon with a single page opens it; one with several shows its sub-panel.
  const onRailClick = (rail: NavRail) => {
    const items = rail.sections.flatMap((s) => s.items)
    setQuery('')
    if (items.length === 1) {
      setOpenRail(rail.key)
      router.push(items[0].href)
      return
    }
    if (openRail === rail.key && !collapsed) {
      setPanelHidden(true)
      return
    }
    setOpenRail(rail.key)
    setPanelHidden(false)
  }

  const railTone = (active: boolean) => theme.dark
    ? active ? 'bg-emerald-500/15 text-white' : 'text-[#8FA3B5] hover:bg-white/[0.06] hover:text-white'
    : active ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
  const line = theme.dark ? 'border-white/[0.08]' : 'border-gray-200'
  const muted = theme.dark ? 'text-[#5F7488]' : 'text-gray-400'

  return (
    <div className={`flex min-h-screen bg-gray-100 ${theme.dark ? 'admin-dark' : ''}`} style={theme.dark ? ADMIN_PRIMARY_VARS_DARK : ADMIN_PRIMARY_VARS}>
      <Suspense fallback={null}><SearchWatcher onChange={setSearch} /></Suspense>
      {drawerOpen && (
        <button type="button" aria-label="Menüyü kapat" onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden" />
      )}

      {/* Sidebar (STK PRO layout): icon rail + sub-panel. Fixed drawer on phones, sticky from lg up. */}
      <aside className={`fixed inset-y-0 start-0 z-40 flex flex-shrink-0 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
      } ${theme.dark ? 'bg-[#0B1220] text-[#8FA3B5]' : 'bg-white text-gray-600'}`}>
        {/* Icon rail */}
        <nav aria-label="Ana menü" className={`flex w-[76px] flex-shrink-0 flex-col items-center border-e ${line}`}>
          <Link href="/admin" title={siteBrand?.name || 'E-İnfak'} className={`flex h-[60px] w-full flex-shrink-0 items-center justify-center border-b ${line}`}>
            <img
              src={siteBrand?.logo_url || '/images/e-infak/mark.png'}
              alt={siteBrand?.name || 'E-İnfak'}
              className={`h-9 w-9 rounded-[9px] ring-1 ${
                siteBrand?.logo_url
                  ? `object-contain p-1 ${theme.dark ? 'bg-white ring-white/15' : 'bg-gray-50 ring-gray-200'}`
                  : `object-cover ${theme.dark ? 'ring-white/15' : 'ring-gray-200'}`
              }`}
            />
          </Link>
          <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 py-2.5">
            {rails.map((rail) => {
              const active = currentRail?.key === rail.key
              const shown = shownRail?.key === rail.key && !collapsed
              return (
                <div key={rail.key} className="flex w-full flex-col items-center">
                  {rail.divider && <div className={`mx-auto mb-1 w-9 border-t ${line}`} aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => onRailClick(rail)}
                    aria-current={active ? 'page' : undefined}
                    aria-expanded={rail.sections.flatMap((s) => s.items).length > 1 ? shown : undefined}
                    className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10.5px] font-semibold leading-tight transition-colors ${railTone(active || shown)}`}
                  >
                    <rail.icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                    <span className="w-full truncate text-center">{rail.label}</span>
                  </button>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={() => setPanelHidden(!collapsed)}
            title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'} aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            className={`mb-2 hidden w-[64px] flex-col items-center gap-0.5 rounded-lg py-2 text-[10.5px] font-semibold lg:flex ${railTone(false)}`}>
            {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4" aria-hidden="true" />}
            {collapsed ? 'Genişlet' : 'Daralt'}
          </button>
        </nav>

        {/* Sub-panel */}
        <div className={`w-60 flex-col border-e ${line} ${panelVisible ? 'flex' : 'hidden'} ${collapsed ? 'lg:hidden' : ''}`}>
          <div className={`flex h-[60px] flex-shrink-0 items-center justify-between gap-2 border-b px-4 ${line}`}>
            <div className="flex min-w-0 items-center gap-2">
              {shownRail && <shownRail.icon className={`h-[18px] w-[18px] flex-shrink-0 ${theme.dark ? 'text-emerald-400' : 'text-primary-600'}`} aria-hidden="true" />}
              <span className={`truncate text-[15px] font-bold ${theme.dark ? 'text-white' : 'text-gray-900'}`}>{needle ? 'Arama' : shownRail?.label}</span>
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Menüyü kapat"
              className={`flex h-8 w-8 items-center justify-center rounded-lg lg:hidden ${theme.dark ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-gray-100 hover:text-gray-900'}`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPanelHidden(true)} title="Paneli kapat" aria-label="Paneli kapat"
              className={`hidden h-7 w-7 items-center justify-center rounded-md lg:flex ${theme.dark ? 'text-[#5F7488] hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}>
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="px-3 pt-3">
            <div className="relative">
              <Search className={`pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${muted}`} aria-hidden="true" />
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
                className={`admin-menu-search w-full rounded-lg border py-2 ps-8 pe-12 text-[13px] outline-none ${
                  theme.dark
                    ? 'border-white/10 bg-white/[0.06] text-white placeholder-[#5F7488] focus:border-emerald-400/60'
                    : 'border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:bg-white'
                }`}
              />
              {!query && (
                <kbd className={`pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] lg:block ${
                  theme.dark ? 'border-white/10 text-[#5F7488]' : 'border-gray-200 bg-white text-gray-400'
                }`}>Ctrl K</kbd>
              )}
            </div>
          </div>

          <nav aria-label={shownRail?.label || 'Alt menü'} className="flex-1 overflow-y-auto px-2.5 py-3">
            {needle ? (
              <div className="flex flex-col gap-0.5">
                {results.map(({ item, group }) => itemLink(item, group))}
                {results.length === 0 && <p className={`px-3 py-6 text-center text-[12.5px] ${muted}`}>“{query.trim()}” için sonuç yok.</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {shownRail?.sections.map((section, si) => (
                  <div key={section.title || si} className="flex flex-col gap-0.5">
                    {section.title && (
                      <div className={`px-3 pb-1 text-[11px] font-semibold ${muted}`}>{section.title}</div>
                    )}
                    {section.items.map((item) => itemLink(item))}
                  </div>
                ))}
              </div>
            )}
          </nav>

          <div className={`border-t px-4 py-3.5 text-[11px] ${line} ${muted}`}>
            {access ? (
              <Link href="/admin/paket" className={`block truncate ${theme.dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>
                {access.plan_label} paket · {access.usage.users}/{access.limits.users} kullanıcı
              </Link>
            ) : (
              <span>E-İnfak Yönetim</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <SimulationBanner operatorEmail={(user as { impersonated_by?: { email?: string | null } | null }).impersonated_by?.email} />
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-[60px] flex-shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur-md">
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
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600 sm:flex"
              >
                Siteyi Görüntüle <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <AdminProfileMenu
                firstName={user.first_name}
                lastName={user.last_name}
                email={user.email}
                roleLabel={roleLabel}
                logoUrl={siteBrand?.logo_url}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-clip min-w-0">
          {platformNotices && platformNotices.length > 0 && (
            <div className="mb-5 space-y-2">
              {platformNotices.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    n.level === 'danger'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : n.level === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-blue-200 bg-blue-50 text-blue-900'
                  }`}
                >
                  <div className="font-bold">
                    {n.maintenance_mode ? 'Bakım Bildirimi: ' : ''}
                    {n.title}
                  </div>
                  <p className="mt-0.5 text-xs opacity-90">{n.message}</p>
                </div>
              ))}
            </div>
          )}
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
      <IncomingCallPopup />
    </div>
  )
}
