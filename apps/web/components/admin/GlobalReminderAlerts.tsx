'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Phone, User } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../lib/admin-access'
import {
  DUE_REMINDERS_QUERY_KEY,
  type Reminder,
  chime,
  formatWhen,
  inMinutes,
  notifyRemindersChanged,
  showDesktopNotification,
  telHref,
} from '../../lib/reminders'
import { ghostButton } from './FormKit'
import { Modal, toast } from './ui'

/** Polls due reminders every 30s across the entire admin panel (even in background tabs for desktop alerts). */
export function useDueReminders(enabled: boolean) {
  return useQuery({
    queryKey: DUE_REMINDERS_QUERY_KEY,
    queryFn: async () => (await adminGet<Reminder[]>('/reminders', { kapsam: 'vadesi_gelen', limit: 50 })).data,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: false,
    enabled,
  })
}

/** Wise Reminder-style pop-up + chime + OS desktop notification on any admin page when a reminder comes due. */
export function GlobalReminderAlerts({ dueReminders }: { dueReminders: Reminder[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [alerts, setAlerts] = useState<Reminder[]>([])
  const seen = useRef<Set<string>>(new Set())
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => {
    if (!dueReminders.length) return
    const fresh = dueReminders.filter((r) => !seen.current.has(`${r.id}:${r.remind_at}`))
    // Old overdue ones are shown via the badge and list; only those that came due in the last 10 minutes pop up.
    const recent = fresh.filter((r) => Date.now() - new Date(r.remind_at).getTime() < 10 * 60_000)
    fresh.forEach((r) => seen.current.add(`${r.id}:${r.remind_at}`))
    if (recent.length) {
      setAlerts((prev) => [...prev, ...recent.filter((r) => !prev.some((p) => p.id === r.id))])
      chime()
      recent.forEach((r) => {
        showDesktopNotification(r, () => {
          if (pathnameRef.current !== '/admin/hatirlatici') router.push('/admin/hatirlatici')
        })
      })
      notifyRemindersChanged()
    }
  }, [dueReminders, router])

  const complete = async (r: Reminder) => {
    try {
      const { data } = await adminSend<Reminder>('post', `/reminders/${r.id}/complete`)
      if (data.completed_at === null) toast.ok(`Tamamlandı · sonraki: ${formatWhen(data.remind_at)}`)
      else toast.ok('Tamamlandı')
      setAlerts((prev) => prev.filter((a) => a.id !== r.id))
      void queryClient.invalidateQueries({ queryKey: DUE_REMINDERS_QUERY_KEY })
      notifyRemindersChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const snooze = async (r: Reminder, at: Date) => {
    try {
      await adminSend('patch', `/reminders/${r.id}`, { remind_at: at.toISOString() })
      toast.ok(`Ertelendi · ${formatWhen(at.toISOString())}`)
      setAlerts((prev) => prev.filter((a) => a.id !== r.id))
      void queryClient.invalidateQueries({ queryKey: DUE_REMINDERS_QUERY_KEY })
      notifyRemindersChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  if (alerts.length === 0) return null

  return (
    <Modal
      title="Hatırlatma vakti geldi"
      onClose={() => setAlerts([])}
      size="md"
      footer={
        pathname !== '/admin/hatirlatici' ? (
          <Link
            href="/admin/hatirlatici"
            onClick={() => setAlerts([])}
            className={`${ghostButton} inline-flex items-center gap-1.5`}
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            Tüm hatırlatmaları aç
          </Link>
        ) : undefined
      }
    >
      <ul className="space-y-3">
        {alerts.map((r) => (
          <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-sm font-semibold text-gray-900">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              {r.content}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {formatWhen(r.remind_at)}
              {r.donor ? ` · ${r.donor.name}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {telHref(r.phone) && (
                <a href={telHref(r.phone)!} className={`${ghostButton} inline-flex items-center gap-1`}>
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />Ara
                </a>
              )}
              {r.donor && (
                <Link
                  href={`/admin/bagiscilar/${r.donor.id}`}
                  onClick={() => setAlerts([])}
                  className={`${ghostButton} inline-flex items-center gap-1`}
                >
                  <User className="h-3.5 w-3.5" aria-hidden="true" />Bağışçı kartı
                </Link>
              )}
              <button
                type="button"
                onClick={() => complete(r)}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
              >
                Tamamla
              </button>
              <button type="button" onClick={() => snooze(r, inMinutes(10))} className={ghostButton}>
                10 dk ertele
              </button>
              <button type="button" onClick={() => snooze(r, inMinutes(60))} className={ghostButton}>
                1 saat ertele
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
