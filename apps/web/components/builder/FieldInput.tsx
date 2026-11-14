'use client'

import { useRef, useState } from 'react'
import type { Campaign } from '@e-infak/api-client'
import type { FieldSpec } from '../../lib/blocks'
import { ImageField } from '../admin/ImageField'

/** A stored ISO time (UTC) as the browser's local "YYYY-MM-DDTHH:mm", which is what datetime-local shows and edits. */
function localDateTime(value: unknown): string {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const input = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-blue-500'

export interface FieldContext {
  campaigns: Campaign[]
  /** Text shown under translatable fields while editing another language. */
  baseValue?: unknown
  /** Base-language items for a translatable list field. */
  baseList?: any[]
}

function Label({ spec, children, inline }: { spec: FieldSpec; children: React.ReactNode; inline?: boolean }) {
  return (
    <label className={`block text-[12px] font-semibold text-gray-600 ${inline ? 'flex items-center justify-between gap-2' : ''}`}>
      <span className={inline ? '' : 'mb-1 block'}>{spec.label}{spec.required ? ' *' : ''}{spec.unit ? <span className="font-normal text-gray-400"> ({spec.unit})</span> : null}</span>
      {children}
      {spec.help && <span className="mt-1 block text-[11px] font-normal text-gray-400">{spec.help}</span>}
    </label>
  )
}

function ListField({ spec, value, onChange, ctx }: { spec: FieldSpec; value: any[]; onChange: (v: any[]) => void; ctx: FieldContext }) {
  const [open, setOpen] = useState<number | null>(0)
  const items = Array.isArray(value) ? value : []
  const defaults = () => Object.fromEntries(Object.entries(spec.fields || {}).filter(([, f]) => f.default !== undefined).map(([k, f]) => [k, f.default]))
  const set = (i: number, item: any) => onChange(items.map((x, j) => (j === i ? item : x)))
  const move = (i: number, d: number) => {
    const to = i + d
    if (to < 0 || to >= items.length) return
    const next = [...items]
    ;[next[i], next[to]] = [next[to], next[i]]
    onChange(next)
    setOpen(to)
  }
  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i))
    if (open === i) setOpen(items.length > 1 ? Math.max(0, i - 1) : null)
    else if (open !== null && open > i) setOpen(open - 1)
  }
  const copyFromBase = () => {
    if (!Array.isArray(ctx.baseList) || !ctx.baseList.length) return
    const keys = Object.keys(spec.fields || {})
    const seeded = ctx.baseList.map((src) => {
      const obj: Record<string, any> = {}
      for (const k of keys) if (src?.[k] !== undefined) obj[k] = src[k]
      return obj
    })
    onChange(seeded)
    setOpen(0)
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-gray-600">{spec.label}</div>
        {items.length === 0 && Array.isArray(ctx.baseList) && ctx.baseList.length > 0 && (
          <button type="button" onClick={copyFromBase} className="text-[11px] font-semibold text-blue-600 hover:underline">
            Ana dilden kopyala ({ctx.baseList.length})
          </button>
        )}
      </div>
      {spec.help && <p className="text-[11px] text-gray-400">{spec.help}</p>}
      {items.map((item, i) => (
        <div key={i} className="rounded-md border bg-gray-50">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button type="button" className="flex-1 truncate text-start text-[12px] font-semibold" onClick={() => setOpen(open === i ? null : i)}>
              {open === i ? '▾' : '▸'} {(spec.item_label && item?.[spec.item_label]) || `${i + 1}. öğe`}
            </button>
            <button type="button" title="Yukarı" className="px-1 text-gray-500 hover:text-gray-900" onClick={() => move(i, -1)}>↑</button>
            <button type="button" title="Aşağı" className="px-1 text-gray-500 hover:text-gray-900" onClick={() => move(i, 1)}>↓</button>
            <button type="button" title="Kopyala" className="px-1 text-gray-500 hover:text-gray-900" onClick={() => onChange([...items.slice(0, i + 1), { ...item }, ...items.slice(i + 1)])}>⧉</button>
            <button type="button" title="Sil" className="px-1 text-red-500 hover:text-red-700 disabled:opacity-30"
              disabled={items.length <= (spec.min_items || 0)} onClick={() => remove(i)}>✕</button>
          </div>
          {open === i && (
            <div className="space-y-2.5 border-t bg-white p-2.5">
              <Fields specs={spec.fields || {}} values={item || {}} onChange={(v) => set(i, v)} ctx={ctx} />
            </div>
          )}
        </div>
      ))}
      {items.length < (spec.max_items || 20) && (
        <button type="button" className="w-full rounded-md border border-dashed py-1.5 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
          onClick={() => { onChange([...items, defaults()]); setOpen(items.length) }}>
          + Ekle
        </button>
      )}
    </div>
  )
}

function RichTextField({ spec, value, base, onChange }: { spec: FieldSpec; value: any; base?: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const val = String(value ?? '')
  const wrap = (openTag: string, closeTag: string, fallback = 'metin') => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? val.length
    const end = el.selectionEnd ?? val.length
    const selected = val.slice(start, end) || fallback
    const next = `${val.slice(0, start)}${openTag}${selected}${closeTag}${val.slice(end)}`
    onChange(spec.max ? next.slice(0, spec.max) : next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + openTag.length, start + openTag.length + selected.length)
    })
  }
  const addLink = () => {
    const url = window.prompt('Bağlantı adresi (https://… veya /sayfa):', 'https://')
    if (!url?.trim()) return
    wrap(`<a href="${url.trim()}">`, '</a>', 'Bağlantı')
  }
  return (
    <Label spec={spec}>
      <div className="mb-1 flex flex-wrap gap-1 rounded-t-md border border-b-0 border-gray-300 bg-gray-50 px-1.5 py-1">
        <button type="button" onClick={() => wrap('<strong>', '</strong>')} className="rounded px-1.5 py-0.5 text-[11px] font-bold hover:bg-white" title="Kalın">B</button>
        <button type="button" onClick={() => wrap('<em>', '</em>')} className="rounded px-1.5 py-0.5 text-[11px] italic hover:bg-white" title="İtalik">I</button>
        <button type="button" onClick={() => wrap('<h2>', '</h2>', 'Başlık')} className="rounded px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white" title="Başlık 2">H2</button>
        <button type="button" onClick={() => wrap('<h3>', '</h3>', 'Alt başlık')} className="rounded px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white" title="Başlık 3">H3</button>
        <button type="button" onClick={() => wrap('<ul>\n  <li>', '</li>\n</ul>', 'Madde')} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-white" title="Madde listesi">• Liste</button>
        <button type="button" onClick={addLink} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-white" title="Bağlantı ekle">🔗</button>
      </div>
      <textarea ref={ref} className={`${input} rounded-t-none resize-y`} rows={8} value={val} maxLength={spec.max}
        placeholder={base || spec.placeholder} onChange={(e) => onChange(e.target.value)} />
      {spec.max && <span className="mt-0.5 block text-end text-[10px] font-normal text-gray-400">{val.length} / {spec.max}</span>}
    </Label>
  )
}

function CampaignsField({ spec, value, onChange, campaigns }: { spec: FieldSpec; value: any; onChange: (v: string[]) => void; campaigns: Campaign[] }) {
  const [q, setQ] = useState('')
  const selected: string[] = Array.isArray(value) ? value : []
  const filtered = campaigns.filter((c) => !q.trim() || c.title.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr')))
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold text-gray-600">{spec.label}</div>
      {campaigns.length > 5 && (
        <input className="mb-1.5 w-full rounded-md border border-gray-300 px-2 py-1 text-[12px]" placeholder="Kampanya ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
        {filtered.length === 0 && <p className="text-[12px] text-gray-400">{campaigns.length === 0 ? 'Aktif kampanya yok' : 'Eşleşen kampanya yok'}</p>}
        {filtered.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={selected.includes(c.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))} />
            {c.title}
          </label>
        ))}
      </div>
      {spec.help && <p className="mt-1 text-[11px] text-gray-400">{spec.help}</p>}
    </div>
  )
}

export function FieldInput({ spec, value, onChange, ctx }: { spec: FieldSpec; value: any; onChange: (v: any) => void; ctx: FieldContext }) {
  const base = typeof ctx.baseValue === 'string' && ctx.baseValue ? ctx.baseValue : undefined
  switch (spec.kind) {
    case 'text':
    case 'url':
      return (
        <Label spec={spec}>
          <input className={input} value={value ?? ''} maxLength={spec.max} placeholder={base || spec.placeholder || (spec.kind === 'url' ? '/sayfa veya https://…' : '')}
            onChange={(e) => onChange(e.target.value)} />
          {spec.max && typeof value === 'string' && value.length > 0 && (
            <span className="mt-0.5 block text-end text-[10px] font-normal text-gray-400">{value.length} / {spec.max}</span>
          )}
        </Label>
      )
    case 'textarea':
      return (
        <Label spec={spec}>
          <textarea className={`${input} resize-y`} rows={3} value={value ?? ''} maxLength={spec.max}
            placeholder={base || spec.placeholder} onChange={(e) => onChange(e.target.value)} />
          {spec.max && typeof value === 'string' && value.length > 0 && (
            <span className="mt-0.5 block text-end text-[10px] font-normal text-gray-400">{value.length} / {spec.max}</span>
          )}
        </Label>
      )
    case 'richtext':
      return <RichTextField spec={spec} value={value} base={base} onChange={onChange} />
    case 'video':
      return (
        <Label spec={spec}>
          <input className={input} value={typeof value === 'object' && value ? value.url : value ?? ''} placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => onChange(e.target.value)} />
        </Label>
      )
    case 'image':
      return <ImageField label={spec.label} value={value} onChange={onChange} />
    case 'color':
      return (
        <Label spec={spec}>
          <div className="flex items-center gap-1.5">
            <input type="color" className="h-8 w-9 flex-none cursor-pointer rounded border" value={value || '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
            <input className={input} value={value ?? ''} placeholder="#RRGGBB" onChange={(e) => onChange(e.target.value)} />
            {value && <button type="button" title="Temizle" className="px-1 text-gray-400 hover:text-gray-700" onClick={() => onChange(undefined)}>✕</button>}
          </div>
        </Label>
      )
    case 'select':
      return (
        <Label spec={spec}>
          <select className={input} value={value ?? (spec.default ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
            {Object.entries(spec.choices || {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Label>
      )
    case 'number':
      return (
        <Label spec={spec}>
          <div className="flex items-center gap-1.5">
            {spec.min !== undefined && spec.max !== undefined && spec.max - spec.min <= 400 && (
              <input type="range" className="flex-1" min={spec.min} max={spec.max} step={spec.step || 1} value={value ?? spec.default ?? spec.min}
                onChange={(e) => onChange(Number(e.target.value))} />
            )}
            <input type="number" className={`${input} w-20 flex-none`} min={spec.min} max={spec.max} step={spec.step || 1} value={value ?? ''}
              placeholder={spec.default !== undefined ? String(spec.default) : ''}
              onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
          </div>
        </Label>
      )
    case 'bool':
      return (
        <div>
          <label className="flex items-center justify-between gap-2 text-[12px] font-semibold text-gray-600">
            {spec.label}
            <input type="checkbox" className="h-4 w-4" checked={value ?? spec.default ?? false} onChange={(e) => onChange(e.target.checked)} />
          </label>
          {spec.help && <p className="mt-1 text-[11px] text-gray-400">{spec.help}</p>}
        </div>
      )
    case 'datetime':
      return (
        <Label spec={spec}>
          <input type="datetime-local" className={input} value={localDateTime(value)}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
        </Label>
      )
    case 'campaign':
      return (
        <Label spec={spec}>
          <select className={input} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">{spec.placeholder || '— seçilmedi —'}</option>
            {ctx.campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Label>
      )
    case 'campaigns':
      return <CampaignsField spec={spec} value={value} onChange={onChange} campaigns={ctx.campaigns} />
    case 'list':
      return <ListField spec={spec} value={value} onChange={onChange} ctx={ctx} />
    default:
      return null
  }
}

/** A form for a set of fields; honours `show_if`. */
export function Fields({ specs, values, onChange, ctx, onlyTranslatable, baseValues }: {
  specs: Record<string, FieldSpec>
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  ctx: FieldContext
  onlyTranslatable?: boolean
  baseValues?: Record<string, any>
}) {
  return (
    <>
      {Object.entries(specs).map(([key, spec]) => {
        if (spec.show_if && Object.entries(spec.show_if).some(([k, v]) => (values[k] ?? specs[k]?.default) !== v)) return null
        if (onlyTranslatable && !(spec.translatable || spec.kind === 'list')) return null
        const listSpec = onlyTranslatable && spec.kind === 'list'
          ? { ...spec, fields: Object.fromEntries(Object.entries(spec.fields || {}).filter(([, f]) => f.translatable)) }
          : spec
        return (
          <FieldInput key={key} spec={listSpec} value={values[key]} ctx={{ ...ctx, baseValue: baseValues?.[key], baseList: Array.isArray(baseValues?.[key]) ? baseValues[key] : undefined }}
            onChange={(v) => {
              const next = { ...values }
              if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0 && spec.kind !== 'list')) delete next[key]
              else next[key] = v
              onChange(next)
            }} />
        )
      })}
    </>
  )
}
