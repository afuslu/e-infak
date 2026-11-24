'use client'

/** STK PRO "Yeni Bağışçı" form: same fields in the same order, with the sticky "Kaydedilmemiş değişiklik var" bar. */
import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, User } from 'lucide-react'
import { adminSend, apiErrorMessage } from '../../../lib/admin-access'
import { Label, inputClass } from '../FormKit'
import { BLOOD_GROUPS, type DonorCard, type DonorOptions, type DonorRow, PHONE_CODES, type Staff, staffName } from './types'

const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '' }
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] }
}

/** Number without its country code, as typed in the "Cep Telefon" box. */
function localPart(phone: string | null | undefined, code: string | null | undefined) {
  if (!phone) return ''
  if (phone.includes('*')) return phone
  const c = code || '90'
  return phone.startsWith(c) && phone.length > 10 ? phone.slice(c.length) : phone
}

function withCode(local: string, code: string) {
  if (!local.trim()) return null
  if (local.includes('*')) return local
  const digits = local.replace(/\D/g, '').replace(/^0+/, '')
  return digits.startsWith(code) && digits.length > 10 ? digits : `${code}${digits}`
}

function PhoneField({ label, required, code, value, onCode, onValue }: {
  label: string; required?: boolean; code: string; value: string; onCode: (v: string) => void; onValue: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <Label label="Kod">
        <select className={inputClass} value={code} onChange={(e) => onCode(e.target.value)} aria-label={`${label} ülke kodu`}>
          {PHONE_CODES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
      </Label>
      <Label label={required ? `${label} *` : label}>
        <input className={inputClass} inputMode="tel" placeholder="(5__) ___ __ __" required={required} value={value}
          onChange={(e) => onValue(e.target.value)} />
      </Label>
    </div>
  )
}

export function DonorForm({ donor, staff, options, onSaved, onCancel, compact }: {
  donor?: DonorCard
  staff: Staff[]
  options?: DonorOptions
  onSaved: (d: DonorRow) => void
  onCancel?: () => void
  /** Hızlı Ekle: name, phone and membership type only. */
  compact?: boolean
}) {
  const initial = useMemo(() => ({
    donor_type: donor?.donor_type || 'individual',
    full_name: donor ? `${donor.first_name} ${donor.last_name || ''}`.trim() : '',
    company_name: donor?.company_name || '',
    membership_type: donor?.membership_type || '',
    phone_code: donor?.phone_code || '90',
    phone: localPart(donor?.phone, donor?.phone_code),
    phone2_code: donor?.phone2_code || '90',
    phone2: localPart(donor?.phone2, donor?.phone2_code),
    tc_no: '',
    email: donor?.email || '',
    blood_group: donor?.blood_group || '',
    gender: donor?.gender || '',
    occupation: donor?.occupation || '',
    rating: donor?.rating || '',
    referral_source: donor?.referral_source || '',
    birth_date: donor?.birth_date || '',
    assigned_user_id: donor?.assigned_user_id || '',
    staff_user_id: donor?.staff_user_id || '',
    country: donor?.country || 'Türkiye',
    city: donor?.city || '',
    district: donor?.district || '',
    neighbourhood: donor?.neighbourhood || '',
    address: donor?.address || '',
    tax_number: donor?.tax_number || '',
    tags: (donor?.tags || []).join(', '),
    sms_opt_out: donor?.sms_opt_out ?? false,
    email_opt_out: donor?.email_opt_out ?? false,
  }), [donor])
  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [initial])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const name = splitName(form.full_name)
    if (!name.first_name) { setError('Ad Soyad yazın'); return }
    const body: Record<string, unknown> = {
      donor_type: form.donor_type,
      ...name,
      last_name: name.last_name || null,
      company_name: form.donor_type === 'corporate' ? form.company_name || null : null,
      membership_type: form.membership_type || null,
      phone_code: form.phone_code,
      phone: withCode(form.phone, form.phone_code),
      sms_opt_out: form.sms_opt_out,
      email_opt_out: form.email_opt_out,
    }
    if (!compact) {
      Object.assign(body, {
        phone2_code: form.phone2_code,
        phone2: withCode(form.phone2, form.phone2_code),
        tc_no: form.tc_no || null,
        email: form.email || null,
        blood_group: form.blood_group || null,
        gender: form.gender || null,
        occupation: form.occupation || null,
        rating: form.rating || null,
        referral_source: form.referral_source || null,
        birth_date: form.birth_date || null,
        staff_user_id: form.staff_user_id || null,
        country: form.country || null,
        city: form.city || null,
        district: form.district || null,
        neighbourhood: form.neighbourhood || null,
        address: form.address || null,
        tax_number: form.tax_number || null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      if (donor) Object.assign(body, form.assigned_user_id ? { assigned_user_id: form.assigned_user_id } : { clear_assignment: true })
      else if (form.assigned_user_id) body.assigned_user_id = form.assigned_user_id
    }
    setBusy(true)
    try {
      const res = donor
        ? await adminSend<DonorRow>('put', `/donors/${donor.id}`, body)
        : await adminSend<DonorRow>('post', '/donors', body)
      onSaved(res.data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }

  const suggestions = (key: keyof DonorOptions) => (
    <datalist id={`donor-${key}`}>{(options?.[key] || []).map((v) => <option key={v} value={v} />)}</datalist>
  )
  const free = (key: 'membership_type' | 'occupation' | 'rating' | 'referral_source', label: string, required = false) => (
    <Label label={required ? `${label} *` : label}>
      <input className={inputClass} list={`donor-${key}`} placeholder="Seçiniz veya yazın" value={form[key]}
        onChange={(e) => set(key, e.target.value)} />
      {suggestions(key)}
    </Label>
  )
  const staffSelect = (key: 'assigned_user_id' | 'staff_user_id', label: string) => (
    <Label label={label}>
      <select className={inputClass} value={form[key]} onChange={(e) => set(key, e.target.value)}>
        <option value="">{key === 'staff_user_id' && !donor ? 'Ben (kaydı oluşturan)' : 'Seçiniz'}</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
      </select>
    </Label>
  )

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <div className="flex gap-2 md:col-span-2">
          {([['individual', 'Bireysel', User], ['corporate', 'Kurumsal', Building2]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" onClick={() => set('donor_type', value)} aria-pressed={form.donor_type === value}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${
                form.donor_type === value ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        {form.donor_type === 'corporate' && (
          <Label label="Kurum Adı *">
            <input className={inputClass} required value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          </Label>
        )}
        <Label label={form.donor_type === 'corporate' ? 'Yetkili Ad Soyad *' : 'Ad Soyad *'}>
          <input className={inputClass} required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus={!donor} />
        </Label>
        {free('membership_type', 'Üyelik Tipi')}
        <PhoneField label="Cep Telefon" required={compact} code={form.phone_code} value={form.phone}
          onCode={(v) => set('phone_code', v)} onValue={(v) => set('phone', v)} />
        {!compact && (
          <>
            <PhoneField label="Telefon" code={form.phone2_code} value={form.phone2}
              onCode={(v) => set('phone2_code', v)} onValue={(v) => set('phone2', v)} />
            <Label label="T.C. Kimlik" hint={donor?.tc_no_masked ? `Kayıtlı: ${donor.tc_no_masked}` : undefined}>
              <input className={inputClass} inputMode="numeric" maxLength={11} value={form.tc_no}
                onChange={(e) => set('tc_no', e.target.value.replace(/\D/g, ''))} />
            </Label>
            <Label label="E-Posta">
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Label>
            <Label label="Kan Grubu">
              <select className={inputClass} value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)}>
                <option value="">Seçiniz</option>
                {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Label>
            <Label label="Cinsiyet">
              <select className={inputClass} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Seçiniz</option><option value="erkek">Erkek</option><option value="kadin">Kadın</option>
              </select>
            </Label>
            {free('occupation', 'Meslek')}
            {free('rating', 'Değerlendirme')}
            {free('referral_source', 'Referans')}
            <Label label="Doğum Tarihi">
              <input type="date" className={inputClass} value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
            </Label>
            {staffSelect('assigned_user_id', 'Temsilci')}
            {staffSelect('staff_user_id', 'Personel')}
            <Label label="Ülke">
              <input className={inputClass} value={form.country} onChange={(e) => set('country', e.target.value)} />
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Label label="İl"><input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} /></Label>
              <Label label="İlçe"><input className={inputClass} value={form.district} onChange={(e) => set('district', e.target.value)} /></Label>
            </div>
            <Label label="Mahalle">
              <input className={inputClass} value={form.neighbourhood} onChange={(e) => set('neighbourhood', e.target.value)} />
            </Label>
            <Label label="Adres">
              <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Label>
            {form.donor_type === 'corporate' && (
              <Label label="Vergi No">
                <input className={inputClass} value={form.tax_number} onChange={(e) => set('tax_number', e.target.value)} />
              </Label>
            )}
            <Label label="Etiketler (virgülle)">
              <input className={inputClass} placeholder="vip, kurban" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            </Label>
          </>
        )}
        <div className="flex flex-wrap items-center gap-5 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={form.sms_opt_out} onChange={(e) => set('sms_opt_out', e.target.checked)} /> SMS gönderilmesin
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={form.email_opt_out} onChange={(e) => set('email_opt_out', e.target.checked)} /> E-posta gönderilmesin
          </label>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-5 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
        {dirty && <span className="text-[13px] font-medium text-amber-600">Kaydedilmemiş değişiklik var</span>}
        {error && <span className="text-[13px] font-semibold text-rose-600">{error}</span>}
        <div className="ms-auto flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              İptal
            </button>
          )}
          <button type="submit" disabled={busy || (!!donor && !dirty)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            <Check className="h-4 w-4" />{donor ? 'Kaydet' : 'Oluştur'}
          </button>
        </div>
      </div>
    </form>
  )
}
