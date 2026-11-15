'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { ExportButtons, FilterBar, PageHeader, Tabs, confirmDialog, toast } from '../../../../components/admin/ui'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'
import { GlobalStatCard, MuhasebeStatModal, type MuhasebeStatModalProps } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { adminGet, adminSend, apiErrorMessage, v1Get } from '../../../../lib/admin-access'

interface DonationCategory {
  id: string
  icon: string
  image_url?: string | null
  title: string
  description: string
  campaign_id?: string | null
  campaign_title?: string | null
  donation_type?: string | null
  target_url?: string | null
  suggested_amounts_cents?: number[]
  translations?: Translations
  display_order: number
  is_active: boolean
}

const DONATION_TYPES = [
  ['', 'Otomatik / Seçilmedi'],
  ['genel', 'Genel Bağış'],
  ['zekat', 'Zekât'],
  ['fitre', 'Fitre'],
  ['fidye', 'Fidye'],
  ['sadaka', 'Sadaka'],
  ['su', 'Su Kuyusu'],
  ['yetim', 'Yetim'],
  ['kurban', 'Kurban'],
  ['egitim', 'Eğitim'],
  ['gida', 'Gıda / Kumanya'],
  ['saglik', 'Sağlık'],
  ['insaat', 'İnşaat'],
] as const

function parseAmounts(text: string): number[] {
  return text
    .split(',')
    .map((s) => Number(s.trim().replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 12)
    .map((n) => Math.round(n * 100))
}

function formatAmounts(cents?: number[]): string {
  if (!cents || cents.length === 0) return ''
  return cents.map((c) => String(c / 100)).join(', ')
}

interface CampaignOption {
  id: string
  title: string
}

const PRESET_ICONS = ['🤝', '💧', '🍞', '🕌', '🎓', '🐄', '🩺', '🏠', '❤️', '🌙', '🤲', '🌾', '👶', '📚', '⛺', '🌍']

const QUICK_TEMPLATES = [
  { icon: '🌙', title: 'Zekât', description: 'Yıllık zekât ibadetinizi ihtiyaç sahiplerine güvenle ulaştırın.' },
  { icon: '🌾', title: 'Fitre & Fidye', description: 'Ramazan fitre ve fidyelerinizi gerçek muhtaç ailelere teslim edelim.' },
  { icon: '🤲', title: 'Sadaka', description: 'Gönlünüzden kopan sadakalarla bir ailenin yüzünü güldürün.' },
  { icon: '💧', title: 'Su Kuyusu', description: 'Kurak bölgelerde temiz içme suyuna erişim için hisse veya kuyu bağışı yapın.' },
  { icon: '👶', title: 'Yetim Himayesi', description: 'Yetim çocukların eğitim, gıda ve barınma ihtiyaçlarına destek olun.' },
  { icon: '🐄', title: 'Kurban Bağışı', description: 'Adak, akika ve şükür kurbanlarınızı vekâletle kesip dağıtıyoruz.' },
]

const EMPTY_FORM = {
  icon: '🤝',
  image_url: '',
  title: '',
  description: '',
  campaign_id: '' as string,
  donation_type: '' as string,
  target_url: '',
  suggested_amounts: '',
  translations: {} as Translations,
  display_order: 0,
  is_active: true,
}

function sortCategories(list: DonationCategory[]) {
  return [...list].sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title, 'tr'))
}

export default function AdminDonationCategoriesPage() {
  const [categories, setCategories] = useState<DonationCategory[]>([])
  const [statModal, setStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorTab, setEditorTab] = useState<'general' | 'i18n'>('general')
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [linkFilter, setLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<DonationCategory[]>('/donation-categories')
      setCategories(sortCategories(res.data || []))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağış kalemleri yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCategories()
    v1Get<{ items: CampaignOption[] }>('/campaigns', { page_size: 200 })
      .then((res) => setCampaigns(res.data?.items || []))
      .catch(() => {})
  }, [loadCategories])

  const startEdit = (c: DonationCategory) => {
    setEditingId(c.id)
    setEditorTab('general')
    setForm({
      icon: c.icon || '🤝',
      image_url: c.image_url || '',
      title: c.title,
      description: c.description,
      campaign_id: c.campaign_id || '',
      donation_type: c.donation_type || '',
      target_url: c.target_url || '',
      suggested_amounts: formatAmounts(c.suggested_amounts_cents),
      translations: c.translations || {},
      display_order: c.display_order,
      is_active: c.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditorTab('general')
    setForm({ ...EMPTY_FORM, display_order: categories.length })
  }

  const buildPayloadFromCategory = (c: DonationCategory, overrides: Partial<DonationCategory> = {}) => ({
    icon: overrides.icon ?? c.icon,
    image_url: (overrides.image_url !== undefined ? overrides.image_url : c.image_url) || null,
    title: overrides.title ?? c.title,
    description: overrides.description ?? c.description,
    campaign_id: (overrides.campaign_id !== undefined ? overrides.campaign_id : c.campaign_id) || null,
    donation_type: (overrides.donation_type !== undefined ? overrides.donation_type : c.donation_type) || null,
    target_url: (overrides.target_url !== undefined ? overrides.target_url : c.target_url) || null,
    suggested_amounts_cents: overrides.suggested_amounts_cents ?? c.suggested_amounts_cents ?? [],
    translations: overrides.translations ?? c.translations ?? {},
    display_order: overrides.display_order ?? c.display_order,
    is_active: overrides.is_active ?? c.is_active,
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Başlık ve açıklama alanları zorunludur.')
      return
    }

    const payload = {
      icon: (form.icon || '🤝').trim().slice(0, 10),
      image_url: form.image_url.trim() || null,
      title: form.title.trim(),
      description: form.description.trim(),
      campaign_id: form.campaign_id ? form.campaign_id : null,
      donation_type: form.donation_type.trim() || null,
      target_url: form.target_url.trim() || null,
      suggested_amounts_cents: parseAmounts(form.suggested_amounts),
      translations: form.translations || {},
      display_order: Number(form.display_order) || 0,
      is_active: form.is_active,
    }

    setSaving(true)
    try {
      if (editingId) {
        const res = await adminSend<DonationCategory>('put', `/donation-categories/${editingId}`, payload)
        setCategories((prev) => sortCategories(prev.map((c) => (c.id === editingId ? res.data : c))))
        toast.ok('Bağış kalemi güncellendi.')
      } else {
        const res = await adminSend<DonationCategory>('post', '/donation-categories', payload)
        setCategories((prev) => sortCategories([...prev, res.data]))
        toast.ok('Yeni bağış kalemi eklendi.')
      }
      setEditingId(null)
      setForm({ ...EMPTY_FORM, display_order: categories.length + (editingId ? 0 : 1) })
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağış kalemi kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: DonationCategory) => {
    setBusyId(c.id)
    try {
      const res = await adminSend<DonationCategory>(
        'put',
        `/donation-categories/${c.id}`,
        buildPayloadFromCategory(c, { is_active: !c.is_active }),
      )
      setCategories((prev) => sortCategories(prev.map((item) => (item.id === c.id ? res.data : item))))
      toast.ok(res.data.is_active ? 'Kalem yayına alındı.' : 'Kalem pasife alındı.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Durum güncellenemedi.'))
    } finally {
      setBusyId(null)
    }
  }

  const moveOrder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= categories.length) return
    const current = categories[index]
    const target = categories[targetIndex]

    const currentOrder = current.display_order
    const targetOrder = target.display_order === current.display_order
      ? current.display_order + direction
      : target.display_order

    setBusyId(current.id)
    try {
      await Promise.all([
        adminSend('put', `/donation-categories/${current.id}`, buildPayloadFromCategory(current, { display_order: targetOrder })),
        adminSend('put', `/donation-categories/${target.id}`, buildPayloadFromCategory(target, { display_order: currentOrder })),
      ])
      await loadCategories()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Sıralama güncellenemedi.'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (c: DonationCategory) => {
    const ok = await confirmDialog({
      title: 'Bağış Kalemini Sil',
      text: `"${c.title}" kalemini kalıcı olarak silmek istediğinize emin misiniz?`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return

    setBusyId(c.id)
    try {
      await adminSend('delete', `/donation-categories/${c.id}`)
      setCategories((prev) => prev.filter((item) => item.id !== c.id))
      if (editingId === c.id) cancelEdit()
      toast.ok('Bağış kalemi silindi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağış kalemi silinemedi.'))
    } finally {
      setBusyId(null)
    }
  }

  const duplicateToForm = (c: DonationCategory) => {
    setEditingId(null)
    setEditorTab('general')
    setForm({
      icon: c.icon || '🤝',
      image_url: c.image_url || '',
      title: `${c.title} (Kopya)`,
      description: c.description,
      campaign_id: c.campaign_id || '',
      donation_type: c.donation_type || '',
      target_url: c.target_url || '',
      suggested_amounts: formatAmounts(c.suggested_amounts_cents),
      translations: c.translations || {},
      display_order: categories.length,
      is_active: c.is_active,
    })
    toast.ok('Kalem forma kopyalandı; düzenleyip ekleyebilirsiniz.')
  }

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runBulkActive = async (targetActive: boolean) => {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      const targets = categories.filter((c) => selectedIds.has(c.id))
      await Promise.all(
        targets.map((c) =>
          adminSend('put', `/donation-categories/${c.id}`, buildPayloadFromCategory(c, { is_active: targetActive })),
        ),
      )
      setSelectedIds(new Set())
      await loadCategories()
      toast.ok(`${targets.length} kalem ${targetActive ? 'yayına alındı' : 'pasife alındı'}.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu güncelleme başarısız oldu.'))
    } finally {
      setBulkBusy(false)
    }
  }

  const runBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const ok = await confirmDialog({
      title: 'Seçili Kalemleri Sil',
      text: `Seçili ${selectedIds.size} bağış kalemini kalıcı olarak silmek istediğinize emin misiniz?`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map((id) => adminSend('delete', `/donation-categories/${id}`)))
      if (editingId && selectedIds.has(editingId)) cancelEdit()
      setSelectedIds(new Set())
      await loadCategories()
      toast.ok(`${ids.length} bağış kalemi silindi.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu silme sırasında hata oluştu.'))
    } finally {
      setBulkBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return categories.filter((c) => {
      if (statusFilter === 'active' && !c.is_active) return false
      if (statusFilter === 'inactive' && c.is_active) return false
      if (linkFilter === 'linked' && !c.campaign_id) return false
      if (linkFilter === 'unlinked' && Boolean(c.campaign_id)) return false
      if (!term) return true
      return (
        c.title.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term) ||
        (c.campaign_title || '').toLowerCase().includes(term)
      )
    })
  }, [categories, q, statusFilter, linkFilter])

  const stats = useMemo(() => {
    const active = categories.filter((c) => c.is_active).length
    const linked = categories.filter((c) => Boolean(c.campaign_id)).length
    return {
      total: categories.length,
      active,
      inactive: categories.length - active,
      linked,
      unlinked: categories.length - linked,
    }
  }, [categories])

  const selectedCampaignTitle = campaigns.find((c) => c.id === form.campaign_id)?.title

  const isFiltered = Boolean(q.trim()) || statusFilter !== 'all' || linkFilter !== 'all'
  const activeFiltersCount = (q.trim() ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (linkFilter !== 'all' ? 1 : 0)
  const clearFilters = () => {
    setQ('')
    setStatusFilter('all')
    setLinkFilter('all')
  }
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bağış Kalemleri"
        description="Ana sayfadaki hızlı bağış kartlarını yönetin, kampanyalara bağlayın ve gösterim sırasını düzenleyin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {filtered.length > 0 && (
              <ExportButtons
                filename="bagis-kalemleri"
                title="Bağış Kalemleri"
                subtitle={`${filtered.length} kalem`}
                getData={() => ({
                  headers: ['Sıra', 'Başlık', 'Açıklama', 'Bağlı Kampanya', 'Durum'],
                  rows: filtered.map((c) => [
                    c.display_order,
                    c.title,
                    c.description,
                    c.campaign_title || '—',
                    c.is_active ? 'Aktif' : 'Pasif',
                  ]),
                })}
              />
            )}
            <Button type="button" variant="outline" size="sm" onClick={loadCategories} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlobalStatCard
          title="Toplam Kalem"
          value={stats.total.toLocaleString('tr-TR')}
          subtitle="Ana sayfa hızlı bağış"
          gradient="from-slate-600 to-slate-700"
          icon={<Layers className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Tüm Bağış Kalemleri',
            subtitle: `Toplam ${stats.total} kalem (${stats.active} aktif, ${stats.inactive} pasif)`,
            items: categories.map((c) => ({
              label: c.title,
              value: c.is_active ? 'Yayında' : 'Pasif',
              sub: c.campaign_title ? `Kampanya: ${c.campaign_title}` : 'Genel bağış',
              color: c.is_active ? 'emerald' : 'amber',
            })),
          })}
        />
        <GlobalStatCard
          title="Yayında (Aktif)"
          value={stats.active.toLocaleString('tr-TR')}
          subtitle="Sitede ziyaretçiye açık"
          gradient="from-emerald-600 to-teal-700"
          icon={<CheckCircle2 className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Yayındaki Bağış Kalemleri',
            subtitle: `${stats.active} aktif kalem`,
            items: categories.filter((c) => c.is_active).map((c) => ({
              label: c.title,
              value: c.suggested_amounts_cents?.[0] ? `${(c.suggested_amounts_cents[0] / 100).toLocaleString('tr-TR')} ₺+` : 'Serbest tutar',
              sub: c.campaign_title || 'Genel bağış',
              color: 'emerald',
            })),
          })}
        />
        <GlobalStatCard
          title="Kampanyaya Bağlı"
          value={stats.linked.toLocaleString('tr-TR')}
          subtitle={`${stats.unlinked} genel bağış`}
          gradient="from-sky-600 to-indigo-700"
          icon={<Link2 className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Kampanyaya Bağlı Kalemler',
            subtitle: `${stats.linked} bağlı · ${stats.unlinked} genel bağış`,
            items: categories.filter((c) => Boolean(c.campaign_id)).map((c) => ({
              label: c.title,
              value: c.campaign_title || 'Bağlı kampanya',
              sub: c.is_active ? 'Yayında' : 'Pasif',
              color: 'blue',
            })),
          })}
        />
        <GlobalStatCard
          title="Pasif"
          value={stats.inactive.toLocaleString('tr-TR')}
          subtitle="Gizlenmiş kalemler"
          gradient="from-amber-500 to-orange-600"
          icon={<EyeOff className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Pasif Bağış Kalemleri',
            subtitle: `${stats.inactive} gizlenmiş kalem`,
            items: categories.filter((c) => !c.is_active).map((c) => ({
              label: c.title,
              value: 'Pasif',
              sub: c.campaign_title || 'Genel bağış',
              color: 'amber',
            })),
          })}
        />
      </div>
      <MuhasebeStatModal
        isOpen={!!statModal}
        onClose={() => setStatModal(null)}
        title={statModal?.title || ''}
        subtitle={statModal?.subtitle}
        items={statModal?.items || []}
      />

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Bağış kalemi görünümü">
        {[
          { key: 'all', label: 'Tümü', count: stats.total, active: statusFilter === 'all' && linkFilter === 'all', onClick: clearFilters },
          { key: 'active', label: 'Yayında', count: stats.active, active: statusFilter === 'active' && linkFilter === 'all', onClick: () => { setStatusFilter('active'); setLinkFilter('all') } },
          { key: 'inactive', label: 'Pasif', count: stats.inactive, active: statusFilter === 'inactive' && linkFilter === 'all', onClick: () => { setStatusFilter('inactive'); setLinkFilter('all') } },
          { key: 'linked', label: 'Kampanyaya Bağlı', count: stats.linked, active: linkFilter === 'linked', onClick: () => { setStatusFilter('all'); setLinkFilter('linked') } },
          { key: 'unlinked', label: 'Genel Bağış', count: stats.unlinked, active: linkFilter === 'unlinked', onClick: () => { setStatusFilter('all'); setLinkFilter('unlinked') } },
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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Başlık, açıklama veya bağlı kampanya ara..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">Tüm Durumlar</option>
          <option value="active">Yalnızca Aktif</option>
          <option value="inactive">Yalnızca Pasif</option>
        </select>
        <select
          value={linkFilter}
          onChange={(e) => setLinkFilter(e.target.value as 'all' | 'linked' | 'unlinked')}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">Tüm Bağlantılar</option>
          <option value="linked">Kampanyaya Bağlı</option>
          <option value="unlinked">Genel Bağış</option>
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
            {selectedIds.size} kalem seçildi
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkActive(true)}>
              Yayına Al
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkActive(false)}>
              Pasife Al
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={runBulkDelete}>
              Seçilenleri Sil
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              Seçimi Temizle
            </Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-3">
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  className="rounded border-slate-300 accent-emerald-600"
                />
                <span>Listelenenlerin tümünü seç ({filtered.length})</span>
              </label>
              <span>Toplam {categories.length} kalem</span>
            </div>
          )}

          {loading ? (
            <Card className="p-8 border border-slate-200 text-center text-sm text-slate-500 animate-pulse">
              Bağış kalemleri yükleniyor...
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="p-8 border border-slate-200 text-center text-sm text-slate-400">
              {categories.length === 0 ? 'Henüz bağış kalemi eklenmedi.' : 'Filtreye uygun bağış kalemi bulunamadı.'}
            </Card>
          ) : (
            filtered.map((c, idx) => {
              const isBusy = busyId === c.id
              const isChecked = selectedIds.has(c.id)
              return (
                <Card
                  key={c.id}
                  className={`p-4 border transition-all ${
                    editingId === c.id
                      ? 'border-emerald-400 bg-emerald-50/30 shadow-sm ring-1 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectId(c.id)}
                        aria-label={`${c.title} seç`}
                        className="mt-2 rounded border-slate-300 accent-emerald-600 shrink-0"
                      />
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          #{c.display_order}
                        </span>
                        {!isFiltered && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={idx === 0 || isBusy}
                              onClick={() => moveOrder(idx, -1)}
                              title="Yukarı Taşı"
                              className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === filtered.length - 1 || isBusy}
                              onClick={() => moveOrder(idx, 1)}
                              title="Aşağı Taşı"
                              className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xl shrink-0 overflow-hidden">
                        {c.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.image_url} alt={c.title} className="w-full h-full object-cover" />
                        ) : (
                          c.icon
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900">{c.title}</span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              c.is_active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {c.is_active ? 'Aktif' : 'Pasif'}
                          </span>
                          {c.campaign_title && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                              <Link2 className="w-2.5 h-2.5" />
                              {c.campaign_title}
                            </span>
                          )}
                          {c.donation_type && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                              {DONATION_TYPES.find(([v]) => v === c.donation_type)?.[1] || c.donation_type}
                            </span>
                          )}
                          {c.suggested_amounts_cents && c.suggested_amounts_cents.length > 0 && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {c.suggested_amounts_cents.map((a) => `${a / 100}₺`).join(' · ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggleActive(c)}
                        title={c.is_active ? 'Pasife Al' : 'Aktifleştir'}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                      >
                        {c.is_active ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => duplicateToForm(c)}
                        title="Forma Kopyala"
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => startEdit(c)}
                        title="Düzenle"
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDelete(c)}
                        title="Sil"
                        className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>

        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
          <Card className="p-5 border border-slate-200 bg-white space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h2 className="text-base font-bold text-slate-900">
                {editingId ? 'Kalemi Düzenle' : 'Yeni Bağış Kalemi'}
              </h2>
              <a
                href="/bagis"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-emerald-700"
              >
                Bağış Sayfası
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {!editingId && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Hızlı Şablon Doldur
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.title}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          icon: tpl.icon,
                          title: tpl.title,
                          description: tpl.description,
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60"
                    >
                      <span>{tpl.icon}</span>
                      <span>{tpl.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Tabs
              value={editorTab}
              onChange={setEditorTab}
              tabs={[
                { key: 'general', label: 'Genel & Yönlendirme' },
                { key: 'i18n', label: 'Çeviriler' },
              ]}
            />

            <form onSubmit={handleSave} className="space-y-3.5">
              {editorTab === 'general' ? (
                <>
                  <div className="grid grid-cols-[90px_1fr] gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">İkon</label>
                      <Input
                        type="text"
                        maxLength={10}
                        value={form.icon}
                        onChange={(e) => setForm({ ...form, icon: e.target.value })}
                        className="text-center text-lg"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Başlık *</label>
                      <Input
                        type="text"
                        maxLength={200}
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Örn: Su Kuyusu Bağışı"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setForm({ ...form, icon: emoji })}
                        className={`w-8 h-8 rounded-lg border text-base flex items-center justify-center transition ${
                          form.icon === emoji
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <ImageField
                    label="Özel Görsel / İkon (Opsiyonel)"
                    value={form.image_url}
                    onChange={(url) => setForm({ ...form, image_url: url })}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-600">Açıklama *</label>
                      <span className="text-[11px] text-slate-400 tabular-nums">{form.description.length}/500</span>
                    </div>
                    <textarea
                      maxLength={500}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={3}
                      placeholder="Ana sayfada kart altında görünecek kısa açıklama..."
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Bağlı Kampanya (Opsiyonel)</label>
                      <select
                        value={form.campaign_id}
                        onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                      >
                        <option value="">Seçilmedi</option>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Bağış Türü Ön Seçimi</label>
                      <select
                        value={form.donation_type}
                        onChange={(e) => setForm({ ...form, donation_type: e.target.value })}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
                      >
                        {DONATION_TYPES.map(([val, lbl]) => (
                          <option key={val} value={val}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Önerilen Tutarlar (virgülle)</label>
                      <Input
                        type="text"
                        value={form.suggested_amounts}
                        onChange={(e) => setForm({ ...form, suggested_amounts: e.target.value })}
                        placeholder="Örn: 180, 360, 720"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Özel Yönlendirme URL</label>
                      <Input
                        type="text"
                        maxLength={500}
                        value={form.target_url}
                        onChange={(e) => setForm({ ...form, target_url: e.target.value })}
                        placeholder="/bagis?category=zekat"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Gösterim Sırası</label>
                      <Input
                        type="number"
                        value={form.display_order}
                        onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_active}
                          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                          className="h-4 w-4 accent-emerald-600 rounded"
                        />
                        Ana sayfada göster (Aktif)
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <TranslationEditor
                  value={form.translations}
                  onChange={(next) => setForm({ ...form, translations: next })}
                  fields={[
                    { key: 'title', label: 'Kalem başlığı' },
                    { key: 'description', label: 'Açıklama', long: true },
                  ]}
                />
              )}

              <div className="flex gap-2 pt-2">
                {editingId && (
                  <Button type="button" variant="outline" onClick={cancelEdit} className="flex-1">
                    Vazgeç
                  </Button>
                )}
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Kalem Ekle'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4 border border-slate-200 bg-slate-50/70 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Ana Sayfa Kart Önizlemesi
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                {form.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.image_url} alt={form.title || 'Önizleme'} className="w-full h-full object-cover" />
                ) : (
                  form.icon || '🤝'
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900 truncate">
                  {form.title.trim() || 'Örnek Bağış Kalemi'}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {form.description.trim() || 'Kalem açıklaması burada görüntülenecektir.'}
                </p>
                {selectedCampaignTitle && (
                  <div className="mt-1.5 text-[11px] font-medium text-emerald-700">
                    → {selectedCampaignTitle}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
