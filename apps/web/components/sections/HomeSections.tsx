import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Campaign } from '@e-infak/api-client'
import type { PublicGalleryItem, SiteData } from '../../lib/public-content'
import type { PublicMenu } from '../../lib/default-links'
import { translator } from '../../lib/i18n'
import { QuickDonationForm } from '../QuickDonationForm'
import { Carousel, CountUp } from '../site/Carousel'
import { Slider, type SlideView } from '../site/Slider'

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
  const align = variant === 'kategori' ? 'center' : 'left'
  const allLabel = t('home.campaigns.all').replace(' →', '').replace(' ←', '')
  const slides: SlideView[] = [{
    image_url: hero.image_url || undefined,
    badge: hero.badge || undefined,
    title: hero.title || site.name,
    text: hero.subtitle || undefined,
    button_label: hero.cta_label || t('nav.donate'),
    button_url: hero.cta_url || (variant === 'klasik' && o.show_form !== false ? '#hizli-bagis' : '/kampanyalar'),
    button2_label: allLabel,
    button2_url: '/kampanyalar',
    align,
    overlay: 35,
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

export function Hero({ data, variant, o = {} }: { data: HomeData; variant: Tpl | 'glass' | 'centered'; o?: Overrides }) {
  const t = translator(data.locale)
  const slides = heroSlides(data, (variant === 'glass' || variant === 'centered' ? 'klasik' : variant) as Tpl, o, t)
  const showForm = variant === 'klasik' && o.show_form !== false
  return (
    <>
      {variant === 'vuslat' && <Slider slides={slides} layout="card" nav="thumbs" effect="fade" interval={6} label={t('home.slider.label')} />}
      {variant === 'sade' && <Slider slides={slides} layout="split" interval={7} label={t('home.slider.label')} />}
      {variant === 'kategori' && <Slider slides={slides} effect="fade" height="lg" interval={6} label={t('home.slider.label')} />}
      {variant === 'klasik' && <Slider slides={slides} height="lg" interval={6} nav="tabs" label={t('home.slider.label')} />}
      {variant === 'glass' && <Slider slides={slides} layout="glass" height="lg" nav="numbers" effect="zoom" interval={6} label={t('home.slider.label')} />}
      {variant === 'centered' && <Slider slides={slides.map((s) => ({ ...s, align: 'center' }))} layout="overlay" height="screen" nav="dots" effect="fade" interval={6} label={t('home.slider.label')} />}
      {showForm && <QuickDonateBand data={data} o={o} />}
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

export function Categories({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  if (!data.categories.length) return null
  const tpl = tplOf(data)
  const look = o.look || 'grid'
  const slugById = new Map(data.campaigns.map((c) => [c.id, c.slug]))
  return (
    <section id="kategoriler" className={tpl === 'kategori' ? 'bg-gradient-to-b from-primary-50/70 to-transparent' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} kicker={o.kicker || t('home.categories.kicker')} title={o.title || t('home.categories.title')} text={t('home.categories.text')} />
        {look === 'pills' ? (
          <div className="flex flex-wrap justify-center gap-3">
            {data.categories.map((k) => {
              const slug = k.campaign_id ? slugById.get(k.campaign_id) : undefined
              return (
                <Link key={k.id || k.title} href={slug ? `/kampanyalar/${slug}` : '/kampanyalar'}
                  className="inline-flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-800 shadow-sm transition hover:border-primary-600 hover:bg-primary-50 hover:text-primary-800">
                  <span className="text-lg">{k.icon}</span>{k.title}
                </Link>
              )
            })}
          </div>
        ) : (
          <div className={`grid gap-4 sm:grid-cols-2 ${look === 'cards' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
            {data.categories.map((k) => {
              const slug = k.campaign_id ? slugById.get(k.campaign_id) : undefined
              return (
                <Link key={k.id || k.title} href={slug ? `/kampanyalar/${slug}` : '/kampanyalar'}
                  className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary-600 hover:shadow-xl">
                  <span className="absolute -end-8 -top-8 h-24 w-24 rounded-full bg-primary-50 transition-transform duration-500 group-hover:scale-[3]" aria-hidden />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-[28px] shadow-lg shadow-primary-600/20">{k.icon}</div>
                  <div className="relative mt-2 text-lg font-bold text-gray-900">{k.title}</div>
                  <div className="relative text-[13px] leading-relaxed text-gray-500">{k.description}</div>
                  <div className="relative mt-auto pt-2 text-[13px] font-bold text-primary-600">{t('campaign.donate')} <span className="inline-block transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span></div>
                </Link>
              )
            })}
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
  if (o.source === 'ending') list = all.filter((c) => c.end_date).sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)))
  if (o.source === 'category' && o.category) list = all.filter((c) => c.category?.toLocaleLowerCase('tr') === String(o.category).toLocaleLowerCase('tr'))
  if (o.source === 'selected' && Array.isArray(o.campaign_ids)) {
    const byId = new Map(all.map((c) => [c.id, c]))
    list = (o.campaign_ids as string[]).map((id) => byId.get(id)).filter(Boolean) as Campaign[]
  }
  return o.limit ? list.slice(0, Number(o.limit)) : list
}

export function CampaignCard({ c, t, locale, showProgress = true, wide = false }: { c: Campaign; t: T; locale: string; showProgress?: boolean; wide?: boolean }) {
  return (
    <div className={`group flex h-full overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${wide ? 'flex-col sm:flex-row' : 'flex-col'}`}>
      <Link href={`/kampanyalar/${c.slug}`} className={`relative block overflow-hidden bg-primary-50 ${wide ? 'h-[200px] sm:h-auto sm:w-72 sm:flex-none' : 'aspect-[16/10]'}`} tabIndex={-1} aria-hidden>
        {c.cover_image_url
          ? <img src={c.cover_image_url} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
          : <div className="flex h-full items-center justify-center text-primary-600/30"><Icon name="heart" className="h-12 w-12" /></div>}
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute start-3 top-3 flex flex-wrap gap-2">
          {c.is_featured && <span className="rounded-md bg-accent-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">{t('home.campaigns.urgent')}</span>}
          {c.category && <span className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-bold text-gray-800 backdrop-blur">{categoryLabel(c.category)}</span>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <Link href={`/kampanyalar/${c.slug}`} className="line-clamp-2 font-heading text-xl font-bold leading-snug text-gray-900 hover:text-primary-700">{c.title}</Link>
        <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-gray-500">{c.summary}</p>
        {showProgress && <Progress c={c} locale={locale} />}
        <div className="flex gap-2 pt-1">
          <Link href={`/kampanyalar/${c.slug}`}
            className="flex-1 rounded-lg bg-primary-600 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-primary-700">
            {t('campaign.donate')}
          </Link>
          <Link href={`/kampanyalar/${c.slug}`}
            className="rounded-lg border-[1.5px] border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-600 transition-colors hover:border-primary-600 hover:text-primary-600">
            {t('campaign.details')}
          </Link>
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
  const columns = Number(o.columns) || (tpl === 'sade' ? 2 : 3)
  const card = (c: Campaign) => <CampaignCard key={c.id} c={c} t={t} locale={data.locale} showProgress={showProgress} wide={layout === 'list'} />
  return (
    <section id="projeler" className={tpl === 'klasik' ? 'bg-stone-50' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} kicker={o.kicker || t('home.campaigns.kicker')} title={o.title || t('home.campaigns.title')}
          link={o.show_all_link !== false ? { href: '/kampanyalar', label: t('home.campaigns.all') } : undefined} />
        {list.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">{t('home.campaigns.empty')}</div>
        ) : layout === 'carousel' ? (
          <Carousel label={o.title || t('home.campaigns.title')}>{list.map(card)}</Carousel>
        ) : (
          <div className={layout === 'list' ? 'grid gap-5' : `grid gap-6 sm:grid-cols-2 ${GRID_COLS[columns] || 'lg:grid-cols-3'}`}>{list.map(card)}</div>
        )}
      </div>
    </section>
  )
}

/** One campaign in the spotlight: chosen, or the first featured / ending-soon one. */
export function FeaturedCampaign({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const tpl = tplOf(data)
  const c = (o.campaign_id && data.campaigns.find((x) => x.id === o.campaign_id))
    || data.campaigns.find((x) => x.is_featured && x.cover_image_url)
    || pickCampaigns(data.campaigns, { source: 'ending' })[0]
    || data.campaigns.find((x) => x.cover_image_url)
    || data.campaigns[0]
  if (!c) return null
  const light = tpl !== 'sade'
  const shell = tpl === 'sade'
    ? 'bg-white'
    : tpl === 'kategori' ? 'bg-gradient-to-r from-accent-600 to-primary-700' : 'bg-primary-900'
  return (
    <section className={`${tpl === 'sade' ? 'py-16' : ''}`}>
      <div className={tpl === 'sade' ? container : ''}>
        <div className={`relative grid overflow-hidden md:grid-cols-2 ${shell} ${tpl === 'sade' ? 'rounded-3xl border border-gray-200 shadow-sm' : ''}`}>
          <div className="relative min-h-[300px] md:min-h-[460px]">
            {c.cover_image_url
              ? <img src={c.cover_image_url} alt={c.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              : <div className="absolute inset-0 flex items-center justify-center bg-primary-100 text-primary-600/40"><Icon name="heart" className="h-20 w-20" /></div>}
            {light && <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent md:bg-gradient-to-l md:from-black/20" />}
          </div>
          <div className={`flex flex-col justify-center gap-5 p-8 md:p-12 lg:p-16 ${light ? 'text-white' : ''}`}>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold tracking-[2px] ${light ? 'bg-white/15 text-white' : 'bg-accent-50 text-accent-700'}`}>
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" /></span>
              {o.kicker || (c.is_featured ? t('home.featured.kicker') : (categoryLabel(c.category) || t('home.campaigns.kicker')).toLocaleUpperCase(data.locale))}
            </span>
            <h2 className={`font-heading text-3xl font-bold leading-tight md:text-[40px] ${light ? 'text-white' : 'text-gray-900'}`}>{c.title}</h2>
            {c.summary && <p className={`line-clamp-4 text-lg leading-relaxed ${light ? 'text-white/80' : 'text-gray-600'}`}>{c.summary}</p>}
            <div className="max-w-md"><Progress c={c} locale={data.locale} light={light} big /></div>
            {c.end_date && (
              <div className={`text-sm font-semibold ${light ? 'text-white/70' : 'text-gray-500'}`}>
                {t('home.featured.ends')}: {new Date(c.end_date).toLocaleDateString(data.locale, { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href={`/kampanyalar/${c.slug}`} className={`rounded-[10px] px-8 py-4 font-extrabold shadow-lg transition hover:-translate-y-0.5 ${light ? 'bg-white text-primary-800 hover:bg-gray-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                {o.button_label || t('campaign.donate')}
              </Link>
              <Link href={`/kampanyalar/${c.slug}`} className={`rounded-[10px] border-[1.5px] px-8 py-4 font-semibold ${light ? 'border-white/40 text-white hover:border-white' : 'border-gray-200 text-gray-700 hover:border-primary-600'}`}>
                {t('campaign.details')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Steps({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const tpl = tplOf(data)
  const look = o.look || 'grid'
  const custom = Array.isArray(o.items) ? (o.items as { title?: string; text?: string }[]).filter((i) => i.title) : []
  const steps = custom.length ? custom : ([1, 2, 3, 4] as const).map((n) => ({
    title: t(`home.steps.s${n}` as 'home.steps.s1'), text: t(`home.steps.s${n}Text` as 'home.steps.s1Text'),
  }))
  const icons = ['search', 'coins', 'shield', 'receipt', 'heart', 'check']
  return (
    <section className={tpl === 'kategori' ? 'bg-white' : tpl === 'klasik' ? 'bg-primary-50/60' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl === 'klasik' ? 'kategori' : tpl} kicker={o.kicker || t('home.steps.kicker')} title={o.title || t('home.steps.title')} />
        {look === 'vertical' ? (
          <ol className="mx-auto max-w-2xl space-y-4">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-600 font-heading text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <div className="font-heading text-lg font-bold text-gray-900">{s.title}</div>
                  {s.text && <p className="mt-1 text-sm text-gray-600">{s.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <ol className={`relative grid gap-8 sm:grid-cols-2 ${steps.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {look !== 'cards' && <span className="absolute inset-x-[12%] top-8 hidden h-[2px] bg-[repeating-linear-gradient(90deg,var(--color-primary-300)_0_8px,transparent_8px_16px)] lg:block" aria-hidden />}
            {steps.map((s, i) => (
              <li key={i} className={`relative text-center ${look === 'cards' ? 'rounded-2xl border bg-white p-6 shadow-sm' : ''}`}>
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-primary-600 shadow-lg ring-1 ring-primary-100">
                  <Icon name={icons[i % icons.length]} className="h-7 w-7" />
                  <span className="absolute -end-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-xs font-extrabold text-white">{i + 1}</span>
                </div>
                <div className="mb-2 font-heading text-lg font-bold text-gray-900">{s.title}</div>
                {s.text && <p className="mx-auto max-w-[260px] text-sm leading-relaxed text-gray-500">{s.text}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

export function ZakatBand({ t, o = {}, tpl = 'klasik' }: { t: T; o?: Overrides; tpl?: Tpl }) {
  return (
    <section className={tpl === 'sade' ? 'py-10' : 'py-14'}>
      <div className={container}>
        <div className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-3xl bg-gradient-to-r from-primary-50 via-white to-accent-50 p-8 ring-1 ring-primary-100 md:p-12">
          <Icon name="moon" className="pointer-events-none absolute -end-6 -top-10 h-48 w-48 text-primary-100" />
          <div className="relative flex max-w-2xl items-start gap-5">
            <div className="hidden h-14 w-14 flex-none items-center justify-center rounded-2xl bg-primary-600 text-white sm:flex"><Icon name="moon" className="h-7 w-7" /></div>
            <div>
              <h3 className="mb-2 font-heading text-2xl font-bold text-gray-900 md:text-[28px]">{o.title || t('home.zakat.title')}</h3>
              <p className="text-gray-600">{o.text || t('home.zakat.text')}</p>
            </div>
          </div>
          <Link href="/zekat-hesapla" className="relative whitespace-nowrap rounded-[10px] bg-primary-600 px-8 py-4 font-extrabold text-white shadow-lg shadow-primary-600/20 transition hover:-translate-y-0.5 hover:bg-primary-700">
            {o.button_label || t('home.zakat.cta')}
          </Link>
        </div>
      </div>
    </section>
  )
}

export function CtaBand({ data, o = {} }: { data: HomeData; o?: Overrides }) {
  const t = translator(data.locale)
  const tpl = tplOf(data)
  const own = o.title ? { title: o.title, text: o.text, button_label: o.button_label, button_url: o.button_url } : data.site.cta_band
  const band = own.title ? own : { title: t('home.cta.title'), text: t('home.cta.text'), button_label: t('nav.donate'), button_url: '/kampanyalar' }
  const image = data.site.hero.image_url
  return (
    <section className={tpl === 'kategori' ? '' : 'py-14'}>
      <div className={tpl === 'kategori' ? '' : container}>
        <div className={`relative overflow-hidden bg-primary-800 ${tpl === 'kategori' ? '' : 'rounded-3xl'}`}>
          {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity" loading="lazy" />}
          <div className="absolute inset-0 bg-gradient-to-r from-primary-900 via-primary-800/90 to-accent-600/70" />
          <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full border-[40px] border-white/5" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 end-40 h-48 w-48 rounded-full border-[30px] border-white/5" aria-hidden />
          <div className={`relative grid items-center gap-8 px-8 py-14 md:grid-cols-[1fr_auto] md:px-14 md:py-16 ${tpl === 'kategori' ? 'mx-auto max-w-[1200px]' : ''}`}>
            <div>
              <h3 className="mb-3 font-heading text-3xl font-bold leading-tight text-white md:text-[40px]">{band.title}</h3>
              {band.text && <p className="max-w-xl text-base leading-relaxed text-white/80 md:text-lg">{band.text}</p>}
            </div>
            {band.button_label && (
              <Link href={band.button_url || '/kampanyalar'} className="inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] bg-white px-9 py-4 text-base font-extrabold text-primary-800 shadow-xl transition hover:-translate-y-0.5 hover:bg-accent-50">
                <Icon name="heart" className="h-5 w-5 text-accent-500" />{band.button_label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export function News({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  if (!data.news.length) return null
  const tpl = tplOf(data)
  const list = data.news.slice(0, Number(o.limit) || 8)
  const card = (n: NewsPostDto) => (
    <Link key={n.id} href={o.links === 'root' && n.slug ? `/${n.slug}` : `/haberler/${n.slug || n.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[16/10] overflow-hidden bg-primary-50">
        {n.image_url && <img src={n.image_url} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />}
        {n.published_at && (
          <div className="absolute start-4 top-4 rounded-xl bg-white px-3 py-2 text-center shadow">
            <div className="font-heading text-xl font-bold leading-none text-primary-700">{new Date(n.published_at).toLocaleDateString(data.locale, { day: 'numeric' })}</div>
            <div className="mt-1 text-[11px] font-bold uppercase text-gray-500">{new Date(n.published_at).toLocaleDateString(data.locale, { month: 'short' })}</div>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 line-clamp-2 font-heading text-lg font-semibold leading-snug text-gray-900 group-hover:text-primary-700">{n.title}</div>
        {n.summary && <p className="mb-4 line-clamp-2 text-sm text-gray-500">{n.summary}</p>}
        <span className="mt-auto text-sm font-bold text-primary-600">{t('home.news.readMore')} <span className="inline-block transition-transform group-hover:translate-x-1 rtl:rotate-180">→</span></span>
      </div>
    </Link>
  )
  return (
    <section id="haberler" className={tpl === 'kategori' ? 'bg-stone-50' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} kicker={o.kicker || t('home.news.kicker')} title={o.title || t('home.news.title')} link={{ href: o.all_url || '/haberler', label: o.all_label || t('home.news.all') }} />
        {o.layout !== 'grid' && (o.layout === 'carousel' || list.length > 3)
          ? <Carousel label={o.title || t('home.news.title')} items="w-[85%] sm:w-[46%] lg:w-[23.5%]">{list.map(card)}</Carousel>
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{list.map(card)}</div>}
      </div>
    </section>
  )
}

export function GalleryStrip({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const photos = (data.gallery || []).filter((g) => g.kind === 'photo' && (g.thumbnail_url || g.image_url)).slice(0, Number(o.limit) || 10)
  if (photos.length < 3) return null
  const tpl = tplOf(data)
  const tile = (g: PublicGalleryItem, key: string) => (
    <Link key={key} href="/galeri" className="group relative block h-56 w-72 flex-none overflow-hidden rounded-2xl md:h-64 md:w-80">
      <img src={g.thumbnail_url || g.image_url || ''} alt={g.title || ''} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
      {g.title && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">{g.title}</span>
      )}
    </Link>
  )
  return (
    <section className="overflow-hidden py-[72px]">
      <div className={container}>
        <SectionHead tpl={tpl} kicker={o.kicker || t('home.gallery.kicker')} title={o.title || t('home.gallery.title')} link={{ href: '/galeri', label: t('home.gallery.all') }} />
      </div>
      <div className="overflow-x-auto [scrollbar-width:none] motion-safe:overflow-hidden [&::-webkit-scrollbar]:hidden">
        <div className="marquee-track flex w-max gap-4 px-6">
          {photos.map((g) => tile(g, g.id))}
          {photos.map((g) => <span key={`${g.id}-copy`} aria-hidden className="contents motion-reduce:hidden">{tile(g, `${g.id}-copy`)}</span>)}
        </div>
      </div>
    </section>
  )
}

export function Testimonials({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const own = Array.isArray(o.items) ? (o.items as NonNullable<SiteData['testimonials']>).filter((i) => i.quote) : []
  const items = own.length ? own : data.site.testimonials || []
  if (!items.length) return null
  const tpl = tplOf(data)
  const look = o.look || 'carousel'
  const dark = tpl === 'klasik'
  const cardNode = (item: NonNullable<SiteData['testimonials']>[number], i: number) => (
    <figure key={i} className={`flex h-full flex-col rounded-3xl p-8 ${dark ? 'bg-white/5 ring-1 ring-white/10' : 'bg-white shadow-sm ring-1 ring-gray-100'}`}>
      <Icon name="quote" className={`mb-5 h-10 w-10 ${dark ? 'text-accent-400' : 'text-primary-200'}`} />
      <blockquote className={`flex-1 font-heading text-lg leading-relaxed ${dark ? 'text-white/90' : 'text-gray-700'}`}>{item.quote}</blockquote>
      {(item.name || item.role) && (
        <figcaption className="mt-6 flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold ${dark ? 'bg-accent-500 text-white' : 'bg-primary-600 text-white'}`}>
            {(item.name || '♥').trim().charAt(0).toLocaleUpperCase(data.locale)}
          </span>
          <span>
            {item.name && <span className={`block font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{item.name}</span>}
            {item.role && <span className={`block text-sm ${dark ? 'text-white/60' : 'text-gray-500'}`}>{item.role}</span>}
          </span>
        </figcaption>
      )}
    </figure>
  )
  return (
    <section className={dark ? 'bg-primary-950' : tpl === 'kategori' ? 'bg-primary-50' : ''}>
      <div className={`${container} py-[72px]`}>
        <SectionHead tpl={tpl} light={dark} kicker={o.kicker || t('home.testimonials.kicker')} title={o.title || t('home.testimonials.title')} />
        {look === 'grid' ? (
          <div className="grid gap-6 md:grid-cols-3">{items.map(cardNode)}</div>
        ) : look === 'quote' ? (
          <figure className={`mx-auto max-w-3xl rounded-3xl p-10 text-center ${dark ? 'bg-white/5 ring-1 ring-white/10' : 'bg-white shadow-sm ring-1 ring-gray-100'}`}>
            <Icon name="quote" className={`mx-auto mb-4 h-12 w-12 ${dark ? 'text-accent-400' : 'text-primary-300'}`} />
            <blockquote className={`font-heading text-2xl leading-relaxed ${dark ? 'text-white' : 'text-gray-800'}`}>{items[0].quote}</blockquote>
            {items[0].name && <figcaption className={`mt-6 font-bold ${dark ? 'text-accent-300' : 'text-primary-700'}`}>{items[0].name}{items[0].role ? ` · ${items[0].role}` : ''}</figcaption>}
          </figure>
        ) : (
          <Carousel label={o.title || t('home.testimonials.title')} tone={dark ? 'dark' : 'light'} autoplay={o.autoplay !== false} dots arrowPos="sides">
            {items.map(cardNode)}
          </Carousel>
        )}
      </div>
    </section>
  )
}

export function Trust({ data, t, o = {} }: { data: HomeData; t: T; o?: Overrides }) {
  const { contact } = data.site
  const cards = [
    contact.address ? ['pin', t('home.trust.address'), contact.address] : null,
    contact.phone || contact.email ? ['phone', t('home.trust.contact'), [contact.phone, contact.email].filter(Boolean).join(' · ')] : null,
    ['shield', o.title || t('home.trust.secure'), o.text || t('home.trust.secureText')],
  ].filter(Boolean) as string[][]
  return (
    <section className="border-t border-black/5 bg-white">
      <div className={`${container} grid gap-6 py-12 md:grid-cols-3`}>
        {cards.map(([icon, title, text]) => (
          <div key={title} className="flex gap-4 rounded-2xl p-2">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Icon name={icon} /></div>
            <div>
              <div className="font-bold text-gray-900">{title}</div>
              <div className="text-sm leading-relaxed text-gray-500">{text}</div>
            </div>
          </div>
        ))}
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
