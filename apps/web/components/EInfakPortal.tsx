import Link from 'next/link'

const API_URL = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')
const DEMO_MAIL = 'mailto:info@e-infak.org?subject=E-%C4%B0nfak%20demo%20talebi'

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

const PANELS = [
  {
    icon: '🛡️', name: 'Yönetim paneli', who: 'Dernek personeli için',
    points: ['Bağış, makbuz, kasa ve banka hareketleri tek ekranda', 'Bağışçı kartı, notlar, temsilci atama ve raporlar', 'Personele göre yetki; açık ve koyu tema'],
  },
  {
    icon: '🤲', name: 'Bağışçı paneli', who: 'Bağışçılarınız için',
    points: ['SMS koduyla şifresiz giriş', 'Bağış geçmişi, makbuz ve kurban kesim videosu', 'Sponsorluk taksiti ve üyelik aidatını online ödeme'],
  },
  {
    icon: '🎓', name: 'Veli paneli', who: 'Öğrenci velileri için',
    points: ['Hafızlık ilerlemesini sayfa sayfa takip', 'Hoca değerlendirmeleri', 'Aynı numaraya kayıtlı tüm öğrenciler tek girişte'],
  },
]

const MODULES = [
  ['🧩', 'Site yapıcı', 'Sürükle-bırak bloklar, hazır slider ve bölümlerle kendi alan adınızda bağış sitesi.'],
  ['💳', 'Online bağış', 'Kartla 3D Secure ödeme, bağış sepeti, düzenli bağış talimatı ve havale eşleştirme.'],
  ['🧾', 'Makbuz', 'Otomatik makbuz ve SMS, elden makbuz ve koçan takibi, makbuz doğrulama sayfası.'],
  ['👥', 'Bağışçı yönetimi', 'Bağışçı kartı, mükerrer kayıt birleştirme, Excel’den aktarım ve toplu SMS.'],
  ['🐏', 'Kurban organizasyonu', 'Hisse dağıtımı, kesim takibi ve bağışçıya özel kesim videosu.'],
  ['🎗️', 'Sponsorluk ve burs', 'Yetim ve öğrenci sponsorluğu, taksit planı ve gecikme takibi.'],
  ['📍', 'Su kuyusu', 'Hisseli veya tek bağışçılı kuyular, yapım durumu ve fotoğraf galerisi.'],
  ['🫙', 'Kumbara ve kumanya', 'Kumbara dağıtım ve toplama, kumanya dağıtım kayıtları.'],
  ['🪪', 'Üyelik ve aidat', 'Üye kaydı, dönemlik aidat tahakkuku ve online aidat ödeme.'],
  ['🏠', 'Yoksul takibi', 'Başvuru, hane bilgisi ve puanlama ile ihtiyaç sahibi takibi.'],
  ['📚', 'Finans ve muhasebe', 'Kasa ve giderler, banka hesapları, gelen havaleler ve mutabakat.'],
  ['🌍', 'Çoklu dil ve para birimi', 'Sitenizi birden çok dilde yayınlayın, farklı para birimlerinde bağış alın.'],
]

const STEPS = [
  ['Tanışma', 'Kurumunuzun ihtiyaçlarını dinliyor, panelleri canlı gösteriyoruz.'],
  ['Kurulum', 'Sitenizi, ödeme ve SMS hesaplarınızı kuruyor; mevcut bağışçı listenizi aktarıyoruz.'],
  ['Yayın', 'Kendi alan adınızla yayına alıyoruz. Bakım ve güncellemeler bizde kalıyor.'],
]

const PLANS = [
  {
    name: 'Başlangıç', users: '1 personel hesabı',
    items: ['Bağış sitesi ve site yapıcı', 'Online bağış ve makbuz', 'Bağışçı yönetimi', 'SMS ve aylık bağış raporu'],
  },
  {
    name: 'Orta', users: '3 personel hesabı', featured: true,
    items: ['Başlangıç paketindeki her şey', 'Kurban, sponsorluk, su kuyusu', 'Kumbara, kumanya, üyelik ve aidat', 'Banka hareketleri, çoklu dil ve para birimi'],
  },
  {
    name: 'İleri', users: '5 personel hesabı',
    items: ['Orta paketindeki her şey', 'Muhasebe', 'Yoksul takibi ve puanlama', 'Düzenli ödeme talimatları'],
  },
]

const sectionTitle = 'text-3xl font-black tracking-tight text-white md:text-4xl'
const eyebrow = 'mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400'

/** Decorative sketch of the admin panel; the figures are placeholders, not real data. */
function PanelSketch() {
  const bars = [38, 52, 44, 68, 60, 86]
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-emerald-950/40">
      <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" /><span className="h-2.5 w-2.5 rounded-full bg-slate-700" /><span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        <span className="ms-3 h-4 flex-1 rounded bg-slate-800" />
      </div>
      <div className="flex">
        <div className="hidden w-32 flex-shrink-0 space-y-2 border-e border-slate-800 p-3 sm:block">
          {['Genel Bakış', 'Bağışlar', 'Bağışçılar', 'Kurban', 'Web Sitesi'].map((label, i) => (
            <div key={label} className={`rounded-md px-2 py-1.5 text-[10px] font-semibold ${i === 0 ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-500'}`}>{label}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="grid grid-cols-3 gap-2">
            {['Bugün', 'Bu ay', 'Bağışçı'].map((label, i) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`mt-1.5 h-3 rounded ${i === 1 ? 'w-4/5 bg-emerald-400/70' : 'w-3/5 bg-slate-600'}`} />
              </div>
            ))}
          </div>
          <div className="flex h-28 items-end gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            {bars.map((height, i) => (
              <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${height}%`, opacity: 0.45 + i * 0.11 }} />
            ))}
          </div>
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-2">
                <span className="h-5 w-5 rounded-full bg-slate-700" />
                <span className="h-2 flex-1 rounded bg-slate-800" />
                <span className="h-2 w-10 rounded bg-emerald-500/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** e-infak.org landing page: the platform itself plus the organisations it serves. */
export async function EInfakPortal() {
  const organisations = await getDirectory()
  const nav = [
    ['#paneller', 'Paneller'],
    ['#moduller', 'Modüller'],
    ['#paketler', 'Paketler'],
    ...(organisations.length ? [['#kurumlar', 'Kurumlar']] : []),
  ]
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden scroll-smooth bg-slate-950 font-sans text-slate-100">
      <div className="pointer-events-none absolute -left-1/4 top-0 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-1/4 top-[500px] h-[600px] w-[600px] rounded-full bg-sky-500/10 blur-[120px]" />

      <header className="sticky top-0 z-20 border-b border-slate-900/80 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-500 text-lg font-black text-white">e</div>
            <div>
              <span className="text-xl font-extrabold tracking-wider">E-İNFAK</span>
              <p className="hidden text-[10px] uppercase tracking-widest text-slate-500 sm:block">Dernek bağış platformu</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-400 md:flex" aria-label="Sayfa bölümleri">
            {nav.map(([href, label]) => <a key={href} href={href} className="hover:text-white">{label}</a>)}
          </nav>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link href="/giris" className="rounded-lg border border-slate-800 bg-slate-900/50 px-3.5 py-2 hover:border-slate-600">Kurum Girişi</Link>
            <a href={DEMO_MAIL} className="rounded-lg bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-500 sm:px-3.5">
              <span className="sm:hidden">Demo</span>
              <span className="hidden sm:inline">Demo talep edin</span>
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6 text-center lg:text-start">
            <p className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-bold text-emerald-300">
              Dernek ve vakıflar için
            </p>
            <h1 className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-black leading-[1.1] tracking-tight text-transparent sm:text-5xl lg:text-6xl">
              Bağış siteniz ve dernek otomasyonunuz tek panelde
            </h1>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-400 md:text-lg lg:mx-0">
              Bağış sitesi, online ödeme, makbuz, bağışçı yönetimi ve saha operasyonları birlikte çalışır. Kurulum ve bakım bizden.
            </p>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <a href={DEMO_MAIL} className="rounded-xl bg-emerald-600 px-7 py-3.5 font-bold text-white shadow-lg shadow-emerald-950/40 hover:bg-emerald-500">Demo talep edin</a>
              <a href="#moduller" className="rounded-xl border border-slate-700 px-7 py-3.5 font-bold text-slate-200 hover:border-slate-500">Modülleri inceleyin</a>
            </div>
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400 lg:justify-start">
              {['Kendi alan adınız', '3D Secure ödeme', 'Otomatik makbuz ve SMS'].map((item) => (
                <li key={item} className="flex items-center gap-2"><span className="text-emerald-400" aria-hidden="true">✓</span>{item}</li>
              ))}
            </ul>
          </div>
          <PanelSketch />
        </section>

        <section id="paneller" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <p className={eyebrow}>Üç panel</p>
            <h2 className={sectionTitle}>Personel, bağışçı ve veli için ayrı ekranlar</h2>
            <p className="mt-3 text-slate-400">Herkes yalnızca kendi işine yarayan ekranı görür; veriler tek yerde tutulur.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {PANELS.map((panel) => (
              <div key={panel.name} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl" aria-hidden="true">{panel.icon}</div>
                <h3 className="text-lg font-bold text-white">{panel.name}</h3>
                <p className="mb-4 text-sm text-emerald-400">{panel.who}</p>
                <ul className="space-y-2.5 text-sm leading-relaxed text-slate-400">
                  {panel.points.map((point) => (
                    <li key={point} className="flex gap-2.5"><span className="text-emerald-400" aria-hidden="true">✓</span><span>{point}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="moduller" className="scroll-mt-24 border-y border-slate-900 bg-slate-900/20">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <p className={eyebrow}>Modüller</p>
              <h2 className={sectionTitle}>Bağıştan sahaya, ihtiyacınız olan her şey</h2>
              <p className="mt-3 text-slate-400">Paketinize göre açılır; kullanmadığınız modül menünüzde yer kaplamaz.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {MODULES.map(([icon, title, text]) => (
                <div key={title} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 transition-colors hover:border-emerald-500/40">
                  <div className="mb-3 text-2xl" aria-hidden="true">{icon}</div>
                  <h3 className="mb-1 font-bold text-white">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <p className={eyebrow}>Nasıl başlanır</p>
            <h2 className={sectionTitle}>Üç adımda yayındasınız</h2>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 font-black text-white">{i + 1}</div>
                <h3 className="mb-1.5 text-lg font-bold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="paketler" className="scroll-mt-24 border-y border-slate-900 bg-slate-900/20">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <p className={eyebrow}>Paketler</p>
              <h2 className={sectionTitle}>Kurumunuzun ölçeğine göre üç paket</h2>
              <p className="mt-3 text-slate-400">İhtiyaç büyüdükçe paket yükseltilir veya tek tek ek modül açılır. Fiyat için bize yazın.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {PLANS.map((plan) => (
                <div key={plan.name} className={`flex flex-col rounded-2xl border p-6 ${plan.featured ? 'border-emerald-500/60 bg-emerald-500/[0.06]' : 'border-slate-800 bg-slate-950/50'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-xl font-black text-white">{plan.name}</h3>
                    {plan.featured && <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">En çok tercih edilen</span>}
                  </div>
                  <p className="mb-5 text-sm text-slate-400">{plan.users}</p>
                  <ul className="mb-6 flex-1 space-y-2.5 text-sm text-slate-300">
                    {plan.items.map((item) => (
                      <li key={item} className="flex gap-2.5"><span className="text-emerald-400" aria-hidden="true">✓</span><span>{item}</span></li>
                    ))}
                  </ul>
                  <a href={DEMO_MAIL} className={`rounded-xl px-4 py-3 text-center text-sm font-bold ${plan.featured ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border border-slate-700 text-slate-200 hover:border-slate-500'}`}>
                    Teklif isteyin
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {organisations.length > 0 && (
          <section id="kurumlar" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <p className={eyebrow}>Kurumlar</p>
              <h2 className={sectionTitle}>E-İnfak ile bağış toplayan kurumlar</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {organisations.map((org) => (
                <a key={org.slug} href={org.url}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-all hover:-translate-y-0.5 hover:border-slate-600">
                  {org.logo_url
                    ? <img src={org.logo_url.startsWith('/') ? `${org.url}${org.logo_url}` : org.logo_url} alt="" className="h-14 w-14 flex-shrink-0 rounded-full bg-white object-cover" />
                    : <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: org.primary_color || '#059669' }}>{org.name[0]}</div>}
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

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 pt-4 sm:px-6">
          <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/20 to-sky-600/10 px-6 py-12 text-center sm:px-12">
            <h2 className={sectionTitle}>Panelleri kendi verinizle görün</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">Kısa bir görüşmede kurumunuza uygun paketi birlikte belirleyelim.</p>
            <a href={DEMO_MAIL} className="mt-7 inline-block rounded-xl bg-emerald-600 px-8 py-3.5 font-bold text-white hover:bg-emerald-500">Demo talep edin</a>
            <p className="mt-4 text-sm text-slate-400">info@e-infak.org</p>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-7 text-xs text-slate-500 sm:px-6">
          <p>E-İnfak Dernek Bağış Platformu © {new Date().getFullYear()}</p>
          <div className="flex gap-5">
            <Link href="/giris" className="hover:text-slate-300">Kurum Girişi</Link>
            <Link href="/platform" className="hover:text-slate-300">Platform</Link>
            <a href="mailto:info@e-infak.org" className="hover:text-slate-300">İletişim</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
