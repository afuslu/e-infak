import base64
import hashlib
import random
import string
from typing import Any, Dict


class VakifKatilimVPOS:
    """
    Vakıf Katılım bankası ve Mock ödeme geçidi için 3D Secure / 3D Pay
    entegrasyonunu yöneten yardımcı sınıf.
    """

    @staticmethod
    def calculate_hash(data_str: str, store_key: str) -> str:
        """
        Vakıf Katılım/NestPay standartlarına uygun SHA-256 Base64 imzasını hesaplar.
        """
        concatenated = data_str + store_key
        sha256_hash = hashlib.sha256(concatenated.encode("utf-8")).digest()
        return base64.b64encode(sha256_hash).decode("utf-8")

    @classmethod
    def prepare_3d_form_data(
        cls,
        org: Dict[str, Any],
        order_id: str,
        amount: float,
        card_name: str,
        pan: str,
        expiry: str,
        cv2: str,
        success_url: str,
        fail_url: str,
    ) -> Dict[str, Any]:
        """
        Vakıf Katılım 3D Secure Gateway yönlendirmesi için HTML form verilerini hazırlar.
        Eğer provider 'mock' ise, simülasyon geçidi için form verisi hazırlar.
        """
        provider = org.get("vposProvider", "mock")
        client_id = org.get("vposClientId") or "MOCK_MERCHANT"
        store_key = org.get("vposStoreKey") or "MOCK_STORE_KEY"
        test_mode = org.get("vposTestMode", 1)

        # Tutar formatı: "10.00" gibi iki basamaklı kuruş formatında olmalıdır.
        amount_str = f"{amount:.2f}"

        # 3D Secure için benzersiz rastgele bir değer üretilir.
        rnd = "".join(random.choices(string.ascii_letters + string.digits, k=20))

        # Yönlendirilecek banka VPOS adresi
        if provider == "vakifkatilim":
            if test_mode:
                # Vakıf Katılım test ortamı adresi
                gateway_url = "https://vpos.vakifkatilim.com.tr/lpos/shg/3dSecurePay"
            else:
                # Vakıf Katılım canlı ortam adresi
                gateway_url = "https://vpos.vakifkatilim.com.tr/lpos/shg/3dSecurePay"  # Vakıf Katılım Canlı 3D URL'si
        else:
            # Yerel Simülatör Adresi
            gateway_url = "/api/mock-vpos-gate"

        # NestPay/Vakıf Katılım 3D Pay Modeli İmza Sıralaması:
        # clientid + oid + amount + okUrl + failUrl + storetype + rnd + storekey
        store_type = "3d_pay"
        hash_data_str = f"{client_id}{order_id}{amount_str}{success_url}{fail_url}{store_type}{rnd}"
        calculated_signature = cls.calculate_hash(hash_data_str, store_key)

        form_inputs = {
            "clientid": client_id,
            "oid": order_id,
            "amount": amount_str,
            "okUrl": success_url,
            "failUrl": fail_url,
            "rnd": rnd,
            "hash": calculated_signature,
            "storetype": store_type,
            "currency": "949",  # TRY numeric code
            "lang": "tr",
            "txntype": "Auth",
            "pan": pan.replace(" ", "").strip(),
            "cv2": cv2.strip(),
            "Epiry": expiry.replace("/", "").strip(),  # NestPay / Vakıf Katılım parametresi: Epiry (Expiry)
            # Kart sahibi adı
            "card_name": card_name,
        }

        return {
            "gatewayUrl": gateway_url,
            "inputs": form_inputs,
            "provider": provider,
        }

    @classmethod
    def verify_callback_signature(cls, params: Dict[str, Any], store_key: str) -> bool:
        """
        Bankadan geri dönüş callback çağrısında (okUrl veya failUrl)
        iletilen hash imzasının doğruluğunu kontrol eder.
        """
        # Bankanın gönderdiği hash değeri
        bank_hash = params.get("HASH")
        if not bank_hash:
            return False

        # NestPay dinamik hash parametreleri doğrulama akışı (HASHPARAMS ve HASHPARAMSVAL kullanır)
        hash_params = params.get("HASHPARAMS")
        hash_params_val = params.get("HASHPARAMSVAL")

        if hash_params and hash_params_val is not None:
            # Parametre değerlerini ve store_key'i birleştirip hash oluşturur
            calculated = cls.calculate_hash(hash_params_val, store_key)
            return calculated == bank_hash

        # Alternatif olarak standart NestPay dönüş imza parametre sıralaması:
        # HASHPARAMS gönderilmemişse, aşağıdaki standart sırayla birleştirip doğrularız:
        # clientid + oid + authcode + err + response + mdStatus + storekey
        client_id = params.get("clientid", "")
        oid = params.get("oid", "")
        auth_code = params.get("authcode", "")
        err = params.get("err", "")
        response = params.get("response", "")
        md_status = params.get("mdStatus", "")

        fallback_str = f"{client_id}{oid}{auth_code}{err}{response}{md_status}"
        calculated_fallback = cls.calculate_hash(fallback_str, store_key)
        return calculated_fallback == bank_hash
