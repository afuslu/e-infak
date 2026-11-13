'use client'

import Link from 'next/link'
import { PlatformAlert } from '../../lib/platform-api'

const STYLE: Record<PlatformAlert['level'], { box: string; dot: string; label: string }> = {
  danger: { box: 'border-red-200 bg-red-50', dot: 'bg-red-500', label: 'Acil' },
  warning: { box: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500', label: 'Dikkat' },
  info: { box: 'border-slate-200 bg-slate-50', dot: 'bg-slate-400', label: 'Bilgi' },
}

/** Operator alerts, most urgent first; `showOrg` links each line to its organisation. */
export function AlertList({ alerts, showOrg = true }: { alerts: PlatformAlert[]; showOrg?: boolean }) {
  if (alerts.length === 0) {
    return <p className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">Dikkat gerektiren bir durum yok.</p>
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li key={`${a.organization_id}-${a.kind}-${i}`} className={`flex gap-3 rounded-xl border p-3 text-sm ${STYLE[a.level].box}`}>
          <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${STYLE[a.level].dot}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">
              <span className="sr-only">{STYLE[a.level].label}: </span>
              {showOrg && (a.organization_id
                ? <Link href={`/platform/kurum/${a.organization_id}`} className="mr-1 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">{a.organization_name}</Link>
                : <span className="mr-1">{a.organization_name}</span>)}
              {showOrg && <span className="mr-1 text-slate-400">·</span>}
              {a.message}
            </p>
            {a.hint && <p className="mt-0.5 text-xs text-slate-600">{a.hint}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AlertSummary({ alerts }: { alerts: PlatformAlert[] }) {
  const count = (level: PlatformAlert['level']) => alerts.filter((a) => a.level === level).length
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      {(['danger', 'warning', 'info'] as const).map((level) => (
        <span key={level} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${STYLE[level].box}`}>
          <span className={`h-2 w-2 rounded-full ${STYLE[level].dot}`} aria-hidden />
          {STYLE[level].label} {count(level)}
        </span>
      ))}
    </div>
  )
}
