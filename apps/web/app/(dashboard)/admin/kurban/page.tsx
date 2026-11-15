'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@e-infak/ui'
import {
  Beef,
  Calculator,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Filter,
  HandCoins,
  MessageSquare,
  Plus,
  Settings,
  Shuffle,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react'
import { apiErrorMessage, downloadFile, formatMoney, useAdminAccess, v1Get, v1Send, whatsappUrl, can } from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ManualReceiptForm } from '../../../../components/admin/ManualReceiptForm'
import { ExportButtons, Modal, TBody, THead, Table, Tabs, Td, Th, Tr, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'
import { AppPageHeader, GlobalStatCard, MuhasebeStatModal, ResponsiveDataToolbar } from '../../../../components/admin/muhasebe/OnMuhasebeUI'

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
  capacity: number
  country: string | null
  status: 'waiting' | 'slaughtered'
  video_url: string | null
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

type Tab = 'animals' | 'shares' | 'entry' | 'settings'

const emptyCampaign = {
  title: '', description: '', price: '', animal_type: 'cow' as 'cow' | 'sheep', country: '', season_year: String(new Date().getFullYear()),
  animal_prefix: 'K', status: 'active' as 'active' | 'completed', create_donation_campaign: true,
}

export default function KurbanAdminPage() {
  const { data: access } = useAdminAccess()
  const canWrite = can(access, 'kurban.manage')
  const canIssue = can(access, 'receipts.create')
  const [campaigns, setCampaigns] = useState<KurbanCampaign[]>([])
  const [types, setTypes] = useState<{ key: string; label: string }[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [tab, setTab] = useState<Tab>('animals')
  const [animalFilter, setAnimalFilter] = useState<'' | 'waiting' | 'slaughtered'>('')
  const [search, setSearch] = useState('')
  const [shareFilter, setShareFilter] = useState<'' | 'true' | 'false'>('')
  const [shareKurbanType, setShareKurbanType] = useState('')
  const [shareStatus, setShareStatus] = useState<'' | 'waiting' | 'slaughtered'>('')
  const [showFilters, setShowFilters] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [statModal, setStatModal] = useState<'shares' | 'unassigned' | 'animals' | 'notified' | null>(null)
  const [slaughterModal, setSlaughterModal] = useState<{ ids: string[]; videoUrl: string; notify: boolean } | null>(null)
  const [animalEditModal, setAnimalEditModal] = useState<{ animal: Animal; animalNumber: string; videoUrl: string } | null>(null)
  const [addAnimalModal, setAddAnimalModal] = useState<{ count: string; animalNumber: string } | null>(null)
  const [shareEditModal, setShareEditModal] = useState<{ share: Share; onBehalfOf: string; kurbanType: string } | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const loadCampaigns = async () => {
    try {
      const [c, t] = await Promise.all([v1Get<KurbanCampaign[]>('/kurban/campaigns'), v1Get<{ key: string; label: string }[]>('/kurban/types')])
      setCampaigns(c.data)
      setTypes(t.data)
      if (!selectedId && c.data.length) setSelectedId(c.data[0].id)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kurban kampanyaları yüklenemedi') })
    }
  }

  const loadSelected = async () => {
    if (!selectedId) return
    try {
      const [s, a, sh] = await Promise.all([
        v1Get<Summary>(`/kurban/campaigns/${selectedId}/summary`),
        v1Get<Animal[]>('/kurban/animals', { campaign_id: selectedId, status: animalFilter || undefined, q: search || undefined }),
        v1Get<{ items: Share[] }>('/kurban/shares', {
          campaign_id: selectedId, assigned: shareFilter || undefined,
          kurban_type: shareKurbanType || undefined, status: shareStatus || undefined,
          q: search || undefined, page_size: 1000,
        }),
      ])
      setSummary(s.data)
      setAnimals(a.data)
      setShares(sh.data.items)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  useEffect(() => { loadCampaigns() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPicked(new Set())
    const t = setTimeout(loadSelected, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, animalFilter, search, shareFilter, shareKurbanType, shareStatus])

  const run = async (fn: () => Promise<unknown>, ok: string | ((r: any) => string)) => {
    setBusy(true)
    setMessage(null)
    try {
      const res: any = await fn()
      setMessage({ type: 'ok', text: typeof ok === 'function' ? ok(res?.data) : ok })
      await Promise.all([loadCampaigns(), loadSelected()])
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
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
    setSlaughterModal({ ids, videoUrl: single?.video_url || '', notify: true })
  }

  const submitSlaughter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slaughterModal) return
    const { ids, videoUrl, notify } = slaughterModal
    setSlaughterModal(null)
    await run(() => v1Send('post', '/kurban/animals/slaughter', {
      items: ids.map((animal_id) => ({ animal_id, video_url: videoUrl.trim() || null })), notify,
    }), (r) => `${r.marked} hayvan kesildi olarak işaretlendi, ${r.sms_queued} SMS kuyruğa alındı${r.sms_failed ? `, ${r.sms_failed} SMS gönderilemedi` : ''}`)
  }

  const setVideo = (animal: Animal) => {
    setAnimalEditModal({ animal, animalNumber: animal.animal_number, videoUrl: animal.video_url || '' })
  }

  const submitAnimalEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animalEditModal) return
    const { animal, animalNumber, videoUrl } = animalEditModal
    setAnimalEditModal(null)
    await run(() => v1Send('put', `/kurban/animals/${animal.id}`, {
      animal_number: animalNumber.trim() || undefined,
      video_url: videoUrl.trim() || null,
    }), 'Hayvan güncellendi')
  }

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

  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const activeFilterCount = useMemo(() => {
    if (tab === 'animals') return [animalFilter].filter(Boolean).length
    if (tab === 'shares') return [shareFilter, shareKurbanType, shareStatus].filter(Boolean).length
    return 0
  }, [tab, animalFilter, shareFilter, shareKurbanType, shareStatus])

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
                {selected.animal_type_label} · Hisse: {formatMoney(selected.price_per_share_cents)}
              </span>
              {selected.country && (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  📍 {selected.country} {selected.season_year ? `(${selected.season_year})` : ''}
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
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {campaigns.length === 0 && <option value="">Kampanya yok</option>}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}{c.unassigned_shares ? ` (${c.unassigned_shares} bekleyen)` : ''}
                </option>
              ))}
            </select>
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
            {selectedId && (
              <button
                type="button"
                onClick={() => downloadFile(`/kurban/campaigns/${selectedId}/papers.pdf`, 'kurban-kagitlari.pdf', {
                  status: animalFilter === 'slaughtered' ? 'slaughtered' : 'waiting',
                }).catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'PDF indirilemedi') }))}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 text-emerald-600" />
                {animalFilter === 'slaughtered' ? 'Kesilen Kağıtlar (PDF)' : 'Kurban Kağıtları (PDF)'}
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

      <Notice message={message} />

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
                { key: 'animals', label: 'Hayvanlar & Çadırlar', count: animals.length, icon: Beef },
                { key: 'shares', label: 'Hisseler & Hissedarlar', count: shares.length, icon: Users },
                ...(canIssue ? [{ key: 'entry' as Tab, label: 'Elden Hisse Kaydı', icon: HandCoins }] : []),
                ...(canWrite ? [{ key: 'settings' as Tab, label: 'Kampanya Ayarları', icon: Settings }] : []),
              ]}
            />
          </div>

          {(tab === 'animals' || tab === 'shares') && (
            <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <ResponsiveDataToolbar
                search={{
                  value: search,
                  onChange: setSearch,
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
                    {tab === 'animals' && canWrite && waitingAnimals.length > 0 && picked.size === 0 && (
                      <button
                        type="button"
                        onClick={() => setPicked(new Set(waitingAnimals.map((a) => a.id)))}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                      >
                        Bekleyenleri Seç ({waitingAnimals.length})
                      </button>
                    )}
                    {tab === 'animals' && canWrite && picked.size > 0 && (
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
                      subtitle={tab === 'animals' ? `${animals.length} hayvan` : `${shares.length} hisse`}
                      summary={[
                        ['Kampanya', selected.title],
                        ['Hisse Bedeli', formatMoney(selected.price_per_share_cents)],
                        ['Toplam Hisse', String(summary.shares)],
                        ['Kesilen Hayvan', `${summary.animals_slaughtered} / ${summary.animals_waiting + summary.animals_slaughtered}`],
                      ]}
                      getData={() =>
                        tab === 'animals'
                          ? {
                              headers: ['Hayvan No', 'Kapasite', 'Dolu Hisse', 'Durum', 'Hissedarlar'],
                              rows: animals.map((a) => [
                                a.animal_number,
                                a.capacity,
                                a.shares.length,
                                a.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor',
                                a.shares.map((s) => `${s.share_number}. ${s.name}`).join(', '),
                              ]),
                            }
                          : {
                              headers: ['Hayvan', 'Hisse', 'Hissedar', 'Bağışçı', 'Telefon', 'Tür', 'Durum', 'Makbuz'],
                              rows: shares.map((s) => [
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

              {showFilters && (
                <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-3">
                  {tab === 'animals' ? (
                    <Label label="Kesim Durumu">
                      <select className={inputClass} value={animalFilter} onChange={(e) => setAnimalFilter(e.target.value as typeof animalFilter)}>
                        <option value="">Tüm hayvanlar</option>
                        <option value="waiting">Kesim bekleyen</option>
                        <option value="slaughtered">Kesilen</option>
                      </select>
                    </Label>
                  ) : (
                    <>
                      <Label label="Atama Durumu">
                        <select className={inputClass} value={shareFilter} onChange={(e) => setShareFilter(e.target.value as typeof shareFilter)}>
                          <option value="">Tüm hisseler</option>
                          <option value="false">Dağıtılmamış (Bekleyen)</option>
                          <option value="true">Hayvana atanmış</option>
                        </select>
                      </Label>
                      <Label label="Niyet Türü">
                        <select className={inputClass} value={shareKurbanType} onChange={(e) => setShareKurbanType(e.target.value)}>
                          <option value="">Tüm niyetler</option>
                          {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      </Label>
                      <Label label="Kesim Durumu">
                        <select className={inputClass} value={shareStatus} onChange={(e) => setShareStatus(e.target.value as typeof shareStatus)}>
                          <option value="">Tüm durumlar</option>
                          <option value="waiting">Bekliyor</option>
                          <option value="slaughtered">Kesildi</option>
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
              {animals.length === 0 ? (
                <Card className="border border-slate-200/80 p-12 text-center shadow-xs">
                  <Beef className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">Henüz hayvan kaydı bulunmuyor</p>
                  <p className="mt-1 text-xs text-slate-500">Hisseler geldikçe &quot;Hisseleri Dağıt&quot; butonuyla hayvanlar otomatik oluşturulur veya elle ekleyebilirsiniz.</p>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {animals.map((a) => {
                    const fillPct = a.capacity > 0 ? Math.min(100, Math.round((a.shares.length / a.capacity) * 100)) : 0
                    const isSlaughtered = a.status === 'slaughtered'
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
                              {canWrite && !isSlaughtered && (
                                <input
                                  type="checkbox"
                                  checked={picked.has(a.id)}
                                  onChange={() => togglePick(a.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                              )}
                              <span className="font-mono text-lg font-black tracking-tight text-slate-900">{a.animal_number}</span>
                            </label>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                                isSlaughtered
                                  ? 'border-emerald-300 bg-emerald-100/70 text-emerald-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {isSlaughtered ? '✓ Kesildi' : '⏳ Bekliyor'} · {a.shares.length}/{a.capacity}
                            </span>
                          </div>

                          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${isSlaughtered ? 'bg-emerald-600' : 'bg-teal-600'}`}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>

                          <ol className="mt-3.5 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-xs">
                            {a.shares.map((s) => (
                              <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                                <span className="truncate font-semibold text-slate-800">
                                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800">
                                    {s.share_number}
                                  </span>
                                  {s.name}
                                </span>
                                <span className="shrink-0 text-[11px] font-medium text-slate-500">
                                  {types.find((t) => t.key === s.kurban_type)?.label}
                                  {s.notified ? ' · ✉️' : ''}
                                </span>
                              </li>
                            ))}
                            {Array.from({ length: Math.max(0, a.capacity - a.shares.length) }).map((_, i) => (
                              <li key={`empty-${i}`} className="py-1.5 text-xs italic text-slate-400">
                                — Boş hisse ({a.shares.length + i + 1}/{a.capacity})
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => downloadFile(`/kurban/animals/${a.id}/paper.pdf`, `kurban-${a.animal_number}.pdf`)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <FileText className="h-3.5 w-3.5 text-emerald-600" />
                              Kesim Kağıdı
                            </button>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => setVideo(a)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                <Video className={`h-3.5 w-3.5 ${a.video_url ? 'text-emerald-600' : 'text-slate-400'}`} />
                                {a.video_url ? 'Video ✓' : 'Video / No'}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {canWrite && !isSlaughtered && (
                              <button
                                type="button"
                                onClick={() => slaughter([a.id])}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Kesildi
                              </button>
                            )}
                            {canWrite && !isSlaughtered && a.shares.length === 0 && (
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
            <Card className="overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-xs">
              <div className="overflow-x-auto">
                <Table inset>
                  <THead className="bg-slate-50/80">
                    <Tr>
                      <Th>Hissedar (Vekâlet)</Th>
                      <Th>Bağışçı & İletişim</Th>
                      <Th>Niyet Türü</Th>
                      <Th>Hayvan / Hisse</Th>
                      <Th>Makbuz No</Th>
                      <Th className="text-right">İşlem</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {shares.map((s) => (
                      <Tr key={s.id} className="hover:bg-slate-50/70">
                        <Td className="font-bold text-slate-900">{s.on_behalf_of || s.donor_name}</Td>
                        <Td>
                          <div className="font-medium text-slate-800">{s.donor_name}</div>
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
                        <Td className="font-mono text-xs text-slate-500">{s.receipt_number || '—'}</Td>
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
                    {shares.length === 0 && (
                      <Tr>
                        <Td colSpan={6} className="py-10 text-center text-slate-400">
                          Seçili filtrelere uygun hisse kaydı bulunamadı.
                        </Td>
                      </Tr>
                    )}
                  </TBody>
                </Table>
              </div>
            </Card>
          )}

          {tab === 'entry' && (
            <Card className="rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              {selected.donation_campaign_id ? (
                <ManualReceiptForm
                  kurban={{ campaignId: selected.donation_campaign_id, pricePerShareCents: selected.price_per_share_cents, types }}
                  onDone={(r) => {
                    setMessage({ type: 'ok', text: `${r.receipt_number} numaralı makbuz kesildi, hisseler oluşturuldu` })
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
                }}
                onSubmit={(f) => saveCampaign(f, selected)}
                linked={!!selected.donation_campaign_id}
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
            <TextInput
              label="Kesim Videosu Bağlantısı (isteğe bağlı)"
              value={slaughterModal.videoUrl}
              onChange={(v) => setSlaughterModal({ ...slaughterModal, videoUrl: v })}
              placeholder="https://..."
              hint="Bağışçı panelinde ve SMS içinde görüntülenecektir."
            />
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={slaughterModal.notify}
                onChange={(e) => setSlaughterModal({ ...slaughterModal, notify: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              Hissedarlara kesim SMS bildirimi gönder
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={ghostButton} onClick={() => setSlaughterModal(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kesildi İşaretle</button>
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
            <TextInput
              label="Hayvan Numarası"
              required
              value={animalEditModal.animalNumber}
              onChange={(v) => setAnimalEditModal({ ...animalEditModal, animalNumber: v })}
            />
            <TextInput
              label="Kesim Videosu Bağlantısı"
              value={animalEditModal.videoUrl}
              onChange={(v) => setAnimalEditModal({ ...animalEditModal, videoUrl: v })}
              placeholder="https://..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={ghostButton} onClick={() => setAnimalEditModal(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
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
            <TextInput
              label="Hayvan Adedi"
              type="number"
              min={1}
              max={500}
              required
              value={addAnimalModal.count}
              onChange={(v) => setAddAnimalModal({ ...addAnimalModal, count: v })}
            />
            <TextInput
              label="Özel Hayvan No (isteğe bağlı, tek hayvan için)"
              value={addAnimalModal.animalNumber}
              onChange={(v) => setAddAnimalModal({ ...addAnimalModal, animalNumber: v })}
              placeholder="Örn: K-105"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={ghostButton} onClick={() => setAddAnimalModal(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Ekle</button>
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
            <TextInput
              label="Hissedar Adı (kurban kağıdında yazar)"
              required
              value={shareEditModal.onBehalfOf}
              onChange={(v) => setShareEditModal({ ...shareEditModal, onBehalfOf: v })}
            />
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
              <button type="button" className={ghostButton} onClick={() => setShareEditModal(null)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

type CampaignFormValues = typeof emptyCampaign

function CampaignForm({
  initial, onSubmit, isNew, linked,
}: {
  initial: CampaignFormValues
  onSubmit: (form: CampaignFormValues) => void
  isNew?: boolean
  linked?: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = <K extends keyof CampaignFormValues>(k: K, v: CampaignFormValues[K]) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2"><TextInput label="Kampanya adı" required value={form.title} onChange={(v) => set('title', v)} placeholder="Çad Büyükbaş Kurban 2026" /></div>
      <TextInput label="Hisse bedeli (₺)" required inputMode="decimal" value={form.price} onChange={(v) => set('price', v)} />
      <Label label="Hayvan türü">
        <select className={inputClass} value={form.animal_type} onChange={(e) => set('animal_type', e.target.value as 'cow' | 'sheep')}>
          <option value="cow">Büyükbaş (7 hisse)</option><option value="sheep">Küçükbaş (1 hisse)</option>
        </select>
      </Label>
      <TextInput label="Kesim ülkesi" value={form.country} onChange={(v) => set('country', v)} placeholder="Çad" />
      <TextInput label="Sezon (yıl)" inputMode="numeric" value={form.season_year} onChange={(v) => set('season_year', v)} />
      <TextInput label="Hayvan no ön eki" value={form.animal_prefix} onChange={(v) => set('animal_prefix', v.toUpperCase())} hint="ör. CD → CD-001" />
      <Label label="Durum">
        <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as 'active' | 'completed')}>
          <option value="active">Aktif</option><option value="completed">Tamamlandı</option>
        </select>
      </Label>
      <div className="sm:col-span-2 lg:col-span-4"><TextInput label="Açıklama" value={form.description} onChange={(v) => set('description', v)} /></div>
      {!linked && (
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 sm:col-span-2 lg:col-span-4">
          <input type="checkbox" checked={form.create_donation_campaign} onChange={(e) => set('create_donation_campaign', e.target.checked)} />
          Web sitesinde bağış kalemi oluştur (bağışlar otomatik hisseye dönüşür; tür ve isim alanları eklenir)
        </label>
      )}
      <div className="flex justify-end sm:col-span-2 lg:col-span-4">
        <button type="submit" className={primaryButton}>{isNew ? 'Oluştur' : 'Kaydet'}</button>
      </div>
    </form>
  )
}
