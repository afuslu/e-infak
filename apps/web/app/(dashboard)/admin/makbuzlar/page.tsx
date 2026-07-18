'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'

interface Donation {
  id: string
  receipt_number: string
  amount_lira: number
  status: string
  payment_method: string
  created_at: string
}

interface ReceiptDetail {
  receipt_number: string
  verification_hash: string
  verify_url: string
  status: string
  donor_name: string
  amount_lira: number
  payment_method: string
}

export default function AdminReceiptsPage() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null)
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null)

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
      const res = await axios.get(`${API_BASE}/api/v1/donations`, {
        headers: getAuthHeaders(),
        params: { status: 'confirmed', page_size: 100 },
      })
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

  const viewReceipt = async (donationId: string) => {
    setReceiptLoadingId(donationId)
    setReceiptDetail(null)
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/donations/${donationId}/receipt`, { headers: getAuthHeaders() })
      setReceiptDetail(res.data)
    } catch (err) {
      console.error('Failed to load receipt:', err)
      alert('Makbuz bilgisi alınamadı.')
    } finally {
      setReceiptLoadingId(null)
    }
  }

  const filteredDonations = donations.filter((d) =>
    d.receipt_number.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Makbuzlar</h1>
        <button
          onClick={loadDonations}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>

      {receiptDetail && (
        <Card className="p-6 border-2 border-primary-200 shadow-sm space-y-3 bg-primary-50/40">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Makbuz Doğrulama</div>
              <div className="text-2xl font-black text-gray-900">{receiptDetail.receipt_number}</div>
            </div>
            <button onClick={() => setReceiptDetail(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-2 border-t">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Bağışçı</div>
              <div className="font-semibold text-gray-800">{receiptDetail.donor_name}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Tutar</div>
              <div className="font-semibold text-gray-800">{receiptDetail.amount_lira.toLocaleString('tr-TR')} ₺</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Ödeme</div>
              <div className="font-semibold text-gray-800">{receiptDetail.payment_method}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase">Doğrulama Kodu</div>
              <div className="font-mono text-xs text-gray-600">{receiptDetail.verification_hash}</div>
            </div>
          </div>
          <a href={receiptDetail.verify_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary-600 hover:underline">
            Genel doğrulama sayfasını görüntüle ↗
          </a>
        </Card>
      )}

      <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
        <input
          type="text"
          placeholder="Makbuz numarası ile ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
        />

        {loading ? (
          <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Makbuzlar yükleniyor...</p>
        ) : filteredDonations.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">Ödemesi tamamlanmış bağış bulunmamaktadır.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead>
                <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                  <th className="pb-3">Makbuz No</th>
                  <th className="pb-3">Ödeme Tipi</th>
                  <th className="pb-3">Tarih</th>
                  <th className="pb-3 text-right">Tutar</th>
                  <th className="pb-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDonations.map((don) => (
                  <tr key={don.id} className="hover:bg-gray-50/50">
                    <td className="py-3.5 font-bold text-gray-900">{don.receipt_number}</td>
                    <td className="py-3.5 capitalize">{don.payment_method === 'credit_card' ? 'Kredi Kartı' : 'Havale/EFT'}</td>
                    <td className="py-3.5 text-gray-400">{new Date(don.created_at).toLocaleDateString('tr-TR')}</td>
                    <td className="py-3.5 text-right font-bold text-emerald-800">{don.amount_lira.toLocaleString('tr-TR')} ₺</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => viewReceipt(don.id)}
                        disabled={receiptLoadingId === don.id}
                        className="text-primary-600 hover:text-primary-700 font-bold"
                      >
                        {receiptLoadingId === don.id ? 'Yükleniyor...' : 'Doğrulama Linki'}
                      </button>
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
