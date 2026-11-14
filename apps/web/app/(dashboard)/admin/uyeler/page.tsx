'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import {
  adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess,
} from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface MemberRow {
  id: string; member_no: string; member_type: string; member_type_label: string; status: string; status_label: string
  joined_on: string | null; left_on: string | null; dues_cents: number | null; dues_period: string | null; notes: string | null
  donor_id: string; full_name: string | null; phone: string | null; email: string | null; city: string | null
  open_dues_cents: number; overdue_count: number; last_paid_at: string | null
}
interface Due {
  id: string; member_id: string; period: string; due_date: string; amount_cents: number; status: string; status_label: string
  overdue: boolean; days_overdue: number; paid_at: string | null; waived_reason: string | null
  member_no?: string; full_name?: string | null; phone?: string | null
}
interface MemberDetail extends MemberRow { dues: Due[] }
interface Settings { member_dues_cents: number | null; member_dues_period: string; types: Record<string, string>; statuses: Record<string, string> }
interface Summary {
  members: Record<string, number>; active_by_type: Record<string, number>; open_cents: number; overdue_cents: number
  overdue_members: number; year: number; collected_cents: number
}
interface BookRef { id: string; series: string; branch: string | null; status: string; next_label: string | null }

type Tab = 'members' | 'dues' | 'duplicates' | 'settings'
const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('tr-TR') : '—')
const key = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random()}`.replace('.', '').padEnd(16, '0'))
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

const emptyMember = { member_no: '', member_type: 'asil', status: 'active', joined_on: '', left_on: '', dues: '', dues_period: '', notes: '', first_name: '', last_name: '', phone: '', email: '', tc_no: '', city: '' }

export default function MembersPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'donor_manage')
  const canCollect = hasPermission(access, 'finance_manage')
  const [tab, setTab] = useState<Tab>('members')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [filters, setFilters] = useState({ status: 'active', member_type: '', overdue_only: false, q: '' })
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [form, setForm] = useState<(typeof emptyMember & { id?: string }) | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const refreshSummary = () => adminGet<Summary>('/member-dues-summary').then((r) => setSummary(r.data)).catch(() => {})
  useEffect(() => {
    adminGet<Settings>('/members-settings').then((r) => setSettings(r.data)).catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Üyelik modülü yüklenemedi') }))
    refreshSummary()
  }, [])
  const load = async () => {
    try {
      setMembers((await adminGet<MemberRow[]>('/members', {
        status: filters.status || undefined, member_type: filters.member_type || undefined,
        overdue_only: filters.overdue_only || undefined, q: filters.q || undefined,
      })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Üyeler yüklenemedi') })
    }
  }
  useEffect(() => {
    if (tab !== 'members') return
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters])

  const open = async (id: string) => {
    try {
      setDetail((await adminGet<MemberDetail>(`/members/${id}`)).data)
      setForm(null)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setMessage(null)
    const base = {
      member_no: form.member_no || null, member_type: form.member_type, status: form.status, joined_on: form.joined_on || null,
      left_on: form.left_on || null, dues_cents: form.dues ? Math.round(Number(form.dues.replace(',', '.')) * 100) : null,
      dues_period: form.dues_period || null, notes: form.notes || null,
    }
    try {
      const res = form.id
        ? await adminSend<MemberRow>('put', `/members/${form.id}`, base)
        : await adminSend<MemberRow>('post', '/members', {
          ...base, person: {
            first_name: form.first_name, last_name: form.last_name || null, phone: form.phone || null, email: form.email || null,
            tc_no: form.tc_no || null, city: form.city || null,
          },
        })
      setForm(null)
      setMessage({ type: 'ok', text: `${res.data.member_no} numaralı üye kaydedildi` })
      await load()
      await open(res.data.id)
      refreshSummary()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const s = <K extends keyof typeof emptyMember>(k: K, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Üyeler & Aidat"
        description={<>Dernek üye kayıtları, aidat dönemleri, tahsilat ve geciken aidat takibi. Tahsilat makbuzu &quot;Üye Aidatı&quot; kalemine kesilir.</>}
        actions={canEdit && <button className={primaryButton} onClick={() => { setDetail(null); setForm({ ...emptyMember }) }}>+ Yeni üye</button>}
      />

      {summary && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Aktif üye', summary.members.active.toLocaleString('tr-TR')],
            ['Geciken aidat', `${formatMoney(summary.overdue_cents)} · ${summary.overdue_members} üye`],
            ['Açık aidat toplamı', formatMoney(summary.open_cents)],
            [`${summary.year} tahsilat`, formatMoney(summary.collected_cents)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-gray-400">{k}</p><p className="mt-1 text-lg font-bold text-gray-900">{v}</p></div>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b text-sm font-semibold">
        {([['members', 'Üyeler'], ['dues', 'Aidatlar'], ['duplicates', 'Çift üyeler'], ['settings', 'Aidat ayarı']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setDetail(null); setForm(null); setMessage(null) }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>
      <Notice message={message} />

      {form && settings && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={save} className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{form.id ? `${form.member_no} numaralı üyeyi düzenle` : 'Yeni üye'}</h2>
            {!form.id && (
              <div className="grid gap-3 sm:grid-cols-3">
                <TextInput label="Ad" required value={form.first_name} onChange={(v) => s('first_name', v)} />
                <TextInput label="Soyad" value={form.last_name} onChange={(v) => s('last_name', v)} />
                <TextInput label="Telefon" value={form.phone} onChange={(v) => s('phone', v)} hint="Aynı telefon / e-posta / TC'li kişi varsa o karta bağlanır" />
                <TextInput label="E-posta" type="email" value={form.email} onChange={(v) => s('email', v)} />
                <TextInput label="TC kimlik no" value={form.tc_no} onChange={(v) => s('tc_no', v.replace(/\D/g, ''))} maxLength={11} />
                <TextInput label="Şehir" value={form.city} onChange={(v) => s('city', v)} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-4">
              <TextInput label="Üye no" value={form.member_no} onChange={(v) => s('member_no', v)} hint={form.id ? undefined : 'Boşsa sıradaki numara'} />
              <Label label="Üyelik türü">
                <select className={inputClass} value={form.member_type} onChange={(e) => s('member_type', e.target.value)}>
                  {Object.entries(settings.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
              <Label label="Durum">
                <select className={inputClass} value={form.status} onChange={(e) => s('status', e.target.value)}>
                  {Object.entries(settings.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
              <TextInput label="Kayıt tarihi" type="date" value={form.joined_on} onChange={(v) => s('joined_on', v)} />
              <TextInput label="Ayrılış tarihi" type="date" value={form.left_on} onChange={(v) => s('left_on', v)} />
              <TextInput label="Özel aidat (₺)" inputMode="decimal" value={form.dues} onChange={(v) => s('dues', v)}
                hint={`Boşsa kurum aidatı${settings.member_dues_cents ? ` (${formatMoney(settings.member_dues_cents)})` : ''}`} />
              <Label label="Aidat dönemi">
                <select className={inputClass} value={form.dues_period} onChange={(e) => s('dues_period', e.target.value)}>
                  <option value="">Kurum ayarı ({settings.member_dues_period === 'yearly' ? 'yıllık' : 'aylık'})</option>
                  <option value="monthly">Aylık</option><option value="yearly">Yıllık</option>
                </select>
              </Label>
            </div>
            <TextInput label="Not" value={form.notes} onChange={(v) => s('notes', v)} />
            <div className="flex gap-2">
              <button type="submit" className={primaryButton}>Kaydet</button>
              <button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button>
            </div>
          </form>
        </Card>
      )}

      {detail && !form && (
        <MemberCard detail={detail} canEdit={canEdit} canCollect={canCollect} onEdit={() => setForm({
          id: detail.id, member_no: detail.member_no, member_type: detail.member_type, status: detail.status,
          joined_on: detail.joined_on || '', left_on: detail.left_on || '', dues: detail.dues_cents !== null ? String(detail.dues_cents / 100) : '',
          dues_period: detail.dues_period || '', notes: detail.notes || '', first_name: '', last_name: '', phone: '', email: '', tc_no: '', city: '',
        })} onClose={() => setDetail(null)} onChanged={async (text) => { setMessage({ type: 'ok', text }); await open(detail.id); await load(); refreshSummary() }}
          onError={(text) => setMessage({ type: 'error', text })} />
      )}

      {tab === 'members' && settings && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputClass} w-40`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Tüm durumlar</option>{Object.entries(settings.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className={`${inputClass} w-40`} value={filters.member_type} onChange={(e) => setFilters({ ...filters, member_type: e.target.value })}>
              <option value="">Tüm türler</option>{Object.entries(settings.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={`${inputClass} w-56`} placeholder="Üye no, ad, telefon…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input type="checkbox" checked={filters.overdue_only} onChange={(e) => setFilters({ ...filters, overdue_only: e.target.checked })} /> Yalnız aidatı gecikenler
            </label>
            <div className="ml-auto flex gap-2">
              <button className={ghostButton} onClick={() => exportCsv('uyeler.csv', ['Üye no', 'Ad', 'Telefon', 'E-posta', 'Tür', 'Durum', 'Kayıt', 'Açık aidat', 'Geciken dönem'],
                members.map((m) => [m.member_no, m.full_name, m.phone, m.email, m.member_type_label, m.status_label, fmt(m.joined_on), m.open_dues_cents / 100, m.overdue_count]))}>⬇ CSV</button>
              <button className={ghostButton} onClick={() => downloadVcard(members.map((m) => m.id)).catch(() => setMessage({ type: 'error', text: 'vCard indirilemedi' }))}>⬇ vCard</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <THead><Tr><Th>No</Th><Th>Ad</Th><Th>Telefon</Th><Th>Tür</Th><Th>Durum</Th><Th>Kayıt</Th><Th>Açık aidat</Th><Th>Son ödeme</Th></Tr></THead>
              <TBody>
                {members.map((m) => (
                  <Tr key={m.id} onClick={() => open(m.id)} className={`cursor-pointer border-t hover:bg-gray-50 ${detail?.id === m.id ? 'bg-primary-50/30' : ''}`}>
                    <Td className="font-bold">{m.member_no}</Td>
                    <Td className="font-semibold text-gray-900">{m.full_name}</Td>
                    <Td>{m.phone || '—'}</Td>
                    <Td>{m.member_type_label}</Td>
                    <Td>{m.status_label}</Td>
                    <Td>{fmt(m.joined_on)}</Td>
                    <Td className={m.overdue_count ? 'font-bold text-red-700' : ''}>{m.open_dues_cents ? `${formatMoney(m.open_dues_cents)}${m.overdue_count ? ` (${m.overdue_count} gecikmiş)` : ''}` : '—'}</Td>
                    <Td>{fmt(m.last_paid_at)}</Td>
                  </Tr>
                ))}
                {!members.length && <Tr><Td colSpan={8} className="text-center text-gray-400">Üye yok.</Td></Tr>}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      {tab === 'dues' && <DuesTab canCollect={canCollect} onMessage={setMessage} onChanged={refreshSummary} />}
      {tab === 'duplicates' && <DuplicatesTab canEdit={canEdit} onMessage={setMessage} />}
      {tab === 'settings' && settings && <SettingsTab settings={settings} canEdit={canEdit} onSaved={(v) => setSettings({ ...settings, ...v })} onMessage={setMessage} />}
    </div>
  )
}

async function downloadVcard(ids: string[]) {
  const res = await axios.get(`${adminApiBase()}/api/v1/admin-features/members/vcard`, {
    headers: adminAuthHeaders(), params: ids.length ? { ids: ids.join(',') } : undefined, responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = 'uyeler.vcf'
  a.click()
  URL.revokeObjectURL(url)
}

function CollectForm({ dues, onDone, onError }: { dues: Due[]; onDone: (text: string) => void; onError: (text: string) => void }) {
  const [books, setBooks] = useState<BookRef[]>([])
  const [f, setF] = useState({ payment_method: 'cash', paid_on: '', bank_reference: '', book: '', number: '', send_receipt: true })
  const [idem] = useState(key)
  useEffect(() => { adminGet<BookRef[]>('/receipt-books').then((r) => setBooks(r.data.filter((b) => b.status === 'active'))).catch(() => {}) }, [])
  const total = dues.reduce((s, d) => s + d.amount_cents, 0)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await adminSend<{ receipt_number: string; official_receipt_no: string | null }>('post', '/member-dues/pay', {
        due_ids: dues.map((d) => d.id), idempotency_key: idem, payment_method: f.payment_method, paid_on: f.paid_on || null,
        bank_reference: f.bank_reference || null, receipt_book_id: f.book || null, official_no: f.book && f.number ? Number(f.number) : null,
        send_receipt: f.send_receipt,
      })
      onDone(`${formatMoney(total)} tahsil edildi · makbuz ${res.data.receipt_number}${res.data.official_receipt_no ? ` (matbu ${res.data.official_receipt_no})` : ''}`)
    } catch (err) {
      onError(apiErrorMessage(err, 'Tahsilat yapılamadı'))
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-primary-100 bg-primary-50/30 p-4">
      <p className="text-sm font-bold text-gray-900">{dues.length} dönem · {formatMoney(total)} tahsil et</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Label label="Ödeme şekli">
          <select className={inputClass} value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
            <option value="cash">Nakit</option><option value="bank_transfer">Havale / EFT</option>
          </select>
        </Label>
        <TextInput label="Tarih" type="date" value={f.paid_on} onChange={(v) => setF({ ...f, paid_on: v })} hint="Boşsa bugün" />
        {f.payment_method === 'bank_transfer' && <TextInput label="Dekont no" value={f.bank_reference} onChange={(v) => setF({ ...f, bank_reference: v })} />}
        {books.length > 0 && (
          <Label label="Matbu koçan">
            <select className={inputClass} value={f.book} onChange={(e) => setF({ ...f, book: e.target.value, number: '' })}>
              <option value="">Koçansız</option>{books.map((b) => <option key={b.id} value={b.id}>{b.series} · {b.branch || 'Merkez'} (sıradaki {b.next_label})</option>)}
            </select>
          </Label>
        )}
        {f.book && <TextInput label="Yaprak no" value={f.number} onChange={(v) => setF({ ...f, number: v.replace(/\D/g, '') })} placeholder="otomatik" />}
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={f.send_receipt} onChange={(e) => setF({ ...f, send_receipt: e.target.checked })} /> Makbuzu e-posta ile gönder</label>
      <button type="submit" className={primaryButton}>Tahsil et ve makbuz kes</button>
    </form>
  )
}

function MemberCard({ detail, canEdit, canCollect, onEdit, onClose, onChanged, onError }: {
  detail: MemberDetail; canEdit: boolean; canCollect: boolean; onEdit: () => void; onClose: () => void
  onChanged: (text: string) => void; onError: (text: string) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [collect, setCollect] = useState(false)
  const openDues = detail.dues.filter((d) => d.status === 'open')
  const selected = openDues.filter((d) => picked.has(d.id))
  return (
    <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{detail.full_name} <span className="text-sm font-semibold text-gray-500">· Üye no {detail.member_no}</span></h2>
          <p className="mt-1 text-sm text-gray-500">{[detail.member_type_label, detail.status_label, detail.phone, detail.email, detail.city].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-gray-400">Kayıt {fmt(detail.joined_on)}{detail.left_on ? ` · Ayrılış ${fmt(detail.left_on)}` : ''}{detail.dues_cents !== null ? ` · Özel aidat ${formatMoney(detail.dues_cents)}` : ''}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <button className={ghostButton} onClick={onEdit}>Düzenle</button>}
          <a className={ghostButton} href={`/admin/bagiscilar?donor=${detail.donor_id}`}>Bağışçı kartı</a>
          <button className={ghostButton} onClick={onClose}>Kapat</button>
        </div>
      </div>
      {detail.notes && <p className="whitespace-pre-line text-sm text-gray-700">{detail.notes}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">Aidatlar · açık {formatMoney(detail.open_dues_cents)}</h3>
        {canCollect && openDues.length > 0 && (
          <div className="flex gap-2">
            <button className={ghostButton} onClick={() => setPicked(new Set(openDues.map((d) => d.id)))}>Tümünü seç</button>
            <button className={primaryButton} disabled={!selected.length} onClick={() => setCollect(true)}>Seçilenleri tahsil et</button>
          </div>
        )}
      </div>
      {collect && selected.length > 0 && (
        <CollectForm dues={selected} onError={onError} onDone={(text) => { setCollect(false); setPicked(new Set()); onChanged(text) }} />
      )}
      <Table>
        <THead><Tr><Th /><Th>Dönem</Th><Th>Son ödeme</Th><Th>Tutar</Th><Th>Durum</Th><Th>Ödeme / not</Th></Tr></THead>
        <TBody>
          {detail.dues.map((d) => (
            <Tr key={d.id} className="border-t">
              <Td>{d.status === 'open' && canCollect && (
                <input type="checkbox" checked={picked.has(d.id)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })} />
              )}</Td>
              <Td className="font-semibold">{d.period}</Td>
              <Td>{fmt(d.due_date)}</Td>
              <Td>{formatMoney(d.amount_cents)}</Td>
              <Td className={d.overdue ? 'font-bold text-red-700' : ''}>{d.overdue ? `${d.days_overdue} gün gecikmiş` : d.status_label}</Td>
              <Td>{d.paid_at ? fmt(d.paid_at) : d.waived_reason || '—'}</Td>
            </Tr>
          ))}
          {!detail.dues.length && <Tr><Td colSpan={6} className="text-center text-gray-400">Bu üyeye henüz aidat dönemi açılmamış.</Td></Tr>}
        </TBody>
      </Table>
    </Card>
  )
}

function DuesTab({ canCollect, onMessage, onChanged }: { canCollect: boolean; onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void; onChanged: () => void }) {
  const [status, setStatus] = useState<'overdue' | 'open' | 'paid' | 'waived'>('overdue')
  const [rows, setRows] = useState<Due[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [gen, setGen] = useState({ period: thisMonth(), due_date: '', amount: '' })
  const [preview, setPreview] = useState<{ created: number; total_cents: number; already_had: number; no_amount: number; other_period: number } | null>(null)
  const load = () => adminGet<Due[]>('/member-dues', { status }).then((r) => { setRows(r.data); setPicked(new Set()) }).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  useEffect(() => { load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async (dryRun: boolean) => {
    onMessage(null)
    try {
      const res = await adminSend<NonNullable<typeof preview>>('post', '/member-dues/generate', {
        period: gen.period, due_date: gen.due_date || null, dry_run: dryRun,
        amount_cents: gen.amount ? Math.round(Number(gen.amount.replace(',', '.')) * 100) : null,
      })
      setPreview(dryRun ? res.data : null)
      if (!dryRun) {
        onMessage({ type: 'ok', text: `${gen.period} dönemi için ${res.data.created} üyeye ${formatMoney(res.data.total_cents)} aidat açıldı` })
        load()
        onChanged()
      }
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  const waive = async () => {
    const reason = window.prompt('Muafiyet / silme gerekçesi', 'Yönetim kurulu kararı')
    if (!reason) return
    try {
      const res = await adminSend<{ waived: number }>('post', '/member-dues/waive', { due_ids: [...picked], reason })
      onMessage({ type: 'ok', text: `${res.data.waived} aidat muaf tutuldu` })
      load()
      onChanged()
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  return (
    <div className="space-y-4">
      {canCollect && (
        <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Aidat dönemi aç</h2>
          <p className="text-xs text-gray-500">Aylık dönem (2026-11) aylık aidatlı, yıllık dönem (2026) yıllık aidatlı aktif üyelere açılır. Aynı dönemi tekrar açmak güvenlidir; zaten olanlar atlanır.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36"><TextInput label="Dönem" value={gen.period} onChange={(v) => { setGen({ ...gen, period: v }); setPreview(null) }} placeholder="2026-11 / 2026" /></div>
            <div className="w-44"><TextInput label="Son ödeme tarihi" type="date" value={gen.due_date} onChange={(v) => setGen({ ...gen, due_date: v })} hint="Boşsa dönem sonu" /></div>
            <div className="w-40"><TextInput label="Tutar (₺)" inputMode="decimal" value={gen.amount} onChange={(v) => { setGen({ ...gen, amount: v }); setPreview(null) }} hint="Boşsa üye / kurum aidatı" /></div>
            <button className={ghostButton} onClick={() => generate(true)}>Önizle</button>
            {preview && preview.created > 0 && <button className={primaryButton} onClick={() => generate(false)}>Dönemi aç</button>}
          </div>
          {preview && (
            <p className="text-xs text-gray-700">{preview.created} üyeye toplam {formatMoney(preview.total_cents)} açılacak
              {preview.already_had ? ` · ${preview.already_had} üyede bu dönem zaten var` : ''}
              {preview.no_amount ? ` · ${preview.no_amount} üyenin aidat tutarı yok (Aidat ayarı sekmesi)` : ''}
              {preview.other_period ? ` · ${preview.other_period} üye diğer dönem tipinde` : ''}</p>
          )}
        </Card>
      )}
      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {([['overdue', 'Gecikmiş'], ['open', 'Tüm açık'], ['paid', 'Ödenmiş'], ['waived', 'Muaf']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === k ? 'border-primary-600 bg-primary-50 text-primary-700' : 'bg-white text-gray-600'}`}>{l}</button>
          ))}
          <span className="text-xs text-gray-500">{rows.length} kayıt · {formatMoney(rows.reduce((s, r) => s + r.amount_cents, 0))}</span>
          <div className="ml-auto flex gap-2">
            {canCollect && (status === 'overdue' || status === 'open') && picked.size > 0 && <button className={ghostButton} onClick={waive}>Seçilenleri muaf tut</button>}
            <button className={ghostButton} onClick={() => exportCsv(`aidat-${status}.csv`, ['Üye no', 'Ad', 'Telefon', 'Dönem', 'Son ödeme', 'Tutar', 'Gecikme (gün)', 'Durum'],
              rows.map((r) => [r.member_no, r.full_name, r.phone, r.period, fmt(r.due_date), r.amount_cents / 100, r.days_overdue, r.status_label]))}>⬇ CSV</button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400">Tahsilat için üyeler sekmesinden üyeyi açıp dönemleri seçin. Gecikenlere hatırlatma için listeyi CSV alıp Toplu SMS ekranını kullanabilirsiniz.</p>
        <div className="overflow-x-auto">
          <Table>
            <THead><Tr><Th /><Th>Üye no</Th><Th>Ad</Th><Th>Telefon</Th><Th>Dönem</Th><Th>Son ödeme</Th><Th>Tutar</Th><Th>Durum</Th></Tr></THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id} className="border-t">
                  <Td>{r.status === 'open' && canCollect && <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} />}</Td>
                  <Td className="font-bold">{r.member_no}</Td><Td>{r.full_name}</Td><Td>{r.phone || '—'}</Td><Td>{r.period}</Td><Td>{fmt(r.due_date)}</Td>
                  <Td>{formatMoney(r.amount_cents)}</Td>
                  <Td className={r.overdue ? 'font-bold text-red-700' : ''}>{r.overdue ? `${r.days_overdue} gün gecikmiş` : r.status_label}</Td>
                </Tr>
              ))}
              {!rows.length && <Tr><Td colSpan={8} className="text-center text-gray-400">Kayıt yok.</Td></Tr>}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

function DuplicatesTab({ canEdit, onMessage }: { canEdit: boolean; onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void }) {
  const [groups, setGroups] = useState<{ reason: string; members: MemberRow[] }[] | null>(null)
  const [targets, setTargets] = useState<Record<number, string>>({})
  const load = () => adminGet<{ groups: { reason: string; members: MemberRow[] }[] }>('/members/duplicates').then((r) => { setGroups(r.data.groups); setTargets({}) })
    .catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const merge = async (i: number, members: MemberRow[]) => {
    const target = targets[i] || members[0].id
    if (!(await confirmDialog('Seçilen kayıt dışındakiler silinecek, aidatları asıl kayda taşınacak. Devam edilsin mi?'))) return
    try {
      const res = await adminSend<{ moved_dues: number; dropped_dues: number }>('post', '/members/merge', { target_id: target, source_ids: members.filter((m) => m.id !== target).map((m) => m.id) })
      onMessage({ type: 'ok', text: `Üyelikler birleştirildi; ${res.data.moved_dues} aidat taşındı${res.data.dropped_dues ? `, ${res.data.dropped_dues} mükerrer dönem silindi` : ''}` })
      load()
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  if (!groups) return <p className="text-sm text-gray-400">Yükleniyor…</p>
  if (!groups.length) return <Card className="border border-gray-100 p-6 text-center text-sm text-gray-500 shadow-sm">Çift üye kaydı yok.</Card>
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Aynı kişiye ya da aynı telefona / TC&apos;ye bağlı birden çok üye kaydı. Aynı dönem iki kayıtta da varsa ödenmiş olan kalır.</p>
      {groups.map((g, i) => (
        <Card key={g.members.map((m) => m.id).join()} className="space-y-2 border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500">Eşleşen: {g.reason}</p>
            {canEdit && <button className={primaryButton} onClick={() => merge(i, g.members)}>Birleştir</button>}
          </div>
          <Table><TBody>{g.members.map((m) => (
            <Tr key={m.id} className="border-t">
              <Td><input type="radio" name={`t-${i}`} checked={(targets[i] || g.members[0].id) === m.id} onChange={() => setTargets({ ...targets, [i]: m.id })} /></Td>
              <Td className="font-bold">{m.member_no}</Td><Td>{m.full_name}</Td><Td>{m.phone || '—'}</Td><Td>{m.status_label}</Td><Td>{fmt(m.joined_on)}</Td>
            </Tr>
          ))}</TBody></Table>
        </Card>
      ))}
    </div>
  )
}

function SettingsTab({ settings, canEdit, onSaved, onMessage }: {
  settings: Settings; canEdit: boolean; onSaved: (v: Partial<Settings>) => void; onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void
}) {
  const [amount, setAmount] = useState(settings.member_dues_cents ? String(settings.member_dues_cents / 100) : '')
  const [period, setPeriod] = useState(settings.member_dues_period)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await adminSend<{ member_dues_cents: number | null; member_dues_period: string }>('put', '/members-settings', {
        member_dues_cents: amount ? Math.round(Number(amount.replace(',', '.')) * 100) : null, member_dues_period: period,
      })
      onSaved(res.data)
      onMessage({ type: 'ok', text: 'Aidat ayarı kaydedildi' })
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  return (
    <Card className="border border-gray-100 p-6 shadow-sm">
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-48"><TextInput label="Varsayılan aidat (₺)" inputMode="decimal" value={amount} onChange={setAmount} disabled={!canEdit} /></div>
        <div className="w-40">
          <Label label="Dönem">
            <select className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)} disabled={!canEdit}>
              <option value="monthly">Aylık</option><option value="yearly">Yıllık</option>
            </select>
          </Label>
        </div>
        {canEdit && <button type="submit" className={primaryButton}>Kaydet</button>}
      </form>
      <p className="mt-3 text-xs text-gray-500">Üye kartında özel tutar / dönem girilirse o üye için bu ayar yerine o kullanılır. Değişiklik yalnız yeni açılacak dönemleri etkiler.</p>
    </Card>
  )
}
