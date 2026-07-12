'use client'

import { useLogin } from '@e-infak/api-client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label, Card } from '@e-infak/ui'
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Giriş Yap</h1>
          <p className="text-gray-600">Admin paneline erişim</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <Label htmlFor="password">Şifre</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-primary-600 hover:text-primary-700">
            Ana Sayfaya Dön
          </Link>
        </div>
      </Card>
    </div>
  )
}
