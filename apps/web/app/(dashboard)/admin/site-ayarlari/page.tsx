'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface OrgSettings {
  contact_phone: string | null
  contact_email: string | null
  contact_address: string | null
  bank1_name: string | null
  bank1_iban: string | null
  bank2_name: string | null
  bank2_iban: string | null
}

const EMPTY: OrgSettings = {
  contact_phone: '',
  contact_email: '',
  contact_address: '',
  bank1_name: '',
  bank1_iban: '',
  bank2_name: '',
  bank2_iban: '',
}

export default function AdminSiteSettingsPage() {
  const [form, setForm] = useState<OrgSettings>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

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
      alert('Kaydedilemedi.')
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
    </div>
  )
}
