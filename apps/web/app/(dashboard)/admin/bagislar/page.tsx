'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ManualReceiptForm, downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { PageHeader, Pagination, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

interface Row {
  id: string
  receipt_number: string
  campaign_title: string | null
  amount_cents: number
  currency: string
  status: string
  payment_method_label: string
  is_manual: boolean
  paid_at: string
  on_behalf_of: string | null
  issued_by_name: string | null
  donor_id: string
  donor_name: string
  donor_phone: string | null
}

interface SearchResult {
  total: number
  totals: { currency: string; count: number; total_cents: number }[]
  items: Row[]
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Onaylı', pending: 'Bekliyor', failed: 'Başarısız', refunded: 'İade', cancelled: 'İptal',
}

const emptyFilters = {
  q: '', start: '', end: '', campaign_id: '', status: '', payment_method: '', currency: '',
  min: '', max: '', issued_by: '', on_behalf: '',
}

const PAGE_SIZE = 50

export default function AdminDonationsPage() {
  const { data: access } = useAdminAccess()
  const canIssue = hasPermission(access, 'finance_manage')
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [staff, setStaff] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [showManual, setShowManual] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((res) => setCampaigns(res.data.items || [])).catch(() => {})
    adminGet<{ id: string; first_name: string; last_name: string }[]>('/users').then((res) => setStaff(res.data)).catch(() => {})
  }, [])

  const params = (overrides: Record<string, unknown> = {}) => {
    const f = filters
    const toCents = (v: string) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : undefined)
    return {
      q: f.q || undefined, start: f.start || undefined, end: f.end || undefined,
      campaign_id: f.campaign_id || undefined, status: f.status || undefined,
      payment_method: f.payment_method || undefined, currency: f.currency || undefined,
      min_amount_cents: toCents(f.min), max_amount_cents: toCents(f.max),
      issued_by: f.issued_by || undefined, on_behalf: f.on_behalf || undefined,
      page, page_size: PAGE_SIZE, ...overrides,
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      setResult((await adminGet<SearchResult>('/donations', params())).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Bağışlar yüklenemedi') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page])

  const setFilter = (key: keyof typeof emptyFilters, value: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const exportCsv = async () => {
    try {
      const all: Row[] = []
      for (let p = 1; p <= 20; p++) {
        const res = await adminGet<SearchResult>('/donations', params({ page: p, page_size: 500 }))
        all.push(...res.data.items)
        if (res.data.items.length < 500) break
      }
      const header = ['Makbuz No', 'Tarih', 'Bağışçı', 'Telefon', 'Kampanya', 'Adına', 'Ödeme', 'Personel', 'Durum', 'Tutar', 'Para Birimi']
      const rows = all.map((r) => [r.receipt_number, new Date(r.paid_at).toLocaleString('tr-TR'), r.donor_name, r.donor_phone || '',
        r.campaign_title || '', r.on_behalf_of || '', r.payment_method_label, r.issued_by_name || 'Online', STATUS_LABELS[r.status] || r.status,
        (r.amount_cents / 100).toLocaleString('tr-TR'), r.currency])
      const csv = '﻿' + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'bagislar.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Dışa aktarılamadı') })
    }
  }

  const cancel = async (row: Row) => {
    const reason = window.prompt(`${row.receipt_number} numaralı makbuz iptal edilecek. İptal nedeni:`)
    if (!reason) return
    try {
      await adminSend('post', `/donations/${row.id}/cancel`, { reason })
      setMessage({ type: 'ok', text: 'Makbuz iptal edildi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const pdf = async (row: Row) => {
    try {
      await downloadReceiptPdf(row.id, row.receipt_number)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'PDF indirilemedi') })
    }
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1
  const activeFilters = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-6">
      <PageHeader title="Bağışlar" actions={<div className="flex gap-2">
          <button onClick={exportCsv} className={ghostButton}>⬇ Excel (CSV)</button>
          {canIssue && <button onClick={() => setShowManual((v) => !v)} className={primaryButton}>{showManual ? 'Vazgeç' : '+ Elle Makbuz Kes'}</button>}
        </div>} />

      <Notice message={message} />

      {showManual && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <ManualReceiptForm onDone={(r) => {
            setShowManual(false)
            setMessage({ type: 'ok', text: `${r.receipt_number} numaralı makbuz kesildi` })
            load()
          }} />
        </Card>
      )}

      <Card className="space-y-3 border border-gray-100 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label label="Ara"><input className={inputClass} placeholder="Bağışçı, telefon, makbuz no, adına..." value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Label>
          </div>
          <Label label="Başlangıç"><input type="date" className={inputClass} value={filters.start} onChange={(e) => setFilter('start', e.target.value)} /></Label>
          <Label label="Bitiş"><input type="date" className={inputClass} value={filters.end} onChange={(e) => setFilter('end', e.target.value)} /></Label>
          <div className="lg:col-span-2">
            <Label label="Kampanya">
              <select className={inputClass} value={filters.campaign_id} onChange={(e) => setFilter('campaign_id', e.target.value)}>
                <option value="">Tümü</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
          </div>
          <Label label="Durum">
            <select className={inputClass} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Tümü</option>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Label>
          <Label label="Ödeme">
            <select className={inputClass} value={filters.payment_method} onChange={(e) => setFilter('payment_method', e.target.value)}>
              <option value="">Tümü</option>
              <option value="credit_card">Kredi Kartı</option>
              <option value="bank_transfer">Havale / EFT</option>
              <option value="cash">Nakit</option>
            </select>
          </Label>
          <Label label="Para birimi">
            <select className={inputClass} value={filters.currency} onChange={(e) => setFilter('currency', e.target.value)}>
              <option value="">Tümü</option><option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </Label>
          <Label label="Tutar (min - maks)">
            <div className="flex gap-1">
              <input className={inputClass} inputMode="decimal" placeholder="min" value={filters.min} onChange={(e) => setFilter('min', e.target.value)} />
              <input className={inputClass} inputMode="decimal" placeholder="maks" value={filters.max} onChange={(e) => setFilter('max', e.target.value)} />
            </div>
          </Label>
          <Label label="Kaynak / personel">
            <select className={inputClass} value={filters.issued_by} onChange={(e) => setFilter('issued_by', e.target.value)}>
              <option value="">Tümü</option>
              <option value="online">Online (otomatik)</option>
              <option value="manual">Elle kesilenler</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          </Label>
          <Label label="Adına bağış">
            <select className={inputClass} value={filters.on_behalf} onChange={(e) => setFilter('on_behalf', e.target.value)}>
              <option value="">Tümü</option><option value="true">Başkası adına</option><option value="false">Kendi adına</option>
            </select>
          </Label>
        </div>
        {activeFilters > 0 && (
          <button onClick={() => { setFilters(emptyFilters); setPage(1) }} className="text-xs font-bold text-primary-700">Filtreleri temizle ({activeFilters})</button>
        )}
      </Card>

      {result && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border bg-white px-4 py-2 text-sm"><span className="text-gray-500">Kayıt:</span> <strong>{result.total.toLocaleString('tr-TR')}</strong></div>
          {result.totals.map((t) => (
            <div key={t.currency} className="rounded-lg border bg-white px-4 py-2 text-sm">
              <span className="text-gray-500">{t.currency} toplam:</span> <strong>{formatMoney(t.total_cents, t.currency)}</strong>
            </div>
          ))}
        </div>
      )}

      <Card className="border border-gray-100 p-4 shadow-sm">
        {loading && !result ? (
          <p className="py-12 text-center text-sm text-gray-500 animate-pulse">Yükleniyor...</p>
        ) : !result || result.items.length === 0 ? (
          <p className="py-12 text-center text-xs text-gray-400">Bu filtrelerle bağış bulunamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Tarih</Th><Th>Bağışçı</Th><Th>Kampanya</Th>
                  <Th>Ödeme</Th><Th>Durum</Th><Th className="text-right">Tutar</Th><Th className="text-right">İşlem</Th>
                </Tr>
              </THead>
              <TBody>
                {result.items.map((r) => (
                  <Tr key={r.id} className={r.status === 'cancelled' || r.status === 'refunded' ? 'opacity-50' : ''}>
                    <Td className="whitespace-nowrap">
                      {new Date(r.paid_at).toLocaleDateString('tr-TR')}
                      <div className="font-mono text-[10px] text-gray-400">{r.receipt_number}</div>
                    </Td>
                    <Td>
                      <Link href={`/admin/bagiscilar?donor=${r.donor_id}`} className="font-semibold text-gray-900 hover:text-primary-700">{r.donor_name}</Link>
                      {r.on_behalf_of && <div className="text-[11px] text-primary-700">Adına: {r.on_behalf_of}</div>}
                    </Td>
                    <Td>{r.campaign_title}</Td>
                    <Td>
                      {r.payment_method_label}
                      <div className="text-[10px] text-gray-400">{r.issued_by_name ? `${r.is_manual ? 'Elle' : 'Onay'}: ${r.issued_by_name}` : 'Online'}</div>
                    </Td>
                    <Td>{STATUS_LABELS[r.status] || r.status}</Td>
                    <Td className="text-right font-bold tabular-nums">{formatMoney(r.amount_cents, r.currency)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <button onClick={() => pdf(r)} className="font-bold text-primary-700 hover:underline">PDF</button>
                      {canIssue && r.is_manual && r.status === 'confirmed' && (
                        <button onClick={() => cancel(r)} className="ml-3 font-bold text-red-600 hover:underline">İptal</button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {result && <div className="mt-4"><Pagination page={page} pages={pages} total={result.total} onChange={setPage} /></div>}
      </Card>
    </div>
  )
}
