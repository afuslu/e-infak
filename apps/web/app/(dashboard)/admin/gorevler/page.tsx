'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Kanban,
  ListTodo,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, exportCsv, hasPermission, useAdminAccess } from '../../../../lib/admin-access'
import { Label, TextArea, TextInput, inputClass } from '../../../../components/admin/FormKit'
import { Modal, PageHeader, StatCard, confirmDialog, toast } from '../../../../components/admin/ui'

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

interface Template {
  id: string
  title: string
  description: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  category: string | null
  default_duration_days: number
  checklist: string[]
}

const PRIORITY: Record<Task['priority'], { label: string; cls: string }> = {
  urgent: { label: 'Acil', cls: 'border-rose-300 bg-rose-50 text-rose-700' },
  high: { label: 'Yüksek', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  normal: { label: 'Normal', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
  low: { label: 'Düşük', cls: 'border-slate-200 bg-white text-slate-500' },
}

const STATUS_META: Record<Task['status'], { label: string; cls: string }> = {
  todo: { label: 'Yapılacak', cls: 'border-slate-200 bg-slate-100 text-slate-700' },
  in_progress: { label: 'Devam Ediyor', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  done: { label: 'Tamamlandı', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'İptal', cls: 'border-rose-200 bg-rose-50 text-rose-600' },
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Scope = 'mine' | 'created' | 'department' | 'all'
type ViewMode = 'list' | 'kanban' | 'calendar'

const EMPTY_FORM = {
  template_id: '',
  title: '',
  description: '',
  priority: 'normal',
  category: '',
  start_date: '',
  due_date: '',
  assigned_to_id: '',
  department_id: '',
}

export default function TasksPage() {
  const { data: access } = useAdminAccess()
  const isManager = hasPermission(access, 'user_manage')
  const canAssign = isManager || hasPermission(access, 'operations_manage')

  const [scope, setScope] = useState<Scope>('mine')
  const [view, setView] = useState<ViewMode>('list')
  const [status, setStatus] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [search, setSearch] = useState('')

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [staff, setStaff] = useState<{ id: string; first_name: string; last_name: string; is_active: boolean }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])

  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const [selected, setSelected] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [newCheckItem, setNewCheckItem] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const [tplOpen, setTplOpen] = useState(false)
  const [tplForm, setTplForm] = useState({
    title: '',
    description: '',
    priority: 'normal' as Task['priority'],
    category: '',
    default_duration_days: '3',
    checklistText: '',
  })
  const [savingTpl, setSavingTpl] = useState(false)

  const range = useMemo(() => {
    if (view !== 'calendar') return {}
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    return { start: iso(month), end: iso(end) }
  }, [view, month])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const effectiveStatus = view === 'list' ? (status || undefined) : undefined
      const res = await adminGet<Task[]>('/tasks', {
        scope,
        status: effectiveStatus,
        priority: priorityFilter || undefined,
        assigned_to: assigneeFilter || undefined,
        ...range,
      })
      setTasks(res.data || [])
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Görevler yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [scope, status, view, priorityFilter, assigneeFilter, range])

  useEffect(() => {
    load()
  }, [load])

  const loadTemplates = useCallback(() => {
    adminGet<Template[]>('/tasks/templates').then((r) => setTemplates(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    loadTemplates()
    adminGet<{ id: string; first_name: string; last_name: string; is_active: boolean }[]>('/users')
      .then((r) => setStaff((r.data || []).filter((u) => u.is_active)))
      .catch(() => {})
    adminGet<{ id: string; name: string }[]>('/departments')
      .then((r) => setDepartments(r.data || []))
      .catch(() => {})
  }, [loadTemplates])

  const syncSelectedFields = (t: Task) => {
    setEditTitle(t.title)
    setEditDesc(t.description || '')
    setEditCategory(t.category || '')
  }

  const openTask = async (t: Task) => {
    setSelected(t)
    syncSelectedFields(t)
    setNewCheckItem('')
    try {
      const res = await adminGet<Task[]>('/tasks', { scope: 'all', parent_task_id: t.id })
      setSubtasks(res.data || [])
    } catch {
      setSubtasks([])
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '').map(([k, v]) => [k, v]))
    if (!canAssign) delete (body as Record<string, unknown>).assigned_to_id
    setCreating(true)
    try {
      await adminSend('post', '/tasks', {
        ...body,
        ...(!body.assigned_to_id && !canAssign ? { assigned_to_id: access?.me.id } : {}),
      })
      setShowForm(false)
      setForm(EMPTY_FORM)
      toast.ok('Görev oluşturuldu')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Görev oluşturulamadı'))
    } finally {
      setCreating(false)
    }
  }

  const update = async (t: Task, patch: Partial<Task>) => {
    try {
      const res = await adminSend<Task>('put', `/tasks/${t.id}`, patch)
      if (selected?.id === t.id) {
        setSelected(res.data)
        syncSelectedFields(res.data)
      }
      await load()
      if (selected && selected.id !== t.id) await openTask(selected)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Görev güncellenemedi'))
    }
  }

  const remove = async (t: Task) => {
    const ok = await confirmDialog({
      title: 'Görevi Sil',
      text: `"${t.title}" görevi kalıcı olarak silinsin mi?`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return
    try {
      await adminSend('delete', `/tasks/${t.id}`)
      toast.ok('Görev silindi')
      if (selected?.id === t.id) setSelected(null)
      else if (selected) await openTask(selected)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Görev silinemedi'))
    }
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tplForm.title.trim()) {
      toast.error('Şablon adı zorunludur.')
      return
    }
    setSavingTpl(true)
    try {
      await adminSend('post', '/tasks/templates', {
        title: tplForm.title.trim(),
        description: tplForm.description.trim() || null,
        priority: tplForm.priority,
        category: tplForm.category.trim() || null,
        default_duration_days: Math.max(0, Number(tplForm.default_duration_days) || 1),
        checklist: tplForm.checklistText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      })
      toast.ok('Şablon eklendi')
      setTplForm({ title: '', description: '', priority: 'normal', category: '', default_duration_days: '3', checklistText: '' })
      loadTemplates()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Şablon eklenemedi'))
    } finally {
      setSavingTpl(false)
    }
  }

  const handleDeleteTemplate = async (tpl: Template) => {
    const ok = await confirmDialog({
      title: 'Şablonu Sil',
      text: `"${tpl.title}" şablonu silinsin mi?`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok) return
    try {
      await adminSend('delete', `/tasks/templates/${tpl.id}`)
      toast.ok('Şablon silindi')
      loadTemplates()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Şablon silinemedi'))
    }
  }

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tasks
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        (t.description || '').toLowerCase().includes(term) ||
        (t.category || '').toLowerCase().includes(term) ||
        (t.assigned_to_name || '').toLowerCase().includes(term),
    )
  }, [tasks, search])

  const stats = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status === 'todo' || t.status === 'in_progress').length
    const overdue = filteredTasks.filter((t) => t.overdue).length
    const inProgress = filteredTasks.filter((t) => t.status === 'in_progress').length
    const done = filteredTasks.filter((t) => t.status === 'done').length
    return { open, overdue, inProgress, done }
  }, [filteredTasks])

  const days = useMemo(() => {
    const first = new Date(month)
    const offset = (first.getDay() + 6) % 7
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [
      ...Array(offset).fill(null),
      ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ]
  }, [month])

  const tasksOn = (d: Date) => {
    const key = iso(d)
    return filteredTasks.filter((t) => {
      const start = t.start_date || t.due_date
      const end = t.due_date || t.start_date
      if (!start || !end) return false
      return key >= start && key <= end
    })
  }

  const openQuickCreateForDay = (d: Date) => {
    const dayIso = iso(d)
    setForm({ ...EMPTY_FORM, start_date: dayIso, due_date: dayIso })
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Görevler & Takvim"
        description="Ekip görevlerini planlayın, alt görev ve kontrol listeleriyle takip edin, takvim ve pano üzerinde yönetin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {filteredTasks.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportCsv(
                    'gorevler.csv',
                    ['Başlık', 'Kategori', 'Öncelik', 'Durum', 'Sorumlu', 'Başlangıç', 'Son Tarih'],
                    filteredTasks.map((t) => [
                      t.title,
                      t.category || '',
                      PRIORITY[t.priority].label,
                      STATUS_META[t.status].label,
                      t.assigned_to_name || '',
                      t.start_date ? new Date(t.start_date).toLocaleDateString('tr-TR') : '',
                      t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '',
                    ]),
                  )
                }
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                CSV
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {isManager && (
              <Button type="button" variant="outline" size="sm" onClick={() => setTplOpen(true)}>
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Şablonlar ({templates.length})
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? (
                <>
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Vazgeç
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Yeni Görev
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Açık Görev" value={String(stats.open)} tone="neutral" icon={ListTodo} />
        <StatCard label="Geciken" value={String(stats.overdue)} tone="bad" icon={AlertTriangle} />
        <StatCard label="Devam Ediyor" value={String(stats.inProgress)} tone="brand" icon={Clock} />
        <StatCard label="Tamamlanan" value={String(stats.done)} tone="good" icon={CheckCircle2} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
          {([
            ['mine', 'Bana atanan'],
            ['created', 'Oluşturduğum'],
            ['department', 'Birimim'],
            ['all', isManager ? 'Tümü' : 'İlgili olanlar'],
          ] as [Scope, string][]).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={`rounded-md px-3 py-1.5 transition ${scope === k ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 transition ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Liste
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 transition ${view === 'kanban' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Kanban className="w-3.5 h-3.5" />
            Pano
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 transition ${view === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Takvim
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Görev, kategori veya sorumlu ara..."
            className="pl-8 h-9 text-xs"
          />
        </div>

        {view === 'list' && (
          <select className={`${inputClass} w-36 h-9 text-xs`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Açık görevler</option>
            <option value="todo">Yapılacak</option>
            <option value="in_progress">Devam ediyor</option>
            <option value="done">Tamamlanan</option>
            <option value="cancelled">İptal</option>
            <option value="">Tümü</option>
          </select>
        )}

        <select className={`${inputClass} w-32 h-9 text-xs`} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">Tüm Öncelikler</option>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>

        {canAssign && (
          <select className={`${inputClass} w-36 h-9 text-xs`} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">Tüm Personel</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {showForm && (
        <Card className="border border-emerald-200 bg-white p-5 shadow-sm">
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Label label="Şablon">
              <select className={inputClass} value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                <option value="">— Şablonsuz</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Label>
            <div className="sm:col-span-2">
              <TextInput label="Başlık" required={!form.template_id} value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            </div>
            <Label label="Derece">
              <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Label>
            <TextInput label="Başlangıç" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <TextInput label="Bitiş" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            {canAssign && (
              <Label label="Atanan personel">
                <select className={inputClass} value={form.assigned_to_id} onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })}>
                  <option value="">—</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </Label>
            )}
            <Label label="Birim">
              <select className={inputClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Label>
            <TextInput label="Kategori" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextArea label="Açıklama" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Vazgeç
              </Button>
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? 'Oluşturuluyor...' : 'Oluştur'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <div className={selected ? 'xl:col-span-7' : 'xl:col-span-12'}>
          {view === 'list' && (
            <Card className="border border-slate-200 bg-white p-2 shadow-sm">
              {loading && filteredTasks.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500 animate-pulse">Görevler yükleniyor...</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredTasks.map((t) => (
                    <li
                      key={t.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${selected?.id === t.id ? 'bg-emerald-50/40' : 'hover:bg-slate-50/60'}`}
                    >
                      <input
                        type="checkbox"
                        checked={t.status === 'done'}
                        onChange={() => update(t, { status: t.status === 'done' ? 'todo' : 'done' })}
                        aria-label="Tamamlandı"
                        className="accent-emerald-600"
                      />
                      <button type="button" onClick={() => openTask(t)} className="min-w-0 flex-1 text-left">
                        <div className={`truncate font-semibold text-sm ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                          {t.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.assigned_to_name || 'Atanmamış'}
                          {t.category ? ` · ${t.category}` : ''}
                          {t.subtasks_total > 0 && ` · ${t.subtasks_done}/${t.subtasks_total} alt görev`}
                          {t.checklist.length > 0 && ` · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length} madde`}
                        </div>
                      </button>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[t.status].cls}`}>
                        {STATUS_META[t.status].label}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${PRIORITY[t.priority].cls}`}>
                        {PRIORITY[t.priority].label}
                      </span>
                      {t.due_date && (
                        <span className={`text-xs tabular-nums ${t.overdue ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                          {new Date(t.due_date).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                    </li>
                  ))}
                  {!loading && filteredTasks.length === 0 && (
                    <li className="py-10 text-center text-xs text-slate-400">Kriterlere uygun görev yok.</li>
                  )}
                </ul>
              )}
            </Card>
          )}

          {view === 'kanban' && (
            <div className="grid gap-4 md:grid-cols-3">
              {(['todo', 'in_progress', 'done'] as const).map((colStatus) => {
                const colTasks = filteredTasks.filter((t) => t.status === colStatus)
                return (
                  <Card key={colStatus} className="border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        {STATUS_META[colStatus].label}
                      </span>
                      <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {colTasks.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => openTask(t)}
                          className={`rounded-xl border bg-white p-3 cursor-pointer transition hover:shadow-sm ${
                            selected?.id === t.id ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={`text-xs font-semibold ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                              {t.title}
                            </span>
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY[t.priority].cls}`}>
                              {PRIORITY[t.priority].label}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="truncate">{t.assigned_to_name || 'Atanmamış'}</span>
                            {t.due_date && (
                              <span className={t.overdue ? 'font-semibold text-rose-600' : ''}>
                                {new Date(t.due_date).toLocaleDateString('tr-TR')}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {colStatus !== 'todo' && (
                              <button
                                type="button"
                                onClick={() => update(t, { status: colStatus === 'done' ? 'in_progress' : 'todo' })}
                                className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 px-1.5 py-0.5 rounded bg-slate-100"
                              >
                                ← Geri
                              </button>
                            )}
                            {colStatus !== 'done' && (
                              <button
                                type="button"
                                onClick={() => update(t, { status: colStatus === 'todo' ? 'in_progress' : 'done' })}
                                className="text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded bg-emerald-50"
                              >
                                {colStatus === 'todo' ? 'Başla →' : 'Tamamla ✓'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <p className="text-center text-[11px] text-slate-400 py-6">Görev yok</p>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {view === 'calendar' && (
            <Card className="border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const now = new Date()
                      setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                    }}
                  >
                    Bugün
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  >
                    →
                  </Button>
                </div>
                <strong className="text-sm font-bold text-slate-900">
                  {MONTHS[month.getMonth()]} {month.getFullYear()}
                </strong>
                <span className="text-[11px] text-slate-400">Güne tıklayıp görev ekleyin</span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {days.map((d, i) => {
                  const isToday = d && iso(d) === iso(new Date())
                  const dayTasks = d ? tasksOn(d) : []
                  return (
                    <div
                      key={i}
                      className={`min-h-[92px] rounded-lg border p-1 group ${
                        isToday ? 'border-emerald-500 bg-emerald-50/20' : d ? 'border-slate-200 bg-white' : 'bg-transparent border-transparent'
                      }`}
                    >
                      {d && (
                        <>
                          <div className="flex items-center justify-between mb-0.5">
                            <button
                              type="button"
                              onClick={() => openQuickCreateForDay(d)}
                              title="Bu tarihe görev ekle"
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-emerald-700 font-bold px-1 rounded hover:bg-emerald-50"
                            >
                              +
                            </button>
                            <span className={`text-[10px] font-semibold ${isToday ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {d.getDate()}
                            </span>
                          </div>
                          {dayTasks.slice(0, 3).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => openTask(t)}
                              className={`mb-0.5 block w-full truncate rounded border px-1 text-left text-[10px] ${PRIORITY[t.priority].cls} ${
                                t.status === 'done' ? 'line-through opacity-60' : ''
                              }`}
                            >
                              {t.title}
                            </button>
                          ))}
                          {dayTasks.length > 3 && <div className="text-[10px] text-slate-400">+{dayTasks.length - 3}</div>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {selected && (
          <Card className="space-y-4 border border-slate-200 bg-white p-5 shadow-sm xl:col-span-5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-400">
                  Oluşturan: {selected.created_by_name} · Atanan: {selected.assigned_to_name || '—'}
                </div>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    if (editTitle.trim() && editTitle.trim() !== selected.title) {
                      update(selected, { title: editTitle.trim() })
                    }
                  }}
                  className="mt-1 w-full text-base font-bold text-slate-900 border-b border-transparent focus:border-emerald-500 outline-none bg-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
              <textarea
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={() => {
                  if ((editDesc || '') !== (selected.description || '')) {
                    update(selected, { description: editDesc.trim() || null })
                  }
                }}
                placeholder="Görev açıklaması..."
                className="w-full rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Label label="Durum">
                <select
                  className={inputClass}
                  value={selected.status}
                  onChange={(e) => update(selected, { status: e.target.value as Task['status'] })}
                >
                  {Object.entries(STATUS_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Label>
              <Label label="Derece">
                <select
                  className={inputClass}
                  value={selected.priority}
                  onChange={(e) => update(selected, { priority: e.target.value as Task['priority'] })}
                >
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Label>
              <TextInput
                label="Başlangıç"
                type="date"
                value={selected.start_date || ''}
                onChange={(v) => update(selected, { start_date: v || null })}
              />
              <TextInput
                label="Bitiş"
                type="date"
                value={selected.due_date || ''}
                onChange={(v) => update(selected, { due_date: v || null })}
              />
              {canAssign && (
                <Label label="Atanan">
                  <select
                    className={inputClass}
                    value={selected.assigned_to_id || ''}
                    onChange={(e) => update(selected, { assigned_to_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </option>
                    ))}
                  </select>
                </Label>
              )}
              <Label label="Birim">
                <select
                  className={inputClass}
                  value={selected.department_id || ''}
                  onChange={(e) => update(selected, { department_id: e.target.value || null })}
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kategori</label>
              <Input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                onBlur={() => {
                  if ((editCategory || '') !== (selected.category || '')) {
                    update(selected, { category: editCategory.trim() || null })
                  }
                }}
                placeholder="Örn: Saha, Finans, Lojistik"
                className="h-8 text-xs"
              />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="text-xs font-bold text-slate-700">Kontrol Listesi</div>
              {selected.checklist.length > 0 && (
                <ul className="space-y-1.5">
                  {selected.checklist.map((item, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() =>
                            update(selected, {
                              checklist: selected.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c)),
                            })
                          }
                          className="accent-emerald-600"
                        />
                        <span className={item.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{item.text}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          update(selected, {
                            checklist: selected.checklist.filter((_, j) => j !== i),
                          })
                        }
                        className="text-slate-400 hover:text-rose-600"
                        title="Maddeyi sil"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newCheckItem.trim()) return
                  update(selected, {
                    checklist: [...selected.checklist, { text: newCheckItem.trim(), done: false }],
                  })
                  setNewCheckItem('')
                }}
                className="flex gap-1.5"
              >
                <Input
                  value={newCheckItem}
                  onChange={(e) => setNewCheckItem(e.target.value)}
                  placeholder="Kontrol listesi maddesi ekle..."
                  className="h-8 text-xs"
                />
                <Button type="submit" variant="outline" size="sm">
                  Ekle
                </Button>
              </form>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 text-xs font-bold text-slate-700">Alt Görevler</div>
              <ul className="space-y-1.5 text-xs">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={s.status === 'done'}
                        onChange={() => update(s, { status: s.status === 'done' ? 'todo' : 'done' })}
                        className="accent-emerald-600"
                      />
                      <span className={`truncate ${s.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {s.title}
                      </span>
                      {s.assigned_to_name && <span className="text-[11px] text-slate-400">({s.assigned_to_name})</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      className="text-slate-400 hover:text-rose-600 shrink-0"
                      title="Alt görevi sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <SubtaskForm
                staff={staff}
                canAssign={canAssign}
                onAdd={async (title, assigned) => {
                  try {
                    await adminSend('post', '/tasks', {
                      title,
                      parent_task_id: selected.id,
                      ...(assigned ? { assigned_to_id: assigned } : {}),
                    })
                    await openTask(selected)
                    await load()
                  } catch (err) {
                    toast.error(apiErrorMessage(err, 'Alt görev eklenemedi'))
                  }
                }}
              />
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => remove(selected)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Görevi Sil
              </Button>
            </div>
          </Card>
        )}
      </div>

      {tplOpen && (
        <Modal
          title="Görev Şablonları"
          description="Sık tekrarlanan işler için hazır görev ve kontrol listesi şablonları oluşturun."
          onClose={() => setTplOpen(false)}
          size="lg"
        >
          <div className="space-y-5">
            {templates.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">Kayıtlı Şablonlar</div>
                <div className="divide-y rounded-lg border border-slate-200">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{tpl.title}</div>
                        <div className="text-slate-500">
                          {PRIORITY[tpl.priority]?.label || tpl.priority} · {tpl.default_duration_days} gün · {tpl.checklist.length} kontrol maddesi
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                        title="Şablonu sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveTemplate} className="space-y-3 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold text-slate-700">Yeni Şablon Ekle</div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Şablon adı *"
                  value={tplForm.title}
                  onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })}
                  required
                />
                <Input
                  placeholder="Kategori (opsiyonel)"
                  value={tplForm.category}
                  onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  className={inputClass}
                  value={tplForm.priority}
                  onChange={(e) => setTplForm({ ...tplForm, priority: e.target.value as Task['priority'] })}
                >
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      Öncelik: {v.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  placeholder="Varsayılan süre (gün)"
                  value={tplForm.default_duration_days}
                  onChange={(e) => setTplForm({ ...tplForm, default_duration_days: e.target.value })}
                />
              </div>
              <textarea
                rows={3}
                placeholder="Kontrol listesi maddeleri (her satıra bir madde yazın)"
                value={tplForm.checklistText}
                onChange={(e) => setTplForm({ ...tplForm, checklistText: e.target.value })}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={savingTpl}>
                  {savingTpl ? 'Ekleniyor...' : 'Şablon Ekle'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SubtaskForm({
  staff,
  canAssign,
  onAdd,
}: {
  staff: { id: string; first_name: string; last_name: string }[]
  canAssign: boolean
  onAdd: (title: string, assigned: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [assigned, setAssigned] = useState('')
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (title.trim()) {
          await onAdd(title.trim(), assigned)
          setTitle('')
        }
      }}
      className="mt-2 flex gap-1.5"
    >
      <input
        className={`${inputClass} h-8 text-xs`}
        placeholder="Alt görev ekle..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {canAssign && (
        <select
          className={`${inputClass} w-36 h-8 text-xs`}
          value={assigned}
          onChange={(e) => setAssigned(e.target.value)}
          aria-label="Alt görev sorumlusu"
        >
          <option value="">Personel</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" variant="outline" size="sm">
        Ekle
      </Button>
    </form>
  )
}
