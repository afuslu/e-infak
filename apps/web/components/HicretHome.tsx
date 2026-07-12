'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Campaign } from '@e-infak/api-client'
import { QuickDonationForm } from './QuickDonationForm'

interface HicretHomeProps {
  campaigns: Campaign[]
}

export function HicretHome({ campaigns }: HicretHomeProps) {
  const [activeSlide, setActiveSlide] = useState(0)

  const slides = [
    {
      title: 'İlim Yuvası Hicret Medresesi',
      subtitle: 'Eğitim Yuvamıza Hoş Geldiniz',
      description: 'Modern pedagoji ile geleneksel İslami ilimleri harmanlayarak, geleceğin hafız ve alim nesillerini Eskişehir\'de yetiştiriyoruz.',
      image: '/images/hicret/talebe 1.png',
      stat: '200+',
      statLabel: 'Aktif Öğrenci',
    },
    {
      title: 'Ehliyetli ve Tecrübeli Eğitim Kadrosu',
      subtitle: 'Birebir Takip Sistemi',
      description: 'Her biri kendi alanında uzman 15+ hafız ve arapça müderrisi hoca eşliğinde çocuklarımızın gelişimini adım adım izliyoruz.',
      image: '/images/hicret/talebe 2.png',
      stat: '15+',
      statLabel: 'Müderris Hoca',
    },
    {
      title: 'Hafızlık ve Arapça Eğitimi',
      subtitle: '4 Farklı İlim Programı',
      description: 'Sıbyan mektebi, ibtida, hafızlık hazırlık ve yüksek arapça sınıflarımız ile her yaş grubuna özel eğitim modeli sunuyoruz.',
      image: '/images/hicret/talebe 3.png',
      stat: '4',
      statLabel: 'Özel Bölüm',
    },
  ]

  const programs = [
    {
      title: 'Sıbyan Mektebi',
      age: '4-7 Yaş',
      desc: 'Çocuklarımızın okul öncesi dönemde oyun eşliğinde temel Kur\'an okuma, ahlak ve adap eğitimi aldığı en kıymetli başlangıç halkası.',
      icon: '📖',
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    {
      title: 'İbtida Programı',
      age: '8-12 Yaş',
      desc: 'Kur\'an-ı Kerim tecvid dersleri, temel dini bilgiler, namaz sureleri ezberleri ve İslam ahlakı müfredatının uygulandığı ara kademe.',
      icon: '🕌',
      color: 'bg-green-50 text-green-800 border-green-200',
    },
    {
      title: 'Hafızlık Eğitimi',
      age: '10+ Yaş',
      desc: 'Her öğrenciye özel ezber takip programı ile zihni berrak evlatlarımızın Kur\'an-ı Kerim\'i baştan sona ezberlediği medrese çekirdeği.',
      icon: '✨',
      color: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      title: 'Arapça Dil Eğitimi',
      age: '12+ Yaş',
      desc: 'Sarf, Nahiv ve İslami ilimler (Tefsir, Hadis, Fıkıh) temel metin okumalarının yapıldığı yüksek medrese seviyesi arapça dersleri.',
      icon: '✒️',
      color: 'bg-yellow-50 text-yellow-950 border-yellow-200',
    },
  ]

  return (
    <div className="font-sans antialiased text-gray-800 bg-[#FAF9F6]">
      {/* Top Header Bar */}
      <div className="bg-[#0b2912] text-emerald-100 py-2.5 px-4 text-xs font-semibold">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>📖 Hicret İslami İlimler Derneği ve Medresesi</span>
          <div className="flex gap-4">
            <Link href="/giris" className="hover:text-amber-400 transition-colors">👤 Bağışçı Girişi</Link>
            <span>|</span>
            <Link href="/admin" className="hover:text-amber-400 transition-colors">⚙️ Otomasyon</Link>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-emerald-800 shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-14 w-14 rounded-full border-2 border-emerald-800 overflow-hidden bg-white">
              <Image 
                src="/images/hicret/logooo.png" 
                alt="Hicret Derneği Logo" 
                fill 
                className="object-cover"
              />
            </div>
            <div>
              <h1 className="font-playfair text-xl md:text-2xl font-black text-[#1B5E20] leading-tight tracking-wide">
                HİCRET DERNEĞİ
              </h1>
              <p className="text-[10px] text-amber-600 font-bold tracking-widest uppercase">
                İslami İlimler Medresesi
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-[#1B5E20]">
            <Link href="/" className="hover:text-amber-600 transition-colors border-b-2 border-emerald-800 pb-1">Ana Sayfa</Link>
            <Link href="#programlar" className="hover:text-amber-600 transition-colors pb-1">Eğitim Bölümleri</Link>
            <Link href="#kampanyalar" className="hover:text-amber-600 transition-colors pb-1">Bağış Kampanyaları</Link>
            <Link href="#iletisim" className="hover:text-amber-600 transition-colors pb-1">İletişim</Link>
          </nav>

          <div className="flex gap-3">
            <Link 
              href="#iletisim" 
              className="hidden sm:inline-block bg-[#D4AF37] hover:bg-[#bda132] text-[#0b2912] font-bold text-xs py-2.5 px-5 rounded-full shadow-md transition-all uppercase tracking-wider"
            >
              Öğrenci Başvurusu
            </Link>
            <Link 
              href="#hizli-bagis" 
              className="bg-[#1B5E20] hover:bg-[#154618] text-white font-bold text-xs py-2.5 px-5 rounded-full shadow-md transition-all uppercase tracking-wider"
            >
              Bağış Yap
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Islamic Arched Design */}
      <section className="relative bg-gradient-to-br from-[#0c2f13] via-[#0b2610] to-[#07190b] text-white overflow-hidden py-16 md:py-24">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:20px_20px]" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid md:grid-cols-12 gap-8 items-center">
            {/* Slider Text info */}
            <div className="md:col-span-7 space-y-6">
              <span className="inline-block bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest">
                {slides[activeSlide].subtitle}
              </span>
              <h2 className="font-playfair text-4xl md:text-5xl font-extrabold leading-tight text-amber-100">
                {slides[activeSlide].title}
              </h2>
              <p className="text-sm md:text-base text-gray-300 leading-relaxed max-w-xl">
                {slides[activeSlide].description}
              </p>

              {/* Slider Stats */}
              <div className="flex items-center gap-6 pt-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4 items-center">
                  <span className="text-3xl md:text-4xl font-black text-amber-400 font-playfair">
                    {slides[activeSlide].stat}
                  </span>
                  <div className="h-8 w-px bg-white/20" />
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider leading-relaxed">
                    {slides[activeSlide].statLabel}
                  </span>
                </div>
              </div>

              {/* Slider Dots */}
              <div className="flex gap-2 pt-6">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      activeSlide === idx ? 'w-8 bg-amber-400' : 'w-2.5 bg-white/30 hover:bg-white/50'
                    }`}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Slider Arched Image */}
            <div className="md:col-span-5 flex justify-center">
              <div className="relative w-72 h-96 md:w-80 md:h-[420px] rounded-t-full border-4 border-amber-400 overflow-hidden shadow-2xl bg-[#0b2610]">
                {slides[activeSlide].image ? (
                  <Image 
                    src={slides[activeSlide].image} 
                    alt={slides[activeSlide].title} 
                    fill 
                    className="object-cover object-top transition-all duration-700 scale-105"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-amber-300/40">Görsel</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Madrasah Programs Section with Arched Panels */}
      <section id="programlar" className="py-20 bg-white relative">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16 space-y-3">
            <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">Müfredatımız</span>
            <h3 className="font-playfair text-3xl md:text-4xl font-extrabold text-[#1B5E20]">
              Köklü Medrese Eğitimi Bölümleri
            </h3>
            <p className="text-sm text-gray-500 max-w-xl mx-auto leading-relaxed">
              Öğrencilerimizin yaş gruplarına ve bilgi düzeylerine göre şekillendirdiğimiz, dünyevi ve uhrevi gelişimlerini birlikte yürüten ilim programlarımız.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {programs.map((prog, idx) => (
              <div 
                key={idx} 
                className={`rounded-t-full border-2 p-6 flex flex-col items-center text-center shadow-lg hover:shadow-xl transition-all duration-300 bg-white ${prog.color}`}
              >
                <span className="text-4xl mb-4 mt-6">{prog.icon}</span>
                <h4 className="font-playfair text-lg font-bold mb-1">{prog.title}</h4>
                <span className="text-[10px] font-bold tracking-widest uppercase mb-4 text-[#D4AF37]">{prog.age}</span>
                <p className="text-xs text-gray-600 leading-relaxed mt-2">{prog.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Campaigns and Quick Donation Section */}
      <section id="kampanyalar" className="py-20 relative bg-[#FAF9F6]">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            
            {/* Campaigns List (Left side) */}
            <div className="lg:col-span-7 space-y-8">
              <div className="space-y-2">
                <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">Kampanyalar</span>
                <h3 className="font-playfair text-3xl font-extrabold text-[#1B5E20]">
                  Desteklerinizi Bekleyen Hayır Projeleri
                </h3>
              </div>

              {campaigns.length === 0 ? (
                <div className="bg-white border rounded-2xl p-8 text-center text-gray-500 shadow-md">
                  Aktif yardım kampanyası bulunmamaktadır.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-6">
                  {campaigns.map((c) => {
                    const progress = c.progress_percentage || 0
                    return (
                      <div 
                        key={c.id} 
                        className="bg-white rounded-3xl border border-gray-100 shadow-md hover:shadow-lg overflow-hidden flex flex-col justify-between transition-all"
                      >
                        <div>
                          {/* Image */}
                          <div className="relative aspect-video w-full overflow-hidden bg-emerald-50">
                            {c.cover_image_url ? (
                              <Image 
                                src={c.cover_image_url} 
                                alt={c.title} 
                                fill 
                                className="object-cover"
                              />
                            ) : (
                              <div className="h-full flex items-center justify-center text-emerald-800/30 text-2xl font-bold">🕌</div>
                            )}
                            {c.is_featured && (
                              <span className="absolute top-3 left-3 bg-[#D4AF37] text-[#0b2912] text-[10px] font-bold uppercase tracking-wider py-1 px-3.5 rounded-full">
                                Acil Proje
                              </span>
                            )}
                          </div>

                          {/* Content */}
                          <div className="p-5 space-y-3">
                            <h4 className="font-playfair text-lg font-bold text-[#1B5E20] line-clamp-2 leading-tight">
                              {c.title}
                            </h4>
                            <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                              {c.summary}
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar & CTA */}
                        <div className="p-5 pt-0 space-y-4">
                          {c.show_collected && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
                                <span>Toplam Bağış: <b className="text-emerald-800">{c.collected_lira.toLocaleString('tr-TR')} ₺</b></span>
                                <span className="text-[#D4AF37] font-bold">% {progress}</span>
                              </div>
                              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-emerald-700 to-amber-500 rounded-full"
                                  style={{ width: `${Math.min(progress, 100)}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-right text-gray-500">Hedef: {c.target_lira.toLocaleString('tr-TR')} ₺</div>
                            </div>
                          )}

                          <Link 
                            href={`/kampanyalar/${c.slug}`}
                            className="block text-center w-full bg-[#1B5E20] hover:bg-[#154618] text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors text-xs uppercase tracking-wider"
                          >
                            Hemen Destek Ol
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick Donation Form Widget (Right side) */}
            <div id="hizli-bagis" className="lg:col-span-5 lg:sticky lg:top-24">
              <QuickDonationForm 
                campaignId={campaigns[0]?.id || 'genel-bagis'} 
                campaignTitle={campaigns[0]?.title || 'Hicret Medresesi Genel Bağış'}
                primaryColor="#1B5E20"
                accentColor="#D4AF37"
                themeSlug="hicret-dernegi"
              />
            </div>

          </div>
        </div>
      </section>

      {/* Traditional Bank details and Trust icons */}
      <section className="py-16 bg-[#0c2e12] text-[#c9e1cc] border-t-4 border-amber-400">
        <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8">
          <div className="space-y-2 border-b md:border-b-0 md:border-r border-emerald-800 pb-6 md:pb-0 pr-6">
            <h5 className="font-playfair text-lg font-bold text-amber-400">Medrese Adresimiz</h5>
            <p className="text-xs leading-relaxed text-gray-300">
              Hicret İslami İlimler Medresesi<br />
              71 Evler Mah. Esenyazı Sok. No: 41<br />
              Odunpazarı, Eskişehir, Türkiye
            </p>
          </div>
          <div className="space-y-2 border-b md:border-b-0 md:border-r border-emerald-800 pb-6 md:pb-0 pr-6">
            <h5 className="font-playfair text-lg font-bold text-amber-400">İletişim & Başvuru</h5>
            <p className="text-xs leading-relaxed text-gray-300">
              Telefon: +90 222 222 00 26<br />
              E-posta: hicretdernegi26@gmail.com
            </p>
          </div>
          <div className="space-y-3">
            <h5 className="font-playfair text-lg font-bold text-amber-400">Güvenli Bağış Altyapısı</h5>
            <p className="text-xs leading-relaxed text-gray-400">
              Tüm bağışlarınız Vakıf Katılım Bankası güvencesiyle 3D Secure 256-Bit şifreli altyapıda tahsil edilmektedir.
            </p>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer id="iletisim" className="bg-[#07190a] py-6 text-center text-[10px] text-emerald-800 border-t border-emerald-950">
        <div className="container mx-auto px-4">
          <p>© {new Date().getFullYear()} Hicret İslami İlimler Derneği. Tüm Hakları Saklıdır.</p>
          <p className="mt-1 text-gray-600">E-İnfak Otomasyon Sistemi Altyapısı ile Entegre Çalışmaktadır.</p>
        </div>
      </footer>
    </div>
  )
}
