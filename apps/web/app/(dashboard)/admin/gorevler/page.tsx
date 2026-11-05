'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, Notice, TextArea, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'

interface Task {
  id: string
  title: string
  description: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  category: string | null
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  start_date: string | null
  due_date: string | null
  overdue: boolean
  assigned_to_id: string | null
  assigned_to_name: string | null
  department_id: string | null
  checklist: { text: string; done: boolean }[]
  created_by_id: string
  created_by_name: string | null
  subtasks_total: number
  subtasks_done: number
}
interface Template { id: string; title: string; description: string | null; priority: string; category: string | null; default_duration_days: number; checklist: string[] }

const PRIORITY: Record<Task['priority'], { label: string; cls: string }> = {
  urgent: { label: 'Acil', cls: 'border-red-300 bg-red-50 text-red-700' },
  high: { label: 'Yüksek', cls: 'border-orange-200 bg-orange-50 text-orange-700' },
  normal: { label: 'Normal', cls: 'border-gray-200 bg-gray-50 text-gray-700' },
  low: { label: 'Düşük', cls: 'border-gray-200 bg-white text-gray-500' },
}
const STATUS: Record<Task['status'], string> = { todo: 'Yapılacak', in_progress: 'Devam ediyor', done: 'Tamamlandı', cancelled: 'İptal' }
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Scope = 'mine' | 'created' | 'department' | 'all'

export default function TasksPage() {
  const { data: access } = useAdminAccess()
  const isManager = hasPermission(access, 'user_manage')
  const canAssign = isManager || hasPermission(access, 'operations_manage')
  const [scope, setScope] = useState<Scope>('mine')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [status, setStatus] = useState('open')
  const [tasks, setTasks] = useState<Task[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [staff, setStaff] = useState<{ id: string; first_name: string; last_name: string; is_active: boolean }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ template_id: '', title: '', description: '', priority: 'normal', category: '', start_date: '', due_date: '', assigned_to_id: '', department_id: '' })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const range = useMemo(() => {
    if (view !== 'calendar') return {}
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    return { start: iso(month), end: iso(end) }
  }, [view, month])

  const load = async () => {
    try {
      setTasks((await adminGet<Task[]>('/tasks', { scope, status: view === 'calendar' ? undefined : status || undefined, ...range })).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Görevler yüklenemedi') })
    }
  }
  useEffect(() => { load() }, [scope, status, view, range])
  useEffect(() => {
    adminGet<Template[]>('/tasks/templates').then((r) => setTemplates(r.data)).catch(() => {})
    adminGet<any[]>('/users').then((r) => setStaff(r.data.filter((u) => u.is_active))).catch(() => {})
    adminGet<any[]>('/departments').then((r) => setDepartments(r.data)).catch(() => {})
  }, [])

  const openTask = async (t: Task) => {
    setSelected(t)
    try {
      setSubtasks((await adminGet<Task[]>('/tasks', { scope: 'all', parent_task_id: t.id })).data)
    } catch {
      setSubtasks([])
    }
  }

  const create = async (e: React.FormEvent, parent?: Task) => {
    e.preventDefault()
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '').map(([k, v]) => [k, v]))
    if (!canAssign) delete (body as Record<string, unknown>).assigned_to_id
    try {
      await adminSend('post', '/tasks', { ...body, ...(parent ? { parent_task_id: parent.id } : {}),
        ...(!body.assigned_to_id && !canAssign ? { assigned_to_id: access?.me.id } : {}) })
      setShowForm(false)
      setForm({ template_id: '', title: '', description: '', priority: 'normal', category: '', start_date: '', due_date: '', assigned_to_id: '', department_id: '' })
      setMessage({ type: 'ok', text: parent ? 'Alt görev eklendi' : 'Görev oluşturuldu' })
      if (parent) await openTask(parent)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const update = async (t: Task, patch: Partial<Task>) => {
    try {
      const res = await adminSend<Task>('put', `/tasks/${t.id}`, patch)
      if (selected?.id === t.id) setSelected(res.data)
      await load()
      if (selected && selected.id !== t.id) await openTask(selected)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const remove = async (t: Task) => {
    if (!window.confirm(`"${t.title}" silinsin mi?`)) return
    try {
      await adminSend('delete', `/tasks/${t.id}`)
      setSelected(null)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const addTemplate = async () => {
    const title = window.prompt('Şablon adı (ör. Kurban kesim hazırlığı)')
    if (!title) return
    const checklist = window.prompt('Kontrol listesi maddeleri (virgülle ayırın)', '') || ''
    const days = Number(window.prompt('Varsayılan süre (gün)', '3')) || 1
    try {
      await adminSend('post', '/tasks/templates', { title, checklist: checklist.split(',').map((s) => s.trim()).filter(Boolean), default_duration_days: days })
      setTemplates((await adminGet<Template[]>('/tasks/templates')).data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    }
  }

  const days = useMemo(() => {
    const first = new Date(month)
    const offset = (first.getDay() + 6) % 7 // Monday first
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  }, [month])

  const tasksOn = (d: Date) => tasks.filter((t) => (t.due_date || t.start_date) === iso(d))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-gray-900">Görevler & Takvim</h1>
        <div className="flex gap-2">
          {isManager && <button className={ghostButton} onClick={addTemplate}>+ Şablon</button>}
          <button className={primaryButton} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Vazgeç' : '+ Görev'}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-white p-1 text-sm font-semibold">
          {([['mine', 'Bana atanan'], ['created', 'Oluşturduğum'], ['department', 'Birimim'], ['all', isManager ? 'Tümü' : 'İlgili olanlar']] as [Scope, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)} className={`rounded-md px-3 py-1.5 ${scope === k ? 'bg-primary-600 text-white' : 'text-gray-600'}`}>{l}</button>
          ))}
        </div>
        <div className="flex rounded-lg border bg-white p-1 text-sm font-semibold">
          {([['list', 'Liste'], ['calendar', 'Takvim']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 ${view === k ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>{l}</button>
          ))}
        </div>
        {view === 'list' && (
          <select className={`${inputClass} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Açık görevler</option><option value="done">Tamamlanan</option><option value="">Tümü</option>
          </select>
        )}
      </div>

      <Notice message={message} />

      {showForm && (
        <Card className="border border-primary-100 p-6 shadow-sm">
          <form onSubmit={(e) => create(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Label label="Şablon">
              <select className={inputClass} value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                <option value="">— Şablonsuz</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </Label>
            <div className="sm:col-span-2"><TextInput label="Başlık" required={!form.template_id} value={form.title} onChange={(v) => setForm({ ...form, title: v })} /></div>
            <Label label="Derece">
              <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Label>
            <TextInput label="Başlangıç" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <TextInput label="Bitiş" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            {canAssign && (
              <Label label="Atanan personel">
                <select className={inputClass} value={form.assigned_to_id} onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })}>
                  <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                </select>
              </Label>
            )}
            <Label label="Birim">
              <select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Label>
            <TextInput label="Kategori" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            <div className="sm:col-span-2 lg:col-span-3"><TextArea label="Açıklama" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} /></div>
            <div className="flex justify-end sm:col-span-2 lg:col-span-4"><button type="submit" className={primaryButton}>Oluştur</button></div>
          </form>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className={selected ? 'xl:col-span-7' : 'xl:col-span-12'}>
          {view === 'list' ? (
            <Card className="border border-gray-100 p-2 shadow-sm">
              <ul className="divide-y divide-gray-100">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input type="checkbox" checked={t.status === 'done'} onChange={() => update(t, { status: t.status === 'done' ? 'todo' : 'done' })} aria-label="Tamamlandı" />
                    <button onClick={() => openTask(t)} className="min-w-0 flex-1 text-left">
                      <div className={`truncate font-semibold ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.title}</div>
                      <div className="text-xs text-gray-500">
                        {t.assigned_to_name || 'Atanmamış'}{t.category ? ` · ${t.category}` : ''}
                        {t.subtasks_total > 0 && ` · ${t.subtasks_done}/${t.subtasks_total} alt görev`}
                      </div>
                    </button>
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                    {t.due_date && <span className={`text-xs ${t.overdue ? 'font-bold text-red-600' : 'text-gray-500'}`}>{new Date(t.due_date).toLocaleDateString('tr-TR')}</span>}
                  </li>
                ))}
                {tasks.length === 0 && <li className="py-10 text-center text-xs text-gray-400">Görev yok.</li>}
              </ul>
            </Card>
          ) : (
            <Card className="border border-gray-100 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <button className={ghostButton} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
                <strong>{MONTHS[month.getMonth()]} {month.getFullYear()}</strong>
                <button className={ghostButton} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-gray-400">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {days.map((d, i) => (
                  <div key={i} className={`min-h-[86px] rounded-lg border p-1 ${d && iso(d) === iso(new Date()) ? 'border-primary-400' : 'border-gray-100'} ${d ? 'bg-white' : 'bg-transparent border-transparent'}`}>
                    {d && (
                      <>
                        <div className="text-right text-[10px] text-gray-400">{d.getDate()}</div>
                        {tasksOn(d).slice(0, 3).map((t) => (
                          <button key={t.id} onClick={() => openTask(t)} className={`mb-0.5 block w-full truncate rounded border px-1 text-left text-[10px] ${PRIORITY[t.priority].cls} ${t.status === 'done' ? 'line-through opacity-60' : ''}`}>
                            {t.title}
                          </button>
                        ))}
                        {tasksOn(d).length > 3 && <div className="text-[10px] text-gray-400">+{tasksOn(d).length - 3}</div>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {selected && (
          <Card className="space-y-3 border border-gray-100 p-5 shadow-sm xl:col-span-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{selected.title}</div>
                <div className="text-xs text-gray-500">Oluşturan: {selected.created_by_name} · Atanan: {selected.assigned_to_name || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-xl text-gray-400">✕</button>
            </div>
            {selected.description && <p className="whitespace-pre-line text-sm text-gray-700">{selected.description}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Label label="Durum">
                <select className={inputClass} value={selected.status} onChange={(e) => update(selected, { status: e.target.value as Task['status'] })}>
                  {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Label>
              <Label label="Derece">
                <select className={inputClass} value={selected.priority} onChange={(e) => update(selected, { priority: e.target.value as Task['priority'] })}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Label>
              <TextInput label="Bitiş" type="date" value={selected.due_date || ''} onChange={(v) => update(selected, { due_date: v || null })} />
              {canAssign && (
                <Label label="Atanan">
                  <select className={inputClass} value={selected.assigned_to_id || ''} onChange={(e) => update(selected, { assigned_to_id: e.target.value || null })}>
                    <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </Label>
              )}
            </div>
            {selected.checklist.length > 0 && (
              <ul className="space-y-1">
                {selected.checklist.map((item, i) => (
                  <li key={i}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={item.done} onChange={() => update(selected, {
                        checklist: selected.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)),
                      })} />
                      <span className={item.done ? 'text-gray-400 line-through' : ''}>{item.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t pt-3">
              <div className="mb-2 text-xs font-bold text-gray-600">Alt görevler</div>
              <ul className="space-y-1 text-sm">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={s.status === 'done'} onChange={() => update(s, { status: s.status === 'done' ? 'todo' : 'done' })} />
                    <span className={s.status === 'done' ? 'text-gray-400 line-through' : ''}>{s.title}</span>
                    <span className="text-xs text-gray-400">{s.assigned_to_name}</span>
                  </li>
                ))}
              </ul>
              <SubtaskForm staff={staff} canAssign={canAssign} onAdd={async (title, assigned) => {
                try {
                  await adminSend('post', '/tasks', { title, parent_task_id: selected.id, ...(assigned ? { assigned_to_id: assigned } : {}) })
                  await openTask(selected)
                  await load()
                } catch (err) {
                  setMessage({ type: 'error', text: apiErrorMessage(err) })
                }
              }} />
            </div>
            <div className="flex justify-end"><button className={`${ghostButton} text-red-600`} onClick={() => remove(selected)}>Sil</button></div>
          </Card>
        )}
      </div>
    </div>
  )
}

function SubtaskForm({ staff, canAssign, onAdd }: {
  staff: { id: string; first_name: string; last_name: string }[]
  canAssign: boolean
  onAdd: (title: string, assigned: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [assigned, setAssigned] = useState('')
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (title) { await onAdd(title, assigned); setTitle('') } }} className="mt-2 flex gap-2">
      <input className={inputClass} placeholder="Alt görev ekle" value={title} onChange={(e) => setTitle(e.target.value)} />
      {canAssign && (
        <select className={`${inputClass} w-40`} value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Alt görev sorumlusu">
          <option value="">Personel</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
        </select>
      )}
      <button type="submit" className={ghostButton}>Ekle</button>
    </form>
  )
}
