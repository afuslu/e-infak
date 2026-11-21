'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { errorMessage } from '../lib/api-error'
import { useEffect, useMemo, useState } from 'react'
import { useCreateCheckout, useOrgSettings, type CheckoutSessionResponse } from '@e-infak/api-client'
import type { CartStyle } from '../lib/site-design'
import { trackConversion } from '../lib/analytics'
import { ConsentChecks, useCardFallback, useCheckoutLegal } from './CheckoutConsent'
import { PaymentTrustBadges } from './site/PaymentTrustBadges'

const CURRENCY_SYMBOL: Record<'TRY' | 'EUR' | 'USD', string> = { TRY: '₺', EUR: '€', USD: '$' }

export interface CartItem {
  campaignId: string
  campaignTitle: string
  amount: number
  quantity?: number
  metadata?: Record<string, unknown>
  /** Currency the amount was entered in (builder donation cards follow the site currency). */
  currency?: 'TRY' | 'EUR' | 'USD'
}

const notifyCart = () => window.dispatchEvent(new Event('donation-cart-changed'))

const makeKey = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

const PREVIEW_SAMPLE_CART: CartItem[] = [
  { campaignId: 'preview-1', campaignTitle: 'Kurban Bağışı (Örnek)', amount: 5000, quantity: 1, currency: 'TRY' },
  { campaignId: 'preview-2', campaignTitle: 'Su Kuyusu Hissesi (Örnek)', amount: 1250, quantity: 1, currency: 'TRY' },
]

export function DonationCart({ cartStyle: propCartStyle = 'drawer' }: { cartStyle?: CartStyle }) {
  const router = useRouter()
  const [styleOverride, setStyleOverride] = useState<CartStyle | null>(null)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const cartStyle = styleOverride || propCartStyle
  const [open, setOpen] = useState(false)
  const [redirectNotice, setRedirectNotice] = useState(false)
  const [step, setStep] = useState<'cart' | 'donor' | 'transfer'>('cart')
  const [cart, setCart] = useState<CartItem[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card')
  const [locale, setLocale] = useState<'tr' | 'en' | 'ar'>('tr')
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
  const [kvkk, setKvkk] = useState(false)
  const [terms, setTerms] = useState(false)
  const { legal, cardPayments } = useCheckoutLegal()
  useCardFallback(cardPayments, paymentMethod, setPaymentMethod)
  const [isGift, setIsGift] = useState(false)
  const [onBehalfOf, setOnBehalfOf] = useState('')
  const [allowEmail, setAllowEmail] = useState(false)
  const [allowSms, setAllowSms] = useState(false)
  const [error, setError] = useState('')
  const [transfer, setTransfer] = useState<CheckoutSessionResponse | null>(null)
  const checkout = useCreateCheckout()

  const persist = (next: CartItem[]) => {
    setCart(next)
    if (isPreviewMode) return
    localStorage.setItem('einfak_cart', JSON.stringify(next))
    notifyCart()
  }

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get('preview') === '1'
    if (preview) setIsPreviewMode(true)
    try {
      const saved = JSON.parse(localStorage.getItem('einfak_cart') || '[]')
      if (Array.isArray(saved) && saved.length > 0) setCart(saved)
      else if (preview) setCart(PREVIEW_SAMPLE_CART)
    } catch {
      localStorage.removeItem('einfak_cart')
    }
    const add = (event: Event) => {
      const item = (event as CustomEvent<CartItem>).detail
      const stored: CartItem[] = (() => { try { return JSON.parse(localStorage.getItem('einfak_cart') || '[]') } catch { return [] } })()
      const cartCurrency = stored.find((entry) => entry.currency)?.currency
      // One checkout is paid in one currency: amounts typed in € must not be charged as ₺.
      if (item.currency && cartCurrency && item.currency !== cartCurrency) {
        if (!window.confirm(`Sepetinizdeki bağışlar ${cartCurrency} cinsinden. ${item.currency} bağışı eklemek için sepet boşaltılsın mı?`)) return
        localStorage.setItem('einfak_cart', '[]')
      }
      setCart((current) => {
        if (item.currency && cartCurrency && item.currency !== cartCurrency) current = []
        const same = (entry: CartItem) => entry.campaignId === item.campaignId && entry.amount === item.amount
          && JSON.stringify(entry.metadata || {}) === JSON.stringify(item.metadata || {})
        const found = current.find(same)
        const next = found
          ? current.map((entry) => entry === found ? { ...entry, quantity: (entry.quantity || 1) + (item.quantity || 1) } : entry)
          : [...current, { ...item, quantity: item.quantity || 1 }]
        localStorage.setItem('einfak_cart', JSON.stringify(next))
        setTimeout(notifyCart, 0)
        return next
      })
      if (item.currency) setCurrency(item.currency)
      trackConversion('add_to_cart', { campaign_id: item.campaignId })
      if (cartStyle === 'page_redirect') {
        setRedirectNotice(true)
        setTimeout(() => setRedirectNotice(false), 5000)
      } else {
        setOpen(true)
      }
    }
    const show = () => {
      if (cartStyle === 'page_redirect') {
        router.push('/bagis/sepetim')
      } else {
        setOpen(true)
      }
    }
    const followSite = (event: Event) => setCurrency((event as CustomEvent<'TRY' | 'EUR' | 'USD'>).detail)
    const onPreviewMsg = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const msg = event.data
      if (msg?.source !== 'einfak-builder' || msg?.type !== 'checkout-preview-patch') return
      setIsPreviewMode(true)
      if (msg.cart_style) setStyleOverride(msg.cart_style as CartStyle)
      if (typeof msg.open_cart_drawer === 'boolean') {
        if (msg.open_cart_drawer) {
          setCart((cur) => (cur.length > 0 ? cur : PREVIEW_SAMPLE_CART))
          setStep('cart')
          setOpen(true)
        } else {
          setOpen(false)
        }
      }
    }
    window.addEventListener('add-to-donation-cart', add)
    window.addEventListener('open-donation-cart', show)
    window.addEventListener('site-currency-change', followSite)
    window.addEventListener('message', onPreviewMsg)
    return () => {
      window.removeEventListener('add-to-donation-cart', add)
      window.removeEventListener('open-donation-cart', show)
      window.removeEventListener('site-currency-change', followSite)
      window.removeEventListener('message', onPreviewMsg)
    }
  }, [cartStyle, router])

  const update = (index: number, patch: Partial<CartItem>) => {
    persist(cart.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  const total = cart.reduce((sum, item) => sum + item.amount * (item.quantity || 1), 0)

  const submit = async () => {
    if (!firstName || !lastName || !email || !phone) {
      setError('Lütfen zorunlu bağışçı bilgilerini doldurun.')
      return
    }
    if (!kvkk) {
      setError('KVKK aydınlatma metni onayı zorunludur.')
      return
    }
    if (paymentMethod === 'credit_card' && !terms) {
      setError('Ön bilgilendirme formu ve mesafeli bağış sözleşmesi onayı zorunludur.')
      return
    }
    if (isGift && !onBehalfOf.trim()) {
      setError('Kimin adına bağış yaptığınızı yazın.')
      return
    }
    setError('')
    try {
      trackConversion('checkout_started', { item_count: cart.length, payment_method: paymentMethod, currency })
      const result = await checkout.mutateAsync({
        items: cart.map((item) => ({
          campaign_id: item.campaignId,
          quantity: item.quantity || 1,
          unit_amount_cents: Math.round(item.amount * 100),
          on_behalf_of: isGift && onBehalfOf.trim() ? onBehalfOf.trim() : undefined,
          metadata: item.metadata,
        })),
        donor: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          is_anonymous: false,
          allow_email: allowEmail,
          allow_sms: allowSms,
        },
        payment_method: paymentMethod,
        currency,
        locale,
        idempotency_key: makeKey(),
        consent_version: '2026-07',
        kvkk_accepted: kvkk,
        terms_accepted: terms,
      })
      if (result.redirect_url) {
        trackConversion('payment_redirected', { payment_method: paymentMethod, currency })
        window.location.assign(result.redirect_url)
        return
      }
      trackConversion('payment_redirected', { payment_method: paymentMethod, currency })
      setTransfer(result)
      setStep('transfer')
      persist([])
    } catch (err: any) {
      trackConversion('payment_failed', { payment_method: paymentMethod, currency })
      setError(errorMessage(err, 'Ödeme başlatılamadı. Lütfen tekrar deneyin.'))
    }
  }

  if (!cart.length && !open) return null

  const isDarkCart = cartStyle === 'dark_drawer' || cartStyle === 'navy_corporate_drawer'

  const overlayCls =
    cartStyle === 'bottom_sheet' || cartStyle === 'compact_bar'
      ? 'fixed inset-0 z-50 flex flex-col justify-end bg-black/60'
      : cartStyle === 'top_bar_slide'
        ? 'fixed inset-0 z-50 flex flex-col justify-start bg-black/60'
        : cartStyle === 'centered_modal' || cartStyle === 'floating_pill_drawer' || cartStyle === 'floating_card_modal'
          ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
          : cartStyle === 'fullscreen_overlay'
            ? 'fixed inset-0 z-50 flex bg-white'
            : cartStyle === 'left_drawer' || cartStyle === 'wide_left_drawer'
              ? 'fixed inset-0 z-50 flex justify-start bg-black/60'
              : cartStyle === 'floating_popover'
                ? 'fixed inset-0 z-50 flex items-end justify-end bg-black/25 p-4 sm:p-6'
                : 'fixed inset-0 z-50 flex justify-end bg-black/60'

  const panelBase = cartStyle === 'navy_corporate_drawer'
    ? 'bg-[#0F1E3A] text-white border-s border-amber-400/30'
    : isDarkCart
      ? 'bg-slate-950 text-white border border-white/10'
      : cartStyle === 'receipt_drawer'
        ? 'bg-[#FFFDF8] text-stone-900 border-s-2 border-dashed border-stone-400'
        : cartStyle === 'glass_drawer'
          ? 'bg-white/85 backdrop-blur-xl text-slate-900 border-s border-white/50'
          : cartStyle === 'emerald_drawer'
            ? 'bg-[#FFFDF8] text-slate-900 border-t-4 border-t-emerald-700'
            : cartStyle === 'warm_drawer'
              ? 'bg-[#FFF8F0] text-stone-900 border-s border-amber-200'
              : cartStyle === 'soft_sage_drawer'
                ? 'bg-[#F5F9F6] text-slate-900 border-s-4 border-emerald-600/60'
                : cartStyle === 'gold_ornate_drawer'
                  ? 'bg-[#FFFDF8] text-stone-900 border-s-2 border-amber-400 ring-1 ring-amber-300/40'
                  : cartStyle === 'minimal_line_drawer'
                    ? 'bg-white text-slate-950 border-s border-slate-900 shadow-none'
                    : cartStyle === 'high_contrast_drawer'
                      ? 'bg-white text-black border-s-4 border-black'
                      : 'bg-white text-slate-900'

  const panelCls =
    cartStyle === 'fullscreen_overlay'
      ? 'mx-auto h-[100dvh] w-full max-w-3xl overflow-y-auto p-6 sm:p-10 bg-white text-slate-900'
      : cartStyle === 'split_drawer' || cartStyle === 'wide_left_drawer'
        ? `h-[100dvh] w-full max-w-2xl overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl ${panelBase}`
        : cartStyle === 'compact_bar'
          ? `w-full max-h-[65dvh] overflow-y-auto border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl ${panelBase}`
          : cartStyle === 'bottom_sheet'
            ? `mx-auto max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl ${panelBase}`
            : cartStyle === 'top_bar_slide'
              ? `mx-auto max-h-[85dvh] w-full max-w-3xl overflow-y-auto rounded-b-3xl p-6 shadow-2xl ${panelBase}`
              : cartStyle === 'centered_modal' || cartStyle === 'floating_pill_drawer' || cartStyle === 'floating_card_modal'
                ? `max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-[2rem] p-6 shadow-2xl ${panelBase}`
                : cartStyle === 'floating_popover'
                  ? `max-h-[82dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-gray-200 p-6 shadow-2xl ${panelBase}`
                  : `h-[100dvh] w-full max-w-md overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl ${panelBase}`

  return (
    <>
      {redirectNotice && cartStyle === 'page_redirect' && cart.length > 0 && (
        <div className="fixed bottom-24 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-xl">
          <span className="text-xs font-bold text-slate-800">Sepete eklendi ({cart.length})</span>
          <Link href="/bagis/sepetim" onClick={() => setRedirectNotice(false)} className="rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700">
            Ödemeye Git →
          </Link>
        </div>
      )}
      {cartStyle === 'mini_pill' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Bağış sepetini aç, ${cart.length} kalem`}
          className="float-above-tabbar fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-2xl transition hover:bg-primary-700"
        >
          <span>🤝</span>
          <span>{total.toLocaleString('tr-TR')} {currencySymbol}</span>
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs text-slate-900">{cart.length}</span>
        </button>
      ) : cartStyle === 'floating_pill_drawer' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Bağış sepetini aç, ${cart.length} kalem`}
          className="float-above-tabbar fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-5 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-2xl transition hover:bg-primary-700"
        >
          <span>Bağışı Tamamla ({cart.length}) →</span>
        </button>
      ) : cartStyle === 'side_dock' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Bağış sepetini aç, ${cart.length} kalem`}
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-s-2xl bg-primary-600 px-2.5 py-4 text-xs font-black text-white shadow-2xl transition hover:bg-primary-700"
          style={{ writingMode: 'vertical-rl' }}
        >
          🤝 SEPET ({cart.length})
        </button>
      ) : (
        <button type="button" onClick={() => (cartStyle === 'page_redirect' ? router.push('/bagis/sepetim') : setOpen(true))} aria-label={`Bağış sepetini aç, ${cart.length} kalem`}
          className={`float-above-tabbar fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-2xl ${isDarkCart ? 'bg-amber-500 text-slate-950' : 'bg-primary-600'}`}>
          🤝
          {!!cart.length && <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-black text-slate-900">{cart.length}</span>}
        </button>
      )}
      {open && (
        <div className={overlayCls} role="dialog" aria-modal="true" aria-label="Bağış sepeti" onClick={() => setOpen(false)}>
          {cartStyle !== 'centered_modal' && cartStyle !== 'floating_pill_drawer' && cartStyle !== 'floating_card_modal' && cartStyle !== 'top_bar_slide' && cartStyle !== 'bottom_sheet' && cartStyle !== 'compact_bar' && cartStyle !== 'left_drawer' && cartStyle !== 'wide_left_drawer' && cartStyle !== 'fullscreen_overlay' && (
            <button type="button" className="flex-1" aria-label="Sepeti kapat" onClick={() => setOpen(false)} />
          )}
          <aside dir={locale === 'ar' ? 'rtl' : 'ltr'} className={panelCls} onClick={(e) => e.stopPropagation()}>
            <header className={`mb-5 flex items-center justify-between ${cartStyle === 'gradient_drawer' ? '-mx-6 -mt-6 mb-5 bg-gradient-to-r from-primary-700 to-primary-500 px-6 py-4 text-white' : `border-b pb-4 ${isDarkCart ? 'border-white/15' : ''}`}`}>
              <h2 className={`text-xl font-black ${cartStyle === 'gradient_drawer' || isDarkCart ? 'text-white' : 'text-slate-900'}`}>Bağış Sepetim</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="rounded-full p-2">✕</button>
            </header>
            {cartStyle === 'summary_top_drawer' && cart.length > 0 && step === 'cart' && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-primary-50 p-3.5">
                <div>
                  <div className="text-[11px] font-semibold text-primary-800">Toplam Bağış</div>
                  <div className="text-lg font-black text-primary-900">{total.toLocaleString('tr-TR')} {currencySymbol}</div>
                </div>
                <button type="button" onClick={() => setStep('donor')} className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-black text-white hover:bg-primary-700">
                  Hızlı Öde →
                </button>
              </div>
            )}
            {cartStyle === 'social_proof_drawer' && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                ✓ 256-bit SSL Güvenli Ödeme · Anında PDF Makbuz
              </div>
            )}
            {cartStyle === 'impact_badge_drawer' && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                🤲 Her bağışınız ihtiyaç sahiplerine doğrudan ve şeffaf biçimde ulaştırılır.
              </div>
            )}
            {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {step === 'cart' && (
              <div className="space-y-4">
                {!cart.length ? <p className="py-12 text-center text-slate-500">Sepetiniz boş.</p> : cart.map((item, index) => (
                  <div key={`${item.campaignId}-${item.amount}`} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex justify-between gap-3">
                      <p className="font-bold text-slate-800">{item.campaignTitle}</p>
                      <button type="button" onClick={() => persist(cart.filter((_, i) => i !== index))} className="text-xs font-bold text-red-600">Sil</button>
                    </div>
                    {cartStyle === 'qty_stepper_drawer' ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => update(index, { amount: item.amount + 100 })} className="rounded-lg border bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-primary-50">+100</button>
                          <button type="button" onClick={() => update(index, { amount: item.amount + 500 })} className="rounded-lg border bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-primary-50">+500</button>
                        </div>
                        <div className="flex items-center rounded-xl border bg-white p-1">
                          <button type="button" onClick={() => update(index, { quantity: Math.max(1, (item.quantity || 1) - 1) })} className="h-7 w-7 rounded-lg font-bold text-slate-700 hover:bg-slate-100">−</button>
                          <span className="min-w-[2rem] text-center text-xs font-black text-slate-900">{item.quantity || 1}</span>
                          <button type="button" onClick={() => update(index, { quantity: Math.min(100, (item.quantity || 1) + 1) })} className="h-7 w-7 rounded-lg font-bold text-slate-700 hover:bg-slate-100">+</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="text-xs font-bold text-slate-500">Tutar
                          <input inputMode="numeric" value={item.amount} onChange={(e) => update(index, { amount: Math.max(1, Number(e.target.value)) })}
                            className="mt-1 w-full rounded-lg border bg-white p-2 text-slate-900" />
                        </label>
                        <label className="text-xs font-bold text-slate-500">Adet
                          <input type="number" min={1} max={100} value={item.quantity || 1} onChange={(e) => update(index, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="mt-1 w-full rounded-lg border bg-white p-2 text-slate-900" />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
                {!!cart.length && (
                  <>
                    {(cartStyle === 'drawer_upsell' || cartStyle === 'quick_amount_drawer') && cart[0] && (
                      <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-3.5">
                        <p className="text-xs font-bold text-primary-900">
                          {cartStyle === 'quick_amount_drawer' ? 'Hızlı tutar ekle' : 'Bir küçük iyilik daha ekleyin'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[100, 250, 500].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => persist([...cart, { campaignId: cart[0].campaignId, campaignTitle: `${cart[0].campaignTitle} (Ek Katkı)`, amount: amt, quantity: 1, currency }])}
                              className="rounded-xl border border-primary-200 bg-white px-3 py-1.5 text-xs font-bold text-primary-800 hover:bg-primary-100"
                            >
                              + {amt} {currencySymbol}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-4"><span>Toplam</span><b className="text-xl">{total.toLocaleString('tr-TR')} {currencySymbol}</b></div>
                    <button type="button" onClick={() => setStep('donor')} className="w-full rounded-xl bg-primary-600 py-3 font-black text-white">Bağışı Tamamla</button>
                    <Link href="/bagis/sepetim" onClick={() => setOpen(false)} className="block w-full rounded-xl border border-gray-200 py-2.5 text-center text-xs font-bold text-gray-700 hover:bg-gray-50">
                      Tam Sayfa Ödemeye Git →
                    </Link>
                    <button type="button" onClick={() => persist([])} className="w-full text-xs font-bold text-slate-400">Sepeti temizle</button>
                  </>
                )}
              </div>
            )}

            {step === 'donor' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-600">Dil
                    <select value={locale} onChange={(e) => setLocale(e.target.value as 'tr' | 'en' | 'ar')} className="mt-1 w-full rounded-xl border p-3">
                      <option value="tr">Türkçe</option><option value="en">English</option><option value="ar">العربية</option>
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-slate-600">Para birimi
                    <select value={currency} onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR' | 'USD')} disabled={enabledCurrencies.length < 2 || cart.some((item) => item.currency)} className="mt-1 w-full rounded-xl border p-3 disabled:bg-slate-50 disabled:text-slate-500">
                      {enabledCurrencies.map((code) => (
                        <option key={code} value={code}>{code} {CURRENCY_SYMBOL[code]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input aria-label="Ad" placeholder="Ad *" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-xl border p-3" />
                  <input aria-label="Soyad" placeholder="Soyad *" value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-xl border p-3" />
                </div>
                <input aria-label="E-posta" type="email" placeholder="E-posta *" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border p-3" />
                <input aria-label="Telefon" type="tel" placeholder="Telefon *" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border p-3" />
                <div className={`grid gap-2 ${cardPayments ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {cardPayments && <button type="button" onClick={() => setPaymentMethod('credit_card')} className={`rounded-xl border p-3 text-xs font-bold ${paymentMethod === 'credit_card' ? 'border-primary-600 bg-primary-50' : ''}`}>Kredi / Banka Kartı</button>}
                  <button type="button" onClick={() => setPaymentMethod('bank_transfer')} className={`rounded-xl border p-3 text-xs font-bold ${paymentMethod === 'bank_transfer' ? 'border-primary-600 bg-primary-50' : ''}`}>Havale / EFT</button>
                </div>
                {!cardPayments && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">Kartla bağış şu an kullanılamıyor; Havale / EFT ile bağış yapabilirsiniz.</p>}
                <label className="flex gap-2 text-xs font-semibold"><input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} /> Başkası adına bağış yapıyorum</label>
                {isGift && (
                  <input aria-label="Kimin adına" placeholder="Kimin adına? (makbuzda yazar)" maxLength={200} value={onBehalfOf}
                    onChange={(e) => setOnBehalfOf(e.target.value)} className="w-full rounded-xl border p-3" />
                )}
                <label className="flex gap-2 text-xs"><input type="checkbox" checked={allowEmail} onChange={(e) => setAllowEmail(e.target.checked)} /> E-posta izni</label>
                <label className="flex gap-2 text-xs"><input type="checkbox" checked={allowSms} onChange={(e) => setAllowSms(e.target.checked)} /> SMS izni</label>
                <ConsentChecks legal={legal} kvkk={kvkk} onKvkk={setKvkk} terms={terms} onTerms={setTerms}
                  requireTerms={paymentMethod === 'credit_card'} />
                {paymentMethod === 'credit_card' && (
                  <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                    <p>Kart bilgileriniz yalnızca bankanın veya ödeme kuruluşunun güvenli sayfasında girilir.</p>
                    <PaymentTrustBadges />
                  </div>
                )}
                <div className="flex gap-3 pt-3">
                  <button type="button" onClick={() => setStep('cart')} className="flex-1 rounded-xl border py-3 font-bold">Geri</button>
                  <button type="button" onClick={submit} disabled={checkout.isPending} className="flex-1 rounded-xl bg-primary-600 py-3 font-black text-white disabled:opacity-60">{checkout.isPending ? 'Hazırlanıyor…' : 'Devam Et'}</button>
                </div>
              </div>
            )}

            {step === 'transfer' && transfer && (
              <div className="space-y-4 text-center">
                <div className="text-5xl">🏦</div><h3 className="text-xl font-black">Havale kaydınız hazır</h3>
                <div className="rounded-2xl bg-slate-50 p-4 text-left text-sm">
                  <p><b>Banka:</b> {transfer.bank_name || 'Tanımlanmadı'}</p>
                  <p><b>Alıcı:</b> {transfer.account_holder || 'Dernek hesabı'}</p>
                  <p className="break-all"><b>IBAN:</b> {transfer.iban || 'Tanımlanmadı'}</p>
                  <p className="mt-3 rounded-lg bg-amber-100 p-2"><b>Açıklama:</b> {transfer.transfer_reference}</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="w-full rounded-xl bg-slate-900 py-3 font-bold text-white">Kapat</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
