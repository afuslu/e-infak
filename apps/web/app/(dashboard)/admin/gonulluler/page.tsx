'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, Clock, Copy, MessageSquare, PhoneCall, Plus, Save, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react'
import { Card } from '@e-infak/ui'
import { adminGet, adminSend, apiErrorMessage, can, useAdminAccess, whatsappUrl } from '../../../../lib/admin-access'
import { GlobalStatCard } from '../../../../components/admin/muhasebe/OnMuhasebeUI'
import { Label, Notice, TextInput, ghostButton, inputClass, primaryButton } from '../../../../components/admin/FormKit'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { ExportButtons, Modal, PageHeader, WhatsAppIcon, confirmDialog } from '../../../../components/admin/ui'

interface Application {
  id: string
  full_name: string
  phone: string
  email: string | null
  city: string | null
  areas: string[]
  availability: string | null
  message: string | null
  status: 'new' | 'contacted' | 'accepted' | 'rejected'
  staff_notes: string | null
  created_at: string
}

const STATUS: Record<Application['status'], { label: string; cls: string }> = {
  new: { label: 'Yeni', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  contacted: { label: 'Görüşüldü', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  accepted: { label: 'Kabul', cls: 'border-green-200 bg-green-50 text-green-700' },
  rejected: { label: 'Uygun değil', cls: 'border-gray-200 bg-gray-100 text-gray-600' },
}

const AREAS = ['Kumanya / gıda dağıtımı', 'Kurban organizasyonu', 'Eğitim / öğrenci', 'Etkinlik & organizasyon', 'Sosyal medya / tasarım', 'Saha ziyareti', 'Diğer']
const PAGE_SIZE = 20
const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
]
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'G'
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
function avatarTone(name: string) {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return AVATAR_TONES[sum % AVATAR_TONES.length]
}

const emptyNewApp = {
  full_name: '',
  phone: '',
  email: '',
  city: '',
  availability: '',
  message: '',
  status: 'new' as Application['status'],
  staff_notes: '',
  areas: [] as string[],
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={`${label || value} kopyala`}
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
      }}
      className="inline-flex items-center rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export default function AdminVolunteersPage() {
  const router = useRouter()
  const { data: access } = useAdminAccess()
  const canSms = can(access, 'sms.send')
  const canBulkSms = can(access, 'sms.bulk')

  const [items, setItems] = useState<Application[]>([])
  const [status, setStatus] = useState<string>('')
  const [filters, setFilters] = useState({ q: '', area: '', city: '', date_start: '', date_end: '', sort: 'newest' })
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Application | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<Application['status']>('contacted')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newForm, setNewForm] = useState(emptyNewApp)
  const [crmLinks, setCrmLinks] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const data = (await adminGet<Application[]>('/volunteers', {
        q: filters.q.trim() || undefined,
        city: filters.city.trim() || undefined,
        date_start: filters.date_start || undefined,
        date_end: filters.date_end || undefined,
        sort: filters.sort || 'newest',
      })).data
      setItems(data)
      setPicked(new Set())
      if (selected) {
        const fresh = data.find((d) => d.id === selected.id)
        if (fresh) setSelected(fresh)
      }
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Başvurular yüklenemedi') })
    }
  }

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      load()
      return
    }
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.city, filters.date_start, filters.date_end, filters.sort])

  const allAreas = useMemo(() => {
    const set = new Set<string>()
    items.forEach((a) => (a.areas || []).forEach((ar) => set.add(ar)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [items])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '': items.length, new: 0, contacted: 0, accepted: 0, rejected: 0 }
    items.forEach((a) => {
      counts[a.status] = (counts[a.status] || 0) + 1
    })
    return counts
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (status && a.status !== status) return false
      if (filters.area && !(a.areas || []).includes(filters.area)) return false
      return true
    })
  }, [items, status, filters.area])

  const activeFilterCount = [filters.area, filters.city, filters.date_start, filters.date_end].filter(Boolean).length
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const open = (app: Application) => {
    setSelected(app)
    setNotes(app.staff_notes || '')
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }

  const update = async (app: Application, newStatus: Application['status'], okText = 'Başvuru güncellendi') => {
    setBusy(true)
    try {
      const res = await adminSend<Application>('put', `/volunteers/${app.id}`, {
        status: newStatus,
        staff_notes: notes || null,
      })
      setSelected(res.data)
      setMessage({ type: 'ok', text: okText })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (app: Application) => {
    const ok = await confirmDialog({
      title: `"${app.full_name}" başvurusu silinsin mi?`,
      text: 'Bu işlem geri alınamaz.',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await adminSend('delete', `/volunteers/${app.id}`)
      setSelected(null)
      setMessage({ type: 'ok', text: 'Başvuru silindi' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const sendToCrm = async (app: Application) => {
    setBusy(true)
    try {
      const res = await adminSend<{ donor_id: string; created: boolean }>('post', `/volunteers/${app.id}/to-crm`)
      setCrmLinks((prev) => ({ ...prev, [app.id]: res.data.donor_id }))
      setMessage({
        type: 'ok',
        text: res.data.created
          ? 'Gönüllü CRM’e yeni kişi olarak eklendi ("Gönüllü" etiketiyle).'
          : 'Mevcut CRM kaydıyla eşleştirildi ve "Gönüllü" etiketi eklendi.',
      })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const applyBulkStatus = async () => {
    if (!picked.size) return
    const ok = await confirmDialog({
      title: `${picked.size} başvurunun durumu "${STATUS[bulkStatus].label}" yapılsın mı?`,
      text: 'Seçili başvuruların durumu toplu olarak güncellenecek.',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await adminSend<{ updated: number }>('post', '/volunteers/bulk-status', {
        ids: [...picked],
        status: bulkStatus,
      })
      setMessage({ type: 'ok', text: `${res.data.updated} başvuru güncellendi` })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const applyBulkDelete = async () => {
    if (!picked.size) return
    const ok = await confirmDialog({
      title: `${picked.size} başvuru silinsin mi?`,
      text: 'Seçili gönüllü başvuruları kalıcı olarak silinecek.',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await adminSend<{ deleted: number }>('post', '/volunteers/bulk-delete', { ids: [...picked] })
      if (selected && picked.has(selected.id)) setSelected(null)
      setMessage({ type: 'ok', text: `${res.data.deleted} başvuru silindi` })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const sendBulkSms = () => {
    const phones = Array.from(new Set(
      items
        .filter((a) => picked.has(a.id) && a.phone)
        .map((a) => a.phone.trim())
        .filter(Boolean)
    ))
    if (!phones.length) {
      setMessage({ type: 'error', text: 'Seçili başvurularda telefon numarası yok' })
      return
    }
    try {
      sessionStorage.setItem('broadcast_prefill_numbers', phones.join('\n'))
    } catch { /* ignore */ }
    router.push('/admin/broadcast?kind=numbers')
  }

  const createManual = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await adminSend<Application>('post', '/volunteers', {
        full_name: newForm.full_name,
        phone: newForm.phone,
        email: newForm.email || null,
        city: newForm.city || null,
        availability: newForm.availability || null,
        message: newForm.message || null,
        status: newForm.status,
        staff_notes: newForm.staff_notes || null,
        areas: newForm.areas,
      })
      setCreateOpen(false)
      setNewForm(emptyNewApp)
      setMessage({ type: 'ok', text: `${res.data.full_name} gönüllü başvurusu eklendi` })
      await load()
      open(res.data)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gönüllü Başvuruları"
        description={<>Başvurular sitedeki /gonullu formundan gelir; manuel ekleme de yapabilirsiniz.</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCreateOpen(true)} className={primaryButton}>
              <Plus className="mr-1 inline h-4 w-4" /> Yeni Başvuru
            </button>
            {filtered.length > 0 && (
              <ExportButtons
                filename="gonullu-basvurulari"
                title="Gönüllü Başvuruları"
                subtitle={`${filtered.length} başvuru`}
                getData={() => ({
                  headers: ['Ad Soyad', 'Telefon', 'E-posta', 'Şehir', 'Alanlar', 'Uygunluk', 'Mesaj', 'Durum', 'Personel Notu', 'Tarih'],
                  rows: filtered.map((a) => [
                    a.full_name,
                    a.phone,
                    a.email || '',
                    a.city || '',
                    a.areas.join(', '),
                    a.availability || '',
                    a.message || '',
                    STATUS[a.status].label,
                    a.staff_notes || '',
                    new Date(a.created_at).toLocaleDateString('tr-TR'),
                  ]),
                })}
              />
            )}
            <Link
              href="/admin/bagiscilar"
              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50"
            >
              Bağışçı / CRM →
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlobalStatCard
          title="Toplam Başvuru"
          value={statusCounts[''].toLocaleString('tr-TR')}
          subtitle="Tüm kayıtlı başvurular"
          gradient="from-slate-600 to-slate-700"
          icon={<Users className="h-5 w-5" />}
          selected={status === ''}
          onClick={() => { setStatus(''); setPage(1) }}
        />
        <GlobalStatCard
          title="Yeni Bekleyen"
          value={statusCounts.new.toLocaleString('tr-TR')}
          subtitle="Henüz dönüş yapılmamış"
          gradient="from-sky-600 to-blue-700"
          icon={<Clock className="h-5 w-5" />}
          selected={status === 'new'}
          onClick={() => { setStatus('new'); setPage(1) }}
        />
        <GlobalStatCard
          title="Görüşüldü"
          value={statusCounts.contacted.toLocaleString('tr-TR')}
          subtitle="İletişim kurulmuş"
          gradient="from-amber-500 to-orange-600"
          icon={<PhoneCall className="h-5 w-5" />}
          selected={status === 'contacted'}
          onClick={() => { setStatus('contacted'); setPage(1) }}
        />
        <GlobalStatCard
          title="Kabul Edilen"
          value={statusCounts.accepted.toLocaleString('tr-TR')}
          subtitle="Aktif gönüllü havuzu"
          gradient="from-emerald-600 to-teal-700"
          icon={<CheckCircle2 className="h-5 w-5" />}
          selected={status === 'accepted'}
          onClick={() => { setStatus('accepted'); setPage(1) }}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          {[
            { key: '', label: 'Tümü' },
            ...(Object.keys(STATUS) as Application['status'][]).map((k) => ({ key: k, label: STATUS[k].label })),
          ].map((tab) => {
            const active = status === tab.key
            return (
              <button
                key={tab.key || 'all'}
                type="button"
                onClick={() => { setStatus(tab.key); setPage(1) }}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                  {statusCounts[tab.key] ?? 0}
                </span>
              </button>
            )
          })}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} w-52`}
              placeholder="Ad, telefon, e-posta, şehir..."
              value={filters.q}
              onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1) }}
            />
            <select
              className={`${inputClass} w-36`}
              value={filters.sort}
              onChange={(e) => { setFilters({ ...filters, sort: e.target.value }); setPage(1) }}
            >
              <option value="newest">En yeni</option>
              <option value="oldest">En eski</option>
              <option value="name">Ad Soyad</option>
            </select>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                showFilters ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Gelişmiş Filtreler</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Label label="İlgi Alanı">
                <select className={inputClass} value={filters.area} onChange={(e) => { setFilters({ ...filters, area: e.target.value }); setPage(1) }}>
                  <option value="">Tüm alanlar</option>
                  {allAreas.map((ar) => <option key={ar} value={ar}>{ar}</option>)}
                </select>
              </Label>
              <TextInput label="Şehir" placeholder="Örn: İstanbul" value={filters.city} onChange={(v) => { setFilters({ ...filters, city: v }); setPage(1) }} />
              <TextInput label="Başvuru Başlangıç" type="date" value={filters.date_start} onChange={(v) => { setFilters({ ...filters, date_start: v }); setPage(1) }} />
              <TextInput label="Başvuru Bitiş" type="date" value={filters.date_end} onChange={(v) => { setFilters({ ...filters, date_end: v }); setPage(1) }} />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setFilters({ q: '', area: '', city: '', date_start: '', date_end: '', sort: 'newest' }); setPage(1) }}
                className="cursor-pointer text-xs font-semibold text-rose-600 hover:underline"
              >
                Filtreleri temizle
              </button>
            </div>
          </div>
        )}

        {picked.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-xs">
            <span className="font-bold text-primary-900">{picked.size} başvuru seçildi</span>
            <div className="flex flex-wrap items-center gap-2">
              {canBulkSms && (
                <button
                  type="button"
                  onClick={sendBulkSms}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 font-semibold text-white hover:bg-primary-700"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Seçilenlere Toplu SMS
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <select
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as Application['status'])}
                >
                  {(Object.keys(STATUS) as Application['status'][]).map((k) => (
                    <option key={k} value={k}>{STATUS[k].label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={applyBulkStatus}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Durumu Güncelle
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={applyBulkDelete}
                className="cursor-pointer rounded-lg border border-rose-200 bg-white px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Seçilenleri Sil
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className="cursor-pointer font-semibold text-gray-500 hover:text-gray-800">
                Temizle
              </button>
            </div>
          </div>
        )}
      </div>

      <Notice message={message} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="border border-gray-100 p-4 shadow-sm lg:col-span-7">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">Eşleşen gönüllü başvurusu bulunamadı.</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between border-b border-gray-100 px-2 pb-2 text-xs text-gray-500">
                <label className="flex cursor-pointer items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every((a) => picked.has(a.id))}
                    onChange={(e) => {
                      const ids = pageItems.map((a) => a.id)
                      setPicked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) ids.forEach((id) => next.add(id))
                        else ids.forEach((id) => next.delete(id))
                        return next
                      })
                    }}
                  />
                  <span>Sayfadakileri seç</span>
                </label>
                <span>{filtered.length} başvuru</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {pageItems.map((app) => (
                  <li key={app.id}>
                    <div
                      onClick={() => open(app)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 text-left transition hover:bg-gray-50 ${
                        selected?.id === app.id ? 'bg-primary-50/70' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(app.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => setPicked((p) => { const n = new Set(p); n.has(app.id) ? n.delete(app.id) : n.add(app.id); return n })}
                      />
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTone(app.full_name)}`}>
                        {initials(app.full_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900">{app.full_name}</div>
                        <div className="truncate text-xs text-gray-500">
                          {[app.city, app.areas.join(', ')].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs text-gray-400">
                        {new Date(app.created_at).toLocaleDateString('tr-TR')}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS[app.status].cls}`}>
                        {STATUS[app.status].label}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {filtered.length > PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-gray-500">
                  <span>Sayfa {page} / {totalPages} ({filtered.length} başvuru)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Önceki
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        <div ref={detailRef} className="lg:sticky lg:top-4 lg:col-span-5">
        {selected ? (
          <Card className="space-y-4 border border-gray-100 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarTone(selected.full_name)}`}>
                  {initials(selected.full_name)}
                </span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selected.full_name}</h2>
                  <p className="text-xs text-gray-400">Başvuru: {new Date(selected.created_at).toLocaleString('tr-TR')}</p>
                </div>
              </div>
              <button
                type="button"
                title="Başvuruyu Sil"
                disabled={busy}
                onClick={() => remove(selected)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1">
                <a href={`tel:${selected.phone}`} className="font-semibold text-primary-700 hover:underline">{selected.phone}</a>
                <CopyButton value={selected.phone} label="Telefon" />
              </span>
              {selected.email && (
                <span className="inline-flex items-center gap-1">
                  · <a href={`mailto:${selected.email}`} className="text-primary-700 hover:underline">{selected.email}</a>
                  <CopyButton value={selected.email} label="E-posta" />
                </span>
              )}
              {(() => {
                const wa = whatsappUrl(selected.phone, `Merhaba ${selected.full_name}, gönüllü başvurunuz hakkında iletişime geçiyoruz.`)
                return wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 py-0.5 text-xs font-semibold text-[#128C7E] hover:bg-[#25D366]/20"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : null
              })()}
              {canSms && selected.phone && (
                <button
                  type="button"
                  onClick={() => setSmsOpen(true)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> SMS Gönder
                </button>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-gray-500">Şehir</dt>
              <dd className="col-span-2">{selected.city || '—'}</dd>
              <dt className="text-gray-500">Uygunluk</dt>
              <dd className="col-span-2">{selected.availability || '—'}</dd>
              <dt className="text-gray-500">Alanlar</dt>
              <dd className="col-span-2 flex flex-wrap gap-1.5">
                {selected.areas.length > 0
                  ? selected.areas.map((ar) => (
                      <span key={ar} className="rounded-full border border-primary-200 bg-primary-50/70 px-2.5 py-0.5 text-xs font-semibold text-primary-800">{ar}</span>
                    ))
                  : '—'}
              </dd>
            </dl>

            {selected.message && (
              <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{selected.message}</p>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-600">
                Personel notu
                <textarea rows={3} className={`${inputClass} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => update(selected, selected.status, 'Personel notu kaydedildi')}
                  className={ghostButton}
                >
                  <Save className="mr-1 inline h-3.5 w-3.5" /> Notu Kaydet
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => sendToCrm(selected)}
                  className={primaryButton}
                >
                  <UserPlus className="mr-1 inline h-3.5 w-3.5" /> CRM&apos;e Aktar
                </button>
                {crmLinks[selected.id] && (
                  <Link
                    href={`/admin/bagiscilar?donor=${crmLinks[selected.id]}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    CRM Kartına Git →
                  </Link>
                )}
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-bold text-gray-500">Başvuru Durumu</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS) as Application['status'][]).map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => update(selected, s)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold ${STATUS[s].cls} ${
                      selected.status === s ? 'ring-2 ring-primary-600 ring-offset-1' : ''
                    }`}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-200 p-10 text-center text-gray-400 shadow-none">
            <Users className="h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Detayları görmek için soldan bir başvuru seçin</p>
          </Card>
        )}
        </div>
      </div>

      {smsOpen && selected && (
        <QuickSmsDialog
          title={`${selected.full_name} — Gönüllü SMS`}
          target={{ name: selected.full_name, phone: selected.phone }}
          onClose={() => setSmsOpen(false)}
          onSent={(res) => { setSmsOpen(false); setMessage({ type: 'ok', text: sentNotice(res) }) }}
        />
      )}

      {createOpen && (
        <Modal title="Yeni Gönüllü Başvurusu Ekle" size="lg" onClose={() => setCreateOpen(false)}>
          <form onSubmit={createManual} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Ad Soyad" required value={newForm.full_name} onChange={(v) => setNewForm({ ...newForm, full_name: v })} />
              <TextInput label="Telefon" required type="tel" value={newForm.phone} onChange={(v) => setNewForm({ ...newForm, phone: v })} />
              <TextInput label="E-posta" type="email" value={newForm.email} onChange={(v) => setNewForm({ ...newForm, email: v })} />
              <TextInput label="Şehir" value={newForm.city} onChange={(v) => setNewForm({ ...newForm, city: v })} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-gray-600">İlgi Alanları</p>
              <div className="flex flex-wrap gap-1.5">
                {AREAS.map((ar) => {
                  const on = newForm.areas.includes(ar)
                  return (
                    <button
                      type="button"
                      key={ar}
                      onClick={() => setNewForm({
                        ...newForm,
                        areas: on ? newForm.areas.filter((x) => x !== ar) : [...newForm.areas, ar],
                      })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        on ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {ar}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Uygunluk" placeholder="Hafta sonu, akşam..." value={newForm.availability} onChange={(v) => setNewForm({ ...newForm, availability: v })} />
              <Label label="Başlangıç Durumu">
                <select className={inputClass} value={newForm.status} onChange={(e) => setNewForm({ ...newForm, status: e.target.value as Application['status'] })}>
                  {(Object.keys(STATUS) as Application['status'][]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
              </Label>
            </div>
            <TextInput label="Başvuru Mesajı / Notu" value={newForm.message} onChange={(v) => setNewForm({ ...newForm, message: v })} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={ghostButton} onClick={() => setCreateOpen(false)}>Vazgeç</button>
              <button type="submit" disabled={busy} className={primaryButton}>Kaydet</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
