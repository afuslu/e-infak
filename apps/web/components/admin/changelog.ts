/** "Yenilikler": release notes shown in Destek → Yenilikler (newest first). */
export interface Release {
  id: string
  date: string
  area: 'Panel' | 'Entegrasyonlar' | 'Web Sitesi'
  title: string
  summary: string
  items: { heading: string; path: string; points: string[] }[]
}

export const RELEASES: Release[] = [
  {
    id: '2026-11-24-makbuz-eslesme', date: '2026-11-24', area: 'Panel', title: 'Makbuz ve eşleştirme silme',
    summary: 'Yanlış veya mükerrer makbuz silinir, doğru karta taşınır; mükerrer kartlar birleştirilir.',
    items: [
      { heading: 'Bağışçı kartı', path: 'Bağışçılar › Bağışçı kartı', points: ['"Makbuz ve Eşleştirme Sil" makbuzu iptal eder; banka hareketi yeniden eşleşme bekler.', '"Başka karta taşı" makbuzu numarası ve tutarıyla doğru bağışçıya geçirir.', '"Birleştir" mükerrer kartın kayıtlarını asıl karta taşır.'] },
      { heading: 'Banka hareketleri', path: 'Finans › Banka Hareketleri', points: ['Eşleşmemiş harekete "Makbuz Ekle" ile doğru bağışçıyı seçerek makbuz kesin.'] },
    ],
  },
  {
    id: '2026-11-24-niyet', date: '2026-11-24', area: 'Panel', title: 'Makbuzda kurban niyeti',
    summary: 'Kurban niyeti makbuza yazılır; Tüm Makbuzlar ve Tüm Bağışlar adları sadeleşti.',
    items: [
      { heading: 'Niyet', path: 'Bağışçı kartı › Yeni Makbuz', points: ['Sitede veya makbuz formunda seçilen niyet (Adak, Akika, Şükür…) PDF makbuzda ve listelerde görünür.', 'Çok kalemli makbuzun e-posta ekinde ve sitedeki PDF\'inde tüm kalemler yer alır.'] },
      { heading: 'Makbuz kesme', path: 'Operasyon › Tüm Bağışlar', points: ['"Elle makbuzlar" görünümü kaldırıldı; makbuz bağışçı kartından kesilir.'] },
    ],
  },
  {
    id: '2026-11-22-site', date: '2026-11-22', area: 'Web Sitesi', title: 'Form oluşturucu, yönlendirmeler ve yeni logolar',
    summary: 'Siteye kendi formlarınızı ekleyin, eski adresleri yönlendirin, footer / PDF logosu seçin.',
    items: [
      { heading: 'Form oluşturucu', path: 'Web Sitesi › Form', points: ['Kısa/uzun metin, e-posta, telefon, liste, onay kutusu alanları.', 'Form sitede /form/adres sayfasında yayınlanır; yanıtlar panelde listelenir ve Excel olarak indirilir.', 'İsterseniz her yanıt bir e-posta adresine de gönderilir.'] },
      { heading: 'Slug/URL Yönetimi', path: 'Web Sitesi › Slug/URL Yönetimi', points: ['Eski adresleri yeni adreslere kalıcı (301) yönlendirin; toplu yapıştırarak ekleyebilirsiniz.'] },
      { heading: 'Görünüm', path: 'Web Sitesi › Görünüm', points: ['Floating logo (sayfa kaydırılınca üst barda), footer logo ve makbuz PDF logosu.'] },
      { heading: 'Kampanya sekmeleri sitede', path: 'Kampanya › Kampanya Sekmeler', points: ['Kampanyalar sayfası panelde tanımladığınız sekmelere göre gruplanır; "Açılışta Göster" sekmesi seçili açılır.'] },
    ],
  },
  {
    id: '2026-11-21-reports', date: '2026-11-21', area: 'Panel', title: 'Raporlar ve Anasayfa kartları',
    summary: '12 rapor kartı, bağış kanalı / bağışçı kaynağı / türlere göre raporlar ve yeni anasayfa kartları.',
    items: [
      { heading: 'Raporlar', path: 'Raporlar', points: ['Rapor seçin listesi ve 12 rapor kartı.', 'Yeni: Bağış Kanalı Dağılımı, Bağışçı Kaynağı, Türlere Göre Bağış.'] },
      { heading: 'Anasayfa', path: 'Anasayfa', points: ['Bugün makbuz, bugün bağış, bugün üye, toplam üye; eşleşmemiş online bağış ve banka hareketi; atanmamış kurban.', 'Günlere göre yapılan bağışlar grafiği (yıl / ay seçimi).'] },
    ],
  },
  {
    id: '2026-11-21-system', date: '2026-11-21', area: 'Panel', title: 'Sistem menüsü, bildirimler ve kısayollar',
    summary: 'Sekmeli Sistem Ayarları, Aktif Oturumlar, Bildirim Merkezi, Tercihlerim ve F tuşu kısayolları.',
    items: [
      { heading: 'Sistem Ayarları', path: 'Sistem › Sistem Ayarları', points: ['Genel, Güvenlik & Giriş, Sanal Pos, Banka Entegrasyonu, SMS ve Toplu Mail tek sayfada.'] },
      { heading: 'Aktif Oturumlar', path: 'Sistem › Aktif Oturumlar', points: ['Kim şu an hangi sayfada; oturumu kapatma.'] },
      { heading: 'Kısayollar', path: 'Sistem › Kısayollar', points: ['F2 Yeni Makbuz, F3 Bağışçılar, F4 Tüm Bağışlar, F6 Makbuzlar, F7 Banka, F8 Online Bağış, F9 Raporlar, F10 Anasayfa; her kullanıcı değiştirebilir.'] },
      { heading: 'Eğitim Modu ve Görünüm: Sıkı', path: 'Üst bar', points: ['Sayfalarda kısa kullanım ipuçları; daha sık tablo satırları.'] },
    ],
  },
  {
    id: '2026-11-21-messaging', date: '2026-11-21', area: 'Entegrasyonlar', title: 'Mail modülü ve SMS listeleri',
    summary: 'Mail şablonları, mail gönderimleri, SMS ve mail listeleri.',
    items: [
      { heading: 'Mail', path: 'İletişim › Mail', points: ['Şablon, liste ve gönderim; tanıtım mailleri yalnız e-posta izni olanlara gider.'] },
      { heading: 'SMS Listeleri', path: 'İletişim › SMS Listeleri', points: ['Bağışçılar ekranında seçtiklerinizi listeye kaydedin, toplu SMS\'te liste olarak seçin.'] },
      { heading: 'Gönderim Sihirbazı', path: 'Bağışçılar › Toplu İşlemler', points: ['Seçili bağışçılara tek tıkla SMS gönderimi başlatın.'] },
    ],
  },
  {
    id: '2026-11-21-receipts', date: '2026-11-21', area: 'Panel', title: 'Makbuzlar, makbuz numarası ve Online Bağış',
    summary: 'Makbuz numarası önceki sistemden devam eder; Makbuzlar ve Online Bağış ekranları yenilendi.',
    items: [
      { heading: 'Makbuz No', path: 'Operasyon › Makbuzlar', points: ['Aktarılan makbuzlar kendi numarasını korur, yeni makbuzlar devam eder.', 'Çok kalemli makbuz tek satırda; Toplam Tutar göz düğmesiyle açılır.'] },
      { heading: 'Online Bağış', path: 'Finans › Online Bağış', points: ['Sanal POS bağışları 60 saniyede bir kendiliğinden yenilenir.'] },
    ],
  },
  {
    id: '2026-11-21-campaigns', date: '2026-11-21', area: 'Panel', title: 'Kampanya türleri ve yeni kampanya formu',
    summary: 'Standart, Sponsorluk, Kurban, Su Kuyusu, Proje ve Kumanya türleri; çok para birimli referans tutar.',
    items: [
      { heading: 'Kampanyalar', path: 'Kampanya › Kampanyalar', points: ['Ref. Tutar ve Öncelik listede değiştirilebilir; Durum, Web/1, Web/2 anahtarları.', 'Sabit tutar, adet çarpanı, özel varyant, yönlendirme ve SEO alanları.'] },
      { heading: 'Kampanya Sekmeler ve Sayfaları', path: 'Kampanya', points: ['Sekmeler (üst kategori, öncelik, açılışta göster) ve kampanya sayfa adresleri.'] },
    ],
  },
  {
    id: '2026-11-21-donors', date: '2026-11-21', area: 'Panel', title: 'Yeni bağışçı listesi ve bağışçı kartı',
    summary: 'Her sütunda filtre, toplu işlemler, tam sayfa bağışçı kartı ve yeni bağışçı alanları.',
    items: [
      { heading: 'Bağışçılar', path: 'Bağışçılar', points: ['Sütun filtreleri, sütun seçici, sayfa başına kayıt, "Tüm N kaydı seç".', 'Toplu Güncelle, Sil, Dışa Aktar (sütun seçerek).'] },
      { heading: 'Bağışçı kartı', path: 'Bağışçılar › kart', points: ['Kurban, Sponsorluk, Su Kuyusu sekmeleri; görüşme notu ve işlem geçmişi.', 'Üyelik tipi, kan grubu, meslek, referans, doğum tarihi, ilçe, mahalle, ikinci telefon.'] },
    ],
  },
]
