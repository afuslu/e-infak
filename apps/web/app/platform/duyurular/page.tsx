'use client'

import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Trash2 } from 'lucide-react'
import { PlatformSkeleton, ptCard, ptInput, ptPrimaryBtn, ptSelect } from '../../../components/platform/PlatformUI'
import { dateTr, platformCall, platformError } from '../../../lib/platform-api'

interface Broadcast {
  id: string
  title: string
  message: string
  level: 'info' | 'warning' | 'danger'
  is_active: boolean
  maintenance_mode: boolean
  created_at: string | null
}

const LEVELS: Record<Broadcast['level'], [string, string]> = {
  info: ['Bilgi', 'bg-blue-100 text-blue-700'],
  warning: ['Uyarı', 'bg-amber-100 text-amber-800'],
  danger: ['Kritik / Bakım', 'bg-red-100 text-red-700'],
}

export default function PlatformBroadcastsPage() {
  const [rows, setRows] = useState<Broadcast[] | null>(null)
  const [form, setForm] = useState({ title: '', message: '', level: 'info' as Broadcast['level'], maintenance_mode: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    platformCall<Broadcast[]>('get', '/broadcasts')
      .then(setRows)
      .catch((err) => setError(platformError(err, 'Duyurular yüklenemedi')))
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await platformCall('post', '/broadcasts', form)
      setForm({ title: '', message: '', level: 'info', maintenance_mode: false })
      load()
    } catch (err) {
      setError(platformError(err, 'Duyuru yayınlanamadı'))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (b: Broadcast) => {
    await platformCall('patch', `/broadcasts/${b.id}`, { is_active: !b.is_active }).then(load).catch((err) => setError(platformError(err, 'Güncellenemedi')))
  }

  const remove = async (b: Broadcast) => {
    await platformCall('delete', `/broadcasts/${b.id}`).then(load).catch((err) => setError(platformError(err, 'Silinemedi')))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sistem Duyuruları &amp; Bakım</h1>
        <p className="mt-1 text-sm text-slate-500">Yayınlanan aktif duyurular tüm kurumların yönetim panellerinin üst kısmında gösterilir.</p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>}

      <form onSubmit={create} className={`space-y-4 ${ptCard}`}>
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Megaphone className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">Yeni sistem duyurusu</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">
            Başlık *
            <input required className={ptInput} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. Planlı Sistem Güncellemesi" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Önem Düzeyi
            <select className={ptSelect} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Broadcast['level'] })}>
              <option value="info">Bilgi</option>
              <option value="warning">Uyarı</option>
              <option value="danger">Kritik / Bakım</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Duyuru Metni *
          <textarea
            required
            rows={2}
            className={ptInput}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Kurum yöneticilerine gösterilecek açıklama…"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={form.maintenance_mode} onChange={(e) => setForm({ ...form, maintenance_mode: e.target.checked })} />
            Bakım modu uyarısı olarak işaretle
          </label>
          <button type="submit" disabled={busy} className={ptPrimaryBtn}>
            {busy ? 'Yayınlanıyor…' : 'Duyuruyu Yayınla'}
          </button>
        </div>
      </form>

      {!rows ? <PlatformSkeleton rows={3} /> : (
        <div className="space-y-3">
          {rows.map((b) => {
            const [lbl, cls] = LEVELS[b.level] || LEVELS.info
            return (
              <div key={b.id} className={`flex flex-wrap items-start justify-between gap-4 ${ptCard}`}>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{lbl}</span>
                    {b.maintenance_mode && <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-bold text-white">Bakım</span>}
                    <span className="text-sm font-extrabold text-slate-900">{b.title}</span>
                    <span className="text-xs text-slate-400">· {dateTr(b.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-600">{b.message}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggle(b)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {b.is_active ? 'Yayından Kaldır' : 'Tekrar Yayınla'}
                  </button>
                  <button type="button" onClick={() => remove(b)} aria-label="Sil" className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
          {rows.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Henüz sistem duyurusu yok.</p>}
        </div>
      )}
    </div>
  )
}
