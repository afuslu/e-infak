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
  | 'warm_drawer'
  | 'gold_ornate_drawer'
  | 'minimal_line_drawer'
  | 'impact_badge_drawer'
  | 'quick_amount_drawer'
  | 'high_contrast_drawer'
  | 'gradient_drawer'
  | 'wide_left_drawer'
  | 'navy_corporate_drawer'
  | 'soft_sage_drawer'
  | 'floating_card_modal'
  | 'summary_top_drawer'

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
  | 'two_column_compact'
  | 'ramadan_special'
  | 'donor_wall_split'
  | 'mobile_app_sheet'
  | 'quick_preset_checkout'
  | 'soft_sage_charity'
  | 'split_sticky_dark'
  | 'certificate_preview'
  | 'nordic_clean'
  | 'midnight_emerald'
  | 'royal_navy_gold'
  | 'terracotta_warm'
  | 'wide_three_column'
  | 'top_summary_strip'
  | 'split_bordered_classic'
  | 'impact_counter_checkout'
  | 'dua_blessing_header'
  | 'minimal_single_focus'

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
  warm_drawer: { label: 'Sıcak Pastel Çekmece', desc: 'Bej ve tarçın tonlarında yumuşak köşeli sıcak sepet.' },
  gold_ornate_drawer: { label: 'Altın Çerçeveli Vakıf Çekmecesi', desc: 'İnce altın çerçeveli ve krem zeminli prestij sepet.' },
  minimal_line_drawer: { label: 'İnce Çizgili Minimal Çekmece', desc: 'Gölgesiz, net çizgili İsviçre stili sade sepet.' },
  impact_badge_drawer: { label: 'Etki & Dua Mesajlı Sepet', desc: 'Sepet üstünde bağışın ulaştıracağı etkiyi vurgular.' },
  quick_amount_drawer: { label: 'Hızlı Tutar Artırmalı Sepet', desc: 'Sepet içinde tek tıkla +100 / +250 / +500 ekleme butonları.' },
  high_contrast_drawer: { label: 'Yüksek Kontrast (Erişilebilir)', desc: 'Siyah-beyaz yüksek kontrastlı, büyük puntolu sepet.' },
  gradient_drawer: { label: 'Gradyan Başlıklı Sepet', desc: 'Üst kısmı kurum rengi gradyan başlıklı modern çekmece.' },
  wide_left_drawer: { label: 'Geniş Sol Çekmece', desc: 'Ekranın solundan açılan geniş ve ferah sepet paneli.' },
  navy_corporate_drawer: { label: 'Lacivert Kurumsal Çekmece', desc: 'Derin lacivert zemin ve altın vurgulu kurumsal sepet.' },
  soft_sage_drawer: { label: 'Adaçayı & Krem Çekmece', desc: 'Doğal adaçayı yeşili kenarlıklı huzurlu vakıf sepeti.' },
  floating_card_modal: { label: 'Yüzen Kart Modalı', desc: 'Ekstra yuvarlatılmış, gölgeli kart görünümünde sepet.' },
  summary_top_drawer: { label: 'Önce Özet & Hızlı Ödeme', desc: 'Toplam tutarı ve ödeme butonunu üstte vurgulayan düzen.' },
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
  two_column_compact: { label: 'Sıkıştırılmış İki Sütun', desc: 'Daha az boşlukla tek bakışta tüm formu ve özeti gösterir.' },
  ramadan_special: { label: 'Ramazan & İnfak Özel', desc: 'Koyu zümrüt ve altın vurgulu özel kampanya ödeme sayfası.' },
  donor_wall_split: { label: 'Şeffaflık & Güven Akışlı', desc: 'Özet altında anlık güven rozetleri ve şeffaflık taahhüdü.' },
  mobile_app_sheet: { label: 'Mobil Uygulama Kart Akışı', desc: 'Uygulama içi ödeme ekranı gibi yuvarlak kartlar ve alt özet.' },
  quick_preset_checkout: { label: 'Hızlı Tutar Eklemeli Ödeme', desc: 'Özet üstünde tek tıkla ekstra bağış ekleme çipleri.' },
  soft_sage_charity: { label: 'Yumuşak Adaçayı & Krem', desc: 'Doğal adaçayı yeşili ve krem tonlarında sakin bağış sayfası.' },
  split_sticky_dark: { label: 'Sağ Koyu Yapışkan Özet', desc: 'Sol taraf ferah beyaz form, sağ taraf koyu antrasit özet.' },
  certificate_preview: { label: 'Dijital Sertifika Önizlemeli', desc: 'Sağ sütunda adınıza hazırlanacak teşekkür sertifikası önizlemesi.' },
  nordic_clean: { label: 'İskandinav Ferah & Sade', desc: 'Bol beyaz boşluklu, yumuşak gri çerçeveli sade tasarım.' },
  midnight_emerald: { label: 'Gece Zümrütü & Altın', desc: 'Koyu zümrüt-siyah zemin üzerinde altın detaylı vakıf sayfası.' },
  royal_navy_gold: { label: 'Kraliyet Laciverti & Altın', desc: 'Koyu lacivert özet alanı ve altın vurgulu kurumsal düzen.' },
  terracotta_warm: { label: 'Toprak & Tarçın Sıcaklığı', desc: 'Doğal toprak tonlarında sıcak insani yardım görünümü.' },
  wide_three_column: { label: 'Üç Sütunlu Geniş Masaüstü', desc: 'Sol sütunda kalemler, ortada bilgiler, sağda ödeme.' },
  top_summary_strip: { label: 'Üst Yatay Özet Şeritli', desc: 'Sayfa başında yatay toplam tutar şeridi, altında tek sütun form.' },
  split_bordered_classic: { label: 'Klasik Çift Çerçeveli', desc: 'Net ince çerçeveli, gölgesiz geleneksel vakıf düzeni.' },
  impact_counter_checkout: { label: 'Etki Göstergeli Ödeme', desc: 'Üstte bağışın yaratacağı etki mesajını gösteren düzen.' },
  dua_blessing_header: { label: 'Dua & Bereket Başlıklı', desc: 'Üstte zarif teşekkür ve dua mesajı bandı bulunan vakıf düzeni.' },
  minimal_single_focus: { label: 'Tek Sütun Ultra Odak', desc: 'Yan kutular olmadan dar, merkezlenmiş hızlı ödeme.' },
}

export type CartCategory = 'all' | 'drawer' | 'modal' | 'bar' | 'theme' | 'interactive'
export type CheckoutCategory = 'all' | 'split' | 'focused' | 'dark' | 'charity' | 'corporate'

export const CART_CATEGORY_LABELS: { key: CartCategory; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'drawer', label: 'Çekmece' },
  { key: 'modal', label: 'Modal' },
  { key: 'bar', label: 'Bar & Hap' },
  { key: 'theme', label: 'Vakıf & Tema' },
  { key: 'interactive', label: 'Etkileşimli' },
]

export const CHECKOUT_CATEGORY_LABELS: { key: CheckoutCategory; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'split', label: 'İki Sütun' },
  { key: 'focused', label: 'Adımlı & Odak' },
  { key: 'dark', label: 'Koyu & Prestij' },
  { key: 'charity', label: 'Vakıf & Sıcak' },
  { key: 'corporate', label: 'Kurumsal & Mobil' },
]

export const CART_STYLE_CATEGORIES: Record<CartStyle, Exclude<CartCategory, 'all'>> = {
  drawer: 'drawer',
  left_drawer: 'drawer',
  wide_left_drawer: 'drawer',
  split_drawer: 'drawer',
  minimal_line_drawer: 'drawer',
  page_redirect: 'bar',
  mini_pill: 'bar',
  side_dock: 'bar',
  compact_bar: 'bar',
  bottom_sheet: 'bar',
  top_bar_slide: 'bar',
  floating_popover: 'modal',
  centered_modal: 'modal',
  fullscreen_overlay: 'modal',
  floating_pill_drawer: 'modal',
  floating_card_modal: 'modal',
  dark_drawer: 'theme',
  navy_corporate_drawer: 'theme',
  glass_drawer: 'theme',
  emerald_drawer: 'theme',
  warm_drawer: 'theme',
  soft_sage_drawer: 'theme',
  gold_ornate_drawer: 'theme',
  receipt_drawer: 'theme',
  gradient_drawer: 'theme',
  high_contrast_drawer: 'theme',
  drawer_upsell: 'interactive',
  qty_stepper_drawer: 'interactive',
  social_proof_drawer: 'interactive',
  impact_badge_drawer: 'interactive',
  quick_amount_drawer: 'interactive',
  summary_top_drawer: 'interactive',
}

export const CHECKOUT_STYLE_CATEGORIES: Record<CheckoutStyle, Exclude<CheckoutCategory, 'all'>> = {
  split_classic: 'split',
  split_reversed: 'split',
  split_fullscreen: 'split',
  two_column_compact: 'split',
  wide_three_column: 'split',
  split_bordered_classic: 'split',
  card_elevated_split: 'split',
  floating_cards: 'split',
  multi_card_grid: 'split',
  nordic_clean: 'split',
  stepper_minimal: 'focused',
  accordion_steps: 'focused',
  timeline_flow: 'focused',
  express_single: 'focused',
  progress_header_checkout: 'focused',
  top_summary_strip: 'focused',
  minimal_single_focus: 'focused',
  minimal_bordered: 'focused',
  minimal_paper: 'focused',
  dark_luxury: 'dark',
  one_step_sidebar: 'dark',
  split_sticky_dark: 'dark',
  ramadan_special: 'dark',
  midnight_emerald: 'dark',
  royal_navy_gold: 'dark',
  glass_gradient: 'dark',
  emerald_charity: 'charity',
  warm_pastel: 'charity',
  terracotta_warm: 'charity',
  soft_sage_charity: 'charity',
  islamic_ornate: 'charity',
  trust_split: 'charity',
  donor_wall_split: 'charity',
  receipt_preview: 'charity',
  certificate_preview: 'charity',
  impact_counter_checkout: 'charity',
  dua_blessing_header: 'charity',
  quick_preset_checkout: 'charity',
  transfer_first: 'corporate',
  card_tabs: 'corporate',
  corporate_checkout: 'corporate',
  compact_mobile: 'corporate',
  mobile_app_sheet: 'corporate',
  bento_checkout: 'corporate',
  hero_banner_checkout: 'corporate',
  magazine_editorial: 'corporate',
  pill_rounded_modern: 'corporate',
  high_contrast: 'corporate',
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
