export type PortalLang = 'tr' | 'en' | 'ar' | 'de'

export const PORTAL_LANGS: { code: PortalLang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'tr', label: 'TR', dir: 'ltr' },
  { code: 'en', label: 'EN', dir: 'ltr' },
  { code: 'ar', label: 'AR', dir: 'rtl' },
  { code: 'de', label: 'DE', dir: 'ltr' },
]

export const PORTAL_STRINGS: Record<PortalLang, {
  panelTitle: string
  hello: string
  defaultDonor: string
  logout: string
  donateNow: string
  menu: string
  notifications: string
  markAllRead: string
  noNotifications: string
  tabs: Record<string, string>
  nav: { home: string; news: string; donate: string; cart: string; more: string }
  login: {
    subtitle: string
    smsTab: string
    emailTab: string
    phoneLabel: string
    emailLabel: string
    rememberMe: string
    sendCode: string
    sending: string
    signIn: string
    verifying: string
  }
  mapSatellite: string
}> = {
  tr: {
    panelTitle: 'Bağışçı Paneli',
    hello: 'Merhaba',
    defaultDonor: 'Değerli Bağışçı',
    logout: 'Çıkış',
    donateNow: 'Bağış Yap',
    menu: 'Menü',
    notifications: 'Bildirimler',
    markAllRead: 'Tümünü okundu işaretle',
    noNotifications: 'Yeni bildiriminiz bulunmuyor.',
    tabs: {
      ozet: 'Özet',
      bagislar: 'Bağışlarım',
      ustlendiklerim: 'Üstlendiklerim',
      'su-kuyularim': 'Su Kuyularım',
      projelerim: 'Projelerim',
      talimatlarim: 'Talimatlarım',
      kartlarim: 'Kayıtlı Kartlarım',
      zekat: 'Zekât & İbadet',
      taleplerim: 'Destek & Talepler',
      uyelik: 'Üyelik & Aidat',
      odemeler: 'Ödemeler',
      ayarlar: 'Ayarlar',
    },
    nav: { home: 'Anasayfa', news: 'Haberler', donate: 'Bağış Yap', cart: 'Bağış Sepeti', more: 'Daha Fazla' },
    login: {
      subtitle: 'Bağışlarınızı, makbuzlarınızı, kurban videolarınızı ve sponsorluklarınızı tek yerden takip edin.',
      smsTab: 'SMS ile Giriş',
      emailTab: 'E-posta ile Giriş',
      phoneLabel: 'Telefon numaranız',
      emailLabel: 'E-posta adresiniz',
      rememberMe: 'Bu cihazda oturumumu açık tut',
      sendCode: 'Giriş kodu gönder',
      sending: 'Gönderiliyor…',
      signIn: 'Giriş yap',
      verifying: 'Doğrulanıyor…',
    },
    mapSatellite: 'Haritada Gör (Uydu)',
  },
  en: {
    panelTitle: 'Donor Portal',
    hello: 'Hello',
    defaultDonor: 'Valued Donor',
    logout: 'Sign Out',
    donateNow: 'Donate',
    menu: 'Menu',
    notifications: 'Notifications',
    markAllRead: 'Mark all read',
    noNotifications: 'You have no new notifications.',
    tabs: {
      ozet: 'Overview',
      bagislar: 'My Donations',
      ustlendiklerim: 'Sponsorships',
      'su-kuyularim': 'Water Wells',
      projelerim: 'My Projects',
      talimatlarim: 'Recurring',
      kartlarim: 'Saved Cards',
      zekat: 'Zakat & Calendar',
      taleplerim: 'Support & Requests',
      uyelik: 'Membership',
      odemeler: 'Payments',
      ayarlar: 'Settings',
    },
    nav: { home: 'Home', news: 'News', donate: 'Donate', cart: 'Cart', more: 'More' },
    login: {
      subtitle: 'Track your donations, receipts, Qurbani videos, and sponsorships in one place.',
      smsTab: 'Sign in with SMS',
      emailTab: 'Sign in with Email',
      phoneLabel: 'Phone number',
      emailLabel: 'Email address',
      rememberMe: 'Keep me signed in on this device',
      sendCode: 'Send login code',
      sending: 'Sending…',
      signIn: 'Sign in',
      verifying: 'Verifying…',
    },
    mapSatellite: 'View on Map (Satellite)',
  },
  ar: {
    panelTitle: 'بوابة المتبرع',
    hello: 'مرحباً',
    defaultDonor: 'متبرعنا الكريم',
    logout: 'تسجيل الخروج',
    donateNow: 'تبرع الآن',
    menu: 'القائمة',
    notifications: 'الإشعارات',
    markAllRead: 'تحديد الكل كمقروء',
    noNotifications: 'لا توجد إشعارات جديدة.',
    tabs: {
      ozet: 'الملخص',
      bagislar: 'تبرعاتي',
      ustlendiklerim: 'كفالاتي',
      'su-kuyularim': 'آبار المياه',
      projelerim: 'مشاريعي',
      talimatlarim: 'التبرع الدوري',
      kartlarim: 'بطاقاتي',
      zekat: 'الزكاة والصدقة',
      taleplerim: 'الدعم والطلبات',
      uyelik: 'العضوية',
      odemeler: 'المدفوعات',
      ayarlar: 'الإعدادات',
    },
    nav: { home: 'الرئيسية', news: 'الأخبار', donate: 'تبرع', cart: 'السلة', more: 'المزيد' },
    login: {
      subtitle: 'تابع تبرعاتك وإيصالاتك وفيديوهات الأضاحي وكفالاتك من مكان واحد.',
      smsTab: 'دخول عبر SMS',
      emailTab: 'دخول عبر البريد',
      phoneLabel: 'رقم الهاتف',
      emailLabel: 'البريد الإلكتروني',
      rememberMe: 'إبقاء الجلسة مفتوحة على هذا الجهاز',
      sendCode: 'إرسال رمز الدخول',
      sending: 'جاري الإرسال…',
      signIn: 'تسجيل الدخول',
      verifying: 'جاري التحقق…',
    },
    mapSatellite: 'عرض على الخريطة (قمر صناعي)',
  },
  de: {
    panelTitle: 'Spenderportal',
    hello: 'Hallo',
    defaultDonor: 'Geschätzter Spender',
    logout: 'Abmelden',
    donateNow: 'Spenden',
    menu: 'Menü',
    notifications: 'Benachrichtigungen',
    markAllRead: 'Alle als gelesen markieren',
    noNotifications: 'Keine neuen Benachrichtigungen.',
    tabs: {
      ozet: 'Übersicht',
      bagislar: 'Meine Spenden',
      ustlendiklerim: 'Patenschaften',
      'su-kuyularim': 'Wasserbrunnen',
      projelerim: 'Meine Projekte',
      talimatlarim: 'Daueraufträge',
      kartlarim: 'Gespeicherte Karten',
      zekat: 'Zakat & Kalender',
      taleplerim: 'Support & Anfragen',
      uyelik: 'Mitgliedschaft',
      odemeler: 'Zahlungen',
      ayarlar: 'Einstellungen',
    },
    nav: { home: 'Start', news: 'News', donate: 'Spenden', cart: 'Warenkorb', more: 'Mehr' },
    login: {
      subtitle: 'Verfolgen Sie Ihre Spenden, Quittungen, Kurban-Videos und Patenschaften an einem Ort.',
      smsTab: 'Per SMS anmelden',
      emailTab: 'Per E-Mail anmelden',
      phoneLabel: 'Telefonnummer',
      emailLabel: 'E-Mail-Adresse',
      rememberMe: 'Auf diesem Gerät angemeldet bleiben',
      sendCode: 'Code senden',
      sending: 'Wird gesendet…',
      signIn: 'Anmelden',
      verifying: 'Wird geprüft…',
    },
    mapSatellite: 'Auf Karte ansehen (Satellit)',
  },
}
