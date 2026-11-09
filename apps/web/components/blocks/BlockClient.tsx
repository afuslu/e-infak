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

export interface SlideView {
  image_url?: string
  mobile_image_url?: string
  badge?: string
  title?: string
  text?: string
  button_label?: string
  button_url?: string
  button2_label?: string
  button2_url?: string
  align?: 'left' | 'center' | 'right'
  overlay?: number
  campaign?: { slug: string; title: string; collected: string; target: string; progress: number } | null
  donateLabel: string
}

const HEIGHTS: Record<string, string> = { sm: 'min-h-[360px]', md: 'min-h-[480px] md:min-h-[540px]', lg: 'min-h-[560px] md:min-h-[680px]', screen: 'min-h-[calc(100vh-80px)]' }

function SlideButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  const cls = primary
    ? 'rounded-[10px] bg-accent-500 px-7 py-3.5 font-extrabold text-white hover:bg-accent-600'
    : 'rounded-[10px] border-[1.5px] border-white/50 px-7 py-3.5 font-semibold text-white hover:border-white'
  return href.startsWith('/') ? <Link href={href} className={cls}>{label}</Link> : <a href={href} className={cls} target="_blank" rel="noopener noreferrer">{label}</a>
}

export function Slider({ slides, height = 'md', autoplay = true, interval = 6, effect = 'slide', arrows = true, dots = true, editing = false }: {
  slides: SlideView[]; height?: string; autoplay?: boolean; interval?: number; effect?: string; arrows?: boolean; dots?: boolean; editing?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  useEffect(() => {
    if (!autoplay || paused || editing || count < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(2, interval) * 1000)
    return () => clearInterval(timer)
  }, [autoplay, paused, editing, count, interval])
  useEffect(() => { if (index >= count) setIndex(0) }, [count, index])
  if (!count) return null
  const go = (i: number) => setIndex((i + count) % count)

  return (
    <section className={`relative overflow-hidden bg-primary-950 ${HEIGHTS[height] || HEIGHTS.md}`} aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className={effect === 'fade' ? 'relative h-full' : 'flex h-full transition-transform duration-700 ease-out'}
        style={effect === 'fade' ? undefined : { transform: `translateX(-${index * 100}%)` }}>
        {slides.map((s, i) => {
          const align = s.align === 'center' ? 'items-center text-center' : s.align === 'right' ? 'items-end text-end' : 'items-start text-start'
          return (
            <div key={i} aria-hidden={i !== index}
              className={`${effect === 'fade' ? `absolute inset-0 transition-opacity duration-700 ${i === index ? 'opacity-100' : 'pointer-events-none opacity-0'}` : 'relative w-full flex-none'} ${HEIGHTS[height] || HEIGHTS.md}`}>
              {s.image_url && (
                <picture>
                  {s.mobile_image_url && <source media="(max-width: 639px)" srcSet={s.mobile_image_url} />}
                  <img src={s.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
                </picture>
              )}
              <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 45) / 100})` }} />
              <div className={`relative mx-auto flex h-full max-w-[var(--site-container)] flex-col justify-center px-6 py-16 ${align} ${HEIGHTS[height] || HEIGHTS.md}`}>
                <div className="max-w-2xl">
                  {s.badge && <span className="mb-5 inline-block rounded-full border border-white/40 bg-white/10 px-4 py-1.5 text-[13px] font-bold tracking-[2px] text-white">{s.badge}</span>}
                  {s.title && <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-white md:text-5xl">{s.title}</h2>}
                  {s.text && <p className="mb-7 text-lg leading-relaxed text-white/85">{s.text}</p>}
                  {s.campaign && (
                    <div className="mb-6 max-w-md rounded-xl bg-white/10 p-4 text-start text-white backdrop-blur">
                      <div className="mb-2 flex justify-between text-sm font-semibold"><span>{s.campaign.collected}</span><span className="opacity-75">{s.campaign.target}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-accent-400" style={{ width: `${Math.min(s.campaign.progress, 100)}%` }} /></div>
                    </div>
                  )}
                  <div className={`flex flex-wrap gap-3 ${s.align === 'center' ? 'justify-center' : s.align === 'right' ? 'justify-end' : ''}`}>
                    {s.campaign && <SlideButton href={`/kampanyalar/${s.campaign.slug}`} label={s.button_label || s.donateLabel} primary />}
                    {!s.campaign && s.button_label && s.button_url && <SlideButton href={s.button_url} label={s.button_label} primary />}
                    {s.button2_label && s.button2_url && <SlideButton href={s.button2_url} label={s.button2_label} />}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {arrows && count > 1 && (
        <>
          <button type="button" aria-label="Önceki" onClick={() => go(index - 1)} className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-3 text-xl text-white hover:bg-black/50">‹</button>
          <button type="button" aria-label="Sonraki" onClick={() => go(index + 1)} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-3 text-xl text-white hover:bg-black/50">›</button>
        </>
      )}
      {dots && count > 1 && (
        <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`${i + 1}. slayt`} onClick={() => go(i)}
              className={`h-2.5 rounded-full transition-all ${i === index ? 'w-7 bg-white' : 'w-2.5 bg-white/50'}`} />
          ))}
        </div>
      )}
    </section>
  )
}

export interface NavLinkView { label: string; url?: string; new_tab?: boolean; group?: string }
export interface NavItemView extends NavLinkView { mega?: boolean; children?: NavLinkView[] }

function MenuAnchor({ link, className, onClick }: { link: NavLinkView; className: string; onClick?: () => void }) {
  if (!link.url) return <span className={className}>{link.label}</span>
  if (link.url.startsWith('/') && !link.new_tab) return <Link href={link.url} className={className} onClick={onClick}>{link.label}</Link>
  return <a href={link.url} className={className} target={link.new_tab ? '_blank' : undefined} rel="noopener noreferrer" onClick={onClick}>{link.label}</a>
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
