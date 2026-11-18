'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ExternalLink, HandCoins, Plus, Search } from 'lucide-react'
import { AlertList, AlertSummary } from '../../components/platform/AlertList'
import { PlatformSkeleton, ptPrimaryBtn } from '../../components/platform/PlatformUI'
import { PlatformAlert, PlatformOrg, dateTr, platformCall, platformError } from '../../lib/platform-api'

export default function PlatformOrganizationsPage() {
  const [orgs, setOrgs] = useState<PlatformOrg[] | null>(null)
  const [alerts, setAlerts] = useState<PlatformAlert[] | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [query, setQuery] = useState('')
  const [orgError, setOrgError] = useState('')
  const [alertError, setAlertError] = useState('')

  useEffect(() => {
    platformCall<PlatformOrg[]>('get', '/organizations').then(setOrgs)
      .catch((err) => setOrgError(platformError(err, 'Kurumlar yüklenemedi')))
    platformCall<PlatformAlert[]>('get', '/alerts').then(setAlerts)
      .catch((err) => setAlertError(platformError(err, 'Uyarılar kontrol edilemedi')))
  }, [])

  const shown = useMemo(() => (orgs || []).filter((o) =>
    `${o.name} ${o.slug} ${o.domains.map((d) => d.domain).join(' ')}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))), [orgs, query])
  const alertCount = (orgId: string) => (alerts || []).filter((a) => a.organization_id === orgId && a.level !== 'info').length
  const visibleAlerts = (alerts || []).filter((a) => showInfo || a.level !== 'info')

  const totalOrgs = orgs?.length ?? 0
  const activeOrgs = orgs?.filter((o) => o.is_active).length ?? 0
  const totalDonations = orgs?.reduce((sum, o) => sum + (o.donation_count || 0), 0) ?? 0
  const openAlerts = (alerts || []).filter((a) => a.level !== 'info').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Kurumlar</h1>
          <p className="mt-0.5 text-sm text-slate-500">Platformdaki tüm dernek ve vakıf kiracılarının genel durumu.</p>
        </div>
        <Link href="/platform/yeni" className={ptPrimaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Yeni kurum</span>
        </Link>
      </div>

      {/* KPI özet kartları */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Toplam Kurum</span>
            <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{orgs ? totalOrgs : '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Aktif Kurum</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700">{orgs ? activeOrgs : '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Toplam Bağış</span>
            <HandCoins className="h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{orgs ? totalDonations.toLocaleString('tr-TR') : '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Açık Uyarı</span>
            <AlertTriangle className={`h-4 w-4 ${openAlerts > 0 ? 'text-amber-500' : 'text-slate-400'}`} aria-hidden="true" />
          </div>
          <div className={`mt-2 text-2xl font-extrabold ${openAlerts > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {alerts ? openAlerts : '—'}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Uyarılar</h2>
          {alerts && (
            <div className="flex flex-wrap items-center gap-3">
              <AlertSummary alerts={alerts} />
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> Bilgi notlarını göster
              </label>
            </div>
          )}
        </div>
        {alertError ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{alertError}</p>
          : !alerts ? <PlatformSkeleton rows={1} /> : <AlertList alerts={visibleAlerts} />}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            Kurum listesi {orgs && <span className="font-normal text-slate-500">({shown.length})</span>}
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              placeholder="Kurum, slug veya alan adı ara…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pe-3 ps-9 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
            />
          </div>
        </div>

        {orgError ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{orgError}</p>
          : !orgs ? <PlatformSkeleton rows={5} /> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kurum</th>
                  <th className="px-4 py-3">Paket</th>
                  <th className="px-4 py-3">Adres</th>
                  <th className="px-4 py-3">Kullanıcı</th>
                  <th className="px-4 py-3">Bağış</th>
                  <th className="px-4 py-3">Son bağış</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((o) => {
                  const open = alertCount(o.id)
                  const full = (o.user_count || 0) >= o.user_limit
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-extrabold text-white">
                            {(o.name[0] || 'K').toUpperCase()}
                          </div>
                          <div>
                            <Link href={`/platform/kurum/${o.id}`} className="font-bold text-slate-900 hover:text-emerald-700 hover:underline">
                              {o.name}
                            </Link>
                            <div className="text-xs text-slate-500">{o.slug}</div>
                            {open > 0 && <div className="mt-0.5 text-xs font-semibold text-red-600">{open} uyarı</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{o.plan_label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                          {o.url.replace('https://', '')}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                        {o.domains.some((d) => d.status === 'pending') && <div className="text-xs font-medium text-amber-700">Bekleyen alan adı</div>}
                      </td>
                      <td className={`px-4 py-3 font-medium ${full ? 'font-bold text-amber-700' : 'text-slate-700'}`} title={full ? 'Kullanıcı sınırı dolu' : undefined}>
                        {o.user_count} / {o.user_limit}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{o.donation_count}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{dateTr(o.last_donation_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${o.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                          {o.is_active ? 'Aktif' : 'Askıda'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">Aramanızla eşleşen kurum bulunamadı.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
