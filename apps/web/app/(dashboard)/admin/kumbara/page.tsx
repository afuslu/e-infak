'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import {
  adminApiBase, adminAuthHeaders, adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess,
} from '../../../../lib/admin-access'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'

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
const emptyBox = {
  code: '', region_id: '', location_name: '', address: '', city: '', district: '', contact_name: '', contact_phone: '',
  responsible_user_id: '', campaign_id: '', status: 'active' as Box['status'], notes: '',
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
  const [collection, setCollection] = useState({ amount: '', date: '', notes: '', key: newKey() })
  const [history, setHistory] = useState<{ box: Box; rows: any[] } | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

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
      responsible_user_id: b.responsible_user_id || '', campaign_id: b.campaign_id || '', status: b.status, notes: b.notes || '',
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

  const addRegion = async () => {
    const name = window.prompt('Bölge adı')
    if (!name) return
    try {
      await adminSend('post', '/regions', { name })
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Kumbara Organizasyonu</h1>
          <p className="mt-1 text-sm text-gray-500">Boşaltılan tutar seçilen bağış kalemine &quot;Kumbara Bağışları&quot; adına işlenir ve raporlara yansır.</p>
        </div>
        <div className="flex gap-2">
          {canEdit && <button className={ghostButton} onClick={addRegion}>+ Bölge</button>}
          {canEdit && <button className={primaryButton} onClick={() => (showForm ? setShowForm(false) : open(null))}>{showForm ? 'Vazgeç' : '+ Kumbara'}</button>}
        </div>
      </div>

      {report && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Bu yıl toplanan', formatMoney(report.total_cents)],
            ['Boşaltma', report.collections],
            ['Aktif kumbara', report.boxes.active],
            ['Kayıp / pasif', `${report.boxes.lost} / ${report.boxes.passive}`],
            ['90 gündür boşaltılmayan', report.not_collected_90_days],
          ].map(([l, v]) => (
            <Card key={l as string} className="border border-gray-100 p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{l}</div>
              <div className="mt-1 text-xl font-black">{v}</div>
            </Card>
          ))}
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
            <div className="sm:col-span-2 lg:col-span-3"><TextInput label="Not" value={form.notes} onChange={(v) => set('notes', v)} /></div>
            <div className="flex items-end justify-end"><button type="submit" className={primaryButton}>{editing ? 'Kaydet' : 'Ekle'}</button></div>
          </form>
        </Card>
      )}

      {collecting && (
        <Card className="border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <form onSubmit={collect} className="flex flex-wrap items-end gap-3">
            <div className="text-sm font-bold">{collecting.code} — {collecting.location_name}</div>
            <div className="w-40"><TextInput label="Çıkan tutar (₺)" required inputMode="decimal" value={collection.amount} onChange={(v) => setCollection({ ...collection, amount: v })} /></div>
            <div className="w-44"><TextInput label="Boşaltma tarihi" type="date" value={collection.date} onChange={(v) => setCollection({ ...collection, date: v })} /></div>
            <div className="min-w-48 flex-1"><TextInput label="Not" value={collection.notes} onChange={(v) => setCollection({ ...collection, notes: v })} /></div>
            <button type="submit" className={primaryButton}>Kaydet</button>
            <button type="button" className={ghostButton} onClick={() => setCollecting(null)}>Vazgeç</button>
            {!collecting.campaign_id && <p className="w-full text-xs text-red-600">Bu kumbaranın aktarılacağı bağış kalemi seçili değil; önce kumbarayı düzenleyin.</p>}
          </form>
        </Card>
      )}

      <Card className="border border-gray-100 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          <input className={`${inputClass} w-56`} placeholder="Kod, yer, adres, yetkili" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
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
          <button className={ghostButton} onClick={() => exportCsv('kumbaralar.csv', ['Kod', 'Yer', 'Bölge', 'Adres', 'Yetkili', 'Telefon', 'Durum', 'Son boşaltma', 'Toplam'],
            boxes.map((b) => [b.code, b.location_name, b.region_name, [b.address, b.district, b.city].filter(Boolean).join(', '), b.contact_name,
              b.contact_phone, STATUS[b.status], b.last_collected_at ? new Date(b.last_collected_at).toLocaleDateString('tr-TR') : '', b.total_collected_cents / 100]))}>⬇ CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <th className="pb-2">Kod</th><th className="pb-2">Yer / adres</th><th className="pb-2">Bölge</th><th className="pb-2">Son boşaltma</th>
                <th className="pb-2 text-right">Toplam</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boxes.map((b) => (
                <tr key={b.id} className={b.status !== 'active' ? 'opacity-50' : ''}>
                  <td className="py-2 font-mono font-bold">{b.code}</td>
                  <td className="py-2">
                    <div className="font-semibold">{b.location_name}</div>
                    <div className="text-[10px] text-gray-500">{[b.address, b.district, b.city].filter(Boolean).join(', ')} {b.contact_phone && `· ${b.contact_phone}`}</div>
                  </td>
                  <td className="py-2">{b.region_name || '—'}</td>
                  <td className={`py-2 ${b.days_since_collection !== null && b.days_since_collection > 90 ? 'font-bold text-red-600' : ''}`}>
                    {b.last_collected_at ? `${new Date(b.last_collected_at).toLocaleDateString('tr-TR')} (${b.days_since_collection} gün)` : 'Hiç'}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(b.total_collected_cents)}<div className="text-[10px] text-gray-400">{b.collection_count} boşaltma</div></td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {canEdit && b.status === 'active' && <button className="font-bold text-emerald-700" onClick={() => setCollecting(b)}>Boşalt</button>}
                    <button className="ml-3 font-bold text-primary-700" onClick={() => showHistory(b)}>Geçmiş</button>
                    {canEdit && <button className="ml-3 font-bold text-gray-600" onClick={() => open(b)}>Düzenle</button>}
                  </td>
                </tr>
              ))}
              {boxes.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-400">Kumbara yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {history && (
        <Card className="border border-gray-100 p-5 shadow-sm">
          <div className="mb-2 flex justify-between"><strong>{history.box.code} boşaltma geçmişi</strong><button onClick={() => setHistory(null)} className="text-gray-400">✕</button></div>
          <ul className="divide-y divide-gray-100 text-sm">
            {history.rows.map((c) => (
              <li key={c.id} className={`flex justify-between py-1.5 ${c.cancelled ? 'line-through opacity-50' : ''}`}>
                <span>{new Date(c.collected_at).toLocaleDateString('tr-TR')} · {c.collected_by} · <span className="font-mono text-xs">{c.receipt_number}</span></span>
                <strong>{formatMoney(c.amount_cents, c.currency)}</strong>
              </li>
            ))}
            {history.rows.length === 0 && <li className="py-3 text-gray-400">Henüz boşaltılmadı.</li>}
          </ul>
        </Card>
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
