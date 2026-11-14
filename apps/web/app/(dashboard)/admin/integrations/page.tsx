'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'
import { adminApiBase, adminAuthHeaders } from '../../../../lib/admin-access'

interface ApiKey {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

interface Webhook {
  id: string
  target_url: string
  secret_ref: string
  subscribed_events: string
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
  const [secretRef, setSecretRef] = useState('')
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = adminApiBase()

  const getAuthHeaders = adminAuthHeaders

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
      toast.error('İşlem başarısız.')
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    if (!(await confirmDialog('Bu API anahtarını iptal etmek istediğinize emin misiniz? Dış servislerin erişimi anında kesilecektir.'))) return
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
    if (!targetUrl.trim() || !secretRef.trim()) return

    setCreatingWebhook(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.post(`${API_BASE}/api/v1/admin-features/integrations/webhooks`, {
        target_url: targetUrl,
        secret_ref: secretRef,
        subscribed_events: ['donation.paid']
      }, { headers })
      
      setWebhooks(prev => [...prev, res.data])
      setTargetUrl('')
      setSecretRef('')
      setSuccessMsg('Webhook başarıyla eklendi!')
    } catch (err) {
      console.error('Failed to create webhook:', err)
    } finally {
      setCreatingWebhook(false)
    }
  }

  const handleDeleteWebhook = async (hookId: string) => {
    if (!(await confirmDialog('Bu Webhook kaydını silmek istediğinize emin misiniz?'))) return
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
      <PageHeader title="Webhook & API Entegrasyonları" />

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          {successMsg}
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('keys')}
          className={`pb-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'keys' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          API Anahtarları (Keys)
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`pb-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${activeTab === 'webhooks' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Webhook Ayarları
        </button>
      </div>

      {activeTab === 'keys' ? (
        <div className="grid lg:grid-cols-12 gap-8 items-start animate-fade-in">
          {/* Left: Create Form & Token display */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Yeni API Anahtarı Oluştur</h2>
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Anahtar Tanımlayıcı İsmi *</label>
                  <input
                    type="text"
                    placeholder="Örn: Mobil Uygulama Servisi"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <Button type="submit" disabled={generatingKey} className="w-full bg-primary-600 text-white font-bold py-2.5 rounded-lg text-xs">
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
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Kayıtlı API Anahtarları</h2>
              {loading ? (
                <p className="text-xs text-gray-400 py-4 text-center">Yükleniyor...</p>
              ) : keys.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Kayıtlı aktif API anahtarı bulunmamaktadır.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Anahtar İsmi</Th>
                        <Th>Oluşturma Tarihi</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {keys.map((k) => (
                        <Tr key={k.id} className="hover:bg-gray-50/50">
                          <Td className="font-semibold text-gray-900">{k.name}</Td>
                          <Td className="text-gray-400 font-bold">
                            {new Date(k.created_at).toLocaleDateString('tr-TR')}
                          </Td>
                          <Td className="text-right">
                            <button
                              onClick={() => handleDeleteKey(k.id)}
                              className="text-red-600 hover:text-red-700 text-xs font-bold"
                            >
                              İptal Et
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
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
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Yeni Webhook Ekle</h2>
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-600">Hedef URL (Target HTTP POST) *</label>
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
                  <label className="mb-1 block text-xs font-bold text-gray-600">Secret Store Referansı *</label>
                  <input
                    type="text"
                    placeholder="Örn: env:EINFAK_WEBHOOK_KURUM"
                    value={secretRef}
                    onChange={(e) => setSecretRef(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <Button type="submit" disabled={creatingWebhook} className="w-full bg-primary-600 text-white font-bold py-2.5 rounded-lg text-xs">
                  {creatingWebhook ? 'Ekleniyor...' : 'Webhook Kaydet'}
                </Button>
              </form>
            </Card>
          </div>

          {/* Right: Webhooks list */}
          <div className="lg:col-span-7">
            <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Aktif Webhook Hedefleri</h2>
              {loading ? (
                <p className="text-xs text-gray-400 py-4 text-center">Yükleniyor...</p>
              ) : webhooks.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Kayıtlı aktif webhook bulunmamaktadır.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Hedef URL</Th>
                        <Th>Secret Referansı</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {webhooks.map((h) => (
                        <Tr key={h.id} className="hover:bg-gray-50/50">
                          <Td className="font-semibold text-gray-900 break-all max-w-xs">{h.target_url}</Td>
                          <Td className="font-mono text-gray-400 text-[10px]">
                            {h.secret_ref}
                          </Td>
                          <Td className="text-right">
                            <button
                              onClick={() => handleDeleteWebhook(h.id)}
                              className="text-red-600 hover:text-red-700 text-xs font-bold"
                            >
                              Sil
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
