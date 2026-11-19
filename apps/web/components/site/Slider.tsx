'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Baby,
  BookOpen,
  Coins,
  Droplets,
  Eye,
  Globe,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  Home,
  MoonStar,
  ShieldAlert,
  Smile,
  Snowflake,
  Sparkles,
  Tent,
  Utensils,
} from 'lucide-react'

export interface SlideView {
  image_url?: string
  mobile_image_url?: string
  video_url?: string
  countdown_to?: string
  quick_amounts?: string
  badge?: string
  title?: string
  text?: string
  tab_label?: string
  tab_icon?: string
  tab_icon_url?: string
  button_label?: string
  button_url?: string
  button2_label?: string
  button2_url?: string
  align?: 'left' | 'center' | 'right'
  overlay?: number
  bg_color?: string
  image_pos?: 'right' | 'left'
  campaign?: { slug: string; title: string; collected: string; target: string; progress: number } | null
  donateLabel: string
}

export type SliderLayout =
  | 'overlay'
  | 'split'
  | 'card'
  | 'glass'
  | 'minimal'
  | 'stacked'
  | 'coverflow'
  | 'peek'
  | 'bento'
  | 'duotone'
  | 'video_hero'
  | 'dual_sync'
  | 'vertical_thumbs'
  | 'magazine'
  | 'card_stack_slider'
  | 'dark_cinema_slider'
  | 'minimal_editorial_slider'
  | 'split_diagonal'
  | 'dark_cinema'
  | 'mini_promo_strip'
  | 'floating_donate'
  | 'kinetic_collage'
  | 'spotlight'
  | 'split_dark'
  | 'news_ticker'
  | 'grid_collage'
  | 'emerald_gold_slider'
  | 'split_progress_slider'
  | 'full_bleed_caption_slider'
  | 'arch_islamic_slider'
  | 'countdown_urgent_slider'
  | 'quick_amount_slider'
  | 'filmstrip_bottom_slider'
  | 'polaroid_collage_slider'
  | 'glass_card_overlay_slider'
  | 'split_50_50_framed'
  | 'vertical_chapter_slider'
  | 'dark_amber_spotlight'
  | 'bordered_editorial_slider'
  | 'floating_stats_slider'
  | 'duotone_emerald_slider'
  | 'split_card_overlap_slider'
  | 'dark_sapphire_slider'
  | 'two_row_thumbs_slider'
  | 'video_split_slider'
  | 'diagonal_split_dark_slider'
  | 'minimal_counter_slider'
  | 'campaign_goal_slider'
  | 'quote_overlay_slider'
  | 'compact_banner_slider'
  | 'bento_3_tile_slider'
  | 'gold_frame_center_slider'
  | 'soft_pastel_split_slider'
  | 'split_ruby_urgent_slider'
  | 'mosaic_4_photo_slider'
  | 'glass_bottom_bar_slider'
  | 'circle_portrait_slider'
  | 'dark_olive_gold_slider'
  | 'numbered_list_right_slider'
  | 'floating_pill_cta_slider'
  | 'split_reverse_card_slider'
  | 'minimal_typographic_banner_slider'
  | 'countdown_gold_slider'
  | 'bordered_dual_button_slider'
  | 'warm_terracotta_slider'
  | 'split_indigo_silver_slider'
  | 'full_bleed_duotone_ruby'
  | 'card_grid_3_slider'
  | 'top_badge_center_slider'
  | 'sidebar_cta_slider'
  | 'dark_plum_gold_slider'
  | 'minimal_border_box_slider'
  | 'pill_overlay_bottom_slider'
  | 'split_icon_list_slider'
  | 'diagonal_light_slider'
  | 'dark_forest_amber_slider'
  | 'compact_card_row_slider'
export type SliderNav = 'dots' | 'tabs' | 'icon_tabs' | 'thumbs' | 'numbers' | 'progress' | 'ring' | 'pill_bars' | 'chapter_titles' | 'vertical_dots' | 'fraction_bar' | 'mini_cards' | 'progress_dots' | 'top_bar' | 'side_numbers' | 'gold_dots' | 'outlined_tabs' | 'bottom_counter_pill' | 'emerald_bars'
export type SliderArrowStyle = 'round' | 'square' | 'minimal' | 'ghost' | 'pill_dark' | 'gold_ring' | 'floating_edge' | 'text_prev_next' | 'emerald_pill' | 'ruby_circle' | 'glass_square' | 'double_chevron'

const SLIDE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  'heart-handshake': HeartHandshake,
  'hand-heart': HandHeart,
  snowflake: Snowflake,
  droplets: Droplets,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  utensils: Utensils,
  eye: Eye,
  'alert-triangle': AlertTriangle,
  'shield-alert': ShieldAlert,
  smile: Smile,
  baby: Baby,
  home: Home,
  globe: Globe,
  coins: Coins,
  'moon-star': MoonStar,
  tent: Tent,
  sparkles: Sparkles,
}

function youtubeId(url?: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

const HEIGHTS: Record<string, string> = {
  sm: 'min-h-[360px]', md: 'min-h-[480px] md:min-h-[540px]', lg: 'min-h-[540px] md:min-h-[640px]', screen: 'min-h-[calc(100vh-80px)]',
  // Poster slides (text drawn into the image): the whole image at banner proportions, nothing cropped.
  poster: 'aspect-[16/5]',
}
const FIXED_V_HEIGHTS: Record<string, string> = {
  sm: 'h-[360px]', md: 'h-[480px] md:h-[540px]', lg: 'h-[540px] md:h-[640px]', screen: 'h-[calc(100vh-80px)]', poster: 'aspect-[16/5]',
}
const CARD_HEIGHTS: Record<string, string> = {
  sm: 'md:min-h-[320px]', md: 'md:min-h-[400px]', lg: 'md:min-h-[460px]', screen: 'md:min-h-[calc(100vh-140px)]', poster: '',
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

function renderTabIcon(s: SlideView) {
  const customUrl = (s.tab_icon_url || '').trim() || (s.tab_icon && /^(https?:\/\/|\/)/.test(s.tab_icon.trim()) ? s.tab_icon.trim() : '')
  if (customUrl) {
    return <img src={customUrl} alt="" className="h-6 w-6 object-contain" />
  }
  const key = (s.tab_icon || '').trim()
  if (key && SLIDE_ICONS[key]) {
    const IconComp = SLIDE_ICONS[key]
    return <IconComp className="h-5 w-5" />
  }
  if (key) {
    return <span className="text-lg leading-none">{key}</span>
  }
  if (s.image_url) {
    return <img src={s.image_url} alt="" className="h-6 w-6 rounded-full object-cover" />
  }
  return <HeartHandshake className="h-5 w-5" />
}

function IconTabsStrip({
  slides, index, onSelect, playing, seconds, dark, reduced,
}: {
  slides: SlideView[]; index: number; onSelect: (i: number) => void
  playing: boolean; seconds: number; dark?: boolean; reduced: boolean
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

  return (
    <div
      ref={trackRef}
      className="no-scrollbar mx-auto flex max-w-[1200px] items-stretch justify-start gap-1 overflow-x-auto sm:justify-center sm:gap-2"
    >
      {slides.map((s, i) => {
        const active = i === index
        const tabText = (s.tab_label || s.badge || s.title || `Slayt ${i + 1}`).trim()
        return (
          <button
            key={i}
            ref={(el) => { itemRefs.current[i] = el }}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={tabText}
            aria-current={active}
            className="group relative flex min-w-[78px] max-w-[136px] flex-1 flex-col items-center gap-1.5 px-2 pt-3 pb-2 text-center transition focus:outline-none"
          >
            <span className={`pointer-events-none absolute inset-x-2 top-0 h-[3px] overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-transparent'}`}>
              {active && (
                <span
                  key={`${index}-${playing}`}
                  className={`block h-full rounded-full ${dark ? 'bg-accent-400' : 'bg-primary-600'} ${playing ? 'slider-progress' : 'w-full'}`}
                  style={{ animationDuration: `${seconds}s` }}
                />
              )}
            </span>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                active
                  ? dark
                    ? 'scale-105 bg-white/20 text-white ring-1 ring-white/40'
                    : 'scale-105 bg-primary-50 text-primary-600 ring-1 ring-primary-200 shadow-xs'
                  : dark
                    ? 'bg-white/10 text-white/55 group-hover:bg-white/15 group-hover:text-white/85'
                    : 'bg-gray-100/90 text-gray-400 group-hover:bg-gray-200/70 group-hover:text-gray-600'
              }`}
            >
              {renderTabIcon(s)}
            </span>
            <span
              className={`w-full truncate text-xs transition ${
                active
                  ? dark ? 'font-bold text-white' : 'font-bold text-gray-900'
                  : dark ? 'font-medium text-white/60 group-hover:text-white/85' : 'font-medium text-gray-500 group-hover:text-gray-700'
              }`}
            >
              {tabText}
            </span>
          </button>
        )
      })}
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
  slides, height = 'md', mobileHeight = 'auto', autoplay = true, interval = 6, effect = 'slide', arrows = true, arrowStyle = 'round', dots = true,
  editing = false, layout = 'overlay', nav = 'dots', label = 'Öne çıkanlar', showPause = true,
}: {
  slides: SlideView[]; height?: string; mobileHeight?: string; autoplay?: boolean; interval?: number; effect?: string; arrows?: boolean; arrowStyle?: SliderArrowStyle; dots?: boolean
  editing?: boolean; layout?: SliderLayout; nav?: SliderNav; label?: string; showPause?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [rtl, setRtl] = useState(false)
  const reduced = usePrefersReducedMotion()
  const touch = useRef<{ x: number; y: number } | null>(null)
  const count = slides.length
  const seconds = Math.max(2, Number(interval) || 6)
  const playing = autoplay && !paused && !userPaused && !editing && !reduced && count > 1
  const card = layout === 'card'
  const split = layout === 'split'
  const glass = layout === 'glass'
  const minimal = layout === 'minimal' || layout === 'minimal_editorial_slider'
  const stacked = layout === 'stacked' || layout === 'card_stack_slider'
  const duotone = layout === 'duotone' || layout === 'dark_cinema_slider'
  const isVertical = effect === 'vertical'
  const isCube = effect === 'cube'
  const fade =
    effect === 'fade' ||
    effect === 'zoom' ||
    effect === 'kenburns_slow' ||
    effect === 'flip' ||
    effect === 'blur' ||
    effect === 'cards' ||
    effect === 'parallax' ||
    effect === 'cube' ||
    effect === 'curtain' ||
    effect === 'scale_down' ||
    effect === 'slide_up' ||
    effect === 'crossfade_blur' ||
    effect === 'flip_x' ||
    effect === 'zoom_out' ||
    effect === 'slide_diagonal' ||
    effect === 'fade_fast' ||
    effect === 'rotate_subtle' ||
    effect === 'glide_right' ||
    effect === 'pop_in' ||
    effect === 'wipe_up' ||
    effect === 'soft_dissolve'

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

  const mobH = mobileHeight === 'sm' ? 'min-h-[280px] ' : mobileHeight === 'md' ? 'min-h-[380px] ' : mobileHeight === 'lg' ? 'min-h-[480px] ' : ''
  const heightClass = split || card || stacked
    ? ''
    : isVertical
      ? `${mobH}${FIXED_V_HEIGHTS[height] || FIXED_V_HEIGHTS.md}`
      : `${mobH}${HEIGHTS[height] || HEIGHTS.md}`
  const cardHeightClass = CARD_HEIGHTS[height] || ''
  const motion = reduced ? '' : 'duration-700 ease-out'
  const showThumbs = dots && count > 1 && nav === 'thumbs'
  const showNumbers = dots && count > 1 && (nav === 'numbers' || nav === 'fraction_bar' || nav === 'bottom_counter_pill')
  const showProgress = dots && count > 1 && nav === 'progress'
  const showTabs = dots && count > 1 && (nav === 'tabs' || nav === 'chapter_titles' || nav === 'outlined_tabs')
  const showIconTabs = dots && count > 1 && nav === 'icon_tabs'
  const showRing = dots && count > 1 && nav === 'ring'
  const showVerticalDots = dots && count > 1 && nav === 'vertical_dots'
  const showPillBars = dots && count > 1 && (nav === 'pill_bars' || nav === 'progress_dots' || nav === 'emerald_bars')
  const isGoldDots = nav === 'gold_dots'
  const showTopBar = dots && count > 1 && nav === 'top_bar'
  const showSideNumbers = dots && count > 1 && nav === 'side_numbers'
  const showMiniCards = dots && count > 1 && nav === 'mini_cards'
  const arrowShape =
    arrowStyle === 'square' ? 'rounded-xl'
      : arrowStyle === 'minimal' ? 'rounded-lg bg-transparent border border-current/25 shadow-none'
        : arrowStyle === 'ghost' ? 'rounded-full bg-transparent shadow-none'
          : arrowStyle === 'pill_dark' ? 'rounded-full bg-slate-950/85 text-white border border-white/20 px-4 !w-auto'
            : arrowStyle === 'gold_ring' ? 'rounded-full border-2 border-amber-400/80 bg-black/45 text-amber-300'
              : arrowStyle === 'floating_edge' ? 'rounded-none !h-20 !w-10 bg-black/55 text-white'
                : arrowStyle === 'text_prev_next' ? 'rounded-full px-4 !w-auto text-xs font-extrabold uppercase tracking-wider'
                  : arrowStyle === 'emerald_pill' ? 'rounded-full bg-emerald-900/90 text-amber-300 border border-amber-400/40 px-4 !w-auto'
                    : arrowStyle === 'ruby_circle' ? 'rounded-full bg-red-600 text-white shadow-lg'
                      : arrowStyle === 'glass_square' ? 'rounded-xl bg-white/15 text-white backdrop-blur-md border border-white/25'
                        : arrowStyle === 'double_chevron' ? 'rounded-full bg-black/40 text-white tracking-tighter'
                          : 'rounded-full'
  const slideAnim = (active: boolean) => {
    if (!fade) return isVertical ? 'h-full w-full flex-none' : 'w-full flex-none'
    if (effect === 'zoom' || effect === 'kenburns_slow') return `transition-all ${motion} ${active ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-[1.04]'}`
    if (effect === 'flip') return `transition-all ${motion} ${active ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`
    if (effect === 'blur') return `transition-all ${motion} ${active ? 'opacity-100 blur-0 scale-100' : 'pointer-events-none opacity-0 blur-sm scale-[1.02]'}`
    if (effect === 'cards') return `transition-all ${motion} ${active ? 'opacity-100 scale-100 rotate-0 z-10' : 'pointer-events-none opacity-0 scale-95 -rotate-1'}`
    if (effect === 'parallax') return `transition-all ${motion} ${active ? 'opacity-100 translate-x-0' : 'pointer-events-none opacity-0 translate-x-6'}`
    if (effect === 'cube') return `transition-all duration-700 ease-out [transform-style:preserve-3d] ${active ? 'opacity-100 [transform:rotateY(0deg)] z-10' : 'pointer-events-none opacity-0 [transform:rotateY(60deg)_scale(0.92)]'}`
    if (effect === 'curtain') return `transition-all duration-700 ease-out ${active ? 'opacity-100 [clip-path:inset(0_0_0_0)] z-10' : 'pointer-events-none opacity-0 [clip-path:inset(0_0_0_100%)]'}`
    if (effect === 'scale_down') return `transition-all ${motion} ${active ? 'opacity-100 scale-100 z-10' : 'pointer-events-none opacity-0 scale-105'}`
    if (effect === 'slide_up') return `transition-all ${motion} ${active ? 'opacity-100 translate-y-0 z-10' : 'pointer-events-none opacity-0 translate-y-8'}`
    if (effect === 'crossfade_blur') return `transition-all duration-700 ${active ? 'opacity-100 blur-0 z-10' : 'pointer-events-none opacity-0 blur-md'}`
    if (effect === 'flip_x') return `transition-all duration-700 ${active ? 'opacity-100 [transform:rotateX(0deg)] z-10' : 'pointer-events-none opacity-0 [transform:rotateX(35deg)]'}`
    if (effect === 'zoom_out') return `transition-all ${motion} ${active ? 'opacity-100 scale-100 z-10' : 'pointer-events-none opacity-0 scale-110'}`
    if (effect === 'slide_diagonal') return `transition-all ${motion} ${active ? 'opacity-100 translate-x-0 translate-y-0 z-10' : 'pointer-events-none opacity-0 translate-x-5 translate-y-5'}`
    if (effect === 'fade_fast') return `transition-opacity duration-300 ${active ? 'opacity-100 z-10' : 'pointer-events-none opacity-0'}`
    if (effect === 'rotate_subtle') return `transition-all ${motion} ${active ? 'opacity-100 rotate-0 scale-100 z-10' : 'pointer-events-none opacity-0 rotate-1 scale-95'}`
    if (effect === 'glide_right') return `transition-all ${motion} ${active ? 'opacity-100 translate-x-0 z-10' : 'pointer-events-none opacity-0 -translate-x-8'}`
    if (effect === 'pop_in') return `transition-all duration-500 ${active ? 'opacity-100 scale-100 z-10' : 'pointer-events-none opacity-0 scale-90'}`
    if (effect === 'wipe_up') return `transition-all duration-700 ease-out ${active ? 'opacity-100 [clip-path:inset(0_0_0_0)] z-10' : 'pointer-events-none opacity-0 [clip-path:inset(100%_0_0_0)]'}`
    if (effect === 'soft_dissolve') return `transition-opacity duration-1000 ease-in-out ${active ? 'opacity-100 z-10' : 'pointer-events-none opacity-0'}`
    return `transition-opacity ${motion} ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`
  }

  const renderPauseToggle = (lightBg = false) => {
    if (!showPause || !autoplay || editing || count < 2) return null
    return (
      <button
        type="button"
        onClick={() => setUserPaused((v) => !v)}
        aria-label={userPaused ? 'Otomatik geçişi başlat' : 'Otomatik geçişi duraklat'}
        title={userPaused ? 'Başlat' : 'Duraklat'}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
          lightBg
            ? 'border border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:border-primary-500 hover:text-primary-700'
            : 'border border-white/25 bg-black/35 text-white backdrop-blur hover:bg-black/55'
        }`}
      >
        {userPaused ? '▶' : '❚❚'}
      </button>
    )
  }

  const renderQuickAmounts = (s: SlideView, lightBg: boolean) => {
    if (!s.quick_amounts) return null
    const nums = s.quick_amounts.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 5)
    if (!nums.length) return null
    const baseHref = s.campaign ? `/kampanyalar/${s.campaign.slug}` : '/bagis'
    return (
      <div className="mb-4 flex flex-wrap gap-2">
        {nums.map((amt, idx) => (
          <Link key={idx} href={`${baseHref}?tutar=${encodeURIComponent(amt)}`}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
              lightBg ? 'border border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-600 hover:text-white' : 'border border-white/30 bg-white/15 text-white backdrop-blur-sm hover:bg-white hover:text-primary-900'
            }`}>
            {amt} ₺
          </Link>
        ))}
      </div>
    )
  }

  const renderCountdown = (s: SlideView, lightBg: boolean) => {
    if (!s.countdown_to) return null
    const diff = new Date(s.countdown_to).getTime() - Date.now()
    if (!Number.isFinite(diff) || diff <= 0) return null
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    return (
      <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-bold ${lightBg ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-200' : 'bg-accent-500/90 text-white'}`}>
        <span>⏳</span>
        <span>{days > 0 ? `${days} gün ${hours} saat kaldı` : `${hours} saat kaldı`}</span>
      </div>
    )
  }

  const renderMediaBg = (s: SlideView, i: number, active: boolean) => {
    const yt = youtubeId(s.video_url)
    if (yt) {
      return (
        <>
          {s.image_url && (
            <img src={s.image_url} alt="" loading={i === 0 ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover" />
          )}
          {active && !editing && (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&showinfo=0&rel=0&playsinline=1&modestbranding=1`}
              title={s.title || 'Arka plan videosu'}
              allow="autoplay; encrypted-media"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 border-0 object-cover"
            />
          )}
        </>
      )
    }
    if (s.video_url && /\.(mp4|webm|ogg)(\?|$)/i.test(s.video_url)) {
      return (
        <video autoPlay muted loop playsInline poster={s.image_url}
          className="absolute inset-0 h-full w-full object-cover">
          <source src={s.video_url} />
        </video>
      )
    }
    const kbCls = active && !reduced && !editing && height !== 'poster'
      ? (effect === 'kenburns_slow' ? 'slider-kenburns-slow' : 'slider-kenburns')
      : ''
    return s.image_url ? (
      <picture>
        {s.mobile_image_url && <source media="(max-width: 639px)" srcSet={s.mobile_image_url} />}
        <img src={s.image_url} alt="" loading={i === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover ${kbCls}`}
          style={{ animationDuration: `${effect === 'kenburns_slow' ? seconds + 6 : seconds + 2}s` }} />
      </picture>
    ) : null
  }

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

  const renderBelowNav = (lightBg: boolean) => {
    if (count < 2) return null
    return (
      <>
        {showThumbs && (
          <div className="mt-4 sm:mt-5">
            <ThumbnailStrip
              slides={slides} index={index} onSelect={go}
              onPrev={() => go(index - 1)} onNext={() => go(index + 1)}
              arrows={arrows} dark={!lightBg} reduced={reduced}
            />
          </div>
        )}

        {showIconTabs && (
          <div className="mt-3 sm:mt-4">
            <IconTabsStrip
              slides={slides} index={index} onSelect={go}
              playing={playing} seconds={seconds} dark={!lightBg} reduced={reduced}
            />
          </div>
        )}

        {showNumbers && (
          <div className={`mt-4 flex items-center justify-between gap-4 rounded-xl px-4 py-2.5 ${lightBg ? 'bg-white shadow-sm ring-1 ring-black/[0.06]' : 'bg-white/10 text-white backdrop-blur'}`}>
            <div className="flex items-center gap-3">
              <span className={`font-heading text-sm font-bold ${lightBg ? 'text-primary-700' : 'text-white'}`}>{String(index + 1).padStart(2, '0')}</span>
              <div className={`h-1.5 w-28 overflow-hidden rounded-full sm:w-44 ${lightBg ? 'bg-gray-200' : 'bg-white/20'}`}>
                <div className={`h-full rounded-full transition-all duration-500 ${lightBg ? 'bg-primary-600' : 'bg-white'}`} style={{ width: `${((index + 1) / count) * 100}%` }} />
              </div>
              <span className={`font-heading text-sm font-semibold ${lightBg ? 'text-gray-400' : 'text-white/60'}`}>{String(count).padStart(2, '0')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {renderPauseToggle(lightBg)}
              {arrows && (
                <>
                  <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`flex h-8 w-8 items-center justify-center border text-lg transition ${arrowShape} ${lightBg ? 'border-gray-200 hover:border-primary-600 hover:text-primary-700' : 'border-white/25 hover:bg-white/15'}`}>‹</button>
                  <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`flex h-8 w-8 items-center justify-center border text-lg transition ${arrowShape} ${lightBg ? 'border-gray-200 hover:border-primary-600 hover:text-primary-700' : 'border-white/25 hover:bg-white/15'}`}>›</button>
                </>
              )}
            </div>
          </div>
        )}

        {showProgress && (
          <div className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${lightBg ? 'bg-gray-200' : 'bg-white/20'}`}>
            <div key={`${index}-${playing}`} className={`h-full ${lightBg ? 'bg-primary-600' : 'bg-accent-400'} ${playing ? 'slider-progress' : 'w-full'}`} style={{ animationDuration: `${seconds}s` }} />
          </div>
        )}

        {showRing && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {renderPauseToggle(lightBg)}
            <div className="relative flex h-11 w-11 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="2.5" className={lightBg ? 'stroke-gray-200' : 'stroke-white/20'} />
                <circle
                  key={`${index}-${playing}`}
                  cx="18" cy="18" r="15.5" fill="none" strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray="100"
                  className={`${lightBg ? 'stroke-primary-600' : 'stroke-accent-400'} ${playing ? 'slider-ring' : ''}`}
                  style={{ animationDuration: `${seconds}s` }}
                />
              </svg>
              <span className={`absolute font-heading text-xs font-bold ${lightBg ? 'text-gray-800' : 'text-white'}`}>{index + 1}</span>
            </div>
            <span className={`text-xs font-semibold ${lightBg ? 'text-gray-500' : 'text-white/70'}`}>/ {count}</span>
          </div>
        )}

        {showTabs && (
          <div className="mt-3 hidden grid-cols-1 gap-2 md:grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {slides.map((s, i) => (
              <button key={i} type="button" onClick={() => go(i)} aria-label={`${i + 1}. slayt`} aria-current={i === index}
                className={`relative truncate rounded-xl border px-3 py-3 text-start text-sm font-semibold transition ${
                  i === index
                    ? (lightBg ? 'border-primary-600 bg-white text-primary-800 shadow-sm' : 'border-accent-400 bg-white/15 text-white')
                    : (lightBg ? 'border-transparent bg-white/60 text-gray-600 hover:bg-white' : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10')
                }`}>
                <span className="me-2 font-heading text-xs opacity-60">{String(i + 1).padStart(2, '0')}</span>
                {s.title || s.badge || `${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {dots && !showThumbs && !showIconTabs && !showNumbers && !showProgress && !showRing && (
          <div className={`mt-4 flex items-center justify-center gap-2 ${showTabs ? 'md:hidden' : ''}`}>
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`${i + 1}. slayt`} aria-current={i === index} onClick={() => go(i)}
                className={`relative h-2.5 overflow-hidden rounded-full transition-all ${i === index ? 'w-9' : 'w-2.5'} ${lightBg ? (i === index ? 'bg-primary-200' : 'bg-gray-300') : (i === index ? 'bg-white/30' : 'bg-white/35')}`}>
                {i === index && (
                  <span key={`${index}-${playing}`} className={`absolute inset-y-0 start-0 ${lightBg ? 'bg-primary-600' : 'bg-white'} ${playing ? 'slider-progress' : 'w-full'}`} style={{ animationDuration: `${seconds}s` }} />
                )}
              </button>
            ))}
            {renderPauseToggle(lightBg)}
          </div>
        )}
      </>
    )
  }

  if (layout === 'peek' || layout === 'coverflow') {
    const isCoverflow = layout === 'coverflow'
    return (
      <section className="relative overflow-hidden bg-gray-950 py-8 sm:py-12" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1360px] px-4">
          <div className={`grid gap-4 md:grid-cols-12 items-center ${isCoverflow ? '[perspective:1200px]' : ''}`}>
            {count > 1 && (
              <button type="button" onClick={() => go((index - 1 + count) % count)}
                className={`hidden md:block md:col-span-2 relative h-[320px] overflow-hidden rounded-2xl opacity-55 transition hover:opacity-80 ${isCoverflow ? '[transform:rotateY(14deg)_scale(0.92)]' : ''}`}>
                {slides[(index - 1 + count) % count]?.image_url && (
                  <img src={slides[(index - 1 + count) % count].image_url} alt="" className="h-full w-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40" />
              </button>
            )}
            <div className={`${count > 1 ? 'md:col-span-8' : 'md:col-span-12'} relative min-h-[380px] sm:min-h-[460px] overflow-hidden rounded-3xl bg-primary-950 shadow-2xl`}>
              {renderMediaBg(slides[index], index, true)}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
              <div className="relative flex min-h-[380px] sm:min-h-[460px] flex-col justify-end p-6 sm:p-10 text-white">
                {renderCountdown(slides[index], false)}
                {slides[index].badge && <span className="mb-3 w-fit rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur">{slides[index].badge}</span>}
                {slides[index].title && <h2 className="mb-2 font-heading text-2xl font-bold sm:text-4xl">{slides[index].title}</h2>}
                {slides[index].text && <p className="mb-5 max-w-2xl text-sm text-white/85 sm:text-base">{slides[index].text}</p>}
                {renderQuickAmounts(slides[index], false)}
                {renderProgress(slides[index], false)}
                {renderButtons(slides[index], '')}
              </div>
              {arrows && count > 1 && (
                <>
                  <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`absolute start-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 ${arrowShape}`}>‹</button>
                  <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`absolute end-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 ${arrowShape}`}>›</button>
                </>
              )}
            </div>
            {count > 1 && (
              <button type="button" onClick={() => go((index + 1) % count)}
                className={`hidden md:block md:col-span-2 relative h-[320px] overflow-hidden rounded-2xl opacity-55 transition hover:opacity-80 ${isCoverflow ? '[transform:rotateY(-14deg)_scale(0.92)]' : ''}`}>
                {slides[(index + 1) % count]?.image_url && (
                  <img src={slides[(index + 1) % count].image_url} alt="" className="h-full w-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40" />
              </button>
            )}
          </div>
          {renderBelowNav(false)}
        </div>
      </section>
    )
  }

  if (layout === 'bento') {
    const side1 = slides[(index + 1) % count]
    const side2 = slides[(index + 2) % count]
    return (
      <section className="bg-gray-50 py-6 sm:py-10" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="relative min-h-[380px] overflow-hidden rounded-3xl bg-primary-950 text-white shadow-lg lg:col-span-8 lg:min-h-[480px]">
              {renderMediaBg(slides[index], index, true)}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="relative flex h-full min-h-[380px] flex-col justify-end p-6 sm:p-10 lg:min-h-[480px]">
                {renderCountdown(slides[index], false)}
                {slides[index].badge && <span className="mb-3 w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur">{slides[index].badge}</span>}
                {slides[index].title && <h2 className="mb-2 font-heading text-2xl font-bold sm:text-4xl">{slides[index].title}</h2>}
                {slides[index].text && <p className="mb-5 max-w-xl text-sm text-white/85">{slides[index].text}</p>}
                {renderQuickAmounts(slides[index], false)}
                {renderProgress(slides[index], false)}
                {renderButtons(slides[index], '')}
              </div>
              {arrows && count > 1 && (
                <>
                  <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`absolute start-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 ${arrowShape}`}>‹</button>
                  <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`absolute end-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 ${arrowShape}`}>›</button>
                </>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
              {[side1, side2].filter(Boolean).map((item, k) => (
                <button key={k} type="button" onClick={() => go((index + k + 1) % count)}
                  className="group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 p-5 text-start text-white shadow-sm">
                  {item.image_url && <img src={item.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <div className="relative">
                    {item.badge && <span className="mb-1 inline-block text-[10px] font-bold uppercase tracking-wider text-accent-300">{item.badge}</span>}
                    {item.title && <div className="font-heading text-lg font-bold leading-snug">{item.title}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {renderBelowNav(true)}
        </div>
      </section>
    )
  }

  if (layout === 'vertical_thumbs') {
    const s = slides[index]
    return (
      <section className="bg-gray-950 py-6 text-white sm:py-10" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="relative min-h-[400px] overflow-hidden rounded-3xl bg-primary-950 shadow-2xl lg:col-span-8 lg:min-h-[520px]">
              {renderMediaBg(s, index, true)}
              <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 40) / 100})` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <div className="relative flex h-full min-h-[400px] flex-col justify-end p-6 sm:p-10 lg:min-h-[520px]">
                {renderCountdown(s, false)}
                {s.badge && <span className="mb-3 w-fit rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur">{s.badge}</span>}
                {s.title && <h2 className="mb-2 font-heading text-2xl font-bold sm:text-4xl">{s.title}</h2>}
                {s.text && <p className="mb-5 max-w-xl text-sm text-white/85 sm:text-base">{s.text}</p>}
                {renderQuickAmounts(s, false)}
                {renderProgress(s, false)}
                {renderButtons(s, '')}
              </div>
              {arrows && count > 1 && (
                <>
                  <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`absolute start-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 ${arrowShape}`}>‹</button>
                  <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`absolute end-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center bg-white/20 text-xl text-white backdrop-blur hover:bg-white/35 ${arrowShape}`}>›</button>
                </>
              )}
            </div>
            <div className="flex flex-col gap-2.5 lg:col-span-4 lg:max-h-[520px] lg:overflow-y-auto">
              <div className="mb-1 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wider text-white/60">
                <span>{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
                {renderPauseToggle(false)}
              </div>
              {slides.map((item, i) => {
                const active = i === index
                return (
                  <button key={i} type="button" onClick={() => go(i)} aria-current={active}
                    className={`group flex items-center gap-3.5 rounded-2xl border p-2.5 text-start transition ${
                      active ? 'border-accent-400 bg-white/15 shadow-lg' : 'border-white/10 bg-white/5 opacity-75 hover:bg-white/10 hover:opacity-100'
                    }`}>
                    <div className="relative h-16 w-24 flex-none overflow-hidden rounded-xl bg-gray-800">
                      {(item.mobile_image_url || item.image_url) && (
                        <img src={item.mobile_image_url || item.image_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.badge && <div className="truncate text-[10px] font-bold uppercase tracking-wider text-accent-300">{item.badge}</div>}
                      <div className="line-clamp-2 font-heading text-sm font-bold text-white">{item.title || `Slayt ${i + 1}`}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'dual_sync') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-white py-6 sm:py-10" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y', ...(s.bg_color ? { backgroundColor: s.bg_color } : {}) }}>
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="grid items-stretch overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-xl md:grid-cols-2">
            <div className="relative overflow-hidden bg-primary-950 text-white">
              <div className={`flex h-full flex-col justify-between p-8 sm:p-12 transition-all ${motion}`} key={`text-${index}`}>
                <div>
                  <div className="mb-6 flex items-center justify-between text-xs font-bold uppercase tracking-[2px] text-accent-300">
                    <span>{s.badge || 'ÖNE ÇIKAN'}</span>
                    <span>{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
                  </div>
                  {renderCountdown(s, false)}
                  {s.title && <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-white sm:text-4xl">{s.title}</h2>}
                  {s.text && <p className="mb-6 text-base leading-relaxed text-white/80">{s.text}</p>}
                  {renderQuickAmounts(s, false)}
                  {renderProgress(s, false)}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  {renderButtons(s, '')}
                  {arrows && count > 1 && (
                    <div className="flex items-center gap-2">
                      {renderPauseToggle(false)}
                      <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`flex h-10 w-10 items-center justify-center border border-white/25 text-xl text-white hover:bg-white/15 ${arrowShape}`}>‹</button>
                      <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`flex h-10 w-10 items-center justify-center border border-white/25 text-xl text-white hover:bg-white/15 ${arrowShape}`}>›</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="relative min-h-[300px] overflow-hidden bg-gray-100 md:min-h-[480px]">
              <div key={`media-${index}`} className={`absolute inset-0 transition-transform ${motion} animate-[slide-text_.65s_ease-out_both]`}>
                {renderMediaBg(s, index, true)}
              </div>
            </div>
          </div>
          {renderBelowNav(true)}
        </div>
      </section>
    )
  }

  if (layout === 'magazine') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-gray-950" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className={`relative overflow-hidden ${heightClass || 'min-h-[520px] md:min-h-[620px]'}`}>
          {renderMediaBg(s, index, true)}
          <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 45) / 100})` }} />
          <div className="relative mx-auto flex h-full min-h-[520px] max-w-[1280px] flex-col justify-end px-4 pb-8 pt-20 sm:px-6 md:min-h-[620px]">
            <div className="grid items-end gap-6 lg:grid-cols-12">
              <div className="rounded-3xl border border-white/15 bg-black/55 p-6 text-white shadow-2xl backdrop-blur-md sm:p-8 lg:col-span-7">
                {renderCountdown(s, false)}
                {s.badge && <span className="mb-3 inline-block rounded-full bg-accent-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-white">{s.badge}</span>}
                {s.title && <h2 className="mb-3 font-heading text-2xl font-bold leading-tight sm:text-4xl">{s.title}</h2>}
                {s.text && <p className="mb-5 text-sm leading-relaxed text-white/85 sm:text-base">{s.text}</p>}
                {renderQuickAmounts(s, false)}
                {renderProgress(s, false)}
                {renderButtons(s, '')}
              </div>
              {count > 1 && (
                <div className="flex flex-col gap-2 lg:col-span-5">
                  <div className="mb-1 flex items-center justify-end gap-2">
                    {renderPauseToggle(false)}
                    {arrows && (
                      <>
                        <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`flex h-9 w-9 items-center justify-center bg-black/45 text-lg text-white backdrop-blur hover:bg-white/25 ${arrowShape}`}>‹</button>
                        <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`flex h-9 w-9 items-center justify-center bg-black/45 text-lg text-white backdrop-blur hover:bg-white/25 ${arrowShape}`}>›</button>
                      </>
                    )}
                  </div>
                  {slides.slice(0, 4).map((item, i) => (
                    <button key={i} type="button" onClick={() => go(i)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-start transition backdrop-blur-md ${
                        i === index ? 'border-accent-400 bg-white text-gray-900 shadow-lg' : 'border-white/15 bg-black/45 text-white hover:bg-black/65'
                      }`}>
                      <span className={`font-heading text-xs font-extrabold ${i === index ? 'text-primary-600' : 'text-accent-300'}`}>{String(i + 1).padStart(2, '0')}</span>
                      <span className="line-clamp-1 flex-1 text-sm font-bold">{item.title || item.badge || `Slayt ${i + 1}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'floating_donate') {
    const s = slides[index]
    const nextSlide = slides[(index + 1) % count]
    return (
      <section className="relative overflow-hidden bg-gray-950" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className={`relative overflow-hidden ${heightClass || 'min-h-[540px] md:min-h-[620px]'}`}>
          {renderMediaBg(s, index, true)}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/30" />
          <div className="relative mx-auto grid h-full min-h-[540px] max-w-[1280px] items-center gap-8 px-4 py-16 sm:px-6 md:min-h-[620px] lg:grid-cols-12">
            <div className="text-white lg:col-span-7">
              {s.badge && <span className="mb-3 inline-block rounded-full bg-accent-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-white">{s.badge}</span>}
              {s.title && <h2 className="mb-4 font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
              {s.text && <p className="mb-6 max-w-xl text-base leading-relaxed text-white/85">{s.text}</p>}
              {count > 1 && (
                <div className="flex items-center gap-2">
                  {arrows && (
                    <>
                      <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`flex h-10 w-10 items-center justify-center bg-white/15 text-lg text-white backdrop-blur hover:bg-white/25 ${arrowShape}`}>‹</button>
                      <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`flex h-10 w-10 items-center justify-center bg-white/15 text-lg text-white backdrop-blur hover:bg-white/25 ${arrowShape}`}>›</button>
                    </>
                  )}
                  <span className="ms-2 text-xs font-bold text-white/75">{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-white/20 bg-white/95 p-6 text-gray-900 shadow-2xl backdrop-blur-md lg:col-span-5">
              <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-primary-600">Hızlı Destek</div>
              <div className="mb-4 font-heading text-xl font-extrabold text-gray-900">{s.campaign?.title || s.title || 'Bağış Yapın'}</div>
              {renderCountdown(s, true)}
              {renderQuickAmounts(s, true)}
              {renderProgress(s, true)}
              <div className="mt-4">{renderButtons(s, '')}</div>
              {nextSlide && count > 1 && (
                <button type="button" onClick={() => go((index + 1) % count)} className="mt-4 flex w-full items-center justify-between border-t border-gray-100 pt-3 text-xs font-semibold text-gray-500 hover:text-primary-700">
                  <span className="truncate">Sıradaki: {nextSlide.title || 'Sonraki proje'}</span>
                  <span>→</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'kinetic_collage') {
    const s = slides[index]
    const s2 = slides[(index + 1) % count] || s
    return (
      <section className="relative overflow-hidden bg-primary-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-accent-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-accent-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 max-w-lg text-base leading-relaxed text-white/80">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
            {count > 1 && (
              <div className="mt-8 flex items-center gap-2">
                {slides.map((_, i) => (
                  <button key={i} type="button" aria-label={`Slayt ${i + 1}`} onClick={() => go(i)}
                    className={`h-2 rounded-full transition-all ${i === index ? 'w-8 bg-accent-400' : 'w-2 bg-white/30 hover:bg-white/60'}`} />
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:col-span-6">
            <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-2xl">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[3/4] w-full object-cover transition duration-500" />}
            </div>
            <div className="mt-8 overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-2xl">
              {s2.image_url && <img src={s2.image_url} alt={s2.title || ''} className="aspect-[3/4] w-full object-cover transition duration-500" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'spotlight') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-slate-950 py-10 text-white sm:py-14" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1220px] px-4 sm:px-6">
          <div className={`relative overflow-hidden rounded-3xl border border-white/15 shadow-2xl ${heightClass || 'min-h-[460px] md:min-h-[540px]'}`}>
            {renderMediaBg(s, index, true)}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div className="relative flex h-full min-h-[460px] flex-col justify-end p-6 sm:p-10 md:min-h-[540px]">
              <div className="max-w-2xl">
                {s.badge && <span className="mb-2 inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest backdrop-blur">{s.badge}</span>}
                {s.title && <h2 className="font-heading text-2xl font-extrabold leading-tight sm:text-4xl">{s.title}</h2>}
                {s.text && <p className="mt-2.5 text-sm leading-relaxed text-white/85 sm:text-base">{s.text}</p>}
                <div className="mt-5">{renderButtons(s, '')}</div>
              </div>
            </div>
          </div>
          {count > 1 && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex flex-1 gap-2">
                {slides.map((item, i) => (
                  <button key={i} type="button" onClick={() => go(i)}
                    className={`h-1.5 flex-1 rounded-full transition ${i === index ? 'bg-accent-400' : 'bg-white/20 hover:bg-white/40'}`}
                    aria-label={item.title || `Slayt ${i + 1}`} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {renderPauseToggle(false)}
                <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`flex h-9 w-9 items-center justify-center bg-white/10 text-white hover:bg-white/20 ${arrowShape}`}>‹</button>
                <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`flex h-9 w-9 items-center justify-center bg-white/10 text-white hover:bg-white/20 ${arrowShape}`}>›</button>
              </div>
            </div>
          )}
        </div>
      </section>
    )
  }

  if (layout === 'split_dark') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-slate-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-emerald-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base leading-relaxed text-slate-300">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
            {count > 1 && (
              <div className="mt-8 flex items-center gap-2">
                <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)} className={`flex h-9 w-9 items-center justify-center bg-white/10 text-white hover:bg-white/20 ${arrowShape}`}>‹</button>
                <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)} className={`flex h-9 w-9 items-center justify-center bg-white/10 text-white hover:bg-white/20 ${arrowShape}`}>›</button>
                <span className="ms-2 text-xs font-bold text-slate-400">{index + 1} / {count}</span>
              </div>
            )}
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'news_ticker') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-gray-950" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className={`relative overflow-hidden ${heightClass || 'min-h-[480px] md:min-h-[560px]'}`}>
          {renderMediaBg(s, index, true)}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
          <div className="relative mx-auto flex h-full min-h-[480px] max-w-[1280px] flex-col justify-end px-4 pb-10 pt-20 text-white sm:px-6 md:min-h-[560px]">
            <div className="max-w-2xl">
              {s.badge && <span className="mb-3 inline-block rounded-full bg-accent-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest">{s.badge}</span>}
              {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
              {s.text && <p className="mt-3 text-base text-white/85">{s.text}</p>}
              <div className="mt-5">{renderButtons(s, '')}</div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 bg-primary-900 py-2.5 text-xs font-semibold text-white">
          <div className="mx-auto flex max-w-[1280px] items-center gap-4 overflow-x-auto px-4 sm:px-6">
            {slides.map((item, i) => (
              <button key={i} type="button" onClick={() => go(i)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 transition ${i === index ? 'bg-white text-primary-950 font-bold' : 'text-white/80 hover:text-white'}`}>
                {item.badge ? `${item.badge}: ` : ''}{item.title || `Duyuru ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'grid_collage') {
    const s = slides[index]
    const s2 = slides[(index + 1) % count] || s
    const s3 = slides[(index + 2) % count] || s
    return (
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-slate-50 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base leading-relaxed text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:col-span-7">
            <div className="row-span-2 overflow-hidden rounded-3xl shadow-lg">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="h-full min-h-[320px] w-full object-cover" />}
            </div>
            <div className="overflow-hidden rounded-3xl shadow-md">
              {s2.image_url && <img src={s2.image_url} alt={s2.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
            <div className="overflow-hidden rounded-3xl shadow-md">
              {s3.image_url && <img src={s3.image_url} alt={s3.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'emerald_gold_slider') {
    const s = slides[index]
    return (
      <section
        className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 py-14 text-white sm:py-20"
        aria-roledescription="carousel"
        aria-label={label}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && (
              <span className="mb-3 inline-block rounded-full border border-amber-400/40 bg-amber-400/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-300">
                {s.badge}
              </span>
            )}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base leading-relaxed text-emerald-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
            {count > 1 && (
              <div className="mt-8 flex items-center gap-2">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Slayt ${i + 1}`}
                    onClick={() => go(i)}
                    className={`h-2 rounded-full transition-all ${i === index ? 'w-8 bg-amber-400' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-3xl border border-amber-400/30 bg-black/30 shadow-2xl">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'split_progress_slider') {
    const s = slides[index]
    const pct = Math.round(((index + 1) / Math.max(1, count)) * 100)
    return (
      <section
        className="relative overflow-hidden bg-white py-12 text-gray-900 sm:py-16"
        aria-roledescription="carousel"
        aria-label={label}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-primary-600 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-extrabold tabular-nums text-gray-500">
              {index + 1} / {count}
            </span>
          </div>
          <div className="grid items-center gap-8 rounded-3xl border border-gray-200 bg-gray-50/70 p-6 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-800">{s.badge}</span>}
              {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl">{s.title}</h2>}
              {s.text && <p className="mt-3 text-base leading-relaxed text-gray-600">{s.text}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {renderButtons(s, '')}
              </div>
              {count > 1 && (
                <div className="mt-6 flex items-center gap-2">
                  <button type="button" aria-label="Önceki slayt" onClick={() => go((index - 1 + count) % count)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-lg text-gray-700 hover:bg-primary-50">‹</button>
                  <button type="button" aria-label="Sonraki slayt" onClick={() => go((index + 1) % count)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-lg text-gray-700 hover:bg-primary-50">›</button>
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl bg-gray-200 shadow-lg lg:col-span-6">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'full_bleed_caption_slider') {
    const s = slides[index]
    return (
      <section
        className="relative min-h-[460px] overflow-hidden bg-slate-950 text-white sm:min-h-[540px]"
        aria-roledescription="carousel"
        aria-label={label}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {s.image_url && (
          <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20" />
        <div className="relative mx-auto flex min-h-[460px] max-w-[1280px] flex-col justify-end px-4 pb-10 pt-20 sm:min-h-[540px] sm:px-6 sm:pb-14">
          <div className="max-w-3xl">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-white/20 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-white backdrop-blur-sm">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base leading-relaxed text-white/85">{s.text}</p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div>{renderButtons(s, 'dark')}</div>
              {count > 1 && (
                <div className="flex items-center gap-2">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Slayt ${i + 1}`}
                      onClick={() => go(i)}
                      className={`h-2.5 rounded-full transition-all ${i === index ? 'w-8 bg-white' : 'w-2.5 bg-white/40 hover:bg-white/70'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'arch_islamic_slider') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50/60 via-white to-primary-50/40 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base leading-relaxed text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="flex justify-center lg:col-span-6">
            <div className="w-full max-w-md overflow-hidden rounded-t-[160px] rounded-b-3xl border-4 border-amber-300/70 bg-white p-2 shadow-xl">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[4/5] w-full rounded-t-[150px] rounded-b-2xl object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'countdown_urgent_slider') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-red-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-red-600 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white">
              <span className="h-2 w-2 animate-ping rounded-full bg-white" /> {s.badge || 'ACİL YARDIM'}
            </div>
            {renderCountdown(s, false)}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base leading-relaxed text-red-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-red-400/30 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'quick_amount_slider') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-primary-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-white/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-accent-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-white/80">{s.text}</p>}
            <div className="mt-4">{renderQuickAmounts(s, false)}</div>
            <div className="mt-4">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/15 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'filmstrip_bottom_slider') {
    const s = slides[index]
    return (
      <section className="bg-slate-950 text-white" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="relative min-h-[420px] sm:min-h-[500px]">
          {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-75" />}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-black/40 to-transparent" />
          <div className="relative mx-auto flex min-h-[420px] max-w-[1280px] flex-col justify-end px-4 pb-8 pt-16 sm:min-h-[500px] sm:px-6">
            {s.badge && <span className="mb-2 w-fit rounded-full bg-amber-400/20 px-3 py-1 text-xs font-extrabold text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="max-w-3xl font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            <div className="mt-5">{renderButtons(s, 'dark')}</div>
          </div>
        </div>
        {count > 1 && (
          <div className="border-t border-white/10 bg-black/60 py-3">
            <div className="mx-auto flex max-w-[1280px] gap-2 overflow-x-auto px-4 sm:px-6">
              {slides.map((item, i) => (
                <button key={i} type="button" onClick={() => go(i)} className={`h-14 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === index ? 'border-amber-400 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}>
                  {item.image_url && <img src={item.image_url} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    )
  }

  if (layout === 'polaroid_collage_slider') {
    const s = slides[index]
    const s2 = slides[(index + 1) % count] || s
    return (
      <section className="overflow-hidden bg-amber-50/40 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold uppercase text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="relative grid grid-cols-2 gap-4 lg:col-span-6">
            <div className="-rotate-2 rounded-2xl bg-white p-3 pb-7 shadow-xl ring-1 ring-black/5">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[4/3] w-full rounded-lg object-cover" />}
            </div>
            <div className="mt-6 rotate-2 rounded-2xl bg-white p-3 pb-7 shadow-xl ring-1 ring-black/5">
              {s2.image_url && <img src={s2.image_url} alt={s2.title || ''} className="aspect-[4/3] w-full rounded-lg object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'glass_card_overlay_slider') {
    const s = slides[index]
    return (
      <section className="relative flex min-h-[460px] items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 sm:min-h-[540px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 mx-auto max-w-2xl rounded-3xl border border-white/25 bg-white/15 p-8 text-center text-white shadow-2xl backdrop-blur-md sm:p-12">
          {s.badge && <span className="mb-3 inline-block rounded-full bg-white/20 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest">{s.badge}</span>}
          {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
          {s.text && <p className="mt-3 text-base text-white/90">{s.text}</p>}
          <div className="mt-6 flex justify-center">{renderButtons(s, 'justify-center')}</div>
        </div>
      </section>
    )
  }

  if (layout === 'split_50_50_framed') {
    const s = slides[index]
    return (
      <section className="bg-white py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="grid items-center gap-8 rounded-3xl border-2 border-primary-200 bg-white p-6 shadow-sm sm:p-10 md:grid-cols-2">
            <div>
              {s.badge && <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-primary-700">{s.badge}</div>}
              {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
              {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
              <div className="mt-6">{renderButtons(s, '')}</div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[4/3] w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'vertical_chapter_slider') {
    const s = slides[index]
    return (
      <section className="bg-gray-50 py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            {slides.map((item, i) => (
              <button key={i} type="button" onClick={() => go(i)} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition ${i === index ? 'border-primary-600 bg-white shadow-md' : 'border-transparent bg-white/50 text-gray-500 hover:bg-white'}`}>
                <span className={`font-heading text-sm font-extrabold ${i === index ? 'text-primary-600' : 'text-gray-400'}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate font-heading text-sm font-bold text-gray-900">{item.title || item.badge || `Slayt ${i + 1}`}</span>
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-3xl bg-white p-6 shadow-lg lg:col-span-8">
            <div className="grid items-center gap-6 md:grid-cols-2">
              <div>
                {s.badge && <span className="mb-2 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">{s.badge}</span>}
                {s.title && <h2 className="font-heading text-2xl font-extrabold text-gray-900 sm:text-3xl">{s.title}</h2>}
                {s.text && <p className="mt-2 text-sm text-gray-600">{s.text}</p>}
                <div className="mt-5">{renderButtons(s, '')}</div>
              </div>
              <div className="overflow-hidden rounded-2xl bg-gray-100">
                {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[4/3] w-full object-cover" />}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'dark_amber_spotlight') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-zinc-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-500/20 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-400">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-zinc-300">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-amber-500/30 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'bordered_editorial_slider') {
    const s = slides[index]
    return (
      <section className="border-y border-gray-200 bg-white py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            {s.badge && <div className="mb-2 text-xs font-extrabold uppercase tracking-[3px] text-primary-700">{s.badge}</div>}
            {s.title && <h2 className="font-serif text-3xl font-bold leading-tight text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base leading-relaxed text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden border border-gray-300 p-2 lg:col-span-7">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/9] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'floating_stats_slider') {
    const s = slides[index]
    return (
      <section className="bg-primary-50/40 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold uppercase text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="relative lg:col-span-6">
            <div className="overflow-hidden rounded-3xl shadow-xl">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
            {s.campaign && (
              <div className="absolute -bottom-5 start-5 rounded-2xl border border-primary-100 bg-white px-5 py-3 shadow-xl">
                <div className="text-xs font-bold text-gray-500">{s.campaign.title}</div>
                <div className="font-heading text-xl font-extrabold text-primary-700">%{s.campaign.progress} · {s.campaign.collected}</div>
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'duotone_emerald_slider') {
    const s = slides[index]
    return (
      <section className="relative min-h-[460px] overflow-hidden bg-emerald-950 text-white sm:min-h-[540px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-luminosity" />}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-900/80 to-emerald-800/60" />
        <div className="relative mx-auto flex min-h-[460px] max-w-[1280px] flex-col justify-center px-4 py-16 sm:min-h-[540px] sm:px-6">
          <div className="max-w-2xl">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-400/20 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold leading-tight sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-emerald-100/90">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'split_card_overlap_slider') {
    const s = slides[index]
    return (
      <section className="bg-gray-50 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center px-4 sm:px-6 lg:grid-cols-12">
          <div className="relative z-10 rounded-3xl border border-gray-200 bg-white p-8 shadow-2xl lg:col-span-6 lg:-me-14">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-extrabold text-primary-700">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-xl lg:col-span-7 lg:col-start-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'dark_sapphire_slider') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-950 via-slate-900 to-cyan-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full border border-cyan-400/30 bg-cyan-400/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-cyan-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-sky-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-cyan-400/25 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'two_row_thumbs_slider') {
    const s = slides[index]
    return (
      <section className="bg-white py-10 sm:py-14" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] space-y-5 px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[21/9] w-full object-cover opacity-70" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
              {s.title && <h2 className="font-heading text-2xl font-extrabold sm:text-4xl">{s.title}</h2>}
              <div className="mt-4">{renderButtons(s, 'dark')}</div>
            </div>
          </div>
          {count > 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {slides.slice(0, 4).map((item, i) => (
                <button key={i} type="button" onClick={() => go(i)} className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition ${i === index ? 'border-primary-600 bg-primary-50/50' : 'border-gray-200 bg-white hover:border-primary-300'}`}>
                  {item.image_url && <img src={item.image_url} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />}
                  <span className="line-clamp-2 font-heading text-xs font-bold text-gray-900">{item.title || item.badge || `Slayt ${i + 1}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    )
  }

  if (layout === 'video_split_slider') {
    const s = slides[index]
    return (
      <section className="bg-slate-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase text-accent-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-slate-300">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/15 bg-black shadow-2xl lg:col-span-7">
            {renderMediaBg(s, index, true)}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'diagonal_split_dark_slider') {
    const s = slides[index]
    return (
      <section className="relative overflow-hidden bg-zinc-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-500/20 px-3 py-1 text-xs font-extrabold text-primary-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-zinc-300">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl [clip-path:polygon(8%_0,100%_0,100%_100%,0_100%)] lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'minimal_counter_slider') {
    const s = slides[index]
    return (
      <section className="border-y border-gray-200 bg-white py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <div className="mb-4 font-heading text-4xl font-black text-primary-600/30">{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</div>
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-200 lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'campaign_goal_slider') {
    const s = slides[index]
    return (
      <section className="bg-primary-50/40 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-4">{renderProgress(s, true)}</div>
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'quote_overlay_slider') {
    const s = slides[index]
    return (
      <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-center text-white sm:min-h-[500px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-45" />}
        <div className="relative z-10 mx-auto max-w-3xl">
          {s.badge && <div className="mb-3 text-xs font-extrabold uppercase tracking-[3px] text-amber-300">{s.badge}</div>}
          {s.title && <h2 className="font-serif text-3xl font-bold italic leading-snug sm:text-5xl">“{s.title}”</h2>}
          {s.text && <p className="mt-4 text-base text-white/85">{s.text}</p>}
          <div className="mt-6 flex justify-center">{renderButtons(s, 'justify-center')}</div>
        </div>
      </section>
    )
  }

  if (layout === 'compact_banner_slider') {
    const s = slides[index]
    return (
      <section className="bg-primary-900 py-8 text-white" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {s.badge && <span className="me-2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-slate-950">{s.badge}</span>}
            {s.title && <span className="font-heading text-lg font-bold sm:text-xl">{s.title}</span>}
          </div>
          <div>{renderButtons(s, 'dark')}</div>
        </div>
      </section>
    )
  }

  if (layout === 'bento_3_tile_slider') {
    const s = slides[index]
    const s2 = slides[(index + 1) % count] || s
    const s3 = slides[(index + 2) % count] || s
    return (
      <section className="bg-white py-10 sm:py-14" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] gap-4 px-4 sm:px-6 lg:grid-cols-12">
          <div className="relative min-h-[340px] overflow-hidden rounded-3xl bg-slate-950 p-7 text-white lg:col-span-8">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-70" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="relative flex h-full flex-col justify-end">
              {s.title && <h2 className="font-heading text-2xl font-extrabold sm:text-4xl">{s.title}</h2>}
              <div className="mt-4">{renderButtons(s, 'dark')}</div>
            </div>
          </div>
          <div className="grid gap-4 lg:col-span-4">
            {[s2, s3].map((item, k) => (
              <div key={k} className="relative min-h-[160px] overflow-hidden rounded-3xl bg-slate-900 p-5 text-white">
                {item.image_url && <img src={item.image_url} alt={item.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-65" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="relative flex h-full items-end font-heading text-base font-bold">{item.title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'gold_frame_center_slider') {
    const s = slides[index]
    return (
      <section className="bg-amber-50/30 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="rounded-3xl border-2 border-amber-400/60 bg-white p-8 shadow-xl sm:p-12">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-100 px-3.5 py-1 text-xs font-extrabold uppercase text-amber-900">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">{s.text}</p>}
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover" />}
            <div className="mt-6 flex justify-center">{renderButtons(s, 'justify-center')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'soft_pastel_split_slider') {
    const s = slides[index]
    return (
      <section className="bg-rose-50/40 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 rounded-3xl bg-white p-8 shadow-sm sm:p-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[4/3] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'split_ruby_urgent_slider') {
    const s = slides[index]
    return (
      <section className="bg-gradient-to-br from-rose-950 via-red-900 to-slate-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-red-600 px-3.5 py-1 text-xs font-extrabold uppercase text-white">
              <span className="h-2 w-2 animate-ping rounded-full bg-white" /> {s.badge || 'ACİL YARDIM'}
            </span>
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-rose-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-red-400/30 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'mosaic_4_photo_slider') {
    const s = slides[index]
    const s2 = slides[(index + 1) % count] || s
    const s3 = slides[(index + 2) % count] || s
    const s4 = slides[(index + 3) % count] || s
    return (
      <section className="bg-white py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold uppercase text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:col-span-7">
            {[s, s2, s3, s4].map((item, k) => (
              <div key={k} className="aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100 shadow-sm">
                {item.image_url && <img src={item.image_url} alt={item.title || ''} className="h-full w-full object-cover" />}
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'glass_bottom_bar_slider') {
    const s = slides[index]
    return (
      <section className="relative flex min-h-[460px] items-end overflow-hidden bg-slate-950 text-white sm:min-h-[540px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="relative z-10 w-full border-t border-white/20 bg-black/50 py-6 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
            <div>
              {s.title && <h2 className="font-heading text-2xl font-extrabold sm:text-3xl">{s.title}</h2>}
              {s.text && <p className="mt-1 text-sm text-white/80">{s.text}</p>}
            </div>
            <div>{renderButtons(s, 'dark')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'circle_portrait_slider') {
    const s = slides[index]
    return (
      <section className="bg-primary-50/30 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="flex justify-center lg:col-span-6">
            <div className="h-72 w-72 overflow-hidden rounded-full border-8 border-white shadow-2xl sm:h-96 sm:w-96">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="h-full w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'dark_olive_gold_slider') {
    const s = slides[index]
    return (
      <section className="bg-gradient-to-br from-lime-950 via-stone-950 to-black py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full border border-amber-400/40 bg-amber-400/15 px-3.5 py-1 text-xs font-extrabold uppercase text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-stone-300">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border-2 border-amber-400/35 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'numbered_list_right_slider') {
    const s = slides[index]
    return (
      <section className="bg-white py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl lg:col-span-8">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/9] w-full object-cover opacity-75" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              {s.title && <h2 className="font-heading text-2xl font-extrabold sm:text-3xl">{s.title}</h2>}
              <div className="mt-4">{renderButtons(s, 'dark')}</div>
            </div>
          </div>
          <div className="space-y-2 lg:col-span-4">
            {slides.map((item, i) => (
              <button key={i} type="button" onClick={() => go(i)} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition ${i === index ? 'border-primary-600 bg-primary-50/60' : 'border-gray-200 bg-white hover:border-primary-300'}`}>
                <span className="font-heading text-sm font-black text-primary-700">{String(i + 1).padStart(2, '0')}</span>
                <span className="truncate text-sm font-bold text-gray-900">{item.title || item.badge || `Slayt ${i + 1}`}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'floating_pill_cta_slider') {
    const s = slides[index]
    return (
      <section className="relative flex min-h-[440px] items-end justify-center overflow-hidden bg-slate-950 p-6 pb-10 text-white sm:min-h-[520px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="relative z-10 flex max-w-4xl flex-wrap items-center justify-between gap-4 rounded-full border border-white/25 bg-black/65 px-7 py-4 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            {s.title && <h2 className="truncate font-heading text-xl font-extrabold sm:text-2xl">{s.title}</h2>}
          </div>
          <div>{renderButtons(s, 'dark')}</div>
        </div>
      </section>
    )
  }

  if (layout === 'split_reverse_card_slider') {
    const s = slides[index]
    return (
      <section className="bg-gray-50 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="overflow-hidden rounded-3xl shadow-xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-lg lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-extrabold text-primary-700">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'minimal_typographic_banner_slider') {
    const s = slides[index]
    return (
      <section className="border-y border-gray-200 bg-white py-16 text-center sm:py-24" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          {s.badge && <div className="mb-3 text-xs font-extrabold uppercase tracking-[3px] text-primary-700">{s.badge}</div>}
          {s.title && <h2 className="font-serif text-4xl font-bold leading-tight text-gray-950 sm:text-6xl">{s.title}</h2>}
          {s.text && <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600">{s.text}</p>}
          <div className="mt-7 flex justify-center">{renderButtons(s, 'justify-center')}</div>
        </div>
      </section>
    )
  }

  if (layout === 'countdown_gold_slider') {
    const s = slides[index]
    return (
      <section className="bg-slate-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-400/20 px-3.5 py-1 text-xs font-extrabold uppercase text-amber-300">{s.badge}</span>}
            {renderCountdown(s, false)}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-slate-300">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-amber-400/30 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'bordered_dual_button_slider') {
    const s = slides[index]
    return (
      <section className="bg-white py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="grid items-center gap-8 rounded-3xl border-2 border-gray-900 bg-white p-7 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              {s.badge && <span className="mb-2 inline-block text-xs font-extrabold uppercase tracking-widest text-primary-700">{s.badge}</span>}
              {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
              {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
              <div className="mt-6">{renderButtons(s, '')}</div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 lg:col-span-6">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'warm_terracotta_slider') {
    const s = slides[index]
    return (
      <section className="bg-gradient-to-br from-orange-950 via-amber-950 to-stone-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-400/20 px-3.5 py-1 text-xs font-extrabold uppercase text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-orange-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-amber-400/25 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'split_indigo_silver_slider') {
    const s = slides[index]
    return (
      <section className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-sky-300/20 px-3.5 py-1 text-xs font-extrabold uppercase text-sky-200">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-indigo-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/15 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'full_bleed_duotone_ruby') {
    const s = slides[index]
    return (
      <section className="relative min-h-[460px] overflow-hidden bg-rose-950 text-white sm:min-h-[540px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-luminosity" />}
        <div className="absolute inset-0 bg-gradient-to-r from-rose-950 via-red-900/75 to-rose-900/50" />
        <div className="relative mx-auto flex min-h-[460px] max-w-[1280px] flex-col justify-center px-4 py-16 sm:min-h-[540px] sm:px-6">
          <div className="max-w-2xl">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-red-600 px-3.5 py-1 text-xs font-extrabold uppercase text-white">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-rose-100/90">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'card_grid_3_slider') {
    const shown = [slides[index], slides[(index + 1) % count] || slides[index], slides[(index + 2) % count] || slides[index]]
    return (
      <section className="bg-gray-50 py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] gap-6 px-4 sm:px-6 md:grid-cols-3">
          {shown.map((item, k) => (
            <div key={k} className="flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              {item.image_url && <img src={item.image_url} alt={item.title || ''} className="mb-4 aspect-[16/10] w-full rounded-2xl object-cover" />}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-primary-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary-700">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold text-gray-900">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-600">{item.text}</p>}
              <div className="mt-4">{renderButtons(item, '')}</div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (layout === 'top_badge_center_slider') {
    const s = slides[index]
    return (
      <section className="bg-white py-14 text-center sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-4 py-1 text-xs font-extrabold uppercase text-primary-800">{s.badge}</span>}
          {s.title && <h2 className="mx-auto max-w-3xl font-heading text-3xl font-extrabold text-gray-900 sm:text-5xl">{s.title}</h2>}
          {s.text && <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">{s.text}</p>}
          <div className="mt-6 flex justify-center">{renderButtons(s, 'justify-center')}</div>
          {s.image_url && <img src={s.image_url} alt={s.title || ''} className="mt-8 aspect-[21/9] w-full rounded-3xl object-cover shadow-xl" />}
        </div>
      </section>
    )
  }

  if (layout === 'sidebar_cta_slider') {
    const s = slides[index]
    return (
      <section className="bg-primary-950 py-12 text-white sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-stretch gap-6 px-4 sm:px-6 lg:grid-cols-12">
          <div className="flex flex-col justify-center rounded-3xl border border-white/15 bg-white/5 p-7 lg:col-span-4">
            {s.badge && <span className="mb-2 w-fit rounded-full bg-amber-400/20 px-3 py-1 text-xs font-extrabold text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-2xl font-extrabold sm:text-3xl">{s.title}</h2>}
            {s.text && <p className="mt-2 text-sm text-white/80">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl lg:col-span-8">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="h-full min-h-[300px] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'dark_plum_gold_slider') {
    const s = slides[index]
    return (
      <section className="bg-gradient-to-br from-purple-950 via-fuchsia-950 to-slate-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-400/20 px-3.5 py-1 text-xs font-extrabold uppercase text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-purple-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-amber-400/30 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'minimal_border_box_slider') {
    const s = slides[index]
    return (
      <section className="bg-white py-12 sm:py-16" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="grid items-center gap-8 rounded-2xl border border-gray-300 p-6 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              {s.badge && <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-primary-700">{s.badge}</div>}
              {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
              {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
              <div className="mt-6">{renderButtons(s, '')}</div>
            </div>
            <div className="overflow-hidden rounded-xl lg:col-span-6">
              {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'pill_overlay_bottom_slider') {
    const s = slides[index]
    return (
      <section className="relative flex min-h-[460px] items-end justify-center overflow-hidden bg-slate-950 p-6 pb-8 text-white sm:min-h-[540px]" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {s.image_url && <img src={s.image_url} alt={s.title || ''} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="relative z-10 flex max-w-4xl flex-wrap items-center justify-between gap-4 rounded-full border border-white/25 bg-white/90 px-7 py-3.5 text-gray-900 shadow-2xl backdrop-blur-md">
          {s.title && <h2 className="font-heading text-lg font-extrabold sm:text-xl">{s.title}</h2>}
          <div>{renderButtons(s, '')}</div>
        </div>
      </section>
    )
  }

  if (layout === 'split_icon_list_slider') {
    const s = slides[index]
    return (
      <section className="bg-primary-50/40 py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3.5 py-1 text-xs font-extrabold text-white">✓ {s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-4xl">{s.title}</h2>}
            {s.text && <p className="mt-3 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border-4 border-white shadow-xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'diagonal_light_slider') {
    const s = slides[index]
    return (
      <section className="bg-white py-14 sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold text-primary-800">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold text-gray-900 sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-gray-600">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, '')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl [clip-path:polygon(10%_0,100%_0,100%_100%,0_100%)] shadow-xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'dark_forest_amber_slider') {
    const s = slides[index]
    return (
      <section className="bg-gradient-to-br from-green-950 via-emerald-950 to-stone-950 py-14 text-white sm:py-20" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {s.badge && <span className="mb-3 inline-block rounded-full bg-amber-400/20 px-3.5 py-1 text-xs font-extrabold uppercase text-amber-300">{s.badge}</span>}
            {s.title && <h2 className="font-heading text-3xl font-extrabold sm:text-5xl">{s.title}</h2>}
            {s.text && <p className="mt-4 text-base text-emerald-100/85">{s.text}</p>}
            <div className="mt-6">{renderButtons(s, 'dark')}</div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-amber-400/25 shadow-2xl lg:col-span-6">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="aspect-[16/10] w-full object-cover" />}
          </div>
        </div>
      </section>
    )
  }

  if (layout === 'compact_card_row_slider') {
    const s = slides[index]
    return (
      <section className="bg-gray-50 py-8" aria-roledescription="carousel" aria-label={label}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {s.image_url && <img src={s.image_url} alt={s.title || ''} className="h-24 w-36 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              {s.badge && <div className="text-[11px] font-extrabold uppercase text-primary-700">{s.badge}</div>}
              {s.title && <h2 className="font-heading text-xl font-bold text-gray-900">{s.title}</h2>}
              {s.text && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{s.text}</p>}
            </div>
            <div>{renderButtons(s, '')}</div>
          </div>
        </div>
      </section>
    )
  }

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

                const imgLeft = s.image_pos === 'left'
                return (
                  <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                    className={slideAnim(active)}
                    style={s.bg_color ? { backgroundColor: s.bg_color } : undefined}>
                    <div className={`grid grid-cols-1 items-center ${imgLeft ? 'md:grid-cols-[7fr_5fr]' : 'md:grid-cols-[5fr_7fr]'} ${cardHeightClass}`}>
                      {(s.image_url || s.video_url) && (
                        <div className={`order-1 p-2 pb-0 md:p-3 ${imgLeft ? 'md:order-1' : 'md:order-2'}`}>
                          <div className={`relative overflow-hidden rounded-xl aspect-[16/10] md:aspect-auto md:h-[390px] lg:h-[430px] ${s.bg_color ? 'bg-transparent' : 'bg-gray-100'}`}>
                            {renderMediaBg(s, i, active)}
                          </div>
                        </div>
                      )}
                      <div className={`order-2 px-5 pb-6 pt-4 md:py-10 ${imgLeft ? 'md:order-2 md:pe-10 md:ps-6' : 'md:order-1 md:ps-10 md:pe-6'} ${active && !reduced ? 'animate-[slide-text_.65s_ease-out_both]' : ''}`}>
                        {renderCountdown(s, true)}
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
                          <p className="mb-5 line-clamp-3 text-base leading-relaxed text-gray-600 sm:text-[17px] md:line-clamp-4">
                            {s.text}
                          </p>
                        )}
                        {renderQuickAmounts(s, true)}
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
                  className={`absolute start-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-white/90 text-xl text-gray-700 shadow transition hover:bg-white hover:text-primary-700 sm:flex ${arrowShape}`}>
                  <span className="rtl:rotate-180">‹</span>
                </button>
                <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)}
                  className={`absolute end-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-white/90 text-xl text-gray-700 shadow transition hover:bg-white hover:text-primary-700 sm:flex ${arrowShape}`}>
                  <span className="rtl:rotate-180">›</span>
                </button>
              </>
            )}
          </div>

          {renderBelowNav(true)}
        </div>
      </section>
    )
  }

  const isLightLayout = split || stacked || minimal
  const trackStyle = fade
    ? undefined
    : isVertical
      ? { transform: `translateY(-${index * 100}%)` }
      : { transform: `translateX(${rtl ? '' : '-'}${index * 100}%)` }

  return (
    <section
      className={`group/slider relative ${split ? 'bg-gradient-to-br from-primary-50 via-white to-accent-50' : stacked ? 'bg-[#F8FAFC]' : minimal ? 'bg-white' : 'bg-primary-950'}`}
      aria-roledescription="carousel" aria-label={label} tabIndex={-1}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
      <div className={`relative overflow-hidden ${heightClass}`}>
        <div
          className={
            fade
              ? `grid ${heightClass} [&>*]:col-start-1 [&>*]:row-start-1 ${isCube ? '[perspective:1400px]' : ''}`
              : isVertical
                ? `flex flex-col ${heightClass} transition-transform ${motion}`
                : `flex ${heightClass} transition-transform ${motion}`
          }
          style={trackStyle}>
          {slides.map((s, i) => {
            const active = i === index
            const align = s.align === 'center' ? 'items-center text-center' : s.align === 'right' ? 'items-end text-end' : 'items-start text-start'
            const justify = s.align === 'center' ? 'justify-center' : s.align === 'right' ? 'justify-end' : ''
            const buttons = renderButtons(s, justify, stacked)
            const progress = renderProgress(s, isLightLayout)
            const hidden = { 'aria-hidden': !active, inert: !active }

            if (split) {
              const imgLeft = s.image_pos === 'left'
              return (
                <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                  className={slideAnim(active)}
                  style={s.bg_color ? { backgroundColor: s.bg_color } : undefined}>
                  <div className={`mx-auto grid max-w-[1200px] items-center gap-10 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-16 ${cardHeightClass}`}>
                    <div className={`${imgLeft ? 'md:order-2' : ''} ${active && !reduced ? 'animate-[slide-text_.8s_ease-out_both]' : ''}`}>
                      {renderCountdown(s, true)}
                      {s.badge && <div className="mb-4 text-[13px] font-bold uppercase tracking-[3px] text-primary-600">{s.badge}</div>}
                      {s.title && <h2 className="mb-4 font-heading text-4xl font-bold leading-[1.12] text-gray-900 md:text-[52px]">{s.title}</h2>}
                      {s.text && <p className="mb-6 max-w-xl text-lg leading-relaxed text-gray-600">{s.text}</p>}
                      {renderQuickAmounts(s, true)}
                      {progress}
                      {buttons}
                    </div>
                    {(s.image_url || s.video_url) && (
                      <div className={`relative ${imgLeft ? 'md:order-1' : ''}`}>
                        <div className="absolute -inset-3 -z-0 rotate-2 rounded-[28px] bg-primary-100" aria-hidden />
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-gray-100 shadow-xl">
                          {renderMediaBg(s, i, active)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            if (stacked) {
              return (
                <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                  className={`${slideAnim(active)} py-6`}
                  style={s.bg_color ? { backgroundColor: s.bg_color } : undefined}>
                  <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
                    <div className="relative h-[280px] overflow-hidden rounded-3xl bg-gray-200 sm:h-[380px] md:h-[440px]">
                      {renderMediaBg(s, i, active)}
                      <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 20) / 100})` }} />
                    </div>
                    <div className="relative z-10 mx-auto -mt-16 max-w-4xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/[0.06] sm:p-8">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          {renderCountdown(s, true)}
                          {s.badge && <span className="mb-2 inline-block rounded-full bg-primary-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-700">{s.badge}</span>}
                          {s.title && <h2 className="font-heading text-2xl font-bold text-gray-900 md:text-3xl">{s.title}</h2>}
                          {s.text && <p className="mt-2 mb-3 text-gray-600">{s.text}</p>}
                          {renderQuickAmounts(s, true)}
                          {progress}
                        </div>
                        <div className="flex-none">{buttons}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            if (minimal) {
              return (
                <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                  className={`${slideAnim(active)} relative`}
                  style={s.bg_color ? { backgroundColor: s.bg_color } : undefined}>
                  <div className="relative h-[320px] overflow-hidden bg-gray-900 sm:h-[420px]">
                    {renderMediaBg(s, i, active)}
                    <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 20) / 100})` }} />
                  </div>
                  <div className="border-b bg-white">
                    <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        {renderCountdown(s, true)}
                        {s.badge && <span className="me-2 text-xs font-bold uppercase tracking-wider text-primary-600">{s.badge}</span>}
                        {s.title && <h2 className="inline font-heading text-xl font-bold text-gray-900 md:text-2xl">{s.title}</h2>}
                        {s.text && <p className="mt-1 mb-2 text-sm text-gray-600">{s.text}</p>}
                        {renderQuickAmounts(s, true)}
                        {progress}
                      </div>
                      <div className="flex-none">{renderButtons(s, '', true)}</div>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} {...hidden}
                className={`relative overflow-hidden ${slideAnim(active)} ${heightClass}`}>
                {renderMediaBg(s, i, active)}
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(s.overlay ?? 45) / 100})` }} />
                {duotone && <div className="absolute inset-0 bg-gradient-to-tr from-primary-950/85 via-primary-800/55 to-accent-600/40 mix-blend-multiply" />}
                {!glass && !duotone && s.align !== 'center' && (s.overlay ?? 45) > 0 && <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent rtl:bg-gradient-to-l" />}
                <div className={`relative mx-auto flex h-full max-w-[1200px] flex-col ${height === 'poster' ? 'justify-end pb-[3%] pt-4' : 'justify-center pb-20 pt-16'} px-6 ${arrows && count > 1 ? 'sm:px-20' : ''} ${align} ${heightClass}`}>
                  <div className={`${glass ? 'max-w-xl rounded-3xl border border-white/25 bg-black/45 p-7 shadow-2xl backdrop-blur-md sm:p-10' : 'max-w-2xl'} ${active && !reduced ? 'animate-[slide-text_.8s_ease-out_both]' : ''}`}>
                    {renderCountdown(s, false)}
                    {s.badge && <span className="mb-5 inline-block rounded-full border border-white/40 bg-white/10 px-4 py-1.5 text-[13px] font-bold tracking-[2px] text-white backdrop-blur-sm">{s.badge}</span>}
                    {s.title && <h2 className="mb-4 font-heading text-3xl font-bold leading-[1.12] text-white drop-shadow md:text-[54px]">{s.title}</h2>}
                    {s.text && <p className={`mb-7 text-lg leading-relaxed text-white/85 ${s.align === 'center' ? 'mx-auto max-w-xl' : 'max-w-xl'}`}>{s.text}</p>}
                    {renderQuickAmounts(s, false)}
                    {progress && <div className={s.align === 'center' ? 'flex justify-center' : ''}>{progress}</div>}
                    {buttons}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {arrows && count > 1 && !showThumbs && !showNumbers && (
          <>
            <button type="button" aria-label="Önceki slayt" onClick={() => go(index - 1)}
              className={`absolute start-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center text-2xl transition sm:flex md:start-6 ${arrowShape} ${isLightLayout ? 'bg-white text-gray-700 shadow hover:text-primary-700' : 'bg-white/15 text-white backdrop-blur hover:bg-white/30'}`}>
              <span className="rtl:rotate-180">‹</span>
            </button>
            <button type="button" aria-label="Sonraki slayt" onClick={() => go(index + 1)}
              className={`absolute end-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center text-2xl transition sm:flex md:end-6 ${arrowShape} ${isLightLayout ? 'bg-white text-gray-700 shadow hover:text-primary-700' : 'bg-white/15 text-white backdrop-blur hover:bg-white/30'}`}>
              <span className="rtl:rotate-180">›</span>
            </button>
          </>
        )}

        {showTabs && !isLightLayout && (
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

        {showThumbs && !isLightLayout && (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-black/25 px-4 py-3 backdrop-blur-sm">
            <ThumbnailStrip
              slides={slides} index={index} onSelect={go}
              onPrev={() => go(index - 1)} onNext={() => go(index + 1)}
              arrows={arrows} dark reduced={reduced}
            />
          </div>
        )}

        {showTopBar && (
          <div className="absolute inset-x-0 top-0 z-20 h-1 bg-white/20">
            <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${((index + 1) / Math.max(1, count)) * 100}%` }} />
          </div>
        )}

        {showSideNumbers && (
          <div className="absolute end-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5">
            {slides.map((_, i) => (
              <button key={i} type="button" onClick={() => go(i)}
                className={`rounded-lg px-2 py-1 text-[11px] font-extrabold transition ${i === index ? 'bg-amber-400 text-slate-950' : 'bg-black/40 text-white/70 hover:text-white'}`}>
                {String(i + 1).padStart(2, '0')}
              </button>
            ))}
          </div>
        )}

        {showMiniCards && (
          <div className="absolute inset-x-0 bottom-3 z-10 mx-auto hidden max-w-[1200px] gap-2 px-6 md:grid" style={{ gridTemplateColumns: `repeat(${Math.min(count, 4)}, minmax(0, 1fr))` }}>
            {slides.slice(0, 4).map((item, i) => (
              <button key={i} type="button" onClick={() => go(i)}
                className={`truncate rounded-xl border px-3 py-2 text-start text-xs font-bold backdrop-blur-md transition ${i === index ? 'border-amber-400 bg-white text-gray-900' : 'border-white/20 bg-black/40 text-white/80 hover:bg-black/60'}`}>
                {item.title || item.badge || `Slayt ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {showVerticalDots && (
          <div className="absolute end-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`${i + 1}. slayt`} onClick={() => go(i)}
                className={`w-2.5 rounded-full transition-all ${i === index ? 'h-8 bg-amber-400' : 'h-2.5 bg-white/50 hover:bg-white'}`} />
            ))}
          </div>
        )}

        {dots && count > 1 && !showThumbs && !showIconTabs && !showNumbers && !showProgress && !showRing && !showVerticalDots && (
          <div className={`absolute inset-x-0 z-10 flex items-center justify-center gap-2 ${showTabs && !isLightLayout ? 'bottom-5 md:hidden' : isLightLayout ? 'bottom-4' : 'bottom-6'}`}>
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`${i + 1}. slayt`} aria-current={i === index} onClick={() => go(i)}
                className={`relative overflow-hidden rounded-full transition-all ${showPillBars ? (i === index ? 'h-2 w-12' : 'h-2 w-5') : (i === index ? 'h-2.5 w-9' : 'h-2.5 w-2.5')} ${isGoldDots ? 'bg-amber-400/40' : isLightLayout ? 'bg-primary-200' : 'bg-white/45'}`}>
                {i === index && (
                  <span key={`${index}-${playing}`} className={`absolute inset-y-0 start-0 ${isLightLayout ? 'bg-primary-600' : 'bg-white'} ${playing ? 'slider-progress' : 'w-full'}`} style={{ animationDuration: `${seconds}s` }} />
                )}
              </button>
            ))}
            {renderPauseToggle(isLightLayout)}
          </div>
        )}
      </div>

      {(showNumbers || showProgress || showRing || showIconTabs || (isLightLayout && (showThumbs || showTabs))) && (
        <div className={`mx-auto max-w-[1200px] px-4 pb-4 sm:px-6 ${isLightLayout ? '' : 'text-white'}`}>
          {renderBelowNav(isLightLayout)}
        </div>
      )}
    </section>
  )
}
