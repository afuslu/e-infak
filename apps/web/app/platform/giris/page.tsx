'use client'

import { errorMessage } from '../../../lib/api-error'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { platformCall, setPlatformToken } from '../../../lib/platform-api'

export default function PlatformLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
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
      setError(errorMessage(err, 'Giriş yapılamadı'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10"
      style={{
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.16), transparent 45%), radial-gradient(circle at 80% 80%, rgba(15,23,42,0.9), transparent 55%)',
      }}
    >
      <div className="w-full max-w-[920px] overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl lg:grid lg:grid-cols-12">
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-10 text-white lg:col-span-5 lg:flex">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -end-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-2xl" />
          <div>
            <div className="flex items-center gap-3">
              <img src="/images/e-infak/mark.png" alt="E-İnfak" width={42} height={42} className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/20" />
              <div>
                <div className="text-base font-extrabold tracking-tight">E-İnfak Platform</div>
                <div className="text-[11px] font-medium text-emerald-300/80">Operasyon &amp; Kiracı Yönetimi</div>
              </div>
            </div>
            <h2 className="mt-10 text-2xl font-extrabold leading-snug tracking-tight">
              Tüm kurumları tek merkezden yönetin.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Kurum açılışı, paket ve alan adı yönetimi, demo talepleri ve sistem işlem kayıtları.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>Yalnız platform operatörleri içindir</span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5 p-7 sm:p-10 lg:col-span-7">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-start">
            <img src="/images/e-infak/mark.png" alt="E-İnfak" width={44} height={44} className="mb-3 h-11 w-11 rounded-xl object-cover ring-1 ring-slate-200 lg:hidden" />
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Platform Yönetimi
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Operatör Girişi</h1>
            <p className="mt-1 text-sm text-slate-500">E-İnfak platform hesabınızla oturum açın</p>
          </div>

          <div>
            <label htmlFor="platform-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              E-posta
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="platform-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@e-infak.org"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pe-3.5 ps-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="platform-password" className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Şifre
              </label>
              {capsLock && <span className="text-[11px] font-semibold text-amber-600">Caps Lock açık</span>}
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="platform-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pe-10 ps-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  )
}
