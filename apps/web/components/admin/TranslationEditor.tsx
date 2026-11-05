'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminGet } from '../../lib/admin-access'
import { LANGUAGE_NAMES } from '../../lib/i18n'
import { inputClass } from './FormKit'

export type Translations = Record<string, Record<string, string>>

/** Website languages other than the default (Turkish), from Site Ayarları. */
export function useExtraLanguages() {
  const { data } = useQuery({
    queryKey: ['admin-site-languages'],
    queryFn: async () => (await adminGet<{ languages?: string[] }>('/org-settings')).data.languages || ['tr'],
    staleTime: 60_000,
  })
  return (data || ['tr']).filter((l) => l !== 'tr')
}

/**
 * Per-language inputs for the given fields. Empty fields fall back to the
 * Turkish text on the website, so partial translations are fine.
 */
export function TranslationEditor({ fields, value, onChange }: {
  fields: { key: string; label: string; long?: boolean }[]
  value: Translations
  onChange: (value: Translations) => void
}) {
  const languages = useExtraLanguages()
  const [active, setActive] = useState<string | null>(null)
  if (languages.length === 0) return null
  const lang = active && languages.includes(active) ? active : languages[0]
  const entry = value[lang] || {}

  const set = (field: string, text: string) => {
    const next = { ...value, [lang]: { ...entry, [field]: text } }
    if (!text) delete next[lang][field]
    if (Object.keys(next[lang]).length === 0) delete next[lang]
    onChange(next)
  }

  return (
    <details className="rounded-lg border border-gray-200 p-3" open={Object.keys(value).length > 0}>
      <summary className="cursor-pointer text-xs font-bold text-gray-600">
        Çeviriler ({Object.keys(value).filter((l) => languages.includes(l)).length}/{languages.length} dil)
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-1">
          {languages.map((l) => (
            <button key={l} type="button" onClick={() => setActive(l)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${l === lang ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-gray-600'}`}>
              {LANGUAGE_NAMES[l] || l.toUpperCase()}{value[l] ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {fields.map((f) => (
          <label key={f.key} className="block text-xs font-bold text-gray-600">
            <span className="mb-1 block">{f.label} ({lang.toUpperCase()})</span>
            {f.long ? (
              <textarea rows={6} dir={['ar', 'fa', 'ur', 'he'].includes(lang) ? 'rtl' : 'ltr'} className={`${inputClass} resize-y`}
                value={entry[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input dir={['ar', 'fa', 'ur', 'he'].includes(lang) ? 'rtl' : 'ltr'} className={inputClass}
                value={entry[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        ))}
        <p className="text-[11px] text-gray-400">Boş bırakılan alanlar sitede Türkçe gösterilir.</p>
      </div>
    </details>
  )
}
