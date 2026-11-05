'use client'

import { useEffect, useState } from 'react'
import { useOrgSettings } from '@e-infak/api-client'
import { LANGUAGE_NAMES, clientLocale } from '../../lib/i18n'

/** Shown only when the organization has enabled more than one website language. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { data: settings } = useOrgSettings()
  const [current, setCurrent] = useState('tr')
  useEffect(() => setCurrent(clientLocale()), [])
  const languages = settings?.languages || ['tr']
  if (languages.length < 2) return null

  const change = (lang: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('lang', lang)
    window.location.assign(url.toString())
  }

  return (
    <select
      aria-label="Dil / Language"
      value={languages.includes(current) ? current : 'tr'}
      onChange={(e) => change(e.target.value)}
      className={`rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm ${className}`}
    >
      {languages.map((lang) => (
        <option key={lang} value={lang} className="text-black">{LANGUAGE_NAMES[lang] || lang.toUpperCase()}</option>
      ))}
    </select>
  )
}
