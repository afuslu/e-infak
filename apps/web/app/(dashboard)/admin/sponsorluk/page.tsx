'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertCircle, CalendarClock, CheckCircle2, HeartHandshake, MessageCircle, Search, Users, Wallet, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import {
  adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess, whatsappUrl,
} from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { DonorPicker, type PickedDonor } from '../../../../components/admin/DonorPicker'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

interface Beneficiary {
  id: string
  kind: 'talebe' | 'hoca' | 'yetim' | 'diger'
  kind_label: string
  code: string | null
  first_name: string
  last_name: string | null
  full_name: string
  gender: string | null
  birth_date: string | null
  country: string | null
  city: string | null
  school: string | null
  guardian_name: string | null
  guardian_phone: string | null
  photo_url: string | null
  description: string | null
  monthly_need_cents: number
  status: 'active' | 'passive'
  active_pledges: number
  sponsors: string[]
}

interface Installment { id: string; seq: number; due_date: string; amount_cents: number; status: string; paid_at: string | null }

interface PledgeRow {
  id: string
  kind: string
  kind_label: string
  title: string | null
  donor_id: string
  donor_name: string | null
  donor_phone: string | null
  beneficiary_name: string | null
  campaign_title: string | null
  installment_amount_cents: number
  currency: string
  installment_count: number
  start_date: string
  status: string
  paid_count: number
  overdue_count: number
  overdue_cents: number
  next_due_date: string | null
  installments?: Installment[]
}

interface Summary {
  active_pledges: number
  due_this_month: { count: number; amount_cents: number }
  paid_this_month: { count: number; amount_cents: number }
  overdue: { count: number; amount_cents: number }
  sponsored_beneficiaries: number
  waiting_beneficiaries: number
}

const KINDS = [['talebe', 'Talebe / Öğrenci'], ['hoca', 'Hoca / Öğretmen'], ['yetim', 'Yetim'], ['diger', 'Diğer']] as const
const STATUS_LABEL: Record<string, string> = { pending: 'Bekliyor', overdue: 'Gecikmiş', paid: 'Ödendi', cancelled: 'İptal' }

type Tab = 'beneficiaries' | 'pledges'

export default function SponsorshipPage() {
  const { data: access } = useAdminAccess()
  const canOps = hasPermission(access, 'operations_manage')
  const canDonor = hasPermission(access, 'donor_manage')
  const [tab, setTab] = useState<Tab>('beneficiaries')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [allBeneficiaries, setAllBeneficiaries] = useState<Beneficiary[]>([])
  const [allPledges, setAllPledges] = useState<PledgeRow[]>([])
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [pledgeFor, setPledgeFor] = useState<Beneficiary | null>(null)
  const [onlyWaiting, setOnlyWaiting] = useState(false)
  const [onlyOverdue, setOnlyOverdue] = useState(false)

  const loadSummary = () => {
    adminGet<Summary>('/pledges/summary').then((r) => setSummary(r.data)).catch(() => {})
    adminGet<Beneficiary[]>('/beneficiaries').then((r) => setAllBeneficiaries(r.data)).catch(() => {})
    adminGet<PledgeRow[]>('/pledges', { status: 'active' }).then((r) => setAllPledges(r.data)).catch(() => {})
  }
  useEffect(() => { loadSummary() }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Sponsorluk & Burs" description={<>Talebe, hoca ve yetim kayıtları; bağışçılarla eşleştirme ve aylık taksit takibi.</>} />

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard
            label="Aktif taahhüt"
            icon={HeartHandshake}
            value={summary.active_pledges}
            detail={{
              title: 'Aktif Taahhütler',
              content: () => (
                <Table>
                  <THead><Tr><Th>Bağışçı</Th><Th>Yararlanıcı / Kalem</Th><Th className="text-right">Aylık</Th><Th className="text-right">İlerleme</Th></Tr></THead>
                  <TBody>
                    {allPledges.map((p) => (
                      <Tr key={p.id}>
                        <Td className="font-semibold">{p.donor_name}</Td>
                        <Td className="text-xs">{p.title || p.beneficiary_name || p.campaign_title}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(p.installment_amount_cents, p.currency)}</Td>
                        <Td className="text-right text-xs font-bold tabular-nums">{p.paid_count}/{p.installment_count}</Td>
                      </Tr>
                    ))}
                    {allPledges.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Aktif taahhüt yok.</Td></Tr>}
                  </TBody>
                </Table>
              ),
            }}
          />
          <StatCard
            label="Sponsorlu kişi"
            icon={Users}
            tone="good"
            value={summary.sponsored_beneficiaries}
            detail={{
              title: 'Sponsorlu Yararlanıcılar',
              content: () => {
                const sponsored = allBeneficiaries.filter((b) => b.active_pledges > 0)
                return (
                  <Table>
                    <THead><Tr><Th>Ad Soyad</Th><Th>Tür</Th><Th>Sponsorlar</Th></Tr></THead>
                    <TBody>
                      {sponsored.map((b) => (
                        <Tr key={b.id}>
                          <Td className="font-semibold">{b.full_name}</Td>
                          <Td className="text-xs text-gray-500">{b.kind_label}</Td>
                          <Td className="text-xs text-green-700">{b.sponsors.join(', ')}</Td>
                        </Tr>
                      ))}
                      {sponsored.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Sponsorlu kayıt yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
          <StatCard
            label="Sponsor bekleyen"
            icon={CalendarClock}
            tone={summary.waiting_beneficiaries > 0 ? 'warn' : 'neutral'}
            className={summary.waiting_beneficiaries > 0 ? 'border-amber-200 bg-amber-50/40' : undefined}
            value={summary.waiting_beneficiaries}
            detail={{
              title: 'Sponsor Bekleyen Yararlanıcılar',
              content: () => {
                const waiting = allBeneficiaries.filter((b) => b.status === 'active' && b.active_pledges === 0)
                return (
                  <Table>
                    <THead><Tr><Th>Ad Soyad</Th><Th>Tür</Th><Th>Şehir / Ülke</Th><Th className="text-right">Aylık İhtiyaç</Th></Tr></THead>
                    <TBody>
                      {waiting.map((b) => (
                        <Tr key={b.id}>
                          <Td className="font-semibold">{b.full_name}</Td>
                          <Td className="text-xs text-gray-500">{b.kind_label}</Td>
                          <Td className="text-xs text-gray-500">{[b.city, b.country].filter(Boolean).join(', ') || '—'}</Td>
                          <Td className="text-right font-semibold tabular-nums">{b.monthly_need_cents ? formatMoney(b.monthly_need_cents) : '—'}</Td>
                        </Tr>
                      ))}
                      {waiting.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Sponsor bekleyen kayıt yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
          <StatCard
            label="Bu ay beklenen"
            icon={Wallet}
            value={formatMoney(summary.due_this_month.amount_cents)}
            hint={`${summary.due_this_month.count} taksit`}
            detail={{
              title: 'Bu Ay Beklenen Taksitler',
              description: `${summary.due_this_month.count} taksit · Toplam ${formatMoney(summary.due_this_month.amount_cents)}`,
              content: () => (
                <Table>
                  <THead><Tr><Th>Bağışçı</Th><Th>Kalem</Th><Th className="text-right">Sonraki Vade</Th><Th className="text-right">Tutar</Th></Tr></THead>
                  <TBody>
                    {allPledges.filter((p) => p.next_due_date).map((p) => (
                      <Tr key={p.id}>
                        <Td className="font-semibold">{p.donor_name}</Td>
                        <Td className="text-xs">{p.title || p.beneficiary_name || p.campaign_title}</Td>
                        <Td className="text-right text-xs">{p.next_due_date ? new Date(p.next_due_date).toLocaleDateString('tr-TR') : '—'}</Td>
                        <Td className="text-right font-bold tabular-nums">{formatMoney(p.installment_amount_cents, p.currency)}</Td>
                      </Tr>
                    ))}
                    {allPledges.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Beklenen taksit yok.</Td></Tr>}
                  </TBody>
                </Table>
              ),
            }}
          />
          <StatCard
            label="Bu ay ödenen"
            icon={CheckCircle2}
            tone="good"
            value={formatMoney(summary.paid_this_month.amount_cents)}
            hint={`${summary.paid_this_month.count} taksit`}
            detail={{
              title: 'Ödemesi Alınan Taahhütler',
              description: `Bu ay ${summary.paid_this_month.count} taksit · ${formatMoney(summary.paid_this_month.amount_cents)}`,
              content: () => {
                const paidOnes = allPledges.filter((p) => p.paid_count > 0)
                return (
                  <Table>
                    <THead><Tr><Th>Bağışçı</Th><Th>Kalem</Th><Th className="text-right">Ödenen Taksit</Th><Th className="text-right">Aylık</Th></Tr></THead>
                    <TBody>
                      {paidOnes.map((p) => (
                        <Tr key={p.id}>
                          <Td className="font-semibold">{p.donor_name}</Td>
                          <Td className="text-xs">{p.title || p.beneficiary_name || p.campaign_title}</Td>
                          <Td className="text-right font-bold tabular-nums text-green-700">{p.paid_count}/{p.installment_count}</Td>
                          <Td className="text-right tabular-nums">{formatMoney(p.installment_amount_cents, p.currency)}</Td>
                        </Tr>
                      ))}
                      {paidOnes.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Ödenen taksit yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
          <StatCard
            label="Gecikmiş"
            icon={AlertCircle}
            tone={summary.overdue.count > 0 ? 'bad' : 'neutral'}
            className={summary.overdue.count > 0 ? 'border-red-200 bg-red-50/40' : undefined}
            value={`${summary.overdue.count} · ${formatMoney(summary.overdue.amount_cents)}`}
            detail={{
              title: 'Gecikmiş Taahhütler',
              description: `${summary.overdue.count} taksit · ${formatMoney(summary.overdue.amount_cents)}`,
              content: () => {
                const overdueRows = allPledges.filter((p) => p.overdue_count > 0)
                return (
                  <Table>
                    <THead><Tr><Th>Bağışçı</Th><Th>Telefon</Th><Th className="text-right">Geciken</Th><Th className="text-right">Tutar</Th></Tr></THead>
                    <TBody>
                      {overdueRows.map((p) => (
                        <Tr key={p.id}>
                          <Td className="font-semibold">{p.donor_name}</Td>
                          <Td className="text-xs text-gray-500">{p.donor_phone || '—'}</Td>
                          <Td className="text-right font-bold tabular-nums text-red-600">{p.overdue_count}</Td>
                          <Td className="text-right font-bold tabular-nums text-red-600">{formatMoney(p.overdue_cents, p.currency)}</Td>
                        </Tr>
                      ))}
                      {overdueRows.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Gecikmiş taksit yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
        </div>
      )}

      <div className="flex gap-1 border-b text-sm font-semibold">
        {([['beneficiaries', 'Talebe / Hoca / Yetim'], ['pledges', 'Taahhütler & Taksitler']] as [Tab, string][]).map(([k, l]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k)
              if (k === 'beneficiaries') setPledgeFor(null)
            }}
            className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <Notice message={message} />

      {tab === 'beneficiaries' ? (
        <BeneficiariesTab
          canEdit={canOps}
          canPledge={canDonor}
          setMessage={setMessage}
          initialWaiting={onlyWaiting}
          onClearInitialWaiting={() => setOnlyWaiting(false)}
          onPledge={(b) => { setPledgeFor(b); setTab('pledges') }}
        />
      ) : (
        <PledgesTab
          canEdit={canDonor}
          setMessage={setMessage}
          presetBeneficiary={pledgeFor}
          initialOverdue={onlyOverdue}
          onClearInitialOverdue={() => setOnlyOverdue(false)}
          onClearPreset={() => setPledgeFor(null)}
          onChanged={() => { loadSummary(); setPledgeFor(null) }}
        />
      )}
    </div>
  )
}

type SetMessage = (m: { type: 'ok' | 'error'; text: string } | null) => void

const emptyBeneficiary = {
  kind: 'talebe', code: '', first_name: '', last_name: '', gender: '', birth_date: '', country: '', city: '', school: '',
  guardian_name: '', guardian_phone: '', photo_url: '', description: '', monthly_need: '', status: 'active',
}

function BeneficiariesTab({ canEdit, canPledge, setMessage, onPledge, initialWaiting, onClearInitialWaiting }: {
  canEdit: boolean; canPledge: boolean; setMessage: SetMessage; onPledge: (b: Beneficiary) => void;
  initialWaiting: boolean; onClearInitialWaiting: () => void;
}) {
  const [rows, setRows] = useState<Beneficiary[]>([])
  const [filters, setFilters] = useState({ kind: '', sponsored: '', status: '', q: '' })
  const [editing, setEditing] = useState<Beneficiary | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyBeneficiary)

  useEffect(() => {
    if (initialWaiting) {
      setFilters((f) => ({ ...f, sponsored: 'false' }))
      onClearInitialWaiting()
    }
  }, [initialWaiting, onClearInitialWaiting])

  const load = async () => {
    try {
      setRows((await adminGet<Beneficiary[]>('/beneficiaries', {
        kind: filters.kind || undefined, sponsored: filters.sponsored || undefined,
        status: filters.status || undefined, q: filters.q || undefined,
      })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const open = (b: Beneficiary | null) => {
    setEditing(b)
    setShowForm(true)
    setForm(b ? {
      kind: b.kind, code: b.code || '', first_name: b.first_name, last_name: b.last_name || '', gender: b.gender || '',
      birth_date: b.birth_date || '', country: b.country || '', city: b.city || '', school: b.school || '',
      guardian_name: b.guardian_name || '', guardian_phone: b.guardian_phone || '', photo_url: b.photo_url || '',
      description: b.description || '', monthly_need: b.monthly_need_cents ? String(b.monthly_need_cents / 100) : '', status: b.status,
    } : emptyBeneficiary)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const { monthly_need, ...rest } = form
    const body = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      const payload = { ...body, kind: form.kind, status: form.status, first_name: form.first_name,
        monthly_need_cents: monthly_need ? Math.round(Number(monthly_need.replace(',', '.')) * 100) : 0 }
      if (editing) await adminSend('put', `/beneficiaries/${editing.id}`, payload)
      else await adminSend('post', '/beneficiaries', payload)
      setShowForm(false)
      setMessage({ type: 'ok', text: 'Kayıt kaydedildi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const set = (k: keyof typeof emptyBeneficiary, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClass} w-56 pl-8`} placeholder="Ad, kod, şehir, okul" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <select className={`${inputClass} w-44`} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
          <option value="">Tüm türler</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className={`${inputClass} w-44`} value={filters.sponsored} onChange={(e) => setFilters({ ...filters, sponsored: e.target.value })}>
          <option value="">Sponsor durumu</option><option value="true">Sponsorlu</option><option value="false">Sponsor bekleyen</option>
        </select>
        <select className={`${inputClass} w-36`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tüm durumlar</option><option value="active">Aktif</option><option value="passive">Pasif</option>
        </select>
        <button className={ghostButton} onClick={() => exportCsv('yararlanicilar.csv', ['Tür', 'Kod', 'Ad Soyad', 'Ülke', 'Şehir', 'Okul', 'Sponsorlar'],
          rows.map((r) => [r.kind_label, r.code, r.full_name, r.country, r.city, r.school, r.sponsors.join(', ')]))}>⬇ CSV</button>
        <div className="flex-1" />
        {canEdit && <button className={primaryButton} onClick={() => (showForm ? setShowForm(false) : open(null))}>{showForm ? 'Vazgeç' : '+ Yeni Kayıt'}</button>}
      </div>

      {showForm && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Label label="Tür">
              <select className={inputClass} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            <TextInput label="Ad" required value={form.first_name} onChange={(v) => set('first_name', v)} />
            <TextInput label="Soyad" value={form.last_name} onChange={(v) => set('last_name', v)} />
            <TextInput label="Kurum içi kod" value={form.code} onChange={(v) => set('code', v)} />
            <Label label="Cinsiyet">
              <select className={inputClass} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option><option value="erkek">Erkek</option><option value="kadin">Kadın</option>
              </select>
            </Label>
            <TextInput label="Doğum tarihi" type="date" value={form.birth_date} onChange={(v) => set('birth_date', v)} />
            <TextInput label="Ülke" value={form.country} onChange={(v) => set('country', v)} />
            <TextInput label="Şehir" value={form.city} onChange={(v) => set('city', v)} />
            <TextInput label="Okul / medrese / görev yeri" value={form.school} onChange={(v) => set('school', v)} />
            <TextInput label="Veli / yakını" value={form.guardian_name} onChange={(v) => set('guardian_name', v)} />
            <TextInput label="Veli telefonu" value={form.guardian_phone} onChange={(v) => set('guardian_phone', v)} />
            <TextInput label="Aylık ihtiyaç (₺)" inputMode="decimal" value={form.monthly_need} onChange={(v) => set('monthly_need', v)} />
            <div className="sm:col-span-2"><TextInput label="Fotoğraf adresi" placeholder="https://..." value={form.photo_url} onChange={(v) => set('photo_url', v)} /></div>
            <Label label="Durum">
              <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Aktif</option><option value="passive">Pasif</option>
              </select>
            </Label>
            <div className="sm:col-span-2 lg:col-span-4"><TextArea label="Açıklama (sponsora gösterilmez)" rows={2} value={form.description} onChange={(v) => set('description', v)} /></div>
            <div className="flex justify-end sm:col-span-2 lg:col-span-4"><button type="submit" className={primaryButton}>{editing ? 'Kaydet' : 'Ekle'}</button></div>
          </form>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((b) => (
          <Card key={b.id} className={`flex gap-3 border border-gray-100 p-4 shadow-sm ${b.status === 'passive' ? 'opacity-50' : ''}`}>
            {b.photo_url
              ? <img src={b.photo_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
              : <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl font-bold text-gray-400">{b.first_name[0]}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="truncate font-bold text-gray-900">{b.full_name}</div>
                <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold">{b.kind_label}</span>
              </div>
              <div className="truncate text-xs text-gray-500">{[b.school, b.city, b.country].filter(Boolean).join(' · ') || '—'}</div>
              {b.monthly_need_cents > 0 && (
                <div className="mt-1 text-xs text-gray-600">Aylık ihtiyaç: <span className="font-semibold tabular-nums">{formatMoney(b.monthly_need_cents)}</span></div>
              )}
              <div className={`mt-1 text-xs font-semibold ${b.active_pledges ? 'text-green-700' : 'text-amber-700'}`}>
                {b.active_pledges ? `Sponsor: ${b.sponsors.join(', ')}` : 'Sponsor bekliyor'}
              </div>
              <div className="mt-2 flex gap-2">
                {canEdit && <button className={ghostButton} onClick={() => open(b)}>Düzenle</button>}
                {canPledge && b.status === 'active' && <button className={ghostButton} onClick={() => onPledge(b)}>Sponsor eşleştir</button>}
              </div>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <p className="py-10 text-center text-xs text-gray-400 md:col-span-2 xl:col-span-3">Kayıt yok.</p>}
      </div>
    </div>
  )
}

function PledgesTab({ canEdit, setMessage, presetBeneficiary, onChanged, initialOverdue, onClearInitialOverdue, onClearPreset }: {
  canEdit: boolean; setMessage: SetMessage; presetBeneficiary: Beneficiary | null; onChanged: () => void;
  initialOverdue: boolean; onClearInitialOverdue: () => void; onClearPreset: () => void;
}) {
  const [rows, setRows] = useState<PledgeRow[]>([])
  const [filters, setFilters] = useState({ kind: '', status: 'active', overdue: '' })
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<PledgeRow | null>(null)
  const [showForm, setShowForm] = useState(!!presetBeneficiary)
  const [matchModal, setMatchModal] = useState<Installment | null>(null)
  const [receiptInput, setReceiptInput] = useState('')

  useEffect(() => {
    if (initialOverdue) {
      setFilters((f) => ({ ...f, overdue: 'true' }))
      onClearInitialOverdue()
    }
  }, [initialOverdue, onClearInitialOverdue])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((p) =>
      [p.donor_name, p.donor_phone, p.beneficiary_name, p.title, p.campaign_title]
        .some((v) => v?.toLowerCase().includes(q))
    )
  }, [rows, query])
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([])
  const [wells, setWells] = useState<{ id: string; name: string }[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [donor, setDonor] = useState<PickedDonor | null>(null)
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [form, setForm] = useState({
    kind: 'sponsorship', beneficiary_id: presetBeneficiary?.id || '', water_well_id: '', campaign_id: '', title: '',
    amount: presetBeneficiary?.monthly_need_cents ? String(presetBeneficiary.monthly_need_cents / 100) : '',
    count: '12', start_date: iso, notes: '',
  })

  const load = async () => {
    try {
      setRows((await adminGet<PledgeRow[]>('/pledges', {
        kind: filters.kind || undefined, status: filters.status || undefined, overdue: filters.overdue || undefined,
      })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  useEffect(() => { load() }, [filters])
  useEffect(() => {
    adminGet<Beneficiary[]>('/beneficiaries', { status: 'active' }).then((r) => setBeneficiaries(r.data)).catch(() => {})
    adminGet<{ id: string; name: string }[]>('/water-wells').then((r) => setWells(r.data)).catch(() => {})
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])

  const openDetail = async (p: PledgeRow) => {
    try {
      setDetail((await adminGet<PledgeRow>(`/pledges/${p.id}`)).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!donor) {
      setMessage({ type: 'error', text: 'Bağışçı seçin' })
      return
    }
    try {
      const res = await adminSend<PledgeRow>('post', '/pledges', {
        kind: form.kind, donor_id: donor.id,
        beneficiary_id: form.kind === 'sponsorship' ? form.beneficiary_id || null : null,
        water_well_id: form.kind === 'water_well' ? form.water_well_id || null : null,
        campaign_id: form.campaign_id || null, title: form.title || null,
        installment_amount_cents: Math.round(Number(form.amount.replace(',', '.')) * 100),
        installment_count: Number(form.count), start_date: form.start_date, notes: form.notes || null,
      })
      setShowForm(false)
      setDonor(null)
      setMessage({ type: 'ok', text: 'Taahhüt oluşturuldu, taksitler planlandı' })
      setDetail(res.data)
      onChanged()
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const setStatus = async (p: PledgeRow, status: 'active' | 'cancelled') => {
    if (status === 'cancelled' && !(await confirmDialog('Taahhüt iptal edilsin mi? Ödenmemiş taksitler iptal edilir.'))) return
    try {
      setDetail((await adminSend<PledgeRow>('put', `/pledges/${p.id}/status`, { status })).data)
      onChanged()
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const openMatch = (inst: Installment) => {
    setReceiptInput('')
    setMatchModal(inst)
  }

  const submitMatch = async (e: React.FormEvent) => {
    e.preventDefault()
    const receipt = receiptInput.trim()
    if (!receipt || !detail || !matchModal) return
    try {
      const found = await adminGet<{ items: { id: string; donor_id: string }[] }>('/donations', { q: receipt, status: 'confirmed', page_size: 5 })
      const donation = found.data.items.find((d) => d.donor_id === detail.donor_id) || found.data.items[0]
      if (!donation) {
        setMessage({ type: 'error', text: 'Bu makbuz numarasıyla onaylı bağış bulunamadı' })
        return
      }
      await adminSend('post', `/pledges/installments/${matchModal.id}/match`, { donation_id: donation.id })
      setMessage({ type: 'ok', text: 'Taksit bağışla eşleştirildi' })
      setMatchModal(null)
      setReceiptInput('')
      await openDetail(detail)
      onChanged()
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClass} w-56 pl-8`} placeholder="Bağışçı, telefon, yararlanıcı" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className={`${inputClass} w-44`} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
          <option value="">Tüm türler</option><option value="sponsorship">Sponsorluk / Burs</option><option value="water_well">Su Kuyusu</option><option value="general">Genel</option>
        </select>
        <select className={`${inputClass} w-40`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tüm durumlar</option><option value="active">Aktif</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={filters.overdue === 'true'} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked ? 'true' : '' })} /> Yalnız gecikenler
        </label>
        <button className={ghostButton} onClick={() => exportCsv('taahhutler.csv',
          ['Bağışçı', 'Telefon', 'Tür', 'Kime', 'Taksit', 'Ödenen', 'Geciken', 'Geciken tutar', 'Sonraki vade'],
          rows.map((r) => [r.donor_name, r.donor_phone, r.kind_label, r.title, `${r.installment_count} × ${r.installment_amount_cents / 100} ${r.currency}`,
            r.paid_count, r.overdue_count, r.overdue_cents / 100, r.next_due_date]))}>⬇ CSV</button>
        <div className="flex-1" />
        {canEdit && (
          <button
            className={primaryButton}
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                onClearPreset()
              } else {
                setShowForm(true)
              }
            }}
          >
            {showForm ? 'Vazgeç' : '+ Yeni Taahhüt'}
          </button>
        )}
      </div>

      {showForm && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2"><DonorPicker value={donor} onChange={setDonor} label="Sponsor / bağışçı" /></div>
            <Label label="Tür">
              <select className={inputClass} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                <option value="sponsorship">Sponsorluk / Burs</option><option value="water_well">Su Kuyusu</option><option value="general">Genel</option>
              </select>
            </Label>
            {form.kind === 'sponsorship' && (
              <Label label="Kime">
                <select required className={inputClass} value={form.beneficiary_id} onChange={(e) => set('beneficiary_id', e.target.value)}>
                  <option value="">Seçin</option>
                  {beneficiaries.map((b) => <option key={b.id} value={b.id}>{b.full_name} ({b.kind_label}){b.active_pledges ? ' — sponsorlu' : ''}</option>)}
                </select>
              </Label>
            )}
            {form.kind === 'water_well' && (
              <Label label="Su kuyusu">
                <select required className={inputClass} value={form.water_well_id} onChange={(e) => set('water_well_id', e.target.value)}>
                  <option value="">Seçin</option>{wells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Label>
            )}
            {form.kind === 'general' && <TextInput label="Başlık" value={form.title} onChange={(v) => set('title', v)} />}
            <Label label="Tahsil edilecek bağış kalemi">
              <select className={inputClass} value={form.campaign_id} onChange={(e) => set('campaign_id', e.target.value)} required={form.kind !== 'water_well'}>
                <option value="">{form.kind === 'water_well' ? 'Kuyunun kalemi' : 'Seçin'}</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <TextInput label="Aylık taksit (₺)" required inputMode="decimal" value={form.amount} onChange={(v) => set('amount', v)} />
            <TextInput label="Taksit sayısı (ay)" required type="number" min={1} max={120} value={form.count} onChange={(v) => set('count', v)} />
            <TextInput label="İlk taksit tarihi" required type="date" value={form.start_date} onChange={(v) => set('start_date', v)} />
            <div className="sm:col-span-2 lg:col-span-4"><TextInput label="Not" value={form.notes} onChange={(v) => set('notes', v)} /></div>
            <p className="text-xs text-gray-500 sm:col-span-2 lg:col-span-3">
              Bu kaleme bağışçıdan gelen her onaylı bağış, tutarın karşıladığı en eski bekleyen taksitleri otomatik ödenmiş sayar.
            </p>
            <div className="flex justify-end"><button type="submit" className={primaryButton}>Taahhüt oluştur</button></div>
          </form>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className={`border border-gray-100 p-2 shadow-sm ${detail ? 'xl:col-span-6' : 'xl:col-span-12'}`}>
          <ul className="divide-y divide-gray-100">
            {filteredRows.map((p) => {
              const pct = p.installment_count > 0 ? Math.min(100, Math.round((p.paid_count / p.installment_count) * 100)) : 0
              return (
                <li key={p.id}>
                  <button onClick={() => openDetail(p)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 ${detail?.id === p.id ? 'bg-primary-50' : ''}`}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate font-semibold">{p.donor_name} → {p.title || p.beneficiary_name || p.campaign_title}</div>
                      <div className="text-xs text-gray-500">
                        {p.kind_label} · {formatMoney(p.installment_amount_cents, p.currency)} × {p.installment_count} · {p.paid_count}/{p.installment_count} ödendi
                        {p.next_due_date && ` · sonraki ${new Date(p.next_due_date).toLocaleDateString('tr-TR')}`}
                      </div>
                      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {p.overdue_count > 0 && <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">{p.overdue_count} gecikmiş</span>}
                    {p.status !== 'active' && <span className="rounded border px-2 py-0.5 text-[10px] font-bold text-gray-500">{p.status === 'completed' ? 'Tamamlandı' : 'İptal'}</span>}
                  </button>
                </li>
              )
            })}
            {filteredRows.length === 0 && <li className="py-10 text-center text-xs text-gray-400">Taahhüt yok.</li>}
          </ul>
        </Card>

        {detail && (
          <Card className="space-y-3 border border-gray-100 p-5 shadow-sm xl:col-span-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">{detail.title || detail.beneficiary_name}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <span>{detail.donor_name} · {detail.donor_phone} · {detail.campaign_title}</span>
                  {(() => {
                    const wa = whatsappUrl(detail.donor_phone, `Merhaba ${detail.donor_name}, ${detail.title || detail.beneficiary_name || 'sponsorluk'} taahhüdünüz${detail.overdue_count > 0 ? ` (${detail.overdue_count} geciken taksit: ${formatMoney(detail.overdue_cents, detail.currency)})` : ''} hakkında bilgilendirmek isteriz.`)
                    return wa ? (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    ) : null
                  })()}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-xl text-gray-400">✕</button>
            </div>
            <Table>
              <THead>
                <Tr>
                  <Th>#</Th>
                  <Th>Vade</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th className="text-right">Durum</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {(detail.installments || []).map((i) => (
                  <Tr key={i.id}>
                    <Td>{i.seq}.</Td>
                    <Td>{new Date(i.due_date).toLocaleDateString('tr-TR')}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(i.amount_cents, detail.currency)}</Td>
                    <Td className={`py-1.5 text-right font-semibold ${i.status === 'paid' ? 'text-green-700' : i.status === 'overdue' ? 'text-red-600' : 'text-gray-500'}`}>
                      {STATUS_LABEL[i.status] || i.status}
                    </Td>
                    <Td className="text-right">
                      {canEdit && (i.status === 'pending' || i.status === 'overdue') && detail.status === 'active' && (
                        <button className="font-bold text-primary-700" onClick={() => openMatch(i)}>Eşleştir</button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {canEdit && (
              <div className="flex justify-end gap-2 border-t pt-3">
                {detail.status === 'cancelled'
                  ? <button className={ghostButton} onClick={() => setStatus(detail, 'active')}>Yeniden etkinleştir</button>
                  : detail.status === 'active' && <button className={`${ghostButton} text-red-600`} onClick={() => setStatus(detail, 'cancelled')}>Taahhüdü iptal et</button>}
              </div>
            )}
          </Card>
        )}
      </div>

      {matchModal && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Taksit #{matchModal.seq} · Makbuz Eşleştir</h3>
              <button type="button" onClick={() => setMatchModal(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              {detail.donor_name} · Vade: {new Date(matchModal.due_date).toLocaleDateString('tr-TR')} · Tutar: {formatMoney(matchModal.amount_cents, detail.currency)}
            </p>
            <form onSubmit={submitMatch} className="space-y-3">
              <TextInput
                label="Onaylı Bağış Makbuz Numarası"
                required
                value={receiptInput}
                onChange={setReceiptInput}
                placeholder="Örn: MKB-2026-000123"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={ghostButton} onClick={() => setMatchModal(null)}>Vazgeç</button>
                <button type="submit" className={primaryButton}>Eşleştir</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
