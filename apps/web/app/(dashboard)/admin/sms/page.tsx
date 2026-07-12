'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface SmsTemplate {
  id: string
  name: string
  body: string
  updated_at?: string
}

export default function AdminSmsPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<SmsTemplate | null>(null)
  const [editedBody, setEditedBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi'
    }
  }

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/sms-templates`, { headers })
      setTemplates(res.data)
      if (res.data.length > 0) {
        setSelectedTemplate(res.data[0])
        setEditedBody(res.data[0].body)
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleSelectTemplate = (tpl: SmsTemplate) => {
    setSelectedTemplate(tpl)
    setEditedBody(tpl.body)
    setSuccessMsg('')
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTemplate || !editedBody.trim()) return

    setSaving(true)
    setSuccessMsg('')
    try {
      const headers = getAuthHeaders()
      const res = await axios.put(`${API_BASE}/api/v1/admin-features/sms-templates/${selectedTemplate.id}`, {
        body: editedBody
      }, { headers })
      
      setSuccessMsg('SMS Şablonu başarıyla güncellendi!')
      setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? res.data : t))
      setSelectedTemplate(res.data)
    } catch (err) {
      console.error('Failed to save template:', err)
      alert('Şablon güncellenemedi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">SMS Şablon Yönetimi</h1>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 font-semibold border border-green-100 animate-fade-in">
          ✨ {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Şablonlar yükleniyor...</p>
      ) : (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Template selector list */}
          <div className="lg:col-span-4 space-y-3">
            <Card className="p-4 border border-gray-100 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Şablon Listesi</h3>
              <div className="space-y-2">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t)}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-bold transition-all block ${selectedTemplate?.id === t.id ? 'border-primary-600 bg-primary-50/50 text-primary-900' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                  >
                    ✉️ {t.name}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Template editor form */}
          {selectedTemplate && (
            <div className="lg:col-span-8 space-y-6">
              <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="border-b pb-2 flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900">{selectedTemplate.name} Şablonunu Düzenle</h2>
                  {selectedTemplate.updated_at && (
                    <span className="text-[10px] text-gray-400">
                      Güncelleme: {new Date(selectedTemplate.updated_at).toLocaleString('tr-TR')}
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveTemplate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Şablon Mesaj Gövdesi</label>
                    <textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-4 text-xs font-mono outline-none focus:border-primary-500 min-h-[140px] leading-relaxed"
                      required
                    />
                  </div>

                  {/* Variables Hint Panel */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kullanılabilir Dinamik Değişkenler</span>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 font-semibold font-mono">
                      <div>
                        <span className="text-primary-600">{'{donor_name}'}</span> ➔ Bağışçı Ad Soyadı
                      </div>
                      <div>
                        <span className="text-primary-600">{'{amount_lira}'}</span> ➔ Bağış Tutarı (TL)
                      </div>
                      <div>
                        <span className="text-primary-600">{'{campaign_name}'}</span> ➔ Kampanya Başlığı
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={saving}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase"
                    >
                      {saving ? 'Kaydediliyor...' : 'Şablonu Güncelle'}
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
