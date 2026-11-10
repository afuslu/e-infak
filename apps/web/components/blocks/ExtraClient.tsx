'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Days / hours / minutes / seconds until `target`; `done` replaces the boxes once it has passed. */
export function Countdown({ target, labels, done }: { target: string; labels: [string, string, string, string]; done?: ReactNode }) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const end = new Date(target).getTime()
    if (Number.isNaN(end)) return
    const tick = () => setLeft(Math.max(0, end - Date.now()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [target])
  if (left === 0 && done) return <div className="text-xl font-bold">{done}</div>
  const s = Math.floor((left ?? 0) / 1000)
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
  return (
    <div className="flex flex-wrap justify-center gap-3" role="timer" aria-live="off">
      {parts.map((value, i) => (
        <div key={i} className="min-w-[78px] rounded-xl bg-current/10 px-3 py-3 text-center backdrop-blur">
          <div className="font-heading text-3xl font-bold tabular-nums md:text-4xl">{left === null ? '--' : String(value).padStart(2, '0')}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-widest opacity-75">{labels[i]}</div>
        </div>
      ))}
    </div>
  )
}

/** Tabs (horizontal or vertical) or an accordion; panels are rendered by the caller. */
export function TabsView({ labels, panels, look = 'tabs' }: { labels: string[]; panels: ReactNode[]; look?: string }) {
  const [active, setActive] = useState(0)
  if (look === 'accordion') {
    return (
      <div className="divide-y rounded-2xl border bg-white text-gray-900">
        {labels.map((label, i) => (
          <div key={i}>
            <button type="button" aria-expanded={active === i} onClick={() => setActive(active === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold">
              {label}<span className={`text-primary-600 transition-transform ${active === i ? 'rotate-45' : ''}`}>+</span>
            </button>
            {active === i && <div className="px-5 pb-5">{panels[i]}</div>}
          </div>
        ))}
      </div>
    )
  }
  const vertical = look === 'vertical'
  return (
    <div className={vertical ? 'grid gap-6 md:grid-cols-[240px_1fr]' : ''}>
      <div role="tablist" className={vertical ? 'flex flex-row gap-2 overflow-x-auto md:flex-col' : 'mb-6 flex flex-wrap justify-center gap-2'}>
        {labels.map((label, i) => (
          <button key={i} type="button" role="tab" aria-selected={active === i} onClick={() => setActive(i)}
            className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-colors ${vertical ? 'text-start' : ''} ${active === i ? 'bg-primary-600 text-white' : 'bg-black/5 hover:bg-black/10'}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panels[Math.max(active, 0)]}</div>
    </div>
  )
}

export interface GalleryImage { image_url?: string; caption?: string }

/** Image grid (or masonry); a click opens the image in a full-screen viewer with arrows. */
export function GalleryGrid({ items, columns = 4, aspect = '1/1', gap = 12, lightbox = true }: {
  items: GalleryImage[]; columns?: number; aspect?: string; gap?: number; lightbox?: boolean
}) {
  const [open, setOpen] = useState<number | null>(null)
  const images = items.filter((i) => i.image_url)
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((o) => (o === null ? o : (o + 1) % images.length))
      if (e.key === 'ArrowLeft') setOpen((o) => (o === null ? o : (o - 1 + images.length) % images.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, images.length])
  const masonry = aspect === 'masonry'
  const cols = Math.min(Math.max(columns, 2), 6)
  const tile = (img: GalleryImage, i: number) => (
    <button key={i} type="button" disabled={!lightbox} onClick={() => setOpen(i)} aria-label={img.caption || `Görsel ${i + 1}`}
      className={`group relative block w-full overflow-hidden rounded-xl bg-black/5 ${masonry ? 'mb-[var(--g)] break-inside-avoid' : ''}`}
      style={masonry ? undefined : { aspectRatio: aspect }}>
      <img src={img.image_url} alt={img.caption || ''} loading="lazy"
        className={`w-full transition-transform duration-500 group-hover:scale-105 ${masonry ? '' : 'h-full object-cover'}`} />
      {img.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-start text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">{img.caption}</span>}
    </button>
  )
  return (
    <>
      {masonry
        ? <div style={{ columnCount: cols, columnGap: gap, ['--g' as string]: `${gap}px` }} className="max-md:![column-count:2]">{images.map(tile)}</div>
        : <div className="grid grid-cols-2 md:grid-cols-[repeat(var(--c),minmax(0,1fr))]" style={{ gap, ['--c' as string]: cols }}>{images.map(tile)}</div>}
      {open !== null && images[open] && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <button type="button" aria-label="Kapat" className="absolute end-4 top-4 text-3xl text-white/80 hover:text-white">✕</button>
          {images.length > 1 && (
            <>
              <button type="button" aria-label="Önceki" className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + images.length) % images.length) }}>‹</button>
              <button type="button" aria-label="Sonraki" className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % images.length) }}>›</button>
            </>
          )}
          <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={images[open].image_url} alt={images[open].caption || ''} className="max-h-[82vh] w-auto rounded-lg" />
            {images[open].caption && <figcaption className="mt-3 text-center text-sm text-white/80">{images[open].caption}</figcaption>}
          </figure>
        </div>,
        document.body,
      )}
    </>
  )
}

export function CopyButton({ value, label, copied }: { value: string; label: string; copied: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="rounded-lg border border-primary-600 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value) } catch { /* clipboard blocked: the IBAN stays selectable */ }
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      }}>
      {done ? copied : label}
    </button>
  )
}

/**
 * Pop-up shown once, `delay` seconds after the page opens. Closing it hides it for
 * `hideDays` days (remembered in this browser). The editor draws it in place instead.
 */
export function Popup({ id, delay = 3, hideDays = 1, size = 'md', editing, children }: {
  id: string; delay?: number; hideDays?: number; size?: string; editing?: boolean; children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const key = `einfak-popup-${id}`
  useEffect(() => {
    if (editing) return
    try {
      const until = Number(localStorage.getItem(key) || 0)
      if (until > Date.now()) return
    } catch { /* storage blocked: show it */ }
    const timer = setTimeout(() => setOpen(true), Math.max(0, delay) * 1000)
    return () => clearTimeout(timer)
  }, [editing, key, delay])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const close = () => {
    setOpen(false)
    try { localStorage.setItem(key, String(Date.now() + Math.max(0, hideDays) * 86400000)) } catch { /* ignore */ }
  }
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size] || 'max-w-lg'
  if (editing) {
    return (
      <div className="mx-auto my-4 max-w-lg rounded-2xl border-2 border-dashed border-blue-300 bg-white p-2 text-gray-900">
        <div className="px-2 pb-1 text-[11px] font-bold text-blue-600">🪟 Açılır pencere — sitede {delay} sn sonra ekranın ortasında açılır</div>
        <div className="overflow-hidden rounded-xl border">{children}</div>
      </div>
    )
  }
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" onClick={close}>
      <div className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-2xl bg-white text-gray-900 shadow-2xl animate-fade-in`} onClick={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).closest('a')) close() }}>
        <button type="button" aria-label="Kapat" onClick={close} className="absolute end-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">✕</button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
