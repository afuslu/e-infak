'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { Campaign } from '@e-infak/api-client'
import { useOrgSettings } from '@e-infak/api-client'
import { QuickDonationForm } from './QuickDonationForm'

interface ContentPostDto {
  id: string
  title: string
  image_url?: string
  published_at: string
}

interface HicretHomeProps {
  campaigns: Campaign[]
  newsPosts?: ContentPostDto[]
}

const programs: Array<{ title: string; age: string; desc: string; img: string }> = []

const stats: Array<{ value: string; label: string }> = []

export function HicretHome({ campaigns, newsPosts }: HicretHomeProps) {
  const { data: settings } = useOrgSettings()
  const phone = settings?.contact_phone || ''
  const email = settings?.contact_email || ''
  const address = settings?.contact_address || ''

  const trust = [
    settings?.contact_address ? { glyph: '🕌', title: 'Medrese Adresimiz', desc: settings.contact_address } : null,
    phone || email ? { glyph: '☎', title: 'İletişim & Başvuru', desc: [phone, email].filter(Boolean).join(' · ') } : null,
    { glyph: '🔒', title: 'Güvenli Bağış Altyapısı', desc: 'Kart bilgileri E‑İnfak sistemine girilmez; ödeme banka sayfasında tamamlanır.' },
  ].filter((item): item is { glyph: string; title: string; desc: string } => Boolean(item))

  const displayNews = newsPosts && newsPosts.length > 0
    ? newsPosts.map((n) => ({
        title: n.title,
        img: n.image_url || '/images/hicret/h-news1.png',
        date: new Date(n.published_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(),
      }))
    : []

  return (
    <div className="font-sans antialiased text-[#1C2420] bg-[#F7F8F5]">
      {/* Üst bilgi bandı */}
      <div className="bg-[#123D1D] text-[#CFE3D2] text-[13px] py-2">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex gap-5 flex-wrap">
            {phone && <span>{phone}</span>}
            {email && <span>{email}</span>}
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/portal" className="text-[#CFE3D2] font-semibold hover:text-white">Bağışçı Girişi</Link>
            <span className="opacity-40">|</span>
            <Link href="/verify" className="text-[#CFE3D2] hover:text-white">Online Makbuz</Link>
          </div>
        </div>
      </div>

      {/* Ana menü */}
      <header className="bg-white border-b border-[#E4E9E2] sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 h-[76px] flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-14 w-14 rounded-full overflow-hidden bg-white">
              <Image src="/images/hicret/logo.jpeg" alt="Hicret Derneği" fill className="object-cover" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-heading font-bold text-[20px] text-[#1C2420] tracking-wide">HİCRET DERNEĞİ</span>
              <span className="text-[11px] tracking-[2.5px] text-[#1E7A34] font-semibold">ESKİŞEHİR</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-[15px] font-semibold">
            <Link href="/" className="text-[#1E7A34]">Ana Sayfa</Link>
            {programs.length > 0 && <a href="#egitim" className="text-[#3A4540] hover:text-[#1E7A34]">Eğitim</a>}
            <a href="#projeler" className="text-[#3A4540] hover:text-[#1E7A34]">Projelerimiz</a>
            {displayNews.length > 0 && <a href="#haberler" className="text-[#3A4540] hover:text-[#1E7A34]">Faaliyetler</a>}
            <Link href="/hakkimizda" className="text-[#3A4540] hover:text-[#1E7A34]">Hakkımızda</Link>
            <Link href="/iletisim" className="text-[#3A4540] hover:text-[#1E7A34]">İletişim</Link>
            <a href="#hizli-bagis" className="bg-[#1E7A34] hover:bg-[#166028] text-white font-bold px-6 py-3 rounded-lg">Bağış Yap</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-[#123D1D]">
        <div className="absolute inset-0 opacity-55">
          <Image src="/images/hicret/hicret-hero.png" alt="" fill className="object-cover" priority />
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(10,34,16,0.92) 0%, rgba(10,34,16,0.55) 55%, rgba(10,34,16,0.15) 100%)' }}
        />
        <div className="relative max-w-[1200px] mx-auto px-6 py-24 grid md:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div>
            <span className="inline-block bg-[#6CB33F]/20 border border-[#6CB33F]/50 text-[#A8D48A] text-[13px] font-bold tracking-[2px] px-4 py-2 rounded-full mb-6">
              İLİMLE YETİŞEN NESİLLER
            </span>
            <h1 className="font-heading text-[36px] md:text-[52px] leading-[1.15] text-white font-bold mb-5">
              Hafızlıktan Arapça&apos;ya, gönül eğitiminin adresi.
            </h1>
            <p className="text-lg leading-relaxed text-[#D5E2D6] mb-8 max-w-xl">
              Kurum tarafından yayınlanan doğrulanmış yardım kampanyalarını inceleyin; seçtiğiniz projeye banka sayfasında güvenle destek olun.
            </p>
            <div className="flex flex-wrap gap-3.5">
              {programs.length > 0 && <a href="#egitim" className="bg-[#6CB33F] hover:bg-[#7DC44F] text-[#0E2A14] font-extrabold text-base px-8 py-4 rounded-[10px]">
                Eğitim Programları
              </a>}
              <a href="#hizli-bagis" className="border-[1.5px] border-white/45 hover:border-white text-white font-semibold text-base px-8 py-4 rounded-[10px]">
                Bağış Yap
              </a>
            </div>
          </div>

          <div id="hizli-bagis">
            {campaigns[0] ? <QuickDonationForm
              campaignId={campaigns[0].id}
              campaignTitle={campaigns[0].title}
              primaryColor="#1E7A34"
              accentColor="#6CB33F"
              themeSlug="hicret-dernegi"
            /> : (
              <div className="rounded-3xl border border-white/30 bg-white p-7 text-center text-[#3A4540]">
                Aktif bağış kampanyaları kurum tarafından yayınlandığında güvenli bağış formu burada açılacaktır.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sayaçlar */}
      {stats.length > 0 && <section className="bg-white border-b border-[#E4E9E2]">
        <div className="max-w-[1200px] mx-auto px-6 py-9 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((st) => (
            <div key={st.label}>
              <div className="font-heading text-[36px] font-bold text-[#1E7A34]">{st.value}</div>
              <div className="text-sm text-[#6B7A70] font-medium mt-1">{st.label}</div>
            </div>
          ))}
        </div>
      </section>}

      {/* Eğitim kurumları */}
      {programs.length > 0 && <section id="egitim" className="max-w-[1200px] mx-auto px-6 pt-[72px]">
        <div className="text-center max-w-xl mx-auto mb-10">
          <div className="text-[13px] font-bold tracking-[2px] text-[#1E7A34] mb-2">EĞİTİM KURUMLARIMIZ</div>
          <h2 className="font-heading text-[36px] font-bold text-[#1C2420] mb-3">Sıbyandan hafızlığa kesintisiz eğitim</h2>
          <p className="text-base leading-relaxed text-[#6B7A70]">Her yaş grubuna uygun müfredat, ehil hocalar ve aile ile iç içe bir eğitim ortamı.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {programs.map((pr) => (
            <div key={pr.title} className="bg-white border border-[#E4E9E2] rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(18,61,29,0.12)] transition-shadow">
              <div className="relative h-[150px]">
                <Image src={pr.img} alt={pr.title} fill className="object-cover" />
              </div>
              <div className="p-5 flex flex-col gap-2 flex-1">
                <div className="text-[11px] font-bold tracking-[1.5px] text-[#1E7A34]">{pr.age}</div>
                <div className="font-heading text-[19px] font-bold text-[#1C2420]">{pr.title}</div>
                <p className="text-[13.5px] leading-relaxed text-[#6B7A70] flex-1">{pr.desc}</p>
                <a href="#hizli-bagis" className="font-bold text-sm text-[#1E7A34]">Detay ve kayıt →</a>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-7 bg-[#F0F6EE] border border-[#CBDFC9] rounded-2xl px-7 py-6 flex justify-between items-center gap-6 flex-wrap">
          <div>
            <div className="font-heading text-xl font-bold text-[#1C2420] mb-1">2026-2027 dönemi ön kayıtları başladı</div>
            <div className="text-sm text-[#6B7A70]">Kontenjanlar sınırlıdır; ön kayıt formu ile yerinizi ayırtın.</div>
          </div>
          <Link href="/on-kayit" className="bg-[#1E7A34] hover:bg-[#166028] text-white font-extrabold text-[15px] px-7 py-3.5 rounded-[10px] whitespace-nowrap">
            Ön Kayıt Formu
          </Link>
        </div>
      </section>}

      {/* Kampanyalar */}
      <section id="projeler" className="max-w-[1200px] mx-auto px-6 py-[72px]">
        <div className="flex justify-between items-end mb-9 gap-6 flex-wrap">
          <div>
            <div className="text-[13px] font-bold tracking-[2px] text-[#1E7A34] mb-2">AKTİF KAMPANYALAR</div>
            <h2 className="font-heading text-[36px] font-bold text-[#1C2420]">Nereye dokunuyoruz?</h2>
          </div>
          <Link href="/kampanyalar" className="font-bold text-[15px] text-[#1E7A34] whitespace-nowrap">Tüm projeler →</Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="bg-white border border-[#E4E9E2] rounded-2xl p-10 text-center text-[#6B7A70]">
            Aktif yardım kampanyası bulunmamaktadır.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((c) => {
              const progress = c.progress_percentage || 0
              return (
                <div key={c.id} className="bg-white border border-[#E4E9E2] rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(18,61,29,0.12)] transition-shadow">
                  <div className="relative h-[190px] bg-[#F0F6EE]">
                    {c.cover_image_url ? (
                      <Image src={c.cover_image_url} alt={c.title} fill className="object-cover" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[#1E7A34]/30 text-2xl">🕌</div>
                    )}
                    {c.is_featured && (
                      <span className="absolute top-3 left-3 bg-[#123D1D] text-white text-xs font-bold px-3 py-1.5 rounded-md">
                        Acil Proje
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex flex-col gap-3 flex-1">
                    <div className="font-heading text-xl font-bold text-[#1C2420] line-clamp-2">{c.title}</div>
                    <p className="text-sm leading-relaxed text-[#6B7A70] flex-1 line-clamp-3">{c.summary}</p>
                    {c.show_collected && (
                      <div>
                        <div className="flex justify-between text-[13px] font-semibold mb-1.5">
                          <span className="text-[#1E7A34]">{c.collected_lira.toLocaleString('tr-TR')} ₺</span>
                          <span className="text-[#8A968E]">Hedef: {c.target_lira.toLocaleString('tr-TR')} ₺</span>
                        </div>
                        <div className="h-2 bg-[#E9EFE8] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(progress, 100)}%`, background: 'linear-gradient(90deg,#1E7A34,#6CB33F)' }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/kampanyalar/${c.slug}`}
                        className="flex-1 text-center bg-[#F0F6EE] hover:bg-[#1E7A34] hover:text-white text-[#1E7A34] border-[1.5px] border-[#CBDFC9] hover:border-[#1E7A34] font-bold text-sm py-3 rounded-lg transition-colors"
                      >
                        Bağış yap
                      </Link>
                      <Link
                        href={`/kampanyalar/${c.slug}`}
                        className="bg-white text-[#3A4540] hover:text-[#1E7A34] hover:border-[#1E7A34] border-[1.5px] border-[#DCE4DD] font-bold text-sm px-4 py-3 rounded-lg transition-colors"
                      >
                        Detay
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Zekât hesaplama şeridi */}
      <section className="bg-[#123D1D]">
        <div className="max-w-[1200px] mx-auto px-6 py-14 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <h3 className="font-heading text-[28px] font-bold text-white mb-2">Zekâtınızı kolayca hesaplayın</h3>
            <p className="text-[15px] text-[#B9CDBB] leading-relaxed max-w-xl">
              Altın, döviz ve nakit varlıklarınız üzerinden güncel nisab değerleriyle zekât tutarınızı hesaplayın, dilerseniz aynı adımda bağışınızı tamamlayın.
            </p>
          </div>
          <Link href="/zekat-hesapla" className="bg-[#6CB33F] hover:bg-[#7DC44F] text-[#0E2A14] font-extrabold text-base px-8 py-4 rounded-[10px] whitespace-nowrap">
            Zekât Hesapla
          </Link>
        </div>
      </section>

      {/* Haberler */}
      {displayNews.length > 0 && <section id="haberler" className="max-w-[1200px] mx-auto px-6 py-[72px]">
        <div className="flex justify-between items-end mb-9 gap-6 flex-wrap">
          <div>
            <div className="text-[13px] font-bold tracking-[2px] text-[#1E7A34] mb-2">FAALİYETLER</div>
            <h2 className="font-heading text-[36px] font-bold text-[#1C2420]">Sahadan haberler</h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayNews.map((n) => (
            <div key={n.title} className="bg-white border border-[#E4E9E2] rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(18,61,29,0.12)] transition-shadow">
              <div className="relative h-40">
                <Image src={n.img} alt={n.title} fill className="object-cover" />
              </div>
              <div className="p-5">
                <div className="text-xs font-bold text-[#1E7A34] tracking-wider mb-2">{n.date}</div>
                <div className="font-heading text-lg font-semibold leading-snug">{n.title}</div>
              </div>
            </div>
          ))}
        </div>
      </section>}

      {/* Şeffaflık bandı */}
      <section id="iletisim" className="bg-white border-t border-[#E4E9E2]">
        <div className="max-w-[1200px] mx-auto px-6 py-14 grid md:grid-cols-3 gap-8">
          {trust.map((t) => (
            <div key={t.title} className="flex gap-4 items-start">
              <div className="w-11 h-11 rounded-[10px] bg-[#F0F6EE] text-[#1E7A34] flex items-center justify-center text-xl flex-shrink-0">
                {t.glyph}
              </div>
              <div>
                <div className="font-bold text-base mb-1">{t.title}</div>
                <div className="text-sm text-[#6B7A70] leading-relaxed">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0E2A14] text-[#9DB5A0] mt-auto">
        <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-8 grid md:grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-10">
          <div id="footer-hakkimizda">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative h-11 w-11 rounded-full overflow-hidden">
                <Image src="/images/hicret/logo.jpeg" alt="" fill className="object-cover" />
              </div>
              <span className="font-heading font-bold text-lg text-white">HİCRET DERNEĞİ</span>
            </div>
            <p className="text-sm leading-relaxed">Eskişehir merkezli, yurt içi ve yurt dışında insani yardım çalışmaları yürüten dernek.</p>
          </div>
          <div>
            <div className="text-white font-bold text-sm tracking-wider mb-3.5">KURUMSAL</div>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/hakkimizda" className="hover:text-white">Hakkımızda</Link>
              <Link href="/kvkk" className="hover:text-white">KVKK Aydınlatma</Link>
              <Link href="/gizlilik" className="hover:text-white">Gizlilik</Link>
              <Link href="/bagis-kosullari" className="hover:text-white">Bağış ve İade Koşulları</Link>
              <Link href="/iletisim" className="hover:text-white">İletişim</Link>
            </div>
          </div>
          <div>
            <div className="text-white font-bold text-sm tracking-wider mb-3.5">BAĞIŞ</div>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/kampanyalar" className="hover:text-white">Eğitim Bursu</Link>
              <Link href="/kampanyalar" className="hover:text-white">Kurban / Vekalet</Link>
              <Link href="/kampanyalar" className="hover:text-white">Su Kuyusu</Link>
              <Link href="/kampanyalar" className="hover:text-white">Yetim Sponsorluğu</Link>
            </div>
          </div>
          <div>
            <div className="text-white font-bold text-sm tracking-wider mb-3.5">İLETİŞİM</div>
            <div className="flex flex-col gap-2.5 text-sm">
              {address && <span>{address}</span>}
              {phone && <span>{phone}</span>}
              {email && <span>{email}</span>}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-[1200px] mx-auto px-6 py-5 flex justify-between text-[13px] flex-wrap gap-2">
            <span>© {new Date().getFullYear()} Hicret Derneği. Tüm hakları saklıdır.</span>
            <span>E-İnfak altyapısı ile güçlendirilmiştir</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
