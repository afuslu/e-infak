/** STK PRO "Kısayollar": F-keys that open pages; each staff member can change them (kept in this browser). */
export interface ShortcutAction { key: string; label: string; href: string }

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { key: 'new_receipt', label: 'Yeni Makbuz', href: '/admin/makbuzlar?yeni=1' },
  { key: 'home', label: 'Anasayfa', href: '/admin' },
  { key: 'receipts', label: 'Tüm Makbuzlar', href: '/admin/makbuzlar' },
  { key: 'donations', label: 'Tüm Bağışlar', href: '/admin/bagislar' },
  { key: 'donors', label: 'Bağışçılar', href: '/admin/bagiscilar' },
  { key: 'new_donor', label: 'Yeni Bağışçı', href: '/admin/bagiscilar/yeni' },
  { key: 'bank', label: 'Banka Hareketleri', href: '/admin/banka-odeme?sekme=banka-hareketleri' },
  { key: 'online', label: 'Online Bağış', href: '/admin/online-bagis' },
  { key: 'kurban', label: 'Kurbanlar', href: '/admin/kurban' },
  { key: 'sponsorship', label: 'Sponsorluklar', href: '/admin/sponsorluk' },
  { key: 'reports', label: 'Raporlar', href: '/admin/raporlar' },
  { key: 'calendar', label: 'Takvim', href: '/admin/gorevler' },
]

/** Same keys as STK PRO. F1, F5, F11 and F12 belong to the browser. */
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  F2: 'new_receipt', F3: 'donors', F4: 'donations', F6: 'receipts', F7: 'bank', F8: 'online', F9: 'reports', F10: 'home',
}
export const ALLOWED_KEYS = ['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']
const STORE = 'einfak-shortcuts'

export function loadShortcuts(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (saved && typeof saved === 'object') return saved as Record<string, string>
  } catch {
    // storage unavailable
  }
  return { ...DEFAULT_SHORTCUTS }
}

export function saveShortcuts(map: Record<string, string>) {
  try { localStorage.setItem(STORE, JSON.stringify(map)) } catch { /* ignore */ }
}
