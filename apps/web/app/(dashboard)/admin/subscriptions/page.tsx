'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface Subscription {
  id: string
  donor_name: string
  campaign_title: string
  amount_lira: number
  status: string
  next_billing_date: string
  card_brand: string
  card_last4: string
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadSubscriptions = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/subscriptions`, { headers })
      setSubscriptions(res.data)
    } catch (err) {
      console.error('Failed to load subscriptions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubscriptions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRetry = async (subId: string) => {
    setRetryingId(subId)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      await axios.post(`${API_BASE}/api/v1/admin-features/subscriptions/${subId}/retry`, {}, { headers })
      setSuccessMsg('Tahsilat talebi alındı. Kesin sonuç banka sorgusundan sonra görüntülenecektir.')
      await loadSubscriptions()
    } catch (err) {
      console.error('Failed to retry subscription billing:', err)
      alert('İşlem başarısız.')
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Düzenli Bağış & Abonelik Yönetimi</h1>
        <button
          onClick={loadSubscriptions}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Talimat kayıtları yükleniyor...</p>
        ) : subscriptions.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Kayıtlı düzenli bağış talimatı bulunmamaktadır.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead>
                <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                  <th className="pb-3">Bağışçı</th>
                  <th className="pb-3">Kampanya</th>
                  <th className="pb-3">Kart Bilgisi</th>
                  <th className="pb-3">Sonraki Çekim</th>
                  <th className="pb-3">Durum</th>
                  <th className="pb-3 text-right">Harcama</th>
                  <th className="pb-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50/50">
                    <td className="py-4 font-semibold text-gray-900">{sub.donor_name}</td>
                    <td className="py-4 font-medium text-gray-600">{sub.campaign_title}</td>
                    <td className="py-4 font-mono text-gray-500 text-[11px]">
                      💳 {sub.card_brand} (**** {sub.card_last4})
                    </td>
                    <td className="py-4 text-gray-400 font-semibold">{sub.next_billing_date}</td>
                    <td className="py-4">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] ${sub.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {sub.status === 'active' ? 'Aktif' : 'Hatalı Kart'}
                      </span>
                    </td>
                    <td className="py-4 text-right font-bold text-gray-950">
                      {sub.amount_lira.toLocaleString('tr-TR')} ₺/Ay
                    </td>
                    <td className="py-4 text-right">
                      {sub.status !== 'active' && (
                        <button
                          onClick={() => handleRetry(sub.id)}
                          disabled={retryingId === sub.id}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase shadow-sm"
                        >
                          {retryingId === sub.id ? 'Deneniyor...' : 'Çekimi Dene'}
                        </button>
                      )}
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
