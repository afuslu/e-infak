'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, apiErrorMessage, formatMoney, hasPermission, useAdminAccess, v1Get, v1Send } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { DonorPicker, PickedDonor } from '../../../../components/admin/DonorPicker'
import { QuickSmsDialog, SmsStatusPill, loadRelatedSms, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { RelatedSms, smsAmount } from '../../../../lib/sms'

interface DonorHit { id?: string; name?: string; phone?: string | null; confidence: number; reason?: string; candidates: { id: string; name: string; phone: string | null }[] }
interface CampaignHit { id: string; title: string; category: string; confidence: 'high' | 'medium' | 'low'; reason: string }
interface Suggestion { sender?: string | null; note?: string; donor?: DonorHit; campaign?: CampaignHit | null; kurban_type?: string | null; auto?: boolean; ignored?: string }
interface Transfer {
  id: string; booked_at: string; amount_cents: number; currency: string; sender_name: string | null; description: string | null
  status: 'unmatched' | 'matched' | 'ambiguous' | 'ignored'; source: string; bank_account_id: string | null
  donation_id: string | null; payment_order_id: string | null; suggestion: Suggestion
  donor: { id: string; name: string; phone: string | null } | null
  receipts: { donation_id: string; receipt_number: string; campaign_title: string | null; amount_cents: number }[]
}
interface Account { id: string; bank: string; label: string; currency: string }
interface Book { id: string; series: string; status: string; next_label: string | null }

const STATUS_TABS: [Transfer['status'], string][] = [['unmatched', 'Bekleyenler'], ['matched', 'Bağışa dönüşenler'], ['ignored', 'Yok sayılanlar']]
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
  const [status, setStatus] = useState<Transfer['status']>('unmatched')
  const [items, setItems] = useState<Transfer[]>([])
  const [total, setTotal] = useState(0)
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
      const res = await v1Get<{ total: number; items: Transfer[] }>('/admin/incoming-transfers', { status, limit: 200 })
      setItems(res.data.items)
      setTotal(res.data.total)
      setSms(await loadRelatedSms('donation', res.data.items.map((t) => t.donation_id).filter((id): id is string => !!id)))
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Havaleler yüklenemedi') })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
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
    if (!confirm(`Hareketin eşleştirmesi kaldırılacak ve eşlenen makbuz (${numbers || 'bağış'}) İPTAL EDİLECEK. Hareket yeniden "Bekleyenler" listesine döner. Devam edilsin mi?`)) return
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
    if (!confirm('Bu hareket bağış sayılmayacak ve listeden kalkacak. Devam edilsin mi?')) return
    try {
      await v1Send('post', `/admin/incoming-transfers/${t.id}/ignore`)
      setItems((list) => list.filter((x) => x.id !== t.id))
      setTotal((n) => n - 1)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gelen Havaleler</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bankadan gelen havale ve EFT&apos;ler bağışçı ve kampanya önerisiyle burada bekler; onayladığınızda bağış ve makbuz oluşur.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/banka-hesaplari" className={ghostButton}>Banka hesapları ve kurallar</Link>
          {canEdit && <button onClick={reanalyse} disabled={busy} className={ghostButton}>Önerileri yenile</button>}
        </div>
      </div>

      <Notice message={message} />

      {canEdit && (
        <Card className="space-y-3 border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Ekstre yükle (Excel / CSV)</h2>
          <p className="text-xs text-gray-500">Bankanın web servisi bağlanana kadar internet şubesinden indirdiğiniz hesap hareketlerini buraya yükleyin. Aynı hareket iki kez kaydedilmez.</p>
          <form onSubmit={upload} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select value={uploadAccount} onChange={(e) => setUploadAccount(e.target.value)} className={`${inputClass} sm:w-64`}>
              <option value="">Hesap seçin (isteğe bağlı)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} · {a.label}</option>)}
            </select>
            <input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
            <button type="submit" disabled={!file || busy} className={primaryButton}>{busy ? 'Aktarılıyor…' : 'Aktar'}</button>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setStatus(key)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${status === key ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700'}`}>
            {label}{status === key ? ` (${total})` : ''}
          </button>
        ))}
        {status === 'unmatched' && items.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">Bu sayfadaki bekleyen tutar: <strong>{formatMoney(pendingTotal)}</strong></span>
        )}
      </div>

      <Card className="border border-gray-100 p-0 shadow-sm">
        {loading ? (
          <p className="animate-pulse py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {status === 'unmatched' ? 'Bekleyen havale yok.' : 'Kayıt yok.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-[10px] font-bold uppercase text-gray-500">
                <tr>
                  <th className="p-3">Tarih</th>
                  <th className="p-3">Gönderen / açıklama</th>
                  <th className="p-3 text-right">Tutar</th>
                  <th className="p-3">{status === 'matched' ? 'Bağışçı' : 'Önerilen bağışçı'}</th>
                  <th className="p-3">{status === 'matched' ? 'Makbuz' : 'Önerilen kampanya'}</th>
                  {status === 'matched' && <th className="p-3">SMS</th>}
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((t) => {
                  const s = t.suggestion || {}
                  const [dLabel, dClass] = donorBadge(s.donor)
                  return (
                    <tr key={t.id} className="align-top hover:bg-gray-50/60">
                      <td className="whitespace-nowrap p-3 text-gray-600">
                        {when(t.booked_at)}
                        <div className="text-[10px] text-gray-400">{t.bank_account_id ? accountName[t.bank_account_id] || '' : t.source === 'upload' ? 'Ekstre' : ''}</div>
                      </td>
                      <td className="max-w-sm p-3">
                        <div className="font-bold text-gray-900">{s.sender || t.sender_name || '—'}</div>
                        <div className="line-clamp-2 text-gray-500" title={t.description || ''}>{s.note || t.description}</div>
                        {s.ignored && <div className="mt-1 text-[10px] font-bold text-gray-400">{s.ignored}</div>}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right font-mono font-bold text-gray-900">
                        {(t.amount_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {t.currency}
                      </td>
                      <td className="p-3">
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
                      </td>
                      <td className="p-3">
                        {t.status === 'unmatched' && s.campaign ? (
                          <>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CONFIDENCE[s.campaign.confidence][1]}`}>{CONFIDENCE[s.campaign.confidence][0]}</span>
                            <div className="mt-1 font-semibold text-gray-800">{s.campaign.title}{s.kurban_type ? ` · ${s.kurban_type}` : ''}</div>
                            <div className="line-clamp-2 text-[10px] text-gray-400">{s.campaign.reason}</div>
                          </>
                        ) : t.status === 'unmatched' ? <span className="text-gray-400">Seçilmedi</span>
                          : t.receipts?.map((r) => (
                            <div key={r.donation_id} className="mb-1 min-w-[190px] last:mb-0">
                              <span className="whitespace-nowrap font-bold text-gray-900">#{r.receipt_number}</span>
                              <span className="text-gray-500"> · {r.campaign_title}</span>
                              {t.receipts.length > 1 && <span className="font-mono text-gray-500"> · {(r.amount_cents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>}
                            </div>
                          ))}
                      </td>
                      {status === 'matched' && <td className="p-3"><SmsStatusPill sms={t.donation_id ? sms[t.donation_id] : undefined} /></td>}
                      <td className="whitespace-nowrap p-3 text-right">
                        {t.status === 'matched' && t.donation_id && (
                          <div className="flex justify-end gap-2">
                            {canSms && <button onClick={() => setSmsFor(t)} className={ghostButton}>💬 SMS Gönder</button>}
                            {canEdit && <button onClick={() => unmatch(t)} className={`${ghostButton} text-red-600 hover:border-red-400`}>Eşleştirmeyi kaldır</button>}
                          </div>
                        )}
                        {canEdit && t.status === 'unmatched' && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setOpen(t)} className={primaryButton}>İncele / onayla</button>
                            <button onClick={() => ignore(t)} className={ghostButton}>Yok say</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
  const [lines, setLines] = useState<{ campaign_id: string; amount: string }[] | null>(null)
  const toCents = (value: string) => Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100) || 0
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
        lines: lines ? lines.map((l) => ({ campaign_id: l.campaign_id, amount_cents: toCents(l.amount) })) : null,
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
            {lines.map((line, index) => (
              <div key={index} className="flex gap-2">
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
            ))}
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
            💬 {smsBody ? 'SMS metnini düzenle' : 'SMS Gönder'}
          </button>
          <button type="button" onClick={onClose} className={ghostButton}>Vazgeç</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Kaydediliyor…' : 'Bağışı kaydet'}</button>
        </div>
      </form>
    </div>
  )
}
