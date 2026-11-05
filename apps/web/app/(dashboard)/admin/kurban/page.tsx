'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@e-infak/ui'
import {
  apiErrorMessage, downloadFile, exportCsv, formatMoney, hasPermission, useAdminAccess, v1Get, v1Send,
} from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ManualReceiptForm } from '../../../../components/admin/ManualReceiptForm'

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
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
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
          campaign_id: selectedId, assigned: shareFilter || undefined, q: search || undefined, page_size: 1000,
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
  }, [selectedId, animalFilter, search, shareFilter])

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
    const video = window.prompt(
      `${ids.length} hayvan "kesildi" olarak işaretlenecek ve hissedarlara SMS gidecek.\nKesim videosu bağlantısı (isteğe bağlı, https://):`,
      single?.video_url || '',
    )
    if (video === null) return
    run(() => v1Send('post', '/kurban/animals/slaughter', {
      items: ids.map((animal_id) => ({ animal_id, video_url: video || null })), notify: true,
    }), (r) => `${r.marked} hayvan kesildi olarak işaretlendi, ${r.sms_queued} SMS kuyruğa alındı${r.sms_failed ? `, ${r.sms_failed} SMS gönderilemedi` : ''}`)
  }

  const setVideo = (animal: Animal) => {
    const video = window.prompt('Kesim videosu bağlantısı (https://)', animal.video_url || '')
    if (video === null) return
    run(() => v1Send('put', `/kurban/animals/${animal.id}`, { video_url: video || null }), 'Video kaydedildi')
  }

  const addAnimals = () => {
    const count = Number(window.prompt('Kaç hayvan eklensin? (otomatik numaralanır)', '1'))
    if (!count) return
    run(() => v1Send('post', '/kurban/animals', { campaign_id: selectedId, count }), `${count} hayvan eklendi`)
  }

  const deleteAnimal = (animal: Animal) => {
    if (!window.confirm(`${animal.animal_number} silinsin mi?`)) return
    run(() => v1Send('delete', `/kurban/animals/${animal.id}`), 'Hayvan silindi')
  }

  const editShare = (share: Share) => {
    const name = window.prompt('Hissedar adı (kurban kağıdında yazar)', share.on_behalf_of || share.donor_name)
    if (name === null) return
    run(() => v1Send('put', `/kurban/shares/${share.id}`, { on_behalf_of: name }), 'Hisse güncellendi')
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Kurban Organizasyonu</h1>
          <p className="mt-1 text-sm text-gray-500">Web bağışları ve elden alınan hisseler otomatik olarak hisseye dönüşür; &quot;Hisseleri dağıt&quot; ile hayvanlara yerleştirilir.</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <Notice message={message} />

      {showCreate && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <CampaignForm initial={emptyCampaign} onSubmit={(f) => saveCampaign(f)} isNew />
        </Card>
      )}

      {selected && summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Hisse bedeli', formatMoney(selected.price_per_share_cents)],
              ['Toplam hisse', summary.shares],
              ['Dağıtılmayı bekleyen', summary.unassigned_shares],
              ['Hayvan (bekleyen / kesilen)', `${summary.animals_waiting} / ${summary.animals_slaughtered}`],
              ['Gereken hayvan', summary.expected_animals],
              ['SMS gönderilen hisse', summary.notified_shares],
            ].map(([label, value]) => (
              <Card key={label as string} className="border border-gray-100 p-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
                <div className="mt-1 text-xl font-black text-gray-950">{value}</div>
              </Card>
            ))}
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
              <input className={`${inputClass} w-56`} placeholder="Hayvan no, isim, telefon" value={search} onChange={(e) => setSearch(e.target.value)} />
              {canWrite && summary.unassigned_shares > 0 && (
                <button disabled={busy} onClick={distribute} className={primaryButton}>Hisseleri dağıt ({summary.unassigned_shares})</button>
              )}
              <button className={ghostButton} onClick={() => downloadFile(`/kurban/campaigns/${selectedId}/papers.pdf`, 'kurban-kagitlari.pdf', { status: 'waiting' })
                .catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'PDF indirilemedi') }))}>
                ⬇ Kurban kağıtları (PDF)
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
                        {canWrite && <button className={ghostButton} onClick={() => setVideo(a)}>{a.video_url ? 'Video ✓' : 'Video ekle'}</button>}
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
                <select className={`${inputClass} w-48`} value={shareFilter} onChange={(e) => setShareFilter(e.target.value as typeof shareFilter)}>
                  <option value="">Tüm hisseler</option><option value="false">Dağıtılmamış</option><option value="true">Hayvana atanmış</option>
                </select>
                <button className={ghostButton} onClick={() => exportCsv('kurban-hisseleri.csv',
                  ['Hayvan', 'Hisse', 'Hissedar', 'Bağışçı', 'Telefon', 'Tür', 'Durum', 'Makbuz'],
                  shares.map((s) => [s.animal_number || '', s.share_number || '', s.on_behalf_of || s.donor_name, s.donor_name, s.donor_phone,
                    s.kurban_type_label, s.status === 'slaughtered' ? 'Kesildi' : 'Bekliyor', s.receipt_number]))}>⬇ CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      <th className="pb-2">Hissedar</th><th className="pb-2">Bağışçı</th><th className="pb-2">Tür</th><th className="pb-2">Hayvan</th><th className="pb-2">Makbuz</th><th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shares.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-semibold">{s.on_behalf_of || s.donor_name}</td>
                        <td className="py-2">{s.donor_name}<div className="text-[10px] text-gray-400">{s.donor_phone}</div></td>
                        <td className="py-2">{s.kurban_type_label}</td>
                        <td className="py-2">
                          {canWrite && s.status !== 'slaughtered' ? (
                            <select className="rounded border p-1 text-xs" value={s.animal_id || ''} onChange={(e) => moveShare(s, e.target.value)}>
                              <option value="">— Atanmamış</option>
                              {waitingAnimals.map((a) => <option key={a.id} value={a.id}>{a.animal_number} ({a.shares.length}/{a.capacity})</option>)}
                            </select>
                          ) : (
                            <span>{s.animal_number || '—'}{s.share_number ? ` / ${s.share_number}` : ''}{s.status === 'slaughtered' ? ' ✓' : ''}</span>
                          )}
                        </td>
                        <td className="py-2 font-mono text-[10px] text-gray-500">{s.receipt_number}</td>
                        <td className="py-2 text-right">
                          {canWrite && s.status !== 'slaughtered' && <button className="font-bold text-primary-700" onClick={() => editShare(s)}>İsim</button>}
                        </td>
                      </tr>
                    ))}
                    {shares.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Hisse yok.</td></tr>}
                  </tbody>
                </table>
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
