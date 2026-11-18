'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { ptCard, ptInput, ptPrimaryBtn } from '../../../components/platform/PlatformUI'
import { platformCall, platformError, setPlatformToken } from '../../../lib/platform-api'

export default function PlatformPasswordPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== repeat) return setMsg({ ok: false, text: 'Yeni şifreler aynı değil' })
    setBusy(true)
    setMsg(null)
    try {
      const res = await platformCall<{ access_token: string }>('post', '/me/password', { current_password: current, new_password: next })
      // The old token stops working once the password changes: keep the session with the new one.
      setPlatformToken(res.access_token)
      // Reload so the layout drops a "change your password" lock.
      window.location.href = '/platform'
    } catch (err) {
      setMsg({ ok: false, text: platformError(err, 'Şifre değiştirilemedi') })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={`mx-auto max-w-md space-y-4 ${ptCard}`}>
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <KeyRound className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        <h1 className="text-lg font-extrabold text-slate-900">Şifre değiştir</h1>
      </div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
        Mevcut şifre
        <input type="password" required autoComplete="current-password" className={ptInput} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
        Yeni şifre (en az 8 karakter)
        <input type="password" required minLength={8} autoComplete="new-password" className={ptInput} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
        Yeni şifre (tekrar)
        <input type="password" required minLength={8} autoComplete="new-password" className={ptInput} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      {msg && (
        <p className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={busy} className={`w-full ${ptPrimaryBtn}`}>
        {busy ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </form>
  )
}
