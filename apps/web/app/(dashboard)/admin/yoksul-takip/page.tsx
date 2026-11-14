'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import {
  adminGet, adminSend, apiErrorMessage, exportCsv, formatMoney, hasPermission, useAdminAccess,
} from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { confirmDialog } from '../../../../components/admin/ui'

type Degree = 'critical' | 'high' | 'medium' | 'low'
type Review = 'applied' | 'inspecting' | 'approved' | 'rejected'

interface Household {
  id: string; full_name: string; phone: string | null; national_id_masked: string | null
  region_id: string | null; region_name: string | null
  city: string | null; district: string | null; neighborhood: string | null; street: string | null; address: string | null
  latitude: number | null; longitude: number | null
  household_size: number | null; member_count: number | null
  housing_status: string | null; heating_type: string | null
  rent_cents: number | null; monthly_income_cents: number | null; monthly_expense_cents: number | null; debt_cents: number | null
  poverty_reasons: string[]; needs: string | null
  poverty_score: number; degree: Degree; degree_label: string; degree_override: Degree | null
  review_status: Review; review_label: string; source: string; status: string
  inspected_at: string | null; inspection_note: string | null
  last_delivery_at: string | null; total_received: number
}
interface Member {
  id: string; full_name: string; relation: string; relation_label: string; gender: string | null; birth_date: string | null
  is_disabled: boolean; has_chronic_illness: boolean; is_student: boolean; school: string | null; is_working: boolean
  monthly_income_cents: number | null; clothing_size: string | null; shoe_size: string | null; notes: string | null
}
interface Detail extends Household {
  members: Member[]
  distributions: { id: string; package_name: string; quantity: number; status: string; planned_date: string | null; delivered_at: string | null }[]
}
interface Meta {
  reasons: Record<string, string>; housing: Record<string, string>; heating: Record<string, string>
  relations: Record<string, string>; degrees: Record<Degree, string>; review_statuses: Record<Review, string>
  poverty_line_cents: number; default_poverty_line_cents: number
}

type Tab = 'households' | 'applications' | 'bulk' | 'stats' | 'settings'

const DEGREE_STYLE: Record<Degree, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-gray-100 text-gray-600',
}
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('tr-TR') : '—')
const lira = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100))
const toCents = (v: string) => (v.trim() === '' ? null : Math.round(Number(v.replace(',', '.')) * 100))
const location = (h: Pick<Household, 'city' | 'district' | 'neighborhood'>) => [h.city, h.district, h.neighborhood].filter(Boolean).join(' / ') || '—'

function ScoreBadge({ h }: { h: Pick<Household, 'poverty_score' | 'degree' | 'degree_label'> }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${DEGREE_STYLE[h.degree]}`}>
      {h.poverty_score} · {h.degree_label}
    </span>
  )
}

const emptyHousehold = {
  full_name: '', phone: '', national_id: '', region_id: '', city: '', district: '', neighborhood: '', street: '', address: '',
  latitude: '', longitude: '', household_size: '', housing_status: '', heating_type: '', rent: '', income: '', expense: '', debt: '',
  poverty_reasons: [] as string[], degree_override: '', needs: '', status: 'active',
}
type HouseholdForm = typeof emptyHousehold & { id?: string }

const emptyMember = {
  full_name: '', relation: 'child', gender: '', birth_date: '', is_disabled: false, has_chronic_illness: false, is_student: false,
  school: '', is_working: false, income: '', clothing_size: '', shoe_size: '', notes: '',
}
type MemberForm = typeof emptyMember & { id?: string }

export default function PovertyTrackingPage() {
  const { data: access } = useAdminAccess()
  const canEdit = hasPermission(access, 'operations_manage')
  const [tab, setTab] = useState<Tab>('households')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([])
  const [packages, setPackages] = useState<{ id: string; name: string; stock: number; unit_cost_cents: number }[]>([])
  const [rows, setRows] = useState<Household[]>([])
  const [filters, setFilters] = useState({ degree: '', city: '', district: '', neighborhood: '', q: '', not_helped_days: '', region_id: '' })
  const [detail, setDetail] = useState<Detail | null>(null)
  const [form, setForm] = useState<HouseholdForm | null>(null)
  const [memberForm, setMemberForm] = useState<MemberForm | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    Promise.all([
      adminGet<Meta>('/households-meta'),
      adminGet<{ id: string; name: string }[]>('/regions').catch(() => ({ data: [] })),
      adminGet<typeof packages>('/aid-packages').catch(() => ({ data: [] })),
    ]).then(([m, r, p]) => {
      setMeta(m.data)
      setRegions(r.data)
      setPackages(p.data)
    }).catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Modül yüklenemedi') }))
  }, [])

  const load = async () => {
    if (tab !== 'households' && tab !== 'applications') return
    try {
      const params = tab === 'applications'
        ? { review: 'open' }
        : { review: 'approved', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
      setRows((await adminGet<Household[]>('/households', params)).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Haneler yüklenemedi') })
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters])

  const openDetail = async (id: string) => {
    try {
      setDetail((await adminGet<Detail>(`/households/${id}`)).data)
      setForm(null)
      setMemberForm(null)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const act = async (fn: () => Promise<unknown>, ok: string, refreshId?: string) => {
    setMessage(null)
    try {
      await fn()
      setMessage({ type: 'ok', text: ok })
      await load()
      if (refreshId) await openDetail(refreshId)
      return true
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
      return false
    }
  }

  const editHousehold = (h?: Household) => {
    setDetail(h ? detail : null)
    setForm(h ? {
      id: h.id, full_name: h.full_name, phone: h.phone || '', national_id: '', region_id: h.region_id || '',
      city: h.city || '', district: h.district || '', neighborhood: h.neighborhood || '', street: h.street || '', address: h.address || '',
      latitude: h.latitude?.toString() || '', longitude: h.longitude?.toString() || '', household_size: h.household_size?.toString() || '',
      housing_status: h.housing_status || '', heating_type: h.heating_type || '', rent: lira(h.rent_cents), income: lira(h.monthly_income_cents),
      expense: lira(h.monthly_expense_cents), debt: lira(h.debt_cents), poverty_reasons: h.poverty_reasons,
      degree_override: h.degree_override || '', needs: h.needs || '', status: h.status,
    } : { ...emptyHousehold })
  }

  const saveHousehold = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const body = {
      full_name: form.full_name, phone: form.phone || null, national_id: form.national_id || null, region_id: form.region_id || null,
      city: form.city || null, district: form.district || null, neighborhood: form.neighborhood || null, street: form.street || null,
      address: form.address || null, latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null,
      household_size: form.household_size ? Number(form.household_size) : null,
      housing_status: form.housing_status || null, heating_type: form.heating_type || null,
      rent_cents: toCents(form.rent), monthly_income_cents: toCents(form.income), monthly_expense_cents: toCents(form.expense),
      debt_cents: toCents(form.debt), poverty_reasons: form.poverty_reasons, degree_override: form.degree_override || null,
      needs: form.needs || null, status: form.status,
    }
    const id = form.id
    const ok = await act(async () => {
      const res = id ? await adminSend<Household>('put', `/households/${id}`, body) : await adminSend<Household>('post', '/households', body)
      if (!id) await openDetail(res.data.id)
    }, 'Hane kaydedildi', id)
    if (ok) setForm(null)
  }

  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberForm || !detail) return
    const body = {
      full_name: memberForm.full_name, relation: memberForm.relation, gender: memberForm.gender || null, birth_date: memberForm.birth_date || null,
      is_disabled: memberForm.is_disabled, has_chronic_illness: memberForm.has_chronic_illness, is_student: memberForm.is_student,
      school: memberForm.school || null, is_working: memberForm.is_working, monthly_income_cents: toCents(memberForm.income),
      clothing_size: memberForm.clothing_size || null, shoe_size: memberForm.shoe_size || null, notes: memberForm.notes || null,
    }
    const path = memberForm.id ? `/households/${detail.id}/members/${memberForm.id}` : `/households/${detail.id}/members`
    if (await act(() => adminSend(memberForm.id ? 'put' : 'post', path, body), 'Aile bireyi kaydedildi', detail.id)) setMemberForm(null)
  }

  const review = (h: Household, status: Exclude<Review, 'applied'>) => {
    const note = status === 'inspecting' ? null : window.prompt(status === 'approved' ? 'İnceleme notu (isteğe bağlı)' : 'Ret gerekçesi (isteğe bağlı)')
    if (note === null && status !== 'inspecting') return
    act(() => adminSend('post', `/households/${h.id}/review`, { status, note: note || null }),
      { inspecting: 'Saha incelemesine alındı', approved: 'Hane onaylandı', rejected: 'Başvuru reddedildi' }[status],
      detail?.id === h.id ? h.id : undefined)
  }

  const set = <K extends keyof HouseholdForm>(k: K, v: HouseholdForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const setM = <K extends keyof MemberForm>(k: K, v: MemberForm[K]) => setMemberForm((f) => (f ? { ...f, [k]: v } : f))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Yoksul Takibi</h1>
          <p className="mt-1 text-sm text-gray-500">Hane kartı, yoksulluk puanı, başvuru incelemesi, toplu yardım ve adil dağıtım raporları. Onaylı haneler kumanyada da görünür.</p>
        </div>
        {canEdit && <button className={primaryButton} onClick={() => editHousehold()}>+ Yeni hane</button>}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b text-sm font-semibold">
        {([['households', 'Haneler'], ['applications', 'Başvurular'], ['bulk', 'Toplu Yardım'], ['stats', 'İstatistik & Adalet'], ['settings', 'Puanlama Ayarı']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setDetail(null); setForm(null); setMessage(null) }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${tab === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      <Notice message={message} />

      {form && meta && (
        <Card className="border border-gray-100 p-6 shadow-sm">
          <form onSubmit={saveHousehold} className="space-y-5">
            <h2 className="text-lg font-bold text-gray-900">{form.id ? 'Hane kartını düzenle' : 'Yeni hane'}</h2>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Hane reisi / başvuran" value={form.full_name} onChange={(v) => set('full_name', v)} required minLength={2} />
              <TextInput label="Telefon" value={form.phone} onChange={(v) => set('phone', v)} />
              <TextInput label="TC kimlik no" value={form.national_id} onChange={(v) => set('national_id', v)}
                hint={form.id ? 'Boş bırakılırsa kayıtlı numara korunur' : undefined} />
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <TextInput label="İl" value={form.city} onChange={(v) => set('city', v)} />
              <TextInput label="İlçe" value={form.district} onChange={(v) => set('district', v)} />
              <TextInput label="Mahalle" value={form.neighborhood} onChange={(v) => set('neighborhood', v)} />
              <TextInput label="Sokak" value={form.street} onChange={(v) => set('street', v)} />
              <div className="sm:col-span-2"><TextInput label="Açık adres" value={form.address} onChange={(v) => set('address', v)} /></div>
              <TextInput label="Enlem" value={form.latitude} onChange={(v) => set('latitude', v)} inputMode="decimal" />
              <TextInput label="Boylam" value={form.longitude} onChange={(v) => set('longitude', v)} inputMode="decimal" />
              <Label label="Bölge (saha ekibi)">
                <select className={inputClass} value={form.region_id} onChange={(e) => set('region_id', e.target.value)}>
                  <option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-4">
              <TextInput label="Hane büyüklüğü" value={form.household_size} onChange={(v) => set('household_size', v)} inputMode="numeric"
                hint="Aile bireyi eklenince otomatik hesaplanır" />
              <TextInput label="Aylık toplam gelir (₺)" value={form.income} onChange={(v) => set('income', v)} inputMode="decimal"
                hint="Boşsa bireylerin gelirleri toplanır" />
              <TextInput label="Aylık kira (₺)" value={form.rent} onChange={(v) => set('rent', v)} inputMode="decimal" />
              <TextInput label="Aylık gider (₺)" value={form.expense} onChange={(v) => set('expense', v)} inputMode="decimal" />
              <TextInput label="Toplam borç (₺)" value={form.debt} onChange={(v) => set('debt', v)} inputMode="decimal" />
              <Label label="Konut durumu">
                <select className={inputClass} value={form.housing_status} onChange={(e) => set('housing_status', e.target.value)}>
                  <option value="">—</option>{Object.entries(meta.housing).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
              <Label label="Isınma">
                <select className={inputClass} value={form.heating_type} onChange={(e) => set('heating_type', e.target.value)}>
                  <option value="">—</option>{Object.entries(meta.heating).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
              <Label label="Derece (elle)" hint="Boşsa puandan hesaplanır">
                <select className={inputClass} value={form.degree_override} onChange={(e) => set('degree_override', e.target.value)}>
                  <option value="">Otomatik</option>{Object.entries(meta.degrees).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Label>
            </fieldset>
            <div>
              <p className="mb-2 text-xs font-bold text-gray-600">Yoksulluk sebepleri</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meta.reasons).map(([k, v]) => {
                  const on = form.poverty_reasons.includes(k)
                  return (
                    <button type="button" key={k} onClick={() => set('poverty_reasons', on ? form.poverty_reasons.filter((r) => r !== k) : [...form.poverty_reasons, k])}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-primary-600 bg-primary-50 text-primary-700' : 'bg-white text-gray-600'}`}>{v}</button>
                  )
                })}
              </div>
            </div>
            <TextArea label="İhtiyaçlar / notlar" value={form.needs} onChange={(v) => set('needs', v)} rows={3} />
            <div className="flex gap-2">
              <button type="submit" className={primaryButton}>Kaydet</button>
              <button type="button" className={ghostButton} onClick={() => setForm(null)}>Vazgeç</button>
            </div>
          </form>
        </Card>
      )}

      {detail && !form && meta && (
        <Card className="space-y-5 border border-gray-100 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{detail.full_name}</h2>
                <ScoreBadge h={detail} />
                <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold text-gray-600">{detail.review_label}</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {location(detail)}{detail.street ? ` · ${detail.street}` : ''} · {detail.household_size || '?'} kişi
                {detail.phone ? ` · ${detail.phone}` : ''}{detail.national_id_masked ? ` · TC ${detail.national_id_masked}` : ''}
              </p>
              {detail.latitude !== null && detail.longitude !== null && (
                <a className="text-xs font-semibold text-primary-700 underline" target="_blank" rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${detail.latitude}&mlon=${detail.longitude}#map=17/${detail.latitude}/${detail.longitude}`}>Haritada aç</a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && <button className={ghostButton} onClick={() => editHousehold(detail)}>Düzenle</button>}
              {canEdit && detail.review_status !== 'approved' && <button className={ghostButton} onClick={() => review(detail, 'approved')}>Onayla</button>}
              {canEdit && detail.review_status === 'applied' && <button className={ghostButton} onClick={() => review(detail, 'inspecting')}>İncelemeye al</button>}
              {canEdit && detail.review_status !== 'rejected' && <button className={ghostButton} onClick={() => review(detail, 'rejected')}>Reddet</button>}
              <button className={ghostButton} onClick={() => setDetail(null)}>Kapat</button>
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {[
              ['Aylık gelir', detail.monthly_income_cents !== null ? formatMoney(detail.monthly_income_cents) : '—'],
              ['Kira', detail.rent_cents !== null ? formatMoney(detail.rent_cents) : '—'],
              ['Konut / ısınma', `${meta.housing[detail.housing_status || ''] || '—'} / ${meta.heating[detail.heating_type || ''] || '—'}`],
              ['Borç', detail.debt_cents ? formatMoney(detail.debt_cents) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-bold text-gray-400">{k}</p><p className="font-semibold text-gray-800">{v}</p></div>
            ))}
          </div>
          {detail.poverty_reasons.length > 0 && (
            <p className="text-xs text-gray-600">Sebepler: {detail.poverty_reasons.map((r) => meta.reasons[r] || r).join(', ')}</p>
          )}
          {detail.needs && <p className="whitespace-pre-line text-sm text-gray-700">{detail.needs}</p>}
          {detail.inspection_note && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">İnceleme notu ({fmtDate(detail.inspected_at)}): {detail.inspection_note}</p>}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Aile bireyleri ({detail.members.length})</h3>
              {canEdit && <button className={ghostButton} onClick={() => setMemberForm({ ...emptyMember })}>+ Birey ekle</button>}
            </div>
            {memberForm && (
              <form onSubmit={saveMember} className="mb-3 space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <TextInput label="Ad soyad" value={memberForm.full_name} onChange={(v) => setM('full_name', v)} required minLength={2} />
                  <Label label="Yakınlık">
                    <select className={inputClass} value={memberForm.relation} onChange={(e) => setM('relation', e.target.value)}>
                      {Object.entries(meta.relations).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Label>
                  <Label label="Cinsiyet">
                    <select className={inputClass} value={memberForm.gender} onChange={(e) => setM('gender', e.target.value)}>
                      <option value="">—</option><option value="female">Kadın</option><option value="male">Erkek</option>
                    </select>
                  </Label>
                  <TextInput label="Doğum tarihi" type="date" value={memberForm.birth_date} onChange={(v) => setM('birth_date', v)} />
                  <TextInput label="Aylık gelir (₺)" value={memberForm.income} onChange={(v) => setM('income', v)} inputMode="decimal" />
                  <TextInput label="Okul" value={memberForm.school} onChange={(v) => setM('school', v)} />
                  <TextInput label="Beden" value={memberForm.clothing_size} onChange={(v) => setM('clothing_size', v)} />
                  <TextInput label="Ayakkabı no" value={memberForm.shoe_size} onChange={(v) => setM('shoe_size', v)} />
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-700">
                  {([['is_working', 'Çalışıyor'], ['is_student', 'Öğrenci'], ['is_disabled', 'Engelli'], ['has_chronic_illness', 'Kronik hasta']] as const).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={memberForm[k]} onChange={(e) => setM(k, e.target.checked)} />{l}
                    </label>
                  ))}
                </div>
                <TextInput label="Not" value={memberForm.notes} onChange={(v) => setM('notes', v)} />
                <div className="flex gap-2">
                  <button type="submit" className={primaryButton}>Kaydet</button>
                  <button type="button" className={ghostButton} onClick={() => setMemberForm(null)}>Vazgeç</button>
                </div>
              </form>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="py-1">Ad</th><th>Yakınlık</th><th>Doğum</th><th>Durum</th><th>Gelir</th><th>Beden / Ayakkabı</th><th /></tr></thead>
                <tbody>
                  {detail.members.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="py-1.5 font-semibold">{m.full_name}</td>
                      <td>{m.relation_label}</td>
                      <td>{fmtDate(m.birth_date)}</td>
                      <td>{[m.is_working && 'Çalışıyor', m.is_student && `Öğrenci${m.school ? ` (${m.school})` : ''}`, m.is_disabled && 'Engelli', m.has_chronic_illness && 'Kronik hasta'].filter(Boolean).join(', ') || '—'}</td>
                      <td>{m.monthly_income_cents ? formatMoney(m.monthly_income_cents) : '—'}</td>
                      <td>{[m.clothing_size, m.shoe_size].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="whitespace-nowrap text-right">
                        {canEdit && <>
                          <button className="mr-2 font-bold text-primary-700" onClick={() => setMemberForm({
                            id: m.id, full_name: m.full_name, relation: m.relation, gender: m.gender || '', birth_date: m.birth_date || '',
                            is_disabled: m.is_disabled, has_chronic_illness: m.has_chronic_illness, is_student: m.is_student, school: m.school || '',
                            is_working: m.is_working, income: lira(m.monthly_income_cents), clothing_size: m.clothing_size || '', shoe_size: m.shoe_size || '', notes: m.notes || '',
                          })}>Düzenle</button>
                          <button className="font-bold text-red-600" onClick={async () => (await confirmDialog(`${m.full_name} silinsin mi?`)) &&
                            act(() => adminSend('delete', `/households/${detail.id}/members/${m.id}`), 'Birey silindi', detail.id)}>Sil</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                  {!detail.members.length && <tr><td colSpan={7} className="py-3 text-center text-gray-400">Birey eklenmemiş. Puanın doğru hesaplanması için bireyleri girin.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Yardım geçmişi</h3>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="py-1">Paket</th><th>Adet</th><th>Durum</th><th>Plan</th><th>Teslim</th></tr></thead>
              <tbody>
                {detail.distributions.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-1.5">{d.package_name}</td><td>{d.quantity}</td>
                    <td>{{ planned: 'Planlandı', delivered: 'Teslim edildi', cancelled: 'İptal' }[d.status] || d.status}</td>
                    <td>{fmtDate(d.planned_date)}</td><td>{fmtDate(d.delivered_at)}</td>
                  </tr>
                ))}
                {!detail.distributions.length && <tr><td colSpan={5} className="py-3 text-center text-gray-400">Henüz yardım yapılmamış.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(tab === 'households' || tab === 'applications') && (
        <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
          {tab === 'households' && meta && (
            <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <select className={inputClass} value={filters.degree} onChange={(e) => setFilters({ ...filters, degree: e.target.value })}>
                <option value="">Tüm dereceler</option>{Object.entries(meta.degrees).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className={inputClass} placeholder="İl" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
              <input className={inputClass} placeholder="İlçe" value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} />
              <input className={inputClass} placeholder="Mahalle" value={filters.neighborhood} onChange={(e) => setFilters({ ...filters, neighborhood: e.target.value })} />
              <select className={inputClass} value={filters.region_id} onChange={(e) => setFilters({ ...filters, region_id: e.target.value })}>
                <option value="">Tüm bölgeler</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className={inputClass} value={filters.not_helped_days} onChange={(e) => setFilters({ ...filters, not_helped_days: e.target.value })}>
                <option value="">Yardım fark etmez</option><option value="30">30 gündür yardım almayan</option>
                <option value="90">90 gündür yardım almayan</option><option value="180">180 gündür yardım almayan</option>
              </select>
              <input className={inputClass} placeholder="Ad, telefon, adres…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            </div>
          )}
          {tab === 'applications' && <p className="text-sm text-gray-500">Web sitesinden gelen ve incelemesi süren başvurular. Onaylanana kadar kumanya ve toplu yardımda görünmezler.</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500">{rows.length} hane · en yüksek puan üstte</p>
            <button className={ghostButton} onClick={() => exportCsv('haneler.csv', ['Puan', 'Derece', 'Ad', 'Telefon', 'İl', 'İlçe', 'Mahalle', 'Kişi', 'Son yardım', 'Alınan paket', 'Durum'],
              rows.map((h) => [h.poverty_score, h.degree_label, h.full_name, h.phone, h.city, h.district, h.neighborhood, h.household_size, fmtDate(h.last_delivery_at), h.total_received, h.review_label]))}>⬇ CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="py-1">Puan</th><th>Ad</th><th>Konum</th><th>Kişi</th><th>Son yardım</th><th>Durum</th><th /></tr></thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className={`cursor-pointer border-t hover:bg-gray-50 ${detail?.id === h.id ? 'bg-primary-50/30' : ''}`} onClick={() => openDetail(h.id)}>
                    <td className="py-2"><ScoreBadge h={h} /></td>
                    <td className="font-semibold text-gray-900">{h.full_name}{h.source === 'web' && <span className="ml-1 text-[10px] text-gray-400">(web)</span>}</td>
                    <td>{location(h)}</td>
                    <td>{h.household_size || '—'}</td>
                    <td>{fmtDate(h.last_delivery_at)}{h.total_received ? ` (${h.total_received})` : ''}</td>
                    <td>{h.review_label}</td>
                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      {canEdit && tab === 'applications' && <>
                        {h.review_status === 'applied' && <button className="mr-2 font-bold text-gray-700" onClick={() => review(h, 'inspecting')}>İncele</button>}
                        <button className="mr-2 font-bold text-primary-700" onClick={() => review(h, 'approved')}>Onayla</button>
                        <button className="font-bold text-red-600" onClick={() => review(h, 'rejected')}>Reddet</button>
                      </>}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="py-6 text-center text-gray-400">Kayıt yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'bulk' && meta && <BulkPlan meta={meta} regions={regions} packages={packages} canEdit={canEdit} onMessage={setMessage} />}
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && meta && <Settings meta={meta} canEdit={canEdit} onSaved={(line) => setMeta({ ...meta, poverty_line_cents: line })} onMessage={setMessage} />}
    </div>
  )
}

function BulkPlan({ meta, regions, packages, canEdit, onMessage }: {
  meta: Meta; regions: { id: string; name: string }[]; packages: { id: string; name: string; stock: number }[]; canEdit: boolean
  onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void
}) {
  const [plan, setPlan] = useState({
    package_id: '', degrees: ['critical', 'high'] as Degree[], region_id: '', city: '', district: '', neighborhood: '',
    min_score: '', exclude_helped_days: '30', max_households: '200', quantity: '1', planned_date: '', notes: '',
  })
  const [result, setResult] = useState<{ households: number; packages_needed: number; stock: number; stock_short: number; estimated_cost_cents: number; planned: number; preview: Household[] } | null>(null)

  const run = async (dryRun: boolean) => {
    onMessage(null)
    if (!plan.package_id) {
      onMessage({ type: 'error', text: 'Önce paket seçin' })
      return
    }
    try {
      const res = await adminSend<NonNullable<typeof result>>('post', '/households/bulk-plan', {
        ...plan, min_score: plan.min_score ? Number(plan.min_score) : null, exclude_helped_days: Number(plan.exclude_helped_days) || 0,
        max_households: Number(plan.max_households) || 200, quantity: Number(plan.quantity) || 1, planned_date: plan.planned_date || null,
        notes: plan.notes || null, dry_run: dryRun,
      })
      setResult(res.data)
      if (!dryRun) onMessage({ type: 'ok', text: `${res.data.planned} haneye dağıtım planlandı. Teslimleri Kumanya → Dağıtımlar ekranından işaretleyin.` })
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  const p = (k: keyof typeof plan, v: string) => { setPlan({ ...plan, [k]: v }); setResult(null) }

  return (
    <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
      <p className="text-sm text-gray-500">Ölçütlere uyan onaylı hanelere en yüksek puandan başlayarak dağıtım planlanır. Aynı paket için bekleyeni olanlar ve son günlerde yardım almış olanlar atlanır.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Label label="Paket">
          <select className={inputClass} value={plan.package_id} onChange={(e) => p('package_id', e.target.value)}>
            <option value="">Seçin</option>{packages.map((x) => <option key={x.id} value={x.id}>{x.name} (stok {x.stock})</option>)}
          </select>
        </Label>
        <TextInput label="İl" value={plan.city} onChange={(v) => p('city', v)} />
        <TextInput label="İlçe" value={plan.district} onChange={(v) => p('district', v)} />
        <TextInput label="Mahalle" value={plan.neighborhood} onChange={(v) => p('neighborhood', v)} />
        <Label label="Bölge">
          <select className={inputClass} value={plan.region_id} onChange={(e) => p('region_id', e.target.value)}>
            <option value="">Tümü</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Label>
        <TextInput label="En az puan" value={plan.min_score} onChange={(v) => p('min_score', v)} inputMode="numeric" />
        <TextInput label="Son kaç günde yardım alanı atla" value={plan.exclude_helped_days} onChange={(v) => p('exclude_helped_days', v)} inputMode="numeric" />
        <TextInput label="En fazla hane" value={plan.max_households} onChange={(v) => p('max_households', v)} inputMode="numeric" />
        <TextInput label="Hane başı adet" value={plan.quantity} onChange={(v) => p('quantity', v)} inputMode="numeric" />
        <TextInput label="Planlanan tarih" type="date" value={plan.planned_date} onChange={(v) => p('planned_date', v)} />
        <div className="sm:col-span-2"><TextInput label="Not" value={plan.notes} onChange={(v) => p('notes', v)} /></div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {(Object.entries(meta.degrees) as [Degree, string][]).map(([k, v]) => {
          const on = plan.degrees.includes(k)
          return (
            <button key={k} type="button" onClick={() => { setPlan({ ...plan, degrees: on ? plan.degrees.filter((d) => d !== k) : [...plan.degrees, k] }); setResult(null) }}
              className={`rounded-full border px-3 py-1 ${on ? 'border-primary-600 bg-primary-50 text-primary-700' : 'bg-white text-gray-600'}`}>{v}</button>
          )
        })}
        <span className="self-center font-normal text-gray-400">Hiçbiri seçili değilse tüm dereceler</span>
      </div>
      <div className="flex gap-2">
        <button className={ghostButton} onClick={() => run(true)}>Önizle</button>
        {canEdit && result && result.households > 0 && result.planned === 0 && (
          <button className={primaryButton} onClick={async () => (await confirmDialog({ title: `${result.households} haneye dağıtım planlansın mı?`, danger: false })) && run(false)}>Planı oluştur</button>
        )}
      </div>
      {result && (
        <div className="space-y-3">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {[['Hane', result.households], ['Gereken paket', result.packages_needed], ['Stok', result.stock], ['Tahmini maliyet', formatMoney(result.estimated_cost_cents)]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-bold text-gray-400">{k}</p><p className="font-semibold text-gray-800">{v}</p></div>
            ))}
          </div>
          {result.stock_short > 0 && <p className="text-xs font-semibold text-amber-700">Stok {result.stock_short} paket eksik; teslim sırasında stok yetmezse işlem durur.</p>}
          {result.preview.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="py-1">Puan</th><th>Ad</th><th>Konum</th><th>Son yardım</th></tr></thead>
              <tbody>{result.preview.map((h) => (
                <tr key={h.id} className="border-t"><td className="py-1.5"><ScoreBadge h={h} /></td><td>{h.full_name}</td><td>{location(h)}</td><td>{fmtDate(h.last_delivery_at)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  )
}

function Stats() {
  const [level, setLevel] = useState<'city' | 'district' | 'neighborhood'>('neighborhood')
  const [days, setDays] = useState(180)
  const [stats, setStats] = useState<any>(null)
  const [fair, setFair] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([adminGet('/households-stats', { level }), adminGet('/households-fairness', { days })])
      .then(([s, f]) => { setStats(s.data); setFair(f.data) })
      .catch((err) => setError(apiErrorMessage(err, 'Rapor yüklenemedi')))
  }, [level, days])
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!stats || !fair) return <p className="text-sm text-gray-400">Yükleniyor…</p>
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {stats.degrees.map((d: any) => (
          <div key={d.degree} className={`rounded-xl p-4 ${DEGREE_STYLE[d.degree as Degree]}`}>
            <p className="text-xs font-bold">{d.label}</p><p className="text-2xl font-extrabold">{d.households}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Bekleyen başvuru: {stats.review.applied} · İncelemede: {stats.review.inspecting} · Reddedilen: {stats.review.rejected}</p>

      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">Adres bazlı dağılım (son 12 ay)</h2>
          <select className={`${inputClass} w-40`} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="city">İl</option><option value="district">İlçe</option><option value="neighborhood">Mahalle</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="py-1">Konum</th><th>Hane</th><th>Ort. puan</th><th>Çok acil</th><th>Yüksek</th><th>Yardım alan</th><th>Paket</th></tr></thead>
            <tbody>{stats.rows.map((r: any) => (
              <tr key={r.label} className="border-t"><td className="py-1.5 font-semibold">{r.label}</td><td>{r.households}</td><td>{r.avg_score}</td>
                <td className="font-bold text-red-700">{r.critical}</td><td>{r.high}</td><td>{r.helped_12m}</td><td>{r.packages_12m}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-3 border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">Adil dağıtım</h2>
          <select className={`${inputClass} w-40`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={90}>Son 90 gün</option><option value={180}>Son 180 gün</option><option value={365}>Son 1 yıl</option>
          </select>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="py-1">Derece</th><th>Hane</th><th>Yardım alan</th><th>Almayan</th><th>Oran</th><th>Hane başı paket</th></tr></thead>
          <tbody>{fair.degrees.map((d: any) => (
            <tr key={d.degree} className="border-t"><td className="py-1.5 font-semibold">{d.label}</td><td>{d.households}</td><td>{d.helped}</td><td>{d.not_helped}</td><td>%{d.helped_pct}</td><td>{d.packages_per_household}</td></tr>
          ))}</tbody>
        </table>
        <p className="text-[11px] text-gray-400">Adil bir dağıtımda yardım oranı ve hane başı paket, derece yükseldikçe artmalıdır.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-bold text-red-700">Gözden kaçanlar: çok acil / yüksek ama bu dönemde yardım almamış ({fair.overlooked.length})</h3>
            <table className="w-full text-left text-xs"><tbody>{fair.overlooked.map((h: Household) => (
              <tr key={h.id} className="border-t"><td className="py-1.5"><ScoreBadge h={h} /></td><td>{h.full_name}</td><td>{location(h)}</td><td>son: {fmtDate(h.last_delivery_at)}</td></tr>
            ))}</tbody></table>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold text-gray-700">Bu dönemde en çok yardım alanlar</h3>
            <table className="w-full text-left text-xs"><tbody>{fair.most_helped.map((h: Household) => (
              <tr key={h.id} className="border-t"><td className="py-1.5"><ScoreBadge h={h} /></td><td>{h.full_name}</td><td>{h.total_received} paket</td></tr>
            ))}</tbody></table>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Settings({ meta, canEdit, onSaved, onMessage }: {
  meta: Meta; canEdit: boolean; onSaved: (line: number) => void; onMessage: (m: { type: 'ok' | 'error'; text: string } | null) => void
}) {
  const [line, setLine] = useState(String(meta.poverty_line_cents / 100))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await adminSend<{ poverty_line_cents: number; rescored: number }>('put', '/households-settings', { poverty_line_cents: toCents(line) })
      onSaved(res.data.poverty_line_cents)
      onMessage({ type: 'ok', text: `Eşik kaydedildi, ${res.data.rescored} hanenin puanı yeniden hesaplandı` })
    } catch (err) {
      onMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }
  return (
    <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-64"><TextInput label="Kişi başı aylık yoksulluk eşiği (₺)" value={line} onChange={setLine} inputMode="decimal" disabled={!canEdit}
          hint={`Varsayılan ${formatMoney(meta.default_poverty_line_cents)}. Boş bırakılırsa varsayılan kullanılır.`} /></div>
        {canEdit && <button type="submit" className={primaryButton}>Kaydet ve yeniden puanla</button>}
      </form>
      <div className="text-xs leading-relaxed text-gray-600">
        <p className="mb-1 font-bold text-gray-800">Puan nasıl hesaplanır? (0–100, yüksek = daha çok ihtiyaç)</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Kişi başı net gelir (gelir − kira) eşiğe göre: en fazla 40</li>
          <li>Çocuk (18 yaş altı), yaşlı (65+), engelli ve kronik hasta birey başına 4: en fazla 20</li>
          <li>Hanede çalışan yoksa: 10</li>
          <li>Kirada 8, akraba yanında 4 · ısınma yok 6, soba 3</li>
          <li>Borç (eşiğin 3 aylık hane toplamına oranla): en fazla 6</li>
          <li>Her yoksulluk sebebi 2: en fazla 10</li>
        </ul>
        <p className="mt-2">Derece: 70+ Çok acil · 50+ Yüksek · 30+ Orta · altı Düşük. Hane kartında derece elle de belirlenebilir.</p>
      </div>
    </Card>
  )
}
