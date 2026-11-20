'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PhoneIncoming, X } from 'lucide-react'
import { adminGet, hasFeature, hasModule, useAdminAccess } from '../../lib/admin-access'

interface LiveCall {
  id: string
  phone: string | null
  extension: string | null
  status: string
  status_label: string
  donor: { id: string; name: string; city: string | null; tags: string[]; total_cents: number; donation_count: number; last_donation_at: string | null } | null
}

const POLL_MS = 5000
const tl = (cents: number) => (cents / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

/** Incoming calls on the user's extension, shown with the caller's donor card (NetGSM Netsantral events). */
export function IncomingCallPopup() {
  const { data: access } = useAdminAccess()
  const enabled = !!access && hasFeature(access, 'call_center') && hasModule(access, ['donors', 'sms'])
  const [calls, setCalls] = useState<LiveCall[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const failures = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        try {
          setCalls((await adminGet<LiveCall[]>('/call-center/live')).data)
          failures.current = 0
        } catch {
          failures.current += 1
        }
      }
      // Back off when the endpoint keeps failing (e.g. no santral account yet).
      if (!stopped) timer = setTimeout(tick, failures.current > 3 ? 60_000 : POLL_MS)
    }
    tick()
    return () => { stopped = true; clearTimeout(timer) }
  }, [enabled])

  const visible = calls.filter((c) => !dismissed.has(c.id))
  if (!visible.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 space-y-2" aria-live="polite">
      {visible.map((c) => (
        <div key={c.id} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${c.status === 'ringing' ? 'animate-pulse bg-emerald-100' : 'bg-sky-100'}`}>
                <PhoneIncoming className="h-5 w-5 text-emerald-700" aria-hidden="true" />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.status_label}{c.extension ? ` · dahili ${c.extension}` : ''}</div>
                <div className="font-bold text-gray-900">{c.donor?.name || c.phone || 'Bilinmeyen numara'}</div>
              </div>
            </div>
            <button type="button" aria-label="Kapat" className="rounded p-1 text-gray-400 hover:bg-gray-100" onClick={() => setDismissed(new Set([...dismissed, c.id]))}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {c.donor ? (
            <div className="mt-3 space-y-1 text-sm text-gray-700">
              <div>{c.phone}{c.donor.city ? ` · ${c.donor.city}` : ''}</div>
              <div><b>{tl(c.donor.total_cents)}</b> · {c.donor.donation_count} bağış{c.donor.last_donation_at ? ` · son ${new Date(c.donor.last_donation_at).toLocaleDateString('tr-TR')}` : ''}</div>
              {c.donor.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.donor.tags.slice(0, 4).map((t) => <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{t}</span>)}</div>}
              <Link href={`/admin/bagiscilar?donor=${c.donor.id}`} className="mt-2 inline-block font-semibold text-primary-700 hover:underline">Bağışçı kartını aç →</Link>
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-600">
              Kayıtlı bağışçı değil. <Link href={`/admin/bagiscilar?q=${encodeURIComponent(c.phone || '')}`} className="font-semibold text-primary-700 hover:underline">Bağışçılarda ara</Link>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
