import type { Metadata } from 'next'
import { Inter, Outfit, Playfair_Display } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { DonationCart } from '../components/DonationCart'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-primary',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
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
    <html lang="tr" className={`${inter.variable} ${outfit.variable} ${playfair.variable}`}>
      <body className={inter.className}>
        <Providers>
          {children}
          <DonationCart />
        </Providers>
      </body>
    </html>
  )
}
