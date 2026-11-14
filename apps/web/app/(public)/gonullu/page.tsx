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
        <span className="mb-3 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-700">
          {locale === 'en' ? 'Volunteering' : locale === 'ar' ? 'التطوع' : 'Gönüllülük'}
        </span>
        <h1 className="font-heading text-3xl font-bold text-gray-900 sm:text-4xl">{t('volunteer.title')}</h1>
        <p className="mt-3 text-base text-gray-600 sm:text-lg">{t('volunteer.intro')}</p>
        <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-8">
          <VolunteerForm locale={locale} />
        </div>
      </section>
    </>
  )
}
