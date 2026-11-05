import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') || 'e-infak.org'
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `https://${host}/sitemap.xml` }
}
