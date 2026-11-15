'use client'

/** Last-resort error screen (the root layout itself failed); it renders its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>Beklenmeyen bir hata oluştu</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>Sayfa yüklenemedi. Tekrar deneyebilir ya da ana sayfaya dönebilirsiniz.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <button onClick={reset} style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Tekrar dene</button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 700, textDecoration: 'none' }}>Ana sayfa</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
