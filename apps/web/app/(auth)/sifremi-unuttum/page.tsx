'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, Mail } from 'lucide-react'
import { AuthCard, authErrorText } from '../../../components/auth/AuthCard'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await axios.post(`${window.location.origin}/api/v1/auth/password-reset/request`, { email: email.trim() })
      setDone(res.data?.message || 'Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi.')
    } catch (err) {
      setError(authErrorText(err, 'İstek gönderilemedi; biraz sonra yeniden deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Şifremi Unuttum" subtitle="Hesabınızın e-postasını yazın; sıfırlama bağlantısı gönderelim">
      {done ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-800">
          {done} Bağlantı 30 dakika geçerlidir. E-posta gelmezse istenmeyen klasörüne bakın veya kurum yöneticinizden şifre sıfırlamasını isteyin.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-pt-muted">E-posta</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" aria-hidden="true" />
              <input
                id="email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-pt-line bg-pt-bg py-2.5 pe-3.5 ps-10 text-sm text-pt-text placeholder:text-pt-faint outline-none transition-colors focus:border-pt-brand focus:ring-2 focus:ring-pt-brand/15"
                placeholder="yetkili@kurumunuz.org"
              />
            </div>
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="pt-cta w-full cursor-pointer rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-60">
            {busy ? 'Gönderiliyor…' : 'Sıfırlama Bağlantısı Gönder'}
          </button>
        </form>
      )}
      <Link href="/giris" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-pt-muted hover:text-pt-brand">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Girişe dön
      </Link>
    </AuthCard>
  )
}
