'use client'

/** STK PRO "Tercihlerim": what this browser remembers for you (table columns, rows per page, export columns, shortcuts). */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { apiErrorMessage, v1Send } from '../../../../lib/admin-access'
import { confirmDialog, toast } from '../../../../components/admin/ui'

const NAMES: Record<string, string> = {
  donors: 'Bağışçılar', campaigns: 'Kampanyalar', receipts: 'Tüm Makbuzlar', 'online-donations': 'Online Bağış', 'campaign-tabs': 'Kampanya Sekmeler',
  'campaign-pages': 'Kampanya Sayfaları', 'sms-lists': 'SMS Listeleri', 'mail-lists': 'Mail Listeleri', 'mail-templates': 'Mail Şablonları',
  'mail-batches': 'Mail Gönderimleri', representatives: 'Temsilciler', exports: 'Dışa Aktarımlar', 'active-sessions': 'Aktif Oturumlar',
}
const GROUPS: [string, string][] = [
  ['einfak-list-cols:', 'Tablo düzeni (gizlenen sütunlar)'],
  ['einfak-list-size:', 'Sayfa başına kayıt'],
  ['einfak-export-cols:', 'Dışa aktarma sütunları'],
]
const SINGLE: [string, string][] = [
  ['einfak-shortcuts', 'Klavye kısayolları'],
  ['einfak-admin-tema', 'Panel teması'],
  ['einfak-admin-egitim-modu', 'Eğitim modu'],
  ['einfak-admin-gorunum', 'Görünüm (sıkı / normal)'],
  ['einfak-admin-sidebar-collapsed', 'Menü paneli daraltma'],
]

function describe(key: string, value: string) {
  try {
    const v = JSON.parse(value)
    if (Array.isArray(v)) return v.length ? `${v.length} öğe` : 'varsayılan'
    if (v && typeof v === 'object') return `${Object.keys(v).length} ayar`
    return String(v)
  } catch {
    return value
  }
}

export default function PreferencesPage() {
  const [entries, setEntries] = useState<[string, string][]>([])
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpBusy, setTotpBusy] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)

  const start2fa = async () => {
    setTotpBusy(true)
    try {
      const res = await v1Send<{ secret: string; otpauth_uri: string }>('post', '/auth/2fa/setup')
      setTotpSetup(res.data)
      setTotpCode('')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    } finally {
      setTotpBusy(false)
    }
  }
  const confirm2fa = async () => {
    setTotpBusy(true)
    try {
      await v1Send('post', '/auth/2fa/verify', { code: totpCode.trim() })
      setTotpEnabled(true)
      setTotpSetup(null)
      setTotpCode('')
      toast.ok('İki adımlı doğrulama (2FA) etkinleştirildi')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    } finally {
      setTotpBusy(false)
    }
  }
  const disable2fa = async () => {
    setTotpBusy(true)
    try {
      await v1Send('post', '/auth/2fa/disable', { code: totpCode.trim() })
      setTotpEnabled(false)
      setTotpCode('')
      toast.ok('2FA devre dışı bırakıldı')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    } finally {
      setTotpBusy(false)
    }
  }
  const read = () => {
    try {
      const out: [string, string][] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('einfak-')) out.push([k, localStorage.getItem(k) || ''])
      }
      setEntries(out.sort())
    } catch { setEntries([]) }
  }
  useEffect(read, [])
  const reset = (key: string) => { try { localStorage.removeItem(key) } catch { /* ignore */ } read(); toast.ok('Varsayılana döndü') }
  const resetAll = async () => {
    if (!(await confirmDialog({ title: 'Tüm tercihler varsayılana dönsün mü?', text: 'Tablo düzenleri, kısayollar ve görünüm ayarları bu tarayıcıda sıfırlanır.', danger: true }))) return
    entries.forEach(([k]) => { try { localStorage.removeItem(k) } catch { /* ignore */ } })
    read()
  }
  const row = (key: string, label: string, sub: string, value: string) => (
    <li key={key} className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold text-gray-900">{label}</div><div className="text-[12.5px] text-gray-500">{sub} · {describe(key, value)}</div></div>
      <button type="button" onClick={() => reset(key)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50">Varsayılana dön</button>
    </li>
  )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><SlidersHorizontal className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Tercihlerim</h1>
        <button type="button" onClick={resetAll} disabled={!entries.length} className="ms-auto rounded-lg bg-rose-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40">Tümünü Varsayılana Döndür</button>
      </div>
      <p className="text-[13px] text-gray-500">Bu tercihler bu tarayıcıda saklanır. Kısayolları <Link href="/admin/kisayollar" className="font-semibold text-primary-700">Kısayollar</Link> sayfasından değiştirebilirsiniz.</p>
      <section className="rounded-2xl border border-slate-200/80 bg-white px-5">
        <ul className="divide-y divide-gray-100">
          {entries.map(([k, v]) => {
            const group = GROUPS.find(([p]) => k.startsWith(p))
            if (group) { const table = k.slice(group[0].length); return row(k, NAMES[table] || table, group[1], v) }
            const single = SINGLE.find(([key]) => key === k)
            return single ? row(k, single[1], 'Genel', v) : null
          })}
          {!entries.length && <li className="py-8 text-center text-[13px] text-gray-400">Kayıtlı tercih yok; her şey varsayılan.</li>}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-gray-900">İki Adımlı Doğrulama (2FA / TOTP)</h2>
            <p className="text-[12.5px] text-gray-500">Google Authenticator, Authy veya 1Password ile giriş güvenliğini artırın.</p>
          </div>
          {!totpSetup && (
            <button type="button" disabled={totpBusy} onClick={start2fa}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {totpEnabled ? 'Anahtarı Yenile' : '2FA Kurulumunu Başlat'}
            </button>
          )}
        </div>
        {totpSetup && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-[13px]">
            <p className="text-gray-700">Authenticator uygulamanızda yeni hesap ekleyin ve aşağıdaki kurulum anahtarını girin:</p>
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm font-bold tracking-widest text-gray-900 select-all">
              {totpSetup.secret}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 haneli kod"
                inputMode="numeric"
                maxLength={6}
                className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm tracking-widest outline-none focus:border-emerald-600"
              />
              <button type="button" disabled={totpBusy || totpCode.length < 6} onClick={confirm2fa}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                Doğrula ve Etkinleştir
              </button>
            </div>
          </div>
        )}
        {!totpSetup && totpEnabled && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Kapatmak için 6 haneli kod"
              inputMode="numeric"
              maxLength={6}
              className="w-52 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs outline-none"
            />
            <button type="button" disabled={totpBusy || totpCode.length < 6} onClick={disable2fa}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
              2FA&apos;yı Kapat
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
