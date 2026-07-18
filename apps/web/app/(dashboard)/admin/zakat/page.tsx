'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface ZakatSetting {
  id: string
  gold_price_per_gram: number
  nisap_amount_lira: number
  is_auto_sync: boolean
  updated_at: string
}

export default function AdminZakatPage() {
  const [goldPrice, setGoldPrice] = useState('3000')
  const [nisapLira, setNisapLira] = useState('255000')
  const [autoSync, setAutoSync] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadSettings = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/zakat-settings`, { headers })
      const data: ZakatSetting = res.data
      setGoldPrice(String(data.gold_price_per_gram))
      setNisapLira(String(data.nisap_amount_lira))
      setAutoSync(data.is_auto_sync)
      setUpdatedAt(data.updated_at)
    } catch (err) {
      console.error('Failed to load zakat settings:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto calculate nisap when goldPrice changes, if autoSync is true
  useEffect(() => {
    if (autoSync) {
      const price = Number(goldPrice)
      if (price > 0) {
        setNisapLira(String(price * 85))
      }
    }
  }, [goldPrice, autoSync])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    
    try {
      const headers = getAuthHeaders()
      const res = await axios.put(`${API_BASE}/api/v1/admin-features/zakat-settings`, {
        gold_price_per_gram: Number(goldPrice),
        nisap_amount_lira: Number(nisapLira),
        is_auto_sync: autoSync
      }, { headers })
      
      setSuccessMsg('Zekat nisap ayarları başarıyla güncellendi!')
      setUpdatedAt(res.data.updated_at)
    } catch (err) {
      console.error('Failed to save zakat settings:', err)
      alert('Ayarlar kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Zekat & Nisap Ayarları</h1>
        {updatedAt && (
          <span className="text-xs text-gray-400 font-bold">
            Son Güncelleme: {new Date(updatedAt).toLocaleString('tr-TR')}
          </span>
        )}
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Ayarlar yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Settings Editor Form */}
          <div className="lg:col-span-6">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Nisap Değişkenleri</h2>
              <form onSubmit={handleSave} className="space-y-4">
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <label className="block text-xs font-bold text-gray-800">Canlı Altın Kuru Otomatik Hesaplama</label>
                    <span className="text-[10px] text-gray-400 block">Nisap limitini (85g * Altın Fiyatı) formülüyle otomatik hesaplar</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="h-5 w-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Gram Altın Fiyatı (TL) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Örn: 3000"
                      value={goldPrice}
                      onChange={(e) => setGoldPrice(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Zekat Nisap Sınırı (TL) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Örn: 255000"
                      value={nisapLira}
                      onChange={(e) => setNisapLira(e.target.value)}
                      disabled={autoSync}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none bg-white focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
                  >
                    {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Right: Info and Guideline Card */}
          <div className="lg:col-span-6 space-y-6">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4 bg-amber-50/20 border-amber-100">
              <h2 className="text-lg font-bold text-amber-900 border-b border-amber-200/50 pb-2">Zekat Nisap Esasları</h2>
              <div className="text-xs text-amber-950/80 leading-relaxed space-y-3 font-medium">
                <p>
                  Nisap; zekat, kurban ve sadaka-i fıtır gibi ibadetlerin kişiye farz veya vacip olması için belirlenen asgari zenginlik ölçüsüdür.
                </p>
                <p>
                  <strong>Hanefi mezhebine göre:</strong> Altın için nisap miktarı <strong>85 gramdır</strong>. 
                </p>
                <div className="p-3 bg-white rounded-xl border border-amber-100 text-[11px] text-amber-900">
                  <span className="font-bold uppercase tracking-wider block mb-1">Hesaplama Formülü:</span>
                  Nisap Limit = Gram Fiyatı ({goldPrice} ₺) × 85 = <strong>{Number(nisapLira).toLocaleString('tr-TR')} ₺</strong>
                </div>
                <p className="text-[10px] text-amber-800/80 italic">
                  * Otomatik hesaplama devredeyken yöneticinin gireceği altın gram fiyatı, ön yüzdeki zekat robotuna anında yansır.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
