import type { Metadata } from 'next'
import { GalleryGrid } from '../../../components/site/GalleryGrid'
import { currentLocale, getPublic, type PublicGalleryItem } from '../../../lib/public-content'
import { translator } from '../../../lib/i18n'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await currentLocale())('gallery.title'), alternates: { canonical: '/galeri' } }
}

export default async function GalleryPage() {
  const locale = await currentLocale()
  const t = translator(locale)
  const items = await getPublic<PublicGalleryItem[]>('gallery', [])
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <h1 className="text-4xl font-extrabold">{t('gallery.title')}</h1>
        {items.length === 0
          ? <p className="mt-16 text-center text-[#6B7A70]">{t('gallery.empty')}</p>
          : <GalleryGrid items={items} locale={locale} />}
      </section>
    </>
  )
}
