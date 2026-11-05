import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RichText } from '../../../../components/site/RichText'
import { currentLocale, getPublic, type PublicPage } from '../../../../lib/public-content'
import { translator } from '../../../../lib/i18n'

export const dynamic = 'force-dynamic'

async function loadPage(slug: string) {
  return getPublic<PublicPage | null>(`pages/${encodeURIComponent(slug)}`, null)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = await loadPage(slug)
  if (!page) return { title: translator(await currentLocale())('notFound') }
  return {
    title: page.seo_title || page.title,
    description: page.seo_description || undefined,
    alternates: { canonical: `/sayfa/${page.slug}` },
    openGraph: {
      title: page.seo_title || page.title,
      description: page.seo_description || undefined,
      images: page.cover_image_url ? [page.cover_image_url] : undefined,
    },
  }
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await loadPage(slug)
  if (!page) notFound()

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
