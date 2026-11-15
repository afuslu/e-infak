'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Code2,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  Webhook as WebhookIcon,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { EmptyState, TBody, THead, Table, Tabs, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'

interface ApiKey {
  id: string
  name: string
  key_prefix?: string
  is_active: boolean
  scopes?: string[] | null
  expires_at?: string | null
  last_used_at?: string | null
  created_at: string
}

interface Webhook {
  id: string
  target_url: string
  secret_hint?: string
  secret?: string
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
  ['donation.refunded', 'Bağış İade Edildi (donation.refunded)'],
  ['receipt.created', 'Elle Makbuz Kesildi (receipt.created)'],
  ['donor.created', 'Yeni Bağışçı Kaydı (donor.created)'],
  ['member.dues_paid', 'Aidat Ödendi (member.dues_paid)'],
] as const

const EXPIRY_OPTIONS = [
  ['', 'Süresiz'],
  ['30', '30 Gün'],
  ['90', '90 Gün'],
  ['365', '1 Yıl'],
] as const

function SecretRevealCard({ title, description, value }: { title: string; description: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.ok('Panoya kopyalandı.')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Kopyalama başarısız oldu; lütfen elle seçip kopyalayın.')
    }
  }
  return (
    <Card className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-xs">
      <span className="block w-max rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
        {title}
      </span>
      <p className="text-xs font-semibold leading-relaxed text-slate-700">{description}</p>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 select-all break-all rounded-xl border border-amber-200 bg-white p-2.5 font-mono text-xs font-bold text-slate-900">
          {value}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
        </Button>
      </div>
    </Card>
  )
}

function CodeExampleCard({ title, subtitle, code }: { title: string; subtitle: React.ReactNode; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.ok('Örnek kod kopyalandı.')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Kopyalanamadı.')
    }
  }
  return (
    <Card className="mt-6 space-y-3 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
        </Button>
      </div>
      <p className="text-xs text-slate-600">{subtitle}</p>
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-100">{code}</pre>
    </Card>
  )
}

function getExpiryStatus(expiresAt?: string | null): { label: string; tone: 'emerald' | 'amber' | 'rose' | 'slate' } {
  if (!expiresAt) return { label: 'Süresiz', tone: 'slate' }
  const ms = new Date(expiresAt).getTime() - Date.now()
  const dateText = new Date(expiresAt).toLocaleDateString('tr-TR')
  if (ms <= 0) return { label: `Doldu (${dateText})`, tone: 'rose' }
  if (ms <= 7 * 86_400_000) return { label: `Yakında (${dateText})`, tone: 'amber' }
  return { label: dateText, tone: 'emerald' }
}

export default function AdminIntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys')

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['donations:read', 'campaigns:read'])
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState<string>('90')
  const [rawToken, setRawToken] = useState('')
  const [generatingKey, setGeneratingKey] = useState(false)

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [targetUrl, setTargetUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['donation.paid'])
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [keysRes, hooksRes] = await Promise.all([
        adminGet<ApiKey[]>('/integrations/api-keys'),
        adminGet<Webhook[]>('/integrations/webhooks'),
      ])
      setKeys(keysRes.data)
      setWebhooks(hooksRes.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Entegrasyon bilgileri yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim() || generatingKey) return
    if (newKeyScopes.length === 0) {
      toast.error('En az bir yetki kapsamı (scope) seçin.')
      return
    }

    setGeneratingKey(true)
    setRawToken('')
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

  const handleDeleteKey = async (keyId: string) => {
    const ok = await confirmDialog({
      title: 'API anahtarı iptal edilsin mi?',
      text: 'Bu anahtarı kullanan dış servislerin erişimi anında kesilecektir.',
      confirmLabel: 'İptal Et',
      danger: true,
    })
    if (!ok) return
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
    if (!targetUrl.trim() || creatingWebhook) return
    if (selectedEvents.length === 0) {
      toast.error('En az bir webhook olayı seçin.')
      return
    }

    setCreatingWebhook(true)
    setWebhookSecret('')
    try {
      const res = await adminSend<Webhook>('post', '/integrations/webhooks', {
        target_url: targetUrl.trim(),
        subscribed_events: selectedEvents,
      })
      const { secret, ...hook } = res.data
      setWebhooks((prev) => [...prev, hook])
      setWebhookSecret(secret || '')
      setTargetUrl('')
      toast.ok('Webhook başarıyla eklendi!')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Webhook eklenemedi.'))
    } finally {
      setCreatingWebhook(false)
    }
  }

  const handleDeleteWebhook = async (hookId: string) => {
    const ok = await confirmDialog({
      title: 'Webhook kaydı silinsin mi?',
      text: 'Bu hedef URL adresine artık olay bildirimi gönderilmeyecek.',
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return
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

  const activeKeysCount = keys.filter((k) => k.is_active && (!k.expires_at || new Date(k.expires_at).getTime() > Date.now())).length
  const activeWebhooksCount = webhooks.filter((h) => h.is_active).length
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://alanadiniz.org'

  const publicApiCurl = `# Kampanyaları listele (campaigns:read)
curl -H "X-API-Key: infak_..." ${origin}/api/v1/public-api/campaigns

# Onaylı bağışları listele (donations:read)
curl -H "X-API-Key: infak_..." ${origin}/api/v1/public-api/donations?limit=25

# Dış sistemden bağış kaydı oluştur (donations:write)
curl -X POST ${origin}/api/v1/public-api/donations \\
  -H "X-API-Key: infak_..." -H "Content-Type: application/json" \\
  -d '{"donor_name":"Ahmet Yılmaz","amount_cents":50000,"currency":"TRY"}'`

  const webhookVerifySnippet = `// Node.js Express — X-EInfak-Signature HMAC-SHA256 Doğrulama
import crypto from 'node:crypto'

const signature = req.header('X-EInfak-Signature') // sha256=...
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.E_INFAK_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex')

const isValid = crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expected))`

  const isInsecureHttp = targetUrl.trim().toLowerCase().startsWith('http://')

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Geliştirici & Dış Sistemler"
        title="API & Webhook Entegrasyonları"
        meta="Kapsam (scope) bazlı API anahtarları üretin ve bağış/makbuz olaylarını HMAC-SHA256 imzalı webhook hedeflerine aktarın."
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <GlobalStatCard
          title="Aktif API Anahtarı"
          value={activeKeysCount}
          subtitle={`${keys.length} toplam kayıtlı anahtar`}
          gradient="from-emerald-500 to-teal-600"
          icon={<KeyRound className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Aktif Webhook"
          value={activeWebhooksCount}
          subtitle={`${webhooks.length} toplam hedef URL`}
          gradient="from-blue-500 to-indigo-600"
          icon={<WebhookIcon className="h-4 w-4" />}
        />
        <GlobalStatCard
          title="Güvenlik & İmza"
          value="HMAC-SHA256"
          subtitle="X-API-Key & X-EInfak-Signature"
          gradient="from-slate-600 to-slate-800"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <Tabs
        tabs={[
          { key: 'keys' as const, label: 'API Anahtarları', icon: KeyRound, count: keys.length },
          { key: 'webhooks' as const, label: 'Webhook Ayarları', icon: WebhookIcon, count: webhooks.length },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'keys' ? (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Shield className="h-4 w-4 text-emerald-600" />
                <h2 className="text-base font-black text-slate-900">Yeni API Anahtarı Oluştur</h2>
              </div>
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <Label label="Anahtar Tanımlayıcı İsmi *">
                  <Input
                    type="text"
                    placeholder="Örn: Mobil Uygulama Servisi"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                  />
                </Label>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Yetki Kapsamları (Scopes) *</label>
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    {SCOPE_OPTIONS.map(([code, label]) => (
                      <label key={code} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <input type="checkbox" checked={newKeyScopes.includes(code)} onChange={() => toggleScope(code)} />
                        <span className="font-medium">{label}</span>
                        <code className="ms-auto rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-200/70">
                          {code}
                        </code>
                      </label>
                    ))}
                  </div>
                </div>
                <Label label="Geçerlilik Süresi">
                  <select value={newKeyExpiryDays} onChange={(e) => setNewKeyExpiryDays(e.target.value)} className={inputClass}>
                    {EXPIRY_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Label>
                <Button type="submit" disabled={generatingKey} className="w-full">
                  <Plus className="h-3.5 w-3.5" />
                  {generatingKey ? 'Üretiliyor...' : 'Anahtar Oluştur'}
                </Button>
              </form>
            </Card>

            {rawToken && (
              <SecretRevealCard
                title="Önemli Güvenlik Uyarısı"
                description="API Anahtarınız oluşturuldu. Güvenlik nedeniyle bir daha görüntülenemez — lütfen şimdi kopyalayın."
                value={rawToken}
              />
            )}
          </div>

          <div className="lg:col-span-7">
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">Kayıtlı API Anahtarları</h2>
              {loading ? (
                <div className="space-y-2.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : keys.length === 0 ? (
                <EmptyState
                  icon={KeyRound}
                  title="Kayıtlı API anahtarı yok"
                  text="Sol taraftaki formu kullanarak dış sistemler için scope bazlı API anahtarı oluşturabilirsiniz."
                />
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
                      {keys.map((k) => {
                        const exp = getExpiryStatus(k.expires_at)
                        const expTone =
                          exp.tone === 'rose'
                            ? 'bg-rose-100 text-rose-700'
                            : exp.tone === 'amber'
                              ? 'bg-amber-100 text-amber-800'
                              : exp.tone === 'emerald'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                        return (
                          <Tr key={k.id} className="hover:bg-slate-50/70">
                            <Td>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">{k.name}</span>
                                {k.key_prefix && (
                                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                    {k.key_prefix}
                                  </code>
                                )}
                              </div>
                              {Array.isArray(k.scopes) && k.scopes.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {k.scopes.map((s) => (
                                    <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </Td>
                            <Td className="text-xs text-slate-500">
                              {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('tr-TR') : 'Hiç kullanılmadı'}
                            </Td>
                            <Td>
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${expTone}`}>
                                {exp.label}
                              </span>
                            </Td>
                            <Td className="text-right">
                              <Button type="button" variant="danger" size="sm" onClick={() => handleDeleteKey(k.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>İptal Et</span>
                              </Button>
                            </Td>
                          </Tr>
                        )
                      })}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>

            <CodeExampleCard
              title="Hızlı API Kullanım Örneği (Public API)"
              subtitle={
                <>
                  Ürettiğiniz anahtarı <code className="rounded bg-slate-100 px-1">X-API-Key</code> başlığıyla{' '}
                  <code className="rounded bg-slate-100 px-1">/api/v1/public-api/...</code> uç noktalarına gönderebilirsiniz:
                </>
              }
              code={publicApiCurl}
            />
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <WebhookIcon className="h-4 w-4 text-emerald-600" />
                <h2 className="text-base font-black text-slate-900">Yeni Webhook Ekle</h2>
              </div>
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <Label
                  label="Hedef URL (Target HTTP POST) *"
                  hint={isInsecureHttp ? 'Canlı sistemlerde HTTPS adresi kullanmanız önerilir.' : undefined}
                >
                  <Input
                    type="url"
                    placeholder="https://api.sisteminiz.com/infak-receiver"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    required
                  />
                </Label>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Dinlenecek Olaylar *</label>
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    {WEBHOOK_EVENTS.map(([code, label]) => (
                      <label key={code} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <input type="checkbox" checked={selectedEvents.includes(code)} onChange={() => toggleEvent(code)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={creatingWebhook} className="w-full">
                  <Plus className="h-3.5 w-3.5" />
                  {creatingWebhook ? 'Ekleniyor...' : 'Webhook Kaydet'}
                </Button>
              </form>
            </Card>

            {webhookSecret && (
              <SecretRevealCard
                title="İmza Sırrı (Signing Secret)"
                description="İmza sırrı oluşturuldu; bir daha gösterilmez. Alıcı sistem her isteğin X-EInfak-Signature başlığını bu sırla HMAC-SHA256 olarak doğrulamalıdır."
                value={webhookSecret}
              />
            )}
          </div>

          <div className="lg:col-span-7">
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">Aktif Webhook Hedefleri</h2>
              {loading ? (
                <div className="space-y-2.5">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : webhooks.length === 0 ? (
                <EmptyState
                  icon={WebhookIcon}
                  title="Kayıtlı webhook hedefi yok"
                  text="Bağış ve makbuz olaylarını gerçek zamanlı almak için sol taraftan bir hedef URL ekleyin."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Hedef URL &amp; Olaylar</Th>
                        <Th>İmza Sırrı</Th>
                        <Th>Durum</Th>
                        <Th className="text-right">İşlem</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {webhooks.map((h) => (
                        <Tr key={h.id} className="hover:bg-slate-50/70">
                          <Td>
                            <div className="max-w-xs break-all font-semibold text-slate-900">{h.target_url}</div>
                            {h.subscribed_events && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {h.subscribed_events
                                  .split(',')
                                  .filter(Boolean)
                                  .map((ev) => (
                                    <span key={ev} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700">
                                      {ev.trim()}
                                    </span>
                                  ))}
                              </div>
                            )}
                          </Td>
                          <Td className="font-mono text-[10px] text-slate-500">{h.secret_hint}</Td>
                          <Td>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                h.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {h.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <Button type="button" variant="danger" size="sm" onClick={() => handleDeleteWebhook(h.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Sil</span>
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>

            <CodeExampleCard
              title="Webhook İmza Doğrulama (HMAC-SHA256)"
              subtitle={
                <>
                  Her webhook POST isteğinde gönderilen <code className="rounded bg-slate-100 px-1">X-EInfak-Signature</code> başlığını
                  ham istek gövdesi (<code className="rounded bg-slate-100 px-1">rawBody</code>) ile doğrulayın:
                </>
              }
              code={webhookVerifySnippet}
            />
          </div>
        </div>
      )}
    </div>
  )
}
