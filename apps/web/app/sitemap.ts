import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getPublic, getSite, type PublicPost } from '../lib/public-content'
import { tenantHeaders } from '../lib/server-api'

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'

/** Active campaigns (the public list never includes drafts). */
async function publicCampaigns(): Promise<{ slug: string; updated_at?: string }[]> {
  const orgSlug = (await headers()).get('x-organization-slug') || ''
  if (!orgSlug) return []
  try {
    const res = await fetch(`${API_URL}/api/v1/campaigns?status=active&page_size=500`, { headers: tenantHeaders(orgSlug), next: { revalidate: 300 } })
    if (!res.ok) return []
    return ((await res.json()).items || []) as { slug: string; updated_at?: string }[]
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') || 'e-infak.org'
  const baseUrl = `https://${host}`
  // The platform's own address has one page; organisation paths do not exist there.
  if (!(await getSite())) return [{ url: `${baseUrl}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 }]
  const paths = [
    '/', '/kampanyalar', '/haberler', '/galeri', '/gonullu', '/hakkimizda', '/iletisim', '/zekat-hesapla',
    '/kvkk', '/gizlilik', '/bagis-kosullari',
  ]
  const staticEntries: MetadataRoute.Sitemap = paths.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))

  const [pages, posts, campaigns] = await Promise.all([
    getPublic<{ slug: string; updated_at: string }[]>('pages', [], 300),
    getPublic<PublicPost[]>('content-posts?limit=100', [], 300),
    publicCampaigns(),
  ])
  const campaignEntries: MetadataRoute.Sitemap = campaigns.map((campaign) => ({
    url: `${baseUrl}/kampanyalar/${campaign.slug}`,
    lastModified: campaign.updated_at ? new Date(campaign.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))
  const pageEntries: MetadataRoute.Sitemap = pages.map((page) => ({
    url: `${baseUrl}/sayfa/${page.slug}`,
    lastModified: new Date(page.updated_at),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))
  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/haberler/${post.slug || post.id}`,
    lastModified: post.published_at ? new Date(post.published_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
  }))
  return [...staticEntries, ...campaignEntries, ...pageEntries, ...postEntries]
}
