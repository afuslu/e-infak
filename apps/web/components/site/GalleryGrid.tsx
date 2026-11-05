'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PublicGalleryItem } from '../../lib/public-content'
import { translator } from '../../lib/i18n'

export function GalleryGrid({ items, locale = 'tr' }: { items: PublicGalleryItem[]; locale?: string }) {
  const t = translator(locale)
  const [kind, setKind] = useState<'all' | 'photo' | 'video'>('all')
  const [album, setAlbum] = useState('')
  const [open, setOpen] = useState<PublicGalleryItem | null>(null)

  const albums = useMemo(() => Array.from(new Set(items.map((i) => i.album).filter(Boolean))) as string[], [items])
  const visible = items.filter((i) => (kind === 'all' || i.kind === kind) && (!album || i.album === album))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm font-semibold ${active ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-[#3A4540]'}`

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <button className={chip(kind === 'all')} onClick={() => setKind('all')}>{t('news.all')}</button>
        <button className={chip(kind === 'photo')} onClick={() => setKind('photo')}>{t('gallery.photos')}</button>
        <button className={chip(kind === 'video')} onClick={() => setKind('video')}>{t('gallery.videos')}</button>
        {albums.length > 0 && (
          <select value={album} onChange={(e) => setAlbum(e.target.value)} className="rounded-full border bg-white px-4 py-1.5 text-sm font-semibold" aria-label="Albüm">
            <option value="">{t('gallery.allAlbums')}</option>
            {albums.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((item) => (
          <button key={item.id} onClick={() => setOpen(item)} className="group relative aspect-square overflow-hidden rounded-xl bg-[#E4E9E2] text-left" aria-label={item.title}>
            {item.thumbnail_url && <img src={item.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />}
            {item.kind === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-2xl text-white">▶</span>
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-semibold text-white">{item.title}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={open.title}>
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
              <span className="font-semibold">{open.title}{open.album ? ` · ${open.album}` : ''}</span>
              <button onClick={() => setOpen(null)} className="rounded-lg border border-white/30 px-3 py-1 text-sm">{t('gallery.close')} ✕</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
