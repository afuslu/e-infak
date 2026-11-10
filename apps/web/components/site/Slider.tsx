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

export type SliderLayout = 'overlay' | 'split'

const HEIGHTS: Record<string, string> = {
  sm: 'min-h-[360px]', md: 'min-h-[480px] md:min-h-[540px]', lg: 'min-h-[540px] md:min-h-[640px]', screen: 'min-h-[calc(100vh-80px)]',
  // Poster slides (text drawn into the image): the whole image at banner proportions, nothing cropped.
  poster: 'aspect-[16/5]',
}

function SlideButton({ href, label, primary, light }: { href: string; label: string; primary?: boolean | 'brand'; light?: boolean }) {
  const cls = primary === 'brand'
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

/**
 * Full width slider shared by the home templates (cover slider) and the site builder's
 * slider block. Swipe, arrow keys, pause on hover/focus; no autoplay or motion when the
 * visitor prefers reduced motion. `split` puts the text beside the image on a light background.
 */
export function Slider({
  slides, height = 'md', autoplay = true, interval = 6, effect = 'slide', arrows = true, dots = true,
  editing = false, layout = 'overlay', nav = 'dots', label = 'Öne çıkanlar',
}: {
  slides: SlideView[]; height?: string; autoplay?: boolean; interval?: number; effect?: string; arrows?: boolean; dots?: boolean
  editing?: boolean; layout?: SliderLayout; nav?: 'dots' | 'tabs'; label?: string
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [rtl, setRtl] = useState(false)
  const reduced = usePrefersReducedMotion()
  const touch = useRef<{ x: number; y: number } | null>(null)
  const count = slides.length
  const seconds = Math.max(2, Number(interval) || 6)
  const playing = autoplay && !paused && !editing && !reduced && count > 1
  const fade = effect === 'fade' || layout === 'split'

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

  const split = layout === 'split'
  const heightClass = split ? '' : HEIGHTS[height] || HEIGHTS.md
  const motion = reduced ? '' : 'duration-700 ease-out'

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
          const buttons = (
            <div className={`${height === 'poster' ? 'hidden sm:flex' : 'flex'} flex-wrap gap-3 ${split ? '' : justify}`}>
              {s.campaign && <SlideButton href={`/kampanyalar/${s.campaign.slug}`} label={s.button_label || s.donateLabel} primary={height === 'poster' ? 'brand' : true} />}
              {!s.campaign && s.button_label && s.button_url && <SlideButton href={s.button_url} label={s.button_label} primary={height === 'poster' ? 'brand' : true} />}
              {s.button2_label && s.button2_url && <SlideButton href={s.button2_url} label={s.button2_label} light={split} />}
            </div>
          )
          const progress = s.campaign && (
            <div className={`mb-6 w-full max-w-md rounded-xl p-4 text-start ${split ? 'border border-primary-100 bg-white shadow-sm' : 'bg-white/10 text-white backdrop-blur'}`}>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span className={split ? 'text-primary-700' : ''}>{s.campaign.collected}</span>
                <span className="opacity-70">{s.campaign.target}</span>
              </div>
              <div className={`h-2 overflow-hidden rounded-full ${split ? 'bg-gray-100' : 'bg-white/25'}`}>
                <div className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-500" style={{ width: `${Math.min(s.campaign.progress, 100)}%` }} />
              </div>
            </div>
          )
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

      {arrows && count > 1 && (
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
      {dots && count > 1 && (
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
