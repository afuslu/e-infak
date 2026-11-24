'use client'

import { useEffect, useState } from 'react'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { ImageField } from '../admin/ImageField'

type Data = Record<string, string>
interface StoreState { data: Data; status: string; note: string | null; editable: boolean; submitted_at: string | null }

const STATUS: Record<string, string> = {
  draft: 'Henüz gönderilmedi', submitted: 'Gönderildi, inceleme bekliyor', in_review: 'İnceleniyor', built: 'Uygulama derlendi',
  in_store: 'Mağazada', changes_requested: 'Düzeltme istendi',
}
const ACCOUNT = { none: 'Yok', applied: 'Başvuruldu', ready: 'Hazır' }
const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 disabled:bg-gray-50'

/** Application for the organisation's own store app. No passwords or keys are ever collected here. */
export function StorePanel() {
  const [state, setState] = useState<StoreState | null>(null)
  const [data, setData] = useState<Data>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    adminGet<StoreState>('/app-builder/store').then((r) => { setState(r.data); setData(r.data.data) })
      .catch((e) => setMessage({ ok: false, text: apiErrorMessage(e) }))
  }, [])
  if (!state) return <p className="p-8 text-sm text-gray-500">{message?.text || 'Yükleniyor…'}</p>
  const locked = !state.editable
  const send = async (submit: boolean) => {
    setBusy(true); setMessage(null)
    try {
      const r = submit ? await adminSend<StoreState>('post', '/app-builder/store/submit', data) : await adminSend<StoreState>('put', '/app-builder/store', data)
      setState(r.data); setData(r.data.data)
      setMessage({ ok: true, text: submit ? 'Başvurunuz gönderildi.' : 'Kaydedildi.' })
    } catch (e) { setMessage({ ok: false, text: apiErrorMessage(e) }) } finally { setBusy(false) }
  }
  const set = (key: string) => (v: string) => setData((d) => ({ ...d, [key]: v }))
  const text = (key: string, label: string, max: number, props: { area?: boolean; hint?: string; type?: string } = {}) => (
    <label className="block text-xs font-bold text-gray-600">{label}
      {props.area ? <textarea rows={5} className={input} disabled={locked} maxLength={max} value={data[key] || ''} onChange={(e) => set(key)(e.target.value)} />
        : <input type={props.type || 'text'} className={props.type === 'color' ? 'mt-1 block h-10 w-20 rounded-lg border border-gray-300 bg-white p-1' : input} disabled={locked} maxLength={max} value={data[key] || ''} onChange={(e) => set(key)(e.target.value)} />}
      {props.hint && <span className="mt-1 block font-normal text-gray-400">{props.hint}</span>}
    </label>
  )
  const account = (key: string, label: string) => (
    <label className="block text-xs font-bold text-gray-600">{label}
      <select className={input} disabled={locked} value={data[key]} onChange={(e) => set(key)(e.target.value)}>{Object.entries(ACCOUNT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </label>
  )
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <div>
        <h2 className="text-lg font-extrabold text-gray-900">Mağazaya gönder</h2>
        <p className="mt-1 text-sm text-gray-500">Kurumunuzun kendi adıyla Play Store ve App Store uygulaması için bilgileri gönderin. Tasarım değişiklikleri için yeniden başvurmanız gerekmez.</p>
        <p className="mt-2 text-sm font-bold text-blue-700">Durum: {STATUS[state.status] || state.status}</p>
        {state.note && <p className="mt-2 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{state.note}</p>}
      </div>
      <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
        {text('app_name', 'Uygulama adı (en fazla 30)', 30)}
        {text('package_id', 'Paket kimliği', 80, { hint: 'Ör. org.kurum.mobil. Mağazada yayınlandıktan sonra değişmez.' })}
        <div className="sm:col-span-2">{text('short_description', 'Kısa açıklama (en fazla 80)', 80)}</div>
        <div className="sm:col-span-2">{text('full_description', 'Uzun açıklama', 4000, { area: true })}</div>
        <ImageField label="İkon (1024×1024, saydam olmayan PNG)" value={data.icon_url} onChange={set('icon_url')} preview="square" />
        <ImageField label="Açılış görseli (PNG)" value={data.splash_url} onChange={set('splash_url')} />
        {text('splash_color', 'Açılış zemin rengi', 7, { type: 'color' })}
        {text('privacy_url', 'Gizlilik politikası adresi', 300, { hint: 'https:// ile başlamalı' })}
        {text('support_email', 'Destek e-postası', 200)}
        {text('contact_name', 'Yetkili adı', 120)}
        {text('contact_phone', 'Yetkili telefonu', 30)}
        <span />
        {account('google_account', 'Google Play geliştirici hesabınız')}
        {account('apple_account', 'Apple geliştirici hesabınız')}
      </fieldset>
      <p className="text-xs text-gray-500">Apple, kurumun kendi geliştirici hesabından gönderilmeyen uygulamaları reddedebilir. Şifre veya anahtar paylaşmayın.</p>
      {message && <p className={`rounded-lg p-3 text-sm font-semibold ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
      {!locked && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => send(false)} className="rounded-lg border px-4 py-2 text-sm font-bold">Kaydet</button>
          <button type="button" disabled={busy} onClick={() => send(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Başvuruyu gönder</button>
        </div>
      )}
    </div>
    </div>
  )
}
