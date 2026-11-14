'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPagesRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/site-yapici?tab=pages')
  }, [router])

  return (
    <div className="p-6 text-sm text-gray-500">
      Sayfa yönetimi Site Yapıcı&apos;ya taşındı. Yönlendiriliyorsunuz…
    </div>
  )
}
