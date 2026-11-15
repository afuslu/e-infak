'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { AlertCircle, BarChart3, History, MapPin, PiggyBank, Plus, RefreshCw, Wallet } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, whatsappUrl, can } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { ExportButtons, Modal, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, toast } from '../../../../components/admin/ui'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, ResponsiveDataToolbar } from '../../../../components/admin/muhasebe/OnMuhasebeUI'

interface Region { id: string; name: string; description: string | null }
interface Box {
  id: string
  code: string
  region_id: string | null
  region_name: string | null
  location_name: string
  address: string | null
  city: string | null
  district: string | null
  contact_name: string | null
  contact_phone: string | null
  responsible_user_id: string | null
  campaign_id: string | null
  status: 'active' | 'passive' | 'lost'
  placed_at: string | null
  last_collected_at: string | null
  days_since_collection: number | null
  notes: string | null
  collection_count: number
  total_collected_cents: number
}
interface Report {
  total_cents: number
  collections: number
  boxes: { active: number; passive: number; lost: number }
  not_collected_90_days: number
  by_region: { label: string; count: number; total_cents: number }[]
  by_staff: { label: string; count: number; total_cents: number }[]
}

const STATUS: Record<Box['status'], string> = { active: 'Aktif', passive: 'Pasif', lost: 'Kayıp' }
const STATUS_STYLE: Record<Box['status'], string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  passive: 'border-slate-200 bg-slate-100 text-slate-600',
  lost: 'border-rose-200 bg-rose-50 text-rose-800',
}
const emptyBox = {
  code: '', region_id: '', location_name: '', address: '', city: '', district: '', contact_name: '', contact_phone: '',
  responsible_user_id: '', campaign_id: '', status: 'active' as Box['status'], placed_at: '', notes: '',
}

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random()}`.replace('.', '').padEnd(16, '0')
}

export default function KumbaraPage() {
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'operations.manage')
  const [tab, setTab] = useState<'boxes' | 'performance'>('boxes')
  const [boxes, setBoxes] = useState<Box[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [staff, setStaff] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [filters, setFilters] = useState({ region_id: '', status: 'active', responsible: '', stale: '', q: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState(emptyBox)
  const [editing, setEditing] = useState<Box | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [collecting, setCollecting] = useState<Box | null>(null)
  const [collection, setCollection] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '', key: newKey() })
  const [history, setHistory] = useState<{ box: Box; rows: any[] } | null>(null)
  const [showRegionModal, setShowRegionModal] = useState(false)
  const [editingRegion, setEditingRegion] = useState<Region | null>(null)
  const [regionForm, setRegionForm] = useState({ name: '', description: '' })
  const [statModal, setStatModal] = useState<'total' | 'active' | 'collections' | 'stale' | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulkRegion, setBulkRegion] = useState('')
  const [bulkStaff, setBulkStaff] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const staffMap = useMemo(
    () => new Map(staff.map((s) => [s.id, `${s.first_name} ${s.last_name}`.trim()])),
    [staff],
  )
  const campaignMap = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c.title])),
    [campaigns],
  )

  const load = async () => {
    try {
      const [b, r, rep] = await Promise.all([
        adminGet<Box[]>('/money-boxes', {
          region_id: filters.region_id || undefined, status: filters.status || undefined, responsible: filters.responsible || undefined,
          not_collected_days: filters.stale || undefined, q: filters.q || undefined,
        }),
        adminGet<Region[]>('/regions'),
        adminGet<Report>('/money-boxes-report'),
      ])
      setBoxes(b.data)
      setRegions(r.data)
      setReport(rep.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kumbaralar yüklenemedi'))
    }
  }

  const refreshAll = async () => {
    setRefreshing(true)
    try {
      await load()
      toast.ok('Kumbara verileri yenilendi.')
    } finally {
      setRefreshing(false)
    }
  }

  const didMountRef = useRef(false)
  useEffect(() => {
    setPicked(new Set())
    if (!didMountRef.current) {
      didMountRef.current = true
      load()
      return
    }
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])
  useEffect(() => {
    adminGet<any[]>('/users').then((r) => setStaff(r.data)).catch(() => {})
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])

  const open = (b: Box | null) => {
    setEditing(b)
    setShowForm(true)
    setForm(b ? {
      code: b.code, region_id: b.region_id || '', location_name: b.location_name, address: b.address || '', city: b.city || '',
      district: b.district || '', contact_name: b.contact_name || '', contact_phone: b.contact_phone || '',
      responsible_user_id: b.responsible_user_id || '', campaign_id: b.campaign_id || '', status: b.status,
      placed_at: b.placed_at ? b.placed_at.slice(0, 10) : '', notes: b.notes || '',
    } : emptyBox)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      if (editing) await adminSend('put', `/money-boxes/${editing.id}`, { ...body, code: editing.code })
      else await adminSend('post', '/money-boxes', body)
      setShowForm(false)
      toast.ok('Kumbara kaydedildi.')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const saveRegion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regionForm.name.trim()) return
    try {
      const payload = {
        name: regionForm.name.trim(),
        description: regionForm.description.trim() || null,
      }
      if (editingRegion) {
        await adminSend('put', `/regions/${editingRegion.id}`, payload)
        toast.ok('Bölge güncellendi.')
      } else {
        await adminSend('post', '/regions', payload)
        toast.ok('Bölge eklendi.')
      }
      setEditingRegion(null)
      setRegionForm({ name: '', description: '' })
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const collect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collecting) return
    try {
      const res = await adminSend<{ receipt_number?: string }>('post', `/money-boxes/${collecting.id}/collections`, {
        idempotency_key: collection.key,
        amount_cents: Math.round(Number(collection.amount.replace(',', '.')) * 100),
        collected_on: collection.date || null,
        notes: collection.notes || null,
      })
      toast.ok(`${collecting.code} boşaltıldı, ${res.data.receipt_number || ''} numaralı bağış kaydı oluşturuldu.`)
      setCollecting(null)
      setCollection({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '', key: newKey() })
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const showHistory = async (b: Box) => {
    try {
      setHistory({ box: b, rows: (await adminGet<any[]>(`/money-boxes/${b.id}/collections`)).data })
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAllBoxes = () => {
    if (picked.size === boxes.length && boxes.length > 0) setPicked(new Set())
    else setPicked(new Set(boxes.map((b) => b.id)))
  }

  const applyBulkUpdate = async () => {
    if (picked.size === 0 || (!bulkRegion && !bulkStaff && !bulkStatus)) return
    setBulkBusy(true)
    try {
      const targets = boxes.filter((b) => picked.has(b.id))
      await Promise.all(targets.map((b) => adminSend('put', `/money-boxes/${b.id}`, {
        code: b.code,
        region_id: bulkRegion ? (bulkRegion === '__clear__' ? null : bulkRegion) : b.region_id,
        location_name: b.location_name,
        address: b.address,
        city: b.city,
        district: b.district,
        contact_name: b.contact_name,
        contact_phone: b.contact_phone,
        responsible_user_id: bulkStaff ? (bulkStaff === '__clear__' ? null : bulkStaff) : b.responsible_user_id,
        campaign_id: b.campaign_id,
        status: (bulkStatus as Box['status']) || b.status,
        placed_at: b.placed_at ? b.placed_at.slice(0, 10) : null,
        notes: b.notes,
      })))
      toast.ok(`${targets.length} kumbara topluca güncellendi.`)
      setPicked(new Set())
      setBulkRegion('')
      setBulkStaff('')
      setBulkStatus('')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBulkBusy(false)
    }
  }

  const set = (k: keyof typeof emptyBox, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const activeFilterCount = [filters.region_id, filters.status !== 'active' ? filters.status : '', filters.responsible, filters.stale].filter(Boolean).length
  const clearFilters = () => setFilters({ region_id: '', status: 'active', responsible: '', stale: '', q: '' })

  return (
    <div className="space-y-5">
      <AppPageHeader
        eyebrow="SAHA & ORGANİZASYON"
        title="Kumbara Organizasyonu"
        meta="Saha kumbaralarından boşaltılan tutarlar seçilen bağış kalemine otomatik olarak işlenir, makbuz kesilir ve muhasebe/raporlara yansır."
        icon={<PiggyBank className="h-6 w-6" />}
        chips={
          report ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                ✓ {report.boxes.active} Aktif Kumbara
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                📍 {regions.length} Saha Bölgesi
              </span>
              {report.not_collected_90_days > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                  ⚠️ {report.not_collected_90_days} Kumbara (90+ Gün Boşaltılmadı)
                </span>
              )}
            </>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={refreshing} className="h-10 rounded-xl px-3 text-xs font-bold">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRegion(null)
                    setRegionForm({ name: '', description: '' })
                    setShowRegionModal(true)
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
                >
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Saha Bölgeleri
                </button>
                <button
                  type="button"
                  onClick={() => open(null)}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Kumbara Ekle
                </button>
              </>
            )}
          </div>
        }
      />

      {report && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <GlobalStatCard
            id="total"
            title="BU YIL TOPLANAN"
            value={formatMoney(report.total_cents)}
            subtitle={`${report.collections} boşaltma işleminden toplam gelir`}
            icon={<Wallet className="h-4 w-4" />}
            gradient="from-emerald-600 to-teal-700"
            onClick={() => setStatModal('total')}
          />
          <GlobalStatCard
            id="active"
            title="AKTİF KUMBARA SAYISI"
            value={`${report.boxes.active} Kumbara`}
            subtitle={`${report.boxes.passive} pasif · ${report.boxes.lost} kayıp kumbara`}
            icon={<PiggyBank className="h-4 w-4" />}
            gradient="from-blue-600 to-indigo-700"
            onClick={() => setStatModal('active')}
          />
          <GlobalStatCard
            id="collections"
            title="BOŞALTMA İŞLEMİ"
            value={`${report.collections} İşlem`}
            subtitle={`${regions.length} saha bölgesinde toplama`}
            icon={<History className="h-4 w-4" />}
            gradient="from-violet-600 to-purple-700"
            onClick={() => setStatModal('collections')}
          />
          <GlobalStatCard
            id="stale"
            title="90+ GÜN BOŞALTILMAYAN"
            value={`${report.not_collected_90_days} Kumbara`}
            subtitle={report.not_collected_90_days > 0 ? 'Acil saha ziyareti gerektiriyor' : 'Tüm kumbaralar zamanında toplandı'}
            icon={<AlertCircle className="h-4 w-4" />}
            gradient={report.not_collected_90_days > 0 ? 'from-rose-500 to-red-600' : 'from-slate-500 to-slate-700'}
            onClick={() => setStatModal('stale')}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(k) => setTab(k)}
          tabs={[
            { key: 'boxes', label: 'Kumbara Listesi & Saha Takibi', count: boxes.length, icon: PiggyBank },
            { key: 'performance', label: 'Bölge & Personel Performansı', icon: BarChart3 },
          ]}
        />
      </div>

      {tab === 'boxes' && (
        <>
          <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <ResponsiveDataToolbar
              search={{
                value: filters.q,
                onChange: (q) => setFilters({ ...filters, q }),
                placeholder: 'Kumbara kodu (KMB-...), esnaf/cami adı, adres veya yetkili ara...',
              }}
              filter={{
                activeCount: activeFilterCount,
                onOpen: () => setShowFilters((v) => !v),
                label: 'Gelişmiş Filtreler',
                showOnDesktop: true,
              }}
              extraActions={
                <ExportButtons
                  filename="kumbaralar"
                  title="Kumbara Listesi"
                  subtitle={`${boxes.length} kumbara`}
                  currencyCols={[9]}
                  summary={
                    report
                      ? [
                          ['Bu Yıl Toplanan', formatMoney(report.total_cents)],
                          ['Aktif Kumbara', String(report.boxes.active)],
                          ['Boşaltma Sayısı', String(report.collections)],
                          ['90+ Gün Geciken', String(report.not_collected_90_days)],
                        ]
                      : undefined
                  }
                  getData={() => ({
                    headers: ['Kod', 'Yer', 'Bölge', 'Adres', 'Yetkili', 'Telefon', 'Sorumlu', 'Durum', 'Son Boşaltma', 'Toplam (TL)'],
                    rows: boxes.map((b) => [
                      b.code,
                      b.location_name,
                      b.region_name,
                      [b.address, b.district, b.city].filter(Boolean).join(', '),
                      b.contact_name,
                      b.contact_phone,
                      b.responsible_user_id ? staffMap.get(b.responsible_user_id) || '' : '',
                      STATUS[b.status],
                      b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : '',
                      b.total_collected_cents / 100,
                    ]),
                  })}
                />
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'Aktifler', active: filters.status === 'active' && !filters.stale && !filters.responsible, onClick: () => setFilters((f) => ({ ...f, status: 'active', stale: '', responsible: '' })) },
                  { label: '30+ Gün Geciken', active: filters.stale === '30', onClick: () => setFilters((f) => ({ ...f, status: 'active', stale: f.stale === '30' ? '' : '30' })) },
                  { label: '90+ Gün Geciken', active: filters.stale === '90', onClick: () => setFilters((f) => ({ ...f, status: 'active', stale: f.stale === '90' ? '' : '90' })) },
                  { label: 'Bana Ait', active: filters.responsible === 'me', onClick: () => setFilters((f) => ({ ...f, responsible: f.responsible === 'me' ? '' : 'me' })) },
                  { label: 'Pasif', active: filters.status === 'passive', onClick: () => setFilters((f) => ({ ...f, status: 'passive', stale: '' })) },
                  { label: 'Kayıp', active: filters.status === 'lost', onClick: () => setFilters((f) => ({ ...f, status: 'lost', stale: '' })) },
                  { label: 'Tümü', active: filters.status === '' && !filters.stale && !filters.responsible, onClick: () => setFilters((f) => ({ ...f, status: '', stale: '', responsible: '' })) },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={p.onClick}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                      p.active
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {(activeFilterCount > 0 || filters.q) && (
                <button type="button" onClick={clearFilters} className="text-xs font-bold text-rose-600 hover:text-rose-700">
                  Filtreleri Temizle
                </button>
              )}
            </div>

            {showFilters && (
              <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <Label label="Saha Bölgesi">
                  <select className={inputClass} value={filters.region_id} onChange={(e) => setFilters({ ...filters, region_id: e.target.value })}>
                    <option value="">Tüm bölgeler</option>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Label>
                <Label label="Kumbara Durumu">
                  <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                    <option value="">Tümü</option>
                    {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Label>
                <Label label="Sorumlu Personel">
                  <select className={inputClass} value={filters.responsible} onChange={(e) => setFilters({ ...filters, responsible: e.target.value })}>
                    <option value="">Tüm sorumlular</option>
                    <option value="me">Bana ait</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </Label>
                <Label label="Boşaltma Gecikmesi">
                  <select className={inputClass} value={filters.stale} onChange={(e) => setFilters({ ...filters, stale: e.target.value })}>
                    <option value="">Tümü</option>
                    <option value="30">30+ gündür boşaltılmayan</option>
                    <option value="90">90+ gündür boşaltılmayan</option>
                  </select>
                </Label>
              </div>
            )}
          </section>

          {canEdit && picked.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <span className="text-xs font-bold text-emerald-900">{picked.size} kumbara seçildi</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-xl border border-emerald-300 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none"
                  value={bulkRegion}
                  onChange={(e) => setBulkRegion(e.target.value)}
                >
                  <option value="">Bölge değiştirme</option>
                  <option value="__clear__">Bölgeyi temizle</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <select
                  className="h-9 rounded-xl border border-emerald-300 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none"
                  value={bulkStaff}
                  onChange={(e) => setBulkStaff(e.target.value)}
                >
                  <option value="">Sorumlu değiştirme</option>
                  <option value="__clear__">Sorumluyu kaldır</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
                <select
                  className="h-9 rounded-xl border border-emerald-300 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                >
                  <option value="">Durum değiştirme</option>
                  {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <Button type="button" size="sm" disabled={bulkBusy || (!bulkRegion && !bulkStaff && !bulkStatus)} onClick={applyBulkUpdate}>
                  Uygula
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPicked(new Set())}>
                  Temizle
                </Button>
              </div>
            </div>
          )}

          <Card className="overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-xs">
            <div className="overflow-x-auto">
              <Table inset>
                <THead className="bg-slate-50/80">
                  <Tr>
                    {canEdit && (
                      <Th className="w-10">
                        <input
                          type="checkbox"
                          checked={boxes.length > 0 && picked.size === boxes.length}
                          onChange={toggleAllBoxes}
                          aria-label="Tüm kumbaraları seç"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </Th>
                    )}
                    <Th>Kumbara Kodu</Th>
                    <Th>Yer / Esnaf / Adres</Th>
                    <Th>Bölge & Sorumlu</Th>
                    <Th>Durum</Th>
                    <Th>Son Boşaltma</Th>
                    <Th className="text-right">Toplam Tahsilat</Th>
                    <Th className="text-right">İşlem</Th>
                  </Tr>
                </THead>
                <TBody>
                  {boxes.map((b) => {
                    const isStale = b.days_since_collection !== null && b.days_since_collection > 90
                    const fullAddr = [b.address, b.district, b.city].filter(Boolean).join(', ')
                    return (
                      <Tr key={b.id} className={`hover:bg-slate-50/70 ${b.status !== 'active' ? 'opacity-60' : ''}`}>
                        {canEdit && (
                          <Td>
                            <input
                              type="checkbox"
                              checked={picked.has(b.id)}
                              onChange={() => togglePick(b.id)}
                              aria-label={`${b.code} seç`}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </Td>
                        )}
                        <Td>
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-black text-slate-900">
                            {b.code}
                          </span>
                        </Td>
                        <Td>
                          <div className="font-bold text-slate-900">{b.location_name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            {fullAddr && (
                              <a
                                href={`https://maps.google.com/?q=${encodeURIComponent(fullAddr)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-emerald-700 hover:underline"
                                title="Google Haritalarda Aç"
                              >
                                📍 {fullAddr}
                              </a>
                            )}
                            {b.contact_name ? `· ${b.contact_name}` : ''}
                            {b.contact_phone ? `(${b.contact_phone})` : ''}
                          </div>
                        </Td>
                        <Td>
                          <div className="text-xs font-bold text-slate-800">{b.region_name || '—'}</div>
                          <div className="text-[11px] text-slate-500">
                            {b.responsible_user_id ? staffMap.get(b.responsible_user_id) || '—' : 'Sorumlu atanmadı'}
                            {b.campaign_id && campaignMap.get(b.campaign_id) ? ` · ${campaignMap.get(b.campaign_id)}` : ''}
                          </div>
                        </Td>
                        <Td>
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[b.status]}`}>
                            {STATUS[b.status]}
                          </span>
                        </Td>
                        <Td>
                          {b.last_collected_at ? (
                            <span className={`text-xs font-semibold ${isStale ? 'font-bold text-rose-600' : 'text-slate-700'}`}>
                              {new Date(b.last_collected_at).toLocaleDateString('tr-TR')}
                              <span className="ml-1 text-[11px] opacity-80">({b.days_since_collection} gün önce)</span>
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">Hiç boşaltılmadı</span>
                          )}
                        </Td>
                        <Td className="text-right">
                          <div className="font-black text-slate-900 tabular-nums">{formatMoney(b.total_collected_cents)}</div>
                          <div className="text-[11px] font-medium text-slate-400">{b.collection_count} boşaltma</div>
                        </Td>
                        <Td className="whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {(() => {
                              const wa = whatsappUrl(
                                b.contact_phone,
                                `Merhaba${b.contact_name ? ` ${b.contact_name}` : ''}, ${b.location_name} (${b.code}) kumbarası hakkında iletişime geçiyoruz.`,
                              )
                              return wa ? (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="WhatsApp ile mesaj gönder"
                                  className="inline-flex rounded-lg p-1.5 hover:bg-slate-100"
                                >
                                  <WhatsAppIcon className="h-4 w-4" />
                                </a>
                              ) : null
                            })()}
                            {canEdit && b.status === 'active' && (
                              <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                                onClick={() => setCollecting(b)}
                              >
                                Boşalt
                              </button>
                            )}
                            <button
                              type="button"
                              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              onClick={() => showHistory(b)}
                            >
                              Geçmiş
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                onClick={() => open(b)}
                              >
                                Düzenle
                              </button>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                  {boxes.length === 0 && (
                    <Tr>
                      <Td colSpan={canEdit ? 8 : 7} className="py-12 text-center text-slate-400">
                        Seçili filtrelere uygun kumbara bulunamadı.
                      </Td>
                    </Tr>
                  )}
                </TBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {tab === 'performance' && report && (
        <div className="grid gap-4 md:grid-cols-2">
          {([
            ['Bölgelere Göre Kumbara Tahsilatı (Bu Yıl)', report.by_region],
            ['Personele Göre Kumbara Tahsilatı (Bu Yıl)', report.by_staff],
          ] as const).map(([title, rows]) => (
            <Card key={title} className="rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-700">{title}</h2>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">Henüz veri yok.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const pct = report.total_cents > 0 ? Math.min(100, Math.round((r.total_cents / report.total_cents) * 100)) : 0
                    return (
                      <li key={r.label} className="space-y-1.5 py-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-bold text-slate-800">
                            {r.label} <span className="text-xs font-normal text-slate-400">({r.count} işlem)</span>
                          </span>
                          <strong className="font-black text-emerald-700 tabular-nums">{formatMoney(r.total_cents)}</strong>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, pct)}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {report && (
        <MuhasebeStatModal
          isOpen={statModal !== null}
          onClose={() => setStatModal(null)}
          title={
            statModal === 'total'
              ? 'En Yüksek Tahsilatlı Kumbaralar'
              : statModal === 'active'
                ? 'Aktif Kumbaralar'
                : statModal === 'collections'
                  ? 'Bölge Bazlı Boşaltma Özeti'
                  : '90+ Gündür Boşaltılmayan Kumbaralar'
          }
          items={
            statModal === 'total'
              ? [...boxes]
                  .sort((a, b) => b.total_collected_cents - a.total_collected_cents)
                  .slice(0, 25)
                  .map((b) => ({
                    label: `${b.code} · ${b.location_name}`,
                    value: formatMoney(b.total_collected_cents),
                    sub: `${b.region_name || 'Bölgesiz'} · ${b.collection_count} boşaltma`,
                    color: 'emerald',
                  }))
              : statModal === 'active'
                ? boxes
                    .filter((b) => b.status === 'active')
                    .map((b) => ({
                      label: `${b.code} · ${b.location_name}`,
                      value: formatMoney(b.total_collected_cents),
                      sub: b.region_name || '—',
                      color: 'blue',
                    }))
                : statModal === 'collections'
                  ? report.by_region.map((r) => ({
                      label: r.label,
                      value: `${r.count} Boşaltma · ${formatMoney(r.total_cents)}`,
                      percent: report.total_cents > 0 ? Math.round((r.total_cents / report.total_cents) * 100) : 0,
                      color: 'emerald',
                    }))
                  : boxes
                      .filter(
                        (b) =>
                          b.status === 'active' &&
                          (!b.last_collected_at || Date.now() - new Date(b.last_collected_at).getTime() > 90 * 86400000),
                      )
                      .map((b) => ({
                        label: `${b.code} · ${b.location_name}`,
                        value: b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : 'Hiç boşaltılmadı',
                        sub: [b.region_name, b.contact_phone].filter(Boolean).join(' · '),
                        color: 'rose',
                      }))
          }
        />
      )}

      {showForm && (
        <Modal
          title={editing ? `${editing.code} · Kumbarayı Düzenle` : 'Yeni Kumbara Ekle'}
          description="Kumbara kodu boş bırakılırsa KMB-0001 formatında otomatik numaralandırılır."
          size="lg"
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={save} className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {!editing && (
              <Label label="Kumbara Kodu">
                <Input placeholder="Boş bırakılırsa otomatik verilir" value={form.code} onChange={(e) => set('code', e.target.value)} />
              </Label>
            )}
            <div className="sm:col-span-2">
              <Label label="Yer (Dükkan / Cami / Kurum)">
                <Input required value={form.location_name} onChange={(e) => set('location_name', e.target.value)} />
              </Label>
            </div>
            <Label label="Saha Bölgesi">
              <select className={inputClass} value={form.region_id} onChange={(e) => set('region_id', e.target.value)}>
                <option value="">—</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Label>
            <div className="sm:col-span-2">
              <Label label="Açık Adres">
                <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Label>
            </div>
            <Label label="İlçe">
              <Input value={form.district} onChange={(e) => set('district', e.target.value)} />
            </Label>
            <Label label="Şehir">
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Label>
            <Label label="Yetkili Kişi">
              <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            </Label>
            <Label label="Yetkili Telefonu">
              <Input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
            </Label>
            <Label label="Sorumlu Personel">
              <select className={inputClass} value={form.responsible_user_id} onChange={(e) => set('responsible_user_id', e.target.value)}>
                <option value="">—</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </Label>
            <Label label="Toplananın Aktarılacağı Bağış Kalemi">
              <select className={inputClass} value={form.campaign_id} onChange={(e) => set('campaign_id', e.target.value)}>
                <option value="">—</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <Label label="Durum">
              <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            <Label label="Yerleştirme Tarihi">
              <Input type="date" value={form.placed_at} onChange={(e) => set('placed_at', e.target.value)} />
            </Label>
            <div className="sm:col-span-2">
              <Label label="Not">
                <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </Label>
            </div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2 lg:col-span-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Vazgeç</Button>
              <Button type="submit">{editing ? 'Kaydet' : 'Ekle'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {collecting && (
        <Modal
          title="Kumbara Boşalt"
          description={`${collecting.code} — ${collecting.location_name}`}
          size="sm"
          onClose={() => setCollecting(null)}
        >
          <form onSubmit={collect} className="space-y-4">
            <Label label="Çıkan Tutar (₺)">
              <Input required inputMode="decimal" value={collection.amount} onChange={(e) => setCollection({ ...collection, amount: e.target.value })} />
            </Label>
            <Label label="Boşaltma Tarihi">
              <Input type="date" value={collection.date} onChange={(e) => setCollection({ ...collection, date: e.target.value })} />
            </Label>
            <Label label="Not">
              <Input value={collection.notes} onChange={(e) => setCollection({ ...collection, notes: e.target.value })} />
            </Label>
            {!collecting.campaign_id && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                Bu kumbaranın aktarılacağı bağış kalemi seçili değil. Önce kumbarayı düzenleyip bağış kalemi seçin.
                <button
                  type="button"
                  onClick={() => {
                    const box = collecting
                    setCollecting(null)
                    open(box)
                  }}
                  className="ml-1.5 font-bold underline"
                >
                  Şimdi düzenle
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCollecting(null)}>Vazgeç</Button>
              <Button type="submit" disabled={!collecting.campaign_id}>Kaydet</Button>
            </div>
          </form>
        </Modal>
      )}

      {history && (
        <Modal
          title={`${history.box.code} · Boşaltma Geçmişi`}
          description={history.box.location_name}
          size="md"
          onClose={() => setHistory(null)}
        >
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
            {history.rows.map((c) => (
              <li key={c.id} className={`flex items-center justify-between py-2.5 ${c.cancelled ? 'line-through opacity-50' : ''}`}>
                <span>
                  {new Date(c.collected_at).toLocaleDateString('tr-TR')} · {c.collected_by} ·{' '}
                  {c.receipt_number ? (
                    <Link
                      href={`/admin/bagislar?q=${encodeURIComponent(c.receipt_number)}`}
                      className="font-mono text-xs font-bold text-emerald-700 hover:underline"
                    >
                      {c.receipt_number}
                    </Link>
                  ) : null}
                </span>
                <strong className="font-black text-emerald-700 tabular-nums">{formatMoney(c.amount_cents, c.currency)}</strong>
              </li>
            ))}
            {history.rows.length === 0 && <li className="py-8 text-center text-xs text-slate-400">Henüz boşaltılmadı.</li>}
          </ul>
        </Modal>
      )}

      {showRegionModal && (
        <Modal
          title="Saha Bölgeleri"
          description="Mevcut bölgeleri düzenleyebilir veya yeni saha bölgesi ekleyebilirsiniz."
          size="md"
          onClose={() => {
            setShowRegionModal(false)
            setEditingRegion(null)
            setRegionForm({ name: '', description: '' })
          }}
        >
          <div className="space-y-4">
            {regions.length > 0 && (
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 text-xs">
                {regions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{r.name}</div>
                      {r.description && <div className="truncate text-[11px] text-slate-500">{r.description}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRegion(r)
                        setRegionForm({ name: r.name, description: r.description || '' })
                      }}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
                    >
                      Düzenle
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={saveRegion} className="space-y-3 border-t border-slate-100 pt-3">
              <div className="text-xs font-bold text-slate-700">
                {editingRegion ? `Düzenleniyor: ${editingRegion.name}` : 'Yeni Saha Bölgesi Ekle'}
              </div>
              <Label label="Bölge Adı">
                <Input required value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} placeholder="ör. Fatih / Merkez" />
              </Label>
              <Label label="Açıklama (isteğe bağlı)">
                <Input value={regionForm.description} onChange={(e) => setRegionForm({ ...regionForm, description: e.target.value })} />
              </Label>
              <div className="flex justify-end gap-2 pt-1">
                {editingRegion && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingRegion(null)
                      setRegionForm({ name: '', description: '' })
                    }}
                  >
                    Yeni Ekleme Modu
                  </Button>
                )}
                <Button type="submit">{editingRegion ? 'Bölgeyi Güncelle' : 'Bölge Ekle'}</Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  )
}
