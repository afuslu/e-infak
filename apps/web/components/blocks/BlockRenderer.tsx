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
import { DismissibleNotice, SearchableFaq, VideoPosterPlayer } from './ExtraClient'

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
.bmq-rev{animation-direction:reverse}
.bmq-nopause:hover{animation-play-state:running}
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
  'hero', 'slider', 'carousel', 'stats', 'zakat_band', 'cta_band', 'trust', 'banner', 'header_row',
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
  } else if (o.source === 'category' && o.category_slug) {
    chosen = active.filter((c) => c.category === o.category_slug || (c.tags || []).includes(o.category_slug))
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
    const suggestedAmounts = (c.suggested_amounts_cents || []).map((v) => Math.round(v / 100)).filter((v) => v > 0)
    const progress =
      c.show_collected !== false && c.target_lira > 0
        ? { collected: c.collected_lira || 0, target: c.target_lira, pct: Math.min(100, Math.round(c.progress_percentage || 0)) }
        : null
    return {
      key: `${c.id}`, campaignId: c.id, slug: c.slug, title: c.title, summary: c.summary, category: c.category,
      image: c.cover_image_url, currency: (c.currency || 'TRY') as DonationCardView['currency'],
      unit, minAmount: (c.min_donation_cents || 100) / 100, quantity: s.quantity || '', maxQuantity: s.max_quantity || 21,
      niyet: list(s.niyet), durations: list(s.durations).map(Number).filter((n) => n > 0),
      shares: total ? { taken: Math.min(taken, total), total } : null, progress, suggestedAmounts,
      note: s.note, button: s.button_label || o.button_label || label, tags: c.tags || [],
    }
  })
}

/** Theme-following backgrounds of sections and header rows (a Stil background overrides them). */
const TONE: Record<string, string> = {
  light: 'bg-white/95 text-gray-900 backdrop-blur',
  soft: 'bg-primary-50 text-gray-900',
  brand: 'bg-primary-700 text-white',
  accent: 'bg-accent-500 text-white',
  dark: 'bg-primary-950 text-primary-100',
}
const SOCIAL_LABELS: Record<string, [string, string]> = {
  facebook: ['Facebook', 'f'],
  instagram: ['Instagram', 'IG'],
  x: ['X', 'X'],
  youtube: ['YouTube', '▶'],
  linkedin: ['LinkedIn', 'in'],
  telegram: ['Telegram', '✈'],
  whatsapp: ['WhatsApp', 'WA'],
  tiktok: ['TikTok', 'TT'],
  threads: ['Threads', '@'],
  pinterest: ['Pinterest', 'P'],
}
const SOCIAL_META: Record<string, { color: string; path: string }> = {
  facebook: { color: '#1877F2', path: 'M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z' },
  instagram: { color: '#E4405F', path: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  x: { color: '#111827', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  youtube: { color: '#FF0000', path: 'M21.58 7.19a2.75 2.75 0 0 0-1.94-1.95C17.93 4.78 12 4.78 12 4.78s-5.93 0-7.64.46A2.75 2.75 0 0 0 2.42 7.19 28.7 28.7 0 0 0 2 12a28.7 28.7 0 0 0 .42 4.81 2.75 2.75 0 0 0 1.94 1.95c1.71.46 7.64.46 7.64.46s5.93 0 7.64-.46a2.75 2.75 0 0 0 1.94-1.95A28.7 28.7 0 0 0 22 12a28.7 28.7 0 0 0-.42-4.81zM10 15.17V8.83L15.5 12 10 15.17z' },
  linkedin: { color: '#0A66C2', path: 'M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z' },
  telegram: { color: '#26A5E4', path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' },
  whatsapp: { color: '#25D366', path: 'M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m5.81 14.07c-.24.68-1.41 1.3-1.95 1.38-.52.08-1.18.11-1.9-.12-.44-.14-1-.33-1.72-.64-3.03-1.31-5-4.37-5.15-4.57-.15-.2-1.23-1.64-1.23-3.13s.78-2.22 1.05-2.52c.28-.3.6-.38.8-.38h.58c.19 0 .44-.07.69.53.25.61.85 2.09.92 2.24.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.32.4-.45.54-.15.15-.31.31-.13.62.18.3.78 1.29 1.68 2.09 1.15 1.03 2.13 1.35 2.43 1.5.3.15.48.13.66-.08.18-.2.76-.88.96-1.19.2-.3.4-.25.68-.15.28.1 1.77.83 2.07.98.3.15.5.23.58.35.07.13.07.73-.17 1.41z' },
  tiktok: { color: '#111827', path: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3 15.28a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.76a8.26 8.26 0 0 0 4.79 1.53V6.85a4.82 4.82 0 0 1-.88-.16z' },
  threads: { color: '#111827', path: 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32l-1.757-1.18c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z' },
  pinterest: { color: '#BD081C', path: 'M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.86 6.39 9.29-.09-.78-.17-1.98.04-2.83.18-.77 1.18-5.01 1.18-5.01s-.3-.6-.3-1.49c0-1.4.81-2.44 1.82-2.44.86 0 1.27.64 1.27 1.41 0 .86-.55 2.15-.83 3.34-.24 1 .5 1.81 1.48 1.81 1.78 0 3.14-1.88 3.14-4.59 0-2.4-1.72-4.08-4.19-4.08-2.85 0-4.53 2.14-4.53 4.35 0 .86.33 1.78.75 2.28.08.1.09.19.07.29-.08.31-.25 1-.28 1.14-.04.18-.15.22-.34.13-1.25-.58-2.03-2.41-2.03-3.88 0-3.16 2.3-6.06 6.62-6.06 3.48 0 6.18 2.48 6.18 5.79 0 3.45-2.18 6.23-5.2 6.23-1.02 0-1.97-.53-2.3-1.15l-.62 2.38c-.23.87-.84 1.97-1.25 2.63.94.29 1.94.45 2.98.45 5.52 0 10-4.48 10-10S17.52 2 12 2z' },
}
const BUTTON_VARIANT: Record<string, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  accent: 'bg-accent-500 text-white hover:bg-accent-600',
  danger: 'bg-[#E30A17] text-white shadow-md shadow-red-600/25 hover:bg-red-700',
  gradient: 'bg-gradient-to-r from-primary-600 to-accent-500 text-white shadow-md hover:opacity-95',
  soft: 'bg-primary-50 text-primary-800 ring-1 ring-primary-200/70 hover:bg-primary-100',
  outline: 'border-[1.5px] border-current hover:bg-black/5',
  glass: 'border border-white/30 bg-white/15 text-white backdrop-blur-md hover:bg-white/25',
  dark: 'bg-gray-900 text-white hover:bg-gray-800',
  light: 'bg-white text-gray-900 hover:bg-gray-100',
  link: 'px-0 underline underline-offset-4',
}

function Anchor({ link, className, children }: { link: NavLinkView; className: string; children?: ReactNode }) {
  const body = children ?? (link.badge ? (
    <span className="inline-flex items-center gap-1.5">
      {link.label}
      <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-600">
        {link.badge}
      </span>
    </span>
  ) : link.label)
  if (!link.url) return <span className={className}>{body}</span>
  if (link.url.startsWith('/') && !link.new_tab) return <Link href={link.url} className={className}>{body}</Link>
  return <a href={link.url} className={className} target={link.new_tab ? '_blank' : undefined} rel="noopener noreferrer">{body}</a>
}

/** Links of a Menü block: its own items, or the Menü screen's header/footer links. */
function navItems(o: Record<string, any>, data: HomeData, t: ReturnType<typeof translator>): NavItemView[] {
  if (o.source === 'custom') {
    return (o.items || []).filter((i: any) => i?.label).map((i: any) => ({
      label: i.label, url: i.url, new_tab: i.new_tab, mega: i.mega, badge: i.badge,
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

function Dropdown({ item, locale, itemCls = 'py-2 transition-opacity hover:opacity-70' }: { item: NavItemView; locale: string; itemCls?: string }) {
  const children = item.children || []
  return (
    <div className="group relative">
      {item.url ? (
        <Anchor link={item} className={`inline-flex items-center gap-1 ${itemCls}`}>
          {item.label}
          {item.badge && (
            <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-600">
              {item.badge}
            </span>
          )}
          <span aria-hidden className="text-[10px] opacity-60 transition-transform group-hover:rotate-180">▾</span>
        </Anchor>
      ) : (
        // No link of its own: a button, so keyboard focus opens the panel (focus-within)
        <button type="button" aria-haspopup="true" className={`inline-flex items-center gap-1 font-semibold ${itemCls}`}>
          {item.label}
          {item.badge && (
            <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-accent-600">
              {item.badge}
            </span>
          )}
          <span aria-hidden className="text-[10px] opacity-60 transition-transform group-hover:rotate-180">▾</span>
        </button>
      )}
      <div className={`invisible absolute top-full z-50 pt-2 opacity-0 transition duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${item.mega ? 'left-1/2 w-[min(92vw,880px)] -translate-x-1/2' : 'start-0 min-w-56'}`}>
        <div className="rounded-xl border border-black/5 bg-white p-3 text-start text-[14px] font-normal text-gray-800 shadow-xl">
          {item.mega ? (
            <div className="grid gap-5 p-2" style={{ gridTemplateColumns: `repeat(${Math.min(groupLinks(children).length, 4)}, minmax(0, 1fr))` }}>
              {groupLinks(children).map(([group, links]) => (
                <div key={group} className="mega-col min-w-0">
                  {group && <div className="mb-2 text-[12px] font-bold tracking-wider text-primary-700">{group.toLocaleUpperCase(locale)}</div>}
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

function Btn({ href, children, variant = 'primary', newTab, extraCls = '' }: { href: string; children: ReactNode; variant?: string; newTab?: boolean; extraCls?: string }) {
  const cls = BUTTON_VARIANT[variant] || BUTTON_VARIANT.primary
  const className = `inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 font-bold transition-all ${cls} ${extraCls}`.trim()
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
  '1-1': 'md:grid-cols-2',
  '1-2': 'md:grid-cols-[1fr_2fr]',
  '2-1': 'md:grid-cols-[2fr_1fr]',
  '1-3': 'md:grid-cols-[1fr_3fr]',
  '3-1': 'md:grid-cols-[3fr_1fr]',
  '2-3': 'md:grid-cols-[2fr_3fr]',
  '3-2': 'md:grid-cols-[3fr_2fr]',
  '1-1-1': 'md:grid-cols-3',
  '1-2-1': 'md:grid-cols-[1fr_2fr_1fr]',
  '2-1-1': 'md:grid-cols-[2fr_1fr_1fr]',
  '1-1-2': 'md:grid-cols-[1fr_1fr_2fr]',
  '1-1-1-1': 'md:grid-cols-2 lg:grid-cols-4',
  '1-1-1-1-1': 'md:grid-cols-3 lg:grid-cols-5',
  '1-1-1-1-1-1': 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
}
const RATIOS_MOBILE_ONLY: Record<string, string> = {
  '1-1': 'sm:grid-cols-2',
  '1-2': 'sm:grid-cols-[1fr_2fr]',
  '2-1': 'sm:grid-cols-[2fr_1fr]',
  '1-3': 'sm:grid-cols-[1fr_3fr]',
  '3-1': 'sm:grid-cols-[3fr_1fr]',
  '2-3': 'sm:grid-cols-[2fr_3fr]',
  '3-2': 'sm:grid-cols-[3fr_2fr]',
  '1-1-1': 'sm:grid-cols-3',
  '1-2-1': 'sm:grid-cols-[1fr_2fr_1fr]',
  '2-1-1': 'sm:grid-cols-[2fr_1fr_1fr]',
  '1-1-2': 'sm:grid-cols-[1fr_1fr_2fr]',
  '1-1-1-1': 'sm:grid-cols-4',
  '1-1-1-1-1': 'sm:grid-cols-5',
  '1-1-1-1-1-1': 'sm:grid-cols-6',
}
const RATIOS_ALWAYS: Record<string, string> = {
  '1-1': 'grid-cols-2',
  '1-2': 'grid-cols-[1fr_2fr]',
  '2-1': 'grid-cols-[2fr_1fr]',
  '1-3': 'grid-cols-[1fr_3fr]',
  '3-1': 'grid-cols-[3fr_1fr]',
  '2-3': 'grid-cols-[2fr_3fr]',
  '3-2': 'grid-cols-[3fr_2fr]',
  '1-1-1': 'grid-cols-3',
  '1-2-1': 'grid-cols-[1fr_2fr_1fr]',
  '2-1-1': 'grid-cols-[2fr_1fr_1fr]',
  '1-1-2': 'grid-cols-[1fr_1fr_2fr]',
  '1-1-1-1': 'grid-cols-4',
  '1-1-1-1-1': 'grid-cols-5',
  '1-1-1-1-1-1': 'grid-cols-6',
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
      return <Hero data={data} variant={o.variant || data.site.template} o={o} editing={opts.editing} />
    case 'slider': {
      const slides: SlideView[] = (o.slides || []).map((s: Record<string, any>) => {
        const c = campaignById(s.campaign_id)
        return {
          ...s,
          donateLabel: t('campaign.donate'),
          campaign: c ? { slug: c.slug, title: c.title, collected: money(c, data.locale, 'collected'), target: money(c, data.locale, 'target'), progress: c.progress_percentage || 0 } : null,
        }
      })
      return <Slider slides={slides} height={o.height} mobileHeight={o.mobile_height} autoplay={o.autoplay !== false} interval={o.interval} effect={o.effect} arrows={o.arrows !== false} arrowStyle={o.arrow_style} dots={o.dots !== false} layout={o.layout} nav={o.nav} showPause={o.show_pause !== false} editing={opts.editing} />
    }
    case 'quick_donation': {
      const c = campaignById(o.campaign_id) || data.campaigns[0]
      const look = (o.look || 'card') as 'card' | 'band' | 'compact' | 'split' | 'inline' | 'glass' | 'single_step'
      const parseAmounts = (raw?: string) =>
        (raw || '').split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0)
      const parseLabels = (raw?: string) => {
        const out: Record<number, string> = {}
        for (const part of (raw || '').split(',')) {
          const [numStr, ...rest] = part.split(':')
          const num = Number((numStr || '').trim())
          const lbl = rest.join(':').trim()
          if (Number.isFinite(num) && num > 0 && lbl) out[num] = lbl
        }
        return out
      }
      const customAmounts = parseAmounts(o.suggested_amounts)
      const campAmounts = (c?.suggested_amounts_cents || []).map((cents) => Math.round(cents / 100)).filter((n) => n > 0)
      const suggestedAmounts = customAmounts.length ? customAmounts : campAmounts.length ? campAmounts : undefined
      const campaignOptions = data.campaigns.map((camp) => ({
        id: camp.id,
        title: camp.title,
        image_url: camp.cover_image_url || undefined,
        summary: camp.summary || undefined,
        collected: money(camp, data.locale, 'collected'),
        target: money(camp, data.locale, 'target'),
        progress: camp.progress_percentage || 0,
        suggestedAmounts: (camp.suggested_amounts_cents || []).map((cents) => Math.round(cents / 100)).filter((n) => n > 0),
        checkoutFieldsSchema: (camp as any).checkout_fields_schema || [],
      }))
      const wrapCls = look === 'band'
        ? 'bg-primary-50 py-10'
        : look === 'glass'
          ? 'bg-gradient-to-br from-primary-950 via-primary-900 to-gray-950 py-12'
          : ''
      const innerCls = look === 'split' || look === 'inline'
        ? 'mx-auto max-w-5xl px-4 sm:px-6'
        : look === 'compact'
          ? 'mx-auto max-w-md px-4 sm:px-6'
          : 'mx-auto max-w-xl px-4 sm:px-6'
      return (
        <div id="hizli-bagis" className={wrapCls}>
          <div className={innerCls}>
            {o.title && (
              <h2 className={`mb-4 text-center font-heading text-2xl font-bold sm:text-3xl ${look === 'glass' ? 'text-white' : ''}`}>
                {o.title}
              </h2>
            )}
            {c ? (
              <QuickDonationForm
                campaignId={c.id}
                campaignTitle={c.title}
                look={look}
                hideTitle={Boolean(o.title)}
                editing={opts.editing}
                suggestedAmounts={suggestedAmounts}
                amountLabels={parseLabels(o.amount_labels)}
                campaigns={campaignOptions}
                allowCampaignSelect={Boolean(o.allow_campaign_select)}
                showProgress={Boolean(o.show_progress)}
                showFrequency={Boolean(o.show_frequency)}
                buttonLabel={o.button_label || undefined}
                campaignInfo={{
                  image_url: c.cover_image_url || undefined,
                  summary: c.summary || undefined,
                  collected: money(c, data.locale, 'collected'),
                  target: money(c, data.locale, 'target'),
                  progress: c.progress_percentage || 0,
                }}
                checkoutFieldsSchema={(c as any).checkout_fields_schema || []}
              />
            ) : (
              <p className="rounded-2xl border bg-white p-6 text-center text-gray-500">{t('home.noCampaignForm')}</p>
            )}
          </div>
        </div>
      )
    }
    case 'campaigns':
      return <Campaigns data={data} t={t} o={o} />
    case 'campaign_card': {
      const fallback = o.fallback_featured !== false
        ? (data.campaigns.find((x) => x.is_featured && x.cover_image_url) || data.campaigns[0])
        : undefined
      const c = (o.campaign_id ? campaignById(o.campaign_id) : undefined) || fallback
      if (!c) return opts.editing ? <p className="p-6 text-center text-sm text-gray-400">Kampanya seçin (yalnızca aktif kampanyalar gösterilir)</p> : null
      const layout = o.layout || 'wide'
      const title = o.title || c.title
      const summary = o.summary || c.summary
      const showProgress = o.show_progress !== false
      const showQuick = o.show_quick_amounts !== false
      const showDetails = o.show_details_button !== false
      const ctaLabel = o.button_label || t('campaign.donate')
      const daysLeft = c.end_date ? Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000) : null
      const validDays = daysLeft !== null && Number.isFinite(daysLeft) && daysLeft > 0 ? daysLeft : null
      const goalReached = (c.progress_percentage || 0) >= 100
      const quickAmounts = showQuick
        ? (c.suggested_amounts_cents || []).map((cents) => Math.round(cents / 100)).filter((n) => n > 0).slice(0, 4)
        : []

      const badges = (
        <div className="flex flex-wrap gap-2">
          {o.kicker && <span className="rounded-full bg-primary-600 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">{o.kicker}</span>}
          {c.is_featured && <span className="rounded-full bg-accent-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">{t('home.campaigns.urgent')}</span>}
          {validDays !== null && validDays <= 15 && !goalReached && <span className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-extrabold text-white">Son {validDays} gün</span>}
          {goalReached && <span className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-extrabold text-white">Hedefe Ulaşıldı ✓</span>}
        </div>
      )

      const quickChips = (darkBg = false) => quickAmounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((amt) => (
            <Link key={amt} href={`/kampanyalar/${c.slug}?tutar=${amt}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                darkBg
                  ? 'border border-white/30 bg-white/15 text-white hover:bg-white hover:text-primary-900'
                  : 'border border-primary-200 bg-primary-50/70 text-primary-800 hover:bg-primary-600 hover:text-white'
              }`}>
              {amt} ₺
            </Link>
          ))}
        </div>
      )

      const actions = (darkBg = false) => (
        <div className="flex flex-wrap gap-3 pt-1">
          <Btn href={`/kampanyalar/${c.slug}`}>{ctaLabel}</Btn>
          {showDetails && (
            <Link href={`/kampanyalar/${c.slug}`}
              className={`inline-flex items-center rounded-xl border px-5 py-3 text-sm font-bold transition ${
                darkBg ? 'border-white/35 text-white hover:bg-white/15' : 'border-gray-200 text-gray-700 hover:border-primary-600 hover:text-primary-700'
              }`}>
              {t('campaign.details')}
            </Link>
          )}
        </div>
      )

      if (layout === 'overlay') {
        return (
          <div className={container}>
            <div className="relative flex min-h-[380px] flex-col justify-end overflow-hidden rounded-3xl bg-gray-900 p-6 text-white shadow-xl sm:min-h-[440px] sm:p-10">
              {c.cover_image_url && <img src={c.cover_image_url} alt={title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
              <div className="relative max-w-2xl space-y-4">
                {badges}
                <h3 className="font-heading text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h3>
                {summary && <p className="text-base leading-relaxed text-white/85">{summary}</p>}
                {showProgress && <div className="max-w-md rounded-2xl bg-white/95 p-3.5 text-gray-900"><ProgressBar c={c} locale={data.locale} /></div>}
                {quickChips(true)}
                {actions(true)}
              </div>
            </div>
          </div>
        )
      }

      if (layout === 'glass') {
        return (
          <div className={container}>
            <div className="grid items-center gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-primary-950 via-primary-900 to-gray-950 p-6 text-white shadow-2xl md:grid-cols-12 sm:p-8">
              <div className="relative min-h-[240px] overflow-hidden rounded-2xl bg-black/25 md:col-span-5 md:min-h-[320px]">
                {c.cover_image_url
                  ? <img src={c.cover_image_url} alt={title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  : <div className="flex h-full min-h-[240px] items-center justify-center text-white/25 text-5xl">♥</div>}
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md md:col-span-7">
                {badges}
                <h3 className="font-heading text-2xl font-bold text-white sm:text-3xl">{title}</h3>
                {summary && <p className="text-sm leading-relaxed text-white/80 sm:text-base">{summary}</p>}
                {showProgress && <div className="rounded-xl bg-white/95 p-3 text-gray-900"><ProgressBar c={c} locale={data.locale} /></div>}
                {quickChips(true)}
                {actions(true)}
              </div>
            </div>
          </div>
        )
      }

      if (layout === 'strip') {
        return (
          <div className={container}>
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
              <div className="relative h-24 w-full flex-none overflow-hidden rounded-xl bg-primary-50 sm:w-36">
                {c.cover_image_url
                  ? <img src={c.cover_image_url} alt={title} className="h-full w-full object-cover" loading="lazy" />
                  : <div className="flex h-full items-center justify-center text-primary-300 text-3xl">♥</div>}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {badges}
                <h3 className="truncate font-heading text-xl font-bold text-gray-900">{title}</h3>
                {showProgress && <div className="max-w-md"><ProgressBar c={c} locale={data.locale} /></div>}
              </div>
              <div className="flex flex-none flex-wrap items-center gap-2.5">
                {quickChips(false)}
                <Btn href={`/kampanyalar/${c.slug}`}>{ctaLabel}</Btn>
              </div>
            </div>
          </div>
        )
      }

      const isUrgent = layout === 'urgent'
      const wide = layout === 'wide' || isUrgent
      const imgRight = wide && o.image_side === 'right'
      return (
        <div className={container}>
          <div className={`overflow-hidden rounded-2xl border shadow-sm ${
            isUrgent ? 'border-accent-300 bg-gradient-to-br from-accent-50/70 via-white to-primary-50/40 ring-2 ring-accent-500/20' : 'bg-white'
          } ${wide ? 'grid md:grid-cols-2' : 'mx-auto max-w-md'}`}>
            <div className={`relative bg-primary-50 ${wide ? 'min-h-[260px]' : 'h-52'} ${imgRight ? 'md:order-2' : ''}`}>
              {c.cover_image_url
                ? <img src={c.cover_image_url} alt={title} className="h-full w-full object-cover" loading="lazy" />
                : <div className="flex h-full min-h-[200px] items-center justify-center text-primary-300 text-5xl">♥</div>}
            </div>
            <div className={`flex flex-col gap-4 p-6 md:p-8 ${imgRight ? 'md:order-1' : ''}`}>
              {badges}
              <h3 className="font-heading text-2xl font-bold text-gray-900">{title}</h3>
              {summary && <p className="text-gray-600">{summary}</p>}
              {showProgress && <ProgressBar c={c} locale={data.locale} />}
              {quickChips(false)}
              {actions(false)}
            </div>
          </div>
        </div>
      )
    }
    case 'categories':
      return <Categories data={data} t={t} o={o} editing={opts.editing} />
    case 'zakat_band':
      return <ZakatBand t={t} o={o} tpl={data.site.template} locale={data.locale} />
    case 'featured_campaign':
      return <FeaturedCampaign data={data} t={t} o={o} editing={opts.editing} />
    case 'steps':
      return <Steps data={data} t={t} o={o} />
    case 'gallery_strip':
      return <GalleryStrip data={data} t={t} o={o} editing={opts.editing} />
    case 'testimonials':
      return <Testimonials data={data} t={t} o={o} />
    case 'cta_band':
      return <CtaBand data={data} o={o} />
    case 'news':
      return <News data={data} t={t} o={o} />
    case 'trust':
      return <Trust data={data} t={t} o={o} />
    case 'stats': {
      if (o.variant === 'card' || o.variant === 'gradient' || o.variant === 'ring') {
        const isGrad = o.variant === 'gradient'
        const isRing = o.variant === 'ring'
        const collected = data.campaigns.filter((c) => (c.currency || 'TRY') === 'TRY').reduce((sum, c) => sum + (c.collected_lira || 0), 0)
        const statItems: Array<{ value: string | number; suffix?: string; label: string; icon_url?: string }> =
          o.mode === 'manual' && Array.isArray(o.items) && o.items.length
            ? o.items
            : ([
              { value: data.campaigns.length, label: t('home.stats.campaigns') },
              { value: Math.round(collected), suffix: ' ₺', label: t('home.stats.collected') },
              data.categories.length ? { value: data.categories.length, label: t('home.stats.categories') } : null,
              { value: data.news.length, label: t('home.stats.news') },
            ].filter(Boolean) as Array<{ value: number; suffix?: string; label: string }>)
        const colCls = ['', 'lg:grid-cols-1 max-w-sm mx-auto', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-6'][Math.min(statItems.length, 6)] || 'lg:grid-cols-4'
        return (
          <div className={`${container} w-full`}>
            {(o.kicker || o.title || o.text) && (
              <div className="mx-auto mb-8 max-w-2xl text-center">
                {o.kicker && <div className="mb-1.5 text-xs font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-2xl font-bold text-gray-900 md:text-3xl">{o.title}</h2>}
                {o.text && <p className="mt-2 text-sm leading-relaxed text-gray-600">{o.text}</p>}
              </div>
            )}
            <div className={`grid grid-cols-2 gap-6 ${colCls} ${isGrad || isRing ? '' : 'gap-y-8 rounded-lg bg-white px-5 py-8 shadow-[0_8px_30px_-8px_rgba(0,0,0,.18)] lg:divide-x lg:divide-gray-100'}`}>
              {statItems.map((item, i) => {
                const raw = String(item.value ?? '')
                const n = typeof item.value === 'number' ? item.value : Number(raw.replace(/\./g, '').replace(',', '.'))
                const isNum = typeof item.value === 'number' || (Number.isFinite(n) && /^[\d.,]+$/.test(raw))
                return (
                  <div key={i} className={`flex flex-col items-center gap-2 text-center ${
                    isGrad ? 'rounded-2xl bg-gradient-to-br from-primary-700 to-primary-900 p-6 text-white shadow-lg' :
                    isRing ? 'rounded-2xl border border-primary-100 bg-white p-6 shadow-sm' : ''
                  }`}>
                    {item.icon_url && <img src={item.icon_url} alt="" className="h-14 w-14 object-contain" loading="lazy" />}
                    <div className={`${isRing ? 'flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary-600 bg-primary-50/50 text-xl' : 'text-3xl md:text-4xl'} font-heading font-bold ${isGrad ? 'text-white' : 'text-gray-900'}`}>
                      {isNum ? <CountUp value={n} locale={data.locale} suffix={item.suffix || ''} /> : raw}
                    </div>
                    <div className={`text-[15px] ${isGrad ? 'text-white/85' : 'text-gray-700'}`}>{item.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }
      return <Stats data={data} t={t} o={o} />
    }
    case 'banner': {
      const c = campaignById(o.campaign_id)
      const isRed = o.tone === 'red' || /e-?devlet|348/i.test(`${o.kicker || ''} ${o.title || ''} ${o.text || ''} ${o.button_label || ''}`)
      const tone = isRed ? 'red' : (o.tone || 'brand')
      const align = o.align === 'center' ? 'items-center text-center' : o.align === 'right' ? 'items-end text-end' : 'items-start'
      const padY = o.height === 'sm' ? 'py-8 md:py-10' : o.height === 'lg' ? 'py-20 md:py-28' : 'py-14 md:py-18'
      const primaryBtn = c
        ? <Btn href={`/kampanyalar/${c.slug}`} variant={isRed ? 'danger' : 'accent'}>{o.button_label || t('campaign.donate')}</Btn>
        : o.button_label && o.button_url
          ? <Btn href={o.button_url} variant={tone === 'light' || o.layout === 'minimal' ? 'primary' : o.layout === 'color' || isRed ? 'light' : 'accent'}>{o.button_label}</Btn>
          : null
      const secondaryBtn = o.button2_label && o.button2_url
        ? <Btn href={o.button2_url} variant={tone === 'light' || o.layout === 'minimal' ? 'outline' : 'light'}>{o.button2_label}</Btn>
        : null
      const actions = (primaryBtn || secondaryBtn) ? (
        <div className={`flex flex-wrap items-center gap-3 pt-1 ${o.align === 'center' ? 'justify-center' : o.align === 'right' ? 'justify-end' : ''}`}>
          {primaryBtn}
          {secondaryBtn}
        </div>
      ) : null
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
          {o.text && <p className={`max-w-2xl ${light ? 'text-white/90' : 'text-gray-600'}`}>{o.text}</p>}
          {c && <div className="w-full max-w-md"><ProgressBar c={c} locale={data.locale} light={light} /></div>}
          {actions}
        </div>
      )

      if (o.layout === 'poster') {
        const img = o.image_url ? (
          <picture>
            {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
            <img src={o.image_url} alt={o.title || 'Banner'} className="h-auto max-h-[520px] w-full object-cover" loading="lazy" />
          </picture>
        ) : null
        return (
          <div className={container}>
            {o.button_url ? (
              <Link href={o.button_url} className="block overflow-hidden rounded-2xl shadow-lg transition hover:opacity-95">{img}</Link>
            ) : (
              <div className="overflow-hidden rounded-2xl shadow-lg">{img}</div>
            )}
          </div>
        )
      }

      if (o.layout === 'minimal') {
        return (
          <div className={container}>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm md:p-12">{text(false)}</div>
          </div>
        )
      }

      if (o.layout === 'stats_banner') {
        const statBg = isRed
          ? 'bg-gradient-to-br from-[#C8102E] to-red-800 text-white'
          : tone === 'dark'
            ? 'bg-gradient-to-br from-primary-950 via-primary-900 to-gray-900 text-white'
            : tone === 'accent'
              ? 'bg-gradient-to-br from-accent-600 to-accent-500 text-white'
              : 'bg-gradient-to-br from-primary-800 to-primary-700 text-white'
        return (
          <div className={container}>
            <div className={`grid items-center gap-8 overflow-hidden rounded-3xl p-8 shadow-xl md:grid-cols-[1.3fr_0.7fr] md:p-12 ${statBg}`}>
              <div>{text(true)}</div>
              <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center backdrop-blur-md">
                {o.stat_value && <div className="font-heading text-4xl font-extrabold text-accent-300 md:text-5xl">{o.stat_value}</div>}
                {o.stat_label && <div className="mt-2 text-sm font-semibold text-white/90">{o.stat_label}</div>}
              </div>
            </div>
          </div>
        )
      }

      if (o.layout === 'split') {
        const splitTone = isRed
          ? 'bg-gradient-to-br from-[#C8102E] to-red-700 text-white shadow-xl shadow-red-900/15'
          : tone === 'dark'
            ? 'bg-primary-950 text-white shadow-xl'
            : 'bg-primary-50'
        const isDarkSplit = isRed || tone === 'dark'
        return (
          <div className={container}>
            <div className={`grid items-center gap-8 overflow-hidden rounded-2xl md:grid-cols-2 ${splitTone}`}>
              {o.image_url && (
                <img
                  src={o.image_url}
                  alt=""
                  className={`h-full max-h-[420px] w-full object-cover ${o.reverse ? 'md:order-2' : ''}`}
                  loading="lazy"
                />
              )}
              <div className="p-8">{text(isDarkSplit)}</div>
            </div>
          </div>
        )
      }

      if (o.layout === 'boxed') {
        return (
          <div className={container}>
            <div className={`relative overflow-hidden rounded-3xl shadow-xl ${isRed ? 'bg-red-950' : 'bg-primary-950'}`}>
              {o.image_url && (
                <picture>
                  {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
                  <img src={o.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" loading="lazy" />
                </picture>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-gray-950/80 via-gray-950/55 to-gray-950/30" />
              <div className={`relative p-8 md:p-14 ${padY}`}>{text(true)}</div>
            </div>
          </div>
        )
      }

      if (o.layout === 'video') {
        return (
          <div className={`relative flex flex-col justify-center overflow-hidden ${isRed ? 'bg-red-950' : 'bg-primary-950'}`}>
            {o.video_url ? (
              <video
                src={o.video_url}
                poster={o.image_url || undefined}
                autoPlay
                muted
                loop
                playsInline
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
              />
            ) : o.image_url ? (
              <img src={o.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55" loading="lazy" />
            ) : null}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950/80 via-gray-950/50 to-gray-950/40" />
            <div className={`relative ${container} w-full ${padY}`}>{text(true)}</div>
          </div>
        )
      }

      if (o.layout === 'gradient') {
        return (
          <div className="flex flex-col justify-center bg-gradient-to-r from-primary-700 via-primary-600 to-accent-500">
            <div className={`${container} w-full ${padY}`}>{text(true)}</div>
          </div>
        )
      }

      if (o.layout === 'color' || (isRed && !o.image_url)) {
        const colorBg = isRed
          ? 'bg-gradient-to-r from-[#C8102E] via-[#E30A17] to-red-700 shadow-lg shadow-red-900/15'
          : tone === 'dark'
            ? 'bg-primary-950'
            : tone === 'accent'
              ? 'bg-accent-600'
              : tone === 'light'
                ? 'bg-primary-50'
                : 'bg-primary-700'
        return (
          <div className={`flex flex-col justify-center ${colorBg}`}>
            <div className={`${container} w-full ${padY}`}>{text(tone !== 'light')}</div>
          </div>
        )
      }

      const glassAlign = o.align === 'center' ? 'mx-auto' : o.align === 'right' ? 'ms-auto' : ''
      return (
        <div className={`relative flex flex-col justify-center overflow-hidden ${isRed ? 'bg-red-950' : 'bg-primary-950'}`}>
          {o.image_url && (
            <picture>
              {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
              <img src={o.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" loading="lazy" />
            </picture>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-gray-950/70 via-gray-950/45 to-transparent" />
          <div className={`relative ${container} w-full ${padY}`}>
            {o.layout === 'glass'
              ? <div className={`max-w-2xl rounded-3xl border border-white/25 bg-black/45 p-7 shadow-2xl backdrop-blur-md sm:p-10 ${glassAlign}`}>{text(true)}</div>
              : text(true)}
          </div>
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
          <DonationCards
            cards={donationCards(o, data, t('campaign.donate'))}
            tabs={o.source === 'tabs' ? (o.tabs || []).filter((x: any) => x.tag && x.label) : undefined}
            layout={o.layout}
            columns={o.columns}
            cardStyle={o.card_style}
            autoplay={o.autoplay !== false}
            switcher={o.currency_switcher}
            showProgress={Boolean(o.show_progress)}
            showSummary={Boolean(o.show_summary)}
            allowRecurring={Boolean(o.allow_recurring)}
            ctaLabel={o.cta_label}
            ctaUrl={o.cta_url}
            locale={data.locale}
            editing={opts.editing}
            title={o.title}
          />
        </div>
      )
    case 'announcement_bar':
      return (
        <AnnouncementBar
          id={block.id}
          text={o.text}
          url={o.url}
          tone={o.tone}
          icon={o.icon}
          look={o.look}
          badge={o.badge}
          buttonLabel={o.button_label}
          endDate={o.end_date}
          items={o.items}
          sticky={Boolean(o.sticky)}
          locale={data.locale}
          closable={o.closable !== false}
          hideDays={o.hide_days ?? 1}
          editing={opts.editing}
        />
      )
    case 'contact_form':
      return <ContactFormBlock kicker={o.kicker} title={o.title} text={o.text} look={o.look} image={o.image_url} badgeValue={o.badge_value} badgeText={o.badge_text}
        subjects={o.subjects} kvkkText={o.kvkk_text} successText={o.success_text}
        contactPhone={o.contact_phone || data.site.contact?.phone || undefined}
        contactEmail={o.contact_email || data.site.contact?.email || undefined}
        contactAddress={o.contact_address || data.site.contact?.address || undefined}
        workingHours={o.working_hours}
        button={o.button_label} askEmail={o.ask_email !== false} editing={opts.editing} />
    case 'mobile_tab_bar':
      return <MobileTabBar items={o.items || []} editing={opts.editing} />
    case 'currency_switcher': {
      const alignCls = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      return (
        <div className={`${depth === 0 ? container : ''} ${alignCls}`.trim()}>
          <CurrencySwitcher
            variant={o.style}
            light={Boolean(o.light)}
            labelMode={o.label_mode}
            size={o.size}
            align={o.align}
            showRate={Boolean(o.show_rate)}
          />
        </div>
      )
    }
    case 'cart_button': {
      const defaultLabel = data.locale === 'en' ? 'Cart' : data.locale === 'ar' ? 'السلة' : 'Sepetim'
      const alignCls = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      return (
        <div className={`${depth === 0 ? container : ''} ${alignCls}`.trim()}>
          <CartButton
            label={o.label || defaultLabel}
            showLabel={Boolean(o.show_label)}
            url={o.url || '/bagis/sepetim'}
            look={o.look}
            icon={o.icon}
            showTotal={Boolean(o.show_total)}
            showZero={Boolean(o.show_zero)}
            hideEmpty={Boolean(o.hide_empty)}
            size={o.size}
            editing={opts.editing}
          />
        </div>
      )
    }
    case 'notice': {
      const toneKey = (o.tone as string) || 'info'
      const look = (o.look as string) || 'soft'
      const defaultIcon: Record<string, string> = {
        info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨', brand: '📣', neutral: '📌',
      }
      const icon = o.icon || defaultIcon[toneKey] || 'ℹ️'
      const softMap: Record<string, string> = {
        info: 'border-sky-200 bg-sky-50 text-sky-900',
        success: 'border-green-200 bg-green-50 text-green-900',
        warning: 'border-amber-200 bg-amber-50 text-amber-900',
        danger: 'border-red-200 bg-red-50 text-red-900',
        brand: 'border-primary-200 bg-primary-50 text-primary-950',
        neutral: 'border-gray-200 bg-gray-50 text-gray-900',
      }
      const accentMap: Record<string, string> = {
        info: 'border-gray-200 border-s-4 border-s-sky-500 bg-sky-50/40 text-sky-950',
        success: 'border-gray-200 border-s-4 border-s-green-600 bg-green-50/40 text-green-950',
        warning: 'border-gray-200 border-s-4 border-s-amber-500 bg-amber-50/40 text-amber-950',
        danger: 'border-gray-200 border-s-4 border-s-red-600 bg-red-50/40 text-red-950',
        brand: 'border-gray-200 border-s-4 border-s-primary-600 bg-primary-50/40 text-primary-950',
        neutral: 'border-gray-200 border-s-4 border-s-gray-500 bg-gray-50 text-gray-900',
      }
      const solidMap: Record<string, string> = {
        info: 'border-sky-700 bg-sky-700 text-white',
        success: 'border-green-700 bg-green-700 text-white',
        warning: 'border-amber-600 bg-amber-600 text-white',
        danger: 'border-red-700 bg-red-700 text-white',
        brand: 'border-primary-700 bg-primary-700 text-white',
        neutral: 'border-gray-800 bg-gray-800 text-white',
      }
      const outlineMap: Record<string, string> = {
        info: 'border-2 border-sky-400 bg-white text-sky-950',
        success: 'border-2 border-green-500 bg-white text-green-950',
        warning: 'border-2 border-amber-400 bg-white text-amber-950',
        danger: 'border-2 border-red-500 bg-white text-red-950',
        brand: 'border-2 border-primary-500 bg-white text-primary-950',
        neutral: 'border-2 border-gray-300 bg-white text-gray-900',
      }
      const isSolid = look === 'solid'
      const boxCls =
        isSolid
          ? solidMap[toneKey] || solidMap.info
          : look === 'accent_left'
            ? accentMap[toneKey] || accentMap.info
            : look === 'outline' || look === 'official'
              ? outlineMap[toneKey] || outlineMap.info
              : softMap[toneKey] || softMap.info
      return (
        <div className={depth === 0 ? container : ''}>
          <DismissibleNotice id={block.id} closable={Boolean(o.closable)} editing={opts.editing} dark={isSolid}>
            <div className={`rounded-2xl border p-5 sm:p-6 ${o.closable ? 'pe-11' : ''} ${boxCls} ${look === 'official' ? 'shadow-sm' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${isSolid ? 'bg-white/15' : 'bg-white/80 shadow-sm'}`} aria-hidden>
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {o.badge && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${
                          isSolid ? 'bg-white/20 text-white' : 'bg-black/10 text-current'
                        }`}>
                          {o.badge}
                        </span>
                      )}
                      {o.title && <div className="font-heading text-base font-bold sm:text-lg">{o.title}</div>}
                    </div>
                    {o.text && <p className={`mt-1 whitespace-pre-line text-sm leading-relaxed ${isSolid ? 'text-white/90' : 'opacity-90'}`}>{o.text}</p>}
                  </div>
                </div>
                {o.button_label && o.button_url && (
                  <Link
                    href={o.button_url}
                    className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
                      isSolid
                        ? 'bg-white text-gray-900 hover:bg-gray-100'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {o.button_label} →
                  </Link>
                )}
              </div>
            </div>
          </DismissibleNotice>
        </div>
      )
    }
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(o.level) ? o.level : 'h2') as 'h2'
      const size = { h1: 'text-4xl md:text-5xl', h2: 'text-3xl md:text-[36px]', h3: 'text-2xl', h4: 'text-xl', h5: 'text-lg', h6: 'text-base' }[o.level as string] || 'text-3xl md:text-[36px]'
      const look = o.look || 'plain'
      const alignCls = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-end' : ''
      const wrapCls = `${depth === 0 ? container : ''} ${alignCls}`.trim()

      const kickerNode = o.kicker ? (
        look === 'badge' ? (
          <div className="mb-3 inline-flex items-center rounded-full bg-primary-50 px-4 py-1 text-xs font-extrabold uppercase tracking-[2px] text-primary-700 ring-1 ring-primary-200/70">
            {o.kicker}
          </div>
        ) : (
          <div className="mb-2 text-[13px] font-bold uppercase tracking-[2px] text-primary-600">{o.kicker}</div>
        )
      ) : null

      const titleNode = (
        <Tag
          className={`font-heading font-bold leading-tight ${size} ${
            look === 'gradient' ? 'bg-gradient-to-r from-primary-700 via-primary-600 to-accent-500 bg-clip-text text-transparent' : ''
          }`}
        >
          {o.text}
        </Tag>
      )

      const underlineBar = look === 'underline' ? (
        <div className={`mt-3 h-1 w-16 rounded-full bg-gradient-to-r from-primary-600 to-accent-500 ${o.align === 'center' ? 'mx-auto' : o.align === 'right' ? 'ms-auto' : ''}`} />
      ) : null

      const subtitleNode = o.subtitle ? (
        <div><p className="mt-3 inline-block max-w-2xl text-lg leading-relaxed opacity-75">{o.subtitle}</p></div>
      ) : null

      if (look === 'side_bar') {
        return (
          <div className={wrapCls}>
            <div className="border-s-4 border-primary-600 ps-5">
              {kickerNode}
              {titleNode}
              {subtitleNode}
            </div>
          </div>
        )
      }

      if (look === 'divider') {
        return (
          <div className={`${depth === 0 ? container : ''} text-center`}>
            {kickerNode}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-gray-200" />
              <Tag className={`font-heading font-bold leading-tight ${size}`}>{o.text}</Tag>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            {subtitleNode}
          </div>
        )
      }

      if (look === 'split_action') {
        return (
          <div className={`${depth === 0 ? container : ''} flex flex-wrap items-end justify-between gap-4`}>
            <div>
              {kickerNode}
              {titleNode}
              {subtitleNode}
            </div>
            {o.link_label && o.link_url && (
              <Link href={o.link_url} className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-5 py-2.5 text-sm font-extrabold text-primary-700 shadow-sm transition hover:bg-primary-50">
                {o.link_label} →
              </Link>
            )}
          </div>
        )
      }

      return (
        <div className={wrapCls}>
          {kickerNode}
          {titleNode}
          {underlineBar}
          {subtitleNode}
        </div>
      )
    }
    case 'richtext': {
      const look = o.look || 'plain'
      const sizeCls =
        look === 'lead' || o.size === 'lg'
          ? '!text-lg md:!text-xl !leading-relaxed'
          : o.size === 'sm'
            ? '!text-[15px]'
            : ''
      const dropCls = o.dropcap
        ? '[&>p:first-of-type]:first-letter:float-start [&>p:first-of-type]:first-letter:me-2.5 [&>p:first-of-type]:first-letter:font-heading [&>p:first-of-type]:first-letter:text-5xl [&>p:first-of-type]:first-letter:font-bold [&>p:first-of-type]:first-letter:leading-none [&>p:first-of-type]:first-letter:text-primary-700'
        : ''
      const widthCls = o.width === 'narrow' || look === 'article' ? 'mx-auto max-w-3xl' : ''
      const lookCls =
        look === 'two_col'
          ? 'md:columns-2 md:gap-10 [&>*]:break-inside-avoid'
          : look === 'card'
            ? 'rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-10'
            : look === 'bordered'
              ? 'border-s-4 border-primary-600 ps-6'
              : ''
      return (
        <div className={depth === 0 ? container : ''}>
          <div className={`${widthCls} ${lookCls}`.trim()}>
            <BlockText text={o.text} className={`${sizeCls} ${dropCls}`.trim()} />
          </div>
        </div>
      )
    }
    case 'image': {
      if (!o.image_url) return null
      const look = o.look || 'rounded'
      const isFull = look === 'full_bleed'
      const widthCls = isFull
        ? 'w-full'
        : ({ lg: 'max-w-4xl', md: 'max-w-2xl', sm: 'max-w-sm' }[o.width as string] || 'w-full')
      const alignCls = isFull ? '' : o.align === 'right' ? 'ms-auto' : o.align === 'left' ? '' : 'mx-auto'
      const hasAspect = look === 'circle' || (o.aspect && o.aspect !== 'auto')
      const imgCls =
        look === 'circle'
          ? 'aspect-square w-full rounded-full object-cover shadow-md'
          : look === 'full_bleed'
            ? `w-full ${hasAspect ? 'object-cover' : ''}`
            : look === 'shadow'
              ? `w-full rounded-2xl shadow-xl transition-transform duration-500 group-hover:scale-[1.02] ${hasAspect ? 'object-cover' : ''}`
              : look === 'framed'
                ? `w-full rounded-xl ${hasAspect ? 'object-cover' : ''}`
                : `w-full rounded-2xl ${hasAspect ? 'object-cover' : ''}`
      const picture = (
        <picture className="block">
          {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
          <img
            src={o.image_url}
            alt={o.alt || ''}
            loading="lazy"
            className={imgCls}
            style={look !== 'circle' && o.aspect && o.aspect !== 'auto' ? { aspectRatio: o.aspect } : undefined}
          />
        </picture>
      )
      const wrapLink = (node: ReactNode) =>
        o.link ? (
          String(o.link).startsWith('/') ? (
            <Link href={o.link} className="group block">{node}</Link>
          ) : (
            <a href={o.link} target="_blank" rel="noopener noreferrer" className="group block">{node}</a>
          )
        ) : (
          <div className="group">{node}</div>
        )

      if (look === 'overlay') {
        const card = (
          <div className="relative overflow-hidden rounded-2xl shadow-lg">
            {picture}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950/85 via-gray-950/20 to-transparent" />
            {o.badge && (
              <span className="absolute start-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-800 shadow-sm backdrop-blur">
                {o.badge}
              </span>
            )}
            {o.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 p-5 text-sm font-semibold text-white md:p-6 md:text-base">
                {o.caption}
              </figcaption>
            )}
          </div>
        )
        return <figure className={`${depth === 0 ? container : ''} ${widthCls} ${alignCls}`.trim()}>{wrapLink(card)}</figure>
      }

      if (look === 'framed') {
        return (
          <figure className={`${depth === 0 ? container : ''} ${widthCls} ${alignCls}`.trim()}>
            <div className="relative rounded-2xl border border-gray-200 bg-white p-3 shadow-md sm:p-4">
              {o.badge && (
                <span className="absolute start-6 top-6 z-10 rounded-full bg-primary-600 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white shadow">
                  {o.badge}
                </span>
              )}
              {wrapLink(picture)}
              {o.caption && <figcaption className="pt-3 text-center text-sm font-medium text-gray-600">{o.caption}</figcaption>}
            </div>
          </figure>
        )
      }

      return (
        <figure className={`${depth === 0 && !isFull ? container : ''} ${widthCls} ${alignCls}`.trim()}>
          <div className="relative">
            {o.badge && (
              <span className="absolute start-3 top-3 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-800 shadow-sm backdrop-blur">
                {o.badge}
              </span>
            )}
            {wrapLink(picture)}
          </div>
          {o.caption && <figcaption className="mt-2.5 text-center text-sm opacity-75">{o.caption}</figcaption>}
        </figure>
      )
    }
    case 'image_text': {
      const look = o.look || 'plain'
      const isDark = look === 'dark'
      const right = o.image_side === 'right'
      const gridCols =
        o.ratio === '40/60'
          ? right ? 'md:grid-cols-[1.35fr_0.9fr]' : 'md:grid-cols-[0.9fr_1.35fr]'
          : o.ratio === '60/40'
            ? right ? 'md:grid-cols-[0.9fr_1.35fr]' : 'md:grid-cols-[1.35fr_0.9fr]'
            : 'md:grid-cols-2'
      const hasAspect = o.aspect && o.aspect !== 'auto'
      const pic = o.image_url ? (
        <picture className="block h-full">
          {o.mobile_image_url && <source media="(max-width: 639px)" srcSet={o.mobile_image_url} />}
          <img
            src={o.image_url}
            alt={o.alt || ''}
            loading="lazy"
            className={`relative w-full object-cover ${
              look === 'full_bleed' ? 'h-full min-h-[280px]' : 'rounded-2xl shadow-sm'
            }`}
            style={hasAspect ? { aspectRatio: o.aspect } : undefined}
          />
        </picture>
      ) : null

      const boxCls =
        look === 'card'
          ? 'rounded-3xl border bg-white p-6 shadow-sm md:p-10'
          : look === 'full_bleed'
            ? 'overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg'
            : look === 'dark'
              ? 'overflow-hidden rounded-3xl bg-primary-950 p-6 text-white shadow-xl md:p-10'
              : ''

      return (
        <div className={depth === 0 ? container : ''}>
          <div className={`grid items-center ${look === 'full_bleed' ? 'gap-0' : 'gap-10'} ${gridCols} ${boxCls}`.trim()}>
            {pic && (
              <div className={`${right ? 'md:order-2' : ''} ${look === 'overlap' ? 'relative p-2' : ''} ${look === 'badge_card' ? 'relative' : ''} ${look === 'full_bleed' ? 'h-full' : ''}`.trim()}>
                {look === 'overlap' && <div className="absolute inset-0 -rotate-2 rounded-3xl bg-primary-100" aria-hidden />}
                {pic}
                {look === 'badge_card' && (o.stat_value || o.stat_label) && (
                  <div className="absolute -bottom-4 end-4 rounded-2xl border border-primary-100 bg-white px-5 py-3 text-gray-900 shadow-xl">
                    {o.stat_value && <div className="font-heading text-2xl font-extrabold text-primary-700">{o.stat_value}</div>}
                    {o.stat_label && <div className="text-xs font-semibold text-gray-600">{o.stat_label}</div>}
                  </div>
                )}
              </div>
            )}
            <div className={look === 'full_bleed' ? 'p-8 md:p-12' : ''}>
              {o.kicker && (
                <div className={`mb-2 text-[13px] font-bold uppercase tracking-[2px] ${isDark ? 'text-accent-300' : 'text-primary-600'}`}>
                  {o.kicker}
                </div>
              )}
              {o.title && <h2 className={`mb-4 font-heading text-3xl font-bold ${isDark ? 'text-white' : ''}`}>{o.title}</h2>}
              <BlockText text={o.text} className={isDark ? 'text-white/85' : ''} />
              {((o.button_label && o.button_url) || (o.button2_label && o.button2_url)) && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {o.button_label && o.button_url && (
                    <Btn href={o.button_url} variant={isDark ? 'accent' : 'primary'}>{o.button_label}</Btn>
                  )}
                  {o.button2_label && o.button2_url && (
                    <Btn href={o.button2_url} variant={isDark ? 'light' : 'outline'}>{o.button2_label}</Btn>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    case 'video': {
      const v = typeof o.url === 'object' ? (o.url as { provider?: string; id?: string } | undefined) : undefined
      const mp4Url = o.mp4_url || (typeof o.url === 'string' && /\.(mp4|webm|ogg)(\?|$)/i.test(o.url) ? o.url : undefined)
      if (!v?.id && !mp4Url) return null
      const src = v?.id
        ? v.provider === 'vimeo'
          ? `https://player.vimeo.com/video/${encodeURIComponent(v.id)}`
          : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}`
        : undefined
      const look = o.look || (o.highlight ? 'cinema' : 'plain')
      const aspectCls =
        look === 'vertical' || o.aspect === '9/16'
          ? 'aspect-[9/16] max-w-sm mx-auto'
          : o.aspect === '4/3'
            ? 'aspect-[4/3]'
            : o.aspect === '21/9'
              ? 'aspect-[21/9]'
              : 'aspect-video'
      const widthCls = o.width === 'lg' ? 'max-w-4xl mx-auto' : o.width === 'md' ? 'max-w-2xl mx-auto' : ''
      const ytPoster = !o.poster_url && v?.id && v.provider !== 'vimeo' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : o.poster_url

      const player = opts.editing ? (
        <div className={`${aspectCls} flex items-center justify-center overflow-hidden rounded-2xl bg-gray-950 text-white/75`}>
          ▶ {mp4Url ? 'MP4 Video' : v?.provider === 'vimeo' ? 'Vimeo' : 'YouTube'} videosu
        </div>
      ) : look === 'poster_play' ? (
        <VideoPosterPlayer embedSrc={src} mp4Url={mp4Url} posterUrl={ytPoster} title={o.title} aspectCls={aspectCls} />
      ) : mp4Url ? (
        <div className={`${aspectCls} overflow-hidden rounded-2xl bg-black`}>
          <video src={mp4Url} poster={o.poster_url || undefined} controls playsInline className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className={`${aspectCls} overflow-hidden rounded-2xl bg-black`}>
          <iframe src={src} title={o.title || 'Video'} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )

      const meta = (dark = false) => (
        <>
          {o.kicker && <div className={`mb-2 text-xs font-bold uppercase tracking-[2px] ${dark ? 'text-accent-300' : 'text-primary-600'}`}>{o.kicker}</div>}
          {o.title && <h3 className={`font-heading text-2xl font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{o.title}</h3>}
          {o.text && <p className={`mt-2.5 leading-relaxed ${dark ? 'text-white/80' : 'text-gray-600'}`}>{o.text}</p>}
          {o.button_label && o.button_url && (
            <div className="mt-5"><Btn href={o.button_url} variant={dark ? 'accent' : 'primary'}>{o.button_label}</Btn></div>
          )}
        </>
      )

      if (look === 'cinema') {
        return (
          <div className={depth === 0 ? container : ''}>
            <div className={`${widthCls} overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-zinc-900 to-primary-950 p-5 shadow-2xl ring-1 ring-white/15 sm:p-8`}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                {o.badge && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white">
                    ▶ {o.badge}
                  </span>
                )}
                {o.title && <h3 className="font-heading text-xl font-bold text-white sm:text-2xl">{o.title}</h3>}
              </div>
              {player}
              {o.text && <p className="mt-4 text-sm text-white/80">{o.text}</p>}
            </div>
          </div>
        )
      }

      if (look === 'split') {
        return (
          <div className={depth === 0 ? container : ''}>
            <div className="grid items-center gap-8 md:grid-cols-2">
              {player}
              <div>{meta(false)}</div>
            </div>
          </div>
        )
      }

      if (look === 'card') {
        return (
          <div className={depth === 0 ? container : ''}>
            <div className={`${widthCls} overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 shadow-lg sm:p-7`}>
              {player}
              {(o.kicker || o.title || o.text || o.button_label) && <div className="mt-5">{meta(false)}</div>}
            </div>
          </div>
        )
      }

      return (
        <div className={depth === 0 ? container : ''}>
          <div className={widthCls}>
            {o.kicker && <div className="mb-2 text-xs font-bold uppercase tracking-[2px] text-primary-600">{o.kicker}</div>}
            {o.title && <h3 className="mb-4 font-heading text-2xl font-bold">{o.title}</h3>}
            {player}
            {o.text && <p className="mt-3 text-gray-600">{o.text}</p>}
            {o.button_label && o.button_url && <div className="mt-4"><Btn href={o.button_url}>{o.button_label}</Btn></div>}
          </div>
        </div>
      )
    }
    case 'buttons': {
      const justify = o.mobile_align
        ? `${JUSTIFY[o.mobile_align] || ''} ${JUSTIFY_MD[o.align] || 'md:justify-start'}`
        : JUSTIFY[o.align] || ''
      const stack = o.layout === 'stack'
      const sizeCls =
        o.size === 'sm'
          ? '!px-4 !py-2 text-xs'
          : o.size === 'lg'
            ? '!px-8 !py-4 text-base'
            : 'text-sm'
      const shapeCls =
        o.shape === 'pill'
          ? '!rounded-full'
          : o.shape === 'square'
            ? '!rounded-none'
            : ''
      const fullCls = o.full_width ? 'w-full' : ''
      const extraCls = `${sizeCls} ${shapeCls} ${fullCls}`.trim()

      return (
        <div className={`${depth === 0 ? container : ''} flex ${stack ? 'flex-col' : 'flex-wrap'} gap-3 ${justify}`}>
          {(o.items || []).filter((b: any) => b.label && b.url).map((b: any, i: number) => {
            const autoDanger = (!b.style || b.style === 'primary' || b.style === 'accent') && /e-?devlet|348/i.test(`${b.label} ${b.url}`)
            return (
              <Btn key={i} href={b.url} variant={autoDanger ? 'danger' : b.style} newTab={b.new_tab} extraCls={extraCls}>
                {b.icon && <span aria-hidden>{b.icon}</span>}
                {b.label}
              </Btn>
            )
          })}
        </div>
      )
    }
    case 'faq': {
      const look = o.look || 'accordion'
      const faqItems = (o.items || []).filter((item: any) => item.question)
      const openFirst = Boolean(o.open_first) || Boolean(opts.editing)
      const faqHead = (center = true) => (o.kicker || o.title || o.text) && (
        <div className={`mb-8 ${center ? 'mx-auto max-w-2xl text-center' : ''}`}>
          {o.kicker && <div className="mb-1.5 text-xs font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
          {o.title && <h2 className="font-heading text-3xl font-bold">{o.title}</h2>}
          {o.text && <p className="mt-2 text-base opacity-75">{o.text}</p>}
        </div>
      )
      const faqCta = o.button_label && o.button_url && (
        <div className={look === 'split' ? 'mt-6' : 'mt-8 text-center'}>
          <Btn href={o.button_url} variant="primary">{o.button_label}</Btn>
        </div>
      )

      if (look === 'searchable' || look === 'categorized') {
        return (
          <div className={container}>
            <div className="mx-auto max-w-3xl">
              {faqHead(true)}
              <SearchableFaq
                showSearch={look === 'searchable' || faqItems.length > 6}
                showCategories={look === 'categorized'}
                openFirst={Boolean(o.open_first)}
                items={faqItems.map((item: any) => ({
                  question: item.question || '',
                  category: item.category || '',
                  answerText: String(item.answer || '').replace(/<[^>]*>/g, ' '),
                  answerNode: <BlockText text={item.answer} />,
                }))}
              />
              {faqCta}
            </div>
          </div>
        )
      }

      if (look === 'split') {
        return (
          <div className={container}>
            <div className="grid items-start gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                {faqHead(false)}
                {faqCta}
              </div>
              <div className="divide-y rounded-2xl border bg-white text-gray-900 shadow-sm lg:col-span-7">
                {faqItems.map((item: any, i: number) => (
                  <details key={i} className="group p-5" open={openFirst && i === 0}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-gray-900">
                      <span>{item.question}</span>
                      <span className="text-primary-600 transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <BlockText text={item.answer} className="mt-3 text-[15px] text-gray-700" />
                  </details>
                ))}
              </div>
            </div>
          </div>
        )
      }

      if (look === 'two_col' || look === 'cards') {
        return (
          <div className={container}>
            {faqHead(true)}
            <div className={`grid gap-5 ${look === 'cards' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {faqItems.map((item: any, i: number) => (
                <div key={i} className={`rounded-2xl bg-white p-6 text-gray-900 shadow-sm ${look === 'cards' ? 'border-2 border-primary-100' : 'border'}`}>
                  {item.category && <span className="mb-2 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">{item.category}</span>}
                  <h3 className="mb-2 font-heading text-lg font-bold text-gray-900">{item.question}</h3>
                  <BlockText text={item.answer} className="text-[15px] text-gray-700" />
                </div>
              ))}
            </div>
            {faqCta}
          </div>
        )
      }

      if (look === 'minimal') {
        return (
          <div className={container}>
            <div className="mx-auto max-w-3xl">
              {faqHead(false)}
              <div className="divide-y">
                {faqItems.map((item: any, i: number) => (
                  <div key={i} className="py-5">
                    <h3 className="mb-1.5 font-heading text-lg font-bold">{item.question}</h3>
                    <BlockText text={item.answer} className="text-[15px] opacity-80" />
                  </div>
                ))}
              </div>
              {faqCta}
            </div>
          </div>
        )
      }

      const isDark = look === 'dark_cards'
      return (
        <div className={container}>
          <div className="mx-auto max-w-3xl">
            {faqHead(true)}
            <div className={`divide-y rounded-2xl ${
              isDark ? 'divide-white/10 bg-gray-900 text-white shadow-lg ring-1 ring-white/10' : 'border bg-white text-gray-900'
            }`}>
              {faqItems.map((item: any, i: number) => (
                <details key={i} className="group p-5" open={openFirst && i === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    <span>{item.question}</span>
                    <span className={`transition-transform group-open:rotate-45 ${isDark ? 'text-primary-300' : 'text-primary-600'}`}>+</span>
                  </summary>
                  <BlockText text={item.answer} className={`mt-3 text-[15px] ${isDark ? 'text-gray-300' : 'text-gray-700'}`} />
                </details>
              ))}
            </div>
            {faqCta}
          </div>
        </div>
      )
    }
    case 'section': {
      const look = o.look || 'plain'
      const widthCls = o.width === 'narrow'
        ? 'mx-auto w-full max-w-3xl px-4 sm:px-6'
        : o.width === 'wide'
          ? 'mx-auto w-full max-w-7xl px-4 sm:px-6'
          : o.width === 'full'
            ? 'w-full'
            : container
      const padYCls = o.padding_y === 'none'
        ? 'py-0'
        : o.padding_y === 'compact'
          ? 'py-6 md:py-8'
          : o.padding_y === 'spacious'
            ? 'py-16 md:py-24'
            : 'py-10 md:py-14'
      const minHCls = o.min_height === 'sm'
        ? 'min-h-[280px]'
        : o.min_height === 'md'
          ? 'min-h-[420px]'
          : o.min_height === 'lg'
            ? 'min-h-[560px]'
            : ''
      const valignCls = minHCls
        ? (o.valign === 'center' ? 'justify-center' : o.valign === 'end' ? 'justify-end' : 'justify-start')
        : ''
      const isBoxLook = look === 'card' || look === 'bordered' || look === 'glass'
      const isDarkTone = o.tone === 'dark' || o.tone === 'brand' || o.tone === 'accent'
      const boxCls = look === 'card'
        ? `rounded-3xl p-6 sm:p-10 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] ring-1 ${isDarkTone ? 'ring-white/15 bg-white/5' : 'bg-white text-gray-900 ring-black/5'}`
        : look === 'bordered'
          ? `rounded-3xl p-6 sm:p-10 border ${isDarkTone ? 'border-white/20' : 'border-gray-200/90'}`
          : look === 'glass'
            ? `rounded-3xl p-6 sm:p-10 border backdrop-blur-md shadow-lg ${isDarkTone ? 'border-white/20 bg-white/10 text-white' : 'border-white/60 bg-white/75 text-gray-900'}`
            : ''
      const outerCls = look === 'gradient'
        ? 'bg-gradient-to-br from-primary-700 via-primary-600 to-accent-500 text-white'
        : ''
      const renderShape = (shape: string | undefined, pos: 'top' | 'bottom') => {
        if (!shape || shape === 'none') return null
        const flip = pos === 'top' ? 'rotate-180' : ''
        const posCls = pos === 'top' ? 'top-0' : 'bottom-0'
        const path = shape === 'wave'
          ? 'M0,48 C240,96 480,0 720,48 C960,96 1200,0 1440,48 L1440,96 L0,96 Z'
          : shape === 'curve'
            ? 'M0,0 Q720,96 1440,0 L1440,96 L0,96 Z'
            : 'M0,96 L1440,0 L1440,96 Z'
        return (
          <svg
            aria-hidden
            viewBox="0 0 1440 96"
            preserveAspectRatio="none"
            className={`pointer-events-none absolute inset-x-0 ${posCls} h-8 w-full text-white/95 md:h-12 ${flip}`}
          >
            <path d={path} fill="currentColor" />
          </svg>
        )
      }
      const hasChildren = Array.isArray(block.children) && block.children.length > 0
      const innerNodes = hasChildren
        ? children(block.children)
        : opts.editing
          ? (
            <div className={`rounded-2xl border-2 border-dashed p-8 text-center text-sm ${isDarkTone || look === 'gradient' ? 'border-white/25 text-white/75' : 'border-gray-300 text-gray-500'}`}>
              Bu bölüm kapsayıcısına başlık, metin, sütunlar veya başka bloklar ekleyin.
            </div>
          )
          : null

      return (
        <div className={`b-section relative overflow-hidden ${outerCls} ${padYCls}`}>
          {look === 'pattern' && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: 'radial-gradient(currentColor 1.25px, transparent 1.25px)',
                backgroundSize: '20px 20px',
              }}
            />
          )}
          {renderShape(o.shape_top, 'top')}
          <div className={`relative z-10 ${widthCls}`}>
            <div
              className={`flex flex-col ${minHCls} ${valignCls} ${isBoxLook ? boxCls : ''}`}
              style={{ gap: `${o.gap ?? 16}px` }}
            >
              {innerNodes}
            </div>
          </div>
          {renderShape(o.shape_bottom, 'bottom')}
        </div>
      )
    }
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
      const size = Number(o.size) || 44
      const src = (o.light && site.logo_dark_url) || site.logo_url
      const displayName = (typeof o.custom_name === 'string' && o.custom_name.trim()) || site.name
      const displayTagline = (typeof o.custom_tagline === 'string' && o.custom_tagline.trim()) || site.tagline
      const stacked = o.layout === 'stacked'
      const shape = o.shape || 'contain'
      const nameSizeCls = o.name_size === 'sm' ? 'text-base' : o.name_size === 'lg' ? 'text-xl' : o.name_size === 'xl' ? 'text-2xl' : 'text-lg'
      const alignWrap = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      const invertFilter = o.light && !site.logo_dark_url && shape === 'contain' ? 'brightness(0) invert(1)' : undefined

      const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w.charAt(0).toLocaleUpperCase(data.locale))
        .join('') || '✦'

      const logoNode = src ? (
        o.wide ? (
          <img
            src={src}
            alt={o.show_name === false ? displayName : ''}
            style={{ height: size, width: 'auto', maxWidth: size * 5, filter: invertFilter }}
            className={`flex-shrink-0 object-contain ${shape === 'rounded' ? 'rounded-xl bg-white p-1' : shape === 'circle' ? 'rounded-full bg-white p-1' : ''}`}
          />
        ) : (
          <img
            src={src}
            alt={o.show_name === false ? displayName : ''}
            style={{ width: size, height: size, filter: invertFilter }}
            className={`flex-shrink-0 ${
              shape === 'circle'
                ? 'rounded-full bg-white object-cover shadow-sm'
                : shape === 'rounded'
                  ? 'rounded-xl bg-white object-contain p-1 shadow-sm'
                  : 'object-contain'
            }`}
          />
        )
      ) : (
        <span
          aria-hidden
          style={{ width: size, height: size, fontSize: Math.max(14, Math.round(size * 0.38)) }}
          className={`flex flex-shrink-0 items-center justify-center font-heading font-extrabold ${
            shape === 'circle' ? 'rounded-full' : 'rounded-xl'
          } ${o.light ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-primary-600 text-white shadow-sm'}`}
        >
          {initials}
        </span>
      )

      const textNode = o.show_name !== false && (
        <span className={`flex min-w-0 flex-col leading-tight ${stacked ? 'items-center text-center' : ''}`}>
          <span className={`truncate font-heading font-bold tracking-wide ${nameSizeCls} ${o.light ? 'text-white' : ''}`}>
            {displayName}
          </span>
          {o.show_tagline !== false && displayTagline && (
            <span className={`truncate text-[11px] font-semibold tracking-[2px] ${o.light ? 'text-white/75' : 'text-primary-600'}`}>
              {displayTagline.toLocaleUpperCase(data.locale)}
            </span>
          )}
        </span>
      )

      const href = (typeof o.url === 'string' && o.url.trim()) || '/'
      const linkCls = `inline-flex min-w-0 items-center gap-3 ${stacked ? 'flex-col text-center' : ''} ${o.light ? 'text-white' : ''}`
      const inner = (
        <>
          {logoNode}
          {textNode}
        </>
      )

      return (
        <div className={`${depth === 0 ? container : ''} ${alignWrap}`.trim()}>
          {href.startsWith('/') ? (
            <Link href={href} className={linkCls}>{inner}</Link>
          ) : (
            <a href={href} className={linkCls} target="_blank" rel="noopener noreferrer">{inner}</a>
          )}
          {o.show_about && site.footer_text && (
            <p className={`mt-4 max-w-md text-sm leading-relaxed opacity-80 ${o.align === 'center' || stacked ? 'mx-auto' : o.align === 'right' ? 'ms-auto' : ''}`}>
              {site.footer_text}
            </p>
          )}
        </div>
      )
    }
    case 'nav_menu': {
      const items = navItems(o, data, t)
      const sizeCls = o.size === 'sm' ? 'text-sm' : o.size === 'lg' ? 'text-base' : 'text-[15px]'
      if (o.layout === 'vertical') {
        const vLook = o.vertical_look || 'list'
        const vSizeCls = o.size === 'sm' ? 'text-xs' : o.size === 'lg' ? 'text-base' : 'text-sm'
        if (vLook === 'inline_dots') {
          return (
            <nav className={depth === 0 ? container : ''}>
              {o.title && <div className="mb-2 font-bold">{o.title}</div>}
              <ul className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${vSizeCls}`}>
                {items.map((item, i) => (
                  <li key={i} className="inline-flex items-center gap-2">
                    {i > 0 && <span aria-hidden className="opacity-40">·</span>}
                    <Anchor link={item} className="opacity-85 transition-opacity hover:opacity-100 hover:underline" />
                  </li>
                ))}
              </ul>
            </nav>
          )
        }
        return (
          <nav className={depth === 0 ? container : ''}>
            {o.title && <div className="mb-3 font-bold">{o.title}</div>}
            <ul className={`${vLook === 'two_col' ? 'grid grid-cols-2 gap-x-6 gap-y-2.5' : 'flex flex-col gap-2.5'} ${vSizeCls}`}>
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
      const look = o.look || 'plain'
      const gapCls = look === 'divided'
        ? 'gap-x-0 divide-x divide-current/15 [&>*]:px-4 [&>*:first-child]:ps-0'
        : o.gap === 'tight'
          ? 'gap-x-3'
          : o.gap === 'wide'
            ? 'gap-x-9'
            : 'gap-x-6'
      const itemCls = look === 'underline'
        ? 'relative py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:scale-x-0 after:bg-current after:transition-transform hover:after:scale-x-100'
        : look === 'pills'
          ? 'rounded-full px-3.5 py-1.5 transition-colors hover:bg-current/10'
          : look === 'boxed'
            ? 'rounded-lg px-3 py-1.5 transition-colors hover:bg-current/10'
            : look === 'divided'
              ? 'py-1 transition-opacity hover:opacity-75'
              : 'py-2 transition-opacity hover:opacity-70'
      const hasMultiLang = (data.site.languages || []).length >= 2
      return (
        <div className={`${depth === 0 ? container : ''} flex items-center`}>
          <nav className={`${mobile === 'inline' ? 'flex' : 'hidden lg:flex'} flex-1 flex-wrap items-center gap-y-1 font-semibold ${sizeCls} ${gapCls} ${JUSTIFY[o.align] || ''}`}>
            {items.map((item, i) => item.children?.length
              ? <Dropdown key={i} item={item} locale={data.locale} itemCls={itemCls} />
              : <Anchor key={i} link={item} className={itemCls} />)}
          </nav>
          {mobile === 'drawer' && (
            <div className="lg:hidden">
              <MobileMenu
                items={items}
                label={t('nav.menu')}
                extra={hasMultiLang ? <LanguageSwitcher /> : undefined}
                donate={o.drawer_donate !== false ? { label: t('nav.donate'), url: '/kampanyalar' } : null}
              />
            </div>
          )}
        </div>
      )
    }
    case 'donate_button': {
      const size = { sm: 'px-4 py-2 text-sm', md: 'px-5 py-2.5 text-[15px]', lg: 'px-7 py-3.5 text-base sm:text-lg' }[o.size as string] || 'px-5 py-2.5 text-[15px]'
      const shapeCls = o.shape === 'pill' ? 'rounded-full' : o.shape === 'square' ? 'rounded-sm' : 'rounded-lg'
      const iconKey = (o.icon && o.icon !== 'none') ? o.icon : (o.heart ? 'heart' : 'none')
      const alignCls = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      const labelText = o.label || t('nav.donate')
      return (
        <div className={`${depth === 0 ? container : ''} ${alignCls}`.trim()}>
          <Anchor
            link={{ label: labelText, url: o.url || '/kampanyalar', new_tab: Boolean(o.new_tab) }}
            className={`inline-flex items-center gap-2 whitespace-nowrap font-bold transition-colors ${shapeCls} ${BUTTON_VARIANT[o.style] || BUTTON_VARIANT.primary} ${size} ${o.full_width ? 'w-full justify-center' : ''}`}
          >
            {iconKey === 'heart' && <span aria-hidden>♥</span>}
            {iconKey === 'pulse_heart' && <span aria-hidden className="animate-pulse">♥</span>}
            {iconKey === 'hand' && <span aria-hidden>🤝</span>}
            {iconKey === 'sparkle' && <span aria-hidden>✦</span>}
            {iconKey === 'shield' && <span aria-hidden>🛡️</span>}
            <span>{labelText}</span>
            {o.badge && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold leading-none">
                {o.badge}
              </span>
            )}
            {iconKey === 'arrow' && <span aria-hidden>→</span>}
          </Anchor>
        </div>
      )
    }
    case 'language_switcher': {
      if ((data.site.languages || []).length < 2) {
        return opts.editing ? <span className="rounded border border-dashed px-2 py-1 text-xs opacity-60">🌐 Dil seçici (tek dil açık)</span> : null
      }
      const alignCls = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      return (
        <div className={`${depth === 0 ? container : ''} ${alignCls}`.trim()}>
          <LanguageSwitcher
            languages={data.site.languages}
            locale={data.locale}
            look={o.look}
            labelMode={o.label_mode}
            showIcon={Boolean(o.show_icon)}
            size={o.size}
            align={o.align}
          />
        </div>
      )
    }
    case 'social_icons': {
      const customItems = Array.isArray(o.items)
        ? (o.items as { network?: string; url?: string }[])
            .filter((i) => i?.network && typeof i?.url === 'string' && i.url.trim())
            .map((i) => [String(i.network), String(i.url)] as [string, string])
        : []
      const siteLinks = Object.entries(data.site.social_links || {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0,
      )
      const links = customItems.length ? customItems : siteLinks
      if (!links.length) {
        return opts.editing ? <span className="text-xs opacity-60">Sosyal medya bağlantısı yok (Görünüm & Tema)</span> : null
      }
      const style = (o.style as string) || 'pill'
      const colored = Boolean(o.colored)
      const sz = o.size === 'sm'
        ? { box: 'h-8 w-8', icon: 'h-3.5 w-3.5', pill: 'px-2.5 py-1 text-xs', text: 'text-xs' }
        : o.size === 'lg'
          ? { box: 'h-11 w-11', icon: 'h-5 w-5', pill: 'px-4 py-2 text-base', text: 'text-base' }
          : { box: 'h-9 w-9', icon: 'h-4 w-4', pill: 'px-3 py-1.5 text-sm', text: 'text-sm' }
      const alignWrap = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      return (
        <div className={`${depth === 0 ? container : ''} ${alignWrap}`.trim()}>
          {o.title && <div className="mb-3 text-sm font-bold">{o.title}</div>}
          <div className={`flex flex-wrap items-center gap-2.5 ${JUSTIFY[o.align] || ''}`}>
            {links.map(([network, href], idx) => {
              const key = network.toLowerCase()
              const [name, short] = SOCIAL_LABELS[key] || [network, network.slice(0, 2).toUpperCase()]
              const meta = SOCIAL_META[key]
              const svgIcon = meta ? (
                <svg aria-hidden viewBox="0 0 24 24" className={`${sz.icon} shrink-0 fill-current`}>
                  <path d={meta.path} />
                </svg>
              ) : (
                <span className="text-xs font-bold">{short}</span>
              )
              const boxBase = style === 'round'
                ? `flex ${sz.box} items-center justify-center rounded-full transition-transform hover:scale-105`
                : style === 'square'
                  ? `flex ${sz.box} items-center justify-center rounded-xl transition-transform hover:scale-105`
                  : style === 'icons'
                    ? 'inline-flex items-center justify-center p-1 transition-opacity hover:opacity-75'
                    : style === 'text'
                      ? `${sz.text} font-medium hover:underline underline-offset-4`
                      : `inline-flex items-center gap-2 rounded-full ${sz.pill} font-medium transition-colors`

              const neutralBg = (style === 'round' || style === 'square')
                ? 'bg-current/10 hover:bg-current/20'
                : style === 'pill'
                  ? 'border border-current/20 hover:bg-current/10'
                  : ''
              const inlineStyle = colored && meta
                ? (style === 'icons' || style === 'text'
                    ? { color: meta.color }
                    : { backgroundColor: meta.color, color: '#ffffff', borderColor: 'transparent' })
                : undefined

              return (
                <a
                  key={`${key}-${idx}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  title={name}
                  className={`${boxBase} ${colored && meta ? '' : neutralBg}`}
                  style={inlineStyle}
                >
                  {style === 'text' ? name : style === 'pill' ? <>{svgIcon}<span>{name}</span></> : svgIcon}
                </a>
              )
            })}
          </div>
        </div>
      )
    }
    case 'contact_info': {
      const c = data.site.contact
      const phone = (typeof o.custom_phone === 'string' && o.custom_phone.trim()) || c.phone
      const email = (typeof o.custom_email === 'string' && o.custom_email.trim()) || c.email
      const address = (typeof o.custom_address === 'string' && o.custom_address.trim()) || c.address
      const hours = typeof o.working_hours === 'string' ? o.working_hours.trim() : ''
      const waRaw = typeof o.whatsapp === 'string' ? o.whatsapp.trim() : ''
      const waClean = waRaw.replace(/[^\d]/g, '')
      const mapUrl = typeof o.map_url === 'string' && o.map_url.trim() ? o.map_url.trim() : ''
      const showIcons = o.show_icons !== false
      const look = (o.look as string) || 'plain'

      const CONTACT_SVG: Record<string, ReactNode> = {
        phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
        email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
        address: <><path d="M12 21s-6-5.7-6-10a6 6 0 1 1 12 0c0 4.3-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></>,
        hours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
        whatsapp: <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z" />,
      }

      const entries: { key: string; label: string; value: string; href?: string; external?: boolean }[] = []
      if (o.show_phone !== false && phone) {
        entries.push({ key: 'phone', label: 'Telefon', value: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` })
      }
      if (waRaw && waClean) {
        entries.push({ key: 'whatsapp', label: 'WhatsApp', value: waRaw, href: `https://wa.me/${waClean}`, external: true })
      }
      if (o.show_email !== false && email) {
        entries.push({ key: 'email', label: 'E-posta', value: email, href: `mailto:${email}` })
      }
      if (o.show_address && address) {
        entries.push({ key: 'address', label: 'Adres', value: address, href: mapUrl || undefined, external: Boolean(mapUrl) })
      }
      if (hours) {
        entries.push({ key: 'hours', label: 'Çalışma Saatleri', value: hours })
      }

      if (!entries.length) {
        return opts.editing ? <span className="text-xs opacity-60">İletişim bilgisi yok (Site Ayarları)</span> : null
      }

      const sizeCls = o.size === 'lg' ? 'text-base' : o.size === 'md' ? 'text-[15px]' : 'text-sm'
      const alignWrap = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      const iconEl = (k: string) => showIcons ? (
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {CONTACT_SVG[k]}
        </svg>
      ) : null

      if (look === 'cards') {
        const cols = entries.length <= 2 ? 'sm:grid-cols-2' : entries.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'
        return (
          <div className={`${depth === 0 ? container : ''} ${alignWrap}`.trim()}>
            {o.title && <div className="mb-4 font-heading text-lg font-bold">{o.title}</div>}
            <div className={`grid gap-3.5 ${cols}`}>
              {entries.map((item) => {
                const body = (
                  <>
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-65">
                      {iconEl(item.key)}
                      <span>{item.label}</span>
                    </div>
                    <div className={`font-semibold leading-snug ${sizeCls}`}>{item.value}</div>
                  </>
                )
                const cardCls = 'rounded-2xl border border-current/15 bg-current/[0.03] p-4 text-start transition-colors hover:border-current/30'
                return item.href ? (
                  <a
                    key={item.key}
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    className={cardCls}
                  >
                    {body}
                  </a>
                ) : (
                  <div key={item.key} className={cardCls}>{body}</div>
                )
              })}
            </div>
          </div>
        )
      }

      const isStacked = o.layout === 'stacked'
      const itemCls = look === 'pills'
        ? 'inline-flex items-center gap-2 rounded-full border border-current/20 px-3 py-1 transition-colors hover:bg-current/10'
        : 'inline-flex items-center gap-2'
      const wrapCls = look === 'bordered'
        ? 'rounded-2xl border border-current/15 p-4'
        : ''

      return (
        <div className={`${depth === 0 ? container : ''} ${alignWrap}`.trim()}>
          {o.title && <div className="mb-3 font-bold">{o.title}</div>}
          <div className={`${wrapCls} ${sizeCls} ${isStacked ? `flex flex-col gap-2.5 ${o.align === 'center' ? 'items-center' : o.align === 'right' ? 'items-end' : 'items-start'}` : `flex flex-wrap items-center gap-x-5 gap-y-2 ${JUSTIFY[o.align] || ''}`}`}>
            {entries.map((item) => {
              const contentNode = (
                <>
                  {iconEl(item.key)}
                  <span>{item.value}</span>
                </>
              )
              return item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className={`${itemCls} hover:underline`}
                >
                  {contentNode}
                </a>
              ) : (
                <span key={item.key} className={itemCls}>{contentNode}</span>
              )
            })}
          </div>
        </div>
      )
    }
    case 'account_links': {
      const accLinks: { key: string; href: string; label: string; primary?: boolean; icon: ReactNode }[] = []
      if (o.show_portal !== false) {
        accLinks.push({
          key: 'portal',
          href: '/portal',
          label: (typeof o.portal_label === 'string' && o.portal_label.trim()) || t('nav.donorLogin'),
          primary: true,
          icon: <><circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
        })
      }
      if (o.show_verify !== false) {
        accLinks.push({
          key: 'verify',
          href: '/verify',
          label: (typeof o.verify_label === 'string' && o.verify_label.trim()) || t('nav.verifyReceipt'),
          icon: <><path d="M9 12l2 2 4-4" /><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-4 2-4-2-3 2V4a1 1 0 0 1 1-1z" /></>,
        })
      }
      if (o.show_volunteer) {
        accLinks.push({
          key: 'volunteer',
          href: '/gonullu-ol',
          label: t('nav.volunteer'),
          icon: <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" />,
        })
      }
      if (!accLinks.length) {
        return opts.editing ? <span className="text-xs opacity-60">Bağışçı girişi / makbuz bağlantısı seçin</span> : null
      }

      const look = (o.look as string) || 'links'
      const sm = o.size === 'sm'
      const showIcons = Boolean(o.show_icons)
      const isStacked = o.layout === 'stacked'
      const alignWrap = o.align === 'center' ? 'text-center' : o.align === 'right' ? 'text-right' : ''
      const sizeCls = sm ? 'text-xs' : 'text-sm'
      const padCls = sm ? 'px-3 py-1.5' : 'px-3.5 py-2'

      return (
        <div className={`${depth === 0 ? container : ''} ${alignWrap}`.trim()}>
          {o.title && <div className="mb-3 font-bold">{o.title}</div>}
          <div className={`${sizeCls} ${isStacked ? `flex flex-col gap-2 ${o.align === 'center' ? 'items-center' : o.align === 'right' ? 'items-end' : 'items-start'}` : `flex flex-wrap items-center ${look === 'divided' ? 'gap-x-2 gap-y-1' : 'gap-x-4 gap-y-2'} ${JUSTIFY[o.align] || ''}`}`}>
            {accLinks.map((item, i) => {
              const cls = look === 'buttons'
                ? item.primary
                  ? `inline-flex items-center gap-1.5 rounded-lg bg-primary-600 font-semibold text-white transition-colors hover:bg-primary-700 ${padCls}`
                  : `inline-flex items-center gap-1.5 rounded-lg border border-current/25 font-medium transition-colors hover:bg-current/10 ${padCls}`
                : look === 'pills'
                  ? `inline-flex items-center gap-1.5 rounded-full border border-current/20 font-medium transition-colors hover:bg-current/10 ${sm ? 'px-2.5 py-1' : 'px-3 py-1.5'}`
                  : `inline-flex items-center gap-1.5 ${item.primary ? 'font-semibold' : ''} hover:underline`
              return (
                <span key={item.key} className="inline-flex items-center gap-2">
                  {!isStacked && look === 'divided' && i > 0 && <span aria-hidden className="opacity-40">·</span>}
                  <Link href={item.href} className={cls}>
                    {showIcons && (
                      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {item.icon}
                      </svg>
                    )}
                    <span>{item.label}</span>
                  </Link>
                </span>
              )
            })}
          </div>
        </div>
      )
    }
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
      const cardStyleCls = o.card_style === 'cards'
        ? '[&>*]:h-full [&>*>.b-inner]:h-full [&>*_.b-col]:h-full [&>*_.b-col]:rounded-2xl [&>*_.b-col]:bg-white [&>*_.b-col]:text-gray-900 [&>*_.b-col]:p-6 [&>*_.b-col]:shadow-sm [&>*_.b-col]:ring-1 [&>*_.b-col]:ring-gray-100'
        : o.card_style === 'bordered'
          ? '[&>*]:h-full [&>*>.b-inner]:h-full [&>*_.b-col]:h-full [&>*_.b-col]:rounded-2xl [&>*_.b-col]:border [&>*_.b-col]:border-gray-200/90 [&>*_.b-col]:p-6'
          : o.card_style === 'divided'
            ? 'md:divide-x md:divide-gray-200/80 md:[&>*:not(:first-child)]:ps-6'
            : ''
      const alignCls = (o.card_style === 'cards' || o.card_style === 'bordered')
        ? 'items-stretch'
        : (ALIGN_ITEMS[o.valign] || '')
      return (
        <div className={`${depth === 0 ? container : ''} grid ${cols || 'md:grid-cols-2'} ${alignCls} ${rev} ${cardStyleCls}`} style={{ gap: `${o.gap ?? 24}px` }}>
          {children(block.children)}
        </div>
      )
    }
    case 'column': {
      const look = o.look || 'inherit'
      const lookCls = look === 'card'
        ? 'rounded-2xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-100'
        : look === 'soft'
          ? 'rounded-2xl bg-primary-50 text-gray-900'
          : look === 'bordered'
            ? 'rounded-2xl border border-gray-200/90'
            : look === 'dark'
              ? 'rounded-2xl bg-primary-950 text-primary-100'
              : ''
      const padCls = o.padding === 'sm'
        ? 'p-4'
        : o.padding === 'md'
          ? 'p-6'
          : o.padding === 'lg'
            ? 'p-8'
            : look !== 'inherit'
              ? 'p-6'
              : ''
      const valignCls = o.valign === 'center' ? 'justify-center' : o.valign === 'end' ? 'justify-end' : 'justify-start'
      const hasChildren = Array.isArray(block.children) && block.children.length > 0
      return (
        <div className={`b-col flex min-w-0 flex-col ${valignCls} ${lookCls} ${padCls}`} style={{ gap: `${o.gap ?? 12}px` }}>
          {hasChildren
            ? children(block.children)
            : opts.editing
              ? <div className="rounded-xl border border-dashed border-gray-300/90 p-5 text-center text-xs text-gray-400">Sütuna blok ekleyin</div>
              : null}
        </div>
      )
    }
    case 'spacer': {
      const mode = o.mode || 'vertical'
      const visCls = o.visibility === 'desktop' ? 'hidden md:block' : o.visibility === 'mobile' ? 'md:hidden' : ''
      if (mode === 'flex') {
        return (
          <div
            className={`min-w-[16px] flex-1 ${visCls} ${opts.editing ? 'flex min-h-[24px] items-center justify-center rounded border border-dashed border-primary-300/80 bg-primary-50/30 px-2 text-[10px] font-medium text-primary-700' : ''}`}
            aria-hidden={!opts.editing}
          >
            {opts.editing ? 'Esnek boşluk' : null}
          </div>
        )
      }
      if (mode === 'horizontal') {
        const w = Number(o.width) || 24
        return (
          <div
            className={`inline-block shrink-0 ${visCls} ${opts.editing ? 'min-h-[20px] rounded border border-dashed border-primary-300/80 bg-primary-50/30 text-center text-[10px] font-medium leading-5 text-primary-700' : ''}`}
            style={{ width: `${w}px` }}
            aria-hidden={!opts.editing}
          >
            {opts.editing ? `${w}` : null}
          </div>
        )
      }
      const preset = o.size && o.size !== 'custom' ? String(o.size) : ''
      const PRESET_CLS: Record<string, [string, string]> = {
        xs: ['h-3 md:h-4', '16px'],
        sm: ['h-5 md:h-8', '32px'],
        md: ['h-8 md:h-12', '48px'],
        lg: ['h-12 md:h-20', '80px'],
        xl: ['h-16 md:h-28 lg:h-[120px]', '120px'],
      }
      const desktopH = Number(o.height) || 48
      const tabletH = o.height_tablet !== undefined && o.height_tablet !== '' && o.height_tablet !== null ? Number(o.height_tablet) : null
      const mobileH = o.height_mobile !== undefined && o.height_mobile !== '' && o.height_mobile !== null ? Number(o.height_mobile) : null
      const hasResponsive = !preset && (tabletH !== null || mobileH !== null)
      const spacerCls = `b-spacer-${block.id}`
      const presetEntry = preset ? PRESET_CLS[preset] : undefined
      const label = presetEntry ? presetEntry[1] : `${desktopH}px`
      const guide = opts.editing ? (
        <div className="pointer-events-none flex h-full w-full items-center justify-center px-4">
          <div className="flex w-full items-center gap-2">
            <span className="h-px flex-1 border-t border-dashed border-primary-300/80" />
            <span className="rounded-full border border-primary-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-primary-700 shadow-sm">
              ↕ {label}
            </span>
            <span className="h-px flex-1 border-t border-dashed border-primary-300/80" />
          </div>
        </div>
      ) : null

      return (
        <>
          {hasResponsive && (
            <style>{`.${spacerCls}{height:${desktopH}px}${tabletH !== null ? `@media(max-width:1023px){.${spacerCls}{height:${tabletH}px}}` : ''}${mobileH !== null ? `@media(max-width:639px){.${spacerCls}{height:${mobileH}px}}` : ''}`}</style>
          )}
          <div
            className={`${presetEntry ? presetEntry[0] : hasResponsive ? spacerCls : ''} ${visCls}`}
            style={!presetEntry && !hasResponsive ? { height: `${desktopH}px` } : undefined}
            aria-hidden={!opts.editing}
          >
            {guide}
          </div>
        </>
      )
    }
    case 'divider': {
      const look = o.look || 'line'
      const lineColor = o.color || 'color-mix(in srgb, currentColor 18%, transparent)'
      const thickness = Number(o.thickness) || (look === 'accent_bar' ? 4 : look === 'double' ? 3 : 1)
      const width = `${o.width ?? 100}%`
      const alignCls = o.align === 'left' ? 'mr-auto' : o.align === 'right' ? 'ml-auto' : 'mx-auto'
      const padCls = o.padding_y === 'none' ? 'py-0' : o.padding_y === 'md' ? 'py-4' : o.padding_y === 'lg' ? 'py-8' : 'py-2'
      const wrapCls = `${depth === 0 && !o.full_width ? container : ''} ${padCls}`.trim()

      let inner: ReactNode
      if (look === 'double') {
        inner = (
          <hr
            className={`${alignCls} border-0 border-t`}
            style={{ width, borderTopWidth: `${Math.max(thickness, 3)}px`, borderTopStyle: 'double', borderTopColor: lineColor }}
          />
        )
      } else if (look === 'gradient') {
        const gradColor = o.color || 'color-mix(in srgb, currentColor 35%, transparent)'
        inner = (
          <div
            className={`${alignCls} rounded-full`}
            style={{ width, height: `${thickness}px`, background: `linear-gradient(to right, transparent, ${gradColor}, transparent)` }}
          />
        )
      } else if (look === 'accent_bar') {
        inner = (
          <div
            className={`${alignCls} rounded-full`}
            style={{
              width: o.width !== undefined ? width : '64px',
              height: `${Math.max(thickness, 3)}px`,
              backgroundColor: o.color || 'var(--color-primary-600, currentColor)',
            }}
          />
        )
      } else if (look === 'text') {
        inner = (
          <div className={`${alignCls} flex items-center gap-4`} style={{ width }}>
            <span className="h-px flex-1" style={{ backgroundColor: lineColor }} />
            <span className="text-xs font-semibold uppercase tracking-widest opacity-70">{o.label || '•'}</span>
            <span className="h-px flex-1" style={{ backgroundColor: lineColor }} />
          </div>
        )
      } else if (look === 'icon') {
        inner = (
          <div className={`${alignCls} flex items-center gap-4`} style={{ width }}>
            <span className="h-px flex-1" style={{ backgroundColor: lineColor }} />
            <span className="text-base leading-none opacity-75" style={o.color ? { color: o.color } : undefined}>{o.icon || '✦'}</span>
            <span className="h-px flex-1" style={{ backgroundColor: lineColor }} />
          </div>
        )
      } else if (look === 'dots') {
        inner = (
          <div className={`${alignCls} flex items-center justify-center gap-3`} style={{ width }}>
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className={`h-1.5 w-1.5 rounded-full ${o.color ? '' : 'opacity-40'}`}
                style={{ backgroundColor: o.color || 'currentColor' }}
              />
            ))}
          </div>
        )
      } else if (look === 'wave') {
        inner = (
          <svg
            aria-hidden
            viewBox="0 0 240 12"
            preserveAspectRatio="none"
            className={`${alignCls} h-3 ${o.color ? '' : 'opacity-25'}`}
            style={{ width, color: o.color || 'currentColor' }}
            fill="none"
          >
            <path
              d="M0 6 Q 15 0, 30 6 T 60 6 T 90 6 T 120 6 T 150 6 T 180 6 T 210 6 T 240 6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        )
      } else {
        inner = (
          <hr
            className={`${alignCls} border-0 border-t`}
            style={{ width, borderTopWidth: `${thickness}px`, borderTopStyle: o.line || 'solid', borderTopColor: lineColor }}
          />
        )
      }

      return <div className={wrapCls}>{inner}</div>
    }
    default: {
      const extra = extraContent(block, o, { locale: data.locale, editing: opts.editing, container, campaigns: data.campaigns })
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
  const padded = !bleed && !['section', 'column', 'spacer', 'divider'].includes(block.type) && depth === 0
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
