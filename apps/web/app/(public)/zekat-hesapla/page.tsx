import { headers } from 'next/headers'
import { ZakatCalculatorClient } from '../../../components/ZakatCalculatorClient'

export const dynamic = 'force-dynamic'

export default async function ZakatPage() {
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || 'hicret-dernegi'

  return <ZakatCalculatorClient orgSlug={orgSlug} />
}
