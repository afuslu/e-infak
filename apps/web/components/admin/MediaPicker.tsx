'use client'

import { useEffect, useState } from 'react'
import { MediaLibrary } from './media/MediaLibrary'
import type { MediaAsset } from '../../lib/media'
import { ghostButton, primaryButton } from './FormKit'

export type { MediaAsset } from '../../lib/media'

/** Modal that lets an editor pick (or upload) an image from the organisation's media library.
 *  `onSelect` receives the whole asset: `url`, `srcset`, `alt_text`, focal point… */
export function MediaPicker({ open, onClose, onSelect, title = 'Medya kütüphanesinden seç' }: {
  open: boolean
  onClose: () => void
  onSelect: (asset: MediaAsset) => void
  title?: string
}) {
  const [chosen, setChosen] = useState<MediaAsset | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pick = (asset: MediaAsset) => {
    onSelect(asset)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white text-left font-normal shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Kapat">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <MediaLibrary compact selectedId={chosen?.id} onSelect={setChosen} onOpen={pick} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="min-w-0 truncate text-xs text-gray-500">
            {chosen
              ? `${chosen.original_name || 'Görsel'} · ${chosen.width}×${chosen.height}${chosen.alt_text ? '' : ' · alt metin yok'}`
              : 'Bir görsel seçin (çift tıklayarak hemen seçebilirsiniz) veya yeni görsel yükleyin.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className={ghostButton} onClick={onClose}>Vazgeç</button>
            <button type="button" className={primaryButton} disabled={!chosen} onClick={() => chosen && pick(chosen)}>Seç</button>
          </div>
        </div>
      </div>
    </div>
  )
}
