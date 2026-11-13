'use client'

import { useState } from 'react'
import axios from 'axios'
import { Card } from '@e-infak/ui'
import { adminApiBase, adminAuthHeaders, apiErrorMessage } from '../../../../lib/admin-access'

const inputClass = 'w-full rounded-lg border border-gray-300 p-2 text-sm outline-none focus:border-primary-600 bg-white'

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ current: '', next: '', repeat: '' })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const support = typeof window !== 'undefined' && sessionStorage.getItem('support_session') === '1'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (form.next !== form.repeat) {
      setMessage({ type: 'error', text: 'Yeni şifreler birbirini tutmuyor' })
      return
    }
    setSaving(true)
    try {
      await axios.post(`${adminApiBase()}/api/v1/auth/me/password`, {
        current_password: form.current,
        new_password: form.next,
        refresh_token: localStorage.getItem('refresh_token'),
      }, { headers: adminAuthHeaders() })
      setForm({ current: '', next: '', repeat: '' })
      setMessage({ type: 'ok', text: 'Şifreniz değişti. Diğer cihazlardaki oturumlarınız kapatıldı.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Şifre değiştirilemedi') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Şifremi Değiştir</h1>
        <p className="mt-1 text-sm text-gray-500">Yeni şifre en az 10 karakter olmalı. Değiştirdiğinizde diğer cihazlardaki oturumlarınız kapanır.</p>
      </div>
      {support && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Destek oturumundasınız. Kurum yöneticisinin şifresini platform konsolundaki “Şifre sıfırla” ile yenileyin.
        </div>
      )}
      {message && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${message.type === 'ok' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}
      <Card className="border border-gray-100 p-6 shadow-sm">
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-semibold text-gray-600">Mevcut şifre
            <input required type="password" autoComplete="current-password" className={inputClass}
              value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">Yeni şifre
            <input required minLength={10} type="password" autoComplete="new-password" className={inputClass}
              value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">Yeni şifre (tekrar)
            <input required minLength={10} type="password" autoComplete="new-password" className={inputClass}
              value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Kaydediliyor…' : 'Şifreyi Değiştir'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
