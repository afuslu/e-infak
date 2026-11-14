'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

const field = 'w-full rounded-lg border border-pt-line bg-pt-bg px-3 py-2.5 text-sm text-pt-text outline-none placeholder:text-pt-faint focus:border-pt-brand'
const PLANS = [['', 'Henüz karar vermedim'], ['baslangic', 'Başlangıç'], ['orta', 'Orta'], ['ileri', 'İleri']]

const PLAN_EVENT = 'einfak-paket'

/** "Teklif isteyin" on a package card: jumps to the form with that package chosen. */
export function PlanCta({ plan, className, children }: { plan: string; className?: string; children: React.ReactNode }) {
  return (
    <a href="#demo" className={className} onClick={() => window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: plan }))}>
      {children}
    </a>
  )
}

/** Demo / offer request; stored for the platform team (POST /api/v1/directory/demo-request). */
export function DemoForm() {
  const [form, setForm] = useState({ name: '', organization: '', phone: '', email: '', plan: '', message: '', website: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  // "Teklif isteyin" on a package card preselects that package.
  useEffect(() => {
    const pick = (event: Event) => setForm((f) => ({ ...f, plan: (event as CustomEvent<string>).detail }))
    window.addEventListener(PLAN_EVENT, pick)
    return () => window.removeEventListener(PLAN_EVENT, pick)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setState('sending')
    try {
      const res = await fetch('/api/v1/directory/demo-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, email: form.email || null, plan: form.plan || null, message: form.message || null, website: form.website || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Talebiniz gönderilemedi. Lütfen bilgileri kontrol edin.')
      }
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Talebiniz gönderilemedi.')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-pt-line bg-pt-card p-10 text-center pt-shadow">
        <CheckCircle2 className="h-10 w-10 text-pt-brand" aria-hidden="true" />
        <h3 className="text-xl font-bold text-pt-text">Talebiniz bize ulaştı</h3>
        <p className="max-w-sm text-sm text-pt-muted">En kısa sürede verdiğiniz numaradan sizi arayıp panelleri birlikte gezeceğiz.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-pt-line bg-pt-card p-6 text-left pt-shadow sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-bold text-pt-muted">Adınız soyadınız
          <input required minLength={2} maxLength={120} autoComplete="name" className={`${field} mt-1`} value={form.name} onChange={set('name')} />
        </label>
        <label className="block text-xs font-bold text-pt-muted">Kurumunuz
          <input required minLength={2} maxLength={200} autoComplete="organization" placeholder="Dernek / vakıf adı" className={`${field} mt-1`} value={form.organization} onChange={set('organization')} />
        </label>
        <label className="block text-xs font-bold text-pt-muted">Telefon
          <input required type="tel" inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" className={`${field} mt-1`} value={form.phone} onChange={set('phone')} />
        </label>
        <label className="block text-xs font-bold text-pt-muted">E-posta <span className="font-normal text-pt-faint">(isteğe bağlı)</span>
          <input type="email" autoComplete="email" className={`${field} mt-1`} value={form.email} onChange={set('email')} />
        </label>
      </div>
      <label className="block text-xs font-bold text-pt-muted">İlgilendiğiniz paket
        <select className={`${field} mt-1`} value={form.plan} onChange={set('plan')}>
          {PLANS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-bold text-pt-muted">Notunuz <span className="font-normal text-pt-faint">(isteğe bağlı)</span>
        <textarea rows={3} maxLength={2000} placeholder="Kaç bağışçınız var, bugün hangi sistemi kullanıyorsunuz?" className={`${field} mt-1 resize-y`} value={form.message} onChange={set('message')} />
      </label>
      {/* Hidden from people; bots that fill every field give themselves away. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set('website')} />
      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="pt-cta w-full rounded-xl px-6 py-3.5 text-sm font-bold disabled:opacity-60">
        {state === 'sending' ? 'Gönderiliyor…' : 'Demo talep et'}
      </button>
      <p className="text-center text-xs text-pt-faint">Bilgileriniz yalnızca sizi aramak için kullanılır.</p>
    </form>
  )
}
