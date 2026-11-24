'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useCreateCheckout, useOrgSettings, type CheckoutSessionResponse } from '@e-infak/api-client'
import { errorMessage } from '../../lib/api-error'
import { trackConversion } from '../../lib/analytics'
import type { CheckoutStyle } from '../../lib/site-design'
import { ConsentChecks, useCardFallback, useCheckoutLegal, useLoggedInDonor } from '../CheckoutConsent'
import { PaymentTrustBadges } from './PaymentTrustBadges'

export interface CartSummaryItem {
  campaignId: string
  campaignTitle: string
  amount: number
  quantity?: number
  metadata?: Record<string, unknown>
  /** Campaign with donation options: the price is set, and the quantity stays within these. */
  locked?: boolean
  minQuantity?: number
  maxQuantity?: number
  currency?: 'TRY' | 'EUR' | 'USD'
}

const SYM: Record<'TRY' | 'EUR' | 'USD', string> = { TRY: '₺', EUR: '€', USD: '$' }
const CART_KEY = 'einfak_cart'
const DONOR_PROFILE_KEY = 'einfak_donor_profile'
const notifyCart = () => window.dispatchEvent(new Event('donation-cart-changed'))
const PREVIEW_SAMPLE_CART: CartSummaryItem[] = [
  { campaignId: 'preview-1', campaignTitle: 'Kurban Bağışı (Örnek)', amount: 5000, quantity: 1, currency: 'TRY' },
  { campaignId: 'preview-2', campaignTitle: 'Su Kuyusu Hissesi (Örnek)', amount: 1250, quantity: 1, currency: 'TRY' },
]

/**
 * /bagis/sepetim: Full-page world-class checkout supporting 6 configurable styles
 * (`split_classic`, `stepper_minimal`, `express_single`, `dark_luxury`, `trust_split`, `transfer_first`).
 */
export function CartPageClient({
  checkoutStyle = 'split_classic',
  siteName,
  microAddon = false,
  showFaq = false,
}: {
  checkoutStyle?: CheckoutStyle
  siteName?: string
  microAddon?: boolean
  showFaq?: boolean
}) {
  const router = useRouter()
  const [cart, setCart] = useState<CartSummaryItem[] | null>(null)
  const [isPreview, setIsPreview] = useState(false)
  const [styleOverride, setStyleOverride] = useState<CheckoutStyle | null>(null)
  const [microAddonOverride, setMicroAddonOverride] = useState<boolean | null>(null)
  const [showFaqOverride, setShowFaqOverride] = useState<boolean | null>(null)
  const activeStyle = styleOverride || checkoutStyle
  const activeMicroAddon = microAddonOverride ?? microAddon
  const activeShowFaq = showFaqOverride ?? showFaq
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [accordionOpen, setAccordionOpen] = useState<1 | 2 | 3>(2)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [taxNo, setTaxNo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>(
    activeStyle === 'transfer_first' ? 'bank_transfer' : 'credit_card',
  )
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [kvkk, setKvkk] = useState(false)
  const [terms, setTerms] = useState(false)
  const [isGift, setIsGift] = useState(false)
  const [onBehalfOf, setOnBehalfOf] = useState('')
  const [onBehalfOfPhone, setOnBehalfOfPhone] = useState('')
  const [rememberDonor, setRememberDonor] = useState(true)
  const [donorPrefilled, setDonorPrefilled] = useState(false)
  const [error, setError] = useState('')
  const [ibanCopied, setIbanCopied] = useState(false)
  const [transfer, setTransfer] = useState<CheckoutSessionResponse | null>(null)

  const { data: orgSettings } = useOrgSettings()
  const { legal, cardPayments, ibanPageUrl } = useCheckoutLegal()
  const { isLoggedIn, donor: loggedInDonor } = useLoggedInDonor()
  const checkout = useCreateCheckout()
  useCardFallback(cardPayments, paymentMethod, setPaymentMethod)

  useEffect(() => {
    if (loggedInDonor) {
      setFirstName(loggedInDonor.firstName)
      setLastName(loggedInDonor.lastName)
      setEmail(loggedInDonor.email)
      setPhone(loggedInDonor.phone)
    }
  }, [loggedInDonor])

  const goToIbanPage = () => {
    router.push(ibanPageUrl)
  }

  const enabledCurrencies = useMemo(() => {
    return (orgSettings?.enabled_payment_currencies?.length
      ? orgSettings.enabled_payment_currencies
      : ['TRY']) as Array<'TRY' | 'EUR' | 'USD'>
  }, [orgSettings?.enabled_payment_currencies])

  useEffect(() => {
    if (!enabledCurrencies.includes(currency)) setCurrency(enabledCurrencies[0])
  }, [enabledCurrencies, currency])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const preview = params.get('preview') === '1'
    if (preview) setIsPreview(true)
    const qStyle = params.get('stil') as CheckoutStyle | null
    if (qStyle) {
      setStyleOverride(qStyle)
      if (qStyle === 'transfer_first') setPaymentMethod('bank_transfer')
    }
    if (params.get('odeme') === 'havale') {
      setPaymentMethod('bank_transfer')
    }
    if (!preview) {
      try {
        const saved = JSON.parse(localStorage.getItem(DONOR_PROFILE_KEY) || 'null')
        if (saved && (saved.firstName || saved.phone)) {
          if (saved.firstName) setFirstName(String(saved.firstName))
          if (saved.lastName) setLastName(String(saved.lastName))
          if (saved.phone) setPhone(String(saved.phone))
          if (saved.email) setEmail(String(saved.email))
          setDonorPrefilled(true)
        }
      } catch { /* ignore */ }
    }
    const qAddon = params.get('addon')
    if (qAddon === '1' || qAddon === '0') setMicroAddonOverride(qAddon === '1')
    const qFaq = params.get('faq')
    if (qFaq === '1' || qFaq === '0') setShowFaqOverride(qFaq === '1')

    const read = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
        const list: CartSummaryItem[] = Array.isArray(parsed) ? parsed : []
        if (preview && list.length === 0) {
          setCart(PREVIEW_SAMPLE_CART)
          return
        }
        setCart(list)
        const itemCurr = list.find((it) => it.currency)?.currency
        if (itemCurr) setCurrency(itemCurr)
      } catch {
        setCart(preview ? PREVIEW_SAMPLE_CART : [])
      }
    }
    read()

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const msg = event.data
      if (msg?.source !== 'einfak-builder' || msg?.type !== 'checkout-preview-patch') return
      if (msg.checkout_style) {
        setStyleOverride(msg.checkout_style as CheckoutStyle)
        if (msg.checkout_style === 'transfer_first') setPaymentMethod('bank_transfer')
      }
      if (typeof msg.checkout_micro_addon === 'boolean') setMicroAddonOverride(msg.checkout_micro_addon)
      if (typeof msg.checkout_show_faq === 'boolean') setShowFaqOverride(msg.checkout_show_faq)
    }

    window.addEventListener('donation-cart-changed', read)
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('donation-cart-changed', read)
      window.removeEventListener('message', onMessage)
    }
  }, [])

  const persist = (next: CartSummaryItem[]) => {
    setCart(next)
    if (isPreview) return
    localStorage.setItem(CART_KEY, JSON.stringify(next))
    notifyCart()
  }

  const updateItem = (idx: number, patch: Partial<CartSummaryItem>) => {
    if (!cart) return
    persist(cart.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const items = cart || []
  const total = items.reduce((s, it) => s + (Number(it.amount) || 0) * (Number(it.quantity) || 1), 0)
  const sym = SYM[currency] || '₺'
  const isDark = activeStyle === 'dark_luxury' || activeStyle === 'ramadan_special' || activeStyle === 'midnight_emerald' || activeStyle === 'royal_navy_gold'
  const isEmerald = activeStyle === 'emerald_charity' || activeStyle === 'soft_sage_charity'
  const isPaper = activeStyle === 'minimal_paper'
  const isCompactMobile = activeStyle === 'compact_mobile'
  const isGlass = activeStyle === 'glass_gradient'
  const isWarm = activeStyle === 'warm_pastel' || activeStyle === 'terracotta_warm'
  const isCorporate = activeStyle === 'corporate_checkout'
  const isOrnate = activeStyle === 'islamic_ornate'
  const isHighContrast = activeStyle === 'high_contrast'
  const isMinBordered = activeStyle === 'minimal_bordered' || activeStyle === 'split_bordered_classic'
  const isElevated = activeStyle === 'card_elevated_split'
  const isPillModern = activeStyle === 'pill_rounded_modern'

  const submit = async () => {
    if (!items.length) return
    if (isPreview) {
      setError('Önizleme modunda gerçek ödeme işlemi başlatılmaz.')
      return
    }
    const effFirstName = (isLoggedIn && loggedInDonor ? loggedInDonor.firstName : firstName).trim()
    const effLastName = (isLoggedIn && loggedInDonor ? loggedInDonor.lastName : lastName).trim()
    const effEmail = (isLoggedIn && loggedInDonor ? loggedInDonor.email : email).trim()
    const effPhone = (isLoggedIn && loggedInDonor ? loggedInDonor.phone : phone).trim()
    if (!isLoggedIn && (!effFirstName || !effLastName || !effPhone)) {
      setError('Lütfen ad, soyad ve telefon bilgilerini doldurun.')
      return
    }
    if (!kvkk) {
      setError('KVKK aydınlatma metni onayı zorunludur.')
      return
    }
    if (isGift && !onBehalfOf.trim()) {
      setError('Kimin adına bağış yaptığınızı yazın.')
      return
    }
    setError('')
    try {
      if (!isLoggedIn && rememberDonor) {
        try {
          localStorage.setItem(DONOR_PROFILE_KEY, JSON.stringify({
            firstName: effFirstName,
            lastName: effLastName,
            phone: effPhone,
            email: effEmail,
          }))
        } catch { /* ignore */ }
      } else if (!isLoggedIn) {
        try { localStorage.removeItem(DONOR_PROFILE_KEY) } catch { /* ignore */ }
      }
      trackConversion('checkout_started', { item_count: items.length, payment_method: paymentMethod, currency })
      const result = await checkout.mutateAsync({
        items: items.map((it) => ({
          campaign_id: it.campaignId,
          quantity: it.quantity || 1,
          unit_amount_cents: Math.round((Number(it.amount) || 0) * 100),
          on_behalf_of: isGift && onBehalfOf.trim()
            ? onBehalfOf.trim()
            : isCorporate && companyName.trim()
              ? `${companyName.trim()}${taxNo.trim() ? ` (VKN: ${taxNo.trim()})` : ''}`
              : undefined,
          on_behalf_of_phone: isGift && onBehalfOfPhone.trim() ? onBehalfOfPhone.trim() : undefined,
          metadata: it.metadata,
        })),
        donor: {
          first_name: effFirstName || 'Değerli',
          last_name: effLastName || 'Bağışçı',
          email: effEmail,
          phone: effPhone || '05000000000',
          is_anonymous: items.some((it) => Boolean(it.metadata?.anonim)),
          allow_email: false,
          allow_sms: false,
        },
        payment_method: paymentMethod,
        currency,
        kvkk_accepted: kvkk,
        terms_accepted: kvkk || terms || paymentMethod === 'bank_transfer',
        locale: 'tr',
        idempotency_key: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        consent_version: 'v1',
      })
      if (result.redirect_url) {
        trackConversion('payment_redirected', { payment_method: paymentMethod, currency })
        window.location.assign(result.redirect_url)
        return
      }
      trackConversion('payment_redirected', { payment_method: paymentMethod, currency })
      setTransfer(result)
      persist([])
    } catch (err: any) {
      trackConversion('payment_failed', { payment_method: paymentMethod, currency })
      setError(errorMessage(err, 'Ödeme başlatılamadı. Lütfen tekrar deneyin.'))
    }
  }

  const inputCls = isDark
    ? 'w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-3 text-sm text-white placeholder:text-white/50 outline-none focus:border-amber-400'
    : isCompactMobile
      ? 'w-full rounded-2xl border border-gray-300 bg-white px-4 py-3.5 text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-primary-600'
      : isPaper
        ? 'w-full rounded-none border-b-2 border-stone-300 bg-transparent px-2 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-800'
        : 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-500/15'

  const cardCls = isDark
    ? 'rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-md shadow-2xl'
    : isOrnate
      ? 'rounded-3xl border-2 border-amber-400/70 bg-[#FFFDF8] p-6 ring-1 ring-emerald-900/10 shadow-md'
      : isHighContrast
        ? 'rounded-2xl border-2 border-black bg-white p-6 text-base shadow-none'
        : isGlass
          ? 'rounded-3xl border border-white/60 bg-white/75 p-6 backdrop-blur-xl shadow-xl'
          : isWarm
            ? 'rounded-3xl border border-amber-200/80 bg-[#FFF8F0] p-6 shadow-sm'
            : isEmerald
              ? 'rounded-3xl border border-emerald-200 bg-[#FFFDF8] p-6 shadow-sm'
              : isPaper
                ? 'rounded-sm border-2 border-stone-800 bg-[#FFFDF9] p-6 shadow-[4px_4px_0_0_rgba(41,37,36,0.12)]'
                : isMinBordered
                  ? 'rounded-none border border-gray-300 bg-transparent p-6 shadow-none'
                  : isElevated
                    ? 'rounded-3xl border border-gray-100 bg-white p-7 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)]'
                    : isPillModern
                      ? 'rounded-[2rem] border border-primary-100 bg-white p-6 shadow-md'
                      : 'rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm'

  const primaryBtnCls = isDark
    ? 'w-full rounded-xl bg-amber-500 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:bg-amber-400 disabled:opacity-60'
    : isHighContrast
      ? 'w-full rounded-xl bg-black py-4 text-base font-black uppercase tracking-wider text-white transition hover:bg-neutral-800 disabled:opacity-60'
      : isOrnate
        ? 'w-full rounded-xl bg-emerald-800 py-3.5 text-sm font-black uppercase tracking-wider text-amber-100 shadow-md ring-1 ring-amber-400/50 transition hover:bg-emerald-900 disabled:opacity-60'
        : isEmerald
      ? 'w-full rounded-xl bg-emerald-700 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-60'
      : isPaper
        ? 'w-full rounded-sm bg-stone-900 py-3.5 text-sm font-black uppercase tracking-widest text-white transition hover:bg-stone-800 disabled:opacity-60'
        : isCompactMobile
          ? 'w-full rounded-2xl bg-primary-600 py-4 text-base font-black uppercase tracking-wider text-white shadow-md transition hover:bg-primary-700 disabled:opacity-60'
          : 'w-full rounded-xl bg-primary-600 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-md transition hover:bg-primary-700 disabled:opacity-60'

  if (transfer) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">🏦</div>
          <h1 className="font-heading text-2xl font-black text-gray-900">Havale / EFT Kaydınız Hazır</h1>
          <p className="mt-2 text-sm text-gray-600">Aşağıdaki hesap bilgilerine açıklama kodunu yazarak bağışınızı tamamlayabilirsiniz.</p>
          <div className="mt-6 space-y-2 rounded-2xl bg-slate-50 p-5 text-start text-sm">
            <p><b>Banka:</b> {transfer.bank_name || 'Tanımlanmadı'}</p>
            <p><b>Alıcı:</b> {transfer.account_holder || siteName || 'Kurum hesabı'}</p>
            <p className="break-all"><b>IBAN:</b> {transfer.iban || 'Tanımlanmadı'}</p>
            <p className="mt-3 rounded-xl bg-amber-100 p-3 font-semibold text-amber-950">
              <b>Açıklama Kodu:</b> {transfer.transfer_reference}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {transfer.iban && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`${transfer.iban}\nAçıklama: ${transfer.transfer_reference}`).then(() => {
                    setIbanCopied(true)
                    setTimeout(() => setIbanCopied(false), 2500)
                  })
                }}
                className="rounded-xl border border-primary-200 bg-primary-50 px-5 py-2.5 text-xs font-bold text-primary-800 hover:bg-primary-100"
              >
                {ibanCopied ? 'IBAN ve Açıklama Kopyalandı ✓' : 'IBAN & Açıklamayı Kopyala'}
              </button>
            )}
            <Link href="/kampanyalar" className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-primary-700">
              Kampanyalara Dön
            </Link>
          </div>
        </div>
      </section>
    )
  }

  if (cart !== null && !items.length) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-gray-200/80 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <ShoppingBag className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Bağış Sepetiniz Boş</h1>
          <p className="mt-2.5 text-sm text-gray-600">İhtiyaç sahiplerine ulaştırmak üzere kampanyalarımızdan dilediğinizi seçebilirsiniz.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/kampanyalar" className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-700">
              Kampanyaları İncele
            </Link>
            <Link href="/" className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Ana Sayfa
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const orderSummary = (
    <div className={cardCls}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`font-heading text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Bağış Özeti ({items.length})
        </h2>
        {items.length > 0 && (
          <button type="button" onClick={() => persist([])} className={`text-xs font-semibold ${isDark ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-red-600'}`}>
            Temizle
          </button>
        )}
      </div>
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={`${it.campaignId}-${idx}`} className={`rounded-2xl border p-3.5 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-100 bg-gray-50/70'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{it.campaignTitle}</p>
              <button type="button" onClick={() => persist(items.filter((_, i) => i !== idx))} className="text-xs font-bold text-rose-500 hover:underline">
                Sil
              </button>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                inputMode="numeric"
                aria-label="Tutar"
                readOnly={it.locked}
                value={it.amount}
                onChange={(e) => updateItem(idx, { amount: Math.max(1, Number(e.target.value) || 0) })}
                className={`w-28 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${isDark ? 'border-white/15 bg-white/10 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
              />
              <span className={`text-xs font-bold ${isDark ? 'text-white/70' : 'text-gray-500'}`}>{sym} ×</span>
              <input
                type="number"
                min={it.minQuantity || 1}
                max={it.maxQuantity || 100}
                readOnly={it.maxQuantity === 1}
                aria-label="Adet"
                value={it.quantity || 1}
                onChange={(e) => updateItem(idx, { quantity: Math.min(it.maxQuantity || 100, Math.max(it.minQuantity || 1, Number(e.target.value) || 1)) })}
                className={`w-16 rounded-lg border px-2 py-1.5 text-xs font-bold ${isDark ? 'border-white/15 bg-white/10 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
              />
              <span className={`ms-auto text-sm font-extrabold ${isDark ? 'text-amber-300' : 'text-primary-700'}`}>
                {((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {sym}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-5 flex items-center justify-between border-t pt-4 ${isDark ? 'border-white/15' : 'border-gray-100'}`}>
        <span className={`text-sm font-semibold ${isDark ? 'text-white/80' : 'text-gray-600'}`}>Toplam Bağış</span>
        <span className={`text-2xl font-black ${isDark ? 'text-amber-400' : 'text-primary-700'}`}>
          {total.toLocaleString('tr-TR')} {sym}
        </span>
      </div>
      {activeMicroAddon && items[0] && !items[0].locked && (
        <div className={`mt-4 rounded-2xl border p-3.5 ${isDark ? 'border-white/15 bg-white/5' : 'border-primary-100 bg-primary-50/60'}`}>
          <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-primary-900'}`}>Küçük bir iyilik ekleyin</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[50, 100, 250].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => persist([...items, { campaignId: items[0].campaignId, campaignTitle: `${items[0].campaignTitle} (+${amt} ${sym})`, amount: amt, quantity: 1, currency }])}
                className="rounded-xl border border-primary-200 bg-white px-3 py-1.5 text-xs font-bold text-primary-800 hover:bg-primary-100"
              >
                + {amt} {sym}
              </button>
            ))}
          </div>
        </div>
      )}
      {activeStyle === 'trust_split' && (
        <div className="mt-5 space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs text-emerald-900">
          <p className="font-bold">✓ %100 Güvenli ve Şeffaf Süreç</p>
          <p>• Bağışınızın tamamı seçtiğiniz kampanyaya aktarılır.</p>
          <p>• Ödeme sonrası doğrulama kodlu PDF makbuzunuz anında oluşur.</p>
          <p>• 256-bit SSL ve 3D Secure ile korunmaktadır.</p>
        </div>
      )}
    </div>
  )

  const donorFields = (
    <div className="space-y-3">
      {!isLoggedIn && (
        <>
          {donorPrefilled && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-800">
              <span>✓ Önceki bağışınızdan bilgileriniz otomatik dolduruldu.</span>
              <button
                type="button"
                onClick={() => {
                  setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setDonorPrefilled(false)
                  try { localStorage.removeItem(DONOR_PROFILE_KEY) } catch { /* ignore */ }
                }}
                className="font-bold underline hover:text-emerald-950"
              >
                Temizle
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input aria-label="Ad" autoComplete="given-name" placeholder="Ad *" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
            <input aria-label="Soyad" autoComplete="family-name" placeholder="Soyad *" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input aria-label="Telefon" type="tel" autoComplete="tel" placeholder="Telefon *" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            <input aria-label="E-posta" type="email" autoComplete="email" placeholder="E-posta (isteğe bağlı)" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs opacity-80">
            <input type="checkbox" checked={rememberDonor} onChange={(e) => setRememberDonor(e.target.checked)} />
            <span>Sonraki bağışım için bilgilerimi bu cihazda hatırla</span>
          </label>
        </>
      )}
      {isCorporate && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input aria-label="Kurum / Şirket Adı" placeholder="Kurum / Şirket Adı" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} />
          <input aria-label="Vergi Numarası" placeholder="Vergi No (isteğe bağlı)" value={taxNo} onChange={(e) => setTaxNo(e.target.value)} className={inputCls} />
        </div>
      )}
      <label className={`flex cursor-pointer items-center gap-2 text-xs font-semibold ${isDark ? 'text-white/90' : 'text-gray-700'}`}>
        <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
        Başkası adına / Hediye bağış yapıyorum
      </label>
      {isGift && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            aria-label="Kimin adına"
            placeholder="Kimin adına? Ad Soyad * (makbuzda görünür)"
            maxLength={200}
            value={onBehalfOf}
            onChange={(e) => setOnBehalfOf(e.target.value)}
            className={inputCls}
          />
          <input
            aria-label="Adına bağış yapılanın telefonu"
            type="tel"
            placeholder="Bilgilendirme SMS'i gidecek telefon (isteğe bağlı)"
            maxLength={32}
            value={onBehalfOfPhone}
            onChange={(e) => setOnBehalfOfPhone(e.target.value)}
            className={inputCls}
          />
        </div>
      )}
    </div>
  )

  const paymentOptions = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {(activeStyle === 'transfer_first'
          ? (['bank_transfer', 'credit_card'] as const)
          : (['credit_card', 'bank_transfer'] as const)
        ).map((m) => {
          const disabled = m === 'credit_card' && !cardPayments
          const active = paymentMethod === m
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => (m === 'bank_transfer' ? goToIbanPage() : setPaymentMethod(m))}
              className={`rounded-xl border px-3 py-3 text-xs font-bold transition disabled:opacity-45 ${
                active
                  ? isDark
                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border-primary-600 bg-primary-50 text-primary-800 ring-1 ring-primary-500/20'
                  : isDark
                    ? 'border-white/15 bg-white/5 text-white/80'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {m === 'credit_card' ? '💳 Kredi / Banka Kartı' : '🏦 Havale / EFT'}
            </button>
          )
        })}
      </div>
      {enabledCurrencies.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className={isDark ? 'text-white/75' : 'text-gray-600'}>Para birimi:</span>
          {enabledCurrencies.map((c) => (
            <button
              key={c}
              type="button"
              disabled={items.some((it) => it.currency)}
              onClick={() => setCurrency(c)}
              className={`rounded-lg border px-2.5 py-1 font-bold disabled:opacity-50 ${currency === c ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              {c} {SYM[c]}
            </button>
          ))}
        </div>
      )}
      <div className={isDark ? 'rounded-2xl bg-white p-4 text-gray-900' : ''}>
        <ConsentChecks legal={legal} kvkk={kvkk} onKvkk={setKvkk} terms={terms} onTerms={setTerms} requireTerms={paymentMethod === 'credit_card'} />
      </div>
      {paymentMethod === 'credit_card' && (
        <div className={`space-y-2 rounded-2xl p-3.5 text-xs ${isDark ? 'bg-white/10 text-white/85' : 'bg-emerald-50 text-emerald-800'}`}>
          <p>Kart bilgileriniz yalnızca bankanın 3D Secure güvenli ödeme sayfasında girilir.</p>
          <PaymentTrustBadges />
        </div>
      )}
    </div>
  )

  const sectionCls = isDark
    ? 'min-h-[80vh] bg-gradient-to-br from-slate-950 via-slate-900 to-primary-950 py-12 text-white'
    : isEmerald
      ? 'min-h-[80vh] bg-gradient-to-b from-emerald-950 via-emerald-900/95 to-stone-50 py-12'
      : isGlass
        ? 'min-h-[80vh] bg-gradient-to-br from-primary-50 via-emerald-50 to-amber-50 py-12'
        : isWarm
          ? 'min-h-[80vh] bg-[#FDF4EB] py-12'
          : isPaper
            ? 'min-h-[80vh] bg-stone-100 py-12'
            : 'py-10 sm:py-14'

  const headingCls = isDark || isEmerald ? 'text-white' : 'text-gray-900'
  const subHeadingCls = isDark || isEmerald ? 'text-white/80' : 'text-gray-600'

  return (
    <section className={sectionCls}>
      {activeStyle === 'hero_banner_checkout' && (
        <div className="mb-8 bg-primary-800 py-10 text-center text-white">
          <div className="mx-auto max-w-[var(--site-container)] px-4">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-300">{siteName || 'Güvenli Bağış'}</p>
            <h1 className="mt-1 font-heading text-3xl font-black sm:text-4xl">Güvenli Bağış Merkezi</h1>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-[var(--site-container)] px-4 sm:px-6">
        {checkoutStyle !== 'hero_banner_checkout' && (
          <div className="mb-8 text-center">
            <h1 className={`font-heading text-3xl font-black sm:text-4xl ${headingCls}`}>
              Bağışınızı Tamamlayın
            </h1>
            <p className={`mt-2 text-sm ${subHeadingCls}`}>
              {siteName ? `${siteName} güvenli bağış ekranı` : 'Güvenli bağış ve anında makbuz'}
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="mx-auto mb-6 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {activeStyle === 'progress_header_checkout' ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-600">
                <span>Adım {step} / 3</span>
                <span>%{Math.round((step / 3) * 100)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-primary-600 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
              </div>
            </div>
            {step === 1 && (
              <div className="space-y-4">
                {orderSummary}
                <button type="button" onClick={() => setStep(2)} className={primaryBtnCls}>Devam Et →</button>
              </div>
            )}
            {step === 2 && (
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-heading text-lg font-bold text-gray-900">Bağışçı Bilgileri</h2>
                {donorFields}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-700">← Geri</button>
                  <button type="button" onClick={() => setStep(3)} className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-bold text-white">Ödemeye Geç →</button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-heading text-lg font-bold text-gray-900">Ödeme &amp; Onay</h2>
                {paymentOptions}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-700">← Geri</button>
                  <button type="button" disabled={checkout.isPending} onClick={submit} className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-black text-white disabled:opacity-60">
                    {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışla`}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeStyle === 'magazine_editorial' ? (
          <div className="grid items-start gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <div className="border-b-2 border-gray-900 pb-4">
                <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary-700">Editoryal Ödeme</span>
                <h2 className="mt-1 font-heading text-3xl font-black text-gray-900">Katkınızla Bir Hayat Değişsin</h2>
              </div>
              <div className={`${cardCls} space-y-6`}>
                {donorFields}
                {paymentOptions}
                <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                  {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
                </button>
              </div>
            </div>
            <div className="lg:sticky lg:top-24">{orderSummary}</div>
          </div>
        ) : activeStyle === 'stepper_minimal' ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-gray-100 p-1.5 text-xs font-bold">
              {([
                [1, '1. Sepet'],
                [2, '2. Bilgiler'],
                [3, '3. Ödeme'],
              ] as const).map(([n, label]) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStep(n)}
                  className={`rounded-xl py-2.5 transition ${step === n ? 'bg-white text-primary-800 shadow-sm' : 'text-gray-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {step === 1 && (
              <div className="space-y-4">
                {orderSummary}
                <button type="button" onClick={() => setStep(2)} className={primaryBtnCls}>
                  Bilgilerime Geç →
                </button>
              </div>
            )}
            {step === 2 && (
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-heading text-lg font-bold text-gray-900">Bağışçı Bilgileri</h2>
                {donorFields}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-700">← Geri</button>
                  <button type="button" onClick={() => setStep(3)} className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-bold text-white">Ödemeye Geç →</button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-heading text-lg font-bold text-gray-900">Ödeme Yöntemi &amp; Onay</h2>
                {paymentOptions}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-700">← Geri</button>
                  <button type="button" disabled={checkout.isPending} onClick={submit} className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-black text-white disabled:opacity-60">
                    {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışla`}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeStyle === 'express_single' || activeStyle === 'compact_mobile' ? (
          <div className={`mx-auto space-y-6 ${activeStyle === 'compact_mobile' ? 'max-w-md' : 'max-w-3xl'}`}>
            {orderSummary}
            <div className={`${cardCls} space-y-5`}>
              <h2 className="font-heading text-lg font-bold text-gray-900">Hızlı Bağış Formu</h2>
              {donorFields}
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Güvenle Bağışla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'bento_checkout' ? (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className={`${cardCls} space-y-4 lg:col-span-7`}>
              <h2 className="font-heading text-lg font-bold text-gray-900">1. Bağışçı Bilgileri</h2>
              {donorFields}
            </div>
            <div className="lg:col-span-5">{orderSummary}</div>
            <div className={`${cardCls} space-y-4 lg:col-span-7`}>
              <h2 className="font-heading text-lg font-bold text-gray-900">2. Ödeme &amp; Onay</h2>
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className={`${cardCls} flex flex-col justify-center space-y-2.5 text-xs text-gray-600 lg:col-span-5`}>
              <h3 className="font-heading text-base font-bold text-gray-900">Neden Güvenli?</h3>
              <p>✓ 256-bit SSL şifreleme ve banka 3D Secure koruması</p>
              <p>✓ Ödeme sonrası anında doğrulama kodlu PDF makbuz</p>
              <p>✓ SMS ve e-posta ile bağış bilgilendirmesi</p>
            </div>
          </div>
        ) : activeStyle === 'split_reversed' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.25fr]">
            <div className="lg:sticky lg:top-24">{orderSummary}</div>
            <div className={`${cardCls} space-y-6`}>
              <div>
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">1. Bağışçı Bilgileri</h2>
                {donorFields}
              </div>
              <div className="border-t border-gray-100 pt-5">
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">2. Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'receipt_preview' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className={`${cardCls} space-y-6`}>
              <h2 className="font-heading text-lg font-bold text-gray-900">Bağışçı &amp; Ödeme Bilgileri</h2>
              {donorFields}
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="space-y-4 lg:sticky lg:top-24">
              <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-[#FFFDF8] p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-stone-500">Makbuz Önizleme</span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">TASLAK</span>
                </div>
                <div className="mt-4 space-y-1 text-xs text-stone-600">
                  <p><b>Kurum:</b> {siteName || 'Kurum'}</p>
                  <p><b>Bağışçı:</b> {(firstName || lastName) ? `${firstName} ${lastName}`.trim() : 'Adınız Soyadınız'}</p>
                  {isGift && onBehalfOf && <p><b>Adına:</b> {onBehalfOf}</p>}
                </div>
                <div className="mt-4 space-y-1.5 border-y border-stone-200 py-3 text-xs">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{it.campaignTitle} {it.quantity && it.quantity > 1 ? `×${it.quantity}` : ''}</span>
                      <b>{((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {sym}</b>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between text-base font-black text-stone-900">
                  <span>TOPLAM</span>
                  <span>{total.toLocaleString('tr-TR')} {sym}</span>
                </div>
              </div>
              {orderSummary}
            </div>
          </div>
        ) : activeStyle === 'multi_card_grid' ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it, idx) => (
                <div key={idx} className={cardCls}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-heading text-base font-bold text-gray-900">{it.campaignTitle}</h3>
                    <button type="button" onClick={() => persist(items.filter((_, i) => i !== idx))} className="text-xs font-bold text-rose-500">Sil</button>
                  </div>
                  <div className="mt-3 text-xl font-black text-primary-700">
                    {((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {sym}
                  </div>
                </div>
              ))}
            </div>
            <div className={`${cardCls} mx-auto max-w-2xl space-y-5`}>
              {donorFields}
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'one_step_sidebar' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[340px_1fr]">
            <aside className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl lg:sticky lg:top-24">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">{siteName || 'Bağış Özeti'}</div>
              <div className="mt-4 space-y-2.5 text-sm">
                {items.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2 border-b border-white/10 pb-2">
                    <span className="text-white/85">{it.campaignTitle} {it.quantity && it.quantity > 1 ? `×${it.quantity}` : ''}</span>
                    <span className="font-bold text-amber-300">{((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {sym}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-xs text-white/70">Toplam</span>
                <span className="text-2xl font-black text-amber-400">{total.toLocaleString('tr-TR')} {sym}</span>
              </div>
            </aside>
            <div className={`${cardCls} space-y-6`}>
              {donorFields}
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Güvenle Bağışla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'floating_cards' ? (
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="shadow-xl rounded-3xl">{orderSummary}</div>
            <div className={`${cardCls} shadow-xl`}>
              <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">Bağışçı Bilgileri</h2>
              {donorFields}
            </div>
            <div className={`${cardCls} space-y-4 shadow-xl`}>
              <h2 className="font-heading text-lg font-bold text-gray-900">Ödeme &amp; Onay</h2>
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'split_fullscreen' ? (
          <div className="grid overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl lg:grid-cols-[45%_55%]">
            <div className="flex flex-col justify-between bg-slate-950 p-6 text-white sm:p-8">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-400">{siteName || 'Güvenli Bağış'}</div>
                <h2 className="font-heading text-2xl font-black">Bağışınızla Umut Olun</h2>
                <p className="mt-2 text-xs text-white/75">Her katkınız şeffaflıkla ihtiyaç sahiplerine ulaştırılır.</p>
              </div>
              <div className="mt-6 space-y-2 border-t border-white/15 pt-4 text-sm">
                {items.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="text-white/85">{it.campaignTitle} {it.quantity && it.quantity > 1 ? `×${it.quantity}` : ''}</span>
                    <span className="font-bold text-amber-300">{((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {sym}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/15 pt-3 text-lg font-black">
                  <span>Toplam</span>
                  <span className="text-amber-400">{total.toLocaleString('tr-TR')} {sym}</span>
                </div>
              </div>
            </div>
            <div className="space-y-6 p-6 sm:p-8">
              {donorFields}
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'accordion_steps' ? (
          <div className="mx-auto max-w-2xl space-y-3">
            {([
              [1, `1. Sepetiniz (${items.length} kalem · ${total.toLocaleString('tr-TR')} ${sym})`, orderSummary],
              [2, '2. Bağışçı Bilgileri', donorFields],
              [3, '3. Ödeme Yöntemi & Onay', (
                <div key="pay" className="space-y-4">
                  {paymentOptions}
                  <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                    {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Güvenle Bağışla`}
                  </button>
                </div>
              )],
            ] as const).map(([n, label, content]) => (
              <div key={n} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setAccordionOpen(n)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-bold text-gray-900"
                >
                  <span>{label}</span>
                  <span>{accordionOpen === n ? '−' : '+'}</span>
                </button>
                {accordionOpen === n && <div className="border-t border-gray-100 p-5">{content}</div>}
              </div>
            ))}
          </div>
        ) : activeStyle === 'timeline_flow' ? (
          <div className="mx-auto max-w-3xl space-y-6 border-s-2 border-primary-200 ps-6">
            <div className="relative">
              <span className="absolute -start-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">1</span>
              {orderSummary}
            </div>
            <div className="relative">
              <span className="absolute -start-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">2</span>
              <div className={cardCls}>
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">Bağışçı Bilgileri</h2>
                {donorFields}
              </div>
            </div>
            <div className="relative">
              <span className="absolute -start-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">3</span>
              <div className={`${cardCls} space-y-4`}>
                <h2 className="font-heading text-lg font-bold text-gray-900">Ödeme &amp; Onay</h2>
                {paymentOptions}
                <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                  {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
                </button>
              </div>
            </div>
          </div>
        ) : activeStyle === 'card_tabs' ? (
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!cardPayments}
                onClick={() => setPaymentMethod('credit_card')}
                className={`rounded-2xl border p-4 text-left transition disabled:opacity-45 ${paymentMethod === 'credit_card' ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-500/20' : 'border-gray-200 bg-white'}`}
              >
                <div className="text-lg font-black text-gray-900">💳 Kredi / Banka Kartı</div>
                <div className="text-xs text-gray-500">3D Secure ile anında ödeme</div>
              </button>
              <button
                type="button"
                onClick={goToIbanPage}
                className={`rounded-2xl border p-4 text-left transition ${paymentMethod === 'bank_transfer' ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-500/20' : 'border-gray-200 bg-white'}`}
              >
                <div className="text-lg font-black text-gray-900">🏦 Havale / EFT</div>
                <div className="text-xs text-gray-500">IBAN ve referans kodu ile</div>
              </button>
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className={`${cardCls} space-y-5`}>
                {donorFields}
                {paymentOptions}
                <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                  {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
                </button>
              </div>
              <div className="lg:sticky lg:top-24">{orderSummary}</div>
            </div>
          </div>
        ) : activeStyle === 'two_column_compact' ? (
          <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className={`${cardCls} space-y-4 !p-4`}>
              <div>
                <h2 className="mb-2 font-heading text-base font-bold text-gray-900">1. Bağışçı Bilgileri</h2>
                {donorFields}
              </div>
              <div className="border-t border-gray-100 pt-3">
                <h2 className="mb-2 font-heading text-base font-bold text-gray-900">2. Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="lg:sticky lg:top-24">{orderSummary}</div>
          </div>
        ) : activeStyle === 'ramadan_special' ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-amber-400/40 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-300">🌙 Ramazan &amp; İnfak Özel</span>
                  <h2 className="mt-1 font-heading text-2xl font-black text-white">Paylaştıkça Bereketlenen İyilik</h2>
                </div>
                <span className="rounded-full border border-amber-400/50 bg-amber-400/15 px-3.5 py-1.5 text-xs font-bold text-amber-200">
                  Toplam: {total.toLocaleString('tr-TR')} {sym}
                </span>
              </div>
            </div>
            <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_1fr]">
              <div className={`${cardCls} space-y-6`}>
                <div>
                  <h2 className="mb-3 font-heading text-lg font-bold text-white">1. Bağışçı Bilgileri</h2>
                  {donorFields}
                </div>
                <div className="border-t border-white/15 pt-5">
                  <h2 className="mb-3 font-heading text-lg font-bold text-white">2. Ödeme Yöntemi</h2>
                  {paymentOptions}
                </div>
                <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                  {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
                </button>
              </div>
              <div className="lg:sticky lg:top-24">{orderSummary}</div>
            </div>
          </div>
        ) : activeStyle === 'donor_wall_split' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className={`${cardCls} space-y-6`}>
              <div>
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">1. Bağışçı Bilgileri</h2>
                {donorFields}
              </div>
              <div className="border-t border-gray-100 pt-5">
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">2. Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="space-y-4 lg:sticky lg:top-24">
              {orderSummary}
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 text-xs text-emerald-950">
                <div className="mb-2 font-heading text-sm font-bold">Şeffaflık &amp; Güven Taahhüdü</div>
                <ul className="space-y-1.5 text-emerald-900/90">
                  <li>✓ Bağışınızın %100&apos;ü ilgili kampanya hesabına aktarılır</li>
                  <li>✓ Onay anında doğrulama kodlu PDF makbuz üretilir</li>
                  <li>✓ Tüm işlemler 256-bit SSL &amp; 3D Secure ile korunur</li>
                </ul>
              </div>
            </div>
          </div>
        ) : activeStyle === 'mobile_app_sheet' ? (
          <div className="mx-auto max-w-md space-y-4 pb-24">
            {orderSummary}
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
              <h2 className="font-heading text-base font-bold text-gray-900">Bağışçı Bilgileri</h2>
              {donorFields}
              <div className="border-t border-gray-100 pt-4">
                <h2 className="mb-3 font-heading text-base font-bold text-gray-900">Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
            </div>
            <div className="sticky bottom-3 z-20 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-600">
                <span>Ödenecek Tutar</span>
                <span className="text-base font-black text-primary-700">{total.toLocaleString('tr-TR')} {sym}</span>
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : 'Bağışı Tamamla →'}
              </button>
            </div>
          </div>
        ) : activeStyle === 'quick_preset_checkout' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className={`${cardCls} space-y-6`}>
              {donorFields}
              <div className="border-t border-gray-100 pt-5">{paymentOptions}</div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="space-y-4 lg:sticky lg:top-24">
              {items[0] && !items[0].locked && (
                <div className="rounded-3xl border border-primary-200 bg-primary-50/70 p-4">
                  <div className="text-xs font-bold text-primary-900">Tek tıkla ekstra iyilik ekleyin</div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {[100, 250, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => persist([...items, { campaignId: items[0].campaignId, campaignTitle: `${items[0].campaignTitle} (+${amt} ${sym})`, amount: amt, quantity: 1, currency }])}
                        className="rounded-xl border border-primary-300 bg-white px-3 py-1.5 text-xs font-extrabold text-primary-800 hover:bg-primary-100"
                      >
                        + {amt} {sym}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {orderSummary}
            </div>
          </div>
        ) : activeStyle === 'split_sticky_dark' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_1fr]">
            <div className={`${cardCls} space-y-6`}>
              <div>
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">1. Bağışçı Bilgileri</h2>
                {donorFields}
              </div>
              <div className="border-t border-gray-100 pt-5">
                <h2 className="mb-3 font-heading text-lg font-bold text-gray-900">2. Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-2xl lg:sticky lg:top-24">
              <div className="mb-4 text-xs font-extrabold uppercase tracking-wider text-amber-400">Bağış Özeti</div>
              <div className="space-y-2.5 border-b border-white/15 pb-4 text-sm">
                {items.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="text-white/85">{it.campaignTitle} {it.quantity && it.quantity > 1 ? `×${it.quantity}` : ''}</span>
                    <b className="text-white">{((Number(it.amount) || 0) * (Number(it.quantity) || 1)).toLocaleString('tr-TR')} {sym}</b>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-white/75">Toplam</span>
                <span className="text-2xl font-black text-amber-400">{total.toLocaleString('tr-TR')} {sym}</span>
              </div>
              <p className="mt-4 text-[11px] text-white/60">256-bit SSL güvenli ödeme ve anında dijital makbuz.</p>
            </div>
          </div>
        ) : activeStyle === 'certificate_preview' ? (
          <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className={`${cardCls} space-y-6`}>
              {donorFields}
              <div className="border-t border-gray-100 pt-5">{paymentOptions}</div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="space-y-4 lg:sticky lg:top-24">
              <div className="rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-[#FFFDF8] to-amber-50/60 p-6 text-center shadow-sm">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-700">Teşekkür Sertifikası Önizleme</div>
                <div className="mt-2 font-heading text-lg font-black text-gray-900">
                  {(firstName || lastName) ? `${firstName} ${lastName}`.trim() : 'Sayın Bağışçımız'}
                </div>
                <p className="mt-1.5 text-xs text-gray-600">
                  {siteName || 'Kurumumuz'} aracılığıyla gerçekleştirdiğiniz{' '}
                  <b className="text-primary-800">{total.toLocaleString('tr-TR')} {sym}</b> tutarındaki iyilik katkınız için teşekkür ederiz.
                </p>
              </div>
              {orderSummary}
            </div>
          </div>
        ) : activeStyle === 'nordic_clean' ? (
          <div className="mx-auto max-w-5xl grid items-start gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-7 space-y-6">
              <h2 className="font-heading text-lg font-semibold text-slate-900">Bağışçı Bilgileri</h2>
              {donorFields}
              <div className="border-t border-slate-200 pt-5">
                <h2 className="mb-3 font-heading text-lg font-semibold text-slate-900">Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="lg:sticky lg:top-24">{orderSummary}</div>
          </div>
        ) : activeStyle === 'midnight_emerald' || activeStyle === 'royal_navy_gold' ? (
          <div className={`rounded-[2rem] p-6 sm:p-8 shadow-2xl ${activeStyle === 'royal_navy_gold' ? 'bg-gradient-to-br from-[#0B1736] via-[#10204A] to-[#0B1736]' : 'bg-gradient-to-br from-emerald-950 via-slate-950 to-emerald-950'}`}>
            <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_1fr]">
              <div className={`${cardCls} space-y-6`}>
                <h2 className="font-heading text-lg font-bold text-amber-300">
                  {activeStyle === 'royal_navy_gold' ? 'Kurumsal Bağış & Ödeme' : 'Gece Zümrütü Ödeme Merkezi'}
                </h2>
                {donorFields}
                <div className="border-t border-white/15 pt-5">{paymentOptions}</div>
                <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                  {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
                </button>
              </div>
              <div className="lg:sticky lg:top-24">{orderSummary}</div>
            </div>
          </div>
        ) : activeStyle === 'wide_three_column' ? (
          <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.15fr_1fr]">
            <div>{orderSummary}</div>
            <div className={`${cardCls} space-y-5`}>
              <h2 className="font-heading text-base font-bold text-gray-900">Bağışçı Bilgileri</h2>
              {donorFields}
            </div>
            <div className={`${cardCls} space-y-5 lg:sticky lg:top-24`}>
              <h2 className="font-heading text-base font-bold text-gray-900">Ödeme Yöntemi</h2>
              {paymentOptions}
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'top_summary_strip' ? (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 px-5 py-4">
              <div>
                <div className="text-xs font-bold text-primary-900">{items.length} Kalem Bağış Sepeti</div>
                <div className="text-[11px] text-primary-700 truncate max-w-xs">{items.map((i) => i.campaignTitle).join(', ')}</div>
              </div>
              <div className="text-xl font-black text-primary-800">{total.toLocaleString('tr-TR')} {sym}</div>
            </div>
            <div className={`${cardCls} space-y-6`}>
              {donorFields}
              <div className="border-t border-gray-100 pt-5">{paymentOptions}</div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : activeStyle === 'impact_counter_checkout' || activeStyle === 'dua_blessing_header' ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-center">
              <p className="font-heading text-sm font-bold text-emerald-950">
                {activeStyle === 'dua_blessing_header'
                  ? '🤲 “Veren el, alan elden üstündür.” — Hayrınız kabul, bereketiniz daim olsun.'
                  : `🌍 Bu katkınızla ${items.length} farklı iyilik halkasına doğrudan destek oluyorsunuz.`}
              </p>
            </div>
            <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_1fr]">
              <div className={`${cardCls} space-y-6`}>
                {donorFields}
                <div className="border-t border-gray-100 pt-5">{paymentOptions}</div>
                <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                  {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
                </button>
              </div>
              <div className="lg:sticky lg:top-24">{orderSummary}</div>
            </div>
          </div>
        ) : activeStyle === 'minimal_single_focus' ? (
          <div className="mx-auto max-w-xl space-y-6">
            <div className={`${cardCls} space-y-6`}>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-sm font-bold text-gray-900">Hızlı Bağış ({items.length} kalem)</span>
                <span className="text-lg font-black text-primary-700">{total.toLocaleString('tr-TR')} {sym}</span>
              </div>
              {donorFields}
              <div className="border-t border-gray-100 pt-5">{paymentOptions}</div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_1fr]">
            <div className={`${cardCls} space-y-6`}>
              <div>
                <h2 className={`mb-3 font-heading text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>1. Bağışçı Bilgileri</h2>
                {donorFields}
              </div>
              <div className={`border-t pt-5 ${isDark ? 'border-white/15' : 'border-gray-100'}`}>
                <h2 className={`mb-3 font-heading text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>2. Ödeme Yöntemi</h2>
                {paymentOptions}
              </div>
              <button type="button" disabled={checkout.isPending} onClick={submit} className={primaryBtnCls}>
                {checkout.isPending ? 'Hazırlanıyor…' : `${total.toLocaleString('tr-TR')} ${sym} Bağışı Tamamla`}
              </button>
            </div>
            <div className="lg:sticky lg:top-24">{orderSummary}</div>
          </div>
        )}
        {activeShowFaq && (
          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm">
            <h3 className="font-heading text-base font-bold text-gray-900">Sık Sorulan Sorular</h3>
            <div className="mt-3 divide-y divide-gray-100 text-xs text-gray-600">
              <details className="py-2.5">
                <summary className="cursor-pointer font-semibold text-gray-800">Bağış makbuzum ne zaman ulaşır?</summary>
                <p className="mt-1.5">Kredi kartı bağışlarında ödeme onaylandığı anda dijital PDF makbuzunuz oluşturulur ve e-posta/SMS ile iletilir.</p>
              </details>
              <details className="py-2.5">
                <summary className="cursor-pointer font-semibold text-gray-800">Kart bilgilerim güvende mi?</summary>
                <p className="mt-1.5">Kart bilgileriniz sistemimizde saklanmaz; doğrudan bankanın 256-bit SSL ve 3D Secure korumalı sayfasında işlenir.</p>
              </details>
              <details className="py-2.5">
                <summary className="cursor-pointer font-semibold text-gray-800">Havale / EFT ile nasıl bağış yapabilirim?</summary>
                <p className="mt-1.5">Havale / EFT seçeneğini seçip formu onayladığınızda size özel açıklama kodu ve IBAN bilgisi ekranda görünür.</p>
              </details>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
