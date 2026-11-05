'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Notice, ghostButton, inputClass } from '../../../../components/admin/FormKit'

interface Application {
  id: string
  full_name: string
  phone: string
  email: string | null
  city: string | null
  areas: string[]
  availability: string | null
  message: string | null
  status: 'new' | 'contacted' | 'accepted' | 'rejected'
  staff_notes: string | null
  created_at: string
}

const STATUS: Record<Application['status'], { label: string; cls: string }> = {
  new: { label: 'Yeni', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  contacted: { label: 'Görüşüldü', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  accepted: { label: 'Kabul', cls: 'border-green-200 bg-green-50 text-green-700' },
  rejected: { label: 'Uygun değil', cls: 'border-gray-200 bg-gray-100 text-gray-600' },
}

export default function AdminVolunteersPage() {
  const [items, setItems] = useState<Application[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Application | null>(null)
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      setItems((await adminGet<Application[]>('/volunteers', { status: status || undefined, q: q || undefined })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Başvurular yüklenemedi') })
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [status, q])

  const open = (app: Application) => {
    setSelected(app)
    setNotes(app.staff_notes || '')
  }

  const update = async (app: Application, newStatus: Application['status']) => {
    try {
      const res = await adminSend<Application>('put', `/volunteers/${app.id}`, { status: newStatus, staff_notes: notes || null })
      setSelected(res.data)
      setMessage({ type: 'ok', text: 'Başvuru güncellendi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const exportCsv = () => {
    const header = ['Ad Soyad', 'Telefon', 'E-posta', 'Şehir', 'Alanlar', 'Uygunluk', 'Durum', 'Tarih']
    const rows = items.map((a) => [a.full_name, a.phone, a.email || '', a.city || '', a.areas.join(', '), a.availability || '',
      STATUS[a.status].label, new Date(a.created_at).toLocaleDateString('tr-TR')])
    const csv = '﻿' + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'gonullu-basvurulari.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gönüllü Başvuruları</h1>
          <p className="mt-1 text-sm text-gray-500">Başvurular sitedeki /gonullu formundan gelir.</p>
        </div>
        <div className="flex gap-2">
          <input className={`${inputClass} w-56`} placeholder="Ad, telefon, şehir ara" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={`${inputClass} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={exportCsv} className={ghostButton}>⬇ CSV</button>
        </div>
      </div>

      <Notice message={message} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="border border-gray-100 p-4 shadow-sm lg:col-span-7">
          {items.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">Başvuru yok.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((app) => (
                <li key={app.id}>
                  <button onClick={() => open(app)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-gray-50 ${selected?.id === app.id ? 'bg-primary-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900">{app.full_name}</div>
                      <div className="truncate text-xs text-gray-500">{[app.city, app.areas.join(', ')].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(app.created_at).toLocaleDateString('tr-TR')}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS[app.status].cls}`}>{STATUS[app.status].label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected && (
          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm lg:col-span-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selected.full_name}</h2>
              <div className="text-sm text-gray-600">
                <a href={`tel:${selected.phone}`} className="font-semibold text-primary-700">{selected.phone}</a>
                {selected.email && <> · <a href={`mailto:${selected.email}`} className="text-primary-700">{selected.email}</a></>}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-gray-500">Şehir</dt><dd className="col-span-2">{selected.city || '—'}</dd>
              <dt className="text-gray-500">Alanlar</dt><dd className="col-span-2">{selected.areas.join(', ') || '—'}</dd>
              <dt className="text-gray-500">Uygunluk</dt><dd className="col-span-2">{selected.availability || '—'}</dd>
            </dl>
            {selected.message && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{selected.message}</p>}
            <label className="block text-xs font-bold text-gray-600">Personel notu
              <textarea rows={3} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS) as Application['status'][]).map((s) => (
                <button key={s} onClick={() => update(selected, s)} className={`rounded border px-3 py-1.5 text-xs font-bold ${STATUS[s].cls} ${selected.status === s ? 'ring-2 ring-offset-1 ring-primary-600' : ''}`}>
                  {STATUS[s].label}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
