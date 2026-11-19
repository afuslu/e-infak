'use client'

import { useEffect } from 'react'

/** Last-resort error screen (the root layout itself failed); it renders its own <html>. */
export default function GlobalError({ error, reset }: { error?: Error & { digest?: string }; reset: () => void }) {
  const isChunk = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to find Server Action/i.test(error?.message || '')

  useEffect(() => {
    if (!isChunk) return
    try {
      const last = Number(sessionStorage.getItem('einfak-chunk-reload') || 0)
      if (Date.now() - last > 15_000) {
        sessionStorage.setItem('einfak-chunk-reload', String(Date.now()))
        window.location.reload()
      }
    } catch {
      window.location.reload()
    }
  }, [isChunk])

  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>{isChunk ? '🚀 Yeni sürüm yayınlandı' : 'Beklenmeyen bir hata oluştu'}</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              {isChunk ? 'Uygulama güncellendi. Yeni sürüme geçmek için sayfayı yenileyin.' : 'Sayfa yüklenemedi. Tekrar deneyebilir ya da ana sayfaya dönebilirsiniz.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <button onClick={() => (isChunk ? window.location.reload() : reset())} style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {isChunk ? 'Yeni Sürüme Geç' : 'Tekrar dene'}
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 700, textDecoration: 'none' }}>Ana sayfa</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
