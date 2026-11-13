'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { Label, TextArea, TextInput, ghostButton, inputClass, primaryButton } from './FormKit'
import { QuickSmsDialog } from './QuickSmsDialog'
import { smsAmount } from '../../lib/sms'

interface CampaignRef { id: string; title: string }
interface DonorRef { id: string; full_name: string; phone: string | null; email: string | null }
interface BookRef { id: string; series: string; branch: string | null; status: string; next_label: string | null; remaining: number; holder_name: string | null }

export interface ManualReceiptResult {
  id: string
  receipt_number: string
  official_receipt_no?: string | null
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
    campaign_id: '', amount: '', currency: 'TRY', payment_method: 'cash', paid_on: today(),
    bank_reference: '', on_behalf_of: '', note: '', is_anonymous: false, send_receipt: true,
  })
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
    () => (kurban ? kurban.pricePerShareCents * shareCount : Math.round(Number(form.amount.replace(',', '.')) * 100)),
    [form.amount, kurban, shareCount],
  )

  const smsPhone = donor ? donor.phone : newDonor.phone

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!donor && !newDonor.first_name) {
      setError('Bağışçı seçin veya yeni bağışçı adı girin')
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
        campaign_id: kurban ? kurban.campaignId : form.campaign_id,
        amount_cents: amountCents,
        currency: kurban ? 'TRY' : form.currency,
        quantity: kurban ? shareCount : 1,
        metadata: kurban ? {
          kurban_type: kurbanType,
          kurban_names: kurbanNames.split('\n').map((n) => n.trim()).filter(Boolean),
        } : {},
        payment_method: form.payment_method,
        paid_on: form.paid_on || null,
        bank_reference: form.bank_reference || null,
        on_behalf_of: form.on_behalf_of || null,
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
      onDone(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Makbuz kesilemedi'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
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
        <TextInput label="Kimin adına (isteğe bağlı)" placeholder="ör. Rahmetli babam Ahmet Yılmaz" maxLength={200}
          value={form.on_behalf_of} onChange={(v) => setForm({ ...form, on_behalf_of: v })} />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Bağış</h3>
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
          <>
            <Label label="Kampanya / bağış kalemi">
              <select required className={inputClass} value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}>
                <option value="">Seçin</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <TextInput label="Tutar" required inputMode="decimal" placeholder="1500" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
              </div>
              <Label label="Para birimi">
                <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </Label>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Label label="Ödeme şekli">
            <select className={inputClass} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="cash">Nakit (elden)</option>
              <option value="bank_transfer">Havale / EFT</option>
            </select>
          </Label>
          <TextInput label="Bağış tarihi" type="date" max={today()} value={form.paid_on} onChange={(v) => setForm({ ...form, paid_on: v })} />
        </div>
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
        {form.payment_method === 'bank_transfer' && (
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
            💬 {smsBody ? 'SMS metnini düzenle' : 'SMS Gönder'}
          </button>
          <button type="submit" disabled={saving} className={`${primaryButton} flex-1`}>{saving ? 'Kesiliyor...' : 'Makbuzu Kes'}</button>
        </div>
        {smsOpen && (
          <QuickSmsDialog
            title="Hızlı SMS Gönder — Makbuz"
            eventKey="makbuz"
            campaignId={kurban ? kurban.campaignId : form.campaign_id}
            target={{
              donorId: donor?.id, name: donor?.full_name || `${newDonor.first_name} ${newDonor.last_name}`.trim(), phone: smsPhone,
              variables: {
                tutar: amountCents > 0 ? smsAmount(amountCents) : '',
                para_birimi: (kurban ? 'TRY' : form.currency) === 'TRY' ? 'TL' : form.currency,
                bagis_kalemi: campaigns.find((c) => c.id === (kurban ? kurban.campaignId : form.campaign_id))?.title || '',
                kimin_adina: form.on_behalf_of,
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
