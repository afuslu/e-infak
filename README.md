# E-İnfak Platform

E-İnfak, STK'lar için online bağış sitesi ve arka ofis otomasyon hizmeti sunan tek kod tabanlı demo platformudur.

## Çalıştırma

```bash
python3 backend/server.py --port 8010
```

## Rotalar

- Şirket sitesi: `http://127.0.0.1:8010/`
- Demo listesi: `http://127.0.0.1:8010/#/demos`
- Örnek bağış sitesi: `http://127.0.0.1:8010/#/demo/rahmet-eli`
- Kurban bağış sayfası: `http://127.0.0.1:8010/#/demo/rahmet-eli/bagis/kurban`
- Admin otomasyon: `http://127.0.0.1:8010/#/admin`
- Bağışçı paneli: `http://127.0.0.1:8010/#/bagisci`

## Kapsam

- E-İnfak kurumsal tanıtım sitesi
- 10 ayrı STK bağış sitesi demosu
- Bağışçı CRM, bağış kaydı, makbuz ve CSV export
- Kurban operasyonu ve otomatik hisse atama
- SMS/mail kuyruğu, banka hareketleri, görevler, rapor ekranları
- Admin içinden yeni müşteri sitesi/tenant oluşturma
- Türkçe karakter uyumlu seed veri ve arayüz

## Not

Bu proje standart Python ve tarayıcı JavaScript'i ile çalışır; harici paket gerektirmez.
