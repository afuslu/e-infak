'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Carousel } from '../site/Carousel'

/** Hides its children once `target` has passed when `enabled` is true. */
export function CountdownGate({ target, enabled, children }: { target?: string; enabled?: boolean; children: ReactNode }) {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!enabled || !target) return
    const end = new Date(target).getTime()
    if (Number.isNaN(end)) return
    const check = () => setExpired(Date.now() >= end)
    check()
    const timer = setInterval(check, 1000)
    return () => clearInterval(timer)
  }, [target, enabled])
  if (enabled && expired) return null
  return <>{children}</>
}

/** Days / hours / minutes / seconds until `target`; `done` replaces the boxes once it has passed. */
export function Countdown({
  target,
  labels,
  done,
  look = 'band',
  showSeconds = true,
  light = false,
}: {
  target: string
  labels: [string, string, string, string]
  done?: ReactNode
  look?: string
  showSeconds?: boolean
  light?: boolean
}) {
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
  const allParts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
  const maxes = [365, 24, 60, 60]
  const indices = showSeconds ? [0, 1, 2, 3] : [0, 1, 2]

  if (look === 'minimal') {
    return (
      <div dir="ltr" className="flex flex-wrap items-center justify-center gap-3 font-heading text-lg font-bold tabular-nums" role="timer" aria-live="off">
        {indices.map((i) => (
          <span key={i} className="inline-flex items-baseline gap-1">
            <span className="text-2xl">{left === null ? '--' : String(allParts[i]).padStart(2, '0')}</span>
            <span className="text-xs font-semibold uppercase opacity-75">{labels[i]}</span>
          </span>
        ))}
      </div>
    )
  }

  if (look === 'ring') {
    const r = 34
    const circ = 2 * Math.PI * r
    return (
      <div dir="ltr" className="flex flex-wrap justify-center gap-4" role="timer" aria-live="off">
        {indices.map((i) => {
          const val = allParts[i]
          const ratio = left === null ? 0 : Math.min(1, val / maxes[i])
          const offset = circ * (1 - ratio)
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <svg className="-rotate-90 h-24 w-24" viewBox="0 0 80 80" aria-hidden>
                  <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="6" />
                  <circle
                    cx="40"
                    cy="40"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    className="transition-all duration-500"
                  />
                </svg>
                <span className="absolute font-heading text-2xl font-extrabold tabular-nums">
                  {left === null ? '--' : String(val).padStart(2, '0')}
                </span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest opacity-80">{labels[i]}</span>
            </div>
          )
        })}
      </div>
    )
  }

  if (look === 'flip') {
    return (
      <div dir="ltr" className="flex flex-wrap justify-center gap-3" role="timer" aria-live="off">
        {indices.map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="relative min-w-[82px] overflow-hidden rounded-xl border border-black/15 bg-gray-900 px-3 py-3.5 text-center text-white shadow-lg">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/15" aria-hidden />
              <div className="relative font-heading text-3xl font-extrabold tabular-nums md:text-4xl">
                {left === null ? '--' : String(allParts[i]).padStart(2, '0')}
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest opacity-80">{labels[i]}</span>
          </div>
        ))}
      </div>
    )
  }

  const boxCls =
    look === 'cards'
      ? 'bg-white text-gray-900 shadow-md border border-gray-100'
      : light
        ? 'bg-primary-900/5 border border-primary-200 text-primary-950'
        : 'bg-white/15 border border-white/15 backdrop-blur'
  return (
    <div dir="ltr" className="flex flex-wrap justify-center gap-3" role="timer" aria-live="off">
      {indices.map((i) => (
        <div key={i} className={`min-w-[78px] rounded-xl px-3 py-3 text-center ${boxCls}`}>
          <div className={`font-heading text-3xl font-bold tabular-nums md:text-4xl ${look === 'cards' ? 'text-primary-700' : ''}`}>
            {left === null ? '--' : String(allParts[i]).padStart(2, '0')}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-widest opacity-75">{labels[i]}</div>
        </div>
      ))}
    </div>
  )
}

/** Tabs (horizontal, vertical, underline, boxed, numbered, dark) or an accordion; panels are rendered by the caller. */
export function TabsView({ labels, panels, look = 'tabs', meta }: {
  labels: string[]
  panels: ReactNode[]
  look?: string
  meta?: Array<{ icon?: string; badge?: string }>
}) {
  const [active, setActive] = useState(0)
  const isDark = look === 'dark_cards'

  if (look === 'accordion') {
    return (
      <div className="divide-y rounded-2xl border bg-white text-gray-900 shadow-sm">
        {labels.map((label, i) => (
          <div key={i}>
            <button type="button" aria-expanded={active === i} onClick={() => setActive(active === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold text-gray-900">
              <span className="flex items-center gap-2.5">
                {meta?.[i]?.icon && <span className="text-lg">{meta[i].icon}</span>}
                <span>{label}</span>
                {meta?.[i]?.badge && <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{meta[i].badge}</span>}
              </span>
              <span className={`text-primary-600 transition-transform ${active === i ? 'rotate-45' : ''}`}>+</span>
            </button>
            {active === i && <div className="px-5 pb-5 text-gray-700">{panels[i]}</div>}
          </div>
        ))}
      </div>
    )
  }

  const vertical = look === 'vertical'
  const pills = look === 'pills'
  const underline = look === 'underline'
  const boxed = look === 'boxed_cards'
  const numbered = look === 'numbered_steps'

  const tabButtonCls = (isActive: boolean) => {
    if (underline) {
      return `whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
        isActive ? 'border-primary-600 text-primary-700' : 'border-transparent opacity-65 hover:opacity-100'
      }`
    }
    if (numbered) {
      return `flex items-center gap-2.5 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
        isActive ? 'border-primary-600 bg-primary-600 text-white shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
      }`
    }
    if (isDark) {
      return `whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-colors ${
        isActive ? 'bg-primary-500 text-white shadow-sm' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`
    }
    return `whitespace-nowrap px-4 py-2.5 text-sm font-bold transition-colors ${pills ? 'rounded-full' : 'rounded-lg'} ${
      vertical ? 'text-start' : ''
    } ${isActive ? 'bg-primary-600 text-white shadow-sm' : 'border border-black/10 bg-white/80 text-gray-800 hover:bg-primary-50'}`
  }

  const listCls = vertical
    ? 'flex flex-row gap-2 overflow-x-auto md:flex-col'
    : underline
      ? 'mb-6 flex flex-wrap justify-center gap-2 border-b border-gray-200'
      : 'mb-6 flex flex-wrap justify-center gap-2'

  const panelWrapCls = boxed
    ? 'rounded-3xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm md:p-8'
    : isDark
      ? 'rounded-3xl bg-gray-900 p-6 text-white shadow-lg ring-1 ring-white/10 md:p-8'
      : ''

  return (
    <div className={vertical ? 'grid gap-6 md:grid-cols-[240px_1fr]' : ''}>
      <div role="tablist" className={listCls}>
        {labels.map((label, i) => (
          <button key={i} type="button" role="tab" aria-selected={active === i} onClick={() => setActive(i)} className={tabButtonCls(active === i)}>
            <span className="inline-flex items-center gap-2">
              {numbered && (
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${
                  active === i ? 'bg-white/20 text-white' : 'bg-primary-50 text-primary-700'
                }`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
              )}
              {meta?.[i]?.icon && <span>{meta[i].icon}</span>}
              <span>{label}</span>
              {meta?.[i]?.badge && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  active === i ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-800'
                }`}>
                  {meta[i].badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel" className={panelWrapCls}>{panels[Math.max(active, 0)]}</div>
    </div>
  )
}

export interface GalleryImage { image_url?: string; mobile_image_url?: string; caption?: string; category?: string }

function GalleryPicture({ img, className }: { img: GalleryImage; className: string }) {
  if (img.mobile_image_url) {
    return (
      <picture className="block h-full w-full">
        <source media="(max-width: 767px)" srcSet={img.mobile_image_url} />
        <img src={img.image_url} alt={img.caption || ''} loading="lazy" className={className} />
      </picture>
    )
  }
  return <img src={img.image_url} alt={img.caption || ''} loading="lazy" className={className} />
}

function GalleryLightbox({ images, open, onClose, onChange }: {
  images: GalleryImage[]; open: number | null; onClose: () => void; onChange: (idx: number) => void
}) {
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onChange((open + 1) % images.length)
      if (e.key === 'ArrowLeft') onChange((open - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, images.length, onClose, onChange])

  if (open === null || !images[open]) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="absolute start-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
        {open + 1} / {images.length}
      </div>
      <button type="button" aria-label="Kapat" className="absolute end-4 top-4 text-3xl text-white/80 hover:text-white" onClick={onClose}>✕</button>
      {images.length > 1 && (
        <>
          <button type="button" aria-label="Önceki" className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); onChange((open - 1 + images.length) % images.length) }}>‹</button>
          <button type="button" aria-label="Sonraki" className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); onChange((open + 1) % images.length) }}>›</button>
        </>
      )}
      <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <img src={images[open].image_url} alt={images[open].caption || ''} className="max-h-[82vh] w-auto rounded-lg" />
        {images[open].caption && <figcaption className="mt-3 text-center text-sm text-white/80">{images[open].caption}</figcaption>}
      </figure>
    </div>,
    document.body,
  )
}

export function GalleryCarousel({ items, columns = 4, aspect = '4/3', captionMode = 'below', autoplay = true, lightbox = true, label, editing }: {
  items: GalleryImage[]; columns?: number; aspect?: string; captionMode?: string; autoplay?: boolean; lightbox?: boolean; label: string; editing?: boolean
}) {
  const [open, setOpen] = useState<number | null>(null)
  const images = items.filter((i) => i.image_url)
  const itemWidth: Record<number, string> = {
    2: 'w-[88%] sm:w-[48%]',
    3: 'w-[85%] sm:w-[46%] lg:w-[31.5%]',
    4: 'w-[78%] sm:w-[46%] lg:w-[23.5%]',
    5: 'w-[72%] sm:w-[31%] lg:w-[19%]',
    6: 'w-[68%] sm:w-[31%] lg:w-[15.5%]',
  }
  return (
    <>
      <Carousel
        label={label}
        items={itemWidth[columns] || itemWidth[4]}
        autoplay={autoplay}
        dots
        arrowPos="sides"
        editing={editing}
      >
        {images.map((item, i) => (
          <figure key={i} className="group overflow-hidden rounded-2xl bg-white shadow-sm">
            <button
              type="button"
              disabled={!lightbox}
              onClick={() => setOpen(i)}
              aria-label={item.caption || `Görsel ${i + 1}`}
              className="relative block w-full overflow-hidden bg-gray-100 text-start"
              style={{ aspectRatio: aspect && aspect !== 'masonry' ? aspect : '4/3' }}
            >
              <GalleryPicture img={item} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              {item.caption && captionMode === 'always' && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-xs font-semibold text-white">
                  {item.caption}
                </span>
              )}
            </button>
            {item.caption && (captionMode === 'below' || captionMode === 'hover') && (
              <figcaption className="px-3 py-2 text-center text-xs font-medium text-gray-600">{item.caption}</figcaption>
            )}
          </figure>
        ))}
      </Carousel>
      {lightbox && <GalleryLightbox images={images} open={open} onClose={() => setOpen(null)} onChange={setOpen} />}
    </>
  )
}

/** Image grid (masonry, bento, spotlight, filterable); a click opens the image in a full-screen viewer with arrows. */
export function GalleryGrid({ items, columns = 4, aspect = '1/1', gap = 12, lightbox = true, layout = 'grid', captionMode = 'hover' }: {
  items: GalleryImage[]; columns?: number; aspect?: string; gap?: number; lightbox?: boolean; layout?: string; captionMode?: string
}) {
  const [open, setOpen] = useState<number | null>(null)
  const [activeCat, setActiveCat] = useState<string>('__all__')
  const [spotIdx, setSpotIdx] = useState<number>(0)

  const allImages = items.filter((i) => i.image_url)
  const categories = Array.from(new Set(allImages.map((i) => i.category?.trim()).filter(Boolean) as string[]))
  const images = layout === 'filterable' && activeCat !== '__all__'
    ? allImages.filter((i) => i.category?.trim() === activeCat)
    : allImages

  const masonry = aspect === 'masonry' && layout !== 'bento' && layout !== 'spotlight'
  const cols = Math.min(Math.max(columns, 2), 6)

  const renderCaption = (img: GalleryImage) => {
    if (!img.caption || captionMode === 'none') return null
    if (captionMode === 'below') return null
    return (
      <span className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-start text-xs font-semibold text-white ${
        captionMode === 'always' ? 'opacity-100' : 'opacity-0 transition-opacity group-hover:opacity-100'
      }`}>
        {img.caption}
      </span>
    )
  }

  const tile = (img: GalleryImage, i: number, extraCls = '', forceAspect?: string) => (
    <figure key={i} className={`${masonry ? 'mb-[var(--g)] break-inside-avoid' : ''} ${captionMode === 'below' ? 'overflow-hidden rounded-xl bg-white shadow-sm' : ''} ${extraCls}`}>
      <button type="button" disabled={!lightbox} onClick={() => setOpen(i)} aria-label={img.caption || `Görsel ${i + 1}`}
        className={`group relative block w-full overflow-hidden bg-black/5 ${captionMode === 'below' ? '' : 'rounded-xl'} ${layout === 'bento' ? 'h-full' : ''}`}
        style={masonry || layout === 'bento' ? undefined : { aspectRatio: forceAspect || aspect }}>
        <GalleryPicture img={img} className={`w-full transition-transform duration-500 group-hover:scale-105 ${masonry ? '' : 'h-full object-cover'}`} />
        {renderCaption(img)}
      </button>
      {img.caption && captionMode === 'below' && (
        <figcaption className="px-3 py-2 text-center text-xs font-medium text-gray-700">{img.caption}</figcaption>
      )}
    </figure>
  )

  if (layout === 'spotlight') {
    const current = images[spotIdx] || images[0]
    if (!current) return null
    return (
      <>
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-gray-950">
            <button
              type="button"
              disabled={!lightbox}
              onClick={() => setOpen(spotIdx)}
              aria-label={current.caption || 'Görseli büyüt'}
              className="group relative block aspect-[16/9] max-h-[520px] w-full overflow-hidden"
            >
              <GalleryPicture img={current} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
              {current.caption && captionMode !== 'none' && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 text-start text-sm font-medium text-white">
                  {current.caption}
                </div>
              )}
            </button>
            {images.length > 1 && (
              <>
                <button type="button" aria-label="Önceki" onClick={() => setSpotIdx((spotIdx - 1 + images.length) % images.length)}
                  className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3.5 py-2 text-xl text-white backdrop-blur-sm hover:bg-black/70">‹</button>
                <button type="button" aria-label="Sonraki" onClick={() => setSpotIdx((spotIdx + 1) % images.length)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3.5 py-2 text-xl text-white backdrop-blur-sm hover:bg-black/70">›</button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSpotIdx(i)}
                  aria-label={img.caption || `Görsel ${i + 1}`}
                  className={`relative h-16 w-24 flex-none overflow-hidden rounded-lg border-2 transition ${
                    i === spotIdx ? 'border-primary-600 ring-2 ring-primary-200' : 'border-transparent opacity-65 hover:opacity-100'
                  }`}
                >
                  <img src={img.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        {lightbox && <GalleryLightbox images={images} open={open} onClose={() => setOpen(null)} onChange={setOpen} />}
      </>
    )
  }

  return (
    <>
      {layout === 'filterable' && categories.length > 0 && (
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setActiveCat('__all__')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activeCat === '__all__' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tümü
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                activeCat === cat ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
      {layout === 'bento' ? (
        <div className="grid auto-rows-[170px] grid-cols-2 md:auto-rows-[210px] md:grid-cols-4" style={{ gap }}>
          {images.map((img, i) => {
            const span = i === 0 ? 'col-span-2 row-span-2' : i === 3 && images.length >= 5 ? 'md:col-span-2' : ''
            return tile(img, i, span)
          })}
        </div>
      ) : masonry ? (
        <div style={{ columnCount: cols, columnGap: gap, ['--g' as string]: `${gap}px` }} className="max-md:![column-count:2]">{images.map((img, i) => tile(img, i))}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-[repeat(var(--c),minmax(0,1fr))]" style={{ gap, ['--c' as string]: cols }}>{images.map((img, i) => tile(img, i))}</div>
      )}
      {lightbox && <GalleryLightbox images={images} open={open} onClose={() => setOpen(null)} onChange={setOpen} />}
    </>
  )
}

export function CopyButton({ value, label, copied, dark = false }: { value: string; label: string; copied: string; dark?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
        dark
          ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
          : 'border-primary-600 text-primary-700 hover:bg-primary-50'
      }`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value) } catch { /* clipboard blocked: the IBAN stays selectable */ }
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      }}
    >
      {done ? copied : label}
    </button>
  )
}

export function VideoPosterPlayer({
  embedSrc,
  mp4Url,
  posterUrl,
  title,
  aspectCls = 'aspect-video',
}: {
  embedSrc?: string
  mp4Url?: string
  posterUrl?: string
  title?: string
  aspectCls?: string
}) {
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return (
      <div className={`${aspectCls} overflow-hidden rounded-2xl bg-black`}>
        {mp4Url ? (
          <video src={mp4Url} poster={posterUrl} controls autoPlay playsInline className="h-full w-full object-cover" />
        ) : embedSrc ? (
          <iframe
            src={`${embedSrc}${embedSrc.includes('?') ? '&' : '?'}autoplay=1`}
            title={title || 'Video'}
            className="h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : null}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={title ? `${title} — Oynat` : 'Videoyu oynat'}
      className={`group relative block w-full overflow-hidden rounded-2xl bg-gray-950 ${aspectCls}`}
    >
      {posterUrl && (
        <img src={posterUrl} alt={title || ''} className="h-full w-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-105" />
      )}
      <div className="absolute inset-0 bg-black/30 transition group-hover:bg-black/40" />
      <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-2xl text-primary-700 shadow-2xl transition-transform group-hover:scale-110">
        ▶
      </span>
    </button>
  )
}

export function DismissibleNotice({
  id,
  closable,
  editing,
  dark = false,
  children,
}: {
  id: string
  closable?: boolean
  editing?: boolean
  dark?: boolean
  children: ReactNode
}) {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!closable || editing) return
    try {
      if (sessionStorage.getItem(`einfak-notice-${id}`) === '1') setClosed(true)
    } catch { /* ignore */ }
  }, [id, closable, editing])
  if (closed) return null
  return (
    <div className="relative">
      {children}
      {closable && !editing && (
        <button
          type="button"
          aria-label="Kapat"
          onClick={() => {
            setClosed(true)
            try { sessionStorage.setItem(`einfak-notice-${id}`, '1') } catch { /* ignore */ }
          }}
          className={`absolute end-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold transition ${
            dark ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-current/60 hover:bg-black/5 hover:text-current'
          }`}
        >
          ×
        </button>
      )}
    </div>
  )
}

export interface BankAccountItem {
  logo_url?: string
  bank?: string
  branch?: string
  holder?: string
  iban?: string
  account_no?: string
  swift?: string
  reference_hint?: string
  qr_url?: string
  currency?: string
}

const BANK_L10N: Record<string, {
  all: string; copy: string; copied: string; copyShort: string; holder: string; branch: string
  accountNo: string; swift: string; ref: string; bank: string; currency: string
}> = {
  tr: {
    all: 'Tümü', copy: 'IBAN’ı kopyala', copied: 'Kopyalandı ✓', copyShort: 'Kopyala',
    holder: 'Hesap sahibi', branch: 'Şube', accountNo: 'Hesap No', swift: 'SWIFT / BIC',
    ref: 'Açıklama', bank: 'Banka', currency: 'Birim',
  },
  en: {
    all: 'All', copy: 'Copy IBAN', copied: 'Copied ✓', copyShort: 'Copy',
    holder: 'Account holder', branch: 'Branch', accountNo: 'Account No', swift: 'SWIFT / BIC',
    ref: 'Reference', bank: 'Bank', currency: 'Currency',
  },
  ar: {
    all: 'الكل', copy: 'نسخ الآيبان', copied: 'تم النسخ ✓', copyShort: 'نسخ',
    holder: 'صاحب الحساب', branch: 'الفرع', accountNo: 'رقم الحساب', swift: 'SWIFT / BIC',
    ref: 'المرجع', bank: 'البنك', currency: 'العملة',
  },
}

export function BankAccountsView({
  accounts,
  look = 'cards',
  showFilter = false,
  locale = 'tr',
}: {
  accounts: BankAccountItem[]
  look?: string
  showFilter?: boolean
  locale?: string
}) {
  const l = BANK_L10N[locale] || BANK_L10N.tr
  const currencies = Array.from(new Set(accounts.map((a) => a.currency || 'TRY')))
  const [selectedCurrency, setSelectedCurrency] = useState('ALL')
  const useTabs = (look === 'tabs' || showFilter) && currencies.length > 1
  const shown = useTabs && selectedCurrency !== 'ALL' ? accounts.filter((a) => (a.currency || 'TRY') === selectedCurrency) : accounts

  const filterBar = useTabs ? (
    <div className="mb-6 flex flex-wrap justify-center gap-2">
      <button
        type="button"
        onClick={() => setSelectedCurrency('ALL')}
        className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
          selectedCurrency === 'ALL' ? 'bg-primary-700 text-white shadow-sm' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-primary-50'
        }`}
      >
        {l.all}
      </button>
      {currencies.map((cur) => (
        <button
          key={cur}
          type="button"
          onClick={() => setSelectedCurrency(cur)}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
            selectedCurrency === cur ? 'bg-primary-700 text-white shadow-sm' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-primary-50'
          }`}
        >
          {cur}
        </button>
      ))}
    </div>
  ) : null

  if (look === 'table') {
    return (
      <div>
        {filterBar}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[680px] text-left text-sm text-gray-900">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-extrabold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-5 py-3.5">{l.bank}</th>
                <th className="px-4 py-3.5">{l.currency}</th>
                <th className="px-4 py-3.5">{l.holder}</th>
                <th className="px-4 py-3.5">IBAN / {l.accountNo}</th>
                <th className="px-4 py-3.5">{l.swift}</th>
                <th className="px-5 py-3.5 text-end"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((item, i) => (
                <tr key={i} className="hover:bg-primary-50/30">
                  <td className="px-5 py-4 font-bold">
                    <div>{item.bank}</div>
                    {item.branch && <div className="text-xs font-normal text-gray-500">{item.branch}</div>}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">{item.currency || 'TRY'}</span>
                  </td>
                  <td className="px-4 py-4 font-medium">{item.holder || '—'}</td>
                  <td className="px-4 py-4">
                    {item.iban && <code dir="ltr" className="block select-all font-bold text-gray-900">{item.iban}</code>}
                    {item.account_no && <span className="text-xs text-gray-500">{l.accountNo}: {item.account_no}</span>}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-gray-600">{item.swift || '—'}</td>
                  <td className="px-5 py-4 text-end">
                    {(item.iban || item.account_no) && (
                      <CopyButton
                        value={String(item.iban || item.account_no).replace(/\s+/g, '')}
                        label={l.copyShort}
                        copied={l.copied}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (look === 'compact') {
    return (
      <div>
        {filterBar}
        <div className="space-y-3">
          {shown.map((item, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white px-5 py-3.5 text-gray-900 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">{item.currency || 'TRY'}</span>
                <span className="font-heading font-bold">{item.bank}</span>
                {item.holder && <span className="text-sm text-gray-500">· {item.holder}</span>}
                {item.swift && <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-600">{item.swift}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {item.iban && <code dir="ltr" className="select-all text-sm font-bold">{item.iban}</code>}
                {!item.iban && item.account_no && <code dir="ltr" className="select-all text-sm font-bold">{item.account_no}</code>}
                {(item.iban || item.account_no) && (
                  <CopyButton value={String(item.iban || item.account_no).replace(/\s+/g, '')} label={l.copy} copied={l.copied} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const dark = look === 'dark'
  const gridCols = look === 'grid3' ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'

  return (
    <div>
      {filterBar}
      <div className={`grid gap-5 ${gridCols}`}>
        {shown.map((item, i) => (
          <div
            key={i}
            className={`rounded-2xl border p-6 shadow-sm transition ${
              dark
                ? 'border-white/15 bg-primary-950 text-white shadow-xl'
                : 'border-gray-200 bg-white text-gray-900 hover:border-primary-200'
            }`}
          >
            <div className="mb-4 flex items-center gap-3">
              {item.logo_url ? (
                <img src={item.logo_url} alt="" className="h-10 w-auto max-w-[120px] object-contain" loading="lazy" />
              ) : (
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${dark ? 'bg-white/10' : 'bg-primary-50'}`}>🏦</span>
              )}
              <div className="min-w-0">
                <div className="font-heading text-lg font-bold">{item.bank}</div>
                {item.branch && <div className={`text-xs ${dark ? 'text-white/65' : 'text-gray-500'}`}>{l.branch}: {item.branch}</div>}
              </div>
              <span className={`ms-auto rounded-full px-2.5 py-1 text-xs font-bold ${dark ? 'bg-white/15 text-accent-300' : 'bg-primary-50 text-primary-700'}`}>
                {item.currency || 'TRY'}
              </span>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                {item.holder && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <span className={dark ? 'text-white/65' : 'text-gray-500'}>{l.holder}: </span>
                      <span className="font-semibold">{item.holder}</span>
                    </div>
                    <CopyButton value={item.holder} label={l.copyShort} copied={l.copied} dark={dark} />
                  </div>
                )}

                {item.iban && (
                  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${dark ? 'bg-white/10' : 'bg-gray-50'}`}>
                    <code dir="ltr" className="select-all break-all text-[15px] font-bold tracking-wide">{item.iban}</code>
                    <CopyButton value={String(item.iban).replace(/\s+/g, '')} label={l.copy} copied={l.copied} dark={dark} />
                  </div>
                )}

                {item.account_no && (
                  <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${dark ? 'bg-white/5 text-white/90' : 'bg-gray-50 text-gray-700'}`}>
                    <span><b>{l.accountNo}:</b> <code dir="ltr" className="select-all font-bold">{item.account_no}</code></span>
                    <CopyButton value={String(item.account_no).replace(/\s+/g, '')} label={l.copyShort} copied={l.copied} dark={dark} />
                  </div>
                )}

                {item.swift && (
                  <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${dark ? 'bg-white/5 text-white/90' : 'bg-gray-50 text-gray-700'}`}>
                    <span><b>{l.swift}:</b> <code dir="ltr" className="select-all font-mono font-bold">{item.swift}</code></span>
                    <CopyButton value={String(item.swift).replace(/\s+/g, '')} label={l.copyShort} copied={l.copied} dark={dark} />
                  </div>
                )}

                {item.reference_hint && (
                  <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${dark ? 'bg-accent-500/20 text-accent-200' : 'bg-primary-50/70 text-primary-900'}`}>
                    <span><b>{l.ref}:</b> {item.reference_hint}</span>
                    <CopyButton value={item.reference_hint} label={l.copyShort} copied={l.copied} dark={dark} />
                  </div>
                )}
              </div>

              {item.qr_url && (
                <img src={item.qr_url} alt="QR" className="h-24 w-24 shrink-0 rounded-xl border border-gray-200 bg-white p-1 object-contain" loading="lazy" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Pop-up shown once, `delay` seconds after the page opens. Closing it hides it for
 * `hideDays` days (remembered in this browser). The editor draws it in place instead.
 */
export function Popup({
  id,
  delay = 3,
  hideDays = 1,
  size = 'md',
  look = 'modal',
  trigger = 'delay',
  locale = 'tr',
  editing,
  children,
}: {
  id: string
  delay?: number
  hideDays?: number
  size?: string
  look?: string
  trigger?: string
  locale?: string
  editing?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const key = `einfak-popup-${id}`
  useEffect(() => {
    if (editing) return
    try {
      if (hideDays === 0) {
        if (sessionStorage.getItem(key) === '1') return
      } else {
        const until = Number(localStorage.getItem(key) || 0)
        if (until > Date.now()) return
      }
    } catch { /* storage blocked: show it */ }

    if (trigger === 'scroll') {
      const onScroll = () => {
        const doc = document.documentElement
        const total = Math.max(1, doc.scrollHeight - window.innerHeight)
        if (window.scrollY / total >= 0.4) {
          setOpen(true)
          window.removeEventListener('scroll', onScroll)
        }
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => window.removeEventListener('scroll', onScroll)
    }

    if (trigger === 'exit') {
      const onLeave = (e: MouseEvent) => {
        if (e.clientY <= 10) {
          setOpen(true)
          document.removeEventListener('mouseleave', onLeave)
        }
      }
      document.addEventListener('mouseleave', onLeave)
      return () => document.removeEventListener('mouseleave', onLeave)
    }

    const timer = setTimeout(() => setOpen(true), Math.max(0, delay) * 1000)
    return () => clearTimeout(timer)
  }, [editing, key, delay, hideDays, trigger])

  const close = () => {
    setOpen(false)
    try {
      if (hideDays === 0) sessionStorage.setItem(key, '1')
      else localStorage.setItem(key, String(Date.now() + Math.max(1, hideDays) * 86400000))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const closeLabel = locale === 'en' ? 'Close' : locale === 'ar' ? 'إغلاق' : 'Kapat'
  const width = look === 'split' && size === 'md'
    ? 'max-w-3xl'
    : ({ sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size] || 'max-w-lg')

  if (editing) {
    const trigInfo = trigger === 'scroll' ? '%40 kaydırınca' : trigger === 'exit' ? 'çıkış niyetinde' : `${delay} sn sonra`
    return (
      <div className="mx-auto my-4 max-w-2xl rounded-2xl border-2 border-dashed border-blue-300 bg-white p-2 text-gray-900">
        <div className="px-2 pb-1 text-[11px] font-bold text-blue-600">🪟 Açılır pencere ({look}) — sitede {trigInfo} açılır</div>
        <div className="overflow-hidden rounded-xl border">{children}</div>
      </div>
    )
  }
  if (!open) return null

  if (look === 'slide_in') {
    return createPortal(
      <div
        role="dialog"
        aria-modal="false"
        className="fixed bottom-5 end-5 z-[85] w-[calc(100vw-2.5rem)] max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl animate-fade-in"
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) close() }}
      >
        <button type="button" aria-label={closeLabel} onClick={close} className="absolute end-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-xs text-white hover:bg-black/70">✕</button>
        {children}
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[85] flex items-center justify-center p-4 ${look === 'fullscreen' ? 'bg-primary-950/95 backdrop-blur-md' : 'bg-black/55'}`}
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className={`relative w-full ${look === 'fullscreen' ? 'max-w-3xl' : width} max-h-[90vh] overflow-y-auto rounded-2xl bg-white text-gray-900 shadow-2xl animate-fade-in`}
        onClick={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).closest('a')) close() }}
      >
        <button type="button" aria-label={closeLabel} onClick={close} className="absolute end-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">✕</button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function BeforeAfterSlider({
  beforeImage, afterImage, beforeLabel = 'Önce', afterLabel = 'Sonra', aspect = '16/9', initial = 50,
}: {
  beforeImage?: string; afterImage?: string; beforeLabel?: string; afterLabel?: string; aspect?: string; initial?: number
}) {
  const [pos, setPos] = useState(Math.min(90, Math.max(10, Number(initial) || 50)))
  if (!beforeImage && !afterImage) return null
  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gray-900 shadow-lg select-none" style={{ aspectRatio: aspect }}>
      {afterImage && <img src={afterImage} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      {beforeImage && (
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={beforeImage} alt={beforeLabel} className="h-full w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-primary-600 text-xs font-extrabold text-white shadow-lg">
          ⇄
        </div>
      </div>
      {beforeLabel && <span className="pointer-events-none absolute start-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur">{beforeLabel}</span>}
      {afterLabel && <span className="pointer-events-none absolute end-4 top-4 rounded-full bg-primary-600/90 px-3 py-1 text-xs font-bold text-white backdrop-blur">{afterLabel}</span>}
      <input
        type="range" min={5} max={95} value={pos} aria-label="Önce ve sonra karşılaştırma"
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  )
}

export interface VideoItem { title?: string; video_url?: string; thumbnail_url?: string; duration?: string; category?: string }

function embedUrl(raw?: string): string | null {
  if (!raw) return null
  const yt = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1`
  return null
}

export function VideoGalleryGrid({ items, columns = 3 }: { items: VideoItem[]; columns?: number }) {
  const [active, setActive] = useState<VideoItem | null>(null)
  const cols = columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
  return (
    <>
      <div className={`grid gap-6 ${cols}`}>
        {items.map((item, i) => (
          <button key={i} type="button" onClick={() => setActive(item)}
            className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-start shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="relative aspect-video overflow-hidden bg-gray-900">
              {item.thumbnail_url && <img src={item.thumbnail_url} alt={item.title || ''} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/45">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-xl text-primary-700 shadow-lg transition group-hover:scale-110">▶</span>
              </div>
              {item.duration && <span className="absolute bottom-2.5 end-2.5 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-bold text-white">{item.duration}</span>}
            </div>
            <div className="p-4">
              {item.category && <span className="mb-1 inline-block text-[11px] font-bold uppercase tracking-wider text-primary-600">{item.category}</span>}
              {item.title && <h3 className="font-heading text-base font-bold text-gray-900">{item.title}</h3>}
            </div>
          </button>
        ))}
      </div>
      {active && createPortal(
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Kapat" onClick={() => setActive(null)}
              className="absolute end-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">✕</button>
            <div className="aspect-video w-full">
              {embedUrl(active.video_url) ? (
                <iframe src={embedUrl(active.video_url)!} title={active.title || 'Video'} allow="autoplay; encrypted-media" allowFullScreen className="h-full w-full border-0" />
              ) : active.video_url ? (
                <video src={active.video_url} controls autoPlay className="h-full w-full" />
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export function SearchableFaq({ items, showSearch = true, showCategories = false, openFirst = false }: {
  items: { question: string; answerText?: string; category?: string; answerNode: React.ReactNode }[]
  showSearch?: boolean
  showCategories?: boolean
  openFirst?: boolean
}) {
  const [q, setQ] = useState('')
  const [activeCat, setActiveCat] = useState('__all__')
  const categories = Array.from(new Set(items.map((i) => i.category?.trim()).filter(Boolean) as string[]))
  const needle = q.trim().toLocaleLowerCase('tr')
  const filtered = items.filter((i) => {
    if (showCategories && activeCat !== '__all__' && i.category?.trim() !== activeCat) return false
    if (!needle) return true
    return i.question.toLocaleLowerCase('tr').includes(needle) || (i.answerText || '').toLocaleLowerCase('tr').includes(needle)
  })
  return (
    <div className="space-y-4">
      {showCategories && categories.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setActiveCat('__all__')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activeCat === '__all__' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tümü
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                activeCat === cat ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
      {showSearch && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sorularda ara…" aria-label="Sorularda ara"
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15" />
      )}
      <div className="divide-y rounded-2xl border bg-white text-gray-900">
        {filtered.map((item, i) => (
          <details key={i} className="group p-5" open={openFirst && i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-lg font-bold text-gray-900">
              <span className="flex flex-wrap items-center gap-2">
                {item.category && !showCategories && (
                  <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">{item.category}</span>
                )}
                <span>{item.question}</span>
              </span>
              <span className="text-xl text-primary-600 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="mt-3 text-[15px] text-gray-700">{item.answerNode}</div>
          </details>
        ))}
        {!filtered.length && <p className="p-6 text-center text-sm text-gray-500">Eşleşen soru bulunamadı.</p>}
      </div>
    </div>
  )
}

export function NewsletterForm({
  placeholder = 'E-posta adresiniz',
  buttonLabel = 'Abone Ol',
  successText = 'Kaydınız alındı. Teşekkür ederiz!',
  privacyNote,
  dark = false,
}: {
  placeholder?: string
  buttonLabel?: string
  successText?: string
  privacyNote?: string
  dark?: boolean
}) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) return
    setDone(true)
    setEmail('')
  }

  if (done) {
    return (
      <div className={`mx-auto max-w-lg rounded-xl border px-5 py-4 text-center text-sm font-semibold ${dark ? 'border-white/25 bg-white/10 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {successText}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-2.5 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2 ${
            dark
              ? 'border-white/25 bg-white/10 text-white placeholder:text-white/60 focus:border-white focus:ring-white/30'
              : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500/20'
          }`}
        />
        <button
          type="submit"
          className={`shrink-0 rounded-xl px-6 py-3 text-sm font-bold transition ${
            dark ? 'bg-white text-primary-900 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {buttonLabel}
        </button>
      </form>
      {privacyNote && <p className={`mt-2.5 text-center text-xs ${dark ? 'text-white/70' : 'text-gray-500'}`}>{privacyNote}</p>}
    </div>
  )
}
