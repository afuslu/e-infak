'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import { ptCard, ptInput, ptPrimaryBtn, ptSecondaryBtn } from '../../../components/platform/PlatformUI'
import { copyText, PlatformMe, platformCall, platformError, setPlatformToken } from '../../../lib/platform-api'

export default function PlatformPasswordPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [me, setMe] = useState<PlatformMe | null>(null)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_uri: string; qr_svg: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpBusy, setTotpBusy] = useState(false)
  const [totpMsg, setTotpMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)

  useEffect(() => {
    platformCall<PlatformMe>('get', '/me').then(setMe).catch(() => undefined)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 10) return setMsg({ ok: false, text: 'Yeni şifre en az 10 karakter olmalı' })
    if (next !== repeat) return setMsg({ ok: false, text: 'Yeni şifreler aynı değil' })
    setBusy(true)
    setMsg(null)
    try {
      const res = await platformCall<{ access_token: string }>('post', '/me/password', { current_password: current, new_password: next })
      setPlatformToken(res.access_token)
      window.location.href = '/platform'
    } catch (err) {
      setMsg({ ok: false, text: platformError(err, 'Şifre değiştirilemedi') })
      setBusy(false)
    }
  }

  const start2FA = async () => {
    setTotpBusy(true)
    setTotpMsg(null)
    try {
      const res = await platformCall<{ secret: string; otpauth_uri: string; qr_svg: string }>('post', '/me/2fa/setup')
      setTotpSetup(res)
      setTotpCode('')
    } catch (err) {
      setTotpMsg({ ok: false, text: platformError(err, '2FA kurulumu başlatılamadı') })
    } finally {
      setTotpBusy(false)
    }
  }

  const verify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setTotpBusy(true)
    setTotpMsg(null)
    try {
      await platformCall('post', '/me/2fa/verify', { code: totpCode.trim() })
      setTotpSetup(null)
      setTotpCode('')
      setMe((prev) => (prev ? { ...prev, totp_enabled: true } : prev))
      setTotpMsg({ ok: true, text: 'İki aşamalı doğrulama (2FA) etkinleştirildi.' })
    } catch (err) {
      setTotpMsg({ ok: false, text: platformError(err, 'Kod doğrulanamadı') })
    } finally {
      setTotpBusy(false)
    }
  }

  const disable2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setTotpBusy(true)
    setTotpMsg(null)
    try {
      await platformCall('post', '/me/2fa/disable', { code: totpCode.trim() })
      setTotpCode('')
      setMe((prev) => (prev ? { ...prev, totp_enabled: false } : prev))
      setTotpMsg({ ok: true, text: '2FA devre dışı bırakıldı.' })
    } catch (err) {
      setTotpMsg({ ok: false, text: platformError(err, '2FA kapatılamadı') })
    } finally {
      setTotpBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <form onSubmit={submit} className={`space-y-4 ${ptCard}`}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <KeyRound className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h1 className="text-lg font-extrabold text-slate-900">Şifre değiştir</h1>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Mevcut şifre
          <input type="password" required autoComplete="current-password" className={ptInput} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Yeni şifre (en az 10 karakter)
          <input type="password" required minLength={10} autoComplete="new-password" className={ptInput} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Yeni şifre (tekrar)
          <input type="password" required minLength={10} autoComplete="new-password" className={ptInput} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
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

      {me && !me.must_change_password && (
        <section className={`space-y-4 ${ptCard}`}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h2 className="text-lg font-extrabold text-slate-900">İki Aşamalı Doğrulama (2FA)</h2>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${me.totp_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              {me.totp_enabled ? 'Etkin' : 'Kapalı'}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Google Authenticator, Authy veya Apple Passwords ile platform girişine 6 haneli tek kullanımlık doğrulama kodu ekleyin.
          </p>

          {totpMsg && (
            <p className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${totpMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {totpMsg.text}
            </p>
          )}

          {!me.totp_enabled && !totpSetup && (
            <button type="button" disabled={totpBusy} onClick={start2FA} className={ptPrimaryBtn}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{totpBusy ? 'Hazırlanıyor…' : '2FA Kurulumunu Başlat'}</span>
            </button>
          )}

          {totpSetup && (
            <form onSubmit={verify2FA} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                {totpSetup.qr_svg && (
                  <div
                    className="h-36 w-36 shrink-0 rounded-xl border border-slate-200 bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: totpSetup.qr_svg }}
                  />
                )}
                <div className="space-y-2 text-xs text-slate-600">
                  <p className="font-semibold text-slate-900">1. QR kodu uygulamanızla okutun</p>
                  <p>Elle girmek isterseniz kurulum anahtarı:</p>
                  <div className="flex items-center gap-1.5">
                    <code className="rounded bg-white px-2 py-1 font-mono text-xs font-bold text-slate-900 ring-1 ring-slate-200">
                      {totpSetup.secret}
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copyText(totpSetup.secret)) {
                          setCopiedSecret(true)
                          window.setTimeout(() => setCopiedSecret(false), 2000)
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copiedSecret ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      {copiedSecret ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                </div>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Uygulamadaki 6 haneli doğrulama kodu
                <input
                  required
                  inputMode="numeric"
                  maxLength={12}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className={`${ptInput} font-mono tracking-[0.2em]`}
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={totpBusy} className={ptPrimaryBtn}>
                  {totpBusy ? 'Doğrulanıyor…' : 'Doğrula ve Etkinleştir'}
                </button>
                <button type="button" onClick={() => { setTotpSetup(null); setTotpCode('') }} className={ptSecondaryBtn}>
                  Vazgeç
                </button>
              </div>
            </form>
          )}

          {me.totp_enabled && (
            <form onSubmit={disable2FA} className="space-y-3 rounded-xl border border-red-200/70 bg-red-50/40 p-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                2FA&apos;yı kapatmak için mevcut 6 haneli kodu girin
                <input
                  required
                  inputMode="numeric"
                  maxLength={12}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className={`${ptInput} font-mono tracking-[0.2em]`}
                />
              </label>
              <button
                type="submit"
                disabled={totpBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{totpBusy ? 'İşleniyor…' : '2FA Devre Dışı Bırak'}</span>
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
