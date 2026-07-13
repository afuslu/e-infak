'use client'

import { useState, useEffect } from 'react'
import { useCreateDonation } from '@e-infak/api-client'

export interface CartItem {
  campaignId: string
  campaignTitle: string
  amount: number
}

export function DonationCart() {
  const [isOpen, setIsOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  
  // Checkout flow state inside cart
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolderName, setCardHolderName] = useState('')
  const [cardExpiryMonth, setCardExpiryMonth] = useState('')
  const [cardExpiryYear, setCardExpiryYear] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  
  const createDonation = useCreateDonation()
  const [errorMsg, setErrorMsg] = useState('')
  const [success, setSuccess] = useState(false)

  // Load cart from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('einfak_cart')
    if (saved) {
      try {
        setCart(JSON.parse(saved))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  // Listen to custom event to add to cart dynamically
  useEffect(() => {
    const handleAddToCart = (e: Event) => {
      const item = (e as CustomEvent).detail as CartItem
      setCart((prev) => {
        const next = [...prev.filter(i => i.campaignId !== item.campaignId), item]
        localStorage.setItem('einfak_cart', JSON.stringify(next))
        return next
      })
      setIsOpen(true) // Automatically open drawer on item add!
    }
    
    window.addEventListener('add-to-donation-cart', handleAddToCart)
    return () => {
      window.removeEventListener('add-to-donation-cart', handleAddToCart)
    }
  }, [])

  const removeFromCart = (campaignId: string) => {
    const next = cart.filter(i => i.campaignId !== campaignId)
    setCart(next)
    localStorage.setItem('einfak_cart', JSON.stringify(next))
  }

  const clearCart = () => {
    setCart([])
    localStorage.removeItem('einfak_cart')
    setIsCheckingOut(false)
    setCheckoutStep(1)
  }

  const handleNextStep = () => {
    if (checkoutStep === 1) {
      if (!firstName || !lastName || !email || !phone) {
        setErrorMsg('Lütfen tüm zorunlu kişisel bilgileri doldurunuz.')
        return
      }
      setErrorMsg('')
      setCheckoutStep(2)
    }
  }

  const handleSubmitCartDonations = async () => {
    setErrorMsg('')
    if (!cardNumber || !cardHolderName || !cardExpiryMonth || !cardExpiryYear || !cardCvv) {
      setErrorMsg('Lütfen kart bilgilerini eksiksiz giriniz.')
      return
    }

    try {
      // Loop and submit all donations sharing the same credit card details
      for (const item of cart) {
        await createDonation.mutateAsync({
          campaign_id: item.campaignId,
          amount_cents: item.amount * 100,
          payment_method: 'credit_card',
          donor: {
            donor_type: 'individual',
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: phone,
          },
          card_number: cardNumber.replace(/\s/g, ''),
          card_holder_name: cardHolderName,
          card_expiry_month: cardExpiryMonth,
          card_expiry_year: cardExpiryYear,
          card_cvv: cardCvv,
        })
      }
      setSuccess(true)
      setCheckoutStep(3)
      setCart([])
      localStorage.removeItem('einfak_cart')
    } catch (e: any) {
      console.error(e)
      setErrorMsg(e?.response?.data?.detail || 'Ödeme işlemi başarısız. Lütfen bilgilerinizi kontrol ediniz.')
    }
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.amount, 0)

  if (cart.length === 0 && !isOpen) return null

  return (
    <>
      {/* Floating cart button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-2xl hover:scale-110 active:scale-95 transition-all"
        aria-label="Sepeti Aç"
      >
        <span className="text-2xl">🤝</span>
        {cart.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-slate-950 border-2 border-white animate-pulse">
            {cart.length}
          </span>
        )}
      </button>

      {/* Cart Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
          {/* Outside click area */}
          <div className="flex-1" onClick={() => setIsOpen(false)} />
          
          {/* Drawer content */}
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between p-6 overflow-y-auto">
            {/* Header */}
            <div>
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <h4 className="font-heading text-lg font-bold text-slate-800">Bağış Sepetim</h4>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
                >
                  ✕
                </button>
              </div>

              {errorMsg && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-600 font-semibold">
                  ⚠️ {errorMsg}
                </div>
              )}

              {success ? (
                <div className="text-center py-10 space-y-4">
                  <span className="text-5xl block">✨</span>
                  <h5 className="font-heading text-xl font-bold text-slate-800">Bağışlarınız Kabul Olsun!</h5>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Sepetinizdeki tüm yardımlar derneklere başarıyla ulaştırılmıştır. Dijital makbuzlarınız e-posta adresinize gönderilecektir.
                  </p>
                  <button
                    onClick={() => {
                      setIsOpen(false)
                      setSuccess(false)
                      setIsCheckingOut(false)
                      setCheckoutStep(1)
                    }}
                    className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Kapat
                  </button>
                </div>
              ) : !isCheckingOut ? (
                /* Cart Items List view */
                <div className="space-y-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      Sepetiniz boş. Bir hayır projesine bağış ekleyin.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {cart.map((item) => (
                          <div 
                            key={item.campaignId} 
                            className="flex justify-between items-center p-3 rounded-xl border border-slate-100 bg-slate-50"
                          >
                            <div className="max-w-[70%]">
                              <p className="font-bold text-xs text-slate-800 line-clamp-1">{item.campaignTitle}</p>
                              <span className="text-[10px] text-slate-400">Bağış kalemi</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-sm text-slate-800">{item.amount} ₺</span>
                              <button 
                                onClick={() => removeFromCart(item.campaignId)}
                                className="text-red-500 hover:text-red-700 text-xs font-bold"
                              >
                                Sil
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t pt-4 flex justify-between items-center">
                        <span className="text-slate-500 text-xs font-semibold">Toplam Bağış:</span>
                        <span className="font-black text-xl text-slate-800">{totalAmount} ₺</span>
                      </div>

                      <button
                        onClick={() => setIsCheckingOut(true)}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl shadow-md transition-colors text-sm uppercase tracking-wider mt-6"
                      >
                        Bağış Yapmayı Tamamla
                      </button>
                    </>
                  )}
                </div>
              ) : (
                /* Step-by-Step Cart Checkout Wizard */
                <div className="space-y-4">
                  {checkoutStep === 1 && (
                    <div className="space-y-3">
                      <h5 className="font-bold text-sm text-slate-600">Adım 1: Kişisel Bilgiler</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Adınız *"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-primary-500"
                        />
                        <input
                          type="text"
                          placeholder="Soyadınız *"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-primary-500"
                        />
                      </div>
                      <input
                        type="email"
                        placeholder="E-posta *"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-primary-500"
                      />
                      <input
                        type="tel"
                        placeholder="Telefon *"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-primary-500"
                      />

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => setIsCheckingOut(false)}
                          className="flex-1 rounded-xl border py-3 text-xs font-bold text-slate-500"
                        >
                          Sepete Dön
                        </button>
                        <button
                          onClick={handleNextStep}
                          className="flex-1 rounded-xl bg-primary-600 text-white font-bold py-3 text-xs"
                        >
                          Kart Ödemesine Geç
                        </button>
                      </div>
                    </div>
                  )}

                  {checkoutStep === 2 && (
                    <div className="space-y-3">
                      <h5 className="font-bold text-sm text-slate-600">Adım 2: Kart Bilgileri</h5>
                      <input
                        type="text"
                        placeholder="Kart Sahibi Adı *"
                        value={cardHolderName}
                        onChange={(e) => setCardHolderName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-primary-500"
                      />
                      <input
                        type="text"
                        placeholder="Kart Numarası *"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-3 text-xs outline-none focus:border-primary-500"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="AA"
                          maxLength={2}
                          value={cardExpiryMonth}
                          onChange={(e) => setCardExpiryMonth(e.target.value)}
                          className="rounded-xl border border-slate-300 p-3 text-xs text-center outline-none"
                        />
                        <input
                          type="text"
                          placeholder="YY"
                          maxLength={2}
                          value={cardExpiryYear}
                          onChange={(e) => setCardExpiryYear(e.target.value)}
                          className="rounded-xl border border-slate-300 p-3 text-xs text-center outline-none"
                        />
                        <input
                          type="password"
                          placeholder="CVV"
                          maxLength={3}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          className="rounded-xl border border-slate-300 p-3 text-xs text-center outline-none"
                        />
                      </div>

                      <div className="p-3 bg-slate-50 border rounded-xl flex justify-between items-center text-xs mt-4">
                        <span className="text-slate-500 font-semibold">Toplam Çekim:</span>
                        <span className="font-black text-primary-600">{totalAmount} ₺</span>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => setCheckoutStep(1)}
                          className="flex-1 rounded-xl border py-3 text-xs font-bold text-slate-500"
                        >
                          Geri Dön
                        </button>
                        <button
                          onClick={handleSubmitCartDonations}
                          disabled={createDonation.isPending}
                          className="flex-1 rounded-xl bg-primary-600 text-white font-bold py-3 text-xs disabled:bg-primary-300"
                        >
                          {createDonation.isPending ? 'Ödeniyor...' : 'Ödemeyi Tamamla'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clear all link */}
            {cart.length > 0 && !success && (
              <button
                onClick={clearCart}
                className="text-center text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider pt-6"
              >
                Sepeti Temizle
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
