import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block } from '../../lib/blocks'
import { Carousel, CountUp } from '../site/Carousel'
import { BlockText } from './BlockText'
import { BankAccountsView, BeforeAfterSlider, CopyButton, Countdown, CountdownGate, GalleryCarousel, GalleryGrid, NewsletterForm, Popup, TabsView, VideoGalleryGrid } from './ExtraClient'

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
      const carouselMode = look === 'coverflow' || look === 'center' || look === 'deck' ? look : isTicker ? 'ticker' : 'default'
      const ytMatch = (url?: string) => url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]
      const CardMedia = ({ item, className }: { item: Record<string, any>; className: string }) => {
        const yt = ytMatch(item.video_url)
        if (yt) {
          return (
            <iframe
              src={`https://www.youtube.com/embed/${yt}?rel=0&playsinline=1`}
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
      const isDark = look === 'dark_cards'
      const isFlex = look === 'icon_left' || numbered || isChecklist || isStrip
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
        split: 'rounded-2xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm transition-all hover:shadow-md',
        checklist: 'flex items-start gap-3.5 rounded-xl border border-gray-200/70 bg-white/80 p-4 text-gray-900',
        compact_strip: 'flex items-center gap-3 p-2',
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

      const isBand = look === 'band'
      const isDark = look === 'dark_cards'
      const isLeft = look === 'left_accent'
      const isDivided = look === 'divided'
      const isRings = look === 'rings'
      const isSplit = look === 'split'

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
      ) : (
        <div className={`grid gap-3 sm:gap-6 ${colClass}`}>
          {stats.map(renderStat)}
        </div>
      )

      if (isBand) {
        return (
          <div className="bg-primary-700 py-14 text-white">
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

      const isDark = look === 'dark_cards'
      const isMilestones = look === 'milestones'
      const isRadial = look === 'radial'
      const isCards = look === 'cards' || isDark
      const cols = Math.min(Math.max(o.columns ?? 3, 1), 3)
      const colCls = cols === 1 ? 'grid-cols-1 max-w-2xl mx-auto' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'

      const renderBar = (item: Record<string, any>, i: number) => {
        const percent = Math.min(Math.max(Number(item.percent) || 0, 0), 100)
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

      const isDark = look === 'dark_cards'
      const square = o.shape === 'square'
      const cols = o.columns ?? (look === 'compact' ? 3 : look === 'detailed_list' ? 2 : 4)
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
      const isDark = look === 'dark_band'
      const isCards = look === 'cards' || look === 'split'
      const isDivided = look === 'divided'
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
          {look === 'horizontal' ? (
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
            look={o.look}
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

        if (look === 'pills') {
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

      return (
        <div className={`${BAND[o.tone] || BAND.brand} overflow-hidden ${textCls}`}>
          {marqueeTrack}
        </div>
      )
    }
    case 'quote': {
      if (!o.text && !o.arabic_text) return <Empty editing={editing} text="Alıntı metnini yazın" />
      const look = o.look || 'centered'

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
              {(o.title || o.text || o.button_label || look === 'quick_donate') && (
                <div className={look === 'slide_in' ? 'p-5' : 'p-7 text-center'}>
                  {o.kicker && <div className="mb-2 text-[12px] font-bold uppercase tracking-[2px] text-primary-600">{o.kicker}</div>}
                  {o.title && <h2 className={`font-heading font-bold ${look === 'slide_in' ? 'text-lg' : 'text-2xl'}`}>{o.title}</h2>}
                  {o.text && <p className={`mt-2.5 whitespace-pre-line leading-relaxed text-gray-600 ${look === 'slide_in' ? 'text-xs' : 'text-sm'}`}>{o.text}</p>}
                  {look === 'quick_donate' && (
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
                      <Go href={o.button_url} className={`inline-flex rounded-lg bg-primary-600 font-bold text-white hover:bg-primary-700 ${look === 'slide_in' ? 'px-4 py-2 text-xs' : 'px-7 py-3 text-sm'}`}>{o.button_label}</Go>
                    )}
                    {o.button2_label && o.button2_url && (
                      <Go href={o.button2_url} className={`inline-flex rounded-lg border border-gray-200 font-bold text-gray-700 hover:bg-gray-50 ${look === 'slide_in' ? 'px-4 py-2 text-xs' : 'px-6 py-3 text-sm'}`}>{o.button2_label}</Go>
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
      return (
        <div className={`${container} max-w-4xl`}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <BeforeAfterSlider beforeImage={o.before_image} afterImage={o.after_image} beforeLabel={o.before_label} afterLabel={o.after_label} aspect={o.aspect || '16/9'} initial={o.initial_position} />
        </div>
      )
    case 'bento_grid': {
      const boxes = items.filter((i) => i.title || i.text || i.image_url)
      if (!boxes.length) return <Empty editing={editing} text="Bento kutuları ekleyin" />
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
          <div className="grid auto-rows-[minmax(190px,auto)] gap-4 md:grid-cols-4">
            {boxes.map((item, i) => (
              <Go key={i} href={item.url} className={`group relative flex flex-col justify-end overflow-hidden rounded-3xl p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${spans[item.span] || ''} ${tones[item.tone] || tones.light}`}>
                {item.image_url && (
                  <>
                    <img src={item.image_url} alt={item.title || ''} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  </>
                )}
                <div className={`relative ${item.image_url ? 'text-white' : ''}`}>
                  {item.badge && <span className="mb-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">{item.badge}</span>}
                  {item.title && <h3 className="font-heading text-xl font-bold leading-snug">{item.title}</h3>}
                  {item.text && <p className="mt-1.5 text-sm opacity-85">{item.text}</p>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'pricing_tiers': {
      const tiers = items.filter((i) => i.title)
      if (!tiers.length) return <Empty editing={editing} text="Paket ekleyin" />
      return (
        <div className={container}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <div className={`grid gap-6 sm:grid-cols-2 ${COLS[o.columns ?? 3] || COLS[3]}`}>
            {tiers.map((item, i) => {
              const linked = item.campaign_id ? ctx.campaigns?.find((c) => c.id === item.campaign_id) : undefined
              const href = item.button_url || (linked ? `/kampanyalar/${linked.slug}` : '/bagis')
              const feats = String(item.features || '').split('\n').map((l) => l.trim()).filter(Boolean)
              const hi = !!item.highlighted
              return (
                <div key={i} className={`flex flex-col rounded-3xl p-7 transition ${hi ? 'border-2 border-primary-600 bg-primary-950 text-white shadow-xl' : 'border border-gray-200 bg-white text-gray-900 shadow-sm'}`}>
                  {item.badge && <span className={`mb-3 w-fit rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${hi ? 'bg-accent-500 text-white' : 'bg-primary-50 text-primary-700'}`}>{item.badge}</span>}
                  <h3 className="font-heading text-xl font-bold">{item.title}</h3>
                  {item.description && <p className={`mt-1.5 text-sm ${hi ? 'text-white/75' : 'text-gray-500'}`}>{item.description}</p>}
                  {(item.amount || item.period) && (
                    <div className="my-5 flex items-baseline gap-1.5">
                      {item.amount && <span className="font-heading text-4xl font-extrabold">{item.amount}</span>}
                      {item.period && <span className={`text-sm ${hi ? 'text-white/70' : 'text-gray-500'}`}>{item.period}</span>}
                    </div>
                  )}
                  {feats.length > 0 && (
                    <ul className="mb-6 flex-1 space-y-2.5 text-sm">
                      {feats.map((f, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className={hi ? 'text-accent-400' : 'text-primary-600'}>✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Go href={href} className={`mt-auto inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-bold transition ${hi ? 'bg-white text-primary-900 hover:bg-accent-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                    {item.button_label || 'Destek Ol'}
                  </Go>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    case 'video_gallery': {
      const vids = items.filter((i) => i.title || i.video_url)
      if (!vids.length) return <Empty editing={editing} text="Video ekleyin" />
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
      if (o.look === 'pills') {
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
      return (
        <div className={container}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <div className={`grid gap-5 sm:grid-cols-2 ${COLS[o.columns ?? 4] || COLS[4]}`}>
            {regions.map((item, i) => (
              <Go key={i} href={item.url} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                {item.image_url && (
                  <div className="aspect-[16/10] overflow-hidden bg-gray-100">
                    <img src={item.image_url} alt={item.region} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    {item.flag && <span className="text-xl">{item.flag}</span>}
                    <h3 className="font-heading text-lg font-bold text-gray-900">{item.region}</h3>
                  </div>
                  {(item.count || item.unit) && (
                    <div className="mt-2 font-heading text-2xl font-extrabold text-primary-700">{item.count} <span className="text-xs font-semibold text-gray-500">{item.unit}</span></div>
                  )}
                  {item.summary && <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{item.summary}</p>}
                </div>
              </Go>
            ))}
          </div>
        </div>
      )
    }
    case 'sticky_story': {
      const steps: Record<string, any>[] = Array.isArray(o.steps) ? o.steps.filter((s: any) => s.title || s.text) : []
      if (!steps.length && !o.image_url) return <Empty editing={editing} text="Görsel ve hikaye adımları ekleyin" />
      const right = o.image_side === 'right'
      return (
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
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    {s.badge && <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">{s.badge}</span>}
                    {s.metric && <span className="font-heading text-sm font-extrabold text-accent-600">{s.metric}</span>}
                  </div>
                  {s.title && <h3 className="font-heading text-xl font-bold text-gray-900">{s.title}</h3>}
                  {s.text && <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.text}</p>}
                </div>
              ))}
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
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
            {items.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
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
      const band = String(o.band || 'soft')
      const dark = band === 'brand' || band === 'dark'
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
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
            {items.map((item, i) => (
              <Go key={i} href={item.url} className="flex items-start gap-3.5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-300">
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
    default:
      return undefined
  }
}
