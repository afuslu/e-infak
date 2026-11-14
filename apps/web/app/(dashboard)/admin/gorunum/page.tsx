'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminAppearanceRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/site-yapici?tab=theme')
  }, [router])

  return (
    <div className="p-6 text-sm text-gray-500">
      Tema ve marka ayarları Site Yapıcı&apos;ya taşındı. Yönlendiriliyorsunuz…
    </div>
  )
}
