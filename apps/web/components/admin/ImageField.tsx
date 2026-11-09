'use client'

import { useRef, useState } from 'react'
import axios from 'axios'
import { adminApiBase, adminAuthHeaders, apiErrorMessage } from '../../lib/admin-access'
import { inputClass } from './FormKit'
import { MediaPicker } from './MediaPicker'

/** Image address field with a media library picker and an upload button (PNG, JPEG, WEBP, GIF, ICO; max 5 MB).
 *  Direct uploads land in the media library too. */
export function ImageField({ label, value, onChange, hint, preview = 'wide' }: {
  label: string
  value: string | null | undefined
  onChange: (url: string) => void
  hint?: string
  preview?: 'wide' | 'square'
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)

  const upload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await axios.post<{ url: string }>(`${adminApiBase()}/api/v1/admin-features/uploads`, body, { headers: adminAuthHeaders() })
      onChange(res.data.url)
    } catch (err) {
      setError(apiErrorMessage(err, 'Görsel yüklenemedi'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="text-xs font-bold text-gray-600">
      <span className="mb-1 block">{label}</span>
      <div className="flex flex-wrap gap-2">
        {value && (
          <img src={value} alt="" className={`flex-shrink-0 rounded border bg-gray-50 object-cover ${preview === 'square' ? 'h-10 w-10' : 'h-10 w-16'}`} />
        )}
        <input className={`${inputClass} min-w-[10rem] flex-1`} placeholder="https://… veya yükleyin" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        <div className="flex gap-2">
          <button type="button" onClick={() => setPicking(true)}
            className="whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:border-primary-600">
            Kütüphaneden seç
          </button>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="whitespace-nowrap rounded-lg border bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:border-primary-600 disabled:opacity-50">
            {busy ? 'Yükleniyor…' : 'Yükle'}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon" className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {hint && <span className="mt-1 block font-normal text-gray-400">{hint}</span>}
      {error && <span className="mt-1 block font-semibold text-red-600">{error}</span>}
      <MediaPicker open={picking} onClose={() => setPicking(false)} onSelect={(asset) => onChange(asset.url)} />
    </div>
  )
}
