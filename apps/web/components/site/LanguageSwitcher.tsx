'use client'

import { useEffect, useRef, useState } from 'react'
import { useOrgSettings } from '@e-infak/api-client'
import { LANGUAGE_NAMES, clientLocale } from '../../lib/i18n'

const FLAGS: Record<string, string> = {
  tr: '🇹🇷', en: '🇬🇧', ar: '🇸🇦', de: '🇩🇪', fr: '🇫🇷', nl: '🇳🇱',
  ru: '🇷🇺', fa: '🇮🇷', ur: '🇵🇰', es: '🇪🇸', it: '🇮🇹', az: '🇦🇿',
  bs: '🇧🇦', sq: '🇦🇱', id: '🇮🇩', ms: '🇲🇾', so: '🇸🇴', sw: '🇹🇿',
  ha: '🇳🇬', ky: '🇰🇬', kk: '🇰🇿', uz: '🇺🇿',
}

interface Props {
  className?: string
  languages?: string[]
  locale?: string
  look?: string
  labelMode?: string
  showIcon?: boolean
  size?: string
  align?: string
}

/** Shown only when the organization has enabled more than one website language. */
export function LanguageSwitcher({
  className = '',
  languages: propLanguages,
  locale: propLocale,
  look = 'select',
  labelMode = 'name',
  showIcon = false,
  size = 'sm',
  align = 'left',
}: Props) {
  const { data: settings } = useOrgSettings()
  const [current, setCurrent] = useState(propLocale || 'tr')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrent(propLocale || clientLocale())
  }, [propLocale])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const languages = propLanguages?.length ? propLanguages : (settings?.languages || ['tr'])
  if (languages.length < 2) return null

  const active = languages.includes(current) ? current : languages[0]

  const change = (lang: string) => {
    setOpen(false)
    if (lang === active) return
    const url = new URL(window.location.href)
    url.searchParams.set('lang', lang)
    window.location.assign(url.toString())
  }

  const formatLabel = (lang: string) => {
    const name = LANGUAGE_NAMES[lang] || lang.toUpperCase()
    const code = lang.toUpperCase()
    const flag = FLAGS[lang] || '🌐'
    if (labelMode === 'code') return code
    if (labelMode === 'flag_code') return `${flag} ${code}`
    if (labelMode === 'flag_name') return `${flag} ${name}`
    return name
  }

  const sizeCls = size === 'md' ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1'
  const justifyCls = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'

  if (look === 'buttons' || look === 'globe_pill' || look === 'glass_pill' || look === 'segmented_control' || look === 'full_bar') {
    const wrapCls = look === 'segmented_control'
      ? 'inline-flex rounded-full bg-current/10 p-1 gap-0.5'
      : look === 'full_bar'
        ? 'flex w-full justify-center gap-2 border-y border-current/15 py-2'
        : `inline-flex flex-wrap items-center gap-1 ${justifyCls}`
    return (
      <div className={`${wrapCls} ${className}`} role="group" aria-label="Dil / Language">
        {look === 'globe_pill' && <span aria-hidden className="me-1 text-sm">🌐</span>}
        {languages.map((lang) => {
          const isActive = lang === active
          const btnCls = look === 'glass_pill'
            ? (isActive ? 'bg-primary-600 text-white shadow-sm' : 'border border-white/50 bg-white/70 text-gray-900 backdrop-blur-md hover:bg-white')
            : isActive
              ? 'bg-primary-600 text-white shadow-sm'
              : 'border border-current/20 opacity-80 hover:bg-current/10 hover:opacity-100'
          return (
            <button
              key={lang}
              type="button"
              onClick={() => change(lang)}
              aria-pressed={isActive}
              className={`rounded-full font-semibold transition-colors ${sizeCls} ${btnCls}`}
            >
              {formatLabel(lang)}
            </button>
          )
        })}
      </div>
    )
  }

  if (look === 'list' || look === 'minimal_slash') {
    return (
      <ul className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${justifyCls} ${size === 'md' ? 'text-sm' : 'text-xs'} ${className}`}>
        {languages.map((lang, idx) => {
          const isActive = lang === active
          return (
            <li key={lang} className="inline-flex items-center gap-2.5">
              {look === 'minimal_slash' && idx > 0 && <span aria-hidden className="opacity-35">/</span>}
              <button
                type="button"
                onClick={() => change(lang)}
                className={`transition-opacity ${isActive ? 'font-bold underline underline-offset-4' : 'opacity-75 hover:opacity-100'}`}
              >
                {formatLabel(lang)}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  if (look === 'dropdown' || look === 'dark_dropdown') {
    return (
      <div ref={ref} className={`relative inline-block text-start ${className}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-colors ${sizeCls} ${look === 'dark_dropdown' ? 'border-white/20 bg-slate-900 text-white hover:bg-slate-800' : 'border-current/20 bg-transparent hover:bg-current/5'}`}
        >
          {showIcon && <span aria-hidden>🌐</span>}
          <span>{formatLabel(active)}</span>
          <span aria-hidden className={`text-[10px] opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {open && (
          <ul
            role="listbox"
            className={`absolute top-full z-50 mt-1.5 min-w-[140px] rounded-xl border border-black/10 bg-white p-1.5 text-gray-800 shadow-xl ${
              align === 'right' ? 'end-0' : 'start-0'
            }`}
          >
            {languages.map((lang) => {
              const isActive = lang === active
              return (
                <li key={lang}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => change(lang)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm transition-colors ${
                      isActive ? 'bg-primary-50 font-bold text-primary-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    <span>{formatLabel(lang)}</span>
                    {isActive && <span aria-hidden className="text-xs">✓</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {showIcon && <span aria-hidden className="text-sm">🌐</span>}
      <select
        aria-label="Dil / Language"
        value={active}
        onChange={(e) => change(e.target.value)}
        className={`rounded-md border border-current/20 bg-transparent ${size === 'md' ? 'px-2.5 py-1.5 text-sm' : 'px-2 py-1 text-sm'}`}
      >
        {languages.map((lang) => (
          <option key={lang} value={lang} className="text-black">
            {formatLabel(lang)}
          </option>
        ))}
      </select>
    </div>
  )
}
