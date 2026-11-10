'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'
import { apiErrorMessage, hasFeature, useAdminAccess } from '../../../../lib/admin-access'
import { LANGUAGE_NAMES } from '../../../../lib/i18n'
import { SiteDomainsCard } from '../../../../components/admin/SiteDomainsCard'

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
}

export default function AdminSiteSettingsPage() {
  const [form, setForm] = useState<OrgSettings>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const { data: access } = useAdminAccess()
  const multiLanguage = hasFeature(access, 'multi_language')
  const [customLang, setCustomLang] = useState('')

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/org-settings`, { headers: getAuthHeaders() })
      setForm({ ...EMPTY, ...res.data })
    } catch (err) {
      console.error('Failed to load site settings:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    try {
      const res = await axios.put(`${API_BASE}/api/v1/admin-features/org-settings`, form, { headers: getAuthHeaders() })
      setForm({ ...EMPTY, ...res.data })
      setSuccessMsg('Site ayarları güncellendi!')
    } catch (err) {
      console.error('Failed to save site settings:', err)
      alert(apiErrorMessage(err, 'Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof OrgSettings, label: string, placeholder = '') => (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{label}</label>
      <input
        type="text"
        value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
      />
    </div>
  )

  const textArea = (key: keyof OrgSettings, label: string, placeholder = '') => (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{label}</label>
      <textarea
        value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500 resize-y"
      />
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Site Ayarları</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-6">
        Bu bilgiler web sitenizin İletişim sayfasında ve footer&apos;ında görünür — sahaya çıkmadan önce gerçek bilgilerle güncelleyin.
      </p>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100">
          ✨ {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Yükleniyor...</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">İletişim Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              {field('contact_phone', 'Telefon', '0 (222) 000 00 00')}
              {field('contact_email', 'E-posta', 'info@dernek.org')}
            </div>
            {field('contact_address', 'Adres', 'Şehir, Türkiye')}
          </Card>

          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Kurumsal Şeffaflık</h2>
              <p className="text-xs text-gray-500 mt-2">Bu bilgiler Hakkımızda sayfasında yayınlanır. Yalnız doğrulanmış, herkese açık belge bağlantılarını ekleyin.</p>
            </div>
            {textArea('about_text', 'Kurum Tanıtımı', 'Kurumunuzun doğrulanmış tanıtım metni')}
            <div className="grid grid-cols-2 gap-4">
              {textArea('mission_text', 'Misyon')}
              {textArea('vision_text', 'Vizyon')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field('bylaws_url', 'Tüzük Bağlantısı', 'https://.../tuzuk.pdf')}
              {field('board_url', 'Yönetim / Denetim Bilgisi', 'https://.../yonetim.pdf')}
              {field('activity_report_url', 'Faaliyet Raporu', 'https://.../faaliyet-raporu.pdf')}
              {field('audit_report_url', 'Denetim Raporu', 'https://.../denetim-raporu.pdf')}
            </div>
            {field('fundraising_permit_url', 'Yardım Toplama İzni', 'https://.../izin.pdf')}
          </Card>

          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">WhatsApp & Canlı Destek</h2>
              <p className="text-xs text-gray-500 mt-2">WhatsApp numarası girildiğinde sitenin sağ alt köşesinde iletişim butonu görünür. Canlı destek için Tawk.to hesabınızdaki yerleştirme bağlantısını veya &quot;propertyId/widgetId&quot; değerini yapıştırın.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field('whatsapp_number', 'WhatsApp Numarası', '905xx xxx xx xx')}
              {field('whatsapp_message', 'Hazır Mesaj', 'Merhaba, bağış hakkında bilgi almak istiyorum')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Canlı Destek</label>
                <select
                  value={form.live_chat_provider || ''}
                  onChange={(e) => setForm({ ...form, live_chat_provider: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500 bg-white"
                >
                  <option value="">Kapalı</option>
                  <option value="tawk">Tawk.to</option>
                </select>
              </div>
              {field('live_chat_id', 'Tawk.to Kimliği', 'https://embed.tawk.to/xxxxxxxx/yyyyyy')}
            </div>
          </Card>

          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Site Dilleri</h2>
              <p className="text-xs text-gray-500 mt-2">
                {multiLanguage
                  ? 'Seçilen diller sitede dil menüsünde görünür. İçeriklerin çevirisini Haber, Sayfa, Menü, Galeri ve Kampanya ekranlarından girin; çevrilmeyen alanlar Türkçe gösterilir.'
                  : 'Çoklu dil desteği paketinizde yok; site yalnız Türkçe yayınlanır.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(['tr', 'en', 'ar', 'de', 'fr', 'nl', 'ru', ...(form.languages || [])])).map((code) => {
                const selected = (form.languages || ['tr']).includes(code)
                return (
                  <label key={code} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${selected ? 'border-primary-600 bg-primary-50' : 'bg-white'} ${!multiLanguage && code !== 'tr' ? 'opacity-40' : ''}`}>
                    <input type="checkbox" disabled={code === 'tr' || !multiLanguage} checked={selected}
                      onChange={(e) => setForm({ ...form, languages: e.target.checked
                        ? [...(form.languages || ['tr']), code]
                        : (form.languages || ['tr']).filter((l) => l !== code) })} />
                    {LANGUAGE_NAMES[code] || code.toUpperCase()}
                  </label>
                )
              })}
              {multiLanguage && (
                <span className="flex items-center gap-1">
                  <input value={customLang} maxLength={2} onChange={(e) => setCustomLang(e.target.value.toLowerCase())} placeholder="kod"
                    className="w-16 rounded-lg border border-gray-300 p-1.5 text-sm" aria-label="İki harfli dil kodu" />
                  <button type="button" className="text-xs font-bold text-primary-700" onClick={() => {
                    if (/^[a-z]{2}$/.test(customLang)) {
                      setForm({ ...form, languages: Array.from(new Set([...(form.languages || ['tr']), customLang])) })
                      setCustomLang('')
                    }
                  }}>+ Dil ekle</button>
                </span>
              )}
            </div>
          </Card>

          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Arama Motoru (SEO)</h2>
              <p className="text-xs text-gray-500 mt-2">Kendi başlığı/açıklaması olmayan sayfalarda kullanılır. Haber ve sayfalarda ayrıca özel başlık/açıklama girebilirsiniz.</p>
            </div>
            {field('seo_title', 'Site Başlığı (en fazla 160 karakter)', 'Kurum Adı — Bağış ve Yardımlaşma')}
            {textArea('seo_description', 'Site Açıklaması (en fazla 320 karakter)')}
            {field('seo_keywords', 'Anahtar Kelimeler', 'bağış, zekat, kurban, su kuyusu')}
          </Card>

          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Banka Hesapları</h2>
            <div className="grid grid-cols-2 gap-4">
              {field('bank1_name', 'Banka 1 Adı', 'Vakıf Katılım')}
              {field('bank1_iban', 'Banka 1 IBAN', 'TR00 0000 0000 0000 0000 0000 00')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field('bank2_name', 'Banka 2 Adı')}
              {field('bank2_iban', 'Banka 2 IBAN')}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      )}

      <SiteDomainsCard />
    </div>
  )
}
