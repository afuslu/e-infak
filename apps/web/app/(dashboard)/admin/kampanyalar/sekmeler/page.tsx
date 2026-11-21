'use client'

/** STK PRO "Kampanya Sekmeler": tabs campaigns are grouped under, with parent, status, priority and "Açılışta Göster". */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LayoutGrid, PencilLine, Plus, Trash2 } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../../lib/admin-access'
import { Label, inputClass } from '../../../../../components/admin/FormKit'
import { Modal, confirmDialog, toast } from '../../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../../../../../components/admin/ListView'

interface Tab {
  id: string; name: string; slug: string; parent_id: string | null; parent_name: string | null; is_active: boolean
  display_order: number; show_on_open: boolean; campaign_count: number
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-primary-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-[22px]' : 'start-0.5'}`} />
    </button>
  )
}

export default function CampaignTabsPage() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ name: '', parent: '', active: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('campaign-tabs', 25)
  const [editing, setEditing] = useState<Tab | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTabs((await adminGet<Tab[]>('/campaign-tabs')).data) } catch (err) { toast.error(apiErrorMessage(err, 'Sekmeler yüklenemedi')) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => tabs.filter((t) =>
    (!filters.name || t.name.toLocaleLowerCase('tr').includes(filters.name.toLocaleLowerCase('tr')))
    && (!filters.parent || (filters.parent === 'root' ? !t.parent_id : t.parent_id === filters.parent))
    && (!filters.active || String(t.is_active) === filters.active)), [tabs, filters])
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const patch = async (t: Tab, body: Partial<Tab>) => {
    try {
      await adminSend('patch', `/campaign-tabs/${t.id}`, body)
      setTabs((list) => list.map((x) => (x.id === t.id ? { ...x, ...body } : x)))
    } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) }
  }

  const columns: ListColumn<Tab>[] = [
    { key: 'name', header: 'Sekme Adı', filter: { type: 'text', param: 'name' }, render: (t) => <span className="font-bold text-gray-900">{t.name}</span> },
    {
      key: 'parent', header: 'Üst Kategori',
      filter: { type: 'select', param: 'parent', options: [{ value: 'root', label: 'Kök' }, ...tabs.filter((t) => !t.parent_id).map((t) => ({ value: t.id, label: t.name }))] },
      render: (t) => <span className="text-gray-500">{t.parent_name || 'Kök'}</span>,
    },
    { key: 'count', header: 'Kampanya', align: 'right', render: (t) => <span className="tabular-nums">{t.campaign_count}</span> },
    {
      key: 'active', header: 'Durum', filter: { type: 'select', param: 'active', options: [{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Pasif' }] },
      render: (t) => <Switch label="Durum" on={t.is_active} onChange={(v) => patch(t, { is_active: v })} />,
    },
    {
      key: 'order', header: 'Öncelik',
      render: (t) => (
        <input aria-label="Öncelik" defaultValue={t.display_order} inputMode="numeric"
          onBlur={(e) => { const n = Number(e.target.value) || 0; if (n !== t.display_order) patch(t, { display_order: n }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-24 rounded-md border border-gray-200 px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-primary-500" />
      ),
    },
    { key: 'open', header: 'Açılışta Göster', render: (t) => <Switch label="Açılışta göster" on={t.show_on_open} onChange={(v) => patch(t, { show_on_open: v })} /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><LayoutGrid className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Kampanya Sekmeler</h1>
        <button type="button" onClick={() => setEditing('new')} className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Yeni Sekme
        </button>
      </div>
      <ListView storageKey="campaign-tabs" columns={columns} rows={pageRows} total={filtered.length} loading={loading} rowKey={(t) => t.id}
        page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        rowActions={(t) => (
          <>
            <RowAction label="Düzenle" icon={PencilLine} onClick={() => setEditing(t)} />
            <RowAction label="Sil" icon={Trash2} tone="danger" onClick={async () => {
              if (!(await confirmDialog({ title: `"${t.name}" sekmesi silinsin mi?`, text: `${t.campaign_count} kampanya sekmesiz kalır; kampanyalar silinmez.`, danger: true }))) return
              try { await adminSend('delete', `/campaign-tabs/${t.id}`); toast.ok('Sekme silindi'); load() } catch (err) { toast.error(apiErrorMessage(err, 'Silinemedi')) }
            }} />
          </>
        )}
        empty="Henüz sekme yok" />
      {editing && <TabForm tab={editing === 'new' ? undefined : editing} parents={tabs.filter((t) => !t.parent_id && (editing === 'new' || t.id !== editing.id))}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function TabForm({ tab, parents, onClose, onSaved }: { tab?: Tab; parents: Tab[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: tab?.name || '', parent_id: tab?.parent_id || '', display_order: String(tab?.display_order ?? 0),
    is_active: tab?.is_active ?? true, show_on_open: tab?.show_on_open ?? false,
  })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!form.name.trim()) { toast.error('Sekme adını yazın'); return }
    setBusy(true)
    const body = { ...form, name: form.name.trim(), parent_id: form.parent_id || null, display_order: Number(form.display_order) || 0 }
    try {
      if (tab) await adminSend('patch', `/campaign-tabs/${tab.id}`, body)
      else await adminSend('post', '/campaign-tabs', body)
      toast.ok(tab ? 'Sekme kaydedildi' : 'Sekme eklendi')
      onSaved()
    } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) } finally { setBusy(false) }
  }
  return (
    <Modal title={tab ? 'Sekmeyi Düzenle' : 'Yeni Sekme'} onClose={onClose}
      footer={<button type="button" disabled={busy} onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Kaydet</button>}>
      <div className="grid gap-3">
        <Label label="Sekme Adı *"><input className={inputClass} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Label>
        <Label label="Üst Kategori">
          <select className={inputClass} value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">Kök</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Label>
        <Label label="Öncelik"><input type="number" className={inputClass} value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Aktif</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.show_on_open} onChange={(e) => setForm({ ...form, show_on_open: e.target.checked })} /> Bağış sayfası açılırken bu sekme seçili gelsin</label>
      </div>
    </Modal>
  )
}
