'use client'

import { Label, ghostButton, inputClass } from '../FormKit'

export interface Template {
  id?: string
  name: string
  language: string
  status?: string
  category: string
  body: string
  param_count: number
  header_text?: string | null
  footer?: string | null
  buttons?: { type: string; text: string; url?: string | null; phone_number?: string | null }[]
  rejected_reason?: string | null
  quality?: string | null
}

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'

export interface Message {
  id: string
  phone: string
  donor_name: string | null
  kind: string
  template_name: string | null
  body: string | null
  status: MessageStatus
  error: string | null
  created_at: string | null
  batch_id: string | null
  direction: 'in' | 'out'
  source: string
  media: { id?: string; mime_type?: string; filename?: string; latitude?: number; longitude?: number; voice?: boolean } | null
  interactive: { type?: string; body?: string; id?: string; title?: string; buttons?: { id: string; title: string }[]; display_text?: string; url?: string; response?: string } | null
  fallback_sms: boolean
  read_at: string | null
  delivered_at: string | null
}

export const STATUS: Record<MessageStatus, [string, string]> = {
  queued: ['Kuyrukta', 'bg-gray-100 text-gray-700'],
  sent: ['Gönderildi', 'bg-sky-100 text-sky-800'],
  delivered: ['İletildi', 'bg-emerald-100 text-emerald-800'],
  read: ['Okundu', 'bg-emerald-600 text-white'],
  failed: ['Başarısız', 'bg-red-100 text-red-700'],
  received: ['Gelen', 'bg-violet-100 text-violet-800'],
}

export const TEMPLATE_STATUS: Record<string, [string, string]> = {
  APPROVED: ['Onaylı', 'bg-emerald-100 text-emerald-800'],
  PENDING: ['Onay bekliyor', 'bg-amber-100 text-amber-800'],
  REJECTED: ['Reddedildi', 'bg-red-100 text-red-700'],
  PAUSED: ['Duraklatıldı', 'bg-orange-100 text-orange-800'],
  DISABLED: ['Devre dışı', 'bg-gray-200 text-gray-700'],
  IN_APPEAL: ['İtirazda', 'bg-sky-100 text-sky-800'],
}

export const VARIABLE_HINT = '{ad}, {ad_soyad}, {tutar}, {bagis_kalemi}, {makbuz_no}, {kurum}, {portal}, {video}, {odeme_linki}, {iban} gibi değişkenler kullanılabilir.'

export const when = (iso: string | null | undefined) =>
  (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export const clock = (iso: string | null | undefined) =>
  (iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '')

export function TemplateFields({ templates, name, setName, params, setParams }: {
  templates: Template[]; name: string; setName: (v: string) => void; params: string[]; setParams: (v: string[]) => void
}) {
  const current = templates.find((t) => t.name === name)
  return (
    <div className="space-y-3">
      <Label label="Onaylı şablon" hint={templates.length ? undefined : 'Şablonlar Meta’da onaylanır; listelemek için WABA ID gerekir. Adını elle de yazabilirsiniz.'}>
        {templates.length ? (
          <select className={inputClass} value={name} onChange={(e) => {
            setName(e.target.value)
            const t = templates.find((x) => x.name === e.target.value)
            setParams(Array.from({ length: t?.param_count || 0 }, (_, i) => params[i] || ''))
          }}>
            <option value="">Şablon seçin</option>
            {templates.map((t) => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language}, {t.category})</option>)}
          </select>
        ) : (
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. kurban_kesildi" />
        )}
      </Label>
      {current?.body && <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{current.body}</p>}
      {params.map((p, i) => (
        <Label key={i} label={`Değişken {{${i + 1}}}`} hint={i === 0 ? VARIABLE_HINT : undefined}>
          <input className={inputClass} value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
        </Label>
      ))}
      <button type="button" className={ghostButton} onClick={() => setParams([...params, ''])}>+ Değişken ekle</button>
    </div>
  )
}

/** A small on/off switch with a label, used on the settings tabs. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  )
}
