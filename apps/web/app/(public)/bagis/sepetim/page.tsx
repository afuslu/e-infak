import type { Metadata } from 'next'
import { CartPageClient } from '../../../../components/site/CartPageClient'
import { getSite } from '../../../../lib/public-content'

export const metadata: Metadata = { title: 'Bağış Sepetim', robots: { index: false, follow: true } }

export default async function CartPage() {
  const site = await getSite()
  return (
    <CartPageClient
      checkoutStyle={site?.design?.checkout_style}
      siteName={site?.name}
      microAddon={Boolean(site?.design?.checkout_micro_addon)}
      showFaq={Boolean(site?.design?.checkout_show_faq)}
    />
  )
}
