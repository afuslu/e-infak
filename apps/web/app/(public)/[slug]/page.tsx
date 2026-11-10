import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CmsPageView, cmsMetadata, loadPage, previewToken } from '../../../components/site/CmsPageView'
import { NewsArticle, loadPost, postMetadata } from '../../../components/site/NewsArticle'
import { getCampaign } from '../../../lib/home-data'
import { currentLocale } from '../../../lib/public-content'
import { translator } from '../../../lib/i18n'

export const dynamic = 'force-dynamic'

/**
 * Short addresses (/hesap-numaralarimiz, /2026-kurban-organizasyonu…) kept from a site the
 * organisation moved from: a published page with that slug, else a news post, else a campaign
 * (permanent redirect to its page). The redirect table (middleware) has already run.
 */
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ onizleme?: string }> }

const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/

async function resolve(slug: string, token: string | null) {
  if (!SLUG.test(slug)) return null
  const page = await loadPage(slug, token)
  if (page) return { page } as const
  const post = await loadPost(slug)
  if (post) return { post } as const
  return null
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const found = await resolve(slug, previewToken((await searchParams).onizleme))
  if (found?.page) return cmsMetadata(found.page, `/${found.page.slug}`)
  if (found?.post) return postMetadata(found.post, `/${slug}`)
  return { title: translator(await currentLocale())('notFound') }
}

export default async function ShortAddressPage({ params, searchParams }: Props) {
  const { slug } = await params
  const found = await resolve(slug, previewToken((await searchParams).onizleme))
  if (found?.page) return <CmsPageView page={found.page} />
  if (found?.post) return <NewsArticle post={found.post} />
  if (SLUG.test(slug)) {
    const campaign = await getCampaign(slug)
    if (campaign?.slug) permanentRedirect(`/kampanyalar/${campaign.slug}`)
  }
  notFound()
}
