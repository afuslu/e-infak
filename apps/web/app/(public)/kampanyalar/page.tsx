import type { Metadata } from 'next'
import CampaignsClient from './CampaignsClient'

export const metadata: Metadata = { title: 'Kampanyalar', alternates: { canonical: '/kampanyalar' } }

type Props = { searchParams: Promise<{ kategori?: string; q?: string }> }

/** /kampanyalar?kategori=zekat&q=su links open the list already filtered. */
export default async function CampaignsPage({ searchParams }: Props) {
  const { kategori, q } = await searchParams
  const category = kategori && /^[a-z]{2,20}$/.test(kategori) ? kategori : ''
  return <CampaignsClient initialCategory={category} initialSearch={(q || '').slice(0, 100)} />
}
