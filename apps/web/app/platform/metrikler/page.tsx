'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Activity, AlertCircle, Building2, CreditCard, Database, HandCoins, Server, TrendingUp } from 'lucide-react'
import { PlatformSkeleton, ptCard } from '../../../components/platform/PlatformUI'
import { dateTr, platformCall, platformError } from '../../../lib/platform-api'

interface MetricsData {
  total_orgs: number
  status_counts: Record<string, number>
  plan_counts?: Record<string, number>
  total_extra_seats?: number
  mrr_cents: number
  saas_collected_month_cents: number
  donations_30d_count: number
  donations_30d_cents: number
  failed_donations_30d: number
  trends: { month: string; count: number; total_cents: number }[]
  org_usage: {
    id: string
    name: string
    plan: string
    subscription_status: string
    subscription_ends_at: string | null
    monthly_fee_cents: number
    users_used: number
    users_limit: number
    quota_pct: number
    donations_30d_count?: number
    donations_30d_cents?: number
  }[]
}

const tl = (cents: number) =>
  (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

const SUB_LABELS: Record<string, [string, string]> = {
  active: ['Aktif', 'bg-emerald-100 text-emerald-800'],
  trial: ['Deneme', 'bg-blue-100 text-blue-700'],
  past_due: ['Gecikmiş', 'bg-amber-100 text-amber-800'],
  suspended: ['Askıda', 'bg-red-100 text-red-700'],
}

export default function PlatformMetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [health, setHealth] = useState<{ db_ok: boolean; db_ms: number; db_size_mb?: number; redis_ok: boolean; sms_failed_24h: number; checked_at?: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    platformCall<MetricsData>('get', '/metrics')
      .then(setData)
      .catch((err) => setError(platformError(err, 'Metrikler yüklenemedi')))
    platformCall<{ db_ok: boolean; db_ms: number; db_size_mb?: number; redis_ok: boolean; sms_failed_24h: number; checked_at?: string }>('get', '/health')
      .then(setHealth)
      .catch(() => undefined)
  }, [])

  const maxTrend = Math.max(1, ...(data?.trends.map((t) => t.total_cents) || [1]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Metrikler &amp; Sistem Sağlığı</h1>
        <p className="mt-1 text-sm text-slate-500">Platform geneli abonelik geliri (MRR), bağış hacmi ve kurum kota dolulukları.</p>
      </div>

      {health && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-5 py-3.5 text-xs shadow-xs">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
            <Server className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Canlı Sistem Durumu:
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold ${health.db_ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
            <Database className="h-3 w-3" aria-hidden="true" />
            PostgreSQL {health.db_ok ? `${health.db_ms} ms` : 'Hata'}{typeof health.db_size_mb === 'number' ? ` · ${health.db_size_mb} MB` : ''}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 font-bold ${health.redis_ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
            Redis {health.redis_ok ? 'Bağlı' : 'Kapalı'}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 font-bold ${health.sms_failed_24h > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
            24s Hatalı SMS: {health.sms_failed_24h}
          </span>
          {health.checked_at && <span className="text-slate-400">Kontrol: {dateTr(health.checked_at)}</span>}
          {data?.plan_counts && (
            <span className="ms-auto font-semibold text-slate-500">
              Paketler: Başlangıç {data.plan_counts.baslangic || 0} · Orta {data.plan_counts.orta || 0} · İleri {data.plan_counts.ileri || 0}
              {typeof data.total_extra_seats === 'number' && data.total_extra_seats > 0 ? ` (+${data.total_extra_seats} ek koltuk)` : ''}
            </span>
          )}
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>}
      {!data ? (!error && <PlatformSkeleton rows={5} />) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/platform" className={`${ptCard} block transition hover:shadow-md`}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>Beklenen Aylık MRR</span>
                <CreditCard className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900">{tl(data.mrr_cents)}</div>
              <p className="mt-1 text-xs text-slate-500">Bu ay tahsil edilen: {tl(data.saas_collected_month_cents)}</p>
            </Link>
            <Link href="/platform" className={`${ptCard} block transition hover:shadow-md`}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>30 Günlük Bağış Hacmi</span>
                <HandCoins className="h-4 w-4 text-blue-500" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900">{tl(data.donations_30d_cents)}</div>
              <p className="mt-1 text-xs text-slate-500">{data.donations_30d_count.toLocaleString('tr-TR')} başarılı bağış</p>
            </Link>
            <Link href="/platform" className={`${ptCard} block transition hover:shadow-md`}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>Abonelik Dağılımı</span>
                <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900">{data.total_orgs} Kurum</div>
              <p className="mt-1 text-xs text-slate-500">
                {data.status_counts.active || 0} aktif · {data.status_counts.trial || 0} deneme · {data.status_counts.past_due || 0} gecikmiş · {data.status_counts.suspended || 0} askıda
              </p>
            </Link>
            <Link href="/platform" className={`${ptCard} block transition hover:shadow-md`}>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>30 Gün Hatalı Ödeme</span>
                <AlertCircle className={`h-4 w-4 ${data.failed_donations_30d > 0 ? 'text-amber-500' : 'text-emerald-500'}`} aria-hidden="true" />
              </div>
              <div className={`mt-2 text-2xl font-extrabold ${data.failed_donations_30d > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                {data.failed_donations_30d}
              </div>
              <p className="mt-1 text-xs text-slate-500">Tüm kiracılar toplamı</p>
            </Link>
          </div>

          <section className={ptCard}>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">Son 6 Ay Platform Bağış Hacmi</h2>
            </div>
            {data.trends.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz yeterli veri yok.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                {data.trends.map((t) => {
                  const pct = Math.max(8, Math.round((t.total_cents / maxTrend) * 100))
                  return (
                    <div key={t.month} className="flex flex-col justify-end rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="mb-2 flex h-24 items-end">
                        <div className="w-full rounded-t-lg bg-emerald-600 transition-all" style={{ height: `${pct}%` }} />
                      </div>
                      <div className="text-xs font-bold text-slate-900">{tl(t.total_cents)}</div>
                      <div className="text-[11px] text-slate-500">{t.month} · {t.count} işlem</div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
              <Activity className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">Kurum Kota &amp; Abonelik Durumu</h2>
            </div>
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kurum</th>
                  <th className="px-4 py-3">Abonelik</th>
                  <th className="px-4 py-3">Aylık Ücret</th>
                  <th className="px-4 py-3">30 Gün Bağış</th>
                  <th className="px-4 py-3">Bitiş Tarihi</th>
                  <th className="px-4 py-3">Kullanıcı Kotası</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.org_usage.map((o) => {
                  const [stLabel, stCls] = SUB_LABELS[o.subscription_status] || SUB_LABELS.active
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <Link href={`/platform/kurum/${o.id}`} className="hover:text-emerald-700 hover:underline">{o.name}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${stCls}`}>{stLabel}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{tl(o.monthly_fee_cents)}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{tl(o.donations_30d_cents || 0)}</div>
                        <div className="text-[11px] text-slate-500">{o.donations_30d_count || 0} işlem</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{o.subscription_ends_at ? dateTr(o.subscription_ends_at) : 'Belirtilmemiş'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${o.quota_pct >= 90 ? 'bg-amber-500' : 'bg-emerald-600'}`}
                              style={{ width: `${Math.min(100, o.quota_pct)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">{o.users_used}/{o.users_limit}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
