'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Droplets, ExternalLink, MapPin, Plus, Search, Users, Wallet, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { DonorPicker, type PickedDonor } from '../../../../components/admin/DonorPicker'
import { PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

interface Well {
  id: string
  name: string
  location_name: string
  country: string | null
  latitude: number | null
  longitude: number | null
  status: 'planned' | 'funding' | 'drilling' | 'completed'
  description: string | null
  funding_model: 'standard' | 'fonlama' | 'hisseli'
  target_cents: number
  collected_cents: number
  progress_pct: number | null
  share_count: number | null
  share_price_cents: number | null
  shares_sold: number
  shares_left: number | null
  active_pledges: number
  donor_id: string | null
  gallery_urls: string[]
  donation_campaign_id: string | null
  donation_campaign_slug: string | null
}

const STATUS: Record<Well['status'], string> = { planned: 'Planlandı', funding: 'Fon toplanıyor', drilling: 'Sondaj / yapım', completed: 'Tamamlandı' }
const STATUS_STYLE: Record<Well['status'], string> = {
  planned: 'bg-gray-100 text-gray-700',
  funding: 'bg-sky-50 text-sky-700',
  drilling: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
}
const MODELS: Record<Well['funding_model'], string> = { standard: 'Standart bağış', fonlama: 'Fonlama (hedefli)', hisseli: 'Hisseli' }

const empty = {
  name: '', location_name: '', country: '', latitude: '', longitude: '', status: 'funding' as Well['status'], description: '',
  funding_model: 'fonlama' as Well['funding_model'], target: '', share_count: '', share_price: '', gallery: '', create_donation_campaign: true,
}

export default function WellsPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'operations_manage')
  const [wells, setWells] = useState<Well[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Well | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [owner, setOwner] = useState<PickedDonor | null>(null)
  const [clearOwner, setClearOwner] = useState(false)
  const [shares, setShares] = useState<{
    well: Well
    rows: { id: string; share_count: number; donor_name: string; on_behalf_of: string | null; receipt_number: string | null; created_at: string | null }[]
  } | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setWells((await adminGet<Well[]>('/water-wells', { status: statusFilter || undefined })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kuyular yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [statusFilter])

  const countries = useMemo(
    () => Array.from(new Set(wells.map((w) => w.country).filter((c): c is string => Boolean(c)))).sort(),
    [wells],
  )

  const filteredWells = useMemo(() => {
    const q = query.trim().toLowerCase()
    return wells.filter((w) => {
      if (countryFilter && w.country !== countryFilter) return false
      if (q && !`${w.name} ${w.location_name} ${w.country || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [wells, countryFilter, query])

  const kpi = useMemo(() => {
    return wells.reduce(
      (acc, w) => ({
        total: acc.total + 1,
        completed: acc.completed + (w.status === 'completed' ? 1 : 0),
        active: acc.active + (w.status === 'funding' || w.status === 'drilling' ? 1 : 0),
        collectedCents: acc.collectedCents + w.collected_cents,
      }),
      { total: 0, completed: 0, active: 0, collectedCents: 0 },
    )
  }, [wells])

  const open = (w: Well | null) => {
    setEditing(w)
    setShowForm(true)
    setOwner(null)
    setClearOwner(false)
    setForm(w ? {
      name: w.name, location_name: w.location_name, country: w.country || '',
      latitude: w.latitude?.toString() || '', longitude: w.longitude?.toString() || '', status: w.status,
      description: w.description || '', funding_model: w.funding_model, target: w.target_cents ? String(w.target_cents / 100) : '',
      share_count: w.share_count?.toString() || '', share_price: w.share_price_cents ? String(w.share_price_cents / 100) : '',
      gallery: w.gallery_urls.join('\n'), create_donation_campaign: !w.donation_campaign_id,
    } : empty)
  }

  const money = (v: string) => (v ? Math.round(Number(v.replace(',', '.')) * 100) : 0)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextDonorId = owner ? owner.id : clearOwner ? null : editing?.donor_id || null
    const body = {
      name: form.name, location_name: form.location_name, country: form.country || null,
      latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null,
      status: form.status, description: form.description || null, funding_model: form.funding_model,
      target_cents: money(form.target), share_count: form.share_count ? Number(form.share_count) : null,
      share_price_cents: form.share_price ? money(form.share_price) : null,
      gallery_urls: form.gallery.split('\n').map((s) => s.trim()).filter(Boolean),
      donor_id: nextDonorId, create_donation_campaign: form.create_donation_campaign,
    }
    try {
      if (editing) await adminSend('put', `/water-wells/${editing.id}`, body)
      else await adminSend('post', '/water-wells', body)
      setShowForm(false)
      setMessage({ type: 'ok', text: 'Kuyu kaydedildi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const showShares = async (w: Well) => {
    try {
      setShares({ well: w, rows: (await adminGet<NonNullable<typeof shares>['rows']>(`/water-wells/${w.id}/shares`)).data })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6">
      <PageHeader title="Su Kuyusu Yönetimi" description={<>Kuyuya bağlı bağış kalemine gelen bağışlar fonlamayı ve hisseleri otomatik günceller. Taksitli kuyu taahhütleri Sponsorluk ekranından açılır.</>} actions={<div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ghostButton}
            onClick={() => exportCsv(
              'su-kuyulari.csv',
              ['Kuyu Adı', 'Ülke', 'Konum', 'Durum', 'Model', 'Hedef (TL)', 'Toplanan (TL)', 'Hisse', 'Satılan Hisse'],
              filteredWells.map((w) => [
                w.name, w.country, w.location_name, STATUS[w.status], MODELS[w.funding_model],
                w.target_cents / 100, w.collected_cents / 100, w.share_count ?? '', w.shares_sold,
              ]),
            )}
          >
            ⬇ CSV
          </button>
          {canEdit && (
            <button className={`inline-flex items-center gap-1.5 ${primaryButton}`} onClick={() => (showForm ? setShowForm(false) : open(null))}>
              <Plus className="h-4 w-4" /> {showForm ? 'Vazgeç' : 'Yeni Kuyu'}
            </button>
          )}
        </div>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Toplam Kuyu"
          icon={Droplets}
          value={kpi.total}
          detail={{
            title: 'Tüm Su Kuyuları',
            content: () => (
              <Table>
                <THead><Tr><Th>Kuyu Adı</Th><Th>Konum</Th><Th>Durum</Th><Th className="text-right">Toplanan</Th></Tr></THead>
                <TBody>
                  {wells.map((w) => (
                    <Tr key={w.id}>
                      <Td className="font-semibold">{w.name}</Td>
                      <Td className="text-xs text-gray-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</Td>
                      <Td className="text-xs">{STATUS[w.status]}</Td>
                      <Td className="text-right font-semibold tabular-nums">{formatMoney(w.collected_cents)}</Td>
                    </Tr>
                  ))}
                  {wells.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Kuyu yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          }}
        />
        <StatCard
          label="Fonlanan / Sondaj"
          icon={Users}
          tone="warn"
          value={kpi.active}
          detail={{
            title: 'Devam Eden Su Kuyuları',
            content: () => {
              const active = wells.filter((w) => w.status === 'planned' || w.status === 'funding' || w.status === 'drilling')
              return (
                <Table>
                  <THead><Tr><Th>Kuyu Adı</Th><Th>Konum</Th><Th>Aşama</Th><Th className="text-right">Hedef</Th></Tr></THead>
                  <TBody>
                    {active.map((w) => (
                      <Tr key={w.id}>
                        <Td className="font-semibold">{w.name}</Td>
                        <Td className="text-xs text-gray-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</Td>
                        <Td className="text-xs font-semibold text-amber-700">{STATUS[w.status]}</Td>
                        <Td className="text-right tabular-nums">{formatMoney(w.target_cents)}</Td>
                      </Tr>
                    ))}
                    {active.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Devam eden kuyu yok.</Td></Tr>}
                  </TBody>
                </Table>
              )
            },
          }}
        />
        <StatCard
          label="Tamamlanan"
          icon={CheckCircle2}
          tone="good"
          value={kpi.completed}
          detail={{
            title: 'Açılan / Tamamlanan Kuyular',
            content: () => {
              const done = wells.filter((w) => w.status === 'completed')
              return (
                <Table>
                  <THead><Tr><Th>Kuyu Adı</Th><Th>Konum</Th><Th>Model</Th><Th className="text-right">Toplanan</Th></Tr></THead>
                  <TBody>
                    {done.map((w) => (
                      <Tr key={w.id}>
                        <Td className="font-semibold">{w.name}</Td>
                        <Td className="text-xs text-gray-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</Td>
                        <Td className="text-xs">{w.funding_model}</Td>
                        <Td className="text-right font-semibold tabular-nums text-emerald-700">{formatMoney(w.collected_cents)}</Td>
                      </Tr>
                    ))}
                    {done.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Tamamlanan kuyu yok.</Td></Tr>}
                  </TBody>
                </Table>
              )
            },
          }}
        />
        <StatCard
          label="Toplanan Bağış"
          icon={Wallet}
          tone="brand"
          value={formatMoney(kpi.collectedCents)}
          detail={{
            title: 'Kuyu Bazlı Bağış Dökümü',
            content: () => (
              <Table>
                <THead><Tr><Th>Kuyu Adı</Th><Th className="text-right">Hedef</Th><Th className="text-right">Toplanan</Th></Tr></THead>
                <TBody>
                  {wells.map((w) => (
                    <Tr key={w.id}>
                      <Td className="font-semibold">{w.name}</Td>
                      <Td className="text-right tabular-nums text-gray-500">{formatMoney(w.target_cents)}</Td>
                      <Td className="text-right font-bold tabular-nums text-primary-700">{formatMoney(w.collected_cents)}</Td>
                    </Tr>
                  ))}
                  {wells.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Kayıt yok.</Td></Tr>}
                </TBody>
              </Table>
            ),
          }}
        />
      </div>

      <Notice message={message} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClass} pl-9`} placeholder="Kuyu adı, konum, ülke ara..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className={`${inputClass} w-44`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tüm durumlar</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {countries.length > 0 && (
          <select className={`${inputClass} w-40`} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="">Tüm ülkeler</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(query || statusFilter || countryFilter) && (
          <button type="button" onClick={() => { setQuery(''); setStatusFilter(''); setCountryFilter('') }} className="text-xs font-semibold text-primary-700 hover:underline">
            Filtreyi temizle
          </button>
        )}
      </div>

      {showForm && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2"><TextInput label="Kuyu adı" required value={form.name} onChange={(v) => set('name', v)} placeholder="Hz. Ömer Su Kuyusu" /></div>
            <TextInput label="Ülke" value={form.country} onChange={(v) => set('country', v)} placeholder="Nijer" />
            <TextInput label="Konum" required value={form.location_name} onChange={(v) => set('location_name', v)} placeholder="Niamey, Tillabéri" />
            <Label label="Fonlama modeli">
              <select className={inputClass} value={form.funding_model} onChange={(e) => set('funding_model', e.target.value as Well['funding_model'])}>
                {Object.entries(MODELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            {form.funding_model === 'hisseli' ? (
              <>
                <TextInput label="Hisse sayısı" required type="number" min={1} value={form.share_count} onChange={(v) => set('share_count', v)} />
                <TextInput label="Hisse bedeli (₺)" required inputMode="decimal" value={form.share_price} onChange={(v) => set('share_price', v)} />
              </>
            ) : (
              <TextInput label="Hedef tutar (₺)" required={form.funding_model === 'fonlama'} inputMode="decimal" value={form.target} onChange={(v) => set('target', v)} />
            )}
            <Label label="Durum">
              <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as Well['status'])}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            <TextInput label="Enlem" inputMode="decimal" value={form.latitude} onChange={(v) => set('latitude', v)} />
            <TextInput label="Boylam" inputMode="decimal" value={form.longitude} onChange={(v) => set('longitude', v)} />
            <div className="sm:col-span-2 space-y-1.5">
              <DonorPicker value={owner} onChange={(d) => { setOwner(d); if (d) setClearOwner(false) }} label="Tek bağışçılı kuyu sahibi (isteğe bağlı)" />
              {editing?.donor_id && !owner && !clearOwner && (
                <div className="flex items-center justify-between rounded bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600">
                  <span>Mevcut bir kuyu sahibi kayıtlı.</span>
                  <button type="button" onClick={() => setClearOwner(true)} className="font-semibold text-red-600 hover:underline">Sahibi kaldır</button>
                </div>
              )}
              {clearOwner && (
                <div className="text-[11px] font-semibold text-amber-700">Kaydedildiğinde mevcut kuyu sahibi kaldırılacak.</div>
              )}
            </div>
            <div className="sm:col-span-2"><TextArea label="Açıklama" rows={3} value={form.description} onChange={(v) => set('description', v)} /></div>
            <div className="sm:col-span-2"><TextArea label="Fotoğraflar (her satıra bir adres)" rows={3} value={form.gallery} onChange={(v) => set('gallery', v)} /></div>
            {(!editing || !editing.donation_campaign_id) && (
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 sm:col-span-2 lg:col-span-4">
                <input type="checkbox" checked={form.create_donation_campaign} onChange={(e) => set('create_donation_campaign', e.target.checked)} />
                Web sitesinde bu kuyu için bağış kalemi oluştur
              </label>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
              <button type="button" className={ghostButton} onClick={() => setShowForm(false)}>Vazgeç</button>
              <button type="submit" className={primaryButton}>{editing ? 'Kaydet' : 'Oluştur'}</button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredWells.map((w) => (
          <Card key={w.id} className="flex flex-col justify-between overflow-hidden border border-gray-100 shadow-sm">
            <div>
              {w.gallery_urls[0] && (
                <div className="h-40 w-full overflow-hidden bg-gray-100">
                  <img src={w.gallery_urls[0]} alt={w.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-gray-900">{w.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span>{[w.location_name, w.country].filter(Boolean).join(', ')}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[w.status]}`}>
                    {STATUS[w.status]}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {MODELS[w.funding_model]}
                  {w.active_pledges > 0 && ` · ${w.active_pledges} taksitli taahhüt`}
                </div>
                {w.target_cents > 0 && (
                  <div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-gray-900">{formatMoney(w.collected_cents)}</span>
                      <span className="text-gray-500">{formatMoney(w.target_cents)} · %{w.progress_pct ?? 0}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${w.progress_pct || 0}%` }} />
                    </div>
                  </div>
                )}
                {w.funding_model === 'hisseli' && (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    <span><strong>{w.shares_sold}</strong> / {w.share_count} hisse satıldı</span>
                    <span className="font-semibold text-gray-700">{formatMoney(w.share_price_cents || 0)} / hisse</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t bg-gray-50/50 px-5 py-3">
              {canEdit && <button className={ghostButton} onClick={() => open(w)}>Düzenle</button>}
              {w.funding_model === 'hisseli' && <button className={ghostButton} onClick={() => showShares(w)}>Hissedarlar</button>}
              {w.latitude !== null && w.longitude !== null && (
                <a
                  className={ghostButton}
                  href={`https://www.openstreetmap.org/?mlat=${w.latitude}&mlon=${w.longitude}#map=16/${w.latitude}/${w.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Harita ↗
                </a>
              )}
              {w.donation_campaign_slug && (
                <a className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline" href={`/kampanyalar/${w.donation_campaign_slug}`} target="_blank" rel="noreferrer">
                  Bağış sayfası <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </Card>
        ))}
        {filteredWells.length === 0 && (
          <p className="py-10 text-center text-xs text-gray-400 md:col-span-2 xl:col-span-3">
            {wells.length === 0 ? 'Kuyu kaydı yok.' : 'Filtreye uygun kuyu bulunamadı.'}
          </p>
        )}
      </div>

      {shares && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShares(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">{shares.well.name} — Hissedarlar</h3>
                <p className="text-xs text-gray-500">{shares.well.shares_sold} / {shares.well.share_count} hisse satıldı</p>
              </div>
              <button type="button" onClick={() => setShares(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {shares.rows.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-400">Henüz hisse satışı yok.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto text-sm">
                {shares.rows.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="font-semibold text-gray-900">{s.on_behalf_of || s.donor_name}</div>
                      <div className="text-[11px] text-gray-500">
                        {s.on_behalf_of && s.donor_name ? `Bağışçı: ${s.donor_name} · ` : ''}
                        {s.created_at ? new Date(s.created_at).toLocaleDateString('tr-TR') : ''}
                        {s.receipt_number ? ` · Makbuz ${s.receipt_number}` : ''}
                      </div>
                    </div>
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700">{s.share_count} hisse</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
