'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Eye, Search } from 'lucide-react'
import { PlatformOrg, platformCall, platformError } from '../../lib/platform-api'
import { recentSimulations, startSimulation } from '../../lib/simulation'

/**
 * "Kurum simüle et": searchable list of every organisation; choosing one opens its admin
 * panel in this tab as the organisation's administrator (logged on both sides).
 */
export default function OrgSimulateSwitcher({
  orgs: given,
  currentOrgId,
  label = 'Kurum simüle et',
  className = '',
}: {
  orgs?: PlatformOrg[]
  currentOrgId?: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [orgs, setOrgs] = useState<PlatformOrg[] | null>(given ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { if (given) setOrgs(given) }, [given])

  useEffect(() => {
    if (!open || orgs) return
    platformCall<PlatformOrg[]>('get', '/organizations')
      .then(setOrgs)
      .catch((err) => setError(platformError(err, 'Kurumlar yüklenemedi')))
  }, [open, orgs])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    const recent = recentSimulations()
    const rank = (o: PlatformOrg) => { const i = recent.indexOf(o.id); return i === -1 ? 99 : i }
    return (orgs || [])
      .filter((o) => !q || `${o.name} ${o.slug} ${o.legal_name}`.toLocaleLowerCase('tr').includes(q))
      .sort((a, b) => (q ? 0 : rank(a) - rank(b)) || Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'tr'))
      .slice(0, 50)
  }, [orgs, query])

  const choose = async (org: PlatformOrg) => {
    if (busy || !org.is_active || org.id === currentOrgId) return
    setBusy(org.id)
    setError('')
    try {
      await startSimulation(org.id)
    } catch (err) {
      setError(platformError(err, (err as Error)?.message || 'Simülasyon başlatılamadı'))
      setBusy(null)
    }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery('') }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute end-0 z-[60] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && items[0]) choose(items[0]) }}
              placeholder="Kurum ara…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <p className="border-b border-slate-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
            Panel bu sekmede kurum yöneticisi olarak açılır; giriş kurumun kayıtlarına işlenir.
          </p>
          {error && <p className="px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {!orgs && !error && <li className="px-3 py-4 text-center text-xs text-slate-500">Yükleniyor…</li>}
            {orgs && items.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">Sonuç bulunamadı.</li>}
            {items.map((o) => {
              const current = o.id === currentOrgId
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={current}
                    disabled={!o.is_active || !!busy || current}
                    onClick={() => choose(o)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed ${current ? 'bg-emerald-50' : ''} ${!o.is_active ? 'opacity-50' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{o.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{o.slug} · {o.plan_label}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                      {busy === o.id ? 'Açılıyor…' : current ? 'Şu an' : !o.is_active ? 'Askıda' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
