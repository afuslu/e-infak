'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, apiErrorMessage, formatMoney, hasFeature, useAdminAccess } from '../../../../lib/admin-access'

type ReportKey = 'monthly' | 'daily' | 'yearly' | 'campaigns' | 'staff' | 'donors'

const REPORTS: { key: ReportKey; label: string; advanced: boolean }[] = [
  { key: 'monthly', label: 'Aylık Bağış', advanced: false },
  { key: 'daily', label: 'Günlük Toplam', advanced: true },
  { key: 'yearly', label: '5 Yıllık Karşılaştırma', advanced: true },
  { key: 'campaigns', label: 'Kampanyalar', advanced: true },
  { key: 'staff', label: 'Personel Makbuz', advanced: true },
  { key: 'donors', label: 'Bağışçı Sayısı', advanced: true },
]

const ENDPOINTS: Record<ReportKey, string> = {
  monthly: '/reports/monthly',
  daily: '/reports/daily',
  yearly: '/reports/yearly-comparison',
  campaigns: '/reports/campaigns',
  staff: '/reports/staff-receipts',
  donors: '/reports/donors',
}

// Local calendar date; toISOString() would shift to UTC and land on the previous day in Türkiye.
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = '﻿' + [header, ...rows].map((r) => r.map(escape).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Bars({ items, currency }: { items: { label: string; value: number; sub?: string }[]; currency: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="flex h-56 items-end gap-1 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/50 px-3 pt-6">
      {items.map((item, idx) => (
        <div key={idx} className="group flex h-full min-w-[22px] flex-1 flex-col items-center justify-end gap-1">
          <span className="whitespace-nowrap rounded border bg-white px-1 text-[9px] font-bold text-primary-700 opacity-0 shadow-sm group-hover:opacity-100">
            {formatMoney(item.value, currency)}{item.sub ? ` · ${item.sub}` : ''}
          </span>
          <div style={{ height: `${(item.value / max) * 80}%` }} className="w-full max-w-10 rounded-t bg-primary-600/90 group-hover:bg-primary-700" />
          <span className="pb-2 text-[9px] font-bold text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function Table({ header, rows }: { header: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-gray-700">
        <thead>
          <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {header.map((h, i) => <th key={h} className={`pb-2 ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr><td colSpan={header.length} className="py-6 text-center text-gray-400">Bu aralıkta kayıt yok.</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => <td key={j} className={`py-2 ${j > 0 ? 'text-right tabular-nums' : 'font-semibold text-gray-900'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border border-gray-100 p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-gray-950">{value}</div>
    </Card>
  )
}

export default function ReportsPage() {
  const { data: access } = useAdminAccess()
  const advancedEnabled = hasFeature(access, 'reports_advanced')
  const today = new Date()
  const [report, setReport] = useState<ReportKey>('monthly')
  const [currency, setCurrency] = useState('TRY')
  const [year, setYear] = useState(today.getFullYear())
  const [start, setStart] = useState(isoDate(new Date(today.getFullYear(), 0, 1)))
  const [end, setEnd] = useState(isoDate(today))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const params = useMemo(() => {
    if (report === 'monthly') return { year, currency }
    if (report === 'yearly') return { years: 5, currency }
    return { start, end, currency }
  }, [report, year, start, end, currency])

  useEffect(() => {
    const meta = REPORTS.find((r) => r.key === report)
    if (meta?.advanced && !advancedEnabled) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    adminGet<any>(ENDPOINTS[report], params)
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) { setData(null); setError(apiErrorMessage(err, 'Rapor yüklenemedi')) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [report, params, advancedEnabled])

  const locked = REPORTS.find((r) => r.key === report)?.advanced && !advancedEnabled
  const money = (cents: number) => formatMoney(cents, currency)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-gray-900">Raporlar</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {report === 'monthly' && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border bg-white p-2 font-semibold">
              {Array.from({ length: 6 }, (_, i) => today.getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {['daily', 'campaigns', 'staff', 'donors'].includes(report) && (
            <>
              <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="rounded-lg border bg-white p-2" />
              <span className="text-gray-400">–</span>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border bg-white p-2" />
            </>
          )}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border bg-white p-2 font-semibold">
            <option value="TRY">TL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setReport(r.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${report === r.key ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-gray-700 hover:border-primary-600'}`}
          >
            {r.label}{r.advanced && !advancedEnabled ? ' 🔒' : ''}
          </button>
        ))}
      </div>

      {locked ? (
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

function ReportBody({ report, data, money, currency }: { report: ReportKey; data: any; money: (c: number) => string; currency: string }) {
  if (report === 'monthly') {
    const rows = data.months.map((m: any) => [m.label, m.count, m.donor_count, money(m.total_cents)])
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={`${data.year} toplam`} value={money(data.total_cents)} />
          <Stat label="Bağış adedi" value={data.count.toLocaleString('tr-TR')} />
          <Stat label="Ortalama bağış" value={data.count ? money(Math.round(data.total_cents / data.count)) : '—'} />
        </div>
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <Bars currency={currency} items={data.months.map((m: any) => ({ label: m.label.slice(0, 3), value: m.total_cents, sub: `${m.count} bağış` }))} />
          <ExportButton name={`aylik-bagis-${data.year}.csv`} header={['Ay', 'Bağış adedi', 'Bağışçı', 'Toplam']} rows={rows} />
          <Table header={['Ay', 'Bağış adedi', 'Bağışçı', 'Toplam']} rows={rows} />
        </Card>
        <Card className="border border-gray-100 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Ödeme kanalları</h2>
          <Table header={['Kanal', 'Adet', 'Toplam']} rows={data.payment_methods.map((p: any) => [p.label, p.count, money(p.total_cents)])} />
        </Card>
      </div>
    )
  }

  if (report === 'daily') {
    const rows = data.days.map((d: any) => [d.date.split('-').reverse().join('.'), d.count, money(d.total_cents)])
    return (
      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Aralık toplamı" value={money(data.total_cents)} />
          <Stat label="Bağış adedi" value={data.count.toLocaleString('tr-TR')} />
        </div>
        <Bars currency={currency} items={data.days.map((d: any) => ({ label: d.date.slice(8, 10), value: d.total_cents, sub: d.date }))} />
        <ExportButton name={`gunluk-bagis-${data.start}-${data.end}.csv`} header={['Tarih', 'Adet', 'Toplam']} rows={rows} />
        <Table header={['Tarih', 'Adet', 'Toplam']} rows={[...rows].reverse()} />
      </Card>
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
      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <Bars currency={currency} items={data.years.map((y: any) => ({ label: String(y.year), value: y.total_cents, sub: `${y.count} bağış` }))} />
        <ExportButton name="yillik-karsilastirma.csv" header={header} rows={rows} />
        <Table header={header} rows={rows} />
      </Card>
    )
  }

  if (report === 'campaigns') {
    const header = ['Kampanya', 'Bağış adedi', 'Bağışçı', 'Ortalama', 'Pay', 'Hedef doluluk', 'Toplam']
    const rows = data.campaigns.map((c: any) => [
      c.title, c.count, c.donor_count, money(c.average_cents), `%${c.share_pct}`,
      c.progress_pct === null ? '—' : `%${c.progress_pct}`, money(c.total_cents),
    ])
    return (
      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <Stat label="Aralık toplamı" value={money(data.total_cents)} />
        <h2 className="text-sm font-bold text-gray-900">En çok bağış alan kampanyalar</h2>
        <Bars currency={currency} items={data.campaigns.slice(0, 10).map((c: any) => ({ label: c.title.slice(0, 10), value: c.total_cents, sub: c.title }))} />
        <ExportButton name={`kampanya-raporu-${data.start}-${data.end}.csv`} header={header} rows={rows} />
        <Table header={header} rows={rows} />
      </Card>
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
          Havale/EFT onayı veya banka mutabakatıyla makbuz kesen personel. Kartla yapılan online bağışlar &quot;Online (otomatik)&quot; satırındadır.
          Bu güncellemeden önceki havale onaylarında personel bilgisi tutulmadığı için onlar da online satırında görünür.
        </p>
        <ExportButton name={`personel-makbuz-${data.start}-${data.end}.csv`} header={header} rows={rows} />
        <Table header={header} rows={rows} />
      </Card>
    )
  }

  // donors
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kayıtlı bağışçı (toplam)" value={data.total_donors.toLocaleString('tr-TR')} />
        <Stat label="Aralıkta bağış yapan" value={data.active_donors.toLocaleString('tr-TR')} />
        <Stat label="İlk kez bağış yapan" value={data.new_donors.toLocaleString('tr-TR')} />
        <Stat label="Tekrar bağış yapan" value={data.returning_donors.toLocaleString('tr-TR')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border border-gray-100 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Yeni bağışçılar (aylık)</h2>
          <Table header={['Ay', 'Yeni']} rows={data.new_by_month.map((m: any) => [m.label, m.count])} />
        </Card>
        <Card className="border border-gray-100 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Ülke (yurt içi / yurt dışı)</h2>
          <Table header={['Ülke', 'Bağışçı']} rows={data.by_country.map((c: any) => [c.label, c.count])} />
          <h2 className="mb-3 mt-6 text-sm font-bold text-gray-900">Tür</h2>
          <Table header={['Tür', 'Bağışçı']} rows={data.by_type.map((c: any) => [c.label, c.count])} />
        </Card>
        <Card className="border border-gray-100 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">Şehir (ilk 10)</h2>
          <Table header={['Şehir', 'Bağışçı']} rows={data.by_city.map((c: any) => [c.label, c.count])} />
        </Card>
      </div>
    </div>
  )
}

function ExportButton({ name, header, rows }: { name: string; header: string[]; rows: (string | number)[][] }) {
  return (
    <div className="flex justify-end">
      <button onClick={() => downloadCsv(name, header, rows)} className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-primary-600">
        ⬇ Excel (CSV) indir
      </button>
    </div>
  )
}
