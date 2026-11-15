'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'
import { BellOff, CheckCircle2 } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface OptOutInfo {
  org_name: string
  phone_masked: string
  opted_out: boolean
}

export default function SmsOptOutPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token || ''
  const [info, setInfo] = useState<OptOutInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    axios
      .get<OptOutInfo>(`${apiUrl}/api/v1/public/sms/opt-out/${encodeURIComponent(token)}`)
      .then((res) => {
        setInfo(res.data)
        if (res.data.opted_out) setDone(true)
      })
      .catch(() => setError('Bağlantı geçersiz veya süresi dolmuş.'))
      .finally(() => setLoading(false))
  }, [token])

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await axios.post(`${apiUrl}/api/v1/public/sms/opt-out/${encodeURIComponent(token)}`)
      setDone(true)
    } catch {
      setError('İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md space-y-5 border border-gray-100 p-6 text-center shadow-sm">
        {loading ? (
          <p className="py-6 text-sm text-gray-500">Yükleniyor…</p>
        ) : error ? (
          <div className="space-y-2 py-4">
            <p className="text-sm font-semibold text-red-600">{error}</p>
          </div>
        ) : done ? (
          <div className="space-y-3 py-3">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="text-lg font-bold text-gray-900">SMS İzni İptal Edildi</h1>
            <p className="text-sm leading-relaxed text-gray-600">
              <strong>{info?.org_name}</strong> tarafından gönderilen tanıtım ve toplu bilgilendirme SMS&apos;leri artık{' '}
              <span className="font-mono">{info?.phone_masked}</span> numarasına gönderilmeyecektir.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <BellOff className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="text-lg font-bold text-gray-900">SMS Bildirimlerinden Çıkış</h1>
            <p className="text-sm leading-relaxed text-gray-600">
              <strong>{info?.org_name}</strong> tarafından <span className="font-mono">{info?.phone_masked}</span> numarasına gönderilen toplu
              SMS&apos;leri almak istemiyorsanız aşağıdaki butona tıklayın.
            </p>
            <Button onClick={confirm} disabled={busy} className="w-full">
              {busy ? 'İşleniyor…' : 'SMS İznimi İptal Et'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
