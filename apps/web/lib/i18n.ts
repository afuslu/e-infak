export type Language = 'TR' | 'EN' | 'AR'
export type Currency = 'TRY' | 'USD' | 'EUR'

export const translations = {
  TR: {
    quickDonation: 'Hızlı Bağış',
    personalInfo: 'Kişisel Bilgiler',
    paymentInfo: 'Ödeme Bilgileri',
    amount: 'Tutar',
    next: 'Devam Et',
    back: 'Geri Git',
    donateNow: 'Hemen Destek Ol',
    bankTransfer: 'Havale / EFT',
    creditCard: 'Kredi Kartı',
    donorPortal: 'Bağışçı Portalı',
    parentPortal: 'Veli Takip Sistemi',
    zekatCalc: 'Zekat Hesaplama',
    wellDone: 'Bağışınız Kabul Olsun!',
    currencySign: '₺',
    language: 'Dil',
    currency: 'Para Birimi',
    memorized: 'Ezberlenen Sayfalar',
    currentSurah: 'Güncel Cüz / Sure'
  },
  EN: {
    quickDonation: 'Quick Donation',
    personalInfo: 'Personal Info',
    paymentInfo: 'Payment Details',
    amount: 'Amount',
    next: 'Continue',
    back: 'Back',
    donateNow: 'Donate Now',
    bankTransfer: 'Bank Transfer',
    creditCard: 'Credit Card',
    donorPortal: 'Donor Portal',
    parentPortal: 'Parent Portal',
    zekatCalc: 'Zakat Calculator',
    wellDone: 'Thank you for your donation!',
    currencySign: '$',
    language: 'Language',
    currency: 'Currency',
    memorized: 'Memorized Pages',
    currentSurah: 'Current Juz / Surah'
  },
  AR: {
    quickDonation: 'تبرع سريع',
    personalInfo: 'معلومات شخصية',
    paymentInfo: 'تفاصيل الدفع',
    amount: 'قيمة التبرع',
    next: 'متابعة',
    back: 'رجوع',
    donateNow: 'تبرع الآن',
    bankTransfer: 'تحويل بنكي',
    creditCard: 'بطاقة ائتمان',
    donorPortal: 'بوابة المتبرع',
    parentPortal: 'بوابة أولياء الأمور',
    zekatCalc: 'حساب الزكاة',
    wellDone: 'تقبل الله تبرعاتكم!',
    currencySign: '$',
    language: 'اللغة',
    currency: 'العملة',
    memorized: 'الصفحات المحفوظة',
    currentSurah: 'الجزء / السورة الحالية'
  }
}

// Exchange rates are deliberately not guessed. Amount conversion must come
// from a tenant-approved rate provider before non-TRY checkout is enabled.
