'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ban, CalendarClock, CreditCard, Download, Edit3, Info, Pause, Play, RefreshCw, Repeat, Search, Wallet } from 'lucide-react'
import { Button, Input } from '@e-infak/ui'
import {
  Column,
  DataTable,
  FilterBar,
  Modal,
  PageHeader,
  Pagination,
  StatCard,
  confirmDialog,
  toast,
} from '../../../../components/admin/ui'
import {
  adminGet,
  adminSend,
  apiErrorMessage,
  exportCsv,
  formatMoney,
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
  has_card_token?: boolean
  card_brand?: string | null
  card_last4?: string | null
  next_billing_date?: string | null
  created_at?: string | null
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
  if (sub.card_brand && sub.card_last4) return `${sub.card_brand} · **** ${sub.card_last4}`
  if (sub.has_card_token) return 'Kayıtlı Kart Tokenı'
  return 'Manuel / Token Yok'
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
  const [busyId, setBusyId] = useState<string | null>(null)

  const [editing, setEditing] = useState<SubscriptionItem | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('TRY')
  const [editNextDate, setEditNextDate] = useState('')
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('active')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (targetPage = page, search = q, st = statusFilter) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE,
      }
      if (search.trim()) params.q = search.trim()
      if (st !== 'all') params.status = st

      const res = await adminGet<SubscriptionListResponse>('/subscriptions', params)
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
      setRecurringEnabled(Boolean(res.data.recurring_enabled))
      if (res.data.summary) setSummary(res.data.summary)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Düzenli bağış kayıtları yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [page, q, statusFilter])

  useEffect(() => {
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
      await adminSend('patch', `/subscriptions/${editing.id}`, {
        amount_cents: Math.round(parsedAmount * 100),
        currency: editCurrency,
        next_charge_date: new Date(`${editNextDate}T09:00:00Z`).toISOString(),
        status: editStatus,
      })
      toast.ok('Düzenli bağış talimatı güncellendi.')
      setEditing(null)
      await load(page, q, statusFilter)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Talimat güncellenemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const monthlyTotalsText = Object.entries(summary.monthly_totals)
    .filter(([, cents]) => cents > 0)
    .map(([curr, cents]) => formatMoney(cents, curr))
    .join(' · ') || formatMoney(0, 'TRY')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: Column<SubscriptionItem>[] = [
    {
      key: 'donor',
      header: 'Bağışçı',
      render: (sub) => (
        <div>
          <div className="font-semibold text-slate-900">{sub.donor_name}</div>
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
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${info.badgeClass}`}>
            {info.label}
          </span>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportCsv(
                    'duzenli-odemeler.csv',
                    ['Bağışçı', 'E-posta', 'Telefon', 'Kampanya', 'Ödeme Aracı', 'Sonraki Çekim', 'Durum', 'Tutar', 'Para Birimi'],
                    items.map((s) => [
                      s.donor_name,
                      s.donor_email || '',
                      s.donor_phone || '',
                      s.campaign_title,
                      formatCardInfo(s),
                      formatDateTr(s.next_billing_date),
                      statusInfo(s.status).label,
                      (s.amount_cents / 100).toFixed(2),
                      s.currency,
                    ]),
                  )
                }
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                CSV
              </Button>
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
              Bu ekrandan mevcut düzenli bağış talimatlarını takip edebilir, duraklatabilir, güncelleyebilir veya iptal edebilirsiniz.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Aktif Talimat"
          value={String(summary.counts.active)}
          hint={`Toplam ${summary.counts.total} kayıt`}
          tone="good"
          icon={Repeat}
        />
        <StatCard
          label="Aylık Taahhüt (Aktif)"
          value={monthlyTotalsText}
          hint="Aktif talimatların aylık toplamı"
          tone="brand"
          icon={Wallet}
        />
        <StatCard
          label="Duraklatılan"
          value={String(summary.counts.paused)}
          hint="Geçici olarak bekletilen"
          tone="warn"
          icon={CalendarClock}
        />
        <StatCard
          label="İptal / Sorunlu"
          value={String(summary.counts.cancelled + summary.counts.past_due)}
          hint={`${summary.counts.past_due} tahsilat bekliyor · ${summary.counts.cancelled} iptal`}
          tone="bad"
          icon={Ban}
        />
      </div>

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
          value={statusFilter}
          onChange={(e) => {
            setPage(1)
            setStatusFilter(e.target.value)
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">Tüm Durumlar</option>
          <option value="active">Aktif</option>
          <option value="paused">Duraklatıldı</option>
          <option value="past_due">Tahsilat Bekliyor</option>
          <option value="cancelled">İptal Edildi</option>
        </select>
      </FilterBar>

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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Aylık Tutar</label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Para Birimi</label>
                <select
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
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
    </div>
  )
}
