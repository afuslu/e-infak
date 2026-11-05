import Link from 'next/link'
import type { Campaign } from '@e-infak/api-client'
import type { SiteData } from '../../lib/public-content'
import { translator } from '../../lib/i18n'
import { QuickDonationForm } from '../QuickDonationForm'

export interface NewsPostDto { id: string; slug?: string | null; title: string; image_url?: string | null; published_at?: string | null; summary?: string | null }
export interface CategoryDto { id: string; title: string; description: string; icon: string; campaign_id?: string | null }

export interface HomeData {
  site: SiteData
  locale: string
  campaigns: Campaign[]
  news: NewsPostDto[]
  categories: CategoryDto[]
}

type T = ReturnType<typeof translator>
const CURRENCY: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }
const container = 'mx-auto max-w-[1200px] px-6'

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[13px] font-bold tracking-[2px] text-primary-600">{children}</div>
}

/* ----- Hero (three looks, one per template) ----- */

export function Hero({ data, variant }: { data: HomeData; variant: 'klasik' | 'kategori' | 'sade' }) {
  const { site, campaigns } = data
  const t = translator(data.locale)
  const hero = site.hero
  const title = hero.title || site.name
  const ctaHref = hero.cta_url || (variant === 'kategori' && data.categories.length ? '#kategoriler' : '#hizli-bagis')

  if (variant === 'sade') {
    return (
      <section className="border-b border-black/5 bg-white">
        <div className={`${container} grid items-center gap-10 py-16 md:grid-cols-[1.2fr_0.8fr]`}>
          <div>
            {hero.badge && <Kicker>{hero.badge}</Kicker>}
            <h1 className="mb-4 font-heading text-4xl font-bold leading-tight text-gray-900 md:text-5xl">{title}</h1>
            {hero.subtitle && <p className="mb-7 max-w-xl text-lg leading-relaxed text-gray-600">{hero.subtitle}</p>}
            <a href={ctaHref} className="inline-block rounded-lg bg-primary-600 px-7 py-3.5 font-bold text-white hover:bg-primary-700">
              {hero.cta_label || t('nav.donate')}
            </a>
          </div>
          {hero.image_url && <img src={hero.image_url} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover shadow-sm" />}
        </div>
      </section>
    )
  }

  return (
    <section className="relative bg-primary-950">
      {hero.image_url && <img src={hero.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary-950 via-primary-950/70 to-primary-950/10" />
      <div className={`relative ${container} grid items-center gap-12 py-20 md:py-24 ${variant === 'klasik' ? 'md:grid-cols-[1.15fr_0.85fr]' : ''}`}>
        <div className={variant === 'kategori' ? 'max-w-2xl' : ''}>
          {hero.badge && (
            <span className="mb-6 inline-block rounded-full border border-accent-400/50 bg-accent-500/20 px-4 py-2 text-[13px] font-bold tracking-[2px] text-accent-200">
              {hero.badge}
            </span>
          )}
          <h1 className="mb-5 font-heading text-4xl font-bold leading-[1.15] text-white md:text-[52px]">{title}</h1>
          {hero.subtitle && <p className="mb-8 max-w-xl text-lg leading-relaxed text-white/80">{hero.subtitle}</p>}
          <div className="flex flex-wrap gap-3.5">
            <a href={ctaHref} className="rounded-[10px] bg-accent-500 px-8 py-4 text-base font-extrabold text-white hover:bg-accent-600">
              {hero.cta_label || t('nav.donate')}
            </a>
            <Link href="/kampanyalar" className="rounded-[10px] border-[1.5px] border-white/45 px-8 py-4 text-base font-semibold text-white hover:border-white">
              {t('home.campaigns.all').replace(' →', '').replace(' ←', '')}
            </Link>
          </div>
        </div>
        {variant === 'klasik' && (
          <div id="hizli-bagis">
            {campaigns[0] ? (
              <QuickDonationForm campaignId={campaigns[0].id} campaignTitle={campaigns[0].title} />
            ) : (
              <div className="rounded-3xl border border-white/30 bg-white p-7 text-center text-gray-600">{t('home.noCampaignForm')}</div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/* ----- Sections ----- */

function Stats({ data, t }: { data: HomeData; t: T }) {
  const collected = data.campaigns.filter((c) => (c.currency || 'TRY') === 'TRY').reduce((sum, c) => sum + (c.collected_lira || 0), 0)
  const items = [
    [String(data.campaigns.length), t('home.stats.campaigns')],
    [`${collected.toLocaleString(data.locale)} ₺`, t('home.stats.collected')],
    [String(data.news.length), t('home.stats.news')],
  ]
  return (
    <section className="border-b border-black/5 bg-white">
      <div className={`${container} grid grid-cols-3 gap-4 py-8 text-center`}>
        {items.map(([value, label]) => (
          <div key={label}>
            <div className="font-heading text-2xl font-bold text-primary-700 md:text-3xl">{value}</div>
            <div className="text-xs text-gray-500 md:text-sm">{label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Categories({ data, t }: { data: HomeData; t: T }) {
  if (!data.categories.length) return null
  const slugById = new Map(data.campaigns.map((c) => [c.id, c.slug]))
  return (
    <section id="kategoriler" className={`${container} pt-[72px]`}>
      <div className="mx-auto mb-10 max-w-xl text-center">
        <Kicker>{t('home.categories.kicker')}</Kicker>
        <h2 className="mb-3 font-heading text-3xl font-bold text-gray-900 md:text-[36px]">{t('home.categories.title')}</h2>
        <p className="text-base leading-relaxed text-gray-500">{t('home.categories.text')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.categories.map((k) => {
          const slug = k.campaign_id ? slugById.get(k.campaign_id) : undefined
          return (
            <Link key={k.id || k.title} href={slug ? `/kampanyalar/${slug}` : '/kampanyalar'}
              className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-gray-200 bg-white p-5 transition-all hover:border-primary-600 hover:shadow-lg">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-primary-50 text-2xl">{k.icon}</div>
              <div className="text-base font-bold text-gray-900">{k.title}</div>
              <div className="text-[13px] leading-relaxed text-gray-500">{k.description}</div>
              <div className="mt-auto text-[13px] font-bold text-primary-600">{t('campaign.donate')} →</div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function Campaigns({ data, t }: { data: HomeData; t: T }) {
  return (
    <section id="projeler" className={`${container} py-[72px]`}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Kicker>{t('home.campaigns.kicker')}</Kicker>
          <h2 className="font-heading text-3xl font-bold text-gray-900 md:text-[36px]">{t('home.campaigns.title')}</h2>
        </div>
        <Link href="/kampanyalar" className="whitespace-nowrap text-[15px] font-bold text-primary-600">{t('home.campaigns.all')}</Link>
      </div>
      {data.campaigns.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">{t('home.campaigns.empty')}</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.campaigns.map((c) => {
            const symbol = CURRENCY[c.currency || 'TRY'] || '₺'
            return (
              <div key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-xl">
                <div className="relative h-[190px] bg-primary-50">
                  {c.cover_image_url
                    ? <img src={c.cover_image_url} alt={c.title} className="h-full w-full object-cover" loading="lazy" />
                    : <div className="flex h-full items-center justify-center text-3xl text-primary-600/30">♥</div>}
                  {c.is_featured && (
                    <span className="absolute start-3 top-3 rounded-md bg-primary-900 px-3 py-1.5 text-xs font-bold text-white">{t('home.campaigns.urgent')}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="line-clamp-2 font-heading text-xl font-bold text-gray-900">{c.title}</div>
                  <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-gray-500">{c.summary}</p>
                  {c.show_collected && c.target_lira > 0 && (
                    <div>
                      <div className="mb-1.5 flex justify-between text-[13px] font-semibold">
                        <span className="text-primary-700">{c.collected_lira.toLocaleString(data.locale)} {symbol}</span>
                        <span className="text-gray-400">{t('campaign.target')}: {c.target_lira.toLocaleString(data.locale)} {symbol}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent-500"
                          style={{ width: `${Math.min(c.progress_percentage || 0, 100)}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Link href={`/kampanyalar/${c.slug}`}
                      className="flex-1 rounded-lg border-[1.5px] border-primary-200 bg-primary-50 py-3 text-center text-sm font-bold text-primary-700 transition-colors hover:border-primary-600 hover:bg-primary-600 hover:text-white">
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
          })}
        </div>
      )}
    </section>
  )
}

function ZakatBand({ t }: { t: T }) {
  return (
    <section className="bg-primary-50">
      <div className={`${container} flex flex-wrap items-center justify-between gap-6 py-12`}>
        <div className="max-w-2xl">
          <h3 className="mb-2 font-heading text-2xl font-bold text-gray-900">{t('home.zakat.title')}</h3>
          <p className="text-gray-600">{t('home.zakat.text')}</p>
        </div>
        <Link href="/zekat-hesapla" className="whitespace-nowrap rounded-[10px] bg-primary-600 px-8 py-4 font-extrabold text-white hover:bg-primary-700">
          {t('home.zakat.cta')}
        </Link>
      </div>
    </section>
  )
}

function CtaBand({ data }: { data: HomeData }) {
  const band = data.site.cta_band
  if (!band.title) return null
  return (
    <section className="bg-primary-900">
      <div className={`${container} grid items-center gap-8 py-14 md:grid-cols-[1fr_auto]`}>
        <div>
          <h3 className="mb-2 font-heading text-[28px] font-bold text-white">{band.title}</h3>
          {band.text && <p className="max-w-xl text-[15px] leading-relaxed text-white/75">{band.text}</p>}
        </div>
        {band.button_label && (
          <Link href={band.button_url || '/kampanyalar'} className="whitespace-nowrap rounded-[10px] bg-accent-500 px-8 py-4 text-base font-extrabold text-white hover:bg-accent-600">
            {band.button_label}
          </Link>
        )}
      </div>
    </section>
  )
}

function News({ data, t }: { data: HomeData; t: T }) {
  if (!data.news.length) return null
  return (
    <section id="haberler" className={`${container} py-[72px]`}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Kicker>{t('home.news.kicker')}</Kicker>
          <h2 className="font-heading text-3xl font-bold text-gray-900 md:text-[36px]">{t('home.news.title')}</h2>
        </div>
        <Link href="/haberler" className="whitespace-nowrap text-[15px] font-bold text-primary-600">{t('home.news.all')}</Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data.news.slice(0, 6).map((n) => (
          <Link key={n.id} href={`/haberler/${n.slug || n.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-xl">
            <div className="h-40 bg-primary-50">
              {n.image_url && <img src={n.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <div className="p-5">
              {n.published_at && (
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary-600">
                  {new Date(n.published_at).toLocaleDateString(data.locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
              <div className="font-heading text-lg font-semibold leading-snug text-gray-900">{n.title}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Trust({ data, t }: { data: HomeData; t: T }) {
  const { contact } = data.site
  const cards = [
    contact.address ? ['📍', t('home.trust.address'), contact.address] : null,
    contact.phone || contact.email ? ['☎', t('home.trust.contact'), [contact.phone, contact.email].filter(Boolean).join(' · ')] : null,
    ['🔒', t('home.trust.secure'), t('home.trust.secureText')],
  ].filter(Boolean) as string[][]
  return (
    <section className="border-t border-black/5 bg-white">
      <div className={`${container} grid gap-6 py-12 md:grid-cols-3`}>
        {cards.map(([glyph, title, text]) => (
          <div key={title} className="flex gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-xl">{glyph}</div>
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

const SECTIONS: Record<string, (props: { data: HomeData; t: T }) => React.ReactNode> = {
  stats: Stats,
  categories: Categories,
  campaigns: Campaigns,
  zakat: ({ t }) => <ZakatBand t={t} />,
  cta: ({ data }) => <CtaBand data={data} />,
  news: News,
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
