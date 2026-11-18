'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Globe, Palette, Sparkles, UserCheck } from 'lucide-react'
import { Catalog, Credentials, PlatformOrg, copyText, credentialsText, platformCall, platformError } from '../../../lib/platform-api'
import { ptCard, ptInput, ptPrimaryBtn, ptSecondaryBtn, ptSelect } from '../../../components/platform/PlatformUI'

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
  const [created, setCreated] = useState<{ organization: PlatformOrg; admin: Credentials } | null>(null)
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const [demoId, setDemoId] = useState('')

  useEffect(() => {
    platformCall<Catalog>('get', '/catalog').then(setCatalog)
      .catch((err) => setError(platformError(err, 'Paket ve şablon listesi yüklenemedi; sayfayı yenileyin')))
  }, [])

  // Opened from a demo request: /platform/yeni?talep=<id>&ad=…&eposta=…&telefon=…&paket=…
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (!q.get('talep')) return
    setDemoId(q.get('talep') || '')
    const name = q.get('ad') || ''
    setForm((f) => ({
      ...f, name, subdomain: slugify(name), email: q.get('eposta') || '', phone: q.get('telefon') || '',
      plan: q.get('paket') || f.plan, admin_email: q.get('eposta') || '',
      admin_first_name: q.get('yonetici_ad') || '', admin_last_name: q.get('yonetici_soyad') || '',
    }))
  }, [])

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({
    ...f, [key]: value, ...(key === 'name' && !subdomainTouched ? { subdomain: slugify(value) } : {}),
  }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = Object.fromEntries(Object.entries({ ...form, demo_request_id: demoId }).filter(([, v]) => v !== ''))
      setCreated(await platformCall('post', '/organizations', body))
      setCopied('')
    } catch (err) {
      setError(platformError(err, 'Kurum oluşturulamadı'))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className={`mx-auto max-w-2xl space-y-5 ${ptCard}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{created.organization.name} oluşturuldu</h1>
            <p className="text-sm text-slate-500">
              Site adresi:{' '}
              <a className="font-semibold text-emerald-700 underline" href={created.organization.url} target="_blank" rel="noreferrer">
                {created.organization.url}
              </a>
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm">
          <p className="font-bold text-amber-900">Yönetici bilgileri — yalnızca şimdi gösteriliyor</p>
          <div className="mt-2 space-y-1 text-amber-950">
            <p>Giriş: <a className="font-semibold underline" href={created.admin.login_url} target="_blank" rel="noreferrer">{created.admin.login_url}</a></p>
            <p>E-posta: <b>{created.admin.email}</b></p>
            <p>Geçici şifre: <code className="rounded-md bg-white px-2 py-0.5 font-bold ring-1 ring-amber-200">{created.admin.temporary_password}</code></p>
          </div>
          <p className="mt-3 text-xs text-amber-800">
            {created.admin.email_sent
              ? 'Bu bilgiler yöneticiye e-postayla da gönderildi. İlk girişte şifresini değiştirmesi istenecek.'
              : 'E-posta gönderilemedi (e-posta servisi kapalı olabilir). Bilgileri kuruma güvenli bir yoldan iletin; ilk girişte şifresini değiştirmesi istenecek.'}
          </p>
          <button
            type="button"
            onClick={async () => setCopied((await copyText(credentialsText(created.admin))) ? 'ok' : 'fail')}
            className="mt-3 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            {copied === 'ok' ? 'Kopyalandı ✓' : copied === 'fail' ? 'Kopyalanamadı — elle seçin' : 'Bilgileri kopyala'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/platform/kurum/${created.organization.id}`} className={ptPrimaryBtn}>Kurum ayarlarına git</Link>
          <button
            type="button"
            onClick={() => { setCreated(null); setSubdomainTouched(false); setDemoId(''); window.history.replaceState(null, '', '/platform/yeni') }}
            className={ptSecondaryBtn}
          >
            Başka kurum ekle
          </button>
        </div>
      </div>
    )
  }

  const baseDomain = catalog?.base_domain || 'e-infak.org'
  const planLabel = catalog?.plans.find((p) => p.key === form.plan)?.label || form.plan
  const templateLabel = catalog?.templates.find((t) => t.key === form.template)?.label || form.template

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Yeni kurum</h1>
          <p className="mt-1 text-sm text-slate-500">Kurum bilgilerini, paket ve tema ayarlarını belirleyerek yeni kiracı hesabı açın.</p>
        </div>
      </div>

      {demoId && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
          Demo talebinden dolduruldu; kurum oluşunca talep &ldquo;Kurum oldu&rdquo; olarak işaretlenir.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className={`grid gap-4 sm:grid-cols-2 ${ptCard}`}>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 sm:col-span-2">
              <Building2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">Kurum bilgileri</h2>
            </div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Kurum adı *
              <input required className={ptInput} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Örn. Hayır Kapısı Derneği" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Resmi unvan
              <input className={ptInput} value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} placeholder="Boşsa kurum adı kullanılır" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Site adresi *
              <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15">
                <input
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-normal text-slate-900 outline-none"
                  value={form.subdomain}
                  placeholder="hayirkapisi"
                  onChange={(e) => { setSubdomainTouched(true); set('subdomain', e.target.value.toLowerCase()) }}
                />
                <span className="whitespace-nowrap border-s border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-500">
                  .{baseDomain}
                </span>
              </div>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Kurum e-postası *
              <input required type="email" className={ptInput} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="info@kurum.org" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Telefon
              <input className={ptInput} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="05xx xxx xx xx" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Şehir
              <input className={ptInput} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="İstanbul" />
            </label>
          </section>

          <section className={`grid gap-4 sm:grid-cols-3 ${ptCard}`}>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 sm:col-span-3">
              <Palette className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">Paket ve görünüm</h2>
            </div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Paket
              <select className={ptSelect} value={form.plan} onChange={(e) => set('plan', e.target.value)}>
                {(catalog?.plans || []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Şablon
              <select className={ptSelect} value={form.template} onChange={(e) => set('template', e.target.value)}>
                {(catalog?.templates || []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ana renk
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => set('primary_color', e.target.value.toUpperCase())}
                  className="h-[42px] w-12 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                />
                <input
                  className={`${ptInput} mt-0 font-mono`}
                  value={form.primary_color}
                  onChange={(e) => set('primary_color', e.target.value)}
                />
              </div>
            </label>
            <p className="text-xs text-slate-500 sm:col-span-3">
              Logo, kapak görseli ve diğer ayarları kurum yöneticisi kendi panelindeki &ldquo;Görünüm &amp; Tema&rdquo; sayfasından yapar.
            </p>
          </section>

          <section className={`grid gap-4 sm:grid-cols-3 ${ptCard}`}>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 sm:col-span-3">
              <UserCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">İlk yönetici</h2>
            </div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              E-posta *
              <input required type="email" className={ptInput} value={form.admin_email} onChange={(e) => set('admin_email', e.target.value)} placeholder="yonetici@kurum.org" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ad *
              <input required className={ptInput} value={form.admin_first_name} onChange={(e) => set('admin_first_name', e.target.value)} placeholder="Ahmet" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Soyad
              <input className={ptInput} value={form.admin_last_name} onChange={(e) => set('admin_last_name', e.target.value)} placeholder="Yılmaz" />
            </label>
          </section>
        </div>

        {/* Sağ canlı özet / önizleme paneli */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="h-3 w-full transition-colors" style={{ backgroundColor: form.primary_color || '#059669' }} />
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white shadow-xs"
                  style={{ backgroundColor: form.primary_color || '#059669' }}
                >
                  {(form.name.trim()[0] || 'E').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">{form.name.trim() || 'Yeni Kurum'}</div>
                  <div className="flex items-center gap-1 truncate text-xs text-slate-500">
                    <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{form.subdomain || 'alt-alan-adi'}.{baseDomain}</span>
                  </div>
                </div>
              </div>

              <dl className="space-y-2.5 border-t border-slate-100 pt-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Paket</dt>
                  <dd className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-800">{planLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Şablon</dt>
                  <dd className="max-w-[180px] truncate font-semibold text-slate-800">{templateLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">İlk yönetici</dt>
                  <dd className="max-w-[180px] truncate font-semibold text-slate-800">{form.admin_email || '—'}</dd>
                </div>
              </dl>

              {error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy || !catalog} className={`w-full ${ptPrimaryBtn}`}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>{busy ? 'Oluşturuluyor…' : 'Kurumu oluştur'}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  )
}
