import type { Metadata } from 'next'
import Link from 'next/link'
import { ConsentLink } from '../../../components/site/ConsentLink'
import { Identity, LegalShell, loadLegal } from '../../../components/legal/LegalPage'

export const metadata: Metadata = { title: 'Gizlilik ve Çerez Politikası', alternates: { canonical: '/gizlilik' } }

export default async function PrivacyPage() {
  const { legal, siteName } = await loadLegal()
  return (
    <LegalShell title="Gizlilik ve Çerez Politikası">
      <p>
        Bu sayfa, sitemizi kullanırken hangi bilgilerin tarayıcınızda saklandığını ve verilerinizi nasıl koruduğumuzu açıklar.
        Kişisel verilerin işlenmesine ilişkin ayrıntılar <Link href="/kvkk">KVKK Aydınlatma Metni</Link>&apos;ndedir.
      </p>
      <Identity legal={legal} siteName={siteName} />
      <h2 id="guvenlik">Güvenlik</h2>
      <ul>
        <li>Kart numarası ve güvenlik kodu bu siteye girilmez; ödeme bankanın veya ödeme kuruluşunun güvenli sayfasında yapılır.</li>
        <li>Bağlantılar şifrelidir (HTTPS). Bağışçı bilgilerine yalnız yetkili personel, görevi gerektirdiği ölçüde erişir; erişimler kayıt altına alınır.</li>
        <li>Teknik kayıtlarda şifre, kart bilgisi veya tek kullanımlık doğrulama kodu tutulmaz.</li>
      </ul>
      <h2 id="cerezler">Çerezler ve tarayıcı depolaması</h2>
      <p><strong>Zorunlu</strong> (site çalışmak için kullanır, kapatılamaz):</p>
      <ul>
        <li><code>lang</code> — seçtiğiniz site dili.</li>
        <li><code>org-slug</code> — hangi kurumun sitesinde olduğunuz.</li>
        <li>Bağış sepeti ve çerez tercihiniz — tarayıcınızın yerel depolamasında, yalnız sizin cihazınızda tutulur.</li>
        <li>Bağışçı portalı oturumu — portaldan çıkış yapınca silinir.</li>
      </ul>
      <p><strong>İsteğe bağlı</strong> (yalnız izin verirseniz yüklenir):</p>
      <ul>
        <li>Canlı destek penceresi (kurum etkinleştirdiyse) — sağlayıcısı kendi çerezlerini kullanır.</li>
        <li>Ziyaret istatistikleri (kurum etkinleştirdiyse).</li>
      </ul>
      <p>
        Tercihinizi <ConsentLink className="font-bold underline" /> bağlantısından istediğiniz zaman değiştirebilirsiniz.
      </p>
    </LegalShell>
  )
}
