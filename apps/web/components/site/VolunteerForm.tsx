'use client'

import { useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { translator } from '../../lib/i18n'

const AREAS = ['Kumanya / gıda dağıtımı', 'Kurban organizasyonu', 'Eğitim / öğrenci', 'Etkinlik & organizasyon', 'Sosyal medya / tasarım', 'Saha ziyareti', 'Diğer']

export function VolunteerForm({ locale = 'tr' }: { locale?: string }) {
  const t = translator(locale)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', city: '', availability: '', message: '', website: '' })
  const [areas, setAreas] = useState<string[]>([])
  const [kvkk, setKvkk] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const toggle = (a: string) => setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!kvkk) {
      setError(t('volunteer.errorConsent'))
      return
    }
    setState('sending')
    try {
      await axios.post('/api/v1/public/volunteer-applications', {
        ...form,
        email: form.email || null,
        city: form.city || null,
        availability: form.availability || null,
        message: form.message || null,
        areas,
        kvkk_accepted: kvkk,
      })
      setState('done')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(err?.response?.status === 429
        ? t('volunteer.errorRate')
        : Array.isArray(detail) ? t('volunteer.errorInvalid') : t('volunteer.errorGeneric'))
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-10 rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">🤝</div>
        <h2 className="mt-3 text-2xl font-bold">{t('volunteer.doneTitle')}</h2>
        <p className="mt-2 text-[#6B7A70]">{t('volunteer.doneText')}</p>
      </div>
    )
  }

  const input = 'mt-1 w-full rounded-xl border border-black/10 bg-white p-3 outline-none focus:border-primary-600'

  return (
    <form onSubmit={submit} className="mt-10 space-y-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">{t('volunteer.fullName')} *<input required minLength={3} className={input} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></label>
        <label className="text-sm font-semibold">{t('volunteer.phone')} *<input required type="tel" minLength={10} className={input} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="text-sm font-semibold">{t('volunteer.email')}<input type="email" className={input} value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="text-sm font-semibold">{t('volunteer.city')}<input className={input} value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">{t('volunteer.areas')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button type="button" key={a} onClick={() => toggle(a)}
              className={`rounded-full border px-3 py-1.5 text-sm ${areas.includes(a) ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white'}`}>
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold">{t('volunteer.availability')}<input className={input} placeholder={t('volunteer.availabilityHint')} maxLength={200} value={form.availability} onChange={(e) => set('availability', e.target.value)} /></label>
      <label className="block text-sm font-semibold">{t('volunteer.message')}<textarea rows={4} maxLength={2000} className={input} value={form.message} onChange={(e) => set('message', e.target.value)} /></label>
      {/* Honeypot for bots; hidden from people and assistive technology */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => set('website', e.target.value)} />
      <label className="flex items-start gap-2 rounded-xl bg-[#F7F8F5] p-3 text-sm">
        <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} className="mt-1" />
        <span>{t('volunteer.consent')} <Link href="/kvkk" className="font-semibold text-primary-600 underline">KVKK</Link> *</span>
      </label>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="w-full rounded-xl bg-primary-600 py-3.5 font-bold text-white disabled:opacity-60">
        {state === 'sending' ? t('volunteer.sending') : t('volunteer.submit')}
      </button>
    </form>
  )
}
