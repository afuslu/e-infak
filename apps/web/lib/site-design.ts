import type { CSSProperties } from 'react'

/** Site-wide design tokens from Görünüm & Tema (see `Design` in services/backend/app/services/site.py). */
export type CartStyle =
  | 'drawer'
  | 'page_redirect'
  | 'floating_popover'
  | 'bottom_sheet'
  | 'drawer_upsell'
  | 'left_drawer'
  | 'centered_modal'
  | 'top_bar_slide'
  | 'mini_pill'
  | 'dark_drawer'
  | 'fullscreen_overlay'
  | 'qty_stepper_drawer'
  | 'social_proof_drawer'
  | 'side_dock'
  | 'compact_bar'
  | 'split_drawer'
  | 'receipt_drawer'
  | 'floating_pill_drawer'
  | 'glass_drawer'
  | 'emerald_drawer'

export type CheckoutStyle =
  | 'split_classic'
  | 'stepper_minimal'
  | 'express_single'
  | 'dark_luxury'
  | 'trust_split'
  | 'transfer_first'
  | 'emerald_charity'
  | 'split_reversed'
  | 'card_tabs'
  | 'compact_mobile'
  | 'bento_checkout'
  | 'minimal_paper'
  | 'split_fullscreen'
  | 'accordion_steps'
  | 'timeline_flow'
  | 'glass_gradient'
  | 'warm_pastel'
  | 'corporate_checkout'
  | 'one_step_sidebar'
  | 'islamic_ornate'
  | 'high_contrast'
  | 'floating_cards'
  | 'receipt_preview'
  | 'multi_card_grid'
  | 'minimal_bordered'
  | 'hero_banner_checkout'
  | 'progress_header_checkout'
  | 'card_elevated_split'
  | 'magazine_editorial'
  | 'pill_rounded_modern'

export const CART_STYLE_LABELS: Record<CartStyle, { label: string; desc: string }> = {
  drawer: { label: 'Sağ Çekmece (Klasik)', desc: 'Sağdan kayan hızlı sepet ve ödeme çekmecesi.' },
  left_drawer: { label: 'Sol Çekmece', desc: 'Ekranın solundan açılan hızlı sepet çekmecesi.' },
  page_redirect: { label: 'Tam Sayfa Ödemeye Yönlendir', desc: 'Sepete eklenince altta bildirim çıkarır, ödeme sayfasına götürür.' },
  floating_popover: { label: 'Yüzen Köşe Penceresi', desc: 'Sağ alt köşede açılan kompakt modern sepet kartı.' },
  bottom_sheet: { label: 'Alttan Açılan Çekmece', desc: 'Özellikle mobilde başparmak erişimine uygun alt panel.' },
  drawer_upsell: { label: 'Önerili Sepet Çekmecesi', desc: 'Sepet içinde ek mikro bağış önerileri sunar.' },
  centered_modal: { label: 'Ortalanmış Odak Penceresi', desc: 'Ekran ortasında bulanık arka planlı büyük sepet modalı.' },
  top_bar_slide: { label: 'Üstten İnen Sepet', desc: 'Ekranın üstünden açılan geniş sepet paneli.' },
  mini_pill: { label: 'Mini Tutar Hapı + Çekmece', desc: 'Sağ altta toplam tutarı gösteren hap buton.' },
  dark_drawer: { label: 'Koyu Prestij Çekmecesi', desc: 'Koyu lacivert/antrasit zeminli ve altın vurgulu sepet.' },
  fullscreen_overlay: { label: 'Tam Ekran Odak Sepeti', desc: 'Açıldığında tüm ekranı kaplayan geniş sepet deneyimi.' },
  qty_stepper_drawer: { label: 'Büyük − / + Adetli Sepet', desc: 'Sepette büyük − / + adet ve +100/+500 artırma butonları.' },
  social_proof_drawer: { label: 'Güven & Şeffaflık Bantlı', desc: 'Sepet üstünde SSL ve anında makbuz güven şeridi.' },
  side_dock: { label: 'Sağ Kenar Şeridi (Dock)', desc: 'Ekranın sağ kenarına yapışık dikey sepet etiketi.' },
  compact_bar: { label: 'Alt Yatay Özet Barı', desc: 'Sayfanın altında ince yatay çubuk olarak açılan sepet.' },
  split_drawer: { label: 'Geniş Çift Sütun Çekmece', desc: 'Sol sütunda kalemler, sağ sütunda ödeme formu.' },
  receipt_drawer: { label: 'Fiş / Makbuz Estetiği Çekmece', desc: 'Kesikli makbuz kenarlıklı klasik hayır fişi görünümü.' },
  floating_pill_drawer: { label: 'Canlı CTA Hap Buton + Modal', desc: 'Sağ altta "Bağışı Tamamla (X) →" hap butonu.' },
  glass_drawer: { label: 'Buzlu Cam Çekmece', desc: 'Arkası hafif bulanık yarı saydam modern cam sepet.' },
  emerald_drawer: { label: 'Zümrüt Vakıf Çekmecesi', desc: 'Zümrüt yeşili vurgulu ve krem zeminli vakıf sepeti.' },
}

export const CHECKOUT_STYLE_LABELS: Record<CheckoutStyle, { label: string; desc: string }> = {
  split_classic: { label: 'İki Sütunlu Stripe Standardı', desc: 'Sol tarafta form, sağda yapışkan özet ve güven rozetleri.' },
  split_reversed: { label: 'Ters İki Sütun (Özet Solda)', desc: 'Sol sütunda yapışkan özet, sağda ödeme formu.' },
  split_fullscreen: { label: 'Stripe Tam Ekran Bölünmüş', desc: 'Sol %45 koyu marka/özet sütunu, sağ %55 ödeme formu.' },
  stepper_minimal: { label: 'Odaklı Sihirbaz (1→2→3)', desc: 'Dikkat dağıtmayan, adım çubuklu sade tek sütun akış.' },
  accordion_steps: { label: 'Akordeon Adımlı Ödeme', desc: '1. Sepet → 2. Bilgiler → 3. Ödeme kutuları sırayla açılır.' },
  timeline_flow: { label: 'Dikey Zaman Çizelgeli', desc: 'Sol kenarda numaralı dikey çizgi ile ilerleyen düzen.' },
  express_single: { label: 'Tek Sayfa Hızlı Ödeme', desc: 'Adım değiştirmeden tek ekranda 15 saniyede ödeme.' },
  dark_luxury: { label: 'Koyu Prestij & Altın', desc: 'Koyu zemin, cam efektli özet kartı ve altın vurgular.' },
  emerald_charity: { label: 'Zümrüt Vakıf & Krem', desc: 'Zümrüt yeşili ve sıcak krem tonlarında vakıf ödeme sayfası.' },
  glass_gradient: { label: 'Buzlu Cam & Gradyan', desc: 'Renk geçişli zemin üzerinde cam efektli ödeme kartları.' },
  warm_pastel: { label: 'Sıcak Pastel / Hayırsever', desc: 'Bej ve tarçın tonlarında yumuşak köşeli sıcak görünüm.' },
  trust_split: { label: 'Güven & Şeffaflık Odaklı', desc: 'Sağ sütunda şeffaflık garantisi, PDF makbuz ve SSS kutusu.' },
  transfer_first: { label: 'Havale / EFT Öncelikli', desc: 'IBAN kopyalama ve açıklama kodunu ilk sıraya alan kurumsal düzen.' },
  card_tabs: { label: 'Büyük Ödeme Sekmeli', desc: 'Kart ve Havale/EFT seçeneklerini üst sekmelerle ayıran düzen.' },
  compact_mobile: { label: 'Mobil Odaklı Büyük Butonlu', desc: 'Büyük dokunma alanlı, tek sütunlu ultra sade ödeme.' },
  bento_checkout: { label: 'Bento Izgara Ödeme', desc: 'Bilgi, ödeme, özet ve güven kutularının ızgara yerleşimi.' },
  minimal_paper: { label: 'Klasik Makbuz Estetiği', desc: 'Kağıt dokulu, çerçeveli ve serif başlıklı sade görünüm.' },
  corporate_checkout: { label: 'Kurumsal Bağışçı Odaklı', desc: 'Kurum / Şirket Adı ve Vergi No alanlarını içeren kurumsal düzen.' },
  one_step_sidebar: { label: 'Sol Koyu Özet Kenar Çubuğu', desc: 'Lemonsqueezy tarzı sol koyu özet, sağda ferah form.' },
  islamic_ornate: { label: 'Altın Çerçeveli Vakıf', desc: 'Altın ince çerçeveli ve zümrüt vurgulu prestij vakıf tasarımı.' },
  high_contrast: { label: 'Yüksek Kontrast (Erişilebilir)', desc: 'Büyük puntolu, siyah-beyaz yüksek kontrastlı sade düzen.' },
  floating_cards: { label: 'Yüzen Kartlar Düzeni', desc: 'Her bölümün gölgeli bağımsız kartlar halinde dizildiği görünüm.' },
  receipt_preview: { label: 'Canlı Makbuz Önizlemeli', desc: 'Sağ sütunda adınıza kesilecek makbuzun canlı önizlemesi.' },
  multi_card_grid: { label: 'Çoklu Kalem Izgaralı', desc: 'Üstte kalemleri kartlar halinde, altta ödeme formunu gösterir.' },
  minimal_bordered: { label: 'İnce Çizgili Minimal (İsviçre)', desc: 'Arka plansız, ince çizgili ultra-sade tipografik düzen.' },
  hero_banner_checkout: { label: 'Üst Bannerlı Ödeme Merkezi', desc: 'Üstte kurum renkli banner başlık ve altında iki sütun form.' },
  progress_header_checkout: { label: 'Üst İlerleme Çubuklu', desc: 'Üstte %33 → %66 → %100 dolan ilerleme çubuklu sihirbaz.' },
  card_elevated_split: { label: 'Yükseltilmiş Gölgeli Kartlar', desc: 'Açık gri zeminde derin gölgeli net odaklı iki sütun.' },
  magazine_editorial: { label: 'Dergi / Editoryal Düzen', desc: 'Büyük serif başlıklar ve ince yan özet sütunu.' },
  pill_rounded_modern: { label: 'Genç & Modern Yuvarlak Hatlar', desc: 'Ekstra yuvarlatılmış köşeli modern mobil uygulama estetiği.' },
}

export interface SiteDesign {
  body_font: string
  heading_font: string
  radius: 'none' | 'small' | 'medium' | 'large' | 'pill'
  container: 'narrow' | 'normal' | 'wide' | 'full'
  page_color: string
  text_color: string
  heading_weight: string
  heading_case: 'normal' | 'uppercase'
  cart_style?: CartStyle
  checkout_style?: CheckoutStyle
  checkout_micro_addon?: boolean
  checkout_show_faq?: boolean
}

export const DEFAULT_DESIGN: SiteDesign = {
  body_font: 'public-sans', heading_font: 'lora', radius: 'medium', container: 'normal',
  page_color: '#FAFAF9', text_color: '#111827', heading_weight: '700', heading_case: 'normal',
  cart_style: 'drawer', checkout_style: 'split_classic',
  checkout_micro_addon: false, checkout_show_faq: false,
}

const CONTAINERS = { narrow: 1080, normal: 1200, wide: 1320, full: 1440 }
// Tailwind's default radius scale (rem) multiplied per choice.
const RADIUS_BASE = { sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1, '3xl': 1.5 }
const RADIUS_FACTOR = { none: 0, small: 0.5, medium: 1, large: 1.5, pill: 2.25 }
const FONT_KEY = /^[a-z-]{2,20}$/
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * CSS variables for an element wrapping the public site. Fonts, radius and container
 * width are read by Tailwind utilities (`font-sans`, `font-heading`, `rounded-*`,
 * `max-w-[var(--site-container)]`); headings pick up weight and case in globals.css.
 */
export function siteDesignStyle(design?: Partial<SiteDesign> | null): CSSProperties {
  const d = { ...DEFAULT_DESIGN, ...(design || {}) }
  const vars: Record<string, string> = {}
  if (FONT_KEY.test(d.body_font)) vars['--font-primary-family'] = `var(--ff-${d.body_font})`
  if (FONT_KEY.test(d.heading_font)) vars['--font-heading-family'] = `var(--ff-${d.heading_font})`
  const factor = RADIUS_FACTOR[d.radius] ?? 1
  for (const [name, rem] of Object.entries(RADIUS_BASE)) vars[`--radius-${name}`] = `${+(rem * factor).toFixed(3)}rem`
  vars['--site-container'] = `${CONTAINERS[d.container] ?? 1200}px`
  vars['--site-heading-weight'] = /^[5-9]00$/.test(d.heading_weight) ? d.heading_weight : '700'
  vars['--site-heading-case'] = d.heading_case === 'uppercase' ? 'uppercase' : 'none'
  vars['--site-page'] = HEX.test(d.page_color) ? d.page_color : DEFAULT_DESIGN.page_color
  vars['--site-text'] = HEX.test(d.text_color) ? d.text_color : DEFAULT_DESIGN.text_color
  return vars as CSSProperties
}
