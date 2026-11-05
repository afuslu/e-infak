'use client'

import { useEffect, useState } from 'react'
import { adminGet } from '../../lib/admin-access'
import { inputClass } from './FormKit'

export interface PickedDonor { id: string; full_name: string; phone: string | null; email: string | null }

/** Search-as-you-type donor selector backed by GET /admin-features/donors. */
export function DonorPicker({ value, onChange, label = 'Bağışçı' }: {
  value: PickedDonor | null
  onChange: (donor: PickedDonor | null) => void
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedDonor[]>([])

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      adminGet<{ items: PickedDonor[] }>('/donors', { q: query, page_size: 8, sort: 'name' })
        .then((res) => setResults(res.data.items))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, value])

  return (
    <div className="relative">
      <span className="mb-1 block text-xs font-bold text-gray-600">{label}</span>
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 p-2.5 text-sm">
          <span><strong>{value.full_name}</strong> <span className="text-xs text-gray-500">{value.phone || value.email}</span></span>
          <button type="button" onClick={() => onChange(null)} className="text-xs font-bold text-primary-700">Değiştir</button>
        </div>
      ) : (
        <input className={inputClass} placeholder="Ad, telefon veya e-posta yazın" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg">
          {results.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => { onChange(d); setQuery('') }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                <span className="font-semibold">{d.full_name}</span>
                <span className="ml-2 text-xs text-gray-500">{d.phone || d.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
