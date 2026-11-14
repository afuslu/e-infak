'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, MessageCircle, Save, Trash2, UserPlus, Users } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, whatsappUrl } from '../../../../lib/admin-access'
import { Notice, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, confirmDialog } from '../../../../components/admin/ui'

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

const PAGE_SIZE = 20

export default function AdminVolunteersPage() {
  const [items, setItems] = useState<Application[]>([])
  const [status, setStatus] = useState<string>('')
  const [area, setArea] = useState<string>('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Application | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      const data = (await adminGet<Application[]>('/volunteers', { q: q || undefined })).data
      setItems(data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Başvurular yüklenemedi') })
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q])

  const allAreas = useMemo(() => {
    const set = new Set<string>()
    items.forEach((a) => (a.areas || []).forEach((ar) => set.add(ar)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [items])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '': items.length, new: 0, contacted: 0, accepted: 0, rejected: 0 }
    items.forEach((a) => {
      counts[a.status] = (counts[a.status] || 0) + 1
    })
    return counts
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (status && a.status !== status) return false
      if (area && !(a.areas || []).includes(area)) return false
      return true
    })
  }, [items, status, area])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const open = (app: Application) => {
    setSelected(app)
    setNotes(app.staff_notes || '')
  }

  const update = async (app: Application, newStatus: Application['status'], okText = 'Başvuru güncellendi') => {
    setBusy(true)
    try {
      const res = await adminSend<Application>('put', `/volunteers/${app.id}`, {
        status: newStatus,
        staff_notes: notes || null,
      })
      setSelected(res.data)
      setMessage({ type: 'ok', text: okText })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (app: Application) => {
    const ok = await confirmDialog({
      title: `"${app.full_name}" başvurusu silinsin mi?`,
      text: 'Bu işlem geri alınamaz.',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await adminSend('delete', `/volunteers/${app.id}`)
      setSelected(null)
      setMessage({ type: 'ok', text: 'Başvuru silindi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const sendToCrm = async (app: Application) => {
    setBusy(true)
    try {
      const res = await adminSend<{ donor_id: string; created: boolean }>('post', `/volunteers/${app.id}/to-crm`)
      setMessage({
        type: 'ok',
        text: res.data.created
          ? 'Gönüllü CRM’e yeni kişi olarak eklendi ("Gönüllü" etiketiyle).'
          : 'Mevcut CRM kaydıyla eşleştirildi ve "Gönüllü" etiketi eklendi.',
      })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const header = ['Ad Soyad', 'Telefon', 'E-posta', 'Şehir', 'Alanlar', 'Uygunluk', 'Mesaj', 'Durum', 'Personel Notu', 'Tarih']
    const rows = filtered.map((a) => [
      a.full_name,
      a.phone,
      a.email || '',
      a.city || '',
      a.areas.join(', '),
      a.availability || '',
      a.message || '',
      STATUS[a.status].label,
      a.staff_notes || '',
      new Date(a.created_at).toLocaleDateString('tr-TR'),
    ])
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'gonullu-basvurulari.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gönüllü Başvuruları"
        description={<>Başvurular sitedeki /gonullu formundan gelir.</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} w-56`}
              placeholder="Ad, telefon, e-posta, şehir..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
            {allAreas.length > 0 && (
              <select
                aria-label="İlgi alanı filtresi"
                className={`${inputClass} w-44`}
                value={area}
                onChange={(e) => {
                  setArea(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Tüm alanlar</option>
                {allAreas.map((ar) => (
                  <option key={ar} value={ar}>
                    {ar}
                  </option>
                ))}
              </select>
            )}
            <button onClick={exportCsv} disabled={filtered.length === 0} className={ghostButton}>
              <Download className="mr-1 inline h-3.5 w-3.5" /> CSV
            </button>
            <Link
              href="/admin/crm"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50"
            >
              CRM →
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5 border-b pb-3">
        {[
          { key: '', label: 'Tümü' },
          ...(Object.keys(STATUS) as Application['status'][]).map((k) => ({ key: k, label: STATUS[k].label })),
        ].map((tab) => {
          const active = status === tab.key
          return (
            <button
              key={tab.key || 'all'}
              type="button"
              onClick={() => {
                setStatus(tab.key)
                setPage(1)
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                {statusCounts[tab.key] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <Notice message={message} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="border border-gray-100 p-4 shadow-sm lg:col-span-7">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">Eşleşen gönüllü başvurusu bulunamadı.</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {pageItems.map((app) => (
                  <li key={app.id}>
                    <button
                      onClick={() => open(app)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-gray-50 ${
                        selected?.id === app.id ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900">{app.full_name}</div>
                        <div className="truncate text-xs text-gray-500">
                          {[app.city, app.areas.join(', ')].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs text-gray-400">
                        {new Date(app.created_at).toLocaleDateString('tr-TR')}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS[app.status].cls}`}>
                        {STATUS[app.status].label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {filtered.length > PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-gray-500">
                  <span>
                    Sayfa {page} / {totalPages} ({filtered.length} başvuru)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Önceki
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {selected ? (
          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm lg:col-span-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.full_name}</h2>
                <p className="text-xs text-gray-400">
                  Başvuru: {new Date(selected.created_at).toLocaleString('tr-TR')}
                </p>
              </div>
              <button
                type="button"
                title="Başvuruyu Sil"
                disabled={busy}
                onClick={() => remove(selected)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <a href={`tel:${selected.phone}`} className="font-semibold text-primary-700">
                {selected.phone}
              </a>
              {selected.email && (
                <>
                  {' '}
                  ·{' '}
                  <a href={`mailto:${selected.email}`} className="text-primary-700">
                    {selected.email}
                  </a>
                </>
              )}
              {(() => {
                const wa = whatsappUrl(
                  selected.phone,
                  `Merhaba ${selected.full_name}, gönüllü başvurunuz hakkında iletişime geçiyoruz.`
                )
                return wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : null
              })()}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-gray-500">Şehir</dt>
              <dd className="col-span-2">{selected.city || '—'}</dd>
              <dt className="text-gray-500">Uygunluk</dt>
              <dd className="col-span-2">{selected.availability || '—'}</dd>
              <dt className="text-gray-500">Alanlar</dt>
              <dd className="col-span-2 flex flex-wrap gap-1">
                {selected.areas.length > 0
                  ? selected.areas.map((ar) => (
                      <span
                        key={ar}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                      >
                        {ar}
                      </span>
                    ))
                  : '—'}
              </dd>
            </dl>

            {selected.message && (
              <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{selected.message}</p>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600">
                Personel notu
                <textarea rows={3} className={`${inputClass} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => update(selected, selected.status, 'Personel notu kaydedildi')}
                  className={ghostButton}
                >
                  <Save className="mr-1 inline h-3.5 w-3.5" /> Notu Kaydet
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => sendToCrm(selected)}
                  className={primaryButton}
                >
                  <UserPlus className="mr-1 inline h-3.5 w-3.5" /> CRM&apos;e Aktar
                </button>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-bold text-gray-500">Başvuru Durumu</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS) as Application['status'][]).map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => update(selected, s)}
                    className={`rounded border px-3 py-1.5 text-xs font-bold ${STATUS[s].cls} ${
                      selected.status === s ? 'ring-2 ring-primary-600 ring-offset-1' : ''
                    }`}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-200 p-10 text-center text-gray-400 shadow-none lg:col-span-5">
            <Users className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Detayları görmek için soldan bir başvuru seçin</p>
          </Card>
        )}
      </div>
    </div>
  )
}
