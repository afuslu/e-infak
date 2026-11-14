'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@e-infak/ui'
import {
  Calculator, CheckCircle2, Clock, Coins, FileText, MessageCircle, MessageSquare, Search, Users, Video, X,
} from 'lucide-react'
import {
  apiErrorMessage, downloadFile, exportCsv, formatMoney, hasPermission, useAdminAccess, v1Get, v1Send, whatsappUrl,
} from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ManualReceiptForm } from '../../../../components/admin/ManualReceiptForm'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, confirmDialog } from '../../../../components/admin/ui'

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
  const canWrite = hasPermission(access, 'operations_manage')
  const canIssue = hasPermission(access, 'finance_manage')
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
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
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

  useEffect(() => { loadCampaigns() }, [])
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

  return (
    <div className="space-y-6">
      <PageHeader title="Kurban Organizasyonu" description={<>Web bağışları ve elden alınan hisseler otomatik olarak hisseye dönüşür; &quot;Hisseleri dağıt&quot; ile hayvanlara yerleştirilir.</>} actions={<div className="flex gap-2">
          <select className={`${inputClass} w-64`} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {campaigns.length === 0 && <option value="">Kampanya yok</option>}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.title}{c.unassigned_shares ? ` (${c.unassigned_shares} bekleyen)` : ''}</option>
            ))}
          </select>
          {canWrite && (
            <button className={primaryButton} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Vazgeç' : '+ Kurban Kampanyası'}
            </button>
          )}
        </div>} />

      <Notice message={message} />

      {showCreate && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <CampaignForm initial={emptyCampaign} onSubmit={(f) => saveCampaign(f)} isNew />
        </Card>
      )}

      {selected && summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Hisse bedeli"
              icon={Coins}
              value={formatMoney(selected.price_per_share_cents)}
              detail={{
                title: 'Niyet Türüne Göre Hisse Dağılımı',
                size: 'md',
                content: () => (
                  <Table>
                    <THead><Tr><Th>Niyet Türü</Th><Th className="text-right">Hisse Adedi</Th><Th className="text-right">Toplam Tutar</Th></Tr></THead>
                    <TBody>
                      {summary.by_kurban_type.map((t) => (
                        <Tr key={t.key}>
                          <Td className="font-semibold">{t.label}</Td>
                          <Td className="text-right tabular-nums">{t.count}</Td>
                          <Td className="text-right font-bold tabular-nums">{formatMoney(t.count * selected.price_per_share_cents)}</Td>
                        </Tr>
                      ))}
                      {summary.by_kurban_type.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Hisse yok.</Td></Tr>}
                    </TBody>
                  </Table>
                ),
              }}
            />
            <StatCard
              label="Toplam hisse"
              icon={Users}
              value={summary.shares}
              detail={{
                title: 'Kampanya Hisseleri',
                description: `Toplam ${shares.length} hisse listeleniyor`,
                content: () => (
                  <Table>
                    <THead><Tr><Th>Hissedar</Th><Th>Bağışçı</Th><Th>Niyet</Th><Th>Hayvan</Th><Th className="text-right">Durum</Th></Tr></THead>
                    <TBody>
                      {shares.map((s) => (
                        <Tr key={s.id}>
                          <Td className="font-semibold">{s.on_behalf_of || s.donor_name}</Td>
                          <Td className="text-xs text-gray-500">{s.donor_name}</Td>
                          <Td className="text-xs">{s.kurban_type_label}</Td>
                          <Td className="font-mono text-xs">{s.animal_number ? `${s.animal_number}/${s.share_number}` : 'Atanmadı'}</Td>
                          <Td className="text-right text-xs font-semibold">{s.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor'}</Td>
                        </Tr>
                      ))}
                      {shares.length === 0 && <Tr><Td colSpan={5} className="text-center text-gray-400">Hisse yok.</Td></Tr>}
                    </TBody>
                  </Table>
                ),
              }}
            />
            <StatCard
              label="Dağıtılmayı bekleyen"
              icon={Clock}
              tone={summary.unassigned_shares > 0 ? 'warn' : 'neutral'}
              className={summary.unassigned_shares > 0 ? 'border-amber-200 bg-amber-50/40' : undefined}
              value={summary.unassigned_shares}
              detail={{
                title: 'Hayvana Atanmayı Bekleyen Hisseler',
                content: () => {
                  const unassigned = shares.filter((s) => !s.animal_id)
                  return (
                    <Table>
                      <THead><Tr><Th>Hissedar</Th><Th>Bağışçı</Th><Th>Telefon</Th><Th>Niyet</Th></Tr></THead>
                      <TBody>
                        {unassigned.map((s) => (
                          <Tr key={s.id}>
                            <Td className="font-semibold">{s.on_behalf_of || s.donor_name}</Td>
                            <Td className="text-xs">{s.donor_name}</Td>
                            <Td className="text-xs text-gray-500">{s.donor_phone}</Td>
                            <Td className="text-xs">{s.kurban_type_label}</Td>
                          </Tr>
                        ))}
                        {unassigned.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Dağıtılmayı bekleyen hisse yok.</Td></Tr>}
                      </TBody>
                    </Table>
                  )
                },
              }}
            />
            <StatCard
              label="Hayvan (bekleyen / kesilen)"
              icon={CheckCircle2}
              value={`${summary.animals_waiting} / ${summary.animals_slaughtered}`}
              detail={{
                title: 'Kurban Hayvanları',
                content: () => (
                  <Table>
                    <THead><Tr><Th>Hayvan No</Th><Th>Doluluk</Th><Th>Durum</Th><Th className="text-right">Video</Th></Tr></THead>
                    <TBody>
                      {animals.map((a) => (
                        <Tr key={a.id}>
                          <Td className="font-mono font-bold">{a.animal_number}</Td>
                          <Td className="tabular-nums">{a.shares.length} / {a.capacity}</Td>
                          <Td className={`text-xs font-semibold ${a.status === 'slaughtered' ? 'text-green-700' : 'text-amber-700'}`}>
                            {a.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor'}
                          </Td>
                          <Td className="text-right text-xs">{a.video_url ? 'Var' : '—'}</Td>
                        </Tr>
                      ))}
                      {animals.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Hayvan yok.</Td></Tr>}
                    </TBody>
                  </Table>
                ),
              }}
            />
            <StatCard
              label="Gereken hayvan"
              icon={Calculator}
              value={summary.expected_animals}
              detail={{
                title: 'Kapasite & Hayvan Planlaması',
                size: 'md',
                content: () => (
                  <Table>
                    <TBody>
                      <Tr><Td className="font-semibold">Hayvan Türü</Td><Td className="text-right font-bold">{selected.animal_type_label}</Td></Tr>
                      <Tr><Td className="font-semibold">Toplam Hisse</Td><Td className="text-right font-bold tabular-nums">{summary.shares}</Td></Tr>
                      <Tr><Td className="font-semibold">Gereken Hayvan</Td><Td className="text-right font-bold tabular-nums">{summary.expected_animals}</Td></Tr>
                      <Tr><Td className="font-semibold">Mevcut Hayvan (Bekleyen + Kesilen)</Td><Td className="text-right font-bold tabular-nums">{summary.animals_waiting + summary.animals_slaughtered}</Td></Tr>
                    </TBody>
                  </Table>
                ),
              }}
            />
            <StatCard
              label="SMS gönderilen hisse"
              icon={MessageSquare}
              value={summary.notified_shares}
              detail={{
                title: 'Kesim SMS Bildirimi Gönderilen Hisseler',
                content: () => {
                  const notified = shares.filter((s) => s.notified)
                  return (
                    <Table>
                      <THead><Tr><Th>Hissedar</Th><Th>Bağışçı</Th><Th>Telefon</Th><Th>Hayvan</Th></Tr></THead>
                      <TBody>
                        {notified.map((s) => (
                          <Tr key={s.id}>
                            <Td className="font-semibold">{s.on_behalf_of || s.donor_name}</Td>
                            <Td className="text-xs">{s.donor_name}</Td>
                            <Td className="text-xs text-gray-500">{s.donor_phone}</Td>
                            <Td className="font-mono text-xs">{s.animal_number || '—'}</Td>
                          </Tr>
                        ))}
                        {notified.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">SMS gönderilen hisse yok.</Td></Tr>}
                      </TBody>
                    </Table>
                  )
                },
              }}
            />
          </div>
          {summary.by_kurban_type.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {summary.by_kurban_type.map((t) => <span key={t.key} className="rounded-full border bg-white px-3 py-1 font-semibold">{t.label}: {t.count}</span>)}
              <span className="rounded-full border bg-white px-3 py-1 text-gray-500">
                {selected.animal_type_label} · {selected.country || 'Ülke belirtilmedi'} · {selected.season_year || ''}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 border-b text-sm font-semibold">
              {([
                ['animals', `Hayvanlar (${animals.length})`],
                ['shares', `Hisseler (${shares.length})`],
                ...(canIssue ? [['entry', 'Elden Hisse Kaydı']] : []),
                ...(canWrite ? [['settings', 'Kampanya Ayarları']] : []),
              ] as [Tab, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{l}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input className={`${inputClass} w-56 pl-8`} placeholder="Hayvan no, isim, telefon" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {canWrite && summary.unassigned_shares > 0 && (
                <button disabled={busy} onClick={distribute} className={primaryButton}>Hisseleri dağıt ({summary.unassigned_shares})</button>
              )}
              <button
                className={ghostButton}
                onClick={() => downloadFile(`/kurban/campaigns/${selectedId}/papers.pdf`, 'kurban-kagitlari.pdf', {
                  status: animalFilter === 'slaughtered' ? 'slaughtered' : 'waiting',
                }).catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'PDF indirilemedi') }))}
              >
                <FileText className="mr-1.5 inline h-4 w-4" />
                {animalFilter === 'slaughtered' ? 'Kesilen kağıtlar (PDF)' : 'Kurban kağıtları (PDF)'}
              </button>
            </div>
          </div>

          {tab === 'animals' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select className={`${inputClass} w-44`} value={animalFilter} onChange={(e) => setAnimalFilter(e.target.value as typeof animalFilter)}>
                  <option value="">Tüm hayvanlar</option><option value="waiting">Kesim bekleyen</option><option value="slaughtered">Kesilen</option>
                </select>
                {canWrite && <button className={ghostButton} onClick={addAnimals}>+ Elle hayvan ekle</button>}
                {canWrite && picked.size > 0 && (
                  <button disabled={busy} className={primaryButton} onClick={() => slaughter([...picked])}>Seçilenleri kesildi işaretle ({picked.size})</button>
                )}
                {canWrite && waitingAnimals.length > 0 && picked.size === 0 && (
                  <button className={ghostButton} onClick={() => setPicked(new Set(waitingAnimals.map((a) => a.id)))}>Bekleyenlerin tümünü seç</button>
                )}
              </div>
              {animals.length === 0 ? (
                <p className="py-10 text-center text-xs text-gray-400">Henüz hayvan yok. Hisseler geldikçe &quot;Hisseleri dağıt&quot; ile hayvanlar otomatik oluşturulur.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {animals.map((a) => (
                    <Card key={a.id} className={`border p-4 shadow-sm ${a.status === 'slaughtered' ? 'border-green-200 bg-green-50/40' : 'border-gray-100'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-center gap-2">
                          {canWrite && a.status === 'waiting' && <input type="checkbox" checked={picked.has(a.id)} onChange={() => togglePick(a.id)} />}
                          <span className="text-lg font-black">{a.animal_number}</span>
                        </label>
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${a.status === 'slaughtered' ? 'border-green-300 text-green-700' : 'border-amber-200 text-amber-700'}`}>
                          {a.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor'} · {a.shares.length}/{a.capacity}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all ${a.status === 'slaughtered' ? 'bg-green-600' : 'bg-primary-600'}`}
                          style={{ width: `${a.capacity > 0 ? Math.min(100, Math.round((a.shares.length / a.capacity) * 100)) : 0}%` }}
                        />
                      </div>
                      <ol className="mt-3 space-y-1 text-sm">
                        {a.shares.map((s) => (
                          <li key={s.id} className="flex justify-between gap-2">
                            <span className="truncate">{s.share_number}. {s.name}</span>
                            <span className="text-xs text-gray-400">{types.find((t) => t.key === s.kurban_type)?.label}{s.notified ? ' · ✉' : ''}</span>
                          </li>
                        ))}
                        {Array.from({ length: Math.max(0, a.capacity - a.shares.length) }).map((_, i) => (
                          <li key={`empty-${i}`} className="text-xs text-gray-300">— boş hisse</li>
                        ))}
                      </ol>
                      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                        <button className={ghostButton} onClick={() => downloadFile(`/kurban/animals/${a.id}/paper.pdf`, `kurban-${a.animal_number}.pdf`)}>Kağıt</button>
                        {canWrite && (
                          <button className={ghostButton} onClick={() => setVideo(a)}>
                            <Video className="mr-1 inline h-3.5 w-3.5" />
                            {a.video_url ? 'Video ✓ / No' : 'Video / Düzenle'}
                          </button>
                        )}
                        {canWrite && a.status === 'waiting' && <button className={ghostButton} onClick={() => slaughter([a.id])}>Kesildi</button>}
                        {canWrite && a.status === 'waiting' && a.shares.length === 0 && <button className={`${ghostButton} text-red-600`} onClick={() => deleteAnimal(a)}>Sil</button>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'shares' && (
            <Card className="border border-gray-100 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select className={`${inputClass} w-44`} value={shareFilter} onChange={(e) => setShareFilter(e.target.value as typeof shareFilter)}>
                  <option value="">Tüm hisseler</option><option value="false">Dağıtılmamış</option><option value="true">Hayvana atanmış</option>
                </select>
                <select className={`${inputClass} w-40`} value={shareKurbanType} onChange={(e) => setShareKurbanType(e.target.value)}>
                  <option value="">Tüm niyetler</option>
                  {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <select className={`${inputClass} w-40`} value={shareStatus} onChange={(e) => setShareStatus(e.target.value as typeof shareStatus)}>
                  <option value="">Tüm durumlar</option><option value="waiting">Bekliyor</option><option value="slaughtered">Kesildi</option>
                </select>
                <button className={ghostButton} onClick={() => exportCsv('kurban-hisseleri.csv',
                  ['Hayvan', 'Hisse', 'Hissedar', 'Bağışçı', 'Telefon', 'Tür', 'Durum', 'Makbuz'],
                  shares.map((s) => [s.animal_number || '', s.share_number || '', s.on_behalf_of || s.donor_name, s.donor_name, s.donor_phone,
                    s.kurban_type_label, s.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor', s.receipt_number]))}>⬇ CSV</button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Hissedar</Th><Th>Bağışçı</Th><Th>Tür</Th><Th>Hayvan</Th><Th>Makbuz</Th><Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {shares.map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-semibold">{s.on_behalf_of || s.donor_name}</Td>
                        <Td>{s.donor_name}<div className="text-[10px] text-gray-400">{s.donor_phone}</div></Td>
                        <Td>{s.kurban_type_label}</Td>
                        <Td>
                          {canWrite && s.status !== 'slaughtered' ? (
                            <select className="rounded border p-1 text-xs" value={s.animal_id || ''} onChange={(e) => moveShare(s, e.target.value)}>
                              <option value="">— Atanmamış</option>
                              {waitingAnimals.map((a) => <option key={a.id} value={a.id}>{a.animal_number} ({a.shares.length}/{a.capacity})</option>)}
                            </select>
                          ) : (
                            <span>{s.animal_number || '—'}{s.share_number ? ` / ${s.share_number}` : ''}{s.status === 'slaughtered' ? ' ✓' : ''}</span>
                          )}
                        </Td>
                        <Td className="font-mono text-[10px] text-gray-500">{s.receipt_number}</Td>
                        <Td className="text-right">
                          <div className="inline-flex items-center gap-2">
                            {(() => {
                              const wa = whatsappUrl(s.donor_phone, `Merhaba ${s.donor_name}, ${s.on_behalf_of || s.donor_name} adına alınan ${s.kurban_type_label} kurban hisseniz${s.animal_number ? ` (${s.animal_number})` : ''} ${s.status === 'slaughtered' ? 'kesilmiştir. Allah kabul etsin.' : 'kayıt altına alınmıştır.'}`)
                              return wa ? (
                                <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp ile mesaj gönder" className="text-emerald-600 hover:text-emerald-700">
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              ) : null
                            })()}
                            {canWrite && s.status !== 'slaughtered' && <button className="font-bold text-primary-700" onClick={() => editShare(s)}>Düzenle</button>}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                    {shares.length === 0 && <Tr><Td colSpan={6} className="text-center text-gray-400">Hisse yok.</Td></Tr>}
                  </TBody>
                </Table>
              </div>
            </Card>
          )}

          {tab === 'entry' && (
            <Card className="border border-gray-100 p-6 shadow-sm">
              {selected.donation_campaign_id ? (
                <ManualReceiptForm
                  kurban={{ campaignId: selected.donation_campaign_id, pricePerShareCents: selected.price_per_share_cents, types }}
                  onDone={(r) => { setMessage({ type: 'ok', text: `${r.receipt_number} numaralı makbuz kesildi, hisseler oluşturuldu` }); setTab('shares'); loadSelected() }}
                />
              ) : (
                <p className="text-sm text-gray-500">Elden hisse kaydı için kampanyanın bir web bağış kalemine bağlı olması gerekir (Kampanya Ayarları).</p>
              )}
            </Card>
          )}

          {tab === 'settings' && (
            <Card className="border border-gray-100 p-6 shadow-sm">
              <CampaignForm
                initial={{
                  title: selected.title, description: selected.description || '', price: String(selected.price_per_share_cents / 100),
                  animal_type: selected.animal_type, country: selected.country || '', season_year: String(selected.season_year || ''),
                  animal_prefix: selected.animal_prefix, status: selected.status, create_donation_campaign: !selected.donation_campaign_id,
                }}
                onSubmit={(f) => saveCampaign(f, selected)}
                linked={!!selected.donation_campaign_id}
                key={selected.id}
              />
            </Card>
          )}
        </>
      )}
      {slaughterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Kesim Onayı ({slaughterModal.ids.length} hayvan)</h3>
              <button type="button" onClick={() => setSlaughterModal(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitSlaughter} className="space-y-3">
              <TextInput
                label="Kesim Videosu Bağlantısı (isteğe bağlı)"
                value={slaughterModal.videoUrl}
                onChange={(v) => setSlaughterModal({ ...slaughterModal, videoUrl: v })}
                placeholder="https://..."
                hint="Bağışçı panelinde görüntülenecektir."
              />
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={slaughterModal.notify}
                  onChange={(e) => setSlaughterModal({ ...slaughterModal, notify: e.target.checked })}
                />
                Hissedarlara kesim SMS bildirimi gönder
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={ghostButton} onClick={() => setSlaughterModal(null)}>Vazgeç</button>
                <button type="submit" className={primaryButton}>Kesildi İşaretle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {animalEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Hayvan Düzenle · {animalEditModal.animal.animal_number}</h3>
              <button type="button" onClick={() => setAnimalEditModal(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitAnimalEdit} className="space-y-3">
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
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={ghostButton} onClick={() => setAnimalEditModal(null)}>Vazgeç</button>
                <button type="submit" className={primaryButton}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addAnimalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Elle Hayvan Ekle</h3>
              <button type="button" onClick={() => setAddAnimalModal(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitAddAnimals} className="space-y-3">
              <TextInput
                label="Hayvan Adedi"
                type="number"
                min={1}
                max={500}
                required
                value={addAnimalModal.count}
                onChange={(v) => setAddAnimalModal({ ...addAnimalModal, count: v })}
                hint="Özel numara boş bırakılırsa otomatik numaralanır."
              />
              <TextInput
                label="Özel Hayvan No (isteğe bağlı, tek hayvan için)"
                value={addAnimalModal.animalNumber}
                onChange={(v) => setAddAnimalModal({ ...addAnimalModal, animalNumber: v })}
                placeholder="Örn: K-105"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={ghostButton} onClick={() => setAddAnimalModal(null)}>Vazgeç</button>
                <button type="submit" className={primaryButton}>Ekle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {shareEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Hisse Düzenle</h3>
              <button type="button" onClick={() => setShareEditModal(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitShareEdit} className="space-y-3">
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
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={ghostButton} onClick={() => setShareEditModal(null)}>Vazgeç</button>
                <button type="submit" className={primaryButton}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
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
