'use client'

import { useEffect, useState } from 'react'
import { Card } from '@e-infak/ui'
import { Trash2 } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { PageHeader, TBody, THead, Table, Tabs, Td, Th, Tr, confirmDialog, toast } from '../../../../components/admin/ui'

type Kind = 'allow' | 'block'
interface Rule { id: string; network: string; note: string | null; user_id: string | null; user_name: string | null; created_by: string | null; created_at: string }
interface Staff { id: string; first_name: string; last_name: string; is_active: boolean }

const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })

/** STK PRO's "IP İzinleri" and "IP Engellemeleri" on one screen. */
export default function IpRulesPage() {
  const [kind, setKind] = useState<Kind>('allow')
  const [rows, setRows] = useState<Rule[] | null>(null)
  const [yourIp, setYourIp] = useState<string | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [form, setForm] = useState({ network: '', note: '', user_id: '' })

  const load = async () => {
    try {
      const res = await adminGet<{ items: Rule[]; your_ip: string | null }>('/ip-rules', { kind })
      setRows(res.data.items)
      setYourIp(res.data.your_ip)
    } catch (err) {
      setRows([])
      toast.error(apiErrorMessage(err, 'Kayıtlar yüklenemedi'))
    }
  }
  useEffect(() => { setRows(null); load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { adminGet<Staff[]>('/users').then((r) => setStaff(r.data.filter((s) => s.is_active))).catch(() => {}) }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await adminSend('post', '/ip-rules', { kind, network: form.network, note: form.note || null, user_id: kind === 'allow' && form.user_id ? form.user_id : null })
      toast.ok(kind === 'allow' ? 'IP izni eklendi' : 'IP engellendi')
      setForm({ network: '', note: '', user_id: '' })
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }
  const remove = async (rule: Rule) => {
    if (!(await confirmDialog(`${rule.network} kaydı silinsin mi?`))) return
    try {
      await adminSend('delete', `/ip-rules/${rule.id}`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="IP İzinleri ve Engellemeleri"
        description={<>Bağlı olduğunuz adres: <strong className="font-mono">{yourIp || '—'}</strong>. İzin kaydı olan personel panele yalnızca o adreslerden girer (dernek yöneticileri hariç); engellenen adresten kimse giremez.</>} />
      <Tabs value={kind} onChange={setKind} tabs={[{ key: 'allow', label: 'IP İzinleri' }, { key: 'block', label: 'IP Engellemeleri' }]} />
      <Card className="border border-gray-100 p-5 shadow-sm">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
          <input required className={inputClass} placeholder="IP veya aralık (81.213.241.27 · 81.213.241.0/24)" value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} />
          {kind === 'allow' ? (
            <select className={inputClass} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              <option value="">Tüm personel</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          ) : <div />}
          <input className={inputClass} placeholder="Açıklama (ör. Merkez ofis)" maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="submit" className={primaryButton}>{kind === 'allow' ? '+ IP İzni Ver' : '+ IP Engelle'}</button>
        </form>
      </Card>
      <Card className="border border-gray-100 p-5 shadow-sm">
        {!rows ? <p className="animate-pulse py-8 text-center text-sm text-gray-400">Yükleniyor…</p> : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{kind === 'allow' ? 'İzin kaydı yok; personel her adresten girebilir.' : 'Engellenen adres yok.'}</p>
        ) : (
          <Table>
            <THead><Tr><Th>IP</Th>{kind === 'allow' && <Th>Personel</Th>}<Th>Açıklama</Th><Th>Tarih</Th><Th>Ekleyen</Th><Th /></Tr></THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-mono font-semibold">{r.network.replace(/\/32$/, '')}</Td>
                  {kind === 'allow' && <Td>{r.user_name || <span className="text-gray-400">Tüm personel</span>}</Td>}
                  <Td>{r.note || '—'}</Td>
                  <Td className="whitespace-nowrap text-gray-500">{when(r.created_at)}</Td>
                  <Td className="text-gray-500">{r.created_by || '—'}</Td>
                  <Td className="text-right"><button onClick={() => remove(r)} aria-label="Sil" className="text-red-600"><Trash2 className="h-4 w-4" /></button></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
