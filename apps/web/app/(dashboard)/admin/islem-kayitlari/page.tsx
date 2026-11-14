'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@e-infak/ui'
import { adminGet, apiErrorMessage } from '../../../../lib/admin-access'
import { inputClass } from '../../../../components/admin/FormKit'
import { ExportButtons, PageHeader, Pagination, TBody, THead, Table, Td, Th, Tr, toast } from '../../../../components/admin/ui'

interface Row { id: string; action: string; label: string; details: Record<string, unknown>; user: string; created_at: string; donor_id: string | null }
interface Staff { id: string; first_name: string; last_name: string }
const PAGE = 50
const HIDDEN = new Set(['donor_id', 'donation_id', 'staff_role_id', 'batch_id', 'transfer_id', 'old_permissions', 'new_permissions'])
const summary = (details: Record<string, unknown>) => Object.entries(details)
  .filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== '' && typeof v !== 'object')
  .slice(0, 5).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')

/** STK PRO's "Loglar": who did what, when. */
export default function ActivityLogPage() {
  const [data, setData] = useState<{ items: Row[]; total: number; actions: { key: string; label: string }[] } | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [filters, setFilters] = useState({ user_id: '', action: '', q: '', date_from: '', date_to: '', requests: '' })
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
        setData((await adminGet<{ items: Row[]; total: number; actions: { key: string; label: string }[] }>('/activity-logs', { ...params, page, page_size: PAGE })).data)
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Kayıtlar yüklenemedi'))
      }
    }, 250)
    return () => clearTimeout(t)
  }, [filters, page])
  useEffect(() => { adminGet<Staff[]>('/users').then((r) => setStaff(r.data)).catch(() => {}) }, [])
  const set = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((f) => ({ ...f, [key]: value })) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="İşlem Kayıtları"
        description="Panelde yapılan işlemler: makbuz, bağışçı, SMS, rol ve ayar değişiklikleri."
        actions={
          data && data.items.length > 0 ? (
            <ExportButtons
              filename="islem-kayitlari"
              title="İşlem Kayıtları"
              subtitle={`Toplam ${data.total} kayıt (sayfa ${page})`}
              getData={() => ({
                headers: ['Tarih', 'İşlem', 'Ayrıntı', 'Yapan'],
                rows: data.items.map((r) => [
                  new Date(r.created_at).toLocaleString('tr-TR'),
                  r.label,
                  summary(r.details) || '—',
                  r.user,
                ]),
              })}
            />
          ) : undefined
        }
      />
      <Card className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          <input type="checkbox" checked={!!filters.requests} onChange={(e) => set('requests', e.target.checked ? 'true' : '')} />
          Sistem istek kayıtlarını da göster (her POST/PUT isteği)
        </label>
        <div className="grid gap-2 sm:grid-cols-5">
          <input className={inputClass} placeholder="Ara (makbuz no, ad…)" value={filters.q} onChange={(e) => set('q', e.target.value)} />
          <select className={inputClass} value={filters.action} onChange={(e) => set('action', e.target.value)}>
            <option value="">Tüm işlemler</option>
            {data?.actions.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <select className={inputClass} value={filters.user_id} onChange={(e) => set('user_id', e.target.value)}>
            <option value="">Tüm personel</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          <input type="date" aria-label="Başlangıç" className={inputClass} value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} />
          <input type="date" aria-label="Bitiş" className={inputClass} value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} />
        </div>
        {!data ? <p className="animate-pulse py-8 text-center text-sm text-gray-400">Yükleniyor…</p> : data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Kayıt yok.</p>
        ) : (
          <Table>
            <THead><Tr><Th>Tarih</Th><Th>İşlem</Th><Th>Ayrıntı</Th><Th>Yapan</Th></Tr></THead>
            <TBody>
              {data.items.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-gray-500">{new Date(r.created_at).toLocaleString('tr-TR')}</Td>
                  <Td className="font-semibold text-gray-900">{r.label}</Td>
                  <Td className="max-w-xl text-xs text-gray-600">
                    {summary(r.details) || '—'}
                    {r.donor_id && <Link href={`/admin/bagiscilar?donor=${r.donor_id}`} className="ml-2 font-bold text-primary-700 hover:underline">Bağışçı kartı</Link>}
                  </Td>
                  <Td className="whitespace-nowrap">{r.user}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {data && <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  )
}
