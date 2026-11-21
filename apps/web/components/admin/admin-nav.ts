import {
  ArrowDownToLine, BarChart3, Beef, BellRing, Blocks, BookOpen, Calculator, CalendarDays, Coins, CreditCard, Droplets, FileText,
  FileUp, Film, FolderOpen, Globe2, HandCoins, HandHelping, HeartHandshake, HelpCircle, History, Home, IdCard, KeyRound,
  Landmark, LayoutDashboard, LayoutGrid, LifeBuoy, LogIn, type LucideIcon, MailPlus, Megaphone, MessageSquareText,
  MessagesSquare, Newspaper, PackageCheck, Palette, PanelsTopLeft, PhoneCall, PiggyBank, Plug, Repeat, Send, Settings,
  ShieldCheck, Sparkles, Tags, Users, UsersRound, Video, Wallet,
} from 'lucide-react'

export interface NavItem {
  /** Page address; may carry a query (`?sekme=…`) for a tab inside a page. */
  href: string
  label: string
  icon: LucideIcon
  feature?: string
  permission?: string
  /** Module (capability group, app/core/capabilities.py) the page belongs to. */
  module?: string | string[]
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

/** One icon in the left rail (STK PRO layout): a direct page, or a sub-panel of sections. */
export interface NavRail {
  key: string
  label: string
  icon: LucideIcon
  sections: NavSection[]
  /** Draw a divider above this icon. */
  divider?: boolean
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// Order and names follow STK PRO, so staff moving over find every page in the same place.
// Pages STK PRO lacks sit in the closest group. `feature`: package module (app/core/plans.py);
// `permission`: staff permission (app/api/deps.py).
export const NAV_RAIL: NavRail[] = [
  {
    key: 'anasayfa', label: 'Anasayfa', icon: Home, sections: [
      { items: [{ href: '/admin', label: 'Anasayfa', icon: LayoutDashboard }] },
    ],
  },
  {
    key: 'bagiscilar', label: 'Bağışçılar', icon: Users, sections: [
      {
        title: 'Bağışçı Yönetimi', items: [
          { href: '/admin/bagiscilar', label: 'Bağışçılar', icon: Users, feature: 'donor_crm', module: 'donors' },
          { href: '/admin/bagiscilar/mukerrer', label: 'Mükerrer Numaralar', icon: UsersRound, feature: 'donor_crm', module: 'donors' },
          { href: '/admin/veri-aktarma', label: 'Toplu Yükle (Excel)', icon: FileUp, feature: 'donor_crm', module: 'donors' },
        ],
      },
      {
        title: 'Üyelik', items: [
          { href: '/admin/uyeler', label: 'Üyeler & Aidat', icon: IdCard, feature: 'membership', module: 'members' },
          { href: '/admin/gonulluler', label: 'Gönüllü Başvuruları', icon: HandHelping, feature: 'website', module: ['site', 'donors'] },
        ],
      },
    ],
  },
  {
    key: 'kampanya', label: 'Kampanya', icon: Megaphone, divider: true, sections: [
      {
        title: 'Kampanya Yönetimi', items: [
          { href: '/admin/kampanyalar', label: 'Kampanyalar', icon: Megaphone, module: 'site' },
          { href: '/admin/bagis-kalemleri', label: 'Kampanya Sekmeler', icon: Tags, module: 'site' },
        ],
      },
    ],
  },
  {
    key: 'operasyon', label: 'Operasyon', icon: LayoutGrid, sections: [
      {
        title: 'Bağış Yönetimi', items: [
          { href: '/admin/bagislar', label: 'Makbuzlar / Bağışlar', icon: HandCoins, module: 'receipts' },
          { href: '/admin/subscriptions', label: 'Düzenli Ödemeler', icon: Repeat, feature: 'recurring', module: ['finance', 'donors', 'receipts'] },
          { href: '/admin/makbuz-kocanlari', label: 'Makbuz Koçanları', icon: BookOpen, feature: 'receipts', module: ['receipts', 'finance'] },
          { href: '/admin/zakat', label: 'Zekât Ayarları', icon: Coins, module: ['finance', 'settings', 'site'] },
        ],
      },
      {
        title: 'Diğer', items: [
          { href: '/admin/kumanya', label: 'Dağıtım/Kumanya', icon: PackageCheck, feature: 'poverty_tracking', module: 'operations' },
          { href: '/admin/yoksul-takip', label: 'Sosyal Yardım', icon: Home, feature: 'poverty_tracking', module: 'operations' },
          { href: '/admin/videolar', label: 'Bağış Videoları', icon: Video, feature: 'donation_video', module: ['kurban', 'receipts'] },
        ],
      },
      {
        title: 'Kurban Organizasyonu', items: [
          { href: '/admin/kurban', label: 'Kurbanlar', icon: Beef, feature: 'kurban', module: 'kurban' },
        ],
      },
      {
        title: 'Sponsorluk Yönetimi', items: [
          { href: '/admin/sponsorluk', label: 'Sponsorluklar', icon: HeartHandshake, feature: 'sponsorship', module: 'operations' },
        ],
      },
      {
        title: 'Su Kuyusu Yönetimi', items: [
          { href: '/admin/wells', label: 'Su Kuyusu & Fonlama', icon: Droplets, feature: 'water_well', module: 'operations' },
        ],
      },
      {
        title: 'Kumbara Yönetimi', items: [
          { href: '/admin/kumbara', label: 'Kumbara', icon: PiggyBank, feature: 'money_box', module: 'operations' },
        ],
      },
    ],
  },
  {
    key: 'site', label: 'Web Sitesi', icon: Globe2, sections: [
      {
        items: [
          { href: '/admin/site-yapici', label: 'Site Yapıcı', icon: Blocks, module: 'site' },
          { href: '/admin/site-ayarlari', label: 'Genel Ayarlar', icon: Settings, module: 'settings' },
          { href: '/admin/gorunum', label: 'Görünüm', icon: Palette, module: 'site' },
          { href: '/admin/menu', label: 'Menüler', icon: PanelsTopLeft, module: 'site' },
          { href: '/admin/sayfalar', label: 'Sayfalar', icon: FileText, module: 'site' },
          { href: '/admin/banners', label: 'Slider', icon: Film, feature: 'website', module: 'site' },
          { href: '/admin/icerikler', label: 'İçerikler', icon: Newspaper, feature: 'website', module: 'site' },
          { href: '/admin/galeri', label: 'Medya (Foto & Video Galeri)', icon: Film, feature: 'website', module: 'site' },
          { href: '/admin/medya', label: 'Ortam Kütüphanesi', icon: FolderOpen, module: 'site' },
        ],
      },
    ],
  },
  {
    key: 'iletisim', label: 'İletişim', icon: MessagesSquare, sections: [
      {
        title: 'SMS', items: [
          { href: '/admin/sms', label: 'SMS Şablonları', icon: MailPlus, feature: 'sms', module: 'sms' },
          { href: '/admin/broadcast', label: 'Toplu SMS Gönder', icon: MessagesSquare, feature: 'sms', module: 'sms' },
          { href: '/admin/sms-gonderimleri', label: 'SMS Gönderimleri', icon: Send, feature: 'sms', module: 'sms' },
        ],
      },
      {
        title: 'Diğer Kanallar', items: [
          { href: '/admin/whatsapp', label: 'WhatsApp Business', icon: MessagesSquare, feature: 'whatsapp', module: 'sms' },
          { href: '/admin/cagri-merkezi', label: 'Çağrı Merkezi', icon: PhoneCall, feature: 'call_center', module: ['donors', 'sms'] },
          { href: '/admin/hatirlatici', label: 'Hatırlatıcı', icon: BellRing },
        ],
      },
    ],
  },
  {
    key: 'finans', label: 'Finans', icon: CreditCard, sections: [
      {
        title: 'Operasyon', items: [
          { href: '/admin/banka-odeme?sekme=online-bagis', label: 'Online Bağış', icon: CreditCard, module: ['bank', 'settings'] },
          { href: '/admin/banka-odeme?sekme=banka-hareketleri', label: 'Banka Hareketleri (Gelir)', icon: Landmark, module: ['bank', 'settings'] },
          { href: '/admin/banka-odeme?sekme=banka-hesaplari', label: 'Banka Hesapları', icon: Wallet, module: ['bank', 'settings'] },
          { href: '/admin/sms-bagislari', label: 'SMS Bağışları', icon: MessageSquareText, feature: 'sms_donation', module: ['receipts', 'bank'] },
        ],
      },
      {
        title: 'Muhasebe', items: [
          { href: '/admin/muhasebe', label: 'Ön Muhasebe', icon: Calculator, module: ['finance', 'bank'] },
          { href: '/admin/muhasebe?sekme=gelen-havaleler', label: 'Gelen Havaleler', icon: ArrowDownToLine, module: ['finance', 'bank'] },
        ],
      },
    ],
  },
  {
    key: 'sistem', label: 'Sistem', icon: Settings, sections: [
      {
        title: 'Ayarlar', items: [
          { href: '/admin/odeme-sms', label: 'Sanal Pos & SMS Hesapları', icon: KeyRound, module: 'settings' },
          { href: '/admin/users', label: 'Kullanıcılar & Roller', icon: ShieldCheck, feature: 'roles', module: 'users' },
          { href: '/admin/kurlar', label: 'Döviz Kurları', icon: Coins },
          { href: '/admin/giris-kayitlari', label: 'Kullanıcı Giriş Logları', icon: LogIn, module: ['settings', 'users'] },
          { href: '/admin/ip-kurallari', label: 'IP İzinleri & Engellemeler', icon: Globe2, module: ['settings', 'users'] },
          { href: '/admin/integrations', label: 'API & Webhook', icon: Plug, module: 'settings' },
        ],
      },
      {
        title: 'Loglar', items: [
          { href: '/admin/islem-kayitlari', label: 'İşlem Geçmişi', icon: History, module: ['settings', 'users'] },
        ],
      },
      {
        title: 'Hesap', items: [
          { href: '/admin/paket', label: 'Paket & Modüller', icon: PackageCheck },
        ],
      },
    ],
  },
  {
    key: 'takvim', label: 'Takvim', icon: CalendarDays, divider: true, sections: [
      { items: [{ href: '/admin/gorevler', label: 'Takvim & Görevler', icon: CalendarDays, feature: 'tasks' }] },
    ],
  },
  {
    key: 'raporlar', label: 'Raporlar', icon: BarChart3, sections: [
      {
        items: [
          { href: '/admin/raporlar', label: 'Raporlar', icon: BarChart3, feature: 'reports_basic', module: 'reports' },
          { href: '/admin/ai', label: 'AI Öngörüleri', icon: Sparkles, feature: 'reports_basic', module: ['reports', 'donors'] },
        ],
      },
    ],
  },
  {
    key: 'destek', label: 'Destek', icon: HelpCircle, divider: true, sections: [
      { items: [{ href: '/admin/destek', label: 'Talep Merkezi', icon: LifeBuoy }] },
    ],
  },
]

/** Rail entries flattened to groups (command palette, page title, search). */
export const NAV_GROUPS: NavGroup[] = NAV_RAIL.map((rail) => ({
  key: rail.key,
  label: rail.label,
  items: rail.sections.flatMap((section) => section.items),
}))

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

const pathOf = (href: string) => href.split('?')[0]

/** The menu entry for the current page; `search` picks between tabs of one page. */
export function navItemFor(pathname: string | null, search = '') {
  if (!pathname) return undefined
  if (pathname === '/admin') return NAV_ITEMS[0]
  const params = new URLSearchParams(search)
  const score = (item: NavItem) => {
    const path = pathOf(item.href)
    if (path === '/admin' || !(pathname === path || pathname.startsWith(`${path}/`))) return -1
    let s = path.length * 10
    if (pathname === path) s += 5
    const query = item.href.includes('?') ? new URLSearchParams(item.href.split('?')[1]) : null
    if (query) {
      const matches = [...query.entries()].every(([key, value]) => params.get(key) === value)
      if (!matches) return -1
      s += 3
    }
    return s
  }
  let best: NavItem | undefined
  let bestScore = -1
  for (const item of NAV_ITEMS) {
    const s = score(item)
    if (s > bestScore) { best = item; bestScore = s }
  }
  // A tab address no entry names still belongs to the page's first entry.
  if (!best) best = NAV_ITEMS.find((item) => pathOf(item.href) === pathname)
  return best
}

export const groupOf = (item?: NavItem) => (item ? NAV_GROUPS.find((group) => group.items.includes(item)) : undefined)
export const railOf = (item?: NavItem) =>
  item ? NAV_RAIL.find((rail) => rail.sections.some((section) => section.items.includes(item))) : undefined

/** Search key: lower case without Turkish diacritics, so "bagis" finds "Bağış". */
export const searchKey = (text: string) =>
  text.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '')
