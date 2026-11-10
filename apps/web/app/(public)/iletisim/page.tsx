import { ContactPageClient } from '../../../components/ContactPageClient'
import { CmsPageView, loadPage } from '../../../components/site/CmsPageView'
import { getSite } from '../../../lib/public-content'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  // A published "iletisim" page (site builder / CMS) replaces the built-in one.
  const custom = await loadPage('iletisim')
  if (custom) return <CmsPageView page={custom} />
  const site = await getSite()
  return <ContactPageClient orgName={site?.name || ''} />
}
