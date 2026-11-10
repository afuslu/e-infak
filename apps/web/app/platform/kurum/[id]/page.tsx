'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Catalog, PlatformDomain, PlatformOrg, dateTr, platformCall } from '../../../../lib/platform-api'

interface Field { key: string; label: string; secret: boolean; optional: boolean; choices: Record<string, string> | null }
interface Account { key: string; label: string; kind: 'payment' | 'sms'; fields: Field[]; values: Record<string, string | null>; configured: boolean }
interface Detail extends PlatformOrg {
  users: { id: string; email: string; name: string; role: string | null; is_active: boolean; last_login_at: string | null }[]
  provider_accounts: Account[]
}
type Msg = { type: 'ok' | 'error'; text: string } | null

const input = 'w-full rounded-lg border bg-white p-2 text-sm'
const errorText = (err: unknown, fallback: string) => {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

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

  const load = useCallback(async () => {
    const data = await platformCall<Detail>('get', `/organizations/${id}`)
    setOrg(data)
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

      <div className="grid gap-5 lg:grid-cols-2">
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
          <p className="text-xs text-slate-500">Kullanıcı: {org.users.filter((u) => u.is_active).length} / {org.user_limit}</p>
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

        <Card title="Kullanıcılar">
          <ul className="divide-y text-sm">
            {org.users.map((u) => (
              <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><b>{u.name}</b> <span className="text-slate-500">{u.email}</span></span>
                <span className="text-xs text-slate-500">{u.role} · son giriş {dateTr(u.last_login_at)}{u.is_active ? '' : ' · pasif'}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
