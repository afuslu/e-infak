'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Edit3,
  Eye,
  Info,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react'
import { Button, Input } from '@e-infak/ui'
import {
  Column,
  DataTable,
  ExportButtons,
  FilterBar,
  Modal,
  PageHeader,
  Pagination,
  WhatsAppIcon,
  confirmDialog,
  toast,
} from '../../../../components/admin/ui'
import { GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import {
  adminGet,
  adminSend,
  apiErrorMessage,
  formatMoney,
  v1Get,
  whatsappUrl,
} from '../../../../lib/admin-access'

type SubscriptionStatus = 'active' | 'paused' | 'past_due' | 'cancelled'

interface SubscriptionItem {
  id: string
  donor_id: string
  donor_name: string
  donor_email?: string | null
  donor_phone?: string | null
  campaign_id: string
  campaign_title: string
  amount_cents: number
  amount_lira: number
  currency: string
  status: SubscriptionStatus | string
  mode?: 'card' | 'reminder' | string
  frequency?: string
  day_of_month?: number | null
  failed_attempts?: number
  last_error?: string | null
  last_charged_at?: string | null
  last_reminded_at?: string | null
  has_card_token?: boolean
  card_brand?: string | null
  card_last4?: string | null
  next_billing_date?: string | null
  created_at?: string | null
}

interface SubscriptionDonation {
  id: string
  amount_cents: number
  currency: string
  status: string
  payment_method: string
  receipt_number?: string | null
  created_at?: string | null
}

interface DonorOption {
  id: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  email?: string
}

interface CampaignOption {
  id: string
  title: string
}

interface SubscriptionListResponse {
  items: SubscriptionItem[]
  total: number
  recurring_enabled: boolean
  summary: {
    counts: {
      active: number
      paused: number
      cancelled: number
      past_due: number
      total: number
    }
    monthly_totals: Record<string, number>
  }
}

const PAGE_SIZE = 50

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  active: { label: 'Aktif', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused: { label: 'Duraklatıldı', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  past_due: { label: 'Tahsilat Bekliyor', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'İptal Edildi', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
}

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'] as const

function statusInfo(status: string) {
  return STATUS_META[status] || { label: status, badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }
}

function formatDateTr(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR')
}

function toDateInputValue(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatCardInfo(sub: SubscriptionItem) {
  if (sub.mode === 'reminder') {
    return sub.day_of_month ? `SMS Hatırlatma (Ayın ${sub.day_of_month}. günü)` : 'SMS Hatırlatma'
  }
  if (sub.card_brand && sub.card_last4) return `${sub.card_brand} · **** ${sub.card_last4}`
  if (sub.has_card_token) return 'Kayıtlı Kart Tokenı'
  return 'SMS Hatırlatma / Manuel'
}

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState<SubscriptionItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [summary, setSummary] = useState<SubscriptionListResponse['summary']>({
    counts: { active: 0, paused: 0, cancelled: 0, past_due: 0, total: 0 },
    monthly_totals: {},
  })

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [nextStart, setNextStart] = useState('')
  const [nextEnd, setNextEnd] = useState('')
  const [sort, setSort] = useState('recent')
  const [showFilters, setShowFilters] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [detailSub, setDetailSub] = useState<SubscriptionItem | null>(null)
  const [detailDonations, setDetailDonations] = useState<SubscriptionDonation[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [donorOptions, setDonorOptions] = useState<DonorOption[]>([])
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([])
  const [createForm, setCreateForm] = useState({
    donor_id: '',
    campaign_id: '',
    amount: '250',
    currency: 'TRY',
    day_of_month: '1',
  })

  const [editing, setEditing] = useState<SubscriptionItem | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('TRY')
  const [editNextDate, setEditNextDate] = useState('')
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (targetPage = page, search = q, st = statusFilter) => {
    setLoading(true)
    try {
      const toCents = (v: string) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : undefined)
      const params: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE,
        sort,
      }
      if (search.trim()) params.q = search.trim()
      if (st !== 'all') params.status = st
      if (currencyFilter) params.currency = currencyFilter
      if (modeFilter) params.mode = modeFilter
      const minC = toCents(minAmount)
      const maxC = toCents(maxAmount)
      if (minC !== undefined) params.min_amount_cents = minC
      if (maxC !== undefined) params.max_amount_cents = maxC
      if (nextStart) params.next_start = nextStart
      if (nextEnd) params.next_end = nextEnd

      const res = await adminGet<SubscriptionListResponse>('/subscriptions', params)
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
      setRecurringEnabled(Boolean(res.data.recurring_enabled))
      if (res.data.summary) setSummary(res.data.summary)
      setSelectedIds(new Set())
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Düzenli bağış kayıtları yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [page, q, statusFilter, currencyFilter, modeFilter, minAmount, maxAmount, nextStart, nextEnd, sort])

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      load(page, q, statusFilter)
      return
    }
    const timer = setTimeout(() => {
      load(page, q, statusFilter)
    }, 200)
    return () => clearTimeout(timer)
  }, [load, page, q, statusFilter])

  const changeStatus = async (sub: SubscriptionItem, nextStatus: SubscriptionStatus) => {
    if (nextStatus === 'cancelled') {
      const ok = await confirmDialog({
        title: 'Talimatı İptal Et',
        text: `${sub.donor_name} (${sub.campaign_title}) düzenli bağış talimatını kalıcı olarak iptal etmek istediğinize emin misiniz?`,
        confirmLabel: 'İptal Et',
        danger: true,
      })
      if (!ok) return
    }

    setBusyId(sub.id)
    try {
      await adminSend('patch', `/subscriptions/${sub.id}`, { status: nextStatus })
      toast.ok(
        nextStatus === 'paused'
          ? 'Talimat duraklatıldı.'
          : nextStatus === 'active'
            ? 'Talimat yeniden aktifleştirildi.'
            : 'Talimat iptal edildi.',
      )
      await load(page, q, statusFilter)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Durum güncellenemedi.'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRetry = async (sub: SubscriptionItem) => {
    setBusyId(sub.id)
    try {
      await adminSend('post', `/subscriptions/${sub.id}/retry`, {})
      toast.ok('Tahsilat denemesi başlatıldı.')
      await load(page, q, statusFilter)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Tahsilat denemesi başlatılamadı.'))
    } finally {
      setBusyId(null)
    }
  }

  const openEdit = (sub: SubscriptionItem) => {
    setEditing(sub)
    setEditAmount(String((sub.amount_cents / 100).toFixed(2)))
    setEditCurrency(sub.currency || 'TRY')
    setEditNextDate(toDateInputValue(sub.next_billing_date))
    setEditStatus((sub.status as SubscriptionStatus) || 'active')
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const parsedAmount = Number(editAmount.replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      toast.error('Geçerli bir tutar girin (en az 1).')
      return
    }
    if (!editNextDate) {
      toast.error('Sonraki çekim tarihini seçin.')
      return
    }

    setSaving(true)
    try {
      const patchPayload: Record<string, unknown> = {
        next_charge_date: new Date(`${editNextDate}T09:00:00Z`).toISOString(),
        status: editStatus,
      }
      if (editing.mode !== 'card') {
        patchPayload.amount_cents = Math.round(parsedAmount * 100)
        patchPayload.currency = editCurrency
      }
      await adminSend('patch', `/subscriptions/${editing.id}`, patchPayload)
      toast.ok('Düzenli bağış talimatı güncellendi.')
      setEditing(null)
      await load(page, q, statusFilter)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Talimat güncellenemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (sub: SubscriptionItem) => {
    setDetailSub(sub)
    setDetailDonations([])
    setLoadingDetail(true)
    try {
      const res = await adminGet<SubscriptionDonation[]>(`/subscriptions/${sub.id}/donations`)
      setDetailDonations(res.data || [])
    } catch {
      setDetailDonations([])
    } finally {
      setLoadingDetail(false)
    }
  }

  const openCreateModal = async () => {
    setCreateOpen(true)
    if (donorOptions.length === 0 || campaignOptions.length === 0) {
      try {
        const [donorsRes, campRes] = await Promise.all([
          v1Get<{ items?: DonorOption[] }>('/donors', { page_size: 200 }),
          v1Get<{ items?: CampaignOption[] }>('/campaigns', { page_size: 200 }),
        ])
        setDonorOptions(donorsRes.data?.items || [])
        setCampaignOptions(campRes.data?.items || [])
      } catch {
        // non-fatal
      }
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.donor_id || !createForm.campaign_id) {
      toast.error('Bağışçı ve kampanya seçimi zorunludur.')
      return
    }
    const parsedAmount = Number(createForm.amount.replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      toast.error('Geçerli bir tutar girin (en az 1).')
      return
    }
    setCreating(true)
    try {
      await adminSend('post', '/subscriptions', {
        donor_id: createForm.donor_id,
        campaign_id: createForm.campaign_id,
        amount_cents: Math.round(parsedAmount * 100),
        currency: createForm.currency,
        day_of_month: Math.min(28, Math.max(1, Number(createForm.day_of_month) || 1)),
      })
      toast.ok('Yeni düzenli bağış hatırlatma talimatı oluşturuldu.')
      setCreateOpen(false)
      setCreateForm({ donor_id: '', campaign_id: '', amount: '250', currency: 'TRY', day_of_month: '1' })
      await load(1, q, statusFilter)
      setPage(1)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Talimat oluşturulamadı.'))
    } finally {
      setCreating(false)
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

  const allSelected = items.length > 0 && items.every((s) => selectedIds.has(s.id))
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map((s) => s.id)))
  }

  const runBulkStatus = async (nextStatus: SubscriptionStatus, label: string) => {
    if (selectedIds.size === 0) return
    if (nextStatus === 'cancelled') {
      const ok = await confirmDialog({
        title: 'Seçili Talimatları İptal Et',
        text: `Seçili ${selectedIds.size} düzenli bağış talimatını kalıcı olarak iptal etmek istediğinize emin misiniz?`,
        confirmLabel: 'İptal Et',
        danger: true,
      })
      if (!ok) return
    }
    setBulkBusy(true)
    try {
      const targets = items.filter((s) => selectedIds.has(s.id) && s.status !== 'cancelled')
      await Promise.all(targets.map((s) => adminSend('patch', `/subscriptions/${s.id}`, { status: nextStatus })))
      toast.ok(`${targets.length} talimat için "${label}" uygulandı.`)
      await load(page, q, statusFilter)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu işlem sırasında hata oluştu.'))
    } finally {
      setBulkBusy(false)
    }
  }

  const monthlyTotalsText = Object.entries(summary.monthly_totals)
    .filter(([, cents]) => cents > 0)
    .map(([curr, cents]) => formatMoney(cents, curr))
    .join(' · ') || formatMoney(0, 'TRY')

  const annualProjectionText = Object.entries(summary.monthly_totals)
    .filter(([, cents]) => cents > 0)
    .map(([curr, cents]) => formatMoney(cents * 12, curr))
    .join(' · ') || formatMoney(0, 'TRY')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: Column<SubscriptionItem>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          aria-label="Tümünü seç"
          className="rounded border-slate-300 accent-emerald-600"
        />
      ),
      render: (sub) => (
        <input
          type="checkbox"
          checked={selectedIds.has(sub.id)}
          onChange={() => toggleSelectId(sub.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${sub.donor_name} seç`}
          className="rounded border-slate-300 accent-emerald-600"
        />
      ),
    },
    {
      key: 'donor',
      header: 'Bağışçı',
      render: (sub) => (
        <div>
          <Link
            href="/admin/bagiscilar"
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
          >
            {sub.donor_name}
          </Link>
          {(sub.donor_email || sub.donor_phone) && (
            <div className="text-xs text-slate-500">
              {[sub.donor_phone, sub.donor_email].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'campaign',
      header: 'Kampanya',
      render: (sub) => <span className="font-medium text-slate-700">{sub.campaign_title}</span>,
    },
    {
      key: 'card',
      header: 'Ödeme Aracı',
      render: (sub) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-mono">
          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
          {formatCardInfo(sub)}
        </span>
      ),
    },
    {
      key: 'next_billing_date',
      header: 'Sonraki Çekim',
      render: (sub) => <span className="text-xs font-medium text-slate-600">{formatDateTr(sub.next_billing_date)}</span>,
    },
    {
      key: 'status',
      header: 'Durum',
      render: (sub) => {
        const info = statusInfo(sub.status)
        return (
          <div className="space-y-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${info.badgeClass}`}>
              {info.label}
            </span>
            {Boolean(sub.failed_attempts && sub.failed_attempts > 0) && (
              <div className="flex items-center gap-1 text-[11px] text-rose-600" title={sub.last_error || undefined}>
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{sub.failed_attempts} deneme</span>
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'amount',
      header: 'Aylık Tutar',
      className: 'text-right',
      render: (sub) => (
        <span className="font-semibold text-slate-900 tabular-nums">
          {formatMoney(sub.amount_cents, sub.currency)} <span className="text-xs text-slate-400 font-normal">/Ay</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'İşlem',
      className: 'text-right',
      render: (sub) => {
        const isBusy = busyId === sub.id
        return (
          <div className="inline-flex items-center justify-end gap-1.5">
            {(() => {
              const wa = whatsappUrl(
                sub.donor_phone,
                `Merhaba ${sub.donor_name}, ${sub.campaign_title} için aylık ${formatMoney(sub.amount_cents, sub.currency)} düzenli bağış talimatınız hakkında bilgilendirmek isteriz.`,
              )
              return wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp ile mesaj gönder"
                  className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-1 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              ) : null
            })()}
            {sub.status === 'active' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => changeStatus(sub, 'paused')}
                title="Duraklat"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5" />
                Duraklat
              </button>
            )}
            {sub.status === 'paused' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => changeStatus(sub, 'active')}
                title="Devam Ettir"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                Devam
              </button>
            )}
            {sub.status === 'past_due' && recurringEnabled && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleRetry(sub)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Çekimi Dene
              </button>
            )}
            <button
              type="button"
              onClick={() => openDetail(sub)}
              title="Detay & Tahsilat Geçmişi"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Detay
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => openEdit(sub)}
              title="Düzenle"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Düzenle
            </button>
            {sub.status !== 'cancelled' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => changeStatus(sub, 'cancelled')}
                title="İptal Et"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                İptal
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Düzenli Ödemeler"
        description="Aylık düzenli bağış talimatlarını görüntüleyin, duraklatın, tutar veya çekim tarihini güncelleyin."
        actions={
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <ExportButtons
                filename="duzenli-odemeler"
                title="Düzenli Ödeme Talimatları"
                subtitle={`${items.length} kayıt`}
                currencyCols={[8]}
                getData={() => ({
                  headers: ['Bağışçı', 'E-posta', 'Telefon', 'Kampanya', 'Ödeme Aracı', 'Sonraki Çekim', 'Durum', 'Tutar', 'Para Birimi'],
                  rows: items.map((s) => [
                    s.donor_name,
                    s.donor_email || '',
                    s.donor_phone || '',
                    s.campaign_title,
                    formatCardInfo(s),
                    formatDateTr(s.next_billing_date),
                    statusInfo(s.status).label,
                    Number((s.amount_cents / 100).toFixed(2)),
                    s.currency,
                  ]),
                })}
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load(page, q, statusFilter)}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button type="button" size="sm" onClick={openCreateModal}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Yeni Talimat
            </Button>
          </div>
        }
      />

      {!recurringEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Otomatik kart çekimi henüz aktif değil</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Ziraat Pay tokenlı tekrarlayan tahsilat yetkisi banka tarafından açılana kadar kartlardan otomatik çekim yapılmaz.
              Bu ekrandan mevcut düzenli bağış talimatlarını takip edebilir, duraklatabilir, güncelleyebilir veya SMS hatırlatmalı yeni talimat açabilirsiniz.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlobalStatCard
          title="Aktif Talimat"
          value={summary.counts.active.toLocaleString('tr-TR')}
          subtitle={`Toplam ${summary.counts.total.toLocaleString('tr-TR')} kayıt`}
          gradient="from-emerald-600 to-teal-700"
          icon={<Repeat className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Aylık Taahhüt (Aktif)"
          value={monthlyTotalsText}
          subtitle={`Yıllık projeksiyon ≈ ${annualProjectionText}`}
          gradient="from-sky-600 to-indigo-700"
          icon={<Wallet className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Duraklatılan"
          value={summary.counts.paused.toLocaleString('tr-TR')}
          subtitle="Geçici olarak bekletilen"
          gradient="from-amber-500 to-orange-600"
          icon={<CalendarClock className="w-5 h-5" />}
        />
        <GlobalStatCard
          title="Bekleyen / İptal"
          value={(summary.counts.cancelled + summary.counts.past_due).toLocaleString('tr-TR')}
          subtitle={`${summary.counts.past_due} tahsilat bekliyor · ${summary.counts.cancelled} iptal`}
          gradient="from-rose-600 to-red-700"
          icon={<Ban className="w-5 h-5" />}
        />
      </div>

      {/* Hızlı Görünüm Sekmeleri */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Talimat durumu">
        {[
          { key: 'all', label: 'Tümü', count: summary.counts.total },
          { key: 'active', label: 'Aktif', count: summary.counts.active },
          { key: 'past_due', label: 'Tahsilat Bekliyor', count: summary.counts.past_due },
          { key: 'paused', label: 'Duraklatıldı', count: summary.counts.paused },
          { key: 'cancelled', label: 'İptal Edildi', count: summary.counts.cancelled },
        ].map((pill) => {
          const active = statusFilter === pill.key
          return (
            <button
              key={pill.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setPage(1)
                setStatusFilter(pill.key)
              }}
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

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs">
          <span className="font-semibold text-emerald-900">
            {selectedIds.size} talimat seçildi
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkStatus('active', 'Aktifleştir')}>
              Aktifleştir
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkStatus('paused', 'Duraklat')}>
              Duraklat
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulkStatus('cancelled', 'İptal Et')}>
              İptal Et
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              Seçimi Temizle
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <FilterBar>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => {
                setPage(1)
                setQ(e.target.value)
              }}
              placeholder="Bağışçı adı, telefon, e-posta veya kampanya ara..."
              className="pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => {
              setPage(1)
              setSort(e.target.value)
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="recent">Son eklenen</option>
            <option value="next_asc">Tahsilat tarihi (Yakın)</option>
            <option value="amount_desc">Tutar (Yüksek → Düşük)</option>
            <option value="amount_asc">Tutar (Düşük → Yüksek)</option>
          </select>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${
              showFilters ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Gelişmiş Filtreler</span>
            {[statusFilter !== 'all' ? statusFilter : '', currencyFilter, modeFilter, minAmount, maxAmount, nextStart, nextEnd].filter(Boolean).length > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">
                {[statusFilter !== 'all' ? statusFilter : '', currencyFilter, modeFilter, minAmount, maxAmount, nextStart, nextEnd].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </FilterBar>

        {showFilters && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Durum</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setPage(1); setStatusFilter(e.target.value) }}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="all">Tüm Durumlar</option>
                  <option value="active">Aktif</option>
                  <option value="paused">Duraklatıldı</option>
                  <option value="past_due">Tahsilat Bekliyor</option>
                  <option value="cancelled">İptal Edildi</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Para Birimi</label>
                <select
                  value={currencyFilter}
                  onChange={(e) => { setPage(1); setCurrencyFilter(e.target.value) }}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="">Tümü</option>
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Tahsilat Şekli</label>
                <select
                  value={modeFilter}
                  onChange={(e) => { setPage(1); setModeFilter(e.target.value) }}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="">Tümü</option>
                  <option value="card">Otomatik Kart</option>
                  <option value="reminder">SMS Hatırlatma</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Tutar (Min - Maks)</label>
                <div className="flex gap-1.5">
                  <Input inputMode="decimal" placeholder="Min" value={minAmount} onChange={(e) => { setPage(1); setMinAmount(e.target.value) }} />
                  <Input inputMode="decimal" placeholder="Maks" value={maxAmount} onChange={(e) => { setPage(1); setMaxAmount(e.target.value) }} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Sonraki Tahsilat</label>
                <div className="flex gap-1.5">
                  <Input type="date" value={nextStart} onChange={(e) => { setPage(1); setNextStart(e.target.value) }} />
                  <Input type="date" value={nextEnd} onChange={(e) => { setPage(1); setNextEnd(e.target.value) }} />
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all'); setCurrencyFilter(''); setModeFilter(''); setMinAmount(''); setMaxAmount(''); setNextStart(''); setNextEnd(''); setPage(1)
                }}
                className="cursor-pointer text-xs font-semibold text-rose-600 hover:underline"
              >
                Filtreleri temizle
              </button>
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(sub) => sub.id}
        loading={loading}
        empty="Kayıtlı düzenli bağış talimatı bulunmamaktadır."
      />

      {total > PAGE_SIZE && (
        <Pagination page={page} pages={totalPages} total={total} onChange={setPage} />
      )}

      {editing && (
        <Modal
          title="Talimatı Düzenle"
          description={`${editing.donor_name} · ${editing.campaign_title}`}
          onClose={() => setEditing(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Vazgeç
              </Button>
              <Button type="submit" form="edit-subscription-form" disabled={saving}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </div>
          }
        >
          <form id="edit-subscription-form" onSubmit={handleSaveEdit} className="space-y-4">
            {editing.mode === 'card' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                Kartlı talimatlarda tutar ve para birimini güvenlik gereği yalnızca bağışçı kendi panelinden değiştirebilir.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Aylık Tutar</label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  disabled={editing.mode === 'card'}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Para Birimi</label>
                <select
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  disabled={editing.mode === 'card'}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sonraki Çekim Tarihi</label>
                <Input
                  type="date"
                  value={editNextDate}
                  onChange={(e) => setEditNextDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Durum</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as SubscriptionStatus)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="active">Aktif</option>
                  <option value="paused">Duraklatıldı</option>
                  <option value="past_due">Tahsilat Bekliyor</option>
                  <option value="cancelled">İptal Edildi</option>
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {createOpen && (
        <Modal
          title="Yeni Düzenli Bağış Talimatı"
          description="Her ay otomatik SMS hatırlatma linki gönderilecek yeni bir talimat oluşturun."
          onClose={() => setCreateOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Vazgeç
              </Button>
              <Button type="submit" form="create-subscription-form" disabled={creating}>
                {creating ? 'Oluşturuluyor...' : 'Talimat Oluştur'}
              </Button>
            </div>
          }
        >
          <form id="create-subscription-form" onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bağışçı *</label>
              <select
                value={createForm.donor_id}
                onChange={(e) => setCreateForm({ ...createForm, donor_id: e.target.value })}
                className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                required
              >
                <option value="">Bağışçı seçin...</option>
                {donorOptions.map((d) => {
                  const name = d.full_name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.email || d.phone || d.id
                  return (
                    <option key={d.id} value={d.id}>
                      {name} {d.phone ? `(${d.phone})` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kampanya / Bağış Kalemi *</label>
              <select
                value={createForm.campaign_id}
                onChange={(e) => setCreateForm({ ...createForm, campaign_id: e.target.value })}
                className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                required
              >
                <option value="">Kampanya seçin...</option>
                {campaignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Aylık Tutar *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={createForm.amount}
                  onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Para Birimi</label>
                <select
                  value={createForm.currency}
                  onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ayın Günü (1-28)</label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={createForm.day_of_month}
                  onChange={(e) => setCreateForm({ ...createForm, day_of_month: e.target.value })}
                  required
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {detailSub && (
        <Modal
          title="Talimat Detayı & Tahsilat Geçmişi"
          description={`${detailSub.donor_name} · ${detailSub.campaign_title}`}
          onClose={() => setDetailSub(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDetailSub(null)}>
                Kapat
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
              <div>
                <div className="text-slate-500">Aylık Tutar</div>
                <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                  {formatMoney(detailSub.amount_cents, detailSub.currency)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Ödeme Aracı</div>
                <div className="font-semibold text-slate-800 mt-0.5">{formatCardInfo(detailSub)}</div>
              </div>
              <div>
                <div className="text-slate-500">Sonraki Çekim</div>
                <div className="font-semibold text-slate-800 mt-0.5">{formatDateTr(detailSub.next_billing_date)}</div>
              </div>
              <div>
                <div className="text-slate-500">Son Tahsilat / Hatırlatma</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {formatDateTr(detailSub.last_charged_at || detailSub.last_reminded_at)}
                </div>
              </div>
            </div>

            {detailSub.last_error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <span className="font-semibold">Son Hata ({detailSub.failed_attempts || 0} deneme):</span> {detailSub.last_error}
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">İlgili Bağış Geçmişi (Son 20)</div>
              {loadingDetail ? (
                <div className="py-6 text-center text-xs text-slate-400">Geçmiş yükleniyor...</div>
              ) : detailDonations.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed rounded-lg">
                  Bu kampanya ve bağışçı için kayıtlı ödeme bulunamadı.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {detailDonations.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {formatMoney(d.amount_cents, d.currency)}
                        </span>
                        <span className="text-slate-400 ml-2">{formatDateTr(d.created_at)}</span>
                        {d.receipt_number && (
                          <span className="ml-2 font-mono text-[11px] text-slate-500">{d.receipt_number}</span>
                        )}
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
