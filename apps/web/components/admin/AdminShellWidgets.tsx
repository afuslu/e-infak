'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowDownToLine, Bell, CheckCircle2, ChevronDown, ExternalLink, KeyRound, LogOut,
  PackageCheck, Search, Sparkles, SunMoon, X,
} from 'lucide-react'
import { adminGet, hasFeature, useAdminAccess, v1Get } from '../../lib/admin-access'
import { type NavGroup, searchKey } from './admin-nav'

/* -------------------------------------------------------------------------- */
/* Command Palette (Ctrl/⌘ + K)                                               */
/* -------------------------------------------------------------------------- */

interface QuickAction {
  id: string
  label: string
  hint: string
  onSelect: () => void
}

export function AdminCommandPalette({
  open,
  onClose,
  groups,
  onCycleTheme,
}: {
  open: boolean
  onClose: () => void
  groups: NavGroup[]
  onCycleTheme: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const navEntries = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ item, group: group.label }))),
    [groups],
  )

  const quickActions: QuickAction[] = useMemo(() => [
    { id: 'theme', label: 'Panel temasını değiştir', hint: 'Açık → Koyu → Sistem', onSelect: () => { onCycleTheme(); onClose() } },
    { id: 'site', label: 'Bağış sitesini yeni sekmede aç', hint: 'Önizleme', onSelect: () => { window.open('/', '_blank', 'noopener'); onClose() } },
  ], [onCycleTheme, onClose])

  const needle = searchKey(query.trim())

  const filteredPages = useMemo(() => {
    if (!needle) return navEntries.slice(0, 8)
    return navEntries.filter((entry) => searchKey(`${entry.item.label} ${entry.group}`).includes(needle))
  }, [navEntries, needle])

  const filteredActions = useMemo(() => {
    if (!needle) return quickActions
    return quickActions.filter((a) => searchKey(`${a.label} ${a.hint}`).includes(needle))
  }, [quickActions, needle])

  const totalCount = filteredPages.length + filteredActions.length

  useEffect(() => {
    setActiveIndex(0)
  }, [needle])

  if (!open) return null

  const runAt = (index: number) => {
    if (index < filteredPages.length) {
      router.push(filteredPages[index].item.href)
      onClose()
      return
    }
    const action = filteredActions[index - filteredPages.length]
    if (action) action.onSelect()
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Komut Paleti" onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-xs">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { onClose(); return }
              if (e.key === 'ArrowDown' && totalCount > 0) {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % totalCount)
              } else if (e.key === 'ArrowUp' && totalCount > 0) {
                e.preventDefault()
                setActiveIndex((i) => (i - 1 + totalCount) % totalCount)
              } else if (e.key === 'Enter' && totalCount > 0) {
                e.preventDefault()
                runAt(activeIndex)
              }
            }}
            placeholder="Sayfa veya hızlı işlem ara… (ör. havale, makbuz, sms)"
            className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Kapat"
            className="rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800">
            ESC
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {totalCount === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">“{query.trim()}” için sonuç bulunamadı.</p>
          ) : (
            <>
              {filteredPages.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                    {needle ? 'Sayfalar' : 'Hızlı Geçiş'}
                  </p>
                  {filteredPages.map(({ item, group }, idx) => {
                    const selected = idx === activeIndex
                    return (
                      <button key={item.href} type="button" onMouseEnter={() => setActiveIndex(idx)} onClick={() => runAt(idx)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${selected ? 'bg-primary-50 text-primary-800' : 'text-gray-700 hover:bg-gray-50'}`}>
                        <item.icon className={`h-4 w-4 shrink-0 ${selected ? 'text-primary-600' : 'text-gray-400'}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                        <span className="text-xs text-gray-400">{group}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {filteredActions.length > 0 && (
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <p className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Hızlı İşlemler</p>
                  {filteredActions.map((action, aIdx) => {
                    const idx = filteredPages.length + aIdx
                    const selected = idx === activeIndex
                    return (
                      <button key={action.id} type="button" onMouseEnter={() => setActiveIndex(idx)} onClick={() => runAt(idx)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${selected ? 'bg-primary-50 text-primary-800' : 'text-gray-700 hover:bg-gray-50'}`}>
                        {action.id === 'theme'
                          ? <SunMoon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                          : <Sparkles className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate font-semibold">{action.label}</span>
                        <span className="text-xs text-gray-400">{action.hint}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Notifications Bell (Pending Transfers & Failed SMS)                        */
/* -------------------------------------------------------------------------- */

export function AdminNotificationsBell() {
  const { data: access } = useAdminAccess()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const canTransfers = hasFeature(access, 'bank_transactions')
  const canSms = hasFeature(access, 'sms')

  const { data: transferData } = useQuery({
    queryKey: ['admin-bell-transfers'],
    queryFn: () => v1Get<{ total: number }>('/admin/incoming-transfers', { status: 'unmatched', limit: 1 }),
    enabled: canTransfers,
    staleTime: 60_000,
    retry: false,
  })

  const { data: smsData } = useQuery({
    queryKey: ['admin-bell-sms'],
    queryFn: () => adminGet<{ counts: Record<string, number> }>('/sms/messages', { page_size: 1 }),
    enabled: canSms,
    staleTime: 60_000,
    retry: false,
  })

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onOutside)
    return () => window.removeEventListener('mousedown', onOutside)
  }, [open])

  const unmatchedCount = transferData?.data?.total || 0
  const failedSmsCount = smsData?.data?.counts?.failed || 0
  const totalAlerts = unmatchedCount + failedSmsCount

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Bekleyen işlemler"
        title="Bekleyen işlemler"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600">
        <Bell className="h-4 w-4" aria-hidden="true" />
        {totalAlerts > 0 && (
          <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {totalAlerts > 99 ? '99+' : totalAlerts}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Bekleyen İşlemler</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="text-gray-400 hover:text-gray-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {totalAlerts === 0 ? (
              <div className="flex items-center gap-2.5 px-4 py-5 text-sm text-gray-500">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>Acil bekleyen işlem yok.</span>
              </div>
            ) : (
              <>
                {unmatchedCount > 0 && (
                  <Link href="/admin/gelen-havaleler" onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50">
                    <ArrowDownToLine className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">{unmatchedCount} eşleşmemiş havale</p>
                      <p className="text-xs text-gray-500">Bağışçı eşleştirmesi bekliyor</p>
                    </div>
                  </Link>
                )}
                {failedSmsCount > 0 && (
                  <Link href="/admin/sms-gonderimleri" onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">{failedSmsCount} iletilemeyen SMS</p>
                      <p className="text-xs text-gray-500">Gönderim raporunu inceleyin</p>
                    </div>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Profile Dropdown Menu                                                      */
/* -------------------------------------------------------------------------- */

export function AdminProfileMenu({
  firstName,
  lastName,
  email,
  roleLabel,
  onLogout,
}: {
  firstName?: string
  lastName?: string
  email?: string
  roleLabel?: string
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onOutside)
    return () => window.removeEventListener('mousedown', onOutside)
  }, [open])

  const initial = firstName?.[0]?.toUpperCase() || 'A'
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Yetkili'

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:border-gray-200 hover:bg-gray-50">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-[13px] font-bold text-white">
          {initial}
        </div>
        <span className="hidden text-[13px] font-semibold text-gray-900 md:inline">{firstName}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 md:inline" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-bold text-gray-900">{fullName}</p>
            {email && <p className="truncate text-xs text-gray-500">{email}</p>}
            {roleLabel && (
              <span className="mt-1.5 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-700">
                {roleLabel}
              </span>
            )}
          </div>
          <div className="p-1.5 text-sm">
            <Link href="/admin/sifre" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50">
              <KeyRound className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <span>Şifre Değiştir</span>
            </Link>
            <Link href="/admin/paket" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50">
              <PackageCheck className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <span>Paket & Kullanım</span>
            </Link>
            <Link href="/" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 sm:hidden">
              <ExternalLink className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <span>Siteyi Görüntüle</span>
            </Link>
            <button type="button" onClick={() => { setOpen(false); onLogout() }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Çıkış Yap</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
