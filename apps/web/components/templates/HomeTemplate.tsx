import { translator } from '../../lib/i18n'
import { QuickDonationForm } from '../QuickDonationForm'
import { Hero, OrderedSections, type HomeData } from '../sections/HomeSections'

/**
 * Home page templates. All three use the same sections; they differ in the hero
 * and in where the quick donation form sits.
 *  - klasik:   large hero with the quick donation form next to it
 *  - kategori: hero with calls to action, donation categories up front
 *  - sade:     light hero, campaign-first, donation form under the hero
 */
export function HomeTemplate({ data }: { data: HomeData }) {
  const template = data.site.template
  const t = translator(data.locale)
  return (
    <>
      <Hero data={data} variant={template} />
      {template !== 'klasik' && data.campaigns[0] && (
        <section id="hizli-bagis" className="mx-auto -mb-6 max-w-xl px-6 pt-12">
          <QuickDonationForm campaignId={data.campaigns[0].id} campaignTitle={data.campaigns[0].title} />
        </section>
      )}
      {template !== 'klasik' && !data.campaigns[0] && <span id="hizli-bagis" aria-label={t('home.noCampaignForm')} />}
      <OrderedSections data={data} />
    </>
  )
}
