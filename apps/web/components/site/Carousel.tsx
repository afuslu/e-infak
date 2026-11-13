'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Horizontal card carousel: native scroll-snap (swipe and trackpad work without JS),
 * with arrow buttons that page through it. `items` sets the card width per breakpoint.
 */
export function Carousel({
  children, items = 'w-[85%] sm:w-[46%] lg:w-[31.5%]', label, tone = 'light',
  autoplay = false, interval = 5, dots = false, arrowPos = 'bottom', editing = false,
}: {
  children: ReactNode; items?: string; label: string; tone?: 'light' | 'dark'
  autoplay?: boolean; interval?: number; dots?: boolean; arrowPos?: 'bottom' | 'sides'; editing?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const [paused, setPaused] = useState(false)
  const [pageIdx, setPageIdx] = useState(0)
  const [pageCount, setPageCount] = useState(1)

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft)
    setEdges({ start: pos < 8, end: pos + el.clientWidth >= el.scrollWidth - 8 })
    const pages = Math.max(1, Math.ceil(el.scrollWidth / Math.max(el.clientWidth, 1)))
    setPageCount(pages)
    const maxScroll = Math.max(el.scrollWidth - el.clientWidth, 1)
    setPageIdx(Math.min(pages - 1, Math.round((pos / maxScroll) * (pages - 1))))
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update, children])

  const page = useCallback((dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = reduced ? 'auto' : 'smooth'
    if (dir === 1 && Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 8) {
      el.scrollTo({ left: 0, behavior })
      return
    }
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.9, behavior })
  }, [])

  useEffect(() => {
    if (!autoplay || paused || editing || edges.start && edges.end) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ms = Math.max(2, Number(interval) || 5) * 1000
    const timer = setInterval(() => page(1), ms)
    return () => clearInterval(timer)
  }, [autoplay, interval, paused, editing, edges.start, edges.end, page])

  const goToPage = (p: number) => {
    const el = track.current
    if (!el || pageCount <= 1) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const maxScroll = el.scrollWidth - el.clientWidth
    const target = (p / (pageCount - 1)) * maxScroll
    el.scrollTo({ left: rtl ? -target : target, behavior: 'smooth' })
  }

  const arrow = tone === 'dark'
    ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
    : 'border-gray-200 bg-white text-gray-700 shadow-md hover:border-primary-600 hover:text-primary-700'

  const hasOverflow = !(edges.start && edges.end)

  return (
    <div
      className="group/carousel relative"
      role="region" aria-roledescription="carousel" aria-label={label}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
    >
      <div ref={track} onScroll={update}
        className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-px-6 px-6 pb-6 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Children.map(children, (child) => <div className={`flex-none snap-start ${items}`}>{child}</div>)}
      </div>

      {hasOverflow && arrowPos === 'sides' && (
        <>
          <button type="button" aria-label="Önceki" disabled={edges.start} onClick={() => page(-1)}
            className={`absolute -start-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border text-xl transition disabled:opacity-0 sm:flex ${arrow}`}>
            <span className="rtl:rotate-180">‹</span>
          </button>
          <button type="button" aria-label="Sonraki" onClick={() => page(1)}
            className={`absolute -end-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border text-xl transition sm:flex ${arrow}`}>
            <span className="rtl:rotate-180">›</span>
          </button>
        </>
      )}

      {hasOverflow && (arrowPos === 'bottom' || dots) && (
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {dots && pageCount > 1 && Array.from({ length: pageCount }).map((_, i) => (
              <button key={i} type="button" aria-label={`${i + 1}. sayfa`} onClick={() => goToPage(i)}
                className={`h-2 rounded-full transition-all ${i === pageIdx ? `w-7 ${tone === 'dark' ? 'bg-white' : 'bg-primary-600'}` : `w-2 ${tone === 'dark' ? 'bg-white/30' : 'bg-gray-300'}`}`} />
            ))}
          </div>
          <div className={`flex gap-2 ${arrowPos === 'sides' ? 'sm:hidden' : ''}`}>
            <button type="button" aria-label="Önceki" disabled={edges.start} onClick={() => page(-1)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition disabled:opacity-30 ${arrow}`}>
              <span className="rtl:rotate-180">‹</span>
            </button>
            <button type="button" aria-label="Sonraki" onClick={() => page(1)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition ${arrow}`}>
              <span className="rtl:rotate-180">›</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Counts up to `value` when scrolled into view; renders the final number without JS. */
export function CountUp({ value, locale, suffix = '' }: { value: number; locale: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const el = ref.current
    if (!el || !value || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setShown(0)
    let frame = 0
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min((now - start) / 1600, 1)
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
        if (p < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])
  return <span ref={ref}>{shown.toLocaleString(locale)}{suffix}</span>
}
