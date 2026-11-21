'use client'

import { useState } from 'react'
import { CheckCircle2, HeartHandshake, Sparkles } from 'lucide-react'
import { apiClient } from '@/lib/api'

export default function StartFundraiserPage() {
  const [title, setTitle] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [organizerPhone, setOrganizerPhone] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [targetLira, setTargetLira] = useState('10000')
  const [story, setStory] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ slug: string; message: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiClient.post<{ slug: string; message: string }>('/public/fundraisers', {
        title: title.trim(),
        story: story.trim(),
        target_lira: Math.max(500, Number(targetLira) || 1000),
        organizer_name: organizerName.trim(),
        organizer_phone: organizerPhone.trim() || undefined,
        organizer_email: organizerEmail.trim() || undefined,
      })
      setCreated(res.data)
    } catch {
      setError('Kampanya başvurusu gönderilemedi. Lütfen tüm alanları kontrol edip tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <HeartHandshake className="h-6 w-6" />
        </div>
        <h1 className="font-heading text-3xl font-bold text-gray-900">Kendi İyilik Kampanyanı Başlat</h1>
        <p className="mt-2 text-sm text-gray-600">
          Doğum gününüz, özel bir gününüz veya bir sevdiğinizin hatırası adına kendi bağış kampanyanızı oluşturun, çevrenizle paylaşın.
        </p>
      </div>

      {created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h2 className="text-xl font-bold text-gray-900">Başvurunuz Alındı!</h2>
          <p className="text-sm text-gray-700">{created.message}</p>
          <p className="text-xs text-gray-500">Kampanya kodu: <code className="font-mono font-semibold">{created.slug}</code></p>
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Kampanya Başlığı</span>
            <input
              required
              minLength={5}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn. Merhum Babam Adına Su Kuyusu"
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Adınız Soyadınız</span>
              <input
                required
                minLength={2}
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                placeholder="Örn. Zeynep Kaya"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Hedef Tutar (TL)</span>
              <input
                type="number"
                min={500}
                required
                value={targetLira}
                onChange={(e) => setTargetLira(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Telefon</span>
              <input
                type="tel"
                value={organizerPhone}
                onChange={(e) => setOrganizerPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">E-posta (opsiyonel)</span>
              <input
                type="email"
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
                placeholder="ornek@eposta.com"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Kampanya Hikâyesi</span>
            <textarea
              required
              minLength={10}
              rows={4}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Bu kampanyayı neden başlattığınızı ve neyi hedeflediğinizi kısaca anlatın…"
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:border-primary-600"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {submitting ? 'Gönderiliyor…' : 'İyilik Kampanyasını Oluştur'}
          </button>
        </form>
      )}
    </main>
  )
}
