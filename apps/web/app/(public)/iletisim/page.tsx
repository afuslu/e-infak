import { ContactPageClient } from '../../../components/ContactPageClient'
import { getSite } from '../../../lib/public-content'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const site = await getSite()
  return <ContactPageClient orgName={site?.name || ''} />
}
