'use client'

import { useRef, useState } from 'react'
import { ghostButton, primaryButton } from '../FormKit'

type Box = { x: number; y: number; width: number; height: number }
const RATIOS: [string, number | null][] = [['Serbest', null], ['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1], ['3:4', 3 / 4]]

/** Rectangle selection over the uncropped image; the box is in fractions (0–1) of the image. */
export function CropTool({ src, imageWidth, imageHeight, busy, onApply, onCancel }: {
  src: string
  imageWidth: number
  imageHeight: number
  busy?: boolean
  onApply: (box: Box) => void
  onCancel: () => void
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Box>({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  const [ratio, setRatio] = useState<number | null>(null)
  const drag = useRef<{ mode: 'move' | 'draw'; startX: number; startY: number; origin: Box } | null>(null)

  const point = (e: React.PointerEvent) => {
    const rect = frame.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  // A pixel ratio becomes a fraction ratio once the image's own aspect is taken out.
  const fit = (b: Box, r: number | null): Box => {
    if (!r) return b
    const fractionRatio = r * (imageHeight / imageWidth)
    let { width, height } = b
    if (width / height > fractionRatio) width = height * fractionRatio
    else height = width / fractionRatio
    width = Math.min(width, 1 - b.x)
    height = Math.min(height, 1 - b.y)
    if (width / height > fractionRatio) width = height * fractionRatio
    else height = width / fractionRatio
    return { ...b, width, height }
  }

  const onDown = (e: React.PointerEvent, mode: 'move' | 'draw') => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = point(e)
    drag.current = { mode, startX: p.x, startY: p.y, origin: box }
    if (mode === 'draw') setBox({ x: p.x, y: p.y, width: 0.01, height: 0.01 })
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = point(e)
    if (d.mode === 'move') {
      const x = Math.min(1 - d.origin.width, Math.max(0, d.origin.x + p.x - d.startX))
      const y = Math.min(1 - d.origin.height, Math.max(0, d.origin.y + p.y - d.startY))
      setBox({ ...d.origin, x, y })
    } else {
      const x = Math.min(d.startX, p.x)
      const y = Math.min(d.startY, p.y)
      setBox(fit({ x, y, width: Math.max(0.02, Math.abs(p.x - d.startX)), height: Math.max(0.02, Math.abs(p.y - d.startY)) }, ratio))
    }
  }

  const pct = (v: number) => `${v * 100}%`
  const pixels = `${Math.round(box.width * imageWidth)} × ${Math.round(box.height * imageHeight)} px`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {RATIOS.map(([label, r]) => (
          <button key={label} type="button" onClick={() => { setRatio(r); setBox((b) => fit(r ? { ...b, x: 0, y: 0, width: 1, height: 1 } : b, r)) }}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ratio === r ? 'border-primary-600 bg-primary-600 text-white' : 'bg-white text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>
      <div ref={frame} className="relative touch-none select-none overflow-hidden rounded border bg-gray-900"
        onPointerDown={(e) => onDown(e, 'draw')} onPointerMove={onMove} onPointerUp={() => { drag.current = null }}>
        <img src={src} alt="" draggable={false} className="block w-full opacity-60" />
        <div className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height) }}
          onPointerDown={(e) => onDown(e, 'move')} />
      </div>
      <p className="text-[11px] text-gray-500">Seçmek için görselin üzerinde sürükleyin, kutuyu taşıyabilirsiniz. Sonuç: {pixels}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={primaryButton} onClick={() => onApply(box)}>{busy ? 'Kırpılıyor…' : 'Kırp ve kaydet'}</button>
        <button type="button" className={ghostButton} onClick={onCancel}>Vazgeç</button>
      </div>
    </div>
  )
}
