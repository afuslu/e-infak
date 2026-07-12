import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_sms(phone: str, message: str) -> bool:
    """
    Sends SMS using Netgsm API. Falls back to logging the SMS in development mode.
    """
    # Clean phone number (remove spaces, leading zeros, etc.)
    cleaned_phone = "".join(filter(str.isdigit, phone))
    # Standardize to Turkish phone format without leading zero/country code prefix if not needed
    if len(cleaned_phone) == 11 and cleaned_phone.startswith("0"):
        cleaned_phone = cleaned_phone[1:]
    elif len(cleaned_phone) == 12 and cleaned_phone.startswith("90"):
        cleaned_phone = cleaned_phone[2:]
        
    logger.info(f"📱 SMS Gönderiliyor -> {phone}: {message}")
    
    # Check if Netgsm credentials are set
    if settings.NETGSM_USERNAME and settings.NETGSM_PASSWORD:
        url = "https://api.netgsm.com.tr/sms/send/get"
        params = {
            "usercode": settings.NETGSM_USERNAME,
            "password": settings.NETGSM_PASSWORD,
            "gsmno": cleaned_phone,
            "message": message,
            "msgheader": settings.NETGSM_SENDER or "EINFAK",
            "dil": "TR"
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                if response.status_code == 200 and "00" in response.text:
                    logger.info(f"✅ SMS başarıyla gönderildi: {response.text}")
                    return True
                else:
                    logger.error(f"❌ SMS gönderimi başarısız. Netgsm Yanıtı: {response.text}")
        except Exception as e:
            logger.error(f"❌ SMS API hatası: {str(e)}")
            
    # Dev mode fallback
    print(f"\n=======================================================")
    print(f"📱 MOCK SMS GÖNDERİLDİ")
    print(f"Alıcı: +90 {cleaned_phone}")
    print(f"Mesaj: {message}")
    print(f"=======================================================\n")
    return True
