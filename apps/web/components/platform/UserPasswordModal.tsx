'use client'

import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Link2, QrCode, RefreshCw, Send, X } from 'lucide-react'
import { copyText, platformCall, platformError } from '../../lib/platform-api'
import { ptInput, ptPrimaryBtn, ptSecondaryBtn } from './PlatformUI'

export interface PasswordSetupResult {
  email: string
  mode: 'temp' | 'custom' | 'setup_link'
  temporary_password?: string | null
  setup_url?: string
  qr_svg?: string
  expires_hours?: number
  login_url: string
  email_sent: boolean
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function PasswordResultCard({
  result,
  orgName,
  onClose,
}: {
  result: PasswordSetupResult
  orgName: string
  onClose?: () => void
}) {
  const [copiedKey, setCopiedKey] = useState<string>('')

  const copy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 2200)
    }
  }

  const whatsappText = result.mode === 'setup_link' && result.setup_url
    ? `Merhaba, ${orgName} E-İnfak panel hesabınız (${result.email}) için şifre belirleme bağlantınız:\n${result.setup_url}\n(Bağlantı ${result.expires_hours || 24} saat geçerlidir ve tek kullanımlıktır.)`
    : `Merhaba, ${orgName} E-İnfak panel giriş bilgileriniz:\nAdres: ${result.login_url}\nE-posta: ${result.email}\nŞifre: ${result.temporary_password || ''}`

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-amber-900">
            {result.mode === 'setup_link' ? 'QR Kod ve Şifre Belirleme Bağlantısı Hazır' : 'Kullanıcı Erişim Bilgileri — Yalnızca Şimdi Gösteriliyor'}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {result.email_sent
              ? 'Bilgiler kullanıcıya e-posta ile de gönderildi.'
              : 'E-posta gönderilmedi; QR kodu okutabilir veya bilgileri aşağıdan kopyalayabilirsiniz.'}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-1 text-amber-700 hover:bg-amber-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-2 text-amber-950">
          <p>E-posta: <b className="font-mono">{result.email}</b></p>
          <p>
            Panel:{' '}
            <a href={result.login_url} target="_blank" rel="noreferrer" className="font-semibold underline">
              {result.login_url}
            </a>
          </p>
          {result.temporary_password && (
            <div className="flex flex-wrap items-center gap-2">
              <span>Şifre:</span>
              <code className="rounded-lg bg-white px-2.5 py-1 font-mono font-bold text-slate-900 ring-1 ring-amber-200">
                {result.temporary_password}
              </code>
              <button
                type="button"
                onClick={() => copy('pw', result.temporary_password || '')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                {copiedKey === 'pw' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey === 'pw' ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          )}
          {result.setup_url && (
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-semibold text-amber-800">
                Tek kullanımlık şifre belirleme linki ({result.expires_hours || 24} saat geçerli):
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={result.setup_url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => copy('link', result.setup_url || '')}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  {copiedKey === 'link' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
                  {copiedKey === 'link' ? 'Kopyalandı' : 'Linki kopyala'}
                </button>
              </div>
            </div>
          )}
        </div>

        {result.qr_svg && (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-amber-200 bg-white p-3 text-center shadow-xs">
            <div
              className="h-36 w-36 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: result.qr_svg }}
            />
            <span className="text-[11px] font-semibold text-slate-600">Telefonla okut → Şifre belirle</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => copy('wa', whatsappText)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          {copiedKey === 'wa' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedKey === 'wa' ? 'Mesaj kopyalandı ✓' : 'WhatsApp / SMS mesajı kopyala'}
        </button>
      </div>
    </div>
  )
}

export default function UserPasswordModal({
  orgId,
  orgName,
  user,
  onClose,
  onDone,
}: {
  orgId: string
  orgName: string
  user: { id: string; email: string; name: string }
  onClose: () => void
  onDone: (res: PasswordSetupResult) => void
}) {
  const [mode, setMode] = useState<'setup_link' | 'temp' | 'custom'>('setup_link')
  const [customPassword, setCustomPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [mustChange, setMustChange] = useState(true)
  const [expiresHours, setExpiresHours] = useState(24)
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PasswordSetupResult | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'custom' && customPassword.length < 10) {
      setError('Özel şifre en az 10 karakter olmalıdır.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await platformCall<PasswordSetupResult>(
        'post',
        `/organizations/${orgId}/users/${user.id}/reset-password`,
        {
          mode,
          ...(mode === 'custom' ? { custom_password: customPassword, must_change_password: mustChange } : {}),
          expires_hours: expiresHours,
          send_email: sendEmail,
        },
      )
      setResult(res)
      onDone(res)
    } catch (err) {
      setError(platformError(err, 'İşlem tamamlanamadı'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Şifre belirleme seçenekleri"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Şifre & Erişim Seçenekleri</h3>
            <p className="text-xs text-slate-500">{user.name} · {user.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5">
          {result ? (
            <div className="space-y-4">
              <PasswordResultCard result={result} orgName={orgName} />
              <div className="flex justify-end">
                <button type="button" onClick={onClose} className={ptSecondaryBtn}>Kapat</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'setup_link', label: 'QR Kod & Link', sub: 'Kendi şifresini seçer', icon: QrCode },
                  { key: 'temp', label: 'Geçici Şifre', sub: 'Otomatik üretilir', icon: RefreshCw },
                  { key: 'custom', label: 'Özel Şifre', sub: 'Elle belirle', icon: KeyRound },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setMode(opt.key); setError('') }}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                      mode === opt.key
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <opt.icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[11px] opacity-75">{opt.sub}</span>
                  </button>
                ))}
              </div>

              {mode === 'setup_link' && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                  <p>
                    Kullanıcının telefonundan okutabileceği <b>QR kod</b> ve tek kullanımlık şifre belirleme bağlantısı üretilir.
                    Mevcut şifre kullanıcı yeni şifreyi belirleyene kadar bozulmaz.
                  </p>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Bağlantı geçerlilik süresi
                    <select
                      className={ptInput}
                      value={expiresHours}
                      onChange={(e) => setExpiresHours(Number(e.target.value))}
                    >
                      <option value={6}>6 saat</option>
                      <option value={24}>24 saat (önerilen)</option>
                      <option value={72}>3 gün</option>
                      <option value={168}>7 gün</option>
                    </select>
                  </label>
                </div>
              )}

              {mode === 'temp' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                  Güçlü bir tek kullanımlık geçici şifre üretilir, kullanıcının tüm açık oturumları kapatılır ve ilk girişte şifresini değiştirmesi istenir.
                </div>
              )}

              {mode === 'custom' && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Yeni Şifre (en az 10 karakter) *
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          required
                          minLength={10}
                          type={showPw ? 'text' : 'password'}
                          value={customPassword}
                          onChange={(e) => setCustomPassword(e.target.value)}
                          placeholder="En az 10 karakter"
                          className={`${ptInput} mt-0 pe-10 font-mono`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}
                          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCustomPassword(randomPassword()); setShowPw(true) }}
                        className={ptSecondaryBtn}
                      >
                        Üret
                      </button>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={mustChange}
                      onChange={(e) => setMustChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                    İlk girişte şifresini değiştirmesi zorunlu olsun
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                Kullanıcıya e-posta ile de gönder ({user.email})
              </label>

              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className={ptSecondaryBtn}>Vazgeç</button>
                <button type="submit" disabled={busy} className={ptPrimaryBtn}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {busy
                      ? 'Hazırlanıyor…'
                      : mode === 'setup_link'
                        ? 'QR Kod & Bağlantı Oluştur'
                        : mode === 'temp'
                          ? 'Geçici Şifre Üret'
                          : 'Şifreyi Kaydet'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
