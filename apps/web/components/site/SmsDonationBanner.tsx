'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { MessageSquareText, Smartphone } from 'lucide-react'

interface PublicSmsDonation {
  enabled: boolean
  short_code: string
  default_amount: number | null
  public_note: string
  items: { keyword: string; campaign_id: string; campaign_title: string | null; campaign_slug: string | null }[]
}

export function SmsDonationBanner({ className = '' }: { className?: string }) {
  const [data, setData] = useState<PublicSmsDonation | null>(null)

  useEffect(() => {
    let alive = true
    axios
      .get<PublicSmsDonation>('/api/v1/public/sms-donations')
      .then((res) => {
        if (alive && res.data?.enabled && res.data.short_code) setData(res.data)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!data) return null

  return (
    <section className={`rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/60 p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-gray-900">
              SMS ile Hızlı Bağış · <span className="text-primary-700">{data.short_code}</span>
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {data.public_note
                || `Aşağıdaki anahtar kelimelerden birini yazıp ${data.short_code} numarasına SMS göndererek${data.default_amount ? ` ${data.default_amount.toLocaleString('tr-TR')} ₺` : ''} bağışta bulunabilirsiniz.`}
            </p>
          </div>
        </div>
        {data.default_amount ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-primary-100 px-3.5 py-1.5 text-xs font-bold text-primary-800 md:self-center">
            1 SMS = {data.default_amount.toLocaleString('tr-TR')} ₺
          </span>
        ) : null}
      </div>

      {data.items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.items.map((item) => (
            <a
              key={item.keyword}
              href={`sms:${data.short_code}?body=${encodeURIComponent(item.keyword)}`}
              className="group inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-2xs transition hover:border-primary-500 hover:bg-primary-50"
            >
              <Smartphone className="h-3.5 w-3.5 text-primary-600" />
              <span className="font-mono text-sm font-bold text-primary-700">{item.keyword}</span>
              <span className="text-gray-400">→</span>
              <span>{item.campaign_title || 'Bağış'}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-gray-600 group-hover:bg-primary-100 group-hover:text-primary-800">
                {data.short_code}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
