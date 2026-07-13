import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PreRegistrationClient } from '../../../components/PreRegistrationClient'

export const dynamic = 'force-dynamic'

export default async function PreRegistrationPage() {
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || 'hicret-dernegi'

  if (orgSlug !== 'hicret-dernegi') {
    redirect('/')
  }

  return <PreRegistrationClient />
}
