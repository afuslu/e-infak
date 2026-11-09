import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlockRenderer } from '../../../../components/blocks/BlockRenderer'
import { RichText } from '../../../../components/site/RichText'
import { loadHomeData } from '../../../../lib/home-data'
import { currentLocale, getPublic, getSite, type PublicPage } from '../../../../lib/public-content'
import { translator } from '../../../../lib/i18n'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ onizleme?: string }> }

const previewToken = (value?: string) => (value && /^\d+\.[a-f0-9]{40}$/.test(value) ? value : null)

async function loadPage(slug: string, token: string | null) {
  const path = `pages/${encodeURIComponent(slug)}${token ? `?onizleme=${token}` : ''}`
  return getPublic<PublicPage | null>(path, null, token ? 0 : 5)
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const token = previewToken((await searchParams).onizleme)
  const page = await loadPage(slug, token)
  if (!page) return { title: translator(await currentLocale())('notFound') }
  return {
    title: page.seo_title || page.title,
    description: page.seo_description || undefined,
    alternates: { canonical: `/sayfa/${page.slug}` },
    robots: page.preview ? { index: false, follow: false } : undefined,
    openGraph: {
      title: page.seo_title || page.title,
      description: page.seo_description || undefined,
      images: page.cover_image_url ? [page.cover_image_url] : undefined,
    },
  }
}

export default async function CmsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const token = previewToken((await searchParams).onizleme)
  const page = await loadPage(slug, token)
  if (!page) notFound()

  if (page.blocks) {
    const site = await getSite()
    if (!site) notFound()
    return (
      <>
        {page.preview && (
          <div className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-bold text-amber-950">
            Önizleme — bu sürüm henüz yayınlanmadı; yalnızca bu bağlantıya sahip olanlar görür.
          </div>
        )}
        <BlockRenderer blocks={page.blocks} data={await loadHomeData(site)} />
      </>
    )
  }

  return (
    <>
      {page.cover_image_url && (
        <div className="h-64 w-full bg-cover bg-center sm:h-80" style={{ backgroundImage: `url(${JSON.stringify(page.cover_image_url)})` }} />
      )}
      <article className="mx-auto max-w-[820px] px-4 py-12 sm:px-6">
        <h1 className="text-4xl font-extrabold leading-tight">{page.title}</h1>
        <RichText text={page.body} className="mt-8" />
      </article>
    </>
  )
}
