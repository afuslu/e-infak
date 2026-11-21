'use client'

/**
 * STK PRO "Yeni Kampanya" form: type tabs (Standart, Sponsorluk, Kurban, Su Kuyusu, Proje, Kumanya) with status,
 * then Kampanya Bilgisi, Referans Tutarlar and Web Site Ayarları, plus e-infak's story, gallery, SEO and translations.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Beef, Check, Droplets, FileText, HandCoins, ImagePlus, Package, Trash2, Users } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage, v1Send } from '../../../lib/admin-access'
import { ImageField } from '../ImageField'
import { TranslationEditor, type Translations } from '../TranslationEditor'
import { FormattedStory } from '../../FormattedStory'
import { Label, inputClass } from '../FormKit'
import { toast } from '../ui'

export const CAMPAIGN_TYPES = [
  ['standard', 'Standart', HandCoins],
  ['sponsorship', 'Sponsorluk', Users],
  ['kurban', 'Kurban', Beef],
  ['water_well', 'Su Kuyusu', Droplets],
  ['project', 'Proje', FileText],
  ['food_package', 'Kumanya', Package],
] as const
export const CAMPAIGN_TYPE_LABEL: Record<string, string> = Object.fromEntries(CAMPAIGN_TYPES.map(([k, l]) => [k, l]))

export const CATEGORIES = [
  ['genel', 'Genel'], ['egitim', 'Eğitim'], ['saglik', 'Sağlık'], ['gida', 'Gıda'], ['su', 'Su'], ['yetim', 'Yetim'],
  ['kurban', 'Kurban'], ['insaat', 'İnşaat'], ['zekat', 'Zekât'], ['fitre', 'Fitre'], ['fidye', 'Fidye'],
  ['sadaka', 'Sadaka'], ['adak', 'Adak'], ['akika', 'Akika'],
] as const

const REF_CURRENCIES = [['TRY', 'Tutar (TL)', '₺'], ['USD', 'Tutar (Dolar)', '$'], ['EUR', 'Tutar (Euro)', '€'], ['GBP', 'Tutar (Sterlin)', '£'], ['RUB', 'Tutar (Ruble)', '₽']] as const
const KURBAN_TYPES = [['vacip', 'Vacip'], ['adak', 'Adak'], ['akika', 'Akika'], ['sukur', 'Şükür'], ['nafile', 'Nafile'], ['sadaka', 'Sadaka'], ['sifa', 'Şifa']]
const KURBAN_KINDS = [['buyukbas', 'Büyükbaş (Dana)'], ['koc', 'Koç'], ['koyun', 'Koyun'], ['keci', 'Keçi']]
const STATUSES = [['active', 'Aktif'], ['paused', 'Pasif'], ['draft', 'Taslak'], ['completed', 'Tamamlandı'], ['cancelled', 'İptal']] as const

export interface CampaignTab { id: string; name: string; parent_name?: string | null; is_active: boolean }

export interface CampaignData {
  id: string; title: string; slug: string; summary: string; story?: string | null; category: string; status: string
  target_cents: number; collected_cents: number; currency: string; cover_image_url?: string | null; gallery_urls?: string[]
  video_url?: string | null; suggested_amounts_cents?: number[]; allow_custom_amount?: boolean; min_donation_cents?: number
  is_featured?: boolean; display_order?: number; show_collected?: boolean; show_donor_list?: boolean; translations?: Translations
  campaign_type: string; display_name?: string | null; country?: string | null; reference_amounts: Record<string, number>
  fixed_amount: boolean; quantity_multiplier?: number | null; declaration_item?: string | null; groups: string[]
  is_zakat: boolean; show_on_site: boolean; tab_id?: string | null; redirect_mode: string; redirect_target?: string | null
  seo_title?: string | null; seo_description?: string | null; type_details: Record<string, unknown>
  progress_percentage?: number
}

const money = (cents?: number | null) => (cents ? String(cents / 100).replace('.', ',') : '')
const cents = (text: string) => {
  const n = Number(String(text).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

function formFrom(c?: CampaignData) {
  return {
    campaign_type: c?.campaign_type || 'standard',
    status: c?.status || 'active',
    title: c?.title || '',
    country: c?.country || '',
    category: c?.category || 'genel',
    declaration_item: c?.declaration_item || '',
    is_zakat: c?.is_zakat ?? false,
    summary: c?.summary || '',
    story: c?.story || '',
    kurban_type: String(c?.type_details?.kurban_type || ''),
    kurban_kind: String(c?.type_details?.kurban_kind || ''),
    share_count: String(c?.type_details?.share_count || '7'),
    refs: Object.fromEntries(REF_CURRENCIES.map(([k]) => [k, money(c?.reference_amounts?.[k])])) as Record<string, string>,
    fixed_amount: c?.fixed_amount ?? false,
    quantity_multiplier: c?.quantity_multiplier ? String(c.quantity_multiplier) : '',
    variants: (c?.suggested_amounts_cents || []).map((v) => String(v / 100)).join(', '),
    target: money(c?.target_cents) || '0',
    currency: c?.currency || 'TRY',
    min_donation: money(c?.min_donation_cents ?? 1000),
    allow_custom_amount: c?.allow_custom_amount ?? true,
    display_name: c?.display_name || '',
    tab_id: c?.tab_id || '',
    groups: (c?.groups || []).join(', '),
    display_order: String(c?.display_order ?? 0),
    cover_image_url: c?.cover_image_url || '',
    show_on_site: c?.show_on_site ?? true,
    is_featured: c?.is_featured ?? false,
    show_collected: c?.show_collected ?? true,
    show_donor_list: c?.show_donor_list ?? true,
    redirect_mode: c?.redirect_mode || 'own',
    redirect_target: c?.redirect_target || '',
    slug: c?.slug || '',
    seo_title: c?.seo_title || '',
    seo_description: c?.seo_description || '',
  }
}

function Section({ title, hint, accent, children }: { title: string; hint?: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className={accent ? 'bg-primary-600 px-5 py-3.5 text-white' : 'border-b border-gray-100 px-5 py-3.5'}>
        <h2 className={`text-[15px] font-bold ${accent ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
        {hint && <p className={`mt-0.5 text-[12.5px] ${accent ? 'text-white/80' : 'text-gray-500'}`}>{hint}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function CampaignEditor({ campaign, onSaved, onCancel }: {
  campaign?: CampaignData
  onSaved: (c: CampaignData) => void
  onCancel: () => void
}) {
  const initial = useMemo(() => formFrom(campaign), [campaign])
  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial) }, [initial])
  const [tabs, setTabs] = useState<CampaignTab[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storyPreview, setStoryPreview] = useState(false)
  const storyRef = useRef<HTMLTextAreaElement>(null)
  const [gallery, setGallery] = useState<string[]>(campaign?.gallery_urls || [])
  const [pendingImage, setPendingImage] = useState('')
  const [videoUrl, setVideoUrl] = useState(campaign?.video_url || '')
  const [translations, setTranslations] = useState<Translations>(campaign?.translations || {})
  useEffect(() => {
    adminGet<CampaignTab[]>('/campaign-tabs').then((res) => setTabs(res.data)).catch(() => setTabs([]))
  }, [])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
    || JSON.stringify(gallery) !== JSON.stringify(campaign?.gallery_urls || [])
    || videoUrl !== (campaign?.video_url || '')
    || JSON.stringify(translations) !== JSON.stringify(campaign?.translations || {})
  const isKurban = form.campaign_type === 'kurban'

  const format = (prefix: string, suffix = '') => {
    const el = storyRef.current
    const cur = form.story
    const start = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    const picked = cur.slice(start, end) || (suffix ? 'metin' : 'Başlık')
    set('story', `${cur.slice(0, start)}${prefix}${picked}${suffix}${cur.slice(end)}`)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const reference_amounts = Object.fromEntries(Object.entries(form.refs).map(([k, v]) => [k, cents(v)]).filter(([, v]) => v))
    if (form.fixed_amount && !reference_amounts.TRY) { setError('Sabit tutar için TL referans tutarını girin'); return }
    if (isKurban && (!form.kurban_type || !form.kurban_kind)) { setError('Kurban türü ve cinsini seçin'); return }
    const body: Record<string, unknown> = {
      campaign_type: form.campaign_type,
      status: form.status,
      title: form.title.trim(),
      summary: form.summary.trim() || form.title.trim(),
      story: form.story.trim() || null,
      category: isKurban ? 'kurban' : form.campaign_type === 'water_well' ? 'su' : form.category,
      country: form.country || null,
      declaration_item: form.declaration_item || null,
      is_zakat: form.is_zakat,
      type_details: isKurban ? { kurban_type: form.kurban_type, kurban_kind: form.kurban_kind, share_count: Number(form.share_count) || 1 } : {},
      reference_amounts,
      fixed_amount: form.fixed_amount,
      quantity_multiplier: Number(form.quantity_multiplier) || null,
      suggested_amounts_cents: form.variants.split(',').map((v) => cents(v)).filter(Boolean),
      target_cents: cents(form.target),
      currency: form.currency,
      min_donation_cents: Math.max(100, cents(form.min_donation) || 1000),
      allow_custom_amount: form.fixed_amount ? false : form.allow_custom_amount,
      display_name: form.display_name || null,
      tab_id: form.tab_id || null,
      groups: form.groups.split(',').map((g) => g.trim()).filter(Boolean),
      display_order: Number(form.display_order) || 0,
      cover_image_url: form.cover_image_url || null,
      show_on_site: form.show_on_site,
      is_featured: form.is_featured,
      show_collected: form.show_collected,
      show_donor_list: form.show_donor_list,
      redirect_mode: form.redirect_mode,
      redirect_target: form.redirect_mode === 'own' ? null : form.redirect_target || null,
      slug: form.slug.trim() || undefined,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      video_url: videoUrl.trim() || null,
      translations,
    }
    setBusy(true)
    try {
      const res = campaign
        ? await v1Send<CampaignData>('patch', `/campaigns/${campaign.id}`, body)
        : await v1Send<CampaignData>('post', '/campaigns', body)
      if (campaign && JSON.stringify(gallery) !== JSON.stringify(campaign.gallery_urls || [])) {
        await adminSend('put', `/campaigns/${campaign.id}/gallery`, { gallery_urls: gallery })
      }
      onSaved({ ...res.data, gallery_urls: gallery })
    } catch (err) {
      setError(apiErrorMessage(err, 'Kampanya kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }

  const check = (k: 'is_zakat' | 'fixed_amount' | 'allow_custom_amount' | 'show_on_site' | 'is_featured' | 'show_collected' | 'show_donor_list', label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] text-gray-700">
      <input type="checkbox" className="mt-0.5" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-[12px] text-gray-500">{hint}</span>}</span>
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Type + status */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-gray-600">Kampanya Türü *</div>
          <div className="flex flex-wrap overflow-hidden rounded-xl border border-gray-200 bg-white">
            {CAMPAIGN_TYPES.map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => set('campaign_type', k)} aria-pressed={form.campaign_type === k}
                className={`inline-flex items-center gap-2 border-e border-gray-200 px-4 py-2.5 text-[13px] font-bold uppercase last:border-e-0 ${
                  form.campaign_type === k ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="ms-auto">
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-gray-600">Durum *</div>
          <div className="flex flex-wrap overflow-hidden rounded-xl border border-gray-200 bg-white">
            {STATUSES.map(([k, label]) => (
              <button key={k} type="button" onClick={() => set('status', k)} aria-pressed={form.status === k}
                className={`border-e border-gray-200 px-3.5 py-2.5 text-[13px] font-semibold last:border-e-0 ${
                  form.status === k ? (k === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-white') : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Section title="Kampanya Bilgisi" accent>
        <div className="grid gap-4 md:grid-cols-2">
          <Label label="Kampanya Adı *">
            <input className={inputClass} required maxLength={300} value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Label>
          <Label label="Kampanya Ülkesi">
            <input className={inputClass} list="campaign-countries" placeholder="Seçili değil" value={form.country} onChange={(e) => set('country', e.target.value)} />
            <datalist id="campaign-countries">
              {['Türkiye', 'Filistin', 'Gazze', 'Suriye', 'Yemen', 'Afganistan', 'Afrika', 'Somali', 'Sudan', 'Çad', 'Nijer', 'Bangladeş', 'Pakistan', 'Arakan', 'Doğu Türkistan', 'Bosna Hersek'].map((c) => <option key={c} value={c} />)}
            </datalist>
          </Label>
          {isKurban && (
            <>
              <Label label="Kurban Türü *">
                <select className={inputClass} value={form.kurban_type} onChange={(e) => set('kurban_type', e.target.value)}>
                  <option value="">Bir seçenek seçin</option>
                  {KURBAN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Label>
              <Label label="Kurban Cinsi *">
                <select className={inputClass} value={form.kurban_kind} onChange={(e) => {
                  set('kurban_kind', e.target.value)
                  set('share_count', e.target.value === 'buyukbas' ? '7' : '1')
                }}>
                  <option value="">Bir seçenek seçin</option>
                  {KURBAN_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Label>
              <Label label="Kurbanın Bölünecek Hisse/Adet Sayısı">
                <select className={inputClass} value={form.share_count} onChange={(e) => set('share_count', e.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Label>
            </>
          )}
          {!isKurban && form.campaign_type !== 'water_well' && (
            <Label label="Bağış Türü (raporlar için)">
              <select className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Label>
          )}
          <Label label="Beyanname Kalemi">
            <input className={inputClass} placeholder="Eşlenmemiş" value={form.declaration_item} onChange={(e) => set('declaration_item', e.target.value)} />
          </Label>
          <div className="flex items-end pb-2">{check('is_zakat', 'Zekât kampanyası', 'Zekât bağışları bu kampanyaya yönlendirilebilir ve raporlarda ayrı görünür.')}</div>
          <div className="md:col-span-2">
            <Label label="Kısa Özet">
              <textarea className={`${inputClass} min-h-[60px]`} value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Kampanya listesinde görünen kısa açıklama" />
            </Label>
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-gray-700">Kampanya Hikayesi / Detay</span>
              <div className="flex gap-1.5 text-[11.5px]">
                {!storyPreview && (
                  <>
                    <button type="button" onClick={() => format('## ')} className="rounded border border-gray-200 px-2 py-0.5 font-semibold hover:bg-gray-50">Başlık</button>
                    <button type="button" onClick={() => format('**', '**')} className="rounded border border-gray-200 px-2 py-0.5 font-bold hover:bg-gray-50">B</button>
                    <button type="button" onClick={() => format('- ')} className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50">• Liste</button>
                  </>
                )}
                <button type="button" onClick={() => setStoryPreview((v) => !v)} className="rounded border border-gray-200 px-2 py-0.5 font-semibold text-primary-700 hover:bg-gray-50">
                  {storyPreview ? 'Düzenle' : 'Önizleme'}
                </button>
              </div>
            </div>
            {storyPreview ? (
              <div className="min-h-[140px] rounded-lg border border-gray-200 bg-gray-50 p-3">
                {form.story.trim() ? <FormattedStory text={form.story} /> : <p className="text-[13px] italic text-gray-400">Önizlenecek metin yok.</p>}
              </div>
            ) : (
              <textarea ref={storyRef} rows={6} className={inputClass} value={form.story} onChange={(e) => set('story', e.target.value)}
                placeholder="## Proje Amacı&#10;Kampanyanın detaylarını yazın. **Kalın** veya - madde kullanabilirsiniz." />
            )}
          </div>
        </div>
      </Section>

      <Section title="Referans Tutarlar" hint="İsteğe bağlı referans bağış tutarları (para birimi başına).">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REF_CURRENCIES.map(([k, label, sym]) => (
            <Label key={k} label={k === 'TRY' && form.fixed_amount ? `${label} *` : label}>
              <div className="flex overflow-hidden rounded-lg border border-gray-300 focus-within:border-primary-600">
                <input className="min-w-0 flex-1 p-2.5 text-sm outline-none" inputMode="decimal" value={form.refs[k] || ''}
                  onChange={(e) => set('refs', { ...form.refs, [k]: e.target.value })} />
                <span className="flex w-10 items-center justify-center border-s border-gray-200 bg-gray-50 text-gray-500">{sym}</span>
              </div>
            </Label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">{check('fixed_amount', 'Sabit Tutar', 'Bağışçı bu tutardan başka rakam giremez.')}</div>
          <Label label="Adet Çarpanı" hint="Makbuz/raporlarda gerçek adet = adet × çarpan (örn. 1 alım = N hisse).">
            <input className={inputClass} inputMode="numeric" placeholder="Çarpan varsa girebilirsiniz" value={form.quantity_multiplier}
              onChange={(e) => set('quantity_multiplier', e.target.value.replace(/\D/g, ''))} />
          </Label>
          <Label label="Özel Varyant" hint="Web bağış formunda hazır tutar seçenekleri (virgülle ayırın).">
            <input className={inputClass} placeholder="10, 20, 30 gibi" value={form.variants} onChange={(e) => set('variants', e.target.value)} />
          </Label>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Label label="Hedef Tutar"><input className={inputClass} inputMode="decimal" value={form.target} onChange={(e) => set('target', e.target.value)} /></Label>
            <Label label="Para Birimi">
              <select className={inputClass} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {['TRY', 'USD', 'EUR', 'GBP', 'SAR', 'CHF'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Label>
          </div>
          <Label label="En Az Bağış"><input className={inputClass} inputMode="decimal" value={form.min_donation} onChange={(e) => set('min_donation', e.target.value)} /></Label>
          {!form.fixed_amount && check('allow_custom_amount', 'Serbest tutar', 'Bağışçı kendi tutarını yazabilir.')}
        </div>
      </Section>

      <Section title="Web Site Ayarları">
        <div className="grid gap-4 md:grid-cols-2">
          <Label label="Web Site Görünen Ad" hint="Web sitesinde gösterilecek başlık (boşsa kampanya adı kullanılır).">
            <input className={inputClass} value={form.display_name} onChange={(e) => set('display_name', e.target.value)} />
          </Label>
          <Label label="Web Site / Gösterilecek Sekme">
            <select className={inputClass} value={form.tab_id} onChange={(e) => set('tab_id', e.target.value)}>
              <option value="">Sekmesiz</option>
              {tabs.map((t) => <option key={t.id} value={t.id}>{t.parent_name ? `${t.parent_name} › ` : ''}{t.name}{t.is_active ? '' : ' (pasif)'}</option>)}
            </select>
          </Label>
          <Label label="Kampanya Grupları" hint="Virgülle ayırın.">
            <input className={inputClass} placeholder="Seçili değil" value={form.groups} onChange={(e) => set('groups', e.target.value)} />
          </Label>
          <Label label="Öncelik"><input type="number" className={inputClass} value={form.display_order} onChange={(e) => set('display_order', e.target.value)} /></Label>
          <ImageField label="Öne Çıkan Görsel" value={form.cover_image_url} onChange={(url) => set('cover_image_url', url)} />
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-gray-700">Kampanya Sayfasını Yönlendir</div>
            <div className="flex flex-wrap gap-4 text-[13.5px]">
              {([['own', 'Bağışı kendi sayfasında göster'], ['url', 'URL'], ['page', 'SAYFA']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="radio" name="redirect" checked={form.redirect_mode === k} onChange={() => set('redirect_mode', k)} />{l}</label>
              ))}
            </div>
            {form.redirect_mode !== 'own' && (
              <input className={`${inputClass} mt-2`} placeholder={form.redirect_mode === 'url' ? 'https://…' : '/sayfa/hakkimizda'}
                value={form.redirect_target} onChange={(e) => set('redirect_target', e.target.value)} />
            )}
          </div>
          <Label label="URL (slug)"><input className={inputClass} placeholder="otomatik" value={form.slug} onChange={(e) => set('slug', e.target.value)} /></Label>
          <div className="grid gap-2.5 md:col-span-2 md:grid-cols-2">
            {check('show_on_site', 'Web / 1 — Sitede listele', 'Kapalıysa kampanya listelerde görünmez; doğrudan bağlantı çalışır.')}
            {check('is_featured', 'Web / 2 — Öne çıkar', 'Anasayfa ve öne çıkanlar alanında gösterilir.')}
            {check('show_collected', 'Toplanan tutarı göster')}
            {check('show_donor_list', 'Bağışçı listesini göster')}
          </div>
        </div>
      </Section>

      <Section title="SEO" hint="Arama motorlarında görünen başlık ve açıklama; boşsa kampanya adı ve özeti kullanılır.">
        <div className="grid gap-4 md:grid-cols-2">
          <Label label="SEO Başlığı"><input className={inputClass} maxLength={200} value={form.seo_title} onChange={(e) => set('seo_title', e.target.value)} /></Label>
          <Label label="SEO Açıklaması"><input className={inputClass} maxLength={400} value={form.seo_description} onChange={(e) => set('seo_description', e.target.value)} /></Label>
        </div>
      </Section>

      {campaign && (
        <Section title={`Galeri & Video (${gallery.length})`}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1"><ImageField label="Galeriye görsel ekle" value={pendingImage} onChange={setPendingImage} /></div>
            <button type="button" disabled={!pendingImage.trim()} onClick={() => { setGallery((g) => [...g, pendingImage.trim()]); setPendingImage('') }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-semibold hover:bg-gray-50 disabled:opacity-50">
              <ImagePlus className="h-4 w-4" /> Galeriye Ekle
            </button>
          </div>
          {gallery.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {gallery.map((url, i) => (
                <div key={`${url}-${i}`} className="group relative aspect-video overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Galeri ${i + 1}`} className="h-full w-full object-cover" />
                  <div className="absolute end-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" disabled={i === 0} aria-label="Öne al" onClick={() => setGallery((g) => { const n = [...g]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} className="rounded bg-gray-900/75 p-1 text-white disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                    <button type="button" disabled={i === gallery.length - 1} aria-label="Arkaya al" onClick={() => setGallery((g) => { const n = [...g]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })} className="rounded bg-gray-900/75 p-1 text-white disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                    <button type="button" aria-label="Kaldır" onClick={() => setGallery((g) => g.filter((_, j) => j !== i))} className="rounded bg-rose-600 p-1 text-white"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 max-w-xl">
            <Label label="Tanıtım Video URL"><input className={inputClass} placeholder="https://www.youtube.com/watch?v=…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} /></Label>
          </div>
        </Section>
      )}

      <Section title="Çeviriler">
        <TranslationEditor value={translations} onChange={setTranslations}
          fields={[{ key: 'title', label: 'Kampanya adı' }, { key: 'summary', label: 'Özet' }, { key: 'story', label: 'Hikaye', long: true }]} />
      </Section>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur">
        {dirty && <span className="text-[13px] font-medium text-amber-600">Kaydedilmemiş değişiklik var</span>}
        {error && <span className="text-[13px] font-semibold text-rose-600">{error}</span>}
        <div className="ms-auto flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">İptal</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            <Check className="h-4 w-4" /> {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </form>
  )
}

/** Toast after a save; kept here so the list and the editor pages say the same thing. */
export const savedNotice = (created: boolean) => toast.ok(created ? 'Kampanya oluşturuldu' : 'Kampanya kaydedildi')
