'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, EyeOff, Layers, Link2, Pencil, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { ExportButtons, FilterBar, PageHeader, StatCard, confirmDialog, toast } from '../../../../components/admin/ui'
import { adminGet, adminSend, apiErrorMessage, v1Get } from '../../../../lib/admin-access'

interface DonationCategory {
  id: string
  icon: string
  title: string
  description: string
  campaign_id?: string | null
  campaign_title?: string | null
  display_order: number
  is_active: boolean
}

interface CampaignOption {
  id: string
  title: string
}

const PRESET_ICONS = ['🤝', '💧', '🍞', '🕌', '🎓', '🐄', '🩺', '🏠', '❤️', '🌙']

const EMPTY_FORM = {
  icon: '🤝',
  title: '',
  description: '',
  campaign_id: '' as string,
  display_order: 0,
  is_active: true,
}

function sortCategories(list: DonationCategory[]) {
  return [...list].sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title, 'tr'))
}

export default function AdminDonationCategoriesPage() {
  const [categories, setCategories] = useState<DonationCategory[]>([])
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

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
    setForm({
      icon: c.icon || '🤝',
      title: c.title,
      description: c.description,
      campaign_id: c.campaign_id || '',
      display_order: c.display_order,
      is_active: c.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, display_order: categories.length })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Başlık ve açıklama alanları zorunludur.')
      return
    }

    const payload = {
      icon: (form.icon || '🤝').trim().slice(0, 10),
      title: form.title.trim(),
      description: form.description.trim(),
      campaign_id: form.campaign_id ? form.campaign_id : null,
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
      const res = await adminSend<DonationCategory>('put', `/donation-categories/${c.id}`, {
        icon: c.icon,
        title: c.title,
        description: c.description,
        campaign_id: c.campaign_id || null,
        display_order: c.display_order,
        is_active: !c.is_active,
      })
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
        adminSend('put', `/donation-categories/${current.id}`, {
          icon: current.icon,
          title: current.title,
          description: current.description,
          campaign_id: current.campaign_id || null,
          display_order: targetOrder,
          is_active: current.is_active,
        }),
        adminSend('put', `/donation-categories/${target.id}`, {
          icon: target.icon,
          title: target.title,
          description: target.description,
          campaign_id: target.campaign_id || null,
          display_order: currentOrder,
          is_active: target.is_active,
        }),
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return categories.filter((c) => {
      if (statusFilter === 'active' && !c.is_active) return false
      if (statusFilter === 'inactive' && c.is_active) return false
      if (!term) return true
      return (
        c.title.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term) ||
        (c.campaign_title || '').toLowerCase().includes(term)
      )
    })
  }, [categories, q, statusFilter])

  const stats = useMemo(() => {
    const active = categories.filter((c) => c.is_active).length
    const linked = categories.filter((c) => Boolean(c.campaign_id)).length
    return {
      total: categories.length,
      active,
      inactive: categories.length - active,
      linked,
    }
  }, [categories])

  const selectedCampaignTitle = campaigns.find((c) => c.id === form.campaign_id)?.title

  const isFiltered = Boolean(q.trim()) || statusFilter !== 'all'

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
        <StatCard label="Toplam Kalem" value={String(stats.total)} tone="neutral" icon={Layers} />
        <StatCard label="Yayında (Aktif)" value={String(stats.active)} tone="good" icon={CheckCircle2} />
        <StatCard label="Kampanyaya Bağlı" value={String(stats.linked)} tone="brand" icon={Link2} />
        <StatCard label="Pasif" value={String(stats.inactive)} tone="warn" icon={EyeOff} />
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
          <option value="all">Tüm Kalemler</option>
          <option value="active">Yalnızca Aktif</option>
          <option value="inactive">Yalnızca Pasif</option>
        </select>
      </FilterBar>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-3">
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
              return (
                <Card
                  key={c.id}
                  className={`p-4 border transition-colors ${editingId === c.id ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
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

                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xl shrink-0">
                        {c.icon}
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

        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 border border-slate-200 bg-white space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2.5">
              {editingId ? 'Kalemi Düzenle' : 'Yeni Bağış Kalemi'}
            </h2>

            <form onSubmit={handleSave} className="space-y-3.5">
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

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Açıklama *</label>
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

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Bağlı Kampanya (Opsiyonel)</label>
                <select
                  value={form.campaign_id}
                  onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="">Genel Bağış / Kampanya Seçilmedi</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Seçilirse ziyaretçi bu kaleme tıkladığında doğrudan ilgili kampanya sayfasına gider.
                </p>
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
              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl shrink-0">
                {form.icon || '🤝'}
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
