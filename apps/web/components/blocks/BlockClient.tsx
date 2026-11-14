'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Entrance animation: content stays visible without JavaScript; with it, animates when scrolled into view. */
export function Reveal({ animation, delay, duration, children }: { animation: string; delay?: number; duration?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'ready' | 'in'>('idle')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setState('ready')
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState('in')
        observer.disconnect()
      }
    }, { threshold: 0.12 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className={state === 'idle' ? '' : `b-anim b-anim-${animation} ${state === 'in' ? 'is-in' : ''}`}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, animationDuration: duration ? `${duration}ms` : undefined }}>
      {children}
    </div>
  )
}

/** The slider lives with the site components; the builder's slider block uses the same one. */
export { Slider, type SlideView } from '../site/Slider'

export interface NavLinkView { label: string; url?: string; new_tab?: boolean; group?: string; badge?: string }
export interface NavItemView extends NavLinkView { mega?: boolean; children?: NavLinkView[] }

function MenuAnchor({ link, className, onClick }: { link: NavLinkView; className: string; onClick?: () => void }) {
  const label = (
    <>
      {link.label}
      {link.badge && (
        <span className="ms-1.5 rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-700">
          {link.badge}
        </span>
      )}
    </>
  )
  if (!link.url) return <span className={className}>{label}</span>
  if (link.url.startsWith('/') && !link.new_tab) return <Link href={link.url} className={className} onClick={onClick}>{label}</Link>
  return <a href={link.url} className={className} target={link.new_tab ? '_blank' : undefined} rel="noopener noreferrer" onClick={onClick}>{label}</a>
}

/**
 * ☰ button and slide-in menu used by the Menü block below the desktop breakpoint.
 * The panel is portalled to <body>: a header row with backdrop-blur or a transform
 * would otherwise become the containing block of `position: fixed` and clip it.
 */
export function MobileMenu({ items, label, donate, extra }: {
  items: NavItemView[]; label: string; donate?: { label: string; url: string } | null; extra?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onKey) }
  }, [open])
  const close = () => setOpen(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-sm font-semibold">
        <span aria-hidden>☰</span>{label}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={label}>
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <nav className="absolute inset-y-0 end-0 flex w-[min(86vw,340px)] flex-col gap-1 overflow-y-auto bg-white p-4 text-gray-900 shadow-2xl animate-fade-in">
            <button type="button" onClick={close} className="mb-2 self-end rounded-md px-2 py-1 text-lg text-gray-500 hover:bg-gray-100" aria-label="Kapat">✕</button>
            {items.map((item, i) => item.children?.length ? (
              <details key={i} className="group rounded-lg">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 font-semibold hover:bg-gray-50">
                  {item.label}<span className="text-xs transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="ms-3 flex flex-col border-s ps-2">
                  {item.url && <MenuAnchor link={item} onClick={close} className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-gray-50" />}
                  {item.children.map((child, j) => <MenuAnchor key={j} link={child} onClick={close} className="rounded-md px-3 py-2 text-sm hover:bg-gray-50" />)}
                </div>
              </details>
            ) : (
              <MenuAnchor key={i} link={item} onClick={close} className="rounded-lg px-3 py-2.5 font-semibold hover:bg-gray-50" />
            ))}
            {extra && <div className="px-3 py-2">{extra}</div>}
            {donate && (
              <MenuAnchor link={{ label: donate.label, url: donate.url }} onClick={close}
                className="mt-3 rounded-lg bg-primary-600 px-4 py-3 text-center font-bold text-white hover:bg-primary-700" />
            )}
          </nav>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Marks a sticky header row as stuck once the page is scrolled (smaller height and a shadow). */
export function StickyShrink() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const row = ref.current?.closest('.hrow-sticky')
    if (!row) return
    const onScroll = () => row.classList.toggle('is-stuck', window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return <span ref={ref} hidden />
}
