'use client'

/** STK PRO "Kısayollar": which F-key opens which page (this browser only). */
import { useEffect, useState } from 'react'
import { Check, Keyboard, RotateCcw } from 'lucide-react'
import { ALLOWED_KEYS, DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, loadShortcuts, saveShortcuts } from '../../../../components/admin/shortcuts'
import { toast } from '../../../../components/admin/ui'

export default function ShortcutsPage() {
  const [map, setMap] = useState<Record<string, string>>(DEFAULT_SHORTCUTS)
  const [capture, setCapture] = useState<string | null>(null)
  useEffect(() => { setMap(loadShortcuts()) }, [])
  const keyOf = (action: string) => Object.entries(map).find(([, a]) => a === action)?.[0]

  useEffect(() => {
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapture(null); return }
      const next = { ...map }
      for (const [k, a] of Object.entries(next)) if (a === capture) delete next[k]
      if (e.key === 'Backspace' || e.key === 'Delete') { setMap(next); setCapture(null); return }
      if (!ALLOWED_KEYS.includes(e.key)) { toast.error('İzinli tuşlar: F2–F4, F6–F10'); return }
      next[e.key] = capture
      setMap(next)
      setCapture(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture, map])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Keyboard className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Klavye Kısayolları</h1>
        <div className="ms-auto flex gap-2">
          <button type="button" onClick={() => setMap({ ...DEFAULT_SHORTCUTS })} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"><RotateCcw className="h-4 w-4" /> Varsayılanlara Dön</button>
          <button type="button" onClick={() => { saveShortcuts(map); toast.ok('Kısayollar kaydedildi') }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700"><Check className="h-4 w-4" /> Kaydet</button>
        </div>
      </div>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
        <p className="mb-4 text-[13px] text-gray-500">Kutuya tıklayın, ardından atamak istediğiniz F tuşuna basın. İzinli tuşlar F2–F4 ve F6–F10; F1, F5, F11 ve F12 tarayıcıya ayrılmıştır. Kaldırmak için Backspace. Değişiklik yalnız sizin bu tarayıcınız için geçerlidir.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {SHORTCUT_ACTIONS.map((a) => (
            <label key={a.key} className="block">
              <span className="mb-1 block text-[13px] font-semibold text-gray-700">{a.label}</span>
              <button type="button" onClick={() => setCapture(a.key)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-[14px] ${capture === a.key ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-300'} ${keyOf(a.key) ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                {capture === a.key ? 'Bir F tuşuna basın…' : keyOf(a.key) || 'Atanmadı — tıklayın'}
              </button>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
