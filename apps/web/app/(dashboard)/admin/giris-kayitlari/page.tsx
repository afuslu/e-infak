'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { ghostButton, inputClass } from '../../../../components/admin/FormKit'
import { PageHeader, Pagination, TBody, THead, Table, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'

interface Row { id: string; user_id: string; name: string; email: string; ip: string | null; user_agent: string | null; created_at: string; active: boolean }
interface Staff { id: string; first_name: string; last_name: string }
const PAGE = 50
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR')
const device = (ua: string | null) => !ua ? '—' : /Mobile|Android|iPhone/.test(ua) ? 'Telefon' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Bilgisayar'

/** STK PRO's "Kullanıcı Giriş Logları". */
export default function LoginLogsPage() {
  const [data, setData] = useState<{ items: Row[]; total: number; open_sessions: number } | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [filters, setFilters] = useState({ user_id: '', ip: '', date_from: '', date_to: '' })
  const [page, setPage] = useState(1)

  const load = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      setData((await adminGet<{ items: Row[]; total: number; open_sessions: number }>('/login-logs', { ...params, page, page_size: PAGE })).data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kayıtlar yüklenemedi'))
    }
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [filters, page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { adminGet<Staff[]>('/users').then((r) => setStaff(r.data)).catch(() => {}) }, [])

  const endSessions = async (userId?: string) => {
    if (!(await confirmDialog({ title: userId ? 'Bu personelin kayıtlı oturumları kapatılsın mı?' : 'Sizin dışınızdaki herkesin kayıtlı oturumları kapatılsın mı?',
      text: 'Kişiler bir sonraki işlemde yeniden giriş yapmak zorunda kalır.', confirmLabel: 'Oturumları kapat' }))) return
    try {
      const res = await adminSend<{ ended: number }>('post', `/login-logs/end-sessions${userId ? `?user_id=${userId}` : ''}`)
      toast.ok(`${res.data.ended} oturum kapatıldı`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const set = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((f) => ({ ...f, [key]: value })) }
  return (
    <div className="space-y-6">
      <PageHeader title="Giriş Kayıtları" description="Personelin panele girdiği zaman, IP adresi ve cihaz."
        actions={<button onClick={() => endSessions()} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">
          Kayıtlı oturumları kapat{data ? ` (${data.open_sessions})` : ''}</button>} />
      <Card className="space-y-4 border border-gray-100 p-5 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-4">
          <select className={inputClass} value={filters.user_id} onChange={(e) => set('user_id', e.target.value)}>
            <option value="">Tüm personel</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          <input className={inputClass} placeholder="IP adresi" value={filters.ip} onChange={(e) => set('ip', e.target.value)} />
          <input type="date" aria-label="Başlangıç" className={inputClass} value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} />
          <input type="date" aria-label="Bitiş" className={inputClass} value={filters.date_to} onChange={(e) => set('date_to', e.target.value)} />
        </div>
        {!data ? <p className="animate-pulse py-8 text-center text-sm text-gray-400">Yükleniyor…</p> : data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Kayıt yok.</p>
        ) : (
          <Table>
            <THead><Tr><Th>Personel</Th><Th>Zaman</Th><Th>IP</Th><Th>Cihaz</Th><Th>Oturum</Th><Th /></Tr></THead>
            <TBody>
              {data.items.map((r) => (
                <Tr key={r.id}>
                  <Td><div className="font-semibold text-gray-900">{r.name}</div><div className="text-xs text-gray-500">{r.email}</div></Td>
                  <Td className="whitespace-nowrap">{when(r.created_at)}</Td>
                  <Td className="font-mono">{r.ip || '—'}</Td>
                  <Td title={r.user_agent || ''}>{device(r.user_agent)}</Td>
                  <Td>{r.active ? <span className="rounded border border-green-200 bg-green-50 px-1.5 text-[11px] font-bold text-green-700">Açık</span> : <span className="text-xs text-gray-400">Kapalı</span>}</Td>
                  <Td className="text-right">{r.active && <button onClick={() => endSessions(r.user_id)} className={ghostButton}>Kapat</button>}</Td>
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
