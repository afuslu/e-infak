import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CmsPageView, cmsMetadata, loadPage, previewToken } from '../../../../components/site/CmsPageView'
import { currentLocale } from '../../../../lib/public-content'
import { translator } from '../../../../lib/i18n'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ onizleme?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await loadPage(slug, previewToken((await searchParams).onizleme))
  if (!page) return { title: translator(await currentLocale())('notFound') }
  return cmsMetadata(page, `/sayfa/${page.slug}`)
}

export default async function CmsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const page = await loadPage(slug, previewToken((await searchParams).onizleme))
  if (!page) notFound()
  return <CmsPageView page={page} />
}
