'use client'

import { useEffect, useMemo, useState } from 'react'
import { brandCssVariables } from '@e-infak/theme'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { ImageField } from '../../../../components/admin/ImageField'
import { TranslationEditor, type Translations } from '../../../../components/admin/TranslationEditor'
import { DEFAULT_DESIGN, siteDesignStyle, type SiteDesign } from '../../../../lib/site-design'

interface Appearance {
  template: 'klasik' | 'kategori' | 'sade'
  tagline: string | null
  primary_color: string
  accent_color: string
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  hero: { badge?: string; title?: string; subtitle?: string; image_url?: string; cta_label?: string; cta_url?: string; slider?: boolean }
  design: SiteDesign
  home_sections: string[]
  cta_band: { title?: string; text?: string; button_label?: string; button_url?: string }
  testimonials: { quote: string; name?: string; role?: string }[]
  footer_text: string | null
  social_links: Record<string, string>
  show_in_directory: boolean
  translations: Translations
}

interface Loaded extends Appearance {
  name: string
  url: string
  templates: { key: Appearance['template']; label: string; default_sections: string[] }[]
  sections: { key: string; label: string }[]
  fonts: { key: string; label: string }[]
  theme_kits: { key: string; label: string; primary_color: string; accent_color: string; design: SiteDesign }[]
}

const RADIUS_OPTIONS = [['none', 'Köşeli'], ['small', 'Hafif'], ['medium', 'Orta'], ['large', 'Yuvarlak'], ['pill', 'Çok yuvarlak']]
const CONTAINER_OPTIONS = [['narrow', 'Dar (1080 px)'], ['normal', 'Normal (1200 px)'], ['wide', 'Geniş (1320 px)'], ['full', 'Çok geniş (1440 px)']]
const WEIGHT_OPTIONS = [['500', 'Orta'], ['600', 'Yarı kalın'], ['700', 'Kalın'], ['800', 'Ekstra kalın'], ['900', 'Siyah']]

const SOCIAL = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x', 'X (Twitter)'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['telegram', 'Telegram']]
const I18N_FIELDS = [
  { key: 'tagline', label: 'Kısa slogan' }, { key: 'hero_badge', label: 'Kapak rozeti' }, { key: 'hero_title', label: 'Kapak başlığı' },
  { key: 'hero_subtitle', label: 'Kapak açıklaması', long: true }, { key: 'hero_cta_label', label: 'Kapak buton yazısı' },
  { key: 'cta_title', label: 'Çağrı bandı başlığı' }, { key: 'cta_text', label: 'Çağrı bandı metni' },
  { key: 'cta_button_label', label: 'Çağrı bandı butonu' }, { key: 'footer_text', label: 'Alt bilgi metni', long: true },
]

function TemplateThumb({ template }: { template: Appearance['template'] }) {
  // Tiny wireframe so the difference between templates is visible at a glance.
  return (
    <div className="space-y-1 rounded-md border bg-white p-2">
      <div className="h-1.5 w-1/2 rounded bg-gray-200" />
      {template === 'klasik' && (
        <>
          <div className="flex h-10 items-end justify-center gap-0.5 rounded bg-primary-900 p-1">{[0, 1, 2].map((i) => <div key={i} className={`h-1 rounded ${i ? 'w-1 bg-white/50' : 'w-3 bg-white'}`} />)}</div>
          <div className="flex gap-1"><div className="h-3 flex-1 rounded bg-gray-100" /><div className="h-3 w-1/3 rounded bg-primary-100" /></div>
        </>
      )}
      {template === 'kategori' && (
        <>
          <div className="h-8 rounded bg-primary-900" />
          <div className="grid grid-cols-4 gap-0.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-2.5 rounded bg-primary-100" />)}</div>
        </>
      )}
      {template === 'sade' && (
        <div className="flex h-10 gap-1 p-1"><div className="flex-1 space-y-1"><div className="h-1.5 rounded bg-gray-300" /><div className="h-1.5 w-2/3 rounded bg-gray-200" /></div><div className="w-1/3 rounded bg-primary-100" /></div>
      )}
      <div className="grid grid-cols-3 gap-0.5">{[0, 1, 2].map((i) => <div key={i} className="h-3 rounded bg-gray-100" />)}</div>
    </div>
  )
}

export default function AppearancePage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [form, setForm] = useState<Appearance | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminGet<Loaded>('/site-appearance')
      .then((res) => { setLoaded(res.data); setForm(res.data) })
      .catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Görünüm ayarları yüklenemedi') }))
  }, [])

  const previewStyle = useMemo(
    () => (form ? (brandCssVariables(form.primary_color, form.accent_color) as React.CSSProperties) : undefined),
    [form?.primary_color, form?.accent_color],
  )
  const designStyle = useMemo(
    () => ({ ...previewStyle, ...siteDesignStyle(form?.design) }),
    [previewStyle, form?.design],
  )

  if (!form || !loaded) {
    return <div className="space-y-4"><h1 className="text-3xl font-bold">Görünüm & Tema</h1><Notice message={message} /></div>
  }

  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const setHero = (key: keyof Appearance['hero'], value: string | boolean) => set('hero', { ...form.hero, [key]: value })
  const design = form.design || DEFAULT_DESIGN
  const setDesign = <K extends keyof SiteDesign>(key: K, value: SiteDesign[K]) => set('design', { ...design, [key]: value })
  const applyKit = (kit: Loaded['theme_kits'][number]) =>
    setForm((f) => (f ? { ...f, primary_color: kit.primary_color, accent_color: kit.accent_color, design: { ...kit.design } } : f))
  const fontLabel = (key: string) => loaded.fonts.find((f) => f.key === key)?.label || key
  const testimonials = form.testimonials || []
  const setTestimonial = (i: number, key: 'quote' | 'name' | 'role', value: string) =>
    set('testimonials', testimonials.map((item, n) => (n === i ? { ...item, [key]: value } : item)))
  const setCta = (key: keyof Appearance['cta_band'], value: string) => set('cta_band', { ...form.cta_band, [key]: value })

  const enabled = form.home_sections
  const disabled = loaded.sections.map((s) => s.key).filter((k) => !enabled.includes(k))
  const labelOf = (key: string) => loaded.sections.find((s) => s.key === key)?.label || key
  const move = (key: string, delta: number) => {
    const list = [...enabled]
    const i = list.indexOf(key)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    set('home_sections', list)
  }
  const dropOn = (target: string) => {
    if (!dragged || dragged === target) return
    const list = enabled.filter((k) => k !== dragged)
    list.splice(list.indexOf(target), 0, dragged)
    set('home_sections', list)
    setDragged(null)
  }

  const chooseTemplate = (key: Appearance['template']) => {
    const preset = loaded.templates.find((t) => t.key === key)
    setForm((f) => (f ? { ...f, template: key, home_sections: f.template === key ? f.home_sections : preset?.default_sections || f.home_sections } : f))
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))
      const res = await adminSend<Appearance>('put', '/site-appearance', {
        ...form,
        tagline: form.tagline || null,
        logo_url: form.logo_url || null,
        logo_dark_url: form.logo_dark_url || null,
        favicon_url: form.favicon_url || null,
        footer_text: form.footer_text || null,
        hero: clean(form.hero),
        cta_band: clean(form.cta_band),
        social_links: clean(form.social_links),
        testimonials: testimonials.filter((item) => item.quote?.trim()).map((item) => clean(item)),
      })
      setForm(res.data)
      setMessage({ type: 'ok', text: 'Görünüm kaydedildi. Değişiklikler sitede en geç bir dakika içinde görünür.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Kaydedilemedi') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Görünüm & Tema</h1>
          <p className="mt-1 text-sm text-gray-500">{loaded.name} sitesinin şablonu, renkleri, logosu ve ana sayfa düzeni.</p>
        </div>
        <div className="flex gap-2">
          <a href={loaded.url} target="_blank" rel="noreferrer" className={ghostButton}>Siteyi görüntüle ↗</a>
          <button onClick={save} disabled={saving} className={primaryButton}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </div>

      <Notice message={message} />

      <div className="grid items-start gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">Şablon</h2>
            <div className="grid gap-3 sm:grid-cols-3" style={previewStyle}>
              {loaded.templates.map((t) => (
                <button key={t.key} type="button" onClick={() => chooseTemplate(t.key)}
                  className={`space-y-2 rounded-xl border-2 p-3 text-left ${form.template === t.key ? 'border-primary-600 bg-primary-600/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <TemplateThumb template={t.key} />
                  <div className="text-sm font-bold text-gray-900">{t.label.split(' — ')[0]}</div>
                  <div className="text-xs text-gray-500">{t.label.split(' — ')[1]}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">Marka</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {([['primary_color', 'Ana renk'], ['accent_color', 'Vurgu rengi']] as const).map(([key, label]) => (
                <Label key={key} label={label}>
                  <span className="flex gap-2">
                    <input type="color" value={form[key]} onChange={(e) => set(key, e.target.value.toUpperCase())} className="h-10 w-14 rounded border" aria-label={label} />
                    <input className={inputClass} value={form[key]} onChange={(e) => set(key, e.target.value)} />
                  </span>
                </Label>
              ))}
              <ImageField label="Logo" preview="square" value={form.logo_url} onChange={(v) => set('logo_url', v)} hint="Kare, en az 256×256 önerilir" />
              <ImageField label="Koyu zemin logosu (isteğe bağlı)" preview="square" value={form.logo_dark_url} onChange={(v) => set('logo_dark_url', v)} />
              <ImageField label="Site simgesi (favicon)" preview="square" value={form.favicon_url} onChange={(v) => set('favicon_url', v)} hint="Boşsa logo kullanılır" />
              <TextInput label="Kısa slogan (logonun altında)" maxLength={120} value={form.tagline} onChange={(v) => set('tagline', v)} />
            </div>
          </Card>

          <Card className="space-y-5 border border-gray-100 p-6 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Tasarım sistemi</h2>
              <p className="text-xs text-gray-500">Bir tema kiti seçin veya yazı tipi, köşe ve genişlik ayarlarını tek tek değiştirin. Tüm sayfalara ve site yapıcı bloklarına uygulanır.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {loaded.theme_kits.map((kit) => {
                const active = form.primary_color === kit.primary_color && form.accent_color === kit.accent_color
                  && JSON.stringify(design) === JSON.stringify({ ...DEFAULT_DESIGN, ...kit.design })
                return (
                  <button key={kit.key} type="button" onClick={() => applyKit(kit)}
                    style={{ ...(brandCssVariables(kit.primary_color, kit.accent_color) as React.CSSProperties), ...siteDesignStyle(kit.design) }}
                    className={`site-design rounded-xl border-2 p-3 text-left ${active ? 'border-primary-600 ring-2 ring-primary-100' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex gap-1">
                      <span className="h-5 w-5 rounded-full" style={{ background: kit.primary_color }} />
                      <span className="h-5 w-5 rounded-full" style={{ background: kit.accent_color }} />
                      <span className="h-5 w-5 rounded-full border" style={{ background: kit.design.page_color }} />
                    </div>
                    <h3 className="mt-2 font-heading text-base">{kit.label}</h3>
                    <p className="text-[11px] opacity-70">{fontLabel(kit.design.heading_font)} / {fontLabel(kit.design.body_font)}</p>
                    <span className="mt-2 inline-block rounded-lg bg-primary-600 px-2.5 py-1 text-[11px] font-bold text-white">Bağış Yap</span>
                  </button>
                )
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([['heading_font', 'Başlık yazı tipi'], ['body_font', 'Metin yazı tipi']] as const).map(([key, label]) => (
                <Label key={key} label={label}>
                  <select className={inputClass} value={design[key]} onChange={(e) => setDesign(key, e.target.value)}
                    style={{ fontFamily: `var(--ff-${design[key]})` }}>
                    {loaded.fonts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </Label>
              ))}
              <Label label="Başlık kalınlığı">
                <select className={inputClass} value={design.heading_weight} onChange={(e) => setDesign('heading_weight', e.target.value)}>
                  {WEIGHT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Label>
              <Label label="Başlık harfleri">
                <select className={inputClass} value={design.heading_case} onChange={(e) => setDesign('heading_case', e.target.value as SiteDesign['heading_case'])}>
                  <option value="normal">Normal</option>
                  <option value="uppercase">TÜMÜ BÜYÜK</option>
                </select>
              </Label>
              <Label label="Köşe yuvarlaklığı (buton, kart)">
                <select className={inputClass} value={design.radius} onChange={(e) => setDesign('radius', e.target.value as SiteDesign['radius'])}>
                  {RADIUS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Label>
              <Label label="İçerik genişliği">
                <select className={inputClass} value={design.container} onChange={(e) => setDesign('container', e.target.value as SiteDesign['container'])}>
                  {CONTAINER_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Label>
              {([['page_color', 'Sayfa zemini'], ['text_color', 'Metin rengi']] as const).map(([key, label]) => (
                <Label key={key} label={label}>
                  <span className="flex gap-2">
                    <input type="color" value={design[key]} onChange={(e) => setDesign(key, e.target.value.toUpperCase())} className="h-10 w-14 rounded border" aria-label={label} />
                    <input className={inputClass} value={design[key]} onChange={(e) => setDesign(key, e.target.value)} />
                  </span>
                </Label>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">Kapak (ana sayfanın üst bölümü)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Rozet" maxLength={60} placeholder="İLİMLE YETİŞEN NESİLLER" value={form.hero.badge} onChange={(v) => setHero('badge', v)} />
              <TextInput label="Başlık" maxLength={140} value={form.hero.title} onChange={(v) => setHero('title', v)} />
              <div className="sm:col-span-2"><TextArea label="Açıklama" rows={2} maxLength={400} value={form.hero.subtitle} onChange={(v) => setHero('subtitle', v)} /></div>
              <div className="sm:col-span-2"><ImageField label="Kapak görseli" value={form.hero.image_url} onChange={(v) => setHero('image_url', v)} hint="Yatay, en az 1600 px genişlik önerilir" /></div>
              <TextInput label="Buton yazısı" maxLength={60} placeholder="Bağış Yap" value={form.hero.cta_label} onChange={(v) => setHero('cta_label', v)} />
              <TextInput label="Buton bağlantısı" placeholder="/kampanyalar (boşsa bağış formuna gider)" value={form.hero.cta_url} onChange={(v) => setHero('cta_url', v)} />
            </div>
            <label className="flex items-start gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" className="mt-1" checked={form.hero.slider !== false} onChange={(e) => setHero('slider', e.target.checked)} />
              <span>Kapağı slider yap: görseli olan aktif kampanyalar (önce öne çıkanlar, en fazla 4) kapaktan sonra slayt olarak döner
                <span className="block text-xs font-normal text-gray-400">Kendi slaytlarınızı tasarlamak için Site Yapıcı&apos;daki Slider bloğunu kullanabilirsiniz.</span></span>
            </label>
          </Card>

          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Ana sayfa bölümleri</h2>
              <p className="text-xs text-gray-500">Sürükleyip bırakarak veya oklarla sıralayın; gizlemek için kaldırın.</p>
            </div>
            <ul className="space-y-1.5">
              {enabled.map((key, index) => (
                <li key={key} draggable onDragStart={() => setDragged(key)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(key)}
                  className={`flex cursor-move items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm ${dragged === key ? 'opacity-50' : ''}`}>
                  <span className="text-gray-300">⋮⋮</span>
                  <span className="flex-1 font-semibold">{labelOf(key)}</span>
                  <button type="button" onClick={() => move(key, -1)} disabled={index === 0} className="text-xs text-gray-500 disabled:opacity-20" aria-label="Yukarı">▲</button>
                  <button type="button" onClick={() => move(key, 1)} disabled={index === enabled.length - 1} className="text-xs text-gray-500 disabled:opacity-20" aria-label="Aşağı">▼</button>
                  <button type="button" onClick={() => set('home_sections', enabled.filter((k) => k !== key))} className="text-xs font-bold text-red-600">Gizle</button>
                </li>
              ))}
            </ul>
            {disabled.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {disabled.map((key) => (
                  <button key={key} type="button" onClick={() => set('home_sections', [...enabled, key])} className={ghostButton}>+ {labelOf(key)}</button>
                ))}
              </div>
            )}
          </Card>

          {enabled.includes('cta') && (
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900">Çağrı bandı</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Başlık" maxLength={80} placeholder="Askıda Kardeşlik Payı" value={form.cta_band.title} onChange={(v) => setCta('title', v)} />
                <TextInput label="Buton yazısı" maxLength={80} value={form.cta_band.button_label} onChange={(v) => setCta('button_label', v)} />
                <div className="sm:col-span-2"><TextArea label="Metin" rows={2} maxLength={300} value={form.cta_band.text} onChange={(v) => setCta('text', v)} /></div>
                <TextInput label="Buton bağlantısı" placeholder="/kampanyalar/askida" value={form.cta_band.button_url} onChange={(v) => setCta('button_url', v)} />
              </div>
            </Card>
          )}

          {enabled.includes('testimonials') && (
            <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Teşekkür / referans mesajları</h2>
                <p className="text-xs text-gray-500">Bağışçılarınızdan veya yararlanıcılardan izin alarak paylaştığınız gerçek mesajlar. Boşsa bölüm görünmez.</p>
              </div>
              {testimonials.map((item, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4">
                  <TextArea label={`${i + 1}. mesaj`} rows={2} maxLength={400} value={item.quote} onChange={(v) => setTestimonial(i, 'quote', v)} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput label="İsim" maxLength={80} value={item.name} onChange={(v) => setTestimonial(i, 'name', v)} />
                    <TextInput label="Unvan / şehir" maxLength={80} value={item.role} onChange={(v) => setTestimonial(i, 'role', v)} />
                  </div>
                  <button type="button" onClick={() => set('testimonials', testimonials.filter((_, n) => n !== i))} className="text-xs font-bold text-red-600">Kaldır</button>
                </div>
              ))}
              {testimonials.length < 12 && (
                <button type="button" onClick={() => set('testimonials', [...testimonials, { quote: '' }])} className={ghostButton}>+ Mesaj ekle</button>
              )}
            </Card>
          )}

          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">Alt bilgi ve sosyal medya</h2>
            <TextArea label="Alt bilgi metni (kurum tanıtımı)" rows={2} maxLength={400} value={form.footer_text} onChange={(v) => set('footer_text', v)} />
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL.map(([key, label]) => (
                <TextInput key={key} label={label} placeholder="https://…" value={form.social_links[key]}
                  onChange={(v) => set('social_links', { ...form.social_links, [key]: v })} />
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={form.show_in_directory} onChange={(e) => set('show_in_directory', e.target.checked)} />
              e-infak.org ana sayfasındaki kurum listesinde görün
            </label>
          </Card>

          <Card className="border border-gray-100 p-6 shadow-sm">
            <TranslationEditor fields={I18N_FIELDS} value={form.translations} onChange={(v) => set('translations', v)} />
            <p className="mt-2 text-xs text-gray-400">Çeviri sekmeleri Site Ayarları &gt; Site Dilleri bölümünde dil seçildiğinde görünür.</p>
          </Card>
        </div>

        <div className="xl:sticky xl:top-6 xl:col-span-4">
          <Card className="overflow-hidden border border-gray-100 shadow-sm">
            <div className="border-b bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">Önizleme</div>
            <div style={designStyle} className="site-design admin-light font-sans text-[11px]">
              <div className="flex items-center gap-2 border-b bg-white px-3 py-2">
                {form.logo_url ? <img src={form.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="h-7 w-7 rounded-full bg-primary-600" />}
                <div className="leading-tight">
                  <div className="font-heading text-sm font-bold">{loaded.name}</div>
                  {form.tagline && <div className="text-[9px] font-semibold uppercase tracking-widest text-primary-600">{form.tagline}</div>}
                </div>
                <span className="ms-auto rounded bg-primary-600 px-2 py-1 font-bold text-white">Bağış Yap</span>
              </div>
              <div className={`relative ${form.template === 'sade' ? 'bg-white' : 'bg-primary-950'} px-4 py-6`}>
                {form.template !== 'sade' && form.hero.image_url && <img src={form.hero.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
                <div className="relative">
                  {form.hero.badge && <span className="mb-2 inline-block rounded-full bg-accent-500/30 px-2 py-0.5 text-[9px] font-bold tracking-widest text-accent-100">{form.hero.badge}</span>}
                  <div className={`font-heading text-lg font-bold leading-tight ${form.template === 'sade' ? 'text-gray-900' : 'text-white'}`}>{form.hero.title || loaded.name}</div>
                  <span className="mt-3 inline-block rounded bg-accent-500 px-3 py-1.5 font-bold text-white">{form.hero.cta_label || 'Bağış Yap'}</span>
                </div>
              </div>
              <div className="space-y-1 p-3">
                {enabled.map((key) => <div key={key} className="rounded border border-dashed border-primary-200 bg-primary-50 px-2 py-1.5 text-primary-800">{labelOf(key)}</div>)}
              </div>
              <div className="bg-primary-950 px-3 py-3 text-primary-100/80">{form.footer_text || `© ${loaded.name}`}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
