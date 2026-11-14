'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { Modal, PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface Book {
  id: string
  series: string
  start_no: number
  end_no: number
  next_no: number
  branch: string | null
  holder_user_id: string | null
  holder_name: string | null
  status: 'active' | 'closed'
  note: string | null
  size: number
  used: number
  voided: number
  remaining: number
  next_label: string | null
}

interface Sheet {
  no: number
  label: string
  state: 'used' | 'cancelled' | 'voided' | 'gap'
  receipt_number?: string
  donor_name?: string
  amount_cents?: number
  currency?: string
  paid_at?: string
  reason?: string
}

interface Staff {
  id: string
  first_name: string
  last_name: string
  is_active: boolean
}

const STATE_LABEL: Record<Sheet['state'], [string, string]> = {
  used: ['Kesildi', 'text-gray-700'],
  cancelled: ['Makbuz iptal', 'text-amber-700'],
  voided: ['Yaprak iptal', 'text-red-700'],
  gap: ['Atlandı (boş)', 'text-gray-400'],
}

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const

const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ReceiptBooksPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'finance_manage')
  const [books, setBooks] = useState<Book[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'closed'>('')
  const [form, setForm] = useState<{
    id?: string
    series: string
    start_no: string
    end_no: string
    branch: string
    holder_user_id: string
    status: string
    note: string
  } | null>(null)
  const [voidModal, setVoidModal] = useState<{ book: Book; number: string; reason: string } | null>(null)
  const [sheets, setSheets] = useState<{ book: Book; sheets: Sheet[] } | null>(null)
  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [summaryCurrency, setSummaryCurrency] = useState<string>('TRY')
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
    adminGet<Staff[]>('/users')
      .then((r) => setStaff(r.data.filter((s) => s.is_active)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    adminGet<{ channels: typeof channels }>('/receipt-books-summary', { ...range, currency: summaryCurrency })
      .then((r) => setChannels(r.data.channels))
      .catch(() => setChannels([]))
  }, [range, summaryCurrency])

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return books.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false
      if (q) {
        const hay = `${b.series} ${b.branch || 'Merkez'} ${b.holder_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [books, search, statusFilter])

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
          branch: form.branch || null,
          holder_user_id: form.holder_user_id || null,
          status: form.status,
          note: form.note || null,
        })
      } else {
        await adminSend('post', '/receipt-books', {
          series: form.series,
          start_no: Number(form.start_no),
          end_no: Number(form.end_no),
          branch: form.branch || null,
          holder_user_id: form.holder_user_id || null,
          note: form.note || null,
        })
      }
      setForm(null)
      setMessage({ type: 'ok', text: 'Koçan kaydedildi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const submitVoid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voidModal) return
    const { book, number, reason } = voidModal
    if (!number || !reason.trim()) return
    setMessage(null)
    try {
      await adminSend('post', `/receipt-books/${book.id}/void`, { number: Number(number), reason: reason.trim() })
      setVoidModal(null)
      setMessage({ type: 'ok', text: `${book.series}-${number} iptal edildi; bu numara bir daha verilmez` })
      await load()
      if (sheets?.book.id === book.id) await openSheets(book.id)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const deleteBook = async (b: Book) => {
    const ok = await confirmDialog({
      title: `${b.series} (${b.start_no}–${b.end_no}) koçanı silinsin mi?`,
      text: 'Hiç yaprağı kullanılmamış bu koçan kalıcı olarak silinecek.',
      danger: true,
    })
    if (!ok) return
    setMessage(null)
    try {
      await adminSend('delete', `/receipt-books/${b.id}`)
      if (sheets?.book.id === b.id) setSheets(null)
      setMessage({ type: 'ok', text: `${b.series} koçanı silindi` })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Koçan silinemedi') })
    }
  }

  const totalOf = (kind: string) => channels.filter((c) => c.kind === kind).reduce((s, c) => s + c.total_cents, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Makbuz Koçanları"
        description={<>Resmî matbu makbuz koçanları. Kesilen ya da iptal edilen numara bir daha verilmez; elle makbuz keserken koçan seçilir.</>}
        actions={
          canEdit && (
            <button
              className={primaryButton}
              onClick={() =>
                setForm({ series: '', start_no: '1', end_no: '50', branch: '', holder_user_id: '', status: 'active', note: '' })
              }
            >
              + Yeni koçan
            </button>
          )
        }
      />
      <Notice message={message} />

      {form && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={save} className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{form.id ? `${form.series} koçanını düzenle` : 'Yeni koçan'}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput
                label="Seri"
                required
                value={form.series}
                disabled={!!form.id}
                onChange={(v) => setForm({ ...form, series: v.toUpperCase() })}
                hint="ör. A veya 2026-B"
              />
              <TextInput
                label="İlk yaprak no"
                required
                inputMode="numeric"
                value={form.start_no}
                disabled={!!form.id}
                onChange={(v) => setForm({ ...form, start_no: v.replace(/\D/g, '') })}
              />
              <TextInput
                label="Son yaprak no"
                required
                inputMode="numeric"
                value={form.end_no}
                disabled={!!form.id}
                onChange={(v) => setForm({ ...form, end_no: v.replace(/\D/g, '') })}
              />
              <TextInput
                label="Şube / temsilcilik"
                value={form.branch}
                onChange={(v) => setForm({ ...form, branch: v })}
                hint="Boşsa Merkez sayılır"
              />
              <Label label="Zimmetli personel">
                <select
                  className={inputClass}
                  value={form.holder_user_id}
                  onChange={(e) => setForm({ ...form, holder_user_id: e.target.value })}
                >
                  <option value="">—</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </Label>
              {form.id && (
                <Label label="Durum">
                  <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Kullanımda</option>
                    <option value="closed">Kapalı</option>
                  </select>
                </Label>
              )}
            </div>
            <TextInput label="Not" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
            <div className="flex gap-2">
              <button type="submit" className={primaryButton}>
                Kaydet
              </button>
              <button type="button" className={ghostButton} onClick={() => setForm(null)}>
                Vazgeç
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} w-56`}
              placeholder="Seri, şube veya zimmet ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Koçan durumu"
              className={`${inputClass} w-40`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'closed')}
            >
              <option value="">Tüm durumlar</option>
              <option value="active">Kullanımda</option>
              <option value="closed">Kapalı</option>
            </select>
          </div>
          <span className="text-xs text-gray-400">{filteredBooks.length} koçan</span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Seri / aralık</Th>
                <Th>Şube</Th>
                <Th>Zimmet</Th>
                <Th>Kullanım</Th>
                <Th>Kalan</Th>
                <Th>Sıradaki</Th>
                <Th>Durum</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {filteredBooks.map((b) => {
                const usedPct = b.size > 0 ? Math.min(100, Math.round(((b.used + b.voided) / b.size) * 100)) : 0
                return (
                  <Tr key={b.id} className="border-t">
                    <Td className="font-bold text-gray-900">
                      {b.series}{' '}
                      <span className="font-normal text-gray-500">
                        {b.start_no}–{b.end_no}
                      </span>
                    </Td>
                    <Td>{b.branch || 'Merkez'}</Td>
                    <Td>{b.holder_name || '—'}</Td>
                    <Td>
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between text-[11px] text-gray-600 tabular-nums">
                          <span>{b.used} kesildi</span>
                          {b.voided > 0 && <span className="text-red-600">{b.voided} iptal</span>}
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full bg-primary-600" style={{ width: `${usedPct}%` }} />
                        </div>
                      </div>
                    </Td>
                    <Td className={b.remaining <= 5 && b.status === 'active' ? 'font-bold text-amber-700' : ''}>{b.remaining}</Td>
                    <Td className="font-mono text-xs">{b.next_label || '—'}</Td>
                    <Td>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          b.status === 'active'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                        }`}
                      >
                        {b.status === 'active' ? 'Kullanımda' : 'Kapalı'}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <button className="mr-3 font-bold text-primary-700 hover:underline" onClick={() => openSheets(b.id)}>
                        Yapraklar
                      </button>
                      {canEdit && (
                        <button
                          className="mr-3 font-bold text-gray-700 hover:underline"
                          onClick={() =>
                            setForm({
                              id: b.id,
                              series: b.series,
                              start_no: String(b.start_no),
                              end_no: String(b.end_no),
                              branch: b.branch || '',
                              holder_user_id: b.holder_user_id || '',
                              status: b.status,
                              note: b.note || '',
                            })
                          }
                        >
                          Düzenle
                        </button>
                      )}
                      {canEdit && b.status === 'active' && (
                        <button
                          className="mr-2 font-bold text-red-600 hover:underline"
                          onClick={() => setVoidModal({ book: b, number: String(b.next_no), reason: 'Yaprak yırtıldı' })}
                        >
                          Yaprak iptal
                        </button>
                      )}
                      {canEdit && b.used === 0 && b.voided === 0 && (
                        <button
                          type="button"
                          title="Kullanılmamış koçanı sil"
                          onClick={() => deleteBook(b)}
                          className="inline-flex rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </Td>
                  </Tr>
                )
              })}
              {!filteredBooks.length && (
                <Tr>
                  <Td colSpan={8} className="text-center text-gray-400">
                    Koçan bulunamadı.
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </div>
      </Card>

      {sheets && (
        <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">{sheets.book.series} koçanı yaprak dökümü</h2>
            <div className="flex gap-2">
              <button
                className={ghostButton}
                onClick={() =>
                  exportCsv(
                    `kocan-${sheets.book.series}.csv`,
                    ['Yaprak', 'Durum', 'Sistem makbuz no', 'Bağışçı', 'Tutar', 'Tarih / gerekçe'],
                    sheets.sheets.map((s) => [
                      s.label,
                      STATE_LABEL[s.state][0],
                      s.receipt_number,
                      s.donor_name,
                      s.amount_cents !== undefined ? s.amount_cents / 100 : '',
                      s.paid_at ? new Date(s.paid_at).toLocaleDateString('tr-TR') : s.reason,
                    ])
                  )
                }
              >
                ⬇ CSV
              </button>
              <button className={ghostButton} onClick={() => setSheets(null)}>
                Kapat
              </button>
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <THead className="sticky top-0 bg-white">
                <Tr>
                  <Th>Yaprak</Th>
                  <Th>Durum</Th>
                  <Th>Sistem no</Th>
                  <Th>Bağışçı</Th>
                  <Th>Tutar</Th>
                  <Th>Tarih / gerekçe</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {sheets.sheets.map((s) => (
                  <Tr key={s.no} className="border-t">
                    <Td className="font-semibold">{s.label}</Td>
                    <Td className={`font-semibold ${STATE_LABEL[s.state][1]}`}>{STATE_LABEL[s.state][0]}</Td>
                    <Td>{s.receipt_number || '—'}</Td>
                    <Td>{s.donor_name || '—'}</Td>
                    <Td>{s.amount_cents !== undefined ? formatMoney(s.amount_cents, s.currency) : '—'}</Td>
                    <Td>{s.paid_at ? new Date(s.paid_at).toLocaleDateString('tr-TR') : s.reason || '—'}</Td>
                    <Td className="text-right">
                      {canEdit && s.state === 'gap' && sheets.book.status === 'active' && (
                        <button
                          type="button"
                          onClick={() =>
                            setVoidModal({ book: sheets.book, number: String(s.no), reason: 'Atlanan / yırtılan yaprak' })
                          }
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          İptal et
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
                {!sheets.sheets.length && (
                  <Tr>
                    <Td colSpan={7} className="text-center text-gray-400">
                      Bu koçandan henüz makbuz kesilmemiş.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </Table>
          </div>
          <p className="text-[11px] text-gray-400">
            &quot;Atlandı&quot; satırları, sonraki numaralar kullanıldığı hâlde kesilmemiş yapraklardır; matbu koçanla karşılaştırıp gerekirse iptal edin.
          </p>
        </Card>
      )}

      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">Online ve şube makbuzları ({summaryCurrency})</h2>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Para birimi"
              className={`${inputClass} w-24`}
              value={summaryCurrency}
              onChange={(e) => setSummaryCurrency(e.target.value)}
            >
              {CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={`${inputClass} w-40`}
              value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
            />
            <input
              type="date"
              className={`${inputClass} w-40`}
              value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['online', 'Online'],
            ['branch', 'Şube (koçan)'],
            ['manual', 'Elle (koçansız)'],
          ].map(([kind, label]) => (
            <div key={kind} className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] font-bold text-gray-400">{label}</p>
              <p className="font-semibold text-gray-800">{formatMoney(totalOf(kind), summaryCurrency)}</p>
            </div>
          ))}
        </div>
        <Table>
          <THead>
            <Tr>
              <Th>Kanal</Th>
              <Th>Makbuz</Th>
              <Th>Toplam</Th>
            </Tr>
          </THead>
          <TBody>
            {channels.map((c) => (
              <Tr key={`${c.kind}-${c.label}`} className="border-t">
                <Td className="font-semibold">{c.label}</Td>
                <Td>{c.count}</Td>
                <Td>{formatMoney(c.total_cents, summaryCurrency)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {voidModal && (
        <Modal
          title={`${voidModal.book.series} Koçanı — Yaprak İptali`}
          size="sm"
          onClose={() => setVoidModal(null)}
        >
          <form onSubmit={submitVoid} className="space-y-3">
            <TextInput
              label={`İptal edilecek yaprak no (${voidModal.book.start_no}–${voidModal.book.end_no}) *`}
              required
              inputMode="numeric"
              value={voidModal.number}
              onChange={(v) => setVoidModal({ ...voidModal, number: v.replace(/\D/g, '') })}
            />
            <TextInput
              label="İptal gerekçesi *"
              required
              value={voidModal.reason}
              onChange={(v) => setVoidModal({ ...voidModal, reason: v })}
            />
            <p className="text-[11px] text-gray-500">
              İptal edilen yaprak numarası bir daha otomatik veya elle makbuz kesiminde verilmez.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostButton} onClick={() => setVoidModal(null)}>
                Vazgeç
              </button>
              <button type="submit" className={primaryButton}>
                Yaprağı İptal Et
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
