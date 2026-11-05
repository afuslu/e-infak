'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCreateCheckout, useOrgSettings, type CheckoutSessionResponse } from '@e-infak/api-client'
import { trackConversion } from '../lib/analytics'
import { clientLocale, translator } from '../lib/i18n'

const CURRENCY_SYMBOL: Record<'TRY' | 'EUR' | 'USD', string> = { TRY: '₺', EUR: '€', USD: '$' }

interface QuickDonationFormProps {
  campaignId: string
  campaignTitle: string
  suggestedAmounts?: number[]
  themeSlug?: string
  initialAmount?: number
  primaryColor?: string
  accentColor?: string
  checkoutFieldsSchema?: Array<{
    key: string
    label: string
    type: 'text' | 'number' | 'list' | 'select'
    required?: boolean
    options?: string[]
  }>
}

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function QuickDonationForm({
  campaignId,
  campaignTitle,
  suggestedAmounts = [100, 250, 500, 1000],
  initialAmount,
  checkoutFieldsSchema = [],
}: QuickDonationFormProps) {
  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState(String(initialAmount || suggestedAmounts[1] || 250))
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card')
  const [locale, setLocale] = useState<'tr' | 'en' | 'ar'>('tr')
  useEffect(() => {
    const site = clientLocale()
    if (site === 'en' || site === 'ar') setLocale(site)
  }, [])
  const t = translator(locale)
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const { data: orgSettings } = useOrgSettings()
  const enabledCurrencies = useMemo(() => {
    return (orgSettings?.enabled_payment_currencies?.length
      ? orgSettings.enabled_payment_currencies
      : ['TRY']) as Array<'TRY' | 'EUR' | 'USD'>
  }, [orgSettings?.enabled_payment_currencies])
  useEffect(() => {
    if (!enabledCurrencies.includes(currency)) setCurrency(enabledCurrencies[0])
  }, [enabledCurrencies, currency])
  const currencySymbol = CURRENCY_SYMBOL[currency]
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [isGift, setIsGift] = useState(false)
  const [onBehalfOf, setOnBehalfOf] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [allowEmail, setAllowEmail] = useState(false)
  const [allowSms, setAllowSms] = useState(false)
  const [kvkkAccepted, setKvkkAccepted] = useState(false)
  const [metadata, setMetadata] = useState<Record<string, string>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [transfer, setTransfer] = useState<CheckoutSessionResponse | null>(null)
  const checkout = useCreateCheckout()

  useEffect(() => {
    trackConversion('campaign_viewed', { campaign_id: campaignId })
  }, [campaignId])

  const goToDetails = () => {
    if (!Number(amount) || Number(amount) <= 0) {
      setErrorMsg('Lütfen geçerli bir bağış tutarı giriniz.')
      return
    }
    setErrorMsg('')
    setStep(2)
  }

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setErrorMsg('Lütfen zorunlu bağışçı bilgilerini doldurunuz.')
      return
    }
    if (!kvkkAccepted) {
      setErrorMsg('KVKK aydınlatma metnini okuduğunuzu onaylamalısınız.')
      return
    }
    if (isGift && !onBehalfOf.trim()) {
      setErrorMsg('Kimin adına bağış yaptığınızı yazınız.')
      return
    }
    const missingField = checkoutFieldsSchema.find((field) => field.required && !metadata[field.key]?.trim())
    if (missingField) {
      setErrorMsg(`${missingField.label} alanı zorunludur.`)
      return
    }
    setErrorMsg('')
    try {
      trackConversion('checkout_started', { campaign_id: campaignId, payment_method: paymentMethod, currency })
      const result = await checkout.mutateAsync({
        items: [{
          campaign_id: campaignId,
          quantity: 1,
          unit_amount_cents: Math.round(Number(amount) * 100),
          donor_message: message || undefined,
          on_behalf_of: isGift && onBehalfOf.trim() ? onBehalfOf.trim() : undefined,
          metadata: Object.fromEntries(checkoutFieldsSchema.map((field) => [
            field.key,
            field.type === 'list'
              ? (metadata[field.key] || '').split('\n').map((value) => value.trim()).filter(Boolean)
              : metadata[field.key],
          ])),
        }],
        donor: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          is_anonymous: isAnonymous,
          allow_email: allowEmail,
          allow_sms: allowSms,
        },
        payment_method: paymentMethod,
        currency,
        locale,
        idempotency_key: newIdempotencyKey(),
        consent_version: '2026-07',
        kvkk_accepted: kvkkAccepted,
      })
      if (result.redirect_url) {
        trackConversion('payment_redirected', { campaign_id: campaignId, payment_method: paymentMethod, currency })
        window.location.assign(result.redirect_url)
        return
      }
      trackConversion('payment_redirected', { campaign_id: campaignId, payment_method: paymentMethod, currency })
      setTransfer(result)
      setStep(3)
    } catch (error: any) {
      trackConversion('payment_failed', { campaign_id: campaignId, payment_method: paymentMethod, currency })
      setErrorMsg(error?.response?.data?.detail || 'Bağış işlemi başlatılamadı. Lütfen tekrar deneyin.')
    }
  }

  return (
    <section dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl" aria-labelledby="quick-donation-title">
      <h2 id="quick-donation-title" className="text-center font-heading text-2xl font-black text-slate-900">{t('form.quickTitle')}</h2>
      <p className="mt-1 text-center text-sm text-slate-500">{campaignTitle}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-slate-600">{t('lang.label')}
          <select value={locale} onChange={(e) => setLocale(e.target.value as 'tr' | 'en' | 'ar')} className="mt-1 w-full rounded-lg border p-2">
            <option value="tr">Türkçe</option><option value="en">English</option><option value="ar">العربية</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">{t('form.currency')}
          <select value={currency} onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR' | 'USD')} disabled={enabledCurrencies.length < 2} className="mt-1 w-full rounded-lg border p-2 disabled:bg-slate-50 disabled:text-slate-500">
            {enabledCurrencies.map((code) => (
              <option key={code} value={code}>{code} {CURRENCY_SYMBOL[code]}</option>
            ))}
          </select>
        </label>
      </div>

      {errorMsg && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMsg}</div>}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {suggestedAmounts.map((value) => (
              <button key={value} type="button" onClick={() => setAmount(String(value))}
                className={`rounded-xl border-2 px-4 py-3 font-bold ${Number(amount) === value ? 'border-primary-600 bg-primary-50 text-primary-950' : 'border-slate-200 text-slate-600'}`}>
                {value.toLocaleString(locale === 'tr' ? 'tr-TR' : locale === 'ar' ? 'ar' : 'en')} {currency}
              </button>
            ))}
          </div>
          <label className="block text-sm font-bold text-slate-700">
            {t('form.otherAmount')}
            <span className="relative mt-2 block">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" className="w-full rounded-xl border p-3 pr-10" />
              <span className="absolute right-4 top-3 text-slate-500">{currencySymbol}</span>
            </span>
          </label>
          <fieldset>
            <legend className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">{t('form.paymentMethod')}</legend>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setPaymentMethod('credit_card')}
                className={`rounded-xl border p-3 text-sm font-bold ${paymentMethod === 'credit_card' ? 'border-primary-600 bg-primary-50' : ''}`}>💳 {t('form.card')}</button>
              <button type="button" onClick={() => setPaymentMethod('bank_transfer')}
                className={`rounded-xl border p-3 text-sm font-bold ${paymentMethod === 'bank_transfer' ? 'border-primary-600 bg-primary-50' : ''}`}>🏦 {t('form.transfer')}</button>
            </div>
          </fieldset>
          <button type="button" onClick={goToDetails} className="w-full rounded-xl bg-primary-600 py-3.5 font-black text-white">{t('form.continue')}</button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="Ad" placeholder={`${t('form.firstName')} *`} value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-xl border p-3" />
            <input aria-label="Soyad" placeholder={`${t('form.lastName')} *`} value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-xl border p-3" />
          </div>
          <input aria-label="E-posta" type="email" placeholder={`${t('form.email')} *`} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border p-3" />
          <input aria-label="Telefon" type="tel" placeholder={`${t('form.phone')} *`} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border p-3" />
          {checkoutFieldsSchema.map((field) => (
            <label key={field.key} className="block text-xs font-bold text-slate-700">
              {field.label}{field.required ? ' *' : ''}
              {field.type === 'select' ? (
                <select
                  value={metadata[field.key] || ''}
                  required={field.required}
                  onChange={(event) => setMetadata((current) => ({ ...current, [field.key]: event.target.value }))}
                  className="mt-1 w-full rounded-xl border p-3 font-normal"
                >
                  <option value="">{t('form.select')}</option>
                  {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === 'list' ? (
                <textarea
                  value={metadata[field.key] || ''}
                  required={field.required}
                  placeholder={t('form.namesHint')}
                  onChange={(event) => setMetadata((current) => ({ ...current, [field.key]: event.target.value }))}
                  className="mt-1 h-24 w-full rounded-xl border p-3 font-normal"
                />
              ) : (
                <input
                  type={field.type}
                  min={field.type === 'number' ? 1 : undefined}
                  value={metadata[field.key] || ''}
                  required={field.required}
                  onChange={(event) => setMetadata((current) => ({ ...current, [field.key]: event.target.value }))}
                  className="mt-1 w-full rounded-xl border p-3 font-normal"
                />
              )}
            </label>
          ))}
          <textarea aria-label="Bağış notu" placeholder={t('form.note')} value={message} onChange={(e) => setMessage(e.target.value)} className="h-20 w-full resize-none rounded-xl border p-3" />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} /> {t('form.gift')}
          </label>
          {isGift && (
            <input aria-label="Kimin adına" placeholder={t('form.giftName')} maxLength={200} value={onBehalfOf}
              onChange={(e) => setOnBehalfOf(e.target.value)} className="w-full rounded-xl border p-3" />
          )}
          <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} /> İsmimi bağışçı listesinde gizle</label>
          <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={allowEmail} onChange={(e) => setAllowEmail(e.target.checked)} /> E-posta bilgilendirmelerine izin veriyorum</label>
          <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={allowSms} onChange={(e) => setAllowSms(e.target.checked)} /> SMS bilgilendirmelerine izin veriyorum</label>
          <label className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={kvkkAccepted} onChange={(e) => setKvkkAccepted(e.target.checked)} />
            KVKK aydınlatma metnini okudum. *
          </label>
          {paymentMethod === 'credit_card' && (
            <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">🔒 Kart bilgileriniz bu siteye girilmez; bankanın veya ödeme kuruluşunun güvenli ödeme sayfasına yönlendirileceksiniz.</p>
          )}
          <div className="flex gap-3 pt-3">
            <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl border py-3 font-bold">{t('form.back')}</button>
            <button type="button" onClick={submit} disabled={checkout.isPending} className="flex-1 rounded-xl bg-primary-600 py-3 font-black text-white disabled:opacity-60">
              {checkout.isPending ? 'Hazırlanıyor…' : paymentMethod === 'credit_card' ? 'Güvenli Ödemeye Geç' : 'Havale Kaydı Oluştur'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && transfer && (
        <div className="mt-6 space-y-4 text-center">
          <div className="text-5xl">🏦</div>
          <h3 className="text-xl font-black">Havale kaydınız oluşturuldu</h3>
          <div className="rounded-2xl bg-slate-50 p-4 text-left text-sm">
            <p><b>Banka:</b> {transfer.bank_name || 'Yönetim tarafından bildirilecektir'}</p>
            <p><b>Alıcı:</b> {transfer.account_holder || 'Dernek hesabı'}</p>
            <p className="break-all"><b>IBAN:</b> {transfer.iban || 'Henüz tanımlanmamış'}</p>
            <p className="mt-3 rounded-lg bg-amber-100 p-2"><b>Açıklama kodu:</b> {transfer.transfer_reference}</p>
          </div>
          <p className="text-xs text-slate-500">Bağışınız banka hareketi eşleştirildikten sonra onaylanacak ve makbuzunuz gönderilecektir.</p>
        </div>
      )}
    </section>
  )
}
