import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Campaign } from '@e-infak/api-client'
import { type Block, compileCss, localizedProps } from '../../lib/blocks'
import { translator } from '../../lib/i18n'
import { QuickDonationForm } from '../QuickDonationForm'
import {
  Campaigns, Categories, CtaBand, FeaturedCampaign, GalleryStrip, Hero, News, Stats, Steps, Testimonials, Trust, ZakatBand, type HomeData,
} from '../sections/HomeSections'
import { BlockText } from './BlockText'
import { MobileMenu, type NavItemView, type NavLinkView, Reveal, Slider, StickyShrink, type SlideView } from './BlockClient'
import { LanguageSwitcher } from '../site/LanguageSwitcher'
import { CountUp } from '../site/Carousel'
import { AnnouncementBar, CartButton, ContactFormBlock, CurrencySwitcher, DonationCards, MobileTabBar, type DonationCardView } from './DonationBlocks'
import { defaultFooterLinks, defaultHeaderLinks } from '../../lib/default-links'
import { extraContent } from './ExtraBlocks'

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

const container = 'mx-auto max-w-[var(--site-container)] px-4 sm:px-6'
const CURRENCY: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }

const BASE_CSS = `
.b-block{position:relative}
.b-block>.b-overlay{position:absolute;inset:0;pointer-events:none}
.b-block>.b-overlay+.b-inner{position:relative}
.b-pad{padding-block:24px}
/* Full-width blocks fill a taller box (Stil › en az yükseklik) instead of leaving a gap under them. */
.b-fill{display:flex;flex-direction:column}
.b-fill>.b-inner{flex:1 1 auto;display:flex;flex-direction:column}
.b-fill>.b-inner>*{flex:1 1 auto}
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
/* Blocks stacked in a column get a gap; a block's own margin (Stil) still wins. */
.b-col>*+*{margin-top:16px}
/* Endless horizontal run (marquee, logo strip): the content is drawn twice and slides by half. */
.bmq{display:flex;width:max-content;animation:bmq var(--bmq,35s) linear infinite}
.bmq:hover{animation-play-state:paused}
@keyframes bmq{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.bmq{animation:none;flex-wrap:wrap;width:auto}}
.hrow{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr) minmax(0,auto);align-items:center;column-gap:24px;min-height:var(--hrow-h,76px);transition:min-height .2s}
.hrow>*{min-width:0}
.hslot{display:flex;align-items:center;gap:16px;min-width:0}
@media (max-width:767px){.hrow{grid-template-columns:minmax(0,1fr) auto auto;column-gap:10px}.hslot{gap:8px}}
.hrow>:nth-child(1) .hslot{justify-content:flex-start}
.hrow>:nth-child(2) .hslot{justify-content:var(--hrow-center,center)}
.hrow>:nth-child(3) .hslot{justify-content:flex-end}
.hrow-sticky{position:sticky;top:0;z-index:40;transition:box-shadow .2s}
.hrow-sticky.is-stuck{box-shadow:0 6px 20px -8px rgba(0,0,0,.18)}
.hrow-sticky.is-shrink.is-stuck .hrow{min-height:calc(var(--hrow-h,76px)*.8)}
.mega-col+.mega-col{border-inline-start:1px solid rgba(0,0,0,.06);padding-inline-start:20px}
`

/** Blocks whose own markup is full width with its own container and padding. */
const FULL_BLEED = new Set([
  'hero', 'slider', 'stats', 'zakat_band', 'cta_band', 'trust', 'banner', 'header_row',
  'featured_campaign', 'steps', 'gallery_strip', 'testimonials', 'campaigns', 'news', 'categories',
  'announcement_bar', 'contact_form', 'mobile_tab_bar', 'countdown', 'marquee', 'popup',
])

const list = (value?: string) => String(value || '').split(',').map((v) => v.trim()).filter(Boolean)

/** Cards of a Bağış kartları block: chosen/tagged campaigns + per-campaign settings. */
function donationCards(o: Record<string, any>, data: HomeData, label: string): DonationCardView[] {
  const settings = new Map<string, Record<string, any>>((o.cards || []).filter((c: any) => c?.campaign_id).map((c: any) => [c.campaign_id, c]))
  const active = data.campaigns
  let chosen: Campaign[]
  if (o.source === 'selected' && o.campaign_ids?.length) chosen = o.campaign_ids.map((id: string) => active.find((c) => c.id === id)).filter(Boolean) as Campaign[]
  else if (o.source === 'tabs') {
    const tags = new Set((o.tabs || []).map((t: any) => t.tag))
    chosen = active.filter((c) => (c.tags || []).some((t) => tags.has(t)))
  } else if (o.source === 'featured') chosen = [...active].sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
  else chosen = active
  if (o.source !== 'selected' && settings.size) {
    // Cards with settings keep the order they were listed in (e.g. the old site's order).
    const order = [...settings.keys()]
    const rank = (c: Campaign) => { const i = order.indexOf(c.id); return i < 0 ? order.length : i }
    chosen = [...chosen].sort((a, b) => rank(a) - rank(b))
  }
  return chosen.slice(0, o.limit || 12).map((c) => {
    const s = settings.get(c.id) || {}
    const fixed = !c.allow_custom_amount && c.suggested_amounts_cents?.length ? c.suggested_amounts_cents[0] / 100 : null
    const unit = s.unit_amount ? Number(s.unit_amount) : fixed
    const total = Number(s.shares_total) || 0
    const taken = s.shares_taken != null ? Number(s.shares_taken) : unit ? Math.floor((c.collected_lira || 0) / unit) : 0
    return {
      key: `${c.id}`, campaignId: c.id, slug: c.slug, title: c.title, image: c.cover_image_url, currency: (c.currency || 'TRY') as DonationCardView['currency'],
      unit, minAmount: (c.min_donation_cents || 100) / 100, quantity: s.quantity || '', maxQuantity: s.max_quantity || 21,
      niyet: list(s.niyet), durations: list(s.durations).map(Number).filter((n) => n > 0),
      shares: total ? { taken: Math.min(taken, total), total } : null, note: s.note, button: s.button_label || o.button_label || label, tags: c.tags || [],
    }
  })
}

/** Theme-following backgrounds of sections and header rows (a Stil background overrides them). */
const TONE: Record<string, string> = {
  light: 'bg-white/95 text-gray-900 backdrop-blur',
  soft: 'bg-primary-50 text-gray-900',
  brand: 'bg-primary-700 text-white',
  dark: 'bg-primary-950 text-primary-100',
}
const SOCIAL_LABELS: Record<string, [string, string]> = {
  facebook: ['Facebook', 'f'], instagram: ['Instagram', 'IG'], x: ['X', 'X'], youtube: ['YouTube', '▶'], linkedin: ['LinkedIn', 'in'], telegram: ['Telegram', '✈'],
}
const BUTTON_VARIANT: Record<string, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  accent: 'bg-accent-500 text-white hover:bg-accent-600',
  danger: 'bg-[#E30A17] text-white shadow-md shadow-red-600/25 hover:bg-red-700',
  outline: 'border-[1.5px] border-current hover:bg-black/5',
  light: 'bg-white text-gray-900 hover:bg-gray-100',
  link: 'px-0 underline underline-offset-4',
}

function Anchor({ link, className, children }: { link: NavLinkView; className: string; children?: ReactNode }) {
  const body = children ?? link.label
  if (!link.url) return <span className={className}>{body}</span>
  if (link.url.startsWith('/') && !link.new_tab) return <Link href={link.url} className={className}>{body}</Link>
  return <a href={link.url} className={className} target={link.new_tab ? '_blank' : undefined} rel="noopener noreferrer">{body}</a>
}

/** Links of a Menü block: its own items, or the Menü screen's header/footer links. */
function navItems(o: Record<string, any>, data: HomeData, t: ReturnType<typeof translator>): NavItemView[] {
  if (o.source === 'custom') {
    return (o.items || []).filter((i: any) => i?.label).map((i: any) => ({
      label: i.label, url: i.url, new_tab: i.new_tab, mega: i.mega,
      children: (i.children || []).filter((c: any) => c?.label && c?.url),
    }))
  }
  const footer = o.source === 'footer'
  const links = (footer ? data.menu?.footer : data.menu?.header) || []
  return (links.length ? links : footer ? defaultFooterLinks(t) : defaultHeaderLinks(t))
    .map((l) => ({ label: l.label, url: l.url, new_tab: l.open_in_new_tab }))
}

function groupLinks(links: NavLinkView[]): [string, NavLinkView[]][] {
  const groups: [string, NavLinkView[]][] = []
  for (const link of links) {
    const key = link.group || ''
    const found = groups.find(([g]) => g === key)
    if (found) found[1].push(link)
    else groups.push([key, [link]])
  }
  return groups
}

function Dropdown({ item }: { item: NavItemView }) {
  const children = item.children || []
  return (
    <div className="group relative">
      {item.url ? (
        <Anchor link={item} className="inline-flex items-center gap-1 py-2 transition-opacity hover:opacity-70">
          {item.label}<span aria-hidden className="text-[10px] opacity-60 transition-transform group-hover:rotate-180">▾</span>
        </Anchor>
      ) : (
        // No link of its own: a button, so keyboard focus opens the panel (focus-within)
        <button type="button" aria-haspopup="true" className="inline-flex items-center gap-1 py-2 font-semibold transition-opacity hover:opacity-70">
          {item.label}<span aria-hidden className="text-[10px] opacity-60 transition-transform group-hover:rotate-180">▾</span>
        </button>
      )}
      <div className={`invisible absolute top-full z-50 pt-2 opacity-0 transition duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${item.mega ? 'left-1/2 w-[min(92vw,880px)] -translate-x-1/2' : 'start-0 min-w-56'}`}>
        <div className="rounded-xl border border-black/5 bg-white p-3 text-start text-[14px] font-normal text-gray-800 shadow-xl">
          {item.mega ? (
            <div className="grid gap-5 p-2" style={{ gridTemplateColumns: `repeat(${Math.min(groupLinks(children).length, 4)}, minmax(0, 1fr))` }}>
              {groupLinks(children).map(([group, links]) => (
                <div key={group} className="mega-col min-w-0">
                  {group && <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-primary-700">{group}</div>}
                  <div className="flex flex-col gap-0.5">
                    {links.map((l, i) => <Anchor key={i} link={l} className="rounded-md px-2 py-1.5 hover:bg-primary-50 hover:text-primary-800" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {children.map((l, i) => <Anchor key={i} link={l} className="rounded-md px-3 py-2 hover:bg-primary-50 hover:text-primary-800" />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function money(c: Campaign, locale: string, cents: 'collected' | 'target') {
  const value = cents === 'collected' ? c.collected_lira : c.target_lira
  return `${(value || 0).toLocaleString(locale)} ${CURRENCY[c.currency || 'TRY'] || '₺'}`
}

function Btn({ href, children, variant = 'primary', newTab }: { href: string; children: ReactNode; variant?: string; newTab?: boolean }) {
  const cls = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    accent: 'bg-accent-500 text-white hover:bg-accent-600',
    danger: 'bg-[#E30A17] text-white shadow-md shadow-red-600/25 hover:bg-red-700',
    outline: 'border-[1.5px] border-current hover:bg-black/5',
    light: 'bg-white text-gray-900 hover:bg-gray-100',
    link: 'px-0 underline underline-offset-4',
  }[variant] || 'bg-primary-600 text-white hover:bg-primary-700'
  const className = `inline-flex items-center justify-center rounded-[10px] px-6 py-3 font-bold transition-all ${cls}`
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
const JUSTIFY_MD: Record<string, string> = { left: 'md:justify-start', center: 'md:justify-center', right: 'md:justify-end' }

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
      return <Slider slides={slides} height={o.height} autoplay={o.autoplay !== false} interval={o.interval} effect={o.effect} arrows={o.arrows !== false} dots={o.dots !== false} layout={o.layout} nav={o.nav} editing={opts.editing} />
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
      return <ZakatBand t={t} o={o} tpl={data.site.template} />
    case 'featured_campaign':
      return <FeaturedCampaign data={data} t={t} o={o} />
    case 'steps':
      return <Steps data={data} t={t} o={o} />
    case 'gallery_strip':
      return <GalleryStrip data={data} t={t} o={o} />
    case 'testimonials':
      return <Testimonials data={data} t={t} o={o} />
    case 'cta_band':
      return <CtaBand data={data} o={o} />
    case 'news':
      return <News data={data} t={t} o={o} />
    case 'trust':
      return <Trust data={data} t={t} o={o} />
    case 'stats':
      if (o.variant === 'card' && o.mode === 'manual' && o.items?.length) {
        return (
          <div className={`${container} w-full`}>
            <div className="grid grid-cols-2 gap-y-8 rounded-lg bg-white px-5 py-8 shadow-[0_8px_30px_-8px_rgba(0,0,0,.18)] lg:grid-cols-4 lg:divide-x lg:divide-gray-100">
              {o.items.map((item: any, i: number) => {
                const n = Number(String(item.value || '').replace(/\./g, '').replace(',', '.'))
                return (
                  <div key={i} className="flex flex-col items-center gap-2 text-center">
                    {item.icon_url && <img src={item.icon_url} alt="" className="h-14 w-14 object-contain" loading="lazy" />}
                    <div className="font-heading text-3xl font-bold text-gray-900 md:text-4xl">
                      {Number.isFinite(n) && /^[\d.,]+$/.test(String(item.value)) ? <CountUp value={n} locale={data.locale} /> : item.value}
                    </div>
                    <div className="text-[15px] text-gray-700">{item.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }
      return <Stats data={data} t={t} o={o} />
    case 'banner': {
      const c = campaignById(o.campaign_id)
      const isRed = o.tone === 'red' || /e-?devlet|348/i.test(`${o.kicker || ''} ${o.title || ''} ${o.text || ''} ${o.button_label || ''}`)
      const align = o.align === 'center' ? 'items-center text-center' : o.align === 'right' ? 'items-end text-end' : 'items-start'
      const button = c
        ? <Btn href={`/kampanyalar/${c.slug}`} variant={isRed ? 'danger' : 'accent'}>{o.button_label || t('campaign.donate')}</Btn>
        : o.button_label && o.button_url ? <Btn href={o.button_url} variant={o.layout === 'color' || isRed ? 'light' : 'accent'}>{o.button_label}</Btn> : null
      const text = (light: boolean) => (
        <div className={`flex flex-col gap-3 ${align}`}>
          {o.kicker && (
            <div className={`text-[13px] font-bold uppercase tracking-[2px] ${
              isRed ? 'inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-white' : light ? 'text-white/80' : 'text-primary-600'
            }`}>
              {o.kicker}
            </div>
          )}
          {o.title && <h3 className={`font-heading text-2xl font-bold md:text-3xl ${light ? 'text-white' : 'text-gray-900'}`}>{o.title}</h3>}
          {o.text && <p className={light ? 'text-white/90' : 'text-gray-600'}>{o.text}</p>}
          {c && <div className="w-full max-w-md"><ProgressBar c={c} locale={data.locale} light={light} /></div>}
          {button && <div className="pt-1">{button}</div>}
        </div>
      )
      if (o.layout === 'split') {
        return (
          <div className={container}>
            <div className={`grid items-center gap-8 overflow-hidden rounded-2xl md:grid-cols-2 ${isRed ? 'bg-gradient-to-br from-[#C8102E] to-red-700 text-white shadow-xl shadow-red-900/15' : 'bg-primary-50'}`}>
              {o.image_url && <img src={o.image_url} alt="" className="h-full max-h-[420px] w-full object-cover" loading="lazy" />}
              <div className="p-8">{text(isRed)}</div>
            </div>
          </div>
        )
      }
      if (o.layout === 'color' || (isRed && !o.image_url)) {
        return (
          <div className={`flex flex-col justify-center ${isRed ? 'bg-gradient-to-r from-[#C8102E] via-[#E30A17] to-red-700 shadow-lg shadow-red-900/15' : 'bg-primary-700'}`}>
            <div className={`${container} w-full py-12`}>{text(true)}</div>
          </div>
        )
      }
      return (
        <div className={`relative flex flex-col justify-center overflow-hidden ${isRed ? 'bg-red-950' : 'bg-primary-950'}`}>
          {o.image_url && (
            <picture>
              {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
              <img src={o.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" loading="lazy" />
            </picture>
          )}
          <div className={`relative ${container} w-full py-16 md:py-20`}>{text(true)}</div>
        </div>
      )
    }
    case 'donation_cards':
      return (
        <div className={`${container} w-full`}>
          {(o.kicker || o.title) && (
            <div className="mb-10 text-center">
              {o.kicker && (
                <div className="mb-3 inline-flex items-center rounded-full bg-primary-50 px-4 py-1 text-xs font-bold uppercase tracking-[2px] text-primary-700 ring-1 ring-primary-200/70">
                  {o.kicker}
                </div>
              )}
              {o.title && <h2 className="font-heading text-3xl font-bold tracking-tight text-gray-900 md:text-[42px]">{o.title}</h2>}
            </div>
          )}
          <DonationCards cards={donationCards(o, data, t('campaign.donate'))} tabs={o.source === 'tabs' ? (o.tabs || []).filter((x: any) => x.tag && x.label) : undefined}
            layout={o.layout} columns={o.columns} switcher={o.currency_switcher} editing={opts.editing} title={o.title} />
        </div>
      )
    case 'announcement_bar':
      return <AnnouncementBar id={block.id} text={o.text} url={o.url} tone={o.tone} icon={o.icon} closable={o.closable !== false} hideDays={o.hide_days ?? 1} editing={opts.editing} />
    case 'contact_form':
      return <ContactFormBlock kicker={o.kicker} title={o.title} text={o.text} image={o.image_url} badgeValue={o.badge_value} badgeText={o.badge_text}
        button={o.button_label} askEmail={o.ask_email !== false} editing={opts.editing} />
    case 'mobile_tab_bar':
      return <MobileTabBar items={o.items || []} editing={opts.editing} />
    case 'currency_switcher':
      return <div className={depth === 0 ? container : ''}><CurrencySwitcher variant={o.style} /></div>
    case 'cart_button':
      return <div className={depth === 0 ? container : ''}><CartButton label={o.label || 'Sepetim'} showLabel={o.show_label} url={o.url || '/bagis/sepetim'} /></div>
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
          {/* inline-block: follows the block's text alignment (a centred heading centres its subtitle too) */}
          {o.subtitle && <div><p className="mt-3 inline-block max-w-2xl text-lg leading-relaxed opacity-75">{o.subtitle}</p></div>}
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
      const isHighlight = Boolean(o.highlight) || /348|saat/i.test(String(o.title || ''))
      return (
        <div className={container}>
          {isHighlight ? (
            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-zinc-900 to-red-950/80 p-5 shadow-2xl ring-2 ring-red-600/50 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#E30A17] px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-red-600/30">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
                    ▶ Video Arşivi
                  </span>
                  {o.title && <h3 className="font-heading text-xl font-bold text-white sm:text-2xl">{o.title}</h3>}
                </div>
              </div>
              <div className="aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-white/15">
                {opts.editing
                  ? <div className="flex h-full items-center justify-center text-white/70">▶ {v.provider === 'vimeo' ? 'Vimeo' : 'YouTube'} videosu</div>
                  : <iframe src={src} title={o.title || 'Video'} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
              </div>
            </div>
          ) : (
            <>
              {o.title && <h3 className="mb-4 font-heading text-2xl font-bold">{o.title}</h3>}
              <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                {opts.editing
                  ? <div className="flex h-full items-center justify-center text-white/70">▶ {v.provider === 'vimeo' ? 'Vimeo' : 'YouTube'} videosu</div>
                  : <iframe src={src} title={o.title || 'Video'} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
              </div>
            </>
          )}
        </div>
      )
    }
    case 'buttons': {
      const justify = o.mobile_align
        ? `${JUSTIFY[o.mobile_align] || ''} ${JUSTIFY_MD[o.align] || 'md:justify-start'}`
        : JUSTIFY[o.align] || ''
      return (
        <div className={`${container} flex flex-wrap gap-3 ${justify}`}>
          {(o.items || []).filter((b: any) => b.label && b.url).map((b: any, i: number) => {
            const autoDanger = (!b.style || b.style === 'primary' || b.style === 'accent') && /e-?devlet|348/i.test(`${b.label} ${b.url}`)
            return <Btn key={i} href={b.url} variant={autoDanger ? 'danger' : b.style} newTab={b.new_tab}>{b.label}</Btn>
          })}
        </div>
      )
    }
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
    case 'header_row':
      return (
        <div className={`${container} hrow`} style={{ ['--hrow-h' as string]: `${o.height ?? 76}px`, ['--hrow-center' as string]: o.center_align === 'left' ? 'flex-start' : o.center_align === 'right' ? 'flex-end' : 'center' }}>
          {o.sticky && o.shrink !== false && !opts.editing && <StickyShrink />}
          {children(block.children)}
        </div>
      )
    case 'header_slot':
      return <div className="hslot">{children(block.children)}</div>
    case 'logo': {
      const site = data.site
      const size = o.size ?? 44
      const src = (o.light && site.logo_dark_url) || site.logo_url
      return (
        <div className={depth === 0 ? container : ''}>
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            {src && (o.wide
              ? <img src={src} alt={o.show_name === false ? site.name : ''} style={{ height: size, width: 'auto', maxWidth: size * 5, filter: o.light && !site.logo_dark_url ? 'brightness(0) invert(1)' : undefined }} className="flex-shrink-0 object-contain" />
              : <img src={src} alt={o.show_name === false ? site.name : ''} style={{ width: size, height: size }} className="flex-shrink-0 rounded-full bg-white object-cover" />)}
            {o.show_name !== false && (
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-heading text-lg font-bold tracking-wide">{site.name}</span>
                {o.show_tagline !== false && site.tagline && (
                  <span className={`truncate text-[11px] font-semibold uppercase tracking-[2px] ${o.light ? 'opacity-70' : 'text-primary-600'}`}>{site.tagline}</span>
                )}
              </span>
            )}
          </Link>
          {o.show_about && site.footer_text && <p className="mt-4 max-w-md text-sm leading-relaxed opacity-80">{site.footer_text}</p>}
        </div>
      )
    }
    case 'nav_menu': {
      const items = navItems(o, data, t)
      if (o.layout === 'vertical') {
        return (
          <nav className={depth === 0 ? container : ''}>
            {o.title && <div className="mb-3 font-bold">{o.title}</div>}
            <ul className="flex flex-col gap-2.5 text-sm">
              {items.map((item, i) => (
                <li key={i}>
                  <Anchor link={item} className="opacity-85 transition-opacity hover:opacity-100 hover:underline" />
                  {!!item.children?.length && (
                    <ul className="ms-3 mt-2 flex flex-col gap-2 opacity-80">
                      {item.children.map((c, j) => <li key={j}><Anchor link={c} className="hover:underline" /></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )
      }
      const mobile = o.mobile || 'drawer'
      return (
        <div className={`${depth === 0 ? container : ''} flex items-center`}>
          <nav className={`${mobile === 'inline' ? 'flex' : 'hidden lg:flex'} flex-1 flex-wrap items-center gap-x-6 gap-y-1 text-[15px] font-semibold ${JUSTIFY[o.align] || ''}`}>
            {items.map((item, i) => item.children?.length
              ? <Dropdown key={i} item={item} />
              : <Anchor key={i} link={item} className="py-2 transition-opacity hover:opacity-70" />)}
          </nav>
          {mobile === 'drawer' && (
            <div className="lg:hidden">
              <MobileMenu items={items} label={t('nav.menu')} extra={<LanguageSwitcher />}
                donate={o.drawer_donate !== false ? { label: t('nav.donate'), url: '/kampanyalar' } : null} />
            </div>
          )}
        </div>
      )
    }
    case 'donate_button': {
      const size = { sm: 'px-4 py-2 text-sm', md: 'px-5 py-2.5', lg: 'px-7 py-3.5 text-lg' }[o.size as string] || 'px-5 py-2.5'
      return (
        <div className={depth === 0 ? container : ''}>
          <Anchor link={{ label: o.label || t('nav.donate'), url: o.url || '/kampanyalar' }}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg font-bold transition-colors ${BUTTON_VARIANT[o.style] || BUTTON_VARIANT.primary} ${size}`}>
            {o.heart && <span aria-hidden>♥</span>}{o.label || t('nav.donate')}
          </Anchor>
        </div>
      )
    }
    case 'language_switcher':
      if ((data.site.languages || []).length < 2) {
        return opts.editing ? <span className="rounded border border-dashed px-2 py-1 text-xs opacity-60">🌐 Dil seçici (tek dil açık)</span> : null
      }
      return <div className={depth === 0 ? container : ''}><LanguageSwitcher /></div>
    case 'social_icons': {
      const links = Object.entries(data.site.social_links || {})
      if (!links.length) return opts.editing ? <span className="text-xs opacity-60">Sosyal medya bağlantısı yok (Görünüm & Tema)</span> : null
      const cls = {
        round: 'flex h-9 w-9 items-center justify-center rounded-full bg-current/10 text-xs font-bold hover:bg-current/20',
        text: 'text-sm hover:underline underline-offset-4',
      }[o.style as string] || 'rounded-full border border-current/20 px-3 py-1 text-sm hover:bg-current/10'
      return (
        <div className={`${depth === 0 ? container : ''} flex flex-wrap gap-3 ${JUSTIFY[o.align] || ''}`}>
          {links.map(([network, href]) => {
            const [name, short] = SOCIAL_LABELS[network] || [network, network]
            return <a key={network} href={href} target="_blank" rel="noopener noreferrer" aria-label={name} className={cls}>{o.style === 'round' ? short : name}</a>
          })}
        </div>
      )
    }
    case 'contact_info': {
      const c = data.site.contact
      const rows = [
        o.show_phone !== false && c.phone && <a key="p" href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>,
        o.show_email !== false && c.email && <a key="e" href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>,
        o.show_address && c.address && <span key="a">{c.address}</span>,
      ].filter(Boolean)
      if (!rows.length) return opts.editing ? <span className="text-xs opacity-60">İletişim bilgisi yok (Site Ayarları)</span> : null
      return (
        <div className={depth === 0 ? container : ''}>
          {o.title && <div className="mb-3 font-bold">{o.title}</div>}
          <div className={o.layout === 'stacked' ? 'flex flex-col gap-2 text-sm' : 'flex flex-wrap items-center gap-x-5 gap-y-1'}>{rows}</div>
        </div>
      )
    }
    case 'account_links':
      return (
        <div className={`${depth === 0 ? container : ''} ${o.layout === 'stacked' ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-4'} text-sm`}>
          {o.show_portal !== false && <Link href="/portal" className="font-semibold hover:underline">{t('nav.donorLogin')}</Link>}
          {o.show_verify !== false && <Link href="/verify" className="hover:underline">{t('nav.verifyReceipt')}</Link>}
        </div>
      )
    case 'copyright': {
      const year = String(new Date().getFullYear())
      const text = o.text ? String(o.text).replace(/\{(yıl|year)\}/g, year) : `© ${year} ${data.site.name}`
      return (
        <div className={container}>
          <div className="border-t pt-4 text-center text-xs opacity-70" style={{ borderColor: 'color-mix(in srgb, currentColor 15%, transparent)' }}>
            {text}{o.show_powered !== false && ' · E-İnfak altyapısıyla'}
          </div>
        </div>
      )
    }
    case 'columns': {
      const ratio = o.ratio || '1-1'
      const cols = o.stack_on === 'never' ? RATIOS_ALWAYS[ratio] : o.stack_on === 'mobile' ? RATIOS_MOBILE_ONLY[ratio] : RATIOS[ratio]
      const rev = o.reverse_mobile && o.stack_on !== 'never'
        ? (o.stack_on === 'mobile'
          ? 'max-sm:[&>*:first-child]:order-2 max-sm:[&>*:last-child]:order-1'
          : 'max-md:[&>*:first-child]:order-2 max-md:[&>*:last-child]:order-1')
        : ''
      return (
        <div className={`${container} grid ${cols || 'md:grid-cols-2'} ${ALIGN_ITEMS[o.valign] || ''} ${rev}`} style={{ gap: `${o.gap ?? 24}px` }}>
          {children(block.children)}
        </div>
      )
    }
    case 'column':
      return <div className="b-col min-w-0">{children(block.children)}</div>
    case 'spacer':
      return <div style={{ height: `${o.height ?? 48}px` }} aria-hidden />
    case 'divider':
      return (
        <div className={container}>
          <hr className="mx-auto border-0 border-t" style={{ width: `${o.width ?? 100}%`, borderTopStyle: o.line || 'solid', borderTopColor: o.color || 'rgba(0,0,0,.12)' }} />
        </div>
      )
    default: {
      const extra = extraContent(block, o, { locale: data.locale, editing: opts.editing, container })
      if (extra !== undefined) return extra
      return opts.editing ? <p className="p-4 text-center text-sm text-red-500">Bilinmeyen blok: {block.type}</p> : null
    }
  }
}

export function renderBlock(block: Block, opts: RenderOptions, depth = 0): ReactNode {
  const advanced = block.advanced || {}
  if (!opts.editing && advanced.langs && advanced.langs !== opts.data.locale) return null
  const o = opts.data.locale !== 'tr' ? localizedProps(block, opts.data.locale) : block.props
  const hasOverlay = Object.values(block.style || {}).some((s) => s && s.overlay_color)
  const bleed = FULL_BLEED.has(block.type) || (block.type === 'counters' && o.look === 'band')
  const padded = !bleed && !['column', 'spacer', 'divider'].includes(block.type) && depth === 0
  const tone = (block.type === 'section' || block.type === 'header_row') ? TONE[o.tone || (block.type === 'header_row' ? 'light' : '')] : ''
  const row = block.type === 'header_row'
    ? `${o.border !== false ? ' border-b border-black/5' : ''}${o.sticky && !opts.editing ? ` hrow-sticky${o.shrink !== false ? ' is-shrink' : ''}` : ''}`
    : ''
  let node: ReactNode = (
    <div key={block.id} id={advanced.anchor || undefined} aria-label={advanced.aria_label || undefined}
      className={`b-block b-${block.id}${padded ? ' b-pad' : ''}${bleed && block.type !== 'header_row' ? ' b-fill' : ''}${tone ? ` ${tone}` : ''}${row}${advanced.css_class ? ` ${advanced.css_class}` : ''}`}>
      {hasOverlay && <div className="b-overlay" aria-hidden />}
      <div className="b-inner">{content(block, o, opts, depth)}</div>
    </div>
  )
  if (advanced.animation && !opts.editing) {
    node = <Reveal key={block.id} animation={advanced.animation} delay={advanced.animation_delay} duration={advanced.animation_duration}>{node}</Reveal>
  }
  return opts.wrap ? opts.wrap(block, node, depth) : node
}

export function BlockStyles({ blocks, editing }: { blocks: Block[]; editing?: boolean }) {
  return <style dangerouslySetInnerHTML={{ __html: BASE_CSS + compileCss(blocks, editing) }} />
}

export function BlockRenderer({ blocks, ...opts }: RenderOptions & { blocks: Block[] }) {
  return (
    <>
      <BlockStyles blocks={blocks} />
      {blocks.map((b) => renderBlock(b, opts))}
    </>
  )
}
