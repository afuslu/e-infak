'use client'

import { useCallback, useEffect, useState } from 'react'
import { dateTr, platformCall, platformError } from '../../lib/platform-api'

interface Data {
  offboarding: {
    status: 'requested' | 'scheduled'; reason: string | null; requested_at: string; closes_on: string | null; days_left: number | null
    operator_note: string | null; backup_confirmed_at: string | null; checklist: { key: string; label: string; done: boolean }[]
  } | null
  last_backup: { status: string; created_at: string; downloaded_at: string | null } | null
  delete_blocker: string | null
}

/** Leaving process of one organisation; tells the page why deletion is still closed. */
export function OffboardingCard({ orgId, onBlocker }: { orgId: string; onBlocker: (reason: string | null) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const apply = useCallback((d: Data) => {
    setData(d)
    setDate(d.offboarding?.closes_on || '')
    setNote(d.offboarding?.operator_note || '')
    onBlocker(d.delete_blocker)
  }, [onBlocker])
  useEffect(() => {
    platformCall<Data>('get', `/organizations/${orgId}/offboarding`).then(apply).catch((err) => setError(platformError(err, 'Yüklenemedi')))
  }, [orgId, apply])
  const run = async (action: () => Promise<Data>) => {
    setBusy(true)
    setError('')
    try { apply(await action()) } catch (err) { setError(platformError(err, 'Kaydedilemedi')) } finally { setBusy(false) }
  }
  const off = data?.offboarding
  const min = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('sv-SE')
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs lg:col-span-2">
      <h2 className="border-b border-slate-100 pb-2.5 text-base font-bold text-slate-900">Ayrılma Süreci</h2>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {data && (
        <>
          <p className="text-sm text-slate-600">
            {!off ? 'Açık bir ayrılma talebi yok. Kapanış tarihi verirseniz kurum panelinde geri sayım başlar.'
              : `${off.status === 'scheduled' ? `Kapanış: ${dateTr(off.closes_on)} (${off.days_left} gün)` : 'Kurum ayrılma talebi gönderdi'} · Talep: ${dateTr(off.requested_at)}${off.reason ? ` · ${off.reason}` : ''}`}
          </p>
          <p className="text-sm text-slate-600">
            Son tam yedek: {data.last_backup ? `${dateTr(data.last_backup.created_at)}${data.last_backup.downloaded_at ? `, indirildi ${dateTr(data.last_backup.downloaded_at)}` : ', indirilmedi'}` : 'yok'}
            {' · '}Yedek onayı: {off?.backup_confirmed_at ? dateTr(off.backup_confirmed_at) : 'yok'}
          </p>
          {off && <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">{off.checklist.map((c) => <li key={c.key}>{c.done ? '✓' : '○'} {c.label}</li>)}</ul>}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">Kapanış tarihi
              <input type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Kuruma not
              <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <button type="button" disabled={busy || !date} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              onClick={() => run(() => platformCall<Data>('put', `/organizations/${orgId}/offboarding`, { closes_on: date, operator_note: note.trim() || null }))}>
              {off?.closes_on ? 'Tarihi güncelle' : 'Kapanış tarihi ver'}
            </button>
            {off && <button type="button" disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
              onClick={() => run(() => platformCall<Data>('delete', `/organizations/${orgId}/offboarding`))}>Süreci iptal et</button>}
          </div>
        </>
      )}
    </section>
  )
}
