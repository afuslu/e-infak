# E-İnfak Canlıya Çıkış Kontrol Listesi

## Teknik

- Domain DNS kayıtları müşteri alan adına yönlendirildi.
- SSL sertifikası aktif.
- `EINFAK_DB_PATH` kalıcı disk üzerinde.
- Günlük veritabanı yedeği planlandı.
- Admin kullanıcıları ve roller gerçek kişilerle değiştirildi.
- Test bağış kayıtları temizlendi.

## Ödeme

- Sanal POS sağlayıcı bilgileri girildi.
- Webhook secret doğrulaması aktif.
- Başarılı, başarısız ve iptal ödeme senaryoları test edildi.
- Makbuz numarası sıralaması kurum bazında kontrol edildi.

## İletişim

- SMS sağlayıcı anahtarı girildi.
- E-posta SMTP bilgileri girildi.
- Kurban kesildi, makbuz, düzenli bağış ve banka eşleşti şablonları onaylandı.

## Hukuki

- KVKK aydınlatma metni eklendi.
- Açık rıza metni eklendi.
- Çerez metni eklendi.
- Bağış şartları ve iade/iptal metinleri eklendi.

## Kabul Testleri

- Mobilde bağış formu tamamlandı.
- Kurban bağışı otomatik hisseye düştü.
- Makbuz sayfası açıldı.
- Admin panelde bağış, bağışçı ve kampanya göründü.
- Yeni tenant/site oluşturma akışı çalıştı.
- CSV export indirildi.
