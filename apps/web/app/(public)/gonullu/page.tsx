import type { Metadata } from 'next'
import { VolunteerForm } from '../../../components/site/VolunteerForm'
import { currentLocale } from '../../../lib/public-content'
import { translator } from '../../../lib/i18n'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await currentLocale())
  return { title: t('volunteer.title'), description: t('volunteer.intro'), alternates: { canonical: '/gonullu' } }
}

export default async function VolunteerPage() {
  const locale = await currentLocale()
  const t = translator(locale)
  return (
    <>
      <section className="mx-auto max-w-[760px] px-4 py-12 sm:px-6">
        <h1 className="text-4xl font-extrabold">{t('volunteer.title')}</h1>
        <p className="mt-3 text-lg text-[#6B7A70]">{t('volunteer.intro')}</p>
        <VolunteerForm locale={locale} />
      </section>
    </>
  )
}
