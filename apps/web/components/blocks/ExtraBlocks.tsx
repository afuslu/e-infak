import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block } from '../../lib/blocks'
import { Carousel, CountUp } from '../site/Carousel'
import { BlockText } from './BlockText'
import { CopyButton, Countdown, GalleryGrid, Popup, TabsView } from './ExtraClient'

/**
 * Content blocks added after the first catalogue (features, counters, team, logos,
 * countdown, timeline, tabs, marquee, quote, gallery, bank accounts, pop-up).
 * Returns undefined for a type it does not draw, so BlockRenderer can fall through.
 */
interface Ctx { locale: string; editing?: boolean; container: string }

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
      const cards = items.filter((i) => i.title || i.image_url || i.text)
      if (!cards.length) return <Empty editing={editing} text="Carousel’e kart ekleyin" />
      const colsMap: Record<number, string> = {
        1: 'w-full',
        2: 'w-[88%] sm:w-[48%]',
        3: 'w-[85%] sm:w-[46%] lg:w-[31.5%]',
        4: 'w-[78%] sm:w-[46%] lg:w-[23.5%]',
        5: 'w-[72%] sm:w-[32%] lg:w-[18.5%]',
      }
      const itemWidth = colsMap[o.columns ?? 3] || colsMap[3]
      const aspect = o.aspect || '4/3'
      const look = o.look || 'card'
      return (
        <div className={container}>
          <Head o={{ kicker: o.kicker, title: o.title, text: o.subtitle }} />
          <Carousel
            label={o.title || 'Carousel'}
            items={itemWidth}
            autoplay={o.autoplay !== false}
            interval={o.interval ?? 5}
            dots={o.dots !== false}
            arrowPos={o.arrows === false ? 'bottom' : (o.arrow_pos || 'sides')}
            editing={editing}
          >
            {cards.map((item, i) => {
              const href = item.button_url || (item.campaign_id ? `/kampanyalar` : undefined)
              if (look === 'overlay') {
                return (
                  <div key={i} className="group relative overflow-hidden rounded-2xl bg-gray-900 text-white shadow-md" style={{ aspectRatio: aspect }}>
                    {item.image_url && <img src={item.image_url} alt={item.title || ''} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="relative flex h-full flex-col justify-end p-5">
                      {item.badge && <span className="mb-2 w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm">{item.badge}</span>}
                      {item.title && <h3 className="font-heading text-xl font-bold leading-snug">{item.title}</h3>}
                      {item.text && <p className="mt-1.5 line-clamp-2 text-sm text-white/80">{item.text}</p>}
                      {item.button_label && href && (
                        <Go href={href} className="mt-3 inline-flex w-fit rounded-lg bg-white px-4 py-2 text-xs font-bold text-gray-900 hover:bg-primary-50">{item.button_label}</Go>
                      )}
                    </div>
                  </div>
                )
              }
              if (look === 'pill') {
                return (
                  <div key={i} className="flex h-full items-center gap-4 rounded-2xl border bg-white p-3.5 text-gray-900 shadow-sm transition hover:shadow-md">
                    {item.image_url && <img src={item.image_url} alt={item.title || ''} className="h-24 w-24 flex-none rounded-xl object-cover" loading="lazy" />}
                    <div className="min-w-0 flex-1">
                      {item.badge && <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600">{item.badge}</span>}
                      {item.title && <h3 className="truncate font-heading text-base font-bold">{item.title}</h3>}
                      {item.text && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{item.text}</p>}
                      {item.button_label && href && <Go href={href} className="mt-2 inline-block text-xs font-bold text-primary-700 hover:underline">{item.button_label} →</Go>}
                    </div>
                  </div>
                )
              }
              return (
                <div key={i} className={`flex h-full flex-col overflow-hidden ${look === 'minimal' ? '' : look === 'featured' ? 'rounded-3xl border bg-white shadow-md' : 'rounded-2xl border bg-white shadow-sm transition hover:shadow-lg'} text-gray-900`}>
                  {item.image_url && (
                    <div className={`overflow-hidden bg-gray-100 ${look === 'minimal' ? 'rounded-2xl' : ''}`} style={{ aspectRatio: aspect }}>
                      <img src={item.image_url} alt={item.title || ''} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" loading="lazy" />
                    </div>
                  )}
                  <div className={`flex flex-1 flex-col ${look === 'minimal' ? 'pt-3' : look === 'featured' ? 'p-6' : 'p-5'}`}>
                    {item.badge && <span className="mb-2 w-fit rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-700">{item.badge}</span>}
                    {item.title && <h3 className={`font-heading font-bold ${look === 'featured' ? 'text-2xl' : 'text-lg'}`}>{item.title}</h3>}
                    {item.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                    {item.button_label && href && (
                      <div className="mt-4">
                        <Go href={href} className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">{item.button_label}</Go>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </Carousel>
        </div>
      )
    }
    case 'features': {
      const look = o.look || 'card'
      const numbered = look === 'numbered'
      const left = look === 'icon_left' || numbered
      const center = o.align !== 'left' && !left
      const box = { card: 'rounded-2xl bg-white p-7 text-gray-900 shadow-sm transition-all hover:shadow-lg', bordered: 'rounded-2xl border p-7', plain: 'p-2', icon_left: 'flex gap-4 p-2', numbered: 'flex gap-4 rounded-2xl border bg-white p-6 text-gray-900 shadow-sm' }[look as string] || ''
      return (
        <div className={container}>
          <Head o={o} center={o.align !== 'left'} />
          <div className={`grid gap-6 sm:grid-cols-2 ${COLS[o.columns ?? 3] || COLS[3]}`}>
            {items.filter((i) => i.title || i.text).map((item, i) => {
              const isRed = /e-?devlet|348/i.test(`${item.title || ''} ${item.text || ''}`)
              const cardTheme = isRed && look !== 'plain'
                ? 'border-2 border-red-200 bg-gradient-to-br from-red-50 via-white to-red-50/40 shadow-md shadow-red-600/10'
                : ''
              return (
                <Go key={i} href={item.url} className={`${box} ${cardTheme} ${center ? 'text-center' : ''} ${item.url ? 'block hover:-translate-y-0.5 transition-transform' : ''}`}>
                  {numbered ? (
                    <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary-600 font-heading text-lg font-bold text-white">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                  ) : (item.image_url || item.icon) && (
                    <div className={`${left ? 'flex-none' : `mb-4 ${center ? 'mx-auto' : ''}`} flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                      isRed ? 'bg-[#E30A17] text-white shadow-sm shadow-red-600/30' : 'bg-primary-50 text-primary-700'
                    }`}>
                      {item.image_url ? <img src={item.image_url} alt="" className="h-9 w-9 object-contain" loading="lazy" /> : item.icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    {item.title && <h3 className={`font-heading text-lg font-bold ${isRed ? 'text-red-700' : ''}`}>{item.title}</h3>}
                    {item.text && <p className="mt-2 text-[15px] leading-relaxed opacity-80">{item.text}</p>}
                  </div>
                </Go>
              )
            })}
          </div>
        </div>
      )
    }
    case 'counters': {
      const look = o.look || 'plain'
      const grid = (
        <div className={`grid grid-cols-2 gap-3 sm:gap-6 ${COLS[Math.min(Math.max(items.length, 2), 6)]}`}>
          {items.map((item, i) => {
            const isRed = /348|saat|video|e-?devlet/i.test(`${item.value || ''} ${item.suffix || ''} ${item.label || ''}`)
            return (
              <div key={i} className={`text-center ${
                look === 'cards'
                  ? isRed
                    ? 'rounded-2xl border-2 border-red-200 bg-gradient-to-b from-red-50 to-white p-4 text-gray-900 shadow-md shadow-red-600/10 sm:p-6'
                    : 'rounded-2xl bg-white p-4 text-gray-900 shadow-sm sm:p-6'
                  : ''
              }`}>
                {item.icon && <div className="mb-1.5 text-2xl sm:mb-2 sm:text-3xl">{item.icon}</div>}
                <div className={`font-heading text-2xl font-bold tabular-nums sm:text-4xl md:text-5xl ${
                  isRed && look !== 'band' ? 'text-[#E30A17]' : look === 'band' ? '' : 'text-primary-700'
                }`}>
                  {item.prefix}<CountUp value={Number(item.value) || 0} locale={ctx.locale} suffix={String(item.suffix || '').length === 1 ? item.suffix : ''} />
                  {String(item.suffix || '').length > 1 && <span className="ms-1.5 text-[0.5em] font-semibold">{item.suffix}</span>}
                </div>
                {item.label && <div className={`mt-2 text-sm font-semibold ${isRed && look !== 'band' ? 'text-red-900' : 'opacity-75'}`}>{item.label}</div>}
              </div>
            )
          })}
        </div>
      )
      if (look === 'band') return <div className="bg-primary-700 py-14 text-white"><div className={container}><Head o={o} />{grid}</div></div>
      return <div className={container}><Head o={o} />{grid}</div>
    }
    case 'progress_bars':
      return (
        <div className={container}><div className="mx-auto max-w-3xl">
          <Head o={o} />
          <div className="space-y-5">
            {items.filter((i) => i.label).map((item, i) => {
              const percent = Math.min(Math.max(Number(item.percent) || 0, 0), 100)
              return (
                <div key={i}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-4 text-sm font-semibold">
                    <span>{item.label}</span><span className="opacity-70">{item.note || `%${percent}`}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={item.label}>
                    <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent-500" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div></div>
      )
    case 'team': {
      const look = o.look || 'plain'
      return (
        <div className={container}>
          <Head o={o} />
          <div className={`grid grid-cols-2 gap-6 sm:gap-8 ${look === 'compact' ? 'lg:grid-cols-3' : COLS[o.columns ?? 4] || COLS[4]}`}>
            {items.filter((i) => i.name).map((item, i) => look === 'compact' ? (
              <div key={i} className="flex items-center gap-4 rounded-2xl border bg-white p-4 text-gray-900 shadow-sm">
                <div className={`h-16 w-16 flex-none overflow-hidden bg-primary-50 ${o.shape === 'square' ? 'rounded-xl' : 'rounded-full'}`}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                    : <div className="flex h-full items-center justify-center font-heading text-2xl font-bold text-primary-300">{String(item.name).trim().charAt(0)}</div>}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-heading text-base font-bold">{item.name}</div>
                  {item.role && <div className="text-xs font-semibold text-primary-600">{item.role}</div>}
                </div>
              </div>
            ) : (
              <div key={i} className={`text-center ${look === 'card' ? 'rounded-2xl bg-white p-6 text-gray-900 shadow-sm' : ''}`}>
                <div className={`mx-auto mb-4 aspect-square w-full max-w-[180px] overflow-hidden bg-primary-50 ${o.shape === 'square' ? 'rounded-2xl' : 'rounded-full'}`}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                    : <div className="flex h-full items-center justify-center font-heading text-4xl font-bold text-primary-300">{String(item.name).trim().charAt(0)}</div>}
                </div>
                <div className="font-heading text-lg font-bold">{item.name}</div>
                {item.role && <div className="text-sm font-semibold text-primary-600">{item.role}</div>}
                {item.text && <p className="mt-2 text-sm leading-relaxed opacity-75">{item.text}</p>}
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'logos': {
      const logos = items.filter((i) => i.image_url || i.name)
      if (!logos.length) return <Empty editing={editing} text="Logo ekleyin" />
      const size = o.size ?? 56
      const logo = (item: Record<string, any>, i: number) => (
        <Go key={i} href={item.url} className={`flex flex-none items-center justify-center px-6 ${o.grayscale !== false ? 'opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0' : ''}`}>
          {item.image_url
            ? <img src={item.image_url} alt={item.name || ''} style={{ height: size }} className="w-auto max-w-[200px] object-contain" loading="lazy" />
            : <span className="font-heading text-xl font-bold">{item.name}</span>}
        </Go>
      )
      return (
        <div className={o.marquee ? '' : container}>
          {o.title && <div className="mb-6 text-center text-sm font-bold uppercase tracking-[2px] opacity-60">{o.title}</div>}
          {o.marquee && !editing
            ? <div className="overflow-hidden" dir="ltr"><div className="bmq items-center" style={{ ['--bmq' as string]: `${Math.max(logos.length * 5, 20)}s` }}>{[...logos, ...logos].map(logo)}</div></div>
            : <div className="flex flex-wrap items-center justify-center gap-y-6">{logos.map(logo)}</div>}
        </div>
      )
    }
    case 'countdown':
      if (o.look === 'minimal') {
        return (
          <div className={`${BAND[o.tone] || BAND.brand} py-5`}>
            <div className={`${container} flex flex-wrap items-center justify-between gap-4`}>
              <div className="font-heading text-lg font-bold">{o.title || o.kicker}</div>
              {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look="minimal" /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
              {o.button_label && o.button_url && (
                <Go href={o.button_url} className="inline-flex rounded-lg bg-white px-5 py-2 text-sm font-bold text-gray-900 hover:bg-gray-100">{o.button_label}</Go>
              )}
            </div>
          </div>
        )
      }
      return (
        <div className={`${BAND[o.tone] || BAND.brand} flex flex-col justify-center py-14`}>
          <div className={`${container} flex w-full flex-col items-center gap-6 text-center`}>
            <div>
              {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] opacity-80">{o.kicker}</div>}
              {o.title && <h2 className="font-heading text-3xl font-bold md:text-4xl">{o.title}</h2>}
              {o.text && <p className="mx-auto mt-3 max-w-2xl opacity-85">{o.text}</p>}
            </div>
            {o.target ? <Countdown target={o.target} labels={words.time} done={o.done_text} look={o.look} /> : <Empty editing={editing} text="Hedef tarihi seçin" />}
            {o.button_label && o.button_url && (
              <Go href={o.button_url} className="inline-flex rounded-lg bg-white px-7 py-3 font-bold text-gray-900 transition-colors hover:bg-gray-100">{o.button_label}</Go>
            )}
          </div>
        </div>
      )
    case 'timeline': {
      const look = o.look || 'vertical'
      return (
        <div className={container}><div className={look === 'horizontal' ? '' : 'mx-auto max-w-3xl'}>
          <Head o={o} />
          {look === 'horizontal' ? (
            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
              {items.filter((i) => i.title).map((item, i) => (
                <div key={i} className="relative rounded-2xl border bg-white p-5 text-gray-900 shadow-sm">
                  {item.date && <div className="mb-2 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">{item.date}</div>}
                  <h3 className="font-heading text-lg font-bold">{item.title}</h3>
                  {item.text && <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{item.text}</p>}
                </div>
              ))}
            </div>
          ) : (
            <ol className="relative ms-3 border-s-2 border-primary-200">
              {items.filter((i) => i.title).map((item, i) => (
                <li key={i} className="relative pb-9 ps-8 last:pb-0">
                  <span className="absolute -start-[9px] top-1.5 h-4 w-4 rounded-full border-4 border-white bg-primary-600 shadow" aria-hidden />
                  <div className={look === 'cards' ? 'rounded-2xl border bg-white p-5 text-gray-900 shadow-sm' : ''}>
                    {item.date && <div className="text-[13px] font-bold uppercase tracking-wider text-primary-600">{item.date}</div>}
                    <h3 className="font-heading text-xl font-bold">{item.title}</h3>
                    {item.text && <p className="mt-1.5 leading-relaxed opacity-75">{item.text}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div></div>
      )
    }
    case 'tabs': {
      const tabs = items.filter((i) => i.label)
      if (!tabs.length) return <Empty editing={editing} text="Sekme ekleyin" />
      const panels = tabs.map((item, i) => (
        <div key={i} className={item.image_url ? 'grid items-center gap-8 md:grid-cols-2' : ''}>
          {item.image_url && <img src={item.image_url} alt="" className="w-full rounded-2xl object-cover" loading="lazy" />}
          <div>
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
          {o.title && <h2 className="mb-8 text-center font-heading text-3xl font-bold">{o.title}</h2>}
          <TabsView labels={tabs.map((i) => i.label)} panels={panels} look={o.look} />
        </div></div>
      )
    }
    case 'marquee': {
      const texts = items.map((i) => i.text).filter(Boolean)
      if (!texts.length) return <Empty editing={editing} text="Kayan yazı ekleyin" />
      const seconds = { slow: 60, normal: 35, fast: 18 }[o.speed as string] || 35
      const run = (key: string) => texts.map((text, i) => (
        <span key={`${key}${i}`} className="flex flex-none items-center gap-6 px-3"><span>{text}</span><span aria-hidden className="opacity-60">{o.separator || '✦'}</span></span>
      ))
      return (
        <div className={`${BAND[o.tone] || BAND.brand} overflow-hidden py-3 text-sm font-bold uppercase tracking-wider`} dir="ltr">
          <div className={editing ? 'flex' : 'bmq'} style={{ ['--bmq' as string]: `${seconds}s` }}>{run('a')}{!editing && <span aria-hidden className="flex">{run('b')}</span>}</div>
        </div>
      )
    }
    case 'quote': {
      if (!o.text) return <Empty editing={editing} text="Alıntı metnini yazın" />
      if (o.look === 'side') {
        return (
          <blockquote className={container}>
            <div className="mx-auto max-w-3xl border-s-4 border-primary-600 ps-6">
              <p className="font-heading text-2xl leading-relaxed">{o.text}</p>
              {o.source && <footer className="mt-3 text-sm font-bold text-primary-700">— {o.source}</footer>}
            </div>
          </blockquote>
        )
      }
      if (o.look === 'dark_band') {
        return (
          <blockquote className="bg-primary-950 py-14 text-center text-white">
            <div className={`${container} mx-auto max-w-3xl`}>
              <div aria-hidden className="font-heading text-6xl leading-none text-accent-400">“</div>
              <p className="font-heading text-2xl leading-relaxed md:text-[30px]">{o.text}</p>
              {o.source && <footer className="mt-5 text-sm font-bold uppercase tracking-[2px] text-accent-300">{o.source}</footer>}
            </div>
          </blockquote>
        )
      }
      return (
        <blockquote className={`${container} text-center`}>
          <div className={`mx-auto max-w-3xl ${o.look === 'card' ? 'rounded-3xl bg-white p-10 text-gray-900 shadow-sm' : ''}`}>
            <div aria-hidden className="font-heading text-6xl leading-none text-primary-300">“</div>
            <p className="font-heading text-2xl leading-relaxed md:text-[28px]">{o.text}</p>
            {o.source && <footer className="mt-5 text-sm font-bold uppercase tracking-[2px] text-primary-700">{o.source}</footer>}
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
              <Carousel
                label={o.title || 'Galeri'}
                items={o.columns === 2 ? 'w-[88%] sm:w-[48%]' : o.columns === 3 ? 'w-[85%] sm:w-[46%] lg:w-[31.5%]' : 'w-[78%] sm:w-[46%] lg:w-[23.5%]'}
                autoplay={o.autoplay !== false}
                dots
                arrowPos="sides"
                editing={editing}
              >
                {images.map((item, i) => (
                  <figure key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="overflow-hidden bg-gray-100" style={{ aspectRatio: o.aspect && o.aspect !== 'masonry' ? o.aspect : '4/3' }}>
                      <img src={item.image_url} alt={item.caption || ''} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    {item.caption && <figcaption className="px-3 py-2 text-center text-xs font-medium text-gray-600">{item.caption}</figcaption>}
                  </figure>
                ))}
              </Carousel>
            ) : <GalleryGrid items={images} columns={o.columns ?? 4} aspect={o.aspect || '1/1'} gap={o.gap ?? 12} lightbox={o.lightbox !== false && !editing} />}
        </div>
      )
    }
    case 'bank_accounts': {
      const accounts = items.filter((i) => i.iban || i.bank)
      return (
        <div className={container}>
          <Head o={o} />
          <div className={o.look === 'compact' ? 'space-y-3' : 'grid gap-5 md:grid-cols-2'}>
            {accounts.map((item, i) => o.look === 'compact' ? (
              <div key={i} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white px-5 py-3.5 text-gray-900 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">{item.currency || 'TRY'}</span>
                  <span className="font-heading font-bold">{item.bank}</span>
                  {item.holder && <span className="text-sm text-gray-500">· {item.holder}</span>}
                </div>
                {item.iban && (
                  <div className="flex items-center gap-3">
                    <code dir="ltr" className="select-all text-sm font-bold">{item.iban}</code>
                    <CopyButton value={String(item.iban).replace(/\s+/g, '')} label={words.copy} copied={words.copied} />
                  </div>
                )}
              </div>
            ) : (
              <div key={i} className="rounded-2xl border bg-white p-6 text-gray-900 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  {item.logo_url
                    ? <img src={item.logo_url} alt="" className="h-10 w-auto max-w-[120px] object-contain" loading="lazy" />
                    : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-xl">🏦</span>}
                  <div className="min-w-0">
                    <div className="font-heading text-lg font-bold">{item.bank}</div>
                    {item.branch && <div className="text-xs text-gray-500">{words.branch}: {item.branch}</div>}
                  </div>
                  <span className="ms-auto rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">{item.currency || 'TRY'}</span>
                </div>
                {item.holder && <div className="mb-2 text-sm"><span className="text-gray-500">{words.holder}: </span><span className="font-semibold">{item.holder}</span></div>}
                {item.iban && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
                    <code dir="ltr" className="select-all break-all text-[15px] font-bold tracking-wide">{item.iban}</code>
                    <CopyButton value={String(item.iban).replace(/\s+/g, '')} label={words.copy} copied={words.copied} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {o.note && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{o.note}</p>}
        </div>
      )
    }
    case 'popup':
      return (
        <Popup id={block.id} delay={o.delay ?? 3} hideDays={o.hide_days ?? 1} size={o.size} editing={editing}>
          {o.image_url && <img src={o.image_url} alt="" className="max-h-[46vh] w-full object-cover" />}
          {(o.title || o.text || o.button_label) && (
            <div className="p-7 text-center">
              {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
              {o.title && <h2 className="font-heading text-2xl font-bold">{o.title}</h2>}
              {o.text && <p className="mt-3 whitespace-pre-line leading-relaxed text-gray-600">{o.text}</p>}
              {o.button_label && o.button_url && (
                <Go href={o.button_url} className="mt-5 inline-flex rounded-lg bg-primary-600 px-7 py-3 font-bold text-white hover:bg-primary-700">{o.button_label}</Go>
              )}
            </div>
          )}
        </Popup>
      )
    default:
      return undefined
  }
}
