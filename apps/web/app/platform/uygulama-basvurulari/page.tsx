'use client'

import axios from 'axios'
import { useEffect, useState } from 'react'
import { PlatformSkeleton } from '../../../components/platform/PlatformUI'
import { dateTr, platformCall, platformError, platformToken } from '../../../lib/platform-api'

interface AppRequest {
  id: string; organization: string; slug: string; status: string; note: string | null; submitted_at: string | null; submitted_by: string | null
  data: Record<string, string>
}
const STATUS: Record<string, string> = { submitted: 'Gönderildi', in_review: 'İnceleniyor', built: 'Derlendi', in_store: 'Mağazada', changes_requested: 'Düzeltme istendi' }
const ACCOUNT: Record<string, string> = { none: 'Yok', applied: 'Başvuruldu', ready: 'Hazır' }

/** Organisations asking for their own store app. Builds are started by an operator, never from here. */
export default function AppRequestsPage() {
  const [rows, setRows] = useState<AppRequest[] | null>(null)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    platformCall<AppRequest[]>('get', '/app-requests').then(setRows).catch((e) => setError(platformError(e, 'Başvurular yüklenemedi')))
  }, [])

  const update = async (row: AppRequest, status: string) => {
    setBusy(row.id); setError('')
    try {
      const next = await platformCall<AppRequest>('patch', `/app-requests/${row.id}`, { status, note: notes[row.id] ?? row.note })
      setRows((list) => (list || []).map((r) => (r.id === row.id ? next : r)))
    } catch (e) { setError(platformError(e, 'Durum değiştirilemedi')) } finally { setBusy(null) }
  }
  const download = async (row: AppRequest) => {
    setError('')
    try {
      const res = await axios.get(`${window.location.origin}/api/v1/platform/app-requests/${row.id}/package`, { responseType: 'blob', headers: { Authorization: `Bearer ${platformToken()}` } })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = `${row.slug}-uygulama.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch { setError('Paket indirilemedi; kurumun görselleri kütüphanede duruyor mu kontrol edin.') }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Uygulama başvuruları</h1>
        <p className="mt-1 text-sm text-slate-500">Kendi mağaza uygulamasını isteyen kurumlar. Derlemeyi bilgisayarınızda siz başlatırsınız.</p>
      </div>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{error}</p>}
      {!rows ? (!error && <PlatformSkeleton rows={3} />) : rows.length === 0 ? <p className="text-sm text-slate-500">Başvuru yok.</p> : rows.map((r) => (
        <section key={r.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.data.icon_url && <img src={r.data.icon_url} alt="" className="h-14 w-14 rounded-xl border object-cover" />}
            <div className="min-w-0 flex-1">
              <h2 className="font-extrabold text-slate-900">{r.data.app_name} <span className="font-medium text-slate-500">· {r.organization}</span></h2>
              <p className="text-xs text-slate-500">{r.data.package_id} · {r.submitted_at ? dateTr(r.submitted_at) : ''} · {r.submitted_by}</p>
            </div>
            <select aria-label={`${r.organization} durumu`} value={r.status} disabled={busy === r.id} onChange={(e) => update(r, e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm font-bold">
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" onClick={() => download(r)} className="rounded-lg border px-3 py-1.5 text-sm font-bold hover:bg-slate-50">Paketi indir</button>
          </div>
          <p className="text-sm text-slate-700">{r.data.short_description}</p>
          <p className="text-xs text-slate-500">Yetkili: {r.data.contact_name}, {r.data.contact_phone} · Destek: {r.data.support_email} · Google hesabı: {ACCOUNT[r.data.google_account]} · Apple hesabı: {ACCOUNT[r.data.apple_account]}</p>
          <label className="block text-xs font-bold text-slate-600">Kuruma not (durumu değiştirince kaydedilir; düzeltme isterken zorunlu)
            <textarea rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" value={notes[r.id] ?? r.note ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
          </label>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`cd apps/mobile
node scripts/add-tenant.mjs ~/Downloads/${r.slug}-uygulama
eas build --platform android --profile ${r.slug}-production
eas build --platform ios --profile ${r.slug}-production`}</pre>
          <p className="text-xs text-slate-500">İndirilen zip açılınca oluşan klasörü verin. Bildirimler için Firebase’de paketi kaydedip google-services.{r.slug}.json dosyasını ekleyin.</p>
        </section>
      ))}
    </div>
  )
}
