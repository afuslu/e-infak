import type { Campaign } from '@e-infak/api-client'
import type { CategoryDto } from '../sections/HomeSections'

export interface LinkPreset {
  label: string
  url: string
}

export interface LinkGroup {
  group: string
  items: LinkPreset[]
}

export interface LinkPageRef {
  slug: string | null
  title: string
  is_published: boolean
  kind?: string
}

export const BUILT_IN_PAGE_LINKS: LinkPreset[] = [
  { label: 'Ana Sayfa', url: '/' },
  { label: 'Projeler / Kampanyalar', url: '/kampanyalar' },
  { label: 'Bağış Sayfası', url: '/bagis' },
  { label: 'Haberler', url: '/haberler' },
  { label: 'Galeri', url: '/galeri' },
  { label: 'Gönüllü Ol', url: '/gonullu' },
  { label: 'Zekât Hesapla', url: '/zekat-hesapla' },
  { label: 'Yardım Başvurusu', url: '/yardim-basvurusu' },
  { label: 'Hakkımızda', url: '/hakkimizda' },
  { label: 'İletişim', url: '/iletisim' },
  { label: 'Bağışçı Portalı', url: '/portal' },
  { label: 'Makbuz Doğrulama', url: '/verify' },
  { label: 'KVKK', url: '/kvkk' },
  { label: 'Gizlilik Politikası', url: '/gizlilik' },
  { label: 'Bağış Koşulları', url: '/bagis-kosullari' },
]

export const CAMPAIGN_CATEGORY_LINKS: LinkPreset[] = [
  { label: 'Eğitim', url: '/kampanyalar?kategori=egitim' },
  { label: 'Sağlık', url: '/kampanyalar?kategori=saglik' },
  { label: 'Gıda', url: '/kampanyalar?kategori=gida' },
  { label: 'Su', url: '/kampanyalar?kategori=su' },
  { label: 'Yetim', url: '/kampanyalar?kategori=yetim' },
  { label: 'Kurban', url: '/kampanyalar?kategori=kurban' },
  { label: 'Zekât', url: '/kampanyalar?kategori=zekat' },
  { label: 'Fitre', url: '/kampanyalar?kategori=fitre' },
  { label: 'Fidye', url: '/kampanyalar?kategori=fidye' },
  { label: 'Sadaka', url: '/kampanyalar?kategori=sadaka' },
  { label: 'Adak', url: '/kampanyalar?kategori=adak' },
  { label: 'Akika', url: '/kampanyalar?kategori=akika' },
]

function resolveDonationCategoryUrl(category: CategoryDto, slugById: Map<string, string>): string {
  if (category.target_url) return category.target_url
  const slug = category.campaign_id ? slugById.get(category.campaign_id) : undefined
  if (slug) return `/kampanyalar/${slug}`
  if (category.donation_type || category.suggested_amounts_cents?.length) {
    const qs = new URLSearchParams()
    if (category.donation_type) qs.set('category', category.donation_type)
    if (category.suggested_amounts_cents?.[0]) {
      qs.set('amount', String(Math.round(category.suggested_amounts_cents[0] / 100)))
    }
    return `/bagis?${qs.toString()}`
  }
  return '/kampanyalar'
}

/** Groups all ready-to-use site links (built-in pages, project categories, custom pages, donation categories, campaigns). */
export function buildLinkGroups({
  campaigns = [],
  categories = [],
  pages = [],
  features = [],
}: {
  campaigns?: Campaign[]
  categories?: CategoryDto[]
  pages?: LinkPageRef[]
  features?: string[]
}): LinkGroup[] {
  const slugById = new Map(campaigns.map((c) => [c.id, c.slug]))
  const builtIn = features.includes('education')
    ? [...BUILT_IN_PAGE_LINKS, { label: 'Öğrenci Ön Kayıt', url: '/on-kayit' }]
    : BUILT_IN_PAGE_LINKS

  const groups: LinkGroup[] = [
    { group: 'Sabit Sayfalar', items: builtIn },
    { group: 'Proje Kategorileri', items: CAMPAIGN_CATEGORY_LINKS },
  ]

  const customPages = pages.filter((p) => p.is_published && p.slug && (!p.kind || p.kind === 'page'))
  if (customPages.length > 0) {
    groups.push({
      group: 'Özel Sayfalar',
      items: customPages.map((p) => ({ label: p.title, url: `/sayfa/${p.slug}` })),
    })
  }

  if (categories.length > 0) {
    groups.push({
      group: 'Bağış Kalemleri',
      items: categories.map((c) => ({ label: c.title, url: resolveDonationCategoryUrl(c, slugById) })),
    })
  }

  if (campaigns.length > 0) {
    groups.push({
      group: 'Kampanyalar',
      items: campaigns.map((c) => ({ label: c.title, url: `/kampanyalar/${c.slug}` })),
    })
  }

  return groups
}
