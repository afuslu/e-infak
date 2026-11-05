'use client'

import { useState } from 'react'
import { platformCall } from '../../../lib/platform-api'

export default function PlatformPasswordPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== repeat) return setMsg({ ok: false, text: 'Yeni şifreler aynı değil' })
    try {
      await platformCall('post', '/me/password', { current_password: current, new_password: next })
      setCurrent(''); setNext(''); setRepeat('')
      setMsg({ ok: true, text: 'Şifreniz değiştirildi' })
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      setMsg({ ok: false, text: typeof detail === 'string' ? detail : 'Yeni şifre en az 12 karakter olmalı' })
    }
  }

  const field = 'mt-1 w-full rounded-lg border p-2.5 font-normal'
  return (
    <form onSubmit={submit} className="max-w-sm space-y-4 rounded-2xl border bg-white p-6">
      <h1 className="text-xl font-bold">Şifre değiştir</h1>
      <label className="block text-sm font-semibold">Mevcut şifre
        <input type="password" required autoComplete="current-password" className={field} value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Yeni şifre (en az 12 karakter)
        <input type="password" required minLength={12} autoComplete="new-password" className={field} value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Yeni şifre (tekrar)
        <input type="password" required minLength={12} autoComplete="new-password" className={field} value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
      {msg && <p className={`rounded-lg p-2 text-sm font-semibold ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <button type="submit" className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white">Kaydet</button>
    </form>
  )
}
