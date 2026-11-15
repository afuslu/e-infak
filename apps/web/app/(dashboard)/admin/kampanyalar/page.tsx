'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  HandCoins,
  ImagePlus,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import {
  ExportButtons,
  FilterBar,
  Modal,
  PageHeader,
  Pagination,
  Tabs,
  toast,
  confirmDialog,
} from '../../../../components/admin/ui'
import { GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'
import { FormattedStory } from '../../../../components/FormattedStory'
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

interface CampaignStats {
  total_campaigns: number
  active_count: number
  featured_count: number
  completed_count: number
  draft_count: number
  paused_count: number
  total_collected_cents: number
}

interface CampaignListResponse {
  items: Campaign[]
  total: number
  page: number
  page_size: number
  total_pages: number
  stats?: CampaignStats
}

const SORT_OPTIONS = [
  ['display_order', 'Sıra Numarasına Göre'],
  ['collected_desc', 'En Çok Toplanan'],
  ['progress_desc', 'Hedefe En Yakın (%)'],
  ['newest', 'En Yeni'],
] as const

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
  const [globalStats, setGlobalStats] = useState<CampaignStats>({
    total_campaigns: 0,
    active_count: 0,
    featured_count: 0,
    completed_count: 0,
    draft_count: 0,
    paused_count: 0,
    total_collected_cents: 0,
  })
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [sortBy, setSortBy] = useState<string>('display_order')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

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
    slug: '',
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
  const [storyPreview, setStoryPreview] = useState(false)
  const storyRef = useRef<HTMLTextAreaElement | null>(null)

  const applyStoryFormat = (prefix: string, suffix = '') => {
    const el = storyRef.current
    const current = editForm.story || ''
    if (!el) {
      setEditForm({ ...editForm, story: `${current}${current ? '\n' : ''}${prefix}${suffix}` })
      return
    }
    const start = el.selectionStart ?? current.length
    const end = el.selectionEnd ?? current.length
    const selectedText = current.slice(start, end) || (suffix ? 'metin' : 'Başlık')
    const next = `${current.slice(0, start)}${prefix}${selectedText}${suffix}${current.slice(end)}`
    setEditForm({ ...editForm, story: next })
    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + prefix.length + selectedText.length + suffix.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  // Media tab state
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [pendingGalleryUrl, setPendingGalleryUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [savingMedia, setSavingMedia] = useState(false)

  // Translations tab state
  const [translations, setTranslations] = useState<Translations>({})
  const [savingI18n, setSavingI18n] = useState(false)

  const deleteCampaign = async (c: Campaign) => {
    if (!(await confirmDialog(`“${c.title}” kampanyası silinsin mi? Bağış almış kampanyalar silinemez; onları "Tamamlandı" ya da "İptal" yapın.`))) return
    try {
      await v1Send('delete', `/campaigns/${c.id}`)
      setSelected(null)
      setCampaigns((list) => list.filter((x) => x.id !== c.id))
      toast.ok('Kampanya silindi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanya silinemedi.'))
    }
  }

  const loadCampaigns = useCallback(async (
    targetPage = page,
    q = search,
    st = statusFilter,
    cat = categoryFilter,
    feat = featuredOnly,
    sort = sortBy,
  ) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: targetPage, page_size: PAGE_SIZE }
      if (q.trim()) params.search = q.trim()
      if (st !== 'all') params.status = st
      if (cat !== 'all') params.category = cat
      if (feat) params.featured = true
      if (sort && sort !== 'display_order') params.sort = sort

      const res = await v1Get<CampaignListResponse>('/campaigns', params)
      const items = res.data?.items || []
      setCampaigns(items)
      setTotal(res.data?.total || items.length)
      setTotalPages(Math.max(1, res.data?.total_pages || 1))
      if (res.data?.stats) setGlobalStats(res.data.stats)
      setSelectedIds(new Set())
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kampanyalar yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, categoryFilter, featuredOnly, sortBy])

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      loadCampaigns(page, search, statusFilter, categoryFilter, featuredOnly, sortBy)
      return
    }
    const timer = setTimeout(() => {
      loadCampaigns(page, search, statusFilter, categoryFilter, featuredOnly, sortBy)
    }, 200)
    return () => clearTimeout(timer)
  }, [loadCampaigns, page, search, statusFilter, categoryFilter, featuredOnly, sortBy])

  const openEditor = (c: Campaign) => {
    setSelected(c)
    setDrawerTab('general')
    setEditForm({
      title: c.title || '',
      slug: c.slug || '',
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
      await loadCampaigns(1, search, statusFilter, categoryFilter, featuredOnly, sortBy)
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
        slug: editForm.slug.trim() || undefined,
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

  const quickPatchCampaign = async (c: Campaign, patch: Partial<Campaign>, okMsg: string) => {
    try {
      const res = await v1Send<Campaign>('patch', `/campaigns/${c.id}`, patch)
      syncUpdatedCampaign(res.data)
      if (selected?.id === c.id) {
        setEditForm((prev) => ({
          ...prev,
          status: res.data.status || prev.status,
          is_featured: Boolean(res.data.is_featured),
        }))
      }
      toast.ok(okMsg)
      loadCampaigns(page, search, statusFilter, categoryFilter, featuredOnly, sortBy)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'İşlem tamamlanamadı.'))
    }
  }

  const runBulkPatch = async (patch: Partial<Campaign>, label: string) => {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => v1Send<Campaign>('patch', `/campaigns/${id}`, patch)),
      )
      toast.ok(`${selectedIds.size} kampanya için "${label}" uygulandı.`)
      await loadCampaigns(page, search, statusFilter, categoryFilter, featuredOnly, sortBy)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu işlem sırasında hata oluştu.'))
    } finally {
      setBulkBusy(false)
    }
  }

  const copyCampaignLink = async (slug: string) => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/kampanyalar/${slug}` : `/kampanyalar/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast.ok('Kampanya bağlantısı panoya kopyalandı.')
    } catch {
      toast.error('Bağlantı kopyalanamadı.')
    }
  }

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOnPageSelected = campaigns.length > 0 && campaigns.every((c) => selectedIds.has(c.id))
  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(campaigns.map((c) => c.id)))
    }
  }

  const moveGalleryItem = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= galleryUrls.length) return
    setGalleryUrls((prev) => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (featuredOnly ? 1 : 0) +
    (sortBy !== 'display_order' ? 1 : 0)

  const clearFilters = () => {
    setPage(1)
    setSearch('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setFeaturedOnly(false)
    setSortBy('display_order')
  }

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
              onClick={() => loadCampaigns(page, search, statusFilter, categoryFilter, featuredOnly, sortBy)}
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
        <GlobalStatCard
          title="Toplam Kampanya"
          value={globalStats.total_campaigns.toLocaleString('tr-TR')}
          subtitle={`${globalStats.draft_count} taslak · ${globalStats.completed_count} tamamlandı`}
          gradient="from-slate-600 to-slate-700"
          icon={<Megaphone className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Yayında"
          value={globalStats.active_count.toLocaleString('tr-TR')}
          subtitle={`${globalStats.paused_count} duraklatıldı`}
          gradient="from-emerald-600 to-teal-700"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Öne Çıkan"
          value={globalStats.featured_count.toLocaleString('tr-TR')}
          subtitle="Ana sayfada vitrinde"
          gradient="from-amber-500 to-orange-600"
          icon={<Star className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Toplam Toplanan"
          value={formatMoney(globalStats.total_collected_cents, 'TRY')}
          subtitle="Tüm kampanyalar toplamı"
          gradient="from-sky-600 to-indigo-700"
          icon={<Wallet className="w-5 h-5" />}
        />
      </div>

      {/* Hızlı Görünüm Sekmeleri */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Kampanya görünümü">
        {[
          { key: 'all', label: 'Tümü', count: globalStats.total_campaigns, active: statusFilter === 'all' && !featuredOnly, onClick: () => { setPage(1); setStatusFilter('all'); setFeaturedOnly(false) } },
          { key: 'active', label: 'Yayında', count: globalStats.active_count, active: statusFilter === 'active' && !featuredOnly, onClick: () => { setPage(1); setStatusFilter('active'); setFeaturedOnly(false) } },
          { key: 'draft', label: 'Taslak', count: globalStats.draft_count, active: statusFilter === 'draft' && !featuredOnly, onClick: () => { setPage(1); setStatusFilter('draft'); setFeaturedOnly(false) } },
          { key: 'paused', label: 'Duraklatıldı', count: globalStats.paused_count, active: statusFilter === 'paused' && !featuredOnly, onClick: () => { setPage(1); setStatusFilter('paused'); setFeaturedOnly(false) } },
          { key: 'completed', label: 'Tamamlandı', count: globalStats.completed_count, active: statusFilter === 'completed' && !featuredOnly, onClick: () => { setPage(1); setStatusFilter('completed'); setFeaturedOnly(false) } },
          { key: 'featured', label: 'Öne Çıkanlar', count: globalStats.featured_count, active: featuredOnly, onClick: () => { setPage(1); setFeaturedOnly((v) => !v) } },
        ].map((pill) => (
          <button
            key={pill.key}
            type="button"
            role="tab"
            aria-selected={pill.active}
            onClick={pill.onClick}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              pill.active
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>{pill.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${pill.active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {pill.count}
            </span>
          </button>
        ))}
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
        <select
          value={sortBy}
          onChange={(e) => {
            setPage(1)
            setSortBy(e.target.value)
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          {SORT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {activeFiltersCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Temizle ({activeFiltersCount})
          </Button>
        )}
      </FilterBar>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs">
          <span className="font-semibold text-emerald-900">
            {selectedIds.size} kampanya seçildi
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkPatch({ status: 'active' }, 'Yayına Al')}>
              Yayına Al
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkPatch({ status: 'paused' }, 'Duraklat')}>
              Duraklat
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkPatch({ is_featured: true }, 'Öne Çıkar')}>
              Öne Çıkar
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkPatch({ is_featured: false }, 'Öne Çıkarmayı Kaldır')}>
              Vitrinden Çıkar
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              Seçimi Temizle
            </Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className={`${selected ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3`}>
          {!loading && campaigns.length > 0 && (
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                  className="rounded border-slate-300 accent-emerald-600"
                />
                <span>Sayfadakilerin tümünü seç ({campaigns.length})</span>
              </label>
              <span>Toplam {total.toLocaleString('tr-TR')} kayıt</span>
            </div>
          )}

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
              const remainingCents = Math.max(0, (c.target_cents || 0) - (c.collected_cents || 0))
              const isSelected = selected?.id === c.id
              const isChecked = selectedIds.has(c.id)
              return (
                <Card
                  key={c.id}
                  onClick={() => openEditor(c)}
                  className={`p-4 border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/30 shadow-sm ring-1 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelectId(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${c.title} seç`}
                      className="mt-1 rounded border-slate-300 accent-emerald-600 shrink-0"
                    />
                    <div className="w-20 h-14 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {c.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.cover_image_url} alt={c.title} className="w-full h-full object-cover" />
                      ) : (
                        <Megaphone className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
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

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => quickPatchCampaign(c, { is_featured: !c.is_featured }, c.is_featured ? 'Öne çıkarma kaldırıldı.' : 'Kampanya öne çıkarıldı.')}
                            title={c.is_featured ? 'Öne çıkarmayı kaldır' : 'Öne çıkar'}
                            className={`p-1.5 rounded-md border text-xs transition-colors ${
                              c.is_featured
                                ? 'border-amber-200 bg-amber-50 text-amber-600'
                                : 'border-slate-200 bg-white text-slate-400 hover:text-amber-600'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${c.is_featured ? 'fill-amber-500' : ''}`} />
                          </button>
                          {(c.status === 'active' || c.status === 'draft' || c.status === 'paused') && (
                            <button
                              type="button"
                              onClick={() =>
                                quickPatchCampaign(
                                  c,
                                  { status: c.status === 'active' ? 'paused' : 'active' },
                                  c.status === 'active' ? 'Kampanya duraklatıldı.' : 'Kampanya yayına alındı.',
                                )
                              }
                              title={c.status === 'active' ? 'Duraklat' : 'Yayına Al'}
                              className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-emerald-700 hover:border-emerald-200"
                            >
                              {c.status === 'active' ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyCampaignLink(c.slug)}
                            title="Kampanya linkini kopyala"
                            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-800"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`/kampanyalar/${c.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Sitede Görüntüle"
                            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-emerald-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{CATEGORY_LABEL[c.category] || c.category}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-400">/{c.slug}</span>
                        {typeof c.display_order === 'number' && c.display_order !== 0 && (
                          <>
                            <span>·</span>
                            <span>Sıra: {c.display_order}</span>
                          </>
                        )}
                      </div>

                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-800 tabular-nums">
                            {formatMoney(c.collected_cents || 0, c.currency || 'TRY')}
                            <span className="text-slate-400 font-normal"> / {formatMoney(c.target_cents || 0, c.currency || 'TRY')}</span>
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            {remainingCents > 0 && (
                              <span className="text-[11px] text-slate-400">Kalan: {formatMoney(remainingCents, c.currency || 'TRY')}</span>
                            )}
                            <span className={`font-semibold ${pct >= 100 ? 'text-sky-700' : 'text-emerald-700'}`}>%{pct}</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-sky-600' : 'bg-emerald-600'}`}
                            style={{ width: `${pct}%` }}
                          />
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
          <div className="lg:col-span-6 lg:sticky lg:top-4">
            <Card className="p-5 border border-slate-200 bg-white space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    Kampanya Düzenleme
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 truncate mt-0.5">{selected.title}</h2>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href="/admin/bagislar"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    title="Bağışlar listesine git"
                  >
                    <HandCoins className="w-3.5 h-3.5 text-emerald-600" />
                    Bağışlar
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyCampaignLink(selected.slug)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    title="Kampanya linkini kopyala"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Link
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCampaign(selected)}
                    className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"
                    title="Bağış almamış kampanyayı siler"
                  >
                    Sil
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Kapat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Seçili Kampanya Performans Şeridi */}
              <div className="grid grid-cols-3 gap-2.5 rounded-xl bg-slate-50 p-3 border border-slate-100">
                <div>
                  <div className="text-[10px] font-medium text-slate-500 uppercase">Toplanan</div>
                  <div className="text-sm font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatMoney(selected.collected_cents || 0, selected.currency || 'TRY')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-500 uppercase">Hedef</div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">
                    {formatMoney(selected.target_cents || 0, selected.currency || 'TRY')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-500 uppercase">Tamamlanma</div>
                  <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                    %{selected.target_cents > 0 ? Math.min(100, Math.round(((selected.collected_cents || 0) / selected.target_cents) * 100)) : 0}
                  </div>
                </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <label className="block text-xs font-medium text-slate-600 mb-1">URL Slug</label>
                      <Input
                        maxLength={200}
                        value={editForm.slug}
                        onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                        placeholder="kampanya-url-slug"
                      />
                    </div>
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
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-medium text-slate-600">
                        Kampanya Hikayesi / Detay
                      </label>
                      <div className="flex items-center gap-1.5">
                        {!storyPreview && (
                          <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => applyStoryFormat('## ')}
                              className="px-2 py-0.5 rounded hover:bg-white font-semibold text-slate-700"
                              title="Alt başlık ekle"
                            >
                              Başlık
                            </button>
                            <button
                              type="button"
                              onClick={() => applyStoryFormat('**', '**')}
                              className="px-2 py-0.5 rounded hover:bg-white font-bold text-slate-700"
                              title="Kalın yap"
                            >
                              B
                            </button>
                            <button
                              type="button"
                              onClick={() => applyStoryFormat('- ')}
                              className="px-2 py-0.5 rounded hover:bg-white font-medium text-slate-700"
                              title="Liste maddesi ekle"
                            >
                              • Liste
                            </button>
                          </div>
                        )}
                        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setStoryPreview(false)}
                            className={`px-2 py-0.5 rounded font-medium ${!storyPreview ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => setStoryPreview(true)}
                            className={`px-2 py-0.5 rounded font-medium ${storyPreview ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
                          >
                            Önizleme
                          </button>
                        </div>
                      </div>
                    </div>
                    {storyPreview ? (
                      <div className="min-h-[140px] rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                        {editForm.story.trim() ? (
                          <FormattedStory text={editForm.story} />
                        ) : (
                          <p className="text-xs text-slate-400 italic">Önizlenecek hikaye metni yok.</p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        ref={storyRef}
                        rows={6}
                        value={editForm.story}
                        onChange={(e) => setEditForm({ ...editForm, story: e.target.value })}
                        placeholder="## Proje Amacı&#10;Kampanyanızın detaylarını buraya yazın. **Kalın** vurgu veya - madde listesi kullanabilirsiniz."
                        className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    )}
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Biçimlendirme: ## Başlık, **kalın**, - madde</span>
                      <span className="tabular-nums">{editForm.story.length.toLocaleString('tr-TR')} karakter</span>
                    </div>
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
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => moveGalleryItem(index, -1)}
                                className="p-1 rounded bg-slate-900/75 text-white disabled:opacity-30"
                                title="Yukarı Taşı"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={index === galleryUrls.length - 1}
                                onClick={() => moveGalleryItem(index, 1)}
                                className="p-1 rounded bg-slate-900/75 text-white disabled:opacity-30"
                                title="Aşağı Taşı"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
                                className="p-1 rounded bg-rose-600 text-white"
                                title="Kaldır"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
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
