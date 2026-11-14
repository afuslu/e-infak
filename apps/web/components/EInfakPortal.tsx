import Link from 'next/link'
import { cookies } from 'next/headers'
import {
  ArrowDownToLine, ArrowRight, Beef, Blocks, Calculator, Check, CreditCard, Droplets, Globe, GraduationCap, HandCoins,
  HeartHandshake, Home, IdCard, MessagesSquare, PiggyBank, Receipt, ShieldCheck, Users, type LucideIcon,
} from 'lucide-react'
import { DemoForm, PlanCta } from './portal/DemoForm'
import { MockBuilder, Screenshot } from './portal/Mocks'
import { PortalThemeToggle } from './portal/ThemeToggle'

const API_URL = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020').replace(/\/$/, '')

interface DirectoryEntry { slug: string; name: string; tagline: string | null; logo_url: string | null; primary_color: string | null; url: string }
interface PlanInfo { key: string; label: string; users: number }

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 300 } })
    return res.ok ? await res.json() : fallback
  } catch {
    return fallback
  }
}

const SPOTLIGHTS: { eyebrow: string; title: string; text: string; points: string[]; mock: 'transfer' | 'sms' | 'bulk' | 'builder' }[] = [
  {
    eyebrow: 'Havale eşleştirme', mock: 'transfer',
    title: 'Bankaya gelen havale, kimin bağışı olduğunu bulmuş olarak önünüze gelir',
    text: 'Bağışların çoğu havaleyle gelir ve tek tek elle işlenir. E-İnfak gönderen adından ve açıklamadaki telefondan bağışçıyı, anahtar kelimeden bağış kalemini önerir; size onaylamak kalır.',
    points: ['Tek havaleyi birden çok bağış kalemine bölün; toplam tutmadan kaydetmez', 'Yanlış eşleşmeyi tek tıkla geri alın, makbuz iptal olur', 'Her onay sistemi eğitir: aynı gönderen bir sonraki sefer kendiliğinden tanınır'],
  },
  {
    eyebrow: 'Makbuz ve SMS', mock: 'sms',
    title: 'Makbuz kesildiği anda bağışçıya teşekkür SMS’i gider',
    text: 'Metinler sizin şablonlarınızdır; tutar, bağış kalemi ve makbuz numarası kendiliğinden dolar. Göndermeden önce metni görür, isterseniz değiştirir ya da ileri bir tarihe bırakırsınız.',
    points: ['Her SMS ilgili makbuza bağlıdır; listede “gitti mi, iletildi mi” görünür', 'Aynı makbuz için ikinci kez SMS gitmez', 'Bağış kalemine özel metin: kurban, su kuyusu, zekât için ayrı teşekkür'],
  },
  {
    eyebrow: 'Toplu SMS', mock: 'bulk',
    title: 'Kime gideceğini ve kaç SMS tutacağını görmeden göndermezsiniz',
    text: 'Hedef kitleyi seçin: son aylarda bağış yapanlar, bir kampanyanın bağışçıları, aidatı geciken üyeler ya da kendi numara listeniz. İzni olmayanlar ve tekrar eden numaralar kendiliğinden ayıklanır.',
    points: ['Kişiye özel hitap: “Sayın Mehmet Kaya…”', 'Gece gönderim yok; 21:00’den sonrası sabaha bırakılır', 'Bilgilendirme ve ticari ileti ayrımı, İYS kontrolüyle'],
  },
  {
    eyebrow: 'Site yapıcı', mock: 'builder',
    title: 'Bağış sitenizi kod yazmadan, kendi alan adınızda kurun',
    text: 'Hazır bloklarla ana sayfanızı düzenleyin: slider, bağış kartları, kurban hisse seçimi, haberler. Ödeme sayfası, makbuz doğrulama ve bağışçı paneli sitenizle birlikte gelir.',
    points: ['Sürükle-bırak bloklar ve hazır temalar', 'Kartla 3D Secure ödeme, bağış sepeti ve düzenli bağış', 'Birden çok dil ve para birimi'],
  },
]

const PANELS: { icon: LucideIcon; name: string; who: string; points: string[] }[] = [
  { icon: ShieldCheck, name: 'Yönetim paneli', who: 'Dernek personeli için',
    points: ['Bağış, makbuz, kasa ve banka hareketleri tek ekranda', 'Bağışçı kartı, notlar, temsilci atama ve raporlar', 'Personele göre yetki; açık ve koyu tema'] },
  { icon: HeartHandshake, name: 'Bağışçı paneli', who: 'Bağışçılarınız için',
    points: ['SMS koduyla şifresiz giriş', 'Bağış geçmişi, makbuz ve kurban kesim videosu', 'Sponsorluk taksiti ve üyelik aidatını online ödeme'] },
  { icon: GraduationCap, name: 'Veli paneli', who: 'Öğrenci velileri için',
    points: ['Hafızlık ilerlemesini sayfa sayfa takip', 'Hoca değerlendirmeleri', 'Aynı numaraya kayıtlı tüm öğrenciler tek girişte'] },
]

const MODULES: [LucideIcon, string, string][] = [
  [Blocks, 'Site yapıcı', 'Sürükle-bırak bloklar, hazır slider ve bölümlerle kendi alan adınızda bağış sitesi.'],
  [CreditCard, 'Online bağış', 'Kartla 3D Secure ödeme, bağış sepeti ve düzenli bağış talimatı.'],
  [Receipt, 'Makbuz', 'Otomatik makbuz ve SMS, elden makbuz ve koçan takibi, makbuz doğrulama sayfası.'],
  [Users, 'Bağışçı yönetimi', 'Bağışçı kartı, mükerrer kayıt birleştirme, Excel’den aktarım.'],
  [ArrowDownToLine, 'Gelen havaleler', 'Banka hareketlerini bağışçı ve kalemle eşleştirme, bölme, geri alma.'],
  [MessagesSquare, 'SMS', 'Şablonlar, hızlı ve toplu gönderim, iletim raporu ve bakiye takibi.'],
  [Beef, 'Kurban organizasyonu', 'Hisse dağıtımı, kesim takibi ve bağışçıya özel kesim videosu.'],
  [HeartHandshake, 'Sponsorluk ve burs', 'Yetim ve öğrenci sponsorluğu, taksit planı ve vade hatırlatması.'],
  [Droplets, 'Su kuyusu', 'Hisseli veya tek bağışçılı kuyular, yapım durumu ve fotoğraf galerisi.'],
  [PiggyBank, 'Kumbara ve kumanya', 'Kumbara dağıtım ve toplama, kumanya dağıtım kayıtları.'],
  [IdCard, 'Üyelik ve aidat', 'Üye kaydı, dönemlik aidat tahakkuku, hatırlatma ve online ödeme.'],
  [Home, 'Yoksul takibi', 'Başvuru, hane bilgisi ve puanlama ile ihtiyaç sahibi takibi.'],
  [Calculator, 'Finans ve muhasebe', 'Kasa ve giderler, banka hesapları, cari, çek ve bordro.'],
  [HandCoins, 'Zekât ve fitre', 'Güncel nisap ve fitre tutarlarıyla sitede hesaplama.'],
  [Globe, 'Çoklu dil ve para birimi', 'Sitenizi birden çok dilde yayınlayın, farklı para birimlerinde bağış alın.'],
]

const STEPS = [
  ['Tanışma', 'Kurumunuzun ihtiyaçlarını dinliyor, panelleri canlı gösteriyoruz.'],
  ['Kurulum', 'Sitenizi, ödeme ve SMS hesaplarınızı kuruyor; mevcut bağışçı listenizi aktarıyoruz.'],
  ['Yayın', 'Kendi alan adınızla yayına alıyoruz. Bakım ve güncellemeler bizde kalıyor.'],
]

// What each package adds, in the visitor's words. Account counts come from the product (/directory/plans).
const PLAN_COPY: Record<string, { users: number; featured?: boolean; items: string[] }> = {
  baslangic: { users: 1, items: ['Bağış sitesi ve site yapıcı', 'Online bağış ve makbuz', 'Bağışçı yönetimi', 'SMS ve aylık bağış raporu'] },
  orta: { users: 3, featured: true, items: ['Başlangıç paketindeki her şey', 'Kurban, sponsorluk, su kuyusu', 'Kumbara, kumanya, üyelik ve aidat', 'Banka hareketleri, çoklu dil ve para birimi'] },
  ileri: { users: 5, items: ['Orta paketindeki her şey', 'Muhasebe', 'Yoksul takibi ve puanlama', 'Düzenli ödeme talimatları'] },
}
const PLAN_LABELS: Record<string, string> = { baslangic: 'Başlangıç', orta: 'Orta', ileri: 'İleri' }

const container = 'mx-auto w-full max-w-7xl px-4 sm:px-6'
const sectionTitle = 'text-3xl font-black tracking-tight text-pt-text md:text-4xl'
const eyebrow = 'mb-3 text-xs font-bold uppercase tracking-[0.18em] text-pt-brand'
const lead = 'mt-3 max-w-2xl text-pt-muted'
const SHOTS: Record<string, { name: string; title: string; alt: string }> = {
  transfer: { name: 'transfers', title: 'panel · Gelen Havaleler', alt: 'Gelen havalenin bağışçıyla eşleştirilip iki bağış kalemine bölündüğü ekran' },
  sms: { name: 'sms', title: 'panel · SMS Gönderimleri', alt: 'Makbuz ve havale SMS’lerinin durumlarıyla listelendiği ekran' },
  bulk: { name: 'bulk', title: 'panel · Toplu SMS Gönder', alt: 'Toplu SMS’te hedef kitle, alıcı sayısı ve ilk iletinin önizlemesi' },
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-pt-brand" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

/** e-infak.org landing page: the platform itself plus the organisations it serves. */
export async function EInfakPortal() {
  const [organisations, plans, jar] = await Promise.all([
    getJson<DirectoryEntry[]>('/api/v1/directory', []),
    getJson<PlanInfo[]>('/api/v1/directory/plans', []),
    cookies(),
  ])
  const saved = jar.get('einfak_tema')?.value
  const theme = saved === 'dark' ? 'dark' : 'light'
  const planList = (plans.length ? plans : Object.keys(PLAN_COPY).map((key) => ({ key, label: PLAN_LABELS[key], users: PLAN_COPY[key].users })))
    .filter((plan) => PLAN_COPY[plan.key])
  const nav = [
    ['#ozellikler', 'Özellikler'],
    ['#moduller', 'Modüller'],
    ['#paketler', 'Paketler'],
    ...(organisations.length ? [['#kurumlar', 'Kurumlar']] : []),
  ]
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'E-İnfak', applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web', url: 'https://e-infak.org', inLanguage: 'tr',
    description: 'Dernek ve vakıflar için bağış sitesi, online ödeme, makbuz, bağışçı yönetimi ve banka havalesi eşleştirme.',
  }

  return (
    <div className="portal flex min-h-screen flex-col scroll-smooth bg-pt-bg font-sans text-pt-text" data-theme={theme}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <header className="sticky top-0 z-20 border-b border-pt-line bg-pt-bg/90 backdrop-blur">
        <div className={`${container} flex items-center justify-between gap-4 py-3.5`}>
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/e-infak/mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl bg-white object-contain p-1 ring-1 ring-pt-line" />
            <div>
              <span className="text-lg font-extrabold tracking-tight">e-infak.org</span>
              <p className="hidden text-[10px] uppercase tracking-widest text-pt-faint sm:block">Dernek otomasyonu</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-pt-muted md:flex" aria-label="Sayfa bölümleri">
            {nav.map(([href, label]) => <a key={href} href={href} className="hover:text-pt-text">{label}</a>)}
          </nav>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PortalThemeToggle />
            <Link href="/giris" className="hidden rounded-lg border border-pt-line px-3.5 py-2 text-pt-text hover:border-pt-brand sm:block">Kurum Girişi</Link>
            <a href="#demo" className="pt-cta rounded-lg px-3.5 py-2">
              <span className="sm:hidden">Demo</span><span className="hidden sm:inline">Demo talep edin</span>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-pt-line bg-pt-soft">
          <div className={`${container} grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-20`}>
            <div className="space-y-6 text-center lg:text-start">
              <p className="inline-block rounded-full bg-pt-brand-soft px-3.5 py-1 text-xs font-bold text-pt-brand">Dernek ve vakıflar için</p>
              <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-pt-text sm:text-5xl lg:text-[3.4rem]">
                Bağış siteniz ve dernek otomasyonunuz <span className="text-pt-brand">tek panelde</span>
              </h1>
              <p className="mx-auto max-w-xl text-lg text-pt-muted lg:mx-0">
                Online bağış, banka havalesi eşleştirme, makbuz, SMS ve bağışçı yönetimi birlikte çalışır. Kurulum ve bakım bizden.
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <a href="#demo" className="pt-cta flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 font-bold">
                  Demo talep edin <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="#ozellikler" className="rounded-xl border border-pt-line bg-pt-card px-7 py-3.5 text-center font-bold text-pt-text hover:border-pt-brand">Neler yapabildiğine bakın</a>
              </div>
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-pt-muted lg:justify-start">
                {['Kendi alan adınız', '3D Secure ödeme', 'Otomatik makbuz ve SMS'].map((item) => (
                  <li key={item} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-pt-brand" aria-hidden="true" />{item}</li>
                ))}
              </ul>
            </div>
            <Screenshot name="dashboard" title="panel · Genel Bakış" alt="E-İnfak yönetim paneli Genel Bakış ekranı: bağış toplamları, bekleyen havaleler ve aylık trend" priority />
          </div>
        </section>

        {organisations.length > 0 && (
          <section className="border-b border-pt-line">
            <div className={`${container} flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-6 text-sm`}>
              <span className="font-semibold text-pt-faint">{organisations.length} kurum bağışını E-İnfak ile topluyor</span>
              {organisations.slice(0, 6).map((org) => (
                <a key={org.slug} href={org.url} className="font-bold text-pt-muted hover:text-pt-brand">{org.name}</a>
              ))}
            </div>
          </section>
        )}

        <section id="ozellikler" className={`${container} scroll-mt-20 space-y-20 py-16 lg:py-24`}>
          <div className="mx-auto max-w-3xl text-center">
            <p className={eyebrow}>Öne çıkanlar</p>
            <h2 className={sectionTitle}>Her gün saatlerinizi alan işler, birkaç tıkla biter</h2>
          </div>
          {SPOTLIGHTS.map((item, index) => {
            const shot = SHOTS[item.mock]
            return (
              <div key={item.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={index % 2 ? 'lg:order-2' : ''}>
                  <p className={eyebrow}>{item.eyebrow}</p>
                  <h3 className="text-2xl font-black tracking-tight text-pt-text md:text-3xl">{item.title}</h3>
                  <p className="mt-4 text-pt-muted">{item.text}</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-pt-text">{item.points.map((point) => <Tick key={point}>{point}</Tick>)}</ul>
                </div>
                <div className={index % 2 ? 'lg:order-1' : ''}>{shot ? <Screenshot {...shot} /> : <MockBuilder />}</div>
              </div>
            )
          })}
        </section>

        <section id="paneller" className="scroll-mt-20 border-y border-pt-line bg-pt-soft">
          <div className={`${container} py-16`}>
            <p className={eyebrow}>Üç panel</p>
            <h2 className={sectionTitle}>Personel, bağışçı ve veli için ayrı ekranlar</h2>
            <p className={lead}>Herkes yalnızca kendi işine yarayan ekranı görür; veriler tek yerde tutulur.</p>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {PANELS.map((panel) => (
                <div key={panel.name} className="rounded-2xl border border-pt-line bg-pt-card p-7">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pt-brand-soft text-pt-brand"><panel.icon className="h-5 w-5" aria-hidden="true" /></div>
                  <h3 className="mt-4 text-xl font-bold text-pt-text">{panel.name}</h3>
                  <p className="text-sm font-semibold text-pt-brand">{panel.who}</p>
                  <ul className="mt-5 space-y-3 text-sm text-pt-muted">{panel.points.map((point) => <Tick key={point}>{point}</Tick>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="moduller" className={`${container} scroll-mt-20 py-16`}>
          <p className={eyebrow}>Modüller</p>
          <h2 className={sectionTitle}>Bağıştan sahaya, ihtiyacınız olan her şey</h2>
          <p className={lead}>Paketinize göre açılır; kullanmadığınız modül menünüzde yer kaplamaz.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(([Icon, title, text]) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-pt-line bg-pt-card p-5 transition-colors hover:border-pt-brand">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pt-brand-soft text-pt-brand"><Icon className="h-5 w-5" aria-hidden="true" /></div>
                <div>
                  <h3 className="font-bold text-pt-text">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-pt-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-pt-line bg-pt-soft">
          <div className={`${container} py-16`}>
            <p className={eyebrow}>Nasıl başlanır</p>
            <h2 className={sectionTitle}>Üç adımda yayındasınız</h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map(([title, text], index) => (
                <li key={title} className="rounded-2xl border border-pt-line bg-pt-card p-6">
                  <span className="pt-cta flex h-9 w-9 items-center justify-center rounded-full text-sm font-black">{index + 1}</span>
                  <h3 className="mt-4 text-lg font-bold text-pt-text">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-pt-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="paketler" className={`${container} scroll-mt-20 py-16`}>
          <p className={eyebrow}>Paketler</p>
          <h2 className={sectionTitle}>Kurumunuzun ölçeğine göre üç paket</h2>
          <p className={lead}>İhtiyaç büyüdükçe paket yükseltilir veya tek tek ek modül açılır. Fiyat için bize yazın.</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {planList.map((plan) => {
              const copy = PLAN_COPY[plan.key]
              return (
                <div key={plan.key} className={`flex flex-col rounded-2xl border bg-pt-card p-7 ${copy.featured ? 'border-pt-brand pt-shadow' : 'border-pt-line'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-pt-text">{plan.label}</h3>
                    {copy.featured && <span className="rounded-full bg-pt-brand-soft px-2.5 py-0.5 text-[11px] font-bold text-pt-brand">En çok tercih edilen</span>}
                  </div>
                  <p className="mt-1 text-sm text-pt-muted">{plan.users} personel hesabı</p>
                  <ul className="mt-5 flex-1 space-y-3 text-sm text-pt-text">{copy.items.map((item) => <Tick key={item}>{item}</Tick>)}</ul>
                  <PlanCta plan={plan.key} className={`mt-7 rounded-xl px-4 py-3 text-center text-sm font-bold ${copy.featured ? 'pt-cta' : 'border border-pt-line text-pt-text hover:border-pt-brand'}`}>
                    Teklif isteyin
                  </PlanCta>
                </div>
              )
            })}
          </div>
        </section>

        {organisations.length > 0 && (
          <section id="kurumlar" className="scroll-mt-20 border-y border-pt-line bg-pt-soft">
            <div className={`${container} py-16`}>
              <p className={eyebrow}>Kurumlar</p>
              <h2 className={sectionTitle}>E-İnfak ile bağış toplayan kurumlar</h2>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {organisations.map((org) => (
                  <a key={org.slug} href={org.url} className="group flex items-center gap-4 rounded-2xl border border-pt-line bg-pt-card p-5 hover:border-pt-brand">
                    {org.logo_url
                      ? <img src={org.logo_url} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-pt-line" />
                      : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white" style={{ backgroundColor: org.primary_color || '#047857' }}>{org.name.charAt(0)}</span>}
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-pt-text">{org.name}</span>
                      {org.tagline && <span className="block truncate text-sm text-pt-muted">{org.tagline}</span>}
                      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-pt-brand">{org.url.replace(/^https?:\/\//, '')} <ArrowRight className="h-3 w-3" aria-hidden="true" /></span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="demo" className={`${container} scroll-mt-20 py-16 lg:py-24`}>
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className={eyebrow}>Demo</p>
              <h2 className={sectionTitle}>Panelleri kendi verinizle görün</h2>
              <p className="mt-4 text-pt-muted">Kısa bir görüşmede ekranları birlikte gezelim, kurumunuza uygun paketi belirleyelim. Mevcut bağışçı listenizi ve geçmiş bağışlarınızı taşımayı biz üstleniyoruz.</p>
              <ul className="mt-6 space-y-3 text-sm text-pt-text">
                <Tick>Yarım saatlik canlı gösterim, taahhüt yok</Tick>
                <Tick>Başka bir sistemden geçişte veri aktarımı dahil</Tick>
                <Tick>Kurulum, alan adı ve SSL bizden</Tick>
              </ul>
              <p className="mt-6 text-sm text-pt-muted">Yazmayı tercih ederseniz: <a href="mailto:info@e-infak.org" className="font-semibold text-pt-brand hover:underline">info@e-infak.org</a></p>
            </div>
            <DemoForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-pt-line bg-pt-soft">
        <div className={`${container} flex flex-wrap items-center justify-between gap-3 py-7 text-xs text-pt-faint`}>
          <p>E-İnfak Dernek Bağış Platformu © {new Date().getFullYear()}</p>
          <div className="flex gap-5">
            <Link href="/giris" className="hover:text-pt-text">Kurum Girişi</Link>
            <Link href="/platform" className="hover:text-pt-text">Platform</Link>
            <a href="mailto:info@e-infak.org" className="hover:text-pt-text">İletişim</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
