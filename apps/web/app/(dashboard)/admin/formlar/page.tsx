'use client'

/** STK PRO Web Sitesi → "Form": build forms for the site and read their answers. */
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, FileSpreadsheet, FormInput, Inbox, PencilLine, Plus, Trash2 } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage, exportXlsx } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { Modal, confirmDialog, toast } from '../../../../components/admin/ui'
import { type ListColumn, ListView, RowAction } from '../../../../components/admin/ListView'

type FieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox'
interface Field { key?: string; label: string; type: FieldType; required: boolean; placeholder?: string | null; options: string[] }
interface Form {
  id: string; title: string; slug: string; description: string | null; fields: Field[]; submit_label: string | null
  success_message: string | null; notify_email: string | null; is_active: boolean; submissions: number; unread: number; updated_at: string
}
const TYPES: [FieldType, string][] = [
  ['text', 'Kısa metin'], ['textarea', 'Uzun metin'], ['email', 'E-posta'], ['phone', 'Telefon'], ['number', 'Sayı'],
  ['date', 'Tarih'], ['select', 'Açılır liste'], ['radio', 'Tek seçim'], ['checkbox', 'Onay kutusu'],
]

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Form | 'new' | null>(null)
  const [answers, setAnswers] = useState<Form | null>(null)
  const load = useCallback(async () => {
    try { setForms((await adminGet<Form[]>('/site-forms')).data) } catch (err) { toast.error(apiErrorMessage(err, 'Formlar yüklenemedi')) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const columns: ListColumn<Form>[] = [
    { key: 'title', header: 'Form Adı', render: (f) => <span className="font-bold text-gray-900">{f.title}</span> },
    { key: 'slug', header: 'Adres', render: (f) => <span className="font-mono text-[12px] text-gray-500">/form/{f.slug}</span> },
    { key: 'fields', header: 'Alan', align: 'right', render: (f) => f.fields.length },
    { key: 'subs', header: 'Yanıt', align: 'right', render: (f) => <span>{f.submissions}{f.unread ? <span className="ms-1.5 rounded bg-primary-600 px-1.5 text-[11px] font-bold text-white">{f.unread} yeni</span> : null}</span> },
    { key: 'active', header: 'Durum', render: (f) => (f.is_active ? 'Yayında' : 'Kapalı') },
  ]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><FormInput className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Formlar</h1>
        <button type="button" onClick={() => setEditing('new')} className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Yeni Form</button>
      </div>
      <p className="text-[13px] text-gray-500">Form sitede /form/adres sayfasında yayınlanır. Bağlantıyı menüye veya site yapıcıdaki bir düğmeye ekleyebilirsiniz.</p>
      <ListView storageKey="site-forms" columns={columns} rows={forms} total={forms.length} loading={loading} rowKey={(f) => f.id}
        page={1} pageSize={100} onPage={() => {}} onPageSize={() => {}} filters={{}} onApplyFilters={() => {}}
        rowActions={(f) => (
          <>
            <RowAction label="Yanıtlar" icon={Inbox} tone="success" onClick={() => setAnswers(f)} />
            <RowAction label="Sitede gör" icon={Eye} href={`/form/${f.slug}`} />
            <RowAction label="Bağlantıyı kopyala" icon={Copy} onClick={() => navigator.clipboard.writeText(`${window.location.origin}/form/${f.slug}`).then(() => toast.ok('Kopyalandı'), () => toast.error('Kopyalanamadı'))} />
            <RowAction label="Düzenle" icon={PencilLine} onClick={() => setEditing(f)} />
            <RowAction label="Sil" icon={Trash2} tone="danger" onClick={async () => {
              if (!(await confirmDialog({ title: `"${f.title}" silinsin mi?`, text: `${f.submissions} yanıt da silinir.`, danger: true }))) return
              try { await adminSend('delete', `/site-forms/${f.id}`); load() } catch (err) { toast.error(apiErrorMessage(err, 'Silinemedi')) }
            }} />
          </>
        )}
        empty="Henüz form yok" />
      {editing && <FormEditor form={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {answers && <Answers form={answers} onClose={() => { setAnswers(null); load() }} />}
    </div>
  )
}

function FormEditor({ form, onClose, onSaved }: { form?: Form; onClose: () => void; onSaved: () => void }) {
  const [state, setState] = useState({
    title: form?.title || '', slug: form?.slug || '', description: form?.description || '', submit_label: form?.submit_label || '',
    success_message: form?.success_message || '', notify_email: form?.notify_email || '', is_active: form?.is_active ?? true,
  })
  const [fields, setFields] = useState<Field[]>(form?.fields || [{ label: 'Ad Soyad', type: 'text', required: true, options: [] }, { label: 'Telefon', type: 'phone', required: true, options: [] }])
  const [busy, setBusy] = useState(false)
  const setField = (i: number, patch: Partial<Field>) => setFields((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const move = (i: number, d: -1 | 1) => setFields((list) => { const n = [...list]; const t = i + d; if (t < 0 || t >= n.length) return n; [n[i], n[t]] = [n[t], n[i]]; return n })
  const save = async () => {
    if (!state.title.trim() || !fields.length) { toast.error('Form adı ve en az bir alan gerekli'); return }
    setBusy(true)
    try {
      const body = { ...state, slug: state.slug || null, fields }
      if (form) await adminSend('put', `/site-forms/${form.id}`, body)
      else await adminSend('post', '/site-forms', body)
      toast.ok('Form kaydedildi')
      onSaved()
    } catch (err) { toast.error(apiErrorMessage(err, 'Kaydedilemedi')) } finally { setBusy(false) }
  }
  return (
    <Modal title={form ? 'Formu Düzenle' : 'Yeni Form'} size="lg" onClose={onClose}
      footer={<button type="button" disabled={busy} onClick={save} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Kaydet</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label label="Form Adı *"><input className={inputClass} value={state.title} onChange={(e) => setState({ ...state, title: e.target.value })} /></Label>
        <Label label="Adres (slug)" hint="Boşsa addan üretilir"><input className={inputClass} value={state.slug} onChange={(e) => setState({ ...state, slug: e.target.value })} /></Label>
        <div className="sm:col-span-2"><Label label="Açıklama"><textarea className={`${inputClass} min-h-[60px]`} value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} /></Label></div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-[13px] font-bold text-gray-700">Alanlar</div>
        {fields.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_150px_auto]">
            <input className={inputClass} placeholder="Alan adı" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} aria-label="Alan adı" />
            <select className={inputClass} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })} aria-label="Alan türü">
              {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <label className="me-2 flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Zorunlu</label>
              <button type="button" aria-label="Yukarı" onClick={() => move(i, -1)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Aşağı" onClick={() => move(i, 1)} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" aria-label="Sil" onClick={() => setFields((l) => l.filter((_, j) => j !== i))} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            {(f.type === 'select' || f.type === 'radio') && (
              <input className={`${inputClass} sm:col-span-3`} placeholder="Seçenekler (virgülle)" value={f.options.join(', ')}
                onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} aria-label="Seçenekler" />
            )}
          </div>
        ))}
        <button type="button" onClick={() => setFields((l) => [...l, { label: '', type: 'text', required: false, options: [] }])} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-700 hover:underline"><Plus className="h-4 w-4" /> Alan ekle</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Label label="Gönder düğmesi"><input className={inputClass} placeholder="Gönder" value={state.submit_label} onChange={(e) => setState({ ...state, submit_label: e.target.value })} /></Label>
        <Label label="Bildirim e-postası" hint="Her yanıt bu adrese de gönderilir"><input type="email" className={inputClass} value={state.notify_email} onChange={(e) => setState({ ...state, notify_email: e.target.value })} /></Label>
        <div className="sm:col-span-2"><Label label="Teşekkür mesajı"><input className={inputClass} placeholder="Teşekkürler, bilgileriniz alındı." value={state.success_message} onChange={(e) => setState({ ...state, success_message: e.target.value })} /></Label></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.is_active} onChange={(e) => setState({ ...state, is_active: e.target.checked })} /> Sitede yayında</label>
      </div>
    </Modal>
  )
}

function Answers({ form, onClose }: { form: Form; onClose: () => void }) {
  const [data, setData] = useState<{ total: number; fields: Field[]; items: { id: string; data: Record<string, unknown>; read: boolean; created_at: string }[] } | null>(null)
  const load = useCallback(() => { adminGet<NonNullable<typeof data>>(`/site-forms/${form.id}/submissions`, { page_size: 500 }).then((r) => setData(r.data)).catch(() => {}) }, [form.id])
  useEffect(() => { load() }, [load])
  const show = (v: unknown) => (v === true ? 'Evet' : v === false ? 'Hayır' : v == null || v === '' ? '—' : String(v))
  const exportAll = () => data && exportXlsx(`${form.slug}-yanitlar.xlsx`, form.title, ['Tarih', ...data.fields.map((f) => f.label)],
    data.items.map((r) => [new Date(r.created_at).toLocaleString('tr-TR'), ...data.fields.map((f) => show(r.data[f.key || '']))]))
  return (
    <Modal title={`${form.title} — Yanıtlar`} description={data ? `${data.total} yanıt` : undefined} size="lg" onClose={onClose}
      footer={<button type="button" onClick={exportAll} disabled={!data?.items.length} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" /> Excel</button>}>
      {!data ? <div className="h-32 animate-pulse rounded bg-slate-100" /> : (
        <ul className="max-h-[480px] space-y-2 overflow-auto">
          {data.items.map((r) => (
            <li key={r.id} className={`rounded-xl border p-3 text-[13px] ${r.read ? 'border-gray-100' : 'border-primary-200 bg-primary-50/40'}`}>
              <div className="mb-1 flex items-center text-[12px] text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}
                <button type="button" onClick={async () => { await adminSend('delete', `/site-forms/${form.id}/submissions/${r.id}`).catch(() => {}); load() }} className="ms-auto text-rose-600 hover:underline">Sil</button>
              </div>
              <dl className="grid grid-cols-[minmax(100px,auto)_1fr] gap-x-3 gap-y-1">
                {data.fields.map((f) => <div key={f.key} className="contents"><dt className="text-gray-500">{f.label}</dt><dd className="break-words font-medium text-gray-900">{show(r.data[f.key || ''])}</dd></div>)}
              </dl>
            </li>
          ))}
          {!data.items.length && <li className="py-8 text-center text-gray-400">Henüz yanıt yok.</li>}
        </ul>
      )}
    </Modal>
  )
}
