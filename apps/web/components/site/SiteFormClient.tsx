'use client'

import { useState } from 'react'
import axios from 'axios'

export interface SiteFormField {
  key: string; label: string; type: 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox'
  required: boolean; placeholder?: string | null; options: string[]
}

/** A form built in Web Sitesi → Form, filled in on the site. */
export function SiteFormClient({ slug, fields, submitLabel }: { slug: string; fields: SiteFormField[]; submitLabel: string }) {
  const [data, setData] = useState<Record<string, string | boolean>>({})
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const set = (k: string, v: string | boolean) => setData((d) => ({ ...d, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await axios.post(`/api/v1/public/forms/${encodeURIComponent(slug)}`, { data, website })
      setDone(r.data.message || 'Teşekkürler, bilgileriniz alındı.')
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Gönderilemedi, lütfen tekrar deneyin.')
    } finally {
      setBusy(false)
    }
  }
  if (done) return <p className="rounded-xl bg-primary-50 p-5 text-[15px] font-semibold text-primary-800">{done}</p>
  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px] outline-none focus:border-primary-600'
  return (
    <form onSubmit={submit} className="grid gap-4">
      {fields.map((f) => {
        const id = `ff-${f.key}`
        const label = <span className="mb-1 block text-sm font-semibold text-gray-800">{f.label}{f.required ? ' *' : ''}</span>
        if (f.type === 'checkbox') {
          return (
            <label key={f.key} className="flex items-start gap-2.5 text-[15px] text-gray-800">
              <input id={id} type="checkbox" className="mt-1" required={f.required} checked={!!data[f.key]} onChange={(e) => set(f.key, e.target.checked)} />{f.label}
            </label>
          )
        }
        if (f.type === 'radio') {
          return (
            <fieldset key={f.key}>
              <legend className="mb-1 text-sm font-semibold text-gray-800">{f.label}{f.required ? ' *' : ''}</legend>
              <div className="flex flex-wrap gap-4">
                {f.options.map((o) => (
                  <label key={o} className="flex items-center gap-2 text-[15px]"><input type="radio" name={id} required={f.required} checked={data[f.key] === o} onChange={() => set(f.key, o)} />{o}</label>
                ))}
              </div>
            </fieldset>
          )
        }
        return (
          <label key={f.key} htmlFor={id} className="block">
            {label}
            {f.type === 'textarea' ? (
              <textarea id={id} className={`${input} min-h-[120px]`} required={f.required} placeholder={f.placeholder || ''} value={String(data[f.key] || '')} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.type === 'select' ? (
              <select id={id} className={input} required={f.required} value={String(data[f.key] || '')} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Seçin</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input id={id} className={input} required={f.required} placeholder={f.placeholder || ''}
                type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={String(data[f.key] || '')} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        )
      })}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
      <button type="submit" disabled={busy} className="justify-self-start rounded-xl bg-primary-600 px-6 py-3 font-bold text-white hover:bg-primary-700 disabled:opacity-50">{busy ? 'Gönderiliyor…' : submitLabel}</button>
    </form>
  )
}
