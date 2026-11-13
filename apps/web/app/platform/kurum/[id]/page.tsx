'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertList } from '../../../../components/platform/AlertList'
import { Catalog, PlatformAlert, PlatformDomain, PlatformOrg, dateTr, platformCall, platformError } from '../../../../lib/platform-api'

interface Field { key: string; label: string; secret: boolean; optional: boolean; choices: Record<string, string> | null }
interface Account { key: string; label: string; kind: 'payment' | 'sms'; fields: Field[]; values: Record<string, string | null>; configured: boolean }
interface Detail extends PlatformOrg {
  users: OrgUser[]
  provider_accounts: Account[]
}
type Msg = { type: 'ok' | 'error'; text: string } | null
type Issued = { email: string; temporary_password: string; login_url: string }
interface OrgUser { id: string; email: string; name: string; role: string | null; role_label: string | null; is_active: boolean; last_login_at: string | null }

const input = 'w-full rounded-lg border bg-white p-2 text-sm'
const errorText = platformError

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">{title}</h2>{children}</section>
}

function AccountForm({ orgId, account, onSaved }: { orgId: string; account: Account; onSaved: (a: Account) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(account.fields.map((f) => [f.key, f.secret ? '' : account.values[f.key] || ''])))
  const [msg, setMsg] = useState<Msg>(null)
  const save = async () => {
    try {
      const saved = await platformCall<Account>('put', `/organizations/${orgId}/provider-accounts/${account.key}`, { values })
      onSaved({ ...saved, kind: account.kind })
      setMsg({ type: 'ok', text: 'Kaydedildi' })
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err, 'Kaydedilemedi') })
    }
  }
  return (
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {account.label} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${account.configured ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{account.configured ? 'girildi' : 'yok'}</span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {account.fields.map((f) => (
          <label key={f.key} className="text-xs font-semibold text-slate-600">{f.label}{f.optional ? ' (isteğe bağlı)' : ''}
            {f.choices ? (
              <select className={input} value={values[f.key] || ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                <option value="">Seçin</option>
                {Object.entries(f.choices).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <input className={input} type={f.secret ? 'password' : 'text'} autoComplete="off" value={values[f.key] || ''}
                placeholder={f.secret && account.values[f.key] ? `Kayıtlı (${account.values[f.key]})` : ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={save} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Kaydet</button>
        {msg && <span className={`text-xs font-semibold ${msg.type === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </details>
  )
}

export default function PlatformOrganizationPage() {
  const { id } = useParams<{ id: string }>()
  const [org, setOrg] = useState<Detail | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [plan, setPlan] = useState({ plan: '', enabled_addons: [] as string[], extra_user_seats: 0 })
  const [newDomain, setNewDomain] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [alerts, setAlerts] = useState<PlatformAlert[]>([])
  const [adding, setAdding] = useState(false)
  const emptyUser = { first_name: '', last_name: '', email: '', role: 'editor' }
  const [newUser, setNewUser] = useState(emptyUser)

  const load = useCallback(async () => {
    const data = await platformCall<Detail>('get', `/organizations/${id}`)
    setOrg(data)
    platformCall<PlatformAlert[]>('get', `/alerts?org_id=${id}`).then(setAlerts).catch(() => undefined)
    setPlan({ plan: data.plan, enabled_addons: data.enabled_addons, extra_user_seats: data.extra_user_seats })
  }, [id])

  useEffect(() => {
    load().catch((err) => setMsg({ type: 'error', text: errorText(err, 'Kurum yüklenemedi') }))
    platformCall<Catalog>('get', '/catalog').then(setCatalog).catch(() => undefined)
  }, [load])

  const run = async (action: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try {
      await action()
      await load()
      setMsg({ type: 'ok', text: ok })
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err, 'İşlem tamamlanamadı') })
    }
  }

  if (!org) return <p className="text-sm text-slate-500">{msg?.text || 'Yükleniyor…'}</p>

  const addons = catalog?.plans.find((p) => p.key === plan.plan)?.addons || []
  const supportSignIn = async () => {
    try {
      const res = await platformCall<{ url: string }>('post', `/organizations/${org.id}/support-session`)
      window.open(res.url, '_blank', 'noopener')
      setMsg({ type: 'ok', text: 'Destek oturumu yeni sekmede açıldı (30 dakika geçerli; kurumun kayıtlarına işlendi).' })
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err, 'Destek girişi açılamadı') })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <a href={org.url} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline">{org.url}</a>
          <p className="text-xs text-slate-500">Oluşturulma: {dateTr(org.created_at)} · {org.legal_name} · {org.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={supportSignIn} disabled={!org.is_active}
            className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">Panele destek girişi</button>
          {org.is_active ? (
            <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => window.confirm(`${org.name} askıya alınsın mı? Site ve panel hemen kapanır.`) &&
                run(() => platformCall('patch', `/organizations/${org.id}`, { is_active: false }), 'Kurum askıya alındı')}>
              Askıya al
            </button>
          ) : (
            <button type="button" className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => run(() => platformCall('patch', `/organizations/${org.id}`, { is_active: true }), 'Kurum yeniden aktif')}>
              Aktif et
            </button>
          )}
        </div>
      </div>
      {msg && <p className={`rounded-lg p-3 text-sm font-semibold ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      {alerts.length > 0 && <AlertList alerts={alerts} showOrg={false} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Kullanıcılar">
          {issued && (
            <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-900">{issued.email} için yeni geçici şifre — yalnız şimdi gösterilir:</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-white px-2 py-1 font-mono text-base select-all">{issued.temporary_password}</code>
                <button type="button" className="rounded border bg-white px-2 py-1 text-xs font-semibold"
                  onClick={() => navigator.clipboard?.writeText(issued.temporary_password)}>Kopyala</button>
                <button type="button" className="rounded border bg-white px-2 py-1 text-xs" onClick={() => setIssued(null)}>Kapat</button>
              </div>
              <p className="text-xs text-amber-800">Giriş: <a className="underline" href={issued.login_url} target="_blank" rel="noreferrer">{issued.login_url}</a>. Kullanıcı girdikten sonra “Şifremi değiştir”den kendi şifresini belirlemeli.</p>
            </div>
          )}
          {(() => {
            const active = org.users.filter((u) => u.is_active).length
            const full = active >= org.user_limit
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={full ? 'font-semibold text-amber-700' : 'text-slate-500'}>
                  Aktif kullanıcı {active} / {org.user_limit}{full ? ' — sınır dolu; yeni hesap için paketi yükseltin veya ek hak verin' : ''}
                </span>
                <button type="button" disabled={full && !adding} onClick={() => { setAdding(!adding); setNewUser(emptyUser) }}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">
                  {adding ? 'Vazgeç' : '+ Kullanıcı ekle'}
                </button>
              </div>
            )
          })()}
          {adding && (
            <form className="grid gap-2 rounded-xl border bg-slate-50 p-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  setIssued(await platformCall<Issued>('post', `/organizations/${org.id}/users`, newUser))
                  setAdding(false)
                  setNewUser(emptyUser)
                }, `${newUser.email} eklendi`)
              }}>
              <label className="text-xs font-semibold text-slate-600">Ad
                <input required className={input} value={newUser.first_name} onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">Soyad
                <input className={input} value={newUser.last_name} onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">E-posta
                <input required type="email" className={input} value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-600">Rol
                <select className={input} value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  {(catalog?.roles || []).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">Geçici şifre üretilir ve bir kez gösterilir. Görsel/içerik yükleyecekler için “İçerik Editörü” yeterlidir.</p>
              <div className="sm:col-span-2"><button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Hesabı oluştur</button></div>
            </form>
          )}
          <ul className="divide-y text-sm">
            {org.users.map((u) => (
              <li key={u.id} className={`space-y-1.5 py-2.5 ${u.is_active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span><b>{u.name}</b> <span className="text-slate-500">{u.email}</span></span>
                  <span className="text-xs text-slate-500">son giriş {u.last_login_at ? dateTr(u.last_login_at) : 'hiç yok'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {u.role === 'platform_admin' ? <span className="font-semibold">{u.role_label}</span> : (
                    <select aria-label={`${u.email} rolü`} className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold" value={u.role || ''}
                      onChange={(e) => run(() => platformCall('patch', `/organizations/${org.id}/users/${u.id}`, { role: e.target.value }), `${u.email} rolü değişti`)}>
                      {(catalog?.roles || []).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  )}
                  <button type="button" className={`rounded border px-2 py-1 font-semibold ${u.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}
                    title={u.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                    onClick={() => (u.is_active ? window.confirm(`${u.email} pasifleştirilsin mi? Hemen oturumu kapanır ve giriş yapamaz.`) : true) &&
                      run(() => platformCall('patch', `/organizations/${org.id}/users/${u.id}`, { is_active: !u.is_active }),
                        u.is_active ? `${u.email} pasifleştirildi` : `${u.email} aktifleştirildi`)}>
                    {u.is_active ? 'Aktif' : 'Pasif'}
                  </button>
                  <button type="button" className="rounded border px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => window.confirm(`${u.email} için yeni geçici şifre üretilsin mi? Eski şifre hemen geçersiz olur ve tüm oturumları kapanır.`) &&
                      run(async () => {
                        setIssued(await platformCall<Issued>('post', `/organizations/${org.id}/users/${u.id}/reset-password`))
                      }, `${u.email} için yeni şifre üretildi`)}>
                    Şifre sıfırla
                  </button>
                </div>
              </li>
            ))}
        </Card>

        <Card title="Paket">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Paket
              <select className={input} value={plan.plan} onChange={(e) => setPlan({ ...plan, plan: e.target.value, enabled_addons: [] })}>
                {(catalog?.plans || []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Ek kullanıcı hakkı
              <input type="number" min={0} max={100} className={input} value={plan.extra_user_seats}
                onChange={(e) => setPlan({ ...plan, extra_user_seats: Number(e.target.value) || 0 })} />
            </label>
          </div>
          {addons.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600">Ek modüller</p>
              {addons.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={plan.enabled_addons.includes(a)} onChange={(e) => setPlan({
                    ...plan, enabled_addons: e.target.checked ? [...plan.enabled_addons, a] : plan.enabled_addons.filter((x) => x !== a),
                  })} />
                  {catalog?.features[a] || a}
                </label>
              ))}
            </div>
          )}
                    <button type="button" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => run(() => platformCall('patch', `/organizations/${org.id}`, plan), 'Paket güncellendi')}>Paketi kaydet</button>
        </Card>

        <Card title="Alan adları">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between rounded-lg bg-slate-50 p-2"><span>{org.subdomain}.{catalog?.base_domain || 'e-infak.org'}</span><span className="text-xs text-green-700">platform adresi</span></li>
            {org.domains.map((d) => (
              <li key={d.id} className="space-y-1 rounded-lg border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{d.domain}{d.is_primary && d.status === 'active' ? ' (ana adres)' : ''}</span>
                  <span className="flex gap-2">
                    {d.status !== 'active' && (
                      <button type="button" className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => run(async () => {
                          const res = await platformCall<PlatformDomain>('post', `/organizations/${org.id}/domains/${d.id}/verify`)
                          if (res.status !== 'active') {
                            await load()
                            throw { response: { data: { detail: res.last_check_error || 'DNS kayıtları henüz doğru değil' } } }
                          }
                        }, `${d.domain} doğrulandı ve yayında`)}>
                        Doğrula
                      </button>
                    )}
                    {d.status !== 'active' && (
                      <button type="button" className="rounded border border-green-600 px-2 py-1 text-xs font-semibold text-green-700"
                        title="TXT kaydı olmadan, A kaydını kendiniz kontrol ettiyseniz"
                        onClick={() => window.confirm(`${d.domain} A kaydı bu sunucuyu gösteriyor mu? TXT doğrulaması atlanır ve site bu adreste açılır.`) &&
                          run(() => platformCall('post', `/organizations/${org.id}/domains/${d.id}/activate`), `${d.domain} etkin`)}>
                        Elle etkinleştir
                      </button>
                    )}
                    <button type="button" className="rounded border px-2 py-1 text-xs"
                      onClick={() => window.confirm(`${d.domain} kaldırılsın mı?`) &&
                        run(() => platformCall('delete', `/organizations/${org.id}/domains/${d.id}`), `${d.domain} kaldırıldı`)}>
                      Kaldır
                    </button>
                  </span>
                </div>
                {d.status !== 'active' && (
                  <div className="space-y-1 text-xs text-amber-800">
                    <p>Bekliyor. Kurum DNS’e şu kayıtları girince sistem birkaç dakika içinde kendisi doğrular (ya da “Doğrula”ya basın); SSL otomatik alınır.</p>
                    <ul className="font-mono text-slate-700">
                      {d.dns_records.map((r) => <li key={r.type + r.name} className="break-all">{r.type} {r.host} → {r.value}</li>)}
                    </ul>
                    {d.last_check_error && <p className="text-red-700">Son kontrol: {d.last_check_error}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className={input} placeholder="kurumadi.org" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
            <button type="button" className="whitespace-nowrap rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white" disabled={!newDomain}
              onClick={() => run(async () => { await platformCall('post', `/organizations/${org.id}/domains`, { domain: newDomain }); setNewDomain('') }, 'Alan adı eklendi')}>
              Ekle
            </button>
          </div>
        </Card>

        <Card title="Ödeme ve SMS hesapları">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Kullanılan ödeme sağlayıcısı
              <select className={input} value={org.payment_provider}
                onChange={(e) => run(() => platformCall('patch', `/organizations/${org.id}`, { payment_provider: e.target.value }), 'Ödeme sağlayıcısı değişti')}>
                {org.provider_accounts.filter((a) => a.kind === 'payment').map((a) => <option key={a.key} value={a.key}>{a.label}{a.configured ? '' : ' (bilgi yok)'}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Kullanılan SMS firması
              <select className={input} value={org.sms_provider}
                onChange={(e) => run(() => platformCall('patch', `/organizations/${org.id}`, { sms_provider: e.target.value }), 'SMS firması değişti')}>
                {org.provider_accounts.filter((a) => a.kind === 'sms').map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={org.sms_platform_fallback}
              onChange={(e) => run(() => platformCall('patch', `/organizations/${org.id}`, { sms_platform_fallback: e.target.checked }), 'SMS ayarı güncellendi')} />
            Kurumun SMS hesabı yoksa platform SMS hesabı kullanılsın
          </label>
          <div className="space-y-2">
            {org.provider_accounts.length === 0 && <p className="text-xs text-red-700">Sunucuda şifreleme anahtarı tanımlı değil.</p>}
            {org.provider_accounts.map((a) => (
              <AccountForm key={a.key} orgId={org.id} account={a}
                onSaved={(saved) => setOrg({ ...org, provider_accounts: org.provider_accounts.map((x) => (x.key === saved.key ? saved : x)) })} />
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}
