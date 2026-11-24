'use client'

/** STK PRO "Makbuzlar": one row per receipt (lines summed), per-column filters and the hidden "Toplam Tutar". */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, FileDown, FileText, Plus, UserRound } from 'lucide-react'
import { adminGet, apiErrorMessage, can, formatMoney, useAdminAccess } from '../../../../lib/admin-access'
import { Modal, toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../../../../components/admin/ListView'
import { ManualReceiptForm, downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { formatPhone, type Staff, staffName } from '../../../../components/admin/donors/types'

interface ReceiptRow {
  key: string; receipt_seq: number | null; official_receipt_no: string | null; receipt_number: string; donation_id: string
  donor_id: string; donor_name: string; phone_code: string; donor_phone: string | null; referral: string | null
  paid_at: string; total_cents: number; currency: string; lines: number; status: string; created_type: string
  payment_method_label: string; staff_name: string | null; campaign_title: string | null
}

const STATUS_LABEL: Record<string, [string, string]> = {
  confirmed: ['Ödendi', 'border-emerald-200 bg-emerald-50 text-emerald-700'],
  pending: ['Beklemede', 'border-amber-200 bg-amber-50 text-amber-700'],
  failed: ['İptal', 'border-rose-200 bg-rose-50 text-rose-700'],
  refunded: ['İade', 'border-sky-200 bg-sky-50 text-sky-700'],
}

const EMPTY: Record<string, string> = {
  receipt_no: '', name: '', phone: '', start: '', end: '', created_type: '', min_total: '', max_total: '',
  payment_method: '', staff: '', referral: '', status: '',
}

const receiptNo = (r: { receipt_seq: number | null; official_receipt_no: string | null; receipt_number: string }) =>
  r.receipt_seq ? String(r.receipt_seq) : r.official_receipt_no || r.receipt_number

export default function ReceiptsPage() {
  const { data: access } = useAdminAccess()
  const [filters, setFilters] = useState(EMPTY)
  const [sort, setSort] = useState('no_desc')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('receipts', 25)
  const [data, setData] = useState<{ total: number; items: ReceiptRow[] }>({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<Staff[]>([])
  const [referrals, setReferrals] = useState<string[]>([])
  const [totals, setTotals] = useState<{ currency: string; total_cents: number }[] | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  // F2 / "Yeni Makbuz" shortcut opens the form straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('yeni') === '1') setNewOpen(true)
  }, [])
  useEffect(() => {
    adminGet<Staff[]>('/users').then((r) => setStaff(r.data.filter((s) => s.is_active))).catch(() => {})
    adminGet<{ referral_source: string[] }>('/donors-options').then((r) => setReferrals(r.data.referral_source)).catch(() => {})
  }, [])

  const params = useMemo(() => {
    const p: Record<string, unknown> = { sort, page, page_size: pageSize }
    const toCents = (v: string) => (v ? Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100) || undefined : undefined)
    for (const [k, v] of Object.entries(filters)) if (v && k !== 'min_total' && k !== 'max_total') p[k] = v
    p.min_total_cents = toCents(filters.min_total)
    p.max_total_cents = toCents(filters.max_total)
    return p
  }, [filters, sort, page, pageSize])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<{ total: number; items: ReceiptRow[] }>('/receipts', params)
      setData(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Makbuzlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [params])
  useEffect(() => { load(); setTotals(null) }, [load])

  const showTotals = async () => {
    if (totals) { setTotals(null); return }
    try {
      const res = await adminGet<{ totals: { currency: string; total_cents: number }[] }>('/receipts', { ...params, page: 1, page_size: 1, with_totals: true })
      setTotals(res.data.totals)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplam tutar alınamadı'))
    }
  }

  const sortKey = (k: string) => (k === 'no' ? 'no' : k === 'date' ? 'date' : 'total')
  const columns: ListColumn<ReceiptRow>[] = [
    { key: 'no', header: 'Makbuz No', sort: 'no', filter: { type: 'text', param: 'receipt_no' }, render: (r) => <span className="font-semibold tabular-nums">{receiptNo(r)}</span> },
    {
      key: 'name', header: 'Ad Soyad', filter: { type: 'text', param: 'name' },
      render: (r) => <Link href={`/admin/bagiscilar/${r.donor_id}`} className="whitespace-nowrap font-bold uppercase text-primary-700 hover:underline">{r.donor_name}</Link>,
    },
    { key: 'code', header: 'Kod', render: (r) => r.phone_code },
    { key: 'phone', header: 'Cep Telefon', filter: { type: 'text', param: 'phone' }, render: (r) => <span className="whitespace-nowrap tabular-nums">{formatPhone(r.donor_phone) || '—'}</span> },
    {
      key: 'date', header: 'Bağış Tarihi', sort: 'date', filter: { type: 'daterange', from: 'start', to: 'end' },
      render: (r) => <span className="whitespace-nowrap tabular-nums">{new Date(r.paid_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })}</span>,
    },
    {
      key: 'type', header: 'Oluşturma Tipi',
      filter: { type: 'select', param: 'created_type', options: [{ value: 'temsilci', label: 'Erp - Temsilci' }, { value: 'otomatik', label: 'Erp - Otomatik' }, { value: 'web', label: 'Web' }] },
      render: (r) => <span className="whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[12px]">{r.created_type}</span>,
    },
    {
      key: 'total', header: 'Genel Toplam', sort: 'total', align: 'right', filter: { type: 'numberrange', min: 'min_total', max: 'max_total' },
      render: (r) => <span className="whitespace-nowrap font-semibold tabular-nums text-emerald-600">{formatMoney(r.total_cents, r.currency)}{r.lines > 1 ? <span className="ms-1 text-[11px] text-gray-400">({r.lines} kalem)</span> : null}</span>,
    },
    {
      key: 'method', header: 'Ödeme Şekli',
      filter: { type: 'select', param: 'payment_method', options: [{ value: 'cash', label: 'Nakit' }, { value: 'bank_transfer', label: 'Havale / EFT' }, { value: 'credit_card', label: 'Kredi Kartı' }] },
      render: (r) => <span className="whitespace-nowrap">{r.payment_method_label}</span>,
    },
    {
      key: 'staff', header: 'Personel', filter: { type: 'select', param: 'staff', options: [{ value: 'online', label: 'Web (online)' }, ...staff.map((s) => ({ value: s.id, label: staffName(s) }))] },
      render: (r) => <span className="whitespace-nowrap uppercase">{r.staff_name || '—'}</span>,
    },
    { key: 'referral', header: 'Referans', filter: { type: 'select', param: 'referral', options: referrals.map((v) => ({ value: v, label: v })) }, render: (r) => r.referral || '—' },
    { key: 'campaign', header: 'Kampanya', hidden: true, render: (r) => r.campaign_title || '—' },
    {
      key: 'status', header: 'Durum',
      filter: { type: 'select', param: 'status', options: Object.entries(STATUS_LABEL).map(([k, [l]]) => ({ value: k, label: l })) },
      render: (r) => {
        const [label, cls] = STATUS_LABEL[r.status] || [r.status, 'border-gray-200 text-gray-600']
        return <span className={`rounded-md border px-1.5 py-0.5 text-[12px] font-semibold ${cls}`}>{label}</span>
      },
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><FileText className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Tüm Makbuzlar</h1>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {(can(access, 'bank.totals') || can(access, 'receipts.view_all')) && (
            <button type="button" onClick={showTotals} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
              {totals ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {totals ? totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ') || formatMoney(0) : 'Toplam Tutar'}
            </button>
          )}
          {can(access, 'receipts.create') && (
            <button type="button" onClick={() => setNewOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">
              <Plus className="h-4 w-4" /> Yeni Makbuz
            </button>
          )}
        </div>
      </div>
      <ListView
        storageKey="receipts" columns={columns} rows={data.items} total={data.total} loading={loading} rowKey={(r) => r.key}
        page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        sort={sort.replace(/_(asc|desc)$/, '')} direction={direction}
        onSort={(s, d) => { setSort(`${sortKey(s)}_${d}`); setDirection(d); setPage(1) }}
        rowActions={(r) => (
          <>
            <RowAction label="Makbuz PDF" icon={FileDown} tone="success" onClick={() => downloadReceiptPdf(r.donation_id, receiptNo(r)).catch(() => toast.error('PDF indirilemedi'))} />
            <RowAction label="Bağışçı kartı" icon={UserRound} href={`/admin/bagiscilar/${r.donor_id}`} />
            <RowAction label="Bağışlarda aç" icon={Eye} href={`/admin/bagislar?q=${encodeURIComponent(r.receipt_number)}`} />
          </>
        )}
        empty="Makbuz bulunamadı"
      />
      {newOpen && (
        <Modal title="Yeni Makbuz" size="lg" onClose={() => setNewOpen(false)}>
          <ManualReceiptForm onDone={(r) => { toast.ok(`${r.receipt_number} numaralı makbuz kesildi`); setNewOpen(false); load() }} />
        </Modal>
      )}
    </div>
  )
}
