'use client'

import { useEffect, useState } from 'react'
import { Eye, LogOut, RefreshCw } from 'lucide-react'
import OrgSimulateSwitcher from '../platform/OrgSimulateSwitcher'
import { exitSimulation, getSimulation, renewSimulation, type SimulationState } from '../../lib/simulation'

const pad = (n: number) => String(n).padStart(2, '0')

/** Shown on top of the admin panel while a platform operator simulates the organisation. */
export default function SimulationBanner({ operatorEmail }: { operatorEmail?: string | null }) {
  const [sim, setSim] = useState<SimulationState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [renewing, setRenewing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSim(getSimulation())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!sim) return null

  const left = Math.max(0, Math.floor((sim.expiresAt - now) / 1000))
  const renew = async () => {
    setRenewing(true)
    setError('')
    const token = await renewSimulation()
    if (token) setSim(getSimulation())
    else setError('Süre uzatılamadı; platform oturumunuz kapanmış olabilir')
    setRenewing(false)
  }

  return (
    <div className="relative z-30 border-b border-amber-600 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm print:hidden" role="status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-[13px] sm:px-6">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="font-extrabold">Simülasyon:</span>{' '}
          <span className="font-semibold">{sim.orgName}</span>
          <span className="opacity-90"> — {sim.asUser.email} olarak</span>
          {operatorEmail && <span className="hidden opacity-80 md:inline"> · operatör {operatorEmail}</span>}
          <span className={`ms-2 rounded bg-black/15 px-1.5 py-0.5 font-mono text-[12px] ${left < 300 ? 'bg-red-700/60' : ''}`}>
            {left > 0 ? `${pad(Math.floor(left / 60))}:${pad(left % 60)}` : 'süre doldu'}
          </span>
          {error && <span className="ms-2 font-semibold">{error}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {left < 600 && (
            <button type="button" onClick={renew} disabled={renewing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1.5 text-xs font-semibold transition hover:bg-white/20 disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${renewing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Uzat</span>
            </button>
          )}
          <OrgSimulateSwitcher currentOrgId={sim.orgId} label="Kurum değiştir" />
          <button type="button" onClick={() => exitSimulation()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-50">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Platforma dön</span>
          </button>
        </div>
      </div>
    </div>
  )
}
