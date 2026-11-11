# E-İnfak V3 — ayrı geliştirme alanı

Bu sürüm üç ayrı tasarıma sahip geliştirme önizlemesidir. Ana sayfalar, kampanya arama ve içerik sayfaları sunucuda oluşturulur; deneme sepeti JavaScript ve tarayıcı depolaması kullanır. Gerçek ödeme, kullanıcı hesabı, veritabanı ve yönetim paneli henüz yoktur. Eski projeden ödeme veya kimlik kodu taşınmamıştır. Bu sürüm canlı bağış kabul etmek için kullanılmaz.

## Tamamlanan önizleme akışları

- Hicret: eğitim fotoğrafları ve yeşil-altın kampanya vitrini.
- Kardeşlik Payı: bordo-krem renkler, özgün sofra illüstrasyonu ve yardım kategorileri.
- İDDEF referanslı ortak bölüm sırası: kampanya vitrini, doğrudan deneme sepetine ekleyen hızlı destek, kategoriler, projeler, kurum tanıtımı, faaliyetler ve şeffaflık.
- E-İnfak: koyu renkli platform tanıtımı ve açıkça örnek olarak işaretlenmiş panel görseli.
- Kuruma göre kampanya arama/filtreleme, proje detayı, hazır veya serbest destek tutarı.
- Kuruma özel deneme sepeti: ekleme, tutar düzenleme, kaldırma, kuruş hassasiyetinde toplam ve sekmeler arası güncelleme.
- Şeffaflık, banka hesapları, gönüllülük, iletişim, SSS ve politika sayfaları. Eksik resmi içerikler açıkça belirtilir; banka hesabı veya izin belgesi uydurulmaz.
- Ödeme sayfası yalnız önizlemedir; kart veya kişisel veri toplanmaz.

## Çalıştırma

Node 22 veya üzeri hedeflenir; ilk kesit Node 20 ile de kontrol edilmiştir. Harici paket kurulumu gerekmez.

```sh
cd v3
npm test
npm run dev
```

- Platform: http://localhost:3100
- Hicret: http://localhost:3100/hicret
- Kardeşlik Payı: http://localhost:3100/kardeslik

Üretim modunda yalnız kayıtlı alan adları kabul edilir. Önizleme yolları yalnız yerel geliştirmede çalışır. Arama motoru indeksleme ve ödeme amaçlı POST istekleri kapalıdır. Çalışma alanı kartları örnek içerik kategorileridir; aktif kampanya veya doğrulanmış faaliyet iddiası değildir.

## Sonraki uygulama dilimleri

1. PostgreSQL migration'ları; kurum, personel yetkileri, kampanya, doğrulanmış bağışçı kimliği ve değişmez sipariş kalemleri.
2. Kampanya/kurumsal içerik yönetimi, ön kayıt ve kurum temaları; gerçek içerikler kurum onayıyla yayımlanır.
3. Ziraat Pay sandbox adaptörü; doğrulanan tutar/para birimi, sipariş kilidi, kalıcı idempotency, atomik bağış ve outbox işlemi.
4. Benzersiz iade operasyonu, belirsiz banka yanıtında sorgulama, muhasebe defteri ve mutabakat.
5. Oturum/tenant izolasyonu, entegrasyon testleri, mobil tarayıcı doğrulaması, yedekten dönüş ve yayın kontrolleri.

`paymentTransition` yalnız durum kurallarını gösteren test edilmiş çekirdektir; imza doğrulaması veya veritabanı kilidi yerine geçmez. Sunucu bu aşamada bu kurallarla gerçek ödeme gerçekleştirmez.
