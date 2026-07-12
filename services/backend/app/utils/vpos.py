import hashlib
import base64
from typing import Dict, Optional
from app.core.config import settings


class VPOSClient:
    """Vakıf Katılım VPOS Client"""
    
    def __init__(
        self,
        merchant_id: str,
        terminal_id: str,
        password: str,
        test_mode: bool = True,
    ):
        self.merchant_id = merchant_id
        self.terminal_id = terminal_id
        self.password = password
        self.test_mode = test_mode
        
        # VPOS URLs
        if test_mode:
            self.gateway_url = "https://test.vakifkatilim.com.tr/VPOS/api/Payment"
            self.threeds_url = "https://test.vakifkatilim.com.tr/VPOS/api/Payment3D"
        else:
            self.gateway_url = "https://vpos.vakifkatilim.com.tr/VPOS/api/Payment"
            self.threeds_url = "https://vpos.vakifkatilim.com.tr/VPOS/api/Payment3D"
    
    def calculate_hash(self, data: str) -> str:
        """Calculate SHA256 hash"""
        hash_str = data + self.password
        hash_bytes = hashlib.sha256(hash_str.encode('utf-8')).digest()
        return base64.b64encode(hash_bytes).decode('utf-8')
    
    def prepare_3d_secure_form(
        self,
        amount_cents: int,
        order_id: str,
        card_number: str,
        card_expiry_month: str,
        card_expiry_year: str,
        card_cvv: str,
        card_holder_name: str,
        success_url: str,
        fail_url: str,
    ) -> Dict:
        """
        Prepare 3D Secure form data
        
        Returns form data to be POSTed to VPOS gateway
        """
        
        # Amount in TL (convert cents to lira with 2 decimals)
        amount = f"{amount_cents / 100:.2f}"
        
        # Prepare hash data
        hash_data = (
            f"{self.merchant_id}"
            f"{self.terminal_id}"
            f"{order_id}"
            f"{amount}"
            f"{success_url}"
            f"{fail_url}"
        )
        
        hash_value = self.calculate_hash(hash_data)
        
        # Form data
        form_data = {
            "MerchantId": self.merchant_id,
            "TerminalId": self.terminal_id,
            "OrderId": order_id,
            "Amount": amount,
            "Currency": "TRY",
            "CardNumber": card_number,
            "CardExpireMonth": card_expiry_month,
            "CardExpireYear": card_expiry_year,
            "CardCvv": card_cvv,
            "CardHolderName": card_holder_name,
            "SuccessUrl": success_url,
            "FailUrl": fail_url,
            "Hash": hash_value,
            "InstallmentCount": "0",  # Tek çekim
            "PaymentType": "Sale",
        }
        
        return {
            "url": self.threeds_url,
            "method": "POST",
            "data": form_data,
        }
    
    def verify_callback_signature(
        self,
        transaction_id: str,
        status: str,
        signature: str,
    ) -> bool:
        """Verify callback signature from VPOS"""
        
        hash_data = f"{self.merchant_id}{self.terminal_id}{transaction_id}{status}"
        expected_hash = self.calculate_hash(hash_data)
        
        return signature == expected_hash
    
    def parse_callback_response(self, callback_data: Dict) -> Dict:
        """Parse VPOS callback response"""
        
        return {
            "success": callback_data.get("Status") == "success",
            "transaction_id": callback_data.get("TransactionId"),
            "order_id": callback_data.get("OrderId"),
            "amount": callback_data.get("Amount"),
            "message": callback_data.get("Message"),
            "card_last_4": callback_data.get("CardLast4"),
            "card_brand": callback_data.get("CardBrand"),
        }


def get_vpos_client(organization_config: Optional[Dict] = None) -> VPOSClient:
    """Get VPOS client with organization or default config"""
    
    if organization_config:
        return VPOSClient(
            merchant_id=organization_config.get("vpos_merchant_id"),
            terminal_id=organization_config.get("vpos_terminal_id"),
            password=organization_config.get("vpos_password"),
            test_mode=settings.VPOS_TEST_MODE,
        )
    
    return VPOSClient(
        merchant_id=settings.VPOS_MERCHANT_ID,
        terminal_id=settings.VPOS_TERMINAL_ID,
        password=settings.VPOS_PASSWORD,
        test_mode=settings.VPOS_TEST_MODE,
    )
