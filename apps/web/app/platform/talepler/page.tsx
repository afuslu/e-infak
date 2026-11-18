'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PlatformSkeleton } from '../../../components/platform/PlatformUI'
import { dateTr, platformCall, platformError } from '../../../lib/platform-api'

interface DemoRequest {
  id: string; name: string; organization: string; phone: string; email: string | null; plan: string | null
  message: string | null; status: 'new' | 'contacted' | 'converted' | 'closed'; created_at: string
}

const STATUS: Record<DemoRequest['status'], [string, string]> = {
  new: ['Yeni', 'bg-amber-100 text-amber-800'],
  contacted: ['Arandı', 'bg-blue-100 text-blue-700'],
  converted: ['Kurum oldu', 'bg-emerald-100 text-emerald-800'],
  closed: ['Kapandı', 'bg-slate-100 text-slate-600'],
}
const PLAN: Record<string, string> = { baslangic: 'Başlangıç', orta: 'Orta', ileri: 'İleri' }

/** Pre-fills the new-organisation form from a request; the request is marked converted when it is created. */
function newOrgLink(r: DemoRequest) {
  const params = new URLSearchParams({ talep: r.id, ad: r.organization, telefon: r.phone })
  if (r.email) params.set('eposta', r.email)
  if (r.plan) params.set('paket', r.plan)
  const [first, ...rest] = r.name.trim().split(/\s+/)
  if (first) params.set('yonetici_ad', first)
  if (rest.length) params.set('yonetici_soyad', rest.join(' '))
  return `/platform/yeni?${params}`
}

/** Demo / offer requests left on the e-infak.org landing page. */
export default function PlatformDemoRequestsPage() {
  const [rows, setRows] = useState<DemoRequest[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  useEffect(() => {
    platformCall<DemoRequest[]>('get', '/demo-requests').then(setRows)
      .catch((err) => setError(platformError(err, 'Talepler yüklenemedi')))
  }, [])

  const setStatus = async (row: DemoRequest, status: DemoRequest['status']) => {
    setBusyId(row.id)
    setError('')
    try {
      const updated = await platformCall<DemoRequest>('patch', `/demo-requests/${row.id}`, { status })
      setRows((list) => (list || []).map((r) => (r.id === row.id ? updated : r)))
    } catch (err) {
      setError(platformError(err, 'Durum değiştirilemedi'))
    } finally {
      setBusyId(null)
    }
  }

  const fresh = (rows || []).filter((r) => r.status === 'new').length
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Demo talepleri</h1>
        <p className="mt-1 text-sm text-slate-500">
          e-infak.org ana sayfasındaki formdan gelen başvurular.
          {fresh > 0 && <span className="ms-1.5 font-semibold text-amber-700">{fresh} yeni talep aranmayı bekliyor.</span>}
        </p>
      </div>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>}
      {!rows ? (!error && <PlatformSkeleton rows={4} />) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-xs">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Zaman</th>
                <th className="px-4 py-3">Kişi</th>
                <th className="px-4 py-3">Kurum</th>
                <th className="px-4 py-3">İletişim</th>
                <th className="px-4 py-3">Not</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">{dateTr(r.created_at)}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{r.name}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{r.organization}</div>
                    {r.plan && <div className="text-xs text-slate-500">Paket: {PLAN[r.plan] || r.plan}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    <a href={`tel:${r.phone}`} className="font-semibold text-blue-700 hover:underline">{r.phone}</a>
                    {r.email && <div><a href={`mailto:${r.email}`} className="text-blue-700 hover:underline">{r.email}</a></div>}
                  </td>
                  <td className="max-w-xs whitespace-pre-line px-4 py-3.5 text-xs text-slate-600">{r.message || '—'}</td>
                  <td className="px-4 py-3.5">
                    <select
                      value={r.status}
                      disabled={busyId === r.id}
                      onChange={(e) => setStatus(r, e.target.value as DemoRequest['status'])}
                      className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold outline-none disabled:opacity-50 ${(STATUS[r.status] || STATUS.new)[1]}`}
                    >
                      {Object.entries(STATUS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    {r.status !== 'converted' && (
                      <Link href={newOrgLink(r)} className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                        Kurum oluştur
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">Henüz talep yok</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
