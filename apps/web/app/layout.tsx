import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Lora, Public_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { DonationCart } from '../components/DonationCart'

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-primary',
})

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-heading',
})

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') || ''
  const organizationSlug = requestHeaders.get('x-organization-slug') || ''
  if (host.includes('kardeslikpayi.org') || organizationSlug === 'kardeslik-payi') return {
    title: { default: 'Kardeşlik Payı', template: '%s | Kardeşlik Payı' },
    description: 'Kardeşlik Payı resmi bağış ve yardımlaşma platformu.',
    icons: { icon: '/images/kardeslik/logo.jpeg' },
    openGraph: { title: 'Kardeşlik Payı', description: 'Birlikte daha güçlüyüz.', type: 'website' },
  }
  if (host.includes('hicretdernegi.org') || organizationSlug === 'hicret-dernegi') return {
    title: { default: 'Hicret Derneği', template: '%s | Hicret Derneği' },
    description: 'Hicret Derneği resmi eğitim ve bağış platformu.',
    icons: { icon: '/images/hicret/logo.jpeg' },
    openGraph: { title: 'Hicret Derneği', description: 'İlimle yetişen nesiller.', type: 'website' },
  }
  return {
    title: { default: 'E‑İnfak', template: '%s | E‑İnfak' },
    description: 'STK’lar için güvenli bağış otomasyonu.',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr" className={`${publicSans.variable} ${lora.variable}`}>
      <body className={publicSans.className}>
        <Providers>
          {children}
          <DonationCart />
        </Providers>
      </body>
    </html>
  )
}
