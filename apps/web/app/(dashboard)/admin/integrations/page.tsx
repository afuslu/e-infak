'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Shield, Trash2, Webhook as WebhookIcon } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { PageHeader, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'

interface ApiKey {
  id: string
  name: string
  is_active: boolean
  scopes?: string[] | null
  expires_at?: string | null
  last_used_at?: string | null
  created_at: string
}

interface Webhook {
  id: string
  target_url: string
  secret_ref: string
  subscribed_events: string
  is_active: boolean
}

const SCOPE_OPTIONS = [
  ['donations:read', 'Bağışları Oku'],
  ['donations:write', 'Bağış Oluştur / Güncelle'],
  ['campaigns:read', 'Kampanyaları Oku'],
  ['donors:read', 'Bağışçıları Oku'],
  ['reports:read', 'Raporları Oku'],
] as const

const WEBHOOK_EVENTS = [
  ['donation.paid', 'Bağış Onaylandı (donation.paid)'],
  ['donation.failed', 'Bağış Başarısız (donation.failed)'],
  ['donation.refunded', 'Bağış İade Edildi (donation.refunded)'],
  ['kurban.created', 'Kurban Kaydı Oluşturuldu (kurban.created)'],
  ['donor.created', 'Yeni Bağışçı Kaydı (donor.created)'],
] as const

const EXPIRY_OPTIONS = [
  ['', 'Süresiz'],
  ['30', '30 Gün'],
  ['90', '90 Gün'],
  ['365', '1 Yıl'],
] as const

export default function AdminIntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys')

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['donations:read', 'campaigns:read'])
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState<string>('90')
  const [rawToken, setRawToken] = useState('')
  const [copiedToken, setCopiedToken] = useState(false)
  const [generatingKey, setGeneratingKey] = useState(false)

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [targetUrl, setTargetUrl] = useState('')
  const [secretRef, setSecretRef] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['donation.paid'])
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'keys') {
        const res = await adminGet<ApiKey[]>('/integrations/api-keys')
        setKeys(res.data)
      } else {
        const res = await adminGet<Webhook[]>('/integrations/webhooks')
        setWebhooks(res.data)
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Entegrasyon bilgileri yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim() || generatingKey) return

    setGeneratingKey(true)
    setRawToken('')
    setCopiedToken(false)
    try {
      const expiresAt = newKeyExpiryDays
        ? new Date(Date.now() + Number(newKeyExpiryDays) * 86_400_000).toISOString()
        : null
      const res = await adminSend<{ raw_token: string }>('post', '/integrations/api-keys', {
        name: newKeyName.trim(),
        scopes: newKeyScopes,
        expires_at: expiresAt,
      })
      setRawToken(res.data.raw_token)
      setNewKeyName('')
      toast.ok('API Anahtarı oluşturuldu!')
      await loadData()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'API Anahtarı oluşturulamadı.'))
    } finally {
      setGeneratingKey(false)
    }
  }

  const handleCopyToken = async () => {
    if (!rawToken) return
    try {
      await navigator.clipboard.writeText(rawToken)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 1800)
    } catch {
      toast.error('Kopyalama başarısız oldu; lütfen elle seçip kopyalayın.')
    }
  }

  const handleDeleteKey = async (keyId: string) => {
    if (!(await confirmDialog('Bu API anahtarını iptal etmek istediğinize emin misiniz? Dış servislerin erişimi anında kesilecektir.'))) return
    try {
      await adminSend('delete', `/integrations/api-keys/${keyId}`)
      toast.ok('API Anahtarı iptal edildi.')
      setKeys((prev) => prev.filter((k) => k.id !== keyId))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'API Anahtarı iptal edilemedi.'))
    }
  }

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUrl.trim() || !secretRef.trim() || creatingWebhook) return
    if (selectedEvents.length === 0) {
      toast.error('En az bir webhook olayı seçin.')
      return
    }

    setCreatingWebhook(true)
    try {
      const res = await adminSend<Webhook>('post', '/integrations/webhooks', {
        target_url: targetUrl.trim(),
        secret_ref: secretRef.trim(),
        subscribed_events: selectedEvents,
      })
      setWebhooks((prev) => [...prev, res.data])
      setTargetUrl('')
      setSecretRef('')
      toast.ok('Webhook başarıyla eklendi!')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Webhook eklenemedi.'))
    } finally {
      setCreatingWebhook(false)
    }
  }

  const handleDeleteWebhook = async (hookId: string) => {
    if (!(await confirmDialog('Bu Webhook kaydını silmek istediğinize emin misiniz?'))) return
    try {
      await adminSend('delete', `/integrations/webhooks/${hookId}`)
      toast.ok('Webhook silindi.')
      setWebhooks((prev) => prev.filter((h) => h.id !== hookId))
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Webhook silinemedi.'))
    }
  }

  const toggleScope = (scope: string) => {
    setNewKeyScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
  }

  const toggleEvent = (evt: string) => {
    setSelectedEvents((prev) => (prev.includes(evt) ? prev.filter((item) => item !== evt) : [...prev, evt]))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API & Webhook Entegrasyonları"
        description="Dış sistemler için kapsamlı API anahtarları oluşturun ve bağış olaylarını gerçek zamanlı webhook hedeflerine aktarın. (Sanal POS ayarları için Ödeme & SMS Hesapları menüsünü kullanın.)"
      />

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50/80 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('keys')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeTab === 'keys' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
          }`}
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span>API Anahtarları</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('webhooks')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeTab === 'webhooks' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
          }`}
        >
          <WebhookIcon className="h-3.5 w-3.5" />
          <span>Webhook Ayarları</span>
        </button>
      </div>

      {activeTab === 'keys' ? (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b pb-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-bold text-gray-900">Yeni API Anahtarı Oluştur</h2>
              </div>
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-700">Anahtar Tanımlayıcı İsmi *</label>
                  <input
                    type="text"
                    placeholder="Örn: Mobil Uygulama Servisi"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-700">Yetki Kapsamları (Scopes)</label>
                  <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50/70 p-2.5">
                    {SCOPE_OPTIONS.map(([code, label]) => (
                      <label key={code} className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={newKeyScopes.includes(code)}
                          onChange={() => toggleScope(code)}
                        />
                        <span className="font-medium">{label}</span>
                        <code className="ms-auto rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500">{code}</code>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-700">Geçerlilik Süresi</label>
                  <select
                    value={newKeyExpiryDays}
                    onChange={(e) => setNewKeyExpiryDays(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs outline-none focus:border-primary-500"
                  >
                    {EXPIRY_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={generatingKey} className="w-full rounded-lg bg-primary-600 py-2.5 text-xs font-bold text-white hover:bg-primary-700">
                  {generatingKey ? 'Üretiliyor...' : 'Anahtar Oluştur'}
                </Button>
              </form>
            </Card>

            {rawToken && (
              <Card className="space-y-3 border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
                <span className="block w-max rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Önemli Güvenlik Uyarısı
                </span>
                <p className="text-xs font-semibold leading-relaxed text-gray-700">
                  API Anahtarınız oluşturuldu. Güvenlik nedeniyle bir daha görüntülenemez — lütfen şimdi kopyalayın.
                </p>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 select-all break-all rounded-lg border bg-white p-2.5 font-mono text-xs font-bold text-gray-900">
                    {rawToken}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedToken ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
              </Card>
            )}
          </div>

          <div className="lg:col-span-7">
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Kayıtlı API Anahtarları</h2>
              {loading ? (
                <p className="py-4 text-center text-xs text-gray-400">Yükleniyor...</p>
              ) : keys.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">Kayıtlı aktif API anahtarı bulunmamaktadır.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Anahtar &amp; Kapsamlar</Th>
                        <Th>Son Kullanım</Th>
                        <Th>Geçerlilik</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {keys.map((k) => (
                        <Tr key={k.id} className="hover:bg-gray-50/50">
                          <Td>
                            <div className="font-semibold text-gray-900">{k.name}</div>
                            {Array.isArray(k.scopes) && k.scopes.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {k.scopes.map((s) => (
                                  <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">{s}</span>
                                ))}
                              </div>
                            )}
                          </Td>
                          <Td className="text-xs text-gray-500">
                            {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('tr-TR') : 'Hiç kullanılmadı'}
                          </Td>
                          <Td className="text-xs text-gray-500">
                            {k.expires_at ? new Date(k.expires_at).toLocaleDateString('tr-TR') : 'Süresiz'}
                          </Td>
                          <Td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteKey(k.id)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>İptal Et</span>
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
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Yeni Webhook Ekle</h2>
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-700">Hedef URL (Target HTTP POST) *</label>
                  <input
                    type="url"
                    placeholder="https://api.sisteminiz.com/infak-receiver"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-700">Secret Store Referansı *</label>
                  <input
                    type="text"
                    placeholder="Örn: env:EINFAK_WEBHOOK_KURUM"
                    value={secretRef}
                    onChange={(e) => setSecretRef(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-700">Dinlenecek Olaylar *</label>
                  <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50/70 p-2.5">
                    {WEBHOOK_EVENTS.map(([code, label]) => (
                      <label key={code} className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(code)}
                          onChange={() => toggleEvent(code)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={creatingWebhook} className="w-full rounded-lg bg-primary-600 py-2.5 text-xs font-bold text-white hover:bg-primary-700">
                  {creatingWebhook ? 'Ekleniyor...' : 'Webhook Kaydet'}
                </Button>
              </form>
            </Card>
          </div>

          <div className="lg:col-span-7">
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <h2 className="border-b pb-2 text-base font-bold text-gray-900">Aktif Webhook Hedefleri</h2>
              {loading ? (
                <p className="py-4 text-center text-xs text-gray-400">Yükleniyor...</p>
              ) : webhooks.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">Kayıtlı aktif webhook bulunmamaktadır.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Hedef URL &amp; Olaylar</Th>
                        <Th>Secret Referansı</Th>
                        <Th>Durum</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {webhooks.map((h) => (
                        <Tr key={h.id} className="hover:bg-gray-50/50">
                          <Td>
                            <div className="max-w-xs break-all font-semibold text-gray-900">{h.target_url}</div>
                            {h.subscribed_events && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {h.subscribed_events.split(',').filter(Boolean).map((ev) => (
                                  <span key={ev} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700">{ev.trim()}</span>
                                ))}
                              </div>
                            )}
                          </Td>
                          <Td className="font-mono text-[10px] text-gray-500">
                            {h.secret_ref}
                          </Td>
                          <Td>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${h.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                              {h.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteWebhook(h.id)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Sil</span>
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
