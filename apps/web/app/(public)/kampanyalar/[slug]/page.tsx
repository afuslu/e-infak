import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Campaign } from '@e-infak/api-client'
import CampaignDetailClient from './CampaignDetailClient'
import { tenantHeaders } from '../../../../lib/server-api'

export const dynamic = 'force-dynamic'

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'

/** STK PRO fields the shared Campaign type does not carry yet. */
type CampaignPage = Campaign & {
  display_name?: string | null
  seo_title?: string | null
  seo_description?: string | null
  redirect_mode?: 'own' | 'url' | 'page'
  redirect_target?: string | null
}

async function fetchCampaign(slug: string, orgSlug: string): Promise<CampaignPage | null> {
  if (!orgSlug) return null
  const locale = (await headers()).get('x-locale') || 'tr'
  try {
    const res = await fetch(`${API_URL}/api/v1/campaigns/${encodeURIComponent(slug)}${locale !== 'tr' ? `?lang=${locale}` : ''}`, {
      headers: tenantHeaders(orgSlug),
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    return (await res.json()) as CampaignPage
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || ''
  const campaign = await fetchCampaign(slug, orgSlug)

  if (!campaign) {
    return {
      title: 'Kampanya',
      description: 'Yardım kampanyası',
    }
  }

  const description = campaign.seo_description || (campaign.summary || '').slice(0, 200) || 'Bu yardım kampanyasına güvenle destek olun.'
  const images = campaign.cover_image_url ? [{ url: campaign.cover_image_url }] : undefined
  const title = campaign.seo_title || campaign.display_name || campaign.title

  return {
    title,
    description,
    alternates: { canonical: `/kampanyalar/${campaign.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: campaign.cover_image_url ? [campaign.cover_image_url] : undefined,
    },
  }
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const headersList = await headers()
  const locale = headersList.get('x-locale') || 'tr'
  const campaign = await fetchCampaign(slug, headersList.get('x-organization-slug') || '')
  if (!campaign) notFound()
  // "Kampanya Sayfasını Yönlendir": URL or a site page instead of the campaign's own page.
  if (campaign.redirect_mode && campaign.redirect_mode !== 'own' && campaign.redirect_target) redirect(campaign.redirect_target)
  const shown = campaign.display_name && locale === 'tr' ? { ...campaign, title: campaign.display_name } : campaign
  return <CampaignDetailClient slug={slug} locale={locale} initial={shown} />
}
