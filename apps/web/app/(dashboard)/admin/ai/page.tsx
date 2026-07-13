'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'

interface ChurnDonor {
  donor_name: string
  last_donation_date: string
  risk_percentage: number
  recommended_action: string
}

interface PredictiveAmount {
  campaign_category: string
  suggested_avg_lira: number
  expected_donor_count: number
}

export default function AdminAiPage() {
  const [churns, setChurns] = useState<ChurnDonor[]>([])
  const [predictives, setPredictives] = useState<PredictiveAmount[]>([])
  const [loading, setLoading] = useState(false)

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadAiInsights = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/ai/donor-insights`, { headers })
      setChurns(res.data.churn_list)
      setPredictives(res.data.predictive_amounts)
    } catch (err) {
      console.error('Failed to load AI insights:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAiInsights()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Yapay Zeka (AI) Destekli Tahmin Motoru</h1>
        <button
          onClick={loadAiInsights}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">AI zeka modelleri analiz ediliyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: Churn Risk List */}
          <div className="lg:col-span-8">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="border-b pb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider text-gray-400">Kayıp Riski Yüksek Bağışçılar (Churn Alert)</h2>
                <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded">Riskli Sinyal</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead>
                    <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="pb-3">Ad Soyad</th>
                      <th className="pb-3">Son Bağış Tarihi</th>
                      <th className="pb-3">Tahmini Churn Riski</th>
                      <th className="pb-3 text-right">Tavsiye Edilen Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {churns.map((c, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-4 font-bold text-gray-900">{c.donor_name}</td>
                        <td className="py-4 text-gray-400 font-semibold">{c.last_donation_date}</td>
                        <td className="py-4 font-black">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${c.risk_percentage > 80 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                            %{c.risk_percentage}
                          </span>
                        </td>
                        <td className="py-4 text-right font-medium text-primary-600">{c.recommended_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Right: Suggested campaign sizes */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4 bg-indigo-50/10 border-indigo-100">
              <h2 className="text-sm font-bold text-indigo-950 border-b border-indigo-100 pb-2 uppercase tracking-wider text-[11px]">Akıllı Tutar Önerileri</h2>
              <div className="space-y-4">
                {predictives.map((p, idx) => (
                  <div key={idx} className="p-3 bg-white border border-indigo-100 rounded-xl space-y-1">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">{p.campaign_category}</span>
                    <div className="flex justify-between items-center text-xs font-black text-indigo-950">
                      <span>Öneri Ort. Tutar:</span>
                      <span className="text-emerald-700">{p.suggested_avg_lira.toLocaleString('tr-TR')} ₺</span>
                    </div>
                    <div className="text-[10px] text-gray-400 font-semibold pt-1">
                      Potansiyel Katılım: {p.expected_donor_count} Bağışçı
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </div>
      )}
    </div>
  )
}
