'use client'

/** "Bağış Ayarları" of the campaign form: how the donor may donate, with a live preview of the site's choice box. */
import { ArrowDown, ArrowUp, Boxes, CalendarRange, Hash, Lock, PencilLine, PieChart, Plus, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { DonationChoiceFields, useDonationChoice } from '../../donation-choice'
import { DONATION_MODES, PRICED_MODES, type DonationMode, type DonationOptions, type DurationPayment } from '../../../lib/donation-options'
import { Label, inputClass } from '../FormKit'

export interface CheckoutField { key: string; label: string; type: 'text' | 'number' | 'list' | 'select'; required?: boolean; options?: string[]; [extra: string]: unknown }

export interface DonationForm {
  /** '' = campaign from before donation options; nothing is restricted. */
  mode: DonationMode | ''
  min_qty: string
  max_qty: string
  unit_label: string
  durations: string
  duration_payment: DurationPayment
  packages: Array<{ id: string; label: string; amount: string }>
  intents: string
  allow_recurring: boolean
  allow_on_behalf: boolean
  allow_note: boolean
}

const ICONS: Record<DonationMode, LucideIcon> = { free: PencilLine, fixed: Lock, quantity: Hash, share: PieChart, duration: CalendarRange, packages: Boxes }
const newId = () => Math.random().toString(36).slice(2, 10)
const toCents = (text: string) => {
  const n = Number(String(text).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}
const csv = (text: string) => text.split(',').map((v) => v.trim()).filter(Boolean)

export function donationFormFrom(o?: Partial<DonationOptions> | null): DonationForm {
  return {
    mode: o?.mode || '',
    min_qty: o?.min_qty ? String(o.min_qty) : '', max_qty: o?.max_qty ? String(o.max_qty) : '', unit_label: o?.unit_label || '',
    durations: (o?.durations?.length ? o.durations : [1, 6, 12]).join(', '), duration_payment: o?.duration_payment || 'prepaid',
    packages: (o?.packages || []).map((p) => ({ id: p.id, label: p.label, amount: String(p.amount_cents / 100).replace('.', ',') })),
    intents: (o?.intents || []).join(', '),
    allow_recurring: o?.allow_recurring ?? false, allow_on_behalf: o?.allow_on_behalf ?? false, allow_note: o?.allow_note ?? false,
  }
}

export function donationOptionsFrom(f: DonationForm): Partial<DonationOptions> {
  if (!f.mode) return {}
  const out: DonationOptions = { mode: f.mode, intents: csv(f.intents), allow_on_behalf: f.allow_on_behalf, allow_note: f.allow_note }
  if (f.mode === 'quantity' || f.mode === 'share') {
    out.min_qty = Number(f.min_qty) || 1
    out.max_qty = Number(f.max_qty) || 100
    if (f.unit_label.trim()) out.unit_label = f.unit_label.trim()
  }
  if (f.mode === 'duration') {
    out.durations = [...new Set(csv(f.durations).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
    out.duration_payment = f.duration_payment
  } else out.allow_recurring = f.allow_recurring
  if (f.mode === 'packages') out.packages = f.packages.filter((p) => p.label.trim() || p.amount.trim()).map((p) => ({ id: p.id, label: p.label.trim(), amount_cents: toCents(p.amount) }))
  return out
}

export function donationFormError(f: DonationForm, tryCents: number): string {
  if (!f.mode) return ''
  if (PRICED_MODES.includes(f.mode) && !tryCents) return f.mode === 'duration' ? 'Süreli bağış için aylık TL tutarını girin' : 'Bu bağış şekli için TL tutarını girin'
  const o = donationOptionsFrom(f)
  if (f.mode === 'duration') {
    if (!o.durations?.length) return 'En az bir süre seçeneği girin (ör. 1, 6, 12)'
    if (o.durations.some((m) => m > 120)) return 'Süre en fazla 120 ay olabilir'
    if (o.durations.length > 12) return 'En fazla 12 süre seçeneği girilebilir'
  }
  if (f.mode === 'packages') {
    if (!o.packages?.length) return 'En az bir paket ekleyin'
    if (o.packages.some((p) => !p.label || !p.amount_cents)) return 'Her paketin adını ve tutarını girin'
  }
  if ((o.max_qty || 1) > 100 || (o.min_qty || 1) > (o.max_qty || 100)) return 'Adet sınırları 1 ile 100 arasında olmalı'
  return ''
}

const CURRENT = (n: number) => n

export function DonationSettings({ form, onChange, refs, suggestedCents, minCents }: {
  form: DonationForm
  onChange: (f: DonationForm) => void
  refs: Record<string, number>
  suggestedCents: number[]
  minCents: number
}) {
  const set = (patch: Partial<DonationForm>) => onChange({ ...form, ...patch })
  const preview = { donation_options: donationOptionsFrom(form), reference_amounts: refs, suggested_amounts_cents: suggestedCents, min_donation_cents: minCents, currency: 'TRY' }
  const state = useDonationChoice(preview, 'TRY', CURRENT)
  const monthly = (refs.TRY || 0) / 100
  const toggle = (k: 'allow_recurring' | 'allow_on_behalf' | 'allow_note', label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] text-gray-700">
      <input type="checkbox" className="mt-0.5" checked={form[k]} onChange={(e) => set({ [k]: e.target.checked })} />
      <span><span className="font-medium">{label}</span><span className="block text-[12px] text-gray-500">{hint}</span></span>
    </label>
  )
  const movePackage = (i: number, by: number) => {
    const next = [...form.packages]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    set({ packages: next })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Bağış şekli">
          {DONATION_MODES.map(([k, label, hint]) => {
            const Icon = ICONS[k]
            const on = form.mode === k
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set({ mode: k })}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-start transition ${on ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-primary-700' : 'text-gray-400'}`} />
                <span><span className="block text-[13.5px] font-bold text-gray-900">{label}</span><span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{hint}</span></span>
              </button>
            )
          })}
        </div>
        {!form.mode && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            Bağış şekli seçilmemiş: kampanya eski ayarlarla çalışır, site editöründeki Bağış kartı ayarları geçerlidir.
          </p>
        )}

        {(form.mode === 'quantity' || form.mode === 'share') && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Label label="Birim adı"><input className={inputClass} maxLength={20} placeholder={form.mode === 'share' ? 'Hisse' : 'Adet'} value={form.unit_label} onChange={(e) => set({ unit_label: e.target.value })} /></Label>
            <Label label="En az"><input className={inputClass} inputMode="numeric" placeholder="1" value={form.min_qty} onChange={(e) => set({ min_qty: e.target.value.replace(/\D/g, '') })} /></Label>
            <Label label="En çok"><input className={inputClass} inputMode="numeric" placeholder="100" value={form.max_qty} onChange={(e) => set({ max_qty: e.target.value.replace(/\D/g, '') })} /></Label>
          </div>
        )}

        {form.mode === 'duration' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Label label="Süre seçenekleri (ay)" hint="Virgülle ayırın, ör. 1, 6, 12.">
              <input className={inputClass} placeholder="1, 6, 12" value={form.durations} onChange={(e) => set({ durations: e.target.value.replace(/[^\d,\s]/g, '') })} />
            </Label>
            <Label label="Ödeme şekli">
              <select className={inputClass} value={form.duration_payment} onChange={(e) => set({ duration_payment: e.target.value as DurationPayment })}>
                <option value="prepaid">Peşin: toplam tutar tek seferde</option>
                <option value="monthly">Aylık: süre boyunca her ay</option>
                <option value="donor_choice">Bağışçı seçsin</option>
              </select>
            </Label>
            <p className="text-[12.5px] text-gray-600 sm:col-span-2">
              {monthly ? (donationOptionsFrom(form).durations || []).map((m) => `${monthly.toLocaleString('tr-TR')} ₺ × ${m} = ${(monthly * m).toLocaleString('tr-TR')} ₺`).join(' · ') : 'Yukarıdaki Tutar (TL) alanına aylık tutarı yazın.'}
              {form.duration_payment !== 'prepaid' && ' Aylık ödemede ilk ay hemen alınır; kalan aylar kayıtlı karttan çekilir ya da SMS ile ödeme bağlantısı gider, süre dolunca kendiliğinden biter.'}
            </p>
          </div>
        )}

        {form.mode === 'packages' && (
          <div className="space-y-2">
            {form.packages.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <input aria-label="Paket adı" className={inputClass} maxLength={80} placeholder="Paket adı (ör. 1 ailelik koli)" value={p.label}
                  onChange={(e) => set({ packages: form.packages.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input aria-label="Paket tutarı (TL)" className={`${inputClass} !w-32`} inputMode="decimal" placeholder="Tutar ₺" value={p.amount}
                  onChange={(e) => set({ packages: form.packages.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
                <button type="button" aria-label="Yukarı" disabled={!i} onClick={() => movePackage(i, -1)} className="p-1 text-gray-500 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Aşağı" disabled={i === form.packages.length - 1} onClick={() => movePackage(i, 1)} className="p-1 text-gray-500 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label="Paketi sil" onClick={() => set({ packages: form.packages.filter((_, j) => j !== i) })} className="p-1 text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {form.packages.length < 20 && (
              <button type="button" onClick={() => set({ packages: [...form.packages, { id: newId(), label: '', amount: '' }] })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold hover:bg-gray-50"><Plus className="h-4 w-4" /> Paket ekle</button>
            )}
          </div>
        )}

        {form.mode && (
          <>
            <Label label="Niyet seçenekleri" hint="İsteğe bağlı, virgülle ayırın. Yazılırsa bağışçı birini seçmek zorundadır.">
              <input className={inputClass} placeholder="Adak, Akika, Şükür" value={form.intents} onChange={(e) => set({ intents: e.target.value })} />
            </Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {form.mode !== 'duration' && toggle('allow_recurring', 'Düzenli bağış', 'Bağışçı “her ay” seçebilir.')}
              {toggle('allow_on_behalf', 'Başkası adına', 'Adına bağış yapılan kişi sorulur.')}
              {toggle('allow_note', 'Bağışçı notu', 'Kısa not alanı gösterilir.')}
            </div>
          </>
        )}
      </div>
      {form.mode && (
        <div>
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-gray-500">Bağışçının göreceği</div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <DonationChoiceFields state={state} campaign={preview} currency="TRY" convert={CURRENT} />
          </div>
        </div>
      )}
    </div>
  )
}

const slugKey = (label: string) => label.toLocaleLowerCase('tr-TR').replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u').replace(/[ş]/g, 's').replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

/** Extra questions asked while donating (campaign.checkout_fields_schema). */
export function CheckoutFieldsEditor({ fields, onChange }: { fields: CheckoutField[]; onChange: (f: CheckoutField[]) => void }) {
  // Existing keys never change: kurban and other modules read answers by key.
  const [optionText, setOptionText] = useState<Record<number, string>>({})
  const patch = (i: number, p: Partial<CheckoutField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)))
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2.5">
          <input aria-label="Alan adı" className={`${inputClass} min-w-[160px] flex-1`} maxLength={80} placeholder="Alan adı" value={f.label} onChange={(e) => patch(i, { label: e.target.value })} />
          <select aria-label="Alan türü" className={`${inputClass} !w-36`} value={f.type} onChange={(e) => patch(i, { type: e.target.value as CheckoutField['type'] })}>
            <option value="text">Metin</option><option value="number">Sayı</option><option value="select">Seçenek</option><option value="list">İsim listesi</option>
          </select>
          {f.type === 'select' && (
            <input aria-label="Seçenekler" className={`${inputClass} min-w-[160px] flex-1`} placeholder="Seçenekler, virgülle" value={optionText[i] ?? (f.options || []).join(', ')}
              onChange={(e) => { setOptionText({ ...optionText, [i]: e.target.value }); patch(i, { options: csv(e.target.value) }) }} />
          )}
          <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => patch(i, { required: e.target.checked })} /> Zorunlu</label>
          <button type="button" aria-label="Alanı sil" onClick={() => { setOptionText({}); onChange(fields.filter((_, j) => j !== i)) }} className="p-1 text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...fields, { key: '', label: '', type: 'text', required: false }])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold hover:bg-gray-50"><Plus className="h-4 w-4" /> Alan ekle</button>
    </div>
  )
}

/** Drops empty rows and gives new fields a key of their own. */
export function cleanCheckoutFields(fields: CheckoutField[]): CheckoutField[] {
  const used = new Set(fields.map((f) => f.key).filter(Boolean))
  return fields.filter((f) => f.label.trim()).map((f) => {
    let key = f.key
    if (!key) {
      const base = slugKey(f.label) || 'alan'
      key = base
      for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`
      used.add(key)
    }
    return { ...f, key, label: f.label.trim() }
  })
}
