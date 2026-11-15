'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  HeartHandshake,
  Plus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, whatsappUrl, can } from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { DonorPicker, type PickedDonor } from '../../../../components/admin/DonorPicker'
import { ExportButtons, Modal, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, ResponsiveDataToolbar } from '../../../../components/admin/muhasebe/OnMuhasebeUI'

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
  const canOps = can(access, 'operations.manage')
  const canDonor = can(access, 'operations.manage')
  const [tab, setTab] = useState<Tab>('beneficiaries')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [allBeneficiaries, setAllBeneficiaries] = useState<Beneficiary[]>([])
  const [allPledges, setAllPledges] = useState<PledgeRow[]>([])
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [pledgeFor, setPledgeFor] = useState<Beneficiary | null>(null)
  const [onlyWaiting, setOnlyWaiting] = useState(false)
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [statModal, setStatModal] = useState<'beneficiaries' | 'due' | 'paid' | 'overdue' | null>(null)
  const [triggerNewBeneficiary, setTriggerNewBeneficiary] = useState(0)
  const [triggerNewPledge, setTriggerNewPledge] = useState(0)

  const loadSummary = () => {
    adminGet<Summary>('/pledges/summary').then((r) => setSummary(r.data)).catch(() => {})
    adminGet<Beneficiary[]>('/beneficiaries').then((r) => setAllBeneficiaries(r.data)).catch(() => {})
    adminGet<PledgeRow[]>('/pledges', { status: 'active' }).then((r) => setAllPledges(r.data)).catch(() => {})
  }
  useEffect(() => { loadSummary() }, [])

  return (
    <div className="space-y-5">
      <AppPageHeader
        eyebrow="SAHA & ORGANİZASYON"
        title="Sponsorluk & Burs Yönetimi"
        meta="Talebe, yetim ve hoca burs kayıtları; bağışçılarla eşleştirme, aylık taahhüt ve taksit tahsilat takibi."
        icon={<HeartHandshake className="h-6 w-6" />}
        chips={
          summary ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                ✓ {summary.sponsored_beneficiaries} Sponsorlu Kişi
              </span>
              {summary.waiting_beneficiaries > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  ⏳ {summary.waiting_beneficiaries} Sponsor Bekleyen
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                📋 {summary.active_pledges} Aktif Taahhüt
              </span>
            </>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canOps && (
              <button
                type="button"
                onClick={() => {
                  setTab('beneficiaries')
                  setTriggerNewBeneficiary((n) => n + 1)
                }}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
              >
                <Plus className="h-4 w-4" />
                Yeni Yararlanıcı
              </button>
            )}
            {canDonor && (
              <button
                type="button"
                onClick={() => {
                  setTab('pledges')
                  setTriggerNewPledge((n) => n + 1)
                }}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Yeni Taahhüt
              </button>
            )}
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <GlobalStatCard
            id="beneficiaries"
            title="SPONSORLU & BEKLEYEN"
            value={`${summary.sponsored_beneficiaries} / ${summary.sponsored_beneficiaries + summary.waiting_beneficiaries}`}
            subtitle={`${summary.waiting_beneficiaries} kişi sponsor eşleştirmesi bekliyor`}
            icon={<Users className="h-4 w-4" />}
            gradient="from-emerald-600 to-teal-700"
            onClick={() => setStatModal('beneficiaries')}
          />
          <GlobalStatCard
            id="due"
            title="BU AY BEKLENEN TAKSİT"
            value={formatMoney(summary.due_this_month.amount_cents)}
            subtitle={`${summary.due_this_month.count} taksit · ${summary.active_pledges} aktif taahhüt`}
            icon={<Wallet className="h-4 w-4" />}
            gradient="from-blue-600 to-indigo-700"
            onClick={() => setStatModal('due')}
          />
          <GlobalStatCard
            id="paid"
            title="BU AY TAHSİL EDİLEN"
            value={formatMoney(summary.paid_this_month.amount_cents)}
            subtitle={`Bu ay ${summary.paid_this_month.count} taksit ödendi`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            gradient="from-teal-500 to-emerald-600"
            onClick={() => setStatModal('paid')}
          />
          <GlobalStatCard
            id="overdue"
            title="GECİKMİŞ TAKSİTLER"
            value={formatMoney(summary.overdue.amount_cents)}
            subtitle={summary.overdue.count > 0 ? `${summary.overdue.count} gecikmiş taksit var` : 'Gecikmiş taksit bulunmuyor'}
            icon={<AlertCircle className="h-4 w-4" />}
            gradient={summary.overdue.count > 0 ? 'from-rose-500 to-red-600' : 'from-slate-500 to-slate-700'}
            onClick={() => setStatModal('overdue')}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(k) => {
            setTab(k)
            if (k === 'beneficiaries') setPledgeFor(null)
          }}
          tabs={[
            { key: 'beneficiaries', label: 'Yararlanıcılar (Talebe / Yetim / Hoca)', count: allBeneficiaries.length, icon: Users },
            { key: 'pledges', label: 'Taahhütler & Taksit Takibi', count: allPledges.length, icon: CalendarClock },
          ]}
        />
      </div>

      <Notice message={message} />

      {tab === 'beneficiaries' ? (
        <BeneficiariesTab
          canEdit={canOps}
          canPledge={canDonor}
          setMessage={setMessage}
          initialWaiting={onlyWaiting}
          onClearInitialWaiting={() => setOnlyWaiting(false)}
          triggerNew={triggerNewBeneficiary}
          onChanged={loadSummary}
          onPledge={(b) => { setPledgeFor(b); setTab('pledges') }}
        />
      ) : (
        <PledgesTab
          canEdit={canDonor}
          setMessage={setMessage}
          presetBeneficiary={pledgeFor}
          initialOverdue={onlyOverdue}
          triggerNew={triggerNewPledge}
          onClearInitialOverdue={() => setOnlyOverdue(false)}
          onClearPreset={() => setPledgeFor(null)}
          onChanged={() => { loadSummary(); setPledgeFor(null) }}
        />
      )}

      {summary && (
        <MuhasebeStatModal
          isOpen={statModal !== null}
          onClose={() => setStatModal(null)}
          title={
            statModal === 'beneficiaries'
              ? 'Yararlanıcı Sponsorluk Durumu'
              : statModal === 'due'
                ? 'Aktif Taahhütler & Sonraki Vadeler'
                : statModal === 'paid'
                  ? 'Ödemesi Alınan Taahhütler'
                  : 'Gecikmiş Taahhütler'
          }
          items={
            statModal === 'beneficiaries'
              ? allBeneficiaries.map((b) => ({
                  label: `${b.full_name} (${b.kind_label})`,
                  value: b.active_pledges > 0 ? `Sponsorlu (${b.sponsors.join(', ')})` : 'Sponsor Bekliyor',
                  sub: [b.school, b.city, b.country, b.monthly_need_cents ? `İhtiyaç: ${formatMoney(b.monthly_need_cents)}` : null].filter(Boolean).join(' · '),
                  color: b.active_pledges > 0 ? 'emerald' : 'amber',
                }))
              : statModal === 'due'
                ? allPledges.map((p) => ({
                    label: `${p.donor_name || 'Bağışçı'} → ${p.title || p.beneficiary_name || p.campaign_title || ''}`,
                    value: formatMoney(p.installment_amount_cents, p.currency),
                    sub: `${p.paid_count}/${p.installment_count} ödendi · Sonraki vade: ${p.next_due_date ? new Date(p.next_due_date).toLocaleDateString('tr-TR') : '—'}`,
                    percent: p.installment_count > 0 ? Math.round((p.paid_count / p.installment_count) * 100) : 0,
                    color: 'blue',
                  }))
                : statModal === 'paid'
                  ? allPledges
                      .filter((p) => p.paid_count > 0)
                      .map((p) => ({
                        label: `${p.donor_name || 'Bağışçı'} → ${p.title || p.beneficiary_name || p.campaign_title || ''}`,
                        value: `${p.paid_count}/${p.installment_count} Taksit`,
                        sub: `Aylık: ${formatMoney(p.installment_amount_cents, p.currency)}`,
                        percent: p.installment_count > 0 ? Math.round((p.paid_count / p.installment_count) * 100) : 0,
                        color: 'emerald',
                      }))
                  : allPledges
                      .filter((p) => p.overdue_count > 0)
                      .map((p) => ({
                        label: `${p.donor_name || 'Bağışçı'} (${p.donor_phone || '—'})`,
                        value: `${p.overdue_count} Geciken · ${formatMoney(p.overdue_cents, p.currency)}`,
                        sub: p.title || p.beneficiary_name || p.campaign_title || '',
                        color: 'rose',
                      }))
          }
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

function BeneficiariesTab({ canEdit, canPledge, setMessage, onPledge, initialWaiting, onClearInitialWaiting, triggerNew, onChanged }: {
  canEdit: boolean; canPledge: boolean; setMessage: SetMessage; onPledge: (b: Beneficiary) => void;
  initialWaiting: boolean; onClearInitialWaiting: () => void; triggerNew: number; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Beneficiary[]>([])
  const [filters, setFilters] = useState({ kind: '', sponsored: '', status: '', q: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<Beneficiary | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyBeneficiary)

  useEffect(() => {
    if (triggerNew > 0) open(null)
  }, [triggerNew])

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
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      load()
      return
    }
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
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const set = (k: keyof typeof emptyBeneficiary, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const activeFilterCount = [filters.kind, filters.sponsored, filters.status].filter(Boolean).length

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <ResponsiveDataToolbar
          search={{
            value: filters.q,
            onChange: (q) => setFilters({ ...filters, q }),
            placeholder: 'Ad soyad, kurum kodu, şehir veya okul ara...',
          }}
          filter={{
            activeCount: activeFilterCount,
            onOpen: () => setShowFilters((v) => !v),
            label: 'Gelişmiş Filtreler',
            showOnDesktop: true,
          }}
          extraActions={
            <ExportButtons
              filename="yararlanicilar"
              title="Sponsorluk Yararlanıcıları"
              subtitle={`${rows.length} kayıt`}
              getData={() => ({
                headers: ['Tür', 'Kod', 'Ad Soyad', 'Ülke', 'Şehir', 'Okul', 'Aylık İhtiyaç', 'Sponsorlar'],
                rows: rows.map((r) => [
                  r.kind_label,
                  r.code,
                  r.full_name,
                  r.country,
                  r.city,
                  r.school,
                  r.monthly_need_cents ? formatMoney(r.monthly_need_cents) : '—',
                  r.sponsors.join(', ') || 'Bekliyor',
                ]),
              })}
            />
          }
        />

        {showFilters && (
          <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-3">
            <Label label="Yararlanıcı Türü">
              <select className={inputClass} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
                <option value="">Tüm türler</option>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            <Label label="Sponsorluk Durumu">
              <select className={inputClass} value={filters.sponsored} onChange={(e) => setFilters({ ...filters, sponsored: e.target.value })}>
                <option value="">Tümü</option>
                <option value="true">Sponsorlu</option>
                <option value="false">Sponsor bekleyen</option>
              </select>
            </Label>
            <Label label="Kayıt Durumu">
              <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">Tüm durumlar</option>
                <option value="active">Aktif</option>
                <option value="passive">Pasif</option>
              </select>
            </Label>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((b) => (
          <div
            key={b.id}
            className={`flex gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md ${
              b.status === 'passive' ? 'opacity-60' : ''
            }`}
          >
            {b.photo_url ? (
              <img src={b.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-xl font-black text-white shadow-inner">
                {b.first_name[0]}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="truncate text-base font-black text-slate-900">{b.full_name}</div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {b.kind_label}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
                {[b.code && `#${b.code}`, b.school, b.city, b.country].filter(Boolean).join(' · ') || 'Konum / kurum belirtilmedi'}
              </div>
              {b.monthly_need_cents > 0 && (
                <div className="mt-1.5 text-xs text-slate-600">
                  Aylık ihtiyaç: <span className="font-bold text-slate-900 tabular-nums">{formatMoney(b.monthly_need_cents)}</span>
                </div>
              )}
              <div className="mt-1.5">
                {b.active_pledges ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    ✓ Sponsor: {b.sponsors.join(', ')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                    ⏳ Sponsor bekliyor
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => open(b)}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Düzenle
                  </button>
                )}
                {canPledge && b.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => onPledge(b)}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    + Sponsor Eşleştir
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <Card className="border border-slate-200/80 p-12 text-center shadow-xs md:col-span-2 xl:col-span-3">
            <Users className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-700">Yararlanıcı kaydı bulunamadı</p>
            <p className="mt-1 text-xs text-slate-500">Yeni yararlanıcı (talebe, yetim, hoca) ekleyerek sponsor eşleştirmesi başlatabilirsiniz.</p>
          </Card>
        )}
      </div>

      {showForm && (
        <Modal
          title={editing ? `${editing.full_name} · Kaydı Düzenle` : 'Yeni Yararlanıcı Ekle'}
          description="Talebe, yetim veya hoca bilgilerini girerek sponsorluk havuzuna ekleyebilirsiniz."
          size="lg"
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={save} className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="sm:col-span-2">
              <TextInput label="Fotoğraf adresi" placeholder="https://..." value={form.photo_url} onChange={(v) => set('photo_url', v)} />
            </div>
            <Label label="Durum">
              <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Aktif</option><option value="passive">Pasif</option>
              </select>
            </Label>
            <div className="sm:col-span-2 lg:col-span-3">
              <TextArea label="Açıklama (sponsora gösterilmez)" rows={2} value={form.description} onChange={(v) => set('description', v)} />
            </div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2 lg:col-span-3">
              <button type="button" className={ghostButton} onClick={() => setShowForm(false)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>{editing ? 'Kaydet' : 'Oluştur'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function PledgesTab({ canEdit, setMessage, presetBeneficiary, onChanged, initialOverdue, onClearInitialOverdue, onClearPreset, triggerNew }: {
  canEdit: boolean; setMessage: SetMessage; presetBeneficiary: Beneficiary | null; onChanged: () => void;
  initialOverdue: boolean; onClearInitialOverdue: () => void; onClearPreset: () => void; triggerNew: number;
}) {
  const [rows, setRows] = useState<PledgeRow[]>([])
  const [filters, setFilters] = useState({ kind: '', status: 'active', overdue: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<PledgeRow | null>(null)
  const [showForm, setShowForm] = useState(!!presetBeneficiary)
  const [matchModal, setMatchModal] = useState<Installment | null>(null)
  const [receiptInput, setReceiptInput] = useState('')

  useEffect(() => {
    if (triggerNew > 0) setShowForm(true)
  }, [triggerNew])

  useEffect(() => {
    if (presetBeneficiary) {
      setShowForm(true)
      setForm((f) => ({
        ...f,
        kind: 'sponsorship',
        beneficiary_id: presetBeneficiary.id,
        amount: presetBeneficiary.monthly_need_cents ? String(presetBeneficiary.monthly_need_cents / 100) : f.amount,
      }))
    }
  }, [presetBeneficiary])

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
        .some((v) => v?.toLowerCase().includes(q)),
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
  useEffect(() => { load() }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps
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
      onClearPreset()
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
  const activeFilterCount = [filters.kind, filters.status !== 'active' ? filters.status : '', filters.overdue].filter(Boolean).length

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <ResponsiveDataToolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: 'Bağışçı, telefon, yararlanıcı veya başlık ara...',
          }}
          filter={{
            activeCount: activeFilterCount,
            onOpen: () => setShowFilters((v) => !v),
            label: 'Gelişmiş Filtreler',
            showOnDesktop: true,
          }}
          extraActions={
            <ExportButtons
              filename="taahhutler"
              title="Sponsorluk Taahhütleri"
              subtitle={`${filteredRows.length} taahhüt`}
              currencyCols={[7]}
              getData={() => ({
                headers: ['Bağışçı', 'Telefon', 'Tür', 'Kime', 'Taksit', 'Ödenen', 'Geciken', 'Geciken Tutar', 'Sonraki Vade'],
                rows: filteredRows.map((r) => [
                  r.donor_name,
                  r.donor_phone,
                  r.kind_label,
                  r.title || r.beneficiary_name || r.campaign_title,
                  `${r.installment_count} × ${r.installment_amount_cents / 100} ${r.currency}`,
                  r.paid_count,
                  r.overdue_count,
                  r.overdue_cents / 100,
                  r.next_due_date,
                ]),
              })}
            />
          }
        />

        {showFilters && (
          <div className="grid items-end gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-3">
            <Label label="Taahhüt Türü">
              <select className={inputClass} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
                <option value="">Tüm türler</option>
                <option value="sponsorship">Sponsorluk / Burs</option>
                <option value="water_well">Su Kuyusu</option>
                <option value="general">Genel</option>
              </select>
            </Label>
            <Label label="Durum">
              <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">Tüm durumlar</option>
                <option value="active">Aktif</option>
                <option value="completed">Tamamlandı</option>
                <option value="cancelled">İptal</option>
              </select>
            </Label>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={filters.overdue === 'true'}
                onChange={(e) => setFilters({ ...filters, overdue: e.target.checked ? 'true' : '' })}
                className="h-4 w-4 rounded border-slate-300 text-rose-600"
              />
              Yalnızca Gecikmiş Taksiti Olanlar
            </label>
          </div>
        )}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className={`overflow-hidden rounded-2xl border border-slate-200/80 p-2 shadow-xs ${detail ? 'xl:col-span-6' : 'xl:col-span-12'}`}>
          <ul className="divide-y divide-slate-100">
            {filteredRows.map((p) => {
              const pct = p.installment_count > 0 ? Math.min(100, Math.round((p.paid_count / p.installment_count) * 100)) : 0
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(p)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left transition hover:bg-slate-50 ${
                      detail?.id === p.id ? 'bg-emerald-50/70 ring-1 ring-emerald-300' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate font-bold text-slate-900">
                        {p.donor_name} → <span className="text-emerald-700">{p.title || p.beneficiary_name || p.campaign_title}</span>
                      </div>
                      <div className="text-xs font-medium text-slate-500">
                        {p.kind_label} · {formatMoney(p.installment_amount_cents, p.currency)} × {p.installment_count} ·{' '}
                        <strong className="text-slate-800">{p.paid_count}/{p.installment_count} ödendi</strong>
                        {p.next_due_date && ` · Sonraki vade: ${new Date(p.next_due_date).toLocaleDateString('tr-TR')}`}
                      </div>
                      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {p.overdue_count > 0 && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                        {p.overdue_count} gecikmiş
                      </span>
                    )}
                    {p.status !== 'active' && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                        {p.status === 'completed' ? 'Tamamlandı' : 'İptal'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {filteredRows.length === 0 && (
              <li className="py-12 text-center text-xs text-slate-400">Seçili kriterlere uygun taahhüt bulunamadı.</li>
            )}
          </ul>
        </Card>

        {detail && (
          <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-5 shadow-xs xl:col-span-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="text-lg font-black text-slate-900">{detail.title || detail.beneficiary_name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                  <span>{detail.donor_name} · {detail.donor_phone} · {detail.campaign_title}</span>
                  {(() => {
                    const wa = whatsappUrl(
                      detail.donor_phone,
                      `Merhaba ${detail.donor_name}, ${detail.title || detail.beneficiary_name || 'sponsorluk'} taahhüdünüz${detail.overdue_count > 0 ? ` (${detail.overdue_count} geciken taksit: ${formatMoney(detail.overdue_cents, detail.currency)})` : ''} hakkında bilgilendirmek isteriz.`,
                    )
                    return wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#1ebe5d]"
                      >
                        <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    ) : null
                  })()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="cursor-pointer rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Table>
              <THead>
                <Tr>
                  <Th>#</Th>
                  <Th>Vade Tarihi</Th>
                  <Th className="text-right">Tutar</Th>
                  <Th className="text-right">Durum</Th>
                  <Th className="text-right">İşlem</Th>
                </Tr>
              </THead>
              <TBody>
                {(detail.installments || []).map((i) => (
                  <Tr key={i.id}>
                    <Td className="font-bold">{i.seq}.</Td>
                    <Td>{new Date(i.due_date).toLocaleDateString('tr-TR')}</Td>
                    <Td className="text-right font-bold tabular-nums">{formatMoney(i.amount_cents, detail.currency)}</Td>
                    <Td className="py-1.5 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          i.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700'
                            : i.status === 'overdue'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABEL[i.status] || i.status}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {canEdit && (i.status === 'pending' || i.status === 'overdue') && detail.status === 'active' && (
                        <button
                          type="button"
                          className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                          onClick={() => openMatch(i)}
                        >
                          Makbuz Eşleştir
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>

            {canEdit && (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                {detail.status === 'cancelled' ? (
                  <button className={ghostButton} onClick={() => setStatus(detail, 'active')}>Yeniden Etkinleştir</button>
                ) : detail.status === 'active' ? (
                  <button className={`${ghostButton} text-rose-600`} onClick={() => setStatus(detail, 'cancelled')}>Taahhüdü İptal Et</button>
                ) : null}
              </div>
            )}
          </Card>
        )}
      </div>

      {showForm && (
        <Modal
          title="Yeni Sponsorluk / Burs Taahhüdü"
          description="Seçilen kaleme bağışçıdan gelen her onaylı bağış, tutarın karşıladığı en eski bekleyen taksitleri otomatik ödenmiş sayar."
          size="lg"
          onClose={() => {
            setShowForm(false)
            onClearPreset()
          }}
        >
          <form onSubmit={create} className="grid gap-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <DonorPicker value={donor} onChange={setDonor} label="Sponsor / Bağışçı" />
            </div>
            <Label label="Taahhüt Türü">
              <select className={inputClass} value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                <option value="sponsorship">Sponsorluk / Burs</option>
                <option value="water_well">Su Kuyusu</option>
                <option value="general">Genel</option>
              </select>
            </Label>
            {form.kind === 'sponsorship' && (
              <Label label="Yararlanıcı">
                <select required className={inputClass} value={form.beneficiary_id} onChange={(e) => set('beneficiary_id', e.target.value)}>
                  <option value="">Seçin</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.full_name} ({b.kind_label}){b.active_pledges ? ' — sponsorlu' : ''}
                    </option>
                  ))}
                </select>
              </Label>
            )}
            {form.kind === 'water_well' && (
              <Label label="Su Kuyusu">
                <select required className={inputClass} value={form.water_well_id} onChange={(e) => set('water_well_id', e.target.value)}>
                  <option value="">Seçin</option>
                  {wells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Label>
            )}
            {form.kind === 'general' && <TextInput label="Başlık" value={form.title} onChange={(v) => set('title', v)} />}
            <Label label="Tahsil Edilecek Bağış Kalemi">
              <select className={inputClass} value={form.campaign_id} onChange={(e) => set('campaign_id', e.target.value)} required={form.kind !== 'water_well'}>
                <option value="">{form.kind === 'water_well' ? 'Kuyunun kalemi' : 'Seçin'}</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <TextInput label="Aylık Taksit Tutarı (₺)" required inputMode="decimal" value={form.amount} onChange={(v) => set('amount', v)} />
            <TextInput label="Taksit Sayısı (Ay)" required type="number" min={1} max={120} value={form.count} onChange={(v) => set('count', v)} />
            <TextInput label="İlk Taksit Tarihi" required type="date" value={form.start_date} onChange={(v) => set('start_date', v)} />
            <div className="sm:col-span-2">
              <TextInput label="Not" value={form.notes} onChange={(v) => set('notes', v)} />
            </div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <button
                type="button"
                className={ghostButton}
                onClick={() => {
                  setShowForm(false)
                  onClearPreset()
                }}
              >
                Vazgeç
              </button>
              <button type="submit" className={primaryButton}>Taahhüt Oluştur</button>
            </div>
          </form>
        </Modal>
      )}

      {matchModal && detail && (
        <Modal
          title={`Taksit #${matchModal.seq} · Makbuz Eşleştir`}
          description={`${detail.donor_name} · Vade: ${new Date(matchModal.due_date).toLocaleDateString('tr-TR')} · Tutar: ${formatMoney(matchModal.amount_cents, detail.currency)}`}
          size="sm"
          onClose={() => setMatchModal(null)}
        >
          <form onSubmit={submitMatch} className="space-y-4">
            <TextInput
              label="Eşleştirilecek Bağışın Makbuz Numarası"
              required
              value={receiptInput}
              onChange={setReceiptInput}
              placeholder="Örn: MKB-2026-0001"
              hint="Bağışçının onaylanmış bağışlarından makbuz numarası ile eşleştirilir."
            />
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={ghostButton} onClick={() => setMatchModal(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Eşleştir</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
