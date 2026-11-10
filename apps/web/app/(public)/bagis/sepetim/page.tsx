import type { Metadata } from 'next'
import { CartPageClient } from '../../../../components/site/CartPageClient'

export const metadata: Metadata = { title: 'Bağış Sepetim', robots: { index: false, follow: true } }

export default function CartPage() {
  return <CartPageClient />
}
