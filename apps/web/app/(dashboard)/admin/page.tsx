'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import {
  AlertCircle, ArrowDownRight, ArrowDownToLine, ArrowUpRight, Blocks, CalendarDays, ChevronRight, HandCoins, Megaphone,
  Receipt, RefreshCw, TrendingUp, UserPlus, Users, type LucideIcon,
} from 'lucide-react'
import { adminGet, hasFeature, hasPermission, useAdminAccess, v1Get } from '../../../lib/admin-access'
import { PageHeader, StatCard } from '../../../components/admin/ui'
import { ghostButton } from '../../../components/admin/FormKit'

interface MonthlyTrend {
  month: string
  total_lira: number
}

interface CampaignProgress {
  title: string
  progress: number
  collected_lira: number
  target_lira: number
}

interface Kpis {
  currency: string
  today_cents: number
  yesterday_cents: number
  month_cents: number
  last_month_to_date_cents: number
  donor_count: number
  new_donors_this_month: number
  active_campaigns: number
}

const money = (cents: number) =>
  (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

function Change({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) return <div className="text-xs font-semibold text-gray-400">{label}: veri yok</div>
  const pct = ((current - previous) / previous) * 100
  const up = pct >= 0
  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
      %{Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {label}
    </div>
  )
}

interface PaymentMethod {
  method: string
  count: number
  total_lira: number
}

const QUICK_LINKS: { href: string; label: string; icon: LucideIcon; feature?: string; permission?: string }[] = [
  { href: '/admin/bagislar', label: 'Bağışlar', icon: HandCoins },
  { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: Megaphone },
  { href: '/admin/bagiscilar', label: 'Bağışçılar', icon: Users, feature: 'donor_crm' },
  { href: '/admin/makbuzlar', label: 'Makbuzlar', icon: Receipt, feature: 'receipts' },
  { href: '/admin/gelen-havaleler', label: 'Gelen Havaleler', icon: ArrowDownToLine, feature: 'bank_transactions' },
  { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: Blocks, permission: 'content_manage' },
]

export default function AdminDashboardPage() {
  const [trends, setTrends] = useState<MonthlyTrend[]>([])
  const [campaigns, setCampaigns] = useState<CampaignProgress[]>([])
  const [payments, setPayments] = useState<PaymentMethod[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { data: access } = useAdminAccess()

  const [todo, setTodo] = useState<{ transfers?: number; smsFailed?: number; smsWaiting?: number }>({})

  const loadAnalytics = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminGet<{ monthly_donations: MonthlyTrend[]; campaigns_progress: CampaignProgress[]; payment_methods: PaymentMethod[]; kpis: Kpis }>('/analytics/stats')
      setTrends(res.data.monthly_donations)
      setCampaigns(res.data.campaigns_progress)
      setPayments(res.data.payment_methods)
      setKpis(res.data.kpis)
    } catch {
      setError('Analiz verileri yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
    // Work waiting for staff; modules outside the package simply stay hidden.
    v1Get<{ total: number }>('/admin/incoming-transfers', { status: 'unmatched', limit: 1 })
      .then((r) => setTodo((t) => ({ ...t, transfers: r.data.total }))).catch(() => {})
    adminGet<{ counts: Record<string, number> }>('/sms/messages', { page_size: 1 })
      .then((r) => setTodo((t) => ({ ...t, smsFailed: r.data.counts.failed || 0, smsWaiting: (r.data.counts.queued || 0) + (r.data.counts.scheduled || 0) })))
      .catch(() => {})
  }

  useEffect(() => {
    loadAnalytics()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Find max monthly trend value to scale CSS bars dynamically
  const maxTrend = Math.max(1, ...trends.map(t => t.total_lira))
  const paymentTotal = payments.reduce((sum, p) => sum + p.total_lira, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Genel Bakış"
        description={<span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>}
        actions={<button onClick={loadAnalytics} className={`${ghostButton} flex items-center gap-1.5`}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Yenile</button>}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <span>{error}</span>
          <button type="button" onClick={loadAnalytics} className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100">
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Sık kullanılan işlemler */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK_LINKS.filter((link) => hasFeature(access, link.feature) && hasPermission(access, link.permission)).map((link) => (
          <Link key={link.href} href={link.href}
            className="group flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[13px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-primary-500 hover:text-primary-700">
            <link.icon className="h-[18px] w-[18px] shrink-0 text-gray-400 group-hover:text-primary-600" aria-hidden="true" />
            <span className="min-w-0 truncate">{link.label}</span>
          </Link>
        ))}
      </div>

      {(!!todo.transfers || !!todo.smsFailed) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {!!todo.transfers && (
            <Link href="/admin/gelen-havaleler" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:border-amber-300">
              <ArrowDownToLine className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{todo.transfers.toLocaleString('tr-TR')} gelen havale bağışçıyla eşleştirilmeyi bekliyor</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          {!!todo.smsFailed && (
            <Link href="/admin/sms-gonderimleri" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:border-red-300">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{todo.smsFailed.toLocaleString('tr-TR')} SMS gönderilemedi</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bugün toplanan" icon={HandCoins} value={kpis ? money(kpis.today_cents) : '—'}
          hint={kpis && <Change current={kpis.today_cents} previous={kpis.yesterday_cents} label="dünden" />} />
        <StatCard label="Bu ay toplanan" icon={TrendingUp} tone="brand" value={kpis ? money(kpis.month_cents) : '—'}
          hint={kpis && <Change current={kpis.month_cents} previous={kpis.last_month_to_date_cents} label="geçen ayın aynı dönemine göre" />} />
        <StatCard label="Bağış yapan bağışçı" icon={UserPlus} value={kpis ? kpis.donor_count.toLocaleString('tr-TR') : '—'}
          hint={kpis && `Bu ay ${kpis.new_donors_this_month} yeni bağışçı`} />
        <StatCard label="Aktif kampanya" icon={Megaphone} value={kpis ? kpis.active_campaigns : '—'} hint={`Toplam ${campaigns.length} kampanya`} />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse text-center py-12">Analiz verileri yükleniyor...</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          {/* Left: Interactive Monthly Donations Bar Chart */}
          <div className="lg:col-span-8">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-6">
              <div className="border-b pb-2">
                <h2 className="text-base font-bold text-gray-900">Aylık bağış trendi <span className="font-normal text-gray-400">· son 6 ay</span></h2>
              </div>

              {/* Dynamic CSS Bar Chart */}
              <div className="flex items-end gap-2 h-64 pt-6 px-3 sm:px-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                {trends.map((t, idx) => {
                  const pct = (t.total_lira / maxTrend) * 80 // Max height 80%
                  return (
                    <div key={idx} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      {/* Tooltip value */}
                      <span className="text-[9px] font-bold text-primary-700 opacity-0 group-hover:opacity-100 transition-opacity bg-white border px-1.5 py-0.5 rounded shadow-sm">
                        {t.total_lira.toLocaleString('tr-TR')} ₺
                      </span>
                      {/* Bar */}
                      <div 
                        style={{ height: `${pct}%` }} 
                        className="w-full max-w-12 bg-primary-600/90 hover:bg-primary-700 rounded-t-lg transition-all duration-500 shadow-sm"
                      />
                      {/* Label */}
                      <span className="text-[10px] text-gray-500 font-bold mt-1 pb-2">{t.month}</span>
                    </div>
                  )
                })}
                {trends.length === 0 && <p className="m-auto text-sm text-gray-400">Henüz bağış verisi yok.</p>}
              </div>
            </Card>
          </div>

          {/* Right: Payment Channels & Campaign Progress Gauges */}
          <div className="lg:col-span-4 space-y-6">
            {/* Payment breakdowns */}
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Ödeme kanalları <span className="font-normal text-gray-400">· bu yıl</span></h2>
              {payments.length === 0 && <p className="text-xs text-gray-400">Bu yıl henüz onaylı bağış yok.</p>}
              <div className="space-y-4">
                {payments.map((p, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-gray-700">
                      <span>{p.method} ({p.count} işlem)</span>
                      <span>{p.total_lira.toLocaleString('tr-TR')} ₺</span>
                    </div>
                    {/* Progress Bar representation */}
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${paymentTotal ? (p.total_lira / paymentTotal) * 100 : 0}%` }}
                        className={`h-full rounded-full ${idx === 0 ? 'bg-indigo-600' : 'bg-teal-600'}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Campaign Gauges */}
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Kampanya hedefleri</h2>
              <div className="space-y-4 max-h-52 overflow-y-auto pr-1">
                {campaigns.map((c, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-gray-700">
                      <span className="truncate max-w-40">{c.title}</span>
                      <span>%{c.progress.toFixed(0)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${c.progress}%` }}
                        className="h-full bg-emerald-600 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
