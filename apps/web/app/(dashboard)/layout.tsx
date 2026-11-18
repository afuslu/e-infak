'use client'

import { useCurrentUser, useLogout } from '@e-infak/api-client'
import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Lock, type LucideIcon, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, X } from 'lucide-react'
import { UiHost } from '../../components/admin/ui'
import { groupOf, NAV_GROUPS, navItemFor, type NavItem, searchKey } from '../../components/admin/admin-nav'
import { AdminCommandPalette, AdminNotificationsBell, AdminProfileMenu } from '../../components/admin/AdminShellWidgets'
import { hasFeature, hasModule, hasPermission, useAdminAccess, v1Get, adminGet } from '../../lib/admin-access'

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

  // Temporary password (new account or reset by someone else): only /admin/sifre is open.
  // Platform support sessions are exempt, as on the server.
  const [support, setSupport] = useState(false)
  useEffect(() => {
    try { setSupport(sessionStorage.getItem('support_session') === '1') } catch { /* ignore */ }
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
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length)
  const blockedFeature = access && currentItem && !hasFeature(access, currentItem.feature) ? currentItem : undefined
  const blockedPermission = access && currentItem && !blockedFeature && !permitted(currentItem) ? currentItem : undefined
  const needle = searchKey(query.trim())
  const results = needle
    ? groups.flatMap((group) => group.items
      .filter((item) => searchKey(`${item.label} ${group.label}`).includes(needle))
      .map((item) => ({ item, group: group.label })))
    : []

  const roleLabel = access?.builtin_roles?.find((r) => r.key === access?.me?.role)?.label || access?.me?.role

  const itemLink = (item: NavItem, hint?: string) => {
    const active = currentItem?.href === item.href
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
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center rounded-lg py-2 text-[13.5px] font-semibold transition-colors ${
          collapsed ? 'lg:justify-center lg:px-2 px-3 gap-2.5' : 'gap-2.5 px-3'
        } ${itemTone}`}
      >
        <item.icon className="h-[18px] w-[18px] flex-shrink-0 opacity-90" strokeWidth={1.9} aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
        {hint && !collapsed && <span className={`flex-shrink-0 text-[10px] font-medium ${hintTone}`}>{hint}</span>}
        {!hint && !collapsed && active && !theme.dark && (
          <span className="h-4 w-[3px] flex-shrink-0 rounded-full bg-white/80" aria-hidden="true" />
        )}
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
      <aside className={`fixed inset-y-0 start-0 z-40 flex flex-shrink-0 flex-col transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        collapsed ? 'w-64 lg:w-[68px]' : 'w-64'
      } ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
      } ${theme.dark ? 'border-e border-white/[0.06] bg-[#0B1220] text-[#8FA3B5]' : 'border-e border-gray-200 bg-white text-gray-600'}`}>
        <div className={`flex items-center justify-between border-b py-4 ${
          theme.dark ? 'border-white/[0.08]' : 'border-gray-200'
        } ${collapsed ? 'px-4 lg:justify-center lg:px-2' : 'px-4'}`}>
          <Link href="/admin" className="flex items-center gap-2.5 min-w-0">
            <img
              src={siteBrand?.logo_url || '/images/e-infak/mark.png'}
              alt={siteBrand?.name || 'E-İnfak'}
              className={`h-9 w-9 shrink-0 rounded-[9px] ring-1 ${
                siteBrand?.logo_url
                  ? `object-contain p-1 ${theme.dark ? 'bg-white ring-white/15' : 'bg-gray-50 ring-gray-200'}`
                  : `object-cover ${theme.dark ? 'ring-white/15' : 'ring-gray-200'}`
              }`}
            />
            <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <div className={`truncate font-extrabold text-[15px] tracking-wide ${theme.dark ? 'text-white' : 'text-gray-900'}`}>{siteBrand?.name || 'E-İNFAK'}</div>
              <div className={`text-[10px] tracking-[1.2px] ${theme.dark ? 'text-[#5F7488]' : 'text-gray-400'}`}>E-İNFAK OTOMASYONU</div>
            </div>
          </Link>
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Menüyü kapat"
            className={`flex h-8 w-8 items-center justify-center rounded-lg lg:hidden ${
              theme.dark ? 'text-[#8FA3B5] hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {!collapsed && (
            <button type="button" onClick={toggleCollapsed} title="Menüyü daralt" aria-label="Menüyü daralt"
              className={`hidden h-7 w-7 items-center justify-center rounded-md lg:flex ${
                theme.dark ? 'text-[#5F7488] hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
              }`}>
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="hidden justify-center pt-2.5 lg:flex">
            <button type="button" onClick={toggleCollapsed} title="Menüyü genişlet" aria-label="Menüyü genişlet"
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                theme.dark ? 'text-[#5F7488] hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
              }`}>
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className={`px-3 pt-3 ${collapsed ? 'lg:hidden' : ''}`}>
          <div className="relative">
            <Search className={`pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
              theme.dark ? 'text-[#5F7488]' : 'text-gray-400'
            }`} aria-hidden="true" />
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

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {needle && !collapsed ? (
            <div className="flex flex-col gap-0.5">
              {results.map(({ item, group }) => itemLink(item, group))}
              {results.length === 0 && <p className={`px-3 py-6 text-center text-[12.5px] ${theme.dark ? 'text-[#5F7488]' : 'text-gray-400'}`}>“{query.trim()}” için sonuç yok.</p>}
            </div>
          ) : collapsed ? (
            <div className="hidden flex-col gap-2 lg:flex">
              {groups.map((group, gi) => (
                <div
                  key={group.key}
                  className={`flex flex-col gap-1 ${gi > 0 ? `border-t pt-2 ${theme.dark ? 'border-white/[0.06]' : 'border-gray-100'}` : ''}`}
                >
                  {group.items.map((item) => itemLink(item))}
                </div>
              ))}
            </div>
          ) : null}

          <div className={collapsed ? 'lg:hidden' : ''}>
            {!needle && groups.map((group) => {
              const isOpen = menu.open.includes(group.key)
              return (
                <div key={group.key} className="mb-1">
                  <button type="button" onClick={() => menu.toggle(group.key)} aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-[10.5px] font-bold uppercase tracking-[1.2px] ${
                      theme.dark ? 'text-[#5F7488] hover:text-white' : 'text-gray-400 hover:text-gray-700'
                    }`}>
                    <span>{group.label}</span>
                    <span className="flex items-center gap-1.5">
                      {!isOpen && <span className={`rounded-full px-1.5 text-[10px] font-semibold tracking-normal ${theme.dark ? 'bg-white/[0.08]' : 'bg-gray-100 text-gray-500'}`}>{group.items.length}</span>}
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

        <div className={`border-t px-4 py-3.5 text-[11px] ${
          theme.dark ? 'border-white/[0.08] text-[#5F7488]' : 'border-gray-200 text-gray-500'
        } ${collapsed ? 'lg:hidden' : ''}`}>
          {access ? (
            <Link href="/admin/paket" className={`block truncate ${theme.dark ? 'hover:text-white' : 'hover:text-gray-900'}`}>
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
    </div>
  )
}
