'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders } from '../../../../lib/admin-access'
import { PageHeader, TBody, THead, Table, Td, Th, Tr } from '../../../../components/admin/ui'

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
  const [error, setError] = useState('')

  const API_BASE = adminApiBase()

  const getAuthHeaders = adminAuthHeaders

  const loadAiInsights = async () => {
    setLoading(true)
    setError('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/ai/donor-insights`, { headers })
      setChurns(res.data.churn_list)
      setPredictives(res.data.predictive_amounts)
    } catch (err) {
      console.error('Failed to load AI insights:', err)
      setError('AI öngörüleri yüklenemedi. Lütfen tekrar deneyin.')
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
      <PageHeader title="Yapay Zeka (AI) Destekli Tahmin Motoru" actions={<button
          onClick={loadAiInsights}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          Yenile
        </button>} />

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

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
                <Table>
                  <THead>
                    <Tr>
                      <Th>Ad Soyad</Th>
                      <Th>Son Bağış Tarihi</Th>
                      <Th>Tahmini Churn Riski</Th>
                      <Th className="text-right">Tavsiye Edilen Aksiyon</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {churns.map((c, idx) => (
                      <Tr key={idx} className="hover:bg-gray-50/50">
                        <Td className="font-bold text-gray-900">{c.donor_name}</Td>
                        <Td className="text-gray-400 font-semibold">{c.last_donation_date}</Td>
                        <Td className="font-black">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${c.risk_percentage > 80 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                            %{c.risk_percentage}
                          </span>
                        </Td>
                        <Td className="text-right font-medium text-primary-600">{c.recommended_action}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
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
