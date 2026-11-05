import { headers } from 'next/headers'
import type { Metadata } from 'next'
import type { Campaign } from '@e-infak/api-client'
import CampaignDetailClient from './CampaignDetailClient'
import { tenantHeaders } from '../../../../lib/server-api'

export const dynamic = 'force-dynamic'

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'

async function fetchCampaign(slug: string, orgSlug: string): Promise<Campaign | null> {
  if (!orgSlug) return null
  const locale = (await headers()).get('x-locale') || 'tr'
  try {
    const res = await fetch(`${API_URL}/api/v1/campaigns/${encodeURIComponent(slug)}${locale !== 'tr' ? `?lang=${locale}` : ''}`, {
      headers: tenantHeaders(orgSlug),
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    return (await res.json()) as Campaign
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

  const description = (campaign.summary || '').slice(0, 200) || 'Bu yardım kampanyasına güvenle destek olun.'
  const images = campaign.cover_image_url ? [{ url: campaign.cover_image_url }] : undefined

  return {
    title: campaign.title,
    description,
    openGraph: {
      title: campaign.title,
      description,
      type: 'article',
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: campaign.title,
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
  const locale = (await headers()).get('x-locale') || 'tr'
  return <CampaignDetailClient slug={slug} locale={locale} />
}
