'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Horizontal card carousel: native scroll-snap (swipe and trackpad work without JS),
 * with arrow buttons that page through it. `items` sets the card width per breakpoint.
 */
export function Carousel({ children, items = 'w-[85%] sm:w-[46%] lg:w-[31.5%]', label, tone = 'light' }: {
  children: ReactNode; items?: string; label: string; tone?: 'light' | 'dark'
}) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft)
    setEdges({ start: pos < 8, end: pos + el.clientWidth >= el.scrollWidth - 8 })
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  const page = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.9, behavior: reduced ? 'auto' : 'smooth' })
  }

  const arrow = tone === 'dark'
    ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
    : 'border-gray-200 bg-white text-gray-700 shadow-sm hover:border-primary-600 hover:text-primary-700'

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={label}>
      <div ref={track} onScroll={update}
        className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-px-6 px-6 pb-6 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Children.map(children, (child) => <div className={`flex-none snap-start ${items}`}>{child}</div>)}
      </div>
      {!(edges.start && edges.end) && (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" aria-label="Önceki" disabled={edges.start} onClick={() => page(-1)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition disabled:opacity-30 ${arrow}`}>
            <span className="rtl:rotate-180">‹</span>
          </button>
          <button type="button" aria-label="Sonraki" disabled={edges.end} onClick={() => page(1)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition disabled:opacity-30 ${arrow}`}>
            <span className="rtl:rotate-180">›</span>
          </button>
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
