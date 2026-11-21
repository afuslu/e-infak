'use client'

/** STK PRO "Dışa Aktarımlar": who exported what, and when (from the activity log). */
import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { adminGet, apiErrorMessage } from '../../../../lib/admin-access'
import { toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, usePageSize } from '../../../../components/admin/ListView'

interface Log { id: string; action: string; label?: string; user?: string | null; created_at: string; details?: Record<string, unknown> }

export default function ExportsPage() {
  const [data, setData] = useState<{ total: number; items: Log[] }>({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ from: '', to: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('exports', 25)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminGet<{ total: number; items: Log[] }>('/activity-logs', { q: 'disa_aktar', date_from: filters.from || undefined, date_to: filters.to || undefined, page, page_size: pageSize })
      setData(r.data)
    } catch (err) { toast.error(apiErrorMessage(err, 'Yüklenemedi')) } finally { setLoading(false) }
  }, [filters, page, pageSize])
  useEffect(() => { load() }, [load])
  const columns: ListColumn<Log>[] = [
    { key: 'date', header: 'Tarih', filter: { type: 'daterange', from: 'from', to: 'to' }, render: (l) => <span className="whitespace-nowrap tabular-nums">{new Date(l.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span> },
    { key: 'user', header: 'Kullanıcı', render: (l) => <span className="uppercase">{l.user || '—'}</span> },
    { key: 'what', header: 'Aktarım', render: (l) => <span className="rounded-md border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[12px] font-semibold text-primary-700">{l.label || l.action}</span> },
    { key: 'rows', header: 'Satır', align: 'right', render: (l) => String(l.details?.count ?? '—') },
    { key: 'cols', header: 'Sütunlar', render: (l) => <span className="text-gray-500">{Array.isArray(l.details?.columns) ? (l.details?.columns as string[]).length : '—'}</span> },
  ]
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Download className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Dışa Aktarımlar</h1>
      </div>
      <ListView storageKey="exports" columns={columns} rows={data.items} total={data.total} loading={loading} rowKey={(l) => l.id}
        page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }} empty="Henüz dışa aktarım yok" />
    </div>
  )
}
