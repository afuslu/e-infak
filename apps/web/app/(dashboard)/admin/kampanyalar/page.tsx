'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface Campaign {
  id: string
  title: string
  slug: string
  target_cents: number
  collected_cents: number
  status: string
  gallery_urls?: string[]
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  
  // Gallery edit state
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [newImageUrl, setNewImageUrl] = useState('')
  const [savingGallery, setSavingGallery] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/campaigns`, { headers })
      setCampaigns(res.data)
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  const handleOpenGalleryEdit = (camp: Campaign) => {
    setSelectedCampaign(camp)
    setGalleryUrls(camp.gallery_urls || [])
    setNewImageUrl('')
    setSuccessMsg('')
  }

  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return
    setGalleryUrls(prev => [...prev, newImageUrl.trim()])
    setNewImageUrl('')
  }

  const handleRemoveImageUrl = (index: number) => {
    setGalleryUrls(prev => prev.filter((_, idx) => idx !== index))
  }

  const handleSaveGallery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCampaign) return

    setSavingGallery(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      await axios.put(`${API_BASE}/api/v1/admin-features/campaigns/${selectedCampaign.id}/gallery`, {
        gallery_urls: galleryUrls
      }, { headers })
      
      setSuccessMsg('Kampanya görsel galerisi başarıyla güncellendi!')
      setCampaigns(prev => prev.map(c => c.id === selectedCampaign.id ? { ...c, gallery_urls: galleryUrls } : c))
    } catch (err) {
      console.error('Failed to save campaign gallery:', err)
      alert('Galeri güncellenemedi.')
    } finally {
      setSavingGallery(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Kampanya Yönetimi & Galeriler</h1>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Kampanyalar yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Campaigns List */}
          <div className={`${selectedCampaign ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Aktif Kampanyalar</h2>
              <div className="space-y-3">
                {campaigns.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => handleOpenGalleryEdit(c)}
                    className={`flex justify-between items-center p-4 bg-gray-50 rounded-2xl border transition-all cursor-pointer ${selectedCampaign?.id === c.id ? 'border-primary-600 bg-primary-50/20' : 'border-gray-100 hover:bg-gray-100/50'}`}
                  >
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{c.title}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Slug: {c.slug} | Durum: {c.status}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-slate-800">
                        {((c.collected_cents || 0) / 100).toLocaleString('tr-TR')} ₺ / {(c.target_cents / 100).toLocaleString('tr-TR')} ₺
                      </div>
                      <Button size="sm" variant="ghost" className="text-primary-600 font-bold text-[11px] mt-1">
                        Galeri Düzenle ➔
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Gallery Editor Drawer */}
          {selectedCampaign && (
            <div className="lg:col-span-6 space-y-6 animate-fade-in">
              <Card className="p-6 border border-gray-100 shadow-md space-y-6 relative">
                <button 
                  onClick={() => setSelectedCampaign(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-sm font-bold"
                >
                  ✕ Kapat
                </button>

                <div>
                  <span className="text-[10px] bg-primary-100 text-primary-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Kampanya Görsel Galerisi</span>
                  <h2 className="text-xl font-bold text-gray-900 mt-2">{selectedCampaign.title}</h2>
                </div>

                <form onSubmit={handleSaveGallery} className="space-y-4">
                  {/* Add URL Field */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase">Görsel Resim URL'si Ekle</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Örn: https://resim-url.com/foto1.jpg"
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddImageUrl}
                        className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-4 rounded-lg text-xs"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>

                  {/* Visual List of URLs */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase border-b pb-1">Kayıtlı Galeri Görselleri ({galleryUrls.length})</label>
                    {galleryUrls.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Galeride görsel bulunmamaktadır.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 max-h-56 overflow-y-auto pr-1">
                        {galleryUrls.map((url, index) => (
                          <div key={index} className="relative aspect-video rounded-xl overflow-hidden border border-gray-200 group bg-gray-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Gallery ${index}`} className="object-cover w-full h-full" />
                            <button
                              type="button"
                              onClick={() => handleRemoveImageUrl(index)}
                              className="absolute inset-0 bg-red-600/80 text-white font-bold text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Sil
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      type="submit"
                      disabled={savingGallery}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
                    >
                      {savingGallery ? 'Kaydediliyor...' : 'Galeriyi Kaydet'}
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
