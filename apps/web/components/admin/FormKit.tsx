'use client'

import type { ReactNode } from 'react'

export const inputClass = 'w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm outline-none focus:border-primary-600'
export const primaryButton = 'rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50'
export const ghostButton = 'rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-primary-600'

export function Label({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-bold text-gray-600">
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-normal text-gray-400">{hint}</span>}
    </label>
  )
}

export function TextInput({
  label, value, onChange, hint, ...rest
}: {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  hint?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Label label={label} hint={hint}>
      <input {...rest} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </Label>
  )
}

export function TextArea({
  label, value, onChange, hint, rows = 4, ...rest
}: {
  label: string
  value: string | null | undefined
  onChange: (value: string) => void
  hint?: string
  rows?: number
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return (
    <Label label={label} hint={hint}>
      <textarea {...rest} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputClass} resize-y`} />
    </Label>
  )
}

export function Notice({ message }: { message: { type: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null
  return (
    <div className={`rounded-lg border p-3 text-sm font-semibold ${message.type === 'ok' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
      {message.text}
    </div>
  )
}

export function StatusPill({ active, on = 'Yayında', off = 'Taslak' }: { active: boolean; on?: string; off?: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${active ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>
      {active ? on : off}
    </span>
  )
}

/** Shows how a "## heading / blank-line paragraph" body will look on the public site. */
export const BODY_HINT = 'Paragrafları boş satırla ayırın. "## " ile başlayan satır ara başlık olur. HTML kullanılmaz.'
