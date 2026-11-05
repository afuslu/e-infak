const API_URL = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')

interface DirectoryEntry {
  slug: string
  name: string
  tagline: string | null
  logo_url: string | null
  primary_color: string | null
  url: string
}

async function getDirectory(): Promise<DirectoryEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/directory`, { next: { revalidate: 300 } })
    return res.ok ? await res.json() : []
  } catch {
    return []
  }
}

const FEATURES = [
  ['Hazır bağış sitesi', 'Kendi alan adınızla, 3 hazır şablondan biriyle dakikalar içinde yayında.'],
  ['Online bağış ve makbuz', 'Kartla 3D Secure ödeme, havale eşleştirme, otomatik makbuz ve SMS.'],
  ['Bağışçı yönetimi', 'Bağışçı kartı, temsilci atama, notlar, raporlar ve bağışçı paneli.'],
  ['Kurban, sponsorluk, su kuyusu', 'Hisse dağıtımı, taksitli sponsorluk, kumbara ve kumanya takibi.'],
]

/** e-infak.org landing page: the platform itself plus the organisations it serves. */
export async function EInfakPortal() {
  const organisations = await getDirectory()
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100">
      <div className="pointer-events-none absolute -left-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-1/4 bottom-1/4 h-[600px] w-[600px] rounded-full bg-sky-500/10 blur-[120px]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between border-b border-slate-900/80 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-500 text-lg font-black text-white">e</div>
          <div>
            <span className="text-xl font-extrabold tracking-wider">E-İNFAK</span>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Dernek bağış platformu</p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="/giris" className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 hover:border-slate-700">Kurum Girişi</a>
          <a href="/platform" className="rounded-lg px-4 py-2 text-slate-400 hover:text-white">Platform</a>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 py-16">
        <section className="mx-auto mb-16 max-w-3xl space-y-5 text-center">
          <h1 className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-black leading-tight tracking-tight text-transparent md:text-6xl">
            Derneğiniz için bağış sitesi ve otomasyon
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-400 md:text-lg">
            Bağış sitesi, online ödeme, makbuz, bağışçı yönetimi ve saha operasyonları tek panelde. Kurulum ve bakım bizden.
          </p>
          <a href="mailto:info@e-infak.org?subject=E-%C4%B0nfak%20demo%20talebi" className="inline-block rounded-xl bg-emerald-600 px-7 py-3.5 font-bold text-white hover:bg-emerald-500">
            Demo talep edin
          </a>
        </section>

        <section className="mb-16 grid gap-4 md:grid-cols-4">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5">
              <div className="mb-1 font-bold text-white">{title}</div>
              <div className="text-sm leading-relaxed text-slate-400">{text}</div>
            </div>
          ))}
        </section>

        {organisations.length > 0 && (
          <section>
            <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-widest text-slate-500">E-İnfak ile bağış toplayan kurumlar</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {organisations.map((org) => (
                <a key={org.slug} href={org.url}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-900 bg-slate-900/30 p-5 transition-all hover:-translate-y-0.5 hover:border-slate-700">
                  {org.logo_url
                    ? <img src={org.logo_url.startsWith('/') ? `${org.url}${org.logo_url}` : org.logo_url} alt="" className="h-14 w-14 rounded-full bg-white object-cover" />
                    : <div className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: org.primary_color || '#0E7A5F' }}>{org.name[0]}</div>}
                  <div className="min-w-0">
                    <div className="truncate font-bold text-white">{org.name}</div>
                    {org.tagline && <div className="truncate text-sm text-slate-400">{org.tagline}</div>}
                    <div className="truncate text-xs text-slate-500 group-hover:text-slate-300">{org.url.replace('https://', '')} →</div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="relative z-10 w-full border-t border-slate-900/50 bg-slate-950/80 py-8 text-center">
        <p className="text-xs text-slate-600">E-İnfak Dernek Bağış Platformu © {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
