'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminMenuRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/site-yapici?tab=menu')
  }, [router])

  return (
    <div className="p-6 text-sm text-gray-500">
      Menü yönetimi Site Yapıcı&apos;ya taşındı. Yönlendiriliyorsunuz…
    </div>
  )
}
