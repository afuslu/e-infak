'use client'

import Link from 'next/link'
import { FormEvent, Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import { Lock } from 'lucide-react'
import { AuthCard, authErrorText } from '../../../components/auth/AuthCard'

const MIN_LENGTH = 10

function ResetForm() {
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (password.length < MIN_LENGTH) return setError(`Şifre en az ${MIN_LENGTH} karakter olmalı.`)
    if (password !== repeat) return setError('Şifreler aynı değil.')
    setBusy(true)
    setError('')
    try {
      await axios.post(`${window.location.origin}/api/v1/auth/password-reset/confirm`, { token, new_password: password })
      setDone(true)
    } catch (err) {
      setError(authErrorText(err, 'Şifre değiştirilemedi.'))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return <p className="text-sm text-pt-muted">Bağlantı eksik. <Link href="/sifremi-unuttum" className="font-semibold text-pt-brand">Yeni bağlantı isteyin</Link>.</p>
  }
  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-800">
          Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.
        </p>
        <Link href="/giris" className="pt-cta block w-full rounded-xl px-5 py-3 text-center text-sm font-bold">Giriş Yap</Link>
      </div>
    )
  }
  const field = 'w-full rounded-xl border border-pt-line bg-pt-bg py-2.5 pe-3.5 ps-10 text-sm text-pt-text outline-none transition-colors focus:border-pt-brand focus:ring-2 focus:ring-pt-brand/15'
  return (
    <form onSubmit={submit} className="space-y-5">
      {[['password', 'Yeni şifre', password, setPassword], ['repeat', 'Yeni şifre (tekrar)', repeat, setRepeat]].map(([id, label, value, set]) => (
        <div key={id as string}>
          <label htmlFor={id as string} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-pt-muted">{label as string}</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" aria-hidden="true" />
            <input id={id as string} type="password" autoComplete="new-password" required value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)} className={field} />
          </div>
        </div>
      ))}
      <p className="text-xs text-pt-faint">En az {MIN_LENGTH} karakter.</p>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="pt-cta w-full cursor-pointer rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-60">
        {busy ? 'Kaydediliyor…' : 'Şifreyi Değiştir'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Yeni Şifre Belirleyin" subtitle="Bağlantı 30 dakika geçerlidir ve bir kez kullanılabilir">
      <Suspense fallback={null}><ResetForm /></Suspense>
    </AuthCard>
  )
}
