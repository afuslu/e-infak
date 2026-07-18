'use client'

import { useEffect, useState } from 'react'
import { useCreateCheckout, type CheckoutSessionResponse } from '@e-infak/api-client'

export interface CartItem {
  campaignId: string
  campaignTitle: string
  amount: number
  quantity?: number
  metadata?: Record<string, unknown>
}

const makeKey = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

export function DonationCart() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'cart' | 'donor' | 'transfer'>('cart')
  const [cart, setCart] = useState<CartItem[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card')
  const [locale, setLocale] = useState<'tr' | 'en' | 'ar'>('tr')
  const [currency] = useState<'TRY' | 'EUR' | 'USD'>('TRY')
  const [kvkk, setKvkk] = useState(false)
  const [allowEmail, setAllowEmail] = useState(false)
  const [allowSms, setAllowSms] = useState(false)
  const [error, setError] = useState('')
  const [transfer, setTransfer] = useState<CheckoutSessionResponse | null>(null)
  const checkout = useCreateCheckout()

  const persist = (next: CartItem[]) => {
    setCart(next)
    localStorage.setItem('einfak_cart', JSON.stringify(next))
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('einfak_cart') || '[]')
      if (Array.isArray(saved)) setCart(saved)
    } catch {
      localStorage.removeItem('einfak_cart')
    }
    const add = (event: Event) => {
      const item = (event as CustomEvent<CartItem>).detail
      setCart((current) => {
        const found = current.find((entry) => entry.campaignId === item.campaignId && entry.amount === item.amount)
        const next = found
          ? current.map((entry) => entry === found ? { ...entry, quantity: (entry.quantity || 1) + (item.quantity || 1) } : entry)
          : [...current, { ...item, quantity: item.quantity || 1 }]
        localStorage.setItem('einfak_cart', JSON.stringify(next))
        return next
      })
      setOpen(true)
    }
    window.addEventListener('add-to-donation-cart', add)
    return () => window.removeEventListener('add-to-donation-cart', add)
  }, [])

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
    setError('')
    try {
      const result = await checkout.mutateAsync({
        items: cart.map((item) => ({
          campaign_id: item.campaignId,
          quantity: item.quantity || 1,
          unit_amount_cents: Math.round(item.amount * 100),
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
      })
      if (result.redirect_url) {
        window.location.assign(result.redirect_url)
        return
      }
      setTransfer(result)
      setStep('transfer')
      persist([])
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ödeme başlatılamadı. Lütfen tekrar deneyin.')
    }
  }

  if (!cart.length && !open) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Bağış sepetini aç, ${cart.length} kalem`}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-2xl text-white shadow-2xl">
        🤝
        {!!cart.length && <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-black text-slate-900">{cart.length}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Bağış sepeti">
          <button type="button" className="flex-1" aria-label="Sepeti kapat" onClick={() => setOpen(false)} />
          <aside dir={locale === 'ar' ? 'rtl' : 'ltr'} className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
            <header className="mb-5 flex items-center justify-between border-b pb-4">
              <h2 className="text-xl font-black text-slate-900">Bağış Sepetim</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="rounded-full p-2">✕</button>
            </header>
            {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {step === 'cart' && (
              <div className="space-y-4">
                {!cart.length ? <p className="py-12 text-center text-slate-500">Sepetiniz boş.</p> : cart.map((item, index) => (
                  <div key={`${item.campaignId}-${item.amount}`} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex justify-between gap-3">
                      <p className="font-bold text-slate-800">{item.campaignTitle}</p>
                      <button type="button" onClick={() => persist(cart.filter((_, i) => i !== index))} className="text-xs font-bold text-red-600">Sil</button>
                    </div>
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
                  </div>
                ))}
                {!!cart.length && (
                  <>
                    <div className="flex justify-between border-t pt-4"><span>Toplam</span><b className="text-xl">{total.toLocaleString('tr-TR')} ₺</b></div>
                    <button type="button" onClick={() => setStep('donor')} className="w-full rounded-xl bg-primary-600 py-3 font-black text-white">Bağışı Tamamla</button>
                    <button type="button" onClick={() => persist([])} className="w-full text-xs font-bold text-slate-400">Sepeti temizle</button>
                  </>
                )}
              </div>
            )}

            {step === 'donor' && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-600">Dil
                  <select value={locale} onChange={(e) => setLocale(e.target.value as 'tr' | 'en' | 'ar')} className="mt-1 w-full rounded-xl border p-3">
                    <option value="tr">Türkçe</option><option value="en">English</option><option value="ar">العربية</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input aria-label="Ad" placeholder="Ad *" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-xl border p-3" />
                  <input aria-label="Soyad" placeholder="Soyad *" value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-xl border p-3" />
                </div>
                <input aria-label="E-posta" type="email" placeholder="E-posta *" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border p-3" />
                <input aria-label="Telefon" type="tel" placeholder="Telefon *" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border p-3" />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPaymentMethod('credit_card')} className={`rounded-xl border p-3 text-xs font-bold ${paymentMethod === 'credit_card' ? 'border-primary-600 bg-primary-50' : ''}`}>Kart / Ziraat Pay</button>
                  <button type="button" onClick={() => setPaymentMethod('bank_transfer')} className={`rounded-xl border p-3 text-xs font-bold ${paymentMethod === 'bank_transfer' ? 'border-primary-600 bg-primary-50' : ''}`}>Havale / EFT</button>
                </div>
                <label className="flex gap-2 text-xs"><input type="checkbox" checked={allowEmail} onChange={(e) => setAllowEmail(e.target.checked)} /> E-posta izni</label>
                <label className="flex gap-2 text-xs"><input type="checkbox" checked={allowSms} onChange={(e) => setAllowSms(e.target.checked)} /> SMS izni</label>
                <label className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold"><input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} /> KVKK aydınlatma metnini okudum. *</label>
                <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">Kart bilgileriniz yalnızca Ziraat Pay’in güvenli sayfasında girilir.</p>
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
