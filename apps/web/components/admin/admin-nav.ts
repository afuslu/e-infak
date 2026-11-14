import {
  ArrowDownToLine, BarChart3, Beef, Blocks, BookOpen, Calculator, CalendarDays, Coins, Droplets, FileUp, Film,
  FolderOpen, Globe2, GraduationCap, HandCoins, HandHelping, HeartHandshake, History, Home, IdCard, KeyRound,
  Landmark, LayoutDashboard, LogIn, type LucideIcon, MailPlus, Megaphone, MessagesSquare, Newspaper, Package,
  PackageCheck, PiggyBank, Plug, Receipt, Repeat, Scale, Send, Settings, ShieldCheck, Sparkles, Tags, Users, Wallet,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  feature?: string
  permission?: string
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// `feature`: package module (app/core/plans.py); `permission`: staff permission (app/api/deps.py).
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'genel', label: 'Genel', items: [
      { href: '/admin', label: 'Genel Bakış', icon: LayoutDashboard },
      { href: '/admin/raporlar', label: 'Raporlar', icon: BarChart3, feature: 'reports_basic', permission: 'report_read' },
      { href: '/admin/ai', label: 'AI Öngörüleri', icon: Sparkles, feature: 'reports_basic', permission: 'report_read' },
      { href: '/admin/gorevler', label: 'Görevler & Takvim', icon: CalendarDays, feature: 'tasks' },
    ],
  },
  {
    key: 'bagis', label: 'Bağış', items: [
      { href: '/admin/bagislar', label: 'Bağışlar', icon: HandCoins },
      { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: Megaphone },
      { href: '/admin/bagis-kalemleri', label: 'Bağış Kalemleri', icon: Tags },
      { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: Repeat, feature: 'recurring' },
      { href: '/admin/makbuzlar', label: 'Makbuzlar', icon: Receipt, feature: 'receipts' },
      { href: '/admin/makbuz-kocanlari', label: 'Makbuz Koçanları', icon: BookOpen, feature: 'receipts' },
      { href: '/admin/zakat', label: 'Zekât Ayarları', icon: Coins },
    ],
  },
  {
    key: 'kisiler', label: 'Bağışçılar & Üyeler', items: [
      { href: '/admin/bagiscilar', label: 'Bağışçılar (CRM)', icon: Users, feature: 'donor_crm' },
      { href: '/admin/uyeler', label: 'Üyeler & Aidat', icon: IdCard, feature: 'membership' },
      { href: '/admin/gonulluler', label: 'Gönüllü Başvuruları', icon: HandHelping, feature: 'website' },
      { href: '/admin/veri-aktarma', label: "Excel'den Aktarım", icon: FileUp, feature: 'donor_crm' },
    ],
  },
  {
    key: 'finans', label: 'Finans', items: [
      { href: '/admin/finance', label: 'Kasa & Giderler', icon: Wallet },
      { href: '/admin/muhasebe', label: 'Muhasebe', icon: Calculator, feature: 'accounting' },
      { href: '/admin/gelen-havaleler', label: 'Gelen Havaleler', icon: ArrowDownToLine, feature: 'bank_transactions' },
      { href: '/admin/banka-hesaplari', label: 'Banka Hesapları', icon: Landmark, feature: 'bank_transactions' },
      { href: '/admin/reconciliation', label: 'Banka Mutabakatı', icon: Scale, feature: 'bank_transactions' },
    ],
  },
  {
    key: 'saha', label: 'Saha & Organizasyon', items: [
      { href: '/admin/kurban', label: 'Kurban Organizasyonu', icon: Beef, feature: 'kurban' },
      { href: '/admin/sponsorluk', label: 'Sponsorluk & Burs', icon: HeartHandshake, feature: 'sponsorship' },
      { href: '/admin/students', label: 'Hafızlık Öğrencileri', icon: GraduationCap, feature: 'education' },
      { href: '/admin/wells', label: 'Su Kuyuları', icon: Droplets, feature: 'water_well' },
      { href: '/admin/kumbara', label: 'Kumbaralar', icon: PiggyBank, feature: 'money_box' },
      { href: '/admin/kumanya', label: 'Kumanya Dağıtım', icon: Package, feature: 'food_aid' },
      { href: '/admin/yoksul-takip', label: 'Yoksul Takibi', icon: Home, feature: 'poverty_tracking' },
    ],
  },
  {
    key: 'site', label: 'Web Sitesi', items: [
      { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: Blocks, permission: 'content_manage' },
      { href: '/admin/icerikler', label: 'Haber & Blog', icon: Newspaper, feature: 'website' },
      { href: '/admin/galeri', label: 'Foto & Video Galeri', icon: Film, feature: 'website' },
      { href: '/admin/medya', label: 'Medya Kütüphanesi', icon: FolderOpen, permission: 'content_manage' },
    ],
  },
  {
    key: 'iletisim', label: 'İletişim', items: [
      { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: MessagesSquare, feature: 'sms' },
      { href: '/admin/sms-gonderimleri', label: 'SMS Gönderimleri', icon: Send, feature: 'sms' },
      { href: '/admin/sms', label: 'SMS Şablonları', icon: MailPlus, feature: 'sms' },
    ],
  },
  {
    key: 'ayarlar', label: 'Ayarlar', items: [
      { href: '/admin/site-ayarlari', label: 'Site Ayarları', icon: Settings, permission: 'settings_manage' },
      { href: '/admin/odeme-sms', label: 'Ödeme & SMS Hesapları', icon: KeyRound, permission: 'settings_manage' },
      { href: '/admin/integrations', label: 'API & Webhook', icon: Plug, permission: 'settings_manage' },
      { href: '/admin/users', label: 'Personel & Yetkiler', icon: ShieldCheck, feature: 'roles' },
      { href: '/admin/ip-kurallari', label: 'IP İzinleri & Engelleri', icon: Globe2, permission: 'settings_manage' },
      { href: '/admin/giris-kayitlari', label: 'Giriş Kayıtları', icon: LogIn, permission: 'settings_manage' },
      { href: '/admin/islem-kayitlari', label: 'İşlem Kayıtları', icon: History, permission: 'settings_manage' },
      { href: '/admin/kurlar', label: 'Döviz & Altın Kurları', icon: Coins },
      { href: '/admin/paket', label: 'Paket & Kullanım', icon: PackageCheck },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function navItemFor(pathname: string | null) {
  if (!pathname) return undefined
  if (pathname === '/admin') return NAV_ITEMS[0]
  return NAV_ITEMS
    .filter((item) => item.href !== '/admin' && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

export const groupOf = (item?: NavItem) => (item ? NAV_GROUPS.find((group) => group.items.includes(item)) : undefined)

/** Search key: lower case without Turkish diacritics, so "bagis" finds "Bağış". */
export const searchKey = (text: string) =>
  text.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
