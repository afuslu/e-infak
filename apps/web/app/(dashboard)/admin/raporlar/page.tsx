'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Printer, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, apiErrorMessage, downloadFile, formatMoney, hasFeature, useAdminAccess } from '../../../../lib/admin-access'
import { ExportButtons, PageHeader, StatCard, type StatCardDetail, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

type ReportKey = 'monthly' | 'daily' | 'yearly' | 'campaigns' | 'staff' | 'donors' | 'recurring' | 'channels' | 'sources' | 'types'

const REPORTS: { key: ReportKey; label: string; advanced: boolean }[] = [
  { key: 'monthly', label: 'Aylık Bağış', advanced: false },
  { key: 'daily', label: 'Günlük Toplam', advanced: true },
  { key: 'yearly', label: 'Yıllık Karşılaştırma', advanced: true },
  { key: 'campaigns', label: 'Kampanyalar', advanced: true },
  { key: 'staff', label: 'Personel Makbuz', advanced: true },
  { key: 'donors', label: 'Bağışçı Sayısı', advanced: true },
  { key: 'recurring', label: 'Düzenli Bağışlar', advanced: true },
  { key: 'channels', label: 'Bağış Kanalı Dağılımı', advanced: true },
  { key: 'sources', label: 'Bağışçı Kaynağı', advanced: true },
  { key: 'types', label: 'Türlere Göre Bağış', advanced: true },
]

/** STK PRO's 12 report cards ("Aşağıdaki 12 rapordan birini seçin"); detailed ones open the list screens. */
const CARDS: { title: string; text: string; report?: ReportKey; href?: string }[] = [
  { title: 'Günlere Göre Yapılan Toplam Bağış Tutarı', text: 'Seçilen aralıkta gün gün toplam bağış (grafik + tablo).', report: 'daily' },
  { title: 'Aylık Bazda Bağış Raporu', text: 'Seçilen yılda ay ay bağış toplamları.', report: 'monthly' },
  { title: 'Son 5 Yıl Karşılaştırmalı Rapor', text: 'Son 5 yılın aylık bazda karşılaştırması.', report: 'yearly' },
  { title: 'En Çok Bağış Yapılan Kampanyalar', text: 'Bağış toplamına göre en çok bağış alan kampanyalar.', report: 'campaigns' },
  { title: 'Bağış Kanalı Dağılımı', text: 'Ödeme şekline ve kanala göre bağış dağılımı; aralık boşsa tüm zamanlar.', report: 'channels' },
  { title: 'Bağışçı Kaynağı', text: 'Bağışçıların referans/kaynak dağılımı; aralık üyelik tarihine uygulanır.', report: 'sources' },
  { title: 'Personel Makbuz Raporu', text: 'Tarih aralığında personel başına makbuz adedi ve tutarı.', report: 'staff' },
  { title: 'Personel Makbuz Raporu (Detaylı)', text: 'Personel bazında makbuz dökümü (Makbuzlar ekranında Personel sütunundan filtreleyin).', href: '/admin/makbuzlar' },
  { title: 'Kampanya/Bağış Raporu', text: 'Tarih aralığında kampanya bazında bağış toplamları.', report: 'campaigns' },
  { title: 'Kampanya/Bağış Raporu (Detaylı)', text: 'Kampanya bazında bağış dökümü (Tüm Bağışlar ekranında kampanyayı seçin).', href: '/admin/bagislar' },
  { title: 'Türlere Göre Bağış Raporu', text: 'Bağış türlerine (standart, kurban, su kuyusu, proje…) göre dağılım.', report: 'types' },
  { title: 'Bağışçı Sayısı Raporu', text: 'Tarih aralığında bağışçı sayıları.', report: 'donors' },
]
const RANGE_REPORTS: ReportKey[] = ['daily', 'campaigns', 'staff', 'donors', 'channels', 'sources', 'types']

const ENDPOINTS: Record<ReportKey, string> = {
  monthly: '/reports/monthly',
  daily: '/reports/daily',
  yearly: '/reports/yearly-comparison',
  campaigns: '/reports/campaigns',
  staff: '/reports/staff-receipts',
  donors: '/reports/donors',
  recurring: '/reports/recurring',
  channels: '/reports/channels',
  sources: '/reports/sources',
  types: '/reports/types',
}

// Local calendar date; toISOString() would shift to UTC and land on the previous day in Türkiye.
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const
const CHART_COLORS = ['#059669', '#0284c7', '#7c3aed', '#d97706', '#e11d48', '#475569', '#0d9488']

function DeltaBadge({ pct, label = 'önceki döneme göre' }: { pct: number | null | undefined; label?: string }) {
  if (pct === null || pct === undefined) return null
  const up = pct >= 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}%{pct.toLocaleString('tr-TR')} {label}
    </span>
  )
}

function Bars({
  items,
  currency,
  isCount = false,
  allowCumulative = false,
}: {
  items: { label: string; value: number; sub?: string }[]
  currency: string
  isCount?: boolean
  allowCumulative?: boolean
}) {
  const [cumulative, setCumulative] = useState(false)
  const displayItems = useMemo(() => {
    if (!cumulative) return items
    let acc = 0
    return items.map((i) => {
      acc += i.value
      return { ...i, value: acc }
    })
  }, [items, cumulative])

  const max = Math.max(1, ...displayItems.map((i) => i.value))
  const fmt = (v: number) => (isCount ? v.toLocaleString('tr-TR') : formatMoney(v, currency))

  return (
    <div className="space-y-2">
      {allowCumulative && (
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setCumulative(false)}
              className={`rounded-md px-2.5 py-1 font-medium ${!cumulative ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Dönemsel
            </button>
            <button
              type="button"
              onClick={() => setCumulative(true)}
              className={`rounded-md px-2.5 py-1 font-medium ${cumulative ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Kümülatif
            </button>
          </div>
        </div>
      )}
      <div className="relative flex h-60 items-end gap-1.5 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50 px-3 pt-7 pb-1">
        <div className="pointer-events-none absolute inset-x-3 top-7 bottom-7 flex flex-col justify-between text-[9px] text-slate-400">
          <div className="border-b border-dashed border-slate-200/80 pb-0.5">{fmt(max)}</div>
          <div className="border-b border-dashed border-slate-200/80 pb-0.5">{fmt(Math.round(max / 2))}</div>
          <div />
        </div>
        {displayItems.map((item, idx) => (
          <div key={idx} className="group relative z-10 flex h-full min-w-[24px] flex-1 flex-col items-center justify-end gap-1">
            <span className="pointer-events-none whitespace-nowrap rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 opacity-0 shadow-sm transition group-hover:opacity-100">
              {fmt(item.value)}{item.sub ? ` · ${item.sub}` : ''}
            </span>
            <div
              style={{ height: `${Math.max(item.value > 0 ? 3 : 0, (item.value / max) * 76)}%` }}
              className="w-full max-w-10 rounded-t-md bg-emerald-600/85 transition-all group-hover:bg-emerald-700"
            />
            <span className="pb-1 text-[10px] font-semibold text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutBreakdown({
  title,
  items,
  currency,
  isCount = false,
}: {
  title: string
  items: { label: string; value: number; count?: number }[]
  currency: string
  isCount?: boolean
}) {
  const total = items.reduce((s, i) => s + i.value, 0)
  const fmt = (v: number) => (isCount ? v.toLocaleString('tr-TR') : formatMoney(v, currency))
  const r = 38
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <Card className="border border-gray-100 p-5 shadow-sm space-y-3">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      {total === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Veri bulunmuyor.</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
            {items.map((item, idx) => {
              const frac = item.value / total
              const dash = frac * c
              const el = (
                <circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += dash
              return el
            })}
          </svg>
          <div className="w-full space-y-2">
            {items.slice(0, 6).map((item, idx) => {
              const pct = Math.round((item.value * 1000) / total) / 10
              return (
                <div key={idx} className="space-y-0.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700 truncate">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      {item.label}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                      {fmt(item.value)} <span className="text-slate-400 font-normal">(%{pct})</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

function MultiYearChart({ years, monthLabels, currency }: { years: any[]; monthLabels: string[]; currency: string }) {
  const max = Math.max(1, ...years.flatMap((y) => y.months as number[]))
  const w = 640
  const h = 210
  const padX = 30
  const padY = 20
  const innerW = w - padX * 2
  const innerH = h - padY * 2

  return (
    <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">Aylık Trend Karşılaştırması</span>
        <div className="flex flex-wrap gap-3 text-xs">
          {years.map((y, idx) => (
            <span key={y.year} className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
              {y.year} ({formatMoney(y.total_cents, currency)})
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[480px] h-52">
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const yPos = padY + innerH * (1 - t)
            return <line key={i} x1={padX} x2={w - padX} y1={yPos} y2={yPos} stroke="#e2e8f0" strokeDasharray="3 3" />
          })}
          {years.map((yr, idx) => {
            const color = CHART_COLORS[idx % CHART_COLORS.length]
            const pts = (yr.months as number[])
              .map((val, mIdx) => {
                const x = padX + (mIdx / 11) * innerW
                const yPos = padY + innerH * (1 - val / max)
                return `${x},${yPos}`
              })
              .join(' ')
            return (
              <g key={yr.year}>
                <polyline fill="none" stroke={color} strokeWidth="2.4" points={pts} />
                {(yr.months as number[]).map((val, mIdx) => {
                  const x = padX + (mIdx / 11) * innerW
                  const yPos = padY + innerH * (1 - val / max)
                  return (
                    <circle key={mIdx} cx={x} cy={yPos} r="3.2" fill={color}>
                      <title>{`${yr.year} ${monthLabels[mIdx]}: ${formatMoney(val, currency)}`}</title>
                    </circle>
                  )
                })}
              </g>
            )
          })}
          {monthLabels.map((lbl, mIdx) => {
            const x = padX + (mIdx / 11) * innerW
            return (
              <text key={lbl} x={x} y={h - 4} textAnchor="middle" fontSize="9" fill="#64748b">
                {lbl.slice(0, 3)}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function StatusSummaryCard({ summary, currency }: { summary?: any; currency: string }) {
  if (!summary) return null
  return (
    <Card className="border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Finansal Mutabakat & Tahsilat Özeti</h3>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
          Net Tahsilat Oranı: %{summary.collection_rate_pct}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
        <div className="rounded-lg border border-emerald-200 bg-white p-2.5">
          <div className="text-slate-500">Onaylanan</div>
          <div className="mt-0.5 font-bold text-emerald-700">{formatMoney(summary.confirmed_cents, currency)}</div>
          <div className="text-[11px] text-slate-400">{summary.confirmed_count} işlem</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white p-2.5">
          <div className="text-slate-500">Bekleyen Havale/İşlem</div>
          <div className="mt-0.5 font-bold text-amber-700">{formatMoney(summary.pending_cents, currency)}</div>
          <div className="text-[11px] text-slate-400">{summary.pending_count} işlem</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-white p-2.5">
          <div className="text-slate-500">İade / İptal</div>
          <div className="mt-0.5 font-bold text-rose-700">
            {formatMoney((summary.refunded_cents || 0) + (summary.cancelled_cents || 0), currency)}
          </div>
          <div className="text-[11px] text-slate-400">
            {(summary.refunded_count || 0) + (summary.cancelled_count || 0)} işlem
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="text-slate-500">Başarısız Deneme</div>
          <div className="mt-0.5 font-bold text-slate-700">{formatMoney(summary.failed_cents, currency)}</div>
          <div className="text-[11px] text-slate-400">{summary.failed_count} işlem</div>
        </div>
      </div>
    </Card>
  )
}

function ReportTable({ header, rows }: { header: string[]; rows: (string | number | ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <Tr>
            {header.map((h, i) => <Th key={h} className={`pb-2 ${i > 0 ? 'text-right' : ''}`}>{h}</Th>)}
          </Tr>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <Tr><Td colSpan={header.length} className="text-center text-gray-400">Bu aralıkta kayıt yok.</Td></Tr>
          ) : rows.map((row, i) => (
            <Tr key={i}>
              {row.map((cell, j) => <Td key={j} className={`py-2 ${j > 0 ? 'text-right tabular-nums' : 'font-semibold text-gray-900'}`}>{cell}</Td>)}
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

interface SortCol {
  label: string
  sortKey?: string
}

function SortableReportTable({
  columns,
  rows,
  searchPlaceholder = 'Tabloda ara...',
}: {
  columns: SortCol[]
  rows: { searchText: string; sortValues: Record<string, number | string>; cells: (string | number | ReactNode)[] }[]
  searchPlaceholder?: string
}) {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? rows.filter((r) => r.searchText.toLowerCase().includes(q)) : rows
    if (!sortBy) return base
    return [...base].sort((a, b) => {
      const av = a.sortValues[sortBy] ?? 0
      const bv = b.sortValues[sortBy] ?? 0
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc' ? String(av).localeCompare(String(bv), 'tr') : String(bv).localeCompare(String(av), 'tr')
    })
  }, [rows, query, sortBy, sortDir])

  const toggleSort = (key?: string) => {
    if (!key) return
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs print:hidden">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs outline-none focus:border-emerald-500"
        />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              {columns.map((col, i) => (
                <Th key={col.label} className={`pb-2 ${i > 0 ? 'text-right' : ''}`}>
                  {col.sortKey ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.sortKey)}
                      className={`inline-flex items-center gap-1 hover:text-slate-900 ${i > 0 ? 'justify-end' : ''}`}
                    >
                      {col.label}
                      {sortBy === col.sortKey ? (
                        sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {filtered.length === 0 ? (
              <Tr><Td colSpan={columns.length} className="text-center text-gray-400">Eşleşen kayıt yok.</Td></Tr>
            ) : filtered.map((row, i) => (
              <Tr key={i}>
                {row.cells.map((cell, j) => (
                  <Td key={j} className={`py-2 ${j > 0 ? 'text-right tabular-nums' : 'font-semibold text-gray-900'}`}>
                    {cell}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  detail,
  delta,
}: {
  label: string
  value: string | number
  detail?: StatCardDetail
  delta?: number | null
}) {
  return (
    <div className="space-y-1">
      <StatCard label={label} value={value} detail={detail} />
      {delta !== undefined && delta !== null && (
        <div className="px-1">
          <DeltaBadge pct={delta} />
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const { data: access } = useAdminAccess()
  const advancedEnabled = hasFeature(access, 'reports_advanced')
  const today = new Date()

  const [report, setReportKey] = useState<ReportKey>('monthly')
  // STK PRO opens on the report cards; picking one (or a ?tab= link) shows that report.
  const [home, setHome] = useState(true)
  const setReport = (key: ReportKey) => { setReportKey(key); setHome(false) }
  const [currency, setCurrency] = useState('TRY')
  const [year, setYear] = useState(today.getFullYear())
  const [yearsCount, setYearsCount] = useState(5)
  const [ytd, setYtd] = useState(false)
  const [start, setStart] = useState(isoDate(new Date(today.getFullYear(), 0, 1)))
  const [end, setEnd] = useState(isoDate(today))
  const [dataState, setDataState] = useState<{ key: ReportKey; payload: any } | null>(null)
  const data = dataState?.key === report ? dataState.payload : null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [segments, setSegments] = useState<{ key: string; label: string; count: number; description: string }[]>([])

  useEffect(() => {
    if (!home || !advancedEnabled) return
    let active = true
    adminGet<{ segments: { key: string; label: string; count: number; description: string }[] }>('/reports/donor-segments')
      .then((r) => { if (active) setSegments(r.data.segments || []) })
      .catch(() => {})
    return () => { active = false }
  }, [home, advancedEnabled, reloadKey])

  // Hydrate initial filters from URL query parameters
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get('tab') as ReportKey | null
    if (t && REPORTS.some((r) => r.key === t)) setReport(t)
    const cur = sp.get('currency')
    if (cur && (CURRENCIES as readonly string[]).includes(cur)) setCurrency(cur)
    const yr = Number(sp.get('year'))
    if (yr >= 2000 && yr <= 2100) setYear(yr)
    const yrs = Number(sp.get('years'))
    if (yrs >= 2 && yrs <= 10) setYearsCount(yrs)
    if (sp.get('ytd') === '1') setYtd(true)
    const s = sp.get('start')
    const e = sp.get('end')
    if (s) setStart(s)
    if (e) setEnd(e)
  }, [])

  // Persist filters to URL query parameters
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams()
    sp.set('tab', report)
    sp.set('currency', currency)
    if (report === 'monthly') sp.set('year', String(year))
    if (report === 'yearly') {
      sp.set('years', String(yearsCount))
      if (ytd) sp.set('ytd', '1')
    }
    if (RANGE_REPORTS.includes(report)) {
      sp.set('start', start)
      sp.set('end', end)
    }
    window.history.replaceState(null, '', home ? window.location.pathname : `?${sp.toString()}`)
  }, [report, currency, year, yearsCount, ytd, start, end, home])

  const applyPreset = (preset: '7d' | '30d' | 'this_month' | 'last_month' | 'this_year') => {
    const now = new Date()
    if (preset === '7d') {
      const s = new Date(now)
      s.setDate(now.getDate() - 6)
      setStart(isoDate(s))
      setEnd(isoDate(now))
    } else if (preset === '30d') {
      const s = new Date(now)
      s.setDate(now.getDate() - 29)
      setStart(isoDate(s))
      setEnd(isoDate(now))
    } else if (preset === 'this_month') {
      setStart(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)))
      setEnd(isoDate(now))
    } else if (preset === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      setStart(isoDate(first))
      setEnd(isoDate(last))
    } else {
      setStart(isoDate(new Date(now.getFullYear(), 0, 1)))
      setEnd(isoDate(now))
    }
  }

  const params = useMemo(() => {
    if (report === 'monthly') return { year, currency }
    if (report === 'yearly') return { years: yearsCount, ytd, currency }
    if (report === 'recurring') return { currency }
    return { start, end, currency }
  }, [report, year, yearsCount, ytd, start, end, currency])

  useEffect(() => {
    const meta = REPORTS.find((r) => r.key === report)
    if (home) return
    if (meta?.advanced && !advancedEnabled) {
      setDataState(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    adminGet<any>(ENDPOINTS[report], params)
      .then((res) => { if (!cancelled) setDataState({ key: report, payload: res.data }) })
      .catch((err) => { if (!cancelled) { setDataState(null); setError(apiErrorMessage(err, 'Rapor yüklenemedi')) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [report, params, advancedEnabled, reloadKey, home])

  const locked = REPORTS.find((r) => r.key === report)?.advanced && !advancedEnabled
  const money = (cents: number) => formatMoney(cents, currency)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raporlar"
        description="Bağış, kampanya, tahsilat, bağışçı ve düzenli abonelik performansını dönemsel kıyaslamalarla analiz edin."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
            {report === 'monthly' && (
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border bg-white p-2 font-semibold">
                {Array.from({ length: 6 }, (_, i) => today.getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {report === 'yearly' && (
              <>
                <select value={yearsCount} onChange={(e) => setYearsCount(Number(e.target.value))} className="rounded-lg border bg-white p-2 font-semibold">
                  {[2, 3, 5, 10].map((n) => <option key={n} value={n}>Son {n} Yıl</option>)}
                </select>
                <label className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={ytd} onChange={(e) => setYtd(e.target.checked)} className="accent-emerald-600" />
                  Yıl Başından Bugüne (YTD)
                </label>
              </>
            )}
            {RANGE_REPORTS.includes(report) && !home && (
              <>
                <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="rounded-lg border bg-white p-2" />
                <span className="text-gray-400">–</span>
                <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border bg-white p-2" />
              </>
            )}
            <button
              type="button"
              onClick={() => void downloadFile('/admin-features/reports/derbis-summary.pdf', `derbis-icmal-${year}.pdf`, { year })}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              DERBİS İcmal PDF ({year})
            </button>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border bg-white p-2 font-semibold">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c === 'TRY' ? 'TL' : c}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100">
              <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Yazdır
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <label className="flex min-w-[280px] flex-1 items-center gap-2 text-sm">
          <span className="whitespace-nowrap text-gray-500">Tüm Raporlar</span>
          <select value={home ? '' : report} onChange={(e) => (e.target.value ? setReport(e.target.value as ReportKey) : setHome(true))}
            className="w-full rounded-lg border bg-white p-2.5 font-semibold">
            <option value="">Rapor seçin…</option>
            {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}{r.advanced && !advancedEnabled ? ' (üst pakette)' : ''}</option>)}
          </select>
        </label>
        {RANGE_REPORTS.includes(report) && !home && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {([
              ['7d', 'Son 7 Gün'],
              ['30d', 'Son 30 Gün'],
              ['this_month', 'Bu Ay'],
              ['last_month', 'Geçen Ay'],
              ['this_year', 'Bu Yıl'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:border-emerald-500 hover:text-emerald-700"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {home ? (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
          <h2 className="text-[16px] font-bold text-gray-900">Raporlar</h2>
          <p className="mb-4 text-[13px] text-gray-500">Aşağıdaki {CARDS.length} rapordan birini seçin; grafikler ve tablolar seçtiğiniz filtrelere göre hesaplanır. Üstteki listeden de seçebilirsiniz.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CARDS.map((c) => {
              const cls = 'block h-full rounded-xl border border-gray-200 p-4 text-left transition hover:border-primary-400 hover:shadow-sm'
              const inner = <><div className="text-[14.5px] font-bold text-gray-900">{c.title}</div><p className="mt-1.5 text-[12.5px] text-gray-500">{c.text}</p></>
              return c.href
                ? <Link key={c.title} href={c.href} className={cls}>{inner}</Link>
                : <button key={c.title} type="button" onClick={() => setReport(c.report!)} className={cls}>{inner}</button>
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
            <button type="button" onClick={() => setReport('recurring')} className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50">Düzenli Bağışlar</button>
            <Link href="/admin/ai" className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50">AI Öngörüleri</Link>
            {advancedEnabled && (
              <>
                <button type="button" onClick={() => void downloadFile('/admin-features/reports/derbis-export', `derbis-makbuzlar-${year}.csv`, { kind: 'receipts', year })} className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100">DERBİS Makbuz CSV ({year})</button>
                <button type="button" onClick={() => void downloadFile('/admin-features/reports/derbis-export', `derbis-uyeler-${year}.csv`, { kind: 'members', year })} className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100">DERBİS Üye CSV</button>
                <button type="button" onClick={() => void downloadFile('/admin-features/reports/derbis-export', `derbis-yardimlar-${year}.csv`, { kind: 'aid', year })} className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100">DERBİS Yardım CSV ({year})</button>
              </>
            )}
          </div>
          {segments.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="mb-3 text-[14.5px] font-bold text-gray-900">Akıllı Bağışçı Segmentleri</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {segments.map((s) => (
                  <div key={s.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="text-2xl font-extrabold text-primary-700">{s.count.toLocaleString('tr-TR')}</div>
                    <div className="mt-0.5 text-[13px] font-bold text-gray-900">{s.label}</div>
                    <p className="mt-1 text-[11.5px] text-gray-500">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : locked ? (
        <Card className="border border-gray-100 p-8 text-center shadow-sm">
          <p className="mb-4 text-sm text-gray-600">Bu rapor <strong>Gelişmiş Raporlar</strong> modülünün parçası ve kurumunuzun paketinde yer almıyor.</p>
          <Link href="/admin/paket" className="text-sm font-semibold text-primary-700 hover:underline">Paketleri karşılaştır →</Link>
        </Card>
      ) : error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : loading || !data ? (
        <p className="py-12 text-center text-sm text-gray-500 animate-pulse">Rapor hazırlanıyor...</p>
      ) : (
        <ReportBody report={report} data={data} money={money} currency={currency} />
      )}
    </div>
  )
}

function SplitTable({ title, rows, money, countLabel = 'Adet' }: { title: string; rows: { label: string; count: number; total_cents: number }[]; money: (c: number) => string; countLabel?: string }) {
  const total = rows.reduce((n, r) => n + r.total_cents, 0)
  return (
    <Card className="border border-gray-100 p-5 shadow-sm">
      <h3 className="mb-3 font-bold text-gray-900">{title}</h3>
      <Table>
        <THead><Tr><Th>Kalem</Th><Th className="text-right">{countLabel}</Th><Th className="text-right">Tutar</Th><Th className="text-right">Pay</Th></Tr></THead>
        <TBody>
          {rows.map((r) => (
            <Tr key={r.label}>
              <Td className="font-semibold">{r.label}</Td>
              <Td className="text-right tabular-nums">{r.count.toLocaleString('tr-TR')}</Td>
              <Td className="text-right tabular-nums">{money(r.total_cents)}</Td>
              <Td className="text-right tabular-nums">%{total ? ((r.total_cents * 100) / total).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : 0}</Td>
            </Tr>
          ))}
          {!rows.length && <Tr><Td className="py-6 text-center text-gray-400">Kayıt yok.</Td></Tr>}
        </TBody>
      </Table>
    </Card>
  )
}

function ReportBody({ report, data, money, currency }: { report: ReportKey; data: any; money: (c: number) => string; currency: string }) {
  if (report === 'channels') {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <DonutBreakdown title="Ödeme Şekli" items={data.methods.map((m: any) => ({ label: m.label, value: m.total_cents, count: m.count }))} currency={currency} />
        <DonutBreakdown title="Bağış Kanalı" items={data.channels.map((m: any) => ({ label: m.label, value: m.total_cents, count: m.count }))} currency={currency} />
        <SplitTable title="Ödeme Şekline Göre" rows={data.methods} money={money} />
        <SplitTable title="Kanala Göre" rows={data.channels} money={money} />
      </div>
    )
  }
  if (report === 'sources') {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <DonutBreakdown title="Bağışçı Kaynağı (kişi)" isCount items={data.sources.map((m: any) => ({ label: m.label, value: m.count }))} currency={currency} />
        <DonutBreakdown title="Üyelik Tipi (kişi)" isCount items={data.membership_types.map((m: any) => ({ label: m.label, value: m.count }))} currency={currency} />
        <SplitTable title="Kaynağa Göre (bağışçı / toplam bağışları)" rows={data.sources} money={money} countLabel="Bağışçı" />
        <SplitTable title="Üyelik Tipine Göre" rows={data.membership_types} money={money} countLabel="Bağışçı" />
      </div>
    )
  }
  if (report === 'types') {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <DonutBreakdown title="Kampanya Türü" items={data.types.map((m: any) => ({ label: m.label, value: m.total_cents, count: m.count }))} currency={currency} />
        <DonutBreakdown title="Bağış Türü" items={data.categories.map((m: any) => ({ label: m.label, value: m.total_cents, count: m.count }))} currency={currency} />
        <SplitTable title="Kampanya Türüne Göre" rows={data.types} money={money} />
        <SplitTable title="Bağış Türüne Göre" rows={data.categories} money={money} />
      </div>
    )
  }
  if (report === 'monthly') {
    const rows = data.months.map((m: any) => [m.label, m.count, m.donor_count, money(m.total_cents)])
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label={`${data.year} toplam`}
            value={money(data.total_cents)}
            delta={data.change_pct}
            detail={{
              title: `${data.year} Aylık Bağış Dökümü`,
              content: () => <ReportTable header={['Ay', 'Bağış adedi', 'Bağışçı', 'Toplam']} rows={rows} />,
            }}
          />
          <Stat
            label="Bağış adedi"
            value={data.count.toLocaleString('tr-TR')}
            detail={{
              title: `${data.year} Ödeme Kanalları`,
              content: () => <ReportTable header={['Kanal', 'Adet', 'Toplam']} rows={data.payment_methods.map((p: any) => [p.label, p.count, money(p.total_cents)])} />,
            }}
          />
          <Stat
            label="Ortalama bağış"
            value={data.count ? money(Math.round(data.total_cents / data.count)) : '—'}
            detail={{
              title: `${data.year} Ay Bazlı Ortalamalar`,
              content: () => (
                <ReportTable
                  header={['Ay', 'Bağış adedi', 'Ortalama']}
                  rows={data.months.map((m: any) => [m.label, m.count, m.count ? money(Math.round(m.total_cents / m.count)) : '—'])}
                />
              ),
            }}
          />
        </div>
        <StatusSummaryCard summary={data.status_summary} currency={currency} />
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <Bars allowCumulative currency={currency} items={data.months.map((m: any) => ({ label: m.label.slice(0, 3), value: m.total_cents, sub: `${m.count} bağış` }))} />
          <ExportButton name={`aylik-bagis-${data.year}.csv`} header={['Ay', 'Bağış adedi', 'Bağışçı', 'Toplam']} rows={rows} />
          <ReportTable header={['Ay', 'Bağış adedi', 'Bağışçı', 'Toplam']} rows={rows} />
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <DonutBreakdown
            title="Ödeme kanalları dağılımı"
            currency={currency}
            items={data.payment_methods.map((p: any) => ({ label: p.label, value: p.total_cents, count: p.count }))}
          />
          <Card className="border border-gray-100 p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-900">Ödeme kanalları tablosu</h2>
            <ReportTable header={['Kanal', 'Adet', 'Toplam']} rows={data.payment_methods.map((p: any) => [p.label, p.count, money(p.total_cents)])} />
          </Card>
        </div>
      </div>
    )
  }

  if (report === 'daily') {
    const rows = data.days.map((d: any) => [d.date.split('-').reverse().join('.'), d.count, money(d.total_cents)])
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Aralık toplamı"
            value={money(data.total_cents)}
            delta={data.change_pct}
            detail={{
              title: 'Günlük Bağış Dökümü',
              content: () => <ReportTable header={['Tarih', 'Adet', 'Toplam']} rows={[...rows].reverse()} />,
            }}
          />
          <Stat
            label="Bağış adedi"
            value={data.count.toLocaleString('tr-TR')}
            detail={{
              title: 'Günlük Bağış Adetleri',
              content: () => <ReportTable header={['Tarih', 'Adet', 'Toplam']} rows={[...rows].reverse().filter((r) => Number(r[1]) > 0)} />,
            }}
          />
        </div>
        <StatusSummaryCard summary={data.status_summary} currency={currency} />
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <Bars allowCumulative currency={currency} items={data.days.map((d: any) => ({ label: d.date.slice(8, 10), value: d.total_cents, sub: d.date }))} />
          <ExportButton name={`gunluk-bagis-${data.start}-${data.end}.csv`} header={['Tarih', 'Adet', 'Toplam']} rows={rows} />
          <ReportTable header={['Tarih', 'Adet', 'Toplam']} rows={[...rows].reverse()} />
        </Card>
      </div>
    )
  }

  if (report === 'yearly') {
    const header = ['Yıl', ...data.month_labels.map((m: string) => m.slice(0, 3)), 'Toplam', 'Değişim']
    const rows = data.years.map((y: any) => [
      y.year,
      ...y.months.map((c: number) => (c ? money(c) : '—')),
      money(y.total_cents),
      y.change_pct === null ? '—' : `%${y.change_pct.toLocaleString('tr-TR')}`,
    ])
    return (
      <div className="space-y-4">
        <MultiYearChart years={data.years} monthLabels={data.month_labels} currency={currency} />
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <Bars currency={currency} items={data.years.map((y: any) => ({ label: String(y.year), value: y.total_cents, sub: `${y.count} bağış` }))} />
          <ExportButton name="yillik-karsilastirma.csv" header={header} rows={rows} />
          <ReportTable header={header} rows={rows} />
        </Card>
      </div>
    )
  }

  if (report === 'campaigns') {
    const header = ['Kampanya', 'Bağış adedi', 'Bağışçı', 'Ortalama', 'Pay', 'Hedef doluluk', 'Toplam']
    const exportRows = data.campaigns.map((c: any) => [
      c.title, c.count, c.donor_count, money(c.average_cents), `%${c.share_pct}`,
      c.progress_pct === null ? '—' : `%${c.progress_pct}`, money(c.total_cents),
    ])
    const typeRows = (data.categories || []).map((t: any) => [t.label, t.count, `%${t.share_pct}`, money(t.total_cents)])
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Aralık toplamı"
            value={money(data.total_cents)}
            delta={data.change_pct}
            detail={{
              title: 'Kampanya Dağılımı',
              content: () => <ReportTable header={header} rows={exportRows} />,
            }}
          />
          <Stat
            label="Aktif kampanya (bağış alan)"
            value={data.campaigns.length}
          />
        </div>
        <StatusSummaryCard summary={data.status_summary} currency={currency} />
        <div className="grid gap-4 lg:grid-cols-2">
          <DonutBreakdown
            title="Bağış türlerine göre dağılım"
            currency={currency}
            items={(data.categories || []).map((t: any) => ({ label: t.label, value: t.total_cents, count: t.count }))}
          />
          <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Bağış türleri tablosu</h2>
              <ExportButton name={`bagis-turleri-${data.start}-${data.end}.csv`} header={['Tür', 'Adet', 'Pay', 'Toplam']} rows={typeRows} />
            </div>
            <ReportTable header={['Tür', 'Adet', 'Pay', 'Toplam']} rows={typeRows} />
          </Card>
        </div>
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">En çok bağış alan kampanyalar</h2>
          <Bars currency={currency} items={data.campaigns.slice(0, 10).map((c: any) => ({ label: c.title.slice(0, 10), value: c.total_cents, sub: c.title }))} />
          <ExportButton name={`kampanya-raporu-${data.start}-${data.end}.csv`} header={header} rows={exportRows} />
          <SortableReportTable
            searchPlaceholder="Kampanya ara..."
            columns={[
              { label: 'Kampanya', sortKey: 'title' },
              { label: 'Bağış adedi', sortKey: 'count' },
              { label: 'Bağışçı', sortKey: 'donor_count' },
              { label: 'Ortalama', sortKey: 'average_cents' },
              { label: 'Pay', sortKey: 'share_pct' },
              { label: 'Hedef doluluk', sortKey: 'progress_pct' },
              { label: 'Toplam', sortKey: 'total_cents' },
            ]}
            rows={data.campaigns.map((c: any) => ({
              searchText: `${c.title} ${c.category}`,
              sortValues: {
                title: c.title,
                count: c.count,
                donor_count: c.donor_count,
                average_cents: c.average_cents,
                share_pct: c.share_pct,
                progress_pct: c.progress_pct ?? -1,
                total_cents: c.total_cents,
              },
              cells: [
                <Link key={c.id} href={`/admin/bagislar?campaign_id=${c.id}`} className="text-emerald-700 hover:underline">
                  {c.title}
                </Link>,
                c.count,
                c.donor_count,
                money(c.average_cents),
                `%${c.share_pct}`,
                c.progress_pct === null ? '—' : `%${c.progress_pct}`,
                money(c.total_cents),
              ],
            }))}
          />
        </Card>
      </div>
    )
  }

  if (report === 'staff') {
    const header = ['Personel', 'Makbuz adedi', 'Son makbuz', 'Toplam']
    const rows = data.staff.map((s: any) => [
      s.name, s.count, s.last_receipt_at ? new Date(s.last_receipt_at).toLocaleString('tr-TR') : '—', money(s.total_cents),
    ])
    return (
      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <p className="text-xs text-gray-500">
          Havale/EFT onayı veya banka mutabakatıyla makbuz kesen personel. Bağışçısında temsilci/personel kayıtlı olan sanal POS bağışları otomatik o personele yazılır; temsilcisiz online bağışlar &quot;Online (otomatik)&quot; satırındadır.
        </p>
        <ExportButton name={`personel-makbuz-${data.start}-${data.end}.csv`} header={header} rows={rows} />
        <SortableReportTable
          searchPlaceholder="Personel ara..."
          columns={[
            { label: 'Personel', sortKey: 'name' },
            { label: 'Makbuz adedi', sortKey: 'count' },
            { label: 'Son makbuz' },
            { label: 'Toplam', sortKey: 'total_cents' },
          ]}
          rows={data.staff.map((s: any) => ({
            searchText: `${s.name} ${s.email || ''}`,
            sortValues: { name: s.name, count: s.count, total_cents: s.total_cents },
            cells: [
              s.name,
              s.count,
              s.last_receipt_at ? new Date(s.last_receipt_at).toLocaleString('tr-TR') : '—',
              money(s.total_cents),
            ],
          }))}
        />
      </Card>
    )
  }

  if (report === 'recurring') {
    const campHeader = ['Kampanya', 'Aktif Abone', 'Aylık Yinelenen (MRR)']
    const campRows = (data.by_campaign || []).map((c: any) => [c.title, c.count, money(c.mrr_cents)])
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Aylık Yinelenen (MRR)" value={money(data.mrr_cents || 0)} />
          <Stat label="Yıllık Projeksiyon (ARR)" value={money(data.arr_cents || 0)} />
          <Stat label="Aktif Düzenli Bağış" value={(data.active_count || 0).toLocaleString('tr-TR')} />
          <Stat label="Kayıp Oranı (Churn)" value={`%${data.churn_rate_pct ?? 0}`} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border border-slate-200 p-4 text-xs">
            <div className="text-slate-500">Ortalama Abonelik Tutarı</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{money(data.avg_amount_cents || 0)}</div>
          </Card>
          <Card className="border border-amber-200 bg-amber-50/40 p-4 text-xs">
            <div className="text-amber-700">Riskli (Tahsilat Hatası Alan)</div>
            <div className="mt-1 text-lg font-bold text-amber-800">{data.at_risk_count || 0} abone</div>
          </Card>
          <Card className="border border-slate-200 p-4 text-xs">
            <div className="text-slate-500">Duraklatılan / İptal Edilen</div>
            <div className="mt-1 text-lg font-bold text-slate-800">{data.paused_count || 0} / {data.cancelled_count || 0}</div>
          </Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DonutBreakdown
            title="Tahsilat Modu Dağılımı (MRR)"
            currency={currency}
            items={(data.by_mode || []).map((m: any) => ({ label: `${m.label} (${m.count})`, value: m.mrr_cents }))}
          />
          <Card className="border border-gray-100 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Son 6 Ayda Başlayan Düzenli Bağışlar</h2>
            <Bars
              isCount
              currency={currency}
              items={(data.new_by_month || []).map((m: any) => ({ label: m.label.slice(0, 3), value: m.count, sub: money(m.mrr_cents) }))}
            />
          </Card>
        </div>
        <Card className="border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Kampanyalara Göre Düzenli Bağışlar</h2>
            <ExportButton name="duzenli-bagislar.csv" header={campHeader} rows={campRows} />
          </div>
          <ReportTable header={campHeader} rows={campRows} />
        </Card>
      </div>
    )
  }

  // donors
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Kayıtlı bağışçı (toplam)"
          value={(data.total_donors ?? 0).toLocaleString('tr-TR')}
          detail={{
            title: 'Ülke ve Tür Dağılımı',
            content: () => (
              <div className="space-y-4">
                <ReportTable header={['Ülke', 'Bağışçı']} rows={(data.by_country ?? []).map((c: any) => [c.label, c.count])} />
                <ReportTable header={['Tür', 'Bağışçı']} rows={(data.by_type ?? []).map((c: any) => [c.label, c.count])} />
              </div>
            ),
          }}
        />
        <Stat
          label="Aralıkta bağış yapan"
          value={(data.active_donors ?? 0).toLocaleString('tr-TR')}
          delta={data.active_change_pct}
          detail={{
            title: 'Şehir Bazlı Bağışçılar (İlk 10)',
            content: () => <ReportTable header={['Şehir', 'Bağışçı']} rows={(data.by_city ?? []).map((c: any) => [c.label, c.count])} />,
          }}
        />
        <Stat
          label="İlk kez bağış yapan"
          value={(data.new_donors ?? 0).toLocaleString('tr-TR')}
          detail={{
            title: 'Aylık Yeni Bağışçılar',
            content: () => <ReportTable header={['Ay', 'Yeni']} rows={(data.new_by_month ?? []).map((m: any) => [m.label, m.count])} />,
          }}
        />
        <Stat
          label={`Tekrar bağış yapan (%${data.retention_rate_pct ?? 0})`}
          value={(data.returning_donors ?? 0).toLocaleString('tr-TR')}
          detail={{
            title: 'Bağışçı Özeti',
            content: () => (
              <ReportTable
                header={['Metrik', 'Sayı']}
                rows={[
                  ['Toplam kayıtlı bağışçı', (data.total_donors ?? 0).toLocaleString('tr-TR')],
                  ['Aralıkta aktif', (data.active_donors ?? 0).toLocaleString('tr-TR')],
                  ['İlk kez bağış yapan', (data.new_donors ?? 0).toLocaleString('tr-TR')],
                  ['Tekrar bağış yapan', (data.returning_donors ?? 0).toLocaleString('tr-TR')],
                  ['Elde tutma oranı', `%${data.retention_rate_pct ?? 0}`],
                ]}
              />
            ),
          }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border border-gray-100 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Yeni bağışçılar (aylık)</h2>
          <ReportTable header={['Ay', 'Yeni']} rows={(data.new_by_month ?? []).map((m: any) => [m.label, m.count])} />
        </Card>
        <DonutBreakdown
          title="Bağışçı Türü & Ülke Dağılımı"
          isCount
          currency={currency}
          items={(data.by_type ?? []).map((c: any) => ({ label: c.label, value: c.count }))}
        />
        <Card className="border border-gray-100 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Şehir (ilk 10)</h2>
          <ReportTable header={['Şehir', 'Bağışçı']} rows={(data.by_city ?? []).map((c: any) => [c.label, c.count])} />
        </Card>
      </div>
      <ExportButton
        name={`bagiscilar-raporu-${data.start}-${data.end}.csv`}
        header={['Bölüm', 'Etiket', 'Sayı']}
        rows={[
          ...(data.new_by_month ?? []).map((m: any) => ['Aylık Yeni', m.label, m.count]),
          ...(data.by_country ?? []).map((c: any) => ['Ülke', c.label, c.count]),
          ...(data.by_type ?? []).map((c: any) => ['Tür', c.label, c.count]),
          ...(data.by_city ?? []).map((c: any) => ['Şehir', c.label, c.count]),
        ]}
      />
    </div>
  )
}

function ExportButton({ name, header, rows }: { name: string; header: string[]; rows: (string | number)[][] }) {
  const cleanTitle = name.replace(/\.csv$/i, '').replace(/[-_]+/g, ' ').toUpperCase()
  return (
    <div className="flex justify-end print:hidden">
      <ExportButtons
        filename={name}
        title={cleanTitle}
        getData={() => ({ headers: header, rows })}
      />
    </div>
  )
}
