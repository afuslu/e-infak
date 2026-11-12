'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

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

export type SliderLayout = 'overlay' | 'split' | 'card'
export type SliderNav = 'dots' | 'tabs' | 'thumbs'

const HEIGHTS: Record<string, string> = {
  sm: 'min-h-[360px]', md: 'min-h-[480px] md:min-h-[540px]', lg: 'min-h-[540px] md:min-h-[640px]', screen: 'min-h-[calc(100vh-80px)]',
  // Poster slides (text drawn into the image): the whole image at banner proportions, nothing cropped.
  poster: 'aspect-[16/5]',
}

function SlideButton({
  href, label, primary, light, card,
}: { href: string; label: string; primary?: boolean | 'brand'; light?: boolean; card?: boolean }) {
  const cls = card
    ? primary
      ? 'inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-primary-700'
      : 'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold uppercase tracking-wide text-gray-700 transition hover:border-primary-600 hover:text-primary-700'
    : primary === 'brand'
      ? 'inline-flex items-center gap-2 rounded-full bg-primary-700 px-7 py-3 text-sm font-bold uppercase text-white shadow-lg shadow-black/20 transition hover:bg-primary-800'
      : primary
        ? 'inline-flex items-center gap-2 rounded-[10px] bg-accent-500 px-7 py-3.5 font-extrabold text-white shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-accent-600'
        : light
          ? 'rounded-[10px] border-[1.5px] border-gray-300 px-7 py-3.5 font-semibold text-gray-800 hover:border-primary-600 hover:text-primary-700'
          : 'rounded-[10px] border-[1.5px] border-white/50 px-7 py-3.5 font-semibold text-white backdrop-blur-sm hover:border-white hover:bg-white/10'
  return href.startsWith('/') || href.startsWith('#')
    ? <Link href={href} className={cls}>{label}</Link>
    : <a href={href} className={cls} target="_blank" rel="noopener noreferrer">{label}</a>
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function ThumbnailStrip({
  slides, index, onSelect, onPrev, onNext, arrows, dark, reduced,
}: {
  slides: SlideView[]; index: number; onSelect: (i: number) => void
  onPrev: () => void; onNext: () => void; arrows: boolean; dark?: boolean; reduced: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const track = trackRef.current
    const el = itemRefs.current[index]
    if (!track || !el) return
    const targetLeft = el.offsetLeft - (track.clientWidth - el.clientWidth) / 2
    track.scrollTo({ left: Math.max(0, targetLeft), behavior: reduced ? 'auto' : 'smooth' })
  }, [index, reduced])

  const arrowCls = dark
    ? 'flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/15 text-xl text-white backdrop-blur transition hover:bg-white/30'
    : 'flex h-9 w-9 flex-none items-center justify-center rounded-full text-2xl text-gray-400 transition hover:bg-white hover:text-primary-600 hover:shadow-sm'

  return (
    <div className="relative mx-auto flex max-w-[1200px] items-center gap-1.5 sm:gap-2.5">
      {arrows && (
        <button type="button" aria-label="Önceki slayt" onClick={onPrev} className={arrowCls}>
          <span className="rtl:rotate-180 leading-none">‹</span>
        </button>
      )}
      <div
        ref={trackRef}
        className="mx-auto flex w-fit max-w-full flex-1 items-center gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => {
          const active = i === index
          const thumbSrc = s.mobile_image_url || s.image_url
          return (
            <button
              key={i}
              ref={(el) => { itemRefs.current[i] = el }}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`${i + 1}. slayt${s.title ? `: ${s.title}` : ''}`}
              aria-current={active}
              className={`group/thumb relative h-[54px] w-[88px] flex-none overflow-hidden rounded-lg p-[3px] transition-all sm:h-[68px] sm:w-[116px] ${
                active
                  ? 'bg-primary-600 shadow-md ring-2 ring-primary-600/25 opacity-100'
                  : 'bg-white shadow-sm ring-1 ring-black/10 opacity-75 hover:opacity-100 hover:ring-primary-400'
              }`}
            >
              {thumbSrc ? (
                <img
                  src={thumbSrc}
                  alt={s.title || `Slayt ${i + 1}`}
                  loading="lazy"
                  className="h-full w-full rounded-[5px] object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-[5px] bg-primary-50 px-1.5 text-[11px] font-semibold text-primary-800 line-clamp-2">
                  {s.title || `${i + 1}`}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {arrows && (
        <button type="button" aria-label="Sonraki slayt" onClick={onNext} className={arrowCls}>
          <span className="rtl:rotate-180 leading-none">›</span>
        </button>
      )}
    </div>
  )
}

/**
 * Full width slider shared by the home templates (cover slider) and the site builder's
 * slider block. Swipe, arrow keys, pause on hover/focus; no autoplay or motion when the
 * visitor prefers reduced motion. `split` puts the text beside the image on a light background;
 * `card` frames each slide in a rounded white card with optional thumbnail navigation underneath.
 */
export function Slider({
  slides, height = 'md', autoplay = true, interval = 6, effect = 'slide', arrows = true, dots = true,
  editing = false, layout = 'overlay', nav = 'dots', label = 'Öne çıkanlar',
}: {
  slides: SlideView[]; height?: string; autoplay?: boolean; interval?: number; effect?: string; arrows?: boolean; dots?: boolean
  editing?: boolean; layout?: SliderLayout; nav?: SliderNav; label?: string
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [rtl, setRtl] = useState(false)
  const reduced = usePrefersReducedMotion()
  const touch = useRef<{ x: number; y: number } | null>(null)
  const count = slides.length
  const seconds = Math.max(2, Number(interval) || 6)
  const playing = autoplay && !paused && !editing && !reduced && count > 1
  const card = layout === 'card'
  const split = layout === 'split'
  const fade = effect === 'fade' || split

  useEffect(() => { setRtl(document.documentElement.dir === 'rtl') }, [])
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000)
    return () => clearInterval(timer)
  }, [playing, count, seconds, index])
  useEffect(() => { if (index >= count) setIndex(0) }, [count, index])

  const go = useCallback((i: number) => setIndex((i + count) % count), [count])
  if (!count) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    go(index + ((e.key === 'ArrowRight') !== rtl ? 1 : -1))
  }
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start || count < 2) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return
    go(index + ((dx < 0) !== rtl ? 1 : -1))
  }

  const heightClass = split || card ? '' : HEIGHTS[height] || HEIGHTS.md
  const motion = reduced ? '' : 'duration-700 ease-out'
  const showThumbs = dots && count > 1 && nav === 'thumbs'

  const renderButtons = (s: SlideView, justify: string, isCard?: boolean) => (
    <div className={`${height === 'poster' ? 'hidden sm:flex' : 'flex'} flex-wrap gap-2.5 sm:gap-3 ${split || isCard ? '' : justify}`}>
      {s.campaign && <SlideButton href={`/kampanyalar/${s.campaign.slug}`} label={s.button_label || s.donateLabel} primary={isCard ? true : height === 'poster' ? 'brand' : true} card={isCard} />}
      {!s.campaign && s.button_label && s.button_url && <SlideButton href={s.button_url} label={s.button_label} primary={isCard ? true : height === 'poster' ? 'brand' : true} card={isCard} />}
      {s.button2_label && s.button2_url && <SlideButton href={s.button2_url} label={s.button2_label} light={split} card={isCard} />}
    </div>
  )

  const renderProgress = (s: SlideView, lightBg: boolean) => s.campaign && (
    <div className={`mb-5 w-full max-w-md rounded-xl p-3.5 text-start ${lightBg ? 'border border-primary-100 bg-primary-50/40' : 'bg-white/10 text-white backdrop-blur'}`}>
      <div className="mb-2 flex justify-between text-sm font-semibold">
        <span className={lightBg ? 'text-primary-700' : ''}>{s.campaign.collected}</span>
        <span className="opacity-70">{s.campaign.target}</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${lightBg ? 'bg-gray-100' : 'bg-white/25'}`}>
        <div className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-500" style={{ width: `${Math.min(s.campaign.progress, 100)}%` }} />
      </div>
    </div>
  )

  if (card) {
    return (
      <section
        className="group/slider relative border-b border-black/[0.04] bg-[#F3F4F6] py-4 sm:py-7"
        aria-roledescription="carousel" aria-label={label} tabIndex={-1}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
        onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}
      >
        <div className="mx-auto max-w-[1200px] px-3 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
            <div
              className={fade ? 'grid [&>*]:col-start-1 [&>*]:row-start-1' : `flex transition-transform ${motion}`}
              style={fade ? undefined : { transform: `translateX(${rtl ? '' : '-'}${index * 100}%)` }}
            >
              {slides.map((s, i) => {
                const active = i === index
                const hidden = { 'aria-hidden': !active, inert: !active }
                const isPoster = height === 'poster' || (!s.title && !s.text && !s.badge)
                const primaryHref = s.campaign ? `/kampanyalar/${s.campaign.slug}` : s.button_url

                if (isPoster) {
                  return (
                    <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                      className={`relative p-2 sm:p-2.5 ${fade ? `transition-opacity ${motion} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}` : 'w-full flex-none'}`}>
                      <div className="relative overflow-hidden rounded-xl bg-gray-100">
                        {s.image_url && (
                          <picture>
                            {s.mobile_image_url && <source media="(max-width: 639px)" srcSet={s.mobile_image_url} />}
                            <img
                              src={s.image_url}
                              alt={s.title || ''}
                              loading={i === 0 ? 'eager' : 'lazy'}
                              className="w-full object-cover sm:aspect-[16/5]"
                            />
                          </picture>
                        )}
                        {primaryHref && (
                          <Link href={primaryHref} aria-label={s.button_label || s.donateLabel} className="absolute inset-0 sm:hidden" />
                        )}
                        {(s.button_label || s.button2_label || s.campaign) && (
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-start p-5 sm:flex">
                            <div className="pointer-events-auto">{renderButtons(s, '', true)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                    className={fade ? `transition-opacity ${motion} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}` : 'w-full flex-none'}>
                    <div className="grid grid-cols-1 items-center md:grid-cols-[5fr_7fr]">
                      {s.image_url && (
                        <div className="order-1 p-2 pb-0 md:order-2 md:p-3">
                          <div className="overflow-hidden rounded-xl bg-gray-100 aspect-[16/10] md:aspect-auto md:h-[390px] lg:h-[430px]">
                            <picture>
                              {s.mobile_image_url && <source media="(max-width: 639px)" srcSet={s.mobile_image_url} />}
                              <img
                                src={s.image_url}
                                alt={s.title || ''}
                                loading={i === 0 ? 'eager' : 'lazy'}
                                fetchPriority={i === 0 ? 'high' : undefined}
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            </picture>
                          </div>
                        </div>
                      )}
                      <div className={`order-2 px-5 pb-6 pt-4 md:order-1 md:py-10 md:ps-10 md:pe-6 ${active && !reduced ? 'animate-[slide-text_.65s_ease-out_both]' : ''}`}>
                        {s.badge && (
                          <span className="mb-3 inline-block rounded-full bg-primary-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[1.6px] text-primary-700">
                            {s.badge}
                          </span>
                        )}
                        {s.title && (
                          <h2 className="mb-3 font-heading text-2xl font-bold leading-[1.18] text-gray-900 sm:text-3xl md:text-[36px]">
                            {s.title}
                          </h2>
                        )}
                        {s.text && (
                          <p className="mb-6 line-clamp-3 text-base leading-relaxed text-gray-600 sm:text-[17px] md:line-clamp-4">
                            {s.text}
                          </p>
                        )}
                        {renderProgress(s, true)}
                        {renderButtons(s, '', true)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {arrows && count > 1 && !showThumbs && (
              <>
                <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)}
                  className="absolute start-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl text-gray-700 shadow transition hover:bg-white hover:text-primary-700 sm:flex">
                  <span className="rtl:rotate-180">‹</span>
                </button>
                <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)}
                  className="absolute end-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl text-gray-700 shadow transition hover:bg-white hover:text-primary-700 sm:flex">
                  <span className="rtl:rotate-180">›</span>
                </button>
              </>
            )}
          </div>

          {showThumbs && (
            <div className="mt-4 sm:mt-5">
              <ThumbnailStrip
                slides={slides} index={index} onSelect={go}
                onPrev={() => go(index - 1)} onNext={() => go(index + 1)}
                arrows={arrows} reduced={reduced}
              />
            </div>
          )}

          {dots && count > 1 && !showThumbs && (
            <div className="mt-4 flex justify-center gap-2">
              {slides.map((_, i) => (
                <button key={i} type="button" aria-label={`${i + 1}. slayt`} aria-current={i === index} onClick={() => go(i)}
                  className={`relative h-2.5 overflow-hidden rounded-full transition-all ${i === index ? 'w-9 bg-primary-200' : 'w-2.5 bg-gray-300'}`}>
                  {i === index && (
                    <span key={`${index}-${playing}`} className={`absolute inset-y-0 start-0 bg-primary-600 ${playing ? 'slider-progress' : 'w-full'}`} style={{ animationDuration: `${seconds}s` }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      className={`group/slider relative overflow-hidden ${split ? 'bg-gradient-to-br from-primary-50 via-white to-accent-50' : 'bg-primary-950'} ${heightClass}`}
      aria-roledescription="carousel" aria-label={label} tabIndex={-1}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
      <div className={fade ? `grid ${heightClass} [&>*]:col-start-1 [&>*]:row-start-1` : `flex ${heightClass} transition-transform ${motion}`}
        style={fade ? undefined : { transform: `translateX(${rtl ? '' : '-'}${index * 100}%)` }}>
        {slides.map((s, i) => {
          const active = i === index
          const align = s.align === 'center' ? 'items-center text-center' : s.align === 'right' ? 'items-end text-end' : 'items-start text-start'
          const justify = s.align === 'center' ? 'justify-center' : s.align === 'right' ? 'justify-end' : ''
          const buttons = renderButtons(s, justify)
          const progress = renderProgress(s, split)
          const hidden = { 'aria-hidden': !active, inert: !active }

          if (split) {
            return (
              <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                className={`transition-opacity ${motion} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-16">
                  <div className={`${active && !reduced ? 'animate-[slide-text_.8s_ease-out_both]' : ''}`}>
                    {s.badge && <div className="mb-4 text-[13px] font-bold uppercase tracking-[3px] text-primary-600">{s.badge}</div>}
                    {s.title && <h2 className="mb-4 font-heading text-4xl font-bold leading-[1.12] text-gray-900 md:text-[52px]">{s.title}</h2>}
                    {s.text && <p className="mb-7 max-w-xl text-lg leading-relaxed text-gray-600">{s.text}</p>}
                    {progress}
                    {buttons}
                  </div>
                  {s.image_url && (
                    <div className="relative">
                      <div className="absolute -inset-3 -z-0 rotate-2 rounded-[28px] bg-primary-100" aria-hidden />
                      <img src={s.image_url} alt="" loading={i === 0 ? 'eager' : 'lazy'}
                        className="relative aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" />
                    </div>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
              className={`relative overflow-hidden ${fade ? `transition-opacity ${motion} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}` : 'w-full flex-none'} ${heightClass}`}>
              {s.image_url && (
                <picture>
                  {s.mobile_image_url && <source media="(max-width: 639px)" srcSet={s.mobile_image_url} />}
                  <img src={s.image_url} alt="" loading={i === 0 ? 'eager' : 'lazy'}
                    className={`absolute inset-0 h-full w-full object-cover ${active && !reduced && !editing && height !== 'poster' ? 'slider-kenburns' : ''}`}
                    style={{ animationDuration: `${seconds + 2}s` }} />
                </picture>
              )}
              <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 45) / 100})` }} />
              {s.align !== 'center' && (s.overlay ?? 45) > 0 && <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent rtl:bg-gradient-to-l" />}
              <div className={`relative mx-auto flex h-full max-w-[1200px] flex-col ${height === 'poster' ? 'justify-end pb-[3%] pt-4' : 'justify-center pb-20 pt-16'} px-6 ${arrows && count > 1 ? 'sm:px-20' : ''} ${align} ${heightClass}`}>
                <div className={`max-w-2xl ${active && !reduced ? 'animate-[slide-text_.8s_ease-out_both]' : ''}`}>
                  {s.badge && <span className="mb-5 inline-block rounded-full border border-white/40 bg-white/10 px-4 py-1.5 text-[13px] font-bold tracking-[2px] text-white backdrop-blur-sm">{s.badge}</span>}
                  {s.title && <h2 className="mb-4 font-heading text-3xl font-bold leading-[1.12] text-white drop-shadow md:text-[54px]">{s.title}</h2>}
                  {s.text && <p className={`mb-7 text-lg leading-relaxed text-white/85 ${s.align === 'center' ? 'mx-auto max-w-xl' : 'max-w-xl'}`}>{s.text}</p>}
                  {progress && <div className={s.align === 'center' ? 'flex justify-center' : ''}>{progress}</div>}
                  {buttons}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {arrows && count > 1 && !showThumbs && (
        <>
          <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)}
            className={`absolute start-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-2xl transition sm:flex md:start-6 ${split ? 'bg-white text-gray-700 shadow hover:text-primary-700' : 'bg-white/15 text-white backdrop-blur hover:bg-white/30'}`}>
            <span className="rtl:rotate-180">‹</span>
          </button>
          <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)}
            className={`absolute end-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-2xl transition sm:flex md:end-6 ${split ? 'bg-white text-gray-700 shadow hover:text-primary-700' : 'bg-white/15 text-white backdrop-blur hover:bg-white/30'}`}>
            <span className="rtl:rotate-180">›</span>
          </button>
        </>
      )}

      {dots && count > 1 && nav === 'tabs' && (
        <div className="absolute inset-x-0 bottom-0 z-10 hidden border-t border-white/15 bg-black/25 backdrop-blur md:block">
          <div className="mx-auto grid max-w-[1200px] px-6" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {slides.map((s, i) => (
              <button key={i} type="button" onClick={() => go(i)} aria-label={`${i + 1}. slayt`} aria-current={i === index}
                className={`relative truncate px-3 py-4 text-start text-sm font-semibold transition ${i === index ? 'text-white' : 'text-white/55 hover:text-white/85'}`}>
                <span className="me-2 font-heading text-xs opacity-70">{String(i + 1).padStart(2, '0')}</span>
                {s.title || s.badge || `${i + 1}`}
                <span className="absolute inset-x-3 top-0 h-[3px] overflow-hidden rounded-full bg-white/15">
                  {i === index && (
                    <span key={`${index}-${playing}`} className={`block h-full bg-accent-400 ${playing ? 'slider-progress' : 'w-full'}`} style={{ animationDuration: `${seconds}s` }} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {showThumbs ? (
        <div className={`inset-x-0 z-10 px-4 py-3 ${split ? '' : 'absolute bottom-0 bg-black/25 backdrop-blur-sm'}`}>
          <ThumbnailStrip
            slides={slides} index={index} onSelect={go}
            onPrev={() => go(index - 1)} onNext={() => go(index + 1)}
            arrows={arrows} dark={!split} reduced={reduced}
          />
        </div>
      ) : dots && count > 1 && (
        <div className={`absolute inset-x-0 z-10 flex justify-center gap-2 ${nav === 'tabs' ? 'bottom-5 md:hidden' : split ? 'bottom-4' : 'bottom-6'}`}>
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`${i + 1}. slayt`} aria-current={i === index} onClick={() => go(i)}
              className={`relative h-2.5 overflow-hidden rounded-full transition-all ${i === index ? 'w-9' : 'w-2.5'} ${split ? 'bg-primary-200' : 'bg-white/45'}`}>
              {i === index && (
                <span key={`${index}-${playing}`} className={`absolute inset-y-0 start-0 ${split ? 'bg-primary-600' : 'bg-white'} ${playing ? 'slider-progress' : 'w-full'}`} style={{ animationDuration: `${seconds}s` }} />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
