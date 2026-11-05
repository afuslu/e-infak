'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, formatMoney, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { DonorPicker, type PickedDonor } from '../../../../components/admin/DonorPicker'

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
  const [editing, setEditing] = useState<Well | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [owner, setOwner] = useState<PickedDonor | null>(null)
  const [shares, setShares] = useState<{ wellId: string; rows: { id: string; share_count: number; donor_name: string; on_behalf_of: string | null; receipt_number: string | null }[] } | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setWells((await adminGet<Well[]>('/water-wells', { status: statusFilter || undefined })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kuyular yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [statusFilter])

  const open = (w: Well | null) => {
    setEditing(w)
    setShowForm(true)
    setOwner(null)
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
    const body = {
      name: form.name, location_name: form.location_name, country: form.country || null,
      latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null,
      status: form.status, description: form.description || null, funding_model: form.funding_model,
      target_cents: money(form.target), share_count: form.share_count ? Number(form.share_count) : null,
      share_price_cents: form.share_price ? money(form.share_price) : null,
      gallery_urls: form.gallery.split('\n').map((s) => s.trim()).filter(Boolean),
      donor_id: owner?.id || editing?.donor_id || null, create_donation_campaign: form.create_donation_campaign,
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
      setShares({ wellId: w.id, rows: (await adminGet<any[]>(`/water-wells/${w.id}/shares`)).data })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Su Kuyusu Yönetimi</h1>
          <p className="mt-1 text-sm text-gray-500">Kuyuya bağlı bağış kalemine gelen bağışlar fonlamayı ve hisseleri otomatik günceller. Taksitli kuyu taahhütleri Sponsorluk ekranından açılır.</p>
        </div>
        <div className="flex gap-2">
          <select className={`${inputClass} w-44`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tüm durumlar</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {canEdit && <button className={primaryButton} onClick={() => (showForm ? setShowForm(false) : open(null))}>{showForm ? 'Vazgeç' : '+ Yeni Kuyu'}</button>}
        </div>
      </div>

      <Notice message={message} />

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
            <div className="sm:col-span-2"><DonorPicker value={owner} onChange={setOwner} label="Tek bağışçılı kuyu sahibi (isteğe bağlı)" /></div>
            <div className="sm:col-span-2"><TextArea label="Açıklama" rows={3} value={form.description} onChange={(v) => set('description', v)} /></div>
            <div className="sm:col-span-2"><TextArea label="Fotoğraflar (her satıra bir adres)" rows={3} value={form.gallery} onChange={(v) => set('gallery', v)} /></div>
            {(!editing || !editing.donation_campaign_id) && (
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 sm:col-span-2 lg:col-span-4">
                <input type="checkbox" checked={form.create_donation_campaign} onChange={(e) => set('create_donation_campaign', e.target.checked)} />
                Web sitesinde bu kuyu için bağış kalemi oluştur
              </label>
            )}
            <div className="flex justify-end sm:col-span-2 lg:col-span-4"><button type="submit" className={primaryButton}>{editing ? 'Kaydet' : 'Oluştur'}</button></div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {wells.map((w) => (
          <Card key={w.id} className="space-y-3 border border-gray-100 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-gray-900">{w.name}</div>
                <div className="text-xs text-gray-500">{[w.location_name, w.country].filter(Boolean).join(', ')}</div>
              </div>
              <span className="rounded border px-2 py-0.5 text-[10px] font-bold">{STATUS[w.status]}</span>
            </div>
            <div className="text-xs text-gray-500">{MODELS[w.funding_model]}{w.active_pledges ? ` · ${w.active_pledges} taksitli taahhüt` : ''}</div>
            {w.target_cents > 0 && (
              <div>
                <div className="flex justify-between text-xs font-semibold">
                  <span>{formatMoney(w.collected_cents)}</span><span className="text-gray-500">{formatMoney(w.target_cents)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-sky-600" style={{ width: `${w.progress_pct || 0}%` }} />
                </div>
              </div>
            )}
            {w.funding_model === 'hisseli' && (
              <div className="text-sm"><strong>{w.shares_sold}</strong> / {w.share_count} hisse satıldı · {formatMoney(w.share_price_cents || 0)} / hisse</div>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {canEdit && <button className={ghostButton} onClick={() => open(w)}>Düzenle</button>}
              {w.funding_model === 'hisseli' && <button className={ghostButton} onClick={() => showShares(w)}>Hissedarlar</button>}
              {w.donation_campaign_slug && <a className={ghostButton} href={`/kampanyalar/${w.donation_campaign_slug}`} target="_blank" rel="noreferrer">Bağış sayfası ↗</a>}
            </div>
            {shares?.wellId === w.id && (
              <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
                {shares.rows.map((s) => (
                  <li key={s.id} className="flex justify-between"><span>{s.on_behalf_of || s.donor_name}</span><span>{s.share_count} hisse</span></li>
                ))}
                {shares.rows.length === 0 && <li className="text-gray-400">Henüz hisse yok.</li>}
              </ul>
            )}
          </Card>
        ))}
        {wells.length === 0 && <p className="py-10 text-center text-xs text-gray-400 md:col-span-2 xl:col-span-3">Kuyu kaydı yok.</p>}
      </div>
    </div>
  )
}
