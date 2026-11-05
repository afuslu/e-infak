'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'

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
    <div className={`text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '↑' : '↓'} %{Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {label}
    </div>
  )
}

interface PaymentMethod {
  method: string
  count: number
  total_lira: number
}

export default function AdminDashboardPage() {
  const [trends, setTrends] = useState<MonthlyTrend[]>([])
  const [campaigns, setCampaigns] = useState<CampaignProgress[]>([])
  const [payments, setPayments] = useState<PaymentMethod[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(false)

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/analytics/stats`, { headers })
      setTrends(res.data.monthly_donations)
      setCampaigns(res.data.campaigns_progress)
      setPayments(res.data.payment_methods)
      setKpis(res.data.kpis)
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Find max monthly trend value to scale CSS bars dynamically
  const maxTrend = Math.max(1, ...trends.map(t => t.total_lira))
  const paymentTotal = payments.reduce((sum, p) => sum + p.total_lira, 0)

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Analitik Kontrol Paneli</h1>
        <button
          onClick={loadAnalytics}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6 border border-gray-100 shadow-sm">
          <div className="mb-2 text-sm text-gray-600 font-bold uppercase tracking-wider text-[10px]">Bugün Toplanan</div>
          <div className="mb-1 text-3xl font-black text-gray-950">{kpis ? money(kpis.today_cents) : '—'}</div>
          {kpis && <Change current={kpis.today_cents} previous={kpis.yesterday_cents} label="dünden" />}
        </Card>

        <Card className="p-6 border border-gray-100 shadow-sm">
          <div className="mb-2 text-sm text-gray-600 font-bold uppercase tracking-wider text-[10px]">Bu Ay Toplanan</div>
          <div className="mb-1 text-3xl font-black text-primary-600">{kpis ? money(kpis.month_cents) : '—'}</div>
          {kpis && <Change current={kpis.month_cents} previous={kpis.last_month_to_date_cents} label="geçen ayın aynı dönemine göre" />}
        </Card>

        <Card className="p-6 border border-gray-100 shadow-sm">
          <div className="mb-2 text-sm text-gray-600 font-bold uppercase tracking-wider text-[10px]">Bağış Yapan Bağışçı</div>
          <div className="mb-1 text-3xl font-black text-gray-950">{kpis ? kpis.donor_count.toLocaleString('tr-TR') : '—'}</div>
          {kpis && <div className="text-xs text-blue-600 font-semibold">Bu ay {kpis.new_donors_this_month} yeni bağışçı</div>}
        </Card>

        <Card className="p-6 border border-gray-100 shadow-sm">
          <div className="mb-2 text-sm text-gray-600 font-bold uppercase tracking-wider text-[10px]">Aktif Kampanyalar</div>
          <div className="mb-1 text-3xl font-black text-gray-950">{kpis ? kpis.active_campaigns : '—'}</div>
          <div className="text-xs text-gray-400 font-semibold">Toplam {campaigns.length} kampanya</div>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse text-center py-12">Analiz verileri yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Interactive Monthly Donations Bar Chart */}
          <div className="lg:col-span-8">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-6">
              <div className="border-b pb-2">
                <h2 className="text-lg font-bold text-gray-900">Aylık Bağış Trendi (Son 6 Ay)</h2>
              </div>

              {/* Dynamic CSS Bar Chart */}
              <div className="flex justify-between items-end h-64 pt-6 px-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                {trends.map((t, idx) => {
                  const pct = (t.total_lira / maxTrend) * 80 // Max height 80%
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2 group w-1/8">
                      {/* Tooltip value */}
                      <span className="text-[9px] font-bold text-primary-700 opacity-0 group-hover:opacity-100 transition-opacity bg-white border px-1.5 py-0.5 rounded shadow-sm">
                        {t.total_lira.toLocaleString('tr-TR')} ₺
                      </span>
                      {/* Bar */}
                      <div 
                        style={{ height: `${pct}%` }} 
                        className="w-12 bg-primary-600/90 hover:bg-primary-700 rounded-t-lg transition-all duration-500 shadow-sm cursor-pointer"
                      />
                      {/* Label */}
                      <span className="text-[10px] text-gray-500 font-bold mt-1 pb-2">{t.month}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* Right: Payment Channels & Campaign Progress Gauges */}
          <div className="lg:col-span-4 space-y-6">
            {/* Payment breakdowns */}
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-[11px] text-gray-400">Ödeme Kanalları (Bu Yıl)</h2>
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
              <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-[11px] text-gray-400">Kampanya Doluluk Puanları</h2>
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
