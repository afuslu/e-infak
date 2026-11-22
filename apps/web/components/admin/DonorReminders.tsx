'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import { DUE_REMINDERS_QUERY_KEY, REMINDERS_CHANGED_EVENT, type Reminder, formatWhen, nextHour, toLocalInput, tomorrowAt } from '../../lib/reminders'
import { inputClass, primaryButton } from './FormKit'
import { toast } from './ui'

type CardReminder = Reminder & { author: string | null; mine: boolean }

/** "Call again on…" on a donor's card: written into the same Hatırlatıcı list, linked to this donor. */
export function DonorReminders({ donorId, donorName }: { donorId: string; donorName: string }) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<CardReminder[] | null>(null)
  const [content, setContent] = useState('')
  const [when, setWhen] = useState(toLocalInput(tomorrowAt(10)))
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems((await adminGet<CardReminder[]>(`/donors/${donorId}/reminders`)).data)
    } catch {
      setItems([]) // no notes_view: the list stays empty, adding still works
    }
  }, [donorId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const onChanged = () => { void load() }
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged)
  }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await adminSend('post', '/reminders', {
        content: content.trim() || `${donorName} aranacak`, remind_at: new Date(when).toISOString(), donor_id: donorId,
      })
      toast.ok(`Hatırlatma kuruldu · ${formatWhen(new Date(when).toISOString())}`)
      setContent('')
      setWhen(toLocalInput(nextHour()))
      void load()
      void queryClient.invalidateQueries({ queryKey: DUE_REMINDERS_QUERY_KEY })
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }

  const complete = async (r: CardReminder) => {
    try {
      await adminSend('post', `/reminders/${r.id}/complete`)
      toast.ok('Tamamlandı')
      void load()
      void queryClient.invalidateQueries({ queryKey: DUE_REMINDERS_QUERY_KEY })
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const open = (items || []).filter((r) => !r.completed_at)
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />Tekrar arama hatırlatması
        </div>
        <Link href="/admin/hatirlatici" className="text-[11px] font-semibold text-amber-800 hover:underline">Hatırlatıcı&apos;yı aç</Link>
      </div>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Not (örn: Gazze yemeği için arayın dedi)" className={inputClass} />
        <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={`${inputClass} sm:w-52`} aria-label="Ne zaman" />
        <button type="submit" disabled={saving} className={`${primaryButton} whitespace-nowrap`}>Hatırlat</button>
      </form>
      {open.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {open.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-sm">
              <span className={`shrink-0 text-xs font-semibold ${new Date(r.remind_at) <= new Date() ? 'text-red-700' : 'text-gray-600'}`}>{formatWhen(r.remind_at)}</span>
              <span className="min-w-0 flex-1 truncate text-gray-800" title={r.content}>{r.content}</span>
              {!r.mine && r.author && <span className="shrink-0 text-[10px] text-gray-400">{r.author}</span>}
              {r.mine && (
                <button type="button" onClick={() => complete(r)} className="shrink-0 rounded p-1 text-green-700 hover:bg-green-50" title="Tamamla" aria-label="Tamamla">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
