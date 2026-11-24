'use client'

/** "SMS Listeleri" / "Mail Listeleri": saved donor sets built from the donor list's bulk actions. */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, ListChecks, Mail, PencilLine, Send, Trash2 } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../lib/admin-access'
import { Label, inputClass } from '../FormKit'
import { Modal, confirmDialog, toast } from '../ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../ListView'
import { formatPhone } from '../donors/types'
import { MailComposer } from './MailComposer'

export interface RecipientList { id: string; channel: 'sms' | 'mail'; name: string; description: string | null; member_count: number; created_by: string | null; created_at: string; updated_at: string }

export function RecipientListsPage({ channel }: { channel: 'sms' | 'mail' }) {
  const router = useRouter()
  const [lists, setLists] = useState<RecipientList[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ name: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize(`${channel}-lists`, 25)
  const [members, setMembers] = useState<RecipientList | null>(null)
  const [renaming, setRenaming] = useState<RecipientList | null>(null)
  const [mailTo, setMailTo] = useState<RecipientList | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setLists((await adminGet<RecipientList[]>('/recipient-lists', { channel })).data) } catch (err) { toast.error(apiErrorMessage(err, 'Listeler yüklenemedi')) } finally { setLoading(false) }
  }, [channel])
  useEffect(() => { load() }, [load])

  const filtered = lists.filter((l) => !filters.name || l.name.toLocaleLowerCase('tr').includes(filters.name.toLocaleLowerCase('tr')))
  const columns: ListColumn<RecipientList>[] = [
    { key: 'name', header: 'Liste Adı', filter: { type: 'text', param: 'name' }, render: (l) => <span className="font-bold text-gray-900">{l.name}</span> },
    { key: 'desc', header: 'Açıklama', render: (l) => l.description || '—' },
    { key: 'count', header: 'Kişi', align: 'right', render: (l) => <span className="tabular-nums">{l.member_count.toLocaleString('tr-TR')}</span> },
    { key: 'by', header: 'Oluşturan', render: (l) => l.created_by || '—' },
    { key: 'date', header: 'Son Değişiklik', render: (l) => new Date(l.updated_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) },
  ]
  const Icon = channel === 'sms' ? ListChecks : Mail
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Icon className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">{channel === 'sms' ? 'SMS Listeleri' : 'Mail Listeleri'}</h1>
        <p className="ms-auto text-[13px] text-gray-500">Liste oluşturmak için: Bağışçılar → kişileri seçin → Toplu İşlemler → {channel === 'sms' ? 'SMS' : 'Mail'} Listesi Oluştur</p>
      </div>
      <ListView storageKey={`${channel}-lists`} columns={columns} rows={filtered.slice((page - 1) * pageSize, page * pageSize)} total={filtered.length}
        loading={loading} rowKey={(l) => l.id} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        rowActions={(l) => (
          <>
            <RowAction label={channel === 'sms' ? 'SMS gönder' : 'Mail gönder'} icon={Send} tone="success"
              onClick={() => (channel === 'sms' ? router.push(`/admin/broadcast?liste=${l.id}`) : setMailTo(l))} />
            <RowAction label="Kişileri gör" icon={Eye} onClick={() => setMembers(l)} />
            <RowAction label="Yeniden adlandır" icon={PencilLine} onClick={() => setRenaming(l)} />
            <RowAction label="Sil" icon={Trash2} tone="danger" onClick={async () => {
              if (!(await confirmDialog({ title: `"${l.name}" silinsin mi?`, text: 'Liste silinir; bağışçılar silinmez.', danger: true }))) return
              try { await adminSend('delete', `/recipient-lists/${l.id}`); toast.ok('Liste silindi'); load() } catch (err) { toast.error(apiErrorMessage(err, 'Silinemedi')) }
            }} />
          </>
        )}
        empty="Henüz liste yok" />
      {members && <MembersModal list={members} onClose={() => { setMembers(null); load() }} />}
      {renaming && <RenameModal list={renaming} onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); load() }} />}
      {mailTo && <MailComposer target={{ list_id: mailTo.id }} label={`Liste: ${mailTo.name} (${mailTo.member_count} kişi)`} onClose={() => setMailTo(null)} />}
    </div>
  )
}

function MembersModal({ list, onClose }: { list: RecipientList; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; items: { id: string; name: string; phone: string | null; email: string | null; sms_opt_out: boolean; email_opt_out: boolean }[] }>({ total: 0, items: [] })
  const load = useCallback(() => {
    adminGet<typeof data>(`/recipient-lists/${list.id}/members`, { page, page_size: 25 }).then((r) => setData(r.data)).catch(() => {})
  }, [list.id, page])
  useEffect(() => { load() }, [load])
  const remove = async (id: string) => {
    try { await adminSend('patch', `/recipient-lists/${list.id}`, { remove_donor_ids: [id] }); load() } catch (err) { toast.error(apiErrorMessage(err, 'Çıkarılamadı')) }
  }
  const pages = Math.max(1, Math.ceil(data.total / 25))
  return (
    <Modal title={list.name} description={`${data.total.toLocaleString('tr-TR')} kişi`} size="lg" onClose={onClose}>
      <ul className="divide-y divide-gray-100 text-[13.5px]">
        {data.items.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <a href={`/admin/bagiscilar/${m.id}`} className="font-semibold text-gray-900 hover:text-primary-700">{m.name}</a>
            <span className="text-gray-500">{list.channel === 'sms' ? formatPhone(m.phone) : m.email}</span>
            {(list.channel === 'sms' ? m.sms_opt_out : m.email_opt_out) && <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">istemiyor</span>}
            <button type="button" onClick={() => remove(m.id)} className="ms-auto text-[12px] font-semibold text-rose-600 hover:underline">Listeden çıkar</button>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-[13px]">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Önceki</button>
          <span className="tabular-nums">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Sonraki</button>
        </div>
      )}
    </Modal>
  )
}

function RenameModal({ list, onClose, onSaved }: { list: RecipientList; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(list.name)
  const [description, setDescription] = useState(list.description || '')
  const save = async () => {
    try { await adminSend('patch', `/recipient-lists/${list.id}`, { name, description }); onSaved() } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) }
  }
  return (
    <Modal title="Listeyi düzenle" onClose={onClose}
      footer={<button type="button" onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Kaydet</button>}>
      <div className="grid gap-3">
        <Label label="Liste Adı"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Label>
        <Label label="Açıklama"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></Label>
      </div>
    </Modal>
  )
}

/** "SMS / Mail Listesi Oluştur" from the donor list: new list or add to an existing one. */
export function SaveToListModal({ channel, count, target, onClose, onDone }: {
  channel: 'sms' | 'mail'; count: number; target: { ids: string[]; select_all: boolean; filters?: Record<string, unknown> }
  onClose: () => void; onDone: (listId: string) => void
}) {
  const [lists, setLists] = useState<RecipientList[]>([])
  const [listId, setListId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { adminGet<RecipientList[]>('/recipient-lists', { channel }).then((r) => setLists(r.data)).catch(() => {}) }, [channel])
  const save = async () => {
    if (!listId && !name.trim()) { toast.error('Liste adını yazın'); return }
    setBusy(true)
    try {
      const r = await adminSend<{ id: string; added: number; member_count: number }>('post', '/recipient-lists', {
        channel, name: name.trim() || 'liste', list_id: listId || null, target,
      })
      toast.ok(`${r.data.added} kişi listeye eklendi (listede ${r.data.member_count} kişi).`)
      onDone(r.data.id)
    } catch (err) { toast.error(apiErrorMessage(err, 'Liste oluşturulamadı')) } finally { setBusy(false) }
  }
  return (
    <Modal title={channel === 'sms' ? 'SMS Listesi Oluştur' : 'Mail Listesi Oluştur'} description={`${count.toLocaleString('tr-TR')} bağışçı`} onClose={onClose}
      footer={<button type="button" disabled={busy} onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Kaydet</button>}>
      <div className="grid gap-3">
        <Label label="Mevcut listeye ekle">
          <select className={inputClass} value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">Yeni liste oluştur</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.member_count})</option>)}
          </select>
        </Label>
        {!listId && <Label label="Yeni liste adı"><input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Kurban 2026 bağışçıları" /></Label>}
      </div>
    </Modal>
  )
}
