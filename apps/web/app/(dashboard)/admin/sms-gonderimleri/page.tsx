'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Copy, Download, Eye, Layers, MessageSquarePlus, MousePointerClick, RefreshCw, RotateCcw, Search, Send, SlidersHorizontal, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, whatsappUrl, can } from '../../../../lib/admin-access'
import { Label, Notice, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { SOURCE_LABEL, STATUS_CLASS, STATUS_LABEL, SmsMessage, SmsStatus } from '../../../../lib/sms'
import { ExportButtons, PageHeader, Pagination, TBody, THead, Table, Td, Th, Tr, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'

interface Account {
  provider: string | null
  own_account: boolean
  balance: { text: string; amount: number | null; unit: string } | null
}
interface Listing {
  items: SmsMessage[]
  total: number
  counts: Record<SmsStatus, number>
  parts_sent: number
  batch_name?: string | null
  error_summary?: { error: string; count: number }[]
}

// 'queued,scheduled' is the "Bekleyen" card.
type StatusFilter = '' | SmsStatus | 'queued,scheduled'
const TABS: [StatusFilter, string][] = [
  ['', 'Tümü'],
  ['queued,scheduled', 'Bekleyen'],
  ['queued', 'Kuyrukta'],
  ['scheduled', 'Zamanlanan'],
  ['sent', 'Gönderilen'],
  ['delivered', 'İletilen'],
  ['failed', 'Başarısız'],
  ['cancelled', 'İptal'],
]
const PAGE_SIZE = 50
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function SmsLogPage() {
  const { data: access } = useAdminAccess()
  const canSend = can(access, 'sms.send')
  const [status, setStatus] = useState<StatusFilter>('')
  const [batchId, setBatchId] = useState('')
  const [source, setSource] = useState('')
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<'date_desc' | 'date_asc' | 'parts_desc'>('date_desc')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Listing | null>(null)
  const [detailRow, setDetailRow] = useState<SmsMessage | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [retryingAll, setRetryingAll] = useState(false)
  const [refreshingDlr, setRefreshingDlr] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [quickSmsOpen, setQuickSmsOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const st = sp.get('status') as StatusFilter | null
    const bId = sp.get('batch_id')
    if (st && TABS.some(([k]) => k === st)) setStatus(st)
    if (bId) setBatchId(bId)
  }, [])

  const params = {
    status: status || undefined,
    source: source || undefined,
    batch_id: batchId || undefined,
    q: q.trim() || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort,
  }
  const latest = useRef(params)
  latest.current = params

  const load = async (silent = false) => {
    try {
      setData((await adminGet<Listing>('/sms/messages', { ...latest.current, page, page_size: PAGE_SIZE })).data)
    } catch (err) {
      if (!silent) setMessage({ type: 'error', text: apiErrorMessage(err, 'SMS kayıtları yüklenemedi') })
    }
  }

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      load()
      return
    }
    const t = setTimeout(() => load(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, source, batchId, q, dateFrom, dateTo, sort, page])

  useEffect(() => {
    adminGet<Account>('/sms/account')
      .then((r) => setAccount(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!detailRow) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailRow(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailRow])

  // While something is waiting to be sent, keep the list fresh.
  const waiting = (data?.counts.queued || 0) > 0
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => load(true), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, page])

  const act = async (m: SmsMessage, action: 'retry' | 'cancel') => {
    if (action === 'cancel' && !(await confirmDialog(`#${m.seq_no} numaralı SMS iptal edilsin mi?`))) return
    try {
      await adminSend('post', `/sms/messages/${m.id}/${action}`)
      setMessage({ type: 'ok', text: action === 'cancel' ? `#${m.seq_no} iptal edildi` : `#${m.seq_no} yeniden kuyruğa alındı` })
      if (detailRow?.id === m.id) setDetailRow(null)
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const failedRetryable = (data?.items || []).filter((m) => m.status === 'failed' && m.source !== 'otp')
  const retryFailed = async () => {
    const failedTotal = counts?.failed || 0
    if (!failedTotal || retryingAll) return
    if (!(await confirmDialog(`Filtredeki başarısız SMS'ler (en fazla 1.000 adet) tekrar kuyruğa alınsın mı?`))) return
    setRetryingAll(true)
    setMessage(null)
    try {
      const res = await adminSend<{ retried: number }>('post', '/sms/messages/bulk-retry', {
        batch_id: batchId || null,
        source: source || null,
      })
      setMessage({ type: 'ok', text: `${res.data.retried.toLocaleString('tr-TR')} başarısız SMS yeniden kuyruğa alındı.` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Toplu yeniden gönderim başlatılamadı') })
    } finally {
      setRetryingAll(false)
    }
  }

  const bulkRetrySelected = async () => {
    if (!picked.size) return
    if (!(await confirmDialog(`Seçilen ${picked.size} SMS içinden başarısız/iptal olanlar tekrar kuyruğa alınsın mı?`))) return
    try {
      const res = await adminSend<{ retried: number }>('post', '/sms/messages/bulk-retry', { ids: Array.from(picked) })
      setMessage({ type: 'ok', text: `${res.data.retried} SMS yeniden kuyruğa alındı.` })
      setPicked(new Set())
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const bulkCancelSelected = async () => {
    if (!picked.size) return
    if (!(await confirmDialog(`Seçilen ${picked.size} SMS içinden bekleyenler iptal edilsin mi?`))) return
    try {
      const res = await adminSend<{ cancelled: number }>('post', '/sms/messages/bulk-cancel', { ids: Array.from(picked) })
      setMessage({ type: 'ok', text: `${res.data.cancelled} bekleyen SMS iptal edildi.` })
      setPicked(new Set())
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const refreshReports = async () => {
    if (refreshingDlr) return
    setRefreshingDlr(true)
    setMessage(null)
    try {
      const res = await adminSend<{ asked: number; delivered: number; failed: number }>('post', '/sms/reports/refresh')
      setMessage({
        type: 'ok',
        text: res.data.asked
          ? `${res.data.asked} SMS için rapor sorgulandı: ${res.data.delivered} iletildi, ${res.data.failed} başarısız.`
          : 'Şu an rapor sorgulanacak bekleyen SMS yok.',
      })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'İletim raporları sorgulanamadı') })
    } finally {
      setRefreshingDlr(false)
    }
  }

  const exportAllCsv = async () => {
    if (exportingCsv) return
    setExportingCsv(true)
    try {
      const res = await adminGet<string>('/sms/messages/export', latest.current)
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sms-gonderimleri-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'CSV indirilemedi') })
    } finally {
      setExportingCsv(false)
    }
  }

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allPicked = Boolean(data?.items.length && data.items.every((m) => picked.has(m.id)))
  const toggleAll = () => {
    if (!data?.items.length) return
    if (allPicked) setPicked(new Set())
    else setPicked(new Set(data.items.map((m) => m.id)))
  }

  const copyText = (key: string, value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    })
  }

  const advFilterCount = [source, dateFrom, dateTo].filter(Boolean).length
  const hasFilters = Boolean(status || source || batchId || q.trim() || dateFrom || dateTo)
  const clearFilters = () => {
    setStatus('')
    setBatchId('')
    setSource('')
    setQ('')
    setDateFrom('')
    setDateTo('')
    setSort('date_desc')
    setPage(1)
  }

  const counts = data?.counts
  const all = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  const deliveredCount = counts?.delivered || 0
  const sentOnlyCount = counts?.sent || 0
  const sentOrDelivered = sentOnlyCount + deliveredCount
  const deliveryBase = sentOrDelivered + (counts?.failed || 0)
  const deliveryRate = deliveryBase > 0 ? Math.round((deliveredCount / deliveryBase) * 1000) / 10 : null
  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Gönderimleri"
        description={<>Kurumdan çıkan her SMS burada: elle gönderilenler, makbuz ve havale bildirimleri, zamanlananlar.</>}
        actions={
          <div className="flex flex-wrap shrink-0 gap-2 whitespace-nowrap">
            {canSend && (
              <button type="button" onClick={() => setQuickSmsOpen(true)} className={`${primaryButton} inline-flex items-center gap-1.5`}>
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Tekil SMS Gönder
              </button>
            )}
            <Link href="/admin/broadcast" className={ghostButton}>
              + Toplu SMS Gönder
            </Link>
            <Link href="/admin/sms" className={ghostButton}>
              Şablonlar
            </Link>
            {canSend && sentOnlyCount > 0 && (
              <button
                type="button"
                disabled={refreshingDlr}
                onClick={refreshReports}
                className={`${ghostButton} inline-flex items-center gap-1`}
                title="Operatörden iletim raporlarını şimdi sorgula"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingDlr ? 'animate-spin' : ''}`} />
                {refreshingDlr ? 'Sorgulanıyor…' : 'Raporları Sorgula'}
              </button>
            )}
            <button type="button" onClick={() => load()} className={`${ghostButton} inline-flex items-center gap-1`}>
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </button>
            {(data?.total ?? 0) > 0 && (
              <>
                <button
                  type="button"
                  disabled={exportingCsv}
                  onClick={exportAllCsv}
                  className={`${ghostButton} inline-flex items-center gap-1`}
                  title="Filtredeki tüm kayıtları (50.000'e kadar) CSV olarak indir"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingCsv ? 'İndiriliyor…' : 'Tümünü CSV İndir'}
                </button>
                <ExportButtons
                  filename="sms-gonderimleri"
                  title="SMS Gönderim Kayıtları"
                  subtitle={`Toplam ${data?.total ?? 0} kayıt (sayfa görünümü)`}
                  getData={() => ({
                    headers: ['No', 'Tarih', 'Alıcı', 'Telefon', 'Mesaj', 'Kaynak', 'SMS', 'Durum', 'Hata'],
                    rows: (data?.items || []).map((m) => [
                      m.seq_no,
                      when(m.created_at),
                      m.donor_name || '—',
                      m.phone,
                      m.body,
                      SOURCE_LABEL[m.source] || m.source,
                      m.parts,
                      STATUS_LABEL[m.status],
                      m.error || '',
                    ]),
                  })}
                />
              </>
            )}
          </div>
        }
      />

      <Notice message={message} />

      {account && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="text-gray-500">SMS hesabı:</span>
          <strong className="text-gray-900">{account.own_account ? account.provider : 'Platform hesabı'}</strong>
          {account.own_account && (
            <span className="text-gray-500">
              Kalan bakiye: <strong className="text-gray-900">{account.balance?.text || 'sorgulanamadı'}</strong>
            </span>
          )}
          <Link href="/admin/odeme-sms" className="ml-auto text-xs font-bold text-primary-700 hover:underline">
            Hesap ayarları
          </Link>
        </div>
      )}

      {batchId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-900">
          <span>
            Yalnızca{' '}
            <strong>{data?.batch_name ? `"${data.batch_name}"` : 'seçilen toplu SMS gönderimine'}</strong> ait kayıtlar listeleniyor.
          </span>
          <button
            type="button"
            onClick={() => {
              setBatchId('')
              setPage(1)
            }}
            className="cursor-pointer font-bold text-sky-800 hover:underline"
          >
            Tüm gönderimlere dön
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <button type="button" onClick={() => { setStatus('sent'); setPage(1) }} className="text-left transition hover:border-primary-300 hover:shadow-md flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-gray-500">Gönderilen</div>
            <div className="text-xl font-black tabular-nums text-green-700">{sentOrDelivered.toLocaleString('tr-TR')}</div>
            {sentOnlyCount > 0 && <div className="text-[10px] text-gray-400">{sentOnlyCount.toLocaleString('tr-TR')} operatörde</div>}
          </div>
        </button>
        <button type="button" onClick={() => { setStatus('queued,scheduled'); setPage(1) }} className="text-left transition hover:border-primary-300 hover:shadow-md flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-gray-500">Bekleyen</div>
            <div className="text-xl font-black tabular-nums text-amber-700">
              {((counts?.queued || 0) + (counts?.scheduled || 0)).toLocaleString('tr-TR')}
            </div>
          </div>
        </button>
        <button type="button" onClick={() => { setStatus('failed'); setPage(1) }} className="text-left transition hover:border-primary-300 hover:shadow-md flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-gray-500">Başarısız</div>
            <div className="text-xl font-black tabular-nums text-red-700">{(counts?.failed || 0).toLocaleString('tr-TR')}</div>
          </div>
        </button>
        <button type="button" onClick={() => { setStatus('delivered'); setPage(1) }} className="text-left transition hover:border-primary-300 hover:shadow-md flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-gray-500">Gerçek İletim</div>
            <div className="text-xl font-black tabular-nums text-emerald-700">
              {deliveryRate !== null ? `%${deliveryRate.toLocaleString('tr-TR')}` : '—'}
            </div>
            <div className="text-[10px] text-gray-400">{deliveredCount.toLocaleString('tr-TR')} telefona ulaştı</div>
          </div>
        </button>
        <button type="button" onClick={() => { setStatus(''); setPage(1) }} className="text-left transition hover:border-primary-300 hover:shadow-md col-span-2 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-xs md:col-span-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-gray-500">Toplam Parça</div>
            <div className="text-xl font-black tabular-nums text-gray-900">{(data?.parts_sent || 0).toLocaleString('tr-TR')}</div>
          </div>
        </button>
      </div>

      {data?.error_summary && data.error_summary.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50/60 px-4 py-2.5 text-xs">
          <span className="font-bold text-red-800">Başarısızlık Dağılımı:</span>
          {data.error_summary.map((e) => (
            <span key={e.error} className="rounded-lg border border-red-200 bg-white px-2.5 py-0.5 font-medium text-red-700">
              {e.error}: <strong>{e.count}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setStatus(key)
              setPage(1)
            }}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition ${
              status === key ? 'bg-primary-600 text-white' : 'border bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {label} ({key === 'queued,scheduled' ? (counts?.queued || 0) + (counts?.scheduled || 0) : key ? counts?.[key] || 0 : all})
          </button>
        ))}
        {canSend && failedRetryable.length > 0 && (
          <button
            type="button"
            disabled={retryingAll}
            onClick={retryFailed}
            className="ml-auto cursor-pointer rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {retryingAll ? 'Gönderiliyor…' : `Başarısızları tekrar gönder (${failedRetryable.length})`}
          </button>
        )}
      </div>

      <Card className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Ad, telefon, mesaj veya #no ile ara..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select
            className={`${inputClass} w-44`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as 'date_desc' | 'date_asc' | 'parts_desc')
              setPage(1)
            }}
          >
            <option value="date_desc">Tarih (Yeni → Eski)</option>
            <option value="date_asc">Tarih (Eski → Yeni)</option>
            <option value="parts_desc">SMS Parçası (Çok → Az)</option>
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
            {advFilterCount > 0 && <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] text-white">{advFilterCount}</span>}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="cursor-pointer text-xs font-semibold text-rose-600 hover:underline">
              Temizle
            </button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Hızlı Tarih:</span>
              {(() => {
                const now = new Date()
                const pad = (n: number) => String(n).padStart(2, '0')
                const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                const todayStr = iso(now)
                const last7 = new Date(now)
                last7.setDate(now.getDate() - 6)
                const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
                return (
                  [
                    ['Bugün', todayStr, todayStr],
                    ['Son 7 Gün', iso(last7), todayStr],
                    ['Bu Ay', monthStart, todayStr],
                  ] as const
                ).map(([label, s, e]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setDateFrom(s)
                      setDateTo(e)
                      setPage(1)
                    }}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      dateFrom === s && dateTo === e
                        ? 'border-primary-600 bg-primary-50 text-primary-800'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))
              })()}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Label label="Kaynak">
                <select
                  className={inputClass}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Tüm kaynaklar</option>
                  {Object.entries(SOURCE_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Label>
              <Label label="Başlangıç Tarihi">
                <input
                  type="date"
                  className={inputClass}
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                />
              </Label>
              <Label label="Bitiş Tarihi">
                <input
                  type="date"
                  className={inputClass}
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                />
              </Label>
            </div>
          </div>
        )}

        {canSend && picked.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-2 text-xs">
            <span className="font-bold text-primary-900">{picked.size} SMS seçildi</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={bulkRetrySelected}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary-600 px-3 py-1 font-bold text-white hover:bg-primary-700"
              >
                <RotateCcw className="h-3 w-3" />
                Seçilenleri Tekrar Gönder
              </button>
              <button
                type="button"
                onClick={bulkCancelSelected}
                className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-1 font-bold text-red-700 hover:bg-red-50"
              >
                Bekleyenleri İptal Et
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className="cursor-pointer font-semibold text-gray-600 hover:underline">
                Seçimi Temizle
              </button>
            </div>
          </div>
        )}

        {!data ? (
          <p className="animate-pulse py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
        ) : data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Kayıt yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-8">
                    <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Tümünü seç" />
                  </Th>
                  <Th>No</Th>
                  <Th>Tarih</Th>
                  <Th>Alıcı</Th>
                  <Th>Mesaj</Th>
                  <Th>Kaynak</Th>
                  <Th>Durum</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {data.items.map((m) => (
                  <Tr key={m.id} className="align-top hover:bg-gray-50/60">
                    <Td>
                      <input type="checkbox" checked={picked.has(m.id)} onChange={() => togglePick(m.id)} aria-label={`#${m.seq_no} seç`} />
                    </Td>
                    <Td className="font-bold text-gray-900">#{m.seq_no}</Td>
                    <Td className="whitespace-nowrap text-gray-500">
                      {when(m.created_at)}
                      {m.status === 'scheduled' && <div className="font-semibold text-sky-700">→ {when(m.send_after)}</div>}
                    </Td>
                    <Td>
                      {m.donor_id ? (
                        <Link href={`/admin/bagiscilar/${m.donor_id}`} className="font-semibold text-primary-700 hover:underline">
                          {m.donor_name || 'Bağışçı'}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-gray-500">
                        <span>+{m.phone}</span>
                        <button
                          type="button"
                          onClick={() => copyText(`phone-${m.id}`, `+${m.phone}`)}
                          title="Numarayı kopyala"
                          className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          {copiedKey === `phone-${m.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </Td>
                    <Td className="max-w-md">
                      <button
                        type="button"
                        onClick={() => setDetailRow(m)}
                        className="line-clamp-2 cursor-pointer text-left text-gray-700 hover:text-gray-950"
                        title="Detayları görmek için tıklayın"
                      >
                        {m.body}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400">
                        <span>{m.parts} SMS</span>
                        {m.ab_variant && (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700">Varyant {m.ab_variant}</span>
                        )}
                        {(m.click_count ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 font-bold text-sky-700">
                            <MousePointerClick className="h-2.5 w-2.5" />
                            {m.click_count} tık
                          </span>
                        )}
                        {m.template_name && <span>· {m.template_name}</span>}
                        {m.created_by && <span>· {m.created_by}</span>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-gray-600">{SOURCE_LABEL[m.source] || m.source}</Td>
                    <Td>
                      <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[m.status]}`}>
                        {STATUS_LABEL[m.status]}
                      </span>
                      {m.error && <div className="mt-1 max-w-[220px] text-[10px] text-red-600">{m.error}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailRow(m)}
                          title="Detay"
                          className="cursor-pointer rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {(() => {
                          const wa = m.source !== 'otp' ? whatsappUrl(m.phone, m.body) : null
                          return wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Aynı mesajı WhatsApp ile gönder"
                              className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-0.5 text-[11px] font-bold text-[#128C7E] hover:bg-[#25D366]/20"
                            >
                              <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                          ) : null
                        })()}
                        {canSend && m.source !== 'otp' && (m.status === 'failed' || m.status === 'cancelled') && (
                          <button onClick={() => act(m, 'retry')} className="cursor-pointer font-bold text-primary-700 hover:underline">
                            Tekrar gönder
                          </button>
                        )}
                        {canSend && m.status === 'scheduled' && (
                          <button onClick={() => act(m, 'retry')} className="cursor-pointer font-bold text-primary-700 hover:underline">
                            Şimdi gönder
                          </button>
                        )}
                        {canSend && (m.status === 'scheduled' || m.status === 'queued') && (
                          <button onClick={() => act(m, 'cancel')} className="cursor-pointer font-bold text-red-600 hover:underline">
                            İptal
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        {data && <Pagination page={page} pages={pages} total={data.total} onChange={setPage} />}
      </Card>

      {/* SMS Detay Modalı */}
      {detailRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">SMS #{detailRow.seq_no}</h2>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[detailRow.status]}`}>
                  {STATUS_LABEL[detailRow.status]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="cursor-pointer rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3.5">
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Alıcı</div>
                  <div className="mt-0.5 font-bold text-gray-900">{detailRow.donor_name || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Telefon</div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono font-bold text-gray-900">
                    <span>+{detailRow.phone}</span>
                    <button
                      type="button"
                      onClick={() => copyText('modal-phone', `+${detailRow.phone}`)}
                      className="cursor-pointer rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700"
                    >
                      {copiedKey === 'modal-phone' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Kaynak</div>
                  <div className="mt-0.5 font-semibold text-gray-700">{SOURCE_LABEL[detailRow.source] || detailRow.source}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Sağlayıcı / Parça</div>
                  <div className="mt-0.5 font-semibold text-gray-700">
                    {detailRow.provider || '—'} · {detailRow.parts} SMS ({detailRow.attempts} deneme)
                  </div>
                  {detailRow.provider_ref && (
                    <div className="mt-0.5 font-mono text-[10px] text-gray-400">Ref: {detailRow.provider_ref}</div>
                  )}
                </div>
              </div>

              {/* Visual Lifecycle Timeline */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
                <div className="mb-2.5 text-[10px] font-bold uppercase text-gray-400">Teslimat Yaşam Döngüsü</div>
                <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                  <div className="space-y-1">
                    <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-bold text-gray-800">Kuyruk</div>
                    <div className="font-mono text-[9px] text-gray-400">{when(detailRow.created_at)}</div>
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                        detailRow.sent_at ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      <Send className="h-3 w-3" />
                    </div>
                    <div className="font-bold text-gray-800">Operatör</div>
                    <div className="font-mono text-[9px] text-gray-400">{when(detailRow.sent_at)}</div>
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                        detailRow.delivered_at
                          ? 'bg-emerald-500 text-white'
                          : detailRow.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {detailRow.status === 'failed' ? <X className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </div>
                    <div className="font-bold text-gray-800">{detailRow.status === 'failed' ? 'Başarısız' : 'İletildi'}</div>
                    <div className="font-mono text-[9px] text-gray-400">{when(detailRow.delivered_at)}</div>
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                        (detailRow.click_count ?? 0) > 0 ? 'bg-sky-500 text-white' : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      <MousePointerClick className="h-3 w-3" />
                    </div>
                    <div className="font-bold text-gray-800">Tıklama ({detailRow.click_count ?? 0})</div>
                    <div className="font-mono text-[9px] text-gray-400">{when(detailRow.clicked_at)}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-gray-500">Mesaj İçeriği</span>
                  <button
                    type="button"
                    onClick={() => copyText('modal-body', detailRow.body)}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-primary-700 hover:underline"
                  >
                    {copiedKey === 'modal-body' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedKey === 'modal-body' ? 'Kopyalandı' : 'Metni Kopyala'}
                  </button>
                </div>
                <div className="whitespace-pre-line rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm leading-relaxed text-gray-800">
                  {detailRow.body}
                </div>
              </div>

              {detailRow.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  Hata: {detailRow.error}
                </div>
              )}

              <div className="space-y-1.5 rounded-xl border border-gray-100 p-3.5">
                <div className="text-[10px] font-bold uppercase text-gray-400">Zaman Çizelgesi</div>
                <div className="flex justify-between text-gray-600">
                  <span>Oluşturulma:</span>
                  <span className="font-mono font-semibold text-gray-900">{when(detailRow.created_at)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Planlanan Gönderim:</span>
                  <span className="font-mono font-semibold text-gray-900">{when(detailRow.send_after)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Gönderilme:</span>
                  <span className="font-mono font-semibold text-gray-900">{when(detailRow.sent_at)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>İletilme:</span>
                  <span className="font-mono font-semibold text-gray-900">{when(detailRow.delivered_at)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {detailRow.related_type === 'donation' && detailRow.related_id && (
                  <Link
                    href={`/admin/bagislar?q=${detailRow.related_id}`}
                    className={`${ghostButton} mr-auto`}
                  >
                    İlgili Bağışı Gör
                  </Link>
                )}
                {canSend && detailRow.source !== 'otp' && (detailRow.status === 'failed' || detailRow.status === 'cancelled') && (
                  <button
                    type="button"
                    onClick={() => act(detailRow, 'retry')}
                    className="cursor-pointer rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
                  >
                    Tekrar Gönder
                  </button>
                )}
                <button type="button" onClick={() => setDetailRow(null)} className={ghostButton}>
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {quickSmsOpen && (
        <QuickSmsDialog
          target={{ allowSms: true }}
          onClose={() => setQuickSmsOpen(false)}
          onSent={(res) => {
            setMessage({ type: 'ok', text: sentNotice(res) })
            load()
          }}
        />
      )}
    </div>
  )
}
