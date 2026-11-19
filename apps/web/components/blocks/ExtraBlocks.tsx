import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block } from '../../lib/blocks'
import { Carousel, CountUp } from '../site/Carousel'
import { BlockText } from './BlockText'
import { BankAccountsView, BeforeAfterSlider, CopyButton, Countdown, CountdownGate, FidyahCalculator, GalleryCarousel, GalleryGrid, NewsletterForm, Popup, TabsView, VideoGalleryGrid } from './ExtraClient'

/**
 * Content blocks added after the first catalogue (features, counters, team, logos,
 * countdown, timeline, tabs, marquee, quote, gallery, bank accounts, pop-up).
 * Returns undefined for a type it does not draw, so BlockRenderer can fall through.
 */
interface Ctx { locale: string; editing?: boolean; container: string; campaigns?: { id: string; slug: string }[] }

const BAND: Record<string, string> = {
  brand: 'bg-primary-700 text-white', accent: 'bg-accent-500 text-white', dark: 'bg-primary-950 text-primary-100',
  soft: 'bg-primary-50 text-gray-900', light: 'bg-white text-gray-900',
}
const COLS: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6',
}
const WORDS: Record<string, { time: [string, string, string, string]; copy: string; copied: string; holder: string; branch: string }> = {
  tr: { time: ['Gün', 'Saat', 'Dakika', 'Saniye'], copy: 'IBAN’ı kopyala', copied: 'Kopyalandı ✓', holder: 'Hesap sahibi', branch: 'Şube' },
  en: { time: ['Days', 'Hours', 'Minutes', 'Seconds'], copy: 'Copy IBAN', copied: 'Copied ✓', holder: 'Account holder', branch: 'Branch' },
  ar: { time: ['يوم', 'ساعة', 'دقيقة', 'ثانية'], copy: 'نسخ الآيبان', copied: 'تم النسخ ✓', holder: 'صاحب الحساب', branch: 'الفرع' },
}

function Head({ o, center = true }: { o: Record<string, any>; center?: boolean }) {
  if (!o.kicker && !o.title && !o.text) return null
  return (
    <div className={`mb-10 ${center ? 'mx-auto max-w-2xl text-center' : ''}`}>
      {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
      {o.title && <h2 className="font-heading text-3xl font-bold leading-tight md:text-[36px]">{o.title}</h2>}
      {o.text && <p className="mt-3 text-lg leading-relaxed opacity-75">{o.text}</p>}
    </div>
  )
}

function Go({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>
  if (href.startsWith('/')) return <Link href={href} className={className}>{children}</Link>
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer">{children}</a>
}

const Empty = ({ editing, text }: { editing?: boolean; text: string }) =>
  editing ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">{text}</p> : null

export function extraContent(block: Block, o: Record<string, any>, ctx: Ctx): ReactNode | undefined {
  const { container, editing } = ctx
  const words = WORDS[ctx.locale] || WORDS.tr
  const items: Record<string, any>[] = Array.isArray(o.items) ? o.items : []

  switch (block.type) {
    case 'carousel': {
      const cards = items.filter((i) => i.title || i.image_url || i.text || i.video_url)
      if (!cards.length) return <Empty editing={editing} text="Carousel’e kart ekleyin" />
      const mobCols = String(o.mobile_columns || '1') === '2' ? 'w-[47%]' : 'w-[85%]'
      const colsMap: Record<number, string> = {
        1: 'w-full',
        2: `${mobCols} sm:w-[48%]`,
        3: `${mobCols} sm:w-[46%] lg:w-[31.5%]`,
        4: `${mobCols} sm:w-[46%] lg:w-[23.5%]`,
        5: `${mobCols} sm:w-[32%] lg:w-[18.5%]`,
      }
      const look = o.look || 'card'
      const isTicker = look === 'ticker' || look === 'logo'
      const itemWidth = isTicker
        ? (look === 'logo' ? 'w-[165px] sm:w-[205px]' : 'w-[260px] sm:w-[320px]')
        : look === 'deck'
          ? 'w-full'
          : (colsMap[o.columns ?? 3] || colsMap[3])
      const aspect = o.aspect || '4/3'
      const carouselMode =
        look === 'coverflow' || look === 'center' || look === 'deck'
          ? look
          : look === 'center_focus_carousel'
            ? 'center'
            : isTicker
              ? 'ticker'
              : 'default'
      const ytMatch = (url?: string) => url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]
      const CardMedia = ({ item, className }: { item: Record<string, any>; className: string }) => {
        const yt = ytMatch(item.video_url)
        if (yt) {
          return (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1`}
              title={item.title || 'Video'}
              allow="encrypted-media"
              className={`${className} border-0`}
            />
          )
        }
        if (item.video_url && /\.(mp4|webm|ogg)(\?|$)/i.test(item.video_url)) {
          return <video src={item.video_url} poster={item.image_url} controls playsInline className={className} />
        }
        if (!item.image_url) return null
        return (
          <picture>
            {item.mobile_image_url && <source media="(max-width: 639px)" srcSet={item.mobile_image_url} />}
            <img src={item.image_url} alt={item.title || ''} className={className} loading="lazy" />
          </picture>
        )
      }
      const renderStars = (rating?: number) => {
        const n = Math.min(5, Math.max(0, Number(rating) || 0))
        if (!n) return null
        return (
          <div className="mb-2 flex gap-0.5 text-amber-400" aria-label={`${n} / 5 yıldız`}>
            {Array.from({ length: 5 }).map((_, idx) => (
              <span key={idx}>{idx < n ? '★' : '☆'}</span>
            ))}
          </div>
        )
      }
      const renderItem = (item: Record<string, any>, i: number) => {
        const linked = item.campaign_id ? ctx.campaigns?.find((c) => c.id === item.campaign_id) : undefined
        const href = item.button_url || (linked ? `/kampanyalar/${linked.slug}` : item.campaign_id ? `/kampanyalar` : undefined)
        if (look === 'logo') {
          const inner = (
            <div className="flex h-24 items-center justify-center rounded-2xl border border-gray-200/80 bg-white px-5 py-4 shadow-xs transition hover:border-primary-300 hover:shadow-md">
              {item.image_url ? (
                <CardMedia item={item} className="max-h-12 w-auto object-contain grayscale opacity-75 transition duration-300 hover:grayscale-0 hover:opacity-100" />
              ) : (
                <span className="font-heading text-sm font-bold text-gray-600">{item.title}</span>
              )}
            </div>
          )
          return <div key={i}>{href ? <Go href={href} className="block">{inner}</Go> : inner}</div>
        }
        if (look === 'testimonial') {
          return (
            <div key={i} className="flex h-full flex-col justify-between rounded-2xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm transition hover:shadow-md">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-heading text-3xl leading-none text-primary-300" aria-hidden>“</span>
                  {renderStars(item.rating ?? 5)}
                </div>
                {item.text && <p className="text-sm leading-relaxed text-gray-700">{item.text}</p>}
              </div>
              <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
                {item.image_url ? (
                  <CardMedia item={item} className="h-11 w-11 flex-none rounded-full object-cover ring-2 ring-primary-100" />
                ) : (
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-sm font-bold text-primary-700">
                    {(item.title || '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  {item.title && <div className="truncate font-heading text-sm font-bold text-gray-900">{item.title}</div>}
                  {(item.subtitle || item.badge) && <div className="truncate text-xs text-gray-500">{item.subtitle || item.badge}</div>}
                </div>
              </div>
            </div>
          )
        }
        if (look === 'quote_card') {
          return (
            <div key={i} className="flex h-full flex-col justify-between rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-sm">
              <div>
                <div className="mb-2 font-serif text-4xl leading-none text-primary-600">“</div>
                {renderStars(item.rating)}
                {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                {item.text && <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.text}</p>}
              </div>
              {item.subtitle && <div className="mt-4 border-t border-gray-100 pt-3 text-xs font-bold text-primary-700">{item.subtitle}</div>}
            </div>
          )
        }
        if (look === 'progress_card') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm">
              {(item.image_url || item.video_url) && (
                <div className="overflow-hidden bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                {item.badge && <span className="mb-1.5 w-fit rounded-full bg-primary-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary-700">{item.badge}</span>}
                {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-600">{item.text}</p>}
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.min(100, Math.max(25, ((i + 1) * 23) % 95))}%` }} />
                </div>
                {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        if (look === 'video_reel') {
          return (
            <div key={i} className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-3 text-white shadow-lg">
              <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                <CardMedia item={item} className="h-full w-full object-cover opacity-90 transition group-hover:scale-105" />
                <span className="pointer-events-none absolute end-3 top-3 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">▶ Video</span>
              </div>
              <div className="mt-3 px-1">
                {item.title && <h3 className="font-heading text-base font-bold">{item.title}</h3>}
                {item.subtitle && <div className="mt-0.5 text-xs text-slate-400">{item.subtitle}</div>}
              </div>
            </div>
          )
        }
        if (look === 'stat_overlay') {
          return (
            <div key={i} className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-sm">
              {(item.image_url || item.video_url) && (
                <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  {item.badge && <span className="absolute end-3 top-3 rounded-2xl bg-white/95 px-3 py-1.5 text-xs font-extrabold text-primary-700 shadow-md backdrop-blur-sm">{item.badge}</span>}
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-600">{item.text}</p>}
                {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        if (look === 'minimal_editorial') {
          return (
            <div key={i} className="flex h-full flex-col border-t-2 border-primary-600 pt-4">
              {item.badge && <span className="mb-1 text-[11px] font-bold uppercase tracking-widest text-primary-600">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-xl font-bold text-gray-900">{item.title}</h3>}
              {item.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold uppercase tracking-wider text-primary-700 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'dark_gold_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-amber-400/30 bg-slate-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-300">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-amber-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'pill_nav_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 text-gray-900 shadow-sm">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-2 w-fit rounded-full bg-primary-100 px-3 py-1 text-[10px] font-extrabold uppercase text-primary-800">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-600">{item.text}</p>}
              {item.button_label && href && (
                <Go href={href} className="mt-4 inline-flex w-fit rounded-full bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">
                  {item.button_label} →
                </Go>
              )}
            </div>
          )
        }
        if (look === 'minimal_card_carousel') {
          return (
            <div key={i} className="flex h-full flex-col border-t-2 border-primary-600 bg-white pt-4 text-gray-900">
              {(item.image_url || item.video_url) && (
                <div className="mb-3 overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary-600">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-base font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1 flex-1 text-sm text-gray-600">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'indigo_silver_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-sky-300/25 bg-gradient-to-br from-indigo-950 to-slate-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-sky-300/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-sky-200">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-indigo-100/80">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-sky-200 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'plum_gold_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-purple-950 to-slate-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-purple-100/80">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-amber-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'forest_amber_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-amber-400/25 bg-gradient-to-br from-green-950 to-stone-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-emerald-100/80">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-amber-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'ruby_urgent_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-red-400/30 bg-gradient-to-br from-rose-950 to-slate-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-rose-100/80">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-rose-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'circle_avatar_carousel') {
          return (
            <div key={i} className="flex h-full flex-col items-center rounded-3xl border border-gray-200 bg-white p-6 text-center text-gray-900 shadow-sm">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 h-24 w-24 overflow-hidden rounded-full ring-4 ring-primary-100">
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.title && <h3 className="font-heading text-base font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-xs text-gray-600">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'dark_olive_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-lime-950 to-stone-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-stone-300">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-amber-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'dark_sapphire_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-sky-950 to-slate-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-cyan-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-sky-100/80">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-cyan-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'floating_badge_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-sm">
              {(item.image_url || item.video_url) && (
                <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                  {item.badge && <span className="absolute start-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[10px] font-extrabold uppercase text-primary-700 shadow">{item.badge}</span>}
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-600">{item.text}</p>}
                {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        if (look === 'split_mini_carousel') {
          return (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xs">
              {(item.image_url || item.video_url) && (
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {item.title && <h3 className="truncate font-heading text-sm font-bold">{item.title}</h3>}
                {item.text && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.text}</p>}
                {item.button_label && href && <Go href={href} className="mt-1.5 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        if (look === 'emerald_gold_carousel') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950 to-slate-950 p-5 text-white shadow-xl">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-emerald-100/80">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-extrabold text-amber-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'numbered_editorial_carousel') {
          return (
            <div key={i} className="flex h-full flex-col border-t-2 border-primary-600 bg-white pt-4 text-gray-900">
              <div className="mb-2 font-heading text-2xl font-black text-primary-600">{String(i + 1).padStart(2, '0')}</div>
              {(item.image_url || item.video_url) && (
                <div className="mb-3 overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.title && <h3 className="font-heading text-base font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1 flex-1 text-sm text-gray-600">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'overlay_gradient_carousel') {
          return (
            <div key={i} className="group relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-lg">
              {(item.image_url || item.video_url) && (
                <div className="absolute inset-0">
                  <CardMedia item={item} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="relative">
                {item.badge && <span className="mb-1.5 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase backdrop-blur-sm">{item.badge}</span>}
                {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                {item.button_label && href && <Go href={href} className="mt-2 inline-flex text-xs font-extrabold text-amber-300 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        if (look === 'bordered_compact_carousel') {
          return (
            <div key={i} className="flex h-full flex-col rounded-2xl border-2 border-primary-200 bg-white p-4 text-gray-900 shadow-xs">
              {(item.image_url || item.video_url) && (
                <div className="mb-3 overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.title && <h3 className="font-heading text-sm font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1 flex-1 text-xs text-gray-600">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'dark_glass_cards') {
          return (
            <div key={i} className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/15 bg-gray-950/90 p-5 text-white shadow-xl backdrop-blur-md">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-accent-300">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-300">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-4 inline-flex text-xs font-bold text-accent-300 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'compact_news') {
          return (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
              {(item.image_url || item.video_url) && (
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {item.badge && <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600">{item.badge}</span>}
                {item.title && <h3 className="line-clamp-2 font-heading text-sm font-bold">{item.title}</h3>}
                {item.button_label && href && <Go href={href} className="mt-1 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        if (look === 'story_916') {
          return (
            <div key={i} className="group relative overflow-hidden rounded-3xl bg-gray-950 text-white shadow-lg aspect-[9/16]">
              <CardMedia item={item} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/25" />
              <div className="relative flex h-full flex-col justify-between p-5">
                <div>{item.badge && <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-md">{item.badge}</span>}</div>
                <div>
                  {item.title && <h3 className="font-heading text-lg font-extrabold leading-snug">{item.title}</h3>}
                  {item.subtitle && <div className="mt-0.5 text-xs text-white/75">{item.subtitle}</div>}
                  {item.button_label && href && (
                    <Go href={href} className="mt-3 inline-flex rounded-full bg-white px-4 py-1.5 text-xs font-bold text-gray-900 hover:bg-primary-50">{item.button_label} →</Go>
                  )}
                </div>
              </div>
            </div>
          )
        }
        if (look === 'polaroid') {
          return (
            <div key={i} className={`flex h-full flex-col rounded-xl border border-gray-200 bg-white p-3 pb-5 text-gray-900 shadow-md transition duration-300 hover:rotate-0 hover:shadow-xl ${i % 2 === 0 ? '-rotate-1' : 'rotate-1'}`}>
              {(item.image_url || item.video_url) && (
                <div className="mb-3 overflow-hidden rounded-lg bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover" />
                </div>
              )}
              {item.title && <h3 className="font-heading text-base font-bold text-gray-900">{item.title}</h3>}
              {item.subtitle && <div className="text-xs font-semibold text-primary-700">{item.subtitle}</div>}
              {item.text && <p className="mt-1 text-xs leading-relaxed text-gray-600">{item.text}</p>}
            </div>
          )
        }
        if (look === 'bento_strip') {
          const highlight = i === 0
          return (
            <div key={i} className={`flex h-full flex-col overflow-hidden rounded-3xl border p-4 shadow-sm transition hover:shadow-lg ${highlight ? 'border-primary-300 bg-primary-50/60 text-gray-900' : 'border-gray-200 bg-white text-gray-900'}`}>
              {(item.image_url || item.video_url) && (
                <div className="mb-3 overflow-hidden rounded-2xl bg-gray-100" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                </div>
              )}
              {item.badge && <span className="mb-1.5 w-fit rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">{item.badge}</span>}
              {item.title && <h3 className="font-heading text-lg font-extrabold">{item.title}</h3>}
              {item.text && <p className="mt-1.5 flex-1 text-sm text-gray-600">{item.text}</p>}
              {item.button_label && href && <Go href={href} className="mt-3 inline-flex text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
            </div>
          )
        }
        if (look === 'overlay') {
          return (
            <div key={i} className="group relative overflow-hidden rounded-2xl bg-gray-900 text-white shadow-md" style={{ aspectRatio: aspect }}>
              <CardMedia item={item} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-5">
                {renderStars(item.rating)}
                {item.badge && <span className="mb-2 w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">{item.badge}</span>}
                {item.title && <h3 className="font-heading text-xl font-bold leading-snug">{item.title}</h3>}
                {item.subtitle && <div className="mt-0.5 text-xs font-semibold text-white/75">{item.subtitle}</div>}
                {item.text && <p className="mt-1.5 line-clamp-2 text-sm text-white/80">{item.text}</p>}
                {item.button_label && href && (
                  <Go href={href} className="mt-3 inline-flex w-fit rounded-lg bg-white px-4 py-2 text-xs font-bold text-gray-900 hover:bg-primary-50">{item.button_label}</Go>
                )}
              </div>
            </div>
          )
        }
        if (look === 'glass') {
          return (
            <div key={i} className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/30 bg-gradient-to-br from-primary-900 via-primary-800 to-gray-900 p-4 text-white shadow-lg">
              {(item.image_url || item.video_url) && (
                <div className="mb-4 overflow-hidden rounded-2xl bg-black/20" style={{ aspectRatio: aspect }}>
                  <CardMedia item={item} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
              )}
              <div className="flex flex-1 flex-col rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                {renderStars(item.rating)}
                {item.badge && <span className="mb-2 w-fit rounded-full bg-accent-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{item.badge}</span>}
                {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                {item.subtitle && <div className="mt-0.5 text-xs text-white/70">{item.subtitle}</div>}
                {item.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-white/85">{item.text}</p>}
                {item.button_label && href && (
                  <div className="mt-4">
                    <Go href={href} className="inline-flex rounded-xl bg-white px-4 py-2 text-xs font-bold text-primary-950 hover:bg-accent-400 hover:text-white">{item.button_label}</Go>
                  </div>
                )}
              </div>
            </div>
          )
        }
        if (look === 'pill') {
          return (
            <div key={i} className="flex h-full items-center gap-4 rounded-2xl border bg-white p-3.5 text-gray-900 shadow-sm transition hover:shadow-md">
              {item.image_url && <CardMedia item={item} className="h-24 w-24 flex-none rounded-xl object-cover" />}
              <div className="min-w-0 flex-1">
                {renderStars(item.rating)}
                {item.badge && <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600">{item.badge}</span>}
                {item.title && <h3 className="truncate font-heading text-base font-bold">{item.title}</h3>}
                {item.subtitle && <div className="truncate text-xs text-gray-500">{item.subtitle}</div>}
                {item.text && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.text}</p>}
                {item.button_label && href && <Go href={href} className="mt-2 inline-block text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
              </div>
            </div>
          )
        }
        return (
          <div key={i} className={`flex h-full flex-col overflow-hidden ${look === 'minimal' ? '' : look === 'featured' || look === 'center' || look === 'coverflow' || look === 'deck' ? 'rounded-3xl border bg-white shadow-md' : 'rounded-2xl border bg-white shadow-sm transition hover:shadow-lg'} text-gray-900`}>
            {(item.image_url || item.video_url) && (
              <div className={`overflow-hidden bg-gray-100 ${look === 'minimal' ? 'rounded-2xl' : ''}`} style={{ aspectRatio: aspect }}>
                <CardMedia item={item} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
              </div>
            )}
            <div className={`flex flex-1 flex-col ${look === 'minimal' ? 'pt-3' : look === 'featured' || look === 'deck' ? 'p-6' : 'p-5'}`}>
              {renderStars(item.rating)}
              {item.badge && <span className="mb-2 w-fit rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-700">{item.badge}</span>}
              {item.title && <h3 className={`font-heading font-bold ${look === 'featured' || look === 'deck' ? 'text-2xl' : 'text-lg'}`}>{item.title}</h3>}
              {item.subtitle && <div className="mt-0.5 text-xs font-semibold text-gray-500">{item.subtitle}</div>}
              {item.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{item.text}</p>}
              {item.button_label && href && (
                <div className="mt-4">
                  <Go href={href} className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">{item.button_label}</Go>
                </div>
              )}
            </div>
          </div>
        )
      }
      const renderedCards = look === 'multirow'
        ? Array.from({ length: Math.ceil(cards.length / 2) }, (_, g) => (
            <div key={g} className="flex flex-col gap-4">
              {renderItem(cards[g * 2], g * 2)}
              {cards[g * 2 + 1] && renderItem(cards[g * 2 + 1], g * 2 + 1)}
            </div>
          ))
        : cards.map(renderItem)
      return (
        <div className={container}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <Carousel
            label={o.title || 'Carousel'}
            items={itemWidth}
            mode={carouselMode}
            speed={o.speed}
            pauseOnHover={o.pause_on_hover !== false}
            autoplay={o.autoplay !== false}
            interval={o.interval ?? 5}
            dots={o.dots !== false}
            nav={o.nav || (o.dots === false ? 'none' : 'dots')}
            arrows={o.arrows !== false}
            arrowPos={o.arrow_pos || 'sides'}
            arrowStyle={o.arrow_style || 'round'}
            loop={o.loop !== false}
            showPause={o.show_pause !== false}
            gap={o.gap || 'md'}
            editing={editing}
          >
            {renderedCards}
          </Carousel>
        </div>
      )
    }
    case 'features': {
      const look = o.look || 'card'
      const validItems = items.filter((i) => i.title || i.text)
      if (!validItems.length && !o.title && !o.text) return <Empty editing={editing} text="Özellik ekleyin" />

      const numbered = look === 'numbered'
      const isChecklist = look === 'checklist'
      const isStrip = look === 'compact_strip'
      const isSplit = look === 'split'
      const isDark = look === 'dark_cards' || look === 'glass_dark_grid' || look === 'dark_icon_cards'
      const isFlex = look === 'icon_left' || look === 'left_icon_minimal' || numbered || isChecklist || isStrip
      const center = o.align !== 'left' && !isFlex && !isSplit

      const iconRadius = o.icon_style === 'circle' ? 'rounded-full' : 'rounded-2xl'
      const minimalIcon = o.icon_style === 'minimal'

      const box = {
        card: 'rounded-2xl bg-white p-7 text-gray-900 shadow-sm transition-all hover:shadow-lg',
        bordered: 'rounded-2xl border p-7',
        plain: 'p-2',
        icon_left: 'flex items-start gap-4 p-2',
        numbered: 'flex items-start gap-4 rounded-2xl border bg-white p-6 text-gray-900 shadow-sm',
        bento: 'rounded-3xl border border-gray-200/80 bg-gradient-to-br from-white to-primary-50/40 p-7 text-gray-900 shadow-sm hover:shadow-lg',
        left_accent: 'rounded-2xl border border-gray-200 border-s-4 border-s-primary-600 bg-white p-6 text-gray-900 shadow-sm',
        dark_cards: 'rounded-2xl bg-gray-900 p-7 text-white shadow-lg ring-1 ring-white/10',
        dark_icon_cards: 'rounded-2xl border border-white/10 bg-slate-950 p-7 text-white shadow-lg',
        bordered_minimal_grid: 'rounded-2xl border border-gray-200 bg-white p-6 text-gray-900',
        pill_badge_features: 'rounded-3xl border border-primary-100 bg-primary-50/40 p-6 text-gray-900',
        split: 'rounded-2xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm transition-all hover:shadow-md',
        checklist: 'flex items-start gap-3.5 rounded-xl border border-gray-200/70 bg-white/80 p-4 text-gray-900',
        compact_strip: 'flex items-center gap-3 p-2',
        hover_reveal: 'group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-7 text-gray-900 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary-400 hover:shadow-xl',
        icon_top_line: 'rounded-2xl border border-gray-200 border-t-4 border-t-primary-600 bg-white p-7 text-gray-900 shadow-sm transition hover:shadow-md',
        pill_grid: 'flex items-center gap-3.5 rounded-full border border-gray-200/80 bg-white px-5 py-3.5 text-gray-900 shadow-sm transition hover:border-primary-300 hover:shadow-md',
        glass_dark_grid: 'rounded-2xl border border-white/15 bg-slate-900/95 p-7 text-white shadow-xl backdrop-blur',
        left_icon_minimal: 'flex items-start gap-4 border-b border-gray-100 py-4',
        numbered_accent_cards: 'rounded-2xl border border-primary-100 bg-primary-50/40 p-7 text-gray-900',
      }[look as string] || ''

      const renderItem = (item: Record<string, any>, i: number) => {
        const isRed = /e-?devlet|348/i.test(`${item.title || ''} ${item.text || ''}`)
        const cardTheme = isRed && look !== 'plain' && !isStrip
          ? isDark
            ? 'border border-red-500/40 bg-gradient-to-br from-red-950/60 via-gray-900 to-gray-900 shadow-lg shadow-red-950/30'
            : 'border-2 border-red-200 bg-gradient-to-br from-red-50 via-white to-red-50/40 shadow-md shadow-red-600/10'
          : ''

        const iconTone = isRed
          ? 'bg-[#E30A17] text-white shadow-sm shadow-red-600/30'
          : isDark
            ? 'bg-white/10 text-primary-300 ring-1 ring-white/10'
            : 'bg-primary-50 text-primary-700'

        const linkCls = item.url
          ? `${isFlex ? '' : 'block '}hover:-translate-y-0.5 transition-transform`
          : ''

        return (
          <Go key={i} href={item.url} className={`${box} ${cardTheme} ${center ? 'text-center' : ''} ${linkCls}`}>
            {numbered ? (
              <div className={`flex h-12 w-12 flex-none items-center justify-center bg-primary-600 font-heading text-lg font-bold text-white ${o.icon_style === 'circle' ? 'rounded-full' : 'rounded-xl'}`}>
                {String(i + 1).padStart(2, '0')}
              </div>
            ) : isChecklist ? (
              <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white shadow-sm" aria-hidden="true">
                ✓
              </div>
            ) : (item.image_url || item.icon) && (
              <div className={`${isFlex ? 'flex-none' : `mb-4 ${center ? 'mx-auto' : ''}`} flex items-center justify-center ${
                isStrip
                  ? `h-10 w-10 text-xl ${iconRadius} ${iconTone}`
                  : minimalIcon && !isRed
                    ? 'h-10 w-10 text-3xl'
                    : `h-14 w-14 text-2xl ${iconRadius} ${iconTone}`
              }`}>
                {item.image_url ? <img src={item.image_url} alt="" className={isStrip ? 'h-6 w-6 object-contain' : 'h-9 w-9 object-contain'} loading="lazy" /> : item.icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {item.badge && (
                <span className={`mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
                  isDark ? 'bg-white/15 text-primary-200' : 'bg-primary-100 text-primary-800'
                }`}>
                  {item.badge}
                </span>
              )}
              {item.title && (
                <h3 className={`font-heading font-bold ${isStrip ? 'text-base' : 'text-lg'} ${
                  isRed ? (isDark ? 'text-red-300' : 'text-red-700') : ''
                }`}>
                  {item.title}
                </h3>
              )}
              {item.text && (
                <p className={`${isStrip ? 'mt-0.5 text-xs' : 'mt-2 text-[15px] leading-relaxed'} opacity-80`}>
                  {item.text}
                </p>
              )}
              {item.url && item.link_label && (
                <span className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${
                  isDark ? 'text-primary-300' : 'text-primary-700'
                }`}>
                  {item.link_label} <span aria-hidden="true">→</span>
                </span>
              )}
            </div>
          </Go>
        )
      }

      const sectionCta = o.button_label && o.button_url && (
        <div className={isSplit ? 'mt-6' : `mt-10 ${o.align !== 'left' ? 'text-center' : ''}`}>
          <Go
            href={o.button_url}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            {o.button_label} <span aria-hidden="true">→</span>
          </Go>
        </div>
      )

      if (isSplit) {
        const splitCols = o.columns === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'
        return (
          <div className={container}>
            <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-3xl font-bold leading-tight md:text-[36px]">{o.title}</h2>}
                {o.text && <p className="mt-3 text-lg leading-relaxed opacity-75">{o.text}</p>}
                {sectionCta}
              </div>
              <div className={`grid gap-5 lg:col-span-7 ${splitCols}`}>
                {validItems.map(renderItem)}
              </div>
            </div>
          </div>
        )
      }

      const cols = o.columns ?? (isStrip ? 4 : isChecklist ? 2 : 3)
      const colClass = cols === 1 ? 'grid-cols-1' : `sm:grid-cols-2 ${COLS[cols] || COLS[3]}`

      return (
        <div className={container}>
          <Head o={o} center={o.align !== 'left'} />
          <div className={
            isStrip
              ? `grid gap-4 rounded-2xl border border-gray-200/80 bg-white/90 p-5 text-gray-900 shadow-sm ${colClass}`
              : `grid ${isChecklist ? 'gap-4' : 'gap-6'} ${colClass}`
          }>
            {validItems.map(renderItem)}
          </div>
          {sectionCta}
        </div>
      )
    }
    case 'counters': {
      const look = o.look || 'plain'
      const stats = items.filter((i) => i.label || i.value !== undefined)
      if (!stats.length && !o.title && !o.text) return <Empty editing={editing} text="İstatistik ekleyin" />

      const isBand = look === 'band' || look === 'dark_gold_band'
      const isOdometerDark = look === 'odometer_dark'
      const isDark = look === 'dark_cards' || isOdometerDark || look === 'dark_glow_cards' || look === 'dark_gold_band'
      const isLeft = look === 'left_accent'
      const isDivided = look === 'divided' || look === 'bordered_compact_row'
      const isRings = look === 'rings'
      const isSplit = look === 'split' || look === 'split_highlight_counters'
      const isInlineTicker = look === 'inline_ticker' || look === 'accent_pill_strip'
      const isHeroRow = look === 'hero_stat_row'

      const renderStat = (item: Record<string, any>, i: number) => {
        const isRed = /e-?devlet|348/i.test(`${item.value || ''} ${item.suffix || ''} ${item.label || ''}`)
        const numVal = Number(item.value) || 0
        const numberEl = (
          <div className={`font-heading text-2xl font-bold tabular-nums sm:text-4xl md:text-5xl ${
            isRed && !isBand && !isDark ? 'text-[#E30A17]' : isBand ? 'text-white' : isDark ? 'text-primary-300' : 'text-primary-700'
          }`}>
            {item.prefix}<CountUp value={numVal} locale={ctx.locale} suffix={String(item.suffix || '').length === 1 ? item.suffix : ''} />
            {String(item.suffix || '').length > 1 && <span className="ms-1.5 text-[0.5em] font-semibold">{item.suffix}</span>}
          </div>
        )

        const cardCls = look === 'cards' || isSplit
          ? isRed
            ? 'rounded-2xl border-2 border-red-200 bg-gradient-to-b from-red-50 to-white p-4 text-gray-900 shadow-md shadow-red-600/10 sm:p-6'
            : 'rounded-2xl border border-gray-200/70 bg-white p-4 text-gray-900 shadow-sm sm:p-6'
          : isLeft
            ? 'rounded-2xl border border-gray-200 border-s-4 border-s-primary-600 bg-white p-5 text-start text-gray-900 shadow-sm sm:p-6'
            : isDark
              ? 'rounded-2xl bg-gray-900 p-5 text-white shadow-lg ring-1 ring-white/10 sm:p-6'
              : look === 'bordered_minimal'
                ? 'rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 sm:p-6'
                : isDivided
                  ? 'p-5 sm:p-6'
                  : ''

        if (isRings) {
          const pct = Math.min(Math.max(numVal, 0), 100)
          const r = 40
          const c = 2 * Math.PI * r
          const offset = c - (pct / 100) * c
          return (
            <div key={i} className="flex flex-col items-center rounded-2xl border border-gray-200/70 bg-white p-6 text-center text-gray-900 shadow-sm">
              <div className="relative mb-3 h-28 w-28">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-primary-100" />
                  <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={offset} className="text-primary-600 transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-heading text-xl font-bold tabular-nums text-primary-800">
                  {item.prefix}<CountUp value={numVal} locale={ctx.locale} suffix={item.suffix || '%'} />
                </div>
              </div>
              {item.label && <div className="text-sm font-bold text-gray-900">{item.label}</div>}
              {item.note && <div className="mt-1 text-xs text-gray-500">{item.note}</div>}
            </div>
          )
        }

        return (
          <div key={i} className={`${isLeft ? 'text-start' : 'text-center'} ${cardCls}`}>
            {item.icon && <div className="mb-1.5 text-2xl sm:mb-2 sm:text-3xl">{item.icon}</div>}
            {item.trend && (
              <span className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isBand ? 'bg-white/15 text-white' : isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {item.trend}
              </span>
            )}
            {numberEl}
            {item.label && (
              <div className={`mt-2 text-sm font-semibold ${isRed && !isBand && !isDark ? 'text-red-900' : 'opacity-80'}`}>
                {item.label}
              </div>
            )}
            {item.note && <div className="mt-1 text-xs opacity-60">{item.note}</div>}
          </div>
        )
      }

      const sectionCta = o.button_label && o.button_url && (
        <div className={isSplit ? 'mt-6' : 'mt-10 text-center'}>
          <Go
            href={o.button_url}
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm transition-colors ${
              isBand ? 'bg-white text-primary-800 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {o.button_label} <span aria-hidden="true">→</span>
          </Go>
        </div>
      )

      if (isSplit) {
        return (
          <div className={container}>
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-3xl font-bold leading-tight md:text-[36px]">{o.title}</h2>}
                {o.text && <p className="mt-3 text-lg leading-relaxed opacity-75">{o.text}</p>}
                {sectionCta}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:col-span-7">
                {stats.map(renderStat)}
              </div>
            </div>
          </div>
        )
      }

      const colClass = stats.length === 1
        ? 'mx-auto max-w-sm grid-cols-1'
        : `grid-cols-2 ${COLS[Math.min(stats.length, 6)]}`

      const grid = isDivided ? (
        <div className={`grid divide-y divide-gray-200/80 rounded-2xl border border-gray-200/80 bg-white text-gray-900 shadow-sm sm:divide-x sm:divide-y-0 ${colClass}`}>
          {stats.map(renderStat)}
        </div>
      ) : isInlineTicker ? (
        <div className="flex flex-wrap items-center justify-center gap-4">
          {stats.map((item, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/50 px-5 py-3.5 text-gray-900 shadow-sm">
              {item.icon && <span className="text-2xl">{item.icon}</span>}
              <div>
                <div className="font-heading text-xl font-extrabold text-primary-700 tabular-nums">
                  {item.prefix}<CountUp value={Number(item.value) || 0} locale={ctx.locale} suffix={item.suffix || ''} />
                </div>
                {item.label && <div className="text-xs font-semibold text-gray-600">{item.label}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : isHeroRow ? (
        <div className={`grid gap-8 border-y border-gray-200 py-8 ${colClass}`}>
          {stats.map((item, i) => (
            <div key={i} className="text-center">
              <div className="font-heading text-4xl font-black tracking-tight text-primary-700 sm:text-6xl tabular-nums">
                {item.prefix}<CountUp value={Number(item.value) || 0} locale={ctx.locale} suffix={item.suffix || ''} />
              </div>
              {item.label && <div className="mt-2 text-sm font-bold uppercase tracking-wider text-gray-700">{item.label}</div>}
              {item.note && <div className="mt-1 text-xs text-gray-500">{item.note}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-3 sm:gap-6 ${colClass}`}>
          {stats.map(renderStat)}
        </div>
      )

      if (isBand || isOdometerDark) {
        return (
          <div className={isOdometerDark ? 'bg-gray-950 py-14 text-white' : 'bg-primary-700 py-14 text-white'}>
            <div className={container}>
              {(o.kicker || o.title || o.text) && (
                <div className="mx-auto mb-10 max-w-2xl text-center">
                  {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-accent-300">{o.kicker}</div>}
                  {o.title && <h2 className="font-heading text-3xl font-bold leading-tight md:text-[36px]">{o.title}</h2>}
                  {o.text && <p className="mt-3 text-lg leading-relaxed text-white/80">{o.text}</p>}
                </div>
              )}
              {grid}
              {sectionCta}
            </div>
          </div>
        )
      }
      return <div className={container}><Head o={o} />{grid}{sectionCta}</div>
    }
    case 'progress_bars': {
      const look = o.look || 'bars'
      const bars = items.filter((i) => i.label)
      if (!bars.length && !o.title && !o.text) return <Empty editing={editing} text="Hedef çubuğu ekleyin" />

      const isDark = look === 'dark_cards' || look === 'dark_neon_bars' || look === 'dark_goal_cards'
      const isMilestones = look === 'milestones'
      const isRadial = look === 'radial'
      const isThermometer = look === 'thermometer'
      const isStepped = look === 'stepped_segments' || look === 'striped_urgent'
      const isCompactPills = look === 'compact_pills' || look === 'badge_percent_rows'
      const isCards = look === 'cards' || isDark || isThermometer || look === 'card_grouped_bars' || look === 'minimal_thin_bars'
      const cols = Math.min(Math.max(o.columns ?? 3, 1), 3)
      const colCls = cols === 1 ? 'grid-cols-1 max-w-2xl mx-auto' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'

      const renderBar = (item: Record<string, any>, i: number) => {
        const percent = Math.min(Math.max(Number(item.percent) || 0, 0), 100)
        if (isThermometer) {
          return (
            <Go key={i} href={item.url} className={`flex items-center gap-5 rounded-2xl border border-gray-200/80 bg-white p-5 text-gray-900 shadow-sm ${item.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
              <div className="relative flex h-36 w-8 flex-none items-end overflow-hidden rounded-full bg-primary-100 p-1">
                <div className="w-full rounded-full bg-gradient-to-t from-primary-700 to-accent-500 transition-all duration-700" style={{ height: `${percent}%` }} />
              </div>
              <div className="min-w-0 flex-1">
                {item.badge && <span className="mb-1 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{item.badge}</span>}
                <div className="font-heading text-2xl font-extrabold text-primary-700">%{percent}</div>
                <div className="mt-1 font-heading text-base font-bold">{item.icon ? `${item.icon} ` : ''}{item.label}</div>
                {item.note && <div className="mt-1 text-xs text-gray-500">{item.note}</div>}
                {item.url && item.link_label && <span className="mt-2 inline-block text-xs font-bold text-primary-700">{item.link_label} →</span>}
              </div>
            </Go>
          )
        }
        if (isStepped) {
          const filledSegments = Math.round(percent / 10)
          return (
            <Go key={i} href={item.url} className="block rounded-2xl border border-gray-200/80 bg-white p-5 text-gray-900 shadow-sm">
              <div className="mb-2.5 flex items-baseline justify-between gap-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                  {item.badge && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-800">{item.badge}</span>}
                </span>
                <span className="font-bold text-primary-700">{item.note || `%${percent}`}</span>
              </div>
              <div className="grid grid-cols-10 gap-1.5" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={item.label}>
                {Array.from({ length: 10 }).map((_, idx) => (
                  <span key={idx} className={`h-2.5 rounded-full transition-colors ${idx < filledSegments ? 'bg-primary-600' : 'bg-gray-200'}`} />
                ))}
              </div>
            </Go>
          )
        }
        if (isCompactPills) {
          return (
            <Go key={i} href={item.url} className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-gray-200/80 bg-white px-5 py-3 text-gray-900 shadow-sm">
              <div className="flex items-center gap-2.5 text-sm font-bold">
                {item.icon && <span>{item.icon}</span>}
                <span>{item.label}</span>
                {item.badge && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">{item.badge}</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-primary-600" style={{ width: `${percent}%` }} />
                </div>
                <span className="text-xs font-extrabold text-primary-700">{item.note || `%${percent}`}</span>
              </div>
            </Go>
          )
        }
        if (isRadial) {
          const r = 38
          const c = 2 * Math.PI * r
          const offset = c - (percent / 100) * c
          return (
            <Go key={i} href={item.url} className={`flex flex-col items-center rounded-2xl border border-gray-200/80 bg-white p-6 text-center text-gray-900 shadow-sm ${item.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
              <div className="relative mb-4 h-24 w-24">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-primary-100" />
                  <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={offset} className="text-primary-600 transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-heading text-lg font-bold text-primary-800">%{percent}</div>
              </div>
              {item.badge && <span className="mb-1.5 rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{item.badge}</span>}
              <div className="font-heading text-base font-bold">{item.icon ? `${item.icon} ` : ''}{item.label}</div>
              {item.note && <div className="mt-1 text-xs text-gray-500">{item.note}</div>}
              {item.url && item.link_label && <span className="mt-3 text-xs font-bold text-primary-700">{item.link_label} →</span>}
            </Go>
          )
        }

        const wrapCls = isDark
          ? 'rounded-2xl bg-gray-900 p-6 text-white shadow-lg ring-1 ring-white/10'
          : isCards
            ? 'rounded-2xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm'
            : ''

        return (
          <Go key={i} href={item.url} className={`${wrapCls} ${item.url && isCards ? 'block transition hover:-translate-y-0.5 hover:shadow-md' : 'block'}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold">
              <span className="flex items-center gap-2">
                {item.icon && <span className="text-base">{item.icon}</span>}
                <span>{item.label}</span>
                {item.badge && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    isDark ? 'bg-white/15 text-accent-300' : 'bg-primary-100 text-primary-800'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </span>
              <span className={isDark ? 'text-primary-300' : 'opacity-70'}>{item.note || `%${percent}`}</span>
            </div>
            <div
              className={`relative h-3 overflow-hidden rounded-full ${isDark ? 'bg-white/15' : 'bg-black/10'}`}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={item.label}
            >
              <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent-500 transition-all duration-700" style={{ width: `${percent}%` }} />
            </div>
            {isMilestones && (
              <div className="mt-1.5 flex justify-between text-[11px] font-semibold opacity-55" aria-hidden="true">
                <span>%0</span><span>%25</span><span>%50</span><span>%75</span><span>%100</span>
              </div>
            )}
            {item.url && item.link_label && (
              <span className={`mt-3 inline-block text-xs font-bold ${isDark ? 'text-primary-300' : 'text-primary-700'}`}>
                {item.link_label} →
              </span>
            )}
          </Go>
        )
      }

      const cta = o.button_label && o.button_url && (
        <div className={look === 'split' ? 'mt-6' : 'mt-10 text-center'}>
          <Go
            href={o.button_url}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            {o.button_label} <span aria-hidden="true">→</span>
          </Go>
        </div>
      )

      if (look === 'split') {
        return (
          <div className={container}>
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-3xl font-bold leading-tight md:text-[36px]">{o.title}</h2>}
                {o.text && <p className="mt-3 text-lg leading-relaxed opacity-75">{o.text}</p>}
                {cta}
              </div>
              <div className="space-y-5 lg:col-span-7">
                {bars.map(renderBar)}
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className={container}>
          <div className={isCards || isRadial ? '' : 'mx-auto max-w-3xl'}>
            <Head o={o} />
            <div className={isCards || isRadial ? `grid gap-6 ${colCls}` : 'space-y-5'}>
              {bars.map(renderBar)}
            </div>
            {cta}
          </div>
        </div>
      )
    }
    case 'team': {
      const look = o.look || 'plain'
      const members = items.filter((i) => i.name)
      if (!members.length && !o.title && !o.text) return <Empty editing={editing} text="Ekip üyesi ekleyin" />

      const isDark = look === 'dark_cards' || look === 'dark_executive_cards' || look === 'dark_portrait_cards'
      const square = o.shape === 'square'
      const cols = o.columns ?? (look === 'compact' || look === 'horizontal_bio_rows' ? 3 : look === 'detailed_list' ? 2 : 4)
      const gridCols = cols === 1 ? 'grid-cols-1' : `grid-cols-2 ${COLS[cols] || COLS[4]}`

      const renderLinks = (item: Record<string, any>, onDark = false) => {
        if (!item.email && !item.url) return null
        const cls = onDark
          ? 'inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 hover:bg-white/20 transition-colors'
          : 'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors'
        return (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {item.email && <a href={`mailto:${item.email}`} className={cls}>✉️ E-posta</a>}
            {item.url && <Go href={item.url} className={cls}>🔗 Profil</Go>}
          </div>
        )
      }

      const renderAvatar = (item: Record<string, any>, sizeCls: string, textCls = 'text-4xl') => (
        <div className={`overflow-hidden bg-primary-50 ${square ? 'rounded-2xl' : 'rounded-full'} ${sizeCls}`}>
          {item.image_url
            ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover object-top" loading="lazy" />
            : <div className={`flex h-full items-center justify-center font-heading font-bold text-primary-300 ${textCls}`}>{String(item.name).trim().charAt(0)}</div>}
        </div>
      )

      const renderGridCard = (item: Record<string, any>, i: number) => {
        if (look === 'compact') {
          return (
            <div key={i} className="flex items-start gap-4 rounded-2xl border bg-white p-4 text-gray-900 shadow-sm">
              {renderAvatar(item, `h-16 w-16 flex-none ${square ? '!rounded-xl' : ''}`, 'text-2xl')}
              <div className="min-w-0 flex-1">
                {item.badge && <span className="mb-1 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">{item.badge}</span>}
                <div className="truncate font-heading text-base font-bold">{item.name}</div>
                {item.role && <div className="text-xs font-semibold text-primary-600">{item.role}</div>}
                {item.text && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-600">{item.text}</p>}
                {renderLinks(item)}
              </div>
            </div>
          )
        }

        if (look === 'portrait_overlay') {
          return (
            <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-primary-950 text-white shadow-md">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                : <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-800 to-primary-950 font-heading text-6xl font-bold text-white/25">{String(item.name).trim().charAt(0)}</div>}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                {item.badge && <span className="mb-1.5 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm">{item.badge}</span>}
                <div className="font-heading text-lg font-bold leading-snug">{item.name}</div>
                {item.role && <div className="text-xs font-semibold text-primary-300">{item.role}</div>}
                {item.text && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/80">{item.text}</p>}
                {renderLinks(item, true)}
              </div>
            </div>
          )
        }

        if (look === 'detailed_list') {
          return (
            <div key={i} className="flex flex-col gap-5 rounded-2xl border bg-white p-6 text-gray-900 shadow-sm sm:flex-row sm:items-start">
              {renderAvatar(item, 'h-28 w-28 flex-none sm:h-32 sm:w-32', 'text-3xl')}
              <div className="min-w-0 flex-1">
                {item.badge && <span className="mb-1.5 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{item.badge}</span>}
                <div className="font-heading text-xl font-bold">{item.name}</div>
                {item.role && <div className="text-sm font-semibold text-primary-600">{item.role}</div>}
                {item.text && <p className="mt-2.5 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                {renderLinks(item)}
              </div>
            </div>
          )
        }

        if (look === 'hover_bio') {
          return (
            <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-900 text-white shadow-md">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105 group-hover:blur-[2px]" loading="lazy" />
                : <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-800 to-primary-950 font-heading text-6xl font-bold text-white/25">{String(item.name).trim().charAt(0)}</div>}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 transition-all duration-300">
                {item.badge && <span className="mb-1 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold">{item.badge}</span>}
                <div className="font-heading text-lg font-bold">{item.name}</div>
                {item.role && <div className="text-xs font-semibold text-primary-300">{item.role}</div>}
                {item.text && <p className="mt-2 max-h-0 overflow-hidden text-xs leading-relaxed text-white/85 opacity-0 transition-all duration-300 group-hover:max-h-32 group-hover:opacity-100">{item.text}</p>}
                {renderLinks(item, true)}
              </div>
            </div>
          )
        }

        if (look === 'circle_minimal') {
          return (
            <div key={i} className="text-center">
              <div className="mx-auto mb-4 h-36 w-36 overflow-hidden rounded-full p-1 ring-2 ring-primary-200">
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} className="h-full w-full rounded-full object-cover object-top" loading="lazy" />
                  : <div className="flex h-full w-full items-center justify-center rounded-full bg-primary-50 font-heading text-4xl font-bold text-primary-400">{String(item.name).trim().charAt(0)}</div>}
              </div>
              <div className="font-heading text-base font-bold text-gray-900">{item.name}</div>
              {item.role && <div className="mt-0.5 text-xs font-semibold text-primary-600">{item.role}</div>}
            </div>
          )
        }

        return (
          <div key={i} className={`text-center ${
            look === 'card'
              ? 'rounded-2xl bg-white p-6 text-gray-900 shadow-sm'
              : isDark
                ? 'rounded-2xl bg-gray-900 p-6 text-white shadow-lg ring-1 ring-white/10'
                : ''
          }`}>
            {renderAvatar(item, 'mx-auto mb-4 aspect-square w-full max-w-[180px]')}
            {item.badge && (
              <span className={`mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isDark ? 'bg-white/10 text-primary-300' : 'bg-primary-50 text-primary-700'
              }`}>
                {item.badge}
              </span>
            )}
            <div className="font-heading text-lg font-bold">{item.name}</div>
            {item.role && <div className={`text-sm font-semibold ${isDark ? 'text-primary-300' : 'text-primary-600'}`}>{item.role}</div>}
            {item.text && <p className="mt-2 text-sm leading-relaxed opacity-75">{item.text}</p>}
            {(item.email || item.url) && <div className="flex justify-center">{renderLinks(item, isDark)}</div>}
          </div>
        )
      }

      if (look === 'org_hierarchy' && members.length > 0) {
        const [leader, ...rest] = members
        return (
          <div className={container}>
            <Head o={o} />
            <div className="flex flex-col items-center">
              <div className="w-full max-w-sm rounded-3xl border-2 border-primary-200 bg-white p-6 text-center text-gray-900 shadow-md">
                {renderAvatar(leader, 'mx-auto mb-4 h-28 w-28', 'text-3xl')}
                {leader.badge && <span className="mb-1.5 inline-block rounded-full bg-primary-100 px-3 py-0.5 text-[11px] font-bold text-primary-800">{leader.badge}</span>}
                <div className="font-heading text-xl font-bold">{leader.name}</div>
                {leader.role && <div className="text-sm font-semibold text-primary-600">{leader.role}</div>}
                {leader.text && <p className="mt-2 text-xs leading-relaxed text-gray-600">{leader.text}</p>}
                {(leader.email || leader.url) && <div className="flex justify-center">{renderLinks(leader)}</div>}
              </div>
              {rest.length > 0 && (
                <>
                  <div className="h-8 w-0.5 bg-primary-200" aria-hidden="true" />
                  <div className={`grid w-full gap-6 border-t-2 border-primary-200 pt-8 sm:gap-8 ${gridCols}`}>
                    {rest.map((item, idx) => renderGridCard(item, idx + 1))}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      }

      if (look === 'featured_lead' && members.length > 0) {
        const [lead, ...rest] = members
        const restCols = cols === 1 ? 'grid-cols-1' : `grid-cols-2 ${COLS[Math.min(cols, 4)] || COLS[3]}`
        return (
          <div className={container}>
            <Head o={o} />
            <div className="mb-8 grid items-center gap-6 rounded-3xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm md:grid-cols-12 md:p-8">
              <div className="md:col-span-4">
                {renderAvatar(lead, `mx-auto aspect-square w-full max-w-[240px] ${square ? '!rounded-2xl' : ''}`, 'text-5xl')}
              </div>
              <div className="md:col-span-8">
                {lead.badge && <span className="mb-2 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-800">{lead.badge}</span>}
                <h3 className="font-heading text-2xl font-bold md:text-3xl">{lead.name}</h3>
                {lead.role && <div className="mt-1 text-base font-semibold text-primary-600">{lead.role}</div>}
                {lead.text && <p className="mt-3 text-base leading-relaxed text-gray-600">{lead.text}</p>}
                {renderLinks(lead)}
              </div>
            </div>
            {rest.length > 0 && (
              <div className={`grid gap-6 sm:gap-8 ${restCols}`}>
                {rest.map((item, idx) => renderGridCard(item, idx + 1))}
              </div>
            )}
          </div>
        )
      }

      const wrapperCls = look === 'compact'
        ? `grid grid-cols-1 gap-5 sm:grid-cols-2 ${COLS[cols] || COLS[3]}`
        : look === 'detailed_list'
          ? `grid gap-6 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`
          : `grid gap-6 sm:gap-8 ${gridCols}`

      return (
        <div className={container}>
          <Head o={o} />
          <div className={wrapperCls}>
            {members.map(renderGridCard)}
          </div>
        </div>
      )
    }
    case 'logos': {
      const logos = items.filter((i) => i.image_url || i.name)
      if (!logos.length) return <Empty editing={editing} text="Logo ekleyin" />
      const look = o.look || 'strip'
      const isDark = look === 'dark_band' || look === 'dark_monochrome_strip' || look === 'dark_partner_strip'
      const isCards = look === 'cards' || look === 'split' || look === 'bordered_tiles' || look === 'bordered_tile_grid'
      const isDivided = look === 'divided' || look === 'two_row_centered' || look === 'compact_badge_row'
      const size = o.size ?? 56
      const cols = Math.min(Math.max(o.columns ?? 4, 2), 6)
      const colCls = COLS[cols] || COLS[4]
      const speedMul = o.speed === 'slow' ? 8 : o.speed === 'fast' ? 3 : 5
      const minSec = o.speed === 'slow' ? 32 : o.speed === 'fast' ? 12 : 20

      const grayCls = o.grayscale !== false
        ? isDark
          ? 'opacity-70 transition hover:opacity-100'
          : 'opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0'
        : ''

      const renderLogoContent = (item: Record<string, any>) => (
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name || ''}
              style={{ height: size }}
              className={`w-auto max-w-[180px] object-contain ${isDark ? 'brightness-0 invert' : ''}`}
              loading="lazy"
            />
          ) : (
            <span className="font-heading text-lg font-bold tracking-tight sm:text-xl">{item.name}</span>
          )}
          {item.badge && (
            <span className={`text-[10px] font-semibold tracking-wide ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              {item.badge}
            </span>
          )}
        </div>
      )

      const logoStripItem = (item: Record<string, any>, i: number) => (
        <Go key={i} href={item.url} className={`flex flex-none items-center justify-center px-6 ${grayCls}`}>
          {renderLogoContent(item)}
        </Go>
      )

      const logoGridItem = (item: Record<string, any>, i: number) => (
        <Go
          key={i}
          href={item.url}
          className={`flex min-h-[104px] items-center justify-center p-6 ${grayCls} ${
            isCards
              ? `rounded-2xl border border-gray-200/80 bg-white text-gray-900 shadow-sm ${item.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`
              : isDivided
                ? 'bg-white text-gray-900'
                : isDark
                  ? 'rounded-2xl bg-white/5 text-white ring-1 ring-white/10'
                  : ''
          }`}
        >
          {renderLogoContent(item)}
        </Go>
      )

      const cta = o.button_label && o.button_url && (
        <div className={look === 'split' ? 'mt-6' : 'mt-8 text-center'}>
          <Go
            href={o.button_url}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
              isDark ? 'bg-white text-primary-950 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {o.button_label} <span aria-hidden="true">→</span>
          </Go>
        </div>
      )

      const header = (o.kicker || o.title || o.text) && (
        <div className={`mx-auto mb-8 max-w-2xl text-center`}>
          {o.kicker && <div className={`mb-1.5 text-xs font-bold tracking-[2px] ${isDark ? 'text-accent-300' : 'text-primary-600'}`}>{o.kicker}</div>}
          {o.title && (
            <div className={o.kicker || o.text ? 'font-heading text-2xl font-bold md:text-3xl' : 'text-sm font-bold tracking-[1.5px] opacity-70'}>
              {o.title}
            </div>
          )}
          {o.text && <p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-white/75' : 'text-gray-600'}`}>{o.text}</p>}
        </div>
      )

      if (look === 'badge_pills') {
        return (
          <div className={container}>
            {header}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {logos.map((item, i) => (
                <Go key={i} href={item.url} className="inline-flex items-center gap-3 rounded-full border border-gray-200/80 bg-white px-5 py-2.5 text-gray-900 shadow-sm transition hover:border-primary-300 hover:shadow-md">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name || ''} className="h-7 w-auto max-w-[90px] object-contain" loading="lazy" />
                  )}
                  {item.name && <span className="font-heading text-sm font-bold">{item.name}</span>}
                  {item.badge && <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[10px] font-bold text-primary-700">{item.badge}</span>}
                </Go>
              ))}
            </div>
            {cta}
          </div>
        )
      }

      if (look === 'wall_of_trust') {
        const mid = Math.ceil(logos.length / 2)
        const row1 = logos.slice(0, mid)
        const row2 = logos.slice(mid).length ? logos.slice(mid) : logos
        return (
          <div>
            {header && <div className={container}>{header}</div>}
            <div className="space-y-4 overflow-hidden" dir="ltr" style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
              <div className="bmq items-center" style={{ ['--bmq' as string]: `${Math.max(row1.length * speedMul, minSec)}s` }}>
                {row1.map(logoStripItem)}
                <div className="contents" aria-hidden="true">{row1.map((item, i) => logoStripItem(item, i + row1.length))}</div>
              </div>
              <div className="bmq items-center" style={{ ['--bmq' as string]: `${Math.max(row2.length * speedMul, minSec)}s`, animationDirection: 'reverse' }}>
                {row2.map(logoStripItem)}
                <div className="contents" aria-hidden="true">{row2.map((item, i) => logoStripItem(item, i + row2.length))}</div>
              </div>
            </div>
            {cta}
          </div>
        )
      }

      if (look === 'split') {
        const splitCols = cols <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
        return (
          <div className={container}>
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-2xl font-bold leading-tight md:text-3xl">{o.title}</h2>}
                {o.text && <p className="mt-3 text-base leading-relaxed opacity-75">{o.text}</p>}
                {cta}
              </div>
              <div className={`grid grid-cols-2 gap-4 lg:col-span-7 ${splitCols}`}>
                {logos.map(logoGridItem)}
              </div>
            </div>
          </div>
        )
      }

      if (isCards || isDivided) {
        return (
          <div className={container}>
            {header}
            {isDivided ? (
              <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 shadow-sm ${colCls}`}>
                {logos.map(logoGridItem)}
              </div>
            ) : (
              <div className={`grid grid-cols-2 gap-4 sm:gap-5 ${colCls}`}>
                {logos.map(logoGridItem)}
              </div>
            )}
            {cta}
          </div>
        )
      }

      const content = (
        <>
          {header && <div className={o.marquee ? container : ''}>{header}</div>}
          {o.marquee && !editing ? (
            <div className="relative overflow-hidden" dir="ltr" style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
              <div className="bmq items-center" style={{ ['--bmq' as string]: `${Math.max(logos.length * speedMul, minSec)}s` }}>
                {logos.map(logoStripItem)}
                <div className="contents" aria-hidden="true">{logos.map((item, i) => logoStripItem(item, i + logos.length))}</div>
              </div>
            </div>
          ) : isDark ? (
            <div className={`grid grid-cols-2 gap-4 ${colCls}`}>{logos.map(logoGridItem)}</div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-y-6">{logos.map(logoStripItem)}</div>
          )}
          {cta}
        </>
      )

      if (isDark) {
        return (
          <div className="bg-primary-950 py-14 text-white">
            <div className={o.marquee ? '' : container}>{content}</div>
          </div>
        )
      }

      return <div className={o.marquee ? '' : container}>{content}</div>
    }
    case 'countdown': {
      const isLight = o.tone === 'light' || o.tone === 'soft'
      const showSec = o.show_seconds !== false
      const hideDone = Boolean(o.hide_on_done) && !editing
      const primaryCls = isLight
        ? 'inline-flex rounded-lg bg-primary-600 px-7 py-3 font-bold text-white transition-colors hover:bg-primary-700'
        : 'inline-flex rounded-lg bg-white px-7 py-3 font-bold text-gray-900 transition-colors hover:bg-gray-100'
      const secondaryCls = isLight
        ? 'inline-flex rounded-lg border border-primary-200 bg-white px-6 py-3 font-bold text-primary-800 transition-colors hover:bg-primary-50'
        : 'inline-flex rounded-lg border border-white/25 bg-white/10 px-6 py-3 font-bold text-white transition-colors hover:bg-white/20'
      const actions = (o.button_label && o.button_url) || (o.button2_label && o.button2_url) ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {o.button_label && o.button_url && <Go href={o.button_url} className={primaryCls}>{o.button_label}</Go>}
          {o.button2_label && o.button2_url && <Go href={o.button2_url} className={secondaryCls}>{o.button2_label}</Go>}
        </div>
      ) : null

      if (o.look === 'sticky_bar') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className="sticky top-0 z-30 border-b border-white/15 bg-primary-900/95 py-3 text-white shadow-md backdrop-blur-md">
              <div className={`${container} flex flex-wrap items-center justify-between gap-3`}>
                <div className="flex items-center gap-2.5">
                  {o.kicker && <span className="rounded-full bg-accent-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">{o.kicker}</span>}
                  <span className="font-heading text-sm font-bold sm:text-base">{o.title}</span>
                </div>
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="minimal" showSeconds={showSec} /> : null}
                {o.button_label && o.button_url && (
                  <Go href={o.button_url} className="inline-flex rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-primary-900 transition hover:bg-primary-50">{o.button_label} →</Go>
                )}
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'dark_spotlight') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className="bg-gray-950 py-16 text-white">
              <div className={`${container} flex flex-col items-center gap-7 text-center`}>
                <div>
                  {o.kicker && <div className="mb-2 text-xs font-extrabold uppercase tracking-[3px] text-accent-400">{o.kicker}</div>}
                  {o.title && <h2 className="font-heading text-3xl font-extrabold md:text-5xl">{o.title}</h2>}
                  {o.text && <p className="mx-auto mt-3 max-w-2xl text-gray-300">{o.text}</p>}
                </div>
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="band" showSeconds={showSec} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                {actions}
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'hero_banner') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className="relative overflow-hidden bg-gray-900 py-20 text-white">
              {o.image_url && <img src={o.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35" loading="lazy" />}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
              <div className={`relative ${container} flex flex-col items-center gap-6 text-center`}>
                {o.kicker && <span className="rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">{o.kicker}</span>}
                {o.title && <h2 className="max-w-3xl font-heading text-3xl font-extrabold md:text-5xl">{o.title}</h2>}
                {o.text && <p className="max-w-2xl text-base text-white/85">{o.text}</p>}
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="cards" showSeconds={showSec} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                {actions}
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'minimal') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className={`${BAND[o.tone] || BAND.brand} py-5`}>
              <div className={`${container} flex flex-wrap items-center justify-between gap-4`}>
                <div className="font-heading text-lg font-bold">{o.title || o.kicker}</div>
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="minimal" showSeconds={showSec} light={isLight} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                {o.button_label && o.button_url && (
                  <Go href={o.button_url} className={`inline-flex rounded-lg px-5 py-2 text-sm font-bold ${isLight ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-white text-gray-900 hover:bg-gray-100'}`}>{o.button_label}</Go>
                )}
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'glass') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className="relative overflow-hidden bg-primary-950 py-14 text-white">
              {o.image_url && <img src={o.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" loading="lazy" />}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-950/85 via-primary-900/75 to-gray-950/80" />
              <div className={`relative ${container}`}>
                <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-3xl border border-white/20 bg-white/10 p-8 text-center backdrop-blur-md md:p-12">
                  <div>
                    {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-accent-300">{o.kicker}</div>}
                    {o.title && <h2 className="font-heading text-3xl font-bold md:text-4xl">{o.title}</h2>}
                    {o.text && <p className="mx-auto mt-3 max-w-2xl text-white/85">{o.text}</p>}
                  </div>
                  {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="band" showSeconds={showSec} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                  {actions}
                </div>
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'split') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className={container}>
              <div className={`${BAND[o.tone] || BAND.brand} grid items-center overflow-hidden rounded-3xl shadow-xl md:grid-cols-2`}>
                <div className="relative min-h-[260px] bg-primary-950/30">
                  {o.image_url && <img src={o.image_url} alt={o.title || ''} className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="flex flex-col items-center gap-6 p-8 text-center md:p-12">
                  <div>
                    {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] opacity-80">{o.kicker}</div>}
                    {o.title && <h2 className="font-heading text-3xl font-bold">{o.title}</h2>}
                    {o.text && <p className="mt-2.5 opacity-85">{o.text}</p>}
                  </div>
                  {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="band" showSeconds={showSec} light={isLight} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                  {actions}
                </div>
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'dark_neon_timer') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className="bg-slate-950 py-14 text-white">
              <div className={`${container} flex flex-col items-center gap-6 rounded-3xl border border-accent-500/30 bg-gradient-to-br from-slate-900 via-gray-950 to-primary-950 p-8 text-center shadow-2xl md:p-12`}>
                {o.kicker && <span className="rounded-full border border-accent-400/40 bg-accent-500/15 px-4 py-1 text-xs font-extrabold uppercase tracking-[2px] text-accent-300">{o.kicker}</span>}
                {o.title && <h2 className="font-heading text-3xl font-extrabold text-white md:text-4xl">{o.title}</h2>}
                {o.text && <p className="max-w-2xl text-sm text-gray-300 sm:text-base">{o.text}</p>}
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="cards" showSeconds={showSec} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                {actions}
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'minimal_inline_clock') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className={container}>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
                <div>
                  {o.kicker && <div className="text-[11px] font-extrabold uppercase tracking-wider text-primary-600">{o.kicker}</div>}
                  <div className="font-heading text-lg font-bold text-gray-900">{o.title}</div>
                </div>
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="minimal" showSeconds={showSec} light /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                {o.button_label && o.button_url && (
                  <Go href={o.button_url} className="inline-flex rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-primary-700">{o.button_label} →</Go>
                )}
              </div>
            </div>
          </CountdownGate>
        )
      }

      if (o.look === 'card_boxes_gold') {
        return (
          <CountdownGate target={o.target} enabled={hideDone}>
            <div className="bg-amber-50/70 py-14 text-gray-900">
              <div className={`${container} flex flex-col items-center gap-6 rounded-3xl border border-amber-300/80 bg-white p-8 text-center shadow-lg md:p-12`}>
                {o.kicker && <div className="text-xs font-extrabold uppercase tracking-[2px] text-amber-700">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-3xl font-bold text-gray-900 md:text-4xl">{o.title}</h2>}
                {o.text && <p className="max-w-2xl text-gray-600">{o.text}</p>}
                {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="cards" showSeconds={showSec} light /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
                {actions}
              </div>
            </div>
          </CountdownGate>
        )
      }

      return (
        <CountdownGate target={o.target} enabled={hideDone}>
          <div className={`${BAND[o.tone] || BAND.brand} flex flex-col justify-center py-14`}>
            <div className={`${container} flex w-full flex-col items-center gap-6 text-center`}>
              <div>
                {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] opacity-80">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-3xl font-bold md:text-4xl">{o.title}</h2>}
                {o.text && <p className="mx-auto mt-3 max-w-2xl opacity-85">{o.text}</p>}
              </div>
              {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look={o.look} showSeconds={showSec} light={isLight} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
              {actions}
            </div>
          </div>
        </CountdownGate>
      )
    }
    case 'timeline': {
      const look = o.look || 'vertical'
      const events = items.filter((i) => i.title || i.date)
      if (!events.length && !o.title && !o.text) return <Empty editing={editing} text="Zaman çizelgesine olay ekleyin" />

      const statusMeta: Record<string, { label: string; badge: string; dot: string }> = {
        done: { label: 'Tamamlandı ✓', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
        active: { label: 'Devam Ediyor', badge: 'bg-primary-100 text-primary-800', dot: 'bg-primary-600 ring-4 ring-primary-100' },
        upcoming: { label: 'Planlandı', badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-300' },
      }
      const maxWidth = look === 'horizontal' ? '' : look === 'alternating' || look === 'photo_story' ? 'mx-auto max-w-5xl' : 'mx-auto max-w-3xl'
      const hCols = COLS[Math.min(Math.max(events.length, 1), 5)] || COLS[4]

      return (
        <div className={container}><div className={maxWidth}>
          <Head o={o} />
          {look === 'year_tabs' || look === 'pill_badge_timeline' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {events.map((item, i) => (
                  <span key={i} className="rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-xs font-bold text-primary-800">
                    {item.icon ? `${item.icon} ` : ''}{item.date || `#${i + 1}`}
                  </span>
                ))}
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((item, i) => (
                  <Go key={i} href={item.url} className="flex flex-col rounded-2xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      {item.date && <span className="rounded-full bg-primary-600 px-3 py-0.5 text-xs font-bold text-white">{item.date}</span>}
                      {item.badge && <span className="text-[11px] font-semibold text-primary-700">{item.badge}</span>}
                    </div>
                    {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                    {item.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                  </Go>
                ))}
              </div>
            </div>
          ) : look === 'milestone_dark' || look === 'glass_dark_timeline' ? (
            <div className="rounded-3xl bg-gray-950 p-6 text-white sm:p-10">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((item, i) => (
                  <Go key={i} href={item.url} className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="font-heading text-2xl font-extrabold text-accent-400">{item.date || String(i + 1).padStart(2, '0')}</span>
                      {item.badge && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary-200">{item.badge}</span>}
                    </div>
                    {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                    {item.text && <p className="mt-2 text-sm leading-relaxed text-gray-300">{item.text}</p>}
                  </Go>
                ))}
              </div>
            </div>
          ) : look === 'horizontal' ? (
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-10 top-5 hidden h-0.5 bg-primary-200 lg:block" aria-hidden />
              <div className={`grid gap-6 sm:grid-cols-2 ${hCols}`}>
                {events.map((item, i) => (
                  <div key={i} className="relative flex flex-col">
                    <div className="relative z-10 mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 font-heading text-sm font-bold text-white ring-4 ring-white shadow-sm">
                      {item.icon || String(i + 1).padStart(2, '0')}
                    </div>
                    <Go href={item.url} className={`flex-1 rounded-2xl border bg-white p-5 text-gray-900 shadow-sm ${item.url ? 'block transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
                      {item.date && <div className="mb-2 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">{item.date}</div>}
                      {item.badge && <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-600">{item.badge}</div>}
                      {item.title && <h3 className="font-heading text-lg font-bold">{item.title}</h3>}
                      {item.text && <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                    </Go>
                  </div>
                ))}
              </div>
            </div>
          ) : look === 'alternating' ? (
            <div className="relative space-y-6">
              <div className="pointer-events-none absolute inset-y-4 left-1/2 hidden w-0.5 -translate-x-1/2 bg-primary-200 md:block" aria-hidden />
              {events.map((item, i) => {
                const odd = i % 2 === 1
                return (
                  <div key={i} className="relative grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
                    <div className={odd ? 'md:order-3' : 'md:order-1'}>
                      <Go href={item.url} className={`rounded-2xl border bg-white p-6 text-gray-900 shadow-sm ${item.url ? 'block transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          {item.date && <span className="text-xs font-bold uppercase tracking-wider text-primary-600">{item.date}</span>}
                          {item.badge && <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">{item.badge}</span>}
                        </div>
                        {item.title && <h3 className="mt-1 font-heading text-xl font-bold">{item.title}</h3>}
                        {item.text && <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                      </Go>
                    </div>
                    <div className="relative z-10 hidden items-center justify-center md:order-2 md:flex">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 font-heading text-base font-bold text-white ring-4 ring-white shadow">
                        {item.icon || String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className={`hidden md:block ${odd ? 'md:order-1' : 'md:order-3'}`} />
                  </div>
                )
              })}
            </div>
          ) : look === 'compact' ? (
            <div className="divide-y rounded-2xl border bg-white px-6 text-gray-900 shadow-sm">
              {events.map((item, i) => (
                <Go key={i} href={item.url} className={`grid grid-cols-1 gap-1.5 py-4 sm:grid-cols-[130px_1fr] sm:items-baseline sm:gap-6 ${item.url ? 'hover:bg-gray-50/70 transition-colors' : ''}`}>
                  <div className="flex items-center gap-2">
                    {item.icon && <span className="text-base">{item.icon}</span>}
                    {item.date && <span className="text-xs font-bold uppercase tracking-wider text-primary-600">{item.date}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.title && <h3 className="font-heading text-base font-bold">{item.title}</h3>}
                      {item.badge && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">{item.badge}</span>}
                    </div>
                    {item.text && <p className="mt-1 text-sm text-gray-600">{item.text}</p>}
                  </div>
                </Go>
              ))}
            </div>
          ) : (
            <ol className={`relative ms-3 border-s-2 ${look === 'dark_cards' ? 'border-primary-500/40' : 'border-primary-200'}`}>
              {events.map((item, i) => {
                const st = item.status ? statusMeta[item.status] : undefined
                const isDark = look === 'dark_cards'
                const isCard = look === 'cards' || look === 'roadmap' || look === 'photo_story' || isDark
                return (
                  <li key={i} className="relative pb-9 ps-8 last:pb-0">
                    <span
                      className={`absolute -start-[11px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-4 text-[10px] shadow ${
                        isDark ? 'border-gray-950' : 'border-white'
                      } ${st ? st.dot : 'bg-primary-600 text-white'}`}
                      aria-hidden
                    >
                      {item.icon && <span className="leading-none">{item.icon}</span>}
                    </span>
                    <Go
                      href={item.url}
                      className={`${
                        isDark
                          ? 'rounded-2xl bg-gray-900 p-6 text-white shadow-lg ring-1 ring-white/10'
                          : isCard
                            ? 'rounded-2xl border bg-white p-5 text-gray-900 shadow-sm'
                            : ''
                      } ${item.url && isCard ? 'block transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}
                    >
                      <div className={look === 'photo_story' && item.image_url ? 'grid items-center gap-5 md:grid-cols-12' : ''}>
                        {item.image_url && (
                          <div className={look === 'photo_story' ? 'md:col-span-5' : 'mb-4'}>
                            <img src={item.image_url} alt={item.title || ''} className="aspect-[16/10] w-full rounded-xl object-cover" loading="lazy" />
                          </div>
                        )}
                        <div className={look === 'photo_story' && item.image_url ? 'md:col-span-7' : ''}>
                          <div className="flex flex-wrap items-center gap-2">
                            {item.date && (
                              <span className={`text-[13px] font-bold uppercase tracking-wider ${isDark ? 'text-primary-300' : 'text-primary-600'}`}>
                                {item.date}
                              </span>
                            )}
                            {st && (
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.badge}`}>
                                {st.label}
                              </span>
                            )}
                            {item.badge && (
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isDark ? 'bg-white/10 text-primary-200' : 'bg-primary-50 text-primary-700'}`}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {item.title && <h3 className="mt-1 font-heading text-xl font-bold">{item.title}</h3>}
                          {item.text && <p className={`mt-1.5 leading-relaxed ${isDark ? 'text-gray-300' : 'opacity-75'}`}>{item.text}</p>}
                        </div>
                      </div>
                    </Go>
                  </li>
                )
              })}
            </ol>
          )}
        </div></div>
      )
    }
    case 'tabs': {
      const tabs = items.filter((i) => i.label)
      if (!tabs.length) return <Empty editing={editing} text="Sekme ekleyin" />
      const imgRight = o.image_side === 'right'
      const panels = tabs.map((item, i) => (
        <div key={i} className={item.image_url ? 'grid items-center gap-8 md:grid-cols-2' : ''}>
          {item.image_url && (
            <div className={imgRight ? 'md:order-2' : ''}>
              {item.mobile_image_url ? (
                <picture>
                  <source media="(max-width: 767px)" srcSet={item.mobile_image_url} />
                  <img src={item.image_url} alt={item.title || item.label || ''} className="w-full rounded-2xl object-cover" loading="lazy" />
                </picture>
              ) : (
                <img src={item.image_url} alt={item.title || item.label || ''} className="w-full rounded-2xl object-cover" loading="lazy" />
              )}
            </div>
          )}
          <div className={imgRight && item.image_url ? 'md:order-1' : ''}>
            {item.title && <h3 className="mb-3 font-heading text-2xl font-bold">{item.title}</h3>}
            <BlockText text={item.text} />
            {item.button_label && item.button_url && (
              <Go href={item.button_url} className="mt-5 inline-flex rounded-lg bg-primary-600 px-6 py-3 font-bold text-white hover:bg-primary-700">{item.button_label}</Go>
            )}
          </div>
        </div>
      ))
      return (
        <div className={container}><div className={o.look === 'accordion' ? 'mx-auto max-w-3xl' : ''}>
          <Head o={o} />
          <TabsView
            labels={tabs.map((i) => i.label)}
            meta={tabs.map((i) => ({ icon: i.icon, badge: i.badge }))}
            panels={panels}
            look={
              o.look === 'dark_gold_tabs' ? 'dark_cards'
                : o.look === 'bordered_card_tabs' ? 'boxed_cards'
                : o.look === 'compact_pill_switcher' ? 'pills'
                : o.look
            }
          />
        </div></div>
      )
    }
    case 'marquee': {
      const entries = items.filter((i) => i?.text)
      if (!entries.length) return <Empty editing={editing} text="Kayan yazı ekleyin" />
      const look = o.look || 'classic'
      const seconds = { slow: 60, normal: 35, fast: 18 }[o.speed as string] || 35
      const repeat = Math.max(1, Math.ceil(6 / entries.length))
      const repeated = Array.from({ length: repeat }, () => entries).flat()
      const isLight = o.tone === 'soft' || o.tone === 'light'
      const trackCls = editing
        ? 'flex'
        : `bmq${o.direction === 'right' ? ' bmq-rev' : ''}${o.pause_on_hover === false ? ' bmq-nopause' : ''}`

      const renderEntry = (item: Record<string, any>, idx: number, keyPrefix: string) => {
        const inner = (
          <>
            {item.icon && <span aria-hidden>{item.icon}</span>}
            <span>{item.text}</span>
          </>
        )
        const wrapped = item.url ? (
          String(item.url).startsWith('/') ? (
            <Link href={item.url} className="inline-flex items-center gap-2 hover:underline">{inner}</Link>
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:underline">{inner}</a>
          )
        ) : (
          <span className="inline-flex items-center gap-2">{inner}</span>
        )

        if (look === 'pills' || look === 'pill_badge_marquee') {
          return (
            <span
              key={`${keyPrefix}${idx}`}
              className={`mx-2 inline-flex flex-none items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold shadow-sm ${
                isLight ? 'bg-white text-primary-900 ring-1 ring-primary-200' : 'bg-white/15 text-white ring-1 ring-white/20'
              }`}
            >
              {wrapped}
            </span>
          )
        }

        return (
          <span key={`${keyPrefix}${idx}`} className="flex flex-none items-center gap-6 px-3">
            {wrapped}
            <span aria-hidden className="opacity-60">{o.separator || '✦'}</span>
          </span>
        )
      }

      const run = (key: string) => repeated.map((item, i) => renderEntry(item, i, key))
      const textCls =
        look === 'display'
          ? 'py-5 font-heading text-xl font-extrabold uppercase tracking-wider sm:text-2xl'
          : look === 'pills'
            ? 'py-3.5 text-sm font-bold'
            : 'py-3 text-sm font-bold uppercase tracking-wider'

      const marqueeTrack = (
        <div className="min-w-0 flex-1 overflow-hidden" dir="ltr">
          <div className={trackCls} style={{ ['--bmq' as string]: `${seconds}s` }}>
            {run('a')}
            {!editing && <span aria-hidden className="flex">{run('b')}</span>}
          </div>
        </div>
      )

      if (look === 'emerald_gold_ribbon') {
        return (
          <div className="overflow-hidden border-y border-amber-400/30 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 py-3.5 text-sm font-bold uppercase tracking-wider text-amber-300">
            {marqueeTrack}
          </div>
        )
      }

      if (look === 'minimal_outline_ticker') {
        return (
          <div className="overflow-hidden border-y border-gray-200 bg-white py-3 text-sm font-semibold text-gray-800">
            {marqueeTrack}
          </div>
        )
      }

      if (look === 'urgent_pulse_marquee') {
        return (
          <div className="flex items-center overflow-hidden border-y border-red-800 bg-red-600 py-3 text-sm font-extrabold uppercase tracking-wider text-white">
            <div className="z-10 ms-3 flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-red-700 shadow-sm">
              <span className="h-2 w-2 animate-ping rounded-full bg-red-600" /> {o.label || 'ACİL YARDIM'}
            </div>
            {marqueeTrack}
          </div>
        )
      }

      if (look === 'breaking_news_red') {
        return (
          <div className="flex items-center overflow-hidden bg-red-700 text-white py-3 text-sm font-bold uppercase tracking-wider">
            <div className="z-10 ms-3 flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-1 text-xs font-extrabold text-red-700 shadow-sm">
              <span className="h-2 w-2 animate-ping rounded-full bg-red-600" /> {o.label || 'ACİL'}
            </div>
            {marqueeTrack}
          </div>
        )
      }

      if (look === 'glass_translucent') {
        return (
          <div className="mx-auto max-w-6xl px-4">
            <div className="overflow-hidden rounded-full border border-primary-200/70 bg-white/80 text-primary-950 shadow-sm backdrop-blur-md py-3 text-sm font-bold">
              {marqueeTrack}
            </div>
          </div>
        )
      }

      if (look === 'double_opposite') {
        return (
          <div className="space-y-2 overflow-hidden">
            <div className={`${BAND[o.tone] || BAND.brand} overflow-hidden ${textCls}`}>{marqueeTrack}</div>
            <div className="overflow-hidden bg-gray-900 py-3 text-sm font-bold uppercase tracking-wider text-white" dir="ltr">
              <div className="bmq bmq-rev" style={{ ['--bmq' as string]: `${seconds}s` }}>
                {run('r1')}
                {!editing && <span aria-hidden className="flex">{run('r2')}</span>}
              </div>
            </div>
          </div>
        )
      }

      if (look === 'ticker') {
        return (
          <div className={`${BAND[o.tone] || BAND.dark} flex items-center overflow-hidden ${textCls}`}>
            {o.label && (
              <div className={`z-10 shrink-0 px-4 py-1 text-xs font-extrabold uppercase tracking-widest shadow-sm ${
                isLight ? 'bg-primary-700 text-white' : 'bg-accent-500 text-white'
              } ms-3 rounded-lg`}>
                {o.label}
              </div>
            )}
            {marqueeTrack}
          </div>
        )
      }

      if (look === 'tilted') {
        return (
          <div className="overflow-hidden py-4">
            <div className={`${BAND[o.tone] || BAND.brand} -mx-2 -rotate-1 overflow-hidden shadow-md ${textCls}`}>
              {marqueeTrack}
            </div>
          </div>
        )
      }

      if (look === 'dark_gold_ticker') {
        return (
          <div className="border-y border-amber-500/30 bg-slate-950 py-3.5 text-sm font-bold uppercase tracking-wider text-amber-300">
            {marqueeTrack}
          </div>
        )
      }

      if (look === 'bordered_light_strip') {
        return (
          <div className="border-y border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-800">
            {marqueeTrack}
          </div>
        )
      }

      return (
        <div className={`${BAND[o.tone] || BAND.brand} overflow-hidden ${textCls}`}>
          {marqueeTrack}
        </div>
      )
    }
    case 'quote': {
      if (!o.text && !o.arabic_text) return <Empty editing={editing} text="Alıntı metnini yazın" />
      const look = o.look || 'centered'

      if (look === 'emerald_verse_box') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-4xl rounded-3xl border border-amber-400/40 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-8 text-center text-white shadow-xl md:p-12">
              {o.kicker && <div className="mb-3 text-xs font-extrabold uppercase tracking-[3px] text-amber-300">{o.kicker}</div>}
              {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-3xl leading-loose text-amber-200">{o.arabic_text}</p>}
              <p className="font-heading text-xl font-bold leading-relaxed md:text-2xl">“{o.text}”</p>
              {o.source && <footer className="mt-4 text-sm font-bold text-amber-300">{o.source}{o.source_role ? ` · ${o.source_role}` : ''}</footer>}
            </div>
          </blockquote>
        )
      }

      if (look === 'minimal_serif_quote') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-3xl border-y border-gray-200 py-10 text-center">
              {o.kicker && <div className="mb-2 text-xs font-bold uppercase tracking-[3px] text-primary-600">{o.kicker}</div>}
              <p className="font-serif text-2xl italic leading-relaxed text-gray-900 md:text-3xl">“{o.text}”</p>
              {o.source && <footer className="mt-4 text-xs font-extrabold uppercase tracking-widest text-gray-500">{o.source}</footer>}
            </div>
          </blockquote>
        )
      }

      if (look === 'bordered_callout_quote') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 border-s-4 border-s-primary-600 bg-white p-7 shadow-sm">
              {o.kicker && <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-primary-700">{o.kicker}</div>}
              <p className="font-heading text-lg font-bold leading-relaxed text-gray-900 md:text-xl">“{o.text}”</p>
              {o.source && <footer className="mt-3 text-sm font-semibold text-gray-600">{o.source}{o.source_role ? ` — ${o.source_role}` : ''}</footer>}
            </div>
          </blockquote>
        )
      }

      if (look === 'islamic_calligraphy_box') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-4xl rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-amber-50/60 via-white to-amber-50/40 p-8 text-center shadow-md md:p-12">
              {o.kicker && <div className="mb-3 text-xs font-extrabold uppercase tracking-[3px] text-amber-800">{o.kicker}</div>}
              {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-3xl leading-loose text-primary-950">{o.arabic_text}</p>}
              <p className="font-heading text-xl font-bold leading-relaxed text-gray-900 md:text-2xl">“{o.text}”</p>
              {o.source && <footer className="mt-4 text-sm font-bold text-amber-900">{o.source}</footer>}
            </div>
          </blockquote>
        )
      }
      if (look === 'dark_editorial_quote' || look === 'dark_gold_callout') {
        return (
          <blockquote className="bg-slate-950 py-14 text-white">
            <div className={`${container} max-w-4xl text-center ${look === 'dark_gold_callout' ? 'rounded-3xl border border-amber-400/30 bg-white/5 p-8 sm:p-12' : ''}`}>
              {o.kicker && <div className="mb-3 text-xs font-extrabold uppercase tracking-[3px] text-accent-300">{o.kicker}</div>}
              <p className="font-heading text-2xl font-bold leading-snug md:text-4xl">“{o.text}”</p>
              {o.source && <footer className="mt-5 text-sm font-semibold text-white/70">{o.source}{o.source_role ? ` · ${o.source_role}` : ''}</footer>}
            </div>
          </blockquote>
        )
      }
      if (look === 'minimal_left_line' || look === 'card_with_badge') {
        return (
          <blockquote className={container}>
            <div className={`mx-auto max-w-4xl ${look === 'card_with_badge' ? 'rounded-3xl border border-gray-200 bg-white p-8 shadow-sm' : 'border-s-4 border-primary-600 ps-6 py-2'}`}>
              {o.kicker && <span className="mb-2 inline-block rounded-full bg-primary-50 px-3 py-0.5 text-xs font-extrabold text-primary-700">{o.kicker}</span>}
              <p className="font-heading text-xl font-bold leading-relaxed text-gray-900 md:text-2xl">“{o.text}”</p>
              {o.source && <footer className="mt-3 text-sm font-bold text-primary-700">{o.source}</footer>}
            </div>
          </blockquote>
        )
      }
      if (look === 'split_author_photo') {
        return (
          <blockquote className={container}>
            <div className="mx-auto grid max-w-4xl items-center gap-6 rounded-3xl border border-gray-200 bg-white p-7 shadow-sm md:grid-cols-12">
              {o.image_url && <div className="md:col-span-4"><img src={o.image_url} alt={o.source || ''} className="aspect-square w-full rounded-2xl object-cover" loading="lazy" /></div>}
              <div className={o.image_url ? 'md:col-span-8' : 'md:col-span-12'}>
                <p className="font-heading text-xl font-bold leading-relaxed text-gray-900">“{o.text}”</p>
                {o.source && <footer className="mt-4 text-sm font-bold text-primary-700">{o.source}{o.source_role ? <span className="font-normal text-gray-500"> — {o.source_role}</span> : ''}</footer>}
              </div>
            </div>
          </blockquote>
        )
      }

      if (look === 'editorial_pullquote') {
        return (
          <blockquote className={container}>
            <div className="relative mx-auto max-w-4xl border-y-2 border-primary-200 py-10 text-center">
              <span aria-hidden className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 bg-white px-4 font-serif text-6xl leading-none text-primary-500">“</span>
              {o.kicker && <div className="mb-3 text-xs font-extrabold uppercase tracking-[3px] text-primary-600">{o.kicker}</div>}
              {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-2xl leading-loose text-primary-950 md:text-3xl">{o.arabic_text}</p>}
              <p className="font-heading text-2xl font-bold leading-snug text-gray-900 md:text-4xl">{o.text}</p>
              {(o.source || o.source_role) && (
                <footer className="mt-5 text-sm font-bold text-primary-700">
                  {o.source}{o.source_role ? <span className="font-normal text-gray-500"> — {o.source_role}</span> : ''}
                </footer>
              )}
            </div>
          </blockquote>
        )
      }

      if (look === 'split_highlight') {
        return (
          <blockquote className={container}>
            <div className="mx-auto grid max-w-4xl items-center gap-6 rounded-3xl border border-gray-200/80 bg-white p-8 shadow-sm md:grid-cols-12 md:p-10">
              <div className="border-b border-gray-100 pb-4 md:col-span-4 md:border-b-0 md:border-e md:pb-0 md:pe-6">
                {o.kicker && <div className="mb-2 text-xs font-bold uppercase tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.source && <div className="font-heading text-lg font-bold text-gray-900">{o.source}</div>}
                {o.source_role && <div className="mt-1 text-xs text-gray-500">{o.source_role}</div>}
              </div>
              <div className="md:col-span-8">
                {o.arabic_text && <p dir="rtl" className="mb-3 font-serif text-xl leading-loose text-primary-900">{o.arabic_text}</p>}
                <p className="font-heading text-xl leading-relaxed text-gray-800 md:text-2xl">“{o.text}”</p>
              </div>
            </div>
          </blockquote>
        )
      }

      if (look === 'floating_paper') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 p-8 text-center text-gray-900 shadow-md md:p-12">
              {o.kicker && <div className="mb-3 text-xs font-bold uppercase tracking-[2px] text-amber-800">{o.kicker}</div>}
              {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-2xl leading-loose text-amber-950 md:text-3xl">{o.arabic_text}</p>}
              <p className="font-serif text-2xl italic leading-relaxed text-gray-800 md:text-[28px]">“{o.text}”</p>
              {o.source && <footer className="mt-5 text-sm font-bold text-amber-900">— {o.source}</footer>}
              {o.source_role && <div className="mt-0.5 text-xs text-amber-700/80">{o.source_role}</div>}
            </div>
          </blockquote>
        )
      }

      if (look === 'side') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-3xl border-s-4 border-primary-600 ps-6">
              {o.kicker && <div className="mb-2 text-xs font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
              {o.arabic_text && <p dir="rtl" className="mb-3 font-serif text-2xl leading-loose text-primary-900">{o.arabic_text}</p>}
              <p className="font-heading text-2xl leading-relaxed">{o.text}</p>
              {(o.source || o.source_role) && (
                <footer className="mt-3 text-sm font-bold text-primary-700">
                  — {o.source}{o.source_role ? <span className="font-normal opacity-75"> · {o.source_role}</span> : ''}
                </footer>
              )}
            </div>
          </blockquote>
        )
      }

      if (look === 'dark_band') {
        return (
          <blockquote className="bg-primary-950 py-14 text-center text-white">
            <div className={container}>
              <div className="mx-auto max-w-3xl">
                {o.kicker && <div className="mb-3 inline-block rounded-full bg-white/10 px-3.5 py-1 text-xs font-bold tracking-[2px] text-accent-300">{o.kicker}</div>}
                <div aria-hidden className="font-heading text-6xl leading-none text-accent-400">“</div>
                {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-2xl leading-loose text-accent-200 md:text-3xl">{o.arabic_text}</p>}
                <p className="font-heading text-2xl leading-relaxed md:text-[30px]">{o.text}</p>
                {o.source && <footer className="mt-5 text-sm font-bold tracking-wide text-accent-300">{o.source}</footer>}
                {o.source_role && <div className="mt-1 text-xs text-white/70">{o.source_role}</div>}
              </div>
            </div>
          </blockquote>
        )
      }

      if (look === 'image_backdrop') {
        return (
          <blockquote className="relative overflow-hidden bg-primary-950 py-16 text-center text-white md:py-20">
            {o.image_url && <img src={o.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy" />}
            <div className="absolute inset-0 bg-gradient-to-b from-primary-950/75 via-primary-950/65 to-primary-950/85" />
            <div className={`relative z-10 ${container}`}>
              <div className="mx-auto max-w-3xl">
                {o.kicker && <div className="mb-3 inline-block rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold tracking-[2px] text-accent-200 backdrop-blur-sm">{o.kicker}</div>}
                {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-2xl leading-loose text-accent-200 md:text-4xl">{o.arabic_text}</p>}
                <p className="font-heading text-2xl leading-relaxed md:text-[32px]">“{o.text}”</p>
                {o.source && <footer className="mt-5 text-sm font-bold tracking-wide text-accent-300">{o.source}</footer>}
                {o.source_role && <div className="mt-1 text-xs text-white/75">{o.source_role}</div>}
              </div>
            </div>
          </blockquote>
        )
      }

      if (look === 'portrait_quote') {
        return (
          <blockquote className={container}>
            <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-3xl border border-gray-200/80 bg-white p-8 text-center text-gray-900 shadow-sm md:flex-row md:items-start md:p-10 md:text-start">
              {(o.image_url || o.source) && (
                <div className="h-24 w-24 flex-none overflow-hidden rounded-full bg-primary-50 ring-4 ring-primary-50 md:h-28 md:w-28">
                  {o.image_url
                    ? <img src={o.image_url} alt={o.source || ''} className="h-full w-full object-cover object-top" loading="lazy" />
                    : <div className="flex h-full items-center justify-center font-heading text-3xl font-bold text-primary-400">{String(o.source).trim().charAt(0)}</div>}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {o.kicker && <div className="mb-2 text-xs font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                <p className="font-heading text-xl leading-relaxed text-gray-900 md:text-2xl">“{o.text}”</p>
                {(o.source || o.source_role) && (
                  <footer className="mt-4">
                    {o.source && <div className="text-base font-bold text-primary-800">{o.source}</div>}
                    {o.source_role && <div className="text-xs font-medium text-gray-500">{o.source_role}</div>}
                  </footer>
                )}
              </div>
            </div>
          </blockquote>
        )
      }

      if (look === 'verse_arabic') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-3xl rounded-3xl border border-primary-200/80 bg-gradient-to-b from-primary-50/60 to-white p-8 text-center text-gray-900 shadow-sm md:p-12">
              {o.kicker && <div className="mb-4 inline-block rounded-full bg-primary-100 px-3.5 py-1 text-xs font-bold tracking-[2px] text-primary-800">{o.kicker}</div>}
              {o.arabic_text && (
                <p dir="rtl" className="mb-5 font-serif text-2xl leading-[2.1] text-primary-950 md:text-4xl">
                  {o.arabic_text}
                </p>
              )}
              <div className="mx-auto mb-5 h-0.5 w-16 rounded-full bg-primary-300" aria-hidden />
              <p className="font-heading text-xl leading-relaxed text-gray-800 md:text-2xl">“{o.text}”</p>
              {o.source && <footer className="mt-5 text-sm font-bold tracking-wide text-primary-700">{o.source}</footer>}
              {o.source_role && <div className="mt-1 text-xs text-gray-500">{o.source_role}</div>}
            </div>
          </blockquote>
        )
      }

      if (look === 'ornate_frame') {
        return (
          <blockquote className={`${container} text-center`}>
            <div className="mx-auto max-w-3xl rounded-3xl border border-primary-200 bg-primary-50/40 p-3 shadow-sm">
              <div className="rounded-2xl border border-primary-200/90 bg-white px-6 py-10 text-gray-900 md:px-12">
                {o.kicker && <div className="mb-3 text-xs font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                <div aria-hidden className="mb-2 font-heading text-3xl text-primary-400">❖</div>
                {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-2xl leading-loose text-primary-950 md:text-3xl">{o.arabic_text}</p>}
                <p className="font-heading text-2xl leading-relaxed md:text-[28px]">{o.text}</p>
                {o.source && <footer className="mt-5 text-sm font-bold tracking-wide text-primary-700">{o.source}</footer>}
                {o.source_role && <div className="mt-1 text-xs text-gray-500">{o.source_role}</div>}
              </div>
            </div>
          </blockquote>
        )
      }

      return (
        <blockquote className={`${container} text-center`}>
          <div className={`mx-auto max-w-3xl ${look === 'card' ? 'rounded-3xl bg-white p-10 text-gray-900 shadow-sm' : ''}`}>
            {o.kicker && <div className="mb-2 text-xs font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
            <div aria-hidden className="font-heading text-6xl leading-none text-primary-300">“</div>
            {o.arabic_text && <p dir="rtl" className="mb-4 font-serif text-2xl leading-loose text-primary-900 md:text-3xl">{o.arabic_text}</p>}
            <p className="font-heading text-2xl leading-relaxed md:text-[28px]">{o.text}</p>
            {o.source && <footer className="mt-5 text-sm font-bold tracking-wide text-primary-700">{o.source}</footer>}
            {o.source_role && <div className="mt-1 text-xs opacity-70">{o.source_role}</div>}
          </div>
        </blockquote>
      )
    }
    case 'image_gallery': {
      const images = items.filter((i) => i.image_url)
      return (
        <div className={container}>
          <Head o={o} />
          {!images.length ? <Empty editing={editing} text="Galeriye görsel ekleyin" />
            : o.layout === 'carousel' ? (
              <GalleryCarousel
                items={images}
                columns={o.columns ?? 4}
                aspect={o.aspect || '4/3'}
                captionMode={o.caption_mode || 'below'}
                autoplay={o.autoplay !== false}
                lightbox={o.lightbox !== false && !editing}
                label={o.title || 'Galeri'}
                editing={editing}
              />
            ) : (
              <GalleryGrid
                items={images}
                columns={o.columns ?? 4}
                aspect={o.aspect || '1/1'}
                gap={o.gap ?? 12}
                lightbox={o.lightbox !== false && !editing}
                layout={o.layout || 'grid'}
                captionMode={o.caption_mode || 'hover'}
              />
            )}
        </div>
      )
    }
    case 'bank_accounts': {
      const accounts = items.filter((i) => i.iban || i.account_no || i.bank)
      return (
        <div className={container}>
          <Head o={o} />
          <BankAccountsView
            accounts={accounts}
            look={o.look || 'cards'}
            showFilter={Boolean(o.show_currency_filter)}
            locale={ctx.locale}
          />
          {o.note && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{o.note}</p>}
        </div>
      )
    }
    case 'popup': {
      const look = o.look || 'modal'
      const img = o.image_url ? (
        <picture>
          {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
          <img
            src={o.image_url}
            alt={o.title || ''}
            className={look === 'split' ? 'h-full min-h-[220px] w-full object-cover' : look === 'poster' ? 'max-h-[78vh] w-full object-cover' : 'max-h-[42vh] w-full object-cover'}
          />
        </picture>
      ) : null
      const amounts =
        typeof o.quick_amounts === 'string' && o.quick_amounts.trim()
          ? o.quick_amounts.split(',').map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n) && n > 0)
          : [250, 500, 1000]
      const sep = String(o.button_url || '/bagis').includes('?') ? '&' : '?'

      return (
        <Popup
          id={block.id}
          delay={o.delay ?? 3}
          hideDays={o.hide_days ?? 1}
          size={o.size}
          look={look}
          trigger={o.trigger || 'delay'}
          locale={ctx.locale}
          editing={editing}
        >
          {look === 'poster' ? (
            o.button_url ? <Go href={o.button_url} className="block">{img}</Go> : img
          ) : look === 'split' ? (
            <div className="grid md:grid-cols-2">
              {img}
              <div className="flex flex-col justify-center p-7">
                {o.kicker && <div className="mb-2 text-[12px] font-bold uppercase tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-2xl font-bold">{o.title}</h2>}
                {o.text && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">{o.text}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {o.button_label && o.button_url && (
                    <Go href={o.button_url} className="inline-flex rounded-lg bg-primary-600 px-6 py-3 text-sm font-bold text-white hover:bg-primary-700">{o.button_label}</Go>
                  )}
                  {o.button2_label && o.button2_url && (
                    <Go href={o.button2_url} className="inline-flex rounded-lg border border-gray-200 px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50">{o.button2_label}</Go>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {img}
              {(o.title || o.text || o.button_label || look === 'quick_donate' || look === 'compact_amount_popup') && (
                <div className={look === 'slide_in' || look === 'compact_amount_popup' ? 'p-5 text-center' : 'p-7 text-center'}>
                  {(look === 'countdown_offer' || look === 'urgent_ribbon_popup') && (
                    <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-red-700 ring-1 ring-red-200">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {look === 'urgent_ribbon_popup' ? 'Acil Çağrı' : 'Süreli Kampanya'}
                    </div>
                  )}
                  {o.kicker && <div className={`mb-2 text-[12px] font-bold uppercase tracking-[2px] ${look === 'dark_gold_popup' ? 'text-amber-300' : 'text-primary-600'}`}>{o.kicker}</div>}
                  {o.title && <h2 className={`font-heading font-bold ${look === 'slide_in' ? 'text-lg' : 'text-2xl'}`}>{o.title}</h2>}
                  {o.text && <p className={`mt-2.5 whitespace-pre-line leading-relaxed ${look === 'dark_gold_popup' ? 'text-gray-300' : 'text-gray-600'} ${look === 'slide_in' ? 'text-xs' : 'text-sm'}`}>{o.text}</p>}
                  {(look === 'quick_donate' || look === 'compact_amount_popup') && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {amounts.map((amt: number) => (
                        <Go
                          key={amt}
                          href={`${o.button_url || '/bagis'}${sep}tutar=${amt}`}
                          className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-extrabold text-primary-800 transition hover:bg-primary-600 hover:text-white"
                        >
                          {amt.toLocaleString('tr-TR')} ₺
                        </Go>
                      ))}
                    </div>
                  )}
                  <div className={`mt-5 flex flex-wrap items-center gap-2.5 ${look === 'slide_in' ? '' : 'justify-center'}`}>
                    {o.button_label && o.button_url && (
                      <Go href={o.button_url} className={`inline-flex rounded-lg font-bold ${look === 'dark_gold_popup' ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-primary-600 text-white hover:bg-primary-700'} ${look === 'slide_in' ? 'px-4 py-2 text-xs' : 'px-7 py-3 text-sm'}`}>{o.button_label}</Go>
                    )}
                    {o.button2_label && o.button2_url && (
                      <Go href={o.button2_url} className={`inline-flex rounded-lg border font-bold ${look === 'dark_gold_popup' ? 'border-white/25 text-white hover:bg-white/10' : 'border-gray-200 text-gray-700 hover:bg-gray-50'} ${look === 'slide_in' ? 'px-4 py-2 text-xs' : 'px-6 py-3 text-sm'}`}>{o.button2_label}</Go>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </Popup>
      )
    }
    case 'before_after':
      if (!o.before_image && !o.after_image) return <Empty editing={editing} text="Önce ve sonra görsellerini seçin" />
      if (o.look === 'side_by_side' || o.look === 'side_by_side_static' || o.look === 'captioned_split_compare' || o.look === 'dark_frame_compare' || o.look === 'dark_emerald_compare' || o.look === 'split_card_compare' || o.look === 'minimal_badge_compare') {
        const isDark = o.look === 'dark_frame_compare' || o.look === 'dark_emerald_compare'
        return (
          <div className={isDark ? 'bg-slate-950 py-14 text-white' : ''}>
            <div className={`${container} max-w-5xl`}>
              <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
              <div className="grid gap-5 md:grid-cols-2">
                <figure className={`relative overflow-hidden rounded-2xl border ${isDark ? 'border-white/15 bg-black' : 'border-gray-200 bg-gray-100'} shadow-sm`}>
                  {o.before_image && <img src={o.before_image} alt={o.before_label || 'Önce'} className="aspect-[16/10] w-full object-cover" loading="lazy" />}
                  <figcaption className="absolute start-3 top-3 rounded-full bg-gray-950/80 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                    {o.before_label || 'Önce'}
                  </figcaption>
                </figure>
                <figure className={`relative overflow-hidden rounded-2xl border ${isDark ? 'border-amber-400/30 bg-black' : 'border-primary-200 bg-gray-100'} shadow-sm`}>
                  {o.after_image && <img src={o.after_image} alt={o.after_label || 'Sonra'} className="aspect-[16/10] w-full object-cover" loading="lazy" />}
                  <figcaption className="absolute start-3 top-3 rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
                    {o.after_label || 'Sonra'}
                  </figcaption>
                </figure>
              </div>
            </div>
          </div>
        )
      }
      return (
        <div className={`${container} max-w-4xl`}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <BeforeAfterSlider beforeImage={o.before_image} afterImage={o.after_image} beforeLabel={o.before_label} afterLabel={o.after_label} aspect={o.aspect || '16/9'} initial={o.initial_position} look={o.look || 'slider'} />
        </div>
      )
    case 'bento_grid': {
      const boxes = items.filter((i) => i.title || i.text || i.image_url)
      if (!boxes.length) return <Empty editing={editing} text="Bento kutuları ekleyin" />
      const look = o.look || 'mosaic'
      const spans: Record<string, string> = {
        normal: '',
        wide: 'md:col-span-2',
        tall: 'md:row-span-2',
        large: 'md:col-span-2 md:row-span-2',
      }
      const tones: Record<string, string> = {
        light: 'border border-gray-200 bg-white text-gray-900',
        soft: 'border border-primary-100 bg-primary-50 text-gray-900',
        brand: 'bg-primary-700 text-white',
        dark: 'bg-gray-950 text-white',
      }
      return (
        <div className={container}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <div className={`grid auto-rows-[minmax(190px,auto)] gap-4 ${look === 'magazine_asymmetric' ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
            {boxes.map((item, i) => {
              const spanCls = look === 'magazine_asymmetric' && i === 0
                ? 'md:col-span-2 md:row-span-2'
                : (spans[item.span] || '')
              const cardCls = look === 'minimal_border' || look === 'minimal_outline_bento'
                ? 'border border-gray-200 bg-white text-gray-900 hover:border-primary-400'
                : look === 'dark_neon_bento' || look === 'dark_emerald_bento'
                  ? 'border border-emerald-400/30 bg-slate-950 text-white shadow-xl'
                  : look === 'high_contrast_tiles'
                    ? 'border-2 border-gray-900 bg-white text-gray-950 shadow-md'
                    : look === 'soft_pastel_bento'
                      ? 'border border-primary-100 bg-primary-50/70 text-primary-950'
                      : `${tones[item.tone] || tones.light} shadow-sm hover:shadow-xl`
              return (
                <Go key={i} href={item.url} className={`group relative flex flex-col justify-end overflow-hidden rounded-3xl p-6 transition hover:-translate-y-0.5 ${spanCls} ${cardCls}`}>
                  {item.image_url && (
                    <>
                      <img src={item.image_url} alt={item.title || ''} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    </>
                  )}
                  <div className={`relative ${item.image_url ? 'text-white' : ''} ${look === 'glass_overlay' ? 'rounded-2xl border border-white/25 bg-white/15 p-4 backdrop-blur-md' : ''}`}>
                    {item.badge && <span className="mb-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">{item.badge}</span>}
                    {item.title && <h3 className="font-heading text-xl font-bold leading-snug">{item.title}</h3>}
                    {item.text && <p className="mt-1.5 text-sm opacity-85">{item.text}</p>}
                  </div>
                </Go>
              )
            })}
          </div>
        </div>
      )
    }
    case 'video_gallery': {
      const vids = items.filter((i) => i.title || i.video_url)
      if (!vids.length) return <Empty editing={editing} text="Video ekleyin" />
      if (o.layout === 'dark_cinema' || o.layout === 'dark_cinema_grid') {
        return (
          <div className="bg-gray-950 py-14 text-white">
            <div className={container}>
              <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
              <VideoGalleryGrid items={vids} columns={o.columns ?? 3} />
            </div>
          </div>
        )
      }
      if (o.layout === 'reels_vertical' || o.layout === 'vertical_shorts_strip') {
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {vids.map((v, i) => (
                <a key={i} href={v.video_url || '#'} target="_blank" rel="noopener noreferrer" className="group relative aspect-[9/16] overflow-hidden rounded-2xl bg-gray-900 shadow-md">
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.title || ''} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/25 text-lg text-white backdrop-blur-md transition group-hover:scale-110">▶</span>
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    {v.duration && <span className="mb-1 inline-block rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold">{v.duration}</span>}
                    {v.title && <div className="font-heading text-sm font-bold leading-snug">{v.title}</div>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )
      }
      if ((o.layout === 'featured_playlist' || o.layout === 'featured_plus_thumbs') && vids.length > 0) {
        const [first, ...rest] = vids
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <VideoGalleryGrid items={[first]} columns={1} />
              </div>
              {rest.length > 0 && (
                <div className="space-y-3 lg:col-span-4">
                  {rest.map((v, i) => (
                    <a key={i} href={v.video_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-primary-300">
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-900">
                        {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.title || ''} className="h-full w-full object-cover" loading="lazy" />}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white">▶</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {v.title && <div className="line-clamp-2 font-heading text-sm font-bold text-gray-900">{v.title}</div>}
                        {v.duration && <div className="mt-1 text-xs text-gray-500">{v.duration}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }
      if (o.layout === 'dark_gold_cinema') {
        return (
          <div className="border-y border-amber-400/20 bg-slate-950 py-14 text-white">
            <div className={container}>
              <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
              <VideoGalleryGrid items={vids} columns={o.columns ?? 3} />
            </div>
          </div>
        )
      }
      if (o.layout === 'split_featured_video' && vids.length > 0) {
        const [first, ...rest] = vids
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <VideoGalleryGrid items={[first]} columns={1} />
              </div>
              {rest.length > 0 && (
                <div className="space-y-3 lg:col-span-5">
                  {rest.map((v, i) => (
                    <a key={i} href={v.video_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-primary-300">
                      <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-900">
                        {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.title || ''} className="h-full w-full object-cover" loading="lazy" />}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white">▶</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {v.title && <div className="line-clamp-2 font-heading text-sm font-bold text-gray-900">{v.title}</div>}
                        {v.duration && <div className="mt-1 text-xs text-gray-500">{v.duration}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }
      if (o.layout === 'compact_card_videos') {
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vids.map((v, i) => (
                <a key={i} href={v.video_url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:border-primary-300">
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-900">
                    {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.title || ''} className="h-full w-full object-cover" loading="lazy" />}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-xs text-white">▶</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {v.title && <div className="line-clamp-2 font-heading text-sm font-bold text-gray-900">{v.title}</div>}
                    {v.duration && <div className="mt-1 text-xs font-medium text-gray-500">{v.duration}</div>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <VideoGalleryGrid items={vids} columns={o.columns ?? 3} />
        </div>
      )
    }
    case 'region_cards': {
      const regions = items.filter((i) => i.region)
      if (!regions.length) return <Empty editing={editing} text="Bölge / ülke ekleyin" />
      if (o.look === 'pills' || o.look === 'flag_stat_pills' || o.look === 'compact_flag_rows') {
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className="flex flex-wrap justify-center gap-3">
              {regions.map((item, i) => (
                <Go key={i} href={item.url} className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-900 shadow-sm hover:border-primary-500">
                  {item.flag && <span className="text-lg">{item.flag}</span>}
                  <span>{item.region}</span>
                  {item.count && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700">{item.count} {item.unit || ''}</span>}
                </Go>
              ))}
            </div>
          </div>
        )
      }
      if (o.look === 'world_metrics' || o.look === 'dark_map_cards' || o.look === 'bordered_stat_regions') {
        const isDarkReg = o.look === 'dark_map_cards'
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className={`grid gap-5 sm:grid-cols-2 ${COLS[o.columns ?? 4] || COLS[4]} ${isDarkReg ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {regions.map((item, i) => (
                <Go key={i} href={item.url} className={`rounded-3xl p-6 text-center transition hover:-translate-y-0.5 ${isDarkReg ? 'border border-white/10 bg-white/5 text-white' : 'border border-primary-100 bg-gradient-to-br from-white to-primary-50/40 shadow-sm hover:shadow-md'}`}>
                  {item.flag && <div className="mb-2 text-3xl">{item.flag}</div>}
                  {item.count && <div className={`font-heading text-4xl font-black ${isDarkReg ? 'text-accent-300' : 'text-primary-700'}`}>{item.count}</div>}
                  {item.unit && <div className={`text-xs font-bold uppercase tracking-wider ${isDarkReg ? 'text-gray-300' : 'text-primary-600'}`}>{item.unit}</div>}
                  <div className={`mt-2 font-heading text-base font-bold ${isDarkReg ? 'text-white' : 'text-gray-900'}`}>{item.region}</div>
                  {item.summary && <p className={`mt-1 text-xs ${isDarkReg ? 'text-gray-300' : 'text-gray-500'}`}>{item.summary}</p>}
                </Go>
              ))}
            </div>
          </div>
        )
      }
      if (o.look === 'horizontal_strip') {
        return (
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {regions.map((item, i) => (
                <Go key={i} href={item.url} className="w-64 flex-none snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
                  {item.image_url && <img src={item.image_url} alt={item.region} className="aspect-[16/10] w-full object-cover" loading="lazy" />}
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      {item.flag && <span className="text-lg">{item.flag}</span>}
                      <h3 className="font-heading text-base font-bold text-gray-900">{item.region}</h3>
                    </div>
                    {(item.count || item.unit) && <div className="mt-1.5 font-heading text-xl font-extrabold text-primary-700">{item.count} <span className="text-xs font-medium text-gray-500">{item.unit}</span></div>}
                  </div>
                </Go>
              ))}
            </div>
          </div>
        )
      }
      const isDarkAtlas = o.look === 'dark_atlas'
      return (
        <div className={isDarkAtlas ? 'bg-gray-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
            <div className={`grid gap-5 sm:grid-cols-2 ${COLS[o.columns ?? 4] || COLS[4]}`}>
              {regions.map((item, i) => (
                <Go key={i} href={item.url} className={`group overflow-hidden rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lg ${isDarkAtlas ? 'border border-white/10 bg-white/5 text-white' : 'border border-gray-200 bg-white text-gray-900 shadow-sm'}`}>
                  {item.image_url && (
                    <div className="aspect-[16/10] overflow-hidden bg-gray-900">
                      <img src={item.image_url} alt={item.region} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      {item.flag && <span className="text-xl">{item.flag}</span>}
                      <h3 className="font-heading text-lg font-bold">{item.region}</h3>
                    </div>
                    {(item.count || item.unit) && (
                      <div className={`mt-2 font-heading text-2xl font-extrabold ${isDarkAtlas ? 'text-accent-400' : 'text-primary-700'}`}>{item.count} <span className={`text-xs font-semibold ${isDarkAtlas ? 'text-gray-400' : 'text-gray-500'}`}>{item.unit}</span></div>
                    )}
                    {item.summary && <p className={`mt-1.5 text-xs leading-relaxed ${isDarkAtlas ? 'text-gray-300' : 'text-gray-600'}`}>{item.summary}</p>}
                  </div>
                </Go>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case 'sticky_story': {
      const steps: Record<string, any>[] = Array.isArray(o.steps) ? o.steps.filter((s: any) => s.title || s.text) : []
      if (!steps.length && !o.image_url) return <Empty editing={editing} text="Görsel ve hikaye adımları ekleyin" />
      const right = o.image_side === 'right'
      const isDarkNarrative = o.look === 'dark_narrative' || o.look === 'dark_editorial_sticky'
      const isChapters = o.look === 'card_chapters' || o.look === 'bordered_chapter_cards' || o.look === 'split_gold_story'
      return (
        <div className={isDarkNarrative ? 'bg-gray-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className="grid items-start gap-10 lg:grid-cols-12">
              {o.image_url && (
                <div className={`lg:sticky lg:top-24 lg:col-span-5 ${right ? 'lg:order-2' : ''}`}>
                  <img src={o.image_url} alt={o.title || ''} className="w-full rounded-3xl object-cover shadow-xl" loading="lazy" />
                </div>
              )}
              <div className={`${o.image_url ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-5`}>
                {steps.map((s, i) => (
                  <div key={i} className={`rounded-2xl p-6 ${isDarkNarrative ? 'border border-white/10 bg-white/5 text-white' : 'border border-gray-200 bg-white text-gray-900 shadow-sm'}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {isChapters && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-extrabold text-white">{String(i + 1).padStart(2, '0')}</span>}
                        {s.badge && <span className={`rounded-full px-3 py-1 text-xs font-bold ${isDarkNarrative ? 'bg-white/10 text-primary-300' : 'bg-primary-50 text-primary-700'}`}>{s.badge}</span>}
                      </div>
                      {s.metric && <span className={`font-heading text-sm font-extrabold ${isDarkNarrative ? 'text-accent-400' : 'text-accent-600'}`}>{s.metric}</span>}
                    </div>
                    {s.title && <h3 className="font-heading text-xl font-bold">{s.title}</h3>}
                    {s.text && <p className={`mt-2 text-sm leading-relaxed ${isDarkNarrative ? 'text-gray-300' : 'text-gray-600'}`}>{s.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }
    case 'map': {
      const address = String(o.address || '').trim()
      const embedUrl = String(o.embed_url || '').trim()
      const height = Math.max(200, Math.min(800, Number(o.height) || 380))
      const zoom = Math.max(1, Math.min(20, Number(o.zoom) || 15))
      const src = embedUrl || (address ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=${zoom}&output=embed` : '')
      if (!src) return <Empty editing={editing} text="Harita: adres veya yerleştirme URL’si girin." />
      const mapsLink = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : src
      const mapLook = o.look || 'standard'
      if (mapLook === 'dark_framed_map') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="overflow-hidden rounded-3xl bg-gray-950 p-4 text-white shadow-2xl ring-1 ring-white/10 sm:p-6">
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <iframe src={src} title={o.title || address || 'Harita'} style={{ height }} className="w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
              {(address || o.show_directions !== false) && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
                  {address && <p className="text-sm font-medium text-gray-200">📍 {address}</p>}
                  {o.show_directions !== false && (
                    <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-xs font-extrabold text-gray-950 hover:bg-accent-400">
                      Yol tarifi al ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      }
      if (mapLook === 'card_with_hours' || mapLook === 'compact_branch_map') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="grid overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-md md:grid-cols-[1fr_1.4fr]">
              <div className="flex flex-col justify-between gap-4 p-6 sm:p-8">
                <div>
                  <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-extrabold text-primary-700">Konum & Ziyaret</span>
                  {address && <p className="mt-3 text-base font-bold text-gray-900">📍 {address}</p>}
                  {o.hours && <p className="mt-2 text-sm text-gray-600">🕒 {o.hours}</p>}
                  {o.phone && <p className="mt-1 text-sm font-semibold text-primary-700">📞 {o.phone}</p>}
                </div>
                {o.show_directions !== false && (
                  <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-primary-700">
                    Yol tarifi al ↗
                  </a>
                )}
              </div>
              <div className="min-h-[260px] bg-gray-100">
                <iframe src={src} title={o.title || address || 'Harita'} style={{ height: mapLook === 'compact_branch_map' ? Math.min(height, 300) : height }} className="h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
            </div>
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={o} />
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
            <iframe
              src={src}
              title={o.title || address || 'Harita'}
              style={{ height }}
              className="w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          {(address || o.show_directions !== false) && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {address && <p className="text-sm font-medium text-gray-700">📍 {address}</p>}
              {o.show_directions !== false && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
                >
                  Yol tarifi al ↗
                </a>
              )}
            </div>
          )}
        </div>
      )
    }
    case 'downloads': {
      const items = (o.items as { title?: string; description?: string; file_url?: string; file_type?: string; file_size?: string }[] | undefined) || []
      if (!items.length) return <Empty editing={editing} text="Dosya / Rapor İndirme: en az bir belge ekleyin." />
      const cols = COLS[Math.max(1, Math.min(3, Number(o.columns) || 2))] || 'lg:grid-cols-2'
      const look = o.look || 'cards'
      if (look === 'emerald_report_cards') {
        return (
          <div className="bg-emerald-950 py-14 text-white">
            <div className={container}>
              <Head o={o} />
              <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
                {items.map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-900/50 p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {item.file_type && <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-300">{item.file_type}</span>}
                        {item.file_size && <span className="text-xs text-emerald-200/70">{item.file_size}</span>}
                      </div>
                      {item.title && <h3 className="mt-2 font-heading text-base font-bold">{item.title}</h3>}
                      {item.description && <p className="mt-1 text-sm text-emerald-100/80">{item.description}</p>}
                    </div>
                    {item.file_url && (
                      <a href={item.file_url} target="_blank" rel="noopener noreferrer" download className="shrink-0 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-300">İndir ↓</a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      }
      if (look === 'minimal_file_strip') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="mx-auto max-w-4xl divide-y divide-gray-200 border-y border-gray-200">
              {items.map((item, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <span className="font-heading text-sm font-bold text-gray-900">{item.title}</span>
                    {item.file_size && <span className="ms-2 text-xs text-gray-400">({item.file_size})</span>}
                  </div>
                  {item.file_url && (
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer" download className="text-xs font-extrabold text-primary-700 hover:underline">İndir ↓</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'compact_pills' || look === 'featured_pdf_banner' || look === 'pill_badge_downloads') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="flex flex-wrap justify-center gap-3">
              {items.map((item, i) => (
                <a key={i} href={item.file_url || '#'} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-900 shadow-sm transition hover:border-primary-400 hover:text-primary-700">
                  {item.file_type && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-extrabold text-primary-700">{item.file_type}</span>}
                  <span>{item.title}</span>
                  <span className="text-primary-600">↓</span>
                </a>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'table_list' || look === 'icon_compact_rows' || look === 'compact_file_rows' || look === 'bordered_pdf_grid' || look === 'dark_vault_downloads' || look === 'dark_report_cards') {
        const isDarkDl = look === 'dark_vault_downloads' || look === 'dark_report_cards'
        return (
          <div className={container}>
            <Head o={o} />
            <div className={`divide-y overflow-hidden rounded-2xl shadow-sm ${isDarkDl ? 'divide-white/10 border border-white/10 bg-slate-950 text-white' : 'divide-gray-200 border border-gray-200 bg-white'}`}>
              {items.map((item, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {item.file_type && <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${isDarkDl ? 'bg-amber-500/20 text-amber-300' : 'bg-primary-50 text-primary-700'}`}>{item.file_type}</span>}
                      <span className={`font-heading text-base font-bold ${isDarkDl ? 'text-white' : 'text-gray-900'}`}>{item.title}</span>
                      {item.file_size && <span className="text-xs opacity-60">({item.file_size})</span>}
                    </div>
                    {item.description && <p className={`mt-0.5 text-xs ${isDarkDl ? 'text-gray-300' : 'text-gray-600'}`}>{item.description}</p>}
                  </div>
                  {item.file_url && (
                    <a href={item.file_url} target="_blank" rel="noopener noreferrer" download className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">İndir ↓</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
            {items.map((item, i) => (
              <div key={i} className={`flex items-start justify-between gap-4 rounded-2xl p-5 shadow-sm ${look === 'shelf' ? 'border-b-4 border-b-primary-600 border border-gray-200 bg-gradient-to-b from-white to-gray-50' : 'border border-gray-200 bg-white'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.file_type && (
                      <span className="rounded bg-primary-50 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">
                        {item.file_type}
                      </span>
                    )}
                    {item.file_size && <span className="text-xs text-gray-400">{item.file_size}</span>}
                  </div>
                  {item.title && <h3 className="mt-2 font-heading text-base font-bold text-gray-900">{item.title}</h3>}
                  {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
                </div>
                {item.file_url && (
                  <a
                    href={item.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="shrink-0 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2 text-xs font-bold text-primary-700 transition hover:bg-primary-600 hover:text-white"
                  >
                    İndir ↓
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'newsletter': {
      const look = o.look || 'centered_card'
      const band = String(look === 'floating_dark' || look === 'dark_gold_subscribe' || look === 'dark_emerald_subscribe' || look === 'emerald_gold_newsletter' ? 'dark' : (o.band || 'soft'))
      const dark = band === 'brand' || band === 'dark'
      if (look === 'minimal_inline_subscribe') {
        return (
          <div className={container}>
            <div className="flex flex-wrap items-center justify-between gap-6 border-y border-gray-200 py-8">
              <div className="max-w-xl">
                {o.title && <h2 className="font-heading text-xl font-bold text-gray-900 md:text-2xl">{o.title}</h2>}
                {o.text && <p className="mt-1 text-sm text-gray-600">{o.text}</p>}
              </div>
              <div className="w-full max-w-md">
                <NewsletterForm placeholder={o.placeholder} buttonLabel={o.button_label} successText={o.success_text} privacyNote={o.privacy_note} dark={false} />
              </div>
            </div>
          </div>
        )
      }
      if (look === 'inline_bar' || look === 'split_with_benefits' || look === 'split_benefit_subscribe' || look === 'floating_pill_form' || look === 'floating_pill_subscribe' || look === 'split_gift_guide' || look === 'bordered_split_newsletter' || look === 'emerald_gold_newsletter') {
        const boxStyle = look === 'emerald_gold_newsletter'
          ? 'border border-amber-400/30 bg-gradient-to-br from-emerald-950 to-slate-950 text-white'
          : look === 'bordered_split_newsletter'
            ? 'border-2 border-primary-200 bg-white text-gray-900'
            : BAND[band] || BAND.soft
        return (
          <div className={container}>
            <div className={`grid items-center gap-6 rounded-3xl px-6 py-10 md:grid-cols-12 md:px-10 ${boxStyle}`}>
              <div className="md:col-span-6">
                {o.kicker && <div className={`mb-1.5 text-xs font-bold uppercase tracking-[2px] ${dark ? 'text-accent-300' : 'text-primary-600'}`}>{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-2xl font-bold md:text-3xl">{o.title}</h2>}
                {o.text && <p className={`mt-2 text-sm leading-relaxed ${dark ? 'text-white/80' : 'text-gray-600'}`}>{o.text}</p>}
              </div>
              <div className="md:col-span-6">
                <NewsletterForm placeholder={o.placeholder} buttonLabel={o.button_label} successText={o.success_text} privacyNote={o.privacy_note} dark={dark} />
              </div>
            </div>
          </div>
        )
      }
      return (
        <div className={container}>
          <div className={`rounded-3xl px-6 py-12 md:px-12 ${BAND[band] || BAND.soft}`}>
            <Head o={o} />
            <NewsletterForm
              placeholder={o.placeholder}
              buttonLabel={o.button_label}
              successText={o.success_text}
              privacyNote={o.privacy_note}
              dark={dark}
            />
          </div>
        </div>
      )
    }
    case 'icon_list': {
      const items = (o.items as { icon?: string; title?: string; text?: string; url?: string }[] | undefined) || []
      if (!items.length) return <Empty editing={editing} text="İkonlu Liste: en az bir madde ekleyin." />
      const cols = COLS[Math.max(1, Math.min(3, Number(o.columns) || 2))] || 'lg:grid-cols-2'
      const look = o.look || 'clean_list'
      if (look === 'emerald_check_cards') {
        return (
          <div className="bg-emerald-950 py-14 text-white">
            <div className={container}>
              <Head o={o} />
              <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
                {items.map((item, i) => (
                  <Go key={i} href={item.url} className="flex items-start gap-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-900/50 p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-base font-bold text-amber-300">{item.icon || '✓'}</span>
                    <div className="min-w-0 flex-1">
                      {item.title && <h3 className="font-heading text-base font-bold">{item.title}</h3>}
                      {item.text && <p className="mt-1 text-sm text-emerald-100/80">{item.text}</p>}
                    </div>
                  </Go>
                ))}
              </div>
            </div>
          </div>
        )
      }
      if (look === 'minimal_two_col_checks') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className={`grid gap-x-8 gap-y-4 sm:grid-cols-2 ${cols}`}>
              {items.map((item, i) => (
                <Go key={i} href={item.url} className="flex items-start gap-3 border-b border-gray-200 pb-4">
                  <span className="mt-0.5 text-sm font-extrabold text-primary-600">{item.icon || '✓'}</span>
                  <div className="min-w-0 flex-1">
                    {item.title && <h3 className="font-heading text-sm font-bold text-gray-900">{item.title}</h3>}
                    {item.text && <p className="mt-0.5 text-xs text-gray-600">{item.text}</p>}
                  </div>
                </Go>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'pill_number_list') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
              {items.map((item, i) => (
                <Go key={i} href={item.url} className="flex items-center gap-3.5 rounded-full border border-gray-200 bg-white px-5 py-3 shadow-xs">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-extrabold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    {item.title && <div className="truncate font-heading text-sm font-bold text-gray-900">{item.title}</div>}
                    {item.text && <div className="truncate text-xs text-gray-500">{item.text}</div>}
                  </div>
                </Go>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'check_badges' || look === 'two_col_check_pills' || look === 'dark_badge_list' || look === 'dark_badge_checklist' || look === 'compact_pill_tags') {
        const isDarkList = look === 'dark_badge_list' || look === 'dark_badge_checklist'
        return (
          <div className={container}>
            <Head o={o} />
            <div className="flex flex-wrap justify-center gap-3">
              {items.map((item, i) => (
                <Go key={i} href={item.url} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${isDarkList ? 'border-white/15 bg-slate-950 text-white' : 'border-primary-200 bg-primary-50/70 text-primary-900'}`}>
                  <span className={isDarkList ? 'text-accent-300' : 'text-primary-600'}>{item.icon || '✓'}</span>
                  <span>{item.title}</span>
                </Go>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'timeline_mini' || look === 'bordered_step_list' || look === 'bordered_two_col_list') {
        return (
          <div className={container}>
            <Head o={o} />
            <ol className="mx-auto max-w-2xl space-y-4 border-s-2 border-primary-200 ps-6">
              {items.map((item, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">{item.icon || i + 1}</span>
                  {item.title && <h3 className="font-heading text-base font-bold text-gray-900">{item.title}</h3>}
                  {item.text && <p className="mt-0.5 text-sm text-gray-600">{item.text}</p>}
                </li>
              ))}
            </ol>
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
            {items.map((item, i) => (
              <Go key={i} href={item.url} className={`flex items-start gap-3.5 transition ${look === 'clean_list' ? 'p-2' : 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:border-primary-300'}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-lg text-primary-700">
                  {item.icon || '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  {item.title && <h3 className="font-heading text-base font-bold text-gray-900">{item.title}</h3>}
                  {item.text && <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'live_donations': {
      const donations = items.filter((i) => i.donor || i.amount)
      if (!donations.length) return <Empty editing={editing} text="Canlı bağış kaydı ekleyin" />
      const look = o.look || 'feed_cards'
      if (look === 'emerald_live_ticker') {
        return (
          <div className="overflow-hidden border-y border-amber-400/30 bg-emerald-950 py-3.5 text-sm text-white">
            <div className="bmq items-center gap-8" style={{ ['--bmq' as string]: `${Math.max(donations.length * 6, 20)}s` }}>
              {[...donations, ...donations].map((d, i) => (
                <span key={i} className="inline-flex flex-none items-center gap-2 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <strong>{d.donor}</strong> · <span className="font-extrabold text-amber-300">{d.amount}</span> {d.campaign ? `(${d.campaign})` : ''}
                </span>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'minimal_donor_cards') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {donations.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-xs">
                  <div className="min-w-0">
                    <div className="truncate font-heading text-sm font-bold text-gray-900">{d.donor}</div>
                    {d.campaign && <div className="truncate text-[11px] text-gray-500">{d.campaign}</div>}
                  </div>
                  {d.amount && <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-extrabold text-primary-700">{d.amount}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'urgent_live_feed') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="mx-auto max-w-3xl divide-y divide-red-100 rounded-3xl border-2 border-red-200 bg-white shadow-sm">
              {donations.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                    <div>
                      <div className="font-heading text-sm font-bold text-gray-900">{d.donor}</div>
                      {d.campaign && <div className="text-xs text-gray-500">{d.campaign}</div>}
                    </div>
                  </div>
                  {d.amount && <span className="rounded-lg bg-red-50 px-3 py-1 font-heading text-sm font-extrabold text-red-700">{d.amount}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'ticker_strip') {
        return (
          <div className="overflow-hidden border-y border-emerald-200 bg-emerald-50/80 py-3 text-sm text-emerald-950">
            <div className="bmq items-center gap-8" style={{ ['--bmq' as string]: `${Math.max(donations.length * 6, 20)}s` }}>
              {[...donations, ...donations].map((d, i) => (
                <span key={i} className="inline-flex flex-none items-center gap-2 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <strong>{d.donor}</strong> · <span className="text-emerald-700 font-extrabold">{d.amount}</span> {d.campaign ? `(${d.campaign})` : ''}
                </span>
              ))}
            </div>
          </div>
        )
      }
      if (look === 'donor_wall') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {donations.map((d, i) => (
                <div key={i} className="rounded-2xl border border-primary-100 bg-white p-5 text-center shadow-sm">
                  <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 font-heading text-base font-extrabold text-primary-700">
                    {String(d.donor || '♥').charAt(0)}
                  </div>
                  <div className="font-heading text-sm font-bold text-gray-900">{d.donor}</div>
                  {d.amount && <div className="mt-1 font-heading text-lg font-extrabold text-primary-700">{d.amount}</div>}
                  {d.campaign && <div className="mt-0.5 text-xs text-gray-500">{d.campaign}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={o} />
          <div className="mx-auto max-w-3xl divide-y divide-gray-100 rounded-3xl border border-gray-200 bg-white shadow-sm">
            {donations.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">♥</span>
                  <div>
                    <div className="font-heading text-sm font-bold text-gray-900">{d.donor} {d.city ? <span className="font-normal text-gray-400">· {d.city}</span> : null}</div>
                    {d.campaign && <div className="text-xs text-gray-500">{d.campaign}</div>}
                  </div>
                </div>
                <div className="text-end">
                  {d.amount && <div className="font-heading text-base font-extrabold text-primary-700">{d.amount}</div>}
                  {d.time_ago && <div className="text-[11px] text-gray-400">{d.time_ago}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'fidyah_calculator': {
      const look = o.look || 'card_widget'
      const isDark = look === 'dark_ramadan'
      return (
        <div className={isDark ? 'bg-primary-950 py-14 text-white' : ''}>
          <div className={container}>
            {look === 'split_explainer' ? (
              <div className="grid items-center gap-8 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <Head o={o} center={false} />
                </div>
                <div className="lg:col-span-7">
                  <FidyahCalculator unitAmount={o.unit_amount} defaultPeople={o.default_people} defaultDays={o.default_days} buttonLabel={o.button_label} buttonUrl={o.button_url} />
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl">
                <Head o={o} />
                <FidyahCalculator unitAmount={o.unit_amount} defaultPeople={o.default_people} defaultDays={o.default_days} buttonLabel={o.button_label} buttonUrl={o.button_url} dark={isDark} />
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'transparency_bar': {
      const look = o.look || 'official_seals'
      const seals = items.filter((i) => i.title)
      if (look === 'emerald_audit_bar') {
        const fieldPct = Math.min(100, Math.max(0, Number(o.field_pct) || 92))
        return (
          <div className="bg-emerald-950 py-10 text-white">
            <div className={container}>
              <Head o={o} />
              <div className="mx-auto max-w-3xl rounded-3xl border border-amber-400/30 bg-emerald-900/60 p-7">
                <div className="mb-3 flex justify-between text-sm font-bold">
                  <span className="text-amber-300">%{fieldPct} Doğrudan Saha Yardımları</span>
                  <span className="text-emerald-200/80">%{Math.max(0, 100 - fieldPct)} Operasyon</span>
                </div>
                <div className="flex h-3.5 overflow-hidden rounded-full bg-black/30">
                  <div className="bg-amber-400" style={{ width: `${fieldPct}%` }} />
                </div>
                {o.permit_no && <div className="mt-4 text-xs text-emerald-100/80">İzin / DERBİS: <strong className="text-white">{o.permit_no}</strong></div>}
              </div>
            </div>
          </div>
        )
      }
      if (look === 'minimal_percent_bar') {
        const fieldPct = Math.min(100, Math.max(0, Number(o.field_pct) || 92))
        return (
          <div className={container}>
            <Head o={o} />
            <div className="mx-auto max-w-3xl border-y border-gray-200 py-6">
              <div className="mb-2 flex justify-between text-xs font-extrabold uppercase tracking-wider text-gray-700">
                <span>Saha Yardım Oranı: %{fieldPct}</span>
                {o.permit_no && <span>DERBİS: {o.permit_no}</span>}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary-600" style={{ width: `${fieldPct}%` }} />
              </div>
            </div>
          </div>
        )
      }
      if (look === 'ledger_summary') {
        const fieldPct = Math.min(100, Math.max(0, Number(o.field_pct) || 92))
        const opsPct = Math.max(0, 100 - fieldPct)
        return (
          <div className={container}>
            <Head o={o} />
            <div className="mx-auto max-w-3xl rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="mb-3 flex justify-between text-sm font-bold">
                <span className="text-primary-700">%{fieldPct} Doğrudan Saha Yardımları</span>
                <span className="text-gray-500">%{opsPct} Operasyon & Lojistik</span>
              </div>
              <div className="flex h-4 overflow-hidden rounded-full bg-gray-100">
                <div className="bg-primary-600" style={{ width: `${fieldPct}%` }} />
                <div className="bg-gray-300" style={{ width: `${opsPct}%` }} />
              </div>
              {o.permit_no && <div className="mt-4 text-xs font-semibold text-gray-500">Resmi İzin / DERBİS No: <strong className="text-gray-900">{o.permit_no}</strong></div>}
            </div>
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${look === 'verified_banner' ? 'rounded-3xl border-2 border-emerald-200 bg-emerald-50/40 p-6' : look === 'bordered_seal_strip' ? 'rounded-3xl border-2 border-primary-200 bg-white p-6 shadow-sm' : ''}`}>
            {seals.map((s, i) => (
              <Go key={i} href={s.url} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-700">{s.icon || '✓'}</span>
                <div className="min-w-0">
                  <div className="truncate font-heading text-sm font-bold text-gray-900">{s.title}</div>
                  {s.code && <div className="text-xs font-mono text-gray-500">{s.code}</div>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'audio_player': {
      const tracks = items.filter((i) => i.title)
      if (!tracks.length) return <Empty editing={editing} text="Ses kaydı ekleyin" />
      const isDark = o.look === 'dark_studio'
      return (
        <div className={isDark ? 'bg-gray-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className="mx-auto max-w-3xl space-y-4">
              {tracks.map((tr, i) => (
                <div key={i} className={`flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center ${isDark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  {tr.cover_url && <img src={tr.cover_url} alt={tr.title || ''} className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-heading text-base font-bold">{tr.title}</div>
                    {(tr.speaker || tr.duration) && <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{[tr.speaker, tr.duration].filter(Boolean).join(' · ')}</div>}
                    {tr.audio_url && <audio controls className="mt-2.5 h-9 w-full" src={tr.audio_url} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case 'volunteer_cta': {
      const roles = items.filter((i) => i.title)
      if (o.look === 'emerald_volunteer_banner') {
        return (
          <div className="bg-emerald-950 py-14 text-white">
            <div className={container}>
              <div className="grid items-center gap-8 rounded-3xl border border-amber-400/30 bg-emerald-900/50 p-8 md:grid-cols-12">
                <div className="md:col-span-8">
                  <Head o={o} center={false} />
                  {roles.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {roles.map((r, i) => (
                        <span key={i} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-amber-200">{r.icon || '🤝'} {r.title}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="md:col-span-4 md:text-end">
                  {o.button_label && o.button_url && <Go href={o.button_url} className="inline-flex rounded-xl bg-amber-400 px-7 py-3.5 text-sm font-extrabold text-slate-950 hover:bg-amber-300">{o.button_label} →</Go>}
                </div>
              </div>
            </div>
          </div>
        )
      }
      if (o.look === 'minimal_split_volunteer') {
        return (
          <div className={container}>
            <div className="flex flex-wrap items-center justify-between gap-6 border-y border-gray-200 py-8">
              <div className="max-w-2xl">
                {o.title && <h2 className="font-heading text-2xl font-bold text-gray-900">{o.title}</h2>}
                {o.subtitle && <p className="mt-1 text-sm text-gray-600">{o.subtitle}</p>}
              </div>
              {o.button_label && o.button_url && <Go href={o.button_url} className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-extrabold text-white hover:bg-primary-700">{o.button_label} →</Go>}
            </div>
          </div>
        )
      }
      if (o.look === 'pill_role_cta') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="flex flex-wrap justify-center gap-3">
              {roles.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50/70 px-4 py-2 text-sm font-bold text-primary-900">
                  <span>{r.icon || '🤝'}</span>
                  <span>{r.title}</span>
                </span>
              ))}
            </div>
            {o.button_label && o.button_url && (
              <div className="mt-7 text-center">
                <Go href={o.button_url} className="inline-flex rounded-full bg-primary-600 px-7 py-3 text-sm font-extrabold text-white hover:bg-primary-700">{o.button_label} →</Go>
              </div>
            )}
          </div>
        )
      }
      return (
        <div className={container}>
          <Head o={o} />
          {o.look === 'split_photo' && (
            <div className="grid items-center gap-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:grid-cols-12 md:p-10">
              {o.image_url && <div className="md:col-span-5"><img src={o.image_url} alt={o.title || ''} className="aspect-[4/3] w-full rounded-2xl object-cover" loading="lazy" /></div>}
              <div className={o.image_url ? 'md:col-span-7' : 'md:col-span-12'}>
                {o.button_label && o.button_url && <Go href={o.button_url} className="inline-flex rounded-xl bg-primary-600 px-7 py-3.5 text-sm font-extrabold text-white shadow hover:bg-primary-700">{o.button_label} →</Go>}
              </div>
            </div>
          )}
          {roles.length > 0 && o.look !== 'split_photo' && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((r, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-3 text-2xl">{r.icon || '🤝'}</div>
                  <h3 className="font-heading text-lg font-bold text-gray-900">{r.title}</h3>
                  {r.text && <p className="mt-1.5 text-sm text-gray-600">{r.text}</p>}
                </div>
              ))}
            </div>
          )}
          {o.look !== 'split_photo' && o.button_label && o.button_url && (
            <div className="mt-8 text-center">
              <Go href={o.button_url} className="inline-flex rounded-xl bg-primary-600 px-7 py-3.5 text-sm font-extrabold text-white shadow hover:bg-primary-700">{o.button_label} →</Go>
            </div>
          )}
        </div>
      )
    }
    case 'press_mentions': {
      const mentions = items.filter((i) => i.outlet || i.quote)
      if (!mentions.length) return <Empty editing={editing} text="Basın haberi ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-5 md:grid-cols-3">
            {mentions.map((m, i) => (
              <Go key={i} href={m.url} className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="font-heading text-sm font-extrabold uppercase tracking-wider text-primary-700">{m.outlet}</span>
                    {m.date && <span className="text-xs text-gray-400">{m.date}</span>}
                  </div>
                  {m.quote && <p className="text-sm leading-relaxed text-gray-700">“{m.quote}”</p>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'impact_reports': {
      const reports = items.filter((i) => i.title)
      if (!reports.length) return <Empty editing={editing} text="Dağıtım raporu ekleyin" />
      const cols = COLS[Math.min(4, Math.max(2, Number(o.columns) || 3))] || COLS[3]
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-6 sm:grid-cols-2 ${cols}`}>
            {reports.map((r, i) => (
              <Go key={i} href={r.url} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                {r.image_url && <img src={r.image_url} alt={r.title || ''} className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />}
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-primary-600">
                    {r.location && <span>📍 {r.location}</span>}
                    {r.date && <span className="text-gray-400">· {r.date}</span>}
                  </div>
                  <h3 className="mt-1.5 font-heading text-base font-bold text-gray-900">{r.title}</h3>
                  {r.beneficiaries && <div className="mt-2 inline-block rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-extrabold text-emerald-700">✓ {r.beneficiaries}</div>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'qurbani_tracker': {
      const shares = items.filter((i) => i.title)
      if (!shares.length) return <Empty editing={editing} text="Kurban hisse grubu ekleyin" />
      const look = o.look || 'share_cards'
      if (look === 'country_matrix') {
        return (
          <div className={container}>
            <Head o={o} />
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[540px] text-start text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">Bölge / Tür</th>
                    <th className="px-5 py-3.5 font-bold">Doluluk</th>
                    <th className="px-5 py-3.5 font-bold">Hisse Tutarı</th>
                    <th className="px-5 py-3.5 text-end font-bold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shares.map((s, i) => (
                    <tr key={i}>
                      <td className="px-5 py-4 font-bold text-gray-900">{s.flag} {s.title}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-primary-700">{s.taken ?? 5} / {s.total ?? 7} Hisse</td>
                      <td className="px-5 py-4 font-heading text-base font-extrabold text-gray-900">{s.amount}</td>
                      <td className="px-5 py-4 text-end">
                        <Go href={s.url || '/bagis'} className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">{s.button_label || 'Hisse Al'}</Go>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      const cols = COLS[Math.min(4, Math.max(2, Number(o.columns) || 3))] || COLS[3]
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-6 sm:grid-cols-2 ${cols}`}>
            {shares.map((s, i) => {
              const total = Math.max(1, Number(s.total) || 7)
              const taken = Math.min(total, Math.max(0, Number(s.taken) ?? 5))
              return (
                <div key={i} className="flex flex-col justify-between rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xl">{s.flag || '🐑'}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${look === 'urgent_shares' ? 'bg-red-50 text-red-700' : 'bg-primary-50 text-primary-700'}`}>
                        {total - taken > 0 ? `Son ${total - taken} Hisse` : 'Tamamlandı'}
                      </span>
                    </div>
                    <h3 className="mt-3 font-heading text-lg font-bold text-gray-900">{s.title}</h3>
                    {s.amount && <div className="mt-1 font-heading text-2xl font-extrabold text-primary-700">{s.amount}</div>}
                    <div className="mt-4 flex gap-1.5" aria-label={`${taken}/${total} hisse`}>
                      {Array.from({ length: total }).map((_, idx) => (
                        <span key={idx} className={`h-2.5 flex-1 rounded-full ${idx < taken ? 'bg-primary-600' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  </div>
                  <Go href={s.url || '/bagis'} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-700">
                    {s.button_label || 'Hisse Al'} →
                  </Go>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    case 'water_well_showcase': {
      const wells = items.filter((i) => i.title)
      if (!wells.length) return <Empty editing={editing} text="Su kuyusu ekleyin" />
      const statusBadge: Record<string, { label: string; cls: string }> = {
        opened: { label: 'Açıldı ✓', cls: 'bg-emerald-100 text-emerald-800' },
        drilling: { label: 'Sondaj Aşamasında', cls: 'bg-amber-100 text-amber-800' },
        planned: { label: 'Planlanan', cls: 'bg-gray-100 text-gray-700' },
      }
      const cols = COLS[Math.min(4, Math.max(2, Number(o.columns) || 3))] || COLS[3]
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-6 sm:grid-cols-2 ${cols}`}>
            {wells.map((w, i) => {
              const st = statusBadge[w.status || 'opened'] || statusBadge.opened
              return (
                <Go key={i} href={w.url} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                  {w.image_url && <img src={w.image_url} alt={w.title || ''} className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      {w.country && <span className="text-xs font-bold text-primary-600">💧 {w.country}</span>}
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${st.cls}`}>{st.label}</span>
                    </div>
                    <h3 className="mt-2 font-heading text-lg font-bold text-gray-900">{w.title}</h3>
                    {w.beneficiaries && <div className="mt-1 text-xs text-gray-500">{w.beneficiaries}</div>}
                  </div>
                </Go>
              )
            })}
          </div>
        </div>
      )
    }
    case 'impact_comparison': {
      const cols = items.filter((i) => i.title)
      if (!cols.length) return <Empty editing={editing} text="Karşılaştırma kalemi ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-6 md:grid-cols-2">
            {cols.map((c, i) => {
              const pts = String(c.points || '').split('\n').map((l) => l.trim()).filter(Boolean)
              return (
                <div key={i} className={`flex flex-col justify-between rounded-3xl p-7 ${c.highlighted ? 'border-2 border-primary-600 bg-primary-50/40 shadow-lg' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    {c.badge && <span className="mb-2 inline-block rounded-full bg-primary-600 px-3 py-0.5 text-[11px] font-bold text-white">{c.badge}</span>}
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-heading text-xl font-bold text-gray-900">{c.title}</h3>
                      {c.amount && <span className="font-heading text-2xl font-extrabold text-primary-700">{c.amount}</span>}
                    </div>
                    {pts.length > 0 && (
                      <ul className="mt-5 space-y-2.5 text-sm text-gray-700">
                        {pts.map((pt, idx) => <li key={idx} className="flex items-start gap-2"><span className="font-bold text-primary-600">✓</span><span>{pt}</span></li>)}
                      </ul>
                    )}
                  </div>
                  <Go href={c.url || '/bagis'} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700">
                    Destek Ol →
                  </Go>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    case 'donation_quiz': {
      const options = items.filter((i) => i.title)
      if (!options.length) return <Empty editing={editing} text="Yardım alanı ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {options.map((opt, i) => {
              const base = String(opt.url || '/bagis')
              const sep = base.includes('?') ? '&' : '?'
              const href = opt.suggested_amount ? `${base}${sep}tutar=${opt.suggested_amount}` : base
              return (
                <Go key={i} href={href} className="group flex flex-col justify-between rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:border-primary-500 hover:shadow-xl">
                  <div>
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-3xl transition group-hover:bg-primary-600 group-hover:text-white">{opt.icon || '🤲'}</div>
                    <h3 className="font-heading text-lg font-bold text-gray-900">{opt.title}</h3>
                    {opt.text && <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{opt.text}</p>}
                  </div>
                  {opt.suggested_amount && <div className="mt-4 rounded-xl bg-primary-50 py-2 text-xs font-extrabold text-primary-800 group-hover:bg-primary-600 group-hover:text-white">{opt.suggested_amount} ₺ ile Başla →</div>}
                </Go>
              )
            })}
          </div>
        </div>
      )
    }
    case 'prayer_calendar': {
      const days = items.filter((i) => i.title)
      const isDarkGold = (o.look || 'dark_gold_card') === 'dark_gold_card'
      return (
        <div className={isDarkGold ? 'bg-gradient-to-br from-gray-950 via-primary-950 to-amber-950/60 py-14 text-white' : ''}>
          <div className={container}>
            <div className="mx-auto max-w-4xl">
              <Head o={o} />
              {o.hijri_date && <div className="mb-6 text-center"><span className="rounded-full bg-amber-500/20 px-4 py-1 text-xs font-extrabold tracking-widest text-amber-300 ring-1 ring-amber-400/30">🕌 {o.hijri_date}</span></div>}
              {days.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {days.map((d, i) => (
                    <div key={i} className={`rounded-2xl p-5 ${isDarkGold ? 'border border-amber-400/20 bg-white/5' : 'border border-gray-200 bg-white text-gray-900 shadow-sm'}`}>
                      {d.date && <div className={`text-xs font-bold uppercase ${isDarkGold ? 'text-amber-300' : 'text-primary-600'}`}>{d.date}</div>}
                      <div className="mt-1 font-heading text-base font-bold">{d.title}</div>
                      {d.note && <div className={`mt-1 text-xs ${isDarkGold ? 'text-gray-300' : 'text-gray-500'}`}>{d.note}</div>}
                    </div>
                  ))}
                </div>
              )}
              {o.button_label && o.button_url && (
                <div className="mt-8 text-center">
                  <Go href={o.button_url} className="inline-flex rounded-xl bg-amber-500 px-7 py-3.5 text-sm font-extrabold text-gray-950 shadow-lg hover:bg-amber-400">{o.button_label} →</Go>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    case 'events_calendar': {
      const evs = items.filter((i) => i.title)
      if (!evs.length) return <Empty editing={editing} text="Etkinlik ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {evs.map((e, i) => (
              <Go key={i} href={e.url} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                {e.image_url && <img src={e.image_url} alt={e.title || ''} className="aspect-[16/10] w-full object-cover" loading="lazy" />}
                <div className="p-5">
                  {e.date && <div className="text-xs font-extrabold uppercase tracking-wider text-primary-600">📅 {e.date}</div>}
                  <h3 className="mt-1.5 font-heading text-lg font-bold text-gray-900">{e.title}</h3>
                  {e.location && <div className="mt-1 text-xs text-gray-500">📍 {e.location}</div>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'app_promo': {
      const isDark = o.look === 'dark_app_banner'
      return (
        <div className={isDark ? 'bg-gray-950 py-14 text-white' : ''}>
          <div className={container}>
            <div className={`grid items-center gap-8 rounded-3xl p-8 md:grid-cols-12 md:p-12 ${isDark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-primary-50/50'}`}>
              <div className={o.image_url ? 'md:col-span-7' : 'md:col-span-12'}>
                <Head o={o} center={false} />
                <div className="flex flex-wrap gap-3">
                  {o.ios_url && <a href={o.ios_url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-gray-900 px-5 py-3 text-xs font-bold text-white hover:bg-gray-800">App Store ↗</a>}
                  {o.android_url && <a href={o.android_url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-primary-600 px-5 py-3 text-xs font-bold text-white hover:bg-primary-700">Google Play ↗</a>}
                  {o.whatsapp_url && <a href={o.whatsapp_url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white hover:bg-emerald-700">WhatsApp Kanalı ↗</a>}
                </div>
              </div>
              {o.image_url && (
                <div className="flex justify-center md:col-span-5">
                  <img src={o.image_url} alt={o.title || ''} className="max-h-72 rounded-3xl object-contain shadow-xl" loading="lazy" />
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    case 'impact_chart': {
      const rows = items.filter((i) => i.label)
      if (!rows.length) return <Empty editing={editing} text="Dağılım kalemi ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="mx-auto max-w-3xl space-y-4 rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
            {rows.map((r, i) => {
              const pct = Math.min(100, Math.max(0, Number(r.percent) || 0))
              return (
                <div key={i}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm font-bold text-gray-900">
                    <span>{r.label}</span>
                    <span className="text-primary-700">%{pct} {r.amount ? <span className="text-xs font-normal text-gray-500">({r.amount})</span> : null}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    case 'branches_directory': {
      const branches = items.filter((i) => i.city || i.address)
      if (!branches.length) return <Empty editing={editing} text="Şube ekleyin" />
      const cols = COLS[Math.min(4, Math.max(2, Number(o.columns) || 3))] || COLS[3]
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-5 sm:grid-cols-2 ${cols}`}>
            {branches.map((b, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="font-heading text-lg font-bold text-gray-900">📍 {b.city}</div>
                {b.address && <p className="mt-1.5 text-sm text-gray-600">{b.address}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold">
                  {b.phone && <a href={`tel:${String(b.phone).replace(/\s+/g, '')}`} className="text-primary-700 hover:underline">📞 {b.phone}</a>}
                  {b.map_url && <a href={b.map_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:underline">Harita ↗</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'help_desk_card': {
      const isDark = o.look === 'dark_help_bar'
      return (
        <div className={container}>
          <div className={`rounded-3xl p-7 shadow-lg md:p-10 ${isDark ? 'bg-gray-950 text-white' : 'border border-gray-200 bg-white text-gray-900'}`}>
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <Head o={o} center={false} />
                {o.hours && <div className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>🕒 {o.hours}</div>}
              </div>
              <div className="flex flex-wrap gap-3">
                {o.phone && <a href={`tel:${String(o.phone).replace(/\s+/g, '')}`} className="rounded-xl bg-primary-600 px-5 py-3 text-xs font-extrabold text-white hover:bg-primary-700">📞 {o.phone}</a>}
                {o.whatsapp && <a href={`https://wa.me/${String(o.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-extrabold text-white hover:bg-emerald-700">💬 WhatsApp</a>}
                {o.email && <a href={`mailto:${o.email}`} className={`rounded-xl border px-5 py-3 text-xs font-extrabold ${isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}>✉️ {o.email}</a>}
              </div>
            </div>
          </div>
        </div>
      )
    }
    case 'milestone_tracker': {
      const phases = items.filter((i) => i.title)
      if (!phases.length) return <Empty editing={editing} text="Proje aşaması ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {phases.map((p, i) => {
              const cls = p.status === 'done'
                ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                : p.status === 'active'
                  ? 'border-primary-400 bg-primary-50/60 text-primary-950 ring-2 ring-primary-200'
                  : 'border-gray-200 bg-white text-gray-700'
              return (
                <div key={i} className={`rounded-2xl border p-5 shadow-xs ${cls}`}>
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span>{p.step || `Faz ${i + 1}`}</span>
                    <span>{p.status === 'done' ? '✓ Tamamlandı' : p.status === 'active' ? '● Devam Ediyor' : 'Planlandı'}</span>
                  </div>
                  <div className="mt-2 font-heading text-base font-bold">{p.title}</div>
                  {p.date && <div className="mt-1 text-xs opacity-70">{p.date}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    case 'social_feed_grid': {
      const posts = items.filter((i) => i.image_url)
      if (!posts.length) return <Empty editing={editing} text="Sosyal medya görseli ekleyin" />
      const isDark = o.look === 'dark_gallery'
      return (
        <div className={isDark ? 'bg-gray-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {posts.map((p, i) => (
                <Go key={i} href={p.url || o.profile_url} className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-900">
                  <img src={p.image_url} alt={p.caption || ''} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                  {p.caption && (
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 via-transparent to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                      <span className="line-clamp-2 text-xs font-semibold text-white">{p.caption}</span>
                    </div>
                  )}
                </Go>
              ))}
            </div>
            {(o.handle || o.profile_url) && (
              <div className="mt-6 text-center">
                <a href={o.profile_url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-primary-700">
                  📸 {o.handle || 'Takip Et'} ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'recurring_planner': {
      const defAmt = Number(o.default_amount) || 300
      const unitP = Number(o.unit_price) || 100
      const presets = [150, defAmt, defAmt * 2, defAmt * 4].filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx)
      const isDark = o.look === 'dark_gold'
      const annualUnits = Math.max(1, Math.round((defAmt * 12) / unitP))
      return (
        <div className={isDark ? 'bg-gradient-to-br from-slate-950 via-primary-950 to-slate-900 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className={`mx-auto max-w-4xl rounded-3xl border p-7 sm:p-10 ${isDark ? 'border-amber-400/30 bg-white/5' : 'border-primary-100 bg-white shadow-lg'}`}>
              <div className="grid items-center gap-8 md:grid-cols-12">
                <div className="md:col-span-7">
                  <div className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-amber-300' : 'text-primary-600'}`}>Aylık Kumbara Seçenekleri</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {presets.map((amt) => (
                      <Link key={amt} href={`${o.button_url || '/bagis'}?amount=${amt}`} className={`rounded-2xl border p-3.5 text-center transition hover:-translate-y-0.5 ${amt === defAmt ? (isDark ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-primary-600 bg-primary-50 text-primary-900') : (isDark ? 'border-white/15 bg-white/5 text-white hover:border-white/30' : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-primary-300')}`}>
                        <div className="font-heading text-lg font-extrabold">{amt.toLocaleString('tr-TR')} ₺</div>
                        <div className={`text-[11px] ${isDark ? 'text-white/70' : 'text-gray-500'}`}>/ ay</div>
                      </Link>
                    ))}
                  </div>
                  {o.unit_label && <p className={`mt-4 text-xs font-semibold ${isDark ? 'text-white/75' : 'text-gray-600'}`}>💡 {o.unit_label}</p>}
                </div>
                <div className={`rounded-2xl p-6 text-center md:col-span-5 ${isDark ? 'bg-amber-400/10 border border-amber-400/25' : 'bg-primary-50'}`}>
                  <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-amber-300' : 'text-primary-700'}`}>Yıllık Toplam Etki</div>
                  <div className={`mt-1 font-heading text-4xl font-black ${isDark ? 'text-white' : 'text-primary-900'}`}>{annualUnits}×</div>
                  <div className={`mt-1 text-xs ${isDark ? 'text-white/75' : 'text-gray-600'}`}>Aylık {defAmt.toLocaleString('tr-TR')} ₺ düzenli destek ile yılda {(defAmt * 12).toLocaleString('tr-TR')} ₺</div>
                  <Link href={`${o.button_url || '/bagis'}?amount=${defAmt}`} className={`mt-5 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-extrabold shadow transition ${isDark ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                    {o.button_label || 'Düzenli Bağışa Başla'} →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
    case 'field_representatives': {
      const reps = items.filter((i) => i.city || i.name)
      if (!reps.length) return <Empty editing={editing} text="Temsilci ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reps.map((r, i) => (
              <div key={i} className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{r.region || 'Türkiye'}</span>
                    {r.status && <span className="text-[11px] font-semibold text-emerald-700">● {r.status}</span>}
                  </div>
                  <h3 className="mt-2.5 font-heading text-lg font-bold text-gray-900">{r.city}</h3>
                  {r.name && <p className="text-sm text-gray-600">{r.name}</p>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {r.phone && <a href={`tel:${String(r.phone).replace(/\s+/g, '')}`} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-200">📞 {r.phone}</a>}
                  {r.whatsapp && <a href={`https://wa.me/${String(r.whatsapp).replace(/\D+/g, '')}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">💬 WhatsApp</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'qurbani_status': {
      const stages = items.filter((i) => i.title)
      const isDark = o.look === 'dark_verified'
      return (
        <div className={isDark ? 'bg-slate-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className={`mx-auto max-w-4xl rounded-3xl border p-7 sm:p-10 ${isDark ? 'border-white/15 bg-white/5' : 'border-primary-100 bg-white shadow-sm'}`}>
              <form action={o.support_url || '/iletisim'} method="get" className="flex flex-col gap-3 sm:flex-row">
                <input name="q" type="text" placeholder={o.placeholder || 'Bağış kodunuz veya 05XX...'} className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm font-medium focus:outline-none ${isDark ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50' : 'border-gray-200 bg-gray-50 text-gray-900'}`} />
                <button type="submit" className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-extrabold text-white shadow hover:bg-primary-700">Durum Sorgula</button>
              </form>
              {stages.length > 0 && (
                <div className="mt-7 grid gap-4 sm:grid-cols-3">
                  {stages.map((st, i) => (
                    <div key={i} className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-100 bg-gray-50'}`}>
                      <div className="text-xs font-extrabold text-primary-600">{st.step || `0${i + 1}`}</div>
                      <div className={`mt-1 font-heading text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{st.title}</div>
                      {st.detail && <p className={`mt-1 text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>{st.detail}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    case 'publications_shelf': {
      const pubs = items.filter((i) => i.title)
      if (!pubs.length) return <Empty editing={editing} text="Yayın ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pubs.map((p, i) => (
              <Go key={i} href={p.file_url || '#'} className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="aspect-[3/4] overflow-hidden bg-gray-100">
                  {p.image_url ? <img src={p.image_url} alt={p.title || ''} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : <div className="flex h-full items-center justify-center text-4xl">📚</div>}
                </div>
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    {p.issue && <div className="text-[11px] font-bold uppercase tracking-wider text-primary-600">{p.issue}</div>}
                    <h3 className="mt-1 font-heading text-base font-bold text-gray-900">{p.title}</h3>
                    {p.summary && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{p.summary}</p>}
                  </div>
                  {p.file_url && <span className="mt-3 inline-flex text-xs font-extrabold text-primary-700">Oku / İndir →</span>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'tax_exemption_info': {
      const perks = items.filter((i) => i.title)
      return (
        <div className={container}>
          <Head o={o} />
          <div className="rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50/70 via-white to-white p-7 shadow-sm sm:p-10">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 pb-5">
              <div>
                {o.law_ref && <span className="inline-block rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white">{o.law_ref}</span>}
                <p className="mt-2 text-sm text-gray-600">Kurumsal ve bireysel bağışçılarımız için resmi vergi muafiyeti ve dekont avantajları.</p>
              </div>
              {o.button_label && (
                <Link href={o.button_url || '/iletisim'} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-extrabold text-white shadow hover:bg-primary-700">
                  {o.button_label}
                </Link>
              )}
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {perks.map((p, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5">
                  {p.badge && <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">{p.badge}</span>}
                  <h3 className="mt-2 font-heading text-base font-bold text-gray-900">{p.title}</h3>
                  {p.text && <p className="mt-1.5 text-sm text-gray-600">{p.text}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case 'mushaf_distribution': {
      const list = items.filter((i) => i.country)
      if (!list.length) return <Empty editing={editing} text="Ülke ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-white to-white p-6 shadow-sm sm:p-9">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-emerald-100 pb-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-emerald-700">1 Mushaf Bedeli</div>
                <div className="font-heading text-3xl font-black text-gray-900">{o.unit_price || '150 ₺'}</div>
              </div>
              <Link href={o.button_url || '/bagis'} className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-extrabold text-white shadow hover:bg-emerald-800">
                📖 {o.button_label || 'Mushaf Hediye Et'}
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((m, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="font-heading text-2xl font-black text-emerald-700">{m.count}</div>
                  <div className="mt-1 font-heading text-base font-bold text-gray-900">{m.country}</div>
                  {m.note && <div className="mt-1 text-xs text-gray-500">{m.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case 'governance_board': {
      const members = items.filter((i) => i.name)
      if (!members.length) return <Empty editing={editing} text="Kurul üyesi ekleyin" />
      const isDark = o.look === 'dark_executive'
      return (
        <div className={isDark ? 'bg-slate-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {members.map((m, i) => (
                <div key={i} className={`rounded-2xl border p-5 text-center ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white shadow-sm'}`}>
                  <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-primary-50">
                    {m.image_url ? <img src={m.image_url} alt={m.name} className="h-full w-full object-cover object-top" loading="lazy" /> : <div className="flex h-full items-center justify-center font-heading text-2xl font-bold text-primary-700">{String(m.name).charAt(0)}</div>}
                  </div>
                  <h3 className={`mt-3 font-heading text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{m.name}</h3>
                  {m.role && <div className={`mt-0.5 text-xs font-bold ${isDark ? 'text-accent-300' : 'text-primary-600'}`}>{m.role}</div>}
                  {m.committee && <div className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isDark ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-600'}`}>{m.committee}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case 'sacred_days_banner': {
      const isDark = o.look !== 'compact_strip'
      return (
        <div className={container}>
          <div className={`rounded-3xl p-8 sm:p-12 ${isDark ? 'border border-amber-400/30 bg-gradient-to-br from-slate-950 via-primary-950 to-slate-900 text-white shadow-2xl' : 'border border-primary-200 bg-primary-50/70 text-gray-900'}`}>
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${isDark ? 'bg-amber-400/20 text-amber-300' : 'bg-primary-600 text-white'}`}>
                    🌙 {o.occasion || 'Mübarek Gün'}
                  </span>
                  {o.date_label && <span className={`text-xs font-bold ${isDark ? 'text-white/70' : 'text-gray-600'}`}>{o.date_label}</span>}
                </div>
                {o.title && <h2 className="mt-3 font-heading text-2xl font-extrabold sm:text-3xl">{o.title}</h2>}
                {o.text && <p className={`mt-2 text-sm sm:text-base ${isDark ? 'text-white/80' : 'text-gray-600'}`}>{o.text}</p>}
              </div>
              <Link href={o.button_url || '/bagis'} className={`rounded-xl px-7 py-3.5 text-sm font-extrabold shadow-lg ${isDark ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                {o.button_label || 'Kandil Sadakası Ver'} →
              </Link>
            </div>
          </div>
        </div>
      )
    }
    case 'documentary_spotlight': {
      const chapters = items.filter((i) => i.title)
      const isDark = o.look === 'playlist_dark'
      return (
        <div className={isDark ? 'bg-slate-950 py-14 text-white' : ''}>
          <div className={container}>
            <Head o={o} />
            <div className={`grid items-center gap-8 rounded-3xl border p-6 sm:p-8 lg:grid-cols-12 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white shadow-sm'}`}>
              <div className="overflow-hidden rounded-2xl bg-black lg:col-span-7">
                {o.poster_url ? (
                  <a href={o.video_url || '#'} target="_blank" rel="noopener noreferrer" className="group relative block aspect-video">
                    <img src={o.poster_url} alt={o.title || ''} className="h-full w-full object-cover opacity-85 transition group-hover:scale-105" />
                    <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-2xl text-primary-700 shadow-xl">▶</span></span>
                    {o.duration && <span className="absolute bottom-3 end-3 rounded-md bg-black/75 px-2.5 py-1 text-xs font-bold text-white">{o.duration}</span>}
                  </a>
                ) : (
                  <div className="flex aspect-video items-center justify-center text-4xl text-white/40">🎬</div>
                )}
              </div>
              <div className="space-y-3 lg:col-span-5">
                <div className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-accent-300' : 'text-primary-600'}`}>Belgesel Bölümleri</div>
                {chapters.map((ch, i) => (
                  <div key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-100 bg-gray-50'}`}>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-extrabold ${isDark ? 'bg-accent-500/20 text-accent-300' : 'bg-primary-100 text-primary-700'}`}>{ch.time || `0${i + 1}:00`}</span>
                    <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{ch.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }
    case 'field_diaries': {
      const notes = items.filter((i) => i.title)
      if (!notes.length) return <Empty editing={editing} text="Saha günlüğü ekleyin" />
      return (
        <div className={container}>
          <Head o={o} />
          <div className="grid gap-5 md:grid-cols-3">
            {notes.map((d, i) => (
              <article key={i} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {d.image_url && <img src={d.image_url} alt={d.title || ''} className="aspect-[16/10] w-full object-cover" loading="lazy" />}
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-primary-600">
                    {d.date && <span>📅 {d.date}</span>}
                    {d.location && <span>📍 {d.location}</span>}
                  </div>
                  <h3 className="mt-2 font-heading text-base font-bold text-gray-900">{d.title}</h3>
                  {d.note && <p className="mt-1.5 text-sm text-gray-600">{d.note}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )
    }
    case 'zakat_allocation_matrix': {
      const look = o.look || 'eight_pillars'
      const rows = items.filter((i) => i.title)
      const dark = look === 'dark_emerald_matrix'
      return (
        <div className={container}>
          <Head o={o} />
          {!rows.length ? <Empty editing={editing} text="Zekat sınıflarını ekleyin" /> : (
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${dark ? 'rounded-3xl bg-emerald-950 p-6 text-white shadow-xl' : ''}`}>
              {rows.map((r, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-5 ${dark ? 'border border-emerald-800 bg-emerald-900/50' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${dark ? 'bg-amber-400/20 text-amber-300' : 'bg-primary-50 text-primary-700'}`}>{r.code || `${i + 1}. Sınıf`}</span>
                      {r.share && <span className={`text-sm font-extrabold ${dark ? 'text-amber-300' : 'text-primary-700'}`}>{r.share}</span>}
                    </div>
                    <h3 className={`font-heading text-base font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{r.title}</h3>
                    {r.desc && <p className={`mt-1.5 text-xs leading-relaxed ${dark ? 'text-emerald-100/80' : 'text-gray-600'}`}>{r.desc}</p>}
                  </div>
                  {look === 'allocation_cards' && r.share && (
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-primary-600" style={{ width: r.share.includes('%') ? `${Math.min(100, Math.max(8, parseInt(r.share.replace(/\D/g, ''), 10) || 25))}%` : '40%' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'school_build_progress': {
      const look = o.look || 'phase_cards'
      const phases = items.filter((i) => i.title)
      const dark = look === 'blueprint_dark'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-slate-950 text-white shadow-2xl ring-1 ring-white/10' : 'border border-gray-200 bg-white shadow-sm'}`}>
            {(o.overall_percent || o.location) && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-current/10 pb-4">
                {o.location && <span className="text-sm font-bold opacity-85">📍 {o.location}</span>}
                {o.overall_percent && <span className={`rounded-full px-4 py-1 text-xs font-extrabold ${dark ? 'bg-accent-500 text-slate-950' : 'bg-primary-600 text-white'}`}>Genel İlerleme: {o.overall_percent}</span>}
              </div>
            )}
            {!phases.length ? <Empty editing={editing} text="İnşaat aşamalarını ekleyin" /> : (
              <div className={look === 'compact_progress' ? 'space-y-3' : 'grid gap-4 md:grid-cols-2 lg:grid-cols-4'}>
                {phases.map((p, i) => (
                  <div key={i} className={`rounded-2xl p-4 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-100 bg-gray-50'}`}>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-extrabold">
                      <span className={dark ? 'text-accent-300' : 'text-primary-700'}>{p.phase || `Faz ${i + 1}`}</span>
                      {p.percent && <span>{p.percent}</span>}
                    </div>
                    <h3 className="font-heading text-base font-bold">{p.title}</h3>
                    {p.status && <div className="mt-1 text-xs font-semibold opacity-75">{p.status}</div>}
                    {p.desc && <p className="mt-2 text-xs leading-relaxed opacity-80">{p.desc}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'food_parcel_contents': {
      const look = o.look || 'receipt_breakdown'
      const lines = items.filter((i) => i.name)
      const dark = look === 'dark_pantry'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-gray-950 text-white shadow-xl' : 'border border-gray-200 bg-white shadow-sm'}`}>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-current/10 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                {o.parcel_price && <span className={`rounded-full px-4 py-1.5 text-sm font-extrabold ${dark ? 'bg-accent-500 text-gray-950' : 'bg-primary-600 text-white'}`}>{o.parcel_price}</span>}
                {o.weight_summary && <span className="text-sm font-semibold opacity-80">⚖️ {o.weight_summary}</span>}
              </div>
              {o.cta_label && o.cta_url && <Go href={o.cta_url} className={`rounded-xl px-5 py-2.5 text-xs font-extrabold ${dark ? 'bg-white text-gray-950' : 'bg-primary-600 text-white'}`}>{o.cta_label} →</Go>}
            </div>
            {!lines.length ? <Empty editing={editing} text="Paket ürünlerini ekleyin" /> : look === 'grid_items' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900">
                    <div>
                      <div className="text-sm font-bold">{l.name}</div>
                      {l.category && <div className="text-[11px] text-gray-500">{l.category}</div>}
                    </div>
                    {l.qty && <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-extrabold text-primary-700 shadow-sm">{l.qty}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-current/10">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs opacity-50">{String(i + 1).padStart(2, '0')}</span>
                      <span className="font-semibold">{l.name}</span>
                      {l.category && <span className="rounded-full border border-current/15 px-2 py-0.5 text-[11px] opacity-70">{l.category}</span>}
                    </div>
                    {l.qty && <span className="font-extrabold">{l.qty}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'memorial_tributes': {
      const look = o.look || 'tribute_cards'
      const rows = items.filter((i) => i.honoree)
      const dark = look === 'dark_elegy'
      return (
        <div className={container}>
          <Head o={o} />
          {!rows.length ? <Empty editing={editing} text="Vefa kayıtlarını ekleyin" /> : (
            <div className={`grid gap-5 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {rows.map((r, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-6 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className={`font-extrabold uppercase tracking-wider ${dark ? 'text-amber-300' : 'text-primary-700'}`}>{r.project || 'Sadaka-i Cariye'}</span>
                      {r.date && <span className="opacity-60">{r.date}</span>}
                    </div>
                    <h3 className="font-heading text-lg font-bold">{r.honoree}</h3>
                    {r.note && <p className="mt-2 text-sm italic leading-relaxed opacity-85">“{r.note}”</p>}
                  </div>
                  {r.donor && <div className="mt-4 border-t border-current/10 pt-3 text-xs font-semibold opacity-75">Vesile olan: {r.donor}</div>}
                </div>
              ))}
            </div>
          )}
          {o.cta_label && o.cta_url && (
            <div className="mt-6 text-center">
              <Go href={o.cta_url} className="inline-flex rounded-xl bg-primary-600 px-6 py-3 text-sm font-extrabold text-white hover:bg-primary-700">{o.cta_label} →</Go>
            </div>
          )}
        </div>
      )
    }
    case 'video_delivery_showcase': {
      const look = o.look || 'whatsapp_preview_split'
      const steps = items.filter((i) => i.title)
      const dark = look === 'dark_showcase'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid items-center gap-8 rounded-3xl p-6 sm:p-10 lg:grid-cols-2 ${dark ? 'bg-gray-950 text-white shadow-2xl' : 'border border-gray-200 bg-white shadow-sm'}`}>
            <div className="space-y-4">
              {o.whatsapp_note && (
                <div className={`rounded-2xl p-4 text-sm font-medium ${dark ? 'border border-emerald-500/30 bg-emerald-950/60 text-emerald-100' : 'border border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
                  📲 {o.whatsapp_note}
                </div>
              )}
              {steps.map((s, i) => (
                <div key={i} className={`rounded-2xl p-4 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading text-base font-bold">{s.title}</h3>
                    {s.badge && <span className="rounded-full bg-primary-600 px-2.5 py-0.5 text-[11px] font-bold text-white">{s.badge}</span>}
                  </div>
                  {s.desc && <p className="mt-1 text-xs leading-relaxed opacity-80">{s.desc}</p>}
                </div>
              ))}
              {o.video_url && <Go href={o.video_url} className="inline-flex rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-primary-700">Örnek Teslimat Videosu ▶</Go>}
            </div>
            {o.image && (
              <div className="overflow-hidden rounded-2xl border border-current/10">
                <img src={o.image} alt={o.title || ''} className="h-full w-full object-cover" loading="lazy" />
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'membership_plans': {
      const look = o.look || 'membership_tiers'
      const plans = items.filter((i) => i.name)
      const dark = look === 'dark_member_card'
      return (
        <div className={container}>
          <Head o={o} />
          {!plans.length ? <Empty editing={editing} text="Üyelik / katılım kademelerini ekleyin" /> : (
            <div className={`grid gap-6 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {plans.map((p, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-3xl p-6 ${dark ? 'border border-white/15 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="font-heading text-xl font-bold">{p.name}</h3>
                      {p.badge && <span className="rounded-full bg-accent-500 px-3 py-0.5 text-[11px] font-extrabold text-gray-950">{p.badge}</span>}
                    </div>
                    {p.amount && <div className={`mb-4 font-heading text-2xl font-extrabold ${dark ? 'text-accent-300' : 'text-primary-700'}`}>{p.amount}</div>}
                    {p.perks && (
                      <ul className="space-y-2 text-sm opacity-85">
                        {String(p.perks).split('\n').filter(Boolean).map((line, li) => <li key={li}>✓ {line}</li>)}
                      </ul>
                    )}
                  </div>
                  {p.cta_label && p.cta_url && (
                    <Go href={p.cta_url} className={`mt-6 inline-flex justify-center rounded-xl px-5 py-3 text-sm font-extrabold ${dark ? 'bg-white text-gray-950 hover:bg-gray-100' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>{p.cta_label}</Go>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'impact_timeline_cards': {
      const look = o.look || 'growth_cards'
      const years = items.filter((i) => i.year || i.headline)
      const dark = look === 'dark_metrics_row'
      return (
        <div className={container}>
          <Head o={o} />
          {!years.length ? <Empty editing={editing} text="Yıllık etki verilerini ekleyin" /> : (
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${dark ? 'rounded-3xl bg-gray-950 p-6 text-white' : ''}`}>
              {years.map((y, i) => (
                <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider opacity-70">{y.year}</span>
                    {y.delta && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">{y.delta}</span>}
                  </div>
                  <div className={`font-heading text-2xl font-extrabold ${dark ? 'text-accent-300' : 'text-primary-700'}`}>{y.headline}</div>
                  {y.summary && <p className="mt-2 text-xs leading-relaxed opacity-80">{y.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'donor_concierge_bar': {
      const look = o.look || 'concierge_split'
      const dark = look === 'dark_vip_desk'
      return (
        <div className={container}>
          <div className={`flex flex-wrap items-center justify-between gap-6 rounded-3xl p-6 sm:p-8 ${dark ? 'bg-gray-950 text-white shadow-2xl ring-1 ring-white/10' : 'border border-primary-200 bg-primary-50/60 text-gray-900'}`}>
            <div className="space-y-1.5">
              {o.kicker && <div className={`text-xs font-extrabold uppercase tracking-[2px] ${dark ? 'text-accent-400' : 'text-primary-700'}`}>{o.kicker}</div>}
              {o.title && <h3 className="font-heading text-2xl font-bold">{o.title}</h3>}
              {o.advisor_name && <div className="text-sm font-semibold opacity-85">👤 {o.advisor_name} {o.hours ? `• ${o.hours}` : ''}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {o.phone && <a href={`tel:${String(o.phone).replace(/\s+/g, '')}`} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold ${dark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'}`}>📞 {o.phone}</a>}
              {o.email && <a href={`mailto:${o.email}`} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold ${dark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'}`}>✉️ {o.email}</a>}
              {o.cta_label && o.cta_url && <Go href={o.cta_url} className={`rounded-xl px-5 py-2.5 text-sm font-extrabold ${dark ? 'bg-accent-500 text-gray-950' : 'bg-primary-600 text-white'}`}>{o.cta_label} →</Go>}
            </div>
          </div>
        </div>
      )
    }
    case 'charity_box_request': {
      const look = o.look || 'split_box_promo'
      const dark = look === 'dark_request_card'
      return (
        <div className={container}>
          <div className={`grid items-center gap-8 rounded-3xl p-6 sm:p-10 md:grid-cols-2 ${dark ? 'bg-slate-950 text-white shadow-2xl' : 'border border-amber-200 bg-amber-50/60 text-gray-900'}`}>
            <div className="space-y-4">
              {o.kicker && <div className={`text-xs font-extrabold uppercase tracking-[2px] ${dark ? 'text-amber-300' : 'text-amber-800'}`}>{o.kicker}</div>}
              {o.title && <h3 className="font-heading text-2xl font-bold sm:text-3xl">{o.title}</h3>}
              {o.text && <p className="text-sm leading-relaxed opacity-85">{o.text}</p>}
              {o.phone && <div className="text-sm font-bold">📞 {o.phone}</div>}
              <div className="flex flex-wrap gap-3 pt-2">
                {o.cta_label && o.cta_url && <Go href={o.cta_url} className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-primary-700">{o.cta_label}</Go>}
                {o.secondary_label && o.secondary_url && <Go href={o.secondary_url} className={`rounded-xl border px-5 py-3 text-sm font-bold ${dark ? 'border-white/25 text-white' : 'border-gray-300 bg-white text-gray-900'}`}>{o.secondary_label}</Go>}
              </div>
            </div>
            {o.image && <img src={o.image} alt={o.title || ''} className="aspect-[16/10] w-full rounded-2xl object-cover shadow-md" loading="lazy" />}
          </div>
        </div>
      )
    }
    case 'sister_cities_list': {
      const look = o.look || 'region_directory'
      const cities = items.filter((i) => i.city)
      const dark = look === 'dark_network_grid'
      return (
        <div className={container}>
          <Head o={o} />
          {!cities.length ? <Empty editing={editing} text="Temsilcilik şehirlerini ekleyin" /> : (
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {cities.map((c, i) => (
                <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <h3 className="font-heading text-base font-bold">📍 {c.city}</h3>
                  {c.volunteers && <div className={`mt-1 text-xs font-bold ${dark ? 'text-accent-300' : 'text-primary-700'}`}>{c.volunteers}</div>}
                  {c.contact && <p className="mt-2 text-xs opacity-75">{c.contact}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'ramadan_iftar_table': {
      const look = o.look || 'tent_cards'
      const tents = items.filter((i) => i.location)
      const dark = look === 'dark_ramadan_table'
      return (
        <div className={container}>
          <Head o={o} />
          {o.share_price && <div className="mb-4 text-center"><span className="rounded-full bg-amber-500 px-4 py-1 text-xs font-extrabold text-slate-950">1 Kişilik İftar: {o.share_price}</span></div>}
          {!tents.length ? <Empty editing={editing} text="İftar noktalarını ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {tents.map((t, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-5 ${dark ? 'border border-amber-500/20 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    <h3 className="font-heading text-lg font-bold">🌙 {t.location}</h3>
                    {t.capacity && <div className="mt-1 text-xs font-extrabold text-primary-600">{t.capacity}</div>}
                    {t.menu_note && <p className="mt-2 text-xs opacity-80">{t.menu_note}</p>}
                  </div>
                  {t.cta_url && <Go href={t.cta_url} className="mt-4 inline-flex justify-center rounded-xl bg-primary-600 px-4 py-2 text-xs font-extrabold text-white">İftar Bağışla →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'orphans_education_kit': {
      const look = o.look || 'kit_grid'
      const parts = items.filter((i) => i.item)
      const dark = look === 'dark_school_pack'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-slate-950 text-white' : 'border border-gray-200 bg-white shadow-sm'}`}>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-current/10 pb-4">
              {o.kit_price && <span className="rounded-full bg-primary-600 px-4 py-1 text-sm font-extrabold text-white">Tam Eğitim Seti: {o.kit_price}</span>}
              {o.cta_label && o.cta_url && <Go href={o.cta_url} className="rounded-xl bg-accent-500 px-5 py-2.5 text-xs font-extrabold text-gray-950">{o.cta_label} →</Go>}
            </div>
            {!parts.length ? <Empty editing={editing} text="Eğitim paketi kalemlerini ekleyin" /> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {parts.map((p, i) => (
                  <div key={i} className={`rounded-2xl p-4 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-100 bg-gray-50'}`}>
                    <div className="font-heading text-sm font-bold">{p.item}</div>
                    {p.detail && <div className="mt-1 text-xs opacity-75">{p.detail}</div>}
                    {p.price && <div className="mt-2 text-xs font-extrabold text-primary-600">{p.price}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'medical_caravan_schedule': {
      const look = o.look || 'clinic_cards'
      const stops = items.filter((i) => i.region)
      const dark = look === 'dark_medical_tour'
      return (
        <div className={container}>
          <Head o={o} />
          {!stops.length ? <Empty editing={editing} text="Sağlık tırı duraklarını ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {stops.map((s, i) => (
                <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div className="mb-2 flex items-center justify-between text-xs font-extrabold">
                    <span className="text-primary-600">{s.date}</span>
                    {s.specialty && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">{s.specialty}</span>}
                  </div>
                  <h3 className="font-heading text-base font-bold">🚑 {s.region}</h3>
                  {s.target && <div className="mt-1.5 text-xs opacity-80">Hedef: {s.target}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'water_tanker_emergency': {
      const look = o.look || 'tanker_cards'
      const tankers = items.filter((i) => i.title)
      const dark = look === 'dark_water_urgent'
      return (
        <div className={container}>
          <Head o={o} />
          {!tankers.length ? <Empty editing={editing} text="Su tankeri seçeneklerini ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {tankers.map((t, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-6 ${dark ? 'border border-sky-400/25 bg-white/5' : 'border border-sky-200 bg-sky-50/40'}`}>
                  <div>
                    {t.volume && <span className="rounded-full bg-sky-600 px-3 py-0.5 text-xs font-extrabold text-white">{t.volume}</span>}
                    <h3 className="mt-3 font-heading text-lg font-bold">{t.title}</h3>
                    {t.price && <div className="mt-1 font-heading text-2xl font-extrabold text-sky-600">{t.price}</div>}
                  </div>
                  {t.cta_url && <Go href={t.cta_url} className="mt-4 inline-flex justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-sky-700">Su Ulaştır →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'bread_bakery_oven': {
      const look = o.look || 'bakery_split'
      const ovens = items.filter((i) => i.name)
      const dark = look === 'dark_oven_board'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-slate-950 text-white' : 'border border-amber-200 bg-amber-50/50 text-gray-900'}`}>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-current/10 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                {o.daily_loaves && <span className="rounded-full bg-amber-600 px-4 py-1 text-xs font-extrabold text-white">🥖 {o.daily_loaves}</span>}
                {o.flour_price && <span className="text-sm font-bold opacity-85">1 Çuval Un: {o.flour_price}</span>}
              </div>
              {o.cta_label && o.cta_url && <Go href={o.cta_url} className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-extrabold text-white">{o.cta_label} →</Go>}
            </div>
            {!ovens.length ? <Empty editing={editing} text="Fırın noktalarını ekleyin" /> : (
              <div className="grid gap-3 sm:grid-cols-3">
                {ovens.map((ov, i) => (
                  <div key={i} className={`rounded-2xl p-4 ${dark ? 'border border-white/10 bg-white/5' : 'border border-amber-200 bg-white'}`}>
                    <div className="font-heading text-base font-bold">{ov.name}</div>
                    {ov.output && <div className="mt-1 text-xs font-semibold opacity-75">{ov.output}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'winter_fuel_heating': {
      const look = o.look || 'winter_cards'
      const fuels = items.filter((i) => i.title)
      const dark = look === 'dark_frost_panel'
      return (
        <div className={container}>
          <Head o={o} />
          {!fuels.length ? <Empty editing={editing} text="Yakacak kalemlerini ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {fuels.map((f, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-6 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    {f.duration && <span className="text-xs font-extrabold uppercase tracking-wider text-primary-600">{f.duration}</span>}
                    <h3 className="mt-1 font-heading text-lg font-bold">🔥 {f.title}</h3>
                    {f.price && <div className="mt-2 font-heading text-2xl font-extrabold">{f.price}</div>}
                  </div>
                  {f.cta_url && <Go href={f.cta_url} className="mt-4 inline-flex justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-extrabold text-white">Destek Ol →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'mosque_library_corner': {
      const look = o.look || 'library_shelf'
      const sets = items.filter((i) => i.title)
      const dark = look === 'dark_reading_corner'
      return (
        <div className={container}>
          <Head o={o} />
          {!sets.length ? <Empty editing={editing} text="Kitap setlerini ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {sets.map((s, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-6 ${dark ? 'border border-amber-400/20 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    {s.books_count && <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">{s.books_count}</span>}
                    <h3 className="mt-2 font-heading text-lg font-bold">📚 {s.title}</h3>
                    {s.price && <div className="mt-1 font-heading text-xl font-extrabold text-primary-600">{s.price}</div>}
                  </div>
                  {s.cta_url && <Go href={s.cta_url} className="mt-4 inline-flex justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-extrabold text-white">Kütüphane Kur →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'donor_receipt_verify': {
      const look = o.look || 'verify_steps'
      const steps = items.filter((i) => i.title)
      const dark = look === 'dark_trust_portal'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-slate-950 text-white shadow-xl' : 'border border-gray-200 bg-white shadow-sm'}`}>
            {!steps.length ? <Empty editing={editing} text="Doğrulama adımlarını ekleyin" /> : (
              <div className="grid gap-4 md:grid-cols-3">
                {steps.map((s, i) => (
                  <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-100 bg-gray-50'}`}>
                    <div className="mb-1 text-xs font-extrabold text-primary-600">{s.step || `Adım ${i + 1}`}</div>
                    <h3 className="font-heading text-base font-bold">{s.title}</h3>
                    {s.desc && <p className="mt-1.5 text-xs leading-relaxed opacity-80">{s.desc}</p>}
                  </div>
                ))}
              </div>
            )}
            {o.cta_label && o.cta_url && (
              <div className="mt-6 text-center">
                <Go href={o.cta_url} className="inline-flex rounded-xl bg-primary-600 px-6 py-3 text-sm font-extrabold text-white hover:bg-primary-700">{o.cta_label} →</Go>
              </div>
            )}
          </div>
        </div>
      )
    }
    case 'kurban_live_feed': {
      const look = o.look || 'live_cards'
      const rows = items.filter((i) => i.region)
      const dark = look === 'dark_dispatch_board'
      return (
        <div className={container}>
          <Head o={o} />
          {!rows.length ? <Empty editing={editing} text="Kurban kesim/dağıtım kayıtlarını ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {rows.map((r, i) => (
                <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div className="mb-2 flex items-center justify-between text-xs font-extrabold">
                    <span className="inline-flex items-center gap-1.5 text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />{r.status || 'Tamamlandı'}</span>
                    {r.time && <span className="opacity-60">{r.time}</span>}
                  </div>
                  <h3 className="font-heading text-base font-bold">{r.region}</h3>
                  {r.batch && <div className="mt-1 text-xs font-semibold opacity-75">{r.batch}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'ramadan_fitrah_zakat_card': {
      const look = o.look || 'calculator_cards'
      const packs = items.filter((i) => i.title)
      const dark = look === 'dark_gold_fitrah'
      return (
        <div className={container}>
          <Head o={o} />
          {o.unit_note && <div className="mb-5 text-center"><span className="rounded-full bg-primary-50 px-4 py-1 text-xs font-extrabold text-primary-700">{o.unit_note}</span></div>}
          {!packs.length ? <Empty editing={editing} text="Fitre/fidye paketlerini ekleyin" /> : (
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {packs.map((p, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-5 text-center ${dark ? 'border border-amber-400/30 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    <h3 className="font-heading text-base font-bold">{p.title}</h3>
                    {p.amount && <div className={`mt-2 font-heading text-2xl font-extrabold ${dark ? 'text-amber-300' : 'text-primary-700'}`}>{p.amount}</div>}
                    {p.desc && <p className="mt-1.5 text-xs opacity-75">{p.desc}</p>}
                  </div>
                  {p.cta_url && <Go href={p.cta_url} className="mt-4 inline-flex justify-center rounded-xl bg-primary-600 px-4 py-2 text-xs font-extrabold text-white">Fitre Ver →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'orphans_birthday_eid': {
      const look = o.look || 'gift_cards'
      const gifts = items.filter((i) => i.title)
      const dark = look === 'dark_eid_panel'
      return (
        <div className={container}>
          <Head o={o} />
          {!gifts.length ? <Empty editing={editing} text="Bayramlık paketlerini ekleyin" /> : (
            <div className={`grid gap-5 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {gifts.map((g, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-6 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    <h3 className="font-heading text-lg font-bold">🎁 {g.title}</h3>
                    {g.price && <div className={`mt-1 font-heading text-2xl font-extrabold ${dark ? 'text-accent-300' : 'text-primary-700'}`}>{g.price}</div>}
                    {g.includes && <p className="mt-2 text-xs opacity-80">{g.includes}</p>}
                  </div>
                  {g.cta_url && <Go href={g.cta_url} className="mt-5 inline-flex justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-extrabold text-white">Hediye Et →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'solar_water_well_specs': {
      const look = o.look || 'spec_cards'
      const specs = items.filter((i) => i.label)
      const dark = look === 'dark_engineering_grid'
      return (
        <div className={container}>
          <Head o={o} />
          {!specs.length ? <Empty editing={editing} text="Teknik parametreleri ekleyin" /> : (
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {specs.map((s, i) => (
                <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div className="text-xs font-bold uppercase tracking-wider opacity-65">{s.label}</div>
                  <div className={`mt-1 font-heading text-xl font-extrabold ${dark ? 'text-sky-300' : 'text-primary-700'}`}>{s.value}</div>
                  {s.note && <p className="mt-1.5 text-xs opacity-75">{s.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'volunteer_field_roles': {
      const look = o.look || 'role_cards'
      const roles = items.filter((i) => i.role)
      const dark = look === 'dark_team_roles'
      return (
        <div className={container}>
          <Head o={o} />
          {!roles.length ? <Empty editing={editing} text="Gönüllü rollerini ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {roles.map((r, i) => (
                <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  {r.commitment && <span className="mb-2 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{r.commitment}</span>}
                  <h3 className="font-heading text-lg font-bold">{r.role}</h3>
                  {r.desc && <p className="mt-2 text-xs leading-relaxed opacity-80">{r.desc}</p>}
                </div>
              ))}
            </div>
          )}
          {o.cta_label && o.cta_url && (
            <div className="mt-6 text-center"><Go href={o.cta_url} className="inline-flex rounded-xl bg-primary-600 px-6 py-3 text-sm font-extrabold text-white">{o.cta_label} →</Go></div>
          )}
        </div>
      )
    }
    case 'student_dorm_support': {
      const look = o.look || 'dorm_cards'
      const dorms = items.filter((i) => i.title)
      const dark = look === 'dark_campus_board'
      return (
        <div className={container}>
          <Head o={o} />
          {!dorms.length ? <Empty editing={editing} text="Barınma destek kalemlerini ekleyin" /> : (
            <div className={`grid gap-4 md:grid-cols-3 ${dark ? 'rounded-3xl bg-slate-950 p-6 text-white' : ''}`}>
              {dorms.map((d, i) => (
                <div key={i} className={`flex flex-col justify-between rounded-2xl p-6 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-200 bg-white shadow-sm'}`}>
                  <div>
                    {d.period && <span className="text-xs font-extrabold uppercase tracking-wider text-primary-600">{d.period}</span>}
                    <h3 className="mt-1 font-heading text-lg font-bold">{d.title}</h3>
                    {d.price && <div className="mt-2 font-heading text-2xl font-extrabold">{d.price}</div>}
                  </div>
                  {d.cta_url && <Go href={d.cta_url} className="mt-4 inline-flex justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-extrabold text-white">Destek Ol →</Go>}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'annual_audit_summary': {
      const look = o.look || 'audit_cards'
      const ratios = items.filter((i) => i.label)
      const dark = look === 'dark_transparency_vault'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`rounded-3xl p-6 sm:p-8 ${dark ? 'bg-slate-950 text-white shadow-xl' : 'border border-gray-200 bg-white shadow-sm'}`}>
            {!ratios.length ? <Empty editing={editing} text="Mali şeffaflık oranlarını ekleyin" /> : (
              <div className="grid gap-4 md:grid-cols-3">
                {ratios.map((r, i) => (
                  <div key={i} className={`rounded-2xl p-5 ${dark ? 'border border-white/10 bg-white/5' : 'border border-gray-100 bg-gray-50'}`}>
                    <div className={`font-heading text-3xl font-extrabold ${dark ? 'text-emerald-400' : 'text-primary-700'}`}>{r.ratio}</div>
                    <h3 className="mt-1 font-heading text-base font-bold">{r.label}</h3>
                    {r.note && <p className="mt-1.5 text-xs opacity-75">{r.note}</p>}
                  </div>
                ))}
              </div>
            )}
            {o.cta_label && o.cta_url && (
              <div className="mt-6 text-center"><Go href={o.cta_url} className="inline-flex rounded-xl bg-primary-600 px-6 py-3 text-sm font-extrabold text-white">{o.cta_label} →</Go></div>
            )}
          </div>
        </div>
      )
    }
    default:
      return undefined
  }
}
