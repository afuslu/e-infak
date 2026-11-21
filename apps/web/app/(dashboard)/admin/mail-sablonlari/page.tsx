'use client'

/** STK PRO "Mail Şablonları". */
import { useCallback, useEffect, useState } from 'react'
import { MailPlus, PencilLine, Plus, Trash2 } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { Modal, confirmDialog, toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction, usePageSize } from '../../../../components/admin/ListView'

interface Template { id: string; name: string; subject: string; body: string; is_active: boolean; updated_at: string }

export default function MailTemplatesPage() {
  const [rows, setRows] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({ name: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('mail-templates', 25)
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows((await adminGet<Template[]>('/mail/templates')).data) } catch (err) { toast.error(apiErrorMessage(err, 'Şablonlar yüklenemedi')) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const filtered = rows.filter((t) => !filters.name || `${t.name} ${t.subject}`.toLocaleLowerCase('tr').includes(filters.name.toLocaleLowerCase('tr')))
  const columns: ListColumn<Template>[] = [
    { key: 'name', header: 'Şablon Adı', filter: { type: 'text', param: 'name' }, render: (t) => <span className="font-bold text-gray-900">{t.name}</span> },
    { key: 'subject', header: 'Konu', render: (t) => t.subject },
    { key: 'body', header: 'Metin', render: (t) => <span className="line-clamp-1 max-w-[360px] text-gray-500">{t.body}</span> },
    { key: 'active', header: 'Durum', render: (t) => (t.is_active ? 'Aktif' : 'Pasif') },
    { key: 'updated', header: 'Son Değişiklik', render: (t) => new Date(t.updated_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) },
  ]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><MailPlus className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Mail Şablonları</h1>
        <button type="button" onClick={() => setEditing('new')} className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Yeni Şablon</button>
      </div>
      <ListView storageKey="mail-templates" columns={columns} rows={filtered.slice((page - 1) * pageSize, page * pageSize)} total={filtered.length} loading={loading}
        rowKey={(t) => t.id} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters} onApplyFilters={(f) => { setFilters(f); setPage(1) }}
        rowActions={(t) => (
          <>
            <RowAction label="Düzenle" icon={PencilLine} onClick={() => setEditing(t)} />
            <RowAction label="Sil" icon={Trash2} tone="danger" onClick={async () => {
              if (!(await confirmDialog({ title: `"${t.name}" silinsin mi?`, danger: true }))) return
              try { await adminSend('delete', `/mail/templates/${t.id}`); load() } catch (err) { toast.error(apiErrorMessage(err, 'Silinemedi')) }
            }} />
          </>
        )}
        empty="Henüz şablon yok" />
      {editing && <TemplateForm template={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function TemplateForm({ template, onClose, onSaved }: { template?: Template; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: template?.name || '', subject: template?.subject || '', body: template?.body || '', is_active: template?.is_active ?? true })
  const save = async () => {
    try {
      if (template) await adminSend('put', `/mail/templates/${template.id}`, form)
      else await adminSend('post', '/mail/templates', form)
      toast.ok('Şablon kaydedildi')
      onSaved()
    } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) }
  }
  return (
    <Modal title={template ? 'Şablonu Düzenle' : 'Yeni Şablon'} size="lg" onClose={onClose}
      footer={<button type="button" onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Kaydet</button>}>
      <div className="grid gap-3">
        <Label label="Şablon Adı *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Label>
        <Label label="Konu *"><input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Label>
        <Label label="Metin *" hint="Değişkenler: {ad}, {ad_soyad}, {kurum}. Paragrafları boş satırla ayırın.">
          <textarea className={`${inputClass} min-h-[200px]`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Aktif</label>
      </div>
    </Modal>
  )
}
