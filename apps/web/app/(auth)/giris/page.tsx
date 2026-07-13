'use client'

import { useLogin } from '@e-infak/api-client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const login = useLogin()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      await login.mutateAsync(data)
      router.push('/admin')
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Giriş başarısız')
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden font-sans px-4 py-12">
      {/* Background Glowing Blurs */}
      <div className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] bg-red-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md p-8 bg-slate-900/30 backdrop-blur-xl border border-slate-900 rounded-2xl shadow-2xl">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-red-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">Giriş Yap</h1>
          <p className="text-sm text-slate-500 mt-1">Admin paneline erişim</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-400 mb-2">E-posta</label>
            <input
              id="email"
              type="email"
              {...register('email')}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800/80 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder-slate-600 outline-none transition-all duration-300"
              placeholder="admin@e-infak.org"
            />
            {errors.email && <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-2">Şifre</label>
            <input
              id="password"
              type="password"
              {...register('password')}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800/80 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 text-white placeholder-slate-600 outline-none transition-all duration-300"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-red-600 hover:from-emerald-600 hover:to-red-700 text-white font-semibold transition-all duration-300 shadow-lg shadow-emerald-950/30 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {login.isPending ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors duration-300">
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  )
}
