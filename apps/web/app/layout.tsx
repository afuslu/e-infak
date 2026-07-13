import type { Metadata } from 'next'
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

export const metadata: Metadata = {
  title: 'E-İnfak - Bağış Platformu',
  description: 'Türkiye\'nin güvenilir çok kiracılı bağış platformu',
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
