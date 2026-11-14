'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Megaphone,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import {
  ExportButtons,
  FilterBar,
  Modal,
  PageHeader,
  Pagination,
  StatCard,
  Tabs,
  toast,
} from '../../../../components/admin/ui'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'
import {
  adminSend,
  apiErrorMessage,
  formatMoney,
  v1Get,
  v1Send,
} from '../../../../lib/admin-access'

const CATEGORIES = [
  ['genel', 'Genel'],
  ['egitim', 'Eğitim'],
  ['saglik', 'Sağlık'],
  ['gida', 'Gıda'],
  ['su', 'Su'],
  ['yetim', 'Yetim'],
  ['kurban', 'Kurban'],
  ['insaat', 'İnşaat'],
  ['zekat', 'Zekât'],
  ['fitre', 'Fitre'],
  ['fidye', 'Fidye'],
  ['sadaka', 'Sadaka'],
  ['adak', 'Adak'],
  ['akika', 'Akika'],
] as const

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  draft: { label: 'Taslak', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  active: { label: 'Yayında', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused: { label: 'Duraklatıldı', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Tamamlandı', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' },
  cancelled: { label: 'İptal', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
}

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES) as Record<string, string>

interface Campaign {
  id: string
  title: string
  slug: string
  summary: string
  story?: string | null
  category: string
  status: string
  target_cents: number
  collected_cents: number
  currency: string
  cover_image_url?: string | null
  gallery_urls?: string[]
  video_url?: string | null
  suggested_amounts_cents?: number[]
  allow_custom_amount?: boolean
  min_donation_cents?: number
  is_featured?: boolean
  display_order?: number
  show_collected?: boolean
  show_donor_list?: boolean
  translations?: Translations
  progress_percentage?: number
}

interface CampaignListResponse {
  items: Campaign[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const PAGE_SIZE = 25

function parseSuggestedAmounts(text: string): number[] {
  return text
    .split(',')
    .map((s) => Number(s.trim().replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n * 100))
}

function formatSuggestedAmounts(cents?: number[]): string {
  if (!cents || cents.length === 0) return ''
  return cents.map((c) => String(c / 100)).join(', ')
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [selected, setSelected] = useState<Campaign | null>(null)
  const [drawerTab, setDrawerTab] = useState<'general' | 'media' | 'i18n'>('general')

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    slug: '',
    summary: '',
    category: 'genel',
    status: 'draft',
    target: '50000',
    currency: 'TRY',
    cover_image_url: '',
    is_featured: false,
  })

  // Edit form state (synced when selected changes)
  const [editForm, setEditForm] = useState({
    title: '',
    summary: '',
    story: '',
    category: 'genel',
    status: 'draft',
    currency: 'TRY',
    target: '0',
    min_donation: '10',
    suggested_amounts: '',
    display_order: '0',
    cover_image_url: '',
    is_featured: false,
    allow_custom_amount: true,
    show_collected: true,
    show_donor_list: true,
  })
  const [savingGeneral, setSavingGeneral] = useState(false)

  // Media tab state
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [pendingGalleryUrl, setPendingGalleryUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [savingMedia, setSavingMedia] = useState(false)

  // Translations tab state
  const [translations, setTranslations] = useState<Translations>({})
  const [savingI18n, setSavingI18n] = useState(false)

  const loadCampaigns = useCallback(async (targetPage = page, q = search, st = statusFilter, cat = categoryFilter) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: targetPage, page_size: PAGE_SIZE }
      if (q.trim()) params.search = q.trim()
      if (st !== 'all') params.status = st
      if (cat !== 'all') params.category = cat

      const res = await v1Get<CampaignListResponse>('/campaigns', params)
      const items = res.data?.items || []
      setCampaigns(items)
      setTotal(res.data?.total || items.length)
      setTotalPages(Math.max(1, res.data?.total_pages || 1))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanyalar yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, categoryFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCampaigns(page, search, statusFilter, categoryFilter)
    }, 200)
    return () => clearTimeout(timer)
  }, [loadCampaigns, page, search, statusFilter, categoryFilter])

  const openEditor = (c: Campaign) => {
    setSelected(c)
    setDrawerTab('general')
    setEditForm({
      title: c.title || '',
      summary: c.summary || '',
      story: c.story || '',
      category: c.category || 'genel',
      status: c.status || 'draft',
      currency: c.currency || 'TRY',
      target: String((c.target_cents || 0) / 100),
      min_donation: String((c.min_donation_cents ?? 1000) / 100),
      suggested_amounts: formatSuggestedAmounts(c.suggested_amounts_cents),
      display_order: String(c.display_order ?? 0),
      cover_image_url: c.cover_image_url || '',
      is_featured: Boolean(c.is_featured),
      allow_custom_amount: c.allow_custom_amount ?? true,
      show_collected: c.show_collected ?? true,
      show_donor_list: c.show_donor_list ?? true,
    })
    setGalleryUrls(c.gallery_urls || [])
    setPendingGalleryUrl('')
    setVideoUrl(c.video_url || '')
    setTranslations(c.translations || {})
  }

  const syncUpdatedCampaign = (updated: Campaign) => {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
    setSelected((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.title.trim() || !createForm.summary.trim()) {
      toast.error('Kampanya başlığı ve özeti zorunludur.')
      return
    }
    const targetNum = Number(createForm.target.replace(',', '.'))
    if (!Number.isFinite(targetNum) || targetNum < 0) {
      toast.error('Geçerli bir hedef tutar girin.')
      return
    }

    setCreating(true)
    try {
      const res = await v1Send<Campaign>('post', '/campaigns', {
        title: createForm.title.trim(),
        slug: createForm.slug.trim() || undefined,
        summary: createForm.summary.trim(),
        category: createForm.category,
        status: createForm.status,
        target_cents: Math.round(targetNum * 100),
        currency: createForm.currency,
        cover_image_url: createForm.cover_image_url.trim() || null,
        is_featured: createForm.is_featured,
      })
      toast.ok('Yeni kampanya oluşturuldu.')
      setCreateOpen(false)
      setCreateForm({
        title: '',
        slug: '',
        summary: '',
        category: 'genel',
        status: 'draft',
        target: '50000',
        currency: 'TRY',
        cover_image_url: '',
        is_featured: false,
      })
      await loadCampaigns(1, search, statusFilter, categoryFilter)
      setPage(1)
      openEditor(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanya oluşturulamadı.'))
    } finally {
      setCreating(false)
    }
  }

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (!editForm.title.trim() || !editForm.summary.trim()) {
      toast.error('Başlık ve özet zorunludur.')
      return
    }
    const targetNum = Number(editForm.target.replace(',', '.'))
    const minNum = Number(editForm.min_donation.replace(',', '.'))
    if (!Number.isFinite(targetNum) || targetNum < 0) {
      toast.error('Geçerli bir hedef tutar girin.')
      return
    }

    setSavingGeneral(true)
    try {
      const res = await v1Send<Campaign>('patch', `/campaigns/${selected.id}`, {
        title: editForm.title.trim(),
        summary: editForm.summary.trim(),
        story: editForm.story.trim() || null,
        category: editForm.category,
        status: editForm.status,
        currency: editForm.currency,
        target_cents: Math.round(targetNum * 100),
        min_donation_cents: Math.max(100, Math.round((Number.isFinite(minNum) ? minNum : 10) * 100)),
        suggested_amounts_cents: parseSuggestedAmounts(editForm.suggested_amounts),
        display_order: Number(editForm.display_order) || 0,
        cover_image_url: editForm.cover_image_url.trim() || null,
        is_featured: editForm.is_featured,
        allow_custom_amount: editForm.allow_custom_amount,
        show_collected: editForm.show_collected,
        show_donor_list: editForm.show_donor_list,
      })
      syncUpdatedCampaign(res.data)
      toast.ok('Kampanya bilgileri kaydedildi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanya güncellenemedi.'))
    } finally {
      setSavingGeneral(false)
    }
  }

  const handleSaveMedia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setSavingMedia(true)
    try {
      await adminSend('put', `/campaigns/${selected.id}/gallery`, { gallery_urls: galleryUrls })
      const res = await v1Send<Campaign>('patch', `/campaigns/${selected.id}`, {
        video_url: videoUrl.trim() || null,
      })
      syncUpdatedCampaign({ ...res.data, gallery_urls: galleryUrls })
      toast.ok('Galeri ve medya ayarları kaydedildi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Medya ayarları kaydedilemedi.'))
    } finally {
      setSavingMedia(false)
    }
  }

  const handleSaveTranslations = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setSavingI18n(true)
    try {
      const res = await v1Send<Campaign>('patch', `/campaigns/${selected.id}`, { translations })
      syncUpdatedCampaign(res.data)
      toast.ok('Çeviriler kaydedildi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Çeviriler kaydedilemedi.'))
    } finally {
      setSavingI18n(false)
    }
  }

  const stats = useMemo(() => {
    const active = campaigns.filter((c) => c.status === 'active').length
    const featured = campaigns.filter((c) => c.is_featured).length
    const completed = campaigns.filter((c) => c.status === 'completed').length
    return { active, featured, completed }
  }, [campaigns])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kampanyalar"
        description="Bağış kampanyalarını oluşturun, hedeflerini, medya galerilerini ve çok dilli içeriklerini yönetin."
        actions={
          <div className="flex items-center gap-2">
            {campaigns.length > 0 && (
              <ExportButtons
                filename="kampanyalar"
                title="Kampanyalar"
                subtitle={`${campaigns.length} kampanya`}
                currencyCols={[4, 5]}
                getData={() => ({
                  headers: ['Kampanya', 'Slug', 'Kategori', 'Para Birimi', 'Hedef', 'Toplanan', 'Durum'],
                  rows: campaigns.map((c) => [
                    c.title,
                    c.slug,
                    CATEGORY_LABEL[c.category] || c.category || '',
                    c.currency || 'TRY',
                    c.target_cents / 100,
                    (c.collected_cents || 0) / 100,
                    STATUS_META[c.status]?.label || c.status,
                  ]),
                })}
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadCampaigns(page, search, statusFilter, categoryFilter)}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Yeni Kampanya
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Toplam Kampanya" value={String(total)} tone="neutral" icon={Megaphone} />
        <StatCard label="Yayında (Bu Sayfa)" value={String(stats.active)} tone="good" icon={CheckCircle2} />
        <StatCard label="Öne Çıkan" value={String(stats.featured)} tone="brand" icon={Star} />
        <StatCard label="Tamamlanan" value={String(stats.completed)} tone="warn" icon={PauseCircle} />
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
            placeholder="Kampanya adı ara..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1)
            setStatusFilter(e.target.value)
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">Tüm Durumlar</option>
          <option value="active">Yayında</option>
          <option value="draft">Taslak</option>
          <option value="paused">Duraklatıldı</option>
          <option value="completed">Tamamlandı</option>
          <option value="cancelled">İptal</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setPage(1)
            setCategoryFilter(e.target.value)
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">Tüm Türler</option>
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FilterBar>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className={`${selected ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3`}>
          {loading ? (
            <Card className="p-8 border border-slate-200 text-center text-sm text-slate-500 animate-pulse">
              Kampanyalar yükleniyor...
            </Card>
          ) : campaigns.length === 0 ? (
            <Card className="p-8 border border-slate-200 text-center text-sm text-slate-400">
              Kriterlere uygun kampanya bulunamadı.
            </Card>
          ) : (
            campaigns.map((c) => {
              const st = STATUS_META[c.status] || { label: c.status, badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }
              const pct = c.target_cents > 0 ? Math.min(100, Math.round(((c.collected_cents || 0) / c.target_cents) * 100)) : 0
              const isSelected = selected?.id === c.id
              return (
                <Card
                  key={c.id}
                  onClick={() => openEditor(c)}
                  className={`p-4 border cursor-pointer transition-all ${
                    isSelected ? 'border-emerald-500 bg-emerald-50/30 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-16 h-12 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {c.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.cover_image_url} alt={c.title} className="w-full h-full object-cover" />
                      ) : (
                        <Megaphone className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h3 className="font-semibold text-sm text-slate-900 truncate">{c.title}</h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.badgeClass}`}>
                            {st.label}
                          </span>
                          {c.is_featured && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                              Öne Çıkan
                            </span>
                          )}
                        </div>
                        <a
                          href={`/kampanyalar/${c.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Sitede Görüntüle"
                          className="text-[11px] font-medium text-slate-500 hover:text-emerald-700 inline-flex items-center gap-1"
                        >
                          Sitede Gör
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{CATEGORY_LABEL[c.category] || c.category}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-400">/{c.slug}</span>
                      </div>

                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-800 tabular-nums">
                            {formatMoney(c.collected_cents || 0, c.currency || 'TRY')}
                            <span className="text-slate-400 font-normal"> / {formatMoney(c.target_cents || 0, c.currency || 'TRY')}</span>
                          </span>
                          <span className="font-semibold text-emerald-700 tabular-nums">%{pct}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          )}

          {total > PAGE_SIZE && (
            <Pagination page={page} pages={totalPages} total={total} onChange={setPage} />
          )}
        </div>

        {selected && (
          <div className="lg:col-span-6">
            <Card className="p-5 border border-slate-200 bg-white space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    Kampanya Düzenleme
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 truncate mt-0.5">{selected.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Kapat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <Tabs
                value={drawerTab}
                onChange={setDrawerTab}
                tabs={[
                  { key: 'general', label: 'Genel & Hedef' },
                  { key: 'media', label: `Galeri & Video (${galleryUrls.length})` },
                  { key: 'i18n', label: 'Çeviriler' },
                ]}
              />

              {drawerTab === 'general' && (
                <form onSubmit={handleSaveGeneral} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Kampanya Başlığı *</label>
                    <Input
                      maxLength={300}
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Kısa Özet *</label>
                    <textarea
                      rows={2}
                      value={editForm.summary}
                      onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Kampanya Hikayesi / Detay</label>
                    <textarea
                      rows={4}
                      value={editForm.story}
                      onChange={(e) => setEditForm({ ...editForm, story: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <ImageField
                    label="Kapak Görseli"
                    value={editForm.cover_image_url}
                    onChange={(url) => setEditForm({ ...editForm, cover_image_url: url })}
                  />

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Durum</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                      >
                        <option value="draft">Taslak</option>
                        <option value="active">Yayında</option>
                        <option value="paused">Duraklatıldı</option>
                        <option value="completed">Tamamlandı</option>
                        <option value="cancelled">İptal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Bağış Türü</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                      >
                        {CATEGORIES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Para Birimi</label>
                      <select
                        value={editForm.currency}
                        onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Hedef Tutar</label>
                      <Input
                        inputMode="decimal"
                        value={editForm.target}
                        onChange={(e) => setEditForm({ ...editForm, target: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Min. Bağış</label>
                      <Input
                        inputMode="decimal"
                        value={editForm.min_donation}
                        onChange={(e) => setEditForm({ ...editForm, min_donation: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Sıra</label>
                      <Input
                        type="number"
                        value={editForm.display_order}
                        onChange={(e) => setEditForm({ ...editForm, display_order: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Önerilen Bağış Tutarları (virgülle ayırın)
                    </label>
                    <Input
                      value={editForm.suggested_amounts}
                      onChange={(e) => setEditForm({ ...editForm, suggested_amounts: e.target.value })}
                      placeholder="Örn: 100, 250, 500, 1000"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.is_featured}
                        onChange={(e) => setEditForm({ ...editForm, is_featured: e.target.checked })}
                        className="accent-emerald-600"
                      />
                      Öne Çıkan Kampanya
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.allow_custom_amount}
                        onChange={(e) => setEditForm({ ...editForm, allow_custom_amount: e.target.checked })}
                        className="accent-emerald-600"
                      />
                      Serbest Tutar İzni
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.show_collected}
                        onChange={(e) => setEditForm({ ...editForm, show_collected: e.target.checked })}
                        className="accent-emerald-600"
                      />
                      Toplanan Tutarı Göster
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.show_donor_list}
                        onChange={(e) => setEditForm({ ...editForm, show_donor_list: e.target.checked })}
                        className="accent-emerald-600"
                      />
                      Bağışçı Listesini Göster
                    </label>
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-100">
                    <Button type="submit" disabled={savingGeneral}>
                      {savingGeneral ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                    </Button>
                  </div>
                </form>
              )}

              {drawerTab === 'media' && (
                <form onSubmit={handleSaveMedia} className="space-y-4">
                  <div className="space-y-2">
                    <ImageField
                      label="Galeriye Görsel Seç veya Yükle"
                      value={pendingGalleryUrl}
                      onChange={setPendingGalleryUrl}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!pendingGalleryUrl.trim()}
                        onClick={() => {
                          if (!pendingGalleryUrl.trim()) return
                          setGalleryUrls((prev) => [...prev, pendingGalleryUrl.trim()])
                          setPendingGalleryUrl('')
                        }}
                      >
                        <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                        Galeriye Ekle
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">
                      Kayıtlı Galeri Görselleri ({galleryUrls.length})
                    </label>
                    {galleryUrls.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center border border-dashed rounded-lg">
                        Galeride görsel bulunmamaktadır.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                        {galleryUrls.map((url, index) => (
                          <div key={`${url}-${index}`} className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 group bg-slate-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Galeri ${index + 1}`} className="object-cover w-full h-full" />
                            <button
                              type="button"
                              onClick={() => setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
                              className="absolute top-1.5 right-1.5 p-1 rounded bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Kaldır"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Tanıtım Video URL (Opsiyonel)</label>
                    <Input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>

                  <div className="flex justify-end pt-3 border-t border-slate-100">
                    <Button type="submit" disabled={savingMedia}>
                      {savingMedia ? 'Kaydediliyor...' : 'Medyayı Kaydet'}
                    </Button>
                  </div>
                </form>
              )}

              {drawerTab === 'i18n' && (
                <form onSubmit={handleSaveTranslations} className="space-y-4">
                  <TranslationEditor
                    value={translations}
                    onChange={setTranslations}
                    fields={[
                      { key: 'title', label: 'Kampanya adı' },
                      { key: 'summary', label: 'Özet' },
                      { key: 'story', label: 'Hikaye', long: true },
                    ]}
                  />
                  <div className="flex justify-end pt-3 border-t border-slate-100">
                    <Button type="submit" disabled={savingI18n}>
                      {savingI18n ? 'Kaydediliyor...' : 'Çevirileri Kaydet'}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>
        )}
      </div>

      {createOpen && (
        <Modal
          title="Yeni Kampanya Oluştur"
          description="Temel bilgileri girin; ardından galeri ve çevirileri düzenleyebilirsiniz."
          onClose={() => setCreateOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Vazgeç
              </Button>
              <Button type="submit" form="create-campaign-form" disabled={creating}>
                {creating ? 'Oluşturuluyor...' : 'Oluştur'}
              </Button>
            </div>
          }
        >
          <form id="create-campaign-form" onSubmit={handleCreate} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kampanya Başlığı *</label>
              <Input
                maxLength={300}
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                placeholder="Örn: Afrika Su Kuyusu Projesi"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">URL Slug (Opsiyonel)</label>
              <Input
                value={createForm.slug}
                onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                placeholder="Boş bırakılırsa başlıktan otomatik üretilir"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kısa Özet *</label>
              <textarea
                rows={2}
                value={createForm.summary}
                onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                placeholder="Kampanya kartında görünecek kısa açıklama..."
                className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                required
              />
            </div>

            <ImageField
              label="Kapak Görseli (Opsiyonel)"
              value={createForm.cover_image_url}
              onChange={(url) => setCreateForm({ ...createForm, cover_image_url: url })}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bağış Türü</label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                >
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Başlangıç Durumu</label>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                >
                  <option value="draft">Taslak</option>
                  <option value="active">Yayında</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Hedef Tutar</label>
                <Input
                  inputMode="decimal"
                  value={createForm.target}
                  onChange={(e) => setCreateForm({ ...createForm, target: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Para Birimi</label>
                <select
                  value={createForm.currency}
                  onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={createForm.is_featured}
                onChange={(e) => setCreateForm({ ...createForm, is_featured: e.target.checked })}
                className="accent-emerald-600"
              />
              Öne çıkan kampanya olarak işaretle
            </label>
          </form>
        </Modal>
      )}
    </div>
  )
}
