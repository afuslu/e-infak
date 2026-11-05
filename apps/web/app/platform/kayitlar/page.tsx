'use client'

import { useEffect, useState } from 'react'
import { dateTr, platformCall } from '../../../lib/platform-api'

interface Entry { id: string; action: string; operator: string | null; organization: string | null; details: Record<string, unknown>; ip: string | null; created_at: string }

export default function PlatformAuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null)
  useEffect(() => { platformCall<Entry[]>('get', '/audit?limit=300').then(setRows).catch(() => setRows([])) }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">İşlem kayıtları</h1>
      {!rows ? <p className="text-sm text-slate-500">Yükleniyor…</p> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Zaman</th><th className="p-3">İşlem</th><th className="p-3">Kurum</th><th className="p-3">Yönetici</th><th className="p-3">Ayrıntı</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="whitespace-nowrap p-3 text-xs">{dateTr(r.created_at)}</td>
                  <td className="p-3 font-semibold">{r.action.replace(/_/g, ' ')}</td>
                  <td className="p-3">{r.organization || '—'}</td>
                  <td className="p-3 text-xs">{r.operator || '—'}<div className="text-slate-400">{r.ip}</div></td>
                  <td className="p-3 font-mono text-xs text-slate-600">{JSON.stringify(r.details)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
