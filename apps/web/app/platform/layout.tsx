'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Building2, History, Inbox, KeyRound, LogOut, Megaphone, PlusCircle, Users, type LucideIcon } from 'lucide-react'
import { PlatformMe, platformCall, platformError, platformToken, setPlatformToken } from '../../lib/platform-api'

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/platform', label: 'Kurumlar', icon: Building2 },
  { href: '/platform/yeni', label: 'Yeni kurum', icon: PlusCircle },
  { href: '/platform/metrikler', label: 'Metrikler', icon: BarChart3 },
  { href: '/platform/talepler', label: 'Demo talepleri', icon: Inbox },
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

  // A temporary password must be replaced before anything else.
  const mustChange = !!me?.must_change_password
  useEffect(() => {
    if (mustChange && pathname !== '/platform/sifre') router.replace('/platform/sifre')
  }, [mustChange, pathname, router])

  if (isLogin) return <>{children}</>
  if (!me) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="h-14 border-b border-slate-800 bg-slate-900" />
        <div className="mx-auto max-w-6xl px-4 py-8">
          {error ? (
            <div className="max-w-md space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <p className="font-semibold">{error}</p>
              <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white">Tekrar dene</button>
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/95 text-white backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/platform" className="flex items-center gap-2.5 pe-2 font-extrabold tracking-tight text-white">
            <img src="/images/e-infak/mark.png" alt="E-İnfak" className="h-7 w-7 rounded-lg object-cover ring-1 ring-white/20" />
            <span>E‑İnfak Platform</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            {!mustChange && NAV.map((item) => {
              const active = item.href === '/platform' ? pathname === '/platform' || pathname.startsWith('/platform/kurum/') : pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition ${
                    active ? 'bg-white/15 font-semibold text-white shadow-xs' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="h-4 w-4 opacity-85" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/platform/sifre"
              title="Şifre değiştir"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <KeyRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>{me.email}</span>
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/15 hover:text-white"
              onClick={() => { setPlatformToken(null); router.replace('/platform/giris') }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Çıkış</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        {mustChange && pathname === '/platform/sifre' && (
          <p className="mb-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-semibold text-amber-900">
            Geçici şifreyle giriş yaptınız. Devam etmek için şifrenizi değiştirin.
          </p>
        )}
        {mustChange && pathname !== '/platform/sifre' ? null : children}
      </main>
    </div>
  )
}
