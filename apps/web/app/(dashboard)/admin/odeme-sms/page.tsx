'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy, CreditCard, Eye, EyeOff, MessageSquare, Trash2 } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, Notice, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, confirmDialog } from '../../../../components/admin/ui'

interface Field { key: string; label: string; secret: boolean; optional: boolean; choices: Record<string, string> | null }
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
type Message = { type: 'ok' | 'error'; text: string } | null

function CopyUrlBox({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
      <div className="min-w-0 flex-1">
        <span className="font-bold">{label}: </span>
        <code className="break-all font-mono text-[11px]">{url}</code>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
      </button>
    </div>
  )
}

function ProviderForm({
  provider,
  active,
  expanded,
  onToggle,
  onSaved,
  onDeleted,
  onActivate,
  extra,
}: {
  provider: ProviderInfo
  active: boolean
  expanded: boolean
  onToggle: () => void
  onSaved: (p: ProviderInfo) => void
  onDeleted: (p: ProviderInfo) => void
  onActivate: () => void
  extra?: React.ReactNode
}) {
  const initial = () => Object.fromEntries(provider.fields.map((f) => [f.key, f.secret ? '' : provider.values[f.key] || '']))
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)

  const envVal = provider.values.mode || provider.values.environment || provider.values.env || ''
  const isLiveMode = envVal === 'live' || envVal === 'prod' || envVal === 'production'
  const isTestMode = envVal === 'test' || envVal === 'sandbox'

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await adminSend<ProviderInfo>('put', `/provider-accounts/${provider.key}`, { values: form })
      onSaved(res.data)
      setForm(Object.fromEntries(res.data.fields.map((f) => [f.key, f.secret ? '' : res.data.values[f.key] || ''])))
      setMessage({ type: 'ok', text: 'Kaydedildi. Bilgiler şifreli saklanıyor.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kaydedilemedi') })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirmDialog(`“${provider.label}” için kayıtlı hesap bilgileri silinsin mi?`))) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await adminSend<ProviderInfo>('delete', `/provider-accounts/${provider.key}`)
      onDeleted(res.data)
      setForm(Object.fromEntries(res.data.fields.map((f) => [f.key, ''])))
      setMessage({ type: 'ok', text: 'Kayıtlı hesap bilgileri temizlendi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Silinemedi') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-xl border transition ${active ? 'border-primary-500 bg-primary-50/30 shadow-xs' : 'border-gray-200 bg-white'}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-gray-900">{provider.label}</h3>
              {isLiveMode && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Canlı</span>}
              {isTestMode && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Test</span>}
            </div>
            {provider.note && expanded && <p className="mt-0.5 text-xs text-gray-500">{provider.note}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${provider.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {provider.configured ? 'Bilgiler girildi' : 'Bilgi yok'}
          </span>
          {active ? (
            <span className="rounded-full bg-primary-600 px-2.5 py-0.5 text-[11px] font-bold text-white">Kullanılıyor</span>
          ) : (
            <button
              type="button"
              className={ghostButton}
              disabled={!provider.configured}
              onClick={onActivate}
              title={provider.configured ? 'Bu sağlayıcıyı aktif yap' : 'Önce bilgileri kaydedin'}
            >
              Bunu kullan
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {provider.fields.map((field) => (
              <Label
                key={field.key}
                label={`${field.label}${field.optional ? ' (isteğe bağlı)' : ''}`}
                hint={field.secret && provider.values[field.key] ? `Kayıtlı (${provider.values[field.key]}). Değiştirmek için yenisini yazın.` : undefined}
              >
                {field.choices ? (
                  <select className={inputClass} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}>
                    <option value="">Seçin</option>
                    {Object.entries(field.choices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                ) : field.secret ? (
                  <div className="relative">
                    <input
                      className={`${inputClass} pr-9`}
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      {revealed[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <input
                    className={inputClass}
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" className={primaryButton} disabled={busy} onClick={save}>
                {busy ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <Notice message={message} />
            </div>
            {provider.configured && !active && (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Bağlantıyı Kaldır</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PaymentSmsAccountsPage() {
  const [data, setData] = useState<Accounts | null>(null)
  const [tab, setTab] = useState<'payment' | 'sms'>('payment')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    adminGet<Accounts>('/provider-accounts')
      .then((res) => {
        setData(res.data)
        setExpandedKey(res.data.payment_provider)
      })
      .catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Bilgiler yüklenemedi') }))
  }, [])

  if (!data) return <div className="p-6"><Notice message={message} />{!message && <p className="text-sm text-gray-500">Yükleniyor…</p>}</div>

  const replace = (list: 'payment_providers' | 'sms_providers', updated: ProviderInfo) =>
    setData({ ...data, [list]: data[list].map((p) => (p.key === updated.key ? updated : p)) })

  const select = async (kind: 'payment_provider' | 'sms_provider', key: string) => {
    setMessage(null)
    try {
      const res = await adminSend<{ payment_provider: string; sms_provider: string }>('post', '/provider-accounts/selection', { [kind]: key })
      setData({ ...data, ...res.data })
      setMessage({ type: 'ok', text: 'Aktif sağlayıcı değiştirildi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const res = await adminSend<{ provider?: string; reference?: string }>('post', '/provider-accounts/sms-test', { phone: testPhone })
      const meta = [res.data?.provider, res.data?.reference && `Ref: ${res.data.reference}`].filter(Boolean).join(' · ')
      setMessage({ type: 'ok', text: meta ? `Deneme SMS’i gönderildi (${meta}).` : 'Deneme SMS’i gönderildi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'SMS gönderilemedi') })
    } finally {
      setTesting(false)
    }
  }

  const ownPayment = data.payment_providers.find((p) => p.key === data.payment_provider)
  const ownSms = data.sms_providers.find((p) => p.key === data.sms_provider)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Ödeme & SMS Hesapları"
        description={
          <>
            Bağışlar kurumunuzun kendi sanal POS hesabına, SMS’ler kendi SMS firmanız ve başlığınızla gider. Şifreler şifrelenerek saklanır ve bu ekranda tekrar gösterilmez.
          </>
        }
      />
      <Notice message={message} />
      {!data.encryption_ready && (
        <Notice message={{ type: 'error', text: 'Sunucuda şifreleme anahtarı tanımlı değil; hesap bilgileri kaydedilemez. Platform yöneticisine bildirin.' }} />
      )}

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50/80 p-1.5">
        <button
          type="button"
          onClick={() => { setTab('payment'); setExpandedKey(data.payment_provider) }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            tab === 'payment' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span>Ödeme Sağlayıcıları (POS)</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">{ownPayment?.label || data.payment_provider}</span>
        </button>
        <button
          type="button"
          onClick={() => { setTab('sms'); setExpandedKey(data.sms_provider) }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            tab === 'sms' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>SMS Sağlayıcıları</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">{ownSms?.label || data.sms_provider}</span>
        </button>
      </div>

      {tab === 'payment' && (
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Kartla bağış (ödeme sağlayıcısı)</h2>
            <p className="text-sm text-gray-500">
              Bağışçı kart bilgisini her zaman banka veya ödeme kuruluşunun sayfasına girer; sitemizden kart bilgisi geçmez.
              {!data.live_payments_enabled && ' Platformda canlı ödeme henüz açılmadı: “Canlı” seçilse bile test ortamı kullanılır.'}
            </p>
          </div>
          {data.payment_providers.map((provider) => (
            <ProviderForm
              key={provider.key}
              provider={provider}
              active={data.payment_provider === provider.key}
              expanded={expandedKey === provider.key}
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
                    <div className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                      <p>Sunucu IP adresi bankada tanımlı olmalı; aksi halde ödeme doğrulama ve iade çalışmaz.</p>
                      <p>Ödeme sonucu her zaman bankaya sorularak doğrulanır. Test ortamı yoktur; ortamı “Canlı” seçin.</p>
                    </div>
                  </div>
                ) : undefined
              }
            />
          ))}
        </Card>
      )}

      {tab === 'sms' && (
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">SMS firması</h2>
            <p className="text-sm text-gray-500">
              {ownSms?.configured
                ? `SMS’leriniz ${ownSms.label} hesabınızdan gönderiliyor.`
                : data.sms_platform_fallback
                  ? 'Kendi SMS hesabınız girilene kadar SMS’ler platform hesabından gönderilir.'
                  : 'SMS hesabı girilmediği için SMS gönderilmiyor.'}
            </p>
          </div>
          {data.sms_providers.map((provider) => (
            <ProviderForm
              key={provider.key}
              provider={provider}
              active={data.sms_provider === provider.key}
              expanded={expandedKey === provider.key}
              onToggle={() => setExpandedKey((k) => (k === provider.key ? null : provider.key))}
              onSaved={(p) => replace('sms_providers', p)}
              onDeleted={(p) => replace('sms_providers', p)}
              onActivate={() => select('sms_provider', provider.key)}
            />
          ))}
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <Label label="Deneme SMS’i gönder">
              <input className={inputClass} placeholder="05xx xxx xx xx" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
            </Label>
            <button type="button" className={ghostButton} disabled={testing || testPhone.length < 10 || !ownSms?.configured} onClick={sendTest}>
              {testing ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
