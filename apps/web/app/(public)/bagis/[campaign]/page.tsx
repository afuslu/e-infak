'use client'

import { use, useState } from 'react'
import { useCampaign, useCreateDonation } from '@e-infak/api-client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label, Card } from '@e-infak/ui'
import { useRouter } from 'next/navigation'

const donationSchema = z.object({
  amount: z.number().min(10, 'Minimum bağış tutarı 10 TL'),
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalı'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalı'),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  phone: z.string().min(10, 'Geçerli bir telefon numarası girin'),
  cardNumber: z.string().length(16, 'Kart numarası 16 haneli olmalı'),
  cardExpiry: z.string().regex(/^\d{2}\/\d{2}$/, 'MM/YY formatında girin'),
  cardCvv: z.string().min(3).max(4, 'CVV 3-4 haneli olmalı'),
  cardHolder: z.string().min(3, 'Kart üzerindeki isim gerekli'),
  kvkk: z.boolean().refine((val) => val === true, 'KVKK onayı zorunludur'),
})

type DonationForm = z.infer<typeof donationSchema>

export default function DonationPage({ params }: { params: Promise<{ campaign: string }> }) {
  const { campaign: slug } = use(params)
  const router = useRouter()
  const { data: campaign, isLoading } = useCampaign(slug)
  const createDonation = useCreateDonation()
  
  const [customAmount, setCustomAmount] = useState<number | null>(null)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DonationForm>({
    resolver: zodResolver(donationSchema),
  })

  const onSubmit = async (data: DonationForm) => {
    if (!campaign) return

    try {
      const result = await createDonation.mutateAsync({
        campaign_id: campaign.id,
        amount_cents: data.amount * 100,
        payment_method: 'credit_card',
        donor: {
          donor_type: 'individual',
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone,
        },
        card_number: data.cardNumber,
        card_expiry_month: data.cardExpiry.split('/')[0],
        card_expiry_year: data.cardExpiry.split('/')[1],
        card_cvv: data.cardCvv,
        card_holder_name: data.cardHolder,
      })

      // Create a form and submit to 3D Secure
      const form = document.createElement('form')
      form.method = result.redirect_method
      form.action = result.redirect_url

      Object.entries(result.form_data).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = value
        form.appendChild(input)
      })

      document.body.appendChild(form)
      form.submit()
    } catch (error) {
      console.error('Donation error:', error)
      alert('Bağış işlemi başlatılırken bir hata oluştu.')
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="animate-pulse">
          <div className="mb-4 h-8 w-64 rounded bg-gray-200" />
          <div className="h-96 rounded-xl bg-gray-200" />
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="rounded-lg bg-red-50 p-8 text-center">
          <p className="text-red-600">Kampanya bulunamadı</p>
        </div>
      </div>
    )
  }

  const handleAmountSelect = (cents: number) => {
    const lira = cents / 100
    setSelectedAmount(lira)
    setCustomAmount(null)
    setValue('amount', lira)
  }

  const handleCustomAmountChange = (value: string) => {
    const amount = parseFloat(value)
    if (!isNaN(amount)) {
      setCustomAmount(amount)
      setSelectedAmount(null)
      setValue('amount', amount)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Bağış Yap</h1>
          <p className="mb-8 text-gray-600">{campaign.title}</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Amount Selection */}
                <Card className="p-6">
                  <h2 className="mb-4 text-xl font-semibold">Bağış Tutarı</h2>
                  
                  {campaign.suggested_amounts_cents.length > 0 && (
                    <div className="mb-4 grid grid-cols-3 gap-3">
                      {campaign.suggested_amounts_cents.map((cents) => (
                        <button
                          key={cents}
                          type="button"
                          onClick={() => handleAmountSelect(cents)}
                          className={`rounded-lg border-2 py-3 font-semibold transition-colors ${
                            selectedAmount === cents / 100
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-200 text-gray-700 hover:border-primary-300'
                          }`}
                        >
                          {(cents / 100).toLocaleString('tr-TR')} ₺
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <Label htmlFor="customAmount">Özel Tutar</Label>
                    <Input
                      id="customAmount"
                      type="number"
                      placeholder="Başka bir tutar girin"
                      value={customAmount || ''}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                    />
                    {errors.amount && (
                      <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
                    )}
                  </div>
                </Card>

                {/* Personal Info */}
                <Card className="p-6">
                  <h2 className="mb-4 text-xl font-semibold">Bağışçı Bilgileri</h2>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="firstName">Ad *</Label>
                      <Input id="firstName" {...register('firstName')} />
                      {errors.firstName && (
                        <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="lastName">Soyad *</Label>
                      <Input id="lastName" {...register('lastName')} />
                      {errors.lastName && (
                        <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="email">E-posta *</Label>
                      <Input id="email" type="email" {...register('email')} />
                      {errors.email && (
                        <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="phone">Telefon *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="05XX XXX XX XX"
                        {...register('phone')}
                      />
                      {errors.phone && (
                        <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Card Info */}
                <Card className="p-6">
                  <h2 className="mb-4 text-xl font-semibold">Kart Bilgileri</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cardNumber">Kart Numarası *</Label>
                      <Input
                        id="cardNumber"
                        placeholder="1234 5678 9012 3456"
                        maxLength={16}
                        {...register('cardNumber')}
                      />
                      {errors.cardNumber && (
                        <p className="mt-1 text-sm text-red-600">{errors.cardNumber.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="cardHolder">Kart Üzerindeki İsim *</Label>
                      <Input id="cardHolder" placeholder="AD SOYAD" {...register('cardHolder')} />
                      {errors.cardHolder && (
                        <p className="mt-1 text-sm text-red-600">{errors.cardHolder.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="cardExpiry">Son Kullanma *</Label>
                        <Input
                          id="cardExpiry"
                          placeholder="MM/YY"
                          maxLength={5}
                          {...register('cardExpiry')}
                        />
                        {errors.cardExpiry && (
                          <p className="mt-1 text-sm text-red-600">{errors.cardExpiry.message}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="cardCvv">CVV *</Label>
                        <Input
                          id="cardCvv"
                          type="password"
                          placeholder="123"
                          maxLength={4}
                          {...register('cardCvv')}
                        />
                        {errors.cardCvv && (
                          <p className="mt-1 text-sm text-red-600">{errors.cardCvv.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* KVKK */}
                <Card className="p-6">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" {...register('kvkk')} className="mt-1" />
                    <span className="text-sm text-gray-700">
                      KVKK kapsamında kişisel verilerimin işlenmesini kabul ediyorum. *
                    </span>
                  </label>
                  {errors.kvkk && (
                    <p className="mt-1 text-sm text-red-600">{errors.kvkk.message}</p>
                  )}
                </Card>
              </div>

              {/* Summary Sidebar */}
              <div className="lg:col-span-1">
                <Card className="sticky top-4 p-6">
                  <h3 className="mb-4 text-lg font-semibold">Özet</h3>
                  
                  <div className="mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Kampanya</span>
                      <span className="font-medium">{campaign.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tutar</span>
                      <span className="text-xl font-bold text-primary-600">
                        {(selectedAmount || customAmount || 0).toLocaleString('tr-TR')} ₺
                      </span>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={createDonation.isPending}
                  >
                    {createDonation.isPending ? 'İşleniyor...' : 'Bağışı Tamamla'}
                  </Button>

                  <div className="mt-4 rounded-lg bg-green-50 p-3">
                    <p className="text-xs text-green-800">
                      🔒 Güvenli ödeme - Tüm işlemler SSL ile şifrelenir
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
