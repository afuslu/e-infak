# e-İnfak Mobil Uygulaması (iOS & Android)

Tek uygulamada **rol bazlı** mimari:
- **Bağışçı / Kullanıcı Paneli:** Kampanyalar, 3D Secure bağış WebView, Zekât hesaplayıcı, Bağış geçmişi ve Hesap silme.
- **Yönetim & Saha Paneli (Admin/Personel):** Giriş yapan kullanıcı yönetici/personel yetkisine sahipse otomatik olarak **Yönetim** sekmesi açılır (Günlük/Aylık özet, Bekleyen havaleler, Açık görevler).

## Kurulum ve Geliştirme

```bash
cd apps/mobile
npm install
EXPO_PUBLIC_API_URL=https://api.e-infak.org/api/v1 EXPO_PUBLIC_WEB_URL=https://e-infak.org npx expo start
```

## Google Play Store & Apple App Store Derlemesi (EAS Build)

```bash
npm install -g eas-cli
eas login
eas build:configure

# Android (.aab - Play Store)
eas build --platform android --profile production

# iOS (.ipa - App Store)
eas build --platform ios --profile production
```
