import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Campaign } from '@e-infak/api-client'
import { type Block, compileCss, localizedProps } from '../../lib/blocks'
import { translator } from '../../lib/i18n'
import { QuickDonationForm } from '../QuickDonationForm'
import { Campaigns, Categories, CtaBand, Hero, News, Stats, Trust, ZakatBand, type HomeData } from '../sections/HomeSections'
import { BlockText } from './BlockText'
import { Reveal, Slider, type SlideView } from './BlockClient'

/**
 * Draws a block tree. Shared by the public site and the editor preview; the editor
 * passes `wrap` to put its selection outline and toolbar around every block.
 */
export interface RenderOptions {
  data: HomeData
  editing?: boolean
  wrap?: (block: Block, node: ReactNode, depth: number) => ReactNode
  /** Editor: render children of a container through this (drop zones). */
  renderChildren?: (parent: Block, children: Block[], depth: number) => ReactNode
}

const container = 'mx-auto max-w-[1200px] px-6'
const CURRENCY: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }

const BASE_CSS = `
.b-block{position:relative}
.b-block>.b-overlay{position:absolute;inset:0;pointer-events:none}
.b-block>.b-overlay+.b-inner{position:relative}
.b-pad{padding-block:24px}
.b-anim{animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.7,.2,1)}
.b-anim:not(.is-in){opacity:0}
.b-anim.is-in.b-anim-fade{animation-name:bfade}
.b-anim.is-in.b-anim-slide-up{animation-name:bup}
.b-anim.is-in.b-anim-slide-left{animation-name:bleft}
.b-anim.is-in.b-anim-slide-right{animation-name:bright}
.b-anim.is-in.b-anim-zoom{animation-name:bzoom}
.b-anim.is-in{animation-duration:.7s}
@keyframes bfade{from{opacity:0}to{opacity:1}}
@keyframes bup{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:none}}
@keyframes bleft{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}
@keyframes bright{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:none}}
@keyframes bzoom{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
`

/** Blocks whose own markup is full width with its own container and padding. */
const FULL_BLEED = new Set(['hero', 'slider', 'stats', 'zakat_band', 'cta_band', 'trust', 'banner'])

function money(c: Campaign, locale: string, cents: 'collected' | 'target') {
  const value = cents === 'collected' ? c.collected_lira : c.target_lira
  return `${(value || 0).toLocaleString(locale)} ${CURRENCY[c.currency || 'TRY'] || '₺'}`
}

function Btn({ href, children, variant = 'primary', newTab }: { href: string; children: ReactNode; variant?: string; newTab?: boolean }) {
  const cls = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    accent: 'bg-accent-500 text-white hover:bg-accent-600',
    outline: 'border-[1.5px] border-current hover:bg-black/5',
    light: 'bg-white text-gray-900 hover:bg-gray-100',
    link: 'px-0 underline underline-offset-4',
  }[variant] || 'bg-primary-600 text-white hover:bg-primary-700'
  const className = `inline-flex items-center justify-center rounded-[10px] px-6 py-3 font-bold transition-colors ${cls}`
  if (href.startsWith('/') && !newTab) return <Link href={href} className={className}>{children}</Link>
  return <a href={href} className={className} target={newTab || !href.startsWith('/') ? '_blank' : undefined} rel="noopener noreferrer">{children}</a>
}

function ProgressBar({ c, locale, light }: { c: Campaign; locale: string; light?: boolean }) {
  if (!c.show_collected || !c.target_lira) return null
  return (
    <div>
      <div className={`mb-1.5 flex justify-between text-[13px] font-semibold ${light ? 'text-white' : ''}`}>
        <span className={light ? '' : 'text-primary-700'}>{money(c, locale, 'collected')}</span>
        <span className={light ? 'opacity-75' : 'text-gray-400'}>{money(c, locale, 'target')}</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${light ? 'bg-white/25' : 'bg-gray-100'}`}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent-500" style={{ width: `${Math.min(c.progress_percentage || 0, 100)}%` }} />
      </div>
    </div>
  )
}

const RATIOS: Record<string, string> = {
  '1-1': 'md:grid-cols-2', '1-2': 'md:grid-cols-[1fr_2fr]', '2-1': 'md:grid-cols-[2fr_1fr]',
  '1-1-1': 'md:grid-cols-3', '1-1-1-1': 'md:grid-cols-2 lg:grid-cols-4', '1-2-1': 'md:grid-cols-[1fr_2fr_1fr]',
}
const RATIOS_MOBILE_ONLY: Record<string, string> = {
  '1-1': 'sm:grid-cols-2', '1-2': 'sm:grid-cols-[1fr_2fr]', '2-1': 'sm:grid-cols-[2fr_1fr]',
  '1-1-1': 'sm:grid-cols-3', '1-1-1-1': 'sm:grid-cols-4', '1-2-1': 'sm:grid-cols-[1fr_2fr_1fr]',
}
const RATIOS_ALWAYS: Record<string, string> = {
  '1-1': 'grid-cols-2', '1-2': 'grid-cols-[1fr_2fr]', '2-1': 'grid-cols-[2fr_1fr]',
  '1-1-1': 'grid-cols-3', '1-1-1-1': 'grid-cols-4', '1-2-1': 'grid-cols-[1fr_2fr_1fr]',
}
const ALIGN_ITEMS: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }
const JUSTIFY: Record<string, string> = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }

function content(block: Block, o: Record<string, any>, opts: RenderOptions, depth: number): ReactNode {
  const { data } = opts
  const t = translator(data.locale)
  const campaignById = (id?: string) => (id ? data.campaigns.find((c) => c.id === id) : undefined)
  const children = (list: Block[] = []) =>
    opts.renderChildren ? opts.renderChildren(block, list, depth + 1) : list.map((b) => renderBlock(b, opts, depth + 1))

  switch (block.type) {
    case 'hero':
      return <Hero data={data} variant={o.variant || data.site.template} o={o} />
    case 'slider': {
      const slides: SlideView[] = (o.slides || []).map((s: Record<string, any>) => {
        const c = campaignById(s.campaign_id)
        return {
          ...s,
          donateLabel: t('campaign.donate'),
          campaign: c ? { slug: c.slug, title: c.title, collected: money(c, data.locale, 'collected'), target: money(c, data.locale, 'target'), progress: c.progress_percentage || 0 } : null,
        }
      })
      return <Slider slides={slides} height={o.height} autoplay={o.autoplay !== false} interval={o.interval} effect={o.effect} arrows={o.arrows !== false} dots={o.dots !== false} editing={opts.editing} />
    }
    case 'quick_donation': {
      const c = campaignById(o.campaign_id) || data.campaigns[0]
      return (
        <div id="hizli-bagis" className="mx-auto max-w-xl px-6">
          {o.title && <h2 className="mb-4 text-center font-heading text-2xl font-bold">{o.title}</h2>}
          {c ? <QuickDonationForm campaignId={c.id} campaignTitle={c.title} /> : <p className="rounded-2xl border bg-white p-6 text-center text-gray-500">{t('home.noCampaignForm')}</p>}
        </div>
      )
    }
    case 'campaigns':
      return <Campaigns data={data} t={t} o={o} />
    case 'campaign_card': {
      const c = campaignById(o.campaign_id)
      if (!c) return opts.editing ? <p className="p-6 text-center text-sm text-gray-400">Kampanya seçin (yalnızca aktif kampanyalar gösterilir)</p> : null
      const wide = o.layout !== 'card'
      return (
        <div className={container}>
          <div className={`overflow-hidden rounded-2xl border bg-white ${wide ? 'grid md:grid-cols-2' : 'mx-auto max-w-md'}`}>
            <div className={`bg-primary-50 ${wide ? 'min-h-[240px]' : 'h-52'}`}>
              {c.cover_image_url && <img src={c.cover_image_url} alt={c.title} className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <div className="flex flex-col gap-4 p-6 md:p-8">
              <h3 className="font-heading text-2xl font-bold text-gray-900">{c.title}</h3>
              <p className="text-gray-600">{c.summary}</p>
              <ProgressBar c={c} locale={data.locale} />
              <div><Btn href={`/kampanyalar/${c.slug}`}>{o.button_label || t('campaign.donate')}</Btn></div>
            </div>
          </div>
        </div>
      )
    }
    case 'categories':
      return <Categories data={data} t={t} o={o} />
    case 'zakat_band':
      return <ZakatBand t={t} o={o} />
    case 'cta_band':
      return <CtaBand data={data} o={o} />
    case 'news':
      return <News data={data} t={t} o={o} />
    case 'trust':
      return <Trust data={data} t={t} o={o} />
    case 'stats':
      return <Stats data={data} t={t} o={o} />
    case 'banner': {
      const c = campaignById(o.campaign_id)
      const align = o.align === 'center' ? 'items-center text-center' : o.align === 'right' ? 'items-end text-end' : 'items-start'
      const button = c
        ? <Btn href={`/kampanyalar/${c.slug}`} variant="accent">{o.button_label || t('campaign.donate')}</Btn>
        : o.button_label && o.button_url ? <Btn href={o.button_url} variant={o.layout === 'color' ? 'light' : 'accent'}>{o.button_label}</Btn> : null
      const text = (light: boolean) => (
        <div className={`flex flex-col gap-3 ${align}`}>
          {o.kicker && <div className={`text-[13px] font-bold tracking-[2px] ${light ? 'text-white/80' : 'text-primary-600'}`}>{o.kicker}</div>}
          {o.title && <h3 className={`font-heading text-2xl font-bold md:text-3xl ${light ? 'text-white' : 'text-gray-900'}`}>{o.title}</h3>}
          {o.text && <p className={light ? 'text-white/85' : 'text-gray-600'}>{o.text}</p>}
          {c && <div className="w-full max-w-md"><ProgressBar c={c} locale={data.locale} light={light} /></div>}
          {button && <div className="pt-1">{button}</div>}
        </div>
      )
      if (o.layout === 'split') {
        return (
          <div className={container}>
            <div className="grid items-center gap-8 overflow-hidden rounded-2xl bg-primary-50 md:grid-cols-2">
              {o.image_url && <img src={o.image_url} alt="" className="h-full max-h-[420px] w-full object-cover" loading="lazy" />}
              <div className="p-8">{text(false)}</div>
            </div>
          </div>
        )
      }
      if (o.layout === 'color') {
        return <div className="bg-primary-700"><div className={`${container} py-12`}>{text(true)}</div></div>
      }
      return (
        <div className="relative overflow-hidden bg-primary-950">
          {o.image_url && (
            <picture>
              {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
              <img src={o.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" loading="lazy" />
            </picture>
          )}
          <div className={`relative ${container} py-16 md:py-20`}>{text(true)}</div>
        </div>
      )
    }
    case 'notice': {
      const tone = { info: 'border-sky-200 bg-sky-50 text-sky-900', success: 'border-green-200 bg-green-50 text-green-900', warning: 'border-amber-200 bg-amber-50 text-amber-900', danger: 'border-red-200 bg-red-50 text-red-900' }[o.tone as string] || 'border-sky-200 bg-sky-50 text-sky-900'
      return (
        <div className={container}>
          <div className={`rounded-xl border p-5 ${tone}`}>
            {o.title && <div className="mb-1 font-bold">{o.title}</div>}
            {o.text && <p className="whitespace-pre-line text-sm leading-relaxed">{o.text}</p>}
          </div>
        </div>
      )
    }
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(o.level) ? o.level : 'h2') as 'h2'
      const size = { h1: 'text-4xl md:text-5xl', h2: 'text-3xl md:text-[36px]', h3: 'text-2xl', h4: 'text-xl', h5: 'text-lg', h6: 'text-base' }[o.level as string] || 'text-3xl md:text-[36px]'
      return (
        <div className={container}>
          {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
          <Tag className={`font-heading font-bold leading-tight ${size}`}>{o.text}</Tag>
          {o.subtitle && <p className="mt-3 max-w-2xl text-lg leading-relaxed opacity-75">{o.subtitle}</p>}
        </div>
      )
    }
    case 'richtext':
      return <div className={container}><BlockText text={o.text} /></div>
    case 'image': {
      if (!o.image_url) return null
      const img = (
        <img src={o.image_url} alt={o.alt || ''} loading="lazy"
          className={`w-full rounded-2xl ${o.aspect && o.aspect !== 'auto' ? 'object-cover' : ''}`}
          style={o.aspect && o.aspect !== 'auto' ? { aspectRatio: o.aspect } : undefined} />
      )
      return (
        <figure className={container}>
          {o.link ? <Link href={o.link}>{img}</Link> : img}
          {o.caption && <figcaption className="mt-2 text-center text-sm opacity-70">{o.caption}</figcaption>}
        </figure>
      )
    }
    case 'image_text':
      return (
        <div className={`${container} grid items-center gap-10 md:grid-cols-2`}>
          {o.image_url && <img src={o.image_url} alt={o.alt || ''} loading="lazy" className={`w-full rounded-2xl object-cover ${o.image_side === 'right' ? 'md:order-2' : ''}`} />}
          <div>
            {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
            {o.title && <h2 className="mb-4 font-heading text-3xl font-bold">{o.title}</h2>}
            <BlockText text={o.text} />
            {o.button_label && o.button_url && <div className="mt-6"><Btn href={o.button_url}>{o.button_label}</Btn></div>}
          </div>
        </div>
      )
    case 'video': {
      const v = o.url as { provider?: string; id?: string } | undefined
      if (!v?.id) return null
      const src = v.provider === 'vimeo' ? `https://player.vimeo.com/video/${encodeURIComponent(v.id)}` : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}`
      return (
        <div className={container}>
          {o.title && <h3 className="mb-4 font-heading text-2xl font-bold">{o.title}</h3>}
          <div className="aspect-video overflow-hidden rounded-2xl bg-black">
            {opts.editing
              ? <div className="flex h-full items-center justify-center text-white/70">▶ {v.provider === 'vimeo' ? 'Vimeo' : 'YouTube'} videosu</div>
              : <iframe src={src} title={o.title || 'Video'} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
          </div>
        </div>
      )
    }
    case 'buttons':
      return (
        <div className={`${container} flex flex-wrap gap-3 ${JUSTIFY[o.align] || ''}`}>
          {(o.items || []).filter((b: any) => b.label && b.url).map((b: any, i: number) => (
            <Btn key={i} href={b.url} variant={b.style} newTab={b.new_tab}>{b.label}</Btn>
          ))}
        </div>
      )
    case 'faq':
      return (
        <div className={`${container} max-w-3xl`}>
          {o.title && <h2 className="mb-6 text-center font-heading text-3xl font-bold">{o.title}</h2>}
          <div className="divide-y rounded-2xl border bg-white">
            {(o.items || []).map((item: any, i: number) => (
              <details key={i} className="group p-5" open={opts.editing && i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {item.question}<span className="text-primary-600 transition-transform group-open:rotate-45">+</span>
                </summary>
                <BlockText text={item.answer} className="mt-3 text-[15px] opacity-80" />
              </details>
            ))}
          </div>
        </div>
      )
    case 'section':
      return <div className="b-section">{children(block.children)}</div>
    case 'columns': {
      const ratio = o.ratio || '1-1'
      const cols = o.stack_on === 'never' ? RATIOS_ALWAYS[ratio] : o.stack_on === 'mobile' ? RATIOS_MOBILE_ONLY[ratio] : RATIOS[ratio]
      return (
        <div className={`${container} grid ${cols || 'md:grid-cols-2'} ${ALIGN_ITEMS[o.valign] || ''}`} style={{ gap: `${o.gap ?? 24}px` }}>
          {children(block.children)}
        </div>
      )
    }
    case 'column':
      return <div className="min-w-0">{children(block.children)}</div>
    case 'spacer':
      return <div style={{ height: `${o.height ?? 48}px` }} aria-hidden />
    case 'divider':
      return (
        <div className={container}>
          <hr className="mx-auto border-0 border-t" style={{ width: `${o.width ?? 100}%`, borderTopStyle: o.line || 'solid', borderTopColor: o.color || 'rgba(0,0,0,.12)' }} />
        </div>
      )
    default:
      return opts.editing ? <p className="p-4 text-center text-sm text-red-500">Bilinmeyen blok: {block.type}</p> : null
  }
}

export function renderBlock(block: Block, opts: RenderOptions, depth = 0): ReactNode {
  const advanced = block.advanced || {}
  if (!opts.editing && advanced.langs && advanced.langs !== opts.data.locale) return null
  const o = opts.data.locale !== 'tr' ? localizedProps(block, opts.data.locale) : block.props
  const hasOverlay = Object.values(block.style || {}).some((s) => s && s.overlay_color)
  const padded = !FULL_BLEED.has(block.type) && !['column', 'spacer', 'divider'].includes(block.type) && depth === 0
  let node: ReactNode = (
    <div key={block.id} id={advanced.anchor || undefined} aria-label={advanced.aria_label || undefined}
      className={`b-block b-${block.id}${padded ? ' b-pad' : ''}${advanced.css_class ? ` ${advanced.css_class}` : ''}`}>
      {hasOverlay && <div className="b-overlay" aria-hidden />}
      <div className="b-inner">{content(block, o, opts, depth)}</div>
    </div>
  )
  if (advanced.animation && !opts.editing) {
    node = <Reveal key={block.id} animation={advanced.animation} delay={advanced.animation_delay} duration={advanced.animation_duration}>{node}</Reveal>
  }
  return opts.wrap ? opts.wrap(block, node, depth) : node
}

export function BlockStyles({ blocks }: { blocks: Block[] }) {
  return <style dangerouslySetInnerHTML={{ __html: BASE_CSS + compileCss(blocks) }} />
}

export function BlockRenderer({ blocks, ...opts }: RenderOptions & { blocks: Block[] }) {
  return (
    <>
      <BlockStyles blocks={blocks} />
      {blocks.map((b) => renderBlock(b, opts))}
    </>
  )
}
