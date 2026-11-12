import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from './providers'
import { DonationCart } from '../components/DonationCart'
import { SiteWidgets } from '../components/site/SiteWidgets'
import { brandCssVariables } from '@e-infak/theme'
import { getSite } from '../lib/public-content'
import { isRtl } from '../lib/i18n'
import { fontVariables } from '../lib/site-fonts'

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') || ''
  const protocol = requestHeaders.get('x-forwarded-proto') || 'https'
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined
  const site = await getSite()
  if (!site) {
    return {
      metadataBase,
      title: { default: 'e-infak.org — Online Bağış Platformu', template: '%s | e-infak.org' },
      description: 'STK’lar için online bağış platformu ve dernek otomasyonu.',
      icons: { icon: '/images/e-infak/mark.png', apple: '/images/e-infak/mark.png' },
      openGraph: {
        title: 'e-infak.org — Online Bağış Platformu',
        description: 'STK’lar için online bağış platformu ve dernek otomasyonu.',
        type: 'website',
        url: '/',
        siteName: 'e-infak.org',
        images: ['/images/e-infak/logo.png'],
      },
      alternates: { canonical: '/' },
    }
  }
  // Organisation SEO settings (Site Ayarları) win over the generated defaults.
  const title = site.seo.title || site.name
  const description = site.seo.description || site.hero.subtitle || site.tagline || undefined
  return {
    metadataBase,
    title: { default: title, template: `%s | ${site.name}` },
    description,
    keywords: site.seo.keywords ? site.seo.keywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
    icons: site.favicon_url ? { icon: site.favicon_url } : undefined,
    alternates: { canonical: '/' },
    openGraph: {
      title, description, type: 'website', url: '/', siteName: site.name,
      images: site.hero.image_url ? [site.hero.image_url] : site.logo_url ? [site.logo_url] : undefined,
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = (await headers()).get('x-locale') || 'tr'
  const site = await getSite()
  // Organisation colours are rendered here so the first paint is already themed.
  const brandStyle = site ? (brandCssVariables(site.primary_color, site.accent_color) as React.CSSProperties) : undefined
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} className={fontVariables}>
      <body className="font-sans" style={brandStyle}>
        <Providers>
          {children}
          <DonationCart />
          <SiteWidgets />
        </Providers>
      </body>
    </html>
  )
}
