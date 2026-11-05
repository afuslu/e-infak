'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'

type Rates = Record<string, { rate_try: number }>
let cached: Promise<Rates> | null = null

function loadRates(): Promise<Rates> {
  cached ??= axios.get('/api/v1/public/fx-rates').then((r) => r.data.rates as Rates).catch(() => ({}))
  return cached
}

export const CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }

/** "≈ $1.234 · ≈ €1.100" for an amount, using the latest TCMB rates. Renders nothing without fresh rates. */
export function ApproxCurrency({ amount, currency, className = '' }: { amount: number; currency: string; className?: string }) {
  const [rates, setRates] = useState<Rates>({})
  useEffect(() => { loadRates().then(setRates) }, [])
  const toTry = (c: string) => (c === 'TRY' ? 1 : rates[c]?.rate_try)
  const source = toTry(currency)
  if (!source || !amount) return null
  const others = ['TRY', 'USD', 'EUR'].filter((c) => c !== currency && toTry(c))
  if (!others.length) return null
  return (
    <span className={className}>
      {others.map((c) => `≈ ${CURRENCY_SYMBOL[c]}${Math.round((amount * source) / toTry(c)!).toLocaleString('tr-TR')}`).join(' · ')}
    </span>
  )
}
