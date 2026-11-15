'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Copy, Droplets, ExternalLink, Images, MapPin, Plus, RefreshCw, Users, Wallet } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, formatMoney, useAdminAccess, can } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { DonorPicker, type PickedDonor } from '../../../../components/admin/DonorPicker'
import { ExportButtons, Modal, Tabs, confirmDialog, toast } from '../../../../components/admin/ui'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, ResponsiveDataToolbar } from '../../../../components/admin/muhasebe/OnMuhasebeUI'

interface Well {
  id: string
  name: string
  location_name: string
  country: string | null
  latitude: number | null
  longitude: number | null
  status: 'planned' | 'funding' | 'drilling' | 'completed'
  description: string | null
  funding_model: 'standard' | 'fonlama' | 'hisseli'
  target_cents: number
  collected_cents: number
  progress_pct: number | null
  share_count: number | null
  share_price_cents: number | null
  shares_sold: number
  shares_left: number | null
  active_pledges: number
  donor_id: string | null
  gallery_urls: string[]
  donation_campaign_id: string | null
  donation_campaign_slug: string | null
}

const STATUS: Record<Well['status'], string> = {
  planned: 'Planlandı',
  funding: 'Fon Toplanıyor',
  drilling: 'Sondaj / İnşaat',
  completed: 'Tamamlandı (Açıldı)',
}

const NEXT_STAGE: Partial<Record<Well['status'], { next: Well['status']; label: string }>> = {
  planned: { next: 'funding', label: 'Fonlamaya Al' },
  funding: { next: 'drilling', label: 'Sondaja Al' },
  drilling: { next: 'completed', label: 'Açıldı İşaretle' },
}

const STATUS_STYLE: Record<Well['status'], string> = {
  planned: 'border-slate-200 bg-slate-100 text-slate-700',
  funding: 'border-sky-200 bg-sky-50 text-sky-800',
  drilling: 'border-amber-200 bg-amber-50 text-amber-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

const MODELS: Record<Well['funding_model'], string> = {
  standard: 'Standart Bağış',
  fonlama: 'Fonlama (Hedefli)',
  hisseli: 'Hisseli Kuyu',
}

const empty = {
  name: '', location_name: '', country: '', latitude: '', longitude: '', status: 'funding' as Well['status'], description: '',
  funding_model: 'fonlama' as Well['funding_model'], target: '', share_count: '', share_price: '', gallery: '', create_donation_campaign: true,
}

export default function WellsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'operations.manage')
  const [wells, setWells] = useState<Well[]>([])
  const [statusFilter, setStatusFilter] = useState<'' | Well['status']>('')
  const [countryFilter, setCountryFilter] = useState('')
  const [modelFilter, setModelFilter] = useState<'' | Well['funding_model']>('')
  const [showFilters, setShowFilters] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Well | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [owner, setOwner] = useState<PickedDonor | null>(null)
  const [clearOwner, setClearOwner] = useState(false)
  const [statModal, setStatModal] = useState<'total' | 'active' | 'completed' | 'collected' | null>(null)
  const [galleryWell, setGalleryWell] = useState<Well | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [shares, setShares] = useState<{
    well: Well
    rows: { id: string; share_count: number; donor_name: string; on_behalf_of: string | null; receipt_number: string | null; created_at: string | null }[]
  } | null>(null)

  const load = async () => {
    try {
      setWells((await adminGet<Well[]>('/water-wells')).data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kuyular yüklenemedi'))
    }
  }
  useEffect(() => { load() }, [])

  const refreshAll = async () => {
    setRefreshing(true)
    try {
      await load()
      toast.ok('Su kuyuları yenilendi.')
    } finally {
      setRefreshing(false)
    }
  }

  const countries = useMemo(
    () => Array.from(new Set(wells.map((w) => w.country).filter((c): c is string => Boolean(c)))).sort(),
    [wells],
  )

  const filteredWells = useMemo(() => {
    const q = query.trim().toLowerCase()
    return wells.filter((w) => {
      if (statusFilter && w.status !== statusFilter) return false
      if (countryFilter && w.country !== countryFilter) return false
      if (modelFilter && w.funding_model !== modelFilter) return false
      if (q && !`${w.name} ${w.location_name} ${w.country || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [wells, statusFilter, countryFilter, modelFilter, query])

  const kpi = useMemo(() => {
    return wells.reduce(
      (acc, w) => ({
        total: acc.total + 1,
        completed: acc.completed + (w.status === 'completed' ? 1 : 0),
        active: acc.active + (w.status === 'funding' || w.status === 'drilling' || w.status === 'planned' ? 1 : 0),
        collectedCents: acc.collectedCents + w.collected_cents,
        targetCents: acc.targetCents + w.target_cents,
      }),
      { total: 0, completed: 0, active: 0, collectedCents: 0, targetCents: 0 },
    )
  }, [wells])

  const open = (w: Well | null) => {
    setEditing(w)
    setShowForm(true)
    setOwner(null)
    setClearOwner(false)
    setForm(w ? {
      name: w.name, location_name: w.location_name, country: w.country || '',
      latitude: w.latitude?.toString() || '', longitude: w.longitude?.toString() || '', status: w.status,
      description: w.description || '', funding_model: w.funding_model, target: w.target_cents ? String(w.target_cents / 100) : '',
      share_count: w.share_count?.toString() || '', share_price: w.share_price_cents ? String(w.share_price_cents / 100) : '',
      gallery: w.gallery_urls.join('\n'), create_donation_campaign: !w.donation_campaign_id,
    } : empty)
  }

  const money = (v: string) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : 0)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextDonorId = owner ? owner.id : clearOwner ? null : editing?.donor_id || null
    const body = {
      name: form.name, location_name: form.location_name, country: form.country || null,
      latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null,
      status: form.status, description: form.description || null, funding_model: form.funding_model,
      target_cents: money(form.target), share_count: form.share_count ? Number(form.share_count) : null,
      share_price_cents: form.share_price ? money(form.share_price) : null,
      gallery_urls: form.gallery.split('\n').map((s) => s.trim()).filter(Boolean),
      donor_id: nextDonorId, create_donation_campaign: form.create_donation_campaign,
    }
    try {
      if (editing) await adminSend('put', `/water-wells/${editing.id}`, body)
      else await adminSend('post', '/water-wells', body)
      setShowForm(false)
      toast.ok('Su kuyusu kaydedildi.')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const advanceStage = async (w: Well) => {
    const info = NEXT_STAGE[w.status]
    if (!info) return
    if (!(await confirmDialog(`${w.name} kuyusu "${STATUS[info.next]}" aşamasına geçirilsin mi?`))) return
    setBusyId(w.id)
    try {
      await adminSend('put', `/water-wells/${w.id}`, {
        name: w.name,
        location_name: w.location_name,
        country: w.country,
        latitude: w.latitude,
        longitude: w.longitude,
        status: info.next,
        description: w.description,
        funding_model: w.funding_model,
        target_cents: w.target_cents,
        share_count: w.share_count,
        share_price_cents: w.share_price_cents,
        donor_id: w.donor_id,
        gallery_urls: w.gallery_urls,
        donation_campaign_id: w.donation_campaign_id,
      })
      toast.ok(`${w.name} → ${STATUS[info.next]} olarak güncellendi.`)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const copyCampaignUrl = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/kampanyalar/${slug}`)
      toast.ok('Bağış sayfası bağlantısı kopyalandı.')
    } catch {
      toast.error('Bağlantı kopyalanamadı.')
    }
  }

  const showShares = async (w: Well) => {
    try {
      setShares({ well: w, rows: (await adminGet<NonNullable<typeof shares>['rows']>(`/water-wells/${w.id}/shares`)).data })
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const activeFilterCount = [countryFilter, modelFilter].filter(Boolean).length
  const clearFilters = () => {
    setStatusFilter('')
    setCountryFilter('')
    setModelFilter('')
    setQuery('')
  }

  return (
    <div className="space-y-5">
      <AppPageHeader
        eyebrow="SAHA & ORGANİZASYON"
        title="Su Kuyuları Yönetimi"
        meta="Kuyuya bağlı bağış kalemine gelen bağışlar fonlamayı ve hisseleri otomatik günceller. Taksitli su kuyusu taahhütleri Sponsorluk & Burs ekranından da takip edilir."
        icon={<Droplets className="h-6 w-6" />}
        chips={
          <>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              💧 {kpi.completed} Açılan Kuyu
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              🔨 {kpi.active} İnşaat / Fonlama
            </span>
            {countries.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                🌍 {countries.length} Ülke
              </span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={refreshing} className="h-10 rounded-xl px-3 text-xs font-bold">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {canEdit && (
              <button
                type="button"
                onClick={() => open(null)}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Yeni Su Kuyusu
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlobalStatCard
          id="total"
          title="TOPLAM SU KUYUSU"
          value={`${kpi.total} Kuyu`}
          subtitle={`${countries.length || 1} farklı ülkede su kuyusu projesi`}
          icon={<Droplets className="h-4 w-4" />}
          gradient="from-sky-500 to-blue-700"
          onClick={() => setStatModal('total')}
        />
        <GlobalStatCard
          id="active"
          title="FONLANAN & SONDAJDA"
          value={`${kpi.active} Kuyu`}
          subtitle="Fon toplama veya sondaj aşamasında"
          icon={<Users className="h-4 w-4" />}
          gradient="from-amber-500 to-orange-600"
          onClick={() => setStatModal('active')}
        />
        <GlobalStatCard
          id="completed"
          title="AÇILAN / TAMAMLANAN"
          value={`${kpi.completed} Kuyu`}
          subtitle="İnşaatı tamamlanıp hizmete açılanlar"
          icon={<CheckCircle2 className="h-4 w-4" />}
          gradient="from-emerald-600 to-teal-700"
          onClick={() => setStatModal('completed')}
        />
        <GlobalStatCard
          id="collected"
          title="TOPLANAN SU KUYUSU BAĞIŞI"
          value={formatMoney(kpi.collectedCents)}
          subtitle={kpi.targetCents > 0 ? `Hedef toplam: ${formatMoney(kpi.targetCents)}` : 'Tüm kuyulara gelen toplam bağış'}
          icon={<Wallet className="h-4 w-4" />}
          gradient="from-violet-600 to-indigo-700"
          onClick={() => setStatModal('collected')}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={statusFilter}
          onChange={(k) => setStatusFilter(k)}
          tabs={[
            { key: '', label: 'Tüm Kuyular', count: wells.length, icon: Droplets },
            { key: 'funding', label: 'Fon Toplanıyor', count: wells.filter((w) => w.status === 'funding').length },
            { key: 'drilling', label: 'Sondaj / İnşaat', count: wells.filter((w) => w.status === 'drilling').length },
            { key: 'completed', label: 'Açılan Kuyular', count: wells.filter((w) => w.status === 'completed').length, icon: CheckCircle2 },
            { key: 'planned', label: 'Planlanan', count: wells.filter((w) => w.status === 'planned').length },
          ]}
        />
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <ResponsiveDataToolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: 'Kuyu adı, bölge, konum veya ülke ara...',
          }}
          filter={{
            activeCount: activeFilterCount,
            onOpen: () => setShowFilters((v) => !v),
            label: 'Gelişmiş Filtreler',
            showOnDesktop: true,
          }}
          extraActions={
            <div className="flex flex-wrap items-center gap-2">
              {(activeFilterCount > 0 || statusFilter || query) && (
                <button type="button" onClick={clearFilters} className="text-xs font-bold text-rose-600 hover:text-rose-700">
                  Filtreleri Temizle
                </button>
              )}
              <ExportButtons
                filename="su-kuyulari"
                title="Su Kuyuları Listesi"
                subtitle={`${filteredWells.length} kuyu`}
                currencyCols={[5, 6]}
                summary={[
                  ['Toplam Kuyu', String(kpi.total)],
                  ['Açılan Kuyu', String(kpi.completed)],
                  ['Devam Eden', String(kpi.active)],
                  ['Toplanan Bağış', formatMoney(kpi.collectedCents)],
                ]}
                getData={() => ({
                  headers: ['Kuyu Adı', 'Ülke', 'Konum', 'Durum', 'Model', 'Hedef (TL)', 'Toplanan (TL)', 'Hisse', 'Satılan Hisse'],
                  rows: filteredWells.map((w) => [
                    w.name,
                    w.country,
                    w.location_name,
                    STATUS[w.status],
                    MODELS[w.funding_model],
                    w.target_cents / 100,
                    w.collected_cents / 100,
                    w.share_count ?? '',
                    w.shares_sold,
                  ]),
                })}
              />
            </div>
          }
        />

        {showFilters && (
          <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-2">
            <Label label="Ülke">
              <select className={inputClass} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
                <option value="">Tüm ülkeler</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Label>
            <Label label="Fonlama Modeli">
              <select className={inputClass} value={modelFilter} onChange={(e) => setModelFilter(e.target.value as typeof modelFilter)}>
                <option value="">Tüm modeller</option>
                {Object.entries(MODELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredWells.map((w) => {
          const stageIndex = ['planned', 'funding', 'drilling', 'completed'].indexOf(w.status)
          const nextStage = NEXT_STAGE[w.status]
          return (
            <div
              key={w.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs transition-all hover:shadow-md"
            >
              <div>
                {w.gallery_urls[0] && (
                  <button
                    type="button"
                    onClick={() => setGalleryWell(w)}
                    className="group relative block h-44 w-full cursor-pointer overflow-hidden bg-slate-100 text-left"
                  >
                    <img src={w.gallery_urls[0]} alt={w.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    {w.gallery_urls.length > 1 && (
                      <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-xs">
                        <Images className="h-3.5 w-3.5" />
                        {w.gallery_urls.length} Fotoğraf
                      </span>
                    )}
                  </button>
                )}
                <div className="space-y-3.5 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-black text-slate-900">{w.name}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{[w.location_name, w.country].filter(Boolean).join(', ')}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[w.status]}`}>
                      {STATUS[w.status]}
                    </span>
                  </div>

                  {/* 4-Step Visual Stage Bar */}
                  <div className="grid grid-cols-4 gap-1 pt-0.5">
                    {(['Plan', 'Fonlama', 'Sondaj', 'Açıldı'] as const).map((step, idx) => (
                      <div key={step} className="space-y-1">
                        <div
                          className={`h-1.5 rounded-full ${
                            idx <= stageIndex
                              ? w.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-sky-500'
                              : 'bg-slate-100'
                          }`}
                        />
                        <p className={`text-center text-[10px] font-bold ${idx <= stageIndex ? 'text-slate-700' : 'text-slate-400'}`}>
                          {step}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5">{MODELS[w.funding_model]}</span>
                    {w.active_pledges > 0 && (
                      <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-blue-700">{w.active_pledges} taksitli taahhüt</span>
                    )}
                  </div>

                  {w.target_cents > 0 && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-emerald-700 tabular-nums">{formatMoney(w.collected_cents)}</span>
                        <span className="text-slate-500 tabular-nums">
                          Hedef: {formatMoney(w.target_cents)} · %{w.progress_pct ?? 0}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, w.progress_pct || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {w.funding_model === 'hisseli' && (
                    <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs font-semibold text-sky-900">
                      <span>
                        <strong>{w.shares_sold}</strong> / {w.share_count} hisse satıldı
                      </span>
                      <span className="font-bold tabular-nums">{formatMoney(w.share_price_cents || 0)} / hisse</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => open(w)}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Düzenle
                  </button>
                )}
                {canEdit && nextStage && (
                  <button
                    type="button"
                    disabled={busyId === w.id}
                    onClick={() => advanceStage(w)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    {nextStage.label}
                  </button>
                )}
                {w.funding_model === 'hisseli' && (
                  <button
                    type="button"
                    onClick={() => showShares(w)}
                    className="cursor-pointer rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100"
                  >
                    Hissedarlar ({w.shares_sold})
                  </button>
                )}
                {w.latitude !== null && w.longitude !== null && (
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    href={`https://maps.google.com/?q=${w.latitude},${w.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    📍 Harita ↗
                  </a>
                )}
                {w.donation_campaign_slug && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyCampaignUrl(w.donation_campaign_slug!)}
                      title="Bağış sayfası linkini kopyala"
                      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-emerald-700"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                      href={`/kampanyalar/${w.donation_campaign_slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Bağış Sayfası <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {filteredWells.length === 0 && (
          <Card className="border border-slate-200/80 p-12 text-center shadow-xs md:col-span-2 xl:col-span-3">
            <Droplets className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-700">
              {wells.length === 0 ? 'Henüz su kuyusu kaydı bulunmuyor' : 'Filtreye uygun su kuyusu bulunamadı'}
            </p>
          </Card>
        )}
      </div>

      <MuhasebeStatModal
        isOpen={statModal !== null}
        onClose={() => setStatModal(null)}
        title={
          statModal === 'total'
            ? 'Tüm Su Kuyuları'
            : statModal === 'active'
              ? 'Fonlanan ve Sondajdaki Su Kuyuları'
              : statModal === 'completed'
                ? 'Açılan / Tamamlanan Su Kuyuları'
                : 'Kuyu Bazlı Bağış Dökümü'
        }
        items={
          (statModal === 'active'
            ? wells.filter((w) => w.status !== 'completed')
            : statModal === 'completed'
              ? wells.filter((w) => w.status === 'completed')
              : wells
          ).map((w) => ({
            label: `${w.name} (${[w.location_name, w.country].filter(Boolean).join(', ')})`,
            value: `${formatMoney(w.collected_cents)} · ${STATUS[w.status]}`,
            sub: w.target_cents > 0 ? `Hedef: ${formatMoney(w.target_cents)} (%${w.progress_pct ?? 0})` : MODELS[w.funding_model],
            percent: w.progress_pct ?? undefined,
            color: w.status === 'completed' ? 'emerald' : 'blue',
          }))
        }
      />

      {galleryWell && (
        <Modal
          title={`${galleryWell.name} · Fotoğraf Galerisi`}
          description={[galleryWell.location_name, galleryWell.country].filter(Boolean).join(', ') || undefined}
          size="lg"
          onClose={() => setGalleryWell(null)}
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {galleryWell.gallery_urls.map((url, idx) => (
                <a key={`${url}-${idx}`} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={url} alt={`${galleryWell.name} ${idx + 1}`} className="h-52 w-full object-cover transition hover:scale-105" />
                </a>
              ))}
            </div>
            {galleryWell.description && (
              <p className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 whitespace-pre-wrap">
                {galleryWell.description}
              </p>
            )}
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal
          title={editing ? `${editing.name} · Kuyuyu Düzenle` : 'Yeni Su Kuyusu Oluştur'}
          description="Kuyuya bağlı web bağış kalemi oluşturarak gelen bağışların otomatik kuyu fonuna işlenmesini sağlayabilirsiniz."
          size="lg"
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={save} className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <Label label="Kuyu Adı">
                <Input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Hz. Ömer Su Kuyusu" />
              </Label>
            </div>
            <Label label="Ülke">
              <Input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Nijer" />
            </Label>
            <Label label="Konum / Bölge">
              <Input required value={form.location_name} onChange={(e) => set('location_name', e.target.value)} placeholder="Niamey, Tillabéri" />
            </Label>
            <Label label="Fonlama Modeli">
              <select className={inputClass} value={form.funding_model} onChange={(e) => set('funding_model', e.target.value as Well['funding_model'])}>
                {Object.entries(MODELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            {form.funding_model === 'hisseli' ? (
              <>
                <Label label="Hisse Sayısı">
                  <Input required type="number" min={1} value={form.share_count} onChange={(e) => set('share_count', e.target.value)} />
                </Label>
                <Label label="Hisse Bedeli (₺)">
                  <Input required inputMode="decimal" value={form.share_price} onChange={(e) => set('share_price', e.target.value)} />
                </Label>
              </>
            ) : (
              <Label label="Hedef Tutar (₺)">
                <Input required={form.funding_model === 'fonlama'} inputMode="decimal" value={form.target} onChange={(e) => set('target', e.target.value)} />
              </Label>
            )}
            <Label label="İnşaat / Proje Aşaması">
              <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as Well['status'])}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            <Label label="Enlem (GPS)">
              <Input inputMode="decimal" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />
            </Label>
            <Label label="Boylam (GPS)">
              <Input inputMode="decimal" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />
            </Label>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <DonorPicker value={owner} onChange={(d) => { setOwner(d); if (d) setClearOwner(false) }} label="Tek Bağışçılı Kuyu Sahibi (isteğe bağlı)" />
              {editing?.donor_id && !owner && !clearOwner && (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <span>Mevcut bir kuyu sahibi kayıtlı.</span>
                  <button type="button" onClick={() => setClearOwner(true)} className="font-bold text-rose-600 hover:underline">Sahibi Kaldır</button>
                </div>
              )}
              {clearOwner && (
                <div className="text-xs font-bold text-amber-700">Kaydedildiğinde mevcut kuyu sahibi kaldırılacak.</div>
              )}
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label label="Açıklama">
                <textarea className={`${inputClass} min-h-[72px] py-2`} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Label>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label label="Fotoğraflar (her satıra bir URL)">
                <textarea className={`${inputClass} min-h-[72px] py-2`} rows={2} value={form.gallery} onChange={(e) => set('gallery', e.target.value)} />
              </Label>
            </div>
            {(!editing || !editing.donation_campaign_id) && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">
                <input type="checkbox" checked={form.create_donation_campaign} onChange={(e) => set('create_donation_campaign', e.target.checked)} />
                Web sitesinde bu kuyu için bağış kalemi oluştur
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2 lg:col-span-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Vazgeç</Button>
              <Button type="submit">{editing ? 'Kaydet' : 'Oluştur'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {shares && (
        <Modal
          title={`${shares.well.name} — Hissedarlar`}
          description={`${shares.well.shares_sold} / ${shares.well.share_count} hisse satıldı`}
          size="md"
          onClose={() => setShares(null)}
        >
          {shares.rows.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Henüz hisse satışı yok.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
              {shares.rows.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-bold text-slate-900">{s.on_behalf_of || s.donor_name}</div>
                    <div className="text-xs text-slate-500">
                      {s.on_behalf_of && s.donor_name ? `Bağışçı: ${s.donor_name} · ` : ''}
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('tr-TR') : ''}
                      {s.receipt_number && (
                        <>
                          {' · '}
                          <Link href={`/admin/bagislar?q=${encodeURIComponent(s.receipt_number)}`} className="font-bold text-emerald-700 hover:underline">
                            Makbuz {s.receipt_number}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700">{s.share_count} hisse</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}
