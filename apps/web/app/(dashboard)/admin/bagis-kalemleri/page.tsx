'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { Card, Button } from '@e-infak/ui'

interface DonationCategory {
  id: string
  icon: string
  title: string
  description: string
  display_order: number
  is_active: boolean
}

const EMPTY_FORM = { icon: '🤝', title: '', description: '', display_order: 0, is_active: true }

export default function AdminDonationCategoriesPage() {
  const [categories, setCategories] = useState<DonationCategory[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    return {
      Authorization: `Bearer ${token}`,
      'x-organization-slug': 'hicret-dernegi',
    }
  }

  const loadCategories = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin-features/donation-categories`, { headers: getAuthHeaders() })
      setCategories(res.data)
    } catch (err) {
      console.error('Failed to load donation categories:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const startEdit = (c: DonationCategory) => {
    setEditingId(c.id)
    setForm({ icon: c.icon, title: c.title, description: c.description, display_order: c.display_order, is_active: c.is_active })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) return

    setSaving(true)
    try {
      const headers = getAuthHeaders()
      if (editingId) {
        const res = await axios.put(`${API_BASE}/api/v1/admin-features/donation-categories/${editingId}`, form, { headers })
        setCategories((prev) => prev.map((c) => (c.id === editingId ? res.data : c)))
      } else {
        const res = await axios.post(`${API_BASE}/api/v1/admin-features/donation-categories`, form, { headers })
        setCategories((prev) => [...prev, res.data])
      }
      cancelEdit()
    } catch (err) {
      console.error('Failed to save donation category:', err)
      alert('Kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu bağış kalemini silmek istediğinize emin misiniz?')) return
    try {
      await axios.delete(`${API_BASE}/api/v1/admin-features/donation-categories/${id}`, { headers: getAuthHeaders() })
      setCategories((prev) => prev.filter((c) => c.id !== id))
      if (editingId === id) cancelEdit()
    } catch (err) {
      console.error('Failed to delete donation category:', err)
      alert('Silinemedi.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Bağış Kalemleri</h1>
        <button
          onClick={loadCategories}
          className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-white border px-3 py-1.5 rounded-lg shadow-sm"
        >
          🔄 Yenile
        </button>
      </div>
      <p className="text-sm text-gray-500 -mt-6">
        Ana sayfadaki &quot;Bağış Kategorileri / Hızlı Bağış&quot; grid&apos;inde görünen kalemler. Sıralama küçükten büyüğe uygulanır.
      </p>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500 animate-pulse py-6 text-center">Yükleniyor...</p>
          ) : categories.length === 0 ? (
            <Card className="p-8 border border-gray-100 shadow-sm text-center text-sm text-gray-400">
              Henüz bağış kalemi eklenmedi.
            </Card>
          ) : (
            categories.map((c) => (
              <Card key={c.id} className="p-4 border border-gray-100 shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl flex-shrink-0">{c.icon}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                      {c.title}
                      {!c.is_active && <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Pasif</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{c.description}</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => startEdit(c)} className="text-xs font-bold text-primary-600 hover:text-primary-700 px-2 py-1">
                    Düzenle
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1">
                    Sil
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-5">
          <Card className="p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">
              {editingId ? 'Kalemi Düzenle' : 'Yeni Bağış Kalemi'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">İkon</label>
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm text-center outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Başlık *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Açıklama *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500 resize-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Sıra</label>
                  <input
                    type="number"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-primary-500"
                  />
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded"
                    />
                    Aktif
                  </label>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                {editingId && (
                  <Button type="button" onClick={cancelEdit} className="flex-1 border text-gray-600 font-bold py-2.5 text-xs uppercase">
                    Vazgeç
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 text-xs uppercase"
                >
                  {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Ekle'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
