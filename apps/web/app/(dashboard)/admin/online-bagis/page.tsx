'use client'

/** STK PRO "Online Bağış": card donations from the virtual POS, refreshed every 60 seconds. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CreditCard, Eye, EyeOff, FileDown, MessageCircle, RefreshCw, UserRound } from 'lucide-react'
import { adminGet, apiErrorMessage, can, formatMoney, useAdminAccess, whatsappUrl } from '../../../../lib/admin-access'
import { toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../../../../components/admin/ListView'
import { downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { formatPhone } from '../../../../components/admin/donors/types'

interface PosRow {
  id: string; receipt_number: string; receipt_seq: number | null; transaction_id: string | null; donor_id: string
  donor_name: string; donor_phone: string | null; amount_cents: number; currency: string; donor_message: string | null
  paid_at: string; status: string; source: string | null; campaign_title: string | null; on_behalf_of: string | null
}

const REFRESH = 60
const PROVIDER_LABEL: Record<string, string> = {
  vakifkatilim: 'Vakıf Katılım 3D', ziraatpay: 'Ziraat Katılım 3D', iyzico: 'iyzico', paytr: 'PayTR', nestpay: 'Nestpay 3D',
}
const STATUS: Record<string, [string, string]> = {
  confirmed: ['Başarılı', 'border-emerald-200 bg-emerald-50 text-emerald-700'],
  refunded: ['İade', 'border-sky-200 bg-sky-50 text-sky-700'],
  failed: ['Başarısız', 'border-rose-200 bg-rose-50 text-rose-700'],
  pending: ['Bekliyor', 'border-amber-200 bg-amber-50 text-amber-700'],
}
const EMPTY: Record<string, string> = { q: '', start: '', end: '', status: 'confirmed', min: '', max: '' }

export default function OnlineDonationsPage() {
  const { data: access } = useAdminAccess()
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('online-donations', 10)
  const [data, setData] = useState<{ total: number; totals: { currency: string; count: number; total_cents: number }[]; items: PosRow[] }>({ total: 0, totals: [], items: [] })
  const [loading, setLoading] = useState(true)
  const [showTotal, setShowTotal] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH)
  const busy = useRef(false)

  const params = useMemo(() => {
    const toCents = (v: string) => (v ? Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100) || undefined : undefined)
    return {
      payment_method: 'credit_card', issued_by: 'pos', page, page_size: pageSize,
      q: filters.q || undefined, start: filters.start || undefined, end: filters.end || undefined,
      status: filters.status || undefined, min_amount_cents: toCents(filters.min), max_amount_cents: toCents(filters.max),
    }
  }, [filters, page, pageSize])

  const load = useCallback(async (quiet = false) => {
    if (busy.current) return
    busy.current = true
    if (!quiet) setLoading(true)
    try {
      const res = await adminGet<typeof data>('/donations', params)
      setData({ total: res.data.total || 0, totals: res.data.totals || [], items: res.data.items || [] })
    } catch (err) {
      if (!quiet) toast.error(apiErrorMessage(err, 'Online bağışlar yüklenemedi'))
    } finally {
      busy.current = false
      setLoading(false)
      setCountdown(REFRESH)
    }
  }, [params])
  useEffect(() => { load() }, [load])

  // STK PRO: "Otomatik yenileme: 60 sn" — counts down and reloads quietly while the tab is visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setCountdown((c) => {
        if (c <= 1) { load(true); return REFRESH }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [load])

  const columns: ListColumn<PosRow>[] = [
    { key: 'order', header: 'Sipariş ID', render: (r) => <span className="whitespace-nowrap font-mono text-[12px] text-emerald-700">{r.transaction_id || r.receipt_number}</span> },
    {
      key: 'donor', header: 'Bağışçı', filter: { type: 'text', param: 'q', placeholder: 'Ad, telefon, makbuz' },
      render: (r) => <Link href={`/admin/bagiscilar/${r.donor_id}`} className="whitespace-nowrap font-bold uppercase text-emerald-700 hover:underline">{r.donor_name}</Link>,
    },
    { key: 'phone', header: 'Cep Telefon', render: (r) => <span className="whitespace-nowrap tabular-nums">{formatPhone(r.donor_phone) || '—'}</span> },
    {
      key: 'amount', header: 'Tutar', align: 'right', filter: { type: 'numberrange', min: 'min', max: 'max' },
      render: (r) => <span className="whitespace-nowrap font-bold tabular-nums text-emerald-700">{formatMoney(r.amount_cents, r.currency)}</span>,
    },
    { key: 'note', header: 'Bağış Notu', render: (r) => <span className="line-clamp-1 max-w-[260px] text-gray-600">{r.donor_message || r.campaign_title || '—'}</span> },
    {
      key: 'date', header: 'İşlem Tarihi', filter: { type: 'daterange', from: 'start', to: 'end' },
      render: (r) => <span className="whitespace-nowrap tabular-nums">{new Date(r.paid_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })}</span>,
    },
    { key: 'receipt', header: 'Makbuz', render: (r) => <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[12px] font-semibold text-emerald-700">#{r.receipt_seq || r.receipt_number.slice(-6)}</span> },
    { key: 'bank', header: 'Banka', render: (r) => <span className="whitespace-nowrap">{PROVIDER_LABEL[r.source || ''] || r.source || '—'}</span> },
    {
      key: 'status', header: 'Durum', filter: { type: 'select', param: 'status', options: Object.entries(STATUS).map(([k, [l]]) => ({ value: k, label: l })) },
      render: (r) => { const [l, c] = STATUS[r.status] || [r.status, '']; return <span className={`rounded-md border px-1.5 py-0.5 text-[12px] font-semibold ${c}`}>{l}</span> },
    },
  ]

  const success = data.totals.reduce((n, t) => n + t.count, 0)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><CreditCard className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Online Bağış</h1>
        <div className="ms-auto flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[13px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary-500 text-[11px] font-bold tabular-nums text-primary-700">{countdown}</span>
          <span className="font-semibold text-gray-700">Otomatik yenileme: {REFRESH} sn</span>
          <button type="button" onClick={() => load()} className="ms-1 inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 font-semibold text-primary-700 hover:bg-primary-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Şimdi yenile
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['confirmed', 'Başarılı'],
          ['failed', 'Başarısız / Yarım Kalan'],
          ['pending', 'Bekleyen'],
          ['refunded', 'İade'],
          ['', 'Tümü'],
        ] as const).map(([val, lbl]) => (
          <button
            key={val || 'all'}
            type="button"
            onClick={() => { setFilters((f) => ({ ...f, status: val })); setPage(1) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filters.status === val
                ? val === 'failed'
                  ? 'border-rose-600 bg-rose-600 text-white'
                  : 'border-primary-600 bg-primary-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {lbl}
          </button>
        ))}
        {can(access, 'receipts.view_all') && (
          <Link href="/admin/basarisiz-odemeler" className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300">Banka hataları ve nedenleri →</Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-3.5 text-[13.5px] text-gray-500">
        <span>{STATUS[filters.status]?.[0] || 'Toplam'} işlem: <b className="tabular-nums text-gray-900">{success.toLocaleString('tr-TR')}</b> · özet her yenilemede güncellenir</span>
        {(can(access, 'bank.totals') || can(access, 'receipts.view_all')) && (
          <button type="button" onClick={() => setShowTotal((v) => !v)} className="ms-auto inline-flex items-center gap-1.5 font-semibold text-gray-700 hover:text-gray-900">
            Toplam Tutar{showTotal ? `: ${data.totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ') || formatMoney(0)}` : ''}
            {showTotal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      <ListView storageKey="online-donations" columns={columns} rows={data.items} total={data.total} loading={loading} rowKey={(r) => r.id}
        page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        rowActions={(r) => {
          const isFailedOrPending = r.status === 'failed' || r.status === 'pending'
          const origin = typeof window !== 'undefined' ? window.location.origin : ''
          const amountStr = formatMoney(r.amount_cents, r.currency)
          const campStr = r.campaign_title ? ` (${r.campaign_title})` : ''
          const wa = r.donor_phone
            ? whatsappUrl(
                r.donor_phone,
                isFailedOrPending
                  ? `Selamün aleyküm ${r.donor_name}, ${amountStr} tutarındaki${campStr} online bağış işleminizin tamamlanamadığını gördük. Dilerseniz buradan tekrar deneyebilir veya Havale/EFT ile tamamlayabilirsiniz: ${origin}/bagis/sepetim?odeme=havale`
                  : `Selamün aleyküm ${r.donor_name}, ${amountStr} tutarındaki${campStr} bağışınız için çok teşekkür ederiz. Allah kabul etsin.`,
              )
            : null
          return (
            <>
              {wa && (
                <RowAction
                  label={isFailedOrPending ? 'WhatsApp ile kurtar' : 'WhatsApp teşekkür'}
                  icon={MessageCircle}
                  tone="success"
                  onClick={() => window.open(wa, '_blank', 'noopener,noreferrer')}
                />
              )}
              {!isFailedOrPending && (
                <RowAction label="Makbuz PDF" icon={FileDown} tone="success" onClick={() => downloadReceiptPdf(r.id, r.receipt_number).catch(() => toast.error('PDF indirilemedi'))} />
              )}
              <RowAction label="Bağışçı kartı" icon={UserRound} href={`/admin/bagiscilar/${r.donor_id}`} />
            </>
          )
        }}
        empty="Online bağış yok" />
    </div>
  )
}
