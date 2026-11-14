'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Eye, FileText, HandCoins, MessageSquare, Plus, RefreshCw, Wallet, X } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import {
  adminGet,
  adminSend,
  apiErrorMessage,
  exportPdf,
  exportXlsx,
  formatMoney,
  hasPermission,
  useAdminAccess,
  v1Get,
  whatsappUrl,
} from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { ManualReceiptForm, downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import {
  ExcelIcon,
  Modal,
  PageHeader,
  Pagination,
  PdfIcon,
  SmsIcon,
  StatCard,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  WhatsAppIcon,
  confirmDialog,
  toast,
} from '../../../../components/admin/ui'

interface Row {
  id: string
  receipt_number: string
  official_receipt_no?: string | null
  campaign_id?: string | null
  campaign_title: string | null
  amount_cents: number
  currency: string
  quantity?: number
  status: string
  payment_method_label: string
  is_manual: boolean
  is_anonymous?: boolean
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

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  confirmed: { label: 'Onaylı', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Beklemede', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed: { label: 'Başarısız', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  refunded: { label: 'İade', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'İptal', badgeClass: 'bg-slate-100 text-slate-500 border-slate-200' },
}

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const

const emptyFilters = {
  q: '',
  start: '',
  end: '',
  campaign_id: '',
  status: '',
  payment_method: '',
  currency: '',
  min: '',
  max: '',
  issued_by: '',
  on_behalf: '',
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
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Modals
  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [smsRow, setSmsRow] = useState<Row | null>(null)

  useEffect(() => {
    v1Get<{ items: { id: string; title: string }[] }>('/campaigns', { page_size: 100 })
      .then((res) => setCampaigns(res.data?.items || []))
      .catch(() => {})
    adminGet<{ id: string; first_name: string; last_name: string }[]>('/users')
      .then((res) => setStaff(res.data || []))
      .catch(() => {})
  }, [])

  const buildParams = useCallback(
    (overrides: Record<string, unknown> = {}) => {
      const f = filters
      const toCents = (v: string) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : undefined)
      return {
        q: f.q || undefined,
        start: f.start || undefined,
        end: f.end || undefined,
        campaign_id: f.campaign_id || undefined,
        status: f.status || undefined,
        payment_method: f.payment_method || undefined,
        currency: f.currency || undefined,
        min_amount_cents: toCents(f.min),
        max_amount_cents: toCents(f.max),
        issued_by: f.issued_by || undefined,
        on_behalf: f.on_behalf || undefined,
        page,
        page_size: PAGE_SIZE,
        ...overrides,
      }
    },
    [filters, page],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<SearchResult>('/donations', buildParams())
      setResult(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağışlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const setFilter = (key: keyof typeof emptyFilters, value: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const handleExport = async (fmt: 'xlsx' | 'pdf') => {
    setExporting(true)
    try {
      const all: Row[] = []
      for (let p = 1; p <= 20; p++) {
        const res = await adminGet<SearchResult>('/donations', buildParams({ page: p, page_size: 500 }))
        all.push(...res.data.items)
        if (res.data.items.length < 500) break
      }
      const headers = ['Makbuz No', 'Resmi Koçan No', 'Tarih', 'Bağışçı', 'Telefon', 'Kampanya', 'Adına', 'Ödeme', 'Personel', 'Durum', 'Tutar', 'Para Birimi']
      const rows = all.map((r) => [
        r.receipt_number,
        r.official_receipt_no || '',
        new Date(r.paid_at).toLocaleString('tr-TR'),
        r.donor_name,
        r.donor_phone || '',
        r.campaign_title || '',
        r.on_behalf_of || '',
        r.payment_method_label,
        r.issued_by_name || 'Online',
        STATUS_META[r.status]?.label || r.status,
        Number((r.amount_cents / 100).toFixed(2)),
        r.currency,
      ])
      if (fmt === 'xlsx') {
        await exportXlsx('bagislar', 'Bağış Listesi', headers, rows, { subtitle: `${all.length} kayıt`, currencyCols: [11] })
      } else {
        await exportPdf('bagislar', 'Bağış Listesi', headers, rows, { subtitle: `${all.length} kayıt` })
      }
      toast.ok(`${all.length} kayıt ${fmt.toUpperCase()} olarak indirildi.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Dışa aktarılamadı'))
    } finally {
      setExporting(false)
    }
  }

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelTarget) return
    if (!cancelReason.trim()) {
      toast.error('Lütfen iptal nedenini yazın.')
      return
    }
    setCancelling(true)
    try {
      await adminSend('post', `/donations/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() })
      toast.ok(`${cancelTarget.receipt_number} numaralı makbuz iptal edildi.`)
      setCancelTarget(null)
      setCancelReason('')
      if (detailRow?.id === cancelTarget.id) setDetailRow(null)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Makbuz iptal edilemedi'))
    } finally {
      setCancelling(false)
    }
  }

  const markPaid = async (row: Row) => {
    const ok = await confirmDialog({
      title: `${row.receipt_number} numaralı makbuzun ödemesi alındı mı?`,
      text: 'Makbuz onaylanır, kampanya toplamına eklenir ve bağışçıya makbuz bildirimi gider.',
      confirmLabel: 'Ödendi',
      danger: false,
    })
    if (!ok) return
    try {
      const res = await adminSend<{ lines: number }>('post', `/donations/${row.id}/mark-paid`)
      toast.ok(res.data.lines > 1 ? `Makbuz ödendi (${res.data.lines} kalem)` : 'Makbuz ödendi')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const downloadPdf = async (row: Row) => {
    try {
      await downloadReceiptPdf(row.id, row.receipt_number)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'PDF indirilemedi'))
    }
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1
  const activeFilters = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bağışlar"
        description="Tüm online ve elle kesilen bağışları arayın, filtreleyin, makbuz PDF'i indirin ve tahsilat durumlarını yönetin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('xlsx')}
              disabled={exporting}
              className="border-[#1D6F42]/30 bg-[#1D6F42]/10 text-[#1D6F42] hover:bg-[#1D6F42]/15"
            >
              <ExcelIcon className="w-3.5 h-3.5 mr-1.5" />
              {exporting ? 'Hazırlanıyor...' : 'Excel'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="border-[#D32F2F]/30 bg-[#D32F2F]/10 text-[#D32F2F] hover:bg-[#D32F2F]/15"
            >
              <PdfIcon className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {canIssue && (
              <Button type="button" size="sm" onClick={() => setShowManual((v) => !v)}>
                {showManual ? (
                  <>
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Vazgeç
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Elle Makbuz Kes
                  </>
                )}
              </Button>
            )}
          </div>
        }
      />

      {showManual && (
        <Card className="border border-emerald-200 bg-white p-6 shadow-sm">
          <ManualReceiptForm
            onDone={(r) => {
              setShowManual(false)
              toast.ok(`${r.receipt_number} numaralı makbuz kesildi`)
              load()
            }}
          />
        </Card>
      )}

      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Toplam Bağış Kaydı"
            value={result.total.toLocaleString('tr-TR')}
            hint="Seçili filtrelere göre"
            tone="neutral"
            icon={HandCoins}
          />
          {result.totals.slice(0, 3).map((t) => (
            <StatCard
              key={t.currency}
              label={`${t.currency} Toplamı`}
              value={formatMoney(t.total_cents, t.currency)}
              hint={`${t.count.toLocaleString('tr-TR')} adet işlem`}
              tone="good"
              icon={Wallet}
            />
          ))}
        </div>
      )}

      <Card className="space-y-3 border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label label="Ara">
              <input
                className={inputClass}
                placeholder="Bağışçı, telefon, makbuz no, koçan no, adına..."
                value={filters.q}
                onChange={(e) => setFilter('q', e.target.value)}
              />
            </Label>
          </div>
          <Label label="Başlangıç">
            <input type="date" className={inputClass} value={filters.start} onChange={(e) => setFilter('start', e.target.value)} />
          </Label>
          <Label label="Bitiş">
            <input type="date" className={inputClass} value={filters.end} onChange={(e) => setFilter('end', e.target.value)} />
          </Label>
          <div className="lg:col-span-2">
            <Label label="Kampanya">
              <select className={inputClass} value={filters.campaign_id} onChange={(e) => setFilter('campaign_id', e.target.value)}>
                <option value="">Tümü</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Label>
          </div>
          <Label label="Durum">
            <select className={inputClass} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Tümü</option>
              {Object.entries(STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
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
              <option value="">Tümü</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
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
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </Label>
          <Label label="Adına bağış">
            <select className={inputClass} value={filters.on_behalf} onChange={(e) => setFilter('on_behalf', e.target.value)}>
              <option value="">Tümü</option>
              <option value="true">Başkası adına</option>
              <option value="false">Kendi adına</option>
            </select>
          </Label>
        </div>
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => {
              setFilters(emptyFilters)
              setPage(1)
            }}
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Filtreleri temizle ({activeFilters})
          </button>
        )}
      </Card>

      <Card className="border border-slate-200 bg-white p-4 shadow-sm">
        {loading && !result ? (
          <p className="py-12 text-center text-sm text-slate-500 animate-pulse">Bağışlar yükleniyor...</p>
        ) : !result || result.items.length === 0 ? (
          <p className="py-12 text-center text-xs text-slate-400">Bu filtrelerle bağış bulunamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Tarih / Makbuz</Th>
                  <Th>Bağışçı</Th>
                  <Th>Kampanya</Th>
                  <Th>Ödeme</Th>
                  <Th>Durum</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th className="text-right">İşlem</Th>
                </Tr>
              </THead>
              <TBody>
                {result.items.map((r) => {
                  const st = STATUS_META[r.status] || { label: r.status, badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }
                  return (
                    <Tr
                      key={r.id}
                      onClick={() => setDetailRow(r)}
                      className={`cursor-pointer hover:bg-slate-50/70 ${r.status === 'cancelled' || r.status === 'refunded' ? 'opacity-60' : ''}`}
                    >
                      <Td className="whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-800">
                          {new Date(r.paid_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {r.receipt_number}
                          {r.official_receipt_no ? ` · ${r.official_receipt_no}` : ''}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/admin/bagiscilar?donor=${r.donor_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-slate-900 hover:text-emerald-700"
                          >
                            {r.donor_name}
                          </Link>
                          {r.is_anonymous && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              Anonim
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.donor_phone || ''}
                          {r.donor_phone && r.on_behalf_of ? ' · ' : ''}
                          {r.on_behalf_of ? <span className="text-emerald-700">Adına: {r.on_behalf_of}</span> : null}
                        </div>
                      </Td>
                      <Td className="text-xs text-slate-700">{r.campaign_title || '—'}</Td>
                      <Td>
                        <div className="text-xs text-slate-800">{r.payment_method_label}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.issued_by_name ? `${r.is_manual ? 'Elle' : 'Onay'}: ${r.issued_by_name}` : 'Online'}
                        </div>
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.badgeClass}`}>
                          {st.label}
                        </span>
                      </Td>
                      <Td className="text-right font-bold tabular-nums text-slate-900">
                        {formatMoney(r.amount_cents, r.currency)}
                      </Td>
                      <Td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setDetailRow(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            title="Detay"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadPdf(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#D32F2F]/30 bg-[#D32F2F]/10 px-2 py-1 text-[11px] font-bold text-[#D32F2F] transition-colors hover:bg-[#D32F2F]/15"
                            title="Makbuz PDF İndir"
                          >
                            <PdfIcon className="h-3.5 w-3.5" /> PDF
                          </button>
                          {r.donor_phone && (
                            <button
                              type="button"
                              onClick={() => setSmsRow(r)}
                              className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700 transition-colors hover:bg-sky-100"
                              title="SMS Gönder"
                            >
                              <SmsIcon className="h-3.5 w-3.5" /> SMS
                            </button>
                          )}
                          {(() => {
                            const wa = whatsappUrl(
                              r.donor_phone,
                              `Sayın ${r.donor_name}, ${formatMoney(r.amount_cents, r.currency)} tutarındaki ${r.campaign_title || ''} bağışınız için teşekkür ederiz. Makbuz No: ${r.receipt_number}`,
                            )
                            return wa ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp ile mesaj gönder"
                                className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-[11px] font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20"
                              >
                                <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                              </a>
                            ) : null
                          })()}
                          {canIssue && r.is_manual && r.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => markPaid(r)}
                              className="font-semibold text-emerald-700 hover:underline"
                            >
                              Ödendi
                            </button>
                          )}
                          {canIssue && r.is_manual && (r.status === 'confirmed' || r.status === 'pending') && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTarget(r)
                                setCancelReason('')
                              }}
                              className="font-semibold text-rose-600 hover:underline"
                            >
                              İptal
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
        {result && result.total > PAGE_SIZE && (
          <div className="mt-4">
            <Pagination page={page} pages={pages} total={result.total} onChange={setPage} />
          </div>
        )}
      </Card>

      {detailRow && (
        <Modal
          title={`Bağış Detayı · ${detailRow.receipt_number}`}
          description={new Date(detailRow.paid_at).toLocaleString('tr-TR')}
          onClose={() => setDetailRow(null)}
          footer={
            <div className="flex flex-wrap justify-between gap-2 w-full">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPdf(detailRow)}
                  className="border-[#D32F2F]/30 bg-[#D32F2F]/10 text-[#D32F2F] hover:bg-[#D32F2F]/15"
                >
                  <PdfIcon className="w-3.5 h-3.5 mr-1.5" />
                  Makbuz PDF
                </Button>
                {detailRow.donor_phone && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSmsRow(detailRow)
                      setDetailRow(null)
                    }}
                    className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                  >
                    <SmsIcon className="w-3.5 h-3.5 mr-1.5" />
                    SMS Gönder
                  </Button>
                )}
                {(() => {
                  const wa = whatsappUrl(
                    detailRow.donor_phone,
                    `Sayın ${detailRow.donor_name}, ${formatMoney(detailRow.amount_cents, detailRow.currency)} tutarındaki ${detailRow.campaign_title || ''} bağışınız için teşekkür ederiz. Makbuz No: ${detailRow.receipt_number}`,
                  )
                  return wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-xs font-bold text-[#128C7E] transition-colors hover:bg-[#25D366]/20"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                  ) : null
                })()}
              </div>
              <Button type="button" onClick={() => setDetailRow(null)}>
                Kapat
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-slate-400">Bağışçı</div>
              <Link href={`/admin/bagiscilar?donor=${detailRow.donor_id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                {detailRow.donor_name}
              </Link>
              {detailRow.donor_phone && <div className="text-slate-500 mt-0.5">{detailRow.donor_phone}</div>}
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-slate-400">Tutar & Durum</div>
              <div className="font-bold text-sm text-slate-900">{formatMoney(detailRow.amount_cents, detailRow.currency)}</div>
              <div className="text-slate-600 mt-0.5">{STATUS_META[detailRow.status]?.label || detailRow.status}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-slate-400">Kampanya</div>
              <div className="font-semibold text-slate-800">{detailRow.campaign_title || '—'}</div>
              {detailRow.on_behalf_of && <div className="text-emerald-700 mt-0.5">Adına: {detailRow.on_behalf_of}</div>}
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-slate-400">Ödeme & Kaynak</div>
              <div className="font-semibold text-slate-800">{detailRow.payment_method_label}</div>
              <div className="text-slate-500 mt-0.5">
                {detailRow.issued_by_name ? `${detailRow.is_manual ? 'Elle' : 'Onay'}: ${detailRow.issued_by_name}` : 'Online'}
              </div>
            </div>
            {detailRow.official_receipt_no && (
              <div className="col-span-2 rounded-lg bg-slate-50 p-3">
                <div className="text-slate-400">Resmi Koçan Makbuz No</div>
                <div className="font-mono font-semibold text-slate-800">{detailRow.official_receipt_no}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <Modal
          title="Makbuzu İptal Et"
          description={`${cancelTarget.receipt_number} · ${cancelTarget.donor_name}`}
          onClose={() => setCancelTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
                Vazgeç
              </Button>
              <Button type="submit" form="cancel-donation-form" disabled={cancelling} className="bg-rose-600 hover:bg-rose-700 text-white">
                {cancelling ? 'İptal Ediliyor...' : 'Makbuzu İptal Et'}
              </Button>
            </div>
          }
        >
          <form id="cancel-donation-form" onSubmit={handleCancelSubmit} className="space-y-3">
            <p className="text-xs text-slate-600">
              Bu işlem makbuzu iptal durumuna alır ve tutarı kampanya toplamından düşer.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">İptal Nedeni *</label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Örn: Yanlış tutar, mükerrer kayıt..."
                required
              />
            </div>
          </form>
        </Modal>
      )}

      {smsRow && (
        <QuickSmsDialog
          target={{
            donorId: smsRow.donor_id,
            donationId: smsRow.id,
            name: smsRow.donor_name,
            phone: smsRow.donor_phone,
          }}
          eventKey="makbuz"
          campaignId={smsRow.campaign_id}
          onClose={() => setSmsRow(null)}
          onSent={(res) => {
            toast.ok(sentNotice(res))
            setSmsRow(null)
          }}
        />
      )}
    </div>
  )
}
