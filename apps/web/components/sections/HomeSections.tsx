import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Campaign } from '@e-infak/api-client'
import type { PublicGalleryItem, SiteData } from '../../lib/public-content'
import type { PublicMenu } from '../../lib/default-links'
import { translator } from '../../lib/i18n'
import { QuickDonationForm } from '../QuickDonationForm'
import { Carousel, CountUp } from '../site/Carousel'
import { Slider, type SlideView } from '../site/Slider'
import { CampaignsFilterClient } from './CampaignsFilterClient'
import { GalleryStripClient } from './GalleryStripClient'
import { ZakatMiniCalc } from './ZakatMiniCalc'

export interface NewsPostDto { id: string; slug?: string | null; title: string; image_url?: string | null; published_at?: string | null; summary?: string | null }
export interface CategoryDto { id: string; title: string; description: string; icon: string; campaign_id?: string | null }

export interface HomeData {
  site: SiteData
  locale: string
  campaigns: Campaign[]
  news: NewsPostDto[]
  categories: CategoryDto[]
  /** Menü screen links; header/footer menu blocks fall back to the default links without it. */
  menu?: PublicMenu
  gallery?: PublicGalleryItem[]
}

type T = ReturnType<typeof translator>
type Tpl = 'klasik' | 'kategori' | 'sade' | 'vuslat'
/** Optional site-builder settings of a section; empty = the template's look. */
export type Overrides = Record<string, any>
const CURRENCY: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }
const container = 'mx-auto max-w-[var(--site-container)] px-6'

const tplOf = (data: HomeData): Tpl => data.site.template || 'klasik'
const CATEGORY_LABELS: Record<string, string> = {
  egitim: 'Eğitim', saglik: 'Sağlık', gida: 'Gıda', su: 'Su', yetim: 'Yetim', kurban: 'Kurban', insaat: 'İnşaat', genel: 'Genel',
}
const categoryLabel = (value?: string) => (value ? CATEGORY_LABELS[value] || value : '')
const money = (value: number, c: Campaign, locale: string) => `${(value || 0).toLocaleString(locale)} ${CURRENCY[c.currency || 'TRY'] || '₺'}`

/* ----- Small building blocks ----- */

const ICONS: Record<string, string> = {
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2 0 3.6 1.1 4.3 2.6.7-1.5 2.3-2.6 4.3-2.6 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z',
  shield: 'M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3zm-1.2 13.2-3.3-3.3 1.4-1.4 1.9 1.9 4.6-4.6 1.4 1.4-6 6z',
  receipt: 'M6 2h12v20l-3-2-3 2-3-2-3 2V2zm3 5v2h6V7H9zm0 4v2h6v-2H9z',
  search: 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.7 4.8-1.4 1.4-4.8-4.7A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  coins: 'M12 3c4.4 0 8 1.6 8 3.5S16.4 10 12 10 4 8.4 4 6.5 7.6 3 12 3zm-8 6.2C5.6 10.9 8.6 12 12 12s6.4-1.1 8-2.8v3.3c0 1.9-3.6 3.5-8 3.5s-8-1.6-8-3.5V9.2zm0 6c1.6 1.7 4.6 2.8 8 2.8s6.4-1.1 8-2.8v2.3c0 1.9-3.6 3.5-8 3.5s-8-1.6-8-3.5v-2.3z',
  chart: 'M4 20V10h3v10H4zm6.5 0V4h3v16h-3zM17 20v-7h3v7h-3z',
  grid: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  news: 'M4 4h13v16H6a2 2 0 0 1-2-2V4zm15 4h1v10a2 2 0 0 1-2 2V8h1zM7 7v4h7V7H7zm0 6v1.5h7V13H7zm0 3v1.5h7V16H7z',
  pin: 'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  phone: 'M6.6 2.5 9.8 6 8 8.4c1.1 2.6 3 4.6 5.6 5.6l2.4-1.8 3.5 3.2-1.8 3.9C11 19 5 13 5.4 4.3l1.2-1.8z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z',
  moon: 'M14.5 3a8.5 8.5 0 1 0 6.4 14.1A7 7 0 0 1 14.5 3z',
  quote: 'M4 18v-5.5C4 8.4 6.2 6 10 5.5V8c-2 .5-3 1.8-3 4h3v6H4zm10 0v-5.5c0-4.1 2.2-6.5 6-7V8c-2 .5-3 1.8-3 4h3v6h-6z',
}

export function Icon({ name, className = 'h-6 w-6' }: { name: keyof typeof ICONS | string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}><path d={ICONS[name] || ICONS.heart} /></svg>
}

function Kicker({ children, tpl, light }: { children: ReactNode; tpl: Tpl; light?: boolean }) {
  if (tpl === 'kategori') {
    return <div className={`mb-3 inline-block rounded-full px-4 py-1.5 text-xs font-extrabold tracking-[2px] ${light ? 'bg-white/15 text-white' : 'bg-primary-50 text-primary-700'}`}>{children}</div>
  }
  if (tpl === 'sade') {
    return <div className={`mb-3 text-xs font-semibold uppercase tracking-[3px] ${light ? 'text-white/70' : 'text-gray-400'}`}>{children}</div>
  }
  return (
    <div className={`mb-3 flex items-center gap-3 text-[13px] font-bold tracking-[2px] ${light ? 'text-accent-300' : 'text-primary-600'}`}>
      <span className={`h-[2px] w-8 ${light ? 'bg-accent-300' : 'bg-accent-500'}`} />{children}
    </div>
  )
}

function SectionHead({ tpl, kicker, title, text, link, light }: {
  tpl: Tpl; kicker?: string; title: string; text?: string; link?: { href: string; label: string }; light?: boolean
}) {
  const center = tpl === 'kategori'
  return (
    <div className={`mb-10 flex flex-wrap gap-6 ${center ? 'flex-col items-center text-center' : 'items-end justify-between'}`}>
      <div className={center ? 'max-w-2xl' : 'max-w-2xl'}>
        {kicker && <Kicker tpl={tpl} light={light}>{kicker}</Kicker>}
        <h2 className={`font-heading text-3xl font-bold leading-tight md:text-[40px] ${light ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
        {text && <p className={`mt-3 text-base leading-relaxed ${light ? 'text-white/75' : 'text-gray-500'}`}>{text}</p>}
      </div>
      {link && (
        <Link href={link.href} className={`whitespace-nowrap text-[15px] font-bold ${light ? 'text-white hover:text-accent-200' : 'text-primary-600 hover:text-primary-800'}`}>{link.label}</Link>
      )}
    </div>
  )
}

function Progress({ c, locale, light, big }: { c: Campaign; locale: string; light?: boolean; big?: boolean }) {
  if (!c.show_collected || !c.target_lira) return null
  const pct = Math.min(Math.round(c.progress_percentage || 0), 100)
  return (
    <div>
      <div className={`mb-2 flex items-baseline justify-between gap-3 font-semibold ${big ? 'text-base' : 'text-[13px]'}`}>
        <span className={light ? 'text-white' : 'text-primary-700'}>{money(c.collected_lira, c, locale)}</span>
        <span className={light ? 'text-white/60' : 'text-gray-400'}>%{pct}</span>
      </div>
      <div className={`overflow-hidden rounded-full ${big ? 'h-3' : 'h-2'} ${light ? 'bg-white/20' : 'bg-gray-100'}`}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500" style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-1.5 text-xs ${light ? 'text-white/55' : 'text-gray-400'}`}>{money(c.target_lira, c, locale)}</div>
    </div>
  )
}

/* ----- Hero: a slider of the cover and campaign slides ----- */

function heroSlides(data: HomeData, variant: Tpl, o: Overrides, t: T): SlideView[] {
  const { site } = data
  const hero = {
    ...site.hero,
    ...Object.fromEntries(['badge', 'title', 'subtitle', 'image_url', 'cta_label', 'cta_url'].filter((k) => o[k]).map((k) => [k, o[k]])),
  }
  const align = (o.align as 'left' | 'center' | 'right') || (variant === 'kategori' ? 'center' : 'left')
  const allLabel = t('home.campaigns.all').replace(' →', '').replace(' ←', '')
  const slides: SlideView[] = [{
    image_url: hero.image_url || undefined,
    mobile_image_url: o.mobile_image_url || undefined,
    video_url: o.video_url || undefined,
    countdown_to: o.countdown_to || undefined,
    quick_amounts: o.quick_amounts || undefined,
    badge: hero.badge || undefined,
    title: hero.title || site.name,
    text: hero.subtitle || undefined,
    button_label: hero.cta_label || t('nav.donate'),
    button_url: hero.cta_url || (variant === 'klasik' && o.show_form !== false ? '#hizli-bagis' : '/kampanyalar'),
    button2_label: allLabel,
    button2_url: '/kampanyalar',
    align,
    overlay: o.overlay ?? 35,
    donateLabel: t('campaign.donate'),
  }]
  // Slides set by hand in the builder win over the automatic campaign slides.
  const custom: Record<string, any>[] = Array.isArray(o.slides) ? o.slides : []
  if (custom.length) {
    for (const s of custom) {
      const c = s.campaign_id ? data.campaigns.find((x) => x.id === s.campaign_id) : undefined
      const href = c ? `/kampanyalar/${c.slug}` : undefined
      const progress = c && c.show_collected && c.target_lira > 0
      slides.push({
        image_url: s.image_url || c?.cover_image_url || undefined,
        mobile_image_url: s.mobile_image_url || undefined,
        video_url: s.video_url || undefined,
        countdown_to: s.countdown_to || undefined,
        quick_amounts: s.quick_amounts || undefined,
        badge: s.badge || undefined,
        title: s.title || c?.title || undefined,
        text: s.text || c?.summary || undefined,
        button_label: s.button_label || (c ? t('campaign.donate') : undefined),
        button_url: s.button_url || href,
        button2_label: s.button2_label || (c ? t('campaign.details') : undefined),
        button2_url: s.button2_url || href,
        align,
        overlay: 40,
        campaign: progress
          ? { slug: c.slug, title: c.title, collected: money(c.collected_lira, c, data.locale), target: money(c.target_lira, c, data.locale), progress: c.progress_percentage || 0 }
          : null,
        donateLabel: t('campaign.donate'),
      })
    }
    return slides
  }
  const withSlides = (o.slider ?? site.hero.slider) !== false
  if (!withSlides) return slides
  const ranked = [...data.campaigns.filter((c) => c.is_featured), ...data.campaigns.filter((c) => !c.is_featured)]
  for (const c of ranked.filter((c) => c.cover_image_url).slice(0, 4)) {
    const progress = c.show_collected && c.target_lira > 0
    slides.push({
      image_url: c.cover_image_url,
      badge: (c.is_featured ? t('home.campaigns.urgent') : categoryLabel(c.category) || t('home.campaigns.kicker')).toLocaleUpperCase(data.locale),
      title: c.title,
      text: c.summary,
      button_label: t('campaign.donate'),
      button_url: `/kampanyalar/${c.slug}`,
      button2_label: t('campaign.details'),
      button2_url: `/kampanyalar/${c.slug}`,
      align,
      overlay: 40,
      campaign: progress
        ? { slug: c.slug, title: c.title, collected: money(c.collected_lira, c, data.locale), target: money(c.target_lira, c, data.locale), progress: c.progress_percentage || 0 }
        : null,
      donateLabel: t('campaign.donate'),
    })
  }
  return slides
}

export type HeroVariant =
  | Tpl | 'glass' | 'centered' | 'split_form' | 'video_hero' | 'bento_hero'
  | 'split_floating' | 'minimal_typo' | 'duotone' | 'coverflow' | 'peek'

export function Hero({ data, variant, o = {}, editing = false }: {
  data: HomeData; variant: HeroVariant; o?: Overrides; editing?: boolean
}) {
  const t = translator(data.locale)
  const baseTpl: Tpl = variant === 'vuslat' || variant === 'sade' || variant === 'kategori' ? variant : 'klasik'
  const slides = heroSlides(data, baseTpl, o, t)
  const first = slides[0]
  const showBandForm = variant !== 'split_form' && (variant === 'klasik' ? o.show_form !== false : o.show_form === true)
  const h = o.height || undefined
  const mh = o.mobile_height || 'auto'
  const ef = o.effect || undefined
  const nv = o.nav || undefined
  const as = o.arrow_style || 'round'

  if (variant === 'split_form') {
    const campaign = (o.campaign_id && data.campaigns.find((c) => c.id === o.campaign_id)) || data.campaigns[0]
    return (
      <section className="relative overflow-hidden bg-primary-950 py-14 text-white lg:py-20">
        {first?.image_url && <img src={first.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-950/95 via-primary-900/85 to-primary-800/75" />
        <div className={`${container} relative grid items-center gap-10 lg:grid-cols-[1.1fr_440px]`}>
          <div>
            {first?.badge && <span className="mb-4 inline-block rounded-full border border-white/25 bg-white/10 px-4 py-1 text-xs font-bold uppercase tracking-[2px]">{first.badge}</span>}
            <h1 className="font-heading text-3xl font-bold leading-tight sm:text-5xl">{first?.title}</h1>
            {first?.text && <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">{first.text}</p>}
            {first?.button2_url && (
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={first.button2_url} className="rounded-xl border border-white/30 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">
                  {first.button2_label || t('home.campaigns.all')}
                </Link>
              </div>
            )}
          </div>
          {campaign && (
            <div className="rounded-3xl bg-white p-6 text-gray-900 shadow-2xl">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-primary-600">{campaign.title}</div>
              <QuickDonationForm campaignId={campaign.id} campaignTitle={campaign.title} />
            </div>
          )}
        </div>
      </section>
    )
  }

  if (variant === 'split_floating') {
    return (
      <section className="bg-gradient-to-b from-primary-50/70 to-white py-12 lg:py-16">
        <div className={`${container} grid items-center gap-10 lg:grid-cols-12`}>
          <div className="lg:col-span-6">
            {first?.badge && <span className="mb-4 inline-block rounded-full bg-primary-100 px-3.5 py-1 text-xs font-bold uppercase tracking-[2px] text-primary-800">{first.badge}</span>}
            <h1 className="font-heading text-3xl font-bold leading-tight text-gray-900 sm:text-5xl">{first?.title}</h1>
            {first?.text && <p className="mt-4 text-lg leading-relaxed text-gray-600">{first.text}</p>}
            {first?.quick_amounts && (
              <div className="mt-5 flex flex-wrap gap-2">
                {first.quick_amounts.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 5).map((amt, idx) => (
                  <Link key={idx} href={`/bagis?tutar=${encodeURIComponent(amt)}`} className="rounded-xl border border-primary-200 bg-white px-4 py-2 text-sm font-extrabold text-primary-800 shadow-sm hover:bg-primary-600 hover:text-white">
                    {amt} ₺
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              {first?.button_url && <Link href={first.button_url} className="rounded-xl bg-primary-600 px-7 py-3.5 font-extrabold text-white shadow-lg shadow-primary-600/20 hover:bg-primary-700">{first.button_label}</Link>}
              {first?.button2_url && <Link href={first.button2_url} className="rounded-xl border border-gray-300 bg-white px-6 py-3.5 font-semibold text-gray-700 hover:border-primary-600">{first.button2_label}</Link>}
            </div>
          </div>
          <div className="relative lg:col-span-6">
            {first?.image_url && <img src={first.image_url} alt={first.title || ''} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl" />}
            {(o.stat_value || o.stat_label) && (
              <div className="absolute -bottom-4 start-4 rounded-2xl border border-gray-100 bg-white px-5 py-3.5 shadow-xl sm:start-6">
                {o.stat_value && <div className="font-heading text-2xl font-extrabold text-primary-700">{o.stat_value}</div>}
                {o.stat_label && <div className="text-xs font-semibold text-gray-500">{o.stat_label}</div>}
              </div>
            )}
          </div>
        </div>
        {showBandForm && <QuickDonateBand data={data} o={o} />}
      </section>
    )
  }

  if (variant === 'bento_hero') {
    const imgs = [first?.image_url, ...slides.slice(1, 3).map((s) => s.image_url)].filter(Boolean) as string[]
    return (
      <section className="bg-white py-10 lg:py-14">
        <div className={`${container} grid items-center gap-8 lg:grid-cols-12`}>
          <div className="lg:col-span-5">
            {first?.badge && <span className="mb-3 inline-block rounded-full bg-accent-50 px-3.5 py-1 text-xs font-bold uppercase tracking-[2px] text-accent-700">{first.badge}</span>}
            <h1 className="font-heading text-3xl font-bold leading-tight text-gray-900 sm:text-5xl">{first?.title}</h1>
            {first?.text && <p className="mt-4 text-base leading-relaxed text-gray-600 sm:text-lg">{first.text}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              {first?.button_url && <Link href={first.button_url} className="rounded-xl bg-primary-600 px-7 py-3.5 font-extrabold text-white shadow hover:bg-primary-700">{first.button_label}</Link>}
              {first?.button2_url && <Link href={first.button2_url} className="rounded-xl border border-gray-200 px-6 py-3.5 font-semibold text-gray-700 hover:border-primary-600">{first.button2_label}</Link>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:col-span-7">
            {imgs[0] && <img src={imgs[0]} alt="" className="col-span-2 aspect-[16/9] w-full rounded-3xl object-cover shadow-md sm:col-span-1 sm:row-span-2 sm:h-full" />}
            {imgs[1] && <img src={imgs[1]} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover shadow-sm" />}
            <div className="flex flex-col justify-center rounded-2xl bg-primary-900 p-5 text-white shadow-sm">
              <div className="font-heading text-2xl font-extrabold text-accent-300">{o.stat_value || `${data.campaigns.length}+`}</div>
              <div className="mt-1 text-xs font-medium text-white/80">{o.stat_label || t('home.campaigns.title')}</div>
            </div>
          </div>
        </div>
        {showBandForm && <QuickDonateBand data={data} o={o} />}
      </section>
    )
  }

  if (variant === 'minimal_typo') {
    return (
      <section className="border-b border-gray-100 bg-white py-16 text-center lg:py-24">
        <div className={`${container} max-w-4xl`}>
          {first?.badge && <span className="mb-4 inline-block rounded-full bg-primary-50 px-4 py-1 text-xs font-bold uppercase tracking-[2px] text-primary-700">{first.badge}</span>}
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-gray-950 sm:text-6xl">{first?.title}</h1>
          {first?.text && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-gray-600">{first.text}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {first?.button_url && <Link href={first.button_url} className="rounded-xl bg-primary-600 px-8 py-4 font-extrabold text-white shadow-lg shadow-primary-600/20 hover:bg-primary-700">{first.button_label}</Link>}
            {first?.button2_url && <Link href={first.button2_url} className="rounded-xl border border-gray-300 px-8 py-4 font-semibold text-gray-800 hover:border-primary-600">{first.button2_label}</Link>}
          </div>
        </div>
        {showBandForm && <QuickDonateBand data={data} o={o} />}
      </section>
    )
  }

  return (
    <>
      {variant === 'vuslat' && <Slider slides={slides} layout="card" nav={nv || 'thumbs'} effect={ef || 'fade'} height={h} mobileHeight={mh} arrowStyle={as} editing={editing} interval={6} label={t('home.slider.label')} />}
      {variant === 'sade' && <Slider slides={slides} layout="split" nav={nv} effect={ef} height={h} mobileHeight={mh} arrowStyle={as} editing={editing} interval={7} label={t('home.slider.label')} />}
      {variant === 'kategori' && <Slider slides={slides} effect={ef || 'fade'} height={h || 'lg'} mobileHeight={mh} nav={nv} arrowStyle={as} editing={editing} interval={6} label={t('home.slider.label')} />}
      {variant === 'klasik' && <Slider slides={slides} height={h || 'lg'} mobileHeight={mh} interval={6} nav={nv || 'tabs'} effect={ef} arrowStyle={as} editing={editing} label={t('home.slider.label')} />}
      {variant === 'glass' && <Slider slides={slides} layout="glass" height={h || 'lg'} mobileHeight={mh} nav={nv || 'numbers'} effect={ef || 'zoom'} arrowStyle={as} editing={editing} interval={6} label={t('home.slider.label')} />}
      {variant === 'centered' && <Slider slides={slides.map((s) => ({ ...s, align: 'center' }))} layout="overlay" height={h || 'screen'} mobileHeight={mh} nav={nv || 'dots'} effect={ef || 'fade'} arrowStyle={as} editing={editing} interval={6} label={t('home.slider.label')} />}
      {(variant === 'video_hero' || variant === 'duotone' || variant === 'coverflow' || variant === 'peek') && (
        <Slider slides={slides} layout={variant} height={h || 'lg'} mobileHeight={mh} nav={nv || 'dots'} effect={ef || 'fade'} arrowStyle={as} editing={editing} interval={6} label={t('home.slider.label')} />
      )}
      {showBandForm && <QuickDonateBand data={data} o={o} />}
    </>
  )
}

/** Quick donation form with a short "why give here" text beside it. */
export function QuickDonateBand({ data, o = {} }: { data: HomeData; o?: Overrides }) {
  const t = translator(data.locale)
  const tpl = tplOf(data)
  const campaign = (o.campaign_id && data.campaigns.find((c) => c.id === o.campaign_id)) || data.campaigns[0]
  const bg = tpl === 'kategori' ? 'bg-primary-50' : tpl === 'sade' ? 'bg-white' : 'bg-white bg-[radial-gradient(circle_at_10%_20%,var(--color-primary-50),transparent_45%)]'
  return (
    <section id="hizli-bagis" className={`scroll-mt-24 border-b border-black/5 ${bg}`}>
      <div className={`${container} grid items-center gap-12 py-16 lg:grid-cols-[1fr_480px]`}>
        <div>
          <Kicker tpl={tpl}>{t('home.quick.kicker')}</Kicker>
          <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-gray-900 md:text-[40px]">{o.title || t('home.quick.title')}</h2>
          <p className="mb-7 max-w-lg text-lg leading-relaxed text-gray-600">{t('home.quick.text')}</p>
          <ul className="space-y-3">
            {(['home.quick.p1', 'home.quick.p2', 'home.quick.p3'] as const).map((key, i) => (
              <li key={key} className="flex items-center gap-3 font-semibold text-gray-800">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary-600 text-white">
                  <Icon name={['shield', 'receipt', 'check'][i]} className="h-[18px] w-[18px]" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 -z-0 rounded-[32px] bg-gradient-to-br from-primary-100 to-accent-100 opacity-70 blur-xl" aria-hidden />
          <div className="relative">
            {campaign
              ? <QuickDonationForm campaignId={campaign.id} campaignTitle={campaign.title} />
              : <div className="rounded-3xl border bg-white p-7 text-center text-gray-600 shadow-xl">{t('home.noCampaignForm')}</div>}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ----- Sections ----- */

export function Stats({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const tpl = tplOf(data)
  const collected = data.campaigns.filter((c) => (c.currency || 'TRY') === 'TRY').reduce((sum, c) => sum + (c.collected_lira || 0), 0)
  const manual = o.mode === 'manual' && Array.isArray(o.items) && o.items.length
  const items: { value: ReactNode; label: string; icon: string }[] = manual
    ? (o.items as { value?: string; label?: string }[]).map((i, n) => ({ value: i.value || '', label: i.label || '', icon: ['heart', 'chart', 'coins', 'grid', 'news', 'shield'][n % 6] }))
    : [
      { value: <CountUp value={data.campaigns.length} locale={data.locale} />, label: t('home.stats.campaigns'), icon: 'heart' },
      { value: <CountUp value={Math.round(collected)} locale={data.locale} suffix=" ₺" />, label: t('home.stats.collected'), icon: 'coins' },
      data.categories.length
        ? { value: <CountUp value={data.categories.length} locale={data.locale} />, label: t('home.stats.categories'), icon: 'grid' }
        : null,
      { value: <CountUp value={data.news.length} locale={data.locale} />, label: t('home.stats.news'), icon: 'news' },
    ].filter(Boolean) as { value: ReactNode; label: string; icon: string }[]
  const cols = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-2 lg:grid-cols-4', 'sm:grid-cols-3 lg:grid-cols-5', 'sm:grid-cols-3 lg:grid-cols-6'][items.length] || 'sm:grid-cols-3'

  if (tpl === 'sade') {
    return (
      <section className="bg-white">
        <div className={`${container} py-16`}>
          <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200 ${cols}`}>
            {items.map((item, i) => (
              <div key={i} className="bg-white p-7">
                <div className="mb-2 font-heading text-3xl font-bold text-gray-900 md:text-4xl">{item.value}</div>
                <div className="text-sm text-gray-500">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }
  return (
    <section className={`relative overflow-hidden ${tpl === 'kategori' ? 'bg-gradient-to-br from-primary-700 to-primary-900' : 'bg-primary-950'}`}>
      <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-accent-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -start-20 h-80 w-80 rounded-full bg-primary-400/20 blur-3xl" aria-hidden />
      <div className={`relative ${container} py-16`}>
        {tpl === 'klasik' && (
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Kicker tpl={tpl} light>{t('home.stats.kicker')}</Kicker>
              <h2 className="font-heading text-3xl font-bold text-white md:text-[36px]">{o.title || t('home.stats.title')}</h2>
            </div>
          </div>
        )}
        <div className={`grid grid-cols-2 gap-5 ${cols}`}>
          {items.map((item, i) => (
            <div key={i} className={`rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm ${tpl === 'kategori' ? 'text-center' : ''}`}>
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500/90 text-white ${tpl === 'kategori' ? 'mx-auto' : ''}`}>
                <Icon name={item.icon} />
              </div>
              <div className="font-heading text-3xl font-bold text-white md:text-[40px]">{item.value}</div>
              <div className="mt-1 text-sm text-white/70">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const CAT_COLS: Record<number, string> = {
  2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5',
}

export function Categories({ data, t, o = {}, editing = false }: { data: HomeData; t: T; o?: Overrides; editing?: boolean }) {
  const customItems = Array.isArray(o.items)
    ? (o.items as Array<Record<string, any>>).filter((x) => x.title)
    : []
  const sourceList = customItems.length
    ? customItems.map((x, idx) => ({
        id: String(x.id || idx),
        title: String(x.title || ''),
        description: String(x.description || ''),
        icon: String(x.icon || '🤲'),
        image_url: x.image_url ? String(x.image_url) : undefined,
        badge: x.badge ? String(x.badge) : undefined,
        url: x.url ? String(x.url) : undefined,
        campaign_id: x.campaign_id ? String(x.campaign_id) : undefined,
      }))
    : data.categories.map((k) => ({ ...k, image_url: undefined as string | undefined, badge: undefined as string | undefined, url: undefined as string | undefined }))

  if (!sourceList.length) {
    return editing
      ? <div className={`${container} py-12`}><p className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-400">Bağış kategorisi ekleyin veya yönetim panelinden kategori tanımlayın.</p></div>
      : null
  }

  const tpl = tplOf(data)
  const look = String(o.look || 'grid')
  const cols = Math.min(5, Math.max(2, Number(o.columns) || (look === 'cards' ? 3 : 4)))
  const showDesc = o.show_description !== false
  const ctaLabel = o.button_label ? String(o.button_label) : t('campaign.donate')
  const slugById = new Map(data.campaigns.map((c) => [c.id, c.slug]))
  const hrefFor = (k: (typeof sourceList)[number]) => {
    if (k.url) return k.url
    const slug = k.campaign_id ? slugById.get(k.campaign_id) : undefined
    return slug ? `/kampanyalar/${slug}` : '/kampanyalar'
  }

  const isGlass = look === 'glass'
  const sectionBg = isGlass
    ? 'bg-gradient-to-br from-primary-950 via-primary-900 to-gray-950 text-white'
    : tpl === 'kategori'
      ? 'bg-gradient-to-b from-primary-50/70 to-transparent'
      : ''

  const renderCard = (k: (typeof sourceList)[number], idx: number) => {
    const href = hrefFor(k)
    const isFeaturedBento = look === 'bento' && idx === 0

    if (look === 'compact') {
      return (
        <Link key={k.id || k.title} href={href}
          className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-md">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary-50 text-2xl transition group-hover:bg-primary-600">{k.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-base font-bold text-gray-900 group-hover:text-primary-700">{k.title}</div>
            {showDesc && k.description && <div className="truncate text-xs text-gray-500">{k.description}</div>}
          </div>
          <span className="text-lg font-bold text-primary-600 transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span>
        </Link>
      )
    }

    if (look === 'photo') {
      return (
        <Link key={k.id || k.title} href={href}
          className="group relative flex min-h-[240px] flex-col justify-end overflow-hidden rounded-3xl bg-primary-950 p-6 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
          {k.image_url && (
            <img src={k.image_url} alt={k.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
          <div className="relative space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-2xl backdrop-blur-sm">{k.icon}</span>
              {k.badge && <span className="rounded-full bg-accent-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">{k.badge}</span>}
            </div>
            <div className="font-heading text-xl font-bold">{k.title}</div>
            {showDesc && k.description && <p className="line-clamp-2 text-xs leading-relaxed text-white/80">{k.description}</p>}
            <div className="pt-1 text-xs font-bold text-accent-300">{ctaLabel} <span className="inline-block transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span></div>
          </div>
        </Link>
      )
    }

    if (isGlass) {
      return (
        <Link key={k.id || k.title} href={href}
          className="group flex flex-col gap-3 rounded-3xl border border-white/15 bg-white/10 p-6 text-white backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-accent-400/60 hover:bg-white/15">
          <div className="flex items-center justify-between">
            <span className="flex h-13 w-13 items-center justify-center rounded-2xl bg-white/15 text-2xl">{k.icon}</span>
            {k.badge && <span className="rounded-full bg-accent-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{k.badge}</span>}
          </div>
          <div className="font-heading text-lg font-bold text-white">{k.title}</div>
          {showDesc && k.description && <p className="flex-1 text-xs leading-relaxed text-white/75">{k.description}</p>}
          <div className="pt-1 text-xs font-bold text-accent-300">{ctaLabel} <span className="inline-block transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span></div>
        </Link>
      )
    }

    if (look === 'cards') {
      return (
        <Link key={k.id || k.title} href={href}
          className="group flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary-500 hover:shadow-xl">
          <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-primary-50 via-primary-100/60 to-accent-50">
            {k.image_url ? (
              <img src={k.image_url} alt={k.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
            ) : (
              <span className="text-5xl transition-transform duration-300 group-hover:scale-110">{k.icon}</span>
            )}
            {k.badge && <span className="absolute end-3 top-3 rounded-full bg-primary-600 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">{k.badge}</span>}
          </div>
          <div className="flex flex-1 flex-col gap-2 p-6">
            <div className="font-heading text-xl font-bold text-gray-900">{k.title}</div>
            {showDesc && k.description && <p className="flex-1 text-sm leading-relaxed text-gray-500">{k.description}</p>}
            <div className="mt-3 inline-flex w-fit items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white transition group-hover:bg-primary-700">
              {ctaLabel} <span className="rtl:rotate-180">→</span>
            </div>
          </div>
        </Link>
      )
    }

    return (
      <Link key={k.id || k.title} href={href}
        className={`group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary-600 hover:shadow-xl ${
          isFeaturedBento ? 'sm:col-span-2 bg-gradient-to-br from-primary-50/70 via-white to-accent-50/40' : ''
        }`}>
        <span className="absolute -end-8 -top-8 h-24 w-24 rounded-full bg-primary-50 transition-transform duration-500 group-hover:scale-[3]" aria-hidden />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-[28px] shadow-lg shadow-primary-600/20">{k.icon}</div>
          {k.badge && <span className="rounded-full bg-accent-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">{k.badge}</span>}
        </div>
        <div className={`relative mt-2 font-bold text-gray-900 ${isFeaturedBento ? 'font-heading text-2xl' : 'text-lg'}`}>{k.title}</div>
        {showDesc && k.description && <div className="relative text-[13px] leading-relaxed text-gray-500">{k.description}</div>}
        <div className="relative mt-auto pt-2 text-[13px] font-bold text-primary-600">{ctaLabel} <span className="inline-block transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span></div>
      </Link>
    )
  }

  const carouselWidthMap: Record<number, string> = {
    2: 'w-[85%] sm:w-[48%]',
    3: 'w-[85%] sm:w-[46%] lg:w-[31.5%]',
    4: 'w-[78%] sm:w-[46%] lg:w-[23.5%]',
    5: 'w-[72%] sm:w-[32%] lg:w-[18.5%]',
  }

  return (
    <section id="kategoriler" className={sectionBg}>
      <div className={`${container} py-[72px]`}>
        <SectionHead
          tpl={isGlass ? 'kategori' : tpl}
          kicker={o.kicker || t('home.categories.kicker')}
          title={o.title || t('home.categories.title')}
          text={o.subtitle ? String(o.subtitle) : t('home.categories.text')}
          light={isGlass}
          link={o.show_all_link ? { href: '/kampanyalar', label: t('home.campaigns.all') } : undefined}
        />
        {look === 'pills' ? (
          <div className="flex flex-wrap justify-center gap-3">
            {sourceList.map((k) => (
              <Link key={k.id || k.title} href={hrefFor(k)}
                className="inline-flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-800 shadow-sm transition hover:border-primary-600 hover:bg-primary-50 hover:text-primary-800">
                <span className="text-lg">{k.icon}</span>{k.title}
              </Link>
            ))}
          </div>
        ) : look === 'carousel' ? (
          <Carousel label={o.title || t('home.categories.title')} items={carouselWidthMap[cols] || carouselWidthMap[4]} dots arrows>
            {sourceList.map(renderCard)}
          </Carousel>
        ) : (
          <div className={`grid gap-4 sm:grid-cols-2 ${CAT_COLS[cols] || 'lg:grid-cols-4'}`}>
            {sourceList.map(renderCard)}
          </div>
        )}
      </div>
    </section>
  )
}

const GRID_COLS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }

/** Campaigns chosen by a block: newest, featured, ending soon, hand-picked or one category. */
export function pickCampaigns(all: Campaign[], o: Overrides): Campaign[] {
  let list = all
  if (o.source === 'featured') list = all.filter((c) => c.is_featured)
  if (o.source === 'ending') {
    const now = Date.now()
    const withDate = all.filter((c) => c.end_date)
    const upcoming = withDate.filter((c) => new Date(String(c.end_date)).getTime() >= now)
    list = (upcoming.length ? upcoming : withDate).sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
  }
  if (o.source === 'category' && o.category) {
    const needle = String(o.category).toLocaleLowerCase('tr').trim()
    list = all.filter((c) =>
      c.category?.toLocaleLowerCase('tr') === needle || categoryLabel(c.category).toLocaleLowerCase('tr') === needle,
    )
  }
  if (o.source === 'selected' && Array.isArray(o.campaign_ids)) {
    const byId = new Map(all.map((c) => [c.id, c]))
    list = (o.campaign_ids as string[]).map((id) => byId.get(id)).filter(Boolean) as Campaign[]
  }
  return o.limit ? list.slice(0, Number(o.limit)) : list
}

function campaignDaysLeft(endDate?: string | null): number | null {
  if (!endDate) return null
  const diff = new Date(endDate).getTime() - Date.now()
  if (!Number.isFinite(diff) || diff <= 0) return null
  return Math.ceil(diff / 86400000)
}

export function CampaignCard({
  c, t, locale, showProgress = true, wide = false, style = 'classic',
  buttonLabel, showQuickAmounts = false, showDaysLeft = true, rowMode = false,
}: {
  c: Campaign; t: T; locale: string; showProgress?: boolean; wide?: boolean; style?: string
  buttonLabel?: string; showQuickAmounts?: boolean; showDaysLeft?: boolean; rowMode?: boolean
}) {
  const isCompact = style === 'compact'
  const isBordered = style === 'bordered'
  const isOverlay = style === 'overlay'
  const isMinimal = style === 'minimal'
  const isGlass = style === 'glass'
  const daysLeft = showDaysLeft ? campaignDaysLeft(c.end_date) : null
  const goalReached = (c.progress_percentage || 0) >= 100
  const ctaLabel = buttonLabel || t('campaign.donate')
  const quickAmounts = showQuickAmounts
    ? (c.suggested_amounts_cents || []).map((cents) => Math.round(cents / 100)).filter((n) => n > 0).slice(0, 3)
    : []

  const quickChips = quickAmounts.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {quickAmounts.map((amt) => (
        <Link key={amt} href={`/kampanyalar/${c.slug}?tutar=${amt}`}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            isOverlay || isGlass
              ? 'border border-white/30 bg-white/15 text-white hover:bg-white hover:text-primary-900'
              : 'border border-primary-200 bg-primary-50/70 text-primary-800 hover:bg-primary-600 hover:text-white'
          }`}>
          {amt} ₺
        </Link>
      ))}
    </div>
  )

  const statusBadges = (
    <>
      {c.is_featured && <span className="rounded-md bg-accent-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">{t('home.campaigns.urgent')}</span>}
      {c.category && <span className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-bold text-gray-800 backdrop-blur">{categoryLabel(c.category)}</span>}
      {goalReached && <span className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-extrabold text-white">Hedefe Ulaşıldı ✓</span>}
      {daysLeft !== null && daysLeft <= 15 && !goalReached && (
        <span className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-extrabold text-white">Son {daysLeft} gün</span>
      )}
    </>
  )

  if (rowMode) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs transition hover:border-primary-400 hover:shadow-md sm:flex-row sm:items-center">
        <Link href={`/kampanyalar/${c.slug}`} className="relative h-20 w-full flex-none overflow-hidden rounded-xl bg-primary-50 sm:w-28" tabIndex={-1} aria-hidden>
          {c.cover_image_url
            ? <img src={c.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <div className="flex h-full items-center justify-center text-primary-600/30"><Icon name="heart" className="h-8 w-8" /></div>}
        </Link>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {c.category && <span className="text-[11px] font-bold uppercase tracking-wider text-primary-600">{categoryLabel(c.category)}</span>}
            {daysLeft !== null && daysLeft <= 15 && <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Son {daysLeft} gün</span>}
            {goalReached && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Tamamlandı ✓</span>}
          </div>
          <Link href={`/kampanyalar/${c.slug}`} className="block truncate font-heading text-lg font-bold text-gray-900 hover:text-primary-700">{c.title}</Link>
          {showProgress && <div className="max-w-md"><Progress c={c} locale={locale} /></div>}
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          {quickChips}
          <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700">
            {ctaLabel}
          </Link>
        </div>
      </div>
    )
  }

  if (isOverlay) {
    return (
      <div className="group relative flex h-full min-h-[360px] flex-col justify-end overflow-hidden rounded-3xl bg-gray-900 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
        {c.cover_image_url
          ? <img src={c.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          : <div className="absolute inset-0 flex items-center justify-center bg-primary-950 text-white/20"><Icon name="heart" className="h-16 w-16" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
        <div className="absolute start-4 top-4 flex flex-wrap gap-2">{statusBadges}</div>
        <div className="relative space-y-3 p-6">
          <Link href={`/kampanyalar/${c.slug}`} className="line-clamp-2 block font-heading text-2xl font-bold leading-snug text-white hover:text-accent-300">{c.title}</Link>
          {c.summary && <p className="line-clamp-2 text-sm text-white/80">{c.summary}</p>}
          {showProgress && <Progress c={c} locale={locale} light />}
          {quickChips}
          <div className="flex gap-2 pt-1">
            <Link href={`/kampanyalar/${c.slug}`} className="flex-1 rounded-xl bg-accent-500 py-2.5 text-center text-sm font-extrabold text-white transition hover:bg-accent-600">
              {ctaLabel}
            </Link>
            <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl border border-white/35 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-sm hover:bg-white/15">
              {t('campaign.details')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isGlass) {
    return (
      <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-primary-950 via-primary-900 to-gray-900 p-4 text-white shadow-xl transition-all duration-300 hover:-translate-y-1">
        <Link href={`/kampanyalar/${c.slug}`} className="relative block aspect-[16/10] overflow-hidden rounded-2xl bg-black/25" tabIndex={-1} aria-hidden>
          {c.cover_image_url
            ? <img src={c.cover_image_url} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
            : <div className="flex h-full items-center justify-center text-white/25"><Icon name="heart" className="h-12 w-12" /></div>}
          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">{statusBadges}</div>
        </Link>
        <div className="mt-4 flex flex-1 flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <Link href={`/kampanyalar/${c.slug}`} className="line-clamp-2 font-heading text-xl font-bold leading-snug text-white hover:text-accent-300">{c.title}</Link>
          {c.summary && <p className="line-clamp-2 flex-1 text-sm text-white/75">{c.summary}</p>}
          {showProgress && <Progress c={c} locale={locale} light />}
          {quickChips}
          <Link href={`/kampanyalar/${c.slug}`} className="mt-1 rounded-xl bg-white py-2.5 text-center text-sm font-extrabold text-primary-950 transition hover:bg-accent-400 hover:text-white">
            {ctaLabel}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`group flex h-full overflow-hidden transition-all duration-300 ${
      isMinimal
        ? 'flex-col'
        : `rounded-2xl bg-white hover:-translate-y-1 ${isBordered ? 'border-2 border-primary-200 shadow-sm hover:border-primary-500 hover:shadow-xl' : 'border border-gray-200 hover:shadow-2xl'}`
    } ${wide ? 'flex-col sm:flex-row' : 'flex-col'}`}>
      <Link href={`/kampanyalar/${c.slug}`} className={`relative block overflow-hidden bg-primary-50 ${isMinimal ? 'rounded-2xl' : ''} ${wide ? 'h-[200px] sm:h-auto sm:w-72 sm:flex-none' : isCompact ? 'aspect-[16/9]' : 'aspect-[16/10]'}`} tabIndex={-1} aria-hidden>
        {c.cover_image_url
          ? <img src={c.cover_image_url} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          : <div className="flex h-full items-center justify-center text-primary-600/30"><Icon name="heart" className="h-12 w-12" /></div>}
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute start-3 top-3 flex flex-wrap gap-2">{statusBadges}</div>
      </Link>
      <div className={`flex flex-1 flex-col ${isMinimal ? 'gap-2.5 pt-4' : isCompact ? 'gap-2 p-4' : 'gap-3 p-5'}`}>
        <Link href={`/kampanyalar/${c.slug}`} className={`line-clamp-2 font-heading font-bold leading-snug text-gray-900 hover:text-primary-700 ${isCompact ? 'text-lg' : 'text-xl'}`}>{c.title}</Link>
        {!isCompact && <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-gray-500">{c.summary}</p>}
        {showProgress && <Progress c={c} locale={locale} />}
        {quickChips}
        <div className="flex gap-2 pt-1">
          <Link href={`/kampanyalar/${c.slug}`}
            className={`flex-1 rounded-lg bg-primary-600 text-center text-sm font-bold text-white transition-colors hover:bg-primary-700 ${isCompact ? 'py-2.5' : 'py-3'}`}>
            {ctaLabel}
          </Link>
          {!isCompact && !isMinimal && (
            <Link href={`/kampanyalar/${c.slug}`}
              className="rounded-lg border-[1.5px] border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600">
              {t('campaign.details')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export function Campaigns({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const tpl = tplOf(data)
  const list = pickCampaigns(data.campaigns, o)
  const showProgress = o.show_progress !== false
  const layout = o.layout || (tpl === 'klasik' && list.length > 3 ? 'carousel' : 'grid')
  const columns = Math.min(4, Math.max(1, Number(o.columns) || (tpl === 'sade' ? 2 : 3)))
  const cardStyle = String(o.card_style || 'classic')
  const buttonLabel = o.button_label ? String(o.button_label) : undefined
  const showQuickAmounts = Boolean(o.show_quick_amounts)
  const showDaysLeft = o.show_days_left !== false
  const showFilters = Boolean(o.show_filters) && layout !== 'carousel'

  const renderCard = (c: Campaign) => (
    <CampaignCard
      key={c.id}
      c={c}
      t={t}
      locale={data.locale}
      showProgress={showProgress}
      wide={layout === 'list'}
      rowMode={layout === 'rows'}
      style={cardStyle}
      buttonLabel={buttonLabel}
      showQuickAmounts={showQuickAmounts}
      showDaysLeft={showDaysLeft}
    />
  )

  const carouselWidthMap: Record<number, string> = {
    1: 'w-full',
    2: 'w-[88%] sm:w-[48%]',
    3: 'w-[85%] sm:w-[46%] lg:w-[31.5%]',
    4: 'w-[78%] sm:w-[46%] lg:w-[23.5%]',
  }

  const masonryCols: Record<number, string> = {
    1: 'columns-1',
    2: 'columns-1 sm:columns-2',
    3: 'columns-1 sm:columns-2 lg:columns-3',
    4: 'columns-1 sm:columns-2 lg:columns-4',
  }

  const containerClass = layout === 'list' || layout === 'rows'
    ? 'grid gap-4'
    : layout === 'masonry'
      ? `${masonryCols[columns] || 'columns-1 sm:columns-2 lg:columns-3'} gap-6 space-y-6`
      : `grid gap-6 sm:grid-cols-2 ${GRID_COLS[columns] || 'lg:grid-cols-3'}`

  const filterAllLabel = data.locale === 'en' ? 'All' : data.locale === 'ar' ? 'الكل' : 'Tümü'

  return (
    <section id="projeler" className={tpl === 'klasik' ? 'bg-stone-50' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} kicker={o.kicker || t('home.campaigns.kicker')} title={o.title || t('home.campaigns.title')}
          link={o.show_all_link !== false ? { href: '/kampanyalar', label: t('home.campaigns.all') } : undefined} />
        {list.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">{t('home.campaigns.empty')}</div>
        ) : layout === 'carousel' ? (
          <Carousel
            label={o.title || t('home.campaigns.title')}
            items={carouselWidthMap[columns] || carouselWidthMap[3]}
            autoplay={o.autoplay !== false}
            dots={o.dots !== false}
            arrows={o.arrows !== false}
            nav={o.nav || (o.dots === false ? 'none' : 'dots')}
          >
            {list.map(renderCard)}
          </Carousel>
        ) : showFilters ? (
          <CampaignsFilterClient
            allLabel={filterAllLabel}
            containerClass={containerClass}
            isBento={layout === 'bento'}
            items={list.map((c) => ({
              key: c.id,
              category: c.category || 'other',
              categoryLabel: c.category ? categoryLabel(c.category) : filterAllLabel,
              node: layout === 'masonry' ? <div className="break-inside-avoid">{renderCard(c)}</div> : renderCard(c),
            }))}
          />
        ) : (
          <div className={containerClass}>
            {list.map((c, idx) => (
              <div key={c.id} className={layout === 'bento' && idx === 0 ? 'sm:col-span-2' : layout === 'masonry' ? 'break-inside-avoid' : ''}>
                {renderCard(c)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/** One campaign in the spotlight: chosen, or the first featured / ending-soon one. */
export function FeaturedCampaign({ data, t, o = {}, editing = false }: { data: HomeData; t: T; o?: Overrides; editing?: boolean }) {
  const tpl = tplOf(data)
  const c = (o.campaign_id && data.campaigns.find((x) => x.id === o.campaign_id))
    || data.campaigns.find((x) => x.is_featured && x.cover_image_url)
    || pickCampaigns(data.campaigns, { source: 'ending' })[0]
    || data.campaigns.find((x) => x.cover_image_url)
    || data.campaigns[0]
  if (!c) {
    return editing
      ? <div className={`${container} py-10`}><p className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-400">Acil kampanya vitrini için aktif bir kampanya ekleyin.</p></div>
      : null
  }

  const look = String(o.look || 'split')
  const title = String(o.title || c.title)
  const summary = o.summary ? String(o.summary) : c.summary
  const kicker = String(o.kicker || (c.is_featured ? t('home.featured.kicker') : (categoryLabel(c.category) || t('home.campaigns.kicker')).toLocaleUpperCase(data.locale)))
  const ctaLabel = String(o.button_label || t('campaign.donate'))
  const showProgress = o.show_progress !== false
  const showCountdown = o.show_countdown !== false
  const showDetails = o.show_details_button !== false
  const imgRight = o.image_side === 'right'

  const customAmounts = String(o.quick_amounts || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
  const campAmounts: number[] = (c.suggested_amounts_cents || []).map((cents: number) => Math.round(cents / 100)).filter((n: number) => n > 0)
  const quickAmounts: number[] = (customAmounts.length ? customAmounts : campAmounts).slice(0, 4)

  const targetDateStr = o.countdown_to ? String(o.countdown_to) : c.end_date
  const diffMs = targetDateStr ? new Date(targetDateStr).getTime() - Date.now() : NaN
  const hasCountdown = showCountdown && Number.isFinite(diffMs) && diffMs > 0
  const days = hasCountdown ? Math.floor(diffMs / 86400000) : 0
  const hours = hasCountdown ? Math.floor((diffMs % 86400000) / 3600000) : 0
  const mins = hasCountdown ? Math.floor((diffMs % 3600000) / 60000) : 0

  const ytId = o.video_url
    ? String(o.video_url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]
    : undefined
  const isMp4 = o.video_url && /\.(mp4|webm|ogg)(\?|$)/i.test(String(o.video_url))

  const renderMedia = (cls = 'absolute inset-0 h-full w-full object-cover') => {
    if (ytId && !editing) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&playsinline=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 border-0"
        />
      )
    }
    if (isMp4) {
      return <video src={String(o.video_url)} poster={c.cover_image_url || undefined} autoPlay muted loop playsInline className={cls} />
    }
    if (c.cover_image_url) {
      return <img src={c.cover_image_url} alt={title} className={cls} loading="lazy" />
    }
    return <div className="absolute inset-0 flex items-center justify-center bg-primary-900/40 text-white/25"><Icon name="heart" className="h-20 w-20" /></div>
  }

  const urgentPill = (darkBg: boolean) => (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold tracking-[2px] ${darkBg ? 'bg-white/15 text-white backdrop-blur-sm' : 'bg-accent-50 text-accent-700'}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
      </span>
      {kicker}
    </span>
  )

  const countdownBoxes = hasCountdown && (
    <div className="flex flex-wrap gap-2">
      {[
        { v: days, l: 'Gün' },
        { v: hours, l: 'Saat' },
        { v: mins, l: 'Dk' },
      ].map((b) => (
        <div key={b.l} className="flex min-w-[60px] flex-col items-center rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white backdrop-blur-sm">
          <span className="font-heading text-xl font-extrabold leading-none">{String(b.v).padStart(2, '0')}</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-75">{b.l}</span>
        </div>
      ))}
    </div>
  )

  const quickChips = (darkBg: boolean) => quickAmounts.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {quickAmounts.map((amt) => (
        <Link key={amt} href={`/kampanyalar/${c.slug}?tutar=${amt}`}
          className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
            darkBg
              ? 'border border-white/30 bg-white/15 text-white backdrop-blur-sm hover:bg-white hover:text-primary-900'
              : 'border border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-600 hover:text-white'
          }`}>
          {amt} ₺
        </Link>
      ))}
    </div>
  )

  if (look === 'alert_bar') {
    return (
      <section className="bg-gradient-to-r from-red-700 via-rose-700 to-accent-700 text-white">
        <div className={`${container} flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between`}>
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <span className="relative flex h-3 w-3 flex-none">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-white/85">
                <span>{kicker}</span>
                {hasCountdown && <span className="rounded bg-black/25 px-2 py-0.5">⏳ {days} gün {hours} saat</span>}
              </div>
              <div className="truncate font-heading text-lg font-bold sm:text-xl">{title}</div>
            </div>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2.5">
            {quickChips(true)}
            <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold text-rose-800 shadow transition hover:bg-rose-50">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'overlay') {
    return (
      <section className="relative overflow-hidden bg-gray-950 text-white">
        {renderMedia()}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/35" />
        <div className={`relative ${container} py-16 md:py-24`}>
          <div className="max-w-2xl space-y-5">
            {urgentPill(true)}
            <h2 className="font-heading text-3xl font-bold leading-tight text-white md:text-5xl">{title}</h2>
            {summary && <p className="text-lg leading-relaxed text-white/85">{summary}</p>}
            {countdownBoxes}
            {showProgress && <div className="max-w-md"><Progress c={c} locale={data.locale} light big /></div>}
            {quickChips(true)}
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl bg-accent-500 px-8 py-4 font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-accent-600">
                {ctaLabel}
              </Link>
              {showDetails && (
                <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl border border-white/40 px-7 py-4 font-semibold text-white backdrop-blur-sm hover:bg-white/15">
                  {t('campaign.details')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'glass' || look === 'countdown') {
    const isCountdown = look === 'countdown'
    return (
      <section className={`py-12 md:py-16 ${isCountdown ? 'bg-gradient-to-br from-rose-950 via-primary-950 to-gray-950 text-white' : 'bg-gradient-to-br from-primary-950 via-primary-900 to-gray-950 text-white'}`}>
        <div className={container}>
          <div className="grid items-center gap-8 rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-md md:grid-cols-12 md:p-10">
            <div className={`relative min-h-[260px] overflow-hidden rounded-2xl bg-black/30 md:col-span-5 md:min-h-[360px] ${imgRight ? 'md:order-2' : ''}`}>
              {renderMedia()}
            </div>
            <div className={`space-y-5 md:col-span-7 ${imgRight ? 'md:order-1' : ''}`}>
              {urgentPill(true)}
              <h2 className="font-heading text-3xl font-bold leading-tight text-white md:text-4xl">{title}</h2>
              {summary && <p className="text-base leading-relaxed text-white/80 md:text-lg">{summary}</p>}
              {countdownBoxes}
              {showProgress && <div className="max-w-md"><Progress c={c} locale={data.locale} light big /></div>}
              {quickChips(true)}
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl bg-white px-7 py-3.5 font-extrabold text-primary-950 shadow-lg transition hover:bg-accent-400 hover:text-white">
                  {ctaLabel}
                </Link>
                {showDetails && (
                  <Link href={`/kampanyalar/${c.slug}`} className="rounded-xl border border-white/35 px-6 py-3.5 font-semibold text-white hover:bg-white/15">
                    {t('campaign.details')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'donate_box') {
    return (
      <section className="bg-primary-50/70 py-14">
        <div className={container}>
          <div className="grid items-stretch overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl md:grid-cols-12">
            <div className="relative flex flex-col justify-end overflow-hidden bg-primary-950 p-8 text-white md:col-span-7 md:min-h-[400px]">
              {renderMedia()}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
              <div className="relative space-y-3">
                {urgentPill(true)}
                <h2 className="font-heading text-3xl font-bold text-white md:text-4xl">{title}</h2>
                {summary && <p className="max-w-xl text-sm leading-relaxed text-white/85 md:text-base">{summary}</p>}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5 p-6 md:col-span-5 md:p-8">
              {countdownBoxes && <div className="[&>div>div]:bg-primary-950 [&>div>div]:border-primary-800">{countdownBoxes}</div>}
              {showProgress && <Progress c={c} locale={data.locale} big />}
              {quickAmounts.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gray-500">Hızlı Tutar Seçin</div>
                  {quickChips(false)}
                </div>
              )}
              <Link href={`/kampanyalar/${c.slug}`} className="w-full rounded-xl bg-accent-500 py-4 text-center font-extrabold text-white shadow-md transition hover:bg-accent-600">
                {ctaLabel}
              </Link>
              {showDetails && (
                <Link href={`/kampanyalar/${c.slug}`} className="text-center text-sm font-bold text-primary-700 hover:underline">
                  {t('campaign.details')} →
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  const light = tpl !== 'sade'
  const shell = tpl === 'sade'
    ? 'bg-white'
    : tpl === 'kategori' ? 'bg-gradient-to-r from-accent-600 to-primary-700' : 'bg-primary-900'
  return (
    <section className={`${tpl === 'sade' ? 'py-16' : ''}`}>
      <div className={tpl === 'sade' ? container : ''}>
        <div className={`relative grid overflow-hidden md:grid-cols-2 ${shell} ${tpl === 'sade' ? 'rounded-3xl border border-gray-200 shadow-sm' : ''}`}>
          <div className={`relative min-h-[300px] overflow-hidden md:min-h-[460px] ${imgRight ? 'md:order-2' : ''}`}>
            {renderMedia()}
            {light && <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent md:bg-gradient-to-l md:from-black/20" />}
          </div>
          <div className={`flex flex-col justify-center gap-5 p-8 md:p-12 lg:p-16 ${imgRight ? 'md:order-1' : ''} ${light ? 'text-white' : ''}`}>
            {urgentPill(light)}
            <h2 className={`font-heading text-3xl font-bold leading-tight md:text-[40px] ${light ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
            {summary && <p className={`line-clamp-4 text-lg leading-relaxed ${light ? 'text-white/80' : 'text-gray-600'}`}>{summary}</p>}
            {countdownBoxes}
            {showProgress && <div className="max-w-md"><Progress c={c} locale={data.locale} light={light} big /></div>}
            {quickChips(light)}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href={`/kampanyalar/${c.slug}`} className={`rounded-[10px] px-8 py-4 font-extrabold shadow-lg transition hover:-translate-y-0.5 ${light ? 'bg-white text-primary-800 hover:bg-gray-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                {ctaLabel}
              </Link>
              {showDetails && (
                <Link href={`/kampanyalar/${c.slug}`} className={`rounded-[10px] border-[1.5px] px-8 py-4 font-semibold ${light ? 'border-white/40 text-white hover:border-white' : 'border-gray-200 text-gray-700 hover:border-primary-600'}`}>
                  {t('campaign.details')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

interface StepItem { icon?: string; badge?: string; title?: string; text?: string; url?: string; link_label?: string }

function StepWrap({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>
  if (href.startsWith('/')) return <Link href={href} className={className}>{children}</Link>
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer">{children}</a>
}

export function Steps({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const tpl = tplOf(data)
  const look = o.look || 'grid'
  const custom = Array.isArray(o.items) ? (o.items as StepItem[]).filter((i) => i.title) : []
  const steps: StepItem[] = custom.length ? custom : ([1, 2, 3, 4] as const).map((n) => ({
    title: t(`home.steps.s${n}` as 'home.steps.s1'), text: t(`home.steps.s${n}Text` as 'home.steps.s1Text'),
  }))
  const icons = ['search', 'coins', 'shield', 'receipt', 'heart', 'check']
  const gridCols = steps.length === 1
    ? 'max-w-md mx-auto grid-cols-1'
    : steps.length === 2
      ? 'sm:grid-cols-2 lg:grid-cols-2 max-w-3xl mx-auto'
      : steps.length === 4
        ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-2 lg:grid-cols-3'

  const cta = o.button_label && o.button_url && (
    <div className={look === 'split' ? 'mt-6' : 'mt-10 text-center'}>
      <StepWrap
        href={o.button_url}
        className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
      >
        {o.button_label} <span aria-hidden="true">→</span>
      </StepWrap>
    </div>
  )

  return (
    <section className={tpl === 'klasik' ? 'bg-primary-50/60' : ''}>
      <div className={`${container} py-[72px]`}>
        {look === 'split' ? (
          <div className="grid items-start gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              {(o.kicker || t('home.steps.kicker')) && (
                <div className="mb-2 text-[13px] font-bold uppercase tracking-[2px] text-primary-600">{o.kicker || t('home.steps.kicker')}</div>
              )}
              <h2 className="font-heading text-3xl font-bold leading-tight text-gray-900 md:text-[36px]">{o.title || t('home.steps.title')}</h2>
              {o.text && <p className="mt-3 text-base leading-relaxed text-gray-600">{o.text}</p>}
              {o.image_url && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200/80 shadow-sm">
                  <img src={o.image_url} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
                </div>
              )}
              {cta}
            </div>
            <ol className="space-y-4 lg:col-span-7">
              {steps.map((s, i) => (
                <li key={i}>
                  <StepWrap href={s.url} className={`flex items-start gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 text-gray-900 shadow-sm ${s.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary-600 font-heading text-base font-bold text-white">
                      {s.icon || i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {s.badge && <span className="mb-1 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{s.badge}</span>}
                      <div className="font-heading text-lg font-bold text-gray-900">{s.title}</div>
                      {s.text && <p className="mt-1 text-sm leading-relaxed text-gray-600">{s.text}</p>}
                      {s.url && s.link_label && <span className="mt-2 inline-block text-xs font-bold text-primary-700">{s.link_label} →</span>}
                    </div>
                  </StepWrap>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            <SectionHead tpl={tpl === 'klasik' ? 'kategori' : tpl} kicker={o.kicker || t('home.steps.kicker')} title={o.title || t('home.steps.title')} text={o.text} />
            {look === 'vertical' ? (
              <ol className="mx-auto max-w-2xl space-y-4">
                {steps.map((s, i) => (
                  <li key={i}>
                    <StepWrap href={s.url} className={`flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm ${s.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-600 font-heading text-sm font-bold text-white">
                        {s.icon || i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        {s.badge && <span className="mb-1 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{s.badge}</span>}
                        <div className="font-heading text-lg font-bold text-gray-900">{s.title}</div>
                        {s.text && <p className="mt-1 text-sm text-gray-600">{s.text}</p>}
                        {s.url && s.link_label && <span className="mt-2 inline-block text-xs font-bold text-primary-700">{s.link_label} →</span>}
                      </div>
                    </StepWrap>
                  </li>
                ))}
              </ol>
            ) : look === 'channels' ? (
              <div className={`grid gap-6 ${gridCols}`}>
                {steps.map((s, i) => (
                  <StepWrap key={i} href={s.url} className={`flex flex-col rounded-2xl border border-gray-200/80 bg-white p-6 text-gray-900 shadow-sm ${s.url ? 'transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md' : ''}`}>
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-2xl text-primary-700">
                        {s.icon || <Icon name={icons[i % icons.length]} className="h-6 w-6" />}
                      </span>
                      {s.badge && <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-[11px] font-bold text-primary-800">{s.badge}</span>}
                    </div>
                    <h3 className="font-heading text-lg font-bold text-gray-900">{s.title}</h3>
                    {s.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{s.text}</p>}
                    {s.url && (
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary-700">
                        {s.link_label || 'Bağış yap'} →
                      </span>
                    )}
                  </StepWrap>
                ))}
              </div>
            ) : look === 'compact_bar' ? (
              <ol className={`grid divide-y divide-gray-200/80 rounded-2xl border border-gray-200/80 bg-white shadow-sm sm:divide-x sm:divide-y-0 ${gridCols}`}>
                {steps.map((s, i) => (
                  <li key={i}>
                    <StepWrap href={s.url} className={`flex items-center gap-3.5 p-5 ${s.url ? 'hover:bg-primary-50/40 transition-colors' : ''}`}>
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary-600 font-heading text-sm font-bold text-white">
                        {s.icon || i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-heading text-sm font-bold text-gray-900">{s.title}</div>
                        {s.text && <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{s.text}</p>}
                      </div>
                    </StepWrap>
                  </li>
                ))}
              </ol>
            ) : look === 'dark_cards' ? (
              <ol className={`grid gap-6 ${gridCols}`}>
                {steps.map((s, i) => (
                  <li key={i}>
                    <StepWrap href={s.url} className={`flex h-full flex-col rounded-2xl bg-gray-900 p-6 text-white shadow-lg ring-1 ring-white/10 ${s.url ? 'transition hover:-translate-y-0.5' : ''}`}>
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 font-heading text-base font-bold text-primary-300 ring-1 ring-white/10">
                          {s.icon || String(i + 1).padStart(2, '0')}
                        </span>
                        {s.badge && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent-300">{s.badge}</span>}
                      </div>
                      <div className="font-heading text-lg font-bold">{s.title}</div>
                      {s.text && <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-300">{s.text}</p>}
                      {s.url && s.link_label && <span className="mt-4 inline-block text-xs font-bold text-primary-300">{s.link_label} →</span>}
                    </StepWrap>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className={`relative grid gap-8 ${gridCols}`}>
                {look !== 'cards' && steps.length >= 2 && steps.length <= 4 && (
                  <span className="absolute inset-x-[12%] top-8 hidden h-[2px] bg-[repeating-linear-gradient(90deg,var(--color-primary-300)_0_8px,transparent_8px_16px)] lg:block" aria-hidden />
                )}
                {steps.map((s, i) => (
                  <li key={i} className={`relative text-center ${look === 'cards' ? 'rounded-2xl border bg-white p-6 shadow-sm' : ''}`}>
                    <StepWrap href={s.url} className="block">
                      <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl text-primary-600 shadow-lg ring-1 ring-primary-100">
                        {s.icon || <Icon name={icons[i % icons.length]} className="h-7 w-7" />}
                        <span className="absolute -end-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-xs font-extrabold text-white">{i + 1}</span>
                      </div>
                      {s.badge && <span className="mb-1.5 inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-bold text-primary-700">{s.badge}</span>}
                      <div className="mb-2 font-heading text-lg font-bold text-gray-900">{s.title}</div>
                      {s.text && <p className="mx-auto max-w-[260px] text-sm leading-relaxed text-gray-500">{s.text}</p>}
                      {s.url && s.link_label && <span className="mt-3 inline-block text-xs font-bold text-primary-700">{s.link_label} →</span>}
                    </StepWrap>
                  </li>
                ))}
              </ol>
            )}
            {cta}
          </>
        )}
      </div>
    </section>
  )
}

const ZAKAT_ASSET_CLASSES: Record<string, Array<{ icon: string; title: string; desc: string }>> = {
  tr: [
    { icon: '💵', title: 'Nakit & Banka', desc: 'Vadesiz ve vadeli hesap bakiyeleri' },
    { icon: '🪙', title: 'Altın & Gümüş', desc: '85 gr altın / 595 gr gümüş nisabı' },
    { icon: '📈', title: 'Döviz & Yatırım', desc: 'Döviz, hisse ve fon birikimleri' },
    { icon: '📦', title: 'Ticari Mallar', desc: 'Satışa hazır stok ve emtia değeri' },
  ],
  en: [
    { icon: '💵', title: 'Cash & Bank', desc: 'Checking and savings balances' },
    { icon: '🪙', title: 'Gold & Silver', desc: '85g gold / 595g silver nisab threshold' },
    { icon: '📈', title: 'FX & Investments', desc: 'Foreign currency, stocks and funds' },
    { icon: '📦', title: 'Trade Inventory', desc: 'Merchandise held for sale' },
  ],
  ar: [
    { icon: '💵', title: 'النقد والبنوك', desc: 'الأرصدة النقدية والحسابات البنكية' },
    { icon: '🪙', title: 'الذهب والفضة', desc: 'نصاب 85 جم ذهب أو 595 جم فضة' },
    { icon: '📈', title: 'العملات والاستثمار', desc: 'العملات الأجنبية والأسهم والصناديق' },
    { icon: '📦', title: 'عروض التجارة', desc: 'قيمة البضائع المعدة للبيع' },
  ],
}

export function ZakatBand({ t, o = {}, tpl = 'klasik', locale = 'tr' }: { t: T; o?: Overrides; tpl?: Tpl; locale?: string }) {
  const look = o.look || 'band'
  const kicker = o.kicker
  const title = o.title || t('home.zakat.title')
  const text = o.text || t('home.zakat.text')
  const nisabNote = o.nisab_note
  const btnLabel = o.button_label || t('home.zakat.cta')
  const btnUrl = o.button_url || '/zekat-hesapla'
  const btn2Label = o.button2_label
  const btn2Url = o.button2_url || '/bagis?kategori=zekat'
  const imageUrl = o.image_url
  const presets =
    typeof o.quick_amounts === 'string' && o.quick_amounts.trim()
      ? o.quick_amounts
          .split(',')
          .map((s: string) => Number(s.trim()))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : undefined

  const py = tpl === 'sade' ? 'py-10' : 'py-14'

  const renderActions = (dark: boolean) => (
    <div className="relative flex flex-wrap items-center gap-3">
      <Link
        href={btnUrl}
        className={`whitespace-nowrap rounded-[10px] px-7 py-3.5 text-sm font-extrabold shadow-lg transition hover:-translate-y-0.5 ${
          dark
            ? 'bg-white text-primary-900 hover:bg-accent-50'
            : 'bg-primary-600 text-white shadow-primary-600/20 hover:bg-primary-700'
        }`}
      >
        {btnLabel}
      </Link>
      {btn2Label && (
        <Link
          href={btn2Url}
          className={`whitespace-nowrap rounded-[10px] px-6 py-3.5 text-sm font-extrabold transition ${
            dark
              ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
              : 'border border-primary-200 bg-white text-primary-800 hover:bg-primary-50'
          }`}
        >
          {btn2Label}
        </Link>
      )}
    </div>
  )

  if (look === 'strip') {
    return (
      <section className="py-6">
        <div className={container}>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50 via-white to-accent-50 px-6 py-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary-600 text-white">
                <Icon name="moon" className="h-5 w-5" />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-heading text-base font-bold text-gray-900 sm:text-lg">{title}</span>
                {nisabNote && (
                  <span className="rounded-full bg-primary-100 px-3 py-0.5 text-xs font-bold text-primary-800">{nisabNote}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href={btnUrl}
                className="rounded-lg bg-primary-600 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-primary-700 sm:text-sm"
              >
                {btnLabel}
              </Link>
              {btn2Label && (
                <Link
                  href={btn2Url}
                  className="rounded-lg border border-primary-200 bg-white px-4 py-2.5 text-xs font-extrabold text-primary-800 transition hover:bg-primary-50 sm:text-sm"
                >
                  {btn2Label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'calculator') {
    return (
      <section className={py}>
        <div className={container}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 p-7 text-white shadow-xl md:p-12">
            <Icon name="moon" className="pointer-events-none absolute -end-8 -top-12 h-64 w-64 text-white/5" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                {kicker && (
                  <span className="mb-3 inline-block rounded-full bg-white/10 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-300">
                    {kicker}
                  </span>
                )}
                <h3 className="mb-3 font-heading text-2xl font-bold text-white md:text-3xl">{title}</h3>
                <p className="max-w-xl text-white/80">{text}</p>
                {nisabNote && (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-accent-200">
                    <Icon name="moon" className="h-4 w-4 text-accent-300" />
                    {nisabNote}
                  </p>
                )}
                <div className="mt-6">{renderActions(true)}</div>
              </div>
              <ZakatMiniCalc locale={locale} donateUrl={btn2Url} calcUrl={btnUrl} presets={presets} />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'nisab_cards') {
    const cards = ZAKAT_ASSET_CLASSES[locale] || ZAKAT_ASSET_CLASSES.tr
    return (
      <section className={py}>
        <div className={container}>
          <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-lg md:p-11">
            <div className="flex flex-wrap items-end justify-between gap-6 border-b border-gray-100 pb-7">
              <div className="max-w-2xl">
                {kicker && (
                  <span className="mb-2 inline-block rounded-full bg-primary-50 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-primary-700">
                    {kicker}
                  </span>
                )}
                <h3 className="mb-2 font-heading text-2xl font-bold text-gray-900 md:text-[30px]">{title}</h3>
                <p className="text-gray-600">{text}</p>
                {nisabNote && (
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-50 px-3 py-1 text-xs font-bold text-accent-800">
                    {nisabNote}
                  </span>
                )}
              </div>
              {renderActions(false)}
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((item: { icon: string; title: string; desc: string }, idx: number) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5 transition hover:border-primary-200 hover:bg-primary-50/40"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-[11px] font-extrabold text-primary-800">
                      %2,5
                    </span>
                  </div>
                  <h4 className="font-heading text-base font-bold text-gray-900">{item.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'photo') {
    return (
      <section className={py}>
        <div className={container}>
          <div className="relative overflow-hidden rounded-3xl bg-primary-950 p-8 text-white shadow-xl md:p-14">
            {imageUrl && (
              <img
                src={imageUrl}
                alt={title}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-gray-950/90 via-gray-950/75 to-gray-950/45" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-2xl">
                {kicker && (
                  <span className="mb-3 inline-block rounded-full bg-white/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-300 backdrop-blur-sm">
                    {kicker}
                  </span>
                )}
                <h3 className="mb-2.5 font-heading text-2xl font-bold text-white md:text-3xl">{title}</h3>
                <p className="text-white/85">{text}</p>
                {nisabNote && <p className="mt-3 text-xs font-bold text-accent-300">{nisabNote}</p>}
              </div>
              {renderActions(true)}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'glass') {
    return (
      <section className={py}>
        <div className={container}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-950 via-primary-900 to-accent-900 p-6 md:p-10">
            <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-accent-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-primary-400/20 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-md md:p-10">
              <div className="max-w-2xl">
                {kicker && (
                  <span className="mb-2.5 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-200">
                    {kicker}
                  </span>
                )}
                <h3 className="mb-2 font-heading text-2xl font-bold text-white md:text-[28px]">{title}</h3>
                <p className="text-white/85">{text}</p>
                {nisabNote && <p className="mt-3 text-xs font-semibold text-accent-200">{nisabNote}</p>}
              </div>
              {renderActions(true)}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'split') {
    return (
      <section className={py}>
        <div className={container}>
          <div className="grid overflow-hidden rounded-3xl bg-primary-900 text-white shadow-xl ring-1 ring-primary-800 md:grid-cols-2">
            <div className="relative flex flex-col justify-center p-8 md:p-12">
              <Icon name="moon" className="pointer-events-none absolute -end-8 -top-8 h-44 w-44 text-white/5" />
              {kicker && (
                <span className="mb-3 inline-block w-fit rounded-full bg-white/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-300">
                  {kicker}
                </span>
              )}
              <h3 className="mb-3 font-heading text-2xl font-bold text-white md:text-3xl">{title}</h3>
              <p className="mb-5 text-white/80">{text}</p>
              {nisabNote && (
                <p className="mb-6 text-xs font-bold text-accent-200">{nisabNote}</p>
              )}
              {renderActions(true)}
            </div>
            <div className="relative min-h-[240px] bg-primary-950/60">
              {imageUrl ? (
                <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-accent-300">
                    <Icon name="moon" className="h-8 w-8" />
                  </div>
                  <div className="font-heading text-4xl font-extrabold text-white">%2,5</div>
                  <p className="mt-2 max-w-xs text-sm text-white/75">
                    {nisabNote || (locale === 'en' ? '1/40 of annual zakatable wealth' : locale === 'ar' ? 'ربع العشر من المال البالغ للنصاب' : 'Nisap miktarına ulaşan varlıkların 40’ta 1’i')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  const shell =
    look === 'card'
      ? 'bg-white border border-gray-200 shadow-lg'
      : 'bg-gradient-to-r from-primary-50 via-white to-accent-50 ring-1 ring-primary-100'
  return (
    <section className={py}>
      <div className={container}>
        <div className={`relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-3xl p-8 md:p-12 ${shell}`}>
          <Icon name="moon" className="pointer-events-none absolute -end-6 -top-10 h-48 w-48 text-primary-100" />
          <div className="relative flex max-w-2xl items-start gap-5">
            <div className="hidden h-14 w-14 flex-none items-center justify-center rounded-2xl bg-primary-600 text-white sm:flex">
              <Icon name="moon" className="h-7 w-7" />
            </div>
            <div>
              {kicker && (
                <span className="mb-1.5 inline-block text-xs font-extrabold uppercase tracking-wider text-primary-700">
                  {kicker}
                </span>
              )}
              <h3 className="mb-2 font-heading text-2xl font-bold text-gray-900 md:text-[28px]">{title}</h3>
              <p className="text-gray-600">{text}</p>
              {nisabNote && <p className="mt-2 text-xs font-bold text-primary-700">{nisabNote}</p>}
            </div>
          </div>
          {renderActions(false)}
        </div>
      </div>
    </section>
  )
}

export function CtaBand({ data, o = {} }: { data: HomeData; o?: Overrides }) {
  const t = translator(data.locale)
  const tpl = tplOf(data)
  const look = o.look || 'brand'
  const siteCta = data.site.cta_band || {}
  const band = {
    kicker: o.kicker,
    title: o.title || siteCta.title || t('home.cta.title'),
    text: o.text || siteCta.text || t('home.cta.text'),
    button_label: o.button_label || siteCta.button_label || t('nav.donate'),
    button_url: o.button_url || siteCta.button_url || '/kampanyalar',
    button2_label: o.button2_label,
    button2_url: o.button2_url || '/iletisim',
    trust_note: o.trust_note,
  }
  const image = o.image_url || data.site.hero.image_url
  const amounts =
    typeof o.quick_amounts === 'string' && o.quick_amounts.trim()
      ? o.quick_amounts
          .split(',')
          .map((s: string) => Number(s.trim()))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : [250, 500, 1000]

  const py = tpl === 'kategori' ? '' : look === 'strip' ? 'py-6' : 'py-14'
  const wrap = tpl === 'kategori' ? '' : container

  const renderActions = (isLight: boolean, centered = false) => (
    <div className={`flex flex-col gap-2.5 ${centered ? 'items-center' : 'items-start md:items-end'}`}>
      <div className={`flex flex-wrap items-center gap-3 ${centered ? 'justify-center' : ''}`}>
        {band.button_label && (
          <Link
            href={band.button_url}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] px-8 py-4 text-base font-extrabold shadow-xl transition hover:-translate-y-0.5 ${
              isLight ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-white text-primary-800 hover:bg-accent-50'
            }`}
          >
            <Icon name="heart" className={`h-5 w-5 ${isLight ? 'text-white' : 'text-accent-500'}`} />
            {band.button_label}
          </Link>
        )}
        {band.button2_label && (
          <Link
            href={band.button2_url}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] px-6 py-4 text-sm font-extrabold transition ${
              isLight
                ? 'border border-primary-200 bg-white text-primary-800 hover:bg-primary-50'
                : 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {band.button2_label}
          </Link>
        )}
      </div>
      {band.trust_note && (
        <p className={`text-xs font-semibold ${isLight ? 'text-gray-500' : 'text-white/75'}`}>{band.trust_note}</p>
      )}
    </div>
  )

  if (look === 'strip') {
    return (
      <section className={py}>
        <div className={wrap}>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200 bg-primary-50/70 px-6 py-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {band.kicker && (
                <span className="rounded-full bg-primary-600 px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
                  {band.kicker}
                </span>
              )}
              <span className="font-heading text-lg font-bold text-gray-900">{band.title}</span>
              {band.trust_note && <span className="text-xs font-medium text-gray-600">· {band.trust_note}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {band.button_label && (
                <Link href={band.button_url} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-primary-700">
                  {band.button_label}
                </Link>
              )}
              {band.button2_label && (
                <Link href={band.button2_url} className="rounded-lg border border-primary-200 bg-white px-4 py-2.5 text-sm font-bold text-primary-800 transition hover:bg-primary-50">
                  {band.button2_label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'split') {
    return (
      <section className={py}>
        <div className={wrap}>
          <div className={`grid overflow-hidden bg-primary-900 text-white shadow-xl md:grid-cols-2 ${tpl === 'kategori' ? '' : 'rounded-3xl'}`}>
            <div className="flex flex-col justify-center p-8 md:p-12">
              {band.kicker && (
                <span className="mb-3 inline-block w-fit rounded-full bg-white/15 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-300">
                  {band.kicker}
                </span>
              )}
              <h3 className="mb-3 font-heading text-3xl font-bold leading-tight text-white md:text-[38px]">{band.title}</h3>
              {band.text && <p className="mb-6 max-w-xl text-base leading-relaxed text-white/80">{band.text}</p>}
              <div className="flex flex-wrap items-center gap-3">
                {band.button_label && (
                  <Link href={band.button_url} className="inline-flex items-center gap-2 rounded-[10px] bg-white px-7 py-3.5 text-sm font-extrabold text-primary-900 shadow-lg transition hover:bg-accent-50">
                    <Icon name="heart" className="h-4 w-4 text-accent-500" />
                    {band.button_label}
                  </Link>
                )}
                {band.button2_label && (
                  <Link href={band.button2_url} className="inline-flex items-center gap-2 rounded-[10px] border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-white/20">
                    {band.button2_label}
                  </Link>
                )}
              </div>
              {band.trust_note && <p className="mt-4 text-xs font-semibold text-white/75">{band.trust_note}</p>}
            </div>
            <div className="relative min-h-[260px] bg-primary-950">
              {image && <img src={image} alt={band.title} className="h-full w-full object-cover" loading="lazy" />}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'glass') {
    return (
      <section className={py}>
        <div className={wrap}>
          <div className={`relative overflow-hidden bg-primary-950 p-6 md:p-12 ${tpl === 'kategori' ? '' : 'rounded-3xl'}`}>
            {image && <img src={image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" loading="lazy" />}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-950/85 via-primary-900/70 to-accent-900/60" />
            <div className="relative grid items-center gap-8 rounded-2xl border border-white/20 bg-white/10 p-7 text-white backdrop-blur-md md:grid-cols-[1fr_auto] md:p-10">
              <div>
                {band.kicker && (
                  <span className="mb-2.5 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-200">
                    {band.kicker}
                  </span>
                )}
                <h3 className="mb-2.5 font-heading text-3xl font-bold leading-tight text-white md:text-[38px]">{band.title}</h3>
                {band.text && <p className="max-w-xl text-base leading-relaxed text-white/85">{band.text}</p>}
              </div>
              {renderActions(false)}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'centered') {
    return (
      <section className={py}>
        <div className={wrap}>
          <div className={`relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-accent-700 px-8 py-14 text-center text-white shadow-xl md:px-14 md:py-18 ${tpl === 'kategori' ? '' : 'rounded-3xl'}`}>
            {image && <img src={image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity" loading="lazy" />}
            <div className="relative mx-auto max-w-2xl">
              {band.kicker && (
                <span className="mb-3 inline-block rounded-full bg-white/15 px-4 py-1 text-xs font-extrabold uppercase tracking-[2px] text-accent-200">
                  {band.kicker}
                </span>
              )}
              <h3 className="mb-3 font-heading text-3xl font-bold leading-tight text-white md:text-[42px]">{band.title}</h3>
              {band.text && <p className="mb-7 text-base leading-relaxed text-white/85 md:text-lg">{band.text}</p>}
              {renderActions(false, true)}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (look === 'quick_amounts') {
    const sep = band.button_url.includes('?') ? '&' : '?'
    return (
      <section className={py}>
        <div className={wrap}>
          <div className={`relative overflow-hidden bg-gradient-to-r from-primary-900 via-primary-800 to-primary-700 p-8 text-white shadow-xl md:p-12 ${tpl === 'kategori' ? '' : 'rounded-3xl'}`}>
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                {band.kicker && (
                  <span className="mb-2.5 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-300">
                    {band.kicker}
                  </span>
                )}
                <h3 className="mb-2.5 font-heading text-2xl font-bold text-white md:text-3xl">{band.title}</h3>
                {band.text && <p className="max-w-xl text-white/80">{band.text}</p>}
                {band.trust_note && <p className="mt-3 text-xs font-semibold text-accent-200">{band.trust_note}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {amounts.map((amt: number) => (
                  <Link
                    key={amt}
                    href={`${band.button_url}${sep}tutar=${amt}`}
                    className="rounded-xl border border-white/25 bg-white/10 px-5 py-3.5 font-heading text-base font-extrabold text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-primary-900"
                  >
                    {amt.toLocaleString('tr-TR')} ₺
                  </Link>
                ))}
                {band.button_label && (
                  <Link
                    href={band.button_url}
                    className="rounded-xl bg-accent-500 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg transition hover:bg-accent-600"
                  >
                    {band.button_label} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const isLight = look === 'soft' || look === 'bordered'
  const boxCls =
    look === 'dark'
      ? 'bg-gray-950 text-white'
      : look === 'soft'
        ? 'bg-primary-50 text-gray-900 ring-1 ring-primary-100'
        : look === 'bordered'
          ? 'bg-white text-gray-900 border-2 border-primary-600'
          : 'bg-primary-800 text-white'
  return (
    <section className={py}>
      <div className={wrap}>
        <div className={`relative overflow-hidden ${boxCls} ${tpl === 'kategori' ? '' : 'rounded-3xl'}`}>
          {!isLight && image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity" loading="lazy" />}
          {look === 'brand' && <div className="absolute inset-0 bg-gradient-to-r from-primary-900 via-primary-800/90 to-accent-600/70" />}
          {look === 'dark' && <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-900/90 to-primary-950/80" />}
          {!isLight && (
            <>
              <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full border-[40px] border-white/5" aria-hidden />
              <div className="pointer-events-none absolute -bottom-24 end-40 h-48 w-48 rounded-full border-[30px] border-white/5" aria-hidden />
            </>
          )}
          <div className={`relative grid items-center gap-8 px-8 py-14 md:grid-cols-[1fr_auto] md:px-14 md:py-16 ${tpl === 'kategori' ? 'mx-auto max-w-[1200px]' : ''}`}>
            <div>
              {band.kicker && (
                <span className={`mb-2.5 inline-block text-xs font-extrabold uppercase tracking-[2px] ${isLight ? 'text-primary-700' : 'text-accent-300'}`}>
                  {band.kicker}
                </span>
              )}
              <h3 className={`mb-3 font-heading text-3xl font-bold leading-tight md:text-[40px] ${isLight ? 'text-gray-900' : 'text-white'}`}>{band.title}</h3>
              {band.text && <p className={`max-w-xl text-base leading-relaxed md:text-lg ${isLight ? 'text-gray-600' : 'text-white/80'}`}>{band.text}</p>}
            </div>
            {renderActions(isLight)}
          </div>
        </div>
      </div>
    </section>
  )
}

export function News({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  if (!data.news.length) return null
  const tpl = tplOf(data)
  const look = o.look || 'cards'
  const showDate = o.show_date !== false
  const showSummary = o.show_summary !== false
  const cols = Math.min(Math.max(Number(o.columns) || 3, 2), 4)
  const colCls = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
  const list = data.news.slice(0, Number(o.limit) || (look === 'magazine' ? 4 : 8))
  const hrefOf = (n: NewsPostDto) => (o.links === 'root' && n.slug ? `/${n.slug}` : `/haberler/${n.slug || n.id}`)
  const fmtDate = (n: NewsPostDto) => n.published_at ? new Date(n.published_at).toLocaleDateString(data.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const thumb = (n: NewsPostDto, cls = 'h-full w-full object-cover transition-transform duration-700 group-hover:scale-105') =>
    n.image_url
      ? <img src={n.image_url} alt={n.title} className={cls} loading="lazy" />
      : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-3xl text-primary-300" aria-hidden="true">🗞️</div>

  const card = (n: NewsPostDto) => (
    <Link key={n.id} href={hrefOf(n)} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[16/10] overflow-hidden bg-primary-50">
        {thumb(n)}
        {showDate && n.published_at && (
          <div className="absolute start-4 top-4 rounded-xl bg-white px-3 py-2 text-center shadow">
            <div className="font-heading text-xl font-bold leading-none text-primary-700">{new Date(n.published_at).toLocaleDateString(data.locale, { day: 'numeric' })}</div>
            <div className="mt-1 text-[11px] font-bold uppercase text-gray-500">{new Date(n.published_at).toLocaleDateString(data.locale, { month: 'short' })}</div>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 line-clamp-2 font-heading text-lg font-semibold leading-snug text-gray-900 group-hover:text-primary-700">{n.title}</div>
        {showSummary && n.summary && <p className="mb-4 line-clamp-2 text-sm text-gray-500">{n.summary}</p>}
        <span className="mt-auto text-sm font-bold text-primary-600">{t('home.news.readMore')} <span className="inline-block transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span></span>
      </div>
    </Link>
  )

  const overlayCard = (n: NewsPostDto) => (
    <Link key={n.id} href={hrefOf(n)} className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl bg-primary-950 p-6 text-white shadow-md">
      <div className="absolute inset-0">{thumb(n, 'h-full w-full object-cover transition-transform duration-700 group-hover:scale-105')}</div>
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent" />
      <div className="relative z-10">
        {showDate && n.published_at && <div className="mb-2 text-xs font-bold uppercase tracking-wider text-accent-300">{fmtDate(n)}</div>}
        <div className="line-clamp-2 font-heading text-xl font-bold leading-snug">{n.title}</div>
        {showSummary && n.summary && <p className="mt-2 line-clamp-2 text-xs text-white/80">{n.summary}</p>}
      </div>
    </Link>
  )

  const body = () => {
    if (look === 'magazine') {
      const [lead, ...rest] = list
      return (
        <div className="grid gap-6 lg:grid-cols-12">
          {lead && (
            <Link href={hrefOf(lead)} className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-xl lg:col-span-6">
              <div className="relative aspect-[16/10] overflow-hidden bg-primary-50">
                {thumb(lead)}
              </div>
              <div className="flex flex-1 flex-col p-6">
                {showDate && lead.published_at && <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary-600">{fmtDate(lead)}</div>}
                <h3 className="font-heading text-2xl font-bold leading-snug text-gray-900 group-hover:text-primary-700">{lead.title}</h3>
                {showSummary && lead.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600">{lead.summary}</p>}
                <span className="mt-auto pt-4 text-sm font-bold text-primary-600">{t('home.news.readMore')} →</span>
              </div>
            </Link>
          )}
          <div className="flex flex-col gap-4 lg:col-span-6">
            {rest.map((n) => (
              <Link key={n.id} href={hrefOf(n)} className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="h-24 w-28 flex-none overflow-hidden rounded-xl bg-primary-50 sm:w-32">
                  {thumb(n)}
                </div>
                <div className="min-w-0 flex-1">
                  {showDate && n.published_at && <div className="text-[11px] font-bold uppercase tracking-wider text-primary-600">{fmtDate(n)}</div>}
                  <div className="mt-0.5 line-clamp-2 font-heading text-base font-bold text-gray-900 group-hover:text-primary-700">{n.title}</div>
                  {showSummary && n.summary && <p className="mt-1 line-clamp-1 text-xs text-gray-500">{n.summary}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )
    }

    if (look === 'list') {
      return (
        <div className="mx-auto max-w-4xl space-y-4">
          {list.map((n) => (
            <Link key={n.id} href={hrefOf(n)} className="group flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center">
              <div className="aspect-[16/10] w-full flex-none overflow-hidden rounded-xl bg-primary-50 sm:w-56">
                {thumb(n)}
              </div>
              <div className="min-w-0 flex-1">
                {showDate && n.published_at && <div className="text-xs font-bold uppercase tracking-wider text-primary-600">{fmtDate(n)}</div>}
                <h3 className="mt-1 font-heading text-xl font-bold text-gray-900 group-hover:text-primary-700">{n.title}</h3>
                {showSummary && n.summary && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{n.summary}</p>}
                <span className="mt-3 inline-block text-sm font-bold text-primary-600">{t('home.news.readMore')} →</span>
              </div>
            </Link>
          ))}
        </div>
      )
    }

    if (look === 'compact') {
      return (
        <div className="divide-y rounded-2xl border border-gray-200 bg-white px-6 shadow-sm">
          {list.map((n) => (
            <Link key={n.id} href={hrefOf(n)} className="group grid grid-cols-1 gap-2 py-4 transition-colors hover:bg-gray-50/60 sm:grid-cols-[140px_1fr_auto] sm:items-center sm:gap-6">
              {showDate && <span className="text-xs font-bold uppercase tracking-wider text-primary-600">{fmtDate(n)}</span>}
              <div className="min-w-0">
                <div className="font-heading text-base font-bold text-gray-900 group-hover:text-primary-700">{n.title}</div>
                {showSummary && n.summary && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{n.summary}</p>}
              </div>
              <span className="hidden text-sm font-bold text-primary-600 sm:inline">→</span>
            </Link>
          ))}
        </div>
      )
    }

    if (look === 'overlay') {
      return o.layout === 'carousel'
        ? <Carousel label={o.title || t('home.news.title')} items="w-[80%] sm:w-[46%] lg:w-[24%]">{list.map(overlayCard)}</Carousel>
        : <div className={`grid gap-6 ${colCls}`}>{list.map(overlayCard)}</div>
    }

    return o.layout !== 'grid' && (o.layout === 'carousel' || list.length > 3)
      ? <Carousel label={o.title || t('home.news.title')} items="w-[85%] sm:w-[46%] lg:w-[23.5%]">{list.map(card)}</Carousel>
      : <div className={`grid gap-6 ${colCls}`}>{list.map(card)}</div>
  }

  return (
    <section id="haberler">
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} kicker={o.kicker || t('home.news.kicker')} title={o.title || t('home.news.title')} text={o.text} link={{ href: o.all_url || '/haberler', label: o.all_label || t('home.news.all') }} />
        {body()}
      </div>
    </section>
  )
}

export function GalleryStrip({ data, t, o = {}, editing }: { data: HomeData; t: T; o?: Overrides; editing?: boolean }) {
  const includeVideos = Boolean(o.include_videos)
  const albumFilter = typeof o.album === 'string' ? o.album.trim().toLocaleLowerCase(data.locale) : ''
  const items = (data.gallery || [])
    .filter((g) => (includeVideos || g.kind === 'photo') && (g.thumbnail_url || g.image_url) && (!albumFilter || (g.album || '').toLocaleLowerCase(data.locale) === albumFilter))
    .slice(0, Number(o.limit) || 10)
  const tpl = tplOf(data)
  const dark = tpl === 'klasik'

  if (!items.length) {
    if (!editing) return null
    return (
      <section className="py-[72px]">
        <div className={container}>
          <SectionHead tpl={tpl} kicker={o.kicker || t('home.gallery.kicker')} title={o.title || t('home.gallery.title')} text={o.text} />
          <div className={`mt-6 rounded-2xl border-2 border-dashed p-10 text-center text-sm ${dark ? 'border-white/20 text-white/70' : 'border-gray-300 text-gray-500'}`}>
            {albumFilter
              ? `"${o.album}" albümünde gösterilecek medya bulunamadı.`
              : 'Galeri şeridini doldurmak için Galeri bölümünden fotoğraf ekleyin.'}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden py-[72px]">
      <div className={container}>
        <SectionHead
          tpl={tpl}
          kicker={o.kicker || t('home.gallery.kicker')}
          title={o.title || t('home.gallery.title')}
          text={o.text}
          link={o.show_all_link !== false ? { href: o.all_url || '/galeri', label: o.all_label || t('home.gallery.all') } : undefined}
        />
      </div>
      <div className="mt-8">
        <GalleryStripClient
          items={items}
          look={String(o.look || 'marquee')}
          aspect={String(o.aspect || '4/3')}
          speed={String(o.speed || 'normal')}
          captionMode={String(o.caption_mode || 'hover')}
          showAlbum={Boolean(o.show_album)}
          clickAction={String(o.click_action || 'lightbox')}
          closeLabel={t('gallery.close')}
          dark={dark}
        />
      </div>
    </section>
  )
}

interface TestimonialItem { quote: string; name?: string | null; role?: string | null; image_url?: string; rating?: number; badge?: string; date?: string }

export function Testimonials({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const own = Array.isArray(o.items) ? (o.items as TestimonialItem[]).filter((i) => i.quote) : []
  const items: TestimonialItem[] = own.length ? own : (data.site.testimonials || [])
  if (!items.length) return null
  const tpl = tplOf(data)
  const look = o.look || 'carousel'
  const dark = tpl === 'klasik'

  const renderStars = (rating?: number, onDark = false) => {
    const r = Number(rating)
    if (!r || r < 1) return null
    const count = Math.min(Math.max(Math.round(r), 1), 5)
    return (
      <div className={`mb-3 flex items-center gap-0.5 text-sm ${onDark ? 'text-amber-300' : 'text-amber-400'}`} aria-label={`${count} / 5 yıldız`}>
        {'★'.repeat(count)}
        {count < 5 && <span className="opacity-30">{'★'.repeat(5 - count)}</span>}
      </div>
    )
  }

  const cardNode = (item: TestimonialItem, i: number, extraCls = '') => (
    <figure key={i} className={`flex h-full flex-col rounded-3xl p-7 sm:p-8 ${dark ? 'bg-white/5 ring-1 ring-white/10' : 'bg-white shadow-sm ring-1 ring-gray-100'} ${extraCls}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Icon name="quote" className={`h-8 w-8 ${dark ? 'text-accent-400' : 'text-primary-200'}`} />
        {item.badge && (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${dark ? 'bg-white/10 text-accent-300' : 'bg-primary-50 text-primary-700'}`}>
            {item.badge}
          </span>
        )}
      </div>
      {renderStars(item.rating, dark)}
      <blockquote className={`flex-1 font-heading text-lg leading-relaxed ${dark ? 'text-white/90' : 'text-gray-700'}`}>{item.quote}</blockquote>
      {(item.name || item.role || item.date) && (
        <figcaption className="mt-6 flex items-center gap-3">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name || ''} className="h-11 w-11 flex-none rounded-full object-cover object-top ring-2 ring-primary-100" loading="lazy" />
          ) : (
            <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-base font-bold ${dark ? 'bg-accent-500 text-white' : 'bg-primary-600 text-white'}`}>
              {(item.name || '♥').trim().charAt(0).toLocaleUpperCase(data.locale)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            {item.name && <span className={`block truncate font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{item.name}</span>}
            {(item.role || item.date) && (
              <span className={`block truncate text-sm ${dark ? 'text-white/60' : 'text-gray-500'}`}>
                {[item.role, item.date].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
        </figcaption>
      )}
    </figure>
  )

  return (
    <section className={dark ? 'bg-primary-950' : tpl === 'kategori' ? 'bg-primary-50' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} light={dark} kicker={o.kicker || t('home.testimonials.kicker')} title={o.title || t('home.testimonials.title')} text={o.text} />
        {o.summary_badge && (
          <div className="-mt-6 mb-8 text-center">
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold ${
              dark ? 'bg-white/10 text-amber-300 ring-1 ring-white/15' : 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
            }`}>
              <span className="text-amber-400">★★★★★</span> {o.summary_badge}
            </span>
          </div>
        )}
        {look === 'grid' ? (
          <div className="grid gap-6 md:grid-cols-3">{items.map((item, i) => cardNode(item, i))}</div>
        ) : look === 'featured_grid' ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                {cardNode(items[0], 0, 'border-2 border-primary-100')}
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
                {items.slice(1, 5).map((item, idx) => cardNode(item, idx + 1))}
              </div>
            </div>
            {items.length > 5 && (
              <div className="grid gap-6 md:grid-cols-3">{items.slice(5).map((item, idx) => cardNode(item, idx + 5))}</div>
            )}
          </div>
        ) : look === 'marquee' ? (
          <div className="overflow-hidden" dir="ltr">
            <div className="bmq items-stretch gap-6" style={{ ['--bmq' as string]: `${Math.max(items.length * 7, 25)}s` }}>
              {[...items, ...items].map((item, i) => (
                <div key={i} className="w-[320px] flex-none sm:w-[360px]">
                  {cardNode(item, i)}
                </div>
              ))}
            </div>
          </div>
        ) : look === 'masonry' ? (
          <div className="columns-1 gap-6 space-y-6 md:columns-2 lg:columns-3">
            {items.map((item, i) => <div key={i} className="break-inside-avoid">{cardNode(item, i)}</div>)}
          </div>
        ) : look === 'spotlight' ? (
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="rounded-3xl bg-primary-950 p-10 text-center text-white shadow-xl">
              <Icon name="quote" className="mx-auto mb-5 h-10 w-10 text-accent-400" />
              {items[0].rating && <div className="mb-3 flex justify-center">{renderStars(items[0].rating, true)}</div>}
              <blockquote className="font-heading text-xl leading-relaxed md:text-2xl">{items[0].quote}</blockquote>
              {items[0].name && <div className="mt-6 text-sm font-bold text-accent-300">{items[0].name}{items[0].role ? ` · ${items[0].role}` : ''}</div>}
            </div>
            {items.length > 1 && (
              <div className="grid gap-4 sm:grid-cols-2">{items.slice(1).map((item, idx) => cardNode(item, idx + 1))}</div>
            )}
          </div>
        ) : look === 'quote' ? (
          <div className="mx-auto max-w-4xl space-y-6">
            <figure className={`mx-auto max-w-3xl rounded-3xl p-10 text-center ${dark ? 'bg-white/5 ring-1 ring-white/10' : 'bg-white shadow-sm ring-1 ring-gray-100'}`}>
              <Icon name="quote" className={`mx-auto mb-4 h-12 w-12 ${dark ? 'text-accent-400' : 'text-primary-300'}`} />
              {items[0].rating && <div className="mb-3 flex justify-center">{renderStars(items[0].rating, dark)}</div>}
              <blockquote className={`font-heading text-2xl leading-relaxed ${dark ? 'text-white' : 'text-gray-800'}`}>{items[0].quote}</blockquote>
              {items[0].name && <figcaption className={`mt-6 font-bold ${dark ? 'text-accent-300' : 'text-primary-700'}`}>{items[0].name}{items[0].role ? ` · ${items[0].role}` : ''}</figcaption>}
            </figure>
            {items.length > 1 && (
              <div className="grid gap-4 sm:grid-cols-2">{items.slice(1).map((item, idx) => cardNode(item, idx + 1))}</div>
            )}
          </div>
        ) : (
          <Carousel label={o.title || t('home.testimonials.title')} items="w-[88%] sm:w-[48%] lg:w-[32%]" tone={dark ? 'dark' : 'light'} autoplay={o.autoplay !== false} dots arrowPos="sides">
            {items.map((item, i) => cardNode(item, i))}
          </Carousel>
        )}
      </div>
    </section>
  )
}

interface TrustItem { icon?: string; iconName?: string; badge?: string; title?: string; text?: string; url?: string; tel?: string; mail?: string }

export function Trust({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const { contact } = data.site
  const look = o.look || 'plain'
  const custom = Array.isArray(o.items) ? (o.items as TrustItem[]).filter((i) => i.title || i.text) : []

  const autoCards: TrustItem[] = o.show_contact !== false ? [
    ...(contact.address ? [{ iconName: 'pin', title: t('home.trust.address'), text: contact.address }] : []),
    ...(contact.phone || contact.email ? [{
      iconName: 'phone',
      title: t('home.trust.contact'),
      text: [contact.phone, contact.email].filter(Boolean).join(' · '),
      tel: contact.phone || undefined,
      mail: contact.email || undefined,
    }] : []),
    ...(!custom.length ? [{ iconName: 'shield', title: o.title || t('home.trust.secure'), text: o.text || t('home.trust.secureText') }] : []),
  ] : []

  const items: TrustItem[] = custom.length ? [...(o.show_contact === true ? autoCards : []), ...custom] : autoCards
  const isDark = look === 'dark_band'

  const colCls = items.length <= 1
    ? 'grid-cols-1 max-w-xl mx-auto'
    : items.length === 2
      ? 'md:grid-cols-2'
      : items.length === 4
        ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'md:grid-cols-3'

  const paymentSeals = (
    <div className={`mt-8 flex flex-wrap items-center justify-center gap-2.5 border-t pt-6 ${isDark ? 'border-white/10' : 'border-gray-200/80'}`}>
      {['🔒 256-Bit SSL', '🛡️ 3D Secure', '💳 VISA', '💳 Mastercard', '🇹🇷 TROY', '🧾 Resmi Makbuz'].map((seal) => (
        <span
          key={seal}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide ${
            isDark ? 'bg-white/10 text-white/90 ring-1 ring-white/15' : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200/80'
          }`}
        >
          {seal}
        </span>
      ))}
    </div>
  )

  const renderIcon = (item: TrustItem, compact = false) => (
    <div className={`flex flex-shrink-0 items-center justify-center rounded-xl ${compact ? 'h-10 w-10 text-lg' : 'h-12 w-12 text-xl'} ${
      isDark ? 'bg-white/10 text-accent-300 ring-1 ring-white/10' : 'bg-primary-50 text-primary-600'
    }`}>
      {item.icon || <Icon name={item.iconName || 'shield'} className={compact ? 'h-5 w-5' : 'h-6 w-6'} />}
    </div>
  )

  const renderBody = (item: TrustItem) => (
    <div className="min-w-0 flex-1">
      {item.badge && (
        <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          isDark ? 'bg-white/15 text-accent-300' : 'bg-primary-100 text-primary-800'
        }`}>
          {item.badge}
        </span>
      )}
      {item.title && <div className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.title}</div>}
      {(item.tel || item.mail) ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
          {item.tel && <a href={`tel:${item.tel.replace(/\s+/g, '')}`} className="hover:text-primary-700 hover:underline">{item.tel}</a>}
          {item.tel && item.mail && <span aria-hidden="true">·</span>}
          {item.mail && <a href={`mailto:${item.mail}`} className="hover:text-primary-700 hover:underline">{item.mail}</a>}
        </div>
      ) : item.text && (
        <div className={`mt-0.5 text-sm leading-relaxed ${isDark ? 'text-white/75' : 'text-gray-500'}`}>{item.text}</div>
      )}
    </div>
  )

  const cta = o.button_label && o.button_url && (
    <div className={look === 'split_guarantee' ? 'mt-6' : 'mt-8 text-center'}>
      <StepWrap
        href={o.button_url}
        className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
          isDark ? 'bg-white text-primary-950 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
      >
        {o.button_label} <span aria-hidden="true">→</span>
      </StepWrap>
    </div>
  )

  return (
    <section className={isDark ? 'bg-primary-950 text-white' : 'border-t border-black/5'}>
      <div className={`${container} py-12`}>
        {look === 'split_guarantee' ? (
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              {o.kicker && <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{o.kicker}</div>}
              <h2 className="font-heading text-2xl font-bold text-gray-900 md:text-3xl">{o.title || t('home.trust.secure')}</h2>
              <p className="mt-3 text-base leading-relaxed text-gray-600">{o.text || t('home.trust.secureText')}</p>
              {cta}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              {items.map((item, i) => (
                <StepWrap key={i} href={item.url} className={`flex items-start gap-3.5 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm ${item.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
                  {renderIcon(item, true)}
                  {renderBody(item)}
                </StepWrap>
              ))}
            </div>
          </div>
        ) : (
          <>
            {(o.kicker || (custom.length > 0 && (o.title || o.text))) && (
              <div className="mx-auto mb-8 max-w-2xl text-center">
                {o.kicker && <div className={`mb-1.5 text-xs font-bold tracking-[2px] ${isDark ? 'text-accent-300' : 'text-primary-600'}`}>{o.kicker}</div>}
                {o.title && <h2 className="font-heading text-2xl font-bold md:text-3xl">{o.title}</h2>}
                {o.text && <p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-white/75' : 'text-gray-600'}`}>{o.text}</p>}
              </div>
            )}
            <div className={
              look === 'strip'
                ? `grid divide-y divide-gray-200/80 rounded-2xl border border-gray-200/80 bg-white shadow-sm sm:divide-x sm:divide-y-0 ${colCls}`
                : `grid gap-6 ${colCls}`
            }>
              {items.map((item, i) => (
                <StepWrap
                  key={i}
                  href={item.url}
                  className={
                    look === 'cards' || look === 'seals'
                      ? `flex gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm ${item.url ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`
                      : look === 'strip'
                        ? `flex items-center gap-3.5 p-4 ${item.url ? 'hover:bg-primary-50/40 transition-colors' : ''}`
                        : `flex gap-4 rounded-2xl p-2 ${item.url ? 'hover:opacity-85 transition-opacity' : ''}`
                  }
                >
                  {renderIcon(item, look === 'strip')}
                  {renderBody(item)}
                </StepWrap>
              ))}
            </div>
            {cta}
          </>
        )}
        {(look === 'seals' || o.show_payment_badges) && paymentSeals}
      </div>
    </section>
  )
}

const SECTIONS: Record<string, (props: { data: HomeData; t: T }) => ReactNode> = {
  stats: Stats,
  categories: Categories,
  campaigns: Campaigns,
  featured: FeaturedCampaign,
  steps: Steps,
  zakat: ({ data, t }) => <ZakatBand t={t} tpl={tplOf(data)} />,
  cta: ({ data }) => <CtaBand data={data} />,
  news: News,
  gallery: GalleryStrip,
  testimonials: Testimonials,
  trust: Trust,
}

/** The organisation's chosen sections, in its chosen order. */
export function OrderedSections({ data }: { data: HomeData }) {
  const t = translator(data.locale)
  return (
    <>
      {data.site.sections.map((key) => {
        const Section = SECTIONS[key]
        return Section ? <Section key={key} data={data} t={t} /> : null
      })}
    </>
  )
}
