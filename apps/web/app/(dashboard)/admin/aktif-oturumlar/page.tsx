'use client'

/** STK PRO "Aktif Oturumlar": who is in the panel, on which page, and a way to end their sign-ins. */
import { useCallback, useEffect, useState } from 'react'
import { Power, Radio } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { confirmDialog, toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView } from '../../../../components/admin/ListView'

interface Row { user_id: string; name: string; email: string; path: string | null; ip: string | null; last_seen_at: string | null; live: boolean; open_sessions: number; is_me: boolean }

const ago = (iso: string | null) => {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s} saniye önce` : s < 3600 ? `${Math.round(s / 60)} dakika önce` : `${Math.round(s / 3600)} saat önce`
}

export default function ActiveSessionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ live: 'true' })
  const load = useCallback(async () => {
    try { setRows((await adminGet<{ items: Row[] }>('/active-sessions', { live_only: filters.live === 'true' })).data.items) } catch (err) { toast.error(apiErrorMessage(err, 'Yüklenemedi')) } finally { setLoading(false) }
  }, [filters.live])
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t) }, [load])
  const end = async (r: Row) => {
    if (!(await confirmDialog({ title: `${r.name} için oturumlar kapatılsın mı?`, text: 'Kayıtlı girişleri sonlanır; tekrar giriş yapması gerekir.', danger: true }))) return
    try { const res = await adminSend<{ ended: number }>('post', `/login-logs/end-sessions?user_id=${r.user_id}`); toast.ok(`${res.data.ended} oturum kapatıldı`); load() } catch (err) { toast.error(apiErrorMessage(err, 'Kapatılamadı')) }
  }
  const columns: ListColumn<Row>[] = [
    { key: 'user', header: 'Kullanıcı', render: (r) => <span className="font-bold uppercase text-gray-900">{r.name}{r.is_me ? <span className="ms-1.5 text-[11px] normal-case text-gray-400">(siz)</span> : null}</span> },
    { key: 'path', header: 'Bulunduğu Sayfa', render: (r) => <span className="text-gray-500">{r.path || '—'}</span> },
    { key: 'ip', header: 'IP', render: (r) => <span className="tabular-nums">{r.ip || '—'}</span> },
    {
      key: 'seen', header: 'Son Hareket', filter: { type: 'select', param: 'live', options: [{ value: 'true', label: 'Yalnız canlı oturumlar' }] },
      render: (r) => (
        <div>
          <span className={`rounded-md border px-1.5 py-0.5 text-[12px] font-semibold ${r.live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}>{ago(r.last_seen_at)}</span>
          {r.last_seen_at && <div className="mt-1 text-[12px] tabular-nums text-gray-400">{new Date(r.last_seen_at).toLocaleString('tr-TR')}</div>}
        </div>
      ),
    },
    { key: 'open', header: 'Açık Giriş', align: 'right', render: (r) => r.open_sessions },
  ]
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Radio className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Aktif Oturumlar</h1>
      </div>
      <ListView storageKey="active-sessions" columns={columns} rows={rows} total={rows.length} loading={loading} rowKey={(r) => r.user_id}
        page={1} pageSize={100} onPage={() => {}} onPageSize={() => {}} filters={filters} onApplyFilters={setFilters}
        rowActions={(r) => (!r.is_me && r.open_sessions > 0 ? (
          <button type="button" onClick={() => end(r)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose-600 hover:underline"><Power className="h-4 w-4" /> Oturumu Kapat</button>
        ) : null)}
        empty="Şu an panelde kimse yok" />
    </div>
  )
}
