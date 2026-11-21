'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Kanban,
  ListTodo,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react'
import { Button, Card, Input } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, useAdminAccess, can } from '../../../../lib/admin-access'
import { Label, TextArea, TextInput, inputClass } from '../../../../components/admin/FormKit'
import { ExportButtons, Modal, PageHeader, StatCard, confirmDialog, toast } from '../../../../components/admin/ui'

interface TaskComment {
  id: string
  user_id: string
  user_name: string
  text: string
  created_at: string
}

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
  donor_id: string | null
  donor_name: string | null
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly'
  comments: TaskComment[]
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

const RECURRENCE_LABELS: Record<Task['recurrence'], string> = {
  none: 'Tekrar Yok',
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Scope = 'mine' | 'created' | 'department' | 'all'
type ViewMode = 'list' | 'kanban' | 'calendar'
type CalSubView = 'month' | 'week' | 'agenda'

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
  donor_id: '',
  recurrence: 'none',
}

export default function TasksPage() {
  const { data: access } = useAdminAccess()
  const isManager = can(access, 'users.manage')
  const canAssign = isManager || can(access, 'operations.manage')

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
  const [donors, setDonors] = useState<{ id: string; label: string }[]>([])

  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [calView, setCalView] = useState<CalSubView>('month')
  const [weekBase, setWeekBase] = useState(() => {
    const d = new Date()
    const offset = (d.getDay() + 6) % 7
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
  })
  const [dayModal, setDayModal] = useState<{ date: Date; tasks: Task[] } | null>(null)

  const [selected, setSelected] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [newCheckItem, setNewCheckItem] = useState('')
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAssignId, setBulkAssignId] = useState('')
  const [quickTitle, setQuickTitle] = useState('')
  const [kanbanQuick, setKanbanQuick] = useState<Record<string, string>>({})
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const [tplOpen, setTplOpen] = useState(false)
  const [editingTplId, setEditingTplId] = useState<string | null>(null)
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
    if (calView === 'week') {
      const end = new Date(weekBase)
      end.setDate(end.getDate() + 6)
      return { start: iso(weekBase), end: iso(end) }
    }
    if (calView === 'agenda') {
      const s = new Date()
      const e = new Date(s.getFullYear(), s.getMonth() + 2, 0)
      return { start: iso(s), end: iso(e) }
    }
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    return { start: iso(month), end: iso(end) }
  }, [view, calView, month, weekBase])

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
    adminGet<{ items?: { id: string; first_name?: string; last_name?: string; company_name?: string; display_name?: string }[] }>('/donors', {
      page_size: 100,
    })
      .then((r) =>
        setDonors(
          (r.data?.items || []).map((d) => ({
            id: d.id,
            label: d.display_name || d.company_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Bağışçı',
          })),
        ),
      )
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
      const payload = {
        title: tplForm.title.trim(),
        description: tplForm.description.trim() || null,
        priority: tplForm.priority,
        category: tplForm.category.trim() || null,
        default_duration_days: Math.max(0, Number(tplForm.default_duration_days) || 1),
        checklist: tplForm.checklistText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }
      if (editingTplId) {
        await adminSend('put', `/tasks/templates/${editingTplId}`, payload)
        toast.ok('Şablon güncellendi')
      } else {
        await adminSend('post', '/tasks/templates', payload)
        toast.ok('Şablon eklendi')
      }
      setEditingTplId(null)
      setTplForm({ title: '', description: '', priority: 'normal', category: '', default_duration_days: '3', checklistText: '' })
      loadTemplates()
    } catch (err) {
      toast.error(apiErrorMessage(err, editingTplId ? 'Şablon güncellenemedi' : 'Şablon eklenemedi'))
    } finally {
      setSavingTpl(false)
    }
  }

  const startEditTemplate = (tpl: Template) => {
    setEditingTplId(tpl.id)
    setTplForm({
      title: tpl.title,
      description: tpl.description || '',
      priority: tpl.priority,
      category: tpl.category || '',
      default_duration_days: String(tpl.default_duration_days),
      checklistText: (tpl.checklist || []).join('\n'),
    })
  }

  const quickCreateTask = async (title: string, colStatus: Task['status'] = 'todo') => {
    const clean = title.trim()
    if (clean.length < 2) return
    try {
      await adminSend('post', '/tasks', {
        title: clean,
        status: colStatus,
        ...(!canAssign && access?.me?.id ? { assigned_to_id: access.me.id } : {}),
      })
      toast.ok('Görev eklendi')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Hızlı görev eklenemedi'))
    }
  }

  const handleBulkAction = async (action: 'status' | 'assign' | 'delete', value?: string) => {
    if (selectedIds.length === 0) return
    if (action === 'delete') {
      const ok = await confirmDialog({
        title: 'Toplu Silme',
        text: `Seçili ${selectedIds.length} görev kalıcı olarak silinsin mi?`,
        confirmLabel: 'Sil',
        danger: true,
      })
      if (!ok) return
    }
    try {
      const res = await adminSend<{ updated: number }>('post', '/tasks/bulk', {
        ids: selectedIds,
        action,
        ...(action === 'status' ? { status: value } : {}),
        ...(action === 'assign' ? { assigned_to_id: value || null } : {}),
      })
      toast.ok(`${res.data?.updated || 0} görev güncellendi`)
      setSelectedIds([])
      setBulkAssignId('')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Toplu işlem başarısız'))
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !commentText.trim()) return
    setSendingComment(true)
    try {
      const res = await adminSend<Task>('post', `/tasks/${selected.id}/comments`, { text: commentText.trim() })
      setSelected(res.data)
      setCommentText('')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Not eklenemedi'))
    } finally {
      setSendingComment(false)
    }
  }

  const downloadIcs = () => {
    const events = filteredTasks.filter((t) => t.start_date || t.due_date)
    if (events.length === 0) {
      toast.error('Takvime aktarılacak tarihli görev yok.')
      return
    }
    const fmt = (d: string) => d.replace(/-/g, '')
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//e-infak//Gorevler//TR',
      ...events.flatMap((t) => {
        const dtStart = fmt(t.start_date || t.due_date!)
        const dtEnd = fmt(t.due_date || t.start_date!)
        const summary = t.title.replace(/[\r\n,;]/g, ' ')
        const desc = (t.description || '').replace(/[\r\n]/g, '\\n')
        return [
          'BEGIN:VEVENT',
          `UID:${t.id}@e-infak`,
          `DTSTART;VALUE=DATE:${dtStart}`,
          `DTEND;VALUE=DATE:${dtEnd}`,
          `SUMMARY:${summary}`,
          ...(desc ? [`DESCRIPTION:${desc}`] : []),
          'END:VEVENT',
        ]
      }),
      'END:VCALENDAR',
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gorevler-${iso(new Date())}.ics`
    a.click()
    URL.revokeObjectURL(url)
    toast.ok(`${events.length} görev .ics olarak indirildi`)
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
        (t.assigned_to_name || '').toLowerCase().includes(term) ||
        (t.donor_name || '').toLowerCase().includes(term),
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

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekBase)
      d.setDate(weekBase.getDate() + i)
      return d
    })
  }, [weekBase])

  const agendaGroups = useMemo(() => {
    const map = new Map<string, Task[]>()
    const dated = [...filteredTasks]
      .filter((t) => t.due_date || t.start_date)
      .sort((a, b) => (a.due_date || a.start_date || '').localeCompare(b.due_date || b.start_date || ''))
    for (const t of dated) {
      const key = t.due_date || t.start_date || ''
      const list = map.get(key) || []
      list.push(t)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [filteredTasks])

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
              <ExportButtons
                filename="gorevler"
                title="Görev Listesi"
                subtitle={`${filteredTasks.length} görev`}
                getData={() => ({
                  headers: ['Başlık', 'Kategori', 'Öncelik', 'Durum', 'Sorumlu', 'Başlangıç', 'Son Tarih'],
                  rows: filteredTasks.map((t) => [
                    t.title,
                    t.category || '',
                    PRIORITY[t.priority].label,
                    STATUS_META[t.status].label,
                    t.assigned_to_name || '',
                    t.start_date ? new Date(t.start_date).toLocaleDateString('tr-TR') : '',
                    t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '',
                  ]),
                })}
              />
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
        <StatCard
          label="Açık Görev"
          value={String(stats.open)}
          tone="neutral"
          icon={ListTodo}
          detail={{
            title: 'Açık Görevler',
            description: `Toplam ${stats.open} tamamlanmamış görev`,
            content: () => {
              const list = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
              return list.length === 0 ? <p className="text-sm text-gray-500">Açık görev yok.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Görev</th><th className="py-2">Durum</th><th className="py-2">Son Tarih</th></tr></thead>
                  <tbody>{list.map((t) => <tr key={t.id} className="border-b"><td className="py-2 font-semibold">{t.title}</td><td className="py-2">{t.status}</td><td className="py-2">{t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '—'}</td></tr>)}</tbody>
                </table>
              )
            },
          }}
        />
        <StatCard
          label="Geciken"
          value={String(stats.overdue)}
          tone="bad"
          icon={AlertTriangle}
          detail={{
            title: 'Geciken Görevler',
            description: `Son tarihi geçmiş ${stats.overdue} görev`,
            content: () => {
              const now = Date.now()
              const list = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && new Date(t.due_date).getTime() < now)
              return list.length === 0 ? <p className="text-sm text-gray-500">Geciken görev yok.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Görev</th><th className="py-2">Öncelik</th><th className="py-2">Son Tarih</th></tr></thead>
                  <tbody>{list.map((t) => <tr key={t.id} className="border-b"><td className="py-2 font-semibold">{t.title}</td><td className="py-2">{t.priority}</td><td className="py-2 text-red-600 font-semibold">{t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '—'}</td></tr>)}</tbody>
                </table>
              )
            },
          }}
        />
        <StatCard
          label="Devam Ediyor"
          value={String(stats.inProgress)}
          tone="brand"
          icon={Clock}
          detail={{
            title: 'Devam Eden Görevler',
            description: `${stats.inProgress} görev aktif işlemde`,
            content: () => {
              const list = tasks.filter((t) => t.status === 'in_progress')
              return list.length === 0 ? <p className="text-sm text-gray-500">Devam eden görev yok.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Görev</th><th className="py-2">Öncelik</th><th className="py-2">Son Tarih</th></tr></thead>
                  <tbody>{list.map((t) => <tr key={t.id} className="border-b"><td className="py-2 font-semibold">{t.title}</td><td className="py-2">{t.priority}</td><td className="py-2">{t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '—'}</td></tr>)}</tbody>
                </table>
              )
            },
          }}
        />
        <StatCard
          label="Tamamlanan"
          value={String(stats.done)}
          tone="good"
          icon={CheckCircle2}
          detail={{
            title: 'Tamamlanan Görevler',
            description: `${stats.done} görev tamamlandı`,
            content: () => {
              const list = tasks.filter((t) => t.status === 'done')
              return list.length === 0 ? <p className="text-sm text-gray-500">Tamamlanan görev yok.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2">Görev</th><th className="py-2">Öncelik</th><th className="py-2">Tarih</th></tr></thead>
                  <tbody>{list.map((t) => <tr key={t.id} className="border-b"><td className="py-2 font-semibold">{t.title}</td><td className="py-2">{t.priority}</td><td className="py-2">{t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '—'}</td></tr>)}</tbody>
                </table>
              )
            },
          }}
        />
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
            <Label label="Bağışçı (opsiyonel)">
              <select className={inputClass} value={form.donor_id} onChange={(e) => setForm({ ...form, donor_id: e.target.value })}>
                <option value="">—</option>
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Label>
            <Label label="Tekrar">
              <select className={inputClass} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Label>
            <div className="sm:col-span-2 lg:col-span-2">
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
            <Card className="border border-slate-200 bg-white p-2 shadow-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-2 pb-2">
                <input
                  type="checkbox"
                  aria-label="Tümünü seç"
                  checked={filteredTasks.length > 0 && selectedIds.length === filteredTasks.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? filteredTasks.map((t) => t.id) : [])}
                  className="accent-emerald-600"
                />
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!quickTitle.trim()) return
                    const t = quickTitle
                    setQuickTitle('')
                    await quickCreateTask(t, 'todo')
                  }}
                >
                  <input
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="Hızlı görev ekle ve Enter'a bas..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs outline-none focus:border-emerald-500 focus:bg-white"
                  />
                  {quickTitle.trim().length >= 2 && (
                    <Button type="submit" size="sm">
                      Ekle
                    </Button>
                  )}
                </form>
              </div>

              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs">
                  <span className="font-semibold text-emerald-900">{selectedIds.length} görev seçili</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) handleBulkAction('status', e.target.value)
                        e.target.value = ''
                      }}
                    >
                      <option value="">Durum değiştir...</option>
                      {Object.entries(STATUS_META).map(([k, m]) => (
                        <option key={k} value={k}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {canAssign && (
                      <div className="flex items-center gap-1">
                        <select
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                          value={bulkAssignId}
                          onChange={(e) => {
                            setBulkAssignId(e.target.value)
                            if (e.target.value) handleBulkAction('assign', e.target.value)
                          }}
                        >
                          <option value="">Personel ata...</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.first_name} {s.last_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleBulkAction('delete')}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      Sil
                    </button>
                    <button type="button" onClick={() => setSelectedIds([])} className="text-slate-500 hover:text-slate-800">
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}

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
                        checked={selectedIds.includes(t.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                        }
                        aria-label="Toplu seçim"
                        className="accent-slate-700"
                      />
                      <input
                        type="checkbox"
                        checked={t.status === 'done'}
                        onChange={() => update(t, { status: t.status === 'done' ? 'todo' : 'done' })}
                        aria-label="Tamamlandı"
                        className="accent-emerald-600"
                      />
                      <button type="button" onClick={() => openTask(t)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate font-semibold text-sm ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                            {t.title}
                          </span>
                          {t.recurrence && t.recurrence !== 'none' && (
                            <span title={RECURRENCE_LABELS[t.recurrence]} className="inline-flex items-center text-emerald-600">
                              <Repeat className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.assigned_to_name || 'Atanmamış'}
                          {t.category ? ` · ${t.category}` : ''}
                          {t.donor_name ? ` · Bağışçı: ${t.donor_name}` : ''}
                          {t.subtasks_total > 0 && ` · ${t.subtasks_done}/${t.subtasks_total} alt görev`}
                          {t.checklist.length > 0 && ` · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length} madde`}
                          {(t.comments?.length || 0) > 0 && ` · ${t.comments.length} not`}
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
                  <Card
                    key={colStatus}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragOverCol !== colStatus) setDragOverCol(colStatus)
                    }}
                    onDragLeave={() => {
                      if (dragOverCol === colStatus) setDragOverCol(null)
                    }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      setDragOverCol(null)
                      const droppedId = e.dataTransfer.getData('text/plain') || dragTaskId
                      setDragTaskId(null)
                      const dragged = tasks.find((x) => x.id === droppedId)
                      if (dragged && dragged.status !== colStatus) {
                        await update(dragged, { status: colStatus })
                      }
                    }}
                    className={`border p-3 space-y-2.5 transition ${
                      dragOverCol === colStatus ? 'border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-200' : 'border-slate-200 bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        {STATUS_META[colStatus].label}
                      </span>
                      <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {colTasks.length}
                      </span>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const val = kanbanQuick[colStatus] || ''
                        if (val.trim().length < 2) return
                        setKanbanQuick((prev) => ({ ...prev, [colStatus]: '' }))
                        await quickCreateTask(val, colStatus)
                      }}
                    >
                      <input
                        value={kanbanQuick[colStatus] || ''}
                        onChange={(e) => setKanbanQuick((prev) => ({ ...prev, [colStatus]: e.target.value }))}
                        placeholder="+ Hızlı ekle (Enter)..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] outline-none focus:border-emerald-500"
                      />
                    </form>
                    <div className="space-y-2">
                      {colTasks.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            setDragTaskId(t.id)
                            e.dataTransfer.setData('text/plain', t.id)
                          }}
                          onDragEnd={() => {
                            setDragTaskId(null)
                            setDragOverCol(null)
                          }}
                          onClick={() => openTask(t)}
                          className={`rounded-xl border bg-white p-3 cursor-grab active:cursor-grabbing transition hover:shadow-sm ${
                            selected?.id === t.id ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-slate-200'
                          } ${dragTaskId === t.id ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={`text-xs font-semibold ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                              {t.title}
                            </span>
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY[t.priority].cls}`}>
                              {PRIORITY[t.priority].label}
                            </span>
                          </div>
                          {(t.donor_name || (t.recurrence && t.recurrence !== 'none')) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                              {t.recurrence && t.recurrence !== 'none' && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-medium">
                                  <Repeat className="w-2.5 h-2.5" />
                                  {RECURRENCE_LABELS[t.recurrence]}
                                </span>
                              )}
                              {t.donor_name && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 truncate max-w-[140px]">
                                  <UserCheck className="w-2.5 h-2.5 shrink-0" />
                                  {t.donor_name}
                                </span>
                              )}
                            </div>
                          )}
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
                        <p className="text-center text-[11px] text-slate-400 py-6">Kartı buraya sürükleyin veya hızlı ekleyin</p>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {view === 'calendar' && (
            <Card className="border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {calView !== 'agenda' && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (calView === 'week') {
                            const d = new Date(weekBase)
                            d.setDate(d.getDate() - 7)
                            setWeekBase(d)
                          } else {
                            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                          }
                        }}
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
                          const offset = (now.getDay() + 6) % 7
                          setWeekBase(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset))
                        }}
                      >
                        Bugün
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (calView === 'week') {
                            const d = new Date(weekBase)
                            d.setDate(d.getDate() + 7)
                            setWeekBase(d)
                          } else {
                            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                          }
                        }}
                      >
                        →
                      </Button>
                    </>
                  )}
                  <strong className="ml-2 text-sm font-bold text-slate-900">
                    {calView === 'month' && `${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
                    {calView === 'week' &&
                      `${weekDays[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    {calView === 'agenda' && 'Yaklaşan Görev Ajandası'}
                  </strong>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                    {([['month', 'Aylık'], ['week', 'Haftalık'], ['agenda', 'Ajanda']] as const).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCalView(k)}
                        className={`rounded-md px-2.5 py-1 font-medium transition ${
                          calView === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={downloadIcs}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Takvime Aktar (.ics)
                  </Button>
                </div>
              </div>

              {calView === 'month' && (
                <>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
                    {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
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
                              {dayTasks.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setDayModal({ date: d, tasks: dayTasks })}
                                  className="text-[10px] font-semibold text-emerald-700 hover:underline"
                                >
                                  +{dayTasks.length - 3} görev daha
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {calView === 'week' && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                  {weekDays.map((d) => {
                    const isToday = iso(d) === iso(new Date())
                    const dayTasks = tasksOn(d)
                    return (
                      <div
                        key={iso(d)}
                        className={`min-h-[220px] rounded-xl border p-2 space-y-1.5 ${
                          isToday ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 bg-slate-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                          <span className={`text-xs font-bold ${isToday ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })}
                          </span>
                          <button
                            type="button"
                            onClick={() => openQuickCreateForDay(d)}
                            title="Bu tarihe görev ekle"
                            className="text-xs font-bold text-emerald-700 px-1 rounded hover:bg-emerald-50"
                          >
                            +
                          </button>
                        </div>
                        <div className="space-y-1">
                          {dayTasks.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => openTask(t)}
                              className={`block w-full rounded-lg border p-1.5 text-left text-[11px] transition hover:shadow-sm ${PRIORITY[t.priority].cls} ${
                                t.status === 'done' ? 'line-through opacity-60' : ''
                              }`}
                            >
                              <div className="font-semibold truncate">{t.title}</div>
                              <div className="text-[10px] opacity-80 truncate">{t.assigned_to_name || 'Atanmamış'}</div>
                            </button>
                          ))}
                          {dayTasks.length === 0 && <div className="py-6 text-center text-[10px] text-slate-400">Görev yok</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {calView === 'agenda' && (
                <div className="space-y-3">
                  {agendaGroups.length === 0 && (
                    <p className="py-10 text-center text-xs text-slate-400">Tarihli görev bulunamadı.</p>
                  )}
                  {agendaGroups.map(([dateKey, groupTasks]) => (
                    <div key={dateKey} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>{new Date(dateKey).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                        <span className="text-[11px] font-normal text-slate-500">{groupTasks.length} görev</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {groupTasks.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => openTask(t)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50/70"
                          >
                            <div className="min-w-0">
                              <div className={`text-xs font-semibold truncate ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                {t.title}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {t.assigned_to_name || 'Atanmamış'}
                                {t.donor_name ? ` · ${t.donor_name}` : ''}
                              </div>
                            </div>
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY[t.priority].cls}`}>
                              {PRIORITY[t.priority].label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              <Label label="Tekrar">
                <select
                  className={inputClass}
                  value={selected.recurrence || 'none'}
                  onChange={(e) => update(selected, { recurrence: e.target.value as Task['recurrence'] })}
                >
                  {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Label>
              <Label label="Bağışçı">
                <div className="flex items-center gap-1.5">
                  <select
                    className={inputClass}
                    value={selected.donor_id || ''}
                    onChange={(e) => update(selected, { donor_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {donors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {selected.donor_id && (
                    <Link
                      href={`/admin/bagiscilar/${selected.donor_id}`}
                      title="Bağışçı kartına git"
                      className="shrink-0 rounded-lg border border-slate-200 p-2 text-emerald-700 hover:bg-emerald-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
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

            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                Notlar & Yorumlar ({selected.comments?.length || 0})
              </div>
              {(selected.comments || []).length > 0 && (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {(selected.comments || []).map((c) => (
                    <li key={c.id} className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-700">{c.user_name}</span>
                        <span>{new Date(c.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                      <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{c.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleAddComment} className="flex gap-1.5">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Görev notu ekle..."
                  className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500"
                />
                <Button type="submit" size="sm" variant="outline" disabled={sendingComment || !commentText.trim()}>
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </form>
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

      {dayModal && (
        <Modal
          title={`${dayModal.date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
          description={`Bu güne ait ${dayModal.tasks.length} görev listeleniyor.`}
          onClose={() => setDayModal(null)}
          size="md"
        >
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {dayModal.tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setDayModal(null)
                  openTask(t)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                    {t.title}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {STATUS_META[t.status].label} · {t.assigned_to_name || 'Atanmamış'}
                  </div>
                </div>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY[t.priority].cls}`}>
                  {PRIORITY[t.priority].label}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {tplOpen && (
        <Modal
          title="Görev Şablonları"
          description="Sık tekrarlanan işler için hazır görev ve kontrol listesi şablonları oluşturun."
          onClose={() => {
            setTplOpen(false)
            setEditingTplId(null)
            setTplForm({ title: '', description: '', priority: 'normal', category: '', default_duration_days: '3', checklistText: '' })
          }}
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditTemplate(tpl)}
                          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                          title="Şablonu düzenle"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                          title="Şablonu sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveTemplate} className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700">
                  {editingTplId ? 'Şablonu Düzenle' : 'Yeni Şablon Ekle'}
                </div>
                {editingTplId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTplId(null)
                      setTplForm({ title: '', description: '', priority: 'normal', category: '', default_duration_days: '3', checklistText: '' })
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    Düzenlemeyi İptal Et
                  </button>
                )}
              </div>
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
                  {savingTpl ? 'Kaydediliyor...' : editingTplId ? 'Şablonu Güncelle' : 'Şablon Ekle'}
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
