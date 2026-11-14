'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Building2, Globe, Headphones, Languages, Phone, Save, ShieldCheck } from 'lucide-react'
import { Button, Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, apiErrorMessage, hasFeature, useAdminAccess } from '../../../../lib/admin-access'
import { LANGUAGE_NAMES } from '../../../../lib/i18n'
import { SiteDomainsCard } from '../../../../components/admin/SiteDomainsCard'
import { PageHeader, toast } from '../../../../components/admin/ui'

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
  return /^TR\d{24}$/.test(clean)
}

export default function AdminSiteSettingsPage() {
  const [form, setForm] = useState<OrgSettings>(EMPTY)
  const [saved, setSaved] = useState<OrgSettings>(EMPTY)
  const [tab, setTab] = useState<TabKey>('contact')
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

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!isValidTrIban(form.bank1_iban || '') || !isValidTrIban(form.bank2_iban || '')) {
      toast.error('IBAN formatı geçersiz. TR ile başlayan 26 karakterlik IBAN girin.')
      setTab('contact')
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

  const field = (key: keyof OrgSettings, label: string, placeholder = '', hint?: string, maxLength?: number) => {
    const val = String(form[key] ?? '')
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-bold text-gray-700">{label}</label>
          {maxLength && (
            <span className={`text-[11px] ${val.length > maxLength * 0.9 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
              {val.length}/{maxLength}
            </span>
          )}
        </div>
        <input
          type="text"
          value={val}
          maxLength={maxLength}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
      </div>
    )
  }

  const textArea = (key: keyof OrgSettings, label: string, placeholder = '', rows = 4, maxLength?: number) => {
    const val = String(form[key] ?? '')
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-bold text-gray-700">{label}</label>
          {maxLength && (
            <span className={`text-[11px] ${val.length > maxLength * 0.9 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
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
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>
    )
  }

  const iban1Invalid = Boolean(form.bank1_iban && !isValidTrIban(form.bank1_iban))
  const iban2Invalid = Boolean(form.bank2_iban && !isValidTrIban(form.bank2_iban))
  const previewUrl = typeof window !== 'undefined' ? window.location.origin : 'https://kurumunuz.e-infak.org'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageHeader title="Site Ayarları" />
          <p className="-mt-4 text-sm text-gray-500">
            Web sitenizin iletişim, yasal künye (KVKK), çoklu dil, SEO, canlı destek ve alan adı ayarlarını yönetin.
          </p>
        </div>
        {!loading && tab !== 'support' && (
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setForm(saved)}
                className="text-xs"
              >
                Vazgeç
              </Button>
            )}
            <Button
              type="button"
              disabled={saving || !isDirty}
              onClick={() => handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </Button>
          </div>
        )}
      </div>

      {isDirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
          <span>Kaydedilmemiş değişiklikleriniz var.</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setForm(saved)} className="rounded-md px-2.5 py-1 text-amber-800 hover:bg-amber-100">
              Geri Al
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave()}
              className="rounded-md bg-amber-600 px-3 py-1 font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'Şimdi Kaydet'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-50/80 p-1.5">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                active ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="animate-pulse py-10 text-center text-sm text-gray-500">Yükleniyor...</p>
      ) : (
        <form onSubmit={handleSave} className="max-w-4xl space-y-6">
          {tab === 'contact' && (
            <>
              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">İletişim Bilgileri</h2>
                  <p className="mt-2 text-xs text-gray-500">Web sitenizin İletişim sayfasında, üst/alt bilgisinde ve resmi belgelerde gösterilir.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('contact_phone', 'Telefon', '0 (222) 000 00 00')}
                  {field('contact_email', 'E-posta', 'info@dernek.org')}
                </div>
                {field('contact_address', 'Açık Adres', 'Mahalle, Cadde, No, İlçe / Şehir')}
              </Card>

              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">Havale / EFT Banka Hesapları</h2>
                  <p className="mt-2 text-xs text-gray-500">
                    Bağış sayfasındaki Havale/EFT sekmesinde ve alt bilgide gösterilen kurum IBAN bilgileridir. Sanal POS ayarları için <strong>Ödeme &amp; SMS Hesapları</strong> menüsünü kullanın.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('bank1_name', 'Banka 1 Adı', 'Vakıf Katılım')}
                  <div>
                    {field('bank1_iban', 'Banka 1 IBAN', 'TR00 0000 0000 0000 0000 0000 00')}
                    {iban1Invalid && <p className="mt-1 text-[11px] font-semibold text-red-600">TR ile başlayan 26 haneli geçerli bir IBAN girin.</p>}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('bank2_name', 'Banka 2 Adı', 'Kuveyt Türk')}
                  <div>
                    {field('bank2_iban', 'Banka 2 IBAN', 'TR00 0000 0000 0000 0000 0000 00')}
                    {iban2Invalid && <p className="mt-1 text-[11px] font-semibold text-red-600">TR ile başlayan 26 haneli geçerli bir IBAN girin.</p>}
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === 'legal' && (
            <>
              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <h2 className="text-base font-bold text-gray-900">Resmi Kurum Künyesi &amp; Vergi Bilgileri</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('legal_name', 'Resmi Kurum Unvanı', 'Örn. Hayır Kapısı Yardımlaşma Derneği')}
                  {field('registry_no', 'Dernek / Vakıf Kütük No', '34-000-000')}
                  {field('tax_office', 'Vergi Dairesi', 'Fatih Vergi Dairesi')}
                  {field('tax_number', 'Vergi Kimlik Numarası (VKN)', '1234567890')}
                </div>
                <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-xs font-semibold text-gray-700">
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

              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">Yasal Metin Bağlantıları (KVKK &amp; Bağış Mevzuatı)</h2>
                  <p className="mt-2 text-xs text-gray-500">Site içi yol (örn. <code className="rounded bg-gray-100 px-1">/sayfa/kvkk</code>) veya tam <code className="rounded bg-gray-100 px-1">https://...</code> adresi girebilirsiniz.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('kvkk_url', 'KVKK Aydınlatma Metni', '/sayfa/kvkk-aydinlatma')}
                  {field('terms_url', 'Kullanım Koşulları', '/sayfa/kullanim-kosullari')}
                  {field('preinfo_url', 'Ön Bilgilendirme Formu', '/sayfa/on-bilgilendirme')}
                  {field('refund_url', 'İptal ve İade Politikası', '/sayfa/iptal-iade')}
                </div>
              </Card>

              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">Kurumsal Şeffaflık &amp; Hakkımızda</h2>
                  <p className="mt-2 text-xs text-gray-500">Hakkımızda sayfasında yayınlanır. Yalnız doğrulanmış, herkese açık belge bağlantılarını (https://...) ekleyin.</p>
                </div>
                {textArea('about_text', 'Kurum Tanıtımı', 'Kurumunuzun doğrulanmış tanıtım metni', 4, 5000)}
                <div className="grid gap-4 sm:grid-cols-2">
                  {textArea('mission_text', 'Misyon', '', 3, 3000)}
                  {textArea('vision_text', 'Vizyon', '', 3, 3000)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('bylaws_url', 'Tüzük Bağlantısı', 'https://.../tuzuk.pdf')}
                  {field('board_url', 'Yönetim / Denetim Bilgisi', 'https://.../yonetim.pdf')}
                  {field('activity_report_url', 'Faaliyet Raporu', 'https://.../faaliyet-raporu.pdf')}
                  {field('audit_report_url', 'Denetim Raporu', 'https://.../denetim-raporu.pdf')}
                </div>
                {field('fundraising_permit_url', 'Yardım Toplama İzni', 'https://.../izin.pdf')}
              </Card>
            </>
          )}

          {tab === 'seo' && (
            <>
              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">Site Dilleri</h2>
                  <p className="mt-2 text-xs text-gray-500">
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
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                          selected ? 'border-primary-600 bg-primary-50 font-semibold text-primary-900' : 'bg-white'
                        } ${!multiLanguage && code !== 'tr' ? 'opacity-40' : ''}`}
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
                      <input
                        value={customLang}
                        maxLength={2}
                        onChange={(e) => setCustomLang(e.target.value.toLowerCase())}
                        placeholder="kod"
                        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        aria-label="İki harfli dil kodu"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100"
                        onClick={() => {
                          if (/^[a-z]{2}$/.test(customLang)) {
                            setForm({ ...form, languages: Array.from(new Set([...(form.languages || ['tr']), customLang])) })
                            setCustomLang('')
                          }
                        }}
                      >
                        + Dil ekle
                      </button>
                    </span>
                  )}
                </div>
              </Card>

              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">Arama Motoru Optimizasyonu (SEO)</h2>
                  <p className="mt-2 text-xs text-gray-500">Kendi başlığı/açıklaması olmayan sayfalarda varsayılan olarak kullanılır.</p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Google Arama Önizlemesi</span>
                  </div>
                  <div className="text-xs text-emerald-700">{previewUrl}</div>
                  <div className="mt-0.5 truncate text-base font-semibold text-blue-700">
                    {form.seo_title?.trim() || `${form.legal_name?.trim() || 'Kurum Adı'} — Bağış ve Yardımlaşma`}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                    {form.seo_description?.trim() || 'Online bağış, zekât, fitre, kurban ve insani yardım projelerimizi inceleyin, güvenle destek olun.'}
                  </p>
                </div>

                {field('seo_title', 'Site Başlığı', 'Kurum Adı — Bağış ve Yardımlaşma', 'İdeal uzunluk: 50–60 karakter (en fazla 160)', 160)}
                {textArea('seo_description', 'Site Açıklaması', 'Kurumunuzun kısa arama açıklaması…', 3, 320)}
                {field('seo_keywords', 'Anahtar Kelimeler', 'bağış, zekat, kurban, su kuyusu', 'Virgülle ayırarak yazın', 300)}
              </Card>
            </>
          )}

          {tab === 'support' && (
            <>
              <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
                <div>
                  <h2 className="border-b pb-2 text-base font-bold text-gray-900">WhatsApp &amp; Canlı Destek</h2>
                  <p className="mt-2 text-xs text-gray-500">
                    WhatsApp numarası girildiğinde sitenin sağ alt köşesinde iletişim butonu görünür.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('whatsapp_number', 'WhatsApp Numarası', '905xx xxx xx xx', 'Ülke kodu ile birlikte yazın (ör. 905551234567)')}
                  {field('whatsapp_message', 'Hazır Mesaj', 'Merhaba, bağış hakkında bilgi almak istiyorum', undefined, 300)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-700">Canlı Destek Sağlayıcı</label>
                    <select
                      value={form.live_chat_provider || ''}
                      onChange={(e) => setForm({ ...form, live_chat_provider: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500"
                    >
                      <option value="">Kapalı</option>
                      <option value="tawk">Tawk.to</option>
                    </select>
                  </div>
                  {form.live_chat_provider === 'tawk' &&
                    field('live_chat_id', 'Tawk.to Kimliği', 'https://embed.tawk.to/xxxxxxxx/yyyyyy', 'Yerleştirme linkini veya propertyId/widgetId değerini yapıştırın')}
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    disabled={saving || !isDirty}
                    onClick={() => handleSave()}
                    className="rounded-lg bg-primary-600 px-5 py-2 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? 'Kaydediliyor...' : 'Destek Ayarlarını Kaydet'}
                  </Button>
                </div>
              </Card>

              <SiteDomainsCard />
            </>
          )}

          {tab !== 'support' && (
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving || !isDirty}
                className="rounded-lg bg-primary-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
