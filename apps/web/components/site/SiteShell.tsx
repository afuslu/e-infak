import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  currentLocale, defaultFooterLinks, defaultHeaderLinks, getPublic,
  type MenuLink, type PublicMenu, type SiteData,
} from '../../lib/public-content'
import { translator } from '../../lib/i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { siteDesignStyle } from '../../lib/site-design'

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
  const menu = await getPublic<PublicMenu>('menu', { header: [], footer: [] }, 60)
  const headerLinks = menu.header.length ? menu.header : defaultHeaderLinks(t)
  const footerLinks = menu.footer.length ? menu.footer : defaultFooterLinks(t)
  const social = Object.entries(site.social_links || {})

  return (
    <div className="site-design flex min-h-screen flex-col font-sans" style={siteDesignStyle(site.design)}>
      {(site.contact.phone || site.contact.email) && (
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
            <Link href="/kampanyalar" className="rounded-lg bg-primary-600 px-5 py-2.5 font-bold text-white hover:bg-primary-700">{t('nav.donate')}</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 bg-primary-950 text-primary-100/80">
        <div className="mx-auto grid max-w-[var(--site-container)] gap-10 px-6 pb-8 pt-14 md:grid-cols-[1.4fr_1fr_1.2fr]">
          <div>
            <Brand site={site} inverted />
            {site.footer_text && <p className="mt-4 text-sm leading-relaxed">{site.footer_text}</p>}
            {social.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {social.map(([network, href]) => (
                  <a key={network} href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/20 px-3 py-1 hover:text-white">
                    {SOCIAL_LABELS[network] || network}
                  </a>
                ))}
              </div>
            )}
          </div>
          <nav className="flex flex-col gap-2.5 text-sm">
            {footerLinks.map((link) => (
              <NavLink key={`${link.label}-${link.url}`} link={link} className="hover:text-white" />
            ))}
          </nav>
          <div className="space-y-2 text-sm">
            {site.contact.address && <p>{site.contact.address}</p>}
            {site.contact.phone && <p><a href={`tel:${site.contact.phone}`} className="hover:text-white">{site.contact.phone}</a></p>}
            {site.contact.email && <p><a href={`mailto:${site.contact.email}`} className="hover:text-white">{site.contact.email}</a></p>}
            <p className="flex gap-4 pt-2">
              <Link href="/portal" className="hover:text-white">{t('nav.donorLogin')}</Link>
              <Link href="/verify" className="hover:text-white">{t('nav.verifyReceipt')}</Link>
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-primary-100/60">
          © {new Date().getFullYear()} {site.name} · E-İnfak altyapısıyla
        </div>
      </footer>
    </div>
  )
}
