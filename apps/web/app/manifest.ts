import type { MetadataRoute } from 'next'
import { getSite } from '../lib/public-content'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSite()
  return {
    name: site ? site.name : 'E-İnfak Bağış Platformu',
    short_name: site ? site.name.slice(0, 24) : 'E-İnfak',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: site?.primary_color || '#0E7A5F',
    icons: site?.favicon_url ? [{ src: site.favicon_url, sizes: 'any' }] : undefined,
  }
}
