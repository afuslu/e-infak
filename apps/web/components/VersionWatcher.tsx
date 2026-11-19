'use client'

import { useEffect, useRef, useState } from 'react'

function isChunkOrActionError(msg: string): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to find Server Action|Importing a module script failed/i.test(msg)
}

export function VersionWatcher() {
  const initialIdRef = useRef<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let active = true

    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { buildId?: string }
        const id = data?.buildId
        if (!id || !active) return
        if (!initialIdRef.current) {
          initialIdRef.current = id
        } else if (initialIdRef.current !== id) {
          setUpdateAvailable(true)
          setDismissed(false)
        }
      } catch { /* ignore transient network errors during deploy */ }
    }

    check()
    const timer = setInterval(check, 45_000)

    const onFocus = () => { void check() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onError = (e: ErrorEvent) => {
      const msg = e?.message || e?.error?.message || ''
      if (isChunkOrActionError(msg)) {
        setUpdateAvailable(true)
        setDismissed(false)
      }
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e?.reason?.message || e?.reason || '')
      if (isChunkOrActionError(msg)) {
        setUpdateAvailable(true)
        setDismissed(false)
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (!updateAvailable || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 end-4 z-[9999] flex max-w-sm items-center gap-3 rounded-2xl border border-primary-200 bg-white p-4 text-gray-900 shadow-2xl ring-1 ring-black/5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-lg">
        🚀
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-gray-900">Yeni sürüm yüklendi</div>
        <div className="text-xs text-gray-500">Güncel sürüme geçmek ister misiniz?</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-primary-700"
        >
          Geç
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Kapat"
          className="rounded-lg px-2 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
