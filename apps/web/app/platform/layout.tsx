'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { platformCall, platformToken, setPlatformToken } from '../../lib/platform-api'

const NAV = [
  { href: '/platform', label: 'Kurumlar' },
  { href: '/platform/yeni', label: 'Yeni kurum' },
  { href: '/platform/kayitlar', label: 'İşlem kayıtları' },
]

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/platform/giris'
  const [me, setMe] = useState<{ email: string } | null>(null)

  useEffect(() => {
    if (isLogin) return
    if (!platformToken()) {
      router.replace('/platform/giris')
      return
    }
    platformCall<{ email: string }>('get', '/me').then(setMe).catch(() => undefined)
  }, [isLogin, router])

  if (isLogin) return <div className="min-h-screen bg-slate-100">{children}</div>
  if (!me) return <div className="min-h-screen bg-slate-100 p-8 text-sm text-slate-500">Yükleniyor…</div>

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/platform" className="font-bold">E‑İnfak Platform</Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}
                className={`rounded-md px-3 py-1.5 ${pathname === item.href ? 'bg-white/15 font-semibold' : 'text-slate-300 hover:bg-white/10'}`}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/platform/sifre" className="text-xs text-slate-400 hover:text-white">{me.email}</Link>
          <button type="button" className="rounded-md border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
            onClick={() => { setPlatformToken(null); router.replace('/platform/giris') }}>
            Çıkış
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
