/** Hatırlatıcı helpers shared by the Hatırlatıcı page, donor card, and global shell alerts. */

export const DUE_REMINDERS_QUERY_KEY = ['admin-due-reminders'] as const
export const REMINDERS_CHANGED_EVENT = 'einfak:reminders-changed'

export function notifyRemindersChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT))
  }
}

export type DesktopNotifyState = 'granted' | 'denied' | 'default' | 'unsupported'

export function desktopNotificationState(): DesktopNotifyState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Shows an OS-level desktop notification (Windows/macOS) when permission is granted. */
export function showDesktopNotification(reminder: Reminder, onFocus?: () => void) {
  if (desktopNotificationState() !== 'granted') return
  try {
    const title = reminder.donor
      ? `Hatırlatma · ${reminder.donor.name}`
      : `Hatırlatma · ${formatWhen(reminder.remind_at)}`
    const n = new Notification(title, {
      body: reminder.content,
      icon: '/icon.png',
      tag: `reminder-${reminder.id}-${reminder.remind_at}`,
      requireInteraction: true,
    })
    n.onclick = () => {
      window.focus()
      onFocus?.()
      n.close()
    }
  } catch {
    /* ignore unsupported notification options */
  }
}

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Reminder {
  id: string
  content: string
  remind_at: string
  repeat: RepeatKind
  source: 'manual' | 'wise_reminder'
  notified_at: string | null
  completed_at: string | null
  phone: string | null
  donor: { id: string; name: string; phone: string | null } | null
}

export interface ImportPreviewRow {
  content: string
  remind_at: string
  date_missing: boolean
  phone: string | null
  donor: { id: string; name: string } | null
  suggested_name: string | null
  duplicate: boolean
}

export interface ImportResult {
  rows: ImportPreviewRow[]
  total: number
  matched: number
  created: number
  skipped: number
  new_donors: number
}

export const REPEAT_LABEL: Record<RepeatKind, string> = {
  none: 'Tekrar yok', daily: 'Her gün', weekly: 'Her hafta', monthly: 'Her ay', yearly: 'Her yıl',
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Value for <input type="datetime-local"> in the viewer's own clock. */
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const nextHour = () => {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}
export const tomorrowAt = (hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}
export const inMinutes = (m: number) => new Date(Date.now() + m * 60_000)

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export function formatWhen(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay(d, now)) return `Bugün ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(d, tomorrow)) return `Yarın ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `Dün ${time}`
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })} ${time}`
}

export const telHref = (phone: string | null) => (phone ? `tel:0${phone}` : null)

/** A short two-tone chime with Web Audio (no sound file to ship). */
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      const start = ctx.currentTime + i * 0.25
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      osc.start(start)
      osc.stop(start + 0.25)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {
    /* sound is a nicety */
  }
}
