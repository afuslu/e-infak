'use client'

import { Moon, Sun } from 'lucide-react'

/** Day / night switch of the landing page. The choice is kept in a cookie so the server renders it. */
export function PortalThemeToggle() {
  const toggle = () => {
    const root = document.querySelector<HTMLElement>('.portal')
    if (!root) return
    const current = root.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    document.cookie = `einfak_tema=${next}; path=/; max-age=31536000; samesite=lax`
  }
  return (
    <button type="button" onClick={toggle} aria-label="Gündüz / gece görünümü" title="Gündüz / gece görünümü"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-pt-line text-pt-muted hover:border-pt-brand hover:text-pt-brand">
      <Moon className="pt-day h-4 w-4" aria-hidden="true" />
      <Sun className="pt-night h-4 w-4" aria-hidden="true" />
    </button>
  )
}
