'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Plus, X } from 'lucide-react'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, useAdminAccess, v1Get } from '../../lib/admin-access'
import { Label, TextArea, TextInput, ghostButton, inputClass, primaryButton } from './FormKit'
import { QuickSmsDialog } from './QuickSmsDialog'
import { smsAmount } from '../../lib/sms'

interface CampaignRef { id: string; title: string }
interface DonorRef { id: string; full_name: string; phone: string | null; email: string | null }
interface Staff { id: string; first_name: string; last_name: string; is_active: boolean }
interface AccountRef { id: string; bank: string; label: string }
interface Line { campaign_id: string; amount: string; currency: string; quantity: string; on_behalf_of: string }
const emptyLine = (): Line => ({ campaign_id: '', amount: '', currency: 'TRY', quantity: '1', on_behalf_of: '' })
const toCents = (value: string) => Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100) || 0
const nowTime = () => new Date().toTimeString().slice(0, 5)

interface BookRef { id: string; series: string; branch: string | null; status: string; next_label: string | null; remaining: number; holder_name: string | null }

export interface ManualReceiptResult {
  id: string
  receipt_number: string
  official_receipt_no?: string | null
  receipt_numbers?: string[]
  status?: string
}

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(16).slice(2)}`.padEnd(16, '0')
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface KurbanMode {
  campaignId: string
  pricePerShareCents: number
  types: { key: string; label: string }[]
}

/** Staff form for donations received in cash or by bank transfer outside the online checkout. */
export function ManualReceiptForm({
  onDone, presetDonor, kurban,
}: { onDone: (r: ManualReceiptResult) => void; presetDonor?: DonorRef; kurban?: KurbanMode }) {
  const [campaigns, setCampaigns] = useState<CampaignRef[]>([])
  const [books, setBooks] = useState<BookRef[]>([])
  const [book, setBook] = useState({ id: '', number: '' })
  const [donorQuery, setDonorQuery] = useState('')
  const [donorResults, setDonorResults] = useState<DonorRef[]>([])
  const [donor, setDonor] = useState<DonorRef | null>(presetDonor || null)
  const [newDonor, setNewDonor] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const [form, setForm] = useState({
    payment_method: 'cash', paid_on: today(), paid_time: nowTime(), status: 'paid', issued_by_id: '',
    bank_reference: '', on_behalf_of: '', note: '', is_anonymous: false, send_receipt: true,
  })
  // The video's "Makbuz Detay": one row per donation item, "+ Bağış Ekle" adds another.
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [staff, setStaff] = useState<Staff[]>([])
  const [accounts, setAccounts] = useState<AccountRef[]>([])
  const { data: access } = useAdminAccess()
  const setLine = (index: number, patch: Partial<Line>) => setLines((all) => all.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const [shareCount, setShareCount] = useState(1)
  const [kurbanType, setKurbanType] = useState(kurban?.types[0]?.key || 'vacip')
  const [kurbanNames, setKurbanNames] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Text staff wrote for this receipt's SMS; null = the organisation's automatic receipt SMS
  const [smsBody, setSmsBody] = useState<string | null>(null)
  const [smsOpen, setSmsOpen] = useState(false)

  useEffect(() => {
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((res) => setCampaigns(res.data.items || []))
      .catch(() => setCampaigns([]))
    // Koçan modülü pakette yoksa liste boş kalır ve alan gösterilmez.
    adminGet<BookRef[]>('/receipt-books')
      .then((res) => setBooks(res.data.filter((b) => b.status === 'active')))
      .catch(() => setBooks([]))
    // Both lists depend on permissions and modules; the fields simply stay hidden without them.
    adminGet<Staff[]>('/users').then((res) => setStaff(res.data.filter((s) => s.is_active))).catch(() => setStaff([]))
    v1Get<AccountRef[]>('/admin/bank-accounts').then((res) => setAccounts(res.data)).catch(() => setAccounts([]))
  }, [])

  useEffect(() => {
    if (donor || donorQuery.trim().length < 2) {
      setDonorResults([])
      return
    }
    const t = setTimeout(() => {
      adminGet<{ items: DonorRef[] }>('/donors', { q: donorQuery, page_size: 8, sort: 'name' })
        .then((res) => setDonorResults(res.data.items))
        .catch(() => setDonorResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [donorQuery, donor])

  const amountCents = useMemo(
    () => (kurban ? kurban.pricePerShareCents * shareCount : lines.reduce((sum, l) => sum + toCents(l.amount), 0)),
    [lines, kurban, shareCount],
  )
  const currencies = [...new Set(lines.map((l) => l.currency))]
  const firstCampaign = kurban ? kurban.campaignId : lines.find((l) => l.campaign_id)?.campaign_id || ''

  const smsPhone = donor ? donor.phone : newDonor.phone

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!donor && !newDonor.first_name) {
      setError('Bağışçı seçin veya yeni bağışçı adı girin')
      return
    }
    if (!kurban && lines.some((l) => !l.campaign_id || toCents(l.amount) <= 0)) {
      setError('Her satır için bağış kalemi ve tutar girin')
      return
    }
    if (!amountCents || amountCents <= 0) {
      setError('Geçerli bir tutar girin')
      return
    }
    setSaving(true)
    try {
      const res = await adminSend<ManualReceiptResult>('post', '/donations/manual', {
        idempotency_key: idempotencyKey,
        donor_id: donor?.id || null,
        donor: donor ? null : {
          first_name: newDonor.first_name,
          last_name: newDonor.last_name || null,
          phone: newDonor.phone || null,
          email: newDonor.email || null,
        },
        ...(kurban ? {
          campaign_id: kurban.campaignId, amount_cents: amountCents, currency: 'TRY', quantity: shareCount,
          metadata: { kurban_type: kurbanType, kurban_names: kurbanNames.split('\n').map((n) => n.trim()).filter(Boolean) },
        } : {
          lines: lines.map((l) => ({
            campaign_id: l.campaign_id, amount_cents: toCents(l.amount), currency: l.currency,
            quantity: Math.max(1, Number(l.quantity) || 1), on_behalf_of: l.on_behalf_of.trim() || null,
          })),
        }),
        payment_method: form.payment_method.startsWith('acc:') ? 'bank_transfer' : form.payment_method,
        bank_account_id: form.payment_method.startsWith('acc:') ? form.payment_method.slice(4) : null,
        paid_on: form.paid_on || null,
        paid_time: form.paid_time || null,
        status: form.status,
        issued_by_id: form.issued_by_id || null,
        bank_reference: form.bank_reference || null,
        on_behalf_of: kurban ? form.on_behalf_of || null : null,
        note: form.note || null,
        is_anonymous: form.is_anonymous,
        send_receipt: form.send_receipt,
        sms_body: smsBody,
        receipt_book_id: book.id || null,
        official_no: book.id && book.number ? Number(book.number) : null,
      })
      if (book.id) {
        adminGet<BookRef[]>('/receipt-books').then((r) => setBooks(r.data.filter((b) => b.status === 'active'))).catch(() => {})
        setBook({ ...book, number: '' })
      }
      setIdempotencyKey(newKey())
      setSmsBody(null)
      setLines([emptyLine()])
      onDone(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Makbuz kesilemedi'))
    } finally {
      setSaving(false)
    }
  }

  const compact = Boolean(presetDonor && !kurban)

  return (
    <form onSubmit={submit} className={compact ? 'space-y-3' : 'grid gap-4 lg:grid-cols-2'}>
      {!compact && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-900">Bağışçı</h3>
          {donor ? (
            <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm">
              <div>
                <div className="font-semibold">{donor.full_name}</div>
                <div className="text-xs text-gray-500">{[donor.phone, donor.email].filter(Boolean).join(' · ')}</div>
              </div>
              {!presetDonor && <button type="button" onClick={() => setDonor(null)} className="text-xs font-bold text-primary-700">Değiştir</button>}
            </div>
          ) : (
            <>
              <div className="relative">
                <TextInput label="Kayıtlı bağışçı ara" placeholder="Ad, telefon veya e-posta" value={donorQuery} onChange={setDonorQuery} />
                {donorResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg">
                    {donorResults.map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => { setDonor(d); setDonorQuery('') }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                          <span className="font-semibold">{d.full_name}</span>
                          <span className="ml-2 text-xs text-gray-500">{d.phone || d.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-xs font-semibold text-gray-400">veya yeni bağışçı (aynı telefon/e-posta varsa mevcut kayda bağlanır)</div>
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Ad" value={newDonor.first_name} onChange={(v) => setNewDonor({ ...newDonor, first_name: v })} />
                <TextInput label="Soyad" value={newDonor.last_name} onChange={(v) => setNewDonor({ ...newDonor, last_name: v })} />
                <TextInput label="Telefon" value={newDonor.phone} onChange={(v) => setNewDonor({ ...newDonor, phone: v })} />
                <TextInput label="E-posta" type="email" value={newDonor.email} onChange={(v) => setNewDonor({ ...newDonor, email: v })} />
              </div>
            </>
          )}
          {kurban && (
            <TextInput label="Kimin adına (isteğe bağlı)" placeholder="ör. Rahmetli babam Ahmet Yılmaz" maxLength={200}
              value={form.on_behalf_of} onChange={(v) => setForm({ ...form, on_behalf_of: v })} />
          )}
        </div>
      )}

      <div className="space-y-3">
        {!compact && <h3 className="text-sm font-bold text-gray-900">Bağış</h3>}
        {kurban ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Hisse sayısı" type="number" min={1} max={700} value={shareCount}
                onChange={(v) => setShareCount(Math.max(1, Math.min(700, Number(v) || 1)))} />
              <Label label="Kurban türü">
                <select className={inputClass} value={kurbanType} onChange={(e) => setKurbanType(e.target.value)}>
                  {kurban.types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </Label>
            </div>
            <TextArea label="Hissedar isimleri (her satıra bir isim)" rows={3} value={kurbanNames} onChange={setKurbanNames}
              hint="Boş bırakılan hisseler bağışçı adına (veya 'kimin adına' alanına) yazılır." />
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              Tutar: <strong>{(amountCents / 100).toLocaleString('tr-TR')} ₺</strong>
              <span className="text-gray-500"> ({shareCount} × {(kurban.pricePerShareCents / 100).toLocaleString('tr-TR')} ₺)</span>
            </div>
          </>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-xs font-bold text-gray-600">Makbuz detayı</div>
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-12 gap-2">
                <select required aria-label="Bağış kalemi" className={`${inputClass} col-span-12 sm:col-span-4`} value={line.campaign_id}
                  onChange={(e) => setLine(index, { campaign_id: e.target.value })}>
                  <option value="">Bağış kalemi seçin</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <input aria-label="Adet" inputMode="numeric" className={`${inputClass} col-span-3 sm:col-span-2 text-center`} value={line.quantity}
                  onChange={(e) => setLine(index, { quantity: e.target.value.replace(/\D/g, '') })} />
                <input aria-label="Tutar" required inputMode="decimal" placeholder="Tutar" className={`${inputClass} col-span-5 sm:col-span-3 text-right font-mono`} value={line.amount}
                  onChange={(e) => setLine(index, { amount: e.target.value })} />
                <select aria-label="Döviz" className={`${inputClass} col-span-3 sm:col-span-2`} value={line.currency} onChange={(e) => setLine(index, { currency: e.target.value })}>
                  <option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
                <button type="button" aria-label="Satırı sil" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  className="col-span-1 flex items-center justify-center text-gray-400 hover:text-red-600 disabled:opacity-30">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                <input aria-label="Kimin adına" placeholder="Kimin adına (isteğe bağlı)" maxLength={200} className={`${inputClass} col-span-12`} value={line.on_behalf_of}
                  onChange={(e) => setLine(index, { on_behalf_of: e.target.value })} />
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 text-xs">
              <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="flex items-center gap-1 font-bold text-primary-700">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Bağış Ekle
              </button>
              <span className="font-bold text-gray-700">
                Toplam {currencies.length === 1 ? `${(amountCents / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencies[0] === 'TRY' ? '₺' : currencies[0]}` : 'farklı para birimleri'}
              </span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Label label="Ödeme şekli">
            <select className={inputClass} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="cash">Nakit (elden)</option>
              <option value="credit_card">Kredi kartı (POS)</option>
              <option value="bank_transfer">Havale / EFT</option>
              {accounts.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.bank} · {a.label}</option>)}
            </select>
          </Label>
          <TextInput label="Tarih" type="date" max={today()} value={form.paid_on} onChange={(v) => setForm({ ...form, paid_on: v })} />
          <TextInput label="Saat" type="time" value={form.paid_time} onChange={(v) => setForm({ ...form, paid_time: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Label label="Durumu">
            <div className="flex gap-1.5">
              {([['paid', 'Ödendi'], ['pending', 'Beklemede']] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setForm({ ...form, status: key })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${form.status === key ? (key === 'paid' ? 'border-green-300 bg-green-50 text-green-700' : 'border-amber-300 bg-amber-50 text-amber-700') : 'border-gray-200 text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </Label>
          {staff.length > 1 && (
            <Label label="Personel">
              <select className={inputClass} value={form.issued_by_id || access?.me.id || ''} onChange={(e) => setForm({ ...form, issued_by_id: e.target.value })}>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            </Label>
          )}
        </div>
        {form.status === 'pending' && <p className="text-xs text-amber-700">Beklemedeki makbuz ödeme alınana kadar kampanya toplamına girmez ve bağışçıya bildirim gitmez; Bağışlar listesinden “Ödendi” yapılır.</p>}
        {books.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label label="Matbu makbuz koçanı" hint={book.id ? `Boş bırakılırsa sıradaki yaprak: ${books.find((b) => b.id === book.id)?.next_label || '—'}` : undefined}>
                <select className={inputClass} value={book.id} onChange={(e) => setBook({ id: e.target.value, number: '' })}>
                  <option value="">Koçansız (yalnız sistem makbuzu)</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>{b.series} · {b.branch || 'Merkez'}{b.holder_name ? ` · ${b.holder_name}` : ''} ({b.remaining} yaprak)</option>
                  ))}
                </select>
              </Label>
            </div>
            {book.id && <TextInput label="Yaprak no" inputMode="numeric" placeholder="otomatik" value={book.number} onChange={(v) => setBook({ ...book, number: v.replace(/\D/g, '') })} />}
          </div>
        )}
        {form.payment_method !== 'cash' && (
          <TextInput label="Banka işlem / dekont no" value={form.bank_reference} onChange={(v) => setForm({ ...form, bank_reference: v })} />
        )}
        <TextArea label="Not" rows={2} value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-gray-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.send_receipt} onChange={(e) => setForm({ ...form, send_receipt: e.target.checked })} /> Makbuzu e-posta/SMS ile gönder</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })} /> İsimsiz göster</label>
        </div>
        {smsBody && (
          <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs text-gray-700">
            <div className="mb-1 font-bold text-primary-800">Makbuzla birlikte gidecek SMS</div>
            <div className="whitespace-pre-line">{smsBody}</div>
          </div>
        )}
        {error && <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-sm font-semibold text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button type="button" disabled={!smsPhone} onClick={() => setSmsOpen(true)} className={`${ghostButton} whitespace-nowrap`}
            title={smsPhone ? undefined : 'Bağışçının telefonu yok'}>
            {smsBody ? 'SMS metnini düzenle' : 'SMS Gönder'}
          </button>
          <button type="submit" disabled={saving} className={`${primaryButton} flex-1`}>{saving ? 'Kesiliyor...' : form.status === 'pending' ? 'Beklemede olarak kaydet' : 'Makbuzu Kes'}</button>
        </div>
        {smsOpen && (
          <QuickSmsDialog
            title="Hızlı SMS Gönder — Makbuz"
            eventKey="makbuz"
            campaignId={firstCampaign}
            target={{
              donorId: donor?.id, name: donor?.full_name || `${newDonor.first_name} ${newDonor.last_name}`.trim(), phone: smsPhone,
              variables: {
                tutar: amountCents > 0 ? smsAmount(amountCents) : '',
                para_birimi: currencies[0] === 'TRY' || kurban ? 'TL' : currencies[0],
                bagis_kalemi: (kurban ? [kurban.campaignId] : lines.map((l) => l.campaign_id))
                  .map((id) => campaigns.find((c) => c.id === id)?.title).filter(Boolean).join(', '),
                kimin_adina: kurban ? form.on_behalf_of : lines.map((l) => l.on_behalf_of).filter(Boolean).join(', '),
                ...(donor ? {} : { ad_soyad: `${newDonor.first_name} ${newDonor.last_name}`.trim(), ad: newDonor.first_name }),
              },
            }}
            compose={{ initial: smsBody, onDone: setSmsBody }}
            onClose={() => setSmsOpen(false)}
          />
        )}
      </div>
    </form>
  )
}

export async function downloadReceiptPdf(donationId: string, receiptNumber: string) {
  const res = await axios.get(`${adminApiBase()}/api/v1/admin-features/donations/${donationId}/receipt.pdf`, {
    headers: adminAuthHeaders(),
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `makbuz-${receiptNumber}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
