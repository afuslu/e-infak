'use client'

/** STK PRO "Mail Gönderimleri": every bulk e-mail with its delivery counts. */
import { useCallback, useEffect, useState } from 'react'
import { Eye, Mail, RefreshCw, XCircle } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Modal, confirmDialog, toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../../../../components/admin/ListView'

interface Batch {
  id: string; seq_no: number; source: string; subject: string; body: string; total: number; sent: number; failed: number
  queued: number; status: string; send_after: string; created_at: string; created_by: string | null
}
const STATUS: Record<string, [string, string]> = {
  queued: ['Sırada', 'border-gray-200 bg-gray-50 text-gray-600'],
  sending: ['Gönderiliyor', 'border-amber-200 bg-amber-50 text-amber-700'],
  done: ['Tamamlandı', 'border-emerald-200 bg-emerald-50 text-emerald-700'],
  cancelled: ['İptal', 'border-rose-200 bg-rose-50 text-rose-700'],
}

export default function MailBatchesPage() {
  const [data, setData] = useState<{ total: number; items: Batch[] }>({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ q: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('mail-batches', 25)
  const [open, setOpen] = useState<Batch | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setData((await adminGet<typeof data>('/mail/batches', { q: filters.q || undefined, page, page_size: pageSize })).data) } catch (err) { toast.error(apiErrorMessage(err, 'Gönderimler yüklenemedi')) } finally { setLoading(false) }
  }, [filters.q, page, pageSize])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!data.items.some((b) => b.status === 'sending' || b.status === 'queued')) return
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [data.items, load])

  const columns: ListColumn<Batch>[] = [
    { key: 'no', header: 'No', render: (b) => <span className="tabular-nums">{b.seq_no}</span> },
    { key: 'source', header: 'Kaynak', render: (b) => <span className="whitespace-nowrap">{b.source}</span> },
    { key: 'subject', header: 'Konu', filter: { type: 'text', param: 'q' }, render: (b) => <span className="font-semibold text-gray-900">{b.subject}</span> },
    { key: 'total', header: 'Toplam', align: 'right', render: (b) => b.total },
    { key: 'sent', header: 'İletilen', align: 'right', render: (b) => <span className="text-emerald-600">{b.sent}</span> },
    { key: 'failed', header: 'Hatalı', align: 'right', render: (b) => <span className={b.failed ? 'text-rose-600' : 'text-gray-400'}>{b.failed}</span> },
    { key: 'status', header: 'Durum', render: (b) => { const [l, c] = STATUS[b.status] || [b.status, '']; return <span className={`rounded-md border px-1.5 py-0.5 text-[12px] font-semibold ${c}`}>{l}</span> } },
    { key: 'when', header: 'Zamanlama', render: (b) => (new Date(b.send_after) > new Date(b.created_at) ? new Date(b.send_after).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—') },
    { key: 'created', header: 'Oluşturma', render: (b) => <span className="whitespace-nowrap">{new Date(b.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span> },
  ]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Mail className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Mail Gönderimleri</h1>
      </div>
      <ListView storageKey="mail-batches" columns={columns} rows={data.items} total={data.total} loading={loading} rowKey={(b) => b.id}
        page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        rowActions={(b) => (
          <>
            <RowAction label="Ayrıntı" icon={Eye} onClick={() => setOpen(b)} />
            {b.failed > 0 && <RowAction label="Hatalıları yeniden gönder" icon={RefreshCw} onClick={async () => {
              try { const r = await adminSend<{ requeued: number }>('post', `/mail/batches/${b.id}/retry`); toast.ok(`${r.data.requeued} mail yeniden sıraya alındı`); load() } catch (err) { toast.error(apiErrorMessage(err, 'Yapılamadı')) }
            }} />}
            {(b.status === 'queued' || b.status === 'sending') && <RowAction label="İptal et" icon={XCircle} tone="danger" onClick={async () => {
              if (!(await confirmDialog({ title: 'Gönderim iptal edilsin mi?', text: 'Henüz gönderilmemiş mailler gönderilmez.', danger: true }))) return
              try { await adminSend('post', `/mail/batches/${b.id}/cancel`); load() } catch (err) { toast.error(apiErrorMessage(err, 'İptal edilemedi')) }
            }} />}
          </>
        )}
        empty="Henüz mail gönderimi yok" />
      {open && <BatchModal batch={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function BatchModal({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<{ id: string; email: string; name: string | null; status: string; error: string | null; sent_at: string | null }[]>([])
  useEffect(() => {
    adminGet<{ items: typeof rows }>(`/mail/batches/${batch.id}/messages`, { status: status || undefined, page_size: 200 }).then((r) => setRows(r.data.items)).catch(() => {})
  }, [batch.id, status])
  return (
    <Modal title={`#${batch.seq_no} · ${batch.subject}`} description={batch.source} size="lg" onClose={onClose}>
      <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[13px] text-gray-700">{batch.body}</pre>
      <select className="mb-2 rounded-lg border border-gray-200 px-2 py-1.5 text-[13px]" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Tümü</option><option value="sent">İletilen</option><option value="failed">Hatalı</option><option value="queued">Sırada</option>
      </select>
      <ul className="max-h-[360px] divide-y divide-gray-100 overflow-auto text-[13px]">
        {rows.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
            <span className="font-medium text-gray-900">{m.name || '—'}</span><span className="text-gray-500">{m.email}</span>
            <span className={`ms-auto text-[12px] font-semibold ${m.status === 'sent' ? 'text-emerald-600' : m.status === 'failed' ? 'text-rose-600' : 'text-gray-500'}`}>{STATUS[m.status]?.[0] || ({ sent: 'İletildi', failed: 'Hatalı' } as Record<string, string>)[m.status] || m.status}</span>
            {m.error && <span className="w-full text-[11.5px] text-rose-600">{m.error}</span>}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
