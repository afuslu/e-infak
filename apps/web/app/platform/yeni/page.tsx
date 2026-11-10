'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Catalog, PlatformOrg, platformCall } from '../../../lib/platform-api'

const field = 'mt-1 w-full rounded-lg border bg-white p-2.5 text-sm font-normal'
const slugify = (text: string) => text.toLocaleLowerCase('tr')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export default function NewOrganizationPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [form, setForm] = useState({
    name: '', legal_name: '', subdomain: '', email: '', phone: '', city: '', plan: 'baslangic', template: 'sade',
    primary_color: '#059669', admin_email: '', admin_first_name: '', admin_last_name: '',
  })
  const [subdomainTouched, setSubdomainTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ organization: PlatformOrg; admin: { email: string; temporary_password: string; login_url: string } } | null>(null)

  useEffect(() => { platformCall<Catalog>('get', '/catalog').then(setCatalog).catch(() => undefined) }, [])

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({
    ...f, [key]: value, ...(key === 'name' && !subdomainTouched ? { subdomain: slugify(value) } : {}),
  }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      setCreated(await platformCall('post', '/organizations', body))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      setError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: { msg?: string }) => d.msg).join(', ') : 'Kurum oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="max-w-xl space-y-4 rounded-2xl border bg-white p-6">
        <h1 className="text-xl font-bold">✅ {created.organization.name} oluşturuldu</h1>
        <p className="text-sm">Site adresi: <a className="text-blue-700 underline" href={created.organization.url} target="_blank" rel="noreferrer">{created.organization.url}</a></p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-amber-900">Yönetici bilgileri — yalnızca şimdi gösteriliyor</p>
          <p className="mt-2">Giriş: <a className="underline" href={created.admin.login_url} target="_blank" rel="noreferrer">{created.admin.login_url}</a></p>
          <p>E-posta: <b>{created.admin.email}</b></p>
          <p>Geçici şifre: <code className="rounded bg-white px-1.5 py-0.5 font-bold">{created.admin.temporary_password}</code></p>
          <p className="mt-2 text-xs text-amber-800">Bu bilgileri kuruma güvenli bir yoldan iletin; ilk girişte şifresini değiştirsin.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/platform/kurum/${created.organization.id}`} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Kurum ayarlarına git</Link>
          <button type="button" onClick={() => { setCreated(null); setSubdomainTouched(false) }} className="rounded-lg border px-4 py-2 text-sm">Başka kurum ekle</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Yeni kurum</h1>
      <section className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">Kurum</h2>
        <label className="text-sm font-semibold">Kurum adı *<input required className={field} value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="text-sm font-semibold">Resmi unvan<input className={field} value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} placeholder="Boşsa kurum adı" /></label>
        <label className="text-sm font-semibold">Site adresi *
          <div className="mt-1 flex items-center rounded-lg border bg-white text-sm">
            <input required className="w-full rounded-l-lg p-2.5" value={form.subdomain}
              onChange={(e) => { setSubdomainTouched(true); set('subdomain', e.target.value.toLowerCase()) }} />
            <span className="whitespace-nowrap px-2 text-slate-500">.{catalog?.base_domain || 'e-infak.org'}</span>
          </div>
        </label>
        <label className="text-sm font-semibold">Kurum e-postası *<input required type="email" className={field} value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="text-sm font-semibold">Telefon<input className={field} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="text-sm font-semibold">Şehir<input className={field} value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-3">
        <h2 className="font-bold sm:col-span-3">Paket ve görünüm</h2>
        <label className="text-sm font-semibold">Paket
          <select className={field} value={form.plan} onChange={(e) => set('plan', e.target.value)}>
            {(catalog?.plans || []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Şablon
          <select className={field} value={form.template} onChange={(e) => set('template', e.target.value)}>
            {(catalog?.templates || []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Ana renk
          <div className="mt-1 flex gap-2"><input type="color" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value.toUpperCase())} className="h-10 w-12 rounded border" />
            <input className={field + ' mt-0'} value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} /></div>
        </label>
        <p className="text-xs text-slate-500 sm:col-span-3">Logo, kapak görseli ve diğer ayarları kurum yöneticisi kendi panelindeki “Görünüm & Tema” sayfasından yapar.</p>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-3">
        <h2 className="font-bold sm:col-span-3">İlk yönetici</h2>
        <label className="text-sm font-semibold">E-posta *<input required type="email" className={field} value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} /></label>
        <label className="text-sm font-semibold">Ad *<input required className={field} value={form.admin_first_name} onChange={(e) => set('admin_first_name', e.target.value)} /></label>
        <label className="text-sm font-semibold">Soyad<input className={field} value={form.admin_last_name} onChange={(e) => set('admin_last_name', e.target.value)} /></label>
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? 'Oluşturuluyor…' : 'Kurumu oluştur'}
      </button>
    </form>
  )
}
