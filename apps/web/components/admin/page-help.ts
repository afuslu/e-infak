/** "Eğitim Modu": a short how-to shown above a page while the mode is on. */
export const PAGE_HELP: [string, string][] = [
  ['/admin/bagiscilar/yeni', 'Ad Soyad ve cep telefonu yeterlidir; diğer alanları sonra bağışçı kartından tamamlayabilirsiniz. Aynı telefon ya da e-postayla ikinci kayıt açılmaz.'],
  ['/admin/bagiscilar/', 'Bağışçı kartı: solda bilgiler (Bağışçıyı Düzenle ile değiştirin), sağda bağış sekmeleri, altta görüşme notları ve işlem geçmişi. Yeni Makbuz Ekle bu kişi adına makbuz keser. Makbuz satırından makbuzu silebilir ya da başka karta taşıyabilir, Birleştir ile mükerrer kartı asıl karta katabilirsiniz.'],
  ['/admin/bagiscilar', 'Her sütunun altındaki kutuya yazıp Filtreyi Uygula\'ya basın. Kişileri seçip Toplu İşlemler ile güncelleyin, dışa aktarın, SMS veya mail listesi oluşturun. "Tüm N kaydı seç" filtreye uyan herkesi seçer.'],
  ['/admin/makbuzlar', 'Her satır bir makbuzdur; birden çok kalemli makbuzlar tek satırda toplanır. Toplam Tutar\'ı görmek için göz düğmesine basın. F2 her sayfadan yeni makbuz açar.'],
  ['/admin/bagislar', 'Tüm Bağışlar makbuz kalemlerini tek tek listeler. Makbuz numarasıyla ya da bağışçı adıyla arayabilirsiniz.'],
  ['/admin/kampanyalar/sekmeler', 'Sekmeler, sitedeki bağış sayfasında kampanyaların gruplandığı başlıklardır. "Açılışta Göster" açık olan sekme sayfa açılırken seçili gelir.'],
  ['/admin/kampanyalar/', 'Önce kampanya türünü seçin. Sabit Tutar açıksa bağışçı yalnız TL referans tutarını öder. Web / 1 kapalıysa kampanya listelerde görünmez ama bağlantısı çalışır.'],
  ['/admin/kampanyalar', 'Ref. Tutar ve Öncelik kutularını doğrudan değiştirebilirsiniz; kutudan çıkınca kaydedilir. Durum, Web / 1 ve Web / 2 anahtarları da hemen kaydeder.'],
  ['/admin/verilerim', 'Tam yedek arka planda hazırlanır, hazır olunca bildirim gelir ve 7 gün indirilebilir. Ayrılma talebi hiçbir veriyi silmez.'],
  ['/admin/online-bagis', 'Sanal POS\'tan gelen kartlı bağışlar 60 saniyede bir kendiliğinden yenilenir. Makbuz otomatik kesilir, eşleştirme gerekmez.'],
  ['/admin/banka-odeme', 'Banka Hareketleri: bankadan gelen havale/EFT\'ler bağışçıyla eşleştirilir. Eşleşmeyenleri seçip bağışçı ve kampanya atayın.'],
  ['/admin/kurban', 'Kurbanlar: hisseler kampanyalara göre hayvanlara yerleşir. Boş hisseleri otomatik dağıt düğmesi atanmamış hisseleri 7\'li gruplara dağıtır.'],
  ['/admin/sms-listeleri', 'Listeler Bağışçılar ekranından oluşturulur: kişileri seçin → Toplu İşlemler → SMS Listesi Oluştur. Listeye SMS göndermek için satırdaki gönder düğmesine basın.'],
  ['/admin/mail', 'Mail gönderimleri SendGrid üzerinden gider. Tanıtım mailleri yalnız e-posta izni olan bağışçılara gider.'],
  ['/admin/broadcast', 'Kitleyi seçin, metni yazın; sağda kaç kişiye gideceği ve kaç SMS kredisi harcanacağı görünür. İleri tarihe zamanlayabilirsiniz.'],
  ['/admin/raporlar', 'Rapor seçip tarih aralığını değiştirin; tablolar Excel olarak indirilebilir.'],
  ['/admin/users', 'Kullanıcılar ve Roller: her rolün hangi modülü görüp değiştirebileceğini kutucuklarla belirleyin.'],
  ['/admin/aktif-oturumlar', 'Son 5 dakikada panelde hareket eden personel "canlı" görünür. Oturumu Kapat kişinin kayıtlı girişlerini sonlandırır.'],
  ['/admin/muhasebe', 'Ön Muhasebe: gelir-gider kayıtları, kasa ve banka hesapları, cari kartlar ve gelen havaleler.'],
  ['/admin/uygulama-yapici', 'Uygulama Yapıcı: bağışçıların mobil uygulamasını tasarlayın. Telefon önizlemesinde sonucu görün; Yayınla\'ya basana kadar değişiklikler taslak kalır.'],
  ['/admin/site-yapici', 'Site Yapıcı: soldan blok ekleyin, sürükleyerek sıralayın, sağdan içerik ve stil ayarlayın. Yayınla\'ya basana kadar değişiklikler taslak kalır.'],
  ['/admin', 'Anasayfa: günün makbuzları, bekleyen işler ve bağış grafiği. Kartlara tıklayınca ilgili listeye gidersiniz.'],
]

export function helpFor(pathname: string | null): string | undefined {
  if (!pathname) return undefined
  if (pathname === '/admin') return PAGE_HELP.find(([prefix]) => prefix === '/admin')?.[1]
  const hit = PAGE_HELP.find(([prefix]) => {
    if (prefix === '/admin') return false
    if (prefix.endsWith('/')) return pathname.startsWith(prefix)
    return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}-`)
  })
  return hit?.[1]
}
