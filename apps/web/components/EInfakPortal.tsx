import React from 'react'
import Image from 'next/image'

export function EInfakPortal() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden font-sans">
      {/* Background Glowing Blurs */}
      <div className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center border-b border-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-red-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-emerald-400 to-red-500 bg-clip-text text-transparent">
              E-İNFAK
            </span>
            <p className="text-[10px] text-slate-500 tracking-widest uppercase">Ortak Bağış Portalı</p>
          </div>
        </div>

        <a
          href="/giris"
          className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 transition-all duration-300 shadow-sm"
        >
          Yönetim Paneli Girişi
        </a>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 py-16 flex flex-col items-center justify-center">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mb-16 space-y-4">
          <span className="px-3 py-1 text-xs font-semibold tracking-wider text-emerald-400 bg-emerald-500/10 rounded-full border border-emerald-500/20">
            Platform Altyapısı v2.0
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-none bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            Tek Çatı Altında,<br />Binlerce Gönle Şefkat
          </h1>
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            E-İnfak çoklu dernek yönetim platformu ile yardımlarınız hedefine güvenle, şeffaflıkla ve hızla ulaşır. Bağış yapmak istediğiniz kurumu seçerek devam edin.
          </p>
        </div>

        {/* Brand Selector Grid */}
        <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
          {/* Hicret Derneği Card */}
          <div className="group relative rounded-2xl border border-slate-900 hover:border-emerald-500/30 bg-slate-900/20 hover:bg-slate-900/40 backdrop-blur-xl p-8 flex flex-col justify-between transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-500/5 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-500" />
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-full border-2 border-emerald-500/30 overflow-hidden bg-white flex items-center justify-center p-1">
                  <Image
                    src="/images/hicret/logo.jpeg"
                    alt="Hicret Derneği"
                    width={64}
                    height={64}
                    className="object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors duration-300">
                    Hicret Derneği
                  </h3>
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Eskişehir</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">
                Hafızlık eğitimi, yetim destekleri, medrese faaliyetleri ve Ramazan kumanyaları ile manevi ve sosyal alanda faaliyet gösteren Eskişehir merkezli eğitim derneği.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {['Talebe Sponsorluğu', 'Hafızlık', 'Medrese', 'Eğitim'].map((tag) => (
                  <span key={tag} className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/5 px-2.5 py-1 rounded-md border border-emerald-500/10">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-8">
              <a
                href="https://hicretdernegi.org"
                className="w-full py-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold transition-all duration-300 shadow-lg shadow-emerald-950/50 hover:shadow-emerald-900/40"
              >
                Dernek Sayfasına Git
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </div>

          {/* Kardeşlik Payı Card */}
          <div className="group relative rounded-2xl border border-slate-900 hover:border-red-500/30 bg-slate-900/20 hover:bg-slate-900/40 backdrop-blur-xl p-8 flex flex-col justify-between transition-all duration-500 hover:shadow-2xl hover:shadow-red-500/5 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-2xl pointer-events-none group-hover:bg-red-600/10 transition-all duration-500" />
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-full border-2 border-red-500/30 overflow-hidden bg-white flex items-center justify-center p-1">
                  <Image
                    src="/images/kardeslik/logo.jpeg"
                    alt="Kardeşlik Payı"
                    width={64}
                    height={64}
                    className="object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white group-hover:text-red-400 transition-colors duration-300">
                    Kardeşlik Payı
                  </h3>
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Yardımlaşma Vakfı</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">
                Afrika su kuyusu projeleri, acil gıda yardımları, yetim sponsorluk programları ve kurban hisse organizasyonları ile dünya genelinde faaliyet gösteren insani yardım vakfı.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {['Su Kuyusu', 'Yetim Sponsorluğu', 'Kurban Hissesi', 'Acil Gıda'].map((tag) => (
                  <span key={tag} className="text-[10px] font-semibold text-red-400 bg-red-500/5 px-2.5 py-1 rounded-md border border-red-500/10">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-8">
              <a
                href="https://kardeslikpayi.org"
                className="w-full py-3 inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold transition-all duration-300 shadow-lg shadow-red-950/50 hover:shadow-red-900/40"
              >
                Dernek Sayfasına Git
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full text-center py-8 border-t border-slate-900/50 bg-slate-950/80">
        <p className="text-xs text-slate-600">
          E-İnfak Çoklu Dernek & Bağış Platformu © 2026. Tüm Hakları Saklıdır.
        </p>
      </footer>
    </div>
  )
}
