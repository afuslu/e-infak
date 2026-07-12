'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface KurbanAnimal {
  id: string
  animal_number: string
  type: string
  status: string
  video_url?: string
}

interface Share {
  id: string
  donor_name: string
  donor_phone: string
  share_number: number
  status: string
}

export default function AdminKurbanPage() {
  const [animals, setAnimals] = useState<KurbanAnimal[]>([])
  const [selectedAnimal, setSelectedAnimal] = useState<KurbanAnimal | null>(null)
  
  // Edit form state
  const [status, setStatus] = useState('waiting')
  const [videoUrl, setVideoUrl] = useState('')
  const [shares, setShares] = useState<Share[]>([])
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadAnimals = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/kurban/animals`, { headers })
      setAnimals(res.data)
    } catch (err) {
      console.error('Failed to load kurban animals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnimals()
  }, [])

  const handleSelectAnimal = async (animal: KurbanAnimal) => {
    setSelectedAnimal(animal)
    setStatus(animal.status)
    setVideoUrl(animal.video_url || '')
    setShares([])
    setSuccessMsg('')
    
    // Fetch shares for this animal from the main donations or kurban endpoints if available
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/kurban/shares`, { headers })
      const filtered = res.data.filter((s: any) => s.animal_id === animal.id)
      setShares(filtered)
    } catch (err) {
      console.error('Failed to load animal shares:', err)
    }
  }

  const handleSaveAnimal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAnimal) return

    setSaving(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      await axios.put(`${API_BASE}/api/v1/admin-features/kurban/animals/${selectedAnimal.id}`, {
        status,
        video_url: videoUrl
      }, { headers })
      
      setSuccessMsg('Kurban kesim bilgisi ve video URL başarıyla güncellendi!')
      setAnimals(prev => prev.map(a => a.id === selectedAnimal.id ? { ...a, status, video_url: videoUrl } : a))
      setSelectedAnimal(prev => prev ? { ...prev, status, video_url: videoUrl } : null)
    } catch (err) {
      console.error('Failed to save kurban animal:', err)
      alert('İşlem başarısız.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Kurban Kesim & Video Takip Paneli</h1>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Kurbanlıklar yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Animals list */}
          <div className={`${selectedAnimal ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Kurbanlık Hayvanlar</h2>
              <div className="space-y-3">
                {animals.map(a => (
                  <div
                    key={a.id}
                    onClick={() => handleSelectAnimal(a)}
                    className={`flex justify-between items-center p-4 bg-gray-50 rounded-2xl border transition-all cursor-pointer ${selectedAnimal?.id === a.id ? 'border-primary-600 bg-primary-50/20' : 'border-gray-100 hover:bg-gray-100/50'}`}
                  >
                    <div>
                      <div className="font-bold text-gray-900 text-sm">
                        {a.type === 'cow' ? '🐂 Büyükbaş' : '🐏 Küçükbaş'} - No: {a.animal_number}
                      </div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">ID: {a.id.substring(0,8)}</div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] ${a.status === 'slaughtered' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {a.status === 'slaughtered' ? 'Kesildi' : 'Beklemede'}
                      </span>
                      <div className="text-[10px] text-gray-500 font-semibold mt-1">
                        {a.video_url ? '🎥 Video Mevcut' : '❌ Video Yok'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Kurban Animal Edit Drawer */}
          {selectedAnimal && (
            <div className="lg:col-span-6 space-y-6 animate-fade-in">
              <Card className="p-6 border border-gray-100 shadow-md space-y-6 relative">
                <button 
                  onClick={() => setSelectedAnimal(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-sm font-bold"
                >
                  ✕ Kapat
                </button>

                <div>
                  <span className="text-[10px] bg-primary-100 text-primary-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Kurbanlık Detay & Video</span>
                  <h2 className="text-xl font-bold text-gray-900 mt-2">
                    {selectedAnimal.type === 'cow' ? '🐂 Büyükbaş' : '🐏 Küçükbaş'} - No: {selectedAnimal.animal_number}
                  </h2>
                </div>

                <form onSubmit={handleSaveAnimal} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Kesim Durumu</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none bg-white focus:border-primary-500 font-bold text-gray-800"
                      >
                        <option value="waiting">Beklemede (waiting)</option>
                        <option value="slaughtered">Kesildi (slaughtered)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Kesim Video URL</label>
                      <input
                        type="text"
                        placeholder="Örn: https://youtube.com/watch?v=..."
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  {/* List of associated shares */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase border-b pb-1">Hissedarlar ({shares.length})</label>
                    {shares.length === 0 ? (
                      <p className="text-xs text-gray-400">Bu kurbanlığa atanmış hissedar bulunmamaktadır.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {shares.map((s, idx) => (
                          <div key={s.id} className="flex justify-between items-center text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                            <div>
                              <span className="font-bold text-gray-900">{idx+1}. {s.donor_name}</span>
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5">{s.donor_phone}</div>
                            </div>
                            <span className={`inline-block font-bold px-2 py-0.5 rounded text-[9px] ${s.status === 'slaughtered' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                              {s.status === 'slaughtered' ? 'Kesildi' : 'Beklemede'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      type="submit"
                      disabled={saving}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
                    >
                      {saving ? 'Kaydediliyor...' : 'Kesim Bilgilerini Kaydet'}
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
