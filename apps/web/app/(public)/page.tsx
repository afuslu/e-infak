import type { Metadata } from 'next'
import { EInfakPortal } from '../../components/EInfakPortal'
import { BlockRenderer } from '../../components/blocks/BlockRenderer'
import { HomeTemplate } from '../../components/templates/HomeTemplate'
import type { Block } from '../../lib/blocks'
import { loadHomeData } from '../../lib/home-data'
import { getPublic, getSite } from '../../lib/public-content'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ onizleme?: string }> }

const previewToken = (value?: string) => (value && /^\d+\.[a-f0-9]{40}$/.test(value) ? value : null)

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return previewToken((await searchParams).onizleme) ? { robots: { index: false, follow: false } } : {}
}

export default async function HomePage({ searchParams }: Props) {
  const site = await getSite()
  if (!site) return <EInfakPortal />

  const token = previewToken((await searchParams).onizleme)
  const [data, home] = await Promise.all([
    loadHomeData(site),
    getPublic<{ blocks: Block[] | null; preview: boolean }>(token ? `home?onizleme=${token}` : 'home', { blocks: null, preview: false }, token ? 0 : 5),
  ])

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: site.name,
    url: site.url,
    logo: site.logo_url ? new URL(site.logo_url, site.url).toString() : undefined,
    potentialAction: { '@type': 'DonateAction', target: `${site.url}/kampanyalar` },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      {home.preview && <PreviewBar />}
      {home.blocks ? <BlockRenderer blocks={home.blocks} data={data} /> : <HomeTemplate data={data} />}
    </>
  )
}

function PreviewBar() {
  return (
    <div className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-bold text-amber-950">
      Önizleme — bu sayfa henüz yayınlanmadı; yalnızca bu bağlantıya sahip olanlar görür.
    </div>
  )
}
