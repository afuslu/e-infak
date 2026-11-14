'use client'

import { useEffect, useMemo, useState } from 'react'
import { brandCssVariables } from '@e-infak/theme'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { ImageField } from '../admin/ImageField'
import { TranslationEditor, type Translations } from '../admin/TranslationEditor'
import { DEFAULT_DESIGN, siteDesignStyle, type SiteDesign } from '../../lib/site-design'

export interface ThemeAppearance {
  template: 'klasik' | 'kategori' | 'sade'
  tagline: string | null
  primary_color: string
  accent_color: string
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  hero: Record<string, unknown>
  design: SiteDesign
  home_sections: string[]
  cta_band: Record<string, unknown>
  testimonials: Record<string, unknown>[]
  footer_text: string | null
  social_links: Record<string, string>
  show_in_directory: boolean
  translations: Translations
}

interface LoadedAppearance extends ThemeAppearance {
  name: string
  url: string
  templates: { key: ThemeAppearance['template']; label: string; default_sections: string[] }[]
  fonts: { key: string; label: string }[]
  theme_kits: { key: string; label: string; primary_color: string; accent_color: string; design: SiteDesign }[]
}

export type ThemeLivePatch = Partial<
  Pick<
    ThemeAppearance,
    'template' | 'tagline' | 'primary_color' | 'accent_color' | 'logo_url' | 'logo_dark_url' | 'favicon_url' | 'design' | 'footer_text' | 'social_links'
  >
>

const RADIUS_OPTIONS = [['none', 'Köşeli'], ['small', 'Hafif'], ['medium', 'Orta'], ['large', 'Yuvarlak'], ['pill', 'Çok yuvarlak']]
const CONTAINER_OPTIONS = [['narrow', 'Dar (1080 px)'], ['normal', 'Normal (1200 px)'], ['wide', 'Geniş (1320 px)'], ['full', 'Çok geniş (1440 px)']]
const WEIGHT_OPTIONS = [['500', 'Orta'], ['600', 'Yarı kalın'], ['700', 'Kalın'], ['800', 'Ekstra kalın'], ['900', 'Siyah']]
const SOCIAL = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x', 'X (Twitter)'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['telegram', 'Telegram']]
const I18N_FIELDS = [
  { key: 'tagline', label: 'Kısa slogan' },
  { key: 'footer_text', label: 'Alt bilgi metni', long: true },
]

const HEX6 = /^#[0-9A-Fa-f]{6}$/
const safeHex = (val: string | undefined, fallback: string) => (val && HEX6.test(val) ? val : fallback)

function luminance(hex: string): number | null {
  if (!HEX6.test(hex)) return null
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number | null {
  const l1 = luminance(a)
  const l2 = luminance(b)
  if (l1 == null || l2 == null) return null
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function ColorInput({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-600">
      <span className="mb-1 block">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="color"
          value={safeHex(value, fallback)}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
          aria-label={label}
        />
        <input
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-mono uppercase outline-none focus:border-blue-500"
          value={value}
          maxLength={7}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  )
}

export function ThemePanel({ onLivePreview }: { onLivePreview: (patch: ThemeLivePatch) => void }) {
  const [loaded, setLoaded] = useState<LoadedAppearance | null>(null)
  const [saved, setSaved] = useState<ThemeAppearance | null>(null)
  const [form, setForm] = useState<ThemeAppearance | null>(null)
  const [subTab, setSubTab] = useState<'design' | 'brand' | 'footer'>('design')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    adminGet<LoadedAppearance>('/site-appearance')
      .then((res) => {
        setLoaded(res.data)
        setSaved(res.data)
        setForm(res.data)
      })
      .catch((err) => setMessage({ type: 'error', text: apiErrorMessage(err, 'Tema ayarları yüklenemedi') }))
  }, [])

  useEffect(() => {
    if (!form) return
    onLivePreview({
      template: form.template,
      tagline: form.tagline,
      primary_color: safeHex(form.primary_color, '#166534'),
      accent_color: safeHex(form.accent_color, '#C9A227'),
      logo_url: form.logo_url,
      logo_dark_url: form.logo_dark_url,
      favicon_url: form.favicon_url,
      design: form.design,
      footer_text: form.footer_text,
      social_links: form.social_links,
    })
  }, [form, onLivePreview])

  const isDirty = useMemo(() => {
    if (!form || !saved) return false
    return JSON.stringify(form) !== JSON.stringify(saved)
  }, [form, saved])

  const design = form?.design || DEFAULT_DESIGN
  const textContrast = useMemo(() => contrastRatio(design.page_color, design.text_color), [design.page_color, design.text_color])
  const btnContrast = useMemo(() => contrastRatio(form?.primary_color || '#166534', '#FFFFFF'), [form?.primary_color])

  if (!form || !loaded) {
    return (
      <div className="space-y-2 p-1 text-xs text-gray-500">
        {message?.type === 'error' ? <p className="font-semibold text-red-600">{message.text}</p> : 'Tema ayarları yükleniyor…'}
      </div>
    )
  }

  const set = <K extends keyof ThemeAppearance>(key: K, value: ThemeAppearance[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const setDesign = <K extends keyof SiteDesign>(key: K, value: SiteDesign[K]) => set('design', { ...design, [key]: value })

  const applyKit = (kit: LoadedAppearance['theme_kits'][number]) => {
    setForm((f) => (f ? { ...f, primary_color: kit.primary_color, accent_color: kit.accent_color, design: { ...kit.design } } : f))
  }

  const discard = () => {
    if (!saved) return
    setForm(saved)
    setMessage(null)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))
      const res = await adminSend<ThemeAppearance>('put', '/site-appearance', {
        ...form,
        primary_color: safeHex(form.primary_color, saved?.primary_color || '#166534'),
        accent_color: safeHex(form.accent_color, saved?.accent_color || '#C9A227'),
        design: {
          ...design,
          page_color: safeHex(design.page_color, DEFAULT_DESIGN.page_color),
          text_color: safeHex(design.text_color, DEFAULT_DESIGN.text_color),
        },
        tagline: form.tagline || null,
        logo_url: form.logo_url || null,
        logo_dark_url: form.logo_dark_url || null,
        favicon_url: form.favicon_url || null,
        footer_text: form.footer_text || null,
        hero: clean(form.hero || {}),
        cta_band: clean(form.cta_band || {}),
        social_links: clean(form.social_links || {}),
      })
      setForm(res.data)
      setSaved(res.data)
      setMessage({ type: 'ok', text: 'Tema kaydedildi' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Tema kaydedilemedi') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-gray-50 px-2.5 py-2">
        <span className={`font-semibold ${isDirty ? 'text-amber-700' : 'text-gray-500'}`}>
          {isDirty ? 'Kaydedilmedi' : 'Güncel'}
        </span>
        <div className="flex items-center gap-1.5">
          {isDirty && (
            <button type="button" onClick={discard} disabled={saving} className="rounded border bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100">
              Geri al
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !isDirty}
            className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'Kaydediliyor…' : 'Temayı Kaydet'}
          </button>
        </div>
      </div>

      {message && (
        <p className={`rounded px-2 py-1.5 text-[11px] font-semibold ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-3 rounded-lg border bg-gray-50 p-0.5 text-[11px] font-semibold">
        {([['design', 'Tasarım'], ['brand', 'Marka'], ['footer', 'Alt Bilgi']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`rounded-md py-1.5 transition ${subTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'design' && (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Tema Kitleri</p>
            <div className="grid grid-cols-2 gap-1.5">
              {loaded.theme_kits.map((kit) => {
                const active = form.primary_color === kit.primary_color && form.accent_color === kit.accent_color
                  && JSON.stringify(design) === JSON.stringify({ ...DEFAULT_DESIGN, ...kit.design })
                return (
                  <button
                    key={kit.key}
                    type="button"
                    onClick={() => applyKit(kit)}
                    style={{ ...(brandCssVariables(kit.primary_color, kit.accent_color) as React.CSSProperties), ...siteDesignStyle(kit.design) }}
                    className={`site-design rounded-lg border p-2 text-left transition ${active ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex gap-1">
                      <span className="h-3.5 w-3.5 rounded-full" style={{ background: kit.primary_color }} />
                      <span className="h-3.5 w-3.5 rounded-full" style={{ background: kit.accent_color }} />
                      <span className="h-3.5 w-3.5 rounded-full border" style={{ background: kit.design.page_color }} />
                    </div>
                    <div className="mt-1.5 truncate font-heading text-xs font-bold">{kit.label}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Renkler</p>
            <ColorInput label="Ana renk" value={form.primary_color} fallback="#166534" onChange={(v) => set('primary_color', v)} />
            <ColorInput label="Vurgu rengi" value={form.accent_color} fallback="#C9A227" onChange={(v) => set('accent_color', v)} />
            <ColorInput label="Sayfa zemini" value={design.page_color} fallback={DEFAULT_DESIGN.page_color} onChange={(v) => setDesign('page_color', v)} />
            <ColorInput label="Metin rengi" value={design.text_color} fallback={DEFAULT_DESIGN.text_color} onChange={(v) => setDesign('text_color', v)} />

            {textContrast !== null && textContrast < 4.5 && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                Uyarı: Sayfa zemini ile metin rengi arasındaki kontrast düşük ({textContrast.toFixed(1)}:1). Okunabilirlik için en az 4.5:1 önerilir.
              </p>
            )}
            {btnContrast !== null && btnContrast < 3 && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                Uyarı: Ana renk çok açık; butonlardaki beyaz yazının okunması zorlaşabilir ({btnContrast.toFixed(1)}:1).
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Tipografi & Yerleşim</p>
            {([['heading_font', 'Başlık yazı tipi'], ['body_font', 'Metin yazı tipi']] as const).map(([key, label]) => (
              <label key={key} className="block text-[11px] font-semibold text-gray-600">
                <span className="mb-1 block">{label}</span>
                <select className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" value={design[key]} onChange={(e) => setDesign(key, e.target.value)}>
                  {loaded.fonts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-semibold text-gray-600">
                <span className="mb-1 block">Kalınlık</span>
                <select className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs" value={design.heading_weight} onChange={(e) => setDesign('heading_weight', e.target.value)}>
                  {WEIGHT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="block text-[11px] font-semibold text-gray-600">
                <span className="mb-1 block">Başlık harfleri</span>
                <select className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs" value={design.heading_case} onChange={(e) => setDesign('heading_case', e.target.value as SiteDesign['heading_case'])}>
                  <option value="normal">Normal</option>
                  <option value="uppercase">TÜMÜ BÜYÜK</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-semibold text-gray-600">
                <span className="mb-1 block">Köşe yuvarlaklığı</span>
                <select className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs" value={design.radius} onChange={(e) => setDesign('radius', e.target.value as SiteDesign['radius'])}>
                  {RADIUS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="block text-[11px] font-semibold text-gray-600">
                <span className="mb-1 block">İçerik genişliği</span>
                <select className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs" value={design.container} onChange={(e) => setDesign('container', e.target.value as SiteDesign['container'])}>
                  {CONTAINER_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-[11px] font-semibold text-gray-600">
              <span className="mb-1 block">Varsayılan şablon</span>
              <select className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs" value={form.template} onChange={(e) => set('template', e.target.value as ThemeAppearance['template'])}>
                {loaded.templates.map((t) => <option key={t.key} value={t.key}>{t.label.split(' — ')[0]}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {subTab === 'brand' && (
        <div className="space-y-3">
          <ImageField label="Logo" preview="square" value={form.logo_url} onChange={(v) => set('logo_url', v)} hint="Kare, en az 256×256 önerilir" />
          <ImageField label="Koyu zemin logosu" preview="square" value={form.logo_dark_url} onChange={(v) => set('logo_dark_url', v)} />
          <ImageField label="Site simgesi (favicon)" preview="square" value={form.favicon_url} onChange={(v) => set('favicon_url', v)} hint="Boşsa logo kullanılır" />
          <label className="block text-[11px] font-semibold text-gray-600">
            <span className="mb-1 block">Kısa slogan (logonun altında)</span>
            <input className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" maxLength={120} value={form.tagline || ''} onChange={(e) => set('tagline', e.target.value)} />
          </label>
        </div>
      )}

      {subTab === 'footer' && (
        <div className="space-y-3">
          <label className="block text-[11px] font-semibold text-gray-600">
            <span className="mb-1 block">Alt bilgi metni (kurum tanıtımı)</span>
            <textarea rows={2} maxLength={400} className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
              value={form.footer_text || ''} onChange={(e) => set('footer_text', e.target.value)} />
          </label>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Sosyal Medya</p>
            {SOCIAL.map(([key, label]) => (
              <label key={key} className="block text-[11px] font-semibold text-gray-600">
                <span className="mb-0.5 block">{label}</span>
                <input className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500" placeholder="https://…"
                  value={form.social_links?.[key] || ''}
                  onChange={(e) => set('social_links', { ...form.social_links, [key]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2 pt-1 text-[11px] font-semibold text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={form.show_in_directory} onChange={(e) => set('show_in_directory', e.target.checked)} />
            <span>e-infak.org ana sayfasındaki kurum listesinde görün</span>
          </label>
          <div className="border-t pt-3">
            <TranslationEditor fields={I18N_FIELDS} value={form.translations} onChange={(v) => set('translations', v)} />
          </div>
        </div>
      )}
    </div>
  )
}
