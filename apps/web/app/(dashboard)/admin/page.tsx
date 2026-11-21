'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import {
  AlertCircle, ArrowDownRight, ArrowDownToLine, ArrowUpRight, BellRing, Blocks, CalendarDays,
  ChevronRight, Clock, HandCoins, Hourglass, Megaphone, Receipt, RefreshCw,
  TrendingUp, UserPlus, Users, type LucideIcon,
} from 'lucide-react'
import { adminGet, formatMoney, hasFeature, useAdminAccess, v1Get, hasModule } from '../../../lib/admin-access'
import { PageHeader, StatCard } from '../../../components/admin/ui'
import { OnboardingChecklist } from '../../../components/admin/OnboardingChecklist'
import { ghostButton } from '../../../components/admin/FormKit'

interface MonthlyTrend {
  month: string
  total_cents?: number
  total_lira: number
  count?: number
}

interface CampaignProgress {
  id?: string
  slug?: string
  title: string
  status?: string
  currency?: string
  progress: number
  collected_cents?: number
  target_cents?: number
  collected_lira: number
  target_lira: number
}

interface RecentDonation {
  id: string
  receipt_number: string
  donor_id: string
  donor_name: string
  campaign_title: string
  amount_cents: number
  currency: string
  payment_method: string
  status: string
  paid_at: string | null
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

interface PaymentMethod {
  method: string
  count: number
  total_cents?: number
  total_lira: number
}

type ChannelPeriod = 'today' | 'week' | 'month' | 'year'

const PERIOD_LABELS: Record<ChannelPeriod, string> = {
  today: 'Bugün',
  week: 'Bu hafta',
  month: 'Bu ay',
  year: 'Bu yıl',
}

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const

const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const QUICK_LINKS: { href: string; label: string; icon: LucideIcon; feature?: string; module?: string }[] = [
  { href: '/admin/bagislar', label: 'Bağışlar', icon: HandCoins, module: 'receipts' },
  { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: Megaphone, module: 'site' },
  { href: '/admin/bagiscilar', label: 'Bağışçılar', icon: Users, feature: 'donor_crm', module: 'donors' },
  { href: '/admin/bagislar?gorunum=elle', label: 'Elle makbuzlar', icon: Receipt, feature: 'receipts', module: 'receipts' },
  { href: '/admin/gelen-havaleler', label: 'Gelen Havaleler', icon: ArrowDownToLine, feature: 'bank_transactions', module: 'bank' },
  { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: Blocks, module: 'site' },
]

function Change({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) return <div className="text-xs font-semibold text-gray-400">{label}: karşılaştırma verisi yok</div>
  const pct = ((current - previous) / previous) * 100
  const up = pct >= 0
  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
      %{Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {label}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Veriler yükleniyor">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="h-3 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-7 w-32 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-28 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 h-80 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="h-4 w-44 rounded bg-gray-200" />
          <div className="mt-6 h-56 rounded-2xl bg-slate-100" />
        </div>
        <div className="lg:col-span-4 space-y-6">
          <div className="h-44 rounded-xl border border-gray-100 bg-white p-6 shadow-sm" />
          <div className="h-44 rounded-xl border border-gray-100 bg-white p-6 shadow-sm" />
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [trends, setTrends] = useState<MonthlyTrend[]>([])
  const [campaigns, setCampaigns] = useState<CampaignProgress[]>([])
  const [payments, setPayments] = useState<PaymentMethod[]>([])
  const [todayPayments, setTodayPayments] = useState<PaymentMethod[]>([])
  const [recentDonations, setRecentDonations] = useState<RecentDonation[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [seesAll, setSeesAll] = useState<boolean>(true)
  const [pendingDonations, setPendingDonations] = useState<number>(0)

  const [months, setMonths] = useState<6 | 12>(6)
  const [period, setPeriod] = useState<ChannelPeriod>('year')
  const [currency, setCurrency] = useState<string>('TRY')
  const [selectedBar, setSelectedBar] = useState<number | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { data: access } = useAdminAccess()

  const [todo, setTodo] = useState<{ transfers?: number; smsFailed?: number; smsWaiting?: number; callToday?: number; callLate?: number }>({})

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminGet<{
        sees_all?: boolean
        currency?: string
        monthly_donations: MonthlyTrend[]
        campaigns_progress: CampaignProgress[]
        payment_methods: PaymentMethod[]
        today_payment_methods?: PaymentMethod[]
        recent_donations?: RecentDonation[]
        pending_donations_count?: number
        kpis: Kpis | null
      }>('/analytics/stats', { months, period, currency })

      setSeesAll(res.data.sees_all ?? !!res.data.kpis)
      setTrends(res.data.monthly_donations || [])
      setCampaigns(res.data.campaigns_progress || [])
      setPayments(res.data.payment_methods || [])
      setTodayPayments(res.data.today_payment_methods || [])
      setRecentDonations(res.data.recent_donations || [])
      setPendingDonations(res.data.pending_donations_count || 0)
      setKpis(res.data.kpis)
      setSelectedBar(null)
      setLastUpdated(new Date())
    } catch {
      setError('Analiz verileri yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }, [months, period, currency])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  // Fetch actionable queue counts only for modules enabled for this user/org
  useEffect(() => {
    if (!access) return
    // Hatırlatıcı belongs to everyone: the staff member's own calls for today.
    adminGet<{ geciken: number; bugun: number }>('/reminders/summary')
      .then((r) => setTodo((t) => ({ ...t, callToday: r.data.bugun, callLate: r.data.geciken })))
      .catch(() => {})
    if (hasFeature(access, 'bank_transactions') && hasModule(access, 'bank')) {
      v1Get<{ total: number }>('/admin/incoming-transfers', { status: 'unmatched', limit: 1 })
        .then((r) => setTodo((t) => ({ ...t, transfers: r.data.total })))
        .catch(() => {})
    }
    if (hasModule(access, 'sms')) {
      adminGet<{ counts: Record<string, number> }>('/sms/messages', { page_size: 1 })
        .then((r) => setTodo((t) => ({
          ...t,
          smsFailed: r.data.counts?.failed || 0,
          smsWaiting: (r.data.counts?.queued || 0) + (r.data.counts?.scheduled || 0),
        })))
        .catch(() => {})
    }
  }, [access])

  const trendCents = (t: MonthlyTrend) => t.total_cents ?? Math.round(t.total_lira * 100)
  const paymentCents = (p: PaymentMethod) => p.total_cents ?? Math.round(p.total_lira * 100)

  const maxTrendCents = Math.max(100, ...trends.map(trendCents))
  const totalTrendCents = trends.reduce((sum, t) => sum + trendCents(t), 0)
  const totalTrendCount = trends.reduce((sum, t) => sum + (t.count || 0), 0)
  const paymentTotalCents = payments.reduce((sum, p) => sum + paymentCents(p), 0)
  const activeBar = selectedBar !== null ? trends[selectedBar] : null

  const callCount = (todo.callToday || 0) + (todo.callLate || 0)
  const hasTodo = callCount > 0 || !!todo.transfers || !!todo.smsFailed || !!todo.smsWaiting || pendingDonations > 0
  const now = new Date()
  const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
  const todayStr = toLocalDateStr(now)
  const monthDonationsHref = kpis
    ? `/admin/bagislar?start=${monthStart}&end=${todayStr}&status=confirmed&currency=${encodeURIComponent(kpis.currency)}`
    : '/admin/bagislar'

  return (
    <div className="space-y-6">
      <OnboardingChecklist />
      <PageHeader
        title="Genel Bakış"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {lastUpdated && (
              <span className="text-xs text-gray-400">
                · Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {seesAll && (
              <select
                aria-label="Para birimi"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm focus:border-primary-500 focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={loadAnalytics}
              disabled={loading}
              className={`${ghostButton} flex items-center gap-1.5`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Yenile
            </button>
          </div>
        }
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
        {QUICK_LINKS.filter((link) => hasFeature(access, link.feature) && hasModule(access, link.module)).map((link) => (
          <Link key={link.href} href={link.href}
            className="group flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[13px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-primary-500 hover:text-primary-700">
            <link.icon className="h-[18px] w-[18px] shrink-0 text-gray-400 group-hover:text-primary-600" aria-hidden="true" />
            <span className="min-w-0 truncate">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Bekleyen işler */}
      {hasTodo && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {callCount > 0 && (
            <Link href="/admin/hatirlatici" className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800 hover:border-primary-300">
              <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                Bugün aranacak: {callCount.toLocaleString('tr-TR')}
                {!!todo.callLate && <span className="ml-1 font-normal text-red-700">({todo.callLate.toLocaleString('tr-TR')} tanesi gecikmiş)</span>}
              </span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          {pendingDonations > 0 && (
            <Link href="/admin/bagislar?status=pending" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:border-amber-300">
              <Hourglass className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{pendingDonations.toLocaleString('tr-TR')} bağış onay bekliyor</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          {!!todo.transfers && (
            <Link href="/admin/gelen-havaleler" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:border-amber-300">
              <ArrowDownToLine className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{todo.transfers.toLocaleString('tr-TR')} gelen havale eşleştirilmeyi bekliyor</span>
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
          {!!todo.smsWaiting && (
            <Link href="/admin/sms-gonderimleri" className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 hover:border-sky-300">
              <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{todo.smsWaiting.toLocaleString('tr-TR')} SMS kuyrukta veya planlı</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Kurum geneli KPI kartları — yalnızca yetkili kullanıcıya gösterilir */}
          {seesAll && kpis && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Bugün toplanan"
                icon={HandCoins}
                value={formatMoney(kpis.today_cents, kpis.currency)}
                hint={<Change current={kpis.today_cents} previous={kpis.yesterday_cents} label="dünden" />}
                detail={{
                  title: 'Bugün Toplanan Bağış Özeti',
                  description: `Bugün: ${formatMoney(kpis.today_cents, kpis.currency)} · Dün: ${formatMoney(kpis.yesterday_cents, kpis.currency)}`,
                  content: () => (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b text-[11px] font-bold uppercase text-gray-500">
                            <tr><th className="py-2">Ödeme Yöntemi</th><th className="py-2 text-right">Adet</th><th className="py-2 text-right">Bugünkü Toplam</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {todayPayments.map((p) => (
                              <tr key={p.method}>
                                <td className="py-2 font-semibold">{p.method}</td>
                                <td className="py-2 text-right tabular-nums">{p.count}</td>
                                <td className="py-2 text-right font-semibold tabular-nums">{formatMoney(paymentCents(p), kpis.currency)}</td>
                              </tr>
                            ))}
                            {todayPayments.length === 0 && (
                              <tr><td colSpan={3} className="py-6 text-center text-gray-400">Bugün henüz onaylı bağış yok.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end">
                        <Link href="/admin/bagislar" className="text-xs font-bold text-primary-700 hover:underline">Tüm bağışlara git →</Link>
                      </div>
                    </div>
                  ),
                }}
              />
              <StatCard
                label="Bu ay toplanan"
                icon={TrendingUp}
                tone="brand"
                value={formatMoney(kpis.month_cents, kpis.currency)}
                hint={<Change current={kpis.month_cents} previous={kpis.last_month_to_date_cents} label="geçen ayın aynı dönemine göre" />}
                href={monthDonationsHref}
              />
              <StatCard
                label="Bağış yapan bağışçı"
                icon={UserPlus}
                value={kpis.donor_count.toLocaleString('tr-TR')}
                hint={`Bu ay ${kpis.new_donors_this_month.toLocaleString('tr-TR')} yeni bağışçı`}
                detail={{
                  title: `Bağışçı & Kanal Dağılımı (${PERIOD_LABELS[period]})`,
                  description: `Toplam ${kpis.donor_count.toLocaleString('tr-TR')} bağışçı · Bu ay ${kpis.new_donors_this_month} yeni`,
                  content: () => (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b text-[11px] font-bold uppercase text-gray-500">
                            <tr><th className="py-2">Ödeme Kanalı</th><th className="py-2 text-right">İşlem Adedi</th><th className="py-2 text-right">Tutar</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {payments.map((p) => (
                              <tr key={p.method}>
                                <td className="py-2 font-semibold">{p.method}</td>
                                <td className="py-2 text-right tabular-nums">{p.count}</td>
                                <td className="py-2 text-right font-semibold tabular-nums">{formatMoney(paymentCents(p), kpis.currency)}</td>
                              </tr>
                            ))}
                            {payments.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-gray-400">Kayıt yok.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end">
                        <Link href="/admin/bagiscilar" className="text-xs font-bold text-primary-700 hover:underline">Bağışçı listesine git →</Link>
                      </div>
                    </div>
                  ),
                }}
              />
              <StatCard
                label="Aktif kampanya"
                icon={Megaphone}
                value={kpis.active_campaigns}
                hint={`Toplam ${campaigns.length} kampanya`}
                detail={{
                  title: 'Kampanya İlerleme Listesi',
                  description: `${kpis.active_campaigns} aktif · Toplam ${campaigns.length} kampanya`,
                  content: () => (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b text-[11px] font-bold uppercase text-gray-500">
                            <tr><th className="py-2">Kampanya</th><th className="py-2 text-right">Toplanan</th><th className="py-2 text-right">Hedef</th><th className="py-2 text-right">Oran</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {campaigns.map((c, i) => (
                              <tr key={c.id || i}>
                                <td className="py-2 font-semibold">{c.title}</td>
                                <td className="py-2 text-right tabular-nums">{formatMoney(c.collected_cents ?? Math.round(c.collected_lira * 100), c.currency || 'TRY')}</td>
                                <td className="py-2 text-right tabular-nums text-gray-500">{c.target_lira ? formatMoney(c.target_cents ?? Math.round(c.target_lira * 100), c.currency || 'TRY') : '—'}</td>
                                <td className="py-2 text-right font-bold tabular-nums text-primary-700">%{Math.round(c.progress)}</td>
                              </tr>
                            ))}
                            {campaigns.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">Kampanya yok.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end">
                        <Link href="/admin/kampanyalar" className="text-xs font-bold text-primary-700 hover:underline">Kampanyaları yönet →</Link>
                      </div>
                    </div>
                  ),
                }}
              />
            </div>
          )}

          {/* Ana analiz ızgarası */}
          <div className="grid items-start gap-6 lg:grid-cols-12">
            {/* Sol: Aylık Bağış Trendi (yetkiliyse) veya Son Bağışlar */}
            {seesAll && (
              <div className="lg:col-span-8">
                <Card className="p-6 border border-gray-100 shadow-sm space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">
                        Aylık bağış trendi <span className="font-normal text-gray-400">· son {months} ay</span>
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Toplam <span className="font-semibold text-gray-800">{formatMoney(totalTrendCents, currency)}</span>
                        {totalTrendCount > 0 && <> · {totalTrendCount.toLocaleString('tr-TR')} onaylı işlem</>}
                      </p>
                    </div>
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
                      {([6, 12] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMonths(m)}
                          className={`rounded-md px-2.5 py-1 transition ${months === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                          {m} Ay
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeBar && (
                    <div className="flex items-center justify-between rounded-lg bg-primary-50/70 px-3 py-2 text-xs text-primary-900 border border-primary-100">
                      <span className="font-bold">{activeBar.month}</span>
                      <span className="tabular-nums font-semibold">
                        {formatMoney(trendCents(activeBar), currency)} · {(activeBar.count ?? 0).toLocaleString('tr-TR')} işlem
                      </span>
                    </div>
                  )}

                  {trends.length === 0 ? (
                    <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/50 text-sm text-gray-400">
                      Henüz bağış verisi yok.
                    </div>
                  ) : (
                    <div className="relative h-64 rounded-2xl border border-slate-100 bg-slate-50/50 pt-6 pb-2 px-3 sm:px-4">
                      {/* Y-axis kılavuz çizgileri */}
                      <div className="pointer-events-none absolute inset-x-3 sm:inset-x-4 top-6 bottom-9 flex flex-col justify-between">
                        {[1, 0.5, 0].map((ratio) => (
                          <div key={ratio} className="flex items-center gap-2">
                            <span className="w-14 shrink-0 text-right text-[10px] font-medium tabular-nums text-gray-400">
                              {ratio === 0 ? '0' : formatMoney(Math.round(maxTrendCents * ratio), currency)}
                            </span>
                            <div className="h-px flex-1 border-t border-dashed border-gray-200/80" />
                          </div>
                        ))}
                      </div>

                      {/* Çubuklar */}
                      <div className="relative z-10 flex h-full items-end gap-1.5 sm:gap-2 pl-16">
                        {trends.map((t, idx) => {
                          const cents = trendCents(t)
                          const pct = Math.max(cents > 0 ? 4 : 0, (cents / maxTrendCents) * 78)
                          const isSelected = selectedBar === idx
                          return (
                            <button
                              key={t.month}
                              type="button"
                              onClick={() => setSelectedBar(isSelected ? null : idx)}
                              aria-label={`${t.month}: ${formatMoney(cents, currency)}, ${t.count ?? 0} işlem`}
                              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 focus:outline-none"
                            >
                              <span className={`pointer-events-none whitespace-nowrap rounded border bg-white px-1.5 py-0.5 text-[10px] font-bold text-primary-700 shadow-sm transition-opacity ${
                                isSelected ? 'opacity-100 border-primary-300' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                              }`}>
                                {formatMoney(cents, currency)}
                              </span>
                              <div
                                style={{ height: `${pct}%` }}
                                className={`w-full max-w-11 rounded-t-lg transition-all duration-300 shadow-sm ${
                                  isSelected
                                    ? 'bg-primary-700 ring-2 ring-primary-300'
                                    : 'bg-primary-600/85 group-hover:bg-primary-700 group-focus-visible:bg-primary-700'
                                }`}
                              />
                              <span className="truncate max-w-full text-[10px] font-bold text-gray-500 pb-1">
                                {t.month.split(' ')[0]}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* Sağ sütun: Ödeme kanalları & Kampanya hedefleri */}
            <div className={`${seesAll ? 'lg:col-span-4' : 'lg:col-span-12 grid gap-6 md:grid-cols-2'} space-y-6`}>
              {seesAll && (
                <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b pb-2.5">
                    <h2 className="text-base font-bold text-gray-900">Ödeme kanalları</h2>
                    <select
                      aria-label="Ödeme kanalları dönemi"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value as ChannelPeriod)}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700 focus:border-primary-500 focus:outline-none"
                    >
                      {(Object.keys(PERIOD_LABELS) as ChannelPeriod[]).map((p) => (
                        <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
                      ))}
                    </select>
                  </div>
                  {payments.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3">{PERIOD_LABELS[period]} için henüz onaylı bağış yok.</p>
                  ) : (
                    <div className="space-y-3.5">
                      {payments.map((p, idx) => {
                        const cents = paymentCents(p)
                        const share = paymentTotalCents ? (cents / paymentTotalCents) * 100 : 0
                        return (
                          <div key={p.method} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2 text-xs font-bold text-gray-700">
                              <span className="truncate">{p.method} <span className="font-normal text-gray-400">({p.count})</span></span>
                              <span className="shrink-0 tabular-nums">
                                {formatMoney(cents, currency)} <span className="font-normal text-gray-400">· %{share.toFixed(0)}</span>
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${share}%` }}
                                className={`h-full rounded-full transition-all duration-300 ${['bg-emerald-600', 'bg-sky-600', 'bg-amber-500', 'bg-violet-500'][idx % 4]}`}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              )}

              <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-2.5">
                  <h2 className="text-base font-bold text-gray-900">Kampanya hedefleri</h2>
                  <Link href="/admin/kampanyalar" className="text-xs font-bold text-primary-700 hover:underline">
                    Tümü →
                  </Link>
                </div>
                {campaigns.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">Henüz kampanya bulunmuyor.</p>
                ) : (
                  <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
                    {campaigns.slice(0, 8).map((c, idx) => (
                      <Link
                        key={c.id || idx}
                        href="/admin/kampanyalar"
                        className="block space-y-1 rounded-lg p-1.5 -mx-1.5 transition hover:bg-gray-50"
                      >
                        <div className="flex justify-between gap-2 text-xs font-bold text-gray-700">
                          <span className="truncate">{c.title}</span>
                          <span className="shrink-0 tabular-nums text-primary-700">%{Math.min(100, c.progress).toFixed(0)}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, c.progress)}%` }}
                            className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 tabular-nums">
                          <span>{formatMoney(c.collected_cents ?? Math.round(c.collected_lira * 100), c.currency || 'TRY')}</span>
                          <span>{c.target_lira ? formatMoney(c.target_cents ?? Math.round(c.target_lira * 100), c.currency || 'TRY') : 'Hedefsiz'}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Son Gelen Bağışlar */}
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h2 className="text-base font-bold text-gray-900">
                {seesAll ? 'Son Gelen Bağışlar' : 'Son Kestiğim Makbuzlar'}
              </h2>
              <Link href="/admin/bagislar" className="text-xs font-bold text-primary-700 hover:underline">
                Tüm bağışlar →
              </Link>
            </div>
            {recentDonations.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Henüz bağış kaydı bulunmuyor.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b text-[11px] font-bold uppercase text-gray-500">
                    <tr>
                      <th className="py-2">Tarih</th>
                      <th className="py-2">Bağışçı</th>
                      <th className="py-2">Kampanya</th>
                      <th className="py-2">Ödeme</th>
                      <th className="py-2">Durum</th>
                      <th className="py-2 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentDonations.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50/70">
                        <td className="py-2.5 whitespace-nowrap text-gray-500">
                          {d.paid_at ? new Date(d.paid_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          <div className="font-mono text-[10px] text-gray-400">{d.receipt_number}</div>
                        </td>
                        <td className="py-2.5 font-semibold text-gray-900">
                          <Link href={`/admin/bagiscilar/${d.donor_id}`} className="hover:text-primary-700">
                            {d.donor_name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-gray-600">{d.campaign_title}</td>
                        <td className="py-2.5 text-gray-600">{d.payment_method}</td>
                        <td className="py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            d.status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {d.status === 'confirmed' ? 'Onaylı' : 'Beklemede'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-bold tabular-nums text-gray-900">
                          {formatMoney(d.amount_cents, d.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
