'use client'

/** STK PRO "Temsilciler": staff who represent donors (the "Temsilci" on donor and receipt forms). */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Users2 } from 'lucide-react'
import { adminGet, apiErrorMessage, formatMoney } from '../../../../lib/admin-access'
import { toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, usePageSize } from '../../../../components/admin/ListView'

interface Rep { id: string; name: string; email: string; is_active: boolean; donor_count: number; total_donated_cents: number }

export default function RepresentativesPage() {
  const [rows, setRows] = useState<Rep[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ name: '', status: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('representatives', 25)
  useEffect(() => { adminGet<Rep[]>('/representatives').then((r) => setRows(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Yüklenemedi'))).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => rows.filter((r) => (!filters.name || r.name.toLocaleLowerCase('tr').includes(filters.name.toLocaleLowerCase('tr')))
    && (!filters.status || String(r.is_active) === filters.status)), [rows, filters])
  const columns: ListColumn<Rep>[] = [
    { key: 'name', header: 'Temsilci', filter: { type: 'text', param: 'name' }, render: (r) => <span className="font-bold text-gray-900">{r.name}</span> },
    { key: 'email', header: 'E-posta', render: (r) => r.email },
    { key: 'count', header: 'Bağışçı', align: 'right', render: (r) => <Link href={`/admin/bagiscilar?temsilci=${r.id}`} className="font-semibold text-primary-700 hover:underline">{r.donor_count.toLocaleString('tr-TR')}</Link> },
    { key: 'total', header: 'Bağışçılarının Toplamı', align: 'right', render: (r) => formatMoney(r.total_donated_cents) },
    { key: 'status', header: 'Durum', filter: { type: 'select', param: 'status', options: [{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Pasif' }] }, render: (r) => (r.is_active ? 'Aktif' : 'Pasif') },
  ]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Users2 className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Temsilciler</h1>
        <Link href="/admin/users" className="ms-auto rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">Temsilci Ekle (Kullanıcılar)</Link>
      </div>
      <p className="text-[13px] text-gray-500">Temsilciler panel kullanıcılarıdır. Bağışçı kartında ya da Bağışçılar → Toplu Güncelle ile bağışçılara atanırlar.</p>
      <ListView storageKey="representatives" columns={columns} rows={filtered.slice((page - 1) * pageSize, page * pageSize)} total={filtered.length} loading={loading}
        rowKey={(r) => r.id} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }} empty="Henüz temsilci yok" />
    </div>
  )
}
