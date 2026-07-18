'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSendContactMessage, useOrgSettings } from '@e-infak/api-client'

interface ContactPageClientProps {
  orgSlug: string
}

const brand = {
  'hicret-dernegi': {
    name: 'Hicret Derneği',
    primary: '#1E7A34',
    hover: '#166028',
    border: '#E4E9E2',
    bg: '#F0F6EE',
    bgBorder: '#CBDFC9',
    text: '#6B7A70',
    heading: '#1C2420',
    address: '',
    phone: '',
    email: '',
    bank1: '',
    bank1Iban: '',
    bank2: '',
    bank2Iban: '',
  },
  'kardeslik-payi': {
    name: 'Kardeşlik Payı',
    primary: '#C2181B',
    hover: '#961114',
    border: '#EDE3E0',
    bg: '#FBEDEB',
    bgBorder: '#EFCDC9',
    text: '#82706D',
    heading: '#241C1B',
    address: '',
    phone: '',
    email: '',
    bank1: '',
    bank1Iban: '',
    bank2: '',
    bank2Iban: '',
  },
} as const

export function ContactPageClient({ orgSlug }: ContactPageClientProps) {
  const base = orgSlug === 'kardeslik-payi' ? brand['kardeslik-payi'] : brand['hicret-dernegi']
  const { data: settings } = useOrgSettings()
  const c = {
    ...base,
    address: settings?.contact_address || base.address,
    phone: settings?.contact_phone || base.phone,
    email: settings?.contact_email || base.email,
    bank1: settings?.bank1_name || base.bank1,
    bank1Iban: settings?.bank1_iban || base.bank1Iban,
    bank2: settings?.bank2_name || base.bank2,
    bank2Iban: settings?.bank2_iban || base.bank2Iban,
  }
  const sendContact = useSendContactMessage()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !phone || !message) {
      setErrorMsg('Lütfen tüm zorunlu alanları doldurun.')
      return
    }
    setErrorMsg('')
    try {
      await sendContact.mutateAsync({ name, phone, message })
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Mesajınız gönderilemedi. Lütfen tekrar deneyin.')
    }
  }

  return (
    <div className="font-sans" style={{ color: c.heading }}>
      <div className="max-w-[1000px] mx-auto px-6 pt-14 pb-20">
        <Link href="/" className="font-bold text-sm mb-6 inline-block" style={{ color: c.primary }}>
          ← Ana sayfaya dön
        </Link>
        <h1 className="font-heading text-[38px] font-bold mb-8">İletişim</h1>

        <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-start">
          <div className="flex flex-col gap-4">
            {(c.address || c.phone || c.email) && <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
              <div className="font-bold text-[15px] mb-3">Dernek Merkezi</div>
              <div className="text-sm leading-loose" style={{ color: c.text }}>
                {c.address}<br />
                {c.phone}<br />
                {c.email}
              </div>
            </div>}
            {(c.bank1Iban || c.bank2Iban) && <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
              <div className="font-bold text-[15px] mb-3">Banka Hesapları</div>
              <div className="text-[13px] leading-[1.9]" style={{ color: c.text }}>
                <div className="font-bold" style={{ color: c.heading }}>{c.bank1}</div>
                {c.bank1Iban}
                <div className="font-bold mt-2" style={{ color: c.heading }}>{c.bank2}</div>
                {c.bank2Iban}
              </div>
              <div className="mt-2.5 text-xs" style={{ color: c.text }}>Havale kaydında üretilen açıklama kodunu kullanınız.</div>
            </div>}
          </div>

          <div className="bg-white rounded-2xl p-7" style={{ border: `1px solid ${c.border}` }}>
            <div className="font-heading text-xl font-bold mb-1">Bize Ulaşın</div>
            <div className="text-[13px] mb-4.5" style={{ color: c.text }}>Sorularınızı güvenli iletişim formu üzerinden iletebilirsiniz.</div>

            {sendContact.isSuccess ? (
              <div className="rounded-[10px] p-4 text-sm font-semibold" style={{ background: c.bg, border: `1px solid ${c.bgBorder}`, color: c.primary }}>
                Mesajınız alındı, teşekkür ederiz. En kısa sürede dönüş yapacağız.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {errorMsg && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 font-medium">{errorMsg}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Ad Soyad *"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-lg border p-3 text-sm outline-none"
                    style={{ borderColor: c.border }}
                  />
                  <input
                    type="tel"
                    placeholder="Telefon *"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-lg border p-3 text-sm outline-none"
                    style={{ borderColor: c.border }}
                  />
                </div>
                <textarea
                  placeholder="Mesajınız *"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-lg border p-3 text-sm outline-none resize-y"
                  style={{ borderColor: c.border }}
                />
                <button
                  type="submit"
                  disabled={sendContact.isPending}
                  className="w-full text-white font-extrabold text-[15px] py-3.5 rounded-[10px] disabled:opacity-60"
                  style={{ background: c.primary }}
                >
                  {sendContact.isPending ? 'Gönderiliyor...' : 'Mesajı Gönder'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
