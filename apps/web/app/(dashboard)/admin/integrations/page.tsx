'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface ApiKey {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

interface Webhook {
  id: string
  target_url: string
  secret_token: string
  is_active: boolean
}

export default function AdminIntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys')
  
  // API keys state
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [rawToken, setRawToken] = useState('')
  const [generatingKey, setGeneratingKey] = useState(false)
  
  // Webhooks state
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [targetUrl, setTargetUrl] = useState('')
  const [secretToken, setSecretToken] = useState('')
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadData = async () => {
    setLoading(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      if (activeTab === 'keys') {
        const res = await axios.get(`${API_BASE}/api/v1/admin-features/integrations/api-keys`, { headers })
        setKeys(res.data)
      } else {
        const res = await axios.get(`${API_BASE}/api/v1/admin-features/integrations/webhooks`, { headers })
        setWebhooks(res.data)
      }
    } catch (err) {
      console.error('Failed to load integrations data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return

    setGeneratingKey(true)
    setRawToken('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/integrations/api-keys`, {
        name: newKeyName
      }, { headers })
      
      setRawToken(res.data.raw_token)
      setNewKeyName('')
      setSuccessMsg('API Anahtarı başarıyla oluşturuldu!')
      loadData()
    } catch (err) {
      console.error('Failed to generate key:', err)
      alert('İşlem başarısız.')
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Bu API anahtarını iptal etmek istediğinize emin misiniz? Dış servislerin erişimi anında kesilecektir.')) return
    try {
      const headers = getAuthHeaders()
      await axios.delete(`${API_BASE}/api/v1/admin-features/integrations/api-keys/${keyId}`, { headers })
      setSuccessMsg('API Anahtarı iptal edildi.')
      setKeys(prev => prev.filter(k => k.id !== keyId))
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUrl.trim() || !secretToken.trim()) return

    setCreatingWebhook(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/integrations/webhooks`, {
        target_url: targetUrl,
        secret_token: secretToken
      }, { headers })
      
      setWebhooks(prev => [...prev, res.data])
      setTargetUrl('')
      setSecretToken('')
      setSuccessMsg('Webhook başarıyla eklendi!')
    } catch (err) {
      console.error('Failed to create webhook:', err)
    } finally {
      setCreatingWebhook(false)
    }
  }

  const handleDeleteWebhook = async (hookId: string) => {
    if (!confirm('Bu Webhook kaydını silmek istediğinize emin misiniz?')) return
    try {
      const headers = getAuthHeaders()
      await axios.delete(`${API_BASE}/api/v1/admin-features/integrations/webhooks/${hookId}`, { headers })
      setSuccessMsg('Webhook silindi.')
      setWebhooks(prev => prev.filter(h => h.id !== hookId))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Webhook & API Entegrasyonları</h1>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('keys')}
          className={`pb-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'keys' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          🔑 API Anahtarları (Keys)
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`pb-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'webhooks' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          🔌 Webhook Ayarları
        </button>
      </div>

      {activeTab === 'keys' ? (
        <div className="grid lg:grid-cols-12 gap-8 items-start animate-fade-in">
          {/* Left: Create Form & Token display */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400">Yeni API Anahtarı Oluştur</h2>
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Anahtar Tanımlayıcı İsmi *</label>
                  <input
                    type="text"
                    placeholder="Örn: Mobil Uygulama Servisi"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <Button type="submit" disabled={generatingKey} className="w-full bg-primary-600 text-white font-bold py-2.5 rounded-lg text-xs uppercase">
                  {generatingKey ? 'Üretiliyor...' : 'Anahtar Oluştur'}
                </Button>
              </form>
            </Card>

            {/* Display raw key once! */}
            {rawToken && (
              <Card className="p-6 border border-yellow-200 bg-yellow-50/50 shadow-sm space-y-3">
                <span className="text-[10px] bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider block w-max">Önemli Güvenlik Uyarısı</span>
                <p className="text-xs text-gray-700 leading-relaxed font-semibold">
                  API Anahtarınız aşağıda oluşturulmuştur. Bu anahtarı bir daha görüntüleyemeyeceksiniz. Lütfen şimdi kopyalayın!
                </p>
                <div className="p-3 bg-white rounded-lg border font-mono text-xs select-all text-gray-900 font-bold break-all">
                  {rawToken}
                </div>
              </Card>
            )}
          </div>

          {/* Right: Keys list */}
          <div className="lg:col-span-7">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400">Kayıtlı API Anahtarları</h2>
              {loading ? (
                <p className="text-xs text-gray-400 py-4 text-center">Yükleniyor...</p>
              ) : keys.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Kayıtlı aktif API anahtarı bulunmamaktadır.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead>
                      <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                        <th className="pb-3">Anahtar İsmi</th>
                        <th className="pb-3">Oluşturma Tarihi</th>
                        <th className="pb-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {keys.map((k) => (
                        <tr key={k.id} className="hover:bg-gray-50/50">
                          <td className="py-3 font-semibold text-gray-900">🔑 {k.name}</td>
                          <td className="py-3 text-gray-400 font-bold">
                            {new Date(k.created_at).toLocaleDateString('tr-TR')}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleDeleteKey(k.id)}
                              className="text-red-600 hover:text-red-700 text-xs font-bold"
                            >
                              İptal Et
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
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start animate-fade-in">
          {/* Left: Create webhook form */}
          <div className="lg:col-span-5">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400">Yeni Webhook Ekle</h2>
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Hedef URL (Target HTTP POST) *</label>
                  <input
                    type="url"
                    placeholder="https://api.sisteminiz.com/infak-receiver"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Gizli Token (Secret Key) *</label>
                  <input
                    type="text"
                    placeholder="Örn: webhook_super_secret"
                    value={secretToken}
                    onChange={(e) => setSecretToken(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <Button type="submit" disabled={creatingWebhook} className="w-full bg-primary-600 text-white font-bold py-2.5 rounded-lg text-xs uppercase">
                  {creatingWebhook ? 'Ekleniyor...' : 'Webhook Kaydet'}
                </Button>
              </form>
            </Card>
          </div>

          {/* Right: Webhooks list */}
          <div className="lg:col-span-7">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-gray-900 border-b pb-2 uppercase tracking-wider text-gray-400">Aktif Webhook Hedefleri</h2>
              {loading ? (
                <p className="text-xs text-gray-400 py-4 text-center">Yükleniyor...</p>
              ) : webhooks.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Kayıtlı aktif webhook bulunmamaktadır.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead>
                      <tr className="border-b text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                        <th className="pb-3">Hedef URL</th>
                        <th className="pb-3">Token</th>
                        <th className="pb-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {webhooks.map((h) => (
                        <tr key={h.id} className="hover:bg-gray-50/50">
                          <td className="py-3 font-semibold text-gray-900 break-all max-w-xs">🔌 {h.target_url}</td>
                          <td className="py-3 font-mono text-gray-400 text-[10px]">
                            {h.secret_token.substring(0,4)}****
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleDeleteWebhook(h.id)}
                              className="text-red-600 hover:text-red-700 text-xs font-bold"
                            >
                              Sil
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
        </div>
      )}
    </div>
  )
}
