import type { Metadata } from 'next'
import Link from 'next/link'
import { Identity, LegalShell, loadLegal } from '../../../components/legal/LegalPage'

export const metadata: Metadata = { title: 'Bağış Koşulları', alternates: { canonical: '/bagis-kosullari' } }

export default async function DonationTermsPage() {
  const { legal, siteName } = await loadLegal()
  const name = legal?.legal_name || siteName
  return (
    <LegalShell title="Bağış Koşulları">
      <nav className="not-prose mb-8 flex flex-wrap gap-2 text-sm">
        {[['#on-bilgilendirme', 'Ön bilgilendirme'], ['#mesafeli-bagis-sozlesmesi', 'Mesafeli bağış sözleşmesi'], ['#iptal-iade', 'İptal ve iade'], ['#makbuz', 'Makbuz']].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold text-gray-700 hover:border-primary-400 hover:text-primary-700">{label}</a>
        ))}
      </nav>

      <h2 id="on-bilgilendirme">Ön bilgilendirme formu</h2>
      <p>Bağışı alan kurum:</p>
      <Identity legal={legal} siteName={siteName} />
      <ul>
        <li><strong>Konu:</strong> seçtiğiniz kampanya veya bağış kalemine karşılıksız bağış.</li>
        <li><strong>Tutar:</strong> ödeme sayfasında gösterilen toplam tutar; ek ücret alınmaz. Döviz ile yapılan bağışlarda banka kendi kurunu uygular.</li>
        <li><strong>Ödeme:</strong> kredi / banka kartıyla bankanın güvenli ödeme sayfasında veya havale / EFT ile kurum hesaplarına.</li>
        <li><strong>İfa:</strong> bağış, banka onayından (havalede hesaba geçişten) sonra kampanyaya kaydedilir ve makbuz düzenlenir.
          Kurban, su kuyusu gibi organizasyonlarda uygulama tarihi ve şekli kampanya sayfasında açıklanır.</li>
        <li><strong>Şikâyet ve talepler:</strong> yukarıdaki iletişim bilgileri veya <Link href="/iletisim">iletişim sayfası</Link>.</li>
      </ul>

      <h2 id="mesafeli-bagis-sozlesmesi">Mesafeli bağış sözleşmesi</h2>
      <ol>
        <li><strong>Taraflar:</strong> bağışı yapan kişi (&quot;Bağışçı&quot;) ile <strong>{name}</strong> (&quot;Kurum&quot;).</li>
        <li><strong>Konu:</strong> Bağışçının bu site üzerinden seçtiği amaç için yaptığı karşılıksız bağışın kabulü ve amacına uygun kullanılmasıdır.</li>
        <li><strong>Kurumun yükümlülükleri:</strong> bağışı seçilen amaca veya amacın gerçekleşmesinin mümkün olmadığı durumda en yakın
          amaca kullanmak, makbuz düzenlemek, kişisel verileri <Link href="/kvkk">KVKK Aydınlatma Metni</Link>&apos;ne uygun işlemek.</li>
        <li><strong>Bağışçının beyanı:</strong> ödemede kullanılan kart veya hesabın kendisine ait ya da kullanma yetkisi bulunduğunu,
          verdiği bilgilerin doğru olduğunu kabul eder.</li>
        <li><strong>Vekâlet:</strong> kurban, akika, adak gibi bağışlarda Bağışçı, ibadetin kendi adına (veya belirttiği kişi adına) yerine
          getirilmesi için Kuruma vekâlet verir.</li>
        <li><strong>Yürürlük:</strong> sözleşme, ödeme sayfasındaki onay kutusunun işaretlenip ödemenin tamamlanmasıyla kurulur.
          Uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır.</li>
      </ol>

      <h2 id="iptal-iade">İptal ve iade</h2>
      <p>
        Bağış karşılıksız bir kazandırmadır. Hatalı tutar, mükerrer çekim veya yetkisiz kullanım gibi durumlarda makbuz numaranızla
        bize başvurabilirsiniz. Bağış henüz amacına kullanılmadıysa (örneğin kurban kesilmeden önce) iade kartınıza veya hesabınıza yapılır;
        iadenin hesaba yansıma süresi bankaya göre değişir. Amacına kullanılmış bağışlar iade edilemez.
      </p>

      <h2 id="makbuz">Makbuz</h2>
      <p>
        Her bağış için elektronik makbuz düzenlenir ve e-posta / SMS ile gönderilir. Makbuzun gerçekliğini makbuzdaki karekod veya
        <Link href="/verify"> makbuz doğrulama</Link> sayfasından doğrulama koduyla kontrol edebilirsiniz.
        {legal?.tax_deduction_eligible && ' Kurumumuza yapılan bağışlar ilgili mevzuat çerçevesinde vergi matrahından indirilebilir.'}
      </p>
    </LegalShell>
  )
}
