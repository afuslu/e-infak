# e-İnfak Yönetim (iOS & Android)

Kurum yetkilileri için yönetim uygulaması. HAKDER, Hicret Derneği ve platformdaki her kurumun personeli kendi
hesabıyla girer; kurum hesaptan otomatik belirlenir ve yalnızca kendi kurumunun verisini, kendi yetkileri ölçüsünde görür.
Mevcut backend API'sini ve yetki sistemini kullanır (`/api/v1/admin-features/...`, `/api/v1/mobile/...`).

## Ekranlar

- **Genel bakış:** canlı "Bugün gelen para" kartı (kanal kanal, saatlik grafik, bekleyen havale), KPI'lar, kampanya ilerlemesi.
- **Bağışlar:** arama, filtre, ayrıntı, elle makbuz, iptal, ödendi işaretleme, makbuz PDF, SMS / WhatsApp.
- **Bağışçılar:** liste, kart, düzenleme, notlar, SMS geçmişi.
- **Para girişleri:** bugün / hafta / ay, online (sanal POS), havale, nakit, POS, kumbara, aidat, SMS kanalları; 30 sn'de bir yenilenir.
- **Bekleyen havaleler:** önerilen bağışçı ve kalemle tek dokunuşla onay ya da yok sayma.
- **Bildirimler:** ayrıntılı bildirim kutusu ve kişi bazlı ayarlar (kanal kanal aç/kapa, en az tutar, gece sessiz, gün sonu özeti).
- **Saha:** kumbara (QR okutma, tahsilat), görevler.
- **İletişim ve raporlar:** toplu SMS, SMS gönderimleri, raporlar.
- **Üyeler ve düzenli ödemeler.**
- **Ayarlar:** kurum ayarları, kullanıcılar / roller / birimler, ödeme ve SMS sağlayıcıları, hesabım.
- **Ana ekran widget'ı:** iOS (küçük, orta, kilit ekranı) ve Android: bugün gelen para.

Menü ve düğmeler, web panelindeki paket özelliği + yetki modülü kurallarıyla gösterilir / gizlenir (`src/lib/access.ts`).

## Bildirimler nasıl çalışır?

Para girişi olan her noktada (online ödeme, havale onayı ve otomatik eşleşme, elle makbuz, kumbara, aidat, SMS bağışı,
başarısız ödeme, iade, eşleşmeyen havale) backend aynı işlemin içinde bir `push.*` olayı kuyruğa yazar
(`services/backend/app/services/staff_notify.py`). Olay commit'ten hemen sonra Celery işçisine verilir. Dakikalık kuyruk
işleyicisi de yedek görevi görür. Her yetkiliye bir bildirim kutusu satırı yazılır, ayarları izin veriyorsa telefona
push (Expo) gider. Gün sonu özeti her akşam 21:00'de gönderilir.

## Geliştirme

```bash
cd apps/mobile
npm install --workspaces=false   # kök package.json'daki workspaces nedeniyle gerekli
```

**Tarayıcıda (yerel backend ile):** `.env.local` içine

```
EXPO_PUBLIC_DEV_PROXY=1
DEV_API_TARGET=http://127.0.0.1:8000
```

yazıp `npm run web`. Metro içindeki küçük vekil (`metro.config.js`) istekleri `Host: e-infak.org` ile backend'e iletir;
böylece canlıdaki "platform adresi + token'dan kurum" çözümlemesi yerelde de denenir.

**Android emülatöründe:** `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1 npx expo start` ve ardından
`npx expo run:android` (ilk derleme uzun sürer). `android/` ve `ios/` klasörleri üretilir; git'e ve EAS'e gitmez.

Kamera (QR), biyometri, push ve widget'lar Expo Go'da ve tarayıcıda çalışmaz; geliştirme derlemesi gerekir.

## Mağaza derlemesi (EAS)

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

- Paket kimliği (`org.einfak.app`), EAS projesi ve sürüm numaraları `app.json` / `eas.json` içindedir.
- iOS widget'ı ayrı bir uzantıdır (`org.einfak.app.ExpoWidgetsTarget`) ve `group.org.einfak.app` App Group'unu kullanır.
  `expo-widgets` eklentisi bunu EAS'e kendisi bildirir; ilk iOS derlemesinde EAS yeni kimlik bilgilerini oluşturmak için
  Apple hesabıyla onay ister.
- Android widget'ı `react-native-android-widget` ile gelir. Uygulama açıkken anında, kapalıyken 30 dakikada bir yenilenir.
