'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Shield, UserPlus } from 'lucide-react'
import { PlatformSkeleton, ptCard, ptInput, ptPrimaryBtn, ptSelect } from '../../../components/platform/PlatformUI'
import { copyText, dateTr, PlatformMe, platformCall, platformError } from '../../../lib/platform-api'

interface Operator {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'support'
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string | null
}

export default function PlatformOperatorsPage() {
  const [me, setMe] = useState<PlatformMe | null>(null)
  const [rows, setRows] = useState<Operator[] | null>(null)
  const [form, setForm] = useState({ email: '', full_name: '', role: 'support' as 'admin' | 'support' })
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    platformCall<Operator[]>('get', '/operators')
      .then(setRows)
      .catch((err) => setError(platformError(err, 'Operatörler yüklenemedi')))
  }, [])

  useEffect(() => {
    load()
    platformCall<PlatformMe>('get', '/me').then(setMe).catch(() => undefined)
  }, [load])

  const isAdmin = (me?.role || 'admin') === 'admin'

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setIssued(null)
    try {
      const res = await platformCall<{ operator: Operator; temporary_password: string }>('post', '/operators', form)
      setIssued({ email: res.operator.email, password: res.temporary_password })
      setCopied(false)
      setForm({ email: '', full_name: '', role: 'support' })
      load()
    } catch (err) {
      setError(platformError(err, 'Operatör eklenemedi'))
    } finally {
      setBusy(false)
    }
  }

  const updateRole = async (op: Operator, role: 'admin' | 'support') => {
    setBusyId(op.id)
    setError('')
    try {
      await platformCall('patch', `/operators/${op.id}`, { role })
      load()
    } catch (err) {
      setError(platformError(err, 'Rol güncellenemedi'))
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = async (op: Operator) => {
    if (op.is_active && !window.confirm(`${op.email} pasifleştirilsin mi? Hemen erişimi kesilir.`)) return
    setBusyId(op.id)
    setError('')
    try {
      await platformCall('patch', `/operators/${op.id}`, { is_active: !op.is_active })
      load()
    } catch (err) {
      setError(platformError(err, 'Durum güncellenemedi'))
    } finally {
      setBusyId(null)
    }
  }

  const resetPwd = async (op: Operator) => {
    if (!window.confirm(`${op.email} için yeni geçici şifre üretilsin mi? Eski şifre hemen geçersiz olur.`)) return
    setBusyId(op.id)
    setError('')
    setIssued(null)
    try {
      const res = await platformCall<{ email: string; temporary_password: string }>('post', `/operators/${op.id}/reset-password`)
      setIssued({ email: res.email, password: res.temporary_password })
      setCopied(false)
      load()
    } catch (err) {
      setError(platformError(err, 'Şifre sıfırlanamadı'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Platform Operatörleri</h1>
        <p className="mt-1 text-sm text-slate-500">E-İnfak platform konsoluna erişebilen yönetici ve destek personeli hesapları.</p>
      </div>

      {issued && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <p className="font-bold text-amber-900">Geçici giriş bilgileri (yalnızca şimdi gösteriliyor)</p>
          <p className="mt-1.5 text-amber-950">E-posta: <b>{issued.email}</b> · Geçici şifre: <code className="rounded bg-white px-2 py-0.5 font-bold ring-1 ring-amber-200">{issued.password}</code></p>
          <button
            type="button"
            onClick={async () => setCopied(await copyText(`E-posta: ${issued.email}\nGeçici Şifre: ${issued.password}`))}
            className="mt-3 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            {copied ? 'Kopyalandı ✓' : 'Bilgileri kopyala'}
          </button>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>}

      {isAdmin && (
      <form onSubmit={create} className={`grid gap-4 sm:grid-cols-4 sm:items-end ${ptCard}`}>
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 sm:col-span-4">
          <UserPlus className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">Yeni operatör ekle</h2>
        </div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Ad Soyad *
          <input required className={ptInput} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Örn. Mehmet Kaya" />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          E-posta *
          <input required type="email" className={ptInput} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="mehmet@e-infak.org" />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Rol
          <select className={ptSelect} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'support' })}>
            <option value="support">Destek Operatörü</option>
            <option value="admin">Tam Yetkili Yönetici</option>
          </select>
        </label>
        <button type="submit" disabled={busy} className={ptPrimaryBtn}>
          {busy ? 'Ekleniyor…' : 'Operatör Ekle'}
        </button>
      </form>
      )}

      {!rows && !error ? <PlatformSkeleton rows={3} /> : rows && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Operatör</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Son Giriş</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((op) => {
                const isSelf = me?.id === op.id
                const rowBusy = busyId === op.id
                return (
                <tr key={op.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <span>{op.full_name || op.email}</span>
                      {isSelf && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Siz</span>}
                      {op.must_change_password && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Geçici şifre</span>}
                    </div>
                    <div className="text-xs text-slate-500">{op.email} {op.created_at ? `· ${dateTr(op.created_at)}` : ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && !isSelf ? (
                      <select
                        aria-label={`${op.email} rolü`}
                        disabled={rowBusy}
                        value={op.role}
                        onChange={(e) => updateRole(op, e.target.value as 'admin' | 'support')}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        <option value="support">Destek</option>
                        <option value="admin">Tam Yönetici</option>
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <Shield className="h-3 w-3" aria-hidden="true" />
                        {op.role === 'admin' ? 'Tam Yönetici' : 'Destek'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{dateTr(op.last_login_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${op.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                      {op.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin && (
                    <div className="inline-flex gap-2">
                      <button type="button" disabled={rowBusy} onClick={() => resetPwd(op)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        <KeyRound className="h-3 w-3" aria-hidden="true" /> Şifre Sıfırla
                      </button>
                      <button type="button" disabled={rowBusy || isSelf} onClick={() => toggleActive(op)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        {op.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
