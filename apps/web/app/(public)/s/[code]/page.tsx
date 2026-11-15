'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ShortLinkRedirectPage() {
  const params = useParams<{ code: string }>()
  const code = params?.code || ''
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) return
    axios
      .get<{ redirect_url: string }>(`${apiUrl}/api/v1/public/sms/r/${encodeURIComponent(code)}`)
      .then((res) => {
        if (res.data?.redirect_url) {
          window.location.replace(res.data.redirect_url)
        } else {
          setError('Hedef adres bulunamadı.')
        }
      })
      .catch(() => setError('Bu bağlantı geçersiz veya süresi dolmuş.'))
  }, [code])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center text-sm text-gray-500">
        {error ? <p className="font-semibold text-red-600">{error}</p> : <p>Yönlendiriliyorsunuz…</p>}
      </div>
    </div>
  )
}
