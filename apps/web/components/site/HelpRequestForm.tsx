'use client'

import { useState } from 'react'
import Link from 'next/link'
import axios from 'axios'

const HOUSING = [['', 'Seçin'], ['rent', 'Kirada'], ['owner', 'Ev sahibi'], ['relative', 'Akraba yanında'], ['free', 'Ücretsiz / lojman'], ['other', 'Diğer']]

export function HelpRequestForm() {
  const [form, setForm] = useState({
    full_name: '', phone: '', national_id: '', city: '', district: '', neighborhood: '', address: '',
    household_size: '', income: '', housing_status: '', needs: '', website: '',
  })
  const [kvkk, setKvkk] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!kvkk) {
      setError('Devam etmek için KVKK aydınlatma metnini onaylayın.')
      return
    }
    setState('sending')
    try {
      await axios.post('/api/v1/public/help-requests', {
        full_name: form.full_name, phone: form.phone, national_id: form.national_id || null,
        city: form.city, district: form.district, neighborhood: form.neighborhood || null, address: form.address,
        household_size: Number(form.household_size),
        monthly_income_cents: form.income ? Math.round(Number(form.income.replace(',', '.')) * 100) : null,
        housing_status: form.housing_status || null, needs: form.needs, kvkk_accepted: kvkk, website: form.website,
      })
      setState('done')
    } catch (err: any) {
      const status = err?.response?.status
      setError(status === 429 ? 'Çok fazla deneme yapıldı, lütfen biraz sonra tekrar deneyin.'
        : status === 403 ? 'Kurumumuz şu an web üzerinden yardım başvurusu almıyor. Lütfen bizi arayın.'
        : status === 422 ? 'Lütfen alanları kontrol edin (TC kimlik no 11 haneli olmalı).'
        : 'Başvuru gönderilemedi, lütfen tekrar deneyin.')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-10 rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">🤲</div>
        <h2 className="mt-3 text-2xl font-bold">Başvurunuz alındı</h2>
        <p className="mt-2 text-[#6B7A70]">Ekibimiz başvurunuzu inceleyip sizinle telefonla iletişime geçecek. Gerekirse ev ziyareti yapılacaktır.</p>
      </div>
    )
  }

  const input = 'mt-1 w-full rounded-xl border border-black/10 bg-white p-3 outline-none focus:border-primary-600'
  return (
    <form onSubmit={submit} className="mt-10 space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Ad soyad *<input required minLength={3} className={input} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></label>
        <label className="text-sm font-semibold">Telefon *<input required type="tel" minLength={10} className={input} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="text-sm font-semibold">TC kimlik no<input inputMode="numeric" pattern="\d{11}" maxLength={11} className={input} value={form.national_id} onChange={(e) => set('national_id', e.target.value)} /></label>
        <label className="text-sm font-semibold">Hanede yaşayan kişi sayısı *<input required type="number" min={1} max={50} className={input} value={form.household_size} onChange={(e) => set('household_size', e.target.value)} /></label>
        <label className="text-sm font-semibold">İl *<input required minLength={2} className={input} value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
        <label className="text-sm font-semibold">İlçe *<input required minLength={2} className={input} value={form.district} onChange={(e) => set('district', e.target.value)} /></label>
        <label className="text-sm font-semibold">Mahalle<input className={input} value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></label>
        <label className="text-sm font-semibold">Konut durumu
          <select className={input} value={form.housing_status} onChange={(e) => set('housing_status', e.target.value)}>
            {HOUSING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold sm:col-span-2">Açık adres *<input required minLength={5} className={input} value={form.address} onChange={(e) => set('address', e.target.value)} /></label>
        <label className="text-sm font-semibold">Hanenin aylık toplam geliri (₺)<input inputMode="decimal" className={input} value={form.income} onChange={(e) => set('income', e.target.value)} /></label>
      </div>
      <label className="block text-sm font-semibold">Durumunuzu ve ihtiyacınızı kısaca anlatın *
        <textarea required minLength={5} maxLength={2000} rows={4} className={input} value={form.needs} onChange={(e) => set('needs', e.target.value)} />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={(e) => set('website', e.target.value)} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} className="mt-1" />
        <span>Kişisel verilerimin ve hane bilgilerimin yardım başvurumun değerlendirilmesi amacıyla işlenmesini kabul ediyorum. <Link href="/kvkk" className="font-semibold text-primary-600 underline">KVKK</Link> *</span>
      </label>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="w-full rounded-xl bg-primary-600 p-3 font-bold text-white disabled:opacity-60">
        {state === 'sending' ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
      </button>
    </form>
  )
}
