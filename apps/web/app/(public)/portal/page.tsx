import type { Metadata } from 'next'
import { PortalClient } from '../../../components/portal/PortalClient'
import { getSite } from '../../../lib/public-content'

export const metadata: Metadata = {
  title: 'Bağışçı ve Veli Paneli',
  robots: { index: false, follow: false },
}

export default async function PortalPage() {
  const site = await getSite()
  return <PortalClient siteName={site?.name || 'E-İnfak'} />
}
