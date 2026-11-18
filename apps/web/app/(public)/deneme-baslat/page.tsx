'use client'

import Link from 'next/link'
import { useState } from 'react'
import axios from 'axios'
import { CheckCircle2, Globe, Rocket, ShieldCheck } from 'lucide-react'
import { adminApiBase } from '../../../lib/admin-access'

const slugify = (text: string) =>
  text
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export default function TrialSignupPage() {
  const [form, setForm] = useState({
    organization_name: '',
    subdomain: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ organization_name: string; url: string; login_url: string; trial_ends_at: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await axios.post(`${adminApiBase()}/api/v1/public/trial-signup`, form)
      setDone(res.data)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Deneme hesabı oluşturulamadı. Lütfen bilgileri kontrol edin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            14 Gün Ücretsiz Deneme
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Derneğiniz İçin E-İnfak’ı Başlatın</h1>
          <p className="mt-2 text-sm text-slate-500">Kredi kartı gerekmeden 1 dakikada kendi bağış sitenizi ve yönetim panelinizi açın.</p>
        </div>

        {done ? (
          <div className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{done.organization_name} hazır!</h2>
                <p className="text-xs text-slate-500">Deneme bitişi: {new Date(done.trial_ends_at).toLocaleDateString('tr-TR')}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Geçici giriş şifreniz e-posta adresinize gönderildi. Aşağıdaki bağlantılardan sitenize ve yönetim panelinize erişebilirsiniz:
            </p>
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>Site adresi: <a href={done.url} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 underline">{done.url}</a></div>
              <div>Yönetim paneli: <a href={done.login_url} target="_blank" rel="noreferrer" className="font-bold text-emerald-700 underline">{done.login_url}</a></div>
            </div>
            <Link href="/" className="inline-block text-xs font-semibold text-slate-500 hover:text-slate-900">← Ana sayfaya dön</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Kurum / Dernek Adı *</label>
              <input
                required
                minLength={2}
                value={form.organization_name}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((f) => ({ ...f, organization_name: val, ...(touched ? {} : { subdomain: slugify(val) }) }))
                }}
                placeholder="Örn. Anadolu İyilik Derneği"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Site Adresiniz *</label>
              <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15">
                <Globe className="ms-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  required
                  minLength={2}
                  value={form.subdomain}
                  onChange={(e) => {
                    setTouched(true)
                    setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
                  }}
                  placeholder="anadoluiyilik"
                  className="w-full px-2.5 py-2.5 text-sm outline-none"
                />
                <span className="border-s border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-500">.e-infak.org</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Yetkili Adı *</label>
                <input required minLength={2} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Soyadı</label>
                <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">E-posta *</label>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="yetkili@dernek.org" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Telefon</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600" />
              </div>
            </div>

            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">{error}</p>}

            <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
              {busy ? 'Hesap oluşturuluyor…' : '14 Günlük Ücretsiz Denemeyi Başlat'}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              Kurulum 1 dakika sürer, dilediğiniz zaman iptal edebilirsiniz.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
