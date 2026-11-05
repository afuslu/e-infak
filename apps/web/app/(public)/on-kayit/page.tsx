import { redirect } from 'next/navigation'
import { PreRegistrationClient } from '../../../components/PreRegistrationClient'
import { getSite } from '../../../lib/public-content'

export const dynamic = 'force-dynamic'

/** Student pre-registration is part of the education module of the organisation's package. */
export default async function PreRegistrationPage() {
  const site = await getSite()
  if (!site || !site.features.includes('education')) {
    redirect('/')
  }
  return <PreRegistrationClient />
}
