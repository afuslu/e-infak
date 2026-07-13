'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface WaterWell {
  id: string
  name: string
  location_name: string
  latitude: number
  longitude: number
  status: string
  donor_name?: string
  donor_id?: string
}

interface Donor {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function AdminWellsPage() {
  const [wells, setWells] = useState<WaterWell[]>([])
  const [donors, setDonors] = useState<Donor[]>([])
  const [selectedWell, setSelectedWell] = useState<WaterWell | null>(null)
  
  // Create well form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [locationName, setLocationName] = useState('')
  const [latitude, setLatitude] = useState('12.113')
  const [longitude, setLongitude] = useState('15.052')
  const [status, setStatus] = useState('completed')
  const [donorId, setDonorId] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const [wellsRes, donorsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/admin-features/water-wells`, { headers }),
        axios.get(`${API_BASE}/api/v1/admin-features/donors`, { headers })
      ])
      
      setWells(wellsRes.data)
      setDonors(donorsRes.data)
    } catch (err) {
      console.error('Failed to load water wells data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateWell = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/water-wells`, {
        name,
        location_name: locationName,
        latitude: Number(latitude),
        longitude: Number(longitude),
        status,
        donor_id: donorId || null
      }, { headers })
      
      setWells(prev => [...prev, res.data])
      setShowAddForm(false)
      setName('')
      setLocationName('')
      setDonorId('')
      setSuccessMsg('Yeni su kuyusu kaydı başarıyla oluşturuldu!')
    } catch (err) {
      console.error(err)
      alert('Kayıt oluşturulamadı.')
    } finally {
      setSaving(false)
    }
  }

  const getDonorDisplay = (well: WaterWell) => {
    if (!well.donor_id) return 'Genel Fon'
    const match = donors.find(d => d.id === well.donor_id)
    return match ? `${match.first_name} ${match.last_name || ''}` : 'Anonim Bağışçı'
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Su Kuyusu Haritası & Takip Paneli</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-5 rounded-lg text-xs uppercase"
        >
          {showAddForm ? '✕ İptal Et' : '➕ Yeni Kasa Kuyu Ekle'}
        </button>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {/* Add Water Well Form */}
      {showAddForm && (
        <Card className="p-6 border border-gray-100 shadow-sm space-y-4 max-w-2xl animate-fade-in">
          <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400">Yeni Su Kuyusu Bilgileri</h2>
          <form onSubmit={handleCreateWell} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kuyu Adı *</label>
                <input
                  type="text"
                  placeholder="Örn: Hz. Ömer Hayrat Kuyusu"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Konum / Ülke *</label>
                <input
                  type="text"
                  placeholder="Örn: Çad, N'Djamena"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Enlem (Latitude) *</label>
                <input
                  type="number"
                  step="0.000001"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Boylam (Longitude) *</label>
                <input
                  type="number"
                  step="0.000001"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Durum</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none bg-white focus:border-primary-500"
                >
                  <option value="completed">Tamamlandı (completed)</option>
                  <option value="drilling">Sondaj Aşamasında (drilling)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fonlayan Bağışçı (Sponsor)</label>
              <select
                value={donorId}
                onChange={(e) => setDonorId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2 text-xs bg-white outline-none focus:border-primary-500"
              >
                <option value="">Genel Fonlama (Su Kampanyası)</option>
                {donors.map(d => (
                  <option key={d.id} value={d.id}>{d.first_name} {d.last_name || ''} ({d.email})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving} className="bg-primary-600 text-white font-bold py-2 px-5 text-xs rounded-lg uppercase">
                {saving ? 'Kaydediliyor...' : 'Kuyu Kaydet'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Su kuyusu kayıtları yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Wells list */}
          <div className={`${selectedWell ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Kuyular</h2>
              <div className="space-y-3">
                {wells.map(w => (
                  <div
                    key={w.id}
                    onClick={() => setSelectedWell(w)}
                    className={`flex justify-between items-center p-4 bg-gray-50 rounded-2xl border transition-all cursor-pointer ${selectedWell?.id === w.id ? 'border-primary-600 bg-primary-50/20' : 'border-gray-100 hover:bg-gray-100/50'}`}
                  >
                    <div>
                      <div className="font-bold text-gray-900 text-sm">⛲ {w.name}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Konum: {w.location_name} | Sponsor: {getDonorDisplay(w)}</div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] ${w.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {w.status === 'completed' ? 'Aktif/Açıldı' : 'Sondajda'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Selected Well Detail Map Simulation */}
          {selectedWell && (
            <div className="lg:col-span-6 space-y-6 animate-fade-in">
              <Card className="p-6 border border-gray-100 shadow-md space-y-6 relative">
                <button 
                  onClick={() => setSelectedWell(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-sm font-bold"
                >
                  ✕ Kapat
                </button>

                <div>
                  <span className="text-[10px] bg-primary-100 text-primary-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Su Kuyusu Detayı & GPS</span>
                  <h2 className="text-xl font-bold text-gray-900 mt-2">⛲ {selectedWell.name}</h2>
                </div>

                {/* Simulated Interactive Map */}
                <div className="h-48 w-full bg-slate-100 rounded-2xl relative overflow-hidden border border-gray-200 flex flex-col justify-center items-center text-center p-4">
                  <div className="text-4xl">📍</div>
                  <div className="mt-2 text-xs font-bold text-gray-800">{selectedWell.location_name}</div>
                  <div className="text-[10px] font-mono text-gray-400 mt-1">
                    Enlem: {selectedWell.latitude} | Boylam: {selectedWell.longitude}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-3 leading-relaxed text-gray-600">
                  <div className="flex justify-between border-b pb-2">
                    <span className="font-bold text-gray-400 uppercase text-[10px]">Kuyu Durumu</span>
                    <span className="font-bold text-gray-900">{selectedWell.status === 'completed' ? 'Tamamlandı / Canlı Su Akıyor' : 'Çalışma Devam Ediyor'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-400 uppercase text-[10px]">Sponsor Bağışçı</span>
                    <span className="font-bold text-gray-900">{getDonorDisplay(selectedWell)}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
