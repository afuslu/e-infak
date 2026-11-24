'use client'

/** One month of a duration donation, opened from the reminder SMS (?taksit=<token>). */
import { useEffect, useState } from 'react'
import axios from 'axios'

interface Instruction { amount_cents: number; currency: string; status: string; total_charges?: number | null; charges_done?: number; campaign_id?: string | null }

export function InstallmentCard({ campaignId, campaignTitle }: { campaignId: string; campaignTitle: string }) {
  const [token, setToken] = useState('')
  const [item, setItem] = useState<Instruction | null>(null)
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('taksit') || ''
    if (!value) return
    setToken(value)
    axios.get<Instruction>(`/api/v1/portal/recurring/${encodeURIComponent(value)}`).then((r) => setItem(r.data)).catch(() => setItem(null))
  }, [])
  if (!item || !item.total_charges || item.status === 'cancelled') return null
  const amount = item.amount_cents / 100
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-bold text-emerald-900">Aylık desteğiniz</p>
      <p className="mt-0.5 text-xs text-emerald-800">{item.total_charges} aylık desteğinizin bu ayki tutarını ödeyebilirsiniz.</p>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('add-to-donation-cart', {
        detail: { campaignId, campaignTitle: `${campaignTitle} · aylık ödeme`, amount, quantity: 1, metadata: { talimat: token }, currency: item.currency, locked: true, minQuantity: 1, maxQuantity: 1 },
      }))} className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
        {amount.toLocaleString('tr-TR')} {item.currency === 'TRY' ? '₺' : item.currency} öde
      </button>
    </div>
  )
}
