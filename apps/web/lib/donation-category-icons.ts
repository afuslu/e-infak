import {
  Baby,
  BookOpen,
  Building2,
  Coins,
  Droplets,
  Globe,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Home,
  Layers,
  Moon,
  Stethoscope,
  Tent,
  Utensils,
  Wheat,
  type LucideIcon,
} from 'lucide-react'

export interface CategoryIconOption {
  key: string
  emoji: string
  label: string
  Icon: LucideIcon
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { key: 'handshake', emoji: '🤝', label: 'Genel Bağış', Icon: HeartHandshake },
  { key: 'droplets', emoji: '💧', label: 'Su Kuyusu', Icon: Droplets },
  { key: 'utensils', emoji: '🍞', label: 'Gıda & İftar', Icon: Utensils },
  { key: 'building', emoji: '🕌', label: 'Cami & İnşaat', Icon: Building2 },
  { key: 'grad', emoji: '🎓', label: 'Eğitim & Burs', Icon: GraduationCap },
  { key: 'moon', emoji: '🌙', label: 'Zekât & Ramazan', Icon: Moon },
  { key: 'wheat', emoji: '🌾', label: 'Fitre & Kumanya', Icon: Wheat },
  { key: 'baby', emoji: '👶', label: 'Yetim Himayesi', Icon: Baby },
  { key: 'medical', emoji: '🩺', label: 'Sağlık', Icon: Stethoscope },
  { key: 'home', emoji: '🏠', label: 'Barınma', Icon: Home },
  { key: 'handheart', emoji: '🤲', label: 'Sadaka', Icon: HandHeart },
  { key: 'tent', emoji: '⛺', label: 'Acil Yardım', Icon: Tent },
  { key: 'globe', emoji: '🌍', label: 'Uluslararası', Icon: Globe },
  { key: 'book', emoji: '📚', label: 'Kitap & Kur’an', Icon: BookOpen },
  { key: 'coins', emoji: '🐄', label: 'Kurban & Nakdi', Icon: Coins },
  { key: 'layers', emoji: '✨', label: 'Kategori', Icon: Layers },
]

const LEGACY_EMOJI_TO_KEY: Record<string, string> = {
  '🤝': 'handshake',
  '💧': 'droplets',
  '🍞': 'utensils',
  '🕌': 'building',
  '🎓': 'grad',
  '🐄': 'coins',
  '🩺': 'medical',
  '🏠': 'home',
  '❤️': 'handheart',
  '🌙': 'moon',
  '🤲': 'handheart',
  '🌾': 'wheat',
  '👶': 'baby',
  '📚': 'book',
  '⛺': 'tent',
  '🌍': 'globe',
  '✨': 'layers',
}

const TYPE_TO_ICON_KEY: Record<string, string> = {
  genel: 'handshake',
  zekat: 'moon',
  fitre: 'wheat',
  fidye: 'wheat',
  sadaka: 'handheart',
  su: 'droplets',
  yetim: 'baby',
  kurban: 'coins',
  egitim: 'grad',
  gida: 'utensils',
  saglik: 'medical',
  insaat: 'building',
}

/**
 * Resolves a stored category icon (key or legacy emoji) or donation type
 * into a corporate Lucide icon option.
 */
export function resolveCategoryIcon(iconValue?: string | null, donationType?: string | null): CategoryIconOption {
  const raw = (iconValue || '').trim()
  const mappedKey = LEGACY_EMOJI_TO_KEY[raw] || raw
  const byIcon = CATEGORY_ICON_OPTIONS.find((opt) => opt.key === mappedKey)
  if (byIcon) return byIcon
  if (donationType && TYPE_TO_ICON_KEY[donationType]) {
    const byType = CATEGORY_ICON_OPTIONS.find((opt) => opt.key === TYPE_TO_ICON_KEY[donationType])
    if (byType) return byType
  }
  return CATEGORY_ICON_OPTIONS[0]
}
