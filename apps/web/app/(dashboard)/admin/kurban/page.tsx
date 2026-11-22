'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Card, Input } from '@e-infak/ui'
import {
  Beef,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  HandCoins,
  IdCard,
  LayoutGrid,
  ListPlus,
  MailCheck,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Table2,
  Trash2,
  Users,
  Video,
} from 'lucide-react'
import { adminGet, apiErrorMessage, downloadFile, formatMoney, useAdminAccess, v1Get, v1Send, whatsappUrl, can } from '../../../../lib/admin-access'
import { KurbanCountriesModal, useKurbanCountries } from '../../../../components/admin/kurban/KurbanCountries'
import { type SmsTemplate, updateSmsTemplateBody } from '../../../../lib/sms'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { ManualReceiptForm } from '../../../../components/admin/ManualReceiptForm'
import { KurbanBulkEntry, downloadShareCards } from '../../../../components/admin/kurban/KurbanBulkEntry'
import { EmptyState, ExportButtons, Modal, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, confirmDialog, toast } from '../../../../components/admin/ui'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, ResponsiveDataToolbar } from '../../../../components/admin/muhasebe/OnMuhasebeUI'

const SHARE_PAGE_SIZE = 500

function formatDateTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(d)
}

interface KurbanCampaign {
  id: string
  title: string
  description: string | null
  price_per_share_cents: number
  animal_type: 'cow' | 'sheep'
  animal_type_label: string
  country: string | null
  season_year: number | null
  animal_prefix: string
  animal_label: string | null
  animal_label_options?: Record<string, string[]>
  auto_assign: boolean
  status: 'active' | 'completed'
  donation_campaign_id: string | null
  shares?: number
  unassigned_shares?: number
  animals?: number
  slaughtered_animals?: number
}

interface Summary extends KurbanCampaign {
  shares: number
  unassigned_shares: number
  assigned_shares: number
  slaughtered_shares: number
  notified_shares: number
  by_kurban_type: { key: string; label: string; count: number }[]
  animals_waiting: number
  animals_slaughtered: number
  expected_animals: number
}

interface Animal {
  id: string
  animal_number: string
  type_label: string
  animal_label: string
  capacity: number
  country: string | null
  status: 'waiting' | 'slaughtered'
  video_url: string | null
  video_status: VideoStatus
  video_status_label: string
  slaughtered_at: string | null
  shares: { id: string; share_number: number; name: string; donor_name: string; kurban_type: string; notified: boolean }[]
}

interface Share {
  id: string
  animal_id: string | null
  animal_number: string | null
  share_number: number | null
  donor_name: string
  donor_phone: string
  on_behalf_of: string | null
  kurban_type: string
  kurban_type_label: string
  status: string
  notified: boolean
  receipt_number: string | null
}

type Tab = 'animals' | 'shares' | 'entry' | 'bulk' | 'settings'
type VideoStatus = 'none' | 'recorded' | 'sent'

const VIDEO_STATUS_OPTIONS: { key: VideoStatus; label: string }[] = [
  { key: 'none', label: 'Video yok' },
  { key: 'recorded', label: 'Video çekildi' },
  { key: 'sent', label: 'Video gönderildi' },
]
const VIDEO_STATUS_CLASS: Record<VideoStatus, string> = {
  none: 'text-slate-400', recorded: 'text-sky-600', sent: 'text-emerald-600',
}
const todayIso = () => new Date().toISOString().slice(0, 10)

const emptyCampaign = {
  title: '', description: '', price: '', animal_type: 'cow' as 'cow' | 'sheep', country: '', season_year: String(new Date().getFullYear()),
  animal_prefix: 'K', status: 'active' as 'active' | 'completed', create_donation_campaign: true,
  animal_label: '', auto_assign: true,
}

export default function KurbanAdminPage() {
  return <Suspense fallback={null}><KurbanAdminInner /></Suspense>
}

function KurbanAdminInner() {
  const searchParams = useSearchParams()
  const sekmeParam = searchParams.get('sekme')
  const { data: access } = useAdminAccess()
  const canWrite = can(access, 'kurban.manage')
  const canIssue = can(access, 'receipts.create')
  // Sunucu bu işlemleri ayrı yetkilerle korur; düğmeler de aynı yetkiye bakar.
  const canSlaughter = can(access, 'kurban.slaughter')
  const canDelete = can(access, 'kurban.delete')
  const canPdf = can(access, 'kurban.pdf')
  const [campaigns, setCampaigns] = useState<KurbanCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [types, setTypes] = useState<{ key: string; label: string }[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [sharesTotal, setSharesTotal] = useState(0)
  const [sharePage, setSharePage] = useState(1)
  // STK PRO menu: "Otomatik Hisse Dağıtma" opens the unassigned shares (?sekme=atanmamis).
  const [tab, setTab] = useState<Tab>(() =>
    sekmeParam === 'atanmamis' || sekmeParam === 'hisseler' ? 'shares' : sekmeParam === 'giris' ? 'entry' : 'animals')
  const [animalFilter, setAnimalFilter] = useState<'' | 'waiting' | 'slaughtered'>('')
  const [animalPartialOnly, setAnimalPartialOnly] = useState(false)
  const [animalVideoStatus, setAnimalVideoStatus] = useState<'' | VideoStatus>('')
  const [animalView, setAnimalView] = useState<'cards' | 'table'>('cards')
  const [videoModal, setVideoModal] = useState<{ ids: string[]; status: VideoStatus; videoUrl: string } | null>(null)
  const [search, setSearch] = useState('')
  const [shareFilter, setShareFilter] = useState<'' | 'true' | 'false'>(() => (sekmeParam === 'atanmamis' ? 'false' : ''))
  useEffect(() => {
    setTab(sekmeParam === 'atanmamis' || sekmeParam === 'hisseler' ? 'shares' : sekmeParam === 'giris' ? 'entry' : 'animals')
    setShareFilter(sekmeParam === 'atanmamis' ? 'false' : '')
  }, [sekmeParam])
  const [shareKurbanType, setShareKurbanType] = useState('')
  const [shareStatus, setShareStatus] = useState<'' | 'waiting' | 'slaughtered'>('')
  const [shareNotifiedOnly, setShareNotifiedOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickedShares, setPickedShares] = useState<Set<string>>(new Set())
  const [bulkAnimalId, setBulkAnimalId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [statModal, setStatModal] = useState<'shares' | 'unassigned' | 'animals' | 'notified' | null>(null)
  const [slaughterModal, setSlaughterModal] = useState<{ ids: string[]; videoUrl: string; notify: boolean; date: string } | null>(null)
  const [kurbanSmsTpl, setKurbanSmsTpl] = useState<SmsTemplate | null>(null)
  const [kurbanSmsBody, setKurbanSmsBody] = useState('')
  const [savingKurbanTpl, setSavingKurbanTpl] = useState(false)
  const [animalEditModal, setAnimalEditModal] = useState<{ animal: Animal; animalNumber: string; videoUrl: string; videoStatus: VideoStatus; slaughteredOn: string } | null>(null)
  const [addAnimalModal, setAddAnimalModal] = useState<{ count: string; animalNumber: string } | null>(null)
  const [shareEditModal, setShareEditModal] = useState<{ share: Share; onBehalfOf: string; kurbanType: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadCampaigns = async () => {
    try {
      const [c, t] = await Promise.all([v1Get<KurbanCampaign[]>('/kurban/campaigns'), v1Get<{ key: string; label: string }[]>('/kurban/types')])
      setCampaigns(c.data)
      setTypes(t.data)
      if (!selectedId && c.data.length) setSelectedId(c.data[0].id)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kurban kampanyaları yüklenemedi'))
    } finally {
      setCampaignsLoading(false)
    }
  }

  const loadSelected = async () => {
    if (!selectedId) return
    try {
      const [s, a, sh] = await Promise.all([
        v1Get<Summary>(`/kurban/campaigns/${selectedId}/summary`),
        v1Get<Animal[]>('/kurban/animals', {
          campaign_id: selectedId, status: animalFilter || undefined, q: search || undefined,
          has_free: animalPartialOnly ? true : undefined, video_status: animalVideoStatus || undefined,
        }),
        v1Get<{ total?: number; items: Share[] }>('/kurban/shares', {
          campaign_id: selectedId, assigned: shareFilter || undefined,
          kurban_type: shareKurbanType || undefined, status: shareStatus || undefined,
          notified: shareNotifiedOnly ? true : undefined,
          q: search || undefined, page: sharePage, page_size: SHARE_PAGE_SIZE,
        }),
      ])
      setSummary(s.data)
      setAnimals(a.data)
      setShares(sh.data.items)
      setSharesTotal(sh.data.total ?? sh.data.items.length)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const refreshAll = async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadCampaigns(), loadSelected()])
      toast.ok('Kurban verileri yenilendi.')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { loadCampaigns() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const didMountRef = useRef(false)
  useEffect(() => {
    setPicked(new Set())
    setPickedShares(new Set())
    if (!didMountRef.current) {
      didMountRef.current = true
      loadSelected()
      return
    }
    const t = setTimeout(loadSelected, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, animalFilter, animalPartialOnly, animalVideoStatus, search, shareFilter, shareKurbanType, shareStatus, shareNotifiedOnly, sharePage])

  const run = async (fn: () => Promise<unknown>, ok: string | ((r: any) => string)) => {
    setBusy(true)
    try {
      const res: any = await fn()
      toast.ok(typeof ok === 'function' ? ok(res?.data) : ok)
      await Promise.all([loadCampaigns(), loadSelected()])
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveCampaign = async (form: CampaignFormValues, existing?: KurbanCampaign) => {
    const body = {
      title: form.title, description: form.description || null,
      price_per_share_cents: Math.round(Number(form.price.replace(',', '.')) * 100),
      animal_type: form.animal_type, country: form.country || null,
      season_year: form.season_year ? Number(form.season_year) : null,
      animal_prefix: form.animal_prefix || 'K', status: form.status,
      animal_label: form.animal_label || null, auto_assign: form.auto_assign,
      create_donation_campaign: form.create_donation_campaign,
    }
    await run(async () => {
      const res = existing
        ? await v1Send<KurbanCampaign>('put', `/kurban/campaigns/${existing.id}`, body)
        : await v1Send<KurbanCampaign>('post', '/kurban/campaigns', body)
      setSelectedId(res.data.id)
      setShowCreate(false)
      return res
    }, existing ? 'Kampanya güncellendi' : 'Kurban kampanyası oluşturuldu')
  }

  const distribute = () => run(() => v1Send('post', `/kurban/campaigns/${selectedId}/distribute`),
    (r) => `${r.assigned} hisse dağıtıldı, ${r.new_animals} yeni hayvan oluşturuldu`)

  const slaughter = (ids: string[]) => {
    const single = ids.length === 1 ? animals.find((a) => a.id === ids[0]) : undefined
    setSlaughterModal({ ids, videoUrl: single?.video_url || '', notify: true, date: todayIso() })
    adminGet<SmsTemplate[]>('/sms/templates')
      .then((res) => {
        const tpl = (res.data || []).find((t) => t.is_active && t.event_key === 'kurban_kesildi') || null
        setKurbanSmsTpl(tpl)
        if (tpl) setKurbanSmsBody(tpl.body)
      })
      .catch(() => {})
  }

  const saveKurbanSmsTemplate = async () => {
    if (!kurbanSmsTpl || kurbanSmsBody.trim().length < 2 || savingKurbanTpl) return
    setSavingKurbanTpl(true)
    try {
      const updated = await updateSmsTemplateBody(kurbanSmsTpl, kurbanSmsBody)
      setKurbanSmsTpl(updated)
      setKurbanSmsBody(updated.body)
      toast.ok(`"${updated.name}" şablonu güncellendi`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Şablon güncellenemedi'))
    } finally {
      setSavingKurbanTpl(false)
    }
  }

  const submitSlaughter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slaughterModal) return
    const { ids, videoUrl, notify, date } = slaughterModal
    setSlaughterModal(null)
    await run(() => v1Send('post', '/kurban/animals/slaughter', {
      items: ids.map((animal_id) => ({ animal_id, video_url: ids.length === 1 ? videoUrl.trim() || null : null })), notify,
      // Bugünden farklı bir gün seçildiyse kesim günü olarak o yazılır.
      slaughtered_on: date && date !== todayIso() ? date : undefined,
    }), (r) => `${r.marked} hayvan kesildi olarak işaretlendi, ${r.sms_queued} SMS kuyruğa alındı${r.sms_failed ? `, ${r.sms_failed} SMS gönderilemedi` : ''}`)
  }

  const setVideo = (animal: Animal) => {
    setAnimalEditModal({
      animal, animalNumber: animal.animal_number, videoUrl: animal.video_url || '', videoStatus: animal.video_status,
      slaughteredOn: animal.slaughtered_at ? animal.slaughtered_at.slice(0, 10) : '',
    })
  }

  const submitAnimalEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animalEditModal) return
    const { animal, animalNumber, videoUrl, videoStatus, slaughteredOn } = animalEditModal
    setAnimalEditModal(null)
    await run(() => v1Send('put', `/kurban/animals/${animal.id}`, {
      animal_number: animalNumber.trim() || undefined,
      video_url: videoUrl.trim() || null,
      video_status: videoStatus,
      slaughtered_on: animal.status === 'slaughtered' && slaughteredOn && slaughteredOn !== (animal.slaughtered_at || '').slice(0, 10)
        ? slaughteredOn : undefined,
    }), 'Hayvan güncellendi')
  }

  const submitVideo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!videoModal) return
    const { ids, status, videoUrl } = videoModal
    setVideoModal(null)
    await run(() => v1Send('post', '/kurban/animals/video', {
      animal_ids: ids, video_status: status, video_url: videoUrl.trim() || null,
    }), (r) => `${r.updated} hayvanın video durumu güncellendi`)
  }

  const downloadCards = (path: string, params?: Record<string, unknown>) =>
    downloadFile(path, 'kurban-isim-kartlari.pdf', params).catch((err) => toast.error(apiErrorMessage(err, 'İsim kartları indirilemedi')))

  const addAnimals = () => {
    setAddAnimalModal({ count: '1', animalNumber: '' })
  }

  const submitAddAnimals = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addAnimalModal) return
    const count = Math.max(1, Number(addAnimalModal.count) || 1)
    const customNo = addAnimalModal.animalNumber.trim()
    setAddAnimalModal(null)
    await run(() => v1Send('post', '/kurban/animals', {
      campaign_id: selectedId,
      count: customNo ? 1 : count,
      animal_number: customNo || undefined,
    }), customNo ? `${customNo} numaralı hayvan eklendi` : `${count} hayvan eklendi`)
  }

  const deleteAnimal = async (animal: Animal) => {
    if (!(await confirmDialog(`${animal.animal_number} silinsin mi?`))) return
    run(() => v1Send('delete', `/kurban/animals/${animal.id}`), 'Hayvan silindi')
  }

  const editShare = (share: Share) => {
    setShareEditModal({ share, onBehalfOf: share.on_behalf_of || share.donor_name, kurbanType: share.kurban_type })
  }

  const submitShareEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shareEditModal) return
    const { share, onBehalfOf, kurbanType } = shareEditModal
    setShareEditModal(null)
    await run(() => v1Send('put', `/kurban/shares/${share.id}`, {
      on_behalf_of: onBehalfOf.trim(),
      kurban_type: kurbanType,
    }), 'Hisse güncellendi')
  }

  const moveShare = (share: Share, animalId: string) => {
    if (animalId === (share.animal_id || '')) return
    run(() => v1Send('put', `/kurban/shares/${share.id}`, animalId ? { animal_id: animalId } : { unassign: true }), 'Hisse taşındı')
  }

  const selected = campaigns.find((c) => c.id === selectedId)
  const waitingAnimals = useMemo(() => animals.filter((a) => a.status === 'waiting'), [animals])
  const visibleAnimals = animals  // "boş yeri olan" ve video süzgeçleri sunucuda uygulanır
  const visibleShares = shares
  const assignableShares = useMemo(() => visibleShares.filter((s) => s.status !== 'slaughtered'), [visibleShares])

  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleSharePick = (id: string) => setPickedShares((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAllShares = () => {
    if (pickedShares.size === assignableShares.length && assignableShares.length > 0) {
      setPickedShares(new Set())
    } else {
      setPickedShares(new Set(assignableShares.map((s) => s.id)))
    }
  }

  const assignBulkShares = async () => {
    if (pickedShares.size === 0) return
    const ids = [...pickedShares]
    await run(async () => {
      // Tek istek, tek işlem: hayvanda yer yetmezse hiçbir hisse taşınmaz.
      await v1Send('post', '/kurban/shares/move', { share_ids: ids, animal_id: bulkAnimalId || null })
      setPickedShares(new Set())
      setBulkAnimalId('')
    }, bulkAnimalId ? `${ids.length} hisse seçilen hayvana atandı` : `${ids.length} hissenin hayvan ataması kaldırıldı`)
  }

  const clearFilters = () => {
    setSearch('')
    setAnimalFilter('')
    setAnimalPartialOnly(false)
    setAnimalVideoStatus('')
    setShareFilter('')
    setShareKurbanType('')
    setShareStatus('')
    setShareNotifiedOnly(false)
    setSharePage(1)
  }

  const activeFilterCount = useMemo(() => {
    if (tab === 'animals') return [animalFilter, animalPartialOnly ? '1' : '', animalVideoStatus].filter(Boolean).length
    if (tab === 'shares') return [shareFilter, shareKurbanType, shareStatus, shareNotifiedOnly ? '1' : ''].filter(Boolean).length
    return 0
  }, [tab, animalFilter, animalPartialOnly, animalVideoStatus, shareFilter, shareKurbanType, shareStatus, shareNotifiedOnly])

  return (
    <div className="space-y-5">
      <AppPageHeader
        eyebrow="SAHA & ORGANİZASYON"
        title="Kurban Organizasyonu"
        meta="Web bağışları ve elden alınan hisseler otomatik olarak hisseye dönüşür; hayvanlara atanır, kesim kağıtları ve SMS bildirimleri tek merkezden yönetilir."
        icon={<Beef className="h-6 w-6" />}
        chips={
          selected && summary ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {selected.animal_label || selected.animal_type_label} · Hisse: {formatMoney(selected.price_per_share_cents)}
              </span>
              {selected.country && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  {selected.country} {selected.season_year ? `(${selected.season_year})` : ''}
                </span>
              )}
              {summary.by_kurban_type.map((t) => (
                <span key={t.key} className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50/70 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                  {t.label}: {t.count}
                </span>
              ))}
            </>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-xl border border-slate-300 bg-slate-50/80 px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value)
                setSharePage(1)
              }}
            >
              {campaigns.length === 0 && <option value="">Kampanya yok</option>}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}{c.unassigned_shares ? ` (${c.unassigned_shares} bekleyen)` : ''}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={refreshing} className="h-10 rounded-xl px-3 text-xs font-bold">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {canWrite && summary && summary.unassigned_shares > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={distribute}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700 disabled:opacity-50"
              >
                <Shuffle className="h-4 w-4" />
                Hisseleri Dağıt ({summary.unassigned_shares})
              </button>
            )}
            {selectedId && canPdf && (
              <button
                type="button"
                onClick={() => downloadFile(`/kurban/campaigns/${selectedId}/papers.pdf`, 'kurban-kagitlari.pdf', {
                  status: tab === 'animals' && animalFilter === 'slaughtered' ? 'slaughtered' : 'waiting',
                }).catch((err) => toast.error(apiErrorMessage(err, 'PDF indirilemedi')))}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 text-emerald-600" />
                {tab === 'animals' && animalFilter === 'slaughtered' ? 'Kesilen Kağıtlar (PDF)' : 'Kurban Kağıtları (PDF)'}
              </button>
            )}
            {selectedId && canPdf && (
              <button
                type="button"
                title="Her hissedar için ayrı sayfa: kurban no, ad, niyet ve cins"
                onClick={() => downloadCards(`/kurban/campaigns/${selectedId}/cards.pdf`, {
                  status: tab === 'animals' && animalFilter === 'slaughtered' ? 'slaughtered' : 'waiting',
                })}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                <IdCard className="h-4 w-4 text-emerald-600" />
                İsim Kartları (PDF)
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Yeni Kampanya
              </button>
            )}
          </div>
        }
      />

      {campaigns.length > 1 && (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {campaigns.map((c) => {
            const totalA = c.animals || 0
            const doneA = c.slaughtered_animals || 0
            const pct = totalA > 0 ? Math.round((doneA / totalA) * 100) : 0
            const isSelected = c.id === selectedId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id)
                  setSharePage(1)
                }}
                className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900">{c.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {c.country || c.animal_type_label} · {c.shares ?? 0} hisse
                    </div>
                  </div>
                  {(c.unassigned_shares ?? 0) > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {c.unassigned_shares} bekleyen
                    </span>
                  )}
                </div>
                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                    <span>Kesim İlerlemesi</span>
                    <span className="font-mono text-slate-700">{doneA}/{totalA} (%{pct})</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {campaignsLoading ? (
        <Card className="border border-slate-200/80 p-10 text-center text-sm text-slate-500 animate-pulse">
          Kurban kampanyaları yükleniyor...
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="border border-slate-200/80">
          <EmptyState
            icon={Beef}
            title="Henüz kurban kampanyası oluşturulmadı"
            text="Yeni bir kurban kampanyası başlatarak web ve elden hisse kayıtlarını, hayvan dağıtımını ve kesim kağıtlarını tek ekrandan yönetebilirsiniz."
            action={
              canWrite ? (
                <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  İlk Kurban Kampanyasını Oluştur
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {selected && summary && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <GlobalStatCard
              id="shares"
              title="TOPLAM HİSSE & TUTAR"
              value={`${summary.shares} Hisse`}
              subtitle={`Toplam: ${formatMoney(summary.shares * selected.price_per_share_cents)} · Hisse: ${formatMoney(selected.price_per_share_cents)}`}
              icon={<Coins className="h-4 w-4" />}
              gradient="from-emerald-600 to-teal-700"
              onClick={() => setStatModal('shares')}
            />
            <GlobalStatCard
              id="unassigned"
              title="ATAMA BEKLEYEN HİSSE"
              value={summary.unassigned_shares}
              subtitle={summary.unassigned_shares > 0 ? 'Hayvana yerleştirilmeyi bekliyor' : 'Tüm hisseler hayvanlara atandı'}
              icon={<Clock className="h-4 w-4" />}
              gradient={summary.unassigned_shares > 0 ? 'from-amber-500 to-orange-600' : 'from-slate-500 to-slate-700'}
              onClick={() => setStatModal('unassigned')}
            />
            <GlobalStatCard
              id="animals"
              title="HAYVAN & KESİM DURUMU"
              value={`${summary.animals_slaughtered} / ${summary.animals_waiting + summary.animals_slaughtered}`}
              subtitle={`${summary.animals_waiting} kesim bekliyor · Gereken: ${summary.expected_animals} hayvan`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              gradient="from-blue-600 to-indigo-700"
              onClick={() => setStatModal('animals')}
            />
            <GlobalStatCard
              id="notified"
              title="KESİM SMS BİLDİRİMİ"
              value={`${summary.notified_shares} / ${summary.shares}`}
              subtitle={`${summary.slaughtered_shares} kesilen hisseden ${summary.notified_shares} kişiye SMS gitti`}
              icon={<MessageSquare className="h-4 w-4" />}
              gradient="from-violet-600 to-purple-700"
              onClick={() => setStatModal('notified')}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={tab}
              onChange={(k) => setTab(k)}
              tabs={[
                { key: 'animals', label: 'Hayvanlar & Çadırlar', count: visibleAnimals.length, icon: Beef },
                { key: 'shares', label: 'Hisseler & Hissedarlar', count: sharesTotal || visibleShares.length, icon: Users },
                ...(canIssue ? [{ key: 'entry' as Tab, label: 'Elden Hisse Kaydı', icon: HandCoins }] : []),
                ...(canIssue ? [{ key: 'bulk' as Tab, label: 'Toplu Giriş', icon: ListPlus }] : []),
                ...(canWrite ? [{ key: 'settings' as Tab, label: 'Kampanya Ayarları', icon: Settings }] : []),
              ]}
            />
          </div>

          {(tab === 'animals' || tab === 'shares') && (
            <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <ResponsiveDataToolbar
                search={{
                  value: search,
                  onChange: (v) => {
                    setSearch(v)
                    setSharePage(1)
                  },
                  placeholder: 'Hayvan no, hissedar, bağışçı veya telefon ara...',
                }}
                filter={{
                  activeCount: activeFilterCount,
                  onOpen: () => setShowFilters((v) => !v),
                  label: 'Gelişmiş Filtreler',
                  showOnDesktop: true,
                }}
                extraActions={
                  <div className="flex flex-wrap items-center gap-2">
                    {tab === 'animals' && canWrite && (
                      <button
                        type="button"
                        onClick={addAnimals}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Elle Hayvan Ekle
                      </button>
                    )}
                    {tab === 'animals' && (
                      <div className="hidden overflow-hidden rounded-xl border border-slate-200 sm:inline-flex">
                        {([['cards', LayoutGrid, 'Kart'], ['table', Table2, 'Tablo']] as const).map(([key, Icon, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setAnimalView(key)}
                            className={`inline-flex h-9 items-center gap-1 px-3 text-xs font-bold transition ${animalView === key ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {tab === 'animals' && (canSlaughter || canWrite) && waitingAnimals.length > 0 && picked.size === 0 && (
                      <button
                        type="button"
                        onClick={() => setPicked(new Set(waitingAnimals.map((a) => a.id)))}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                      >
                        Bekleyenleri Seç ({waitingAnimals.length})
                      </button>
                    )}
                    {tab === 'animals' && canSlaughter && picked.size > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => slaughter([...picked])}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Seçilenleri Kesildi İşaretle ({picked.size})
                      </button>
                    )}
                    <ExportButtons
                      filename={tab === 'animals' ? 'kurban-hayvanlar' : 'kurban-hisseleri'}
                      title={tab === 'animals' ? `${selected.title} - Kurban Hayvanları` : `${selected.title} - Kurban Hisseleri`}
                      subtitle={tab === 'animals' ? `${visibleAnimals.length} hayvan` : `${visibleShares.length} hisse`}
                      summary={[
                        ['Kampanya', selected.title],
                        ['Hisse Bedeli', formatMoney(selected.price_per_share_cents)],
                        ['Toplam Hisse', String(summary.shares)],
                        ['Kesilen Hayvan', `${summary.animals_slaughtered} / ${summary.animals_waiting + summary.animals_slaughtered}`],
                      ]}
                      getData={() =>
                        tab === 'animals'
                          ? {
                              headers: ['Hayvan No', 'Cins', 'Ülke', 'Kapasite', 'Dolu Hisse', 'Durum', 'Kesim Tarihi', 'Video', 'Hissedarlar'],
                              rows: visibleAnimals.map((a) => [
                                a.animal_number,
                                a.animal_label,
                                a.country || '',
                                a.capacity,
                                a.shares.length,
                                a.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor',
                                formatDateTime(a.slaughtered_at),
                                a.video_status_label,
                                a.shares.map((s) => `${s.share_number}. ${s.name}`).join(', '),
                              ]),
                            }
                          : {
                              headers: ['Hayvan', 'Hisse', 'Hissedar', 'Bağışçı', 'Telefon', 'Tür', 'Durum', 'Makbuz'],
                              rows: visibleShares.map((s) => [
                                s.animal_number || 'Atanmadı',
                                s.share_number || '',
                                s.on_behalf_of || s.donor_name,
                                s.donor_name,
                                s.donor_phone,
                                s.kurban_type_label,
                                s.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor',
                                s.receipt_number,
                              ]),
                            }
                      }
                    />
                  </div>
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {tab === 'animals' ? (
                    <>
                      {[
                        { label: 'Tümü', active: !animalFilter && !animalPartialOnly && !animalVideoStatus, onClick: () => { setAnimalFilter(''); setAnimalPartialOnly(false); setAnimalVideoStatus('') } },
                        { label: 'Kesim Bekleyen', active: animalFilter === 'waiting' && !animalPartialOnly, onClick: () => { setAnimalFilter('waiting'); setAnimalPartialOnly(false) } },
                        { label: 'Boş Yeri Olan', active: animalPartialOnly, onClick: () => { setAnimalFilter('waiting'); setAnimalPartialOnly(true) } },
                        { label: 'Kesilenler', active: animalFilter === 'slaughtered', onClick: () => { setAnimalFilter('slaughtered'); setAnimalPartialOnly(false) } },
                        { label: 'Videosu Gönderilmeyen', active: animalVideoStatus === 'recorded', onClick: () => setAnimalVideoStatus((v) => (v === 'recorded' ? '' : 'recorded')) },
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
                    </>
                  ) : (
                    <>
                      {[
                        { label: 'Tümü', active: !shareFilter && !shareStatus && !shareNotifiedOnly, onClick: () => { setShareFilter(''); setShareStatus(''); setShareNotifiedOnly(false); setSharePage(1) } },
                        { label: 'Atanmamış', active: shareFilter === 'false', onClick: () => { setShareFilter('false'); setShareStatus(''); setShareNotifiedOnly(false); setSharePage(1) } },
                        { label: 'Atanmış', active: shareFilter === 'true' && !shareStatus && !shareNotifiedOnly, onClick: () => { setShareFilter('true'); setShareStatus(''); setShareNotifiedOnly(false); setSharePage(1) } },
                        { label: 'Kesim Bekleyen', active: shareStatus === 'waiting', onClick: () => { setShareStatus('waiting'); setShareFilter(''); setShareNotifiedOnly(false); setSharePage(1) } },
                        { label: 'Kesilenler', active: shareStatus === 'slaughtered', onClick: () => { setShareStatus('slaughtered'); setShareFilter(''); setShareNotifiedOnly(false); setSharePage(1) } },
                        { label: 'SMS Gönderilen', active: shareNotifiedOnly, onClick: () => { setShareNotifiedOnly((v) => !v) } },
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
                    </>
                  )}
                </div>
                {(activeFilterCount > 0 || search) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700"
                  >
                    Filtreleri Temizle
                  </button>
                )}
              </div>

              {showFilters && (
                <div className={`grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-2 ${tab === 'shares' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                  {tab === 'animals' ? (
                    <>
                      <Label label="Kesim Durumu">
                        <select
                          className={inputClass}
                          value={animalFilter}
                          onChange={(e) => {
                            const val = e.target.value as typeof animalFilter
                            setAnimalFilter(val)
                            if (val === 'slaughtered') setAnimalPartialOnly(false)
                          }}
                        >
                          <option value="">Tüm hayvanlar</option>
                          <option value="waiting">Kesim bekleyen</option>
                          <option value="slaughtered">Kesilen</option>
                        </select>
                      </Label>
                      <div className="flex items-end">
                        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={animalPartialOnly}
                            onChange={(e) => {
                              setAnimalPartialOnly(e.target.checked)
                              if (e.target.checked) setAnimalFilter('waiting')
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                          />
                          Sadece boş yeri olanlar
                        </label>
                      </div>
                      <Label label="Video Durumu">
                        <select className={inputClass} value={animalVideoStatus} onChange={(e) => setAnimalVideoStatus(e.target.value as typeof animalVideoStatus)}>
                          <option value="">Tüm videolar</option>
                          {VIDEO_STATUS_OPTIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                        </select>
                      </Label>
                    </>
                  ) : (
                    <>
                      <Label label="Atama Durumu">
                        <select className={inputClass} value={shareFilter} onChange={(e) => { setShareFilter(e.target.value as typeof shareFilter); setSharePage(1) }}>
                          <option value="">Tüm hisseler</option>
                          <option value="false">Dağıtılmamış (Bekleyen)</option>
                          <option value="true">Hayvana atanmış</option>
                        </select>
                      </Label>
                      <Label label="Niyet Türü">
                        <select className={inputClass} value={shareKurbanType} onChange={(e) => { setShareKurbanType(e.target.value); setSharePage(1) }}>
                          <option value="">Tüm niyetler</option>
                          {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      </Label>
                      <Label label="Kesim Durumu">
                        <select className={inputClass} value={shareStatus} onChange={(e) => { setShareStatus(e.target.value as typeof shareStatus); setSharePage(1) }}>
                          <option value="">Tüm durumlar</option>
                          <option value="waiting">Bekliyor</option>
                          <option value="slaughtered">Kesildi</option>
                        </select>
                      </Label>
                      <Label label="SMS Bildirimi">
                        <select className={inputClass} value={shareNotifiedOnly ? 'true' : ''} onChange={(e) => { setShareNotifiedOnly(e.target.value === 'true'); setSharePage(1) }}>
                          <option value="">Tümü</option>
                          <option value="true">SMS gönderilenler</option>
                        </select>
                      </Label>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === 'animals' && (
            <div className="space-y-3">
              {picked.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <span className="text-xs font-bold text-emerald-900">
                    {picked.size} hayvan seçildi
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {canSlaughter && [...picked].some((id) => animals.find((a) => a.id === id)?.status === 'waiting') && (
                      <Button type="button" size="sm" disabled={busy} onClick={() => slaughter([...picked].filter((id) => animals.find((a) => a.id === id)?.status === 'waiting'))}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Seçilenleri Kesildi İşaretle
                      </Button>
                    )}
                    {canWrite && (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setVideoModal({ ids: [...picked], status: 'recorded', videoUrl: '' })}>
                        <Video className="h-3.5 w-3.5 mr-1.5" />
                        Video Durumu
                      </Button>
                    )}
                    {canPdf && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const ids = animals.filter((a) => picked.has(a.id)).flatMap((a) => a.shares.map((s) => s.id))
                          if (!ids.length) return toast.error('Seçilen hayvanlarda hissedar yok.')
                          downloadShareCards(ids).catch((err) => toast.error(apiErrorMessage(err, 'İsim kartları indirilemedi')))
                        }}
                      >
                        <IdCard className="h-3.5 w-3.5 mr-1.5" />
                        İsim Kartları
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => setPicked(new Set())}>
                      Seçimi Temizle
                    </Button>
                  </div>
                </div>
              )}
              {visibleAnimals.length === 0 ? (
                <Card className="border border-slate-200/80 p-12 text-center shadow-xs">
                  <Beef className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">Uygun hayvan kaydı bulunmuyor</p>
                  <p className="mt-1 text-xs text-slate-500">Hisseler geldikçe &quot;Hisseleri Dağıt&quot; butonuyla hayvanlar otomatik oluşturulur veya filtreleri temizleyebilirsiniz.</p>
                </Card>
              ) : animalView === 'table' ? (
                <Card className="hidden overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-xs sm:block">
                  <div className="overflow-x-auto">
                    <Table inset>
                      <THead className="bg-slate-50/80">
                        <Tr>
                          <Th className="w-10">
                            <input
                              type="checkbox"
                              checked={visibleAnimals.length > 0 && picked.size === visibleAnimals.length}
                              onChange={() => setPicked(picked.size === visibleAnimals.length ? new Set() : new Set(visibleAnimals.map((a) => a.id)))}
                              aria-label="Görünen hayvanların tümünü seç"
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                            />
                          </Th>
                          <Th>Kurban No</Th>
                          <Th>Cins</Th>
                          <Th>Ülke</Th>
                          <Th>Hissedarlar</Th>
                          <Th>Hisse</Th>
                          <Th>Durum</Th>
                          <Th>Kesim</Th>
                          <Th>Video</Th>
                          <Th>SMS</Th>
                          <Th className="text-right">İşlem</Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {visibleAnimals.map((a) => {
                          const isSlaughtered = a.status === 'slaughtered'
                          const fillPct = a.capacity > 0 ? Math.min(100, Math.round((a.shares.length / a.capacity) * 100)) : 0
                          return (
                            <Tr key={a.id} className="hover:bg-slate-50/70">
                              <Td>
                                <input type="checkbox" checked={picked.has(a.id)} onChange={() => togglePick(a.id)} aria-label={`${a.animal_number} seç`} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                              </Td>
                              <Td className="font-mono font-black text-slate-900">{a.animal_number}</Td>
                              <Td>{a.animal_label}</Td>
                              <Td>{a.country || '—'}</Td>
                              <Td className="max-w-[260px] truncate text-slate-700" title={a.shares.map((s) => s.name).join(', ')}>
                                {a.shares.map((s) => s.name).join(', ') || <span className="text-slate-400">Hissedar yok</span>}
                              </Td>
                              <Td>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                    <div className={`h-full rounded-full ${fillPct >= 100 ? 'bg-emerald-600' : 'bg-amber-400'}`} style={{ width: `${fillPct}%` }} />
                                  </div>
                                  <span className="font-mono text-xs text-slate-600">{a.shares.length}/{a.capacity}</span>
                                </div>
                              </Td>
                              <Td>
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${isSlaughtered ? 'border-emerald-300 bg-emerald-100/70 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                  {isSlaughtered ? 'Kesildi' : 'Bekliyor'}
                                </span>
                              </Td>
                              <Td className="text-xs text-slate-600">{formatDateTime(a.slaughtered_at) || '—'}</Td>
                              <Td>
                                {a.video_url ? (
                                  <a href={a.video_url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${VIDEO_STATUS_CLASS[a.video_status]}`}>
                                    <Video className="h-3.5 w-3.5" />{a.video_status_label}
                                  </a>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 text-xs ${VIDEO_STATUS_CLASS[a.video_status]}`}><Video className="h-3.5 w-3.5" />{a.video_status_label}</span>
                                )}
                              </Td>
                              <Td className="font-mono text-xs text-slate-500">{a.shares.filter((s) => s.notified).length}/{a.shares.length}</Td>
                              <Td className="text-right">
                                <div className="inline-flex items-center gap-1">
                                  {canPdf && (
                                    <button type="button" title="Kesim kağıdı" onClick={() => downloadFile(`/kurban/animals/${a.id}/paper.pdf`, `kurban-${a.animal_number}.pdf`)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><FileText className="h-4 w-4" /></button>
                                  )}
                                  {canPdf && a.shares.length > 0 && (
                                    <button type="button" title="İsim kartları" onClick={() => downloadCards(`/kurban/animals/${a.id}/cards.pdf`)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><IdCard className="h-4 w-4" /></button>
                                  )}
                                  {canWrite && (
                                    <button type="button" title="Video / numara / kesim tarihi" onClick={() => setVideo(a)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Video className="h-4 w-4" /></button>
                                  )}
                                  {canSlaughter && !isSlaughtered && (
                                    <button type="button" title="Kesildi işaretle" onClick={() => slaughter([a.id])} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4" /></button>
                                  )}
                                  {canDelete && !isSlaughtered && a.shares.length === 0 && (
                                    <button type="button" title="Hayvanı sil" onClick={() => deleteAnimal(a)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                                  )}
                                </div>
                              </Td>
                            </Tr>
                          )
                        })}
                      </TBody>
                    </Table>
                  </div>
                </Card>
              ) : null}
              {visibleAnimals.length > 0 && (
                <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${animalView === 'table' ? 'sm:hidden' : ''}`}>
                  {visibleAnimals.map((a) => {
                    const fillPct = a.capacity > 0 ? Math.min(100, Math.round((a.shares.length / a.capacity) * 100)) : 0
                    const isSlaughtered = a.status === 'slaughtered'
                    const emptySlots = Math.max(0, a.capacity - a.shares.length)
                    return (
                      <div
                        key={a.id}
                        className={`flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${
                          isSlaughtered
                            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/40 via-white to-white'
                            : 'border-slate-200/80 bg-white'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <label className="flex cursor-pointer items-center gap-2.5">
                              {(canWrite || canSlaughter || canPdf) && (
                                <input
                                  type="checkbox"
                                  checked={picked.has(a.id)}
                                  onChange={() => togglePick(a.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                              )}
                              <div>
                                <span className="font-mono text-lg font-black tracking-tight text-slate-900">{a.animal_number}</span>
                                {isSlaughtered && a.slaughtered_at && (
                                  <div className="text-[11px] font-medium text-emerald-700">
                                    Kesim: {formatDateTime(a.slaughtered_at)}
                                  </div>
                                )}
                              </div>
                            </label>
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                                  isSlaughtered
                                    ? 'border-emerald-300 bg-emerald-100/70 text-emerald-800'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                }`}
                              >
                                {isSlaughtered ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Kesildi
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3" />
                                    Bekliyor
                                  </>
                                )}{' '}
                                · {a.shares.length}/{a.capacity}
                              </span>
                              {!isSlaughtered && emptySlots > 0 && (
                                <span className="text-[10px] font-bold text-slate-500">{emptySlots} boş hisse</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${isSlaughtered ? 'bg-emerald-600' : 'bg-teal-600'}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>

                          <ol className="mt-3.5 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-xs">
                            {a.shares.map((s) => {
                              const fullShare = canWrite && !isSlaughtered ? shares.find((sh) => sh.id === s.id) : undefined
                              return (
                                <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                                  {fullShare ? (
                                    <button
                                      type="button"
                                      onClick={() => editShare(fullShare)}
                                      title="Hisseyi düzenle"
                                      className="truncate text-left font-semibold text-slate-800 hover:text-emerald-700 hover:underline"
                                    >
                                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800">
                                        {s.share_number}
                                      </span>
                                      {s.name}
                                    </button>
                                  ) : (
                                    <span className="truncate font-semibold text-slate-800">
                                      <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800">
                                        {s.share_number}
                                      </span>
                                      {s.name}
                                    </span>
                                  )}
                                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-500">
                                    {types.find((t) => t.key === s.kurban_type)?.label}
                                    {s.notified && <MailCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Kesim SMS bildirimi gönderildi" />}
                                  </span>
                                </li>
                              )
                            })}
                            {Array.from({ length: Math.max(0, a.capacity - a.shares.length) }).map((_, i) => (
                              <li key={`empty-${i}`} className="py-1.5 text-xs italic text-slate-400">
                                — Boş hisse ({a.shares.length + i + 1}/{a.capacity})
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap gap-1.5">
                            {canPdf && (
                              <button
                                type="button"
                                onClick={() => downloadFile(`/kurban/animals/${a.id}/paper.pdf`, `kurban-${a.animal_number}.pdf`).catch((err) => toast.error(apiErrorMessage(err, 'PDF indirilemedi')))}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                                Kesim Kağıdı
                              </button>
                            )}
                            {canPdf && a.shares.length > 0 && (
                              <button
                                type="button"
                                onClick={() => downloadCards(`/kurban/animals/${a.id}/cards.pdf`)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                <IdCard className="h-3.5 w-3.5 text-emerald-600" />
                                İsim Kartı
                              </button>
                            )}
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => setVideo(a)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                <Video className={`h-3.5 w-3.5 ${VIDEO_STATUS_CLASS[a.video_status]}`} />
                                {a.video_status === 'none' ? 'Video / No' : a.video_status_label}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {canSlaughter && !isSlaughtered && (
                              <button
                                type="button"
                                onClick={() => slaughter([a.id])}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Kesildi
                              </button>
                            )}
                            {canDelete && !isSlaughtered && a.shares.length === 0 && (
                              <button
                                type="button"
                                onClick={() => deleteAnimal(a)}
                                className="inline-flex cursor-pointer items-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                                title="Hayvanı Sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'shares' && (
            <div className="space-y-3">
              {canWrite && pickedShares.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <span className="text-xs font-bold text-emerald-900">
                    {pickedShares.size} hisse seçildi
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-xl border border-emerald-300 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
                      value={bulkAnimalId}
                      onChange={(e) => setBulkAnimalId(e.target.value)}
                    >
                      <option value="">Atamayı kaldır (Boşa çıkar)</option>
                      {waitingAnimals.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.animal_number} ({a.shares.length}/{a.capacity})
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" disabled={busy} onClick={assignBulkShares}>
                      Seçilenleri Uygula
                    </Button>
                    {canPdf && (
                      <Button type="button" size="sm" variant="outline" onClick={() => downloadShareCards([...pickedShares]).catch((err) => toast.error(apiErrorMessage(err, 'İsim kartları indirilemedi')))}>
                        <IdCard className="h-3.5 w-3.5 mr-1.5" />
                        İsim Kartları
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => setPickedShares(new Set())}>
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
                        {canWrite && (
                          <Th className="w-10">
                            <input
                              type="checkbox"
                              checked={assignableShares.length > 0 && pickedShares.size === assignableShares.length}
                              onChange={toggleAllShares}
                              aria-label="Tüm atanabilir hisseleri seç"
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </Th>
                        )}
                        <Th>Hissedar (Vekâlet)</Th>
                        <Th>Bağışçı & İletişim</Th>
                        <Th>Niyet Türü</Th>
                        <Th>Hayvan / Hisse</Th>
                        <Th>Makbuz No</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {visibleShares.map((s) => (
                        <Tr key={s.id} className="hover:bg-slate-50/70">
                          {canWrite && (
                            <Td>
                              {s.status !== 'slaughtered' && (
                                <input
                                  type="checkbox"
                                  checked={pickedShares.has(s.id)}
                                  onChange={() => toggleSharePick(s.id)}
                                  aria-label={`${s.on_behalf_of || s.donor_name} seç`}
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                              )}
                            </Td>
                          )}
                          <Td className="font-bold text-slate-900">{s.on_behalf_of || s.donor_name}</Td>
                          <Td>
                            <Link
                              href={`/admin/bagiscilar?q=${encodeURIComponent(s.donor_phone || s.donor_name)}`}
                              className="font-medium text-slate-800 hover:text-emerald-700 hover:underline"
                            >
                              {s.donor_name}
                            </Link>
                            <div className="text-[11px] text-slate-500">{s.donor_phone}</div>
                          </Td>
                          <Td>
                            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                              {s.kurban_type_label}
                            </span>
                          </Td>
                          <Td>
                            {canWrite && s.status !== 'slaughtered' ? (
                              <select
                                className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                                value={s.animal_id || ''}
                                onChange={(e) => moveShare(s, e.target.value)}
                              >
                                <option value="">— Atanmamış</option>
                                {waitingAnimals.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.animal_number} ({a.shares.length}/{a.capacity})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-mono text-xs font-bold text-slate-800">
                                {s.animal_number || '—'}
                                {s.share_number ? ` / ${s.share_number}. Hisse` : ''}
                                {s.status === 'slaughtered' ? ' ✓' : ''}
                              </span>
                            )}
                          </Td>
                          <Td className="font-mono text-xs">
                            {s.receipt_number ? (
                              <Link
                                href={`/admin/bagislar?q=${encodeURIComponent(s.receipt_number)}`}
                                className="font-bold text-emerald-700 hover:underline"
                              >
                                {s.receipt_number}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </Td>
                          <Td className="text-right">
                            <div className="inline-flex items-center gap-2">
                              {(() => {
                                const wa = whatsappUrl(
                                  s.donor_phone,
                                  `Merhaba ${s.donor_name}, ${s.on_behalf_of || s.donor_name} adına alınan ${s.kurban_type_label} kurban hisseniz${s.animal_number ? ` (${s.animal_number})` : ''} ${s.status === 'slaughtered' ? 'kesilmiştir. Allah kabul etsin.' : 'kayıt altına alınmıştır.'}`,
                                )
                                return wa ? (
                                  <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp ile mesaj gönder" className="inline-flex hover:opacity-80">
                                    <WhatsAppIcon className="h-4 w-4" />
                                  </a>
                                ) : null
                              })()}
                              {canWrite && s.status !== 'slaughtered' && (
                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => editShare(s)}
                                >
                                  Düzenle
                                </button>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                      {visibleShares.length === 0 && (
                        <Tr>
                          <Td colSpan={canWrite ? 7 : 6} className="py-10 text-center text-slate-400">
                            Seçili filtrelere uygun hisse kaydı bulunamadı.
                          </Td>
                        </Tr>
                      )}
                    </TBody>
                  </Table>
                </div>
              </Card>

              {sharesTotal > SHARE_PAGE_SIZE && (
                <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-xs">
                  <span>
                    Toplam {sharesTotal} hisseden {((sharePage - 1) * SHARE_PAGE_SIZE) + 1}–{Math.min(sharePage * SHARE_PAGE_SIZE, sharesTotal)} arası gösteriliyor
                  </span>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={sharePage <= 1} onClick={() => setSharePage((p) => Math.max(1, p - 1))}>
                      Önceki
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={sharePage * SHARE_PAGE_SIZE >= sharesTotal}
                      onClick={() => setSharePage((p) => p + 1)}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'entry' && (
            <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              {selected.donation_campaign_id ? (
                <ManualReceiptForm
                  kurban={{ campaignId: selected.donation_campaign_id, pricePerShareCents: selected.price_per_share_cents, types }}
                  onDone={(r) => {
                    const numbers = [...new Set((r.kurban_shares || []).map((s) => s.animal_number).filter(Boolean))]
                    toast.ok(numbers.length
                      ? `${r.receipt_number} numaralı makbuz kesildi · Kurban No: ${numbers.join(', ')}`
                      : `${r.receipt_number} numaralı makbuz kesildi, hisseler oluşturuldu`)
                    setTab('shares')
                    loadSelected()
                  }}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Elden hisse kaydı için kampanyanın bir web bağış kalemine bağlı olması gerekir (Kampanya Ayarları sekmesinden bağlayabilirsiniz).
                </p>
              )}
            </Card>
          )}

          {tab === 'bulk' && (
            selected.donation_campaign_id ? (
              <KurbanBulkEntry
                key={selected.id}
                campaignId={selected.id}
                pricePerShareCents={selected.price_per_share_cents}
                capacity={selected.animal_type === 'cow' ? 7 : 1}
                types={types}
                onSaved={() => { loadCampaigns(); loadSelected() }}
              />
            ) : (
              <Card className="rounded-2xl border border-slate-200/80 p-6 text-sm text-slate-500 shadow-xs">
                Toplu giriş için kampanyanın bir web bağış kalemine bağlı olması gerekir (Kampanya Ayarları sekmesinden bağlayabilirsiniz).
              </Card>
            )
          )}

          {tab === 'settings' && (
            <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <CampaignForm
                initial={{
                  title: selected.title,
                  description: selected.description || '',
                  price: String(selected.price_per_share_cents / 100),
                  animal_type: selected.animal_type,
                  country: selected.country || '',
                  season_year: String(selected.season_year || ''),
                  animal_prefix: selected.animal_prefix,
                  status: selected.status,
                  create_donation_campaign: !selected.donation_campaign_id,
                  animal_label: selected.animal_label || '',
                  auto_assign: selected.auto_assign,
                }}
                onSubmit={(f) => saveCampaign(f, selected)}
                linked={!!selected.donation_campaign_id}
                lockAnimalType={summary.shares > 0 || summary.animals_waiting + summary.animals_slaughtered > 0}
                key={selected.id}
              />
            </Card>
          )}

          <MuhasebeStatModal
            isOpen={statModal !== null}
            onClose={() => setStatModal(null)}
            title={
              statModal === 'shares'
                ? 'Niyet Türüne Göre Hisse Dağılımı'
                : statModal === 'unassigned'
                  ? 'Hayvana Atanmayı Bekleyen Hisseler'
                  : statModal === 'animals'
                    ? 'Hayvan ve Kapasite Özeti'
                    : 'Kesim SMS Bildirimi Özeti'
            }
            subtitle={selected.title}
            items={
              statModal === 'shares'
                ? summary.by_kurban_type.map((t) => ({
                    label: t.label,
                    value: `${t.count} Hisse · ${formatMoney(t.count * selected.price_per_share_cents)}`,
                    percent: summary.shares > 0 ? Math.round((t.count / summary.shares) * 100) : 0,
                    color: 'emerald',
                  }))
                : statModal === 'unassigned'
                  ? shares
                      .filter((s) => !s.animal_id)
                      .map((s) => ({
                        label: s.on_behalf_of || s.donor_name,
                        value: s.kurban_type_label,
                        sub: `Bağışçı: ${s.donor_name} · ${s.donor_phone}`,
                        color: 'amber',
                      }))
                  : statModal === 'animals'
                    ? animals.map((a) => ({
                        label: `${a.animal_number} (${a.type_label})`,
                        value: `${a.shares.length}/${a.capacity} Hisse · ${a.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor'}`,
                        sub: a.shares.map((s) => s.name).join(', ') || 'Henüz hisse atanmadı',
                        percent: a.capacity > 0 ? Math.round((a.shares.length / a.capacity) * 100) : 0,
                        color: a.status === 'slaughtered' ? 'emerald' : 'blue',
                      }))
                    : shares
                        .filter((s) => s.notified)
                        .map((s) => ({
                          label: s.on_behalf_of || s.donor_name,
                          value: s.animal_number ? `${s.animal_number} / ${s.share_number}` : 'Atanmadı',
                          sub: `${s.donor_name} · ${s.donor_phone}`,
                          color: 'emerald',
                        }))
            }
          />
        </>
      )}

      {showCreate && (
        <Modal
          title="Yeni Kurban Kampanyası Oluştur"
          description="Web sitesinde bağış kalemi oluşturarak gelen bağışların otomatik kurban hissesine dönüşmesini sağlayabilirsiniz."
          size="lg"
          onClose={() => setShowCreate(false)}
        >
          <CampaignForm initial={emptyCampaign} onSubmit={(f) => saveCampaign(f)} isNew />
        </Modal>
      )}

      {slaughterModal && (
        <Modal
          title={`Kesim Onayı (${slaughterModal.ids.length} hayvan)`}
          description="Seçilen hayvanlar kesildi olarak işaretlenecek ve hissedarlara SMS bildirimi gönderilecektir."
          size="sm"
          onClose={() => setSlaughterModal(null)}
        >
          <form onSubmit={submitSlaughter} className="space-y-4">
            {slaughterModal.ids.length === 1 ? (
              <Label label="Kesim Videosu Bağlantısı (isteğe bağlı)">
                <Input
                  value={slaughterModal.videoUrl}
                  onChange={(e) => setSlaughterModal({ ...slaughterModal, videoUrl: e.target.value })}
                  placeholder="https://..."
                />
                <span className="mt-1 block text-[11px] text-slate-500">Bağışçı panelinde ve SMS içinde görüntülenecektir.</span>
              </Label>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Toplu kesimde her hayvanın mevcut video bağlantısı korunur; video linklerini hayvan kartlarından ayrı ayrı girebilirsiniz.
              </p>
            )}
            <Label label="Kesim Tarihi">
              <Input
                type="date"
                max={todayIso()}
                value={slaughterModal.date}
                onChange={(e) => setSlaughterModal({ ...slaughterModal, date: e.target.value })}
              />
            </Label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={slaughterModal.notify}
                onChange={(e) => setSlaughterModal({ ...slaughterModal, notify: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              Hissedarlara kesim SMS bildirimi gönder
            </label>
            {slaughterModal.notify && kurbanSmsTpl && (
              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-600">Kesim SMS Şablonu ({kurbanSmsTpl.name})</span>
                  {can(access, 'sms.templates') && (
                    <button
                      type="button"
                      disabled={savingKurbanTpl || kurbanSmsBody.trim().length < 2}
                      onClick={saveKurbanSmsTemplate}
                      className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {savingKurbanTpl ? 'Kaydediliyor…' : 'Şablon olarak kaydet'}
                    </button>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={kurbanSmsBody}
                  onChange={(e) => setKurbanSmsBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                />
                <p className="text-[10px] text-slate-500">
                  Değişkenler: {'{ad_soyad}'}, {'{kimin_adina}'}, {'{kurban_no}'}, {'{video}'}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSlaughterModal(null)}>Vazgeç</Button>
              <Button type="submit">Kesildi İşaretle</Button>
            </div>
          </form>
        </Modal>
      )}

      {animalEditModal && (
        <Modal
          title={`Hayvan Düzenle · ${animalEditModal.animal.animal_number}`}
          size="sm"
          onClose={() => setAnimalEditModal(null)}
        >
          <form onSubmit={submitAnimalEdit} className="space-y-4">
            <Label label="Hayvan Numarası">
              <Input
                required
                value={animalEditModal.animalNumber}
                onChange={(e) => setAnimalEditModal({ ...animalEditModal, animalNumber: e.target.value })}
              />
            </Label>
            <Label label="Kesim Videosu Bağlantısı">
              <Input
                value={animalEditModal.videoUrl}
                onChange={(e) => setAnimalEditModal({ ...animalEditModal, videoUrl: e.target.value })}
                placeholder="https://..."
              />
            </Label>
            <Label label="Video Durumu">
              <select
                className={inputClass}
                value={animalEditModal.videoStatus}
                onChange={(e) => setAnimalEditModal({ ...animalEditModal, videoStatus: e.target.value as VideoStatus })}
              >
                {VIDEO_STATUS_OPTIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </Label>
            {animalEditModal.animal.status === 'slaughtered' && (
              <Label label="Kesim Tarihi">
                <Input
                  type="date"
                  max={todayIso()}
                  value={animalEditModal.slaughteredOn}
                  onChange={(e) => setAnimalEditModal({ ...animalEditModal, slaughteredOn: e.target.value })}
                />
              </Label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAnimalEditModal(null)}>Vazgeç</Button>
              <Button type="submit">Kaydet</Button>
            </div>
          </form>
        </Modal>
      )}

      {videoModal && (
        <Modal title={`Video Durumu (${videoModal.ids.length} hayvan)`} size="sm" onClose={() => setVideoModal(null)}>
          <form onSubmit={submitVideo} className="space-y-4">
            <Label label="Video Durumu">
              <select className={inputClass} value={videoModal.status} onChange={(e) => setVideoModal({ ...videoModal, status: e.target.value as VideoStatus })}>
                {VIDEO_STATUS_OPTIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </Label>
            <Label label="Video Bağlantısı (isteğe bağlı)">
              <Input value={videoModal.videoUrl} onChange={(e) => setVideoModal({ ...videoModal, videoUrl: e.target.value })} placeholder="Boş bırakılırsa mevcut bağlantılar kalır" />
            </Label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setVideoModal(null)}>Vazgeç</Button>
              <Button type="submit">Kaydet</Button>
            </div>
          </form>
        </Modal>
      )}

      {addAnimalModal && (
        <Modal
          title="Elle Hayvan Ekle"
          description="Özel numara boş bırakılırsa kampanya ön eki ile otomatik numaralanır."
          size="sm"
          onClose={() => setAddAnimalModal(null)}
        >
          <form onSubmit={submitAddAnimals} className="space-y-4">
            <Label label="Hayvan Adedi">
              <Input
                type="number"
                min={1}
                max={500}
                required
                value={addAnimalModal.count}
                onChange={(e) => setAddAnimalModal({ ...addAnimalModal, count: e.target.value })}
              />
            </Label>
            <Label label="Özel Hayvan No (isteğe bağlı, tek hayvan için)">
              <Input
                value={addAnimalModal.animalNumber}
                onChange={(e) => setAddAnimalModal({ ...addAnimalModal, animalNumber: e.target.value })}
                placeholder="Örn: K-105"
              />
            </Label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddAnimalModal(null)}>Vazgeç</Button>
              <Button type="submit">Ekle</Button>
            </div>
          </form>
        </Modal>
      )}

      {shareEditModal && (
        <Modal
          title="Hisse Düzenle"
          size="sm"
          onClose={() => setShareEditModal(null)}
        >
          <form onSubmit={submitShareEdit} className="space-y-4">
            <Label label="Hissedar Adı (kurban kağıdında yazar)">
              <Input
                required
                value={shareEditModal.onBehalfOf}
                onChange={(e) => setShareEditModal({ ...shareEditModal, onBehalfOf: e.target.value })}
              />
            </Label>
            <Label label="Niyet Türü">
              <select
                className={inputClass}
                value={shareEditModal.kurbanType}
                onChange={(e) => setShareEditModal({ ...shareEditModal, kurbanType: e.target.value })}
              >
                {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShareEditModal(null)}>Vazgeç</Button>
              <Button type="submit">Kaydet</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

type CampaignFormValues = typeof emptyCampaign

function CampaignForm({
  initial, onSubmit, isNew, linked, lockAnimalType,
}: {
  initial: CampaignFormValues
  onSubmit: (form: CampaignFormValues) => void
  isNew?: boolean
  linked?: boolean
  lockAnimalType?: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = <K extends keyof CampaignFormValues>(k: K, v: CampaignFormValues[K]) => setForm((f) => ({ ...f, [k]: v }))
  const { countries, reload } = useKurbanCountries()
  const [countriesOpen, setCountriesOpen] = useState(false)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {countriesOpen && <KurbanCountriesModal onClose={() => setCountriesOpen(false)} onSaved={reload} />}
      <div className="sm:col-span-2">
        <Label label="Kampanya adı">
          <Input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Çad Büyükbaş Kurban 2026" />
        </Label>
      </div>
      <Label label="Hisse bedeli (₺)">
        <Input required inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
      </Label>
      <Label label="Hayvan türü">
        <select className={inputClass} value={form.animal_type} disabled={lockAnimalType} onChange={(e) => set('animal_type', e.target.value as 'cow' | 'sheep')}>
          <option value="cow">Büyükbaş (7 hisse)</option><option value="sheep">Küçükbaş (1 hisse)</option>
        </select>
        {lockAnimalType && <span className="mt-1 block text-[11px] text-slate-500">Kayıtlı hisse/hayvan olduğu için değiştirilemez.</span>}
      </Label>
      <Label label="Cins adı (kâğıtta ve kartta yazar)">
        <Input
          list="kurban-animal-labels"
          value={form.animal_label}
          onChange={(e) => set('animal_label', e.target.value)}
          placeholder={form.animal_type === 'cow' ? 'Sığır, Dana, Deve…' : 'Koyun, Keçi, Koç…'}
        />
        <datalist id="kurban-animal-labels">
          {(form.animal_type === 'cow' ? ['Sığır', 'Dana', 'Deve', 'Manda'] : ['Koyun', 'Keçi', 'Koç']).map((l) => <option key={l} value={l} />)}
        </datalist>
      </Label>
      <Label label="Kesim ülkesi">
        <Input list="kurban-countries" value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Çad" />
        <datalist id="kurban-countries">{countries.filter((c) => c.active).map((c) => <option key={c.name} value={c.name} />)}</datalist>
        <button type="button" onClick={() => setCountriesOpen(true)} className="mt-1 text-[11.5px] font-semibold text-primary-700 hover:underline">Ülkeleri yönet</button>
      </Label>
      <Label label="Sezon (yıl)">
        <Input inputMode="numeric" value={form.season_year} onChange={(e) => set('season_year', e.target.value)} />
      </Label>
      <Label label="Hayvan no ön eki">
        <Input value={form.animal_prefix} onChange={(e) => set('animal_prefix', e.target.value.toUpperCase())} placeholder="Örn: CD" />
      </Label>
      <Label label="Durum">
        <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as 'active' | 'completed')}>
          <option value="active">Aktif</option><option value="completed">Tamamlandı</option>
        </select>
      </Label>
      <div className="sm:col-span-2 lg:col-span-4">
        <Label label="Açıklama">
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 sm:col-span-2 lg:col-span-4">
        <input type="checkbox" checked={form.auto_assign} onChange={(e) => set('auto_assign', e.target.checked)} />
        Kurban numarası kayıt anında verilsin (hisseler kaydedilir kaydedilmez hayvana yerleşir; kapalıyken “Hisseleri Dağıt” beklenir)
      </label>
      {!linked && (
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 sm:col-span-2 lg:col-span-4">
          <input type="checkbox" checked={form.create_donation_campaign} onChange={(e) => set('create_donation_campaign', e.target.checked)} />
          Web sitesinde bağış kalemi oluştur (bağışlar otomatik hisseye dönüşür; tür ve isim alanları eklenir)
        </label>
      )}
      <div className="flex justify-end sm:col-span-2 lg:col-span-4">
        <Button type="submit">{isNew ? 'Oluştur' : 'Kaydet'}</Button>
      </div>
    </form>
  )
}
