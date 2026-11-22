'use client'

import { useEffect, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { ACTION_LABELS, AuditEntry, AuditTable } from '../../../components/platform/AuditTable'
import { PlatformSkeleton, downloadCsv, ptPrimaryBtn, ptSecondaryBtn } from '../../../components/platform/PlatformUI'
import { PlatformOrg, platformCall, platformError } from '../../../lib/platform-api'

export default function PlatformAuditPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [orgs, setOrgs] = useState<PlatformOrg[]>([])
  const [filter, setFilter] = useState({ organization_id: '', action: '', q: '' })
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { platformCall<PlatformOrg[]>('get', '/organizations').then(setOrgs).catch(() => undefined) }, [])

  useEffect(() => {
    const params = new URLSearchParams({ limit: '300' })
    Object.entries(filter).forEach(([key, value]) => { if (value) params.set(key, value) })
    setRows(null)
    setError('')
    platformCall<AuditEntry[]>('get', `/audit?${params}`).then(setRows)
      .catch((err) => setError(platformError(err, 'Kayıtlar yüklenemedi')))
  }, [filter])

  const control = 'rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15'
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">İşlem kayıtları</h1>
          <p className="mt-1 text-sm text-slate-500">Platform operatörlerinin kurumlar üzerindeki son işlemleri.</p>
        </div>
        {rows && rows.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                'platform-islem-kayitlari.csv',
                ['Zaman', 'İşlem', 'Operatör', 'Kurum', 'IP', 'Ayrıntı'],
                rows.map((r) => [r.created_at, ACTION_LABELS[r.action] || r.action, r.operator, r.organization, r.ip, JSON.stringify(r.details || {})]),
              )
            }
            className={ptSecondaryBtn}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>CSV İndir</span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <select aria-label="Kurum filtresi" className={control} value={filter.organization_id} onChange={(e) => setFilter({ ...filter, organization_id: e.target.value })}>
          <option value="">Tüm kurumlar</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select aria-label="İşlem filtresi" className={control} value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })}>
          <option value="">Tüm işlemler</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); setFilter({ ...filter, q: search.trim() }) }} className="flex flex-1 gap-2 sm:flex-initial">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              className={`${control} w-full ps-9`}
              placeholder="E-posta veya ayrıntıda ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className={ptPrimaryBtn}>Ara</button>
        </form>
      </div>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>
        : !rows ? <PlatformSkeleton rows={5} /> : <AuditTable rows={rows} />}
    </div>
  )
}
