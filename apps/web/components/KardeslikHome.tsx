'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Campaign } from '@e-infak/api-client'
import { QuickDonationForm } from './QuickDonationForm'

interface KardeslikHomeProps {
  campaigns: Campaign[]
}

export function KardeslikHome({ campaigns }: KardeslikHomeProps) {
  const [zekatMiktar, setZekatMiktar] = useState<number | string>('')
  const [zekatSonuc, setZekatSonuc] = useState<number | null>(null)

  const handleHesaplaZekat = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number(zekatMiktar)
    if (parsed && parsed >= 85) { // Minimum nisap amount check mock
      setZekatSonuc(parsed * 0.025) // 1/40 ratio
    } else {
      setZekatSonuc(0)
    }
  }

  return (
    <div className="font-sans antialiased text-slate-800 bg-slate-50">
      {/* Top bar info */}
      <div className="bg-slate-900 text-slate-300 py-2 px-4 text-xs font-semibold">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>🤝 Kardeşlik Payı Yardımlaşma Derneği | "Birlikte Daha Güçlüyüz"</span>
          <div className="flex gap-4">
            <Link href="/giris" className="hover:text-red-400 transition-colors">👤 Bağışçı Girişi</Link>
            <span>|</span>
            <Link href="/admin" className="hover:text-red-400 transition-colors">⚙️ Otomasyon</Link>
          </div>
        </div>
      </div>

      {/* Main Header / Navbar */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4 py-3.5 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-full border border-slate-100 overflow-hidden bg-white">
              <Image 
                src="/images/kardeslik/logo.png" 
                alt="Kardeşlik Payı Logo" 
                fill 
                className="object-contain p-1"
              />
            </div>
            <div>
              <h1 className="font-outfit text-lg md:text-xl font-black text-red-600 leading-none tracking-tight">
                KARDEŞLİK PAYI
              </h1>
              <p className="text-[9px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">
                Birlikte Daha Güçlüyüz
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-slate-700">
            <Link href="/" className="hover:text-red-600 transition-colors">Ana Sayfa</Link>
            <Link href="#istatistikler" className="hover:text-red-600 transition-colors">Etki Analizimiz</Link>
            <Link href="#kampanyalar" className="hover:text-red-600 transition-colors">Kampanyalar</Link>
            <Link href="#zekat" className="hover:text-red-600 transition-colors">Zekat Hesapla</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link 
              href="#zekat" 
              className="hidden sm:inline-block border border-red-600 text-red-600 hover:bg-red-50 font-bold text-xs py-2.5 px-5 rounded-xl shadow-sm transition-all uppercase tracking-wider"
            >
              Zekat Hesapla
            </Link>
            <Link 
              href="#hizli-bagis" 
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-md transition-all uppercase tracking-wider"
            >
              Bağış Yap
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Embedded Form Widget (High-Converting Layout) */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-red-950 text-white py-16 lg:py-24">
        {/* Background Grid */}
        <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] [background-size:30px_30px]" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            
            {/* Text details (Left Side) */}
            <div className="lg:col-span-7 space-y-6">
              <span className="inline-block bg-red-600/20 border border-red-500/30 text-red-400 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                🌍 Dünya Genelinde İnsani Yardım
              </span>
              <h2 className="font-outfit text-4xl md:text-5xl lg:text-6xl font-black leading-tight">
                Yeryüzünde Bir <br className="hidden md:inline" />
                <span className="text-red-500">Kardeşlik Payı</span> Bırakın
              </h2>
              <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-xl">
                Su kuyusu projeleri, gıda kolileri, yetim sponsorlukları ve kurban payı dağıtımları ile dünyanın neresinde mazlum bir yürek varsa oraya el uzatıyoruz. Birlikte daha güçlüyüz.
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs font-semibold">
                  <span>💧</span> 500+ Su Kuyusu
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs font-semibold">
                  <span>👶</span> 2500+ Yetim Kardeş
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs font-semibold">
                  <span>🍚</span> 10K+ Gıda Kolisi
                </div>
              </div>
            </div>

            {/* Quick Donation Form (Right Side) */}
            <div id="hizli-bagis" className="lg:col-span-5">
              <QuickDonationForm 
                campaignId={campaigns[0]?.id || 'genel-bagis'} 
                campaignTitle={campaigns[0]?.title || 'Kardeşlik Payı Genel Bağış'}
                primaryColor="#E10606"
                accentColor="#1E293B"
                themeSlug="kardeslik-payi"
              />
            </div>

          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section id="istatistikler" className="py-12 bg-white border-b border-slate-200">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 grid-cols-2 md:grid-cols-4">
            <div className="text-center space-y-1">
              <div className="text-3xl md:text-4xl font-extrabold text-red-600 font-outfit">500+</div>
              <div className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider">Açılan Su Kuyusu</div>
            </div>
            <div className="text-center space-y-1 border-l border-slate-200">
              <div className="text-3xl md:text-4xl font-extrabold text-red-600 font-outfit">10,000+</div>
              <div className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider">Gıda Yardım Kolisi</div>
            </div>
            <div className="text-center space-y-1 border-l border-slate-200">
              <div className="text-3xl md:text-4xl font-extrabold text-red-600 font-outfit">2,500+</div>
              <div className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider">Desteklenen Yetim</div>
            </div>
            <div className="text-center space-y-1 border-l border-slate-200">
              <div className="text-3xl md:text-4xl font-extrabold text-red-600 font-outfit">40+</div>
              <div className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider">Hizmet Bölgesi</div>
            </div>
          </div>
        </div>
      </section>

      {/* Campaigns Grid Section */}
      <section id="kampanyalar" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center mb-16 space-y-3">
            <span className="text-red-600 font-bold text-xs uppercase tracking-wider block">Acil Hayır Projelerimiz</span>
            <h3 className="font-outfit text-3xl md:text-4xl font-extrabold text-slate-900">
              Aktif Yardım Kampanyaları
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed max-w-lg mx-auto">
              Dünyadaki yoksulluk, açlık ve susuzlukla mücadelede can suyu olan aktif projelerimizi inceleyin ve bir kardeşlik payı verin.
            </p>
          </div>

          {campaigns.length === 0 ? (
            <div className="bg-white border rounded-2xl p-8 text-center text-gray-500 shadow-md">
              Aktif yardım kampanyası bulunmamaktadır.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {campaigns.map((c) => {
                const progress = c.progress_percentage || 0
                return (
                  <div 
                    key={c.id} 
                    className="bg-white rounded-2xl shadow-sm border border-slate-200/80 hover:shadow-xl hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
                  >
                    <div>
                      {/* Image */}
                      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
                        {c.cover_image_url ? (
                          <Image 
                            src={c.cover_image_url} 
                            alt={c.title} 
                            fill 
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-red-800/20 text-3xl font-bold">🤝</div>
                        )}
                        {c.is_featured && (
                          <span className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-extrabold uppercase tracking-wider py-1 px-3.5 rounded-full flex items-center gap-1.5 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                            ACİL PROJE
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-6 space-y-3">
                        <h4 className="font-outfit text-lg font-bold text-slate-900 line-clamp-2 leading-snug">
                          {c.title}
                        </h4>
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                          {c.summary}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar & Actions */}
                    <div className="p-6 pt-0 space-y-4">
                      {c.show_collected && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                            <span>Toplanan: <b className="text-slate-800">{c.collected_lira.toLocaleString('tr-TR')} ₺</b></span>
                            <span className="text-red-600 font-bold">% {progress}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-red-600 to-rose-400 rounded-full"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-right text-slate-400">Hedef: {c.target_lira.toLocaleString('tr-TR')} ₺</div>
                        </div>
                      )}

                      <Link 
                        href={`/kampanyalar/${c.slug}`}
                        className="block text-center w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-sm transition-colors text-xs uppercase tracking-wider"
                      >
                        Kampanya Detayları / Bağış Yap
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Zekat Calculator Widget Section */}
      <section id="zekat" className="py-20 bg-slate-900 text-white relative">
        <div className="container mx-auto px-4 max-w-4xl relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-4">
              <span className="text-red-500 font-bold text-xs uppercase tracking-wider block">Farz İbadetimiz</span>
              <h3 className="font-outfit text-3xl font-black">
                Kolay Zekat Hesaplama Modülü
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Nisap miktarı olan 85 gram altın veya karşılığı nakit birikiminize göre zekat yükümlülüğünüzü ve ödemeniz gereken zekat miktarını hızlıca hesaplayabilirsiniz.
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
              <form onSubmit={handleHesaplaZekat} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Toplam Nakit/Altın Birikiminiz (TL)</label>
                  <input
                    type="number"
                    placeholder="Örn: 200000"
                    value={zekatMiktar}
                    onChange={(e) => setZekatMiktar(e.target.value)}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-white text-sm outline-none focus:border-red-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-md transition-colors text-xs uppercase tracking-wider"
                >
                  Hesapla
                </button>
              </form>

              {zekatSonuc !== null && (
                <div className="pt-4 border-t border-slate-700/80 text-center animate-fade-in">
                  {zekatSonuc > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-300">Hesaplanan Zekat Miktarınız:</p>
                      <h4 className="font-outfit text-3xl font-black text-red-500">{zekatSonuc.toLocaleString('tr-TR')} ₺</h4>
                      <Link
                        href="#hizli-bagis"
                        className="inline-block bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs py-2 px-5 rounded-lg shadow-sm transition-all uppercase tracking-wider"
                      >
                        Zekatımı Bağışla
                      </Link>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-400 font-semibold leading-relaxed">
                      Nakit birikiminiz nisap miktarının altında veya geçersiz tutar girdiniz. Zekat farz olmayabilir, ancak dilerseniz sadaka bağışında bulunabilirsiniz.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Traditional Bank details and secure icons */}
      <section className="py-16 bg-slate-950 text-slate-400 border-t border-slate-800">
        <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8">
          <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800 pb-6 md:pb-0 pr-6">
            <h5 className="font-outfit text-sm font-bold uppercase tracking-widest text-slate-200">Resmi Adres</h5>
            <p className="text-xs leading-relaxed text-slate-400">
              Kardeşlik Payı Yardımlaşma Derneği<br />
              İskenderpaşa Mah. Sofular Cad. No: 12<br />
              Fatih, İstanbul, Türkiye
            </p>
          </div>
          <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800 pb-6 md:pb-0 pr-6">
            <h5 className="font-outfit text-sm font-bold uppercase tracking-widest text-slate-200">İletişim & Danışma</h5>
            <p className="text-xs leading-relaxed text-slate-400">
              Telefon: +90 212 555 44 33<br />
              E-posta: kardeslikpayi2026@gmail.com
            </p>
          </div>
          <div className="space-y-3">
            <h5 className="font-outfit text-sm font-bold uppercase tracking-widest text-slate-200">Yasal Mevzuat</h5>
            <p className="text-xs leading-relaxed text-slate-500">
              Derneğimiz, T.C. İçişleri Bakanlığı Sivil Toplumla İlişkiler Genel Müdürlüğü denetiminde faaliyet göstermektedir. Bağışlarınız şeffaf şekilde raporlanır.
            </p>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="bg-slate-950 py-6 text-center text-[10px] text-slate-600 border-t border-slate-900/60">
        <div className="container mx-auto px-4">
          <p>© {new Date().getFullYear()} Kardeşlik Payı Yardımlaşma Derneği. Tüm Hakları Saklıdır.</p>
          <p className="mt-1 text-slate-700">E-İnfak Otomasyon Sistemi Altyapısı ile Entegre Çalışmaktadır.</p>
        </div>
      </footer>
    </div>
  )
}
