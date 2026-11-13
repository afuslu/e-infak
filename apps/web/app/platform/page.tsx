'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertList, AlertSummary } from '../../components/platform/AlertList'
import { PlatformAlert, PlatformOrg, dateTr, platformCall } from '../../lib/platform-api'

export default function PlatformOrganizationsPage() {
  const [orgs, setOrgs] = useState<PlatformOrg[] | null>(null)
  const [alerts, setAlerts] = useState<PlatformAlert[] | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    platformCall<PlatformOrg[]>('get', '/organizations').then(setOrgs).catch(() => setOrgs([]))
    platformCall<PlatformAlert[]>('get', '/alerts').then(setAlerts).catch(() => setAlerts([]))
  }, [])

  const shown = useMemo(() => (orgs || []).filter((o) =>
    `${o.name} ${o.slug} ${o.domains.map((d) => d.domain).join(' ')}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))), [orgs, query])
  const alertCount = (orgId: string) => (alerts || []).filter((a) => a.organization_id === orgId && a.level !== 'info').length
  const visibleAlerts = (alerts || []).filter((a) => showInfo || a.level !== 'info')

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Uyarılar</h2>
          {alerts && (
            <div className="flex flex-wrap items-center gap-3">
              <AlertSummary alerts={alerts} />
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> Bilgi notlarını göster
              </label>
            </div>
          )}
        </div>
        {!alerts ? <p className="text-sm text-slate-500">Kontrol ediliyor…</p> : <AlertList alerts={visibleAlerts} />}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Kurumlar {orgs && <span className="text-base font-normal text-slate-500">({orgs.length})</span>}</h1>
          <div className="flex gap-2">
            <input placeholder="Ara…" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm" />
            <Link href="/platform/yeni" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">+ Yeni kurum</Link>
          </div>
        </div>
        {!orgs ? <p className="text-sm text-slate-500">Yükleniyor…</p> : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="p-3">Kurum</th><th className="p-3">Paket</th><th className="p-3">Adres</th><th className="p-3">Kullanıcı</th><th className="p-3">Bağış</th><th className="p-3">Son bağış</th><th className="p-3">Durum</th></tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const open = alertCount(o.id)
                  const full = (o.user_count || 0) >= o.user_limit
                  return (
                    <tr key={o.id} className="border-t hover:bg-slate-50">
                      <td className="p-3">
                        <Link href={`/platform/kurum/${o.id}`} className="font-semibold text-slate-900 hover:underline">{o.name}</Link>
                        <div className="text-xs text-slate-500">{o.slug}</div>
                        {open > 0 && <div className="mt-0.5 text-xs font-semibold text-red-700">{open} uyarı</div>}
                      </td>
                      <td className="p-3">{o.plan_label}</td>
                      <td className="p-3"><a href={o.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">{o.url.replace('https://', '')}</a>
                        {o.domains.some((d) => d.status === 'pending') && <div className="text-xs text-amber-700">Bekleyen alan adı</div>}</td>
                      <td className={`p-3 ${full ? 'font-semibold text-amber-700' : ''}`} title={full ? 'Kullanıcı sınırı dolu' : undefined}>
                        {o.user_count} / {o.user_limit}
                      </td>
                      <td className="p-3">{o.donation_count}</td>
                      <td className="p-3 text-xs">{dateTr(o.last_donation_at)}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{o.is_active ? 'Aktif' : 'Askıda'}</span></td>
                    </tr>
                  )
                })}
                {shown.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Kurum bulunamadı</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
