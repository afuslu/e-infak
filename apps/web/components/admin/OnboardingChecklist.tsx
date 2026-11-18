'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Rocket, X } from 'lucide-react'
import { adminGet } from '../../lib/admin-access'

interface Step {
  key: string
  label: string
  href: string
  done: boolean
}

const DISMISS_KEY = 'einfak-onboarding-dismissed'

export function OnboardingChecklist() {
  const [data, setData] = useState<{ steps: Step[]; completed: number; total: number; pct: number } | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch { /* ignore */ }
    setDismissed(false)
    adminGet<{ steps: Step[]; completed: number; total: number; pct: number }>('/onboarding-status')
      .then((res) => setData(res.data))
      .catch(() => undefined)
  }, [])

  if (dismissed || !data || data.pct >= 100) return null

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 to-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Rocket className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Kurulum Rehberi · %{data.pct} Tamamlandı</h2>
            <p className="text-xs text-slate-500">{data.completed}/{data.total} adım hazır. Sitenizi yayına almak için kalan adımları tamamlayın.</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Rehberi gizle"
          onClick={() => {
            setDismissed(true)
            try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
          }}
          className="rounded-lg p-1 text-slate-400 hover:bg-emerald-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${data.pct}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {data.steps.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
              s.done ? 'border-emerald-200 bg-white/80 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400'
            }`}
          >
            {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
            <span className={s.done ? 'line-through opacity-75' : ''}>{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
