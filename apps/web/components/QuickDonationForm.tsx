'use client'

import { useState } from 'react'
import { useCreateDonation } from '@e-infak/api-client'
import type { DonationCreate, Donor } from '@e-infak/api-client'

interface QuickDonationFormProps {
  campaignId: string
  campaignTitle: string
  suggestedAmounts?: number[]
  primaryColor?: string
  accentColor?: string
  themeSlug?: string
}

export function QuickDonationForm({
  campaignId,
  campaignTitle,
  suggestedAmounts = [100, 250, 500, 1000],
  primaryColor = '#10b981',
  accentColor = '#0ea5e9',
  themeSlug = 'default',
}: QuickDonationFormProps) {
  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState<number | string>(suggestedAmounts[1])
  const [isCustomAmount, setIsCustomAmount] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card')
  
  // Donor details state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)

  // Card details state
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolderName, setCardHolderName] = useState('')
  const [cardExpiryMonth, setCardExpiryMonth] = useState('')
  const [cardExpiryYear, setCardExpiryYear] = useState('')
  const [cardCvv, setCardCvv] = useState('')

  const createDonation = useCreateDonation()
  const [errorMsg, setErrorMsg] = useState('')
  const [success, setSuccess] = useState(false)

  const handleAmountSelect = (val: number) => {
    setAmount(val)
    setIsCustomAmount(false)
  }

  const handleCustomAmountChange = (val: string) => {
    const numeric = val.replace(/\D/g, '')
    setAmount(numeric)
  }

  const handleNextStep = () => {
    if (step === 1) {
      const parsedAmount = Number(amount)
      if (!parsedAmount || parsedAmount <= 0) {
        setErrorMsg('Lütfen geçerli bir bağış miktarı giriniz.')
        return
      }
      setErrorMsg('')
      setStep(2)
    } else if (step === 2) {
      if (!firstName || !lastName || !email || !phone) {
        setErrorMsg('Lütfen tüm zorunlu kişisel bilgileri doldurunuz.')
        return
      }
      setErrorMsg('')
      if (paymentMethod === 'bank_transfer') {
        // Direct processing since no card needed
        handleSubmitDonation()
      } else {
        setStep(3)
      }
    }
  }

  const handlePrevStep = () => {
    setErrorMsg('')
    setStep((prev) => Math.max(1, prev - 1))
  }

  const handleSubmitDonation = async () => {
    setErrorMsg('')
    const parsedAmount = Number(amount)
    
    const donorData: Donor = {
      donor_type: 'individual',
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      allow_email: true,
      allow_sms: true,
      is_anonymous: isAnonymous,
    }

    const payload: DonationCreate = {
      campaign_id: campaignId,
      amount_cents: parsedAmount * 100,
      payment_method: paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'credit_card',
      donor: donorData,
      donor_message: message,
      is_anonymous: isAnonymous,
    }

    if (paymentMethod === 'credit_card') {
      if (!cardNumber || !cardHolderName || !cardExpiryMonth || !cardExpiryYear || !cardCvv) {
        setErrorMsg('Lütfen kart bilgilerini eksiksiz giriniz.')
        return
      }
      payload.card_number = cardNumber.replace(/\s/g, '')
      payload.card_holder_name = cardHolderName
      payload.card_expiry_month = cardExpiryMonth
      payload.card_expiry_year = cardExpiryYear
      payload.card_cvv = cardCvv
    }

    try {
      await createDonation.mutateAsync(payload)
      setSuccess(true)
      setStep(4)
    } catch (e: any) {
      console.error(e)
      setErrorMsg(e?.response?.data?.detail || 'Bağış işlemi gerçekleştirilemedi. Lütfen tekrar deneyiniz.')
    }
  }

  // Formatting utility for card number input
  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }

    if (parts.length > 0) {
      return parts.join(' ')
    } else {
      return v
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-gray-100 transition-all">
      <div className="mb-6">
        <h4 className="text-center font-heading text-xl font-bold text-gray-800">Hızlı Bağış</h4>
        <p className="text-center text-xs text-gray-500 mt-1">{campaignTitle}</p>
        
        {/* Step Indicator */}
        {step < 4 && (
          <div className="mt-4 flex items-center justify-between px-4">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>1</div>
            <div className={`h-1 flex-1 transition-all ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`} />
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>2</div>
            {paymentMethod === 'credit_card' && (
              <>
                <div className={`h-1 flex-1 transition-all ${step >= 3 ? 'bg-primary-600' : 'bg-gray-200'}`} />
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${step >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>3</div>
              </>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* STEP 1: Amount Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {suggestedAmounts.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleAmountSelect(val)}
                className={`rounded-xl py-3 px-4 text-center font-bold text-sm border-2 transition-all ${
                  !isCustomAmount && Number(amount) === val
                    ? 'border-primary-600 bg-primary-50 text-primary-950 font-bold'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200'
                }`}
              >
                {val} ₺
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Farklı Bir Tutar Girin"
              value={isCustomAmount ? amount : ''}
              onFocus={() => setIsCustomAmount(true)}
              onChange={(e) => handleCustomAmountChange(e.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3 pr-8 text-sm outline-none focus:border-primary-600"
            />
            <span className="absolute right-4 top-3.5 text-sm font-bold text-gray-400">₺</span>
          </div>

          {/* Payment Method Switch */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ödeme Yöntemi</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('credit_card')}
                className={`rounded-xl py-2 px-3 border text-xs font-bold text-center transition-all ${
                  paymentMethod === 'credit_card'
                    ? 'border-primary-600 bg-primary-50 text-primary-950'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                💳 Kredi Kartı
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('bank_transfer')}
                className={`rounded-xl py-2 px-3 border text-xs font-bold text-center transition-all ${
                  paymentMethod === 'bank_transfer'
                    ? 'border-primary-600 bg-primary-50 text-primary-950'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                🏦 Havale / EFT
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNextStep}
            className="w-full rounded-xl bg-primary-600 py-3 font-bold text-white shadow-md hover:bg-primary-700 transition-colors mt-6"
          >
            Devam Et
          </button>
        </div>
      )}

      {/* STEP 2: Personal Information */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Adınız *"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600"
              required
            />
            <input
              type="text"
              placeholder="Soyadınız *"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600"
              required
            />
          </div>

          <input
            type="email"
            placeholder="E-posta Adresiniz *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600"
            required
          />

          <input
            type="tel"
            placeholder="Telefon Numaranız *"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600"
            required
          />

          <textarea
            placeholder="Bağış Notunuz (İsteğe Bağlı)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-sm h-20 outline-none focus:border-primary-600 resize-none"
          />

          <label className="flex items-center gap-2 cursor-pointer pt-2 select-none">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
            />
            <span className="text-xs text-gray-600 font-semibold">Bağışçı listesinde ismimi gizle (Yasin-i Şerif okumaları vb. için isim saklama)</span>
          </label>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handlePrevStep}
              className="flex-1 rounded-xl border border-gray-300 py-3 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Geri Git
            </button>
            <button
              type="button"
              onClick={paymentMethod === 'bank_transfer' ? handleSubmitDonation : handleNextStep}
              disabled={createDonation.isPending}
              className="flex-1 rounded-xl bg-primary-600 py-3 font-bold text-white shadow-md hover:bg-primary-700 transition-colors disabled:bg-primary-400"
            >
              {createDonation.isPending ? 'İşleniyor...' : paymentMethod === 'bank_transfer' ? 'Bağışı Tamamla' : 'Ödemeye Geç'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Credit Card Information */}
      {step === 3 && paymentMethod === 'credit_card' && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Kart Sahibi Adı Soyadı *"
            value={cardHolderName}
            onChange={(e) => setCardHolderName(e.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600"
            required
          />

          <input
            type="text"
            placeholder="Kart Numarası *"
            maxLength={19}
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary-600"
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Ay (AA) *"
              maxLength={2}
              value={cardExpiryMonth}
              onChange={(e) => setCardExpiryMonth(e.target.value.replace(/\D/g, ''))}
              className="rounded-xl border border-gray-300 p-3 text-sm text-center outline-none focus:border-primary-600"
              required
            />
            <input
              type="text"
              placeholder="Yıl (YY) *"
              maxLength={2}
              value={cardExpiryYear}
              onChange={(e) => setCardExpiryYear(e.target.value.replace(/\D/g, ''))}
              className="rounded-xl border border-gray-300 p-3 text-sm text-center outline-none focus:border-primary-600"
              required
            />
            <input
              type="password"
              placeholder="CVV *"
              maxLength={3}
              value={cardCvv}
              onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
              className="rounded-xl border border-gray-300 p-3 text-sm text-center outline-none focus:border-primary-600"
              required
            />
          </div>

          <div className="flex gap-2 p-2 bg-gray-50 rounded-lg text-gray-500 text-[10px] mt-2 leading-relaxed">
            🔒 256-bit SSL şifreleme ve BDDK lisanslı altyapı ile bağışınız 3D Secure güvencesiyle tahsil edilir.
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handlePrevStep}
              className="flex-1 rounded-xl border border-gray-300 py-3 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Geri Git
            </button>
            <button
              type="button"
              onClick={handleSubmitDonation}
              disabled={createDonation.isPending}
              className="flex-1 rounded-xl bg-primary-600 py-3 font-bold text-white shadow-md hover:bg-primary-700 transition-colors disabled:bg-primary-400"
            >
              {createDonation.isPending ? 'İşleniyor...' : `${amount} ₺ Öde`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Success Message */}
      {step === 4 && success && (
        <div className="text-center py-6 space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✨
          </div>
          <h5 className="font-heading text-2xl font-bold text-gray-800">Bağışınız Kabul Olsun!</h5>
          
          {paymentMethod === 'bank_transfer' ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left space-y-3 mt-4 text-xs text-gray-600">
              <p className="font-semibold text-gray-700">Bağışınızı tamamlamak için lütfen aşağıdaki banka hesabına havale gönderiniz:</p>
              
              {themeSlug === 'hicret-dernegi' ? (
                <>
                  <div>
                    <span className="font-bold block">Banka:</span> Vakıf Katılım Bankası
                  </div>
                  <div>
                    <span className="font-bold block">Alıcı Ünvanı:</span> Hicret İslami İlimler Derneği
                  </div>
                  <div>
                    <span className="font-bold block">IBAN:</span> TR12 0001 0009 0000 1234 5678 90
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="font-bold block">Banka:</span> Kuveyt Türk Katılım Bankası
                  </div>
                  <div>
                    <span className="font-bold block">Alıcı Ünvanı:</span> Kardeşlik Payı Yardımlaşma Derneği
                  </div>
                  <div>
                    <span className="font-bold block">IBAN:</span> TR98 0006 2000 0000 9876 5432 10
                  </div>
                </>
              )}
              
              <div className="border-t pt-2 text-[10px] text-gray-500">
                ⚠️ Lütfen açıklama alanına <b>Adınızı Soyadınızı</b> ve <b>{receiptNumberText()}</b> kodunu yazmayı unutmayınız.
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
              Desteğiniz başarıyla ulaştırılmıştır. E-İnfak otomasyonu üzerinden hazırlanan dijital makbuzunuz e-posta adresinize gönderilecektir.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setStep(1)
              setSuccess(false)
              setFirstName('')
              setLastName('')
              setEmail('')
              setPhone('')
              setMessage('')
              setCardNumber('')
              setCardHolderName('')
            }}
            className="w-full rounded-xl border-2 border-primary-600 text-primary-950 hover:bg-primary-50 py-3 font-bold transition-all mt-6 text-sm"
          >
            Yeni Bağış Yap
          </button>
        </div>
      )}
    </div>
  )

  function receiptNumberText() {
    return 'BAGIS-' + Math.floor(100000 + Math.random() * 900000)
  }
}
