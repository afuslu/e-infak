'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PublicGalleryItem } from '../../lib/public-content'
import { translator } from '../../lib/i18n'

export function GalleryGrid({ items, locale = 'tr' }: { items: PublicGalleryItem[]; locale?: string }) {
  const t = translator(locale)
  const [kind, setKind] = useState<'all' | 'photo' | 'video'>('all')
  const [album, setAlbum] = useState('')
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const albums = useMemo(() => Array.from(new Set(items.map((i) => i.album).filter(Boolean))) as string[], [items])
  const visible = useMemo(
    () => items.filter((i) => (kind === 'all' || i.kind === kind) && (!album || i.album === album)),
    [items, kind, album],
  )
  const open = openIndex != null ? visible[openIndex] || null : null

  useEffect(() => {
    if (openIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null)
      if (e.key === 'ArrowRight' && visible.length > 1) setOpenIndex((i) => (i == null ? null : (i + 1) % visible.length))
      if (e.key === 'ArrowLeft' && visible.length > 1) setOpenIndex((i) => (i == null ? null : (i - 1 + visible.length) % visible.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIndex, visible.length])

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${active ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'}`

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <button className={chip(kind === 'all')} onClick={() => setKind('all')}>{t('news.all')}</button>
        <button className={chip(kind === 'photo')} onClick={() => setKind('photo')}>{t('gallery.photos')}</button>
        <button className={chip(kind === 'video')} onClick={() => setKind('video')}>{t('gallery.videos')}</button>
        {albums.length > 0 && (
          <select value={album} onChange={(e) => setAlbum(e.target.value)} className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-semibold text-gray-700" aria-label="Albüm">
            <option value="">{t('gallery.allAlbums')}</option>
            {albums.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((item, i) => (
          <button key={item.id} onClick={() => setOpenIndex(i)} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100 text-start" aria-label={item.title}>
            {item.thumbnail_url && <img src={item.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />}
            {item.kind === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-2xl text-white">▶</span>
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 text-sm font-semibold text-white">{item.title}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpenIndex(null)} role="dialog" aria-modal="true" aria-label={open.title}>
          {visible.length > 1 && (
            <>
              <button type="button" aria-label="Önceki" onClick={(e) => { e.stopPropagation(); setOpenIndex((i) => (i == null ? 0 : (i - 1 + visible.length) % visible.length)) }}
                className="absolute start-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white backdrop-blur hover:bg-white/30">‹</button>
              <button type="button" aria-label="Sonraki" onClick={(e) => { e.stopPropagation(); setOpenIndex((i) => (i == null ? 0 : (i + 1) % visible.length)) }}
                className="absolute end-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white backdrop-blur hover:bg-white/30">›</button>
            </>
          )}
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'video' && open.video_embed_url ? (
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                <iframe src={`${open.video_embed_url}?autoplay=1`} title={open.title} className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
              </div>
            ) : (
              open.image_url && <img src={open.image_url} alt={open.title} className="mx-auto max-h-[80vh] rounded-xl" />
            )}
            <div className="mt-3 flex items-center justify-between text-white">
              <span className="font-semibold">
                {open.title}{open.album ? ` · ${open.album}` : ''}
                {visible.length > 1 && <span className="ms-2 text-xs text-white/60">({(openIndex ?? 0) + 1} / {visible.length})</span>}
              </span>
              <button onClick={() => setOpenIndex(null)} className="rounded-lg border border-white/30 px-3 py-1 text-sm hover:bg-white/10">{t('gallery.close')} ✕</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
