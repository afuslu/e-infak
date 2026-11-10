'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'

interface Book {
  id: string; series: string; start_no: number; end_no: number; next_no: number; branch: string | null
  holder_user_id: string | null; holder_name: string | null; status: 'active' | 'closed'; note: string | null
  size: number; used: number; voided: number; remaining: number; next_label: string | null
}
interface Sheet {
  no: number; label: string; state: 'used' | 'cancelled' | 'voided' | 'gap'; receipt_number?: string; donor_name?: string
  amount_cents?: number; currency?: string; paid_at?: string; reason?: string
}
interface Staff { id: string; first_name: string; last_name: string; is_active: boolean }

const STATE_LABEL: Record<Sheet['state'], [string, string]> = {
  used: ['Kesildi', 'text-gray-700'], cancelled: ['Makbuz iptal', 'text-amber-700'],
  voided: ['Yaprak iptal', 'text-red-700'], gap: ['Atlandı (boş)', 'text-gray-400'],
}
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function ReceiptBooksPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'finance_manage')
  const [books, setBooks] = useState<Book[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [form, setForm] = useState<{ id?: string; series: string; start_no: string; end_no: string; branch: string; holder_user_id: string; status: string; note: string } | null>(null)
  const [sheets, setSheets] = useState<{ book: Book; sheets: Sheet[] } | null>(null)
  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [channels, setChannels] = useState<{ kind: string; label: string; count: number; total_cents: number }[]>([])
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setBooks((await adminGet<Book[]>('/receipt-books')).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Koçanlar yüklenemedi') })
    }
  }
  useEffect(() => {
    load()
    adminGet<Staff[]>('/users').then((r) => setStaff(r.data.filter((s) => s.is_active))).catch(() => {})
  }, [])
  useEffect(() => {
    adminGet<{ channels: typeof channels }>('/receipt-books-summary', range).then((r) => setChannels(r.data.channels)).catch(() => setChannels([]))
  }, [range])

  const openSheets = async (id: string) => {
    try {
      setSheets((await adminGet<{ book: Book; sheets: Sheet[] }>(`/receipt-books/${id}/sheets`)).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setMessage(null)
    try {
      if (form.id) {
        await adminSend('put', `/receipt-books/${form.id}`, {
          branch: form.branch || null, holder_user_id: form.holder_user_id || null, status: form.status, note: form.note || null,
        })
      } else {
        await adminSend('post', '/receipt-books', {
          series: form.series, start_no: Number(form.start_no), end_no: Number(form.end_no), branch: form.branch || null,
          holder_user_id: form.holder_user_id || null, note: form.note || null,
        })
      }
      setForm(null)
      setMessage({ type: 'ok', text: 'Koçan kaydedildi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const voidSheet = async (b: Book) => {
    const no = window.prompt(`${b.series} koçanında iptal edilecek (yırtılan / hatalı) yaprak numarası`, String(b.next_no))
    if (!no) return
    const reason = window.prompt('İptal gerekçesi', 'Yaprak yırtıldı')
    if (!reason) return
    setMessage(null)
    try {
      await adminSend('post', `/receipt-books/${b.id}/void`, { number: Number(no), reason })
      setMessage({ type: 'ok', text: `${b.series}-${no} iptal edildi; bu numara bir daha verilmez` })
      await load()
      if (sheets?.book.id === b.id) await openSheets(b.id)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const totalOf = (kind: string) => channels.filter((c) => c.kind === kind).reduce((s, c) => s + c.total_cents, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Makbuz Koçanları</h1>
          <p className="mt-1 text-sm text-gray-500">Resmî matbu makbuz koçanları. Kesilen ya da iptal edilen numara bir daha verilmez; elle makbuz keserken koçan seçilir.</p>
        </div>
        {canEdit && <button className={primaryButton} onClick={() => setForm({ series: '', start_no: '1', end_no: '50', branch: '', holder_user_id: '', status: 'active', note: '' })}>+ Yeni koçan</button>}
      </div>
      <Notice message={message} />

      {form && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={save} className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{form.id ? `${form.series} koçanını düzenle` : 'Yeni koçan'}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Seri" required value={form.series} disabled={!!form.id} onChange={(v) => setForm({ ...form, series: v.toUpperCase() })} hint="ör. A veya 2026-B" />
              <TextInput label="İlk yaprak no" required inputMode="numeric" value={form.start_no} disabled={!!form.id} onChange={(v) => setForm({ ...form, start_no: v.replace(/\D/g, '') })} />
              <TextInput label="Son yaprak no" required inputMode="numeric" value={form.end_no} disabled={!!form.id} onChange={(v) => setForm({ ...form, end_no: v.replace(/\D/g, '') })} />
              <TextInput label="Şube / temsilcilik" value={form.branch} onChange={(v) => setForm({ ...form, branch: v })} hint="Boşsa Merkez sayılır" />
              <Label label="Zimmetli personel">
                <select className={inputClass} value={form.holder_user_id} onChange={(e) => setForm({ ...form, holder_user_id: e.target.value })}>
                  <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
              </Label>
              {form.id && (
                <Label label="Durum">
                  <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Kullanımda</option><option value="closed">Kapalı</option>
                  </select>
                </Label>
              )}
            </div>
            <TextInput label="Not" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
            <div className="flex gap-2">
              <button type="submit" className={primaryButton}>Kaydet</button>
              <button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button>
            </div>
          </form>
        </Card>
      )}

      <Card className="border border-gray-100 p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-400"><tr><th className="py-1">Seri / aralık</th><th>Şube</th><th>Zimmet</th><th>Kesilen</th><th>İptal yaprak</th><th>Kalan</th><th>Sıradaki</th><th>Durum</th><th /></tr></thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="py-2 font-bold text-gray-900">{b.series} <span className="font-normal text-gray-500">{b.start_no}–{b.end_no}</span></td>
                  <td>{b.branch || 'Merkez'}</td>
                  <td>{b.holder_name || '—'}</td>
                  <td>{b.used}</td>
                  <td>{b.voided}</td>
                  <td className={b.remaining <= 5 && b.status === 'active' ? 'font-bold text-amber-700' : ''}>{b.remaining}</td>
                  <td>{b.next_label || '—'}</td>
                  <td>{b.status === 'active' ? 'Kullanımda' : 'Kapalı'}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="mr-3 font-bold text-primary-700" onClick={() => openSheets(b.id)}>Yapraklar</button>
                    {canEdit && <button className="mr-3 font-bold text-gray-700" onClick={() => setForm({
                      id: b.id, series: b.series, start_no: String(b.start_no), end_no: String(b.end_no), branch: b.branch || '',
                      holder_user_id: b.holder_user_id || '', status: b.status, note: b.note || '',
                    })}>Düzenle</button>}
                    {canEdit && b.status === 'active' && <button className="font-bold text-red-600" onClick={() => voidSheet(b)}>Yaprak iptal</button>}
                  </td>
                </tr>
              ))}
              {!books.length && <tr><td colSpan={9} className="py-6 text-center text-gray-400">Henüz koçan tanımlanmamış.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {sheets && (
        <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">{sheets.book.series} koçanı yaprak dökümü</h2>
            <div className="flex gap-2">
              <button className={ghostButton} onClick={() => exportCsv(`kocan-${sheets.book.series}.csv`, ['Yaprak', 'Durum', 'Sistem makbuz no', 'Bağışçı', 'Tutar', 'Tarih / gerekçe'],
                sheets.sheets.map((s) => [s.label, STATE_LABEL[s.state][0], s.receipt_number, s.donor_name,
                  s.amount_cents !== undefined ? s.amount_cents / 100 : '', s.paid_at ? new Date(s.paid_at).toLocaleDateString('tr-TR') : s.reason]))}>⬇ CSV</button>
              <button className={ghostButton} onClick={() => setSheets(null)}>Kapat</button>
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white text-gray-400"><tr><th className="py-1">Yaprak</th><th>Durum</th><th>Sistem no</th><th>Bağışçı</th><th>Tutar</th><th>Tarih / gerekçe</th></tr></thead>
              <tbody>
                {sheets.sheets.map((s) => (
                  <tr key={s.no} className="border-t">
                    <td className="py-1.5 font-semibold">{s.label}</td>
                    <td className={`font-semibold ${STATE_LABEL[s.state][1]}`}>{STATE_LABEL[s.state][0]}</td>
                    <td>{s.receipt_number || '—'}</td>
                    <td>{s.donor_name || '—'}</td>
                    <td>{s.amount_cents !== undefined ? formatMoney(s.amount_cents, s.currency) : '—'}</td>
                    <td>{s.paid_at ? new Date(s.paid_at).toLocaleDateString('tr-TR') : s.reason || '—'}</td>
                  </tr>
                ))}
                {!sheets.sheets.length && <tr><td colSpan={6} className="py-4 text-center text-gray-400">Bu koçandan henüz makbuz kesilmemiş.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">&quot;Atlandı&quot; satırları, sonraki numaralar kullanıldığı hâlde kesilmemiş yapraklardır; matbu koçanla karşılaştırıp gerekirse iptal edin.</p>
        </Card>
      )}

      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">Online ve şube makbuzları (TL)</h2>
          <div className="flex gap-2">
            <input type="date" className={`${inputClass} w-40`} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <input type="date" className={`${inputClass} w-40`} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[['online', 'Online'], ['branch', 'Şube (koçan)'], ['manual', 'Elle (koçansız)']].map(([kind, label]) => (
            <div key={kind} className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">{label}</p>
              <p className="font-semibold text-gray-800">{formatMoney(totalOf(kind))}</p>
            </div>
          ))}
        </div>
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400"><tr><th className="py-1">Kanal</th><th>Makbuz</th><th>Toplam</th></tr></thead>
          <tbody>{channels.map((c) => (
            <tr key={`${c.kind}-${c.label}`} className="border-t"><td className="py-1.5 font-semibold">{c.label}</td><td>{c.count}</td><td>{formatMoney(c.total_cents)}</td></tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  )
}
