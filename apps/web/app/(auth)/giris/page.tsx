'use client'

import { useLogin } from '@e-infak/api-client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail, Moon, ShieldCheck, Sun } from 'lucide-react'
import { authErrorText } from '../../../components/auth/AuthCard'
import { adminApiBase } from '../../../lib/admin-access'

const THEME_KEY = 'einfak-admin-tema'

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
})

type LoginForm = z.infer<typeof loginSchema>

interface SiteBrand {
  name?: string
  logo_url?: string | null
}

export default function LoginPage() {
  const router = useRouter()
  const login = useLogin()
  const [errorMsg, setErrorMsg] = useState('')
  // Platform operators (@e-infak.org) sign in at /platform/giris, not here: point them there.
  const [platformHint, setPlatformHint] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [brand, setBrand] = useState<SiteBrand | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'dark') setTheme('dark')
      else if (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark')
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    let active = true
    axios
      .get<SiteBrand>(`${adminApiBase()}/api/v1/public/site`)
      .then((res) => {
        if (active && res.data) setBrand(res.data)
      })
      .catch(() => {
        // Fallback to default E-İnfak branding
      })
    return () => {
      active = false
    }
  }, [])

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  // Platform support sign-in: e-infak.org/platform opens /giris#destek=<short-lived token>.
  // The fragment never reaches a server; it is removed from the address bar at once.
  useEffect(() => {
    const match = window.location.hash.match(/^#destek=([A-Za-z0-9._-]+)$/)
    if (!match) return
    window.history.replaceState(null, '', window.location.pathname)
    // A link with someone else's token would sign this browser into their account: ask first.
    if (!window.confirm('E-İnfak platform destek oturumu açılacak. Bu bağlantıyı destek ekranından siz mi açtınız?')) return
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
    setPlatformHint(false)
    try {
      await login.mutateAsync(data)
      router.push('/admin')
    } catch (error) {
      setErrorMsg(authErrorText(error, 'E-posta veya şifre hatalı'))
      setPlatformHint(data.email.trim().toLowerCase().endsWith('@e-infak.org'))
    }
  }

  const brandName = brand?.name?.trim() || 'E-İnfak'
  const logoSrc = brand?.logo_url || '/images/e-infak/mark.png'
  const hasCustomLogo = Boolean(brand?.logo_url)

  return (
    <div
      className="portal relative flex min-h-screen flex-col justify-center overflow-hidden bg-pt-soft px-4 py-10 font-sans text-pt-text lg:px-8"
      data-theme={theme}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            theme === 'dark'
              ? 'radial-gradient(circle at 18% 20%, rgba(16,185,129,0.14), transparent 45%), radial-gradient(circle at 82% 80%, rgba(5,150,105,0.12), transparent 45%)'
              : 'radial-gradient(circle at 18% 20%, rgba(16,185,129,0.12), transparent 45%), radial-gradient(circle at 82% 80%, rgba(4,120,87,0.08), transparent 45%)',
        }}
      />

      <div className="absolute end-4 top-4 z-10 sm:end-6 sm:top-6">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Gündüz / gece görünümü"
          title="Gündüz / gece görünümü"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-pt-line bg-pt-card text-pt-muted transition-colors hover:border-pt-brand hover:text-pt-brand pt-shadow"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[960px]">
        <div className="grid overflow-hidden rounded-3xl border border-pt-line bg-pt-card pt-shadow lg:grid-cols-12">
          {/* Sol kurumsal vitrin paneli (masaüstü) */}
          <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#065F46] p-10 text-white lg:col-span-5 lg:flex">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -end-24 h-64 w-64 rounded-full bg-emerald-400/15 blur-2xl"
            />
            <div>
              <Link href="/" className="inline-flex items-center gap-3">
                <img
                  src={logoSrc}
                  alt={brandName}
                  width={44}
                  height={44}
                  className={`h-11 w-11 rounded-xl ring-1 ring-white/20 ${
                    hasCustomLogo ? 'bg-white object-contain p-1' : 'object-cover'
                  }`}
                />
                <div className="min-w-0">
                  <div className="truncate text-base font-extrabold tracking-tight text-white">{brandName}</div>
                  <div className="text-[11px] font-medium text-emerald-100/80">Yönetim Otomasyonu</div>
                </div>
              </Link>

              <h2 className="mt-10 text-2xl font-extrabold leading-snug tracking-tight">
                Bağış, kampanya ve kurumsal süreçler tek merkezde.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-emerald-100/85">
                Yetkili personel hesabınızla yönetim paneline güvenle erişin.
              </p>
            </div>

            <ul className="mt-8 space-y-3 text-xs font-medium text-emerald-50/90">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span>Canlı bağış, havale ve makbuz takibi</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span>Kampanya, gönüllü ve site içerik yönetimi</span>
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span>Rol tabanlı yetkilendirme ve işlem kaydı</span>
              </li>
            </ul>
          </div>

          {/* Sağ giriş formu */}
          <div className="p-6 sm:p-10 lg:col-span-7">
            <div className="mb-7 flex flex-col items-center text-center lg:items-start lg:text-start">
              <Link href="/" className="mb-4 flex items-center gap-3 lg:hidden">
                <img
                  src={logoSrc}
                  alt={brandName}
                  width={48}
                  height={48}
                  className={`h-12 w-12 rounded-2xl ring-1 ring-pt-line pt-shadow ${
                    hasCustomLogo ? 'bg-white object-contain p-1' : 'object-cover'
                  }`}
                />
              </Link>
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Yetkili Girişi
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-pt-text sm:text-[1.75rem]">
                {brand?.name ? `${brandName} Paneli` : 'Kurum Girişi'}
              </h1>
              <p className="mt-1 text-sm text-pt-muted">Yönetim panelinize devam etmek için giriş yapın</p>
            </div>

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
                {errors.email && (
                  <p className={`mt-1.5 text-xs font-medium ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-pt-muted">
                    Şifre
                  </label>
                  {capsLock && (
                    <span className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-amber-300' : 'text-amber-600'}`}>
                      Caps Lock açık
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
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
                  <p className={`mt-1.5 text-xs font-medium ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                    {errors.password.message}
                  </p>
                )}
                <div className="mt-2 text-end">
                  <Link href="/sifremi-unuttum" className="text-xs font-semibold text-pt-muted hover:text-pt-brand">
                    Şifremi unuttum
                  </Link>
                </div>
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                    theme === 'dark'
                      ? 'border-red-500/30 bg-red-500/15 text-red-200'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {errorMsg}
                </p>
              )}

              {platformHint && (
                <p className="rounded-xl border border-pt-line bg-pt-soft px-3.5 py-2.5 text-xs text-pt-muted">
                  Platform yöneticisi misiniz?{' '}
                  <Link href="/platform/giris" className="font-bold text-pt-brand hover:underline">
                    Platform girişi →
                  </Link>
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

            <div className="mt-6 flex items-center justify-between border-t border-pt-line pt-5 text-xs text-pt-faint">
              <Link href="/" className="inline-flex items-center gap-1.5 font-semibold text-pt-muted transition-colors hover:text-pt-brand">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Ana Sayfaya Dön
              </Link>
              <span>{brand?.name ? brandName : 'e-infak.org'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
