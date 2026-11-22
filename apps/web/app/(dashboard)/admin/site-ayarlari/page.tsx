'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Building2,
  ExternalLink,
  Globe,
  Headphones,
  Languages,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, apiErrorMessage, hasFeature, useAdminAccess } from '../../../../lib/admin-access'
import { LANGUAGE_NAMES } from '../../../../lib/i18n'
import { SiteDomainsCard } from '../../../../components/admin/SiteDomainsCard'
import { inputClass } from '../../../../components/admin/FormKit'
import { AppPageHeader } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Tabs, toast } from '../../../../components/admin/ui'

interface OrgSettings {
  contact_phone: string | null
  contact_email: string | null
  contact_address: string | null
  bank1_name: string | null
  bank1_iban: string | null
  bank2_name: string | null
  bank2_iban: string | null
  about_text: string | null
  mission_text: string | null
  vision_text: string | null
  bylaws_url: string | null
  board_url: string | null
  audit_report_url: string | null
  activity_report_url: string | null
  fundraising_permit_url: string | null
  whatsapp_number: string | null
  whatsapp_message: string | null
  instagram_url: string | null
  live_chat_provider: string | null
  live_chat_id: string | null
  seo_title: string | null
  seo_description: string | null
  seo_keywords: string | null
  languages?: string[]
  legal_name: string | null
  tax_number: string | null
  tax_office: string | null
  registry_no: string | null
  kvkk_url: string | null
  terms_url: string | null
  preinfo_url: string | null
  refund_url: string | null
  tax_deduction_eligible?: boolean | null
}

const EMPTY: OrgSettings = {
  contact_phone: '',
  contact_email: '',
  contact_address: '',
  bank1_name: '',
  bank1_iban: '',
  bank2_name: '',
  bank2_iban: '',
  about_text: '',
  mission_text: '',
  vision_text: '',
  bylaws_url: '',
  board_url: '',
  audit_report_url: '',
  activity_report_url: '',
  fundraising_permit_url: '',
  whatsapp_number: '',
  whatsapp_message: '',
  instagram_url: '',
  live_chat_provider: '',
  live_chat_id: '',
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  languages: ['tr'],
  legal_name: '',
  tax_number: '',
  tax_office: '',
  registry_no: '',
  kvkk_url: '',
  terms_url: '',
  preinfo_url: '',
  refund_url: '',
  tax_deduction_eligible: false,
}

type TabKey = 'contact' | 'legal' | 'seo' | 'support'

const TABS: { key: TabKey; label: string; icon: typeof Phone }[] = [
  { key: 'contact', label: 'İletişim & Banka', icon: Phone },
  { key: 'legal', label: 'Kurumsal & Yasal', icon: ShieldCheck },
  { key: 'seo', label: 'Diller & SEO', icon: Languages },
  { key: 'support', label: 'Destek & Alan Adı', icon: Headphones },
]

function normalizeLoaded(data: Partial<OrgSettings>): OrgSettings {
  return {
    ...EMPTY,
    ...Object.fromEntries(
      Object.entries(data).map(([k, v]) => {
        if (k === 'languages') return [k, Array.isArray(v) && v.length ? v : ['tr']]
        if (k === 'tax_deduction_eligible') return [k, Boolean(v)]
        return [k, v ?? '']
      }),
    ),
  } as OrgSettings
}

function isValidTrIban(raw: string): boolean {
  const clean = raw.replace(/\s+/g, '').toUpperCase()
  if (!clean) return true
  if (!/^TR\d{24}$/.test(clean)) return false
  const rearranged = clean.slice(4) + clean.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0)
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch
    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97
    }
  }
  return remainder === 1
}

function formatTrIban(raw: string): string {
  const clean = raw.replace(/\s+/g, '').toUpperCase()
  if (!clean) return ''
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

function isValidEmail(raw: string): boolean {
  const clean = raw.trim()
  if (!clean) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)
}

function isValidHref(raw: string, allowRelative = false): boolean {
  const clean = raw.trim()
  if (!clean) return true
  if (allowRelative && clean.startsWith('/')) return true
  return /^https?:\/\/.+/i.test(clean)
}

export default function AdminSiteSettingsPage() {
  const [form, setForm] = useState<OrgSettings>(EMPTY)
  const [saved, setSaved] = useState<OrgSettings>(EMPTY)
  // ?sekme=seo opens "Diller & SEO" (STK PRO menu: Web Sitesi → Çeviri).
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'contact'
    const s = new URLSearchParams(window.location.search).get('sekme')
    return (['contact', 'legal', 'seo', 'support'] as const).find((k) => k === s) ?? 'contact'
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { data: access } = useAdminAccess()
  const multiLanguage = hasFeature(access, 'multi_language')
  const [customLang, setCustomLang] = useState('')

  const API_BASE = adminApiBase()

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/org-settings`, { headers: adminAuthHeaders() })
      const norm = normalizeLoaded(res.data)
      setForm(norm)
      setSaved(norm)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Site ayarları yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const iban1Invalid = Boolean(form.bank1_iban && !isValidTrIban(form.bank1_iban))
  const iban2Invalid = Boolean(form.bank2_iban && !isValidTrIban(form.bank2_iban))
  const emailInvalid = Boolean(form.contact_email && !isValidEmail(form.contact_email))

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (emailInvalid) {
      toast.error('E-posta adresi geçerli bir formatta değil.')
      setTab('contact')
      return
    }
    if (iban1Invalid || iban2Invalid) {
      toast.error('IBAN formatı veya kontrol basamağı (Mod-97) geçersiz. TR ile başlayan 26 haneli IBAN girin.')
      setTab('contact')
      return
    }
    const invalidLegalUrl = (['kvkk_url', 'terms_url', 'preinfo_url', 'refund_url'] as const).find(
      (k) => !isValidHref(String(form[k] || ''), true),
    )
    if (invalidLegalUrl) {
      toast.error('Yasal metin bağlantıları "/" ile veya "https://" ile başlamalıdır.')
      setTab('legal')
      return
    }
    const invalidDocUrl = (
      ['bylaws_url', 'board_url', 'activity_report_url', 'audit_report_url', 'fundraising_permit_url'] as const
    ).find((k) => !isValidHref(String(form[k] || ''), true))
    if (invalidDocUrl) {
      toast.error('Kurumsal belge bağlantıları geçerli bir URL veya site içi yol olmalıdır.')
      setTab('legal')
      return
    }

    setSaving(true)
    try {
      const res = await axios.put(`${API_BASE}/api/v1/admin-features/org-settings`, form, { headers: adminAuthHeaders() })
      const norm = normalizeLoaded(res.data)
      setForm(norm)
      setSaved(norm)
      toast.ok('Site ayarları güncellendi!')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const field = (
    key: keyof OrgSettings,
    label: string,
    placeholder = '',
    opts?: { hint?: string; maxLength?: number; error?: string; allowPreview?: boolean; onBlur?: () => void },
  ) => {
    const val = String(form[key] ?? '')
    const canPreview = opts?.allowPreview && val.trim() && isValidHref(val, true)
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-bold text-slate-700">{label}</label>
          <div className="flex items-center gap-2">
            {canPreview && (
              <a
                href={val.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                Aç <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {opts?.maxLength && (
              <span className={`text-[11px] ${val.length > opts.maxLength * 0.9 ? 'font-semibold text-amber-600' : 'text-slate-400'}`}>
                {val.length}/{opts.maxLength}
              </span>
            )}
          </div>
        </div>
        <Input
          type="text"
          value={val}
          maxLength={opts?.maxLength}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          onBlur={opts?.onBlur}
          placeholder={placeholder}
          className={opts?.error ? 'border-rose-400 focus:border-rose-500' : undefined}
        />
        {opts?.error ? (
          <p className="mt-1 text-[11px] font-semibold text-rose-600">{opts.error}</p>
        ) : (
          opts?.hint && <p className="mt-1 text-[11px] text-slate-400">{opts.hint}</p>
        )}
      </div>
    )
  }

  const textArea = (key: keyof OrgSettings, label: string, placeholder = '', rows = 4, maxLength?: number) => {
    const val = String(form[key] ?? '')
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-bold text-slate-700">{label}</label>
          {maxLength && (
            <span className={`text-[11px] ${val.length > maxLength * 0.9 ? 'font-semibold text-amber-600' : 'text-slate-400'}`}>
              {val.length}/{maxLength}
            </span>
          )}
        </div>
        <textarea
          value={val}
          maxLength={maxLength}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          rows={rows}
          className={`${inputClass} min-h-[84px] resize-y py-2`}
        />
      </div>
    )
  }

  const previewUrl = typeof window !== 'undefined' ? window.location.origin : 'https://kurumunuz.e-infak.org'
  const waDigits = String(form.whatsapp_number || '').replace(/\D/g, '')
  const waTestUrl = waDigits
    ? `https://wa.me/${waDigits}${form.whatsapp_message ? `?text=${encodeURIComponent(form.whatsapp_message)}` : ''}`
    : null
  const waStartsWithZero = /^0\d+/.test(waDigits)

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Web & Kurum Yönetimi"
        title="Site Ayarları"
        meta="İletişim, banka IBAN, yasal künye (KVKK), çoklu dil, SEO, canlı destek ve alan adı"
        icon={<Globe className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={loadSettings} disabled={loading || saving}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {isDirty && (
              <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => setForm(saved)}>
                Vazgeç
              </Button>
            )}
            <Button type="button" size="sm" disabled={loading || saving || !isDirty} onClick={() => handleSave()}>
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </Button>
          </div>
        }
      />

      {isDirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
          <span>Kaydedilmemiş değişiklikleriniz var. Sekmeden çıkmadan önce kaydedin.</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(saved)}>
              Geri Al
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => handleSave()}>
              {saving ? 'Kaydediliyor…' : 'Şimdi Kaydet'}
            </Button>
          </div>
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {loading ? (
        <div className="grid max-w-5xl gap-5">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
              </div>
              <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            </Card>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSave} className="max-w-5xl space-y-6">
          {tab === 'contact' && (
            <>
              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div>
                  <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">İletişim Bilgileri</h2>
                  <p className="mt-2 text-xs text-slate-500">Web sitenizin İletişim sayfasında, üst/alt bilgisinde ve resmi belgelerde gösterilir.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('contact_phone', 'Telefon', '0 (222) 000 00 00')}
                  {field('contact_email', 'E-posta', 'info@dernek.org', {
                    error: emailInvalid ? 'Geçerli bir e-posta adresi girin.' : undefined,
                  })}
                </div>
                {field('contact_address', 'Açık Adres', 'Mahalle, Cadde, No, İlçe / Şehir')}
              </Card>

              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div>
                  <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">Havale / EFT Banka Hesapları</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    Bağış sayfasındaki Havale/EFT sekmesinde ve alt bilgide gösterilen kurum IBAN bilgileridir. Sanal POS ayarları için{' '}
                    <strong>Ödeme &amp; SMS Hesapları</strong> menüsünü kullanın.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('bank1_name', 'Banka 1 Adı', 'Vakıf Katılım')}
                  {field('bank1_iban', 'Banka 1 IBAN', 'TR00 0000 0000 0000 0000 0000 00', {
                    error: iban1Invalid ? 'Geçersiz TR IBAN (26 hane ve Mod-97 doğrulaması gerekir).' : undefined,
                    onBlur: () => setForm((prev) => ({ ...prev, bank1_iban: formatTrIban(prev.bank1_iban || '') })),
                  })}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('bank2_name', 'Banka 2 Adı', 'Kuveyt Türk')}
                  {field('bank2_iban', 'Banka 2 IBAN', 'TR00 0000 0000 0000 0000 0000 00', {
                    error: iban2Invalid ? 'Geçersiz TR IBAN (26 hane ve Mod-97 doğrulaması gerekir).' : undefined,
                    onBlur: () => setForm((prev) => ({ ...prev, bank2_iban: formatTrIban(prev.bank2_iban || '') })),
                  })}
                </div>
              </Card>
            </>
          )}

          {tab === 'legal' && (
            <>
              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-base font-black text-slate-900">Resmi Kurum Künyesi &amp; Vergi Bilgileri</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('legal_name', 'Resmi Kurum Unvanı', 'Örn. Hayır Kapısı Yardımlaşma Derneği')}
                  {field('registry_no', 'Dernek / Vakıf Kütük No', '34-000-000')}
                  {field('tax_office', 'Vergi Dairesi', 'Fatih Vergi Dairesi')}
                  {field('tax_number', 'Vergi Kimlik Numarası (VKN)', '1234567890')}
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(form.tax_deduction_eligible)}
                    onChange={(e) => setForm({ ...form, tax_deduction_eligible: e.target.checked })}
                  />
                  <span>
                    Kamu yararına çalışan dernek / vergi muafiyetli vakıf statüsünde (Bağış makbuzlarında ve sitede vergi indirimi bilgisi gösterilir)
                  </span>
                </label>
              </Card>

              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h2 className="text-base font-black text-slate-900">Yasal Metin Bağlantıları (KVKK &amp; Bağış Mevzuatı)</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Site içi yol (örn. <code className="rounded bg-slate-100 px-1">/sayfa/kvkk</code>) veya tam{' '}
                      <code className="rounded bg-slate-100 px-1">https://...</code> adresi girebilirsiniz.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        kvkk_url: prev.kvkk_url || '/sayfa/kvkk-aydinlatma',
                        terms_url: prev.terms_url || '/sayfa/kullanim-kosullari',
                        preinfo_url: prev.preinfo_url || '/sayfa/on-bilgilendirme',
                        refund_url: prev.refund_url || '/sayfa/iptal-iade',
                      }))
                    }
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Boş Alanları Varsayılanla Doldur
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('kvkk_url', 'KVKK Aydınlatma Metni', '/sayfa/kvkk-aydinlatma', { allowPreview: true })}
                  {field('terms_url', 'Kullanım Koşulları', '/sayfa/kullanim-kosullari', { allowPreview: true })}
                  {field('preinfo_url', 'Ön Bilgilendirme Formu', '/sayfa/on-bilgilendirme', { allowPreview: true })}
                  {field('refund_url', 'İptal ve İade Politikası', '/sayfa/iptal-iade', { allowPreview: true })}
                </div>
              </Card>

              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div>
                  <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">Kurumsal Şeffaflık &amp; Hakkımızda</h2>
                  <p className="mt-2 text-xs text-slate-500">Hakkımızda sayfasında yayınlanır. Yalnız doğrulanmış, herkese açık belge bağlantılarını (https://...) ekleyin.</p>
                </div>
                {textArea('about_text', 'Kurum Tanıtımı', 'Kurumunuzun doğrulanmış tanıtım metni', 4, 5000)}
                <div className="grid gap-4 sm:grid-cols-2">
                  {textArea('mission_text', 'Misyon', '', 3, 3000)}
                  {textArea('vision_text', 'Vizyon', '', 3, 3000)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('bylaws_url', 'Tüzük Bağlantısı', 'https://.../tuzuk.pdf', { allowPreview: true })}
                  {field('board_url', 'Yönetim / Denetim Bilgisi', 'https://.../yonetim.pdf', { allowPreview: true })}
                  {field('activity_report_url', 'Faaliyet Raporu', 'https://.../faaliyet-raporu.pdf', { allowPreview: true })}
                  {field('audit_report_url', 'Denetim Raporu', 'https://.../denetim-raporu.pdf', { allowPreview: true })}
                </div>
                {field('fundraising_permit_url', 'Yardım Toplama İzni', 'https://.../izin.pdf', { allowPreview: true })}
              </Card>
            </>
          )}

          {tab === 'seo' && (
            <>
              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div>
                  <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">Site Dilleri</h2>
                  <p className="mt-2 text-xs text-slate-500">
                    {multiLanguage
                      ? 'Seçilen diller sitede dil menüsünde görünür. İçeriklerin çevirisini Haber, Sayfa, Menü, Galeri ve Kampanya ekranlarından girin; çevrilmeyen alanlar Türkçe gösterilir.'
                      : 'Çoklu dil desteği paketinizde yok; site yalnız Türkçe yayınlanır.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(['tr', 'en', 'ar', 'de', 'fr', 'nl', 'ru', ...(form.languages || [])])).map((code) => {
                    const selected = (form.languages || ['tr']).includes(code)
                    return (
                      <label
                        key={code}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                          selected ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-900' : 'border-slate-200 bg-white text-slate-700'
                        } ${!multiLanguage && code !== 'tr' ? 'cursor-not-allowed opacity-40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          disabled={code === 'tr' || !multiLanguage}
                          checked={selected}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              languages: e.target.checked
                                ? [...(form.languages || ['tr']), code]
                                : (form.languages || ['tr']).filter((l) => l !== code),
                            })
                          }
                        />
                        {LANGUAGE_NAMES[code] || code.toUpperCase()}
                      </label>
                    )
                  })}
                  {multiLanguage && (
                    <span className="flex items-center gap-1.5">
                      <Input
                        value={customLang}
                        maxLength={2}
                        onChange={(e) => setCustomLang(e.target.value.toLowerCase())}
                        placeholder="kod"
                        className="w-16 text-center"
                        aria-label="İki harfli dil kodu"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (/^[a-z]{2}$/.test(customLang)) {
                            setForm({ ...form, languages: Array.from(new Set([...(form.languages || ['tr']), customLang])) })
                            setCustomLang('')
                          } else {
                            toast.error('İki harfli ISO dil kodu girin (ör. es, fr).')
                          }
                        }}
                      >
                        + Dil Ekle
                      </Button>
                    </span>
                  )}
                </div>
              </Card>

              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div>
                  <h2 className="border-b border-slate-100 pb-2 text-base font-black text-slate-900">Arama Motoru Optimizasyonu (SEO)</h2>
                  <p className="mt-2 text-xs text-slate-500">Kendi başlığı/açıklaması olmayan sayfalarda varsayılan olarak kullanılır.</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Google Arama Önizlemesi</span>
                  </div>
                  <div className="text-xs text-emerald-700">{previewUrl}</div>
                  <div className="mt-0.5 truncate text-base font-semibold text-blue-700">
                    {form.seo_title?.trim() || `${form.legal_name?.trim() || 'Kurum Adı'} — Bağış ve Yardımlaşma`}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                    {form.seo_description?.trim() || 'Online bağış, zekât, fitre, kurban ve insani yardım projelerimizi inceleyin, güvenle destek olun.'}
                  </p>
                </div>

                {field('seo_title', 'Site Başlığı', 'Kurum Adı — Bağış ve Yardımlaşma', {
                  hint: 'İdeal uzunluk: 50–60 karakter (en fazla 160)',
                  maxLength: 160,
                })}
                {textArea('seo_description', 'Site Açıklaması', 'Kurumunuzun kısa arama açıklaması…', 3, 320)}
                {field('seo_keywords', 'Anahtar Kelimeler', 'bağış, zekat, kurban, su kuyusu', {
                  hint: 'Virgülle ayırarak yazın',
                  maxLength: 300,
                })}
              </Card>
            </>
          )}

          {tab === 'support' && (
            <>
              <Card className="space-y-4 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h2 className="text-base font-black text-slate-900">WhatsApp, Instagram &amp; Canlı Destek</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      WhatsApp numarası veya Instagram adresi girildiğinde sitenin sol alt köşesinde iletişim butonları görünür.
                    </p>
                  </div>
                  {waTestUrl && (
                    <a
                      href={waTestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      WhatsApp&apos;ta Test Et <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('whatsapp_number', 'WhatsApp Numarası', '905551234567', {
                    hint: 'Ülke kodu ile birlikte rakam olarak yazın (ör. 905551234567)',
                    error: waStartsWithZero ? 'Numara 0 ile değil ülke kodu (ör. 90) ile başlamalıdır.' : undefined,
                  })}
                  {field('whatsapp_message', 'Hazır Mesaj', 'Merhaba, bağış hakkında bilgi almak istiyorum', {
                    maxLength: 300,
                  })}
                </div>
                {field('instagram_url', 'Instagram Adresi veya Kullanıcı Adı', 'https://instagram.com/dernegimiz veya @dernegimiz', {
                  maxLength: 200,
                  allowPreview: /^https?:\/\//i.test(String(form.instagram_url || '').trim()),
                  hint: 'Kullanıcı adı (@dernegimiz) veya tam Instagram profil bağlantısı girin.',
                })}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Canlı Destek Sağlayıcı</label>
                    <select
                      value={form.live_chat_provider || ''}
                      onChange={(e) => setForm({ ...form, live_chat_provider: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Kapalı</option>
                      <option value="tawk">Tawk.to</option>
                    </select>
                  </div>
                  {form.live_chat_provider === 'tawk' &&
                    field('live_chat_id', 'Tawk.to Kimliği', 'https://embed.tawk.to/xxxxxxxx/yyyyyy', {
                      hint: 'Yerleştirme linkini veya propertyId/widgetId değerini yapıştırın',
                    })}
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="button" disabled={saving || !isDirty} onClick={() => handleSave()}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Kaydediliyor...' : 'Destek Ayarlarını Kaydet'}
                  </Button>
                </div>
              </Card>

              <SiteDomainsCard />
            </>
          )}

          {tab !== 'support' && (
            <div className="flex justify-end">
              <Button type="submit" disabled={saving || !isDirty}>
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
