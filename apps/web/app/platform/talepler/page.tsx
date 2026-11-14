'use client'

import { useEffect, useState } from 'react'
import { dateTr, platformCall } from '../../../lib/platform-api'

interface DemoRequest {
  id: string; name: string; organization: string; phone: string; email: string | null; plan: string | null
  message: string | null; status: 'new' | 'contacted' | 'closed'; created_at: string
}

const STATUS: Record<DemoRequest['status'], [string, string]> = {
  new: ['Yeni', 'bg-amber-100 text-amber-800'], contacted: ['Arandı', 'bg-blue-100 text-blue-700'], closed: ['Kapandı', 'bg-slate-100 text-slate-600'],
}
const PLAN: Record<string, string> = { baslangic: 'Başlangıç', orta: 'Orta', ileri: 'İleri' }

/** Demo / offer requests left on the e-infak.org landing page. */
export default function PlatformDemoRequestsPage() {
  const [rows, setRows] = useState<DemoRequest[] | null>(null)
  useEffect(() => { platformCall<DemoRequest[]>('get', '/demo-requests').then(setRows).catch(() => setRows([])) }, [])

  const setStatus = async (row: DemoRequest, status: DemoRequest['status']) => {
    const updated = await platformCall<DemoRequest>('patch', `/demo-requests/${row.id}`, { status })
    setRows((list) => (list || []).map((r) => (r.id === row.id ? updated : r)))
  }

  const fresh = (rows || []).filter((r) => r.status === 'new').length
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Demo talepleri</h1>
        <p className="text-sm text-slate-500">e-infak.org ana sayfasındaki formdan gelenler.{fresh > 0 ? ` ${fresh} yeni talep aranmayı bekliyor.` : ''}</p>
      </div>
      {!rows ? <p className="text-sm text-slate-500">Yükleniyor…</p> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="p-3">Zaman</th><th className="p-3">Kişi</th><th className="p-3">Kurum</th><th className="p-3">İletişim</th><th className="p-3">Not</th><th className="p-3">Durum</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="whitespace-nowrap p-3 text-xs">{dateTr(r.created_at)}</td>
                  <td className="p-3 font-semibold">{r.name}</td>
                  <td className="p-3">{r.organization}{r.plan && <div className="text-xs text-slate-500">Paket: {PLAN[r.plan] || r.plan}</div>}</td>
                  <td className="p-3 text-xs"><a href={`tel:${r.phone}`} className="font-semibold text-blue-700 hover:underline">{r.phone}</a>{r.email && <div><a href={`mailto:${r.email}`} className="text-blue-700 hover:underline">{r.email}</a></div>}</td>
                  <td className="max-w-xs whitespace-pre-line p-3 text-xs text-slate-600">{r.message || '—'}</td>
                  <td className="p-3">
                    <select value={r.status} onChange={(e) => setStatus(r, e.target.value as DemoRequest['status'])}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-bold ${STATUS[r.status][1]}`}>
                      {Object.entries(STATUS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Henüz talep yok</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
