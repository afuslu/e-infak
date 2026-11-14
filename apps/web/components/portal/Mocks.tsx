'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { GripVertical, Maximize2, X } from 'lucide-react'

/**
 * Small replicas of real panel screens and interactive screenshot previews for the landing page.
 */

export function Frame({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-2xl border border-pt-line bg-pt-card pt-shadow ${className}`}>
      <div className="flex items-center gap-2 border-b border-pt-line bg-pt-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 rounded-full bg-pt-line" />
        <span className="ml-2 truncate text-[11px] font-semibold text-pt-faint">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

export function MockBuilder() {
  return (
    <Frame title="panel · Site Yapıcı">
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-2 space-y-1.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-pt-faint">Sayfa blokları</p>
          {[
            ['Hero & Slider', true],
            ['Bağış kalemleri', false],
            ['Kurban hisse', false],
            ['Sayılarla etki', false],
            ['Haberler', false],
          ].map(([block, active]) => (
            <div key={String(block)} className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${active ? 'border-pt-brand bg-pt-brand-soft text-pt-brand' : 'border-pt-line bg-pt-bg text-pt-text'}`}>
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 text-pt-faint" />{block}
              </span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-pt-brand" />}
            </div>
          ))}
        </div>
        <div className="col-span-3 space-y-2.5 rounded-xl border border-pt-line bg-pt-bg p-3">
          <div className="flex items-center justify-between rounded-lg bg-pt-brand px-3 py-2.5 text-white">
            <div>
              <div className="text-[10px] font-semibold opacity-80">dernekadi.org</div>
              <div className="text-xs font-bold">Bir iyilik başlatın</div>
            </div>
            <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-bold">Bağış yap</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {['Su Kuyusu', 'Yetim Bursu', 'Kumanya'].map((title) => (
              <div key={title} className="rounded-lg border border-pt-line bg-pt-card p-2">
                <div className="mb-1.5 h-5 rounded bg-pt-soft" />
                <div className="truncate text-[10px] font-bold text-pt-text">{title}</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pt-soft">
                  <div className="h-full w-2/3 rounded-full bg-pt-brand" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-pt-line bg-pt-soft px-2.5 py-1.5 text-[10px] text-pt-muted">
            <span>3D Secure · Makbuz Doğrulama</span>
            <span className="font-bold text-pt-brand">Yayında</span>
          </div>
        </div>
      </div>
    </Frame>
  )
}

/** A real panel screenshot (made-up demo data) in the day and night theme with click-to-zoom lightbox. */
export function Screenshot({ name, title, alt, priority }: { name: string; title: string; alt: string; priority?: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const img = (theme: 'light' | 'dark', full = false) => (
    <img src={`/images/e-infak/screens/${name}-${theme}.webp`} alt={theme === 'light' ? alt : ''} aria-hidden={theme === 'dark' ? true : undefined}
      width={1280} height={800} loading={priority || full ? 'eager' : 'lazy'} decoding="async"
      className={`${theme === 'light' ? 'pt-light-only' : 'pt-dark-only'} block h-auto w-full`} />
  )

  return (
    <>
      <figure className="group relative overflow-hidden rounded-2xl border border-pt-line bg-pt-card pt-shadow">
        <div className="flex items-center justify-between gap-2 border-b border-pt-line bg-pt-soft px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-pt-line" /><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-pt-line" />
            <span className="ml-2 truncate text-[11px] font-semibold text-pt-faint">{title}</span>
          </div>
          <button type="button" onClick={() => setOpen(true)} aria-label={`${title} ekranını büyüt`}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-pt-faint transition-colors hover:bg-pt-card hover:text-pt-text">
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Büyüt</span>
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-zoom-in text-left" aria-label={`${title} ekran görüntüsünü tam boyut incele`}>
          {img('light')}
          {img('dark')}
        </button>
      </figure>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-5xl overflow-hidden rounded-2xl border border-pt-line bg-pt-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-pt-line bg-pt-soft px-4 py-3">
              <span className="text-xs font-bold text-pt-text">{title}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Önizlemeyi kapat"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-pt-line text-pt-muted hover:border-pt-brand hover:text-pt-text">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[82vh] overflow-auto">
              {img('light', true)}
              {img('dark', true)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
