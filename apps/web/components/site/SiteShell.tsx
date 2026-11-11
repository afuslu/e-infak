import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  currentLocale, defaultFooterLinks, defaultHeaderLinks, getPublic,
  type MenuLink, type PublicMenu, type SiteData,
} from '../../lib/public-content'
import { translator } from '../../lib/i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { siteDesignStyle } from '../../lib/site-design'
import { BlockStyles, renderBlock } from '../blocks/BlockRenderer'
import type { HomeData } from '../sections/HomeSections'
import type { Block } from '../../lib/blocks'
import { loadHomeData } from '../../lib/home-data'

/** Blocks that draw campaigns, news or categories; only then is that data loaded for the footer. */
const DATA_BLOCKS = new Set(['hero', 'slider', 'quick_donation', 'campaigns', 'campaign_card', 'categories', 'news', 'stats', 'banner'])
const usesData = (blocks: Block[]): boolean => blocks.some((b) => DATA_BLOCKS.has(b.type) || usesData(b.children || []))

const SOCIAL_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', linkedin: 'LinkedIn', telegram: 'Telegram',
}

function NavLink({ link, className }: { link: MenuLink; className: string }) {
  const external = /^https?:\/\//.test(link.url)
  if (external || link.open_in_new_tab) {
    return (
      <a href={link.url} className={className} target={link.open_in_new_tab ? '_blank' : undefined} rel="noopener noreferrer">
        {link.label}
      </a>
    )
  }
  return <Link href={link.url} className={className}>{link.label}</Link>
}

export function Brand({ site, inverted = false }: { site: SiteData; inverted?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3">
      {site.logo_url && (
        <img src={(inverted && site.logo_dark_url) || site.logo_url} alt="" className="h-11 w-11 flex-shrink-0 rounded-full bg-white object-cover" />
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate font-heading text-lg font-bold tracking-wide ${inverted ? 'text-white' : 'text-gray-900'}`}>{site.name}</span>
        {site.tagline && (
          <span className={`truncate text-[11px] font-semibold uppercase tracking-[2px] ${inverted ? 'text-white/70' : 'text-primary-600'}`}>
            {site.tagline}
          </span>
        )}
      </span>
    </Link>
  )
}

/** Shared header + footer of every organisation website (one theme for all tenants). */
export async function SiteShell({ site, children }: { site: SiteData; children: ReactNode }) {
  const t = translator(await currentLocale())
  const [menu, chrome] = await Promise.all([
    getPublic<PublicMenu>('menu', { header: [], footer: [] }, 60),
    getPublic<{ header: Block[] | null; footer: Block[] | null }>('site-chrome', { header: null, footer: null }, 5),
  ])
  const headerLinks = menu.header.length ? menu.header : defaultHeaderLinks(t)
  const footerLinks = menu.footer.length ? menu.footer : defaultFooterLinks(t)
  const social = Object.entries(site.social_links || {})
  // Header/footer built in Site Yapıcı replace the built-in ones once published.
  let data: HomeData | null = null
  if (chrome.header || chrome.footer) {
    const blocks = [...(chrome.header || []), ...(chrome.footer || [])]
    data = usesData(blocks)
      ? { ...(await loadHomeData(site)), menu }
      : { site, locale: await currentLocale(), campaigns: [], news: [], categories: [], menu }
  }

  return (
    <div className={`site-design tpl-${site.template} flex min-h-screen flex-col overflow-x-clip font-sans`} style={siteDesignStyle(site.design)}>
      {chrome.header && data ? (
        <header className="contents">
          <BlockStyles blocks={chrome.header} />
          {chrome.header.map((b) => renderBlock(b, { data: data! }))}
        </header>
      ) : (
        <>
          {(site.contact.phone || site.contact.email) && site.template !== 'sade' && (
            <div className="hidden bg-primary-900 py-2 text-[13px] text-primary-100 sm:block">
              <div className="mx-auto flex max-w-[var(--site-container)] items-center justify-between gap-4 px-6">
                <div className="flex flex-wrap gap-5">
                  {site.contact.phone && <a href={`tel:${site.contact.phone}`} className="hover:text-white">{site.contact.phone}</a>}
                  {site.contact.email && <a href={`mailto:${site.contact.email}`} className="hover:text-white">{site.contact.email}</a>}
                </div>
                <div className="flex items-center gap-4">
                  <Link href="/portal" className="font-semibold hover:text-white">{t('nav.donorLogin')}</Link>
                  <span className="opacity-40">|</span>
                  <Link href="/verify" className="hover:text-white">{t('nav.verifyReceipt')}</Link>
                </div>
              </div>
            </div>
          )}

          <header className="sticky top-0 z-40 border-b border-black/5 bg-white/95 backdrop-blur">
            <div className="mx-auto flex h-[76px] max-w-[var(--site-container)] items-center justify-between gap-4 px-4 sm:px-6">
              <Brand site={site} />
              <details className="relative lg:hidden">
                <summary className="cursor-pointer list-none rounded-lg border px-3 py-2 text-sm font-semibold">{t('nav.menu')} ☰</summary>
                <nav className="absolute end-0 mt-2 flex w-60 flex-col rounded-xl border bg-white p-2 shadow-lg">
                  <LanguageSwitcher className="m-2" />
                  {headerLinks.map((link) => (
                    <NavLink key={`${link.label}-${link.url}`} link={link} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-50" />
                  ))}
                  <Link href="/kampanyalar" className="m-2 rounded-lg bg-primary-600 px-4 py-2.5 text-center font-bold text-white">{t('nav.donate')}</Link>
                </nav>
              </details>
              <nav className="hidden items-center gap-6 text-[15px] font-semibold lg:flex">
                {headerLinks.map((link) => (
                  <NavLink key={`${link.label}-${link.url}`} link={link} className="text-gray-700 hover:text-primary-600" />
                ))}
                <LanguageSwitcher />
                <Link href="/kampanyalar" className={`px-5 py-2.5 font-bold text-white shadow-sm transition hover:-translate-y-0.5 ${site.template === 'kategori' ? 'rounded-full bg-accent-500 hover:bg-accent-600' : 'rounded-lg bg-primary-600 hover:bg-primary-700'}`}>♥ {t('nav.donate')}</Link>
              </nav>
            </div>
          </header>
        </>
      )}

      <main className="min-w-0 w-full flex-1">{children}</main>

      {chrome.footer && data ? (
        <footer>
          <BlockStyles blocks={chrome.footer} />
          {chrome.footer.map((b) => renderBlock(b, { data: data! }))}
        </footer>
      ) : (
        <footer className="bg-primary-950 text-primary-100/80">
          <div className="relative overflow-hidden border-b border-white/10">
            <div className="pointer-events-none absolute -end-20 -top-24 h-72 w-72 rounded-full bg-accent-500/15 blur-3xl" aria-hidden />
            <div className="relative mx-auto flex max-w-[var(--site-container)] flex-wrap items-center justify-between gap-6 px-6 py-10">
              <div>
                <div className="font-heading text-2xl font-bold text-white md:text-3xl">{t('footer.ctaTitle')}</div>
                <p className="mt-1 text-sm text-primary-100/70">{t('footer.ctaText')}</p>
              </div>
              <Link href="/kampanyalar" className="rounded-[10px] bg-accent-500 px-8 py-4 font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-accent-600">
                {t('nav.donate')}
              </Link>
            </div>
          </div>
          <div className="mx-auto grid max-w-[var(--site-container)] gap-10 px-6 pb-10 pt-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.3fr]">
            <div>
              <Brand site={site} inverted />
              {site.footer_text && <p className="mt-5 max-w-sm text-sm leading-relaxed">{site.footer_text}</p>}
              {social.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2 text-sm">
                  {social.map(([network, href]) => (
                    <a key={network} href={href} target="_blank" rel="noopener noreferrer"
                      className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 transition hover:border-accent-400 hover:text-white">
                      {SOCIAL_LABELS[network] || network}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <nav className="flex flex-col gap-2.5 text-sm" aria-label={t('footer.institutional')}>
              <div className="mb-2 text-xs font-bold uppercase tracking-[2px] text-white">{t('footer.institutional')}</div>
              {headerLinks.map((link) => (
                <NavLink key={`${link.label}-${link.url}`} link={link} className="transition hover:text-white" />
              ))}
            </nav>
            <nav className="flex flex-col gap-2.5 text-sm" aria-label={t('footer.quickLinks')}>
              <div className="mb-2 text-xs font-bold uppercase tracking-[2px] text-white">{t('footer.quickLinks')}</div>
              {footerLinks.map((link) => (
                <NavLink key={`${link.label}-${link.url}`} link={link} className="transition hover:text-white" />
              ))}
              <Link href="/portal" className="transition hover:text-white">{t('nav.donorLogin')}</Link>
              <Link href="/verify" className="transition hover:text-white">{t('nav.verifyReceipt')}</Link>
            </nav>
            <div className="space-y-3 text-sm">
              <div className="mb-2 text-xs font-bold uppercase tracking-[2px] text-white">{t('footer.contact')}</div>
              {site.contact.address && <p className="leading-relaxed">{site.contact.address}</p>}
              {site.contact.phone && <p><a href={`tel:${site.contact.phone}`} className="font-semibold text-white hover:text-accent-300">{site.contact.phone}</a></p>}
              {site.contact.email && <p><a href={`mailto:${site.contact.email}`} className="hover:text-white">{site.contact.email}</a></p>}
            </div>
          </div>
          <div className="border-t border-white/10">
            <div className="mx-auto flex max-w-[var(--site-container)] flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-primary-100/60">
              <span>© {new Date().getFullYear()} {site.name}</span>
              <span>E-İnfak altyapısıyla</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
