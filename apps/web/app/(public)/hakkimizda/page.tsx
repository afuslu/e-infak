import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const content = {
  'hicret-dernegi': {
    primary: '#1E7A34',
    hover: '#166028',
    border: '#E4E9E2',
    bg: '#F0F6EE',
    text: '#6B7A70',
    heading: '#1C2420',
    hero: '/images/hicret/hicret-hero.png',
    intro:
      'Hicret Derneği, Eskişehir merkezli; sıbyan mektebinden hafızlık ve Arapça eğitimine uzanan eğitim kurumları işleten, yurt içi ve yurt dışında insani yardım çalışmaları yürüten dernektir.',
    mission:
      "İlimle yetişen nesiller için erişilebilir, ehil hocalarla yürütülen Kur'an ve Arapça eğitimi sunmak; bağışçılarımızın emanetini kurban, su kuyusu ve yetim sponsorluğu çalışmalarıyla ihtiyaç sahiplerine ulaştırmak.",
    vision:
      "Hafızlıktan Arapça'ya kesintisiz bir eğitim yolu kurarak Eskişehir'in referans eğitim kurumu olmak; iyiliği dünyanın dört bir yanına taşımak.",
  },
  'kardeslik-payi': {
    primary: '#C2181B',
    hover: '#961114',
    border: '#EDE3E0',
    bg: '#FBEDEB',
    text: '#82706D',
    heading: '#241C1B',
    hero: '/images/kardeslik/kp-hero.png',
    intro:
      '"Birlikte daha güçlüyüz" anlayışıyla Türkiye genelinde ihtiyaç sahibi ailelere ulaşan yurt içi yardım kuruluşuyuz.',
    mission:
      'Bu topraklarda kimse yalnız kalmasın. Gıda, barınma, eğitim ve sağlık alanlarında tespit ettiğimiz ihtiyaç sahiplerine, bağışçılarımızın emanetini şeffaflıkla ulaştırmak.',
    vision:
      "81 ilde gönüllü ağıyla, yardıma muhtaç her haneye komşuluk hukukuyla dokunan, Türkiye'nin en güvenilir yurt içi yardım kuruluşu olmak.",
  },
} as const

export default async function AboutPage() {
  const headersList = await headers()
  const orgSlug = headersList.get('x-organization-slug') || 'hicret-dernegi'
  const c = orgSlug === 'kardeslik-payi' ? content['kardeslik-payi'] : content['hicret-dernegi']
  const orgName = orgSlug === 'kardeslik-payi' ? 'Kardeşlik Payı' : 'Hicret Derneği'

  return (
    <div className="font-sans" style={{ color: c.heading }}>
      <div className="max-w-[900px] mx-auto px-6 pt-14 pb-20">
        <Link href="/" className="font-bold text-sm mb-6 inline-block" style={{ color: c.primary }}>
          ← Ana sayfaya dön
        </Link>
        <h1 className="font-heading text-[38px] font-bold mb-2">Hakkımızda</h1>
        <p className="text-[17px] leading-relaxed mb-8" style={{ color: c.text }}>
          {c.intro}
        </p>

        <div className="relative h-[280px] rounded-2xl overflow-hidden mb-8">
          <Image src={c.hero} alt={orgName} fill className="object-cover" />
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
            <div className="font-heading text-xl font-bold mb-2.5">Misyonumuz</div>
            <p className="text-sm leading-relaxed" style={{ color: c.text }}>{c.mission}</p>
          </div>
          <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
            <div className="font-heading text-xl font-bold mb-2.5">Vizyonumuz</div>
            <p className="text-sm leading-relaxed" style={{ color: c.text }}>{c.vision}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${c.border}` }}>
          <div className="font-heading text-xl font-bold mb-3.5">Şeffaflık ve Belgeler</div>
          <div className="flex flex-col gap-2.5">
            <a href="#" className="font-semibold text-[14.5px]" style={{ color: c.primary }}>→ Dernek Tüzüğü (PDF)</a>
            <a href="#" className="font-semibold text-[14.5px]" style={{ color: c.primary }}>→ 2025 Faaliyet Raporu (PDF)</a>
            <a href="#" className="font-semibold text-[14.5px]" style={{ color: c.primary }}>→ Gelir-Gider Tablosu (PDF)</a>
            <a href="#" className="font-semibold text-[14.5px]" style={{ color: c.primary }}>→ KVKK Aydınlatma Metni</a>
          </div>
        </div>
      </div>
    </div>
  )
}
