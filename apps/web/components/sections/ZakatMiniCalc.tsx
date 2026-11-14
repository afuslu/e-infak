'use client'

import Link from 'next/link'
import { useState } from 'react'

const LABELS: Record<string, { asset: string; result: string; donate: string; full: string; placeholder: string }> = {
  tr: {
    asset: 'Zekata Tabi Toplam Varlığınız (₺)',
    result: 'Hesaplanan Zekat (%2,5)',
    donate: 'Hesaplanan Zekatı Bağışla',
    full: 'Detaylı Zekat Hesaplayıcı →',
    placeholder: 'Örn. 100000',
  },
  en: {
    asset: 'Total Zakatable Assets',
    result: 'Calculated Zakat (2.5%)',
    donate: 'Donate Calculated Zakat',
    full: 'Detailed Zakat Calculator →',
    placeholder: 'e.g. 100000',
  },
  ar: {
    asset: 'إجمالي الأموال الخاضعة للزكاة',
    result: 'الزكاة المستحقة (2.5%)',
    donate: 'تبرع بالزكاة المحسوبة',
    full: 'حاسبة الزكاة التفصيلية →',
    placeholder: 'مثال: 100000',
  },
}

export function ZakatMiniCalc({
  locale = 'tr',
  donateUrl = '/kampanyalar',
  calcUrl = '/zekat-hesapla',
  presets,
}: {
  locale?: string
  donateUrl?: string
  calcUrl?: string
  presets?: number[]
}) {
  const chipList = presets && presets.length > 0 ? presets : [50000, 100000, 250000, 500000]
  const [raw, setRaw] = useState(String(chipList[1] ?? chipList[0] ?? 100000))
  const l = LABELS[locale] || LABELS.tr
  const num = Number(raw.replace(/[^\d]/g, '')) || 0
  const zakat = Math.round(num * 0.025)
  const fmt = locale === 'tr' ? 'tr-TR' : locale === 'ar' ? 'ar' : 'en'
  const sep = donateUrl.includes('?') ? '&' : '?'

  return (
    <div className="rounded-2xl border border-white/15 bg-white p-5 text-gray-900 shadow-xl sm:p-6">
      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-500">
        {l.asset}
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          placeholder={l.placeholder}
          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-heading text-lg font-bold text-gray-900 focus:border-primary-600 focus:bg-white focus:outline-none"
        />
      </label>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {chipList.map((preset: number) => (
          <button
            key={preset}
            type="button"
            onClick={() => setRaw(String(preset))}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              num === preset ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-800 hover:bg-primary-100'
            }`}
          >
            {preset.toLocaleString(fmt)} ₺
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-primary-50 px-4 py-3">
        <span className="text-xs font-bold text-primary-800">{l.result}</span>
        <span className="font-heading text-2xl font-extrabold text-primary-700">{zakat.toLocaleString(fmt)} ₺</span>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={zakat > 0 ? `${donateUrl}${sep}tutar=${zakat}` : donateUrl}
          className="w-full rounded-xl bg-accent-500 py-3.5 text-center text-sm font-extrabold text-white shadow-sm transition hover:bg-accent-600"
        >
          {l.donate}
        </Link>
        <Link href={calcUrl} className="text-center text-xs font-bold text-primary-700 hover:underline">
          {l.full}
        </Link>
      </div>
    </div>
  )
}
