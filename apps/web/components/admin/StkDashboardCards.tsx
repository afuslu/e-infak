'use client'

/** STK PRO Anasayfa: today's receipts, members, pending work and "Günlere Göre Yapılan Bağışlar". */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminGet, formatMoney } from '../../lib/admin-access'

interface Data {
  today_receipts: number; today_cents: number; donors_today: number; donors_total: number
  unmatched_online_30d: number; unmatched_bank_30d: number; unassigned_kurban: number
  year: number; month: number; days: { day: number; total_cents: number }[]
}
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export function StkDashboardCards() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    const load = () => adminGet<Data>('/reports/stk-dashboard', { year, month }).then((r) => setData(r.data)).catch(() => setData(null))
    load()
    const t = setInterval(load, 5 * 60_000)  // STK PRO: "~5 dakikada bir güncellenir"
    return () => clearInterval(t)
  }, [year, month])
  if (!data) return null
  const cards: [string, string, string, string?][] = [
    ['Bugün Makbuz', String(data.today_receipts), 'Bugün ödenen makbuz sayısı', '/admin/makbuzlar'],
    ['Bugün Bağış Tutarı', formatMoney(data.today_cents), 'Bugün ödenen makbuz tutarı', '/admin/makbuzlar'],
    ['Bugün Üye', String(data.donors_today), 'Bugün kaydolan bağışçılar', '/admin/bagiscilar'],
    ['Toplam Üye', data.donors_total.toLocaleString('tr-TR'), 'Kayıtlı bağışçılar', '/admin/bagiscilar'],
    ['Eşleşmemiş Online Bağış (30 gün)', String(data.unmatched_online_30d), data.unmatched_online_30d ? 'Ödeme alındı, makbuz bekliyor' : 'Bekleyen yok', '/admin/online-bagis'],
    ['Eşleşmemiş Banka Hareketi (30 gün)', String(data.unmatched_bank_30d), data.unmatched_bank_30d ? 'İşlem bekliyor — tıklayın' : 'Bekleyen yok', '/admin/banka-odeme?sekme=banka-hareketleri'],
    ['Atanmamış Kurban Bağışı', String(data.unassigned_kurban), data.unassigned_kurban ? 'Hisse dağıtımı bekliyor' : 'Bekleyen yok', '/admin/kurban?sekme=atanmamis'],
  ]
  const max = Math.max(1, ...data.days.map((d) => d.total_cents))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([title, value, sub, href], i) => (
          <Link key={title} href={href || '#'} className="rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-primary-400">
            <div className="text-[13px] font-semibold text-gray-700">{title}</div>
            <div className={`mt-2 text-right text-2xl font-bold tabular-nums ${i >= 4 && value !== '0' ? 'text-amber-500' : 'text-gray-900'}`}>{value}</div>
            <div className="text-right text-[12px] text-gray-500">{sub}</div>
          </Link>
        ))}
      </div>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold text-gray-900">Günlere Göre Yapılan Bağışlar (₺)</h2>
          <select className="ms-auto rounded-lg border border-gray-200 px-2 py-1.5 text-[13px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={now.getFullYear() - n}>{now.getFullYear() - n}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px]" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex h-44 items-end gap-1">
          {data.days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              <span className="pointer-events-none absolute -top-1 hidden whitespace-nowrap rounded border border-gray-200 bg-white px-1 text-[10px] font-semibold text-emerald-700 group-hover:block">{formatMoney(d.total_cents)}</span>
              <div className="w-full rounded-t bg-emerald-500/80" style={{ height: `${(d.total_cents / max) * 90}%`, minHeight: d.total_cents ? 2 : 0 }} />
              <span className="mt-1 text-[9px] text-gray-400">{d.day}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
