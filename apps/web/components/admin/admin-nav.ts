import {
  ArrowDownToLine, BarChart3, BellRing, Beef, Blocks, BookOpen, Calculator, CalendarDays, Coins, Droplets, FileUp, Film,
  FolderOpen, Globe2, GraduationCap, HandCoins, HandHelping, HeartHandshake, History, Home, IdCard, KeyRound,
  Landmark, LayoutDashboard, LifeBuoy, LogIn, type LucideIcon, MailPlus, Megaphone, MessagesSquare, Newspaper, Package,
  MessageSquareText, PackageCheck, PhoneCall, PiggyBank, Plug, Repeat, Send, Settings, ShieldCheck, Sparkles, Tags, Users, Video,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  feature?: string
  permission?: string
  /** Module (capability group, app/core/capabilities.py) the page belongs to. */
  module?: string | string[]
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
      { href: '/admin/raporlar', label: 'Raporlar', icon: BarChart3, feature: 'reports_basic', module: 'reports' },
      { href: '/admin/ai', label: 'AI Öngörüleri', icon: Sparkles, feature: 'reports_basic', module: ['reports', 'donors'] },
      { href: '/admin/gorevler', label: 'Görevler & Takvim', icon: CalendarDays, feature: 'tasks' },
      { href: '/admin/hatirlatici', label: 'Hatırlatıcı', icon: BellRing },
    ],
  },
  {
    key: 'bagis', label: 'Bağış', items: [
      { href: '/admin/bagislar', label: 'Bağışlar', icon: HandCoins, module: 'receipts' },
      { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: Megaphone, module: 'site' },
      { href: '/admin/bagis-kalemleri', label: 'Bağış Kalemleri', icon: Tags, module: 'site' },
      { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: Repeat, feature: 'recurring', module: ['finance', 'donors', 'receipts'] },
      { href: '/admin/makbuz-kocanlari', label: 'Makbuz Koçanları', icon: BookOpen, feature: 'receipts', module: ['receipts', 'finance'] },
      { href: '/admin/zakat', label: 'Zekât Ayarları', icon: Coins, module: ['finance', 'settings', 'site'] },
    ],
  },
  {
    key: 'kisiler', label: 'Bağışçılar & Üyeler', items: [
      { href: '/admin/bagiscilar', label: 'Bağışçılar (CRM)', icon: Users, feature: 'donor_crm', module: 'donors' },
      { href: '/admin/uyeler', label: 'Üyeler & Aidat', icon: IdCard, feature: 'membership', module: 'members' },
      { href: '/admin/gonulluler', label: 'Gönüllü Başvuruları', icon: HandHelping, feature: 'website', module: ['site', 'donors'] },
      { href: '/admin/veri-aktarma', label: "Excel'den Aktarım", icon: FileUp, feature: 'donor_crm', module: 'donors' },
    ],
  },
  {
    key: 'finans', label: 'Finans', items: [
      { href: '/admin/muhasebe', label: 'Ön Muhasebe', icon: Calculator, module: ['finance', 'bank'] },
      { href: '/admin/banka-odeme', label: 'Banka & Ödeme', icon: Landmark, module: ['bank', 'settings'] },
      { href: '/admin/sms-bagislari', label: 'SMS Bağışları', icon: MessageSquareText, feature: 'sms_donation', module: ['receipts', 'bank'] },
    ],
  },
  {
    key: 'saha', label: 'Saha & Organizasyon', items: [
      { href: '/admin/kurban', label: 'Kurban Organizasyonu', icon: Beef, feature: 'kurban', module: 'kurban' },
      { href: '/admin/sponsorluk', label: 'Sponsorluk & Burs', icon: HeartHandshake, feature: 'sponsorship', module: 'operations' },
      { href: '/admin/wells', label: 'Su Kuyuları', icon: Droplets, feature: 'water_well', module: 'operations' },
      { href: '/admin/kumbara', label: 'Kumbaralar', icon: PiggyBank, feature: 'money_box', module: 'operations' },
      { href: '/admin/yoksul-takip', label: 'Sosyal Yardım & Kumanya', icon: Home, feature: 'poverty_tracking', module: 'operations' },
      { href: '/admin/videolar', label: 'Bağış Videoları', icon: Video, feature: 'donation_video', module: ['kurban', 'receipts'] },
    ],
  },
  {
    key: 'site', label: 'Web Sitesi', items: [
      { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: Blocks, module: 'site' },
      { href: '/admin/icerikler', label: 'Haber & Blog', icon: Newspaper, feature: 'website', module: 'site' },
      { href: '/admin/galeri', label: 'Foto & Video Galeri', icon: Film, feature: 'website', module: 'site' },
      { href: '/admin/medya', label: 'Medya Kütüphanesi', icon: FolderOpen, module: 'site' },
    ],
  },
  {
    key: 'iletisim', label: 'İletişim', items: [
      { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: MessagesSquare, feature: 'sms', module: 'sms' },
      { href: '/admin/sms-gonderimleri', label: 'SMS Gönderimleri', icon: Send, feature: 'sms', module: 'sms' },
      { href: '/admin/sms', label: 'SMS Şablonları', icon: MailPlus, feature: 'sms', module: 'sms' },
      { href: '/admin/whatsapp', label: 'WhatsApp Business', icon: MessagesSquare, feature: 'whatsapp', module: 'sms' },
      { href: '/admin/cagri-merkezi', label: 'Çağrı Merkezi', icon: PhoneCall, feature: 'call_center', module: ['donors', 'sms'] },
    ],
  },
  {
    key: 'ayarlar', label: 'Ayarlar', items: [
      { href: '/admin/site-ayarlari', label: 'Site Ayarları', icon: Settings, module: 'settings' },
      { href: '/admin/odeme-sms', label: 'Ödeme & SMS Hesapları', icon: KeyRound, module: 'settings' },
      { href: '/admin/integrations', label: 'API & Webhook', icon: Plug, module: 'settings' },
      { href: '/admin/users', label: 'Personel & Yetkiler', icon: ShieldCheck, feature: 'roles', module: 'users' },
      { href: '/admin/ip-kurallari', label: 'IP İzinleri & Engelleri', icon: Globe2, module: ['settings', 'users'] },
      { href: '/admin/giris-kayitlari', label: 'Giriş Kayıtları', icon: LogIn, module: ['settings', 'users'] },
      { href: '/admin/islem-kayitlari', label: 'İşlem Kayıtları', icon: History, module: ['settings', 'users'] },
      { href: '/admin/kurlar', label: 'Döviz & Altın Kurları', icon: Coins },
      { href: '/admin/paket', label: 'Paket & Kullanım', icon: PackageCheck },
      { href: '/admin/destek', label: 'Platform Destek', icon: LifeBuoy },
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
