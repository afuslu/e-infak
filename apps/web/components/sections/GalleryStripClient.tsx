'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { PublicGalleryItem } from '../../lib/public-content'

interface Props {
  items: PublicGalleryItem[]
  look?: string
  aspect?: string
  speed?: string
  captionMode?: string
  showAlbum?: boolean
  clickAction?: string
  closeLabel?: string
  dark?: boolean
}

const SPEED_DURATION: Record<string, string> = {
  slow: '90s',
  normal: '60s',
  fast: '35s',
}

function stripSizeClass(aspect: string, idx: number): string {
  switch (aspect) {
    case '1/1':
      return 'h-56 w-56 md:h-64 md:w-64'
    case '16/9':
      return 'h-48 w-80 md:h-52 md:w-96'
    case '3/4':
      return 'h-72 w-52 md:h-80 md:w-60'
    case 'mixed':
      return idx % 3 === 0
        ? 'h-56 w-80 md:h-64 md:w-96'
        : idx % 3 === 1
          ? 'h-56 w-56 md:h-64 md:w-64'
          : 'h-56 w-64 md:h-64 md:w-72'
    default:
      return 'h-56 w-72 md:h-64 md:w-80'
  }
}

function gridAspectClass(aspect: string): string {
  switch (aspect) {
    case '1/1':
      return 'aspect-square'
    case '16/9':
      return 'aspect-video'
    case '3/4':
      return 'aspect-[3/4]'
    default:
      return 'aspect-[4/3]'
  }
}

export function GalleryStripClient({
  items,
  look = 'marquee',
  aspect = '4/3',
  speed = 'normal',
  captionMode = 'hover',
  showAlbum = false,
  clickAction = 'lightbox',
  closeLabel = 'Kapat',
  dark = false,
}: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const open = openIndex != null ? items[openIndex] || null : null
  const duration = SPEED_DURATION[speed] || '60s'

  useEffect(() => {
    if (openIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null)
      if (e.key === 'ArrowRight' && items.length > 1) {
        setOpenIndex((i) => (i == null ? null : (i + 1) % items.length))
      }
      if (e.key === 'ArrowLeft' && items.length > 1) {
        setOpenIndex((i) => (i == null ? null : (i - 1 + items.length) % items.length))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIndex, items.length])

  const scrollStrip = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.75, 280), behavior: 'smooth' })
  }

  const renderTile = (g: PublicGalleryItem, idx: number, key: string, extraCls: string) => {
    const src = g.thumbnail_url || g.image_url || ''
    const isPolaroid = look === 'polaroid'

    const mediaContent = (
      <>
        <img
          src={src}
          alt={g.title || ''}
          className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 ${isPolaroid ? 'rounded-md' : ''}`}
          loading="lazy"
        />
        {g.kind === 'video' && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-lg text-white shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
              ▶
            </span>
          </span>
        )}
        {!isPolaroid && showAlbum && g.album && (
          <span className="absolute start-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {g.album}
          </span>
        )}
        {!isPolaroid && captionMode !== 'none' && g.title && (
          <span
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4 text-start text-sm font-semibold text-white transition-opacity ${
              captionMode === 'always' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {g.title}
          </span>
        )}
      </>
    )

    if (isPolaroid) {
      const inner = (
        <div className="flex h-full flex-col">
          <div className="relative flex-1 overflow-hidden rounded-md bg-gray-100">
            {mediaContent}
          </div>
          {(g.title || (showAlbum && g.album)) && (
            <div className="mt-2.5 px-1 text-start">
              {showAlbum && g.album && (
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-primary-600">
                  {g.album}
                </span>
              )}
              {g.title && (
                <span className="block truncate text-sm font-semibold text-gray-800">{g.title}</span>
              )}
            </div>
          )}
        </div>
      )

      const polaroidCls = `group relative block flex-none rounded-xl bg-white p-2.5 pb-3.5 shadow-md ring-1 ring-gray-200/80 transition-transform duration-300 hover:z-10 hover:rotate-0 hover:shadow-xl ${
        idx % 2 === 0 ? '-rotate-1' : 'rotate-1'
      } ${extraCls}`

      return clickAction === 'gallery' ? (
        <Link key={key} href="/galeri" className={polaroidCls}>
          {inner}
        </Link>
      ) : (
        <button
          key={key}
          type="button"
          onClick={() => setOpenIndex(idx)}
          className={polaroidCls}
          aria-label={g.title || 'Görseli büyüt'}
        >
          {inner}
        </button>
      )
    }

    const cls = `group relative block overflow-hidden bg-gray-100 ${extraCls}`

    return clickAction === 'gallery' ? (
      <Link key={key} href="/galeri" className={cls}>
        {mediaContent}
      </Link>
    ) : (
      <button
        key={key}
        type="button"
        onClick={() => setOpenIndex(idx)}
        className={cls}
        aria-label={g.title || 'Görseli büyüt'}
      >
        {mediaContent}
      </button>
    )
  }

  const renderMarqueeTrack = (
    list: PublicGalleryItem[],
    reverse = false,
    filmstrip = false,
  ) => (
    <div className="overflow-x-auto [scrollbar-width:none] motion-safe:overflow-hidden [&::-webkit-scrollbar]:hidden">
      <div
        className={`${reverse ? 'marquee-track-reverse' : 'marquee-track'} flex w-max ${
          filmstrip ? 'gap-1.5 px-2' : 'gap-4 px-6'
        }`}
        style={{ animationDuration: duration }}
      >
        {list.map((g, i) => {
          const origIdx = items.indexOf(g)
          const idx = origIdx >= 0 ? origIdx : i
          return renderTile(
            g,
            idx,
            `${g.id}-${reverse ? 'rev' : 'fwd'}`,
            `flex-none ${filmstrip ? 'rounded-lg' : 'rounded-2xl'} ${stripSizeClass(aspect, i)}`,
          )
        })}
        {list.map((g, i) => {
          const origIdx = items.indexOf(g)
          const idx = origIdx >= 0 ? origIdx : i
          return (
            <span key={`${g.id}-copy-${reverse ? 'rev' : 'fwd'}`} aria-hidden className="contents motion-reduce:hidden">
              {renderTile(
                g,
                idx,
                `${g.id}-copy-${i}`,
                `flex-none ${filmstrip ? 'rounded-lg' : 'rounded-2xl'} ${stripSizeClass(aspect, i)}`,
              )}
            </span>
          )
        })}
      </div>
    </div>
  )

  const renderBody = () => {
    if (look === 'grid') {
      const cols =
        items.length <= 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : items.length === 4
            ? 'grid-cols-2 lg:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
      return (
        <div className="mx-auto max-w-[var(--site-container)] px-6">
          <div className={`grid gap-3.5 sm:gap-4 ${cols}`}>
            {items.map((g, i) =>
              renderTile(g, i, g.id, `w-full rounded-2xl ${gridAspectClass(aspect)}`),
            )}
          </div>
        </div>
      )
    }

    if (look === 'carousel' || look === 'polaroid') {
      const navBtnCls = `flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-colors ${
        dark
          ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`
      return (
        <div className="relative">
          <div
            ref={scrollerRef}
            className={`flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              look === 'polaroid' ? 'items-stretch' : ''
            }`}
          >
            {items.map((g, i) =>
              renderTile(
                g,
                i,
                g.id,
                `snap-start ${look === 'polaroid' ? 'h-72 w-64 md:h-80 md:w-72' : `rounded-2xl ${stripSizeClass(aspect, i)}`}`,
              ),
            )}
          </div>
          {items.length > 2 && (
            <div className="mx-auto mt-2 flex max-w-[var(--site-container)] justify-end gap-2 px-6">
              <button type="button" onClick={() => scrollStrip(-1)} className={navBtnCls} aria-label="Önceki">
                ‹
              </button>
              <button type="button" onClick={() => scrollStrip(1)} className={navBtnCls} aria-label="Sonraki">
                ›
              </button>
            </div>
          )}
        </div>
      )
    }

    if (look === 'dual_marquee') {
      const half = Math.ceil(items.length / 2)
      const row1 = items.length >= 6 ? items.slice(0, half) : items
      const row2 = items.length >= 6 ? items.slice(half) : [...items].reverse()
      return (
        <div className="space-y-4">
          {renderMarqueeTrack(row1, false, false)}
          {renderMarqueeTrack(row2, true, false)}
        </div>
      )
    }

    if (look === 'filmstrip') {
      return (
        <div className="bg-gray-950 py-5">
          {renderMarqueeTrack(items, false, true)}
        </div>
      )
    }

    return renderMarqueeTrack(items, false, false)
  }

  return (
    <>
      {renderBody()}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={open.title || 'Galeri'}
        >
          {items.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Önceki"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenIndex((i) => (i == null ? 0 : (i - 1 + items.length) % items.length))
                }}
                className="absolute start-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white backdrop-blur hover:bg-white/30"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Sonraki"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenIndex((i) => (i == null ? 0 : (i + 1) % items.length))
                }}
                className="absolute end-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white backdrop-blur hover:bg-white/30"
              >
                ›
              </button>
            </>
          )}
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'video' && open.video_embed_url ? (
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                <iframe
                  src={`${open.video_embed_url}?autoplay=1`}
                  title={open.title || 'Video'}
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              (open.image_url || open.thumbnail_url) && (
                <img
                  src={open.image_url || open.thumbnail_url || ''}
                  alt={open.title || ''}
                  className="mx-auto max-h-[80vh] rounded-xl object-contain"
                />
              )
            )}
            <div className="mt-3 flex items-center justify-between text-white">
              <span className="font-semibold">
                {open.title}
                {open.album ? ` · ${open.album}` : ''}
                {items.length > 1 && (
                  <span className="ms-2 text-xs text-white/60">
                    ({(openIndex ?? 0) + 1} / {items.length})
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                className="rounded-lg border border-white/30 px-3 py-1 text-sm hover:bg-white/10"
              >
                {closeLabel} ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
