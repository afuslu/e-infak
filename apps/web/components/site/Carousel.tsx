'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Horizontal card carousel: native scroll-snap (swipe and trackpad work without JS),
 * with arrow buttons that page through it. `items` sets the card width per breakpoint.
 */
export function Carousel({
  children, items = 'w-[85%] sm:w-[46%] lg:w-[31.5%]', label, tone = 'light',
  autoplay = false, interval = 5, dots = false, arrows = true, arrowPos = 'bottom', arrowStyle = 'round',
  nav, loop = true, showPause = true, gap = 'md',
  pauseOnHover = true, mode = 'default', speed = 20, editing = false,
}: {
  children: ReactNode; items?: string; label: string; tone?: 'light' | 'dark'
  autoplay?: boolean; interval?: number; dots?: boolean; arrows?: boolean; arrowPos?: 'bottom' | 'sides'
  arrowStyle?: 'round' | 'square' | 'minimal'; nav?: 'dots' | 'progress' | 'numbers' | 'none'
  loop?: boolean; showPause?: boolean; gap?: 'sm' | 'md' | 'lg'; pauseOnHover?: boolean
  mode?: 'default' | 'center' | 'coverflow' | 'ticker' | 'deck'; speed?: number; editing?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const drag = useRef<{ down: boolean; startX: number; scrollLeft: number; moved: boolean }>({ down: false, startX: 0, scrollLeft: 0, moved: false })
  const [edges, setEdges] = useState({ start: true, end: false })
  const [paused, setPaused] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [pageIdx, setPageIdx] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [activeIdx, setActiveIdx] = useState(0)
  const [deckIdx, setDeckIdx] = useState(0)
  const [reduced, setReduced] = useState(false)

  const navMode = nav || (dots ? 'dots' : 'none')
  const childList = Children.toArray(children)
  const childCount = childList.length

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(q.matches)
    const onChange = () => setReduced(q.matches)
    q.addEventListener('change', onChange)
    return () => q.removeEventListener('change', onChange)
  }, [])

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft)
    setEdges({ start: pos < 8, end: pos + el.clientWidth >= el.scrollWidth - 8 })
    const pages = Math.max(1, Math.ceil(el.scrollWidth / Math.max(el.clientWidth, 1)))
    setPageCount(pages)
    const maxScroll = Math.max(el.scrollWidth - el.clientWidth, 1)
    setPageIdx(Math.min(pages - 1, Math.round((pos / maxScroll) * (pages - 1))))

    if (mode === 'center' || mode === 'coverflow') {
      const centerX = el.scrollLeft + el.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      itemRefs.current.forEach((node, idx) => {
        if (!node) return
        const nodeCenter = node.offsetLeft + node.offsetWidth / 2
        const dist = Math.abs(nodeCenter - centerX)
        if (dist < bestDist) {
          bestDist = dist
          best = idx
        }
      })
      setActiveIdx(best)
    }
  }, [mode])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update, children])

  const page = useCallback((dir: 1 | -1) => {
    if (mode === 'deck') {
      setDeckIdx((i) => (i + dir + Math.max(childCount, 1)) % Math.max(childCount, 1))
      return
    }
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const behavior = reduced ? 'auto' : 'smooth'
    const pos = Math.abs(el.scrollLeft)
    const atEnd = pos + el.clientWidth >= el.scrollWidth - 8
    const atStart = pos < 8
    if (dir === 1 && atEnd) {
      if (loop) el.scrollTo({ left: 0, behavior })
      return
    }
    if (dir === -1 && atStart) {
      if (loop) el.scrollTo({ left: (rtl ? -1 : 1) * (el.scrollWidth - el.clientWidth), behavior })
      return
    }
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.9, behavior })
  }, [mode, childCount, reduced, loop])

  useEffect(() => {
    if (!autoplay || paused || userPaused || editing || reduced) return
    if (mode !== 'deck' && edges.start && edges.end) return
    if (mode === 'deck' && childCount < 2) return
    const ms = Math.max(2, Number(interval) || 5) * 1000
    const timer = setInterval(() => page(1), ms)
    return () => clearInterval(timer)
  }, [autoplay, interval, paused, userPaused, editing, reduced, edges.start, edges.end, mode, childCount, page])

  const goToPage = (p: number) => {
    if (mode === 'deck') {
      setDeckIdx(p)
      return
    }
    const el = track.current
    if (!el || pageCount <= 1) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    const maxScroll = el.scrollWidth - el.clientWidth
    const target = (p / (pageCount - 1)) * maxScroll
    el.scrollTo({ left: rtl ? -target : target, behavior: reduced ? 'auto' : 'smooth' })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
    page((e.key === 'ArrowRight') !== rtl ? 1 : -1)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    const el = track.current
    if (!el) return
    drag.current = { down: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: false }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const el = track.current
    if (!drag.current.down || !el) return
    const x = e.pageX - el.offsetLeft
    if (Math.abs(x - drag.current.startX) > 6) drag.current.moved = true
    el.scrollLeft = drag.current.scrollLeft - (x - drag.current.startX)
  }
  const onMouseUpOrLeave = () => { drag.current.down = false }
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      drag.current.moved = false
    }
  }

  const gapCls = gap === 'sm' ? 'gap-3' : gap === 'lg' ? 'gap-8' : 'gap-6'
  const shapeCls = arrowStyle === 'square' ? 'rounded-xl' : arrowStyle === 'minimal' ? 'rounded-lg border-transparent shadow-none' : 'rounded-full'
  const arrow = tone === 'dark'
    ? `border-white/25 bg-white/10 text-white hover:bg-white/20 ${shapeCls}`
    : `border-gray-200 bg-white text-gray-700 shadow-md hover:border-primary-600 hover:text-primary-700 ${shapeCls}`

  const renderPauseBtn = () => {
    if (!showPause || !autoplay || editing || childCount < 2) return null
    return (
      <button
        type="button"
        onClick={() => setUserPaused((v) => !v)}
        aria-label={userPaused ? 'Otomatik kaydırmayı başlat' : 'Otomatik kaydırmayı duraklat'}
        title={userPaused ? 'Başlat' : 'Duraklat'}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition ${
          tone === 'dark' ? 'border-white/25 bg-white/10 text-white hover:bg-white/20' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-500 hover:text-primary-700'
        }`}
      >
        {userPaused ? '▶' : '❚❚'}
      </button>
    )
  }

  const renderNavBar = (total: number, current: number, onSelect: (i: number) => void, showSideArrowsFallback: boolean) => {
    const showBottomArrows = arrows && (arrowPos === 'bottom' || showSideArrowsFallback)
    if (navMode === 'none' && !showBottomArrows && !(showPause && autoplay)) return null
    return (
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          {navMode === 'dots' && total > 1 && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <button key={i} type="button" aria-label={`${i + 1}. sayfa`} onClick={() => onSelect(i)}
                  className={`h-2 rounded-full transition-all ${i === current ? `w-7 ${tone === 'dark' ? 'bg-white' : 'bg-primary-600'}` : `w-2 ${tone === 'dark' ? 'bg-white/30' : 'bg-gray-300'}`}`} />
              ))}
            </div>
          )}
          {navMode === 'progress' && total > 1 && (
            <div className={`h-1.5 w-full max-w-xs overflow-hidden rounded-full ${tone === 'dark' ? 'bg-white/20' : 'bg-gray-200'}`}>
              <div className={`h-full rounded-full transition-all duration-300 ${tone === 'dark' ? 'bg-white' : 'bg-primary-600'}`}
                style={{ width: `${((current + 1) / total) * 100}%` }} />
            </div>
          )}
          {navMode === 'numbers' && total > 1 && (
            <div className={`flex items-center gap-2 text-xs font-bold ${tone === 'dark' ? 'text-white' : 'text-gray-700'}`}>
              <span className="font-heading text-sm text-primary-600">{String(current + 1).padStart(2, '0')}</span>
              <span className="opacity-40">/</span>
              <span className="font-heading opacity-60">{String(total).padStart(2, '0')}</span>
            </div>
          )}
          {renderPauseBtn()}
        </div>
        {showBottomArrows && (
          <div className={`flex gap-2 ${arrowPos === 'sides' && !showSideArrowsFallback ? 'sm:hidden' : ''}`}>
            <button type="button" aria-label="Önceki" disabled={!loop && edges.start && mode !== 'deck'} onClick={() => page(-1)}
              className={`flex h-10 w-10 items-center justify-center border text-xl transition disabled:opacity-30 ${arrow}`}>
              <span className="rtl:rotate-180">‹</span>
            </button>
            <button type="button" aria-label="Sonraki" disabled={!loop && edges.end && mode !== 'deck'} onClick={() => page(1)}
              className={`flex h-10 w-10 items-center justify-center border text-xl transition disabled:opacity-30 ${arrow}`}>
              <span className="rtl:rotate-180">›</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  const hasOverflow = !(edges.start && edges.end)

  if (mode === 'ticker') {
    const duration = Math.max(6, Number(speed) || 20)
    const repeatCount = childCount > 0 && childCount < 4 ? 4 : 2
    const repeated = Array.from({ length: repeatCount }).flatMap(() => childList)
    return (
      <div
        className="group/carousel relative overflow-hidden py-2"
        role="region" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => pauseOnHover && setPaused(true)} onMouseLeave={() => setPaused(false)}
      >
        <div
          className={`flex w-max ${gapCls}`}
          style={{
            animation: editing || reduced ? 'none' : `einfak-ticker ${duration}s linear infinite`,
            animationPlayState: paused || userPaused ? 'paused' : 'running',
          }}
        >
          {repeated.map((child, i) => (
            <div key={i} className={`flex-none ${items}`}>{child}</div>
          ))}
        </div>
        <style>{`@keyframes einfak-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </div>
    )
  }

  if (mode === 'deck') {
    const safeIdx = deckIdx % Math.max(childCount, 1)
    return (
      <div
        className="group/carousel relative mx-auto max-w-xl py-4"
        role="region" aria-roledescription="carousel" aria-label={label} tabIndex={-1}
        onMouseEnter={() => pauseOnHover && setPaused(true)} onMouseLeave={() => setPaused(false)}
        onKeyDown={onKeyDown}
      >
        <div className="relative min-h-[380px] sm:min-h-[420px]">
          {childList.map((child, idx) => {
            const rel = (idx - safeIdx + childCount) % childCount
            const visible = rel <= 3
            const tx = rel * 14
            const ty = rel * 8
            const sc = 1 - rel * 0.05
            const rot = rel === 0 ? 0 : rel % 2 === 1 ? 1.5 : -1.5
            return (
              <div
                key={idx}
                onClick={() => rel !== 0 && setDeckIdx(idx)}
                className={`absolute inset-x-0 top-0 transition-all duration-500 ease-out ${
                  rel === 0 ? 'z-30 opacity-100' : visible ? 'cursor-pointer opacity-90' : 'pointer-events-none opacity-0'
                }`}
                style={{
                  zIndex: Math.max(0, 30 - rel),
                  transform: `translate3d(${tx}px, ${ty}px, 0) scale(${sc}) rotate(${rot}deg)`,
                  opacity: rel === 0 ? 1 : visible ? Math.max(0.45, 1 - rel * 0.22) : 0,
                }}
              >
                {child}
              </div>
            )
          })}
        </div>
        {renderNavBar(childCount, safeIdx, setDeckIdx, true)}
      </div>
    )
  }

  return (
    <div
      className={`group/carousel relative ${mode === 'coverflow' ? '[perspective:1200px]' : ''}`}
      role="region" aria-roledescription="carousel" aria-label={label} tabIndex={-1}
      onMouseEnter={() => pauseOnHover && setPaused(true)} onMouseLeave={() => { setPaused(false); onMouseUpOrLeave() }}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div
        ref={track}
        onScroll={update}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUpOrLeave}
        onClickCapture={onClickCapture}
        className={`-mx-6 flex snap-x snap-mandatory ${gapCls} overflow-x-auto scroll-px-6 px-6 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing ${mode === 'center' || mode === 'coverflow' ? 'items-center' : ''}`}
      >
        {childList.map((child, idx) => {
          const offset = idx - activeIdx
          const isCenter = mode === 'center'
          const isCoverflow = mode === 'coverflow'
          const activeStyle = isCoverflow
            ? {
                transform: offset === 0 ? 'rotateY(0deg) scale(1)' : `rotateY(${offset < 0 ? 16 : -16}deg) scale(0.88)`,
                opacity: offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.78 : 0.55,
              }
            : isCenter
              ? {
                  transform: offset === 0 ? 'scale(1)' : 'scale(0.92)',
                  opacity: offset === 0 ? 1 : 0.75,
                }
              : undefined
          return (
            <div
              key={idx}
              ref={(el) => { itemRefs.current[idx] = el }}
              style={activeStyle}
              className={`flex-none ${isCenter || isCoverflow ? 'snap-center transition-all duration-300 [transform-style:preserve-3d]' : 'snap-start'} ${items}`}
            >
              {child}
            </div>
          )
        })}
      </div>

      {hasOverflow && arrows && arrowPos === 'sides' && (
        <>
          <button type="button" aria-label="Önceki" disabled={!loop && edges.start} onClick={() => page(-1)}
            className={`absolute -start-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center border text-xl transition disabled:opacity-0 sm:flex ${arrow}`}>
            <span className="rtl:rotate-180">‹</span>
          </button>
          <button type="button" aria-label="Sonraki" disabled={!loop && edges.end} onClick={() => page(1)}
            className={`absolute -end-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center border text-xl transition disabled:opacity-0 sm:flex ${arrow}`}>
            <span className="rtl:rotate-180">›</span>
          </button>
        </>
      )}

      {hasOverflow && renderNavBar(pageCount, pageIdx, goToPage, false)}
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
