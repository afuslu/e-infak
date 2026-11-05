'use client'

import { useState } from 'react'
import type { Campaign } from '@e-infak/api-client'
import type { FieldSpec } from '../../lib/blocks'
import { ImageField } from '../admin/ImageField'

const input = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-blue-500'

export interface FieldContext {
  campaigns: Campaign[]
  /** Text shown under translatable fields while editing another language. */
  baseValue?: unknown
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
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-semibold text-gray-600">{spec.label}</div>
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
              disabled={items.length <= (spec.min_items || 0)} onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
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

export function FieldInput({ spec, value, onChange, ctx }: { spec: FieldSpec; value: any; onChange: (v: any) => void; ctx: FieldContext }) {
  const base = typeof ctx.baseValue === 'string' && ctx.baseValue ? ctx.baseValue : undefined
  switch (spec.kind) {
    case 'text':
    case 'url':
      return (
        <Label spec={spec}>
          <input className={input} value={value ?? ''} maxLength={spec.max} placeholder={base || spec.placeholder || (spec.kind === 'url' ? '/sayfa veya https://…' : '')}
            onChange={(e) => onChange(e.target.value)} />
        </Label>
      )
    case 'textarea':
    case 'richtext':
      return (
        <Label spec={spec}>
          <textarea className={`${input} resize-y`} rows={spec.kind === 'richtext' ? 8 : 3} value={value ?? ''} maxLength={spec.max}
            placeholder={base || spec.placeholder} onChange={(e) => onChange(e.target.value)} />
        </Label>
      )
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
        <label className="flex items-center justify-between gap-2 text-[12px] font-semibold text-gray-600">
          {spec.label}
          <input type="checkbox" className="h-4 w-4" checked={value ?? spec.default ?? false} onChange={(e) => onChange(e.target.checked)} />
        </label>
      )
    case 'datetime':
      return (
        <Label spec={spec}>
          <input type="datetime-local" className={input} value={value ? String(value).slice(0, 16) : ''}
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
    case 'campaigns': {
      const selected: string[] = Array.isArray(value) ? value : []
      return (
        <div>
          <div className="mb-1 text-[12px] font-semibold text-gray-600">{spec.label}</div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {ctx.campaigns.length === 0 && <p className="text-[12px] text-gray-400">Aktif kampanya yok</p>}
            {ctx.campaigns.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={selected.includes(c.id)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))} />
                {c.title}
              </label>
            ))}
          </div>
        </div>
      )
    }
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
          <FieldInput key={key} spec={listSpec} value={values[key]} ctx={{ ...ctx, baseValue: baseValues?.[key] }}
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
