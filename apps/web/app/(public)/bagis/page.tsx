import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CmsPageView, cmsMetadata, loadPage, previewToken } from '../../../components/site/CmsPageView'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ onizleme?: string }> }

/** /bagis: the organisation's "bagis" page (e.g. tabbed donation cards), else the campaign list. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = await loadPage('bagis', previewToken((await searchParams).onizleme))
  return page ? cmsMetadata(page, '/bagis') : {}
}

export default async function DonatePage({ searchParams }: Props) {
  const page = await loadPage('bagis', previewToken((await searchParams).onizleme))
  if (!page) redirect('/kampanyalar')
  return <CmsPageView page={page} />
}
