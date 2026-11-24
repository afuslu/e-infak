'use client'

import type { FieldSpec } from '../../lib/blocks'
import { iconOf } from './icons'
import type { AppAction } from './types'

export interface AppFieldData {
  actions: Record<string, string>
  screens: Record<string, string>
  icons: Record<string, string>
  pages: { id: string; title: string }[]
  campaigns: { slug: string; title: string }[]
  news: { slug: string; title: string }[]
}

const input = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-blue-500'
const PLACEHOLDER: Record<string, string> = { url: 'https://…', tel: '+90 5xx xxx xx xx', whatsapp: '905xxxxxxxxx', email: 'ad@kurum.org' }

export function ActionField({ spec, value, onChange, app }: {
  spec: FieldSpec; value?: AppAction; onChange: (v: AppAction | undefined) => void; app: AppFieldData
}) {
  const types = Object.entries(app.actions).filter(([k]) => !spec.types || spec.types.includes(k))
  const type = value?.type || ''
  const options: Record<string, [string, string][]> = {
    screen: Object.entries(app.screens),
    page: app.pages.map((p) => [p.id, p.title]),
    campaign: app.campaigns.map((c) => [c.slug, c.title]),
    news: app.news.map((n) => [n.slug, n.title]),
  }
  const list = options[type]
  const missing = !!value?.target && !!list && !list.some(([k]) => k === value.target)
  return (
    <div className="space-y-1">
      <div className="text-[12px] font-semibold text-gray-600">{spec.label}{spec.required ? ' *' : ''}</div>
      <select className={input} value={type} aria-label={`${spec.label} türü`}
        onChange={(e) => onChange(e.target.value ? { type: e.target.value, target: options[e.target.value]?.[0]?.[0] || '' } : undefined)}>
        {!spec.required && <option value="">Hiçbir şey</option>}
        {spec.required && !type && <option value="">Seçin…</option>}
        {types.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      {type && (list ? (
        <select className={input} value={value?.target || ''} aria-label={spec.label} onChange={(e) => onChange({ type, target: e.target.value })}>
          {list.length === 0 && <option value="">Kayıt yok</option>}
          {missing && <option value={value!.target}>Artık bulunamıyor</option>}
          {list.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      ) : (
        <input className={input} value={value?.target || ''} placeholder={PLACEHOLDER[type]} aria-label={spec.label}
          onChange={(e) => onChange({ type, target: e.target.value })} />
      ))}
      {missing && <p className="text-[11px] font-semibold text-red-600">Bu hedef artık yok; başka bir hedef seçin.</p>}
    </div>
  )
}

export function IconField({ spec, value, onChange, app }: { spec: FieldSpec; value?: string; onChange: (v: string) => void; app: AppFieldData }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold text-gray-600">{spec.label}{spec.required ? ' *' : ''}</div>
      <div className="grid max-h-32 grid-cols-8 gap-1 overflow-y-auto rounded-md border bg-white p-1.5">
        {Object.entries(app.icons).map(([key, label]) => {
          const Icon = iconOf(key)
          return (
            <button key={key} type="button" title={label} aria-label={label} aria-pressed={value === key} onClick={() => onChange(key)}
              className={`flex h-7 items-center justify-center rounded ${value === key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
