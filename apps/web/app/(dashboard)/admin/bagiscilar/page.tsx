'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Check, ChevronDown, Copy, MapPin, MessageSquare, Plus, RefreshCw, SlidersHorizontal, Tag, Trash2, TrendingUp, UserCheck, Users, X } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, whatsappUrl, can } from '../../../../lib/admin-access'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, type MuhasebeStatModalProps } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { ManualReceiptForm, downloadReceiptPdf } from '../../../../components/admin/ManualReceiptForm'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { STATUS_CLASS, STATUS_LABEL, SmsMessage } from '../../../../lib/sms'
import { EmptyState, ExportButtons, Modal, Pagination, TBody, Table, Td, Tr, WhatsAppIcon, confirmDialog, toast } from '../../../../components/admin/ui'

interface DonorRow {
  id: string
  donor_type: 'individual' | 'corporate'
  first_name: string
  last_name: string | null
  company_name: string | null
  full_name: string
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  total_donations: number
  total_donated_cents: number
  last_donation_at: string | null
  assigned_user_id: string | null
  assigned_user_name: string | null
  allow_sms: boolean
  allow_email: boolean
  tags: string[]
}

interface DonorCard extends DonorRow {
  address: string | null
  tax_number: string | null
  tc_no_masked: string | null
  donations: {
    id: string; receipt_number: string; campaign_title: string | null; amount_cents: number; currency: string
    status: string; payment_method_label: string; paid_at: string; on_behalf_of: string | null; is_manual: boolean
  }[]
  notes: { id: string; content: string; created_at: string; author: string | null }[]
  yearly: { year: number; count: number; totals: Record<string, number> }[]
}

interface Staff { id: string; first_name: string; last_name: string; is_active: boolean }

const PAGE_SIZE = 50

function donorHealthBadge(totalDonations: number, lastDonationAt: string | null) {
  if (!totalDonations || !lastDonationAt) {
    return { label: 'Bağışsız', cls: 'border-slate-200 bg-slate-50 text-slate-600' }
  }
  const days = Math.floor((Date.now() - new Date(lastDonationAt).getTime()) / 86_400_000)
  if (days <= 90) return { label: 'Aktif', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (days <= 180) return { label: 'Takipte', cls: 'border-amber-200 bg-amber-50 text-amber-700' }
  return { label: 'Riskte (6+ ay)', cls: 'border-rose-200 bg-rose-50 text-rose-700' }
}

const DONOR_AVATAR_TONES = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
]
function donorInitials(name: string | null | undefined) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'B'
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
function donorAvatarTone(name: string | null | undefined) {
  const text = name || ''
  let sum = 0
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i)
  return DONOR_AVATAR_TONES[sum % DONOR_AVATAR_TONES.length]
}

export default function DonorsPageWrapper() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-gray-500">Yükleniyor...</p>}>
      <DonorsPage />
    </Suspense>
  )
}

function DonorsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('donor')
  const { data: access } = useAdminAccess()
  const perms: DonorPerms = {
    create: can(access, 'donors.create'), update: can(access, 'donors.update'), remove: can(access, 'donors.delete'),
    imports: can(access, 'donors.import'), sms: can(access, 'sms.send'), notes: can(access, 'donors.notes_write'),
  }
  const canIssue = can(access, 'receipts.create')
  const [statModal, setStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null)

  const emptyDonorFilters = {
    q: '',
    assigned: '',
    region: '',
    donor_type: '',
    has_donation: '',
    allow_sms: '',
    allow_email: '',
    min_total: '',
    max_total: '',
    last_donation_start: '',
    last_donation_end: '',
    tag: '',
    sort: 'recent',
  }
  const [filters, setFilters] = useState(emptyDonorFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [list, setList] = useState<{ total: number; items: DonorRow[] }>({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<Staff[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkTag, setBulkTag] = useState('')
  const [bulkStaffId, setBulkStaffId] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const toCents = (v: string) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : undefined)
      const res = await adminGet<{ total: number; items: DonorRow[] }>('/donors', {
        q: filters.q || undefined,
        assigned: filters.assigned || undefined,
        region: filters.region || undefined,
        donor_type: filters.donor_type || undefined,
        has_donation: filters.has_donation === '' ? undefined : filters.has_donation === 'true',
        allow_sms: filters.allow_sms === '' ? undefined : filters.allow_sms === 'true',
        allow_email: filters.allow_email === '' ? undefined : filters.allow_email === 'true',
        min_total_cents: toCents(filters.min_total),
        max_total_cents: toCents(filters.max_total),
        last_donation_start: filters.last_donation_start || undefined,
        last_donation_end: filters.last_donation_end || undefined,
        tag: filters.tag || undefined,
        sort: filters.sort,
        page,
        page_size: PAGE_SIZE,
      })
      setList(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağışçılar yüklenemedi'))
    } finally {
      setLoading(false)
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
  }, [filters, page])

  useEffect(() => {
    adminGet<Staff[]>('/users').then((res) => setStaff(res.data.filter((s) => s.is_active))).catch(() => {})
  }, [])

  const select = (id: string | null) => router.replace(id ? `/admin/bagiscilar?donor=${id}` : '/admin/bagiscilar', { scroll: false })
  const setFilter = (key: keyof typeof filters, value: string) => { setPage(1); setSelectedIds([]); setFilters((f) => ({ ...f, [key]: value })) }
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const allPageSelected = list.items.length > 0 && list.items.every((d) => selectedIds.includes(d.id))
  const toggleSelectAll = () => {
    if (allPageSelected) setSelectedIds([])
    else setSelectedIds(list.items.map((d) => d.id))
  }

  const runBulkTag = async () => {
    const tag = bulkTag.trim()
    if (!tag || !selectedIds.length || bulkBusy) return
    setBulkBusy(true)
    let ok = 0
    for (const id of selectedIds) {
      const row = list.items.find((d) => d.id === id)
      const nextTags = Array.from(new Set([...(row?.tags || []), tag]))
      try {
        await adminSend('put', `/donors/${id}`, { tags: nextTags })
        ok++
      } catch {
        // continue
      }
    }
    setBulkBusy(false)
    setBulkTag('')
    setSelectedIds([])
    toast.ok(`${ok} bağışçıya "${tag}" etiketi eklendi.`)
    load()
  }

  const runBulkAssign = async () => {
    if (!bulkStaffId || !selectedIds.length || bulkBusy) return
    setBulkBusy(true)
    let ok = 0
    const body = bulkStaffId === 'none' ? { clear_assignment: true } : { assigned_user_id: bulkStaffId }
    for (const id of selectedIds) {
      try {
        await adminSend('put', `/donors/${id}`, body)
        ok++
      } catch {
        // continue
      }
    }
    setBulkBusy(false)
    setBulkStaffId('')
    setSelectedIds([])
    toast.ok(`${ok} bağışçının temsilcisi güncellendi.`)
    load()
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Bağışçı CRM"
        title="Bağışçılar"
        meta={`${list.total.toLocaleString('tr-TR')} kayıtlı bağışçı · Segmentasyon, temsilci atama, etiket ve bağış geçmişi`}
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Link href="/admin/bagiscilar/mukerrer">
              <Button type="button" variant="outline" size="sm">
                Mükerrer Kayıtlar
              </Button>
            </Link>
            {perms.imports && (
              <Link href="/admin/veri-aktarma">
                <Button type="button" variant="outline" size="sm">
                  Excel&apos;den Aktar
                </Button>
              </Link>
            )}
            {perms.create && (
              <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />
                Yeni Bağışçı
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <GlobalStatCard
          id="total_donors"
          title="Toplam Bağışçı"
          value={list.total.toLocaleString('tr-TR')}
          subtitle="Filtreye uyan kayıt"
          icon={<Users className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-600"
          onClick={() => {
            const top = [...list.items].sort((a, b) => b.total_donated_cents - a.total_donated_cents).slice(0, 10)
            const maxCents = Math.max(1, ...top.map((d) => d.total_donated_cents))
            setStatModal({
              title: 'Toplam Bağışçı Özeti',
              subtitle: `Toplam ${list.total.toLocaleString('tr-TR')} bağışçı · Bu sayfadaki en yüksek bağış yapanlar`,
              items: top.map((d) => ({
                label: d.full_name,
                value: formatMoney(d.total_donated_cents),
                sub: `${d.total_donations} bağış${d.city ? ` · ${d.city}` : ''}${d.phone ? ` · ${d.phone}` : ''}`,
                color: 'emerald' as const,
                percent: Math.round((d.total_donated_cents / maxCents) * 100),
              })),
            })
          }}
        />
        <GlobalStatCard
          id="active_donors"
          title="Aktif (Son 90 Gün)"
          value={list.items.filter((d) => d.last_donation_at && (Date.now() - new Date(d.last_donation_at).getTime()) / 86_400_000 <= 90).length}
          subtitle="Bu sayfadaki aktifler"
          icon={<TrendingUp className="h-5 w-5" />}
          gradient="from-cyan-500 to-blue-600"
          onClick={() => {
            const actives = list.items.filter((d) => d.last_donation_at && (Date.now() - new Date(d.last_donation_at).getTime()) / 86_400_000 <= 90)
            setStatModal({
              title: 'Son 90 Günde Aktif Bağışçılar',
              subtitle: `Bu sayfadaki ${list.items.length} bağışçıdan ${actives.length} tanesi aktif`,
              items: actives.map((d) => ({
                label: d.full_name,
                value: d.last_donation_at ? new Date(d.last_donation_at).toLocaleDateString('tr-TR') : '—',
                sub: `Toplam ${formatMoney(d.total_donated_cents)} (${d.total_donations} bağış)`,
                color: 'blue' as const,
              })),
            })
          }}
        />
        <GlobalStatCard
          id="sms_allowed"
          title="SMS İzinli"
          value={list.items.filter((d) => d.allow_sms).length}
          subtitle={`Sayfadaki ${list.items.length} kişiden`}
          icon={<MessageSquare className="h-5 w-5" />}
          gradient="from-indigo-500 to-violet-600"
          onClick={() => {
            const allowed = list.items.filter((d) => d.allow_sms)
            setStatModal({
              title: 'SMS İzni Olan Bağışçılar',
              subtitle: `${allowed.length} / ${list.items.length} bağışçı SMS bildirimlerine açık`,
              items: allowed.map((d) => ({
                label: d.full_name,
                value: d.phone || 'Telefon yok',
                sub: `${d.allow_email ? 'E-posta izinli · ' : ''}${formatMoney(d.total_donated_cents)}`,
                color: 'indigo' as const,
              })),
            })
          }}
        />
        <GlobalStatCard
          id="corporate_donors"
          title="Kurumsal Bağışçı"
          value={list.items.filter((d) => d.donor_type === 'corporate').length}
          subtitle="Şirket / kurum kaydı"
          icon={<Building2 className="h-5 w-5" />}
          gradient="from-amber-500 to-orange-600"
          onClick={() => {
            const corps = list.items.filter((d) => d.donor_type === 'corporate')
            setStatModal({
              title: 'Kurumsal Bağışçılar',
              subtitle: `Sayfadaki ${corps.length} kurumsal kayıt`,
              items: corps.map((d) => ({
                label: d.company_name || d.full_name,
                value: formatMoney(d.total_donated_cents),
                sub: `${d.total_donations} bağış${d.city ? ` · ${d.city}` : ''}`,
                color: 'amber' as const,
              })),
            })
          }}
        />
      </div>
      <MuhasebeStatModal
        isOpen={!!statModal}
        onClose={() => setStatModal(null)}
        title={statModal?.title || ''}
        subtitle={statModal?.subtitle}
        items={statModal?.items || []}
      />

      {showCreate && (
        <Modal
          title="Yeni Bağışçı Ekle"
          description="Bireysel veya kurumsal bağışçı kaydı oluşturun."
          size="lg"
          onClose={() => setShowCreate(false)}
        >
          <DonorForm staff={staff} onSaved={(d) => { setShowCreate(false); toast.ok('Bağışçı eklendi'); load(); select(d.id) }} />
        </Modal>
      )}

      <Card className="space-y-3 rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Tümü', active: !filters.assigned && !filters.donor_type && !filters.has_donation && !filters.allow_sms, apply: () => { setPage(1); setFilters((f) => ({ ...f, assigned: '', donor_type: '', has_donation: '', allow_sms: '' })) } },
            { label: 'Bana Atananlar', active: filters.assigned === 'me', apply: () => setFilter('assigned', filters.assigned === 'me' ? '' : 'me') },
            { label: 'Kurumsal', active: filters.donor_type === 'corporate', apply: () => setFilter('donor_type', filters.donor_type === 'corporate' ? '' : 'corporate') },
            { label: 'Bağışı Olanlar', active: filters.has_donation === 'true', apply: () => setFilter('has_donation', filters.has_donation === 'true' ? '' : 'true') },
            { label: 'SMS İzinli', active: filters.allow_sms === 'true', apply: () => setFilter('allow_sms', filters.allow_sms === 'true' ? '' : 'true') },
          ].map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={pill.apply}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition ${
                pill.active ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="min-w-[220px] flex-1">
            <Input placeholder="Ad, telefon, e-posta, şehir ara" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          </div>
          <select className={`${inputClass} w-44`} value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
            <option value="recent">Son bağış</option>
            <option value="total">Toplam bağış</option>
            <option value="name">Ad (A-Z)</option>
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
            {[filters.assigned, filters.region, filters.donor_type, filters.has_donation, filters.allow_sms, filters.allow_email, filters.min_total, filters.max_total, filters.last_donation_start, filters.last_donation_end, filters.tag].filter(Boolean).length > 0 && (
              <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] text-white">
                {[filters.assigned, filters.region, filters.donor_type, filters.has_donation, filters.allow_sms, filters.allow_email, filters.min_total, filters.max_total, filters.last_donation_start, filters.last_donation_end, filters.tag].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <div className="ml-auto shrink-0">
            <ExportButtons
              filename="bagiscilar"
              title="Bağışçı Listesi"
              subtitle={`${list.items.length} bağışçı (sayfa görünümü)`}
              currencyCols={[7]}
              getData={() => ({
                headers: ['Ad Soyad', 'Tür', 'Telefon', 'E-posta', 'Şehir', 'Ülke', 'Bağış Sayısı', 'Toplam (TL)', 'Temsilci'],
                rows: list.items.map((d) => [
                  d.full_name,
                  d.donor_type === 'corporate' ? 'Kurumsal' : 'Bireysel',
                  d.phone || '',
                  d.email || '',
                  d.city || '',
                  d.country || '',
                  d.total_donations,
                  d.total_donated_cents / 100,
                  d.assigned_user_name || '',
                ]),
              })}
            />
          </div>
        </div>

        {showFilters && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Label label="Temsilci">
                <select className={inputClass} value={filters.assigned} onChange={(e) => setFilter('assigned', e.target.value)}>
                  <option value="">Tüm temsilciler</option>
                  <option value="me">Bana atananlar</option>
                  <option value="none">Temsilcisi olmayanlar</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
              </Label>
              <Label label="Bölge">
                <select className={inputClass} value={filters.region} onChange={(e) => setFilter('region', e.target.value)}>
                  <option value="">Yurt içi + yurt dışı</option>
                  <option value="yurtici">Yurt içi</option>
                  <option value="yurtdisi">Yurt dışı</option>
                </select>
              </Label>
              <Label label="Bağışçı Türü">
                <select className={inputClass} value={filters.donor_type} onChange={(e) => setFilter('donor_type', e.target.value)}>
                  <option value="">Tüm türler</option>
                  <option value="individual">Bireysel</option>
                  <option value="corporate">Kurumsal</option>
                </select>
              </Label>
              <Label label="Bağış Durumu">
                <select className={inputClass} value={filters.has_donation} onChange={(e) => setFilter('has_donation', e.target.value)}>
                  <option value="">Tüm bağış durumları</option>
                  <option value="true">Bağış yapanlar</option>
                  <option value="false">Hiç bağışı olmayanlar</option>
                </select>
              </Label>
              <Label label="SMS İzni">
                <select className={inputClass} value={filters.allow_sms} onChange={(e) => setFilter('allow_sms', e.target.value)}>
                  <option value="">Tümü</option>
                  <option value="true">SMS izni olanlar</option>
                  <option value="false">SMS izni olmayanlar</option>
                </select>
              </Label>
              <Label label="E-posta İzni">
                <select className={inputClass} value={filters.allow_email} onChange={(e) => setFilter('allow_email', e.target.value)}>
                  <option value="">Tümü</option>
                  <option value="true">E-posta izni olanlar</option>
                  <option value="false">E-posta izni olmayanlar</option>
                </select>
              </Label>
              <Label label="Etiket">
                <input className={inputClass} placeholder="Etiket (ör. vip)" value={filters.tag} onChange={(e) => setFilter('tag', e.target.value)} />
              </Label>
              <Label label="Toplam Bağış (Min - Maks TL)">
                <div className="flex gap-1.5">
                  <input className={inputClass} inputMode="decimal" placeholder="Min" value={filters.min_total} onChange={(e) => setFilter('min_total', e.target.value)} />
                  <input className={inputClass} inputMode="decimal" placeholder="Maks" value={filters.max_total} onChange={(e) => setFilter('max_total', e.target.value)} />
                </div>
              </Label>
              <Label label="Son Bağış Başlangıç">
                <input type="date" className={inputClass} value={filters.last_donation_start} onChange={(e) => setFilter('last_donation_start', e.target.value)} />
              </Label>
              <Label label="Son Bağış Bitiş">
                <input type="date" className={inputClass} value={filters.last_donation_end} onChange={(e) => setFilter('last_donation_end', e.target.value)} />
              </Label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setFilters(emptyDonorFilters); setPage(1) }}
                className="cursor-pointer text-xs font-semibold text-rose-600 hover:underline"
              >
                Tüm filtreleri temizle
              </button>
            </div>
          </div>
        )}
      </Card>

      {selectedIds.length > 0 && perms.update && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-xs shadow-xs">
          <span className="font-bold text-primary-900">{selectedIds.length} bağışçı seçildi</span>
          <div className="flex items-center gap-1.5">
            <select
              className="rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700"
              value={bulkStaffId}
              onChange={(e) => setBulkStaffId(e.target.value)}
            >
              <option value="">Temsilci seç...</option>
              <option value="none">Temsilciyi kaldır</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkStaffId || bulkBusy}
              onClick={runBulkAssign}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Ata
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              placeholder="Etiket (ör. vip)"
              className="w-36 rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={!bulkTag.trim() || bulkBusy}
              onClick={runBulkTag}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary-300 bg-white px-3 py-1.5 font-bold text-primary-800 hover:bg-primary-100 disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5" />
              Etiket Ekle
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="ml-auto inline-flex cursor-pointer items-center gap-1 font-semibold text-gray-600 hover:text-gray-900"
          >
            <X className="h-3.5 w-3.5" />
            Seçimi Temizle
          </button>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-12">
        <Card className={`rounded-2xl border border-slate-200/80 p-3 shadow-xs ${selectedId ? 'xl:col-span-5' : 'xl:col-span-12'}`}>
          {loading && list.items.length === 0 ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Bağışçı bulunamadı"
              text="Arama veya filtre kriterlerini değiştirip tekrar deneyebilirsiniz."
            />
          ) : (
            <>
              {perms.update && (
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-[11px] font-semibold text-gray-500">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                    <span>Bu sayfadaki tümünü seç ({list.items.length})</span>
                  </label>
                </div>
              )}
              <ul className="divide-y divide-gray-100">
                {list.items.map((d) => {
                  const health = donorHealthBadge(d.total_donations, d.last_donation_at)
                  const isChecked = selectedIds.includes(d.id)
                  return (
                    <li key={d.id} className="flex items-center gap-1">
                      {perms.update && (
                        <div className="pl-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(d.id)}
                            aria-label={`${d.full_name} seç`}
                            className="cursor-pointer"
                          />
                        </div>
                      )}
                      <button
                        onClick={() => select(d.id)}
                        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-gray-50 ${
                          selectedId === d.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          d.donor_type === 'corporate' ? 'bg-slate-100 text-slate-700' : donorAvatarTone(d.full_name)
                        }`}>
                          {d.donor_type === 'corporate' ? <Building2 className="h-4 w-4" /> : donorInitials(d.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-semibold text-gray-900">{d.full_name}</span>
                            {d.donor_type === 'corporate' && (
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Kurumsal</span>
                            )}
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${health.cls}`}>
                              {health.label}
                            </span>
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {[d.phone, d.city, d.country && d.country !== 'Türkiye' ? d.country : null].filter(Boolean).join(' · ') || '—'}
                          </div>
                          {d.tags?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {d.tags.slice(0, 2).map((t) => (
                                <span key={t} className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">{t}</span>
                              ))}
                              {d.tags.length > 2 && <span className="text-[10px] text-gray-400">+{d.tags.length - 2}</span>}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-xs">
                          <div className="font-bold text-gray-900">{formatMoney(d.total_donated_cents)}</div>
                          <div className="text-gray-400">{d.total_donations} bağış{d.assigned_user_name ? ` · ${d.assigned_user_name}` : ''}</div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {pages > 1 && (
            <div className="px-2 pt-2">
              <Pagination page={page} pages={pages} total={list.total} onChange={setPage} />
            </div>
          )}
        </Card>

        {selectedId && (
          <div className="xl:sticky xl:top-4 xl:col-span-7">
            <DonorCardPanel
              donorId={selectedId}
              staff={staff}
              perms={perms}
              canIssue={canIssue}
              onClose={() => select(null)}
              onChanged={load}
              onDeleted={() => {
                select(null)
                load()
                toast.ok('Bağışçı kaydı silindi')
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface DonorPerms { create: boolean; update: boolean; remove: boolean; imports: boolean; sms: boolean; notes: boolean }

function DonorForm({ donor, staff, onSaved }: { donor?: DonorCard; staff: Staff[]; onSaved: (d: DonorRow) => void }) {
  const [form, setForm] = useState({
    donor_type: donor?.donor_type || 'individual',
    first_name: donor?.first_name || '',
    last_name: donor?.last_name || '',
    company_name: donor?.company_name || '',
    phone: donor?.phone || '',
    email: donor?.email || '',
    city: donor?.city || '',
    country: donor?.country || 'Türkiye',
    address: donor?.address || '',
    tax_number: donor?.tax_number || '',
    tc_no: '',
    tags: (donor?.tags || []).join(', '),
    assigned_user_id: donor?.assigned_user_id || '',
    allow_sms: donor?.allow_sms ?? false,
    allow_email: donor?.allow_email ?? false,
  })
  const [error, setError] = useState('')
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const body = {
      donor_type: form.donor_type,
      first_name: form.first_name,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      phone: form.phone || null,
      email: form.email || null,
      city: form.city || null,
      country: form.country || null,
      address: form.address || null,
      tax_number: form.tax_number || null,
      tc_no: form.tc_no || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      allow_sms: form.allow_sms,
      allow_email: form.allow_email,
      ...(donor
        ? form.assigned_user_id
          ? { assigned_user_id: form.assigned_user_id }
          : { clear_assignment: true }
        : form.assigned_user_id
        ? { assigned_user_id: form.assigned_user_id }
        : {}),
    }
    try {
      const res = donor
        ? await adminSend<DonorRow>('put', `/donors/${donor.id}`, body)
        : await adminSend<DonorRow>('post', '/donors', body)
      onSaved(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Kaydedilemedi'))
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Label label="Tür">
        <select className={inputClass} value={form.donor_type} onChange={(e) => set('donor_type', e.target.value)}>
          <option value="individual">Bireysel</option><option value="corporate">Kurumsal</option>
        </select>
      </Label>
      <Label label="Ad *">
        <Input required value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
      </Label>
      <Label label="Soyad">
        <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
      </Label>
      {form.donor_type === 'corporate' ? (
        <Label label="Kurum Adı *">
          <Input required value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
        </Label>
      ) : (
        <Label label="TC Kimlik No" hint={donor?.tc_no_masked ? `Kayıtlı: ${donor.tc_no_masked}` : undefined}>
          <Input inputMode="numeric" maxLength={11} value={form.tc_no} onChange={(e) => set('tc_no', e.target.value)} />
        </Label>
      )}
      <Label label="Telefon">
        <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </Label>
      <Label label="E-posta">
        <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </Label>
      <Label label="Şehir">
        <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
      </Label>
      <Label label="Ülke">
        <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
      </Label>
      <div className="sm:col-span-2">
        <Label label="Adres">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Label>
      </div>
      <Label label="Vergi No">
        <Input value={form.tax_number} onChange={(e) => set('tax_number', e.target.value)} />
      </Label>
      <Label label="Etiketler (virgülle)">
        <Input placeholder="vip, kurban" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
      </Label>
      <Label label="Temsilci (sorumlu personel)">
        <select className={inputClass} value={form.assigned_user_id} onChange={(e) => set('assigned_user_id', e.target.value)}>
          <option value="">— Atanmamış</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
        </select>
      </Label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={form.allow_sms} onChange={(e) => setForm((f) => ({ ...f, allow_sms: e.target.checked }))} /> SMS İzni (İYS)
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={form.allow_email} onChange={(e) => setForm((f) => ({ ...f, allow_email: e.target.checked }))} /> E-posta İzni (İYS)
        </label>
      </div>
      <div className="flex items-end justify-end sm:col-span-2 lg:col-span-4">
        {error && <span className="mr-3 text-sm font-semibold text-rose-600">{error}</span>}
        <Button type="submit">{donor ? 'Kaydet' : 'Bağışçıyı Ekle'}</Button>
      </div>
    </form>
  )
}

function DonorCardPanel({
  donorId, staff, perms, canIssue, onClose, onChanged, onDeleted,
}: {
  donorId: string; staff: Staff[]; perms: DonorPerms; canIssue: boolean; onClose: () => void; onChanged: () => void; onDeleted: () => void
}) {
  const [card, setCard] = useState<DonorCard | null>(null)
  const [tab, setTab] = useState<'donations' | 'notes' | 'edit' | 'receipt'>('donations')
  const [note, setNote] = useState('')
  const [quickTag, setQuickTag] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [smsOpen, setSmsOpen] = useState(false)
  const [smsLog, setSmsLog] = useState<SmsMessage[]>([])
  const [cardStatModal, setCardStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null)

  const copyField = (k: string, v: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(v).then(() => {
      setCopiedField(k)
      setTimeout(() => setCopiedField(null), 1500)
    })
  }

  const load = async () => {
    try {
      setCard((await adminGet<DonorCard>(`/donors/${donorId}`)).data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağışçı yüklenemedi'))
    }
    // The SMS module may not be in the package; the history is simply left empty then.
    adminGet<{ items: SmsMessage[] }>('/sms/messages', { donor_id: donorId, page_size: 30 })
      .then((res) => setSmsLog(res.data.items)).catch(() => setSmsLog([]))
  }
  useEffect(() => { setCard(null); setTab('donations'); load() }, [donorId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!card) return <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs"><div className="h-32 animate-pulse rounded-xl bg-slate-100" /></Card>

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await adminSend('post', `/donors/${card.id}/notes`, { content: note })
      setNote('')
      toast.ok('Not eklendi')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const addQuickTag = async (e: React.FormEvent) => {
    e.preventDefault()
    const tag = quickTag.trim()
    if (!tag) return
    const nextTags = Array.from(new Set([...card.tags, tag]))
    try {
      await adminSend('put', `/donors/${card.id}`, { tags: nextTags })
      setQuickTag('')
      toast.ok(`"${tag}" etiketi eklendi`)
      await load()
      onChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const removeQuickTag = async (tag: string) => {
    try {
      await adminSend('put', `/donors/${card.id}`, { tags: card.tags.filter((t) => t !== tag) })
      await load()
      onChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const quickAssign = async (staffId: string) => {
    try {
      await adminSend('put', `/donors/${card.id}`, staffId ? { assigned_user_id: staffId } : { clear_assignment: true })
      toast.ok('Temsilci güncellendi')
      await load()
      onChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const health = donorHealthBadge(card.total_donations, card.last_donation_at)
  const avgDonationCents = card.total_donations > 0 ? Math.round(card.total_donated_cents / card.total_donations) : 0

  return (
    <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            card.donor_type === 'corporate' ? 'bg-slate-100 text-slate-700' : donorAvatarTone(card.full_name)
          }`}>
            {card.donor_type === 'corporate' ? <Building2 className="h-5 w-5" /> : donorInitials(card.full_name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{card.full_name}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${health.cls}`}>{health.label}</span>
            </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            {card.phone && (
              <span className="inline-flex items-center gap-1">
                <a href={`tel:${card.phone}`} className="text-primary-700 hover:underline">{card.phone}</a>
                <button type="button" onClick={() => copyField('phone', card.phone || '')} title="Telefonu kopyala" className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  {copiedField === 'phone' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                </button>
              </span>
            )}
            {card.email && (
              <span className="inline-flex items-center gap-1">
                <a href={`mailto:${card.email}`} className="text-primary-700 hover:underline">{card.email}</a>
                <button type="button" onClick={() => copyField('email', card.email || '')} title="E-postayı kopyala" className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  {copiedField === 'email' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                </button>
              </span>
            )}
            <span>{[card.city, card.country].filter(Boolean).join(', ')}</span>
          </div>
          {(card.address || card.tax_number || card.tc_no_masked) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              {card.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                  {card.address}
                </span>
              )}
              {card.tc_no_masked && <span>TC: <strong className="font-mono text-gray-700">{card.tc_no_masked}</strong></span>}
              {card.tax_number && <span>Vergi No: <strong className="font-mono text-gray-700">{card.tax_number}</strong></span>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            <span className="rounded border px-1.5 py-0.5">{card.donor_type === 'corporate' ? 'Kurumsal' : 'Bireysel'}</span>
            <span className={`rounded border px-1.5 py-0.5 ${card.allow_sms ? 'border-green-200 text-green-700' : 'text-gray-400'}`}>SMS izni {card.allow_sms ? 'var' : 'yok'}</span>
            <span className={`rounded border px-1.5 py-0.5 ${card.allow_email ? 'border-green-200 text-green-700' : 'text-gray-400'}`}>E-posta izni {card.allow_email ? 'var' : 'yok'}</span>
            {perms.update ? (
              <select
                value={card.assigned_user_id || ''}
                onChange={(e) => quickAssign(e.target.value)}
                title="Hızlı temsilci ata"
                className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700"
              >
                <option value="">Temsilci: —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>Temsilci: {s.first_name} {s.last_name}</option>
                ))}
              </select>
            ) : (
              <span className="rounded border px-1.5 py-0.5">Temsilci: {card.assigned_user_name || '—'}</span>
            )}
            {card.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-primary-800">
                {t}
                {perms.update && (
                  <button type="button" onClick={() => removeQuickTag(t)} className="cursor-pointer text-primary-500 hover:text-rose-600" aria-label={`${t} etiketini kaldır`}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {perms.update && (
              <form onSubmit={addQuickTag} className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={quickTag}
                  onChange={(e) => setQuickTag(e.target.value)}
                  placeholder="+ etiket"
                  className="w-20 rounded border border-dashed border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 outline-none focus:border-primary-400 focus:bg-white"
                />
              </form>
            )}
          </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(() => {
            const wa = whatsappUrl(card.phone, `Merhaba ${card.full_name}, bağışlarınız ve desteğiniz için teşekkür ederiz.`)
            return wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20">
                <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
              </a>
            ) : null
          })()}
          {perms.sms && <Button type="button" size="sm" onClick={() => setSmsOpen(true)}>SMS Gönder</Button>}
          {perms.remove && card.total_donations === 0 && (
            <button
              type="button"
              title="Bağışı olmayan kaydı sil"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `"${card.full_name}" silinsin mi?`,
                  text: 'Bu bağışçının hiç bağışı bulunmuyor. Kayıt kalıcı olarak silinecek.',
                  danger: true,
                })
                if (!ok) return
                try {
                  await adminSend('delete', `/donors/${card.id}`)
                  onDeleted()
                } catch (err) {
                  toast.error(apiErrorMessage(err, 'Bağışçı silinemedi'))
                }
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700" aria-label="Kapat">✕</button>
        </div>
      </div>

      {smsOpen && (
        <QuickSmsDialog
          target={{ donorId: card.id, name: card.full_name, phone: card.phone, allowSms: card.allow_sms }}
          onClose={() => setSmsOpen(false)}
          onSent={(r) => { toast.ok(sentNotice(r)); load() }}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            const byCampaign = new Map<string, number>()
            for (const d of card.donations) {
              if (d.status !== 'confirmed') continue
              const key = d.campaign_title || 'Genel Bağış'
              byCampaign.set(key, (byCampaign.get(key) || 0) + d.amount_cents)
            }
            const max = Math.max(1, ...byCampaign.values())
            setCardStatModal({
              title: `${card.full_name} — Bağış Kalemi Dağılımı`,
              subtitle: `Toplam ${formatMoney(card.total_donated_cents)} (${card.total_donations} bağış)`,
              items: Array.from(byCampaign.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([label, cents]) => ({
                  label,
                  value: formatMoney(cents),
                  color: 'emerald' as const,
                  percent: Math.round((cents / max) * 100),
                })),
            })
          }}
          className="cursor-pointer rounded-lg bg-gray-50 p-3 text-left transition hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-200"
        >
          <div className="text-[10px] font-bold uppercase text-gray-500">Toplam</div>
          <div className="text-lg font-black">{formatMoney(card.total_donated_cents)}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setCardStatModal({
              title: `${card.full_name} — Yıllık Bağış Özeti`,
              subtitle: `Toplam ${card.total_donations} bağış kaydı`,
              items: card.yearly.length > 0
                ? card.yearly.map((y) => ({
                    label: `${y.year} Yılı`,
                    value: Object.entries(y.totals).map(([c, v]) => formatMoney(v, c)).join(' + '),
                    sub: `${y.count} adet bağış`,
                    color: 'blue' as const,
                  }))
                : card.donations.map((d) => ({
                    label: d.campaign_title || 'Bağış',
                    value: formatMoney(d.amount_cents, d.currency),
                    sub: new Date(d.paid_at).toLocaleDateString('tr-TR'),
                    color: 'blue' as const,
                  })),
            })
          }}
          className="cursor-pointer rounded-lg bg-gray-50 p-3 text-left transition hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-200"
        >
          <div className="text-[10px] font-bold uppercase text-gray-500">Bağış sayısı</div>
          <div className="text-lg font-black">{card.total_donations}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            const sorted = [...card.donations].sort((a, b) => b.amount_cents - a.amount_cents)
            const max = Math.max(1, ...sorted.map((d) => d.amount_cents))
            setCardStatModal({
              title: `${card.full_name} — Tutar Dağılımı`,
              subtitle: `Ortalama bağış: ${avgDonationCents > 0 ? formatMoney(avgDonationCents) : '—'}`,
              items: sorted.slice(0, 10).map((d) => ({
                label: `${d.campaign_title || 'Bağış'} (#${d.receipt_number})`,
                value: formatMoney(d.amount_cents, d.currency),
                sub: new Date(d.paid_at).toLocaleDateString('tr-TR'),
                color: 'indigo' as const,
                percent: Math.round((d.amount_cents / max) * 100),
              })),
            })
          }}
          className="cursor-pointer rounded-lg bg-gray-50 p-3 text-left transition hover:bg-indigo-50/70 hover:ring-1 hover:ring-indigo-200"
        >
          <div className="text-[10px] font-bold uppercase text-gray-500">Ortalama</div>
          <div className="text-lg font-black">{avgDonationCents > 0 ? formatMoney(avgDonationCents) : '—'}</div>
        </button>
        <button
          type="button"
          onClick={() => {
            setCardStatModal({
              title: `${card.full_name} — Son Bağışlar`,
              subtitle: card.last_donation_at ? `Son bağış tarihi: ${new Date(card.last_donation_at).toLocaleDateString('tr-TR')}` : 'Henüz bağış yok',
              items: card.donations.slice(0, 10).map((d) => ({
                label: `${new Date(d.paid_at).toLocaleDateString('tr-TR')} · ${d.campaign_title || 'Bağış'}`,
                value: formatMoney(d.amount_cents, d.currency),
                sub: `${d.payment_method_label} · Makbuz #${d.receipt_number}`,
                color: 'amber' as const,
              })),
            })
          }}
          className="cursor-pointer rounded-lg bg-gray-50 p-3 text-left transition hover:bg-amber-50/70 hover:ring-1 hover:ring-amber-200"
        >
          <div className="text-[10px] font-bold uppercase text-gray-500">Son bağış</div>
          <div className="text-lg font-black">{card.last_donation_at ? new Date(card.last_donation_at).toLocaleDateString('tr-TR') : '—'}</div>
        </button>
      </div>
      <MuhasebeStatModal
        isOpen={!!cardStatModal}
        onClose={() => setCardStatModal(null)}
        title={cardStatModal?.title || ''}
        subtitle={cardStatModal?.subtitle}
        items={cardStatModal?.items || []}
      />

      <div className="flex flex-wrap gap-1 border-b border-slate-200 text-sm font-semibold">
        {([
          ['donations', `Bağışlar (${card.donations.length})`],
          ['notes', `Notlar & SMS (${card.notes.length + smsLog.length})`],
          ...(perms.update ? [['edit', 'Bilgileri Düzenle']] : []),
          ...(canIssue ? [['receipt', 'Makbuz Kes']] : []),
        ] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'donations' && (
        <div className="space-y-4">
          {card.yearly.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {card.yearly.map((y) => (
                <div key={y.year} className="rounded-lg border px-3 py-1.5 text-xs">
                  <strong>{y.year}</strong> · {y.count} bağış · {Object.entries(y.totals).map(([c, v]) => formatMoney(v, c)).join(' + ')}
                </div>
              ))}
            </div>
          )}
          <div className="max-h-[480px] overflow-y-auto">
            <Table>
              <TBody>
                {card.donations.map((d) => (
                  <Tr key={d.id} className={d.status !== 'confirmed' ? 'opacity-50' : ''}>
                    <Td>{new Date(d.paid_at).toLocaleDateString('tr-TR')}</Td>
                    <Td>
                      <div className="font-semibold">{d.campaign_title}</div>
                      <div className="text-[10px] text-gray-400">{d.payment_method_label}{d.is_manual ? ' · elle' : ''}{d.on_behalf_of ? ` · Adına: ${d.on_behalf_of}` : ''}</div>
                    </Td>
                    <Td className="text-right font-bold tabular-nums">{formatMoney(d.amount_cents, d.currency)}</Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {(() => {
                          const origin = typeof window !== 'undefined' ? window.location.origin : ''
                          const wa = whatsappUrl(
                            card.phone,
                            `Merhaba ${card.full_name}, ${formatMoney(d.amount_cents, d.currency)}${d.campaign_title ? ` (${d.campaign_title})` : ''} bağışınız için teşekkür ederiz. Makbuzunuz (#${d.receipt_number}): ${origin}/verify/receipt/${encodeURIComponent(d.receipt_number)}`,
                          )
                          return wa ? (
                            <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp ile makbuz gönder" className="inline-flex items-center text-emerald-600 hover:text-emerald-700">
                              <WhatsAppIcon className="h-4 w-4" />
                            </a>
                          ) : null
                        })()}
                        <button onClick={() => downloadReceiptPdf(d.id, d.receipt_number).catch(() => toast.error('PDF indirilemedi'))} className="font-bold text-emerald-700 hover:underline">PDF</button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {card.donations.length === 0 && <Tr><Td className="text-center text-gray-400">Henüz bağış yok.</Td></Tr>}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-4">
          {perms.notes && (
            <form onSubmit={addNote} className="flex gap-2">
              <Input required placeholder="Görüşme notu ekle..." value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" size="sm">Ekle</Button>
            </form>
          )}
          {smsLog.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-xs font-bold text-gray-600">Gönderilen SMS&apos;ler</div>
              <ul className="space-y-2">
                {smsLog.map((m) => (
                  <li key={m.id} className="text-sm">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="font-bold text-gray-600">#{m.seq_no}</span>
                      <span className={`rounded border px-1.5 py-0.5 font-bold ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                      <span>{new Date(m.sent_at || m.send_after).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <div className="whitespace-pre-line text-gray-700">{m.body}</div>
                    {m.error && <div className="text-[11px] text-red-600">{m.error}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="space-y-2">
            {card.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                <div className="whitespace-pre-line text-gray-800">{n.content}</div>
                <div className="mt-1 text-[10px] text-gray-400">{n.author || 'Sistem'} · {new Date(n.created_at).toLocaleString('tr-TR')}</div>
              </li>
            ))}
            {card.notes.length === 0 && <li className="py-4 text-center text-xs text-gray-400">Not yok.</li>}
          </ul>
        </div>
      )}

      {tab === 'edit' && (
        <DonorForm donor={card} staff={staff} onSaved={() => { toast.ok('Bağışçı güncellendi'); load(); onChanged() }} />
      )}

      {tab === 'receipt' && (
        <ManualReceiptForm
          presetDonor={{ id: card.id, full_name: card.full_name, phone: card.phone, email: card.email }}
          onDone={(r) => { toast.ok(`${r.receipt_number} numaralı makbuz kesildi`); setTab('donations'); load(); onChanged() }}
        />
      )}
    </Card>
  )
}
