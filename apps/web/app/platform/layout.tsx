'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Building2, History, Inbox, KeyRound, LifeBuoy, LogOut, Megaphone, Moon, PlusCircle, Search, Sun, Users, X, type LucideIcon } from 'lucide-react'
import OrgSimulateSwitcher from '../../components/platform/OrgSimulateSwitcher'
import { exitSimulation, getSimulation } from '../../lib/simulation'
import { PlatformMe, PlatformOrg, platformCall, platformError, platformToken, setPlatformToken } from '../../lib/platform-api'

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/platform', label: 'Kurumlar', icon: Building2 },
  { href: '/platform/yeni', label: 'Yeni kurum', icon: PlusCircle },
  { href: '/platform/metrikler', label: 'Metrikler', icon: BarChart3 },
  { href: '/platform/talepler', label: 'Demo talepleri', icon: Inbox },
  { href: '/platform/destek', label: 'Destek', icon: LifeBuoy },
  { href: '/platform/duyurular', label: 'Duyurular', icon: Megaphone },
  { href: '/platform/operatorler', label: 'Operatörler', icon: Users },
  { href: '/platform/kayitlar', label: 'İşlem kayıtları', icon: History },
]

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/platform/giris'
  const [me, setMe] = useState<PlatformMe | null>(null)
  const [error, setError] = useState('')
  const [newDemos, setNewDemos] = useState(0)
  const [openTickets, setOpenTickets] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [orgs, setOrgs] = useState<PlatformOrg[]>([])
  const [dark, setDark] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('einfak-platform-tema') === 'dark') setDark(true)
    } catch {
      // ignore
    }
  }, [])

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev
      try { localStorage.setItem('einfak-platform-tema', next ? 'dark' : 'light') } catch { /* ignore */ }
      return next
    })
  }

  const load = useCallback(() => {
    setError('')
    platformCall<PlatformMe>('get', '/me').then(setMe)
      .catch((err) => setError(platformError(err, 'Platform sunucusuna ulaşılamadı')))
  }, [])

  useEffect(() => {
    if (isLogin) return
    if (!platformToken()) {
      router.replace('/platform/giris')
      return
    }
    load()
  }, [isLogin, router, load])

  useEffect(() => {
    if (!me || me.must_change_password) return
    platformCall<{ status: string }[]>('get', '/demo-requests')
      .then((rows) => setNewDemos(rows.filter((r) => r.status === 'new').length))
      .catch(() => undefined)
    platformCall<{ status: string }[]>('get', '/tickets?status_filter=open')
      .then((rows) => setOpenTickets(rows.length))
      .catch(() => undefined)
    platformCall<PlatformOrg[]>('get', '/organizations')
      .then(setOrgs)
      .catch(() => undefined)
  }, [me])

  useEffect(() => {
    if (!me || me.must_change_password) return
    if (pathname === '/platform/talepler') {
      platformCall<{ status: string }[]>('get', '/demo-requests')
        .then((rows) => setNewDemos(rows.filter((r) => r.status === 'new').length))
        .catch(() => undefined)
    } else if (pathname === '/platform/destek') {
      platformCall<{ status: string }[]>('get', '/tickets?status_filter=open')
        .then((rows) => setOpenTickets(rows.length))
        .catch(() => undefined)
    }
  }, [me, pathname])

  useEffect(() => {
    if (isLogin) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        setPaletteQuery('')
        setPaletteIdx(0)
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isLogin])

  const paletteItems = useMemo(() => {
    const q = paletteQuery.trim().toLocaleLowerCase('tr')
    const matchedOrgs = orgs
      .filter((o) => !q || `${o.name} ${o.slug}`.toLocaleLowerCase('tr').includes(q))
      .slice(0, 6)
      .map((o) => ({ href: `/platform/kurum/${o.id}`, label: o.name, sub: `${o.slug} · ${o.plan_label}` }))
    const matchedNav = NAV
      .filter((n) => !q || n.label.toLocaleLowerCase('tr').includes(q))
      .map((n) => ({ href: n.href, label: n.label, sub: 'Platform sayfası' }))
    return [...matchedOrgs, ...matchedNav]
  }, [orgs, paletteQuery])

  // A temporary password must be replaced before anything else.
  const mustChange = !!me?.must_change_password
  useEffect(() => {
    if (mustChange && pathname !== '/platform/sifre') router.replace('/platform/sifre')
  }, [mustChange, pathname, router])

  if (isLogin) return <>{children}</>
  if (!me) {
    return (
      <div className={`min-h-screen ${dark ? 'admin-dark bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="h-14 border-b border-emerald-800/60 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900" />
        <div className="mx-auto max-w-6xl px-4 py-8">
          {error ? (
            <div className="max-w-md space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <p className="font-semibold">{error}</p>
              <button type="button" onClick={load} className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Tekrar dene</button>
            </div>
          ) : (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 w-48 rounded-lg bg-slate-200" />
              <div className="h-48 rounded-2xl border border-slate-200 bg-white" />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${dark ? 'admin-dark bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className="sticky top-0 z-30 border-b border-emerald-800/60 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-2.5 sm:px-6">
          <Link href="/platform" className="flex shrink-0 items-center gap-2 pe-1 font-extrabold tracking-tight text-white whitespace-nowrap">
            <img src="/images/e-infak/mark.png" alt="E-İnfak" className="h-7 w-7 rounded-lg object-cover ring-1 ring-white/20" />
            <span className="hidden sm:inline">E‑İnfak Platform</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 xl:order-3">
            {!mustChange && <OrgSimulateSwitcher orgs={orgs.length ? orgs : undefined} label="Simüle et" />}
            {!mustChange && (
              <button
                type="button"
                onClick={() => { setPaletteOpen(true); setPaletteQuery(''); setPaletteIdx(0) }}
                title="Hızlı ara (⌘K)"
                aria-label="Hızlı ara"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/15 hover:text-white"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <kbd className="hidden rounded bg-white/10 px-1 text-[10px] sm:inline">⌘K</kbd>
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              title={dark ? 'Açık tema' : 'Koyu tema'}
              aria-label="Tema değiştir"
              className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/15 hover:text-white"
            >
              {dark ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            <Link
              href="/platform/sifre"
              title={`${me.email} — Şifre değiştir`}
              aria-label="Şifre değiştir"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <KeyRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span className="hidden 2xl:inline">{me.email}</span>
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/15 hover:text-white"
              onClick={() => { if (getSimulation()) exitSimulation(false); setPlatformToken(null); setMe(null); router.replace('/platform/giris') }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
          {!mustChange && (
            <nav className="hidden min-w-0 flex-1 flex-nowrap items-center justify-center gap-0.5 overflow-x-auto text-sm xl:order-2 xl:flex">
              {NAV.map((item) => {
                const active = item.href === '/platform' ? pathname === '/platform' || pathname.startsWith('/platform/kurum/') : pathname === item.href
                const badgeCount = item.href === '/platform/talepler' ? newDemos : item.href === '/platform/destek' ? openTickets : 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] transition ${
                      active ? 'bg-emerald-500/25 font-semibold text-white ring-1 ring-emerald-400/30 shadow-xs' : 'text-emerald-100/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 opacity-85" aria-hidden="true" />
                    <span>{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-950">
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
        {!mustChange && (
          <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-4 py-2 text-xs xl:hidden">
            {NAV.map((item) => {
              const active = item.href === '/platform' ? pathname === '/platform' || pathname.startsWith('/platform/kurum/') : pathname === item.href
              const badgeCount = item.href === '/platform/talepler' ? newDemos : item.href === '/platform/destek' ? openTickets : 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 transition ${
                    active ? 'bg-white/15 font-semibold text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5 opacity-85" aria-hidden="true" />
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold text-slate-950">{badgeCount}</span>
                  )}
                </Link>
              )
            })}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        {mustChange && pathname === '/platform/sifre' && (
          <p className="mb-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-semibold text-amber-900">
            Geçici şifreyle giriş yaptınız. Devam etmek için şifrenizi değiştirin.
          </p>
        )}
        {mustChange && pathname !== '/platform/sifre' ? null : children}
      </main>

      {paletteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hızlı arama"
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 px-4 pt-24 backdrop-blur-xs"
          onClick={() => setPaletteOpen(false)}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setPaletteIdx((i) => Math.min(i + 1, Math.max(paletteItems.length - 1, 0)))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setPaletteIdx((i) => Math.max(i - 1, 0))
                  } else if (e.key === 'Enter' && paletteItems[paletteIdx]) {
                    e.preventDefault()
                    setPaletteOpen(false)
                    router.push(paletteItems[paletteIdx].href)
                  }
                }}
                placeholder="Kurum veya sayfa ara…"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button type="button" onClick={() => setPaletteOpen(false)} aria-label="Kapat" className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {paletteItems.map((it, idx) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onMouseEnter={() => setPaletteIdx(idx)}
                    onClick={() => setPaletteOpen(false)}
                    className={`flex items-center justify-between px-4 py-2.5 text-sm transition hover:bg-slate-50 ${idx === paletteIdx ? 'bg-slate-100' : ''}`}
                  >
                    <span className="font-semibold text-slate-900">{it.label}</span>
                    <span className="text-xs text-slate-400">{it.sub}</span>
                  </Link>
                </li>
              ))}
              {paletteItems.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">Sonuç bulunamadı.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
