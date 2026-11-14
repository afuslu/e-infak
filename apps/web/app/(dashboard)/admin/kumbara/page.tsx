'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertCircle, History, MapPin, PiggyBank, Plus, Search, Wallet, X } from 'lucide-react'
import { Card } from '@e-infak/ui'
import {
  adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, formatMoney, hasPermission, useAdminAccess, whatsappUrl,
} from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ExportButtons, PageHeader, StatCard, TBody, THead, Table, Td, Th, Tr, WhatsAppIcon } from '../../../../components/admin/ui'

interface Region { id: string; name: string; description: string | null }
interface Box {
  id: string
  code: string
  region_id: string | null
  region_name: string | null
  location_name: string
  address: string | null
  city: string | null
  district: string | null
  contact_name: string | null
  contact_phone: string | null
  responsible_user_id: string | null
  campaign_id: string | null
  status: 'active' | 'passive' | 'lost'
  placed_at: string | null
  last_collected_at: string | null
  days_since_collection: number | null
  notes: string | null
  collection_count: number
  total_collected_cents: number
}
interface Report {
  total_cents: number
  collections: number
  boxes: { active: number; passive: number; lost: number }
  not_collected_90_days: number
  by_region: { label: string; count: number; total_cents: number }[]
  by_staff: { label: string; count: number; total_cents: number }[]
}

const STATUS: Record<Box['status'], string> = { active: 'Aktif', passive: 'Pasif', lost: 'Kayıp' }
const STATUS_STYLE: Record<Box['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  passive: 'bg-gray-100 text-gray-600',
  lost: 'bg-red-50 text-red-700',
}
const emptyBox = {
  code: '', region_id: '', location_name: '', address: '', city: '', district: '', contact_name: '', contact_phone: '',
  responsible_user_id: '', campaign_id: '', status: 'active' as Box['status'], placed_at: '', notes: '',
}

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random()}`.replace('.', '').padEnd(16, '0')
}

export default function KumbaraPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'operations_manage')
  const [boxes, setBoxes] = useState<Box[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [staff, setStaff] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [filters, setFilters] = useState({ region_id: '', status: 'active', responsible: '', stale: '', q: '' })
  const [form, setForm] = useState(emptyBox)
  const [editing, setEditing] = useState<Box | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [collecting, setCollecting] = useState<Box | null>(null)
  const [collection, setCollection] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '', key: newKey() })
  const [history, setHistory] = useState<{ box: Box; rows: any[] } | null>(null)
  const [showRegionModal, setShowRegionModal] = useState(false)
  const [regionForm, setRegionForm] = useState({ name: '', description: '' })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const staffMap = useMemo(
    () => new Map(staff.map((s) => [s.id, `${s.first_name} ${s.last_name}`.trim()])),
    [staff],
  )
  const campaignMap = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c.title])),
    [campaigns],
  )

  const load = async () => {
    try {
      const [b, r, rep] = await Promise.all([
        adminGet<Box[]>('/money-boxes', {
          region_id: filters.region_id || undefined, status: filters.status || undefined, responsible: filters.responsible || undefined,
          not_collected_days: filters.stale || undefined, q: filters.q || undefined,
        }),
        adminGet<Region[]>('/regions'),
        adminGet<Report>('/money-boxes-report'),
      ])
      setBoxes(b.data)
      setRegions(r.data)
      setReport(rep.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kumbaralar yüklenemedi') })
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])
  useEffect(() => {
    adminGet<any[]>('/users').then((r) => setStaff(r.data)).catch(() => {})
    axios.get(`${adminApiBase()}/api/v1/campaigns`, { headers: adminAuthHeaders(), params: { page_size: 100 } })
      .then((r) => setCampaigns(r.data.items || [])).catch(() => {})
  }, [])

  const open = (b: Box | null) => {
    setEditing(b)
    setShowForm(true)
    setForm(b ? {
      code: b.code, region_id: b.region_id || '', location_name: b.location_name, address: b.address || '', city: b.city || '',
      district: b.district || '', contact_name: b.contact_name || '', contact_phone: b.contact_phone || '',
      responsible_user_id: b.responsible_user_id || '', campaign_id: b.campaign_id || '', status: b.status,
      placed_at: b.placed_at ? b.placed_at.slice(0, 10) : '', notes: b.notes || '',
    } : emptyBox)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      if (editing) await adminSend('put', `/money-boxes/${editing.id}`, { ...body, code: editing.code })
      else await adminSend('post', '/money-boxes', body)
      setShowForm(false)
      setMessage({ type: 'ok', text: 'Kumbara kaydedildi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const saveRegion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regionForm.name.trim()) return
    try {
      await adminSend('post', '/regions', {
        name: regionForm.name.trim(),
        description: regionForm.description.trim() || null,
      })
      setShowRegionModal(false)
      setRegionForm({ name: '', description: '' })
      setMessage({ type: 'ok', text: 'Bölge eklendi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const collect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!collecting) return
    try {
      const res = await adminSend<{ receipt_number?: string }>('post', `/money-boxes/${collecting.id}/collections`, {
        idempotency_key: collection.key,
        amount_cents: Math.round(Number(collection.amount.replace(',', '.')) * 100),
        collected_on: collection.date || null,
        notes: collection.notes || null,
      })
      setMessage({ type: 'ok', text: `${collecting.code} boşaltıldı, ${res.data.receipt_number || ''} numaralı bağış kaydı oluşturuldu` })
      setCollecting(null)
      setCollection({ amount: '', date: '', notes: '', key: newKey() })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const showHistory = async (b: Box) => {
    try {
      setHistory({ box: b, rows: (await adminGet<any[]>(`/money-boxes/${b.id}/collections`)).data })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const set = (k: keyof typeof emptyBox, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6">
      <PageHeader title="Kumbara Organizasyonu" description={<>Boşaltılan tutar seçilen bağış kalemine &quot;Kumbara Bağışları&quot; adına işlenir ve raporlara yansır.</>} actions={<div className="flex gap-2">
          {canEdit && <button className={`inline-flex items-center gap-1.5 ${ghostButton}`} onClick={() => setShowRegionModal(true)}><MapPin className="h-3.5 w-3.5" /> + Bölge</button>}
          {canEdit && <button className={`inline-flex items-center gap-1.5 ${primaryButton}`} onClick={() => (showForm ? setShowForm(false) : open(null))}><Plus className="h-4 w-4" /> {showForm ? 'Vazgeç' : 'Kumbara Ekle'}</button>}
        </div>} />

      {report && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Bu yıl toplanan"
            icon={Wallet}
            tone="brand"
            value={formatMoney(report.total_cents)}
            detail={{
              title: 'Kumbara Tahsilat Özeti',
              content: () => (
                <Table>
                  <THead><Tr><Th>Kod</Th><Th>Yer / Sorumlu</Th><Th className="text-right">Son Boşaltma</Th><Th className="text-right">Toplam</Th></Tr></THead>
                  <TBody>
                    {[...boxes].sort((a, b) => b.total_collected_cents - a.total_collected_cents).map((b) => (
                      <Tr key={b.id}>
                        <Td className="font-mono font-bold">{b.code}</Td>
                        <Td>{b.location_name}</Td>
                        <Td className="text-right text-xs">{b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : '—'}</Td>
                        <Td className="text-right font-bold tabular-nums">{formatMoney(b.total_collected_cents)}</Td>
                      </Tr>
                    ))}
                    {boxes.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Kumbara yok.</Td></Tr>}
                  </TBody>
                </Table>
              ),
            }}
          />
          <StatCard
            label="Boşaltma"
            icon={History}
            value={report.collections}
            detail={{
              title: 'Kumbara Boşaltma Sayıları',
              content: () => (
                <Table>
                  <THead><Tr><Th>Kod</Th><Th>Yer</Th><Th className="text-right">Boşaltma</Th><Th className="text-right">Son Tarih</Th></Tr></THead>
                  <TBody>
                    {boxes.map((b) => (
                      <Tr key={b.id}>
                        <Td className="font-mono font-bold">{b.code}</Td>
                        <Td>{b.location_name}</Td>
                        <Td className="text-right tabular-nums">{b.collection_count}</Td>
                        <Td className="text-right text-xs">{b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : '—'}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              ),
            }}
          />
          <StatCard
            label="Aktif kumbara"
            icon={PiggyBank}
            tone="good"
            value={report.boxes.active}
            detail={{
              title: 'Aktif Kumbaralar',
              content: () => {
                const activeBoxes = boxes.filter((b) => b.status === 'active')
                return (
                  <Table>
                    <THead><Tr><Th>Kod</Th><Th>Yer</Th><Th>Bölge</Th><Th className="text-right">Toplam</Th></Tr></THead>
                    <TBody>
                      {activeBoxes.map((b) => (
                        <Tr key={b.id}>
                          <Td className="font-mono font-bold">{b.code}</Td>
                          <Td>{b.location_name}</Td>
                          <Td className="text-xs text-gray-500">{b.region_name || '—'}</Td>
                          <Td className="text-right font-semibold tabular-nums">{formatMoney(b.total_collected_cents)}</Td>
                        </Tr>
                      ))}
                      {activeBoxes.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">Aktif kumbara yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
          <StatCard
            label="Kayıp / Pasif"
            value={`${report.boxes.lost} / ${report.boxes.passive}`}
            detail={{
              title: 'Kayıp ve Pasif Kumbaralar',
              content: () => {
                const inactiveBoxes = boxes.filter((b) => b.status === 'lost' || b.status === 'passive')
                return (
                  <Table>
                    <THead><Tr><Th>Kod</Th><Th>Yer</Th><Th className="text-right">Durum</Th></Tr></THead>
                    <TBody>
                      {inactiveBoxes.map((b) => (
                        <Tr key={b.id}>
                          <Td className="font-mono font-bold">{b.code}</Td>
                          <Td>{b.location_name}</Td>
                          <Td className="text-right text-xs font-semibold">{b.status === 'lost' ? 'Kayıp' : 'Pasif'}</Td>
                        </Tr>
                      ))}
                      {inactiveBoxes.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Kayıp veya pasif kumbara yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
          <StatCard
            label="90+ gün boşaltılmayan"
            icon={AlertCircle}
            tone={report.not_collected_90_days > 0 ? 'bad' : 'neutral'}
            className={report.not_collected_90_days > 0 ? 'border-red-200 bg-red-50/40' : undefined}
            value={report.not_collected_90_days}
            detail={{
              title: '90+ Gündür Boşaltılmayan Kumbaralar',
              content: () => {
                const stale = boxes.filter((b) => b.status === 'active' && (!b.last_collected_at || (Date.now() - new Date(b.last_collected_at).getTime()) > 90 * 86400000))
                return (
                  <Table>
                    <THead><Tr><Th>Kod</Th><Th>Yer</Th><Th className="text-right">Son Boşaltma</Th></Tr></THead>
                    <TBody>
                      {stale.map((b) => (
                        <Tr key={b.id}>
                          <Td className="font-mono font-bold">{b.code}</Td>
                          <Td>{b.location_name}</Td>
                          <Td className="text-right text-xs text-red-600">{b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : 'Hiç boşaltılmadı'}</Td>
                        </Tr>
                      ))}
                      {stale.length === 0 && <Tr><Td colSpan={3} className="text-center text-gray-400">Gecikmiş kumbara yok.</Td></Tr>}
                    </TBody>
                  </Table>
                )
              },
            }}
          />
        </div>
      )}

      <Notice message={message} />

      {showForm && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {!editing && <TextInput label="Kumbara kodu" hint="Boş bırakılırsa KMB-0001 gibi verilir" value={form.code} onChange={(v) => set('code', v)} />}
            <div className="sm:col-span-2"><TextInput label="Yer (dükkan / cami / kurum)" required value={form.location_name} onChange={(v) => set('location_name', v)} /></div>
            <Label label="Bölge">
              <select className={inputClass} value={form.region_id} onChange={(e) => set('region_id', e.target.value)}>
                <option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Label>
            <div className="sm:col-span-2"><TextInput label="Adres" value={form.address} onChange={(v) => set('address', v)} /></div>
            <TextInput label="İlçe" value={form.district} onChange={(v) => set('district', v)} />
            <TextInput label="Şehir" value={form.city} onChange={(v) => set('city', v)} />
            <TextInput label="Yetkili kişi" value={form.contact_name} onChange={(v) => set('contact_name', v)} />
            <TextInput label="Yetkili telefonu" value={form.contact_phone} onChange={(v) => set('contact_phone', v)} />
            <Label label="Sorumlu personel">
              <select className={inputClass} value={form.responsible_user_id} onChange={(e) => set('responsible_user_id', e.target.value)}>
                <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </Label>
            <Label label="Toplananın aktarılacağı kalem">
              <select className={inputClass} value={form.campaign_id} onChange={(e) => set('campaign_id', e.target.value)}>
                <option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Label>
            <Label label="Durum">
              <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
            <TextInput label="Yerleştirme tarihi" type="date" value={form.placed_at} onChange={(v) => set('placed_at', v)} />
            <div className="sm:col-span-2 lg:col-span-2"><TextInput label="Not" value={form.notes} onChange={(v) => set('notes', v)} /></div>
            <div className="flex items-end justify-end"><button type="submit" className={primaryButton}>{editing ? 'Kaydet' : 'Ekle'}</button></div>
          </form>
        </Card>
      )}

      <Card className="border border-gray-100 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-9`} placeholder="Kod, yer, adres, yetkili" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <select className={`${inputClass} w-40`} value={filters.region_id} onChange={(e) => setFilters({ ...filters, region_id: e.target.value })}>
            <option value="">Tüm bölgeler</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className={`${inputClass} w-32`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tümü</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={`${inputClass} w-48`} value={filters.responsible} onChange={(e) => setFilters({ ...filters, responsible: e.target.value })}>
            <option value="">Tüm sorumlular</option><option value="me">Bana ait</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          <select className={`${inputClass} w-52`} value={filters.stale} onChange={(e) => setFilters({ ...filters, stale: e.target.value })}>
            <option value="">Boşaltma zamanı</option><option value="30">30+ gündür boşaltılmayan</option><option value="90">90+ gündür boşaltılmayan</option>
          </select>
          {(filters.q || filters.region_id || filters.status !== 'active' || filters.responsible || filters.stale) && (
            <button
              type="button"
              onClick={() => setFilters({ region_id: '', status: 'active', responsible: '', stale: '', q: '' })}
              className="text-xs font-semibold text-primary-700 hover:underline"
            >
              Temizle
            </button>
          )}
          <ExportButtons
            filename="kumbaralar"
            title="Kumbara Listesi"
            subtitle={`${boxes.length} kumbara`}
            currencyCols={[10]}
            getData={() => ({
              headers: ['Kod', 'Yer', 'Bölge', 'Adres', 'Yetkili', 'Telefon', 'Sorumlu', 'Durum', 'Son boşaltma', 'Toplam'],
              rows: boxes.map((b) => [
                b.code,
                b.location_name,
                b.region_name,
                [b.address, b.district, b.city].filter(Boolean).join(', '),
                b.contact_name,
                b.contact_phone,
                b.responsible_user_id ? staffMap.get(b.responsible_user_id) || '' : '',
                STATUS[b.status],
                b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : '',
                b.total_collected_cents / 100,
              ]),
            })}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Kod</Th><Th>Yer / adres</Th><Th>Bölge / Sorumlu</Th><Th>Durum</Th><Th>Son boşaltma</Th>
                <Th className="text-right">Toplam</Th><Th />
              </Tr>
            </THead>
            <TBody>
              {boxes.map((b) => (
                <Tr key={b.id} className={b.status !== 'active' ? 'opacity-60' : ''}>
                  <Td className="font-mono font-bold text-gray-900">{b.code}</Td>
                  <Td>
                    <div className="font-semibold text-gray-900">{b.location_name}</div>
                    <div className="text-[10px] text-gray-500">{[b.address, b.district, b.city].filter(Boolean).join(', ')} {b.contact_phone && `· ${b.contact_phone}`}</div>
                  </Td>
                  <Td>
                    <div className="text-xs font-medium text-gray-800">{b.region_name || '—'}</div>
                    <div className="text-[10px] text-gray-500">
                      {b.responsible_user_id ? staffMap.get(b.responsible_user_id) || '—' : 'Sorumlu yok'}
                      {b.campaign_id && campaignMap.get(b.campaign_id) ? ` · ${campaignMap.get(b.campaign_id)}` : ''}
                    </div>
                  </Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[b.status]}`}>
                      {STATUS[b.status]}
                    </span>
                  </Td>
                  <Td className={`py-2 ${b.days_since_collection !== null && b.days_since_collection > 90 ? 'font-bold text-red-600' : ''}`}>
                    {b.last_collected_at ? `${new Date(b.last_collected_at).toLocaleDateString('tr-TR')} (${b.days_since_collection} gün)` : 'Hiç'}
                  </Td>
                  <Td className="text-right tabular-nums">{formatMoney(b.total_collected_cents)}<div className="text-[10px] text-gray-400">{b.collection_count} boşaltma</div></Td>
                  <Td className="text-right whitespace-nowrap">
                    {(() => {
                      const wa = whatsappUrl(b.contact_phone, `Merhaba${b.contact_name ? ` ${b.contact_name}` : ''}, ${b.location_name} (${b.code}) kumbarası hakkında iletişime geçiyoruz.`)
                      return wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp ile mesaj gönder"
                          className="mr-3 inline-flex items-center gap-1 font-bold text-[#128C7E] hover:underline">
                          <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                      ) : null
                    })()}
                    {canEdit && b.status === 'active' && <button className="font-bold text-emerald-700 hover:underline" onClick={() => setCollecting(b)}>Boşalt</button>}
                    <button className="ml-3 font-bold text-primary-700 hover:underline" onClick={() => showHistory(b)}>Geçmiş</button>
                    {canEdit && <button className="ml-3 font-bold text-gray-600 hover:underline" onClick={() => open(b)}>Düzenle</button>}
                  </Td>
                </Tr>
              ))}
              {boxes.length === 0 && <Tr><Td colSpan={7} className="text-center text-gray-400">Kumbara yok.</Td></Tr>}
            </TBody>
          </Table>
        </div>
      </Card>

      {collecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCollecting(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Kumbara Boşalt</h3>
                <p className="text-xs text-gray-500">{collecting.code} — {collecting.location_name}</p>
              </div>
              <button type="button" onClick={() => setCollecting(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={collect} className="space-y-4">
              <TextInput label="Çıkan tutar (₺)" required inputMode="decimal" value={collection.amount} onChange={(v) => setCollection({ ...collection, amount: v })} />
              <TextInput label="Boşaltma tarihi" type="date" value={collection.date} onChange={(v) => setCollection({ ...collection, date: v })} />
              <TextInput label="Not" value={collection.notes} onChange={(v) => setCollection({ ...collection, notes: v })} />
              {!collecting.campaign_id && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  Bu kumbaranın aktarılacağı bağış kalemi seçili değil. Önce kumbarayı düzenleyip bağış kalemi seçin.
                  <button
                    type="button"
                    onClick={() => { const box = collecting; setCollecting(null); open(box) }}
                    className="ml-1.5 font-bold underline"
                  >
                    Şimdi düzenle
                  </button>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className={ghostButton} onClick={() => setCollecting(null)}>Vazgeç</button>
                <button type="submit" disabled={!collecting.campaign_id} className={primaryButton}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistory(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">{history.box.code} Boşaltma Geçmişi</h3>
                <p className="text-xs text-gray-500">{history.box.location_name}</p>
              </div>
              <button type="button" onClick={() => setHistory(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto text-sm">
              {history.rows.map((c) => (
                <li key={c.id} className={`flex items-center justify-between py-2.5 ${c.cancelled ? 'line-through opacity-50' : ''}`}>
                  <span>{new Date(c.collected_at).toLocaleDateString('tr-TR')} · {c.collected_by} · <span className="font-mono text-xs text-gray-500">{c.receipt_number}</span></span>
                  <strong>{formatMoney(c.amount_cents, c.currency)}</strong>
                </li>
              ))}
              {history.rows.length === 0 && <li className="py-6 text-center text-xs text-gray-400">Henüz boşaltılmadı.</li>}
            </ul>
          </div>
        </div>
      )}

      {showRegionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRegionModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Yeni Saha Bölgesi</h3>
              <button type="button" onClick={() => setShowRegionModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveRegion} className="space-y-4">
              <TextInput label="Bölge adı" required value={regionForm.name} onChange={(v) => setRegionForm({ ...regionForm, name: v })} placeholder="ör. Fatih / Merkez" />
              <TextInput label="Açıklama (isteğe bağlı)" value={regionForm.description} onChange={(v) => setRegionForm({ ...regionForm, description: v })} />
              <div className="flex justify-end gap-2">
                <button type="button" className={ghostButton} onClick={() => setShowRegionModal(false)}>Vazgeç</button>
                <button type="submit" className={primaryButton}>Bölge Ekle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {report && (report.by_region.length > 0 || report.by_staff.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {([['Bölgelere göre (bu yıl)', report.by_region], ['Personele göre (bu yıl)', report.by_staff]] as const).map(([title, rows]) => (
            <Card key={title} className="border border-gray-100 p-5 shadow-sm">
              <h2 className="mb-2 text-sm font-bold">{title}</h2>
              <ul className="space-y-1 text-sm">
                {rows.map((r) => <li key={r.label} className="flex justify-between"><span>{r.label} <span className="text-xs text-gray-400">({r.count})</span></span><strong>{formatMoney(r.total_cents)}</strong></li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
