'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, downloadFile, formatMoney, useAdminAccess, can } from '../../../../lib/admin-access'
import { GlobalStatCard, MuhasebeStatModal, type MuhasebeStatModalProps } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import {
  ExportButtons,
  FilterBar,
  Modal,
  PageHeader,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  confirmDialog,
  toast,
} from '../../../../components/admin/ui'

interface Book {
  id: string
  series: string
  start_no: number
  end_no: number
  next_no: number
  branch: string | null
  holder_user_id: string | null
  holder_name: string | null
  status: 'active' | 'closed'
  note: string | null
  size: number
  used: number
  voided: number
  remaining: number
  next_label: string | null
}

interface Sheet {
  no: number
  label: string
  state: 'used' | 'cancelled' | 'voided' | 'gap'
  receipt_number?: string
  donor_name?: string
  amount_cents?: number
  currency?: string
  paid_at?: string
  reason?: string
}

interface Staff {
  id: string
  first_name: string
  last_name: string
  is_active: boolean
}

const STATE_LABEL: Record<Sheet['state'], [string, string]> = {
  used: ['Kesildi', 'text-emerald-700'],
  cancelled: ['Makbuz iptal', 'text-amber-700'],
  voided: ['Yaprak iptal', 'text-rose-700'],
  gap: ['Atlandı (boş)', 'text-slate-400'],
}

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const

const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ReceiptBooksPage() {
  const { data: access } = useAdminAccess()
  const canEdit = can(access, 'receipts.create') || can(access, 'finance.manage')

  const [books, setBooks] = useState<Book[]>([])
  const [statModal, setStatModal] = useState<Omit<MuhasebeStatModalProps, 'isOpen' | 'onClose'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'closed' | 'low'>('')
  const [holderFilter, setHolderFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')

  const [form, setForm] = useState<{
    id?: string
    series: string
    start_no: string
    end_no: string
    branch: string
    holder_user_id: string
    status: string
    note: string
  } | null>(null)
  const [voidModal, setVoidModal] = useState<{ book: Book; number: string; reason: string } | null>(null)
  const [sheets, setSheets] = useState<{ book: Book; sheets: Sheet[] } | null>(null)
  const [sheetSearch, setSheetSearch] = useState('')
  const [sheetStateFilter, setSheetStateFilter] = useState<'all' | Sheet['state']>('all')

  const [range, setRange] = useState({ start: monthStart(), end: today() })
  const [summaryCurrency, setSummaryCurrency] = useState<string>('TRY')
  const [channels, setChannels] = useState<{ kind: string; label: string; count: number; total_cents: number }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setBooks((await adminGet<Book[]>('/receipt-books')).data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Koçanlar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    adminGet<Staff[]>('/users')
      .then((r) => setStaff(r.data.filter((s) => s.is_active)))
      .catch(() => {})
  }, [load])

  useEffect(() => {
    adminGet<{ channels: typeof channels }>('/receipt-books-summary', { ...range, currency: summaryCurrency })
      .then((r) => setChannels(r.data.channels))
      .catch(() => setChannels([]))
  }, [range, summaryCurrency])

  const branches = useMemo(() => {
    const set = new Set<string>()
    books.forEach((b) => set.add(b.branch || 'Merkez'))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [books])

  const stats = useMemo(() => {
    const active = books.filter((b) => b.status === 'active')
    const closed = books.filter((b) => b.status === 'closed')
    const low = active.filter((b) => b.remaining <= 5)
    const remainingTotal = active.reduce((s, b) => s + b.remaining, 0)
    const usedTotal = books.reduce((s, b) => s + b.used, 0)
    const voidedTotal = books.reduce((s, b) => s + b.voided, 0)
    const totalSize = books.reduce((s, b) => s + b.size, 0)
    return {
      total: books.length,
      active: active.length,
      closed: closed.length,
      low: low.length,
      remainingTotal,
      usedTotal,
      voidedTotal,
      totalSize,
    }
  }, [books])

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return books.filter((b) => {
      if (statusFilter === 'active' && b.status !== 'active') return false
      if (statusFilter === 'closed' && b.status !== 'closed') return false
      if (statusFilter === 'low' && !(b.status === 'active' && b.remaining <= 5)) return false
      if (holderFilter && (b.holder_user_id || '__none__') !== holderFilter) return false
      if (branchFilter && (b.branch || 'Merkez') !== branchFilter) return false
      if (q) {
        const hay = `${b.series} ${b.branch || 'Merkez'} ${b.holder_name || ''} ${b.note || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [books, search, statusFilter, holderFilter, branchFilter])

  const filteredSheets = useMemo(() => {
    if (!sheets) return []
    const q = sheetSearch.trim().toLowerCase()
    return sheets.sheets.filter((s) => {
      if (sheetStateFilter !== 'all' && s.state !== sheetStateFilter) return false
      if (!q) return true
      return `${s.label} ${s.receipt_number || ''} ${s.donor_name || ''} ${s.reason || ''}`.toLowerCase().includes(q)
    })
  }, [sheets, sheetSearch, sheetStateFilter])

  const activeFiltersCount = (search.trim() ? 1 : 0) + (statusFilter ? 1 : 0) + (holderFilter ? 1 : 0) + (branchFilter ? 1 : 0)
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setHolderFilter('')
    setBranchFilter('')
  }

  const openSheets = async (id: string) => {
    try {
      setSheetSearch('')
      setSheetStateFilter('all')
      setSheets((await adminGet<{ book: Book; sheets: Sheet[] }>(`/receipt-books/${id}/sheets`)).data)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    try {
      if (form.id) {
        await adminSend('put', `/receipt-books/${form.id}`, {
          branch: form.branch || null,
          holder_user_id: form.holder_user_id || null,
          status: form.status,
          note: form.note || null,
        })
        toast.ok('Koçan güncellendi.')
      } else {
        await adminSend('post', '/receipt-books', {
          series: form.series,
          start_no: Number(form.start_no),
          end_no: Number(form.end_no),
          branch: form.branch || null,
          holder_user_id: form.holder_user_id || null,
          note: form.note || null,
        })
        toast.ok('Yeni koçan oluşturuldu.')
      }
      setForm(null)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const submitVoid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voidModal) return
    const { book, number, reason } = voidModal
    if (!number || !reason.trim()) return
    try {
      await adminSend('post', `/receipt-books/${book.id}/void`, { number: Number(number), reason: reason.trim() })
      setVoidModal(null)
      toast.ok(`${book.series}-${number} iptal edildi; bu numara bir daha verilmez.`)
      await load()
      if (sheets?.book.id === book.id) await openSheets(book.id)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const deleteBook = async (b: Book) => {
    const ok = await confirmDialog({
      title: `${b.series} (${b.start_no}–${b.end_no}) koçanı silinsin mi?`,
      text: 'Hiç yaprağı kullanılmamış bu koçan kalıcı olarak silinecek.',
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return
    try {
      await adminSend('delete', `/receipt-books/${b.id}`)
      if (sheets?.book.id === b.id) setSheets(null)
      toast.ok(`${b.series} koçanı silindi.`)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Koçan silinemedi'))
    }
  }

  const totalOf = (kind: string) => channels.filter((c) => c.kind === kind).reduce((s, c) => s + c.total_cents, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Makbuz Koçanları"
        description="Resmî matbu makbuz koçanlarını, zimmetli personeli ve yaprak dökümlerini yönetin. Kesilen veya iptal edilen numara bir daha verilmez."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {filteredBooks.length > 0 && (
              <ExportButtons
                filename="makbuz-kocanlari"
                title="Makbuz Koçanları"
                subtitle={`${filteredBooks.length} koçan`}
                getData={() => ({
                  headers: ['Seri', 'Aralık', 'Şube', 'Zimmet', 'Kesilen', 'İptal', 'Kalan', 'Sıradaki', 'Durum'],
                  rows: filteredBooks.map((b) => [
                    b.series,
                    `${b.start_no}-${b.end_no}`,
                    b.branch || 'Merkez',
                    b.holder_name || '—',
                    b.used,
                    b.voided,
                    b.remaining,
                    b.next_label || '—',
                    b.status === 'active' ? 'Kullanımda' : 'Kapalı',
                  ]),
                })}
              />
            )}
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setForm({ series: '', start_no: '1', end_no: '50', branch: '', holder_user_id: '', status: 'active', note: '' })
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Yeni Koçan
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlobalStatCard
          title="Toplam Koçan"
          value={stats.total.toLocaleString('tr-TR')}
          subtitle={`${stats.totalSize.toLocaleString('tr-TR')} toplam yaprak`}
          gradient="from-slate-600 to-slate-700"
          icon={<BookOpen className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Tüm Makbuz Koçanları',
            subtitle: `Toplam ${stats.total} koçan · ${stats.totalSize.toLocaleString('tr-TR')} yaprak`,
            items: books.map((b) => ({
              label: `${b.series} · ${b.branch || 'Merkez'}${b.holder_name ? ` (${b.holder_name})` : ''}`,
              value: `${b.remaining} kalan / ${b.size}`,
              sub: `${b.used} kesildi · ${b.voided} iptal`,
              color: b.status === 'active' ? 'emerald' : 'amber',
              percent: b.size ? Math.round(((b.used + b.voided) / b.size) * 100) : 0,
            })),
          })}
        />
        <GlobalStatCard
          title="Kullanımda"
          value={stats.active.toLocaleString('tr-TR')}
          subtitle={`${stats.usedTotal} kesildi · ${stats.voidedTotal} yaprak iptal`}
          gradient="from-emerald-600 to-teal-700"
          icon={<CheckCircle2 className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Kullanımdaki Koçanlar',
            subtitle: `${stats.active} aktif koçan`,
            items: books.filter((b) => b.status === 'active').map((b) => ({
              label: `${b.series} · ${b.branch || 'Merkez'}`,
              value: `${b.used} kesildi`,
              sub: b.holder_name ? `Zimmetli: ${b.holder_name} · Kalan: ${b.remaining}` : `Kalan: ${b.remaining}`,
              color: 'emerald',
              percent: b.size ? Math.round((b.used / b.size) * 100) : 0,
            })),
          })}
        />
        <GlobalStatCard
          title="Kalan Yaprak"
          value={stats.remainingTotal.toLocaleString('tr-TR')}
          subtitle="Aktif koçanlarda"
          gradient="from-sky-600 to-indigo-700"
          icon={<Layers className="w-5 h-5" />}
          onClick={() => {
            const activeBooks = books.filter((b) => b.status === 'active').sort((a, b) => b.remaining - a.remaining)
            const max = Math.max(1, ...activeBooks.map((b) => b.remaining))
            setStatModal({
              title: 'Aktif Koçanlarda Kalan Yapraklar',
              subtitle: `Toplam ${stats.remainingTotal.toLocaleString('tr-TR')} yaprak`,
              items: activeBooks.map((b) => ({
                label: `${b.series} (${b.holder_name || b.branch || 'Merkez'})`,
                value: `${b.remaining} yaprak`,
                sub: b.next_label ? `Sıradaki: ${b.next_label}` : undefined,
                color: 'blue',
                percent: Math.round((b.remaining / max) * 100),
              })),
            })
          }}
        />
        <GlobalStatCard
          title="Azalan Koçan (≤5)"
          value={stats.low.toLocaleString('tr-TR')}
          subtitle={`${stats.closed} kapalı koçan`}
          gradient="from-amber-500 to-orange-600"
          icon={<AlertTriangle className="w-5 h-5" />}
          onClick={() => setStatModal({
            title: 'Azalan ve Kapalı Koçanlar',
            subtitle: `${stats.low} azalan koçan · ${stats.closed} kapalı koçan`,
            items: books.filter((b) => (b.status === 'active' && b.remaining <= 5) || b.status !== 'active').map((b) => ({
              label: `${b.series} · ${b.holder_name || b.branch || 'Merkez'}`,
              value: b.status === 'active' ? `${b.remaining} yaprak kaldı` : 'Kapalı',
              color: b.remaining <= 5 && b.status === 'active' ? 'rose' : 'amber',
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

      {/* Hızlı Görünüm Sekmeleri */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Koçan görünümü">
        {[
          { key: '', label: 'Tümü', count: stats.total },
          { key: 'active', label: 'Kullanımda', count: stats.active },
          { key: 'low', label: 'Azalan (≤5 yaprak)', count: stats.low },
          { key: 'closed', label: 'Kapalı', count: stats.closed },
        ].map((pill) => {
          const active = statusFilter === pill.key
          return (
            <button
              key={pill.key || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatusFilter(pill.key as '' | 'active' | 'closed' | 'low')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{pill.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {pill.count}
              </span>
            </button>
          )
        })}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Seri, şube, zimmetli personel veya not ara..."
            className="pl-9"
          />
        </div>
        <select
          aria-label="Şube"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="">Tüm Şubeler</option>
          {branches.map((br) => (
            <option key={br} value={br}>
              {br}
            </option>
          ))}
        </select>
        <select
          aria-label="Zimmetli personel"
          value={holderFilter}
          onChange={(e) => setHolderFilter(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="">Tüm Zimmetler</option>
          <option value="__none__">Zimmet Atanmamış</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name}
            </option>
          ))}
        </select>
        {activeFiltersCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Temizle ({activeFiltersCount})
          </Button>
        )}
      </FilterBar>

      <Card className="border border-slate-200 bg-white p-0 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Seri / Aralık</Th>
                <Th>Şube</Th>
                <Th>Zimmet</Th>
                <Th>Kullanım</Th>
                <Th>Kalan</Th>
                <Th>Sıradaki</Th>
                <Th>Durum</Th>
                <Th className="text-right">İşlem</Th>
              </Tr>
            </THead>
            <TBody>
              {loading ? (
                <Tr>
                  <Td colSpan={8} className="text-center py-8 text-slate-400">
                    Koçanlar yükleniyor...
                  </Td>
                </Tr>
              ) : !filteredBooks.length ? (
                <Tr>
                  <Td colSpan={8} className="text-center py-8 text-slate-400">
                    Kriterlere uygun koçan bulunamadı.
                  </Td>
                </Tr>
              ) : (
                filteredBooks.map((b) => {
                  const usedPct = b.size > 0 ? Math.min(100, Math.round(((b.used + b.voided) / b.size) * 100)) : 0
                  const isLow = b.remaining <= 5 && b.status === 'active'
                  return (
                    <Tr key={b.id} className="border-t hover:bg-slate-50/60">
                      <Td>
                        <div className="font-bold text-slate-900">
                          {b.series}{' '}
                          <span className="font-normal text-slate-500">
                            {b.start_no}–{b.end_no}
                          </span>
                        </div>
                        {b.note && <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{b.note}</div>}
                      </Td>
                      <Td className="text-slate-700">{b.branch || 'Merkez'}</Td>
                      <Td className="text-slate-700">{b.holder_name || <span className="text-slate-400">—</span>}</Td>
                      <Td>
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-600 tabular-nums">
                            <span>{b.used} kesildi</span>
                            {b.voided > 0 && <span className="text-rose-600">{b.voided} iptal</span>}
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full transition-all ${isLow ? 'bg-amber-500' : 'bg-emerald-600'}`}
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                        </div>
                      </Td>
                      <Td className={`tabular-nums ${isLow ? 'font-bold text-amber-700' : 'text-slate-700'}`}>
                        {b.remaining}
                      </Td>
                      <Td className="font-mono text-xs text-slate-600">{b.next_label || '—'}</Td>
                      <Td>
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            b.status === 'active'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.status === 'active' ? 'Kullanımda' : 'Kapalı'}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openSheets(b.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            Yapraklar
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadFile(`/admin-features/receipt-books/${b.id}/audit-report.pdf`, `kocan-tutanak-${b.series}.pdf`).catch(() => toast.error('Tutanak indirilemedi'))}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Tutanak PDF
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  id: b.id,
                                  series: b.series,
                                  start_no: String(b.start_no),
                                  end_no: String(b.end_no),
                                  branch: b.branch || '',
                                  holder_user_id: b.holder_user_id || '',
                                  status: b.status,
                                  note: b.note || '',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Düzenle
                            </button>
                          )}
                          {canEdit && b.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => setVoidModal({ book: b, number: String(b.next_no), reason: 'Yaprak yırtıldı' })}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                            >
                              Yaprak İptal
                            </button>
                          )}
                          {canEdit && b.used === 0 && b.voided === 0 && (
                            <button
                              type="button"
                              title="Kullanılmamış koçanı sil"
                              onClick={() => deleteBook(b)}
                              className="inline-flex rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })
              )}
            </TBody>
          </Table>
        </div>
      </Card>

      <Card className="space-y-4 border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Online ve Şube Makbuz Mutabakatı ({summaryCurrency})</h2>
            <p className="text-xs text-slate-500">Seçili tarih aralığında tahsilat kanallarına göre makbuz dağılımı</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Para birimi"
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
              value={summaryCurrency}
              onChange={(e) => setSummaryCurrency(e.target.value)}
            >
              {CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
            <Input
              type="date"
              aria-label="Başlangıç tarihi"
              className="w-40"
              value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
            />
            <span className="text-xs text-slate-400">—</span>
            <Input
              type="date"
              aria-label="Bitiş tarihi"
              className="w-40"
              value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['online', 'Online'],
            ['branch', 'Şube (Koçan)'],
            ['manual', 'Elle (Koçansız)'],
          ].map(([kind, label]) => (
            <div key={kind} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">{formatMoney(totalOf(kind), summaryCurrency)}</p>
            </div>
          ))}
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>Kanal</Th>
              <Th>Makbuz Adedi</Th>
              <Th className="text-right">Toplam</Th>
            </Tr>
          </THead>
          <TBody>
            {channels.map((c) => (
              <Tr key={`${c.kind}-${c.label}`} className="border-t">
                <Td className="font-semibold text-slate-800">{c.label}</Td>
                <Td className="tabular-nums">{c.count}</Td>
                <Td className="text-right font-semibold tabular-nums">{formatMoney(c.total_cents, summaryCurrency)}</Td>
              </Tr>
            ))}
            {channels.length === 0 && (
              <Tr>
                <Td colSpan={3} className="text-center text-slate-400 py-4">
                  Bu aralıkta makbuz kaydı bulunamadı.
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>

      {form && (
        <Modal
          title={form.id ? `${form.series} Koçanını Düzenle` : 'Yeni Makbuz Koçanı'}
          description="Seri ve yaprak aralığı oluşturulduktan sonra değiştirilemez."
          onClose={() => setForm(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                Vazgeç
              </Button>
              <Button type="submit" form="receipt-book-form" disabled={saving}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </div>
          }
        >
          <form id="receipt-book-form" onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Seri *</label>
                <Input
                  required
                  value={form.series}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, series: e.target.value.toUpperCase() })}
                  placeholder="ör. A veya 2026-B"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">İlk Yaprak No *</label>
                <Input
                  required
                  inputMode="numeric"
                  value={form.start_no}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, start_no: e.target.value.replace(/\D/g, '') })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Son Yaprak No *</label>
                <Input
                  required
                  inputMode="numeric"
                  value={form.end_no}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, end_no: e.target.value.replace(/\D/g, '') })}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Şube / Temsilcilik</label>
                <Input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="Boş bırakılırsa Merkez"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Zimmetli Personel</label>
                <select
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={form.holder_user_id}
                  onChange={(e) => setForm({ ...form, holder_user_id: e.target.value })}
                >
                  <option value="">— Seçilmedi —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.id && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Durum</label>
                <select
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="active">Kullanımda</option>
                  <option value="closed">Kapalı</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Not</label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Opsiyonel açıklama..." />
            </div>
          </form>
        </Modal>
      )}

      {sheets && (
        <Modal
          title={`${sheets.book.series} Koçanı Yaprak Dökümü`}
          description={`${sheets.book.start_no}–${sheets.book.end_no} · ${sheets.book.branch || 'Merkez'}${sheets.book.holder_name ? ` · ${sheets.book.holder_name}` : ''}`}
          size="lg"
          onClose={() => setSheets(null)}
          footer={
            <div className="flex items-center justify-between w-full">
              <ExportButtons
                filename={`kocan-${sheets.book.series}`}
                title={`${sheets.book.series} Koçanı Yaprak Dökümü`}
                subtitle={`${filteredSheets.length} yaprak`}
                currencyCols={[4]}
                getData={() => ({
                  headers: ['Yaprak', 'Durum', 'Sistem makbuz no', 'Bağışçı', 'Tutar', 'Tarih / gerekçe'],
                  rows: filteredSheets.map((s) => [
                    s.label,
                    STATE_LABEL[s.state][0],
                    s.receipt_number,
                    s.donor_name,
                    s.amount_cents !== undefined ? s.amount_cents / 100 : '',
                    s.paid_at ? new Date(s.paid_at).toLocaleDateString('tr-TR') : s.reason,
                  ]),
                })}
              />
              <Button type="button" variant="outline" onClick={() => setSheets(null)}>
                Kapat
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  placeholder="Yaprak no, bağışçı veya makbuz no ara..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <select
                value={sheetStateFilter}
                onChange={(e) => setSheetStateFilter(e.target.value as 'all' | Sheet['state'])}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="all">Tüm Yapraklar ({sheets.sheets.length})</option>
                <option value="used">Kesildi</option>
                <option value="gap">Atlandı (Boş)</option>
                <option value="voided">Yaprak İptal</option>
                <option value="cancelled">Makbuz İptal</option>
              </select>
            </div>

            <div className="max-h-[420px] overflow-auto border border-slate-200 rounded-xl">
              <Table>
                <THead className="sticky top-0 bg-slate-50">
                  <Tr>
                    <Th>Yaprak</Th>
                    <Th>Durum</Th>
                    <Th>Sistem No</Th>
                    <Th>Bağışçı</Th>
                    <Th>Tutar</Th>
                    <Th>Tarih / Gerekçe</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {filteredSheets.map((s) => (
                    <Tr key={s.no} className="border-t">
                      <Td className="font-semibold text-slate-900">{s.label}</Td>
                      <Td className={`font-semibold text-xs ${STATE_LABEL[s.state][1]}`}>{STATE_LABEL[s.state][0]}</Td>
                      <Td className="font-mono text-xs">{s.receipt_number || '—'}</Td>
                      <Td>{s.donor_name || '—'}</Td>
                      <Td className="tabular-nums">{s.amount_cents !== undefined ? formatMoney(s.amount_cents, s.currency) : '—'}</Td>
                      <Td className="text-xs text-slate-600">{s.paid_at ? new Date(s.paid_at).toLocaleDateString('tr-TR') : s.reason || '—'}</Td>
                      <Td className="text-right">
                        {canEdit && s.state === 'gap' && sheets.book.status === 'active' && (
                          <button
                            type="button"
                            onClick={() =>
                              setVoidModal({ book: sheets.book, number: String(s.no), reason: 'Atlanan / yırtılan yaprak' })
                            }
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            İptal Et
                          </button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                  {!filteredSheets.length && (
                    <Tr>
                      <Td colSpan={7} className="text-center text-slate-400 py-6">
                        Kayıtlı yaprak bulunamadı.
                      </Td>
                    </Tr>
                  )}
                </TBody>
              </Table>
            </div>
            <p className="text-[11px] text-slate-400">
              &quot;Atlandı (boş)&quot; satırları, sonraki numaralar kullanıldığı hâlde kesilmemiş yapraklardır; matbu koçanla karşılaştırıp gerekirse iptal edin.
            </p>
          </div>
        </Modal>
      )}

      {voidModal && (
        <Modal
          title={`${voidModal.book.series} Koçanı — Yaprak İptali`}
          description="İptal edilen yaprak numarası bir daha otomatik veya elle makbuz kesiminde verilmez."
          size="sm"
          onClose={() => setVoidModal(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setVoidModal(null)}>
                Vazgeç
              </Button>
              <Button type="submit" form="void-sheet-form">
                Yaprağı İptal Et
              </Button>
            </div>
          }
        >
          <form id="void-sheet-form" onSubmit={submitVoid} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                İptal Edilecek Yaprak No ({voidModal.book.start_no}–{voidModal.book.end_no}) *
              </label>
              <Input
                required
                inputMode="numeric"
                value={voidModal.number}
                onChange={(e) => setVoidModal({ ...voidModal, number: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">İptal Gerekçesi *</label>
              <Input
                required
                value={voidModal.reason}
                onChange={(e) => setVoidModal({ ...voidModal, reason: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
