'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Copy, Download, ExternalLink, FileDown, MessageSquare, ShieldCheck, XCircle } from 'lucide-react'
import { Card } from '@e-infak/ui'
import {
  adminApiBase,
  adminAuthHeaders,
  adminGet,
  adminSend,
  apiErrorMessage,
  exportCsv,
  formatMoney,
  hasPermission,
  useAdminAccess,
} from '../../../../lib/admin-access'
import { Notice, TextInput, compactInputClass, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ManualReceiptForm, downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { QuickSmsDialog, SmsStatusPill, loadRelatedSms, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { RelatedSms } from '../../../../lib/sms'
import { ExportButtons, Modal, PageHeader, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Donation {
  id: string
  receipt_number: string
  official_receipt_no?: string | null
  campaign_title?: string | null
  amount_cents: number
  currency: string
  status: string
  payment_method_label: string
  is_manual: boolean
  donor_name: string
  campaign_id?: string | null
  donor_id?: string | null
  on_behalf_of: string | null
  paid_at: string
}

interface TotalItem {
  currency: string
  count: number
  total_cents: number
}

interface ReceiptDetail {
  receipt_number: string
  official_receipt_no?: string | null
  verification_hash: string
  verify_url: string
  status: string
  donor_name: string
  amount_lira: number
  amount_cents?: number
  currency?: string
  payment_method: string
}

const PAGE_SIZE = 50
const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Onaylı', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'İptal', cls: 'border-red-200 bg-red-50 text-red-700' },
  pending: { label: 'Bekliyor', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  refunded: { label: 'İade', cls: 'border-gray-200 bg-gray-100 text-gray-600' },
}

export default function AdminReceiptsPage() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [total, setTotal] = useState(0)
  const [totals, setTotals] = useState<TotalItem[]>([])
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    q: '',
    status: 'confirmed',
    payment_method: '',
    currency: '',
    issued_by: '',
    start: '',
    end: '',
  })
  const [loading, setLoading] = useState(false)
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null)
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<{ donation: Donation; reason: string } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [sms, setSms] = useState<Record<string, RelatedSms>>({})
  const [smsFor, setSmsFor] = useState<Donation | null>(null)
  const { data: access } = useAdminAccess()
  const canIssue = hasPermission(access, 'finance_manage')
  const canSms = hasPermission(access, 'donor_manage')

  const API_BASE = adminApiBase()

  const loadDonations = async () => {
    setLoading(true)
    try {
      const res = await adminGet<{ items: Donation[]; total: number; totals: TotalItem[] }>('/donations', {
        q: filters.q.trim() || undefined,
        status: filters.status || undefined,
        payment_method: filters.payment_method || undefined,
        currency: filters.currency || undefined,
        issued_by: filters.issued_by || undefined,
        start: filters.start || undefined,
        end: filters.end || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      setDonations(res.data.items)
      setTotal(res.data.total ?? res.data.items.length)
      setTotals(res.data.totals || [])
      setSms(await loadRelatedSms('donation', res.data.items.map((d) => d.id)))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Makbuzlar yüklenemedi') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(loadDonations, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page])

  const setFilter = (key: keyof typeof filters, value: string) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const viewReceipt = async (donationId: string) => {
    setReceiptLoadingId(donationId)
    setReceiptDetail(null)
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/donations/${donationId}/receipt`, {
        headers: adminAuthHeaders(),
      })
      setReceiptDetail(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Makbuz bilgisi alınamadı.'))
    } finally {
      setReceiptLoadingId(null)
    }
  }

  const submitCancel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelTarget || !cancelTarget.reason.trim()) return
    setCancelling(true)
    setMessage(null)
    try {
      await adminSend('post', `/donations/${cancelTarget.donation.id}/cancel`, {
        reason: cancelTarget.reason.trim(),
      })
      setMessage({ type: 'ok', text: `${cancelTarget.donation.receipt_number} numaralı makbuz iptal edildi.` })
      setCancelTarget(null)
      await loadDonations()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Makbuz iptal edilemedi') })
    } finally {
      setCancelling(false)
    }
  }

  const copyVerifyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.ok('Doğrulama linki kopyalandı')
    } catch {
      toast.error('Link kopyalanamadı')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Makbuzlar"
        description={<>Kesilen tüm online ve elle bağış makbuzları, doğrulama kodları ve iptal işlemleri.</>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/makbuz-kocanlari" className={ghostButton}>
              Makbuz Koçanları →
            </Link>
            <button onClick={loadDonations} className={ghostButton}>
              Yenile
            </button>
            {canIssue && (
              <button onClick={() => setShowManual((v) => !v)} className={primaryButton}>
                {showManual ? 'Vazgeç' : '+ Elle Makbuz Kes'}
              </button>
            )}
          </div>
        }
      />

      {smsFor && (
        <QuickSmsDialog
          title="Hızlı SMS Gönder — Makbuz"
          eventKey="makbuz"
          campaignId={smsFor.campaign_id}
          target={{ donationId: smsFor.id, name: smsFor.donor_name }}
          onClose={() => setSmsFor(null)}
          onSent={(r) => {
            setMessage({ type: 'ok', text: sentNotice(r) })
            loadDonations()
          }}
        />
      )}

      <Notice message={message} />

      {showManual && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <ManualReceiptForm
            onDone={(r) => {
              setShowManual(false)
              setMessage({
                type: 'ok',
                text: `${r.receipt_number} numaralı makbuz kesildi${r.official_receipt_no ? ` (matbu: ${r.official_receipt_no})` : ''}`,
              })
              loadDonations()
            }}
          />
        </Card>
      )}

      {receiptDetail && (
        <Card className="space-y-3 border-2 border-primary-200 bg-primary-50/40 p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Makbuz Doğrulama</div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{receiptDetail.receipt_number}</span>
                {receiptDetail.official_receipt_no && (
                  <span className="text-xs font-semibold text-gray-500">Matbu: {receiptDetail.official_receipt_no}</span>
                )}
              </div>
            </div>
            <button onClick={() => setReceiptDetail(null)} className="text-xl leading-none text-gray-400 hover:text-gray-700">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t pt-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase text-gray-400">Bağışçı</div>
              <div className="font-semibold text-gray-800">{receiptDetail.donor_name}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-gray-400">Tutar</div>
              <div className="font-semibold text-gray-800">
                {formatMoney(
                  receiptDetail.amount_cents ?? Math.round(receiptDetail.amount_lira * 100),
                  receiptDetail.currency || 'TRY'
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-gray-400">Ödeme</div>
              <div className="font-semibold text-gray-800">{receiptDetail.payment_method}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-gray-400">Doğrulama Kodu</div>
              <div className="font-mono text-xs text-gray-600">{receiptDetail.verification_hash}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href={receiptDetail.verify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline"
            >
              Genel doğrulama sayfasını görüntüle <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => copyVerifyLink(receiptDetail.verify_url)}
              className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50"
            >
              <Copy className="h-3 w-3" /> Linki Kopyala
            </button>
          </div>
        </Card>
      )}

      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Makbuz no, matbu no, bağışçı veya telefon..."
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
              className={inputClass}
            />
          </div>
          <select
            aria-label="Durum filtresi"
            className={inputClass}
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="confirmed">Onaylı</option>
            <option value="cancelled">İptal edilmiş</option>
            <option value="">Tüm durumlar</option>
          </select>
          <select
            aria-label="Ödeme yöntemi"
            className={inputClass}
            value={filters.payment_method}
            onChange={(e) => setFilter('payment_method', e.target.value)}
          >
            <option value="">Tüm ödeme tipleri</option>
            <option value="cash">Nakit</option>
            <option value="bank_transfer">Havale / EFT</option>
            <option value="credit_card">Kredi Kartı</option>
          </select>
          <select
            aria-label="Kaynak"
            className={inputClass}
            value={filters.issued_by}
            onChange={(e) => setFilter('issued_by', e.target.value)}
          >
            <option value="">Online + Elle</option>
            <option value="online">Sadece Online</option>
            <option value="manual">Sadece Elle / Koçan</option>
          </select>
          <select
            aria-label="Para birimi"
            className={inputClass}
            value={filters.currency}
            onChange={(e) => setFilter('currency', e.target.value)}
          >
            <option value="">Tüm birimler</option>
            {CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Başlangıç tarihi"
              className={`${compactInputClass} w-40`}
              value={filters.start}
              onChange={(e) => setFilter('start', e.target.value)}
            />
            <span className="text-xs text-gray-400">—</span>
            <input
              type="date"
              aria-label="Bitiş tarihi"
              className={`${compactInputClass} w-40`}
              value={filters.end}
              onChange={(e) => setFilter('end', e.target.value)}
            />
            {totals.length > 0 && (
              <span className="ml-2 text-xs font-semibold text-gray-600">
                {total.toLocaleString('tr-TR')} makbuz ·{' '}
                {totals.map((t) => formatMoney(t.total_cents, t.currency)).join(' · ')}
              </span>
            )}
          </div>

          {donations.length > 0 && (
            <ExportButtons
              filename="makbuzlar"
              title="Makbuz Listesi"
              subtitle={`Toplam ${total.toLocaleString('tr-TR')} makbuz`}
              currencyCols={[7]}
              getData={() => ({
                headers: ['Makbuz No', 'Matbu No', 'Bağışçı', 'Kampanya', 'Kimin Adına', 'Ödeme Yöntemi', 'Tutar', 'Para Birimi', 'Durum', 'Tarih'],
                rows: donations.map((d) => [
                  d.receipt_number,
                  d.official_receipt_no || '',
                  d.donor_name,
                  d.campaign_title || '',
                  d.on_behalf_of || '',
                  d.payment_method_label,
                  d.amount_cents / 100,
                  d.currency,
                  STATUS_BADGE[d.status]?.label || d.status,
                  d.paid_at ? new Date(d.paid_at).toLocaleDateString('tr-TR') : '',
                ]),
              })}
            />
          )}
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500 animate-pulse">Makbuzlar yükleniyor...</p>
        ) : donations.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Eşleşen makbuz bulunamadı.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table inset>
                <THead>
                  <Tr>
                    <Th>Makbuz No</Th>
                    <Th>Bağışçı</Th>
                    <Th>Kampanya</Th>
                    <Th>Ödeme Tipi</Th>
                    <Th>Tarih</Th>
                    <Th>Durum</Th>
                    <Th className="text-right">Tutar</Th>
                    <Th>SMS</Th>
                    <Th className="text-right">İşlem</Th>
                  </Tr>
                </THead>
                <TBody>
                  {donations.map((don) => {
                    const st = STATUS_BADGE[don.status] || { label: don.status, cls: 'border-gray-200 bg-gray-100 text-gray-600' }
                    return (
                      <Tr key={don.id} className={`hover:bg-gray-50/50 ${don.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <Td className="font-bold text-gray-900">
                          {don.receipt_number}
                          {don.official_receipt_no && (
                            <div className="text-[11px] font-semibold text-gray-500">Matbu {don.official_receipt_no}</div>
                          )}
                        </Td>
                        <Td>
                          {don.donor_name}
                          {don.on_behalf_of && <div className="text-[10px] text-primary-700">Adına: {don.on_behalf_of}</div>}
                        </Td>
                        <Td className="max-w-[180px] truncate text-xs text-gray-600">{don.campaign_title || '—'}</Td>
                        <Td className="text-xs">
                          {don.payment_method_label}
                          {don.is_manual && ' (elle)'}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-gray-400">
                          {new Date(don.paid_at).toLocaleDateString('tr-TR')}
                        </Td>
                        <Td>
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>
                            {st.label}
                          </span>
                        </Td>
                        <Td className="text-right font-bold text-emerald-800 tabular-nums">
                          {formatMoney(don.amount_cents, don.currency)}
                        </Td>
                        <Td>
                          <SmsStatusPill sms={sms[don.id]} />
                        </Td>
                        <Td className="whitespace-nowrap text-right text-xs">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {canSms && don.status === 'confirmed' && (
                              <button
                                type="button"
                                onClick={() => setSmsFor(don)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                              >
                                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                                SMS
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => viewReceipt(don.id)}
                              disabled={receiptLoadingId === don.id}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                              {receiptLoadingId === don.id ? '…' : 'Doğrula'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadReceiptPdf(don.id, don.receipt_number).catch(() => toast.error('PDF indirilemedi.'))
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                            >
                              <FileDown className="h-3 w-3" aria-hidden="true" />
                              PDF
                            </button>
                            {canIssue && don.is_manual && don.status === 'confirmed' && (
                              <button
                                type="button"
                                title="Elle kesilen makbuzu iptal et"
                                onClick={() => setCancelTarget({ donation: don, reason: 'Hatalı makbuz girişi' })}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-100"
                              >
                                <XCircle className="h-3 w-3" aria-hidden="true" />
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
                <span>
                  Sayfa {page} / {totalPages} ({total.toLocaleString('tr-TR')} kayıt)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {cancelTarget && (
        <Modal
          title={`${cancelTarget.donation.receipt_number} Makbuzunu İptal Et`}
          size="sm"
          onClose={() => setCancelTarget(null)}
        >
          <form onSubmit={submitCancel} className="space-y-3">
            <p className="text-xs text-gray-600">
              <strong>{cancelTarget.donation.donor_name}</strong> adına kesilen{' '}
              <strong>{formatMoney(cancelTarget.donation.amount_cents, cancelTarget.donation.currency)}</strong> tutarındaki
              makbuz iptal edilecek. Varsa bağlı aidat/taahhüt borcu yeniden açılır.
            </p>
            <TextInput
              label="İptal gerekçesi *"
              required
              value={cancelTarget.reason}
              onChange={(v) => setCancelTarget({ ...cancelTarget, reason: v })}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostButton} onClick={() => setCancelTarget(null)}>
                Vazgeç
              </button>
              <button type="submit" disabled={cancelling} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {cancelling ? 'İptal ediliyor...' : 'Makbuzu İptal Et'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
