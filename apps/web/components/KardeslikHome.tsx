'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Campaign } from '@e-infak/api-client'
import { useOrgSettings } from '@e-infak/api-client'
import { QuickDonationForm } from './QuickDonationForm'

interface DonationCategoryDto {
  id: string
  icon: string
  title: string
  description: string
}

interface ContentPostDto {
  id: string
  title: string
  image_url?: string
  published_at: string
}

interface KardeslikHomeProps {
  campaigns: Campaign[]
  categories?: DonationCategoryDto[]
  newsPosts?: ContentPostDto[]
}

const stats: Array<{ value: string; label: string }> = []

export function KardeslikHome({ campaigns, categories, newsPosts }: KardeslikHomeProps) {
  const { data: settings } = useOrgSettings()
  const phone = settings?.contact_phone || ''
  const email = settings?.contact_email || ''
  const address = settings?.contact_address || ''

  const trust = [
    settings?.contact_address ? { glyph: '📍', title: 'Resmi Adres', desc: settings.contact_address } : null,
    phone || email ? { glyph: '☎', title: 'İletişim & Danışma', desc: [phone, email].filter(Boolean).join(' · ') } : null,
  ].filter((item): item is { glyph: string; title: string; desc: string } => Boolean(item))

  const [zekatMiktar, setZekatMiktar] = useState<number | string>('')
  const [zekatSonuc, setZekatSonuc] = useState<number | null>(null)

  const displayCategories = categories && categories.length > 0
    ? categories.map((c) => ({ title: c.title, desc: c.description, icon: c.icon }))
    : []

  const displayNews = newsPosts && newsPosts.length > 0
    ? newsPosts.map((n) => ({
        title: n.title,
        img: n.image_url || '/images/kardeslik/kp-news1.png',
        date: new Date(n.published_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(),
      }))
    : []

  const handleHesaplaZekat = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number(zekatMiktar)
    if (parsed && parsed >= 85) {
      setZekatSonuc(parsed * 0.025)
    } else {
      setZekatSonuc(0)
    }
  }

  return (
    <div className="font-sans antialiased text-[#241C1B] bg-[#FAF7F5]">
      {/* Üst bilgi bandı */}
      <div className="bg-[#4A0D0F] text-[#F0D5D2] text-[13px] py-2">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex gap-5 flex-wrap">
            {phone && <span>{phone}</span>}
            {email && <span>{email}</span>}
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/portal" className="text-[#F0D5D2] font-semibold hover:text-white">Bağışçı Girişi</Link>
            <span className="opacity-40">|</span>
            <Link href="/verify" className="text-[#F0D5D2] hover:text-white">Online Makbuz</Link>
          </div>
        </div>
      </div>

      {/* Ana menü */}
      <header className="bg-white border-b border-[#EDE3E0] sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 h-[76px] flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-14 w-14 rounded-full overflow-hidden bg-white">
              <Image src="/images/kardeslik/logo.jpeg" alt="Kardeşlik Payı" fill className="object-cover" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-heading font-bold text-[20px] text-[#241C1B] tracking-wide">KARDEŞLİK PAYI</span>
              <span className="text-[11px] tracking-[2.5px] text-[#C2181B] font-semibold">BİRLİKTE DAHA GÜÇLÜYÜZ</span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-6 text-[15px] font-semibold">
            <Link href="/" className="text-[#C2181B]">Ana Sayfa</Link>
            {displayCategories.length > 0 && <a href="#kategoriler" className="text-[#453735] hover:text-[#C2181B]">Bağış Kategorileri</a>}
            <a href="#kampanyalar" className="text-[#453735] hover:text-[#C2181B]">Kampanyalar</a>
            {displayNews.length > 0 && <a href="#haberler" className="text-[#453735] hover:text-[#C2181B]">Faaliyetler</a>}
            <Link href="/hakkimizda" className="text-[#453735] hover:text-[#C2181B]">Hakkımızda</Link>
            <Link href="/zekat-hesapla" className="text-[#453735] hover:text-[#C2181B]">Zekât Hesapla</Link>
            <Link href="/iletisim" className="text-[#453735] hover:text-[#C2181B]">İletişim</Link>
            <a href="#hizli-bagis" className="bg-[#C2181B] hover:bg-[#961114] text-white font-bold px-6 py-3 rounded-lg">Bağış Yap</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-[#4A0D0F]">
        <div className="absolute inset-0 opacity-50">
          <Image src="/images/kardeslik/kp-hero.png" alt="" fill className="object-cover" priority />
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(48,8,9,0.93) 0%, rgba(48,8,9,0.55) 55%, rgba(48,8,9,0.15) 100%)' }}
        />
        <div className="relative max-w-[1200px] mx-auto px-6 py-24 grid md:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div>
            <span className="inline-block bg-[#E2423C]/20 border border-[#E2423C]/55 text-[#F2A7A0] text-[13px] font-bold tracking-[2px] px-4 py-2 rounded-full mb-6">
              KOMŞUDAN BAŞLAYAN İYİLİK
            </span>
            <h1 className="font-heading text-[36px] md:text-[52px] leading-[1.15] text-white font-bold mb-5">
              Bu topraklarda kimse yalnız kalmasın.
            </h1>
            <p className="text-lg leading-relaxed text-[#EDD8D4] mb-8 max-w-xl">
              Kurum tarafından yayınlanan doğrulanmış yardım kampanyalarını inceleyin; seçtiğiniz projeye güvenli biçimde destek olun.
            </p>
            <div className="flex flex-wrap gap-3.5">
              <a href="#hizli-bagis" className="bg-[#E2423C] hover:bg-[#EE5A52] text-white font-extrabold text-base px-8 py-4 rounded-[10px]">
                Kardeşlik Payı Ver
              </a>
              {displayCategories.length > 0 && <a href="#kategoriler" className="border-[1.5px] border-white/45 hover:border-white text-white font-semibold text-base px-8 py-4 rounded-[10px]">
                Bağış Kategorileri
              </a>}
            </div>
          </div>

          <div id="hizli-bagis">
            {campaigns[0] ? <QuickDonationForm
              campaignId={campaigns[0].id}
              campaignTitle={campaigns[0].title}
              primaryColor="#C2181B"
              accentColor="#E2423C"
              themeSlug="kardeslik-payi"
            /> : (
              <div className="rounded-3xl border border-white/30 bg-white p-7 text-center text-[#453735]">
                Aktif bağış kampanyaları kurum tarafından yayınlandığında güvenli bağış formu burada açılacaktır.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sayaçlar */}
      {stats.length > 0 && <section className="bg-white border-b border-[#EDE3E0]">
        <div className="max-w-[1200px] mx-auto px-6 py-9 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((st) => (
            <div key={st.label}>
              <div className="font-heading text-[36px] font-bold text-[#C2181B]">{st.value}</div>
              <div className="text-sm text-[#82706D] font-medium mt-1">{st.label}</div>
            </div>
          ))}
        </div>
      </section>}

      {/* Bağış kategorileri */}
      {displayCategories.length > 0 && <section id="kategoriler" className="max-w-[1200px] mx-auto px-6 pt-[72px]">
        <div className="text-center max-w-xl mx-auto mb-10">
          <div className="text-[13px] font-bold tracking-[2px] text-[#C2181B] mb-2">BAĞIŞ KATEGORİLERİ</div>
          <h2 className="font-heading text-[36px] font-bold text-[#241C1B] mb-3">Payınızı nereye ayırmak istersiniz?</h2>
          <p className="text-base leading-relaxed text-[#82706D]">Tek seferlik ya da düzenli; dilediğiniz kaleme, dilediğiniz tutarla.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayCategories.map((k) => (
            <a
              key={k.title}
              href="#hizli-bagis"
              className="bg-white border-[1.5px] border-[#EDE3E0] hover:border-[#C2181B] hover:shadow-[0_10px_26px_rgba(194,24,27,0.12)] rounded-2xl p-5 flex flex-col gap-2 transition-all"
            >
              <div className="w-11 h-11 rounded-[10px] bg-[#FBEDEB] flex items-center justify-center text-2xl">{k.icon}</div>
              <div className="font-bold text-base text-[#241C1B]">{k.title}</div>
              <div className="text-[13px] leading-relaxed text-[#82706D]">{k.desc}</div>
              <div className="font-bold text-[13px] text-[#C2181B] mt-auto">Bağış yap →</div>
            </a>
          ))}
        </div>
      </section>}

      {/* Kampanyalar */}
      <section id="kampanyalar" className="max-w-[1200px] mx-auto px-6 py-[72px]">
        <div className="flex justify-between items-end mb-9 gap-6 flex-wrap">
          <div>
            <div className="text-[13px] font-bold tracking-[2px] text-[#C2181B] mb-2">AKTİF KAMPANYALAR</div>
            <h2 className="font-heading text-[36px] font-bold text-[#241C1B]">Yayınlanan yardım kampanyaları</h2>
          </div>
          <Link href="/kampanyalar" className="font-bold text-[15px] text-[#C2181B] whitespace-nowrap">Tüm kampanyalar →</Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="bg-white border border-[#EDE3E0] rounded-2xl p-10 text-center text-[#82706D]">
            Aktif yardım kampanyası bulunmamaktadır.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((c) => {
              const progress = c.progress_percentage || 0
              return (
                <div key={c.id} className="bg-white border border-[#EDE3E0] rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(74,13,15,0.12)] transition-shadow">
                  <div className="relative h-[190px] bg-[#FBEDEB]">
                    {c.cover_image_url ? (
                      <Image src={c.cover_image_url} alt={c.title} fill className="object-cover" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[#C2181B]/30 text-2xl">🤝</div>
                    )}
                    {c.is_featured && (
                      <span className="absolute top-3 left-3 bg-[#4A0D0F] text-white text-xs font-bold px-3 py-1.5 rounded-md">
                        Acil Proje
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex flex-col gap-3 flex-1">
                    <div className="font-heading text-xl font-bold text-[#241C1B] line-clamp-2">{c.title}</div>
                    <p className="text-sm leading-relaxed text-[#82706D] flex-1 line-clamp-3">{c.summary}</p>
                    {c.show_collected && (
                      <div>
                        <div className="flex justify-between text-[13px] font-semibold mb-1.5">
                          <span className="text-[#C2181B]">{c.collected_lira.toLocaleString('tr-TR')} ₺</span>
                          <span className="text-[#9A8885]">Hedef: {c.target_lira.toLocaleString('tr-TR')} ₺</span>
                        </div>
                        <div className="h-2 bg-[#F5E9E6] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(progress, 100)}%`, background: 'linear-gradient(90deg,#C2181B,#E2423C)' }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/kampanyalar/${c.slug}`}
                        className="flex-1 text-center bg-[#FBEDEB] hover:bg-[#C2181B] hover:text-white text-[#C2181B] border-[1.5px] border-[#EFCDC9] hover:border-[#C2181B] font-bold text-sm py-3 rounded-lg transition-colors"
                      >
                        Bağış yap
                      </Link>
                      <Link
                        href={`/kampanyalar/${c.slug}`}
                        className="bg-white text-[#453735] hover:text-[#C2181B] hover:border-[#C2181B] border-[1.5px] border-[#E7DBD8] font-bold text-sm px-4 py-3 rounded-lg transition-colors"
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

      {/* Askıda Kardeşlik Payı */}
      <section className="bg-[#4A0D0F]">
        <div className="max-w-[1200px] mx-auto px-6 py-14 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <h3 className="font-heading text-[28px] font-bold text-white mb-2">Askıda Kardeşlik Payı</h3>
            <p className="text-[15px] text-[#E0C3BE] leading-relaxed max-w-xl">
              Banka tokenlı tahsilat yetkisi açılana kadar aylık güvenli ödeme bağlantısı ile desteğinizi sürdürebilirsiniz.
            </p>
          </div>
          <a href="#hizli-bagis" className="bg-[#E2423C] hover:bg-[#EE5A52] text-white font-extrabold text-base px-8 py-4 rounded-[10px] whitespace-nowrap">
            Aylık Ödeme Bağlantısı
          </a>
        </div>
      </section>

      {/* Haberler */}
      {displayNews.length > 0 && <section id="haberler" className="max-w-[1200px] mx-auto px-6 py-[72px]">
        <div className="flex justify-between items-end mb-9 gap-6 flex-wrap">
          <div>
            <div className="text-[13px] font-bold tracking-[2px] text-[#C2181B] mb-2">FAALİYETLER</div>
            <h2 className="font-heading text-[36px] font-bold text-[#241C1B]">Sahadan haberler</h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayNews.map((n) => (
            <div key={n.title} className="bg-white border border-[#EDE3E0] rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(74,13,15,0.12)] transition-shadow">
              <div className="relative h-40">
                <Image src={n.img} alt={n.title} fill className="object-cover" />
              </div>
              <div className="p-5">
                <div className="text-xs font-bold text-[#C2181B] tracking-wider mb-2">{n.date}</div>
                <div className="font-heading text-lg font-semibold leading-snug">{n.title}</div>
              </div>
            </div>
          ))}
        </div>
      </section>}

      {/* Zekât Hesaplama */}
      <section id="zekat" className="bg-[#4A0D0F]">
        <div className="max-w-[1200px] mx-auto px-6 py-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-[13px] font-bold tracking-[2px] text-[#F2A7A0] mb-2">FARZ İBADETİMİZ</div>
              <h3 className="font-heading text-[28px] font-bold text-white mb-3">Kolay Zekât Hesaplama Modülü</h3>
              <p className="text-[15px] text-[#E0C3BE] leading-relaxed">
                Nisap miktarı olan 85 gram altın veya karşılığı nakit birikiminize göre zekât yükümlülüğünüzü ve ödemeniz gereken zekât miktarını hızlıca hesaplayabilirsiniz.
              </p>
            </div>

            <div className="bg-white/5 border border-white/15 rounded-2xl p-6 space-y-4">
              <form onSubmit={handleHesaplaZekat} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#E0C3BE] uppercase tracking-wider mb-2">Toplam Nakit/Altın Birikiminiz (TL)</label>
                  <input
                    type="number"
                    placeholder="Örn: 200000"
                    value={zekatMiktar}
                    onChange={(e) => setZekatMiktar(e.target.value)}
                    className="w-full rounded-xl bg-[#300809] border border-white/15 p-3 text-white text-sm outline-none focus:border-[#E2423C]"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#E2423C] hover:bg-[#EE5A52] text-white font-bold py-3 rounded-xl transition-colors text-xs uppercase tracking-wider"
                >
                  Hesapla
                </button>
              </form>

              {zekatSonuc !== null && (
                <div className="pt-4 border-t border-white/15 text-center">
                  {zekatSonuc > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[#E0C3BE]">Hesaplanan Zekât Miktarınız:</p>
                      <h4 className="font-heading text-3xl font-black text-[#F2A7A0]">{zekatSonuc.toLocaleString('tr-TR')} ₺</h4>
                      <a
                        href="#hizli-bagis"
                        className="inline-block bg-white text-[#241C1B] hover:bg-[#EDE3E0] font-bold text-xs py-2 px-5 rounded-lg transition-all uppercase tracking-wider"
                      >
                        Zekâtımı Bağışla
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-[#F2A7A0] font-semibold leading-relaxed">
                      Nakit birikiminiz nisap miktarının altında veya geçersiz tutar girdiniz. Zekât farz olmayabilir, ancak dilerseniz sadaka bağışında bulunabilirsiniz.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Şeffaflık bandı */}
      {trust.length > 0 && <section id="iletisim" className="bg-white border-t border-[#EDE3E0]">
        <div className="max-w-[1200px] mx-auto px-6 py-14 grid md:grid-cols-3 gap-8">
          {trust.map((t) => (
            <div key={t.title} className="flex gap-4 items-start">
              <div className="w-11 h-11 rounded-[10px] bg-[#FBEDEB] text-[#C2181B] flex items-center justify-center text-xl flex-shrink-0">
                {t.glyph}
              </div>
              <div>
                <div className="font-bold text-base mb-1">{t.title}</div>
                <div className="text-sm text-[#82706D] leading-relaxed">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>}

      {/* Footer */}
      <footer className="bg-[#300809] text-[#C4A6A2] mt-auto">
        <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-8 grid md:grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-10">
          <div id="footer-hakkimizda">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative h-11 w-11 rounded-full overflow-hidden">
                <Image src="/images/kardeslik/logo.jpeg" alt="" fill className="object-cover" />
              </div>
              <span className="font-heading font-bold text-lg text-white">KARDEŞLİK PAYI</span>
            </div>
            <p className="text-sm leading-relaxed">Doğrulanmış kampanyaları ve kurum bilgilerini tenant bazında yayınlayan bağış platformu.</p>
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
              <Link href="/kampanyalar" className="hover:text-white">Kampanyalar</Link>
              <Link href="/zekat-hesapla" className="hover:text-white">Zekât &amp; Fitre</Link>
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
            <span>© {new Date().getFullYear()} Kardeşlik Payı Yardımlaşma Derneği. Tüm hakları saklıdır.</span>
            <span>E-İnfak altyapısı ile güçlendirilmiştir</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
