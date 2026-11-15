import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') || 'e-infak.org'
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Panels, payment results and personal pages: nothing for search engines there.
      disallow: ['/admin', '/api/', '/portal', '/giris', '/sifre', '/platform', '/bagis/basarili', '/bagis/hata', '/bagis/sepetim', '/verify/receipt/', '/site-yapici-cerceve'],
    },
    sitemap: `https://${host}/sitemap.xml`,
  }
}
