'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { platformCall, setPlatformToken } from '../../../lib/platform-api'

export default function PlatformLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await platformCall<{ access_token: string }>('post', '/auth/login', { email, password })
      setPlatformToken(res.access_token)
      router.replace('/platform')
    } catch (err) {
      setError((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Giriş yapılamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold">E‑İnfak Platform</h1>
          <p className="text-sm text-slate-500">Platform yöneticisi girişi</p>
        </div>
        <label className="block text-sm font-semibold">E-posta
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border p-2.5 font-normal" />
        </label>
        <label className="block text-sm font-semibold">Şifre
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border p-2.5 font-normal" />
        </label>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
    </div>
  )
}
