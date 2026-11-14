'use client'

import { useLogin } from '@e-infak/api-client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Moon, Sun } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const login = useLogin()
  const [errorMsg, setErrorMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Platform support sign-in: e-infak.org/platform opens /giris#destek=<short-lived token>.
  // The fragment never reaches a server; it is removed from the address bar at once.
  useEffect(() => {
    const match = window.location.hash.match(/^#destek=([A-Za-z0-9._-]+)$/)
    if (!match) return
    window.history.replaceState(null, '', window.location.pathname)
    localStorage.setItem('access_token', match[1])
    localStorage.removeItem('refresh_token')
    sessionStorage.setItem('support_session', '1')
    router.replace('/admin')
  }, [router])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setErrorMsg('')
    try {
      await login.mutateAsync(data)
      router.push('/admin')
    } catch (error: any) {
      setErrorMsg(error.response?.data?.detail || 'E-posta veya şifre hatalı')
    }
  }

  return (
    <div className="portal relative flex min-h-screen flex-col items-center justify-center bg-pt-soft px-4 py-12 font-sans text-pt-text" data-theme={theme}>
      <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          aria-label="Gündüz / gece görünümü"
          title="Gündüz / gece görünümü"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-pt-line bg-pt-card text-pt-muted transition-colors hover:border-pt-brand hover:text-pt-brand"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <Link href="/" className="mb-4 flex items-center gap-3">
            <img
              src="/images/e-infak/mark.png"
              alt="E-İnfak"
              width={48}
              height={48}
              className="h-12 w-12 rounded-2xl bg-white object-contain p-1.5 ring-1 ring-pt-line pt-shadow"
            />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-pt-text sm:text-[1.75rem]">Kurum Girişi</h1>
          <p className="mt-1.5 text-sm text-pt-muted">E-İnfak yönetim panelinize giriş yapın</p>
        </div>

        <div className="rounded-2xl border border-pt-line bg-pt-card p-6 pt-shadow sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-pt-muted">
                E-posta
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  className="w-full rounded-xl border border-pt-line bg-pt-bg py-2.5 pe-3.5 ps-10 text-sm text-pt-text placeholder:text-pt-faint outline-none transition-colors focus:border-pt-brand focus:ring-2 focus:ring-pt-brand/15"
                  placeholder="yetkili@kurumunuz.org"
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-pt-muted">
                Şifre
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  className="w-full rounded-xl border border-pt-line bg-pt-bg py-2.5 pe-10 ps-10 text-sm text-pt-text placeholder:text-pt-faint outline-none transition-colors focus:border-pt-brand focus:ring-2 focus:ring-pt-brand/15"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-pt-faint hover:text-pt-text"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs font-medium text-red-600">{errors.password.message}</p>
              )}
            </div>

            {errorMsg && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="pt-cta w-full cursor-pointer rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-60"
            >
              {login.isPending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-pt-faint">
          <Link href="/" className="inline-flex items-center gap-1.5 font-semibold text-pt-muted transition-colors hover:text-pt-brand">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Ana Sayfaya Dön
          </Link>
          <span>e-infak.org</span>
        </div>
      </div>
    </div>
  )
}
