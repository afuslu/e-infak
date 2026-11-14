'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminGet, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess, v1Get, v1Send, whatsappUrl } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { DonorPicker, PickedDonor } from '../../../../components/admin/DonorPicker'
import { QuickSmsDialog, SmsStatusPill, loadRelatedSms, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { RelatedSms, smsAmount } from '../../../../lib/sms'
import { ExportButtons, PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'

interface DonorHit { id?: string; name?: string; phone?: string | null; confidence: number; reason?: string; candidates: { id: string; name: string; phone: string | null }[] }
interface CampaignHit { id: string; title: string; category: string; confidence: 'high' | 'medium' | 'low'; reason: string }
interface Suggestion { sender?: string | null; note?: string; donor?: DonorHit; campaign?: CampaignHit | null; kurban_type?: string | null; auto?: boolean; ignored?: string }
interface Transfer {
  id: string; booked_at: string; amount_cents: number; currency: string; sender_name: string | null; description: string | null
  status: 'unmatched' | 'matched' | 'ambiguous' | 'ignored'; source: string; bank_account_id: string | null
  donation_id: string | null; payment_order_id: string | null; suggestion: Suggestion
  donor: { id: string; name: string; phone: string | null } | null
  possible_duplicate?: boolean
  receipts: { donation_id: string; receipt_number: string; campaign_title: string | null; amount_cents: number }[]
}
interface Account { id: string; bank: string; label: string; currency: string }
interface Book { id: string; series: string; status: string; next_label: string | null }

type View = Transfer['status'] | 'duplicates'
const STATUS_TABS: [View, string][] = [['unmatched', 'Bekleyenler'], ['ambiguous', 'Belirsiz / Çoklu Aday'], ['matched', 'Bağışa dönüşenler'], ['ignored', 'Yok sayılanlar'], ['duplicates', 'Mükerrer kayıtlar']]
const EMPTY_FILTERS = { q: '', date_from: '', date_to: '', amount_min: '', amount_max: '', account_id: '' }
const KURBAN_TYPES = [['vacip', 'Vacip'], ['adak', 'Adak'], ['akika', 'Akika'], ['sukur', 'Şükür'], ['nafile', 'Nafile'], ['sadaka', 'Sadaka'], ['sifa', 'Şifa']]
const CONFIDENCE: Record<CampaignHit['confidence'], [string, string]> = {
  high: ['Kesin', 'bg-green-100 text-green-800'], medium: ['Muhtemel', 'bg-amber-100 text-amber-800'], low: ['Tahmin', 'bg-gray-100 text-gray-600'],
}

function donorBadge(d?: DonorHit) {
  if (!d || !d.confidence) return ['Bulunamadı', 'bg-red-100 text-red-700']
  if (d.confidence >= 0.85) return ['Kesin', 'bg-green-100 text-green-800']
  if (d.confidence >= 0.6) return ['Muhtemel', 'bg-amber-100 text-amber-800']
  return ['Aday var', 'bg-gray-100 text-gray-600']
}

const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })

export default function IncomingTransfersPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'finance_manage')
  const [status, setStatus] = useState<View>('unmatched')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [duplicateGroups, setDuplicateGroups] = useState(0)
  const filtered = Object.values(filters).some(Boolean)
  const [items, setItems] = useState<Transfer[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const PAGE_SIZE = 100
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; title: string; category?: string }[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [open, setOpen] = useState<Transfer | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadAccount, setUploadAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [sms, setSms] = useState<Record<string, RelatedSms>>({})
  const [smsFor, setSmsFor] = useState<Transfer | null>(null)
  const canSms = hasPermission(access, 'donor_manage')

  const load = async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, k.startsWith('amount') ? v.replace(',', '.') : v]))
      const res = await v1Get<{ total: number; items: Transfer[]; duplicate_groups?: number }>('/admin/incoming-transfers', {
        ...params, ...(status === 'duplicates' ? { duplicates: true } : { status }), limit: PAGE_SIZE, offset,
      })
      setDuplicateGroups(res.data.duplicate_groups || 0)
      setItems(res.data.items)
      setTotal(res.data.total)
      setSelectedIds([])
      setSms(await loadRelatedSms('donation', res.data.items.map((t) => t.donation_id).filter((id): id is string => !!id)))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Havaleler yüklenemedi') })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setOffset(0)
  }, [status, filters])
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [status, filters, offset]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    v1Get<Account[]>('/admin/bank-accounts').then((r) => setAccounts(r.data)).catch(() => {})
    v1Get<{ items: { id: string; title: string; category?: string }[] }>('/campaigns', { page_size: 100 })
      .then((r) => setCampaigns(r.data.items || [])).catch(() => {})
    adminGet<Book[]>('/receipt-books').then((r) => setBooks(r.data.filter((b) => b.status === 'active'))).catch(() => {})
  }, [])

  const accountName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, `${a.bank} · ${a.label}`])), [accounts])
  const pendingTotal = useMemo(() => items.reduce((s, t) => s + (t.currency === 'TRY' ? t.amount_cents : 0), 0), [items])

  const upload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setMessage(null)
    const body = new FormData()
    body.append('file', file)
    try {
      const query = uploadAccount ? `?bank_account_id=${uploadAccount}` : ''
      const res = await v1Send<{ imported_count: number; skipped_count: number; orders?: number; suggested?: number; auto_approved?: number; ignored?: number }>(
        'post', `/admin/bank-statements/import${query}`, body)
      const r = res.data
      setMessage({ type: 'ok', text: `${r.imported_count} yeni hareket aktarıldı (${r.skipped_count} zaten vardı). Bekleyen: ${r.suggested ?? 0}, otomatik bağış: ${r.auto_approved ?? 0}, sipariş eşleşmesi: ${r.orders ?? 0}, yok sayılan: ${r.ignored ?? 0}.` })
      setFile(null)
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Ekstre aktarılamadı') })
    } finally {
      setBusy(false)
    }
  }

  const reanalyse = async () => {
    setBusy(true)
    try {
      const res = await v1Send<{ analysed: number }>('post', '/admin/incoming-transfers/reanalyse')
      setMessage({ type: 'ok', text: `${res.data.analysed} havale yeniden değerlendirildi.` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const unmatch = async (t: Transfer) => {
    const numbers = t.receipts.map((r) => `#${r.receipt_number}`).join(', ')
    if (!(await confirmDialog(`Hareketin eşleştirmesi kaldırılacak ve eşlenen makbuz (${numbers || 'bağış'}) İPTAL EDİLECEK. Hareket yeniden "Bekleyenler" listesine döner. Devam edilsin mi?`))) return
    try {
      await v1Send('post', `/admin/incoming-transfers/${t.id}/unmatch`)
      setItems((list) => list.filter((x) => x.id !== t.id))
      setTotal((n) => n - 1)
      setMessage({ type: 'ok', text: 'Eşleştirme kaldırıldı; makbuz iptal edildi ve hareket yeniden bekleyenlerde.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Eşleştirme kaldırılamadı') })
    }
  }

  const ignore = async (t: Transfer) => {
    if (!(await confirmDialog({ title: 'Bu hareket bağış sayılmayacak ve listeden kalkacak. Devam edilsin mi?', danger: false }))) return
    try {
      await v1Send('post', `/admin/incoming-transfers/${t.id}/ignore`)
      setItems((list) => list.filter((x) => x.id !== t.id))
      setTotal((n) => n - 1)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const isCertain = (t: Transfer) => {
    const s = t.suggestion || {}
    return Boolean(s.donor?.id && (s.donor.confidence || 0) >= 0.85 && s.campaign?.id && (t.status === 'unmatched' || t.status === 'ambiguous') && t.amount_cents > 0)
  }

  const quickApprove = async (t: Transfer) => {
    const s = t.suggestion || {}
    if (!s.donor?.id || !s.campaign?.id) return
    setBusy(true)
    try {
      const res = await v1Send<{ receipt_number: string; official_receipt_no: string | null }>('post', `/admin/incoming-transfers/${t.id}/approve`, {
        donor_id: s.donor.id,
        campaign_id: s.campaign.id,
        kurban_type: s.kurban_type || null,
        note: s.note || null,
        send_receipt: true,
      })
      setItems((list) => list.filter((x) => x.id !== t.id))
      setTotal((n) => Math.max(0, n - 1))
      setMessage({ type: 'ok', text: `Hızlı onaylandı. Makbuz: ${res.data.official_receipt_no || res.data.receipt_number}` })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Hızlı onay başarısız') })
    } finally {
      setBusy(false)
    }
  }

  const bulkApproveCertain = async () => {
    const targets = items.filter((t) => selectedIds.includes(t.id) && isCertain(t))
    if (!targets.length) return
    if (!(await confirmDialog({ title: `Seçili ${targets.length} kesin eşleşme bağışa dönüştürülecek. Devam edilsin mi?`, danger: false }))) return
    setBusy(true)
    let ok = 0
    for (const t of targets) {
      const s = t.suggestion || {}
      try {
        await v1Send('post', `/admin/incoming-transfers/${t.id}/approve`, {
          donor_id: s.donor!.id,
          campaign_id: s.campaign!.id,
          kurban_type: s.kurban_type || null,
          note: s.note || null,
          send_receipt: true,
        })
        ok++
      } catch { /* continue */ }
    }
    setBusy(false)
    setMessage({ type: 'ok', text: `${ok} / ${targets.length} havale toplu onaylandı.` })
    load()
  }

  const bulkIgnore = async () => {
    const targets = items.filter((t) => selectedIds.includes(t.id) && t.status !== 'matched')
    if (!targets.length) return
    if (!(await confirmDialog({ title: `Seçili ${targets.length} hareket yok sayılacak. Devam edilsin mi?`, danger: false }))) return
    setBusy(true)
    for (const t of targets) {
      try { await v1Send('post', `/admin/incoming-transfers/${t.id}/ignore`) } catch { /* continue */ }
    }
    setBusy(false)
    setMessage({ type: 'ok', text: `${targets.length} hareket yok sayıldı.` })
    load()
  }

  const reopen = async (t: Transfer) => {
    try {
      await v1Send('post', `/admin/reconciliation/${t.id}/reopen`)
      setItems((list) => list.filter((x) => x.id !== t.id))
      setTotal((n) => n - 1)
      setMessage({ type: 'ok', text: 'Hareket yeniden "Bekleyenler" listesine alındı.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Gelen Havaleler" description={<>Bankadan gelen havale ve EFT&apos;ler bağışçı ve kampanya önerisiyle burada bekler; onayladığınızda bağış ve makbuz oluşur.</>} actions={<div className="flex flex-wrap gap-2">
          <Link href="/admin/banka-hesaplari" className={ghostButton}>Banka hesapları ve kurallar</Link>
          <Link href="/admin/reconciliation" className={ghostButton}>Banka mutabakatı</Link>
          {items.length > 0 && (
            <ExportButtons
              filename={`gelen-havaleler-${status}`}
              title="Gelen Havaleler"
              subtitle={`Durum: ${status} · ${items.length} kayıt`}
              currencyCols={[4]}
              getData={() => ({
                headers: ['Tarih', 'Gönderen', 'Açıklama', 'Tutar', 'Para Birimi', 'Durum'],
                rows: items.map((t) => [
                  new Date(t.booked_at).toLocaleDateString('tr-TR'),
                  t.sender_name || '',
                  t.description || '',
                  t.amount_cents / 100,
                  t.currency,
                  t.status,
                ]),
              })}
            />
          )}
          {canEdit && <button onClick={reanalyse} disabled={busy} className={ghostButton}>Önerileri yenile</button>}
        </div>} />

      <Notice message={message} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Listedeki Hareket"
          value={total}
          hint={`Bu sayfada ${items.length} kayıt`}
          detail={{
            title: 'Gelen Havaleler Listesi',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>Gönderen</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {items.map((t) => (
                    <Tr key={t.id}>
                      <Td>{when(t.booked_at)}</Td>
                      <Td>{t.suggestion?.sender || t.sender_name || '—'}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Sayfadaki Tutar (TRY)"
          value={formatMoney(pendingTotal)}
          hint={`${items.filter((t) => t.currency === 'TRY').length} TL hareketi`}
          tone="brand"
          detail={{
            title: 'Sayfadaki TRY Hareketleri',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>Gönderen</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {items.filter((t) => t.currency === 'TRY').map((t) => (
                    <Tr key={t.id}>
                      <Td>{when(t.booked_at)}</Td>
                      <Td>{t.suggestion?.sender || t.sender_name || '—'}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Kesin Öneri"
          value={items.filter(isCertain).length}
          hint="tek tıkla onaya hazır"
          tone="good"
          detail={{
            title: 'Tek Tıkla Onaya Hazır Kesin Eşleşmeler',
            size: 'lg',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Gönderen</Th><Th>Önerilen Bağışçı</Th><Th>Kampanya</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {items.filter(isCertain).map((t) => (
                    <Tr key={t.id}>
                      <Td>{t.suggestion?.sender || t.sender_name || '—'}</Td>
                      <Td>{t.suggestion?.donor?.name || '—'}</Td>
                      <Td>{t.suggestion?.campaign?.title || '—'}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Olası Mükerrer"
          value={duplicateGroups}
          hint="mükerrer grup sayısı"
          tone={duplicateGroups > 0 ? 'warn' : 'neutral'}
          detail={{
            title: 'Olası Mükerrer Hareketler (Bu Sayfa)',
            content: () => (
              <Table inset>
                <THead><Tr><Th>Tarih</Th><Th>Gönderen</Th><Th className="text-right">Tutar</Th></Tr></THead>
                <TBody>
                  {items.filter((t) => t.possible_duplicate).map((t) => (
                    <Tr key={t.id}>
                      <Td>{when(t.booked_at)}</Td>
                      <Td>{t.suggestion?.sender || t.sender_name || '—'}</Td>
                      <Td className="text-right font-mono">{formatMoney(t.amount_cents, t.currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ),
          }}
        />
      </div>

      {canEdit && (
        <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Ekstre yükle (Excel / CSV / MT940 / XML)</h2>
          <p className="text-xs text-gray-500">Bankanın web servisi bağlanana kadar internet şubesinden indirdiğiniz hesap hareketlerini buraya yükleyin. Aynı hareket iki kez kaydedilmez.</p>
          <form onSubmit={upload} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select value={uploadAccount} onChange={(e) => setUploadAccount(e.target.value)} className={`${inputClass} sm:w-64`}>
              <option value="">Hesap seçin (isteğe bağlı)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} · {a.label}</option>)}
            </select>
            <input type="file" accept=".csv,.xlsx,.xls,.sta,.mt940,.mt,.xml" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
            <button type="submit" disabled={!file || busy} className={primaryButton}>{busy ? 'Aktarılıyor…' : 'Aktar'}</button>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setStatus(key)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${status === key ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700'}`}>
            {label}{status === key ? ` (${total})` : key === 'duplicates' && duplicateGroups ? ` (${duplicateGroups} grup)` : ''}
          </button>
        ))}
        {status === 'unmatched' && items.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">Bu sayfadaki bekleyen tutar: <strong>{formatMoney(pendingTotal)}</strong></span>
        )}
      </div>

      <div className="grid gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <input className={`${inputClass} lg:col-span-2`} placeholder="Gönderen, açıklama veya işlem no ara…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <input type="date" aria-label="Başlangıç tarihi" title="Başlangıç tarihi" className={inputClass} value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        <input type="date" aria-label="Bitiş tarihi" title="Bitiş tarihi" className={inputClass} value={filters.date_to}
          onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
        <div className="flex gap-2">
          <input inputMode="decimal" placeholder="Min ₺" className={inputClass} value={filters.amount_min} onChange={(e) => setFilters({ ...filters, amount_min: e.target.value })} />
          <input inputMode="decimal" placeholder="Maks ₺" className={inputClass} value={filters.amount_max} onChange={(e) => setFilters({ ...filters, amount_max: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <select className={inputClass} value={filters.account_id} onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}>
            <option value="">Tüm hesaplar</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} · {a.label}</option>)}
          </select>
          {filtered && <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className={`${ghostButton} whitespace-nowrap`}>Temizle</button>}
        </div>
      </div>
      {status === 'duplicates' && (
        <p className="text-xs text-gray-500">Aynı hesap, aynı gün, aynı tutar ve aynı gönderenli hareketler. Bankadan iki kez gelmiş olabilir; fazlasını “Yok say” ile listeden çıkarın.</p>
      )}

      {canEdit && selectedIds.length > 0 && (status === 'unmatched' || status === 'ambiguous') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs">
          <span className="font-bold text-primary-900">{selectedIds.length} hareket seçildi</span>
          <div className="flex flex-wrap gap-2">
            {items.some((t) => selectedIds.includes(t.id) && isCertain(t)) && (
              <button type="button" disabled={busy} onClick={bulkApproveCertain} className={primaryButton}>
                Kesinleri Toplu Onayla ({items.filter((t) => selectedIds.includes(t.id) && isCertain(t)).length})
              </button>
            )}
            <button type="button" disabled={busy} onClick={bulkIgnore} className={ghostButton}>
              Seçilenleri Yok Say
            </button>
            <button type="button" onClick={() => setSelectedIds([])} className={ghostButton}>
              Seçimi Temizle
            </button>
          </div>
        </div>
      )}

      <Card className="border border-gray-100 p-0 shadow-sm">
        {loading ? (
          <p className="animate-pulse py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {status === 'unmatched' ? 'Bekleyen havale yok.' : 'Kayıt yok.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table inset>
              <THead className="bg-gray-50">
                <Tr>
                  {canEdit && (status === 'unmatched' || status === 'ambiguous') && (
                    <Th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Tümünü seç"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={(e) => setSelectedIds(e.target.checked ? items.map((x) => x.id) : [])}
                      />
                    </Th>
                  )}
                  <Th>Tarih</Th>
                  <Th>Gönderen / açıklama</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th>{status === 'matched' ? 'Bağışçı' : 'Önerilen bağışçı'}</Th>
                  <Th>{status === 'matched' ? 'Makbuz' : 'Önerilen kampanya'}</Th>
                  {status === 'matched' && <Th>SMS</Th>}
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {items.map((t) => {
                  const s = t.suggestion || {}
                  const [dLabel, dClass] = donorBadge(s.donor)
                  return (
                    <Tr key={t.id} className="align-top hover:bg-gray-50/60">
                      {canEdit && (status === 'unmatched' || status === 'ambiguous') && (
                        <Td>
                          <input
                            type="checkbox"
                            aria-label="Seç"
                            checked={selectedIds.includes(t.id)}
                            onChange={(e) =>
                              setSelectedIds((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                            }
                          />
                        </Td>
                      )}
                      <Td className="whitespace-nowrap text-gray-600">
                        {when(t.booked_at)}
                        <div className="text-[10px] text-gray-400">{t.bank_account_id ? accountName[t.bank_account_id] || '' : t.source === 'upload' ? 'Ekstre' : ''}</div>
                      </Td>
                      <Td className="max-w-sm">
                        <div className="font-bold text-gray-900">{s.sender || t.sender_name || '—'}</div>
                        {t.possible_duplicate && <span className="mt-0.5 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-bold text-amber-700">Olası mükerrer</span>}
                        <div className="line-clamp-2 text-gray-500" title={t.description || ''}>{s.note || t.description}</div>
                        {s.ignored && <div className="mt-1 text-[10px] font-bold text-gray-400">{s.ignored}</div>}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-mono font-bold text-gray-900">
                        {(t.amount_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {t.currency}
                      </Td>
                      <Td>
                        {t.status === 'unmatched' ? (
                          <>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${dClass}`}>{dLabel}</span>
                            {s.donor?.name && <div className="mt-1 font-semibold text-gray-800">{s.donor.name}</div>}
                            {!s.donor?.name && !!s.donor?.candidates?.length && <div className="mt-1 text-gray-500">{s.donor.candidates.length} aday</div>}
                            {s.donor?.reason && <div className="text-[10px] text-gray-400">{s.donor.reason}</div>}
                          </>
                        ) : t.donor ? (
                          <>
                            <Link href={`/admin/bagiscilar?donor=${t.donor.id}`} className="font-bold text-primary-700 hover:underline">{t.donor.name}</Link>
                            {t.donor.phone && <div className="font-mono text-[11px] text-gray-500">{t.donor.phone}</div>}
                          </>
                        ) : t.donation_id ? <span className="font-bold text-green-700">Bağış oluşturuldu</span>
                          : t.payment_order_id ? <span className="font-bold text-green-700">Online sipariş ödendi</span> : '—'}
                      </Td>
                      <Td>
                        {t.status === 'unmatched' && s.campaign ? (
                          <>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CONFIDENCE[s.campaign.confidence][1]}`}>{CONFIDENCE[s.campaign.confidence][0]}</span>
                            <div className="mt-1 font-semibold text-gray-800">{s.campaign.title}{s.kurban_type ? ` · ${s.kurban_type}` : ''}</div>
                            <div className="line-clamp-2 text-[10px] text-gray-400">{s.campaign.reason}</div>
                          </>
                        ) : t.status === 'unmatched' ? <span className="text-gray-400">Seçilmedi</span>
                          : t.receipts?.map((r) => (
                            <div key={r.donation_id} className="mb-1 min-w-[210px] last:mb-0">
                              <span className="whitespace-nowrap font-bold text-gray-900">#{r.receipt_number}</span>
                              <span className="text-gray-500"> · {r.campaign_title}</span>
                              {t.receipts.length > 1 && <span className="font-mono text-gray-500"> · {(r.amount_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>}
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <a
                                  href={`${adminApiBase()}/api/v1/public/receipts/${encodeURIComponent(r.receipt_number)}/pdf`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                                >
                                  PDF
                                </a>
                                {t.donor?.phone && whatsappUrl(t.donor.phone, '') && (
                                  <a
                                    href={whatsappUrl(
                                      t.donor.phone,
                                      `Sayın ${t.donor.name}, ${(r.amount_cents / 100).toLocaleString('tr-TR')} ₺ tutarındaki ${r.campaign_title || ''} bağışınız için teşekkür ederiz. Makbuz No: #${r.receipt_number}`,
                                    ) || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded border border-[#25D366]/40 bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#128C7E] hover:bg-[#25D366]/20"
                                  >
                                    <WhatsAppIcon className="h-3 w-3" /> WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                      </Td>
                      {status === 'matched' && <Td><SmsStatusPill sms={t.donation_id ? sms[t.donation_id] : undefined} /></Td>}
                      <Td className="whitespace-nowrap text-right">
                        {t.status === 'matched' && t.donation_id && (
                          <div className="flex justify-end gap-2">
                            {canSms && <button onClick={() => setSmsFor(t)} className={ghostButton}>SMS Gönder</button>}
                            {canEdit && <button onClick={() => unmatch(t)} className={`${ghostButton} text-red-600 hover:border-red-400`}>Eşleştirmeyi kaldır</button>}
                          </div>
                        )}
                        {canEdit && (t.status === 'unmatched' || t.status === 'ambiguous') && (
                          <div className="flex justify-end gap-2">
                            {isCertain(t) && (
                              <button type="button" disabled={busy} onClick={() => quickApprove(t)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                                Hızlı Onayla
                              </button>
                            )}
                            <button onClick={() => setOpen(t)} className={primaryButton}>İncele / onayla</button>
                            <button onClick={() => ignore(t)} className={ghostButton}>Yok say</button>
                          </div>
                        )}
                        {canEdit && t.status === 'ignored' && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => reopen(t)} className={ghostButton}>Bekleyene al</button>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-gray-600">
            <span>Toplam {total} kayıttan {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} arası gösteriliyor</span>
            <div className="flex gap-2">
              <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className={`${ghostButton} disabled:opacity-40`}>
                ← Önceki
              </button>
              <button type="button" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} className={`${ghostButton} disabled:opacity-40`}>
                Sonraki →
              </button>
            </div>
          </div>
        )}
      </Card>

      {smsFor && smsFor.donation_id && (
        <QuickSmsDialog
          title="Hızlı SMS Gönder — Havale"
          eventKey="havale_eslesti"
          target={{ donationId: smsFor.donation_id, name: smsFor.donor?.name || smsFor.suggestion?.sender || smsFor.sender_name }}
          onClose={() => setSmsFor(null)}
          onSent={(r) => { setMessage({ type: 'ok', text: sentNotice(r) }); load() }}
        />
      )}

      {open && (
        <ApproveDialog transfer={open} campaigns={campaigns} books={books} onClose={() => setOpen(null)}
          onDone={(text) => {
            setItems((list) => list.filter((x) => x.id !== open.id))
            setTotal((n) => n - 1)
            setOpen(null)
            setMessage({ type: 'ok', text })
          }} />
      )}
    </div>
  )
}

function ApproveDialog({ transfer, campaigns, books, onClose, onDone }: {
  transfer: Transfer
  campaigns: { id: string; title: string; category?: string }[]
  books: Book[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const s = transfer.suggestion || {}
  const initialDonor = s.donor?.id ? { id: s.donor.id, full_name: s.donor.name || '', phone: s.donor.phone ?? null, email: null } : null
  const [donor, setDonor] = useState<PickedDonor | null>(initialDonor)
  const [newDonor, setNewDonor] = useState<{ full_name: string; phone: string } | null>(null)
  const [campaignId, setCampaignId] = useState(s.campaign?.id || '')
  const [kurbanType, setKurbanType] = useState(s.kurban_type || '')
  const [onBehalf, setOnBehalf] = useState('')
  const [note, setNote] = useState(s.note || '')
  const [bookId, setBookId] = useState('')
  const [sendReceipt, setSendReceipt] = useState(true)
  const [smsBody, setSmsBody] = useState<string | null>(null)
  const [smsOpen, setSmsOpen] = useState(false)
  // A transfer shared between several campaigns: [campaign, amount as typed]
  const [lines, setLines] = useState<{ campaign_id: string; amount: string; on_behalf_of?: string; kurban_type?: string }[] | null>(null)
  const toCents = (value: string) => {
    const clean = value.trim().replace(/\s+/g, '')
    if (!clean) return 0
    let normalized = clean
    if (clean.includes(',') && clean.includes('.')) {
      normalized = clean.lastIndexOf(',') > clean.lastIndexOf('.') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '')
    } else if (clean.includes(',')) {
      normalized = clean.replace(',', '.')
    }
    return Math.round(Number(normalized) * 100) || 0
  }
  const linesTotal = (lines || []).reduce((sum, l) => sum + toCents(l.amount), 0)
  const remaining = transfer.amount_cents - linesTotal
  const money = (cents: number) => (cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  const smsPhone = donor ? donor.phone : newDonor?.phone
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const campaign = campaigns.find((c) => c.id === campaignId)
  const isKurban = campaign?.category === 'kurban' || s.campaign?.category === 'kurban' && s.campaign.id === campaignId

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (lines) {
      if (lines.some((l) => !l.campaign_id || toCents(l.amount) <= 0)) return setError('Her kalem için kampanya ve tutar girin')
      if (remaining !== 0) return setError(`Kalemlerin toplamı havale tutarına eşit olmalı (fark: ${money(remaining)} ${transfer.currency})`)
    } else if (!campaignId) return setError('Kampanya seçin')
    if (!donor && !newDonor?.full_name.trim()) return setError('Bağışçı seçin veya yeni bağışçı girin')
    setSaving(true)
    try {
      const res = await v1Send<{ receipt_number: string; official_receipt_no: string | null; receipts?: string[] }>('post', `/admin/incoming-transfers/${transfer.id}/approve`, {
        donor_id: donor?.id || null,
        new_donor: donor ? null : { full_name: newDonor!.full_name.trim(), phone: newDonor!.phone.trim() || null },
        campaign_id: lines ? null : campaignId,
        lines: lines
          ? lines.map((l) => ({
              campaign_id: l.campaign_id,
              amount_cents: toCents(l.amount),
              on_behalf_of: l.on_behalf_of?.trim() || null,
              kurban_type: l.kurban_type || null,
            }))
          : null,
        kurban_type: !lines && isKurban && kurbanType ? kurbanType : null,
        on_behalf_of: onBehalf.trim() || null,
        note: note.trim() || null,
        receipt_book_id: bookId || null,
        send_receipt: sendReceipt,
        sms_body: smsBody,
      })
      onDone(`Bağış kaydedildi. Makbuz: ${res.data.receipts?.join(', ') || res.data.official_receipt_no || res.data.receipt_number}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Bağış kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="mt-10 w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Havaleyi bağışa dönüştür</h2>
            <p className="text-sm text-gray-500">{when(transfer.booked_at)} · <strong>{(transfer.amount_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {transfer.currency}</strong></p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-700" aria-label="Kapat">×</button>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <div className="font-bold text-gray-800">{s.sender || transfer.sender_name || 'Gönderen okunamadı'}</div>
          <div className="mt-1 break-words">{transfer.description}</div>
        </div>

        {!newDonor ? (
          <div className="space-y-2">
            <DonorPicker value={donor} onChange={setDonor} />
            {!donor && !!s.donor?.candidates?.length && (
              <div className="flex flex-wrap gap-2">
                {s.donor.candidates.map((c) => (
                  <button type="button" key={c.id} onClick={() => setDonor({ id: c.id, full_name: c.name, phone: c.phone, email: null })} className={ghostButton}>
                    {c.name} {c.phone ? `· ${c.phone}` : ''}
                  </button>
                ))}
              </div>
            )}
            {!donor && (
              <button type="button" onClick={() => setNewDonor({ full_name: s.sender || '', phone: '' })} className="text-xs font-bold text-primary-700">
                + Yeni bağışçı olarak ekle
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Yeni bağışçı adı soyadı" value={newDonor.full_name} onChange={(v) => setNewDonor({ ...newDonor, full_name: v })} />
            <TextInput label="Telefon" value={newDonor.phone} onChange={(v) => setNewDonor({ ...newDonor, phone: v })} />
            <button type="button" onClick={() => setNewDonor(null)} className="text-left text-xs font-bold text-primary-700">Kayıtlı bağışçı seç</button>
          </div>
        )}

        {!lines ? (
          <div>
            <Label label="Kampanya" hint={s.campaign ? `Öneri: ${s.campaign.title} (${CONFIDENCE[s.campaign.confidence][0].toLowerCase()})` : undefined}>
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputClass} required>
                <option value="">Seçin</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <button type="button" className="mt-1 text-xs font-bold text-primary-700"
              onClick={() => setLines([{ campaign_id: campaignId, amount: money(transfer.amount_cents) }, { campaign_id: '', amount: '' }])}>
              + Birden fazla bağış kalemine böl
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-xs font-bold text-gray-600">
              <span>Makbuz kalemleri</span>
              <button type="button" className="text-primary-700" onClick={() => setLines(null)}>Tek kaleme dön</button>
            </div>
            {lines.map((line, index) => {
              const lineCamp = campaigns.find((c) => c.id === line.campaign_id)
              return (
                <div key={index} className="space-y-1.5 rounded-lg bg-gray-50 p-2">
                  <div className="flex gap-2">
                    <select value={line.campaign_id} className={inputClass}
                      onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, campaign_id: e.target.value } : l)))}>
                      <option value="">Bağış kalemi seçin</option>
                      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <input value={line.amount} inputMode="decimal" placeholder="Tutar" className={`${inputClass} w-32 text-right font-mono`}
                      onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l)))} />
                    <button type="button" disabled={lines.length <= 2} aria-label="Kalemi sil" className="px-1 text-lg text-gray-400 hover:text-red-600 disabled:opacity-30"
                      onClick={() => setLines(lines.filter((_, i) => i !== index))}>×</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={line.on_behalf_of || ''}
                      placeholder="Kimin adına (isteğe bağlı)"
                      className={`${inputClass} text-xs`}
                      onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, on_behalf_of: e.target.value } : l)))}
                    />
                    {lineCamp?.category === 'kurban' && (
                      <select
                        value={line.kurban_type || ''}
                        className={`${inputClass} w-36 text-xs`}
                        onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, kurban_type: e.target.value } : l)))}
                      >
                        <option value="">Vacip</option>
                        {KURBAN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between text-xs">
              <button type="button" className="font-bold text-primary-700" onClick={() => setLines([...lines, { campaign_id: '', amount: remaining > 0 ? money(remaining) : '' }])}>+ Kalem ekle</button>
              <span className={remaining === 0 ? 'font-bold text-green-700' : 'font-bold text-red-600'}>
                Toplam {money(linesTotal)} / {money(transfer.amount_cents)} {transfer.currency}{remaining !== 0 ? ` · kalan ${money(remaining)}` : ' ✓'}
              </span>
            </div>
          </div>
        )}
        {!lines && isKurban && (
          <Label label="Kurban niyeti">
            <select value={kurbanType} onChange={(e) => setKurbanType(e.target.value)} className={inputClass}>
              <option value="">Vacip</option>
              {KURBAN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Kimin adına (isteğe bağlı)" value={onBehalf} onChange={setOnBehalf} />
          <Label label="Makbuz koçanı (isteğe bağlı)">
            <select value={bookId} onChange={(e) => setBookId(e.target.value)} className={inputClass}>
              <option value="">Koçansız (sistem numarası)</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.series} · sıradaki {b.next_label || '-'}</option>)}
            </select>
          </Label>
        </div>
        <TextInput label="Not" value={note} onChange={setNote} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={sendReceipt} onChange={(e) => setSendReceipt(e.target.checked)} />
          Bağışçıya makbuz / teşekkür mesajı gönder
        </label>
        {smsBody && (
          <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-gray-700">
            <div className="mb-1 font-bold text-primary-800">Bağışla birlikte gidecek SMS</div>
            <div className="whitespace-pre-line">{smsBody}</div>
          </div>
        )}
        {smsOpen && (
          <QuickSmsDialog
            title="Hızlı SMS Gönder — Havale"
            eventKey="havale_eslesti"
            campaignId={lines ? null : campaignId}
            target={{
              donorId: donor?.id, transferId: transfer.id, name: donor?.full_name || newDonor?.full_name, phone: smsPhone,
              variables: {
                tutar: smsAmount(transfer.amount_cents), kimin_adina: onBehalf,
                bagis_kalemi: lines ? lines.map((l) => campaigns.find((c) => c.id === l.campaign_id)?.title).filter(Boolean).join(', ') : campaign?.title || '',
                ...(donor ? {} : { ad_soyad: newDonor?.full_name || '' }),
              },
            }}
            compose={{ initial: smsBody, onDone: setSmsBody }}
            onClose={() => setSmsOpen(false)}
          />
        )}
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" disabled={!smsPhone} onClick={() => setSmsOpen(true)} className={`${ghostButton} mr-auto`}
            title={smsPhone ? undefined : 'Bağışçının telefonu yok'}>
            {smsBody ? 'SMS metnini düzenle' : 'SMS Gönder'}
          </button>
          <button type="button" onClick={onClose} className={ghostButton}>Vazgeç</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Kaydediliyor…' : 'Bağışı kaydet'}</button>
        </div>
      </form>
    </div>
  )
}
