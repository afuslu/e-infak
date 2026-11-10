'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, Notice, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'

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

function ProviderForm({ provider, active, onSaved, onActivate, extra }: {
  provider: ProviderInfo
  active: boolean
  onSaved: (p: ProviderInfo) => void
  onActivate: () => void
  extra?: React.ReactNode
}) {
  const initial = () => Object.fromEntries(provider.fields.map((f) => [f.key, f.secret ? '' : provider.values[f.key] || '']))
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)

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

  return (
    <div className={`rounded-xl border p-4 ${active ? 'border-primary-600 bg-primary-50/40' : 'bg-white'}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900">{provider.label}</h3>
          {provider.note && <p className="text-xs text-gray-500">{provider.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${provider.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {provider.configured ? 'Bilgiler girildi' : 'Bilgi yok'}
          </span>
          {active ? (
            <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-bold text-white">Kullanılıyor</span>
          ) : (
            <button type="button" className={ghostButton} disabled={!provider.configured} onClick={onActivate}
              title={provider.configured ? '' : 'Önce bilgileri kaydedin'}>
              Bunu kullan
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {provider.fields.map((field) => (
          <Label key={field.key} label={`${field.label}${field.optional ? ' (isteğe bağlı)' : ''}`}
            hint={field.secret && provider.values[field.key] ? `Kayıtlı (${provider.values[field.key]}). Değiştirmek için yenisini yazın.` : undefined}>
            {field.choices ? (
              <select className={inputClass} value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}>
                <option value="">Seçin</option>
                {Object.entries(field.choices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            ) : (
              <input className={inputClass} type={field.secret ? 'password' : 'text'} autoComplete="off"
                value={form[field.key] || ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
            )}
          </Label>
        ))}
      </div>
      {extra}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className={primaryButton} disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        <Notice message={message} />
      </div>
    </div>
  )
}

export default function PaymentSmsAccountsPage() {
  const [data, setData] = useState<Accounts | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    adminGet<Accounts>('/provider-accounts')
      .then((res) => setData(res.data))
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
      setMessage({ type: 'ok', text: 'Sağlayıcı değiştirildi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setMessage(null)
    try {
      await adminSend('post', '/provider-accounts/sms-test', { phone: testPhone })
      setMessage({ type: 'ok', text: 'Deneme SMS’i gönderildi.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'SMS gönderilemedi') })
    } finally {
      setTesting(false)
    }
  }

  const ownSms = data.sms_providers.find((p) => p.key === data.sms_provider)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ödeme & SMS Hesapları</h1>
        <p className="text-sm text-gray-500">
          Bağışlar kurumunuzun kendi sanal POS / ödeme hesabına, SMS’ler kendi SMS firmanız ve başlığınızla gider.
          Şifreler şifrelenerek saklanır ve bu ekranda bir daha gösterilmez.
        </p>
      </div>
      <Notice message={message} />
      {!data.encryption_ready && (
        <Notice message={{ type: 'error', text: 'Sunucuda şifreleme anahtarı tanımlı değil; hesap bilgileri kaydedilemez. Platform yöneticisine bildirin.' }} />
      )}

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Kartla bağış (ödeme sağlayıcısı)</h2>
          <p className="text-sm text-gray-500">
            Bağışçı kart bilgisini her zaman banka veya ödeme kuruluşunun sayfasına girer; sitemizden kart bilgisi geçmez.
            {!data.live_payments_enabled && ' Platformda canlı ödeme henüz açılmadı: “Canlı” seçilse bile test ortamı kullanılır.'}
          </p>
        </div>
        {data.payment_providers.map((provider) => (
          <ProviderForm key={provider.key} provider={provider} active={data.payment_provider === provider.key}
            onSaved={(p) => replace('payment_providers', p)} onActivate={() => select('payment_provider', provider.key)}
            extra={provider.key === 'paytr' ? (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                PayTR panelinde <b>Bildirim URL</b>: <code className="break-all">{data.urls.paytr_notify}</code>
              </p>
            ) : provider.key === 'vakifkatilim' ? (
              <div className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <p>Banka dönüş adresi (otomatik gönderilir): <code className="break-all">{data.urls.vakifkatilim_return}</code></p>
                <p>Sunucu IP adresi bankada tanımlı olmalı; aksi halde ödeme doğrulama ve iade çalışmaz.</p>
                <p>Ödeme sonucu her zaman bankaya sorularak doğrulanır. Test ortamı yoktur; ortamı “Canlı” seçin.</p>
              </div>
            ) : undefined} />
        ))}
      </Card>

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
          <ProviderForm key={provider.key} provider={provider} active={data.sms_provider === provider.key}
            onSaved={(p) => replace('sms_providers', p)} onActivate={() => select('sms_provider', provider.key)} />
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
    </div>
  )
}
