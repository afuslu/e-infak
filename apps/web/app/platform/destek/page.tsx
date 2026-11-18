'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LifeBuoy, Send } from 'lucide-react'
import { PlatformSkeleton, ptCard, ptInput, ptPrimaryBtn, ptSecondaryBtn } from '../../../components/platform/PlatformUI'
import { dateTr, platformCall, platformError } from '../../../lib/platform-api'

interface TicketRow {
  id: string
  organization_id: string
  organization_name: string
  subject: string
  category: string
  priority: string
  status: 'open' | 'answered' | 'closed'
  updated_at: string
}

interface TicketDetail extends TicketRow {
  created_at: string
  messages: { id: string; sender_type: 'tenant' | 'platform'; sender_name: string; body: string; created_at: string }[]
}

const STATUS_BADGE: Record<TicketRow['status'], [string, string]> = {
  open: ['Açık', 'bg-amber-100 text-amber-800'],
  answered: ['Yanıtlandı', 'bg-emerald-100 text-emerald-800'],
  closed: ['Kapandı', 'bg-slate-100 text-slate-600'],
}

export default function PlatformSupportTicketsPage() {
  const [rows, setRows] = useState<TicketRow[] | null>(null)
  const [filter, setFilter] = useState<'all' | TicketRow['status']>('all')
  const [selected, setSelected] = useState<TicketDetail | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    const q = filter === 'all' ? '' : `?status_filter=${filter}`
    platformCall<TicketRow[]>('get', `/tickets${q}`)
      .then(setRows)
      .catch((err) => setError(platformError(err, 'Talepler yüklenemedi')))
  }, [filter])

  useEffect(() => { load() }, [load])

  const openTicket = async (id: string) => {
    setError('')
    try {
      setSelected(await platformCall<TicketDetail>('get', `/tickets/${id}`))
    } catch (err) {
      setError(platformError(err, 'Talep detayı açılamadı'))
    }
  }

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !reply.trim()) return
    setBusy(true)
    setError('')
    try {
      await platformCall('post', `/tickets/${selected.id}/reply`, { body: reply.trim() })
      setReply('')
      await openTicket(selected.id)
      load()
    } catch (err) {
      setError(platformError(err, 'Yanıt gönderilemedi'))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status: TicketRow['status']) => {
    if (!selected) return
    setBusy(true)
    try {
      await platformCall('patch', `/tickets/${selected.id}`, { status })
      await openTicket(selected.id)
      load()
    } catch (err) {
      setError(platformError(err, 'Durum güncellenemedi'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Kurum Destek Talepleri</h1>
          <p className="mt-1 text-sm text-slate-500">Kurum yöneticilerinin panellerinden açtığı teknik destek ve yardım talepleri.</p>
        </div>
        <div className="flex gap-1.5">
          {([
            ['all', 'Tümü'],
            ['open', 'Açık'],
            ['answered', 'Yanıtlandı'],
            ['closed', 'Kapandı'],
          ] as const).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                filter === k ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          {!rows ? <PlatformSkeleton rows={4} /> : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              {rows.map((t) => {
                const [lbl, cls] = STATUS_BADGE[t.status] || STATUS_BADGE.open
                const active = selected?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTicket(t.id)}
                    className={`w-full p-4 text-left transition ${active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-700">{t.organization_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{lbl}</span>
                    </div>
                    <div className="mt-1 font-bold text-slate-900">{t.subject}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{t.category} · {t.priority} · {dateTr(t.updated_at)}</div>
                  </button>
                )
              })}
              {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Destek talebi yok.</p>}
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {!selected ? (
            <div className={`flex flex-col items-center justify-center py-16 text-center ${ptCard}`}>
              <LifeBuoy className="mb-2 h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-500">Görüntülemek için soldan bir destek talebi seçin.</p>
            </div>
          ) : (
            <div className={`space-y-4 ${ptCard}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <Link href={`/platform/kurum/${selected.organization_id}`} className="text-xs font-bold text-emerald-700 hover:underline">
                    {selected.organization_name} →
                  </Link>
                  <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">{selected.subject}</h2>
                  <p className="text-xs text-slate-400">Açılış: {dateTr(selected.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  {selected.status !== 'closed' ? (
                    <button type="button" disabled={busy} onClick={() => setStatus('closed')} className={ptSecondaryBtn}>Talebi Kapat</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => setStatus('open')} className={ptSecondaryBtn}>Yeniden Aç</button>
                  )}
                </div>
              </div>

              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-2xl p-3.5 text-sm ${
                      m.sender_type === 'platform'
                        ? 'ms-6 border border-emerald-200 bg-emerald-50/70'
                        : 'me-6 border border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{m.sender_name}</span>
                      <span className="text-slate-400">{dateTr(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-line text-slate-700">{m.body}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={sendReply} className="space-y-2 border-t border-slate-100 pt-4">
                <textarea
                  rows={3}
                  required
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Kuruma yanıtınızı yazın…"
                  className={ptInput}
                />
                <button type="submit" disabled={busy} className={ptPrimaryBtn}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>Yanıtı Gönder</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
