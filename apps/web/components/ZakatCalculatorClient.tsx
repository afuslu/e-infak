'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useZakatInfo } from '@e-infak/api-client'

// Colours follow the organisation theme (CSS variables set by the root layout).
const c = {
  primary: 'var(--brand-primary-600)',
  hover: 'var(--brand-primary-700)',
  accent: 'var(--brand-accent-500)',
  accentHover: 'var(--brand-accent-600)',
  accentDark: '#FFFFFF',
  border: '#E5E7EB',
  text: '#6B7280',
  label: '#374151',
  heading: '#111827',
  dark: 'var(--brand-primary-900)',
  darkMuted: 'var(--brand-primary-100)',
  resultColor: 'var(--brand-accent-200)',
}

export function ZakatCalculatorClient() {
  const { data: zakatInfo } = useZakatInfo()
  const goldPrice = zakatInfo?.gold_price_per_gram ?? 3000
  const nisap = zakatInfo?.nisap_amount_lira ?? 85 * goldPrice

  const [altin, setAltin] = useState('')
  const [nakit, setNakit] = useState('')
  const [doviz, setDoviz] = useState('')
  const [alacak, setAlacak] = useState('')
  const [borc, setBorc] = useState('')

  const total = useMemo(() => {
    const altinLira = (Number(altin) || 0) * goldPrice
    return altinLira + (Number(nakit) || 0) + (Number(doviz) || 0) + (Number(alacak) || 0) - (Number(borc) || 0)
  }, [altin, nakit, doviz, alacak, borc, goldPrice])

  const isZekatFarz = total >= nisap
  const zekat = isZekatFarz ? total / 40 : 0

  const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString('tr-TR') + ' ₺'

  return (
    <div className="font-sans" style={{ color: c.heading }}>
      <div className="max-w-[900px] mx-auto px-6 pt-14 pb-20">
        <Link href="/" className="font-bold text-sm mb-6 inline-block" style={{ color: c.primary }}>
          ← Ana sayfaya dön
        </Link>
        <h1 className="font-heading text-[38px] font-bold mb-2">Zekât Hesaplama</h1>
        <p className="text-[15px] leading-relaxed mb-7" style={{ color: c.text }}>
          Varlıklarınızı girin; nisab kontrolü ve zekât tutarınız (1/40) otomatik hesaplansın. Güncel gram altın:{' '}
          <strong>{goldPrice.toLocaleString('tr-TR')} ₺</strong>
        </p>

        <div className="grid md:grid-cols-[1.2fr_1fr] gap-6 items-start">
          <div className="bg-white rounded-2xl p-7 flex flex-col gap-3.5" style={{ border: `1px solid ${c.border}` }}>
            {[
              { label: 'Altın (gram)', value: altin, setter: setAltin },
              { label: 'Nakit para (₺)', value: nakit, setter: setNakit },
              { label: 'Döviz / birikim (₺ karşılığı)', value: doviz, setter: setDoviz },
              { label: 'Alacaklar (₺)', value: alacak, setter: setAlacak },
              { label: 'Borçlar (₺) — düşülür', value: borc, setter: setBorc },
            ].map((f) => (
              <div key={f.label}>
                <div className="text-[13px] font-bold mb-1.5" style={{ color: c.label }}>{f.label}</div>
                <input
                  type="number"
                  placeholder="0"
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  className="w-full rounded-lg border p-3 text-[15px] outline-none"
                  style={{ borderColor: c.border }}
                />
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-7 text-white sticky top-24" style={{ background: c.dark }}>
            <div className="text-xs font-bold tracking-wider mb-2" style={{ color: c.darkMuted }}>TOPLAM VARLIK</div>
            <div className="font-heading text-[30px] font-bold mb-4.5">{fmt(total)}</div>
            <div className="text-xs font-bold tracking-wider mb-2" style={{ color: c.darkMuted }}>NİSAB (85 gr altın)</div>
            <div className="text-base font-bold mb-4.5">{fmt(nisap)}</div>
            <div className="border-t border-white/20 pt-4.5">
              <div className="text-xs font-bold tracking-wider mb-2" style={{ color: c.darkMuted }}>
                {isZekatFarz ? 'ZEKÂT MİKTARINIZ (1/40)' : 'NİSAB ALTINDA — ZEKÂT FARZ DEĞİL'}
              </div>
              <div className="font-heading text-[36px] font-bold" style={{ color: c.resultColor }}>{fmt(zekat)}</div>
            </div>
            <Link
              href="/#hizli-bagis"
              className="mt-5 w-full block text-center font-extrabold text-[15px] py-3.5 rounded-[10px]"
              style={{ background: c.accent, color: c.accentDark }}
            >
              Zekâtımı Şimdi Ver
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
