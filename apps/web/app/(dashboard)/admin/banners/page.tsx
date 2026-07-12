'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface Banner {
  id: string
  text: string
  bg_color: string
  link_url?: string
  is_active: boolean
  updated_at: string
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null)
  
  // Edit Form State
  const [text, setText] = useState('')
  const [bgColor, setBgColor] = useState('#1b5e20')
  const [linkUrl, setLinkUrl] = useState('')
  const [isActive, setIsActive] = useState(false)
  
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

  const loadBanners = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/banners`, { headers })
      setBanners(res.data)
      if (res.data.length > 0) {
        setSelectedBanner(res.data[0])
        setText(res.data[0].text)
        setBgColor(res.data[0].bg_color)
        setLinkUrl(res.data[0].link_url || '')
        setIsActive(res.data[0].is_active)
      }
    } catch (err) {
      console.error('Failed to load banners:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBanners()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBanner || !text.trim()) return

    setSaving(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.put(`${API_BASE}/api/v1/admin-features/banners/${selectedBanner.id}`, {
        text,
        bg_color: bgColor,
        link_url: linkUrl,
        is_active: isActive
      }, { headers })
      
      setSuccessMsg('Duyuru bannerı başarıyla güncellendi!')
      setBanners(prev => prev.map(b => b.id === selectedBanner.id ? res.data : b))
      setSelectedBanner(res.data)
    } catch (err) {
      console.error('Failed to save banner:', err)
      alert('Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Duyuru & Kampanya Banner Yönetimi</h1>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Selector */}
          <div className="lg:col-span-4 space-y-3">
            <Card className="p-4 border border-gray-100 shadow-sm space-y-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Yayın Kanalları</span>
              {banners.map(b => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBanner(b)
                    setText(b.text)
                    setBgColor(b.bg_color)
                    setLinkUrl(b.link_url || '')
                    setIsActive(b.is_active)
                    setSuccessMsg('')
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border text-xs font-bold transition-all block ${selectedBanner?.id === b.id ? 'border-primary-600 bg-primary-50/50 text-primary-900' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                >
                  <div className="flex justify-between items-center">
                    <span>📢 Üst Duyuru Şeridi</span>
                    <span className={`h-2 w-2 rounded-full ${b.is_active ? 'bg-green-600' : 'bg-gray-300'}`} />
                  </div>
                </button>
              ))}
            </Card>
          </div>

          {/* Right: Form Editor */}
          {selectedBanner && (
            <div className="lg:col-span-8 space-y-6">
              <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="border-b pb-2 flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900">Duyuru İçeriğini Düzenle</h2>
                  <span className="text-[10px] text-gray-400 font-bold">
                    Güncelleme: {new Date(selectedBanner.updated_at).toLocaleString('tr-TR')}
                  </span>
                </div>

                {/* Banner Live Preview Simulation */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Canlı Önizleme Simülasyonu</span>
                  <div 
                    style={{ backgroundColor: bgColor }}
                    className="p-3.5 rounded-xl text-xs font-bold text-white text-center leading-relaxed shadow-sm transition-all duration-300"
                  >
                    {text || 'Duyuru metni buraya gelecek...'} {linkUrl && <span className="underline ml-2 cursor-pointer font-bold">Detay ➔</span>}
                  </div>
                </div>

                <form onSubmit={handleSave} className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Duyuru Metni *</label>
                      <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Arka Plan Rengi (Hex/CSS) *</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="h-9 w-10 border rounded-lg cursor-pointer p-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs outline-none focus:border-primary-500 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Duyuru Yönlendirme Linki (URL)</label>
                      <input
                        type="text"
                        placeholder="Örn: /kampanyalar/afrika-su-kuyusu"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <label className="block text-xs font-bold text-gray-800">Duyuru Aktif mi?</label>
                      <span className="text-[10px] text-gray-400 block">Kapatıldığında tüm web sitelerinden şerit kaybolur</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-5 w-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={saving}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
                    >
                      {saving ? 'Kaydediliyor...' : 'Yayınla / Kaydet'}
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
