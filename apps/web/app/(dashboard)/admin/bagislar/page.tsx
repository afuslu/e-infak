'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'

interface Donation {
  id: string
  amount_cents: number
  payment_method: string
  status: string
  created_at: string
  campaign_title?: string
  donor?: {
    first_name: string
    last_name?: string
    email: string
  }
}

export default function AdminDonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadDonations = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/donations`, { headers })
      setDonations(res.data)
    } catch (err) {
      console.error('Failed to load donations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDonations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredDonations = donations.filter(d => {
    const term = searchQuery.toLowerCase()
    const donorName = d.donor ? `${d.donor.first_name} ${d.donor.last_name || ''}`.toLowerCase() : ''
    const campaignTitle = d.campaign_title ? d.campaign_title.toLowerCase() : ''
    return donorName.includes(term) || campaignTitle.includes(term)
  })

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Bağış Kayıtları</h1>
        <button
          onClick={loadDonations}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>

      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <input
            type="text"
            placeholder="Bağışçı adı veya kampanya ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Bağış kayıtları yükleniyor...</p>
        ) : filteredDonations.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Kayıtlı bağış bulunmamaktadır.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead>
                <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                  <th className="pb-3">Bağışçı</th>
                  <th className="pb-3">Kampanya</th>
                  <th className="pb-3">Ödeme Tipi</th>
                  <th className="pb-3">Durum</th>
                  <th className="pb-3">Tarih</th>
                  <th className="pb-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDonations.map((don) => (
                  <tr key={don.id} className="hover:bg-gray-50/50">
                    <td className="py-3.5 font-semibold text-gray-900">
                      {don.donor ? `${don.donor.first_name} ${don.donor.last_name || ''}` : 'Anonim'}
                    </td>
                    <td className="py-3.5 font-medium">{don.campaign_title || 'Genel Bağış'}</td>
                    <td className="py-3.5 capitalize">{don.payment_method === 'credit_card' ? 'Kredi Kartı' : 'Havale/EFT'}</td>
                    <td className="py-3.5">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] ${don.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {don.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-gray-400">
                      {new Date(don.created_at).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-3.5 text-right font-bold text-emerald-800">
                      {(don.amount_cents / 100).toLocaleString('tr-TR')} ₺
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
