import type { Metadata } from 'next'
import Link from 'next/link'
import { Identity, LegalShell, loadLegal } from '../../../components/legal/LegalPage'

export const metadata: Metadata = { title: 'KVKK Aydınlatma Metni', alternates: { canonical: '/kvkk' } }

export default async function KvkkPage() {
  const { legal, siteName } = await loadLegal()
  const name = legal?.legal_name || siteName
  return (
    <LegalShell title="Kişisel Verilerin Korunması Aydınlatma Metni">
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca, veri sorumlusu sıfatıyla <strong>{name}</strong> olarak
        bağışçılarımızın, üyelerimizin ve bize başvuran kişilerin kişisel verilerini aşağıda açıklanan şekilde işliyoruz.
      </p>
      <h2 id="veri-sorumlusu">1. Veri sorumlusu</h2>
      <Identity legal={legal} siteName={siteName} />
      <h2 id="islenen-veriler">2. İşlenen kişisel veriler</h2>
      <ul>
        <li><strong>Kimlik:</strong> ad, soyad; makbuz ve yasal defter için istenirse T.C. kimlik veya vergi numarası.</li>
        <li><strong>İletişim:</strong> telefon, e-posta, adres.</li>
        <li><strong>Bağış ve işlem bilgileri:</strong> bağış tutarı, tarihi, kalemi, kimin adına yapıldığı, makbuz numarası, havale açıklaması.</li>
        <li><strong>Ödeme bilgileri:</strong> kartın son dört hanesi ve banka işlem numarası. Kart numarası ve güvenlik kodu bu siteye
          girilmez; ödeme bankanın veya ödeme kuruluşunun güvenli sayfasında yapılır.</li>
        <li><strong>İşlem güvenliği:</strong> IP adresi, tarayıcı bilgisi, onay kayıtları.</li>
      </ul>
      <h2 id="amaclar">3. İşleme amaçları ve hukuki sebepler</h2>
      <ul>
        <li>Bağışın alınması, kaydı, makbuzun düzenlenmesi ve gönderilmesi — sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
        <li>Dernekler ve vergi mevzuatından doğan kayıt ve bildirim yükümlülükleri — hukuki yükümlülük (m.5/2-ç).</li>
        <li>Banka hareketlerinin bağışlarla eşleştirilmesi, hatalı veya mükerrer işlemlerin çözülmesi — meşru menfaat (m.5/2-f).</li>
        <li>Kampanya, duyuru ve bilgilendirme SMS / e-postaları — yalnız açık rızanız ve ticari ileti onayınız varsa (m.5/1).</li>
        <li>Bilgi güvenliğinin sağlanması ve kötüye kullanımın önlenmesi — meşru menfaat (m.5/2-f).</li>
      </ul>
      <h2 id="aktarim">4. Aktarım</h2>
      <p>
        Verileriniz yalnız yukarıdaki amaçlar için ve gerektiği ölçüde; ödemeyi gerçekleştiren banka / ödeme kuruluşuna, SMS ve e-posta
        hizmet sağlayıcılarına, barındırma ve yazılım hizmeti aldığımız tedarikçilere ve kanunen yetkili kamu kurumlarına aktarılabilir.
      </p>
      <h2 id="toplama">5. Toplama yöntemi</h2>
      <p>Veriler bu sitedeki bağış ve başvuru formları, bağışçı portalı, banka hesap hareketleri, telefon ve yüz yüze görüşmeler yoluyla toplanır.</p>
      <h2 id="haklar">6. Haklarınız</h2>
      <p>
        KVKK m.11 kapsamında; verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini veya silinmesini isteme,
        aktarıldığı kişileri öğrenme, itiraz etme ve zararınızın giderilmesini talep etme haklarına sahipsiniz. SMS ve e-posta
        izinlerinizi istediğiniz zaman geri alabilirsiniz.
      </p>
      <h2 id="basvuru">7. Başvuru</h2>
      <p>
        Taleplerinizi yukarıdaki iletişim bilgilerinden ya da <Link href="/iletisim">iletişim sayfasından</Link> iletebilirsiniz. Başvurular en geç
        30 gün içinde ücretsiz olarak sonuçlandırılır.
      </p>
    </LegalShell>
  )
}
