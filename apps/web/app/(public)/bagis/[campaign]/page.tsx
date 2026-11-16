import type { Metadata } from 'next'
import { CmsPageView, cmsMetadata, loadPage, previewToken } from '../../../../components/site/CmsPageView'
import type { Block } from '../../../../lib/blocks'
import { SingleCampaignDonation } from './SingleCampaignDonation'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ campaign: string }>
  searchParams: Promise<{ onizleme?: string }>
}

function findCategoryTab(blocks: Block[] | null | undefined, tag: string): { label: string; tag: string } | null {
  if (!blocks?.length) return null
  for (const b of blocks) {
    if (b.type === 'donation_cards' && b.props?.source === 'tabs' && Array.isArray(b.props.tabs)) {
      const hit = (b.props.tabs as Array<{ label?: string; tag?: string }>).find((t) => t?.tag === tag && t?.label)
      if (hit && hit.tag && hit.label) return { tag: hit.tag, label: hit.label }
    }
    const nested = findCategoryTab(b.children, tag)
    if (nested) return nested
  }
  return null
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { campaign } = await params
  const slug = decodeURIComponent(campaign)
  const page = await loadPage('bagis', previewToken((await searchParams).onizleme))
  const tab = findCategoryTab(page?.blocks, slug)
  if (page && tab) {
    const base = cmsMetadata(page, `/bagis/${encodeURIComponent(tab.tag)}`)
    return {
      ...base,
      title: `${tab.label} — ${page.seo_title || page.title}`,
    }
  }
  return {}
}

export default async function DonationOrCategoryPage({ params, searchParams }: Props) {
  const { campaign } = await params
  const slug = decodeURIComponent(campaign)
  const page = await loadPage('bagis', previewToken((await searchParams).onizleme))
  const tab = findCategoryTab(page?.blocks, slug)

  if (page && tab) {
    return <CmsPageView page={page} />
  }

  return <SingleCampaignDonation slug={slug} />
}
