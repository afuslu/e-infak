'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { AlertTriangle, Check, Copy, CreditCard, MessageSquare, SlidersHorizontal, Trash2, Users, Wallet } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, whatsappUrl, can } from '../../../../lib/admin-access'
import { GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { ExportButtons, Modal, PageHeader, TBody, THead, Table, Td, Th, Tr, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'

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
const PAGE_SIZE = 20
const STATUS_BADGE: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  passive: 'border-gray-200 bg-gray-100 text-gray-600',
  resigned: 'border-amber-200 bg-amber-50 text-amber-700',
  expelled: 'border-red-200 bg-red-50 text-red-700',
  deceased: 'border-slate-200 bg-slate-100 text-slate-600',
}
const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('tr-TR') : '—')
const key = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random()}`.replace('.', '').padEnd(16, '0'))
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

const emptyMember = { member_no: '', member_type: 'asil', status: 'active', joined_on: '', left_on: '', dues: '', dues_period: '', notes: '', first_name: '', last_name: '', phone: '', email: '', tc_no: '', city: '' }

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={`${label || value} kopyala`}
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
      }}
      className="inline-flex items-center rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export default function MembersPage() {
  const router = useRouter()
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'members.manage')
  const canCollect = (can(access, 'members.manage') || can(access, 'receipts.create'))
  const canSms = can(access, 'sms.send')
  const canBulkSms = can(access, 'sms.bulk')
  const [tab, setTab] = useState<Tab>('members')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [pickedMembers, setPickedMembers] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('passive')
  const [bulkBusy, setBulkBusy] = useState(false)
  const emptyMemberFilters = {
    status: 'active',
    member_type: '',
    dues_period: '',
    joined_start: '',
    joined_end: '',
    sort: 'member_no',
    overdue_only: false,
    q: '',
  }
  const [filters, setFilters] = useState(emptyMemberFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
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
        status: filters.status || undefined,
        member_type: filters.member_type || undefined,
        dues_period: filters.dues_period || undefined,
        joined_start: filters.joined_start || undefined,
        joined_end: filters.joined_end || undefined,
        sort: filters.sort || 'member_no',
        overdue_only: filters.overdue_only || undefined,
        q: filters.q || undefined,
      })).data)
      setPickedMembers(new Set())
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Üyeler yüklenemedi') })
    }
  }

  const applyBulkStatus = async () => {
    if (!pickedMembers.size) return
    const label = settings?.statuses?.[bulkStatus] || bulkStatus
    const ok = await confirmDialog({
      title: `${pickedMembers.size} üyenin durumu "${label}" yapılsın mı?`,
      text: 'Seçili üyelerin üyelik durumu toplu olarak güncellenecektir.',
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      const res = await adminSend<{ updated: number }>('post', '/members/bulk-status', {
        member_ids: [...pickedMembers],
        status: bulkStatus,
      })
      setMessage({ type: 'ok', text: `${res.data.updated} üyenin durumu güncellendi` })
      await load()
      refreshSummary()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Toplu güncelleme başarısız') })
    } finally {
      setBulkBusy(false)
    }
  }

  const sendBulkSmsToMembers = () => {
    const phones = Array.from(new Set(
      members
        .filter((m) => pickedMembers.has(m.id) && m.phone)
        .map((m) => m.phone!.trim())
        .filter(Boolean)
    ))
    if (!phones.length) {
      setMessage({ type: 'error', text: 'Seçili üyelerde kayıtlı telefon numarası bulunamadı' })
      return
    }
    try {
      sessionStorage.setItem('broadcast_prefill_numbers', phones.join('\n'))
    } catch { /* ignore */ }
    router.push('/admin/broadcast?kind=numbers')
  }
  const didMountMembersRef = useRef(false)
  useEffect(() => {
    if (tab !== 'members') return
    if (!didMountMembersRef.current) {
      didMountMembersRef.current = true
      load()
      return
    }
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlobalStatCard
            title="Aktif Üye"
            value={summary.members.active.toLocaleString('tr-TR')}
            subtitle={`Toplam ${Object.values(summary.members).reduce((a, b) => a + b, 0).toLocaleString('tr-TR')} kayıtlı üye`}
            gradient="from-emerald-600 to-teal-700"
            icon={<Users className="h-5 w-5" />}
          />
          <GlobalStatCard
            title="Geciken Aidat"
            value={formatMoney(summary.overdue_cents)}
            subtitle={`${summary.overdue_members} üye gecikmede`}
            gradient={summary.overdue_cents > 0 ? 'from-rose-600 to-red-700' : 'from-slate-600 to-slate-700'}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <GlobalStatCard
            title="Açık Aidat Toplamı"
            value={formatMoney(summary.open_cents)}
            subtitle="Bekleyen toplam alacak"
            gradient="from-amber-500 to-orange-600"
            icon={<Wallet className="h-5 w-5" />}
          />
          <GlobalStatCard
            title={`${summary.year} Tahsilat`}
            value={formatMoney(summary.collected_cents)}
            subtitle="Bu yıl tahsil edilen"
            gradient="from-sky-600 to-blue-700"
            icon={<CreditCard className="h-5 w-5" />}
          />
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
        <Modal title={form.id ? `${form.member_no} Numaralı Üyeyi Düzenle` : 'Yeni Üye Kaydı'} size="lg" onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
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
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && !form && (
        <Modal title={`${detail.full_name || detail.member_no} · Üye #${detail.member_no}`} size="lg" onClose={() => setDetail(null)}>
          <MemberCard key={detail.id} detail={detail} canEdit={canEdit} canCollect={canCollect} canSms={canSms} onEdit={() => setForm({
            id: detail.id, member_no: detail.member_no, member_type: detail.member_type, status: detail.status,
            joined_on: detail.joined_on || '', left_on: detail.left_on || '', dues: detail.dues_cents !== null ? String(detail.dues_cents / 100) : '',
            dues_period: detail.dues_period || '', notes: detail.notes || '', first_name: '', last_name: '', phone: '', email: '', tc_no: '', city: '',
          })} onClose={() => setDetail(null)} onChanged={async (text) => { setMessage({ type: 'ok', text }); await open(detail.id); await load(); refreshSummary() }}
            onError={(text) => setMessage({ type: 'error', text })} />
        </Modal>
      )}

      {tab === 'members' && settings && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputClass} min-w-[200px] flex-1 sm:max-w-xs`}
                placeholder="Üye no, ad, telefon…"
                value={filters.q}
                onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1) }}
              />
              <select
                className={`${inputClass} w-44`}
                value={filters.sort}
                onChange={(e) => { setFilters({ ...filters, sort: e.target.value }); setPage(1) }}
              >
                <option value="member_no">Üye no</option>
                <option value="joined_desc">Kayıt tarihi (Yeni)</option>
                <option value="debt_desc">Açık aidat (Yüksek)</option>
              </select>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  showFilters ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Gelişmiş Filtreler</span>
                {[filters.status !== 'active' ? filters.status || 'all' : '', filters.member_type, filters.dues_period, filters.joined_start, filters.joined_end, filters.overdue_only ? '1' : ''].filter(Boolean).length > 0 && (
                  <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] text-white">
                    {[filters.status !== 'active' ? filters.status || 'all' : '', filters.member_type, filters.dues_period, filters.joined_start, filters.joined_end, filters.overdue_only ? '1' : ''].filter(Boolean).length}
                  </span>
                )}
              </button>
              <div className="ml-auto flex gap-2">
                <ExportButtons
                  filename="uyeler"
                  title="Üye Listesi"
                  subtitle={`${members.length} üye`}
                  currencyCols={[7]}
                  getData={() => ({
                    headers: ['Üye no', 'Ad', 'Telefon', 'E-posta', 'Tür', 'Durum', 'Kayıt', 'Açık aidat', 'Geciken dönem'],
                  rows: members.map((m) => [m.member_no, m.full_name, m.phone, m.email, m.member_type_label, m.status_label, fmt(m.joined_on), m.open_dues_cents / 100, m.overdue_count]),
                })}
              />
              <button className={ghostButton} onClick={() => downloadVcard(members.map((m) => m.id)).catch(() => setMessage({ type: 'error', text: 'vCard indirilemedi' }))}>⬇ vCard</button>
            </div>
            </div>

            {showFilters && (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Label label="Durum">
                    <select className={inputClass} value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1) }}>
                      <option value="">Tüm durumlar</option>{Object.entries(settings.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Label>
                  <Label label="Üye Türü">
                    <select className={inputClass} value={filters.member_type} onChange={(e) => { setFilters({ ...filters, member_type: e.target.value }); setPage(1) }}>
                      <option value="">Tüm türler</option>{Object.entries(settings.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Label>
                  <Label label="Aidat Periyodu">
                    <select className={inputClass} value={filters.dues_period} onChange={(e) => { setFilters({ ...filters, dues_period: e.target.value }); setPage(1) }}>
                      <option value="">Tümü</option>
                      <option value="monthly">Aylık</option>
                      <option value="yearly">Yıllık</option>
                    </select>
                  </Label>
                  <Label label="Kayıt Başlangıç">
                    <input type="date" className={inputClass} value={filters.joined_start} onChange={(e) => { setFilters({ ...filters, joined_start: e.target.value }); setPage(1) }} />
                  </Label>
                  <Label label="Kayıt Bitiş">
                    <input type="date" className={inputClass} value={filters.joined_end} onChange={(e) => { setFilters({ ...filters, joined_end: e.target.value }); setPage(1) }} />
                  </Label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <input type="checkbox" checked={filters.overdue_only} onChange={(e) => { setFilters({ ...filters, overdue_only: e.target.checked }); setPage(1) }} /> Yalnız aidatı gecikenler
                  </label>
                  <button
                    type="button"
                    onClick={() => { setFilters(emptyMemberFilters); setPage(1) }}
                    className="cursor-pointer text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Filtreleri temizle
                  </button>
                </div>
              </div>
            )}
            {pickedMembers.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-xs">
                <span className="font-bold text-primary-900">{pickedMembers.size} üye seçildi</span>
                <div className="flex flex-wrap items-center gap-2">
                  {canBulkSms && (
                    <button
                      type="button"
                      onClick={sendBulkSmsToMembers}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 font-semibold text-white hover:bg-primary-700"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Seçilenlere Toplu SMS
                    </button>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <select
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
                        value={bulkStatus}
                        onChange={(e) => setBulkStatus(e.target.value)}
                      >
                        {Object.entries(settings.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={applyBulkStatus}
                        className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {bulkBusy ? 'Uygulanıyor…' : 'Durumu Güncelle'}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadVcard([...pickedMembers]).catch(() => setMessage({ type: 'error', text: 'vCard indirilemedi' }))}
                    className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    ⬇ Seçili vCard
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickedMembers(new Set())}
                    className="cursor-pointer font-semibold text-gray-500 hover:text-gray-800"
                  >
                    Temizle
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Sayfadaki tüm üyeleri seç"
                      checked={members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).length > 0 && members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).every((m) => pickedMembers.has(m.id))}
                      onChange={(e) => {
                        const pageIds = members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((m) => m.id)
                        setPickedMembers((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) pageIds.forEach((id) => next.add(id))
                          else pageIds.forEach((id) => next.delete(id))
                          return next
                        })
                      }}
                    />
                  </Th>
                  <Th>No</Th><Th>Ad</Th><Th>Telefon</Th><Th>Tür</Th><Th>Durum</Th><Th>Kayıt</Th><Th>Açık aidat</Th><Th>Son ödeme</Th>
                </Tr>
              </THead>
              <TBody>
                {members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((m) => (
                  <Tr key={m.id} onClick={() => open(m.id)} className={`cursor-pointer border-t hover:bg-gray-50 ${detail?.id === m.id ? 'bg-primary-50/30' : ''}`}>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={pickedMembers.has(m.id)}
                        onChange={() => setPickedMembers((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                      />
                    </Td>
                    <Td className="font-bold">{m.member_no}</Td>
                    <Td className="font-semibold text-gray-900">{m.full_name}</Td>
                    <Td>
                      {m.phone ? (
                        <div className="flex items-center gap-1">
                          <span>{m.phone}</span>
                          <CopyButton value={m.phone} label="Telefon" />
                        </div>
                      ) : '—'}
                    </Td>
                    <Td>{m.member_type_label}</Td>
                    <Td>
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[m.status] || 'border-gray-200 bg-gray-100 text-gray-700'}`}>
                        {m.status_label}
                      </span>
                    </Td>
                    <Td>{fmt(m.joined_on)}</Td>
                    <Td className={m.overdue_count ? 'font-bold text-red-700' : ''}>{m.open_dues_cents ? `${formatMoney(m.open_dues_cents)}${m.overdue_count ? ` (${m.overdue_count} gecikmiş)` : ''}` : '—'}</Td>
                    <Td>{fmt(m.last_paid_at)}</Td>
                  </Tr>
                ))}
                {!members.length && <Tr><Td colSpan={9} className="text-center text-gray-400">Üye yok.</Td></Tr>}
              </TBody>
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((m) => (
              <div
                key={m.id}
                onClick={() => open(m.id)}
                className={`cursor-pointer rounded-xl border p-3.5 transition ${detail?.id === m.id ? 'border-primary-400 bg-primary-50/30' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pickedMembers.has(m.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => setPickedMembers((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                    />
                    <div>
                      <p className="font-bold text-gray-900">{m.full_name}</p>
                      <p className="text-xs text-gray-500">#{m.member_no} · {m.member_type_label}</p>
                    </div>
                  </div>
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[m.status] || 'border-gray-200 bg-gray-100 text-gray-700'}`}>
                    {m.status_label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
                  <span>{m.phone || 'Telefon yok'}</span>
                  <span className={m.overdue_count ? 'font-bold text-red-700' : 'font-semibold text-gray-800'}>
                    {m.open_dues_cents ? `${formatMoney(m.open_dues_cents)}${m.overdue_count ? ` (${m.overdue_count} gecikmiş)` : ''}` : 'Borç yok'}
                  </span>
                </div>
              </div>
            ))}
            {!members.length && <p className="py-6 text-center text-sm text-gray-400">Üye yok.</p>}
          </div>
          {members.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
              <span>Sayfa {page} / {Math.ceil(members.length / PAGE_SIZE)} ({members.length} üye)</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Önceki</button>
                <button type="button" disabled={page >= Math.ceil(members.length / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Sonraki</button>
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === 'dues' && <DuesTab canCollect={canCollect} canSms={canSms} canBulkSms={canBulkSms} onMessage={setMessage} onChanged={refreshSummary} onOpenMember={async (memberId) => { setTab('members'); await open(memberId) }} />}
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
            <option value="cash">Nakit</option>
            <option value="bank_transfer">Havale / EFT</option>
            <option value="credit_card">Kredi Kartı / POS</option>
          </select>
        </Label>
        <TextInput label="Tarih" type="date" value={f.paid_on} onChange={(v) => setF({ ...f, paid_on: v })} hint="Boşsa bugün" />
        {(f.payment_method === 'bank_transfer' || f.payment_method === 'credit_card') && (
          <TextInput label={f.payment_method === 'credit_card' ? 'POS / Referans no' : 'Dekont no'} value={f.bank_reference} onChange={(v) => setF({ ...f, bank_reference: v })} />
        )}
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

function MemberCard({ detail, canEdit, canCollect, canSms, onEdit, onClose, onChanged, onError }: {
  detail: MemberDetail; canEdit: boolean; canCollect: boolean; canSms: boolean; onEdit: () => void; onClose: () => void
  onChanged: (text: string) => void; onError: (text: string) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [collect, setCollect] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const openDues = detail.dues.filter((d) => d.status === 'open')
  const selected = openDues.filter((d) => picked.has(d.id))
  const wa = whatsappUrl(detail.phone, `Merhaba ${detail.full_name}, dernek üyeliğiniz hakkında iletişime geçiyoruz.`)
  const deleteDue = async (due: Due) => {
    const ok = await confirmDialog({
      title: `${due.period} dönemi aidat borcu silinsin mi?`,
      text: `${formatMoney(due.amount_cents)} tutarındaki açık aidat kaydı kalıcı olarak silinecek.`,
      danger: true,
    })
    if (!ok) return
    try {
      await adminSend('delete', `/member-dues/${due.id}`)
      onChanged(`${due.period} dönemi aidatı silindi`)
    } catch (err) {
      onError(apiErrorMessage(err, 'Aidat silinemedi'))
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[detail.status] || 'border-gray-200 bg-gray-100 text-gray-700'}`}>
              {detail.status_label}
            </span>
            <span className="text-xs font-semibold text-gray-500">{[detail.member_type_label, detail.city].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            {detail.phone && (
              <span className="inline-flex items-center gap-1">
                <a href={`tel:${detail.phone}`} className="font-semibold text-primary-700 hover:underline">{detail.phone}</a>
                <CopyButton value={detail.phone} label="Telefon" />
              </span>
            )}
            {detail.email && (
              <span className="inline-flex items-center gap-1">
                <a href={`mailto:${detail.email}`} className="text-primary-700 hover:underline">{detail.email}</a>
                <CopyButton value={detail.email} label="E-posta" />
              </span>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-0.5 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20">
                <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            {canSms && detail.phone && (
              <button
                type="button"
                onClick={() => setSmsOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
              >
                <MessageSquare className="h-3.5 w-3.5" /> SMS Gönder
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">Kayıt {fmt(detail.joined_on)}{detail.left_on ? ` · Ayrılış ${fmt(detail.left_on)}` : ''}{detail.dues_cents !== null ? ` · Özel aidat ${formatMoney(detail.dues_cents)}` : ''}</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <button className={ghostButton} onClick={onEdit}>Düzenle</button>}
          <a className={ghostButton} href={`/admin/bagiscilar?donor=${detail.donor_id}`}>Bağışçı kartı</a>
        </div>
      </div>
      {detail.notes && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{detail.notes}</p>}
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
        <THead><Tr><Th /><Th>Dönem</Th><Th>Son ödeme</Th><Th>Tutar</Th><Th>Durum</Th><Th>Ödeme / not</Th><Th /></Tr></THead>
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
              <Td className="text-right">
                {d.status === 'open' && canCollect && (
                  <button type="button" title="Açık aidatı sil" onClick={() => deleteDue(d)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </Td>
            </Tr>
          ))}
          {!detail.dues.length && <Tr><Td colSpan={7} className="text-center text-gray-400">Bu üyeye henüz aidat dönemi açılmamış.</Td></Tr>}
        </TBody>
      </Table>
      {smsOpen && (
        <QuickSmsDialog
          title={`${detail.full_name || detail.member_no} — Hızlı SMS`}
          target={{ donorId: detail.donor_id, name: detail.full_name, phone: detail.phone }}
          onClose={() => setSmsOpen(false)}
          onSent={(res) => { setSmsOpen(false); onChanged(sentNotice(res)) }}
        />
      )}
    </div>
  )
}

function DuesTab({ canCollect, canSms, canBulkSms, onMessage, onChanged, onOpenMember }: {
  canCollect: boolean; canSms: boolean; canBulkSms: boolean; onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void; onChanged: () => void; onOpenMember: (memberId: string) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'overdue' | 'open' | 'paid' | 'waived'>('overdue')
  const [periodFilter, setPeriodFilter] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'due_date' | 'overdue_desc' | 'amount_desc' | 'member_no'>('due_date')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Due[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [waiveModal, setWaiveModal] = useState(false)
  const [waiveReason, setWaiveReason] = useState('Yönetim kurulu kararı')
  const [smsTarget, setSmsTarget] = useState<Due | null>(null)
  const [gen, setGen] = useState({ period: thisMonth(), due_date: '', amount: '' })
  const [preview, setPreview] = useState<{ created: number; total_cents: number; already_had: number; no_amount: number; other_period: number } | null>(null)
  const load = () => adminGet<Due[]>('/member-dues', { status, period: periodFilter.trim() || undefined, q: q.trim() || undefined, sort })
    .then((r) => { setRows(r.data); setPicked(new Set()) }).catch((err) => onMessage({ type: 'error', text: apiErrorMessage(err) }))
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, periodFilter, q, sort])

  const sendSmsForPicked = () => {
    const phones = Array.from(new Set(
      rows
        .filter((r) => picked.has(r.id) && r.phone)
        .map((r) => r.phone!.trim())
        .filter(Boolean)
    ))
    if (!phones.length) {
      onMessage({ type: 'error', text: 'Seçili aidatlarda kayıtlı telefon numarası yok' })
      return
    }
    try {
      sessionStorage.setItem('broadcast_prefill_numbers', phones.join('\n'))
    } catch { /* ignore */ }
    router.push('/admin/broadcast?kind=numbers')
  }

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
  const submitWaive = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waiveReason.trim()) return
    try {
      const res = await adminSend<{ waived: number }>('post', '/member-dues/waive', { due_ids: [...picked], reason: waiveReason.trim() })
      setWaiveModal(false)
      onMessage({ type: 'ok', text: `${res.data.waived} aidat muaf tutuldu` })
      load()
      onChanged()
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  const deleteDue = async (due: Due) => {
    const ok = await confirmDialog({
      title: `${due.full_name || due.member_no} — ${due.period} aidatı silinsin mi?`,
      text: `${formatMoney(due.amount_cents)} tutarındaki açık aidat kaydı kalıcı olarak silinecek.`,
      danger: true,
    })
    if (!ok) return
    try {
      await adminSend('delete', `/member-dues/${due.id}`)
      onMessage({ type: 'ok', text: `${due.period} dönemi aidatı silindi` })
      load()
      onChanged()
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err, 'Aidat silinemedi') })
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
            <button key={k} onClick={() => { setStatus(k); setPage(1) }} className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === k ? 'border-primary-600 bg-primary-50 text-primary-700' : 'bg-white text-gray-600'}`}>{l}</button>
          ))}
          <input className={`${inputClass} w-44`} placeholder="Üye no, ad, telefon…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          <input className={`${inputClass} w-32`} placeholder="Dönem (2026-11)" value={periodFilter} onChange={(e) => { setPeriodFilter(e.target.value); setPage(1) }} />
          <select className={`${inputClass} w-44`} value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1) }}>
            <option value="due_date">Vade (Yakın)</option>
            <option value="overdue_desc">En çok geciken</option>
            <option value="amount_desc">Tutar (Yüksek)</option>
            <option value="member_no">Üye no</option>
          </select>
          <span className="text-xs text-gray-500">{rows.length} kayıt · {formatMoney(rows.reduce((s, r) => s + r.amount_cents, 0))}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {canBulkSms && picked.size > 0 && (
              <button
                type="button"
                onClick={sendSmsForPicked}
                className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Seçilenlere SMS ({picked.size})
              </button>
            )}
            {canBulkSms && status === 'overdue' && picked.size === 0 && rows.length > 0 && (
              <button
                type="button"
                onClick={() => router.push('/admin/broadcast?kind=dues_overdue')}
                className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Gecikenlere Toplu SMS
              </button>
            )}
            {canCollect && (status === 'overdue' || status === 'open') && picked.size > 0 && <button className={ghostButton} onClick={() => setWaiveModal(true)}>Seçilenleri muaf tut</button>}
            <ExportButtons
              filename={`aidat-${status}`}
              title={`Üye Aidatları (${status})`}
              subtitle={`${rows.length} kayıt`}
              currencyCols={[5]}
              getData={() => ({
                headers: ['Üye no', 'Ad', 'Telefon', 'Dönem', 'Son ödeme', 'Tutar', 'Gecikme (gün)', 'Durum'],
                rows: rows.map((r) => [r.member_no, r.full_name, r.phone, r.period, fmt(r.due_date), r.amount_cents / 100, r.days_overdue, r.status_label]),
              })}
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">Tahsilat için üye adına veya &quot;Tahsilat&quot; butonuna tıklayarak üye kartını açabilirsiniz. Gecikenlere WhatsApp veya Toplu SMS ile tek tıkla hatırlatma gönderebilirsiniz.</p>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <THead>
              <Tr>
                <Th className="w-8">
                  {(status === 'overdue' || status === 'open') && (
                    <input
                      type="checkbox"
                      aria-label="Sayfadaki tüm aidatları seç"
                      checked={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).length > 0 && rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).every((r) => picked.has(r.id))}
                      onChange={(e) => {
                        const pageIds = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).filter((r) => r.status === 'open').map((r) => r.id)
                        setPicked((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) pageIds.forEach((id) => next.add(id))
                          else pageIds.forEach((id) => next.delete(id))
                          return next
                        })
                      }}
                    />
                  )}
                </Th>
                <Th>Üye no</Th><Th>Ad</Th><Th>Telefon</Th><Th>Dönem</Th><Th>Son ödeme</Th><Th>Tutar</Th><Th>Durum</Th><Th className="text-right">İşlem</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => {
                const wa = whatsappUrl(r.phone, `Merhaba ${r.full_name}, ${r.period} dönemi (${formatMoney(r.amount_cents)}) aidatınız hakkında bilgilendirmek isteriz.`)
                return (
                  <Tr key={r.id} className="border-t hover:bg-gray-50">
                    <Td>{r.status === 'open' && <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} />}</Td>
                    <Td className="font-bold">{r.member_no}</Td>
                    <Td>
                      <button type="button" onClick={() => onOpenMember(r.member_id)} className="font-semibold text-primary-700 hover:underline text-left">
                        {r.full_name}
                      </button>
                    </Td>
                    <Td>
                      {r.phone ? (
                        <div className="flex items-center gap-1">
                          <span>{r.phone}</span>
                          <CopyButton value={r.phone} label="Telefon" />
                        </div>
                      ) : '—'}
                    </Td>
                    <Td>{r.period}</Td><Td>{fmt(r.due_date)}</Td>
                    <Td className="font-semibold">{formatMoney(r.amount_cents)}</Td>
                    <Td className={r.overdue ? 'font-bold text-red-700' : ''}>{r.overdue ? `${r.days_overdue} gün gecikmiş` : r.status_label}</Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        {r.status === 'open' && canCollect && (
                          <button type="button" onClick={() => onOpenMember(r.member_id)} className="rounded border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 hover:bg-primary-100">
                            Tahsilat
                          </button>
                        )}
                        {canSms && r.phone && (
                          <button type="button" title="Hızlı SMS gönder" onClick={() => setSmsTarget(r)} className="rounded p-1 text-gray-500 hover:bg-primary-50 hover:text-primary-700">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp hatırlatma" className="inline-flex hover:opacity-80">
                            <WhatsAppIcon className="h-4 w-4" />
                          </a>
                        )}
                        {r.status === 'open' && canCollect && (
                          <button type="button" title="Açık aidatı sil" onClick={() => deleteDue(r)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                )
              })}
              {!rows.length && <Tr><Td colSpan={9} className="text-center text-gray-400">Kayıt yok.</Td></Tr>}
            </TBody>
          </Table>
        </div>
        <div className="space-y-2 md:hidden">
          {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => {
            const wa = whatsappUrl(r.phone, `Merhaba ${r.full_name}, ${r.period} dönemi (${formatMoney(r.amount_cents)}) aidatınız hakkında bilgilendirmek isteriz.`)
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {r.status === 'open' && (
                      <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} />
                    )}
                    <div>
                      <button type="button" onClick={() => onOpenMember(r.member_id)} className="text-left font-bold text-primary-700 hover:underline">
                        {r.full_name}
                      </button>
                      <p className="text-xs text-gray-500">#{r.member_no} · Dönem {r.period} · Vade {fmt(r.due_date)}</p>
                    </div>
                  </div>
                  <span className="font-bold text-gray-900">{formatMoney(r.amount_cents)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs">
                  <span className={r.overdue ? 'font-bold text-red-700' : 'text-gray-600'}>{r.overdue ? `${r.days_overdue} gün gecikmiş` : r.status_label}</span>
                  <div className="flex items-center gap-2">
                    {r.status === 'open' && canCollect && (
                      <button type="button" onClick={() => onOpenMember(r.member_id)} className="rounded border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                        Tahsilat
                      </button>
                    )}
                    {canSms && r.phone && (
                      <button type="button" onClick={() => setSmsTarget(r)} className="rounded p-1 text-gray-500 hover:bg-primary-50 hover:text-primary-700">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {wa && <a href={wa} target="_blank" rel="noreferrer"><WhatsAppIcon className="h-4 w-4" /></a>}
                  </div>
                </div>
              </div>
            )
          })}
          {!rows.length && <p className="py-6 text-center text-sm text-gray-400">Kayıt yok.</p>}
        </div>
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
            <span>Sayfa {page} / {Math.ceil(rows.length / PAGE_SIZE)} ({rows.length} kayıt)</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Önceki</button>
              <button type="button" disabled={page >= Math.ceil(rows.length / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">Sonraki</button>
            </div>
          </div>
        )}
      </Card>
      {waiveModal && (
        <Modal title={`${picked.size} Aidatı Muaf Tut`} size="sm" onClose={() => setWaiveModal(false)}>
          <form onSubmit={submitWaive} className="space-y-3">
            <TextInput label="Muafiyet / silme gerekçesi *" required value={waiveReason} onChange={setWaiveReason} />
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostButton} onClick={() => setWaiveModal(false)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Onayla ve Muaf Tut</button>
            </div>
          </form>
        </Modal>
      )}
      {smsTarget && (
        <QuickSmsDialog
          title={`${smsTarget.full_name || smsTarget.member_no} — Aidat Hatırlatma`}
          target={{
            name: smsTarget.full_name,
            phone: smsTarget.phone,
            variables: { tutar: formatMoney(smsTarget.amount_cents), donem: smsTarget.period },
          }}
          onClose={() => setSmsTarget(null)}
          onSent={(res) => { setSmsTarget(null); onMessage({ type: 'ok', text: sentNotice(res) }) }}
        />
      )}
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
