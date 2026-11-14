'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCreateCheckout, useOrgSettings, type CheckoutSessionResponse } from '@e-infak/api-client'
import { trackConversion } from '../lib/analytics'
import { clientLocale, translator } from '../lib/i18n'
import { ConsentChecks, useCardFallback, useCheckoutLegal } from './CheckoutConsent'
import { PaymentTrustBadges } from './site/PaymentTrustBadges'

const CURRENCY_SYMBOL: Record<'TRY' | 'EUR' | 'USD', string> = { TRY: '₺', EUR: '€', USD: '$' }

export type QuickDonationLook = 'card' | 'band' | 'compact' | 'split' | 'inline' | 'glass' | 'single_step'

export interface QuickDonationCampaignOption {
  id: string
  title: string
  image_url?: string
  summary?: string
  collected?: string
  target?: string
  progress?: number
  suggestedAmounts?: number[]
  checkoutFieldsSchema?: QuickDonationFormProps['checkoutFieldsSchema']
}

interface QuickDonationFormProps {
  campaignId: string
  campaignTitle: string
  suggestedAmounts?: number[]
  themeSlug?: string
  initialAmount?: number
  primaryColor?: string
  accentColor?: string
  look?: QuickDonationLook
  hideTitle?: boolean
  editing?: boolean
  amountLabels?: Record<number, string>
  campaigns?: QuickDonationCampaignOption[]
  allowCampaignSelect?: boolean
  showProgress?: boolean
  showFrequency?: boolean
  buttonLabel?: string
  campaignInfo?: {
    image_url?: string
    summary?: string
    collected?: string
    target?: string
    progress?: number
  }
  checkoutFieldsSchema?: Array<{
    key: string
    label: string
    type: 'text' | 'number' | 'list' | 'select'
    required?: boolean
    options?: string[]
  }>
}

const EXTRA_I18N: Record<'tr' | 'en' | 'ar', Record<string, string>> = {
  tr: {
    hideName: 'İsmimi bağışçı listesinde gizle',
    allowEmail: 'E-posta bilgilendirmelerine izin veriyorum',
    allowSms: 'SMS bilgilendirmelerine izin veriyorum',
    secureNotice: 'Kart bilgileriniz bu siteye girilmez; bankanın veya ödeme kuruluşunun güvenli ödeme sayfasına yönlendirileceksiniz.',
    preparing: 'Hazırlanıyor…',
    proceedCard: 'Güvenli Ödemeye Geç',
    createTransfer: 'Havale Kaydı Oluştur',
    transferTitle: 'Havale kaydınız oluşturuldu',
    bank: 'Banka',
    recipient: 'Alıcı',
    iban: 'IBAN',
    refCode: 'Açıklama kodu',
    transferNotice: 'Bağışınız banka hareketi eşleştirildikten sonra onaylanacak ve makbuzunuz gönderilecektir.',
    bankFallback: 'Yönetim tarafından bildirilecektir',
    holderFallback: 'Dernek hesabı',
    ibanFallback: 'Henüz tanımlanmamış',
    copy: 'Kopyala',
    copied: 'Kopyalandı ✓',
    oneTime: 'Tek Seferlik',
    monthly: 'Düzenli Hatırlatma',
    monthlyHint: 'Her ay aynı tutar için e-posta/SMS hatırlatması alabilirsiniz.',
    campaign: 'Kampanya',
    collected: 'Toplanan',
    target: 'Hedef',
    invalidAmount: 'Lütfen geçerli bir bağış tutarı giriniz.',
    missingDonor: 'Lütfen zorunlu bağışçı bilgilerini doldurunuz.',
    missingKvkk: 'KVKK aydınlatma metnini okuduğunuzu onaylamalısınız.',
    missingTerms: 'Ön bilgilendirme formunu ve mesafeli bağış sözleşmesini onaylamalısınız.',
    missingGift: 'Kimin adına bağış yaptığınızı yazınız.',
    editorPreview: 'Önizleme modunda gerçek ödeme başlatılmaz.',
  },
  en: {
    hideName: 'Hide my name on the public donor list',
    allowEmail: 'I agree to receive email updates',
    allowSms: 'I agree to receive SMS updates',
    secureNotice: 'Card details are never entered on this site; you will be redirected to the bank/payment provider’s secure page.',
    preparing: 'Preparing…',
    proceedCard: 'Proceed to Secure Payment',
    createTransfer: 'Create Bank Transfer',
    transferTitle: 'Bank transfer reference created',
    bank: 'Bank',
    recipient: 'Recipient',
    iban: 'IBAN',
    refCode: 'Reference code',
    transferNotice: 'Your donation will be confirmed and your receipt sent once the bank transfer is matched.',
    bankFallback: 'Will be shared by administration',
    holderFallback: 'Organization account',
    ibanFallback: 'Not configured yet',
    copy: 'Copy',
    copied: 'Copied ✓',
    oneTime: 'One-Time',
    monthly: 'Monthly Reminder',
    monthlyHint: 'Receive a monthly reminder for this donation amount.',
    campaign: 'Campaign',
    collected: 'Raised',
    target: 'Goal',
    invalidAmount: 'Please enter a valid donation amount.',
    missingDonor: 'Please fill in all required donor fields.',
    missingKvkk: 'Please accept the privacy notice.',
    missingTerms: 'Please accept the preliminary information and distance donation terms.',
    missingGift: 'Please enter the recipient name for this gift donation.',
    editorPreview: 'Live checkout is disabled in editor preview mode.',
  },
  ar: {
    hideName: 'إخفاء اسمي من قائمة المتبرعين',
    allowEmail: 'أوافق على استلام التحديثات عبر البريد الإلكتروني',
    allowSms: 'أوافق على استلام التحديثات عبر الرسائل النصية',
    secureNotice: 'لا يتم إدخال بيانات البطاقة هنا؛ سيتم توجيهك إلى صفحة الدفع الآمنة.',
    preparing: 'جارٍ التحضير…',
    proceedCard: 'الانتقال إلى الدفع الآمن',
    createTransfer: 'إنشاء طلب تحويل بنكي',
    transferTitle: 'تم إنشاء سجل التحويل البنكي',
    bank: 'البنك',
    recipient: 'المستفيد',
    iban: 'IBAN',
    refCode: 'رمز المرجع',
    transferNotice: 'سيتم تأكيد تبرعك وإرسال الإيصال بعد مطابقة التحويل البنكي.',
    bankFallback: 'سيتم إبلاغكم من الإدارة',
    holderFallback: 'حساب الجمعية',
    ibanFallback: 'غير محدد بعد',
    copy: 'نسخ',
    copied: 'تم النسخ ✓',
    oneTime: 'مرة واحدة',
    monthly: 'تذكير شهري',
    monthlyHint: 'يمكنك استلام تذكير شهري بنفس المبلغ.',
    campaign: 'الحملة',
    collected: 'تم جمعه',
    target: 'الهدف',
    invalidAmount: 'يرجى إدخال مبلغ تبرع صالح.',
    missingDonor: 'يرجى تعبئة بيانات المتبرع المطلوبة.',
    missingKvkk: 'يرجى الموافقة على إشعار الخصوصية.',
    missingTerms: 'يرجى الموافقة على الشروط والأحكام.',
    missingGift: 'يرجى كتابة اسم الشخص المتبرع باسمه.',
    editorPreview: 'الدفع الحقيقي معطل في وضع المعاينة.',
  },
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
  look = 'card',
  hideTitle = false,
  editing = false,
  amountLabels = {},
  campaigns = [],
  allowCampaignSelect = false,
  showProgress = false,
  showFrequency = false,
  buttonLabel,
  campaignInfo,
  checkoutFieldsSchema = [],
}: QuickDonationFormProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignId)
  useEffect(() => { setSelectedCampaignId(campaignId) }, [campaignId])
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId),
    [campaigns, selectedCampaignId],
  )
  const activeCampaignId = selectedCampaign?.id || campaignId
  const activeCampaignTitle = selectedCampaign?.title || campaignTitle
  const activeAmounts = selectedCampaign?.suggestedAmounts?.length ? selectedCampaign.suggestedAmounts : suggestedAmounts
  const activeSchema = selectedCampaign?.checkoutFieldsSchema?.length ? selectedCampaign.checkoutFieldsSchema : checkoutFieldsSchema
  const activeInfo = selectedCampaign
    ? {
        image_url: selectedCampaign.image_url,
        summary: selectedCampaign.summary,
        collected: selectedCampaign.collected,
        target: selectedCampaign.target,
        progress: selectedCampaign.progress,
      }
    : campaignInfo

  const [step, setStep] = useState(1)
  const [frequency, setFrequency] = useState<'one_time' | 'monthly'>('one_time')
  const [amount, setAmount] = useState(String(initialAmount || activeAmounts[1] || activeAmounts[0] || 250))
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [locale, setLocale] = useState<'tr' | 'en' | 'ar'>('tr')
  useEffect(() => {
    const site = clientLocale()
    if (site === 'en' || site === 'ar') setLocale(site)
  }, [])
  const t = translator(locale)
  const ex = EXTRA_I18N[locale]
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
  const [termsAccepted, setTermsAccepted] = useState(false)
  const { legal, cardPayments } = useCheckoutLegal()
  useCardFallback(cardPayments, paymentMethod, setPaymentMethod)
  const [metadata, setMetadata] = useState<Record<string, string>>({})
  const [errorMsg, setErrorMsg] = useState('')
  const [transfer, setTransfer] = useState<CheckoutSessionResponse | null>(null)
  const checkout = useCreateCheckout()

  useEffect(() => {
    trackConversion('campaign_viewed', { campaign_id: activeCampaignId })
  }, [activeCampaignId])

  const copyText = (key: string, val?: string | null) => {
    if (!val || typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(val).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800)
    }).catch(() => {})
  }

  const goToDetails = () => {
    if (!Number(amount) || Number(amount) <= 0) {
      setErrorMsg(ex.invalidAmount)
      return
    }
    setErrorMsg('')
    setStep(2)
  }

  const submit = async () => {
    if (editing) {
      setErrorMsg(ex.editorPreview)
      return
    }
    if (!Number(amount) || Number(amount) <= 0) {
      setErrorMsg(ex.invalidAmount)
      return
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setErrorMsg(ex.missingDonor)
      return
    }
    if (!kvkkAccepted) {
      setErrorMsg(ex.missingKvkk)
      return
    }
    if (paymentMethod === 'credit_card' && !termsAccepted) {
      setErrorMsg(ex.missingTerms)
      return
    }
    if (isGift && !onBehalfOf.trim()) {
      setErrorMsg(ex.missingGift)
      return
    }
    const missingField = activeSchema.find((field) => field.required && !metadata[field.key]?.trim())
    if (missingField) {
      setErrorMsg(`${missingField.label} *`)
      return
    }
    setErrorMsg('')
    const donorNote = [
      frequency === 'monthly' ? '[Düzenli Hatırlatma]' : '',
      message.trim(),
    ].filter(Boolean).join(' ')
    try {
      trackConversion('checkout_started', { campaign_id: activeCampaignId, payment_method: paymentMethod, currency })
      const result = await checkout.mutateAsync({
        items: [{
          campaign_id: activeCampaignId,
          quantity: 1,
          unit_amount_cents: Math.round(Number(amount) * 100),
          donor_message: donorNote || undefined,
          on_behalf_of: isGift && onBehalfOf.trim() ? onBehalfOf.trim() : undefined,
          metadata: Object.fromEntries(activeSchema.map((field) => [
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
        terms_accepted: termsAccepted,
      })
      if (result.redirect_url) {
        trackConversion('payment_redirected', { campaign_id: activeCampaignId, payment_method: paymentMethod, currency })
        window.location.assign(result.redirect_url)
        return
      }
      trackConversion('payment_redirected', { campaign_id: activeCampaignId, payment_method: paymentMethod, currency })
      setTransfer(result)
      setStep(3)
    } catch (error: any) {
      trackConversion('payment_failed', { campaign_id: activeCampaignId, payment_method: paymentMethod, currency })
      setErrorMsg(error?.response?.data?.detail || 'Bağış işlemi başlatılamadı. Lütfen tekrar deneyin.')
    }
  }

  const isInline = look === 'inline'
  const isSplit = look === 'split'
  const isGlass = look === 'glass'
  const isSingleStep = look === 'single_step'
  const isCompact = look === 'compact'
  const ctaText = buttonLabel || t('form.continue')

  const campaignPicker = allowCampaignSelect && campaigns.length > 1 && (
    <label className="block text-xs font-bold text-slate-600">
      {ex.campaign}
      <select
        value={activeCampaignId}
        onChange={(e) => setSelectedCampaignId(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-semibold text-slate-900"
      >
        {campaigns.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
      </select>
    </label>
  )

  const progressBlock = showProgress && activeInfo?.collected && (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-3.5 text-start">
      <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
        <span className="text-primary-800">{ex.collected}: {activeInfo.collected}</span>
        {activeInfo.target && <span className="text-slate-500">{ex.target}: {activeInfo.target}</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${Math.min(activeInfo.progress ?? 0, 100)}%` }} />
      </div>
    </div>
  )

  const frequencyTabs = showFrequency && (
    <div>
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setFrequency('one_time')}
          className={`rounded-lg py-2 text-xs font-bold transition ${frequency === 'one_time' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {ex.oneTime}
        </button>
        <button
          type="button"
          onClick={() => setFrequency('monthly')}
          className={`rounded-lg py-2 text-xs font-bold transition ${frequency === 'monthly' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {ex.monthly}
        </button>
      </div>
      {frequency === 'monthly' && <p className="mt-1.5 text-[11px] text-slate-500">{ex.monthlyHint}</p>}
    </div>
  )

  const amountStepContent = (
    <div className="space-y-4">
      {campaignPicker}
      {frequencyTabs}
      <div className={`grid gap-2.5 ${activeAmounts.length >= 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
        {activeAmounts.map((value) => {
          const selected = Number(amount) === value
          const tierLabel = amountLabels[value]
          return (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className={`flex flex-col items-center justify-center rounded-xl border-2 px-3 py-2.5 text-center transition ${
                selected ? 'border-primary-600 bg-primary-50 text-primary-950 shadow-xs' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300'
              }`}
            >
              <span className="font-bold">{value.toLocaleString(locale === 'tr' ? 'tr-TR' : locale === 'ar' ? 'ar' : 'en')} {currencySymbol}</span>
              {tierLabel && <span className="mt-0.5 text-[11px] font-medium text-slate-500">{tierLabel}</span>}
            </button>
          )
        })}
      </div>
      <label className="block text-sm font-bold text-slate-700">
        {t('form.otherAmount')}
        <span className="relative mt-1.5 block">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="w-full rounded-xl border border-slate-200 bg-white p-3 pe-10"
          />
          <span className="absolute end-4 top-3 text-slate-500">{currencySymbol}</span>
        </span>
      </label>
      <fieldset>
        <legend className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">{t('form.paymentMethod')}</legend>
        <div className={`grid gap-3 ${cardPayments ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {cardPayments && (
            <button
              type="button"
              onClick={() => setPaymentMethod('credit_card')}
              className={`rounded-xl border p-3 text-sm font-bold transition ${paymentMethod === 'credit_card' ? 'border-primary-600 bg-primary-50 text-primary-950' : 'border-slate-200 bg-white'}`}
            >
              💳 {t('form.card')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPaymentMethod('bank_transfer')}
            className={`rounded-xl border p-3 text-sm font-bold transition ${paymentMethod === 'bank_transfer' ? 'border-primary-600 bg-primary-50 text-primary-950' : 'border-slate-200 bg-white'}`}
          >
            🏦 {t('form.transfer')}
          </button>
        </div>
      </fieldset>
      {!isSingleStep && (
        <button type="button" onClick={goToDetails} className="w-full rounded-xl bg-primary-600 py-3.5 font-black text-white shadow-sm transition hover:bg-primary-700">
          {ctaText}
        </button>
      )}
    </div>
  )

  const donorStepContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input aria-label={t('form.firstName')} placeholder={`${t('form.firstName')} *`} value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-xl border border-slate-200 bg-white p-3" />
        <input aria-label={t('form.lastName')} placeholder={`${t('form.lastName')} *`} value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-xl border border-slate-200 bg-white p-3" />
      </div>
      <input aria-label={t('form.email')} type="email" placeholder={`${t('form.email')} *`} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3" />
      <input aria-label={t('form.phone')} type="tel" placeholder={`${t('form.phone')} *`} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3" />
      {activeSchema.map((field) => (
        <label key={field.key} className="block text-xs font-bold text-slate-700">
          {field.label}{field.required ? ' *' : ''}
          {field.type === 'select' ? (
            <select
              value={metadata[field.key] || ''}
              required={field.required}
              onChange={(event) => setMetadata((current) => ({ ...current, [field.key]: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal"
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
              className="mt-1 h-24 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal"
            />
          ) : (
            <input
              type={field.type}
              min={field.type === 'number' ? 1 : undefined}
              value={metadata[field.key] || ''}
              required={field.required}
              onChange={(event) => setMetadata((current) => ({ ...current, [field.key]: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal"
            />
          )}
        </label>
      ))}
      <textarea aria-label={t('form.note')} placeholder={t('form.note')} value={message} onChange={(e) => setMessage(e.target.value)} className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-white p-3" />
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} /> {t('form.gift')}
      </label>
      {isGift && (
        <input aria-label={t('form.giftName')} placeholder={t('form.giftName')} maxLength={200} value={onBehalfOf}
          onChange={(e) => setOnBehalfOf(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3" />
      )}
      <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} /> {ex.hideName}</label>
      <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={allowEmail} onChange={(e) => setAllowEmail(e.target.checked)} /> {ex.allowEmail}</label>
      <label className="flex gap-2 text-xs text-slate-600"><input type="checkbox" checked={allowSms} onChange={(e) => setAllowSms(e.target.checked)} /> {ex.allowSms}</label>
      <ConsentChecks legal={legal} kvkk={kvkkAccepted} onKvkk={setKvkkAccepted}
        terms={termsAccepted} onTerms={setTermsAccepted} requireTerms={paymentMethod === 'credit_card'} />
      {paymentMethod === 'credit_card' && (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
          <p>🔒 {ex.secureNotice}</p>
          <PaymentTrustBadges />
        </div>
      )}
      <div className="flex gap-3 pt-2">
        {!isSingleStep && (
          <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl border border-slate-200 py-3 font-bold text-slate-700">
            {t('form.back')}
          </button>
        )}
        <button type="button" onClick={submit} disabled={checkout.isPending} className="flex-1 rounded-xl bg-primary-600 py-3.5 font-black text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
          {checkout.isPending ? ex.preparing : paymentMethod === 'credit_card' ? ex.proceedCard : ex.createTransfer}
        </button>
      </div>
    </div>
  )

  const transferStepContent = transfer && (
    <div className="mt-6 space-y-4 text-center">
      <div className="text-5xl">🏦</div>
      <h3 className="text-xl font-black text-slate-900">{ex.transferTitle}</h3>
      <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-start text-sm">
        <p><b>{ex.bank}:</b> {transfer.bank_name || ex.bankFallback}</p>
        <p><b>{ex.recipient}:</b> {transfer.account_holder || ex.holderFallback}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="break-all"><b>{ex.iban}:</b> {transfer.iban || ex.ibanFallback}</p>
          {transfer.iban && (
            <button type="button" onClick={() => copyText('iban', transfer.iban)} className="flex-none rounded-lg border bg-white px-2.5 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50">
              {copiedKey === 'iban' ? ex.copied : ex.copy}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-100 p-2.5">
          <p><b>{ex.refCode}:</b> {transfer.transfer_reference}</p>
          <button type="button" onClick={() => copyText('ref', transfer.transfer_reference)} className="flex-none rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-50">
            {copiedKey === 'ref' ? ex.copied : ex.copy}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">{ex.transferNotice}</p>
    </div>
  )

  const headerBar = (
    <>
      {!hideTitle && (
        <h2 id="quick-donation-title" className="text-center font-heading text-2xl font-black text-slate-900">
          {t('form.quickTitle')}
        </h2>
      )}
      {!isSplit && (
        <p className={`${hideTitle ? '' : 'mt-1'} text-center text-sm font-medium text-slate-500`}>{activeCampaignTitle}</p>
      )}
      {!isSplit && progressBlock && <div className="mt-4">{progressBlock}</div>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-slate-600">{t('lang.label')}
          <select value={locale} onChange={(e) => setLocale(e.target.value as 'tr' | 'en' | 'ar')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2">
            <option value="tr">Türkçe</option><option value="en">English</option><option value="ar">العربية</option>
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">{t('form.currency')}
          <select value={currency} onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR' | 'USD')} disabled={enabledCurrencies.length < 2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 disabled:bg-slate-50 disabled:text-slate-500">
            {enabledCurrencies.map((code) => (
              <option key={code} value={code}>{code} {CURRENCY_SYMBOL[code]}</option>
            ))}
          </select>
        </label>
      </div>
      {errorMsg && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMsg}</div>}
    </>
  )

  if (isInline && step === 1) {
    return (
      <section dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:p-5" aria-label={activeCampaignTitle}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:w-56">
            {allowCampaignSelect && campaigns.length > 1 ? (
              <select
                value={activeCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                aria-label={ex.campaign}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900"
              >
                {campaigns.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            ) : (
              <div className="truncate font-heading text-base font-bold text-slate-900">{activeCampaignTitle}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {activeAmounts.slice(0, 4).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className={`rounded-xl border px-3.5 py-2 text-sm font-bold transition ${
                  Number(amount) === value ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-primary-400'
                }`}
              >
                {value} {currencySymbol}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[120px]">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              aria-label={t('form.otherAmount')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pe-8 text-sm font-bold"
            />
            <span className="absolute end-3 top-2.5 text-sm text-slate-500">{currencySymbol}</span>
          </div>
          <button type="button" onClick={goToDetails} className="rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-accent-600">
            {ctaText}
          </button>
        </div>
        {errorMsg && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs font-semibold text-red-700">{errorMsg}</div>}
      </section>
    )
  }

  if (isSplit) {
    return (
      <section dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-12" aria-label={activeCampaignTitle}>
        <div className="flex flex-col justify-between bg-primary-950 p-6 text-white md:col-span-5 sm:p-8">
          <div>
            {activeInfo?.image_url && (
              <img src={activeInfo.image_url} alt={activeCampaignTitle} className="mb-5 aspect-[16/10] w-full rounded-2xl object-cover" />
            )}
            <h3 className="font-heading text-2xl font-bold text-white">{activeCampaignTitle}</h3>
            {activeInfo?.summary && <p className="mt-2 text-sm leading-relaxed text-white/80">{activeInfo.summary}</p>}
          </div>
          {progressBlock && <div className="mt-6 text-slate-900">{progressBlock}</div>}
        </div>
        <div className="p-6 md:col-span-7 sm:p-8">
          {headerBar}
          {step === 1 && <div className="mt-5">{amountStepContent}</div>}
          {step === 2 && <div className="mt-5">{donorStepContent}</div>}
          {step === 3 && transferStepContent}
        </div>
      </section>
    )
  }

  const cardShell = isGlass
    ? 'mx-auto w-full max-w-xl rounded-3xl border border-white/30 bg-white/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8'
    : isCompact
      ? 'mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-md'
      : 'mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7'

  return (
    <section dir={locale === 'ar' ? 'rtl' : 'ltr'} className={cardShell} aria-labelledby={hideTitle ? undefined : 'quick-donation-title'}>
      {headerBar}
      {isSingleStep && step !== 3 ? (
        <div className="mt-6 space-y-5">
          {amountStepContent}
          <div className="border-t border-slate-100 pt-5">{donorStepContent}</div>
        </div>
      ) : (
        <>
          {step === 1 && <div className="mt-6">{amountStepContent}</div>}
          {step === 2 && <div className="mt-6">{donorStepContent}</div>}
          {step === 3 && transferStepContent}
        </>
      )}
    </section>
  )
}
