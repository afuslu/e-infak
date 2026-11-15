'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader, GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Tabs, confirmDialog, toast } from '../../../../components/admin/ui'

interface Field {
  key: string
  label: string
  secret: boolean
  optional: boolean
  choices: Record<string, string> | null
}

interface ProviderInfo {
  key: string
  label: string
  note: string | null
  fields: Field[]
  values: Record<string, string | null>
  configured: boolean
}

interface Accounts {
  encryption_ready: boolean
  live_payments_enabled: boolean
  payment_provider: string
  sms_provider: string
  sms_platform_fallback: boolean
  payment_providers: ProviderInfo[]
  sms_providers: ProviderInfo[]
  urls: { paytr_notify: string; vakifkatilim_return?: string }
}

function CopyUrlBox({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.ok('Adres panoya kopyalandı.')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Kopyalanamadı.')
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
      <div className="min-w-0 flex-1">
        <span className="font-bold">{label}: </span>
        <code className="break-all font-mono text-[11px]">{url}</code>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
      </Button>
    </div>
  )
}

function buildInitialValues(provider: ProviderInfo): Record<string, string> {
  return Object.fromEntries(provider.fields.map((f) => [f.key, f.secret ? '' : provider.values[f.key] || '']))
}

function ProviderForm({
  provider,
  active,
  expanded,
  encryptionReady,
  onToggle,
  onSaved,
  onDeleted,
  onActivate,
  extra,
}: {
  provider: ProviderInfo
  active: boolean
  expanded: boolean
  encryptionReady: boolean
  onToggle: () => void
  onSaved: (p: ProviderInfo) => void
  onDeleted: (p: ProviderInfo) => void
  onActivate: () => void
  extra?: React.ReactNode
}) {
  const baseline = useMemo(() => buildInitialValues(provider), [provider])
  const [form, setForm] = useState<Record<string, string>>(baseline)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setForm(baseline)
  }, [baseline])

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])

  const envVal = provider.values.mode || provider.values.environment || provider.values.env || ''
  const isLiveMode = envVal === 'live' || envVal === 'prod' || envVal === 'production'
  const isTestMode = envVal === 'test' || envVal === 'sandbox'

  const save = async () => {
    if (!encryptionReady) {
      toast.error('Sunucuda şifreleme anahtarı tanımlı değil; bilgiler kaydedilemez.')
      return
    }
    const missing = provider.fields.find((f) => {
      if (f.optional) return false
      const val = (form[f.key] || '').trim()
      if (val) return false
      return !(f.secret && provider.values[f.key])
    })
    if (missing) {
      toast.error(`Lütfen zorunlu alanı doldurun: ${missing.label}`)
      return
    }

    setBusy(true)
    try {
      const res = await adminSend<ProviderInfo>('put', `/provider-accounts/${provider.key}`, { values: form })
      onSaved(res.data)
      setForm(buildInitialValues(res.data))
      toast.ok(`${provider.label} bilgileri şifreli olarak kaydedildi.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const ok = await confirmDialog({
      title: `“${provider.label}” bilgileri silinsin mi?`,
      text: 'Kayıtlı API anahtarları ve hesap bilgileri kalıcı olarak temizlenecek.',
      confirmLabel: 'Bağlantıyı Kaldır',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await adminSend<ProviderInfo>('delete', `/provider-accounts/${provider.key}`)
      onDeleted(res.data)
      setForm(Object.fromEntries(res.data.fields.map((f) => [f.key, ''])))
      toast.ok(`${provider.label} hesap bilgileri temizlendi.`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Silinemedi'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`rounded-2xl border transition ${
        active ? 'border-emerald-500/70 bg-emerald-50/25 shadow-xs' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">{provider.label}</h3>
              {isLiveMode && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Canlı</span>
              )}
              {isTestMode && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Test</span>
              )}
              {isDirty && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Kaydedilmemiş değişiklik</span>
              )}
            </div>
            {provider.note && expanded && <p className="mt-0.5 text-xs text-slate-500">{provider.note}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              provider.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {provider.configured ? 'Bilgiler girildi' : 'Bilgi yok'}
          </span>
          {active ? (
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">Kullanılıyor</span>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!provider.configured}
              onClick={onActivate}
              title={provider.configured ? 'Bu sağlayıcıyı aktif yap' : 'Önce bilgileri kaydedin'}
            >
              Bunu Kullan
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4 pt-3">
          <div className="grid gap-3.5 sm:grid-cols-2">
            {provider.fields.map((field) => (
              <Label
                key={field.key}
                label={`${field.label}${field.optional ? ' (isteğe bağlı)' : ' *'}`}
                hint={
                  field.secret && provider.values[field.key]
                    ? `Kayıtlı (${provider.values[field.key]}). Değiştirmek için yenisini yazın.`
                    : undefined
                }
              >
                {field.choices ? (
                  <select
                    className={inputClass}
                    value={form[field.key] || ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  >
                    <option value="">Seçin</option>
                    {Object.entries(field.choices).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : field.secret ? (
                  <div className="relative">
                    <Input
                      className="pr-9"
                      type={revealed[field.key] ? 'text' : 'password'}
                      autoComplete="off"
                      value={form[field.key] || ''}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setRevealed((r) => ({ ...r, [field.key]: !r[field.key] }))}
                      aria-label={revealed[field.key] ? 'Gizle' : 'Göster'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {revealed[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <Input
                    type="text"
                    autoComplete="off"
                    value={form[field.key] || ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                )}
              </Label>
            ))}
          </div>
          {extra}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={busy || !encryptionReady} onClick={save}>
                <Save className="h-3.5 w-3.5" />
                {busy ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
              {isDirty && (
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setForm(baseline)}>
                  Vazgeç
                </Button>
              )}
            </div>
            {provider.configured && !active && (
              <Button type="button" variant="danger" size="sm" disabled={busy} onClick={remove}>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Bağlantıyı Kaldır</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PaymentSmsAccountsPage() {
  const [data, setData] = useState<Accounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'payment' | 'sms'>('payment')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<Accounts>('/provider-accounts')
      setData(res.data)
      setExpandedKey((prev) => prev || res.data.payment_provider)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Ödeme ve SMS hesap bilgileri yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const replace = (list: 'payment_providers' | 'sms_providers', updated: ProviderInfo) => {
    if (!data) return
    setData({ ...data, [list]: data[list].map((p) => (p.key === updated.key ? updated : p)) })
  }

  const select = async (kind: 'payment_provider' | 'sms_provider', key: string) => {
    if (!data) return
    try {
      const res = await adminSend<{ payment_provider: string; sms_provider: string }>('post', '/provider-accounts/selection', {
        [kind]: key,
      })
      setData({ ...data, ...res.data })
      toast.ok('Aktif sağlayıcı güncellendi.')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const sendTest = async () => {
    const digits = testPhone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Geçerli bir cep telefonu numarası girin (en az 10 hane).')
      return
    }
    setTesting(true)
    try {
      const res = await adminSend<{ provider?: string; reference?: string }>('post', '/provider-accounts/sms-test', { phone: testPhone })
      const meta = [res.data?.provider, res.data?.reference && `Ref: ${res.data.reference}`].filter(Boolean).join(' · ')
      toast.ok(meta ? `Deneme SMS’i gönderildi (${meta}).` : 'Deneme SMS’i gönderildi.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'SMS gönderilemedi'))
    } finally {
      setTesting(false)
    }
  }

  const ownPayment = data?.payment_providers.find((p) => p.key === data.payment_provider)
  const ownSms = data?.sms_providers.find((p) => p.key === data.sms_provider)
  const testPhoneDigits = testPhone.replace(/\D/g, '')

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Finans & İletişim Altyapısı"
        title="Ödeme & SMS Hesapları"
        meta="Sanal POS ve SMS sağlayıcı API bilgileri şifrelenerek saklanır; gizli anahtarlar bu ekranda tekrar gösterilmez."
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={loadAccounts} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      {data && !data.encryption_ready && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
          <span>Sunucuda şifreleme anahtarı tanımlı değil; hesap bilgileri kaydedilemez. Platform yöneticisine bildirin.</span>
        </div>
      )}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlobalStatCard
            title="Aktif Sanal POS"
            value={ownPayment?.label || data.payment_provider}
            subtitle={ownPayment?.configured ? 'Bilgiler tanımlı' : 'Kurulum bekliyor'}
            gradient={ownPayment?.configured ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600'}
            icon={<CreditCard className="h-4 w-4" />}
          />
          <GlobalStatCard
            title="Aktif SMS Sağlayıcısı"
            value={ownSms?.label || data.sms_provider}
            subtitle={
              ownSms?.configured
                ? 'Kurum hesabından gönderiliyor'
                : data.sms_platform_fallback
                  ? 'Platform yedeği aktif'
                  : 'Tanımlı değil'
            }
            gradient={ownSms?.configured ? 'from-emerald-500 to-teal-600' : 'from-slate-500 to-slate-700'}
            icon={<MessageSquare className="h-4 w-4" />}
          />
          <GlobalStatCard
            title="Ödeme Ortamı"
            value={data.live_payments_enabled ? 'Canlı Açık' : 'Test Modu'}
            subtitle={data.live_payments_enabled ? 'Gerçek tahsilat etkin' : 'Platform test modu kullanılıyor'}
            gradient={data.live_payments_enabled ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600'}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <GlobalStatCard
            title="Şifreleme Kasası"
            value={data.encryption_ready ? 'Hazır' : 'Anahtar Eksik'}
            subtitle={data.encryption_ready ? 'AES/Fernet şifreli saklama' : 'Kayıt devre dışı'}
            gradient={data.encryption_ready ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600'}
            icon={<Lock className="h-4 w-4" />}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200/80 bg-white p-4" />
          ))}
        </div>
      )}

      {data && (
        <>
          <Tabs
            tabs={[
              {
                key: 'payment' as const,
                label: 'Ödeme Sağlayıcıları (POS)',
                icon: CreditCard,
                count: data.payment_providers.filter((p) => p.configured).length,
              },
              {
                key: 'sms' as const,
                label: 'SMS Sağlayıcıları',
                icon: MessageSquare,
                count: data.sms_providers.filter((p) => p.configured).length,
              },
            ]}
            value={tab}
            onChange={(next) => {
              setTab(next)
              setExpandedKey(next === 'payment' ? data.payment_provider : data.sms_provider)
            }}
          />

          {tab === 'payment' && (
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <div>
                <h2 className="text-base font-black text-slate-900">Kartla Bağış (Sanal POS Sağlayıcısı)</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Bağışçı kart bilgisini her zaman banka veya ödeme kuruluşunun sayfasına girer; sistem üzerinden kart bilgisi geçmez.
                  {!data.live_payments_enabled && ' Platformda canlı ödeme henüz açılmadı: “Canlı” seçilse bile test ortamı kullanılır.'}
                </p>
              </div>
              <div className="space-y-3">
                {data.payment_providers.map((provider) => (
                  <ProviderForm
                    key={provider.key}
                    provider={provider}
                    active={data.payment_provider === provider.key}
                    expanded={expandedKey === provider.key}
                    encryptionReady={data.encryption_ready}
                    onToggle={() => setExpandedKey((k) => (k === provider.key ? null : provider.key))}
                    onSaved={(p) => replace('payment_providers', p)}
                    onDeleted={(p) => replace('payment_providers', p)}
                    onActivate={() => select('payment_provider', provider.key)}
                    extra={
                      provider.key === 'paytr' ? (
                        <div className="mt-3">
                          <CopyUrlBox label="PayTR Bildirim URL" url={data.urls.paytr_notify} />
                        </div>
                      ) : provider.key === 'vakifkatilim' ? (
                        <div className="mt-3 space-y-2">
                          {data.urls.vakifkatilim_return && (
                            <CopyUrlBox label="Banka dönüş adresi (otomatik gönderilir)" url={data.urls.vakifkatilim_return} />
                          )}
                          <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
                            <p>Sunucu IP adresi bankada tanımlı olmalı; aksi halde ödeme doğrulama ve iade çalışmaz.</p>
                            <p>Ödeme sonucu her zaman bankaya sorularak doğrulanır. Test ortamı yoktur; ortamı “Canlı” seçin.</p>
                          </div>
                        </div>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </Card>
          )}

          {tab === 'sms' && (
            <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <div>
                <h2 className="text-base font-black text-slate-900">SMS Sağlayıcısı &amp; Başlık Ayarları</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {ownSms?.configured
                    ? `SMS’leriniz ${ownSms.label} hesabınızdan gönderiliyor.`
                    : data.sms_platform_fallback
                      ? 'Kendi SMS hesabınız girilene kadar SMS’ler platform hesabından gönderilir.'
                      : 'SMS hesabı girilmediği için SMS gönderilmiyor.'}
                </p>
              </div>
              <div className="space-y-3">
                {data.sms_providers.map((provider) => (
                  <ProviderForm
                    key={provider.key}
                    provider={provider}
                    active={data.sms_provider === provider.key}
                    expanded={expandedKey === provider.key}
                    encryptionReady={data.encryption_ready}
                    onToggle={() => setExpandedKey((k) => (k === provider.key ? null : provider.key))}
                    onSaved={(p) => replace('sms_providers', p)}
                    onDeleted={(p) => replace('sms_providers', p)}
                    onActivate={() => select('sms_provider', provider.key)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                <div className="w-64">
                  <Label label="Deneme SMS’i Gönder">
                    <Input placeholder="05xx xxx xx xx" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={testing || testPhoneDigits.length < 10 || !ownSms?.configured}
                  onClick={sendTest}
                >
                  <Send className="h-3.5 w-3.5" />
                  {testing ? 'Gönderiliyor…' : 'Deneme SMS’i Gönder'}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
