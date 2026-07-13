import { headers } from 'next/headers'
import { ContactPageClient } from '../../../components/ContactPageClient'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || 'hicret-dernegi'

  return <ContactPageClient orgSlug={orgSlug} />
}
