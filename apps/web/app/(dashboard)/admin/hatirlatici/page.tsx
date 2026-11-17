'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlarmClock, BellRing, CheckCircle2, Clock, FileUp, Pencil, Phone, Repeat, RotateCcw, Search, Trash2, User } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage } from '../../../../lib/admin-access'
import { Label, inputClass, primaryButton, ghostButton } from '../../../../components/admin/FormKit'
import { Modal, PageHeader, confirmDialog, toast } from '../../../../components/admin/ui'
import {
  REPEAT_LABEL, type ImportResult, type Reminder, type RepeatKind, chime, formatWhen, inMinutes, nextHour, telHref, toLocalInput, tomorrowAt,
} from '../../../../lib/reminders'

type Group = { key: string; title: string; tone: string; items: Reminder[] }

function groupOpen(items: Reminder[]): Group[] {
  const now = new Date()
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const startTomorrow = new Date(startToday)
  startTomorrow.setDate(startTomorrow.getDate() + 1)
  const startAfter = new Date(startTomorrow)
  startAfter.setDate(startAfter.getDate() + 1)
  const groups: Group[] = [
    { key: 'late', title: 'Vakti geçenler', tone: 'text-red-700', items: [] },
    { key: 'today', title: 'Bugün', tone: 'text-primary-700', items: [] },
    { key: 'tomorrow', title: 'Yarın', tone: 'text-gray-800', items: [] },
    { key: 'later', title: 'Daha sonra', tone: 'text-gray-800', items: [] },
  ]
  for (const r of items) {
    const at = new Date(r.remind_at)
    if (at <= now) groups[0].items.push(r)
    else if (at < startTomorrow) groups[1].items.push(r)
    else if (at < startAfter) groups[2].items.push(r)
    else groups[3].items.push(r)
  }
  return groups.filter((g) => g.items.length)
}

export default function HatirlaticiPage() {
  const [tab, setTab] = useState<'acik' | 'tamamlanan'>('acik')
  const [items, setItems] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [content, setContent] = useState('')
  const [when, setWhen] = useState(toLocalInput(nextHour()))
  const [repeat, setRepeat] = useState<RepeatKind>('none')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [snoozing, setSnoozing] = useState<Reminder | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [alerts, setAlerts] = useState<Reminder[]>([])
  const seen = useRef<Set<string>>(new Set())
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await adminGet<Reminder[]>('/reminders', { kapsam: tab, q: query.trim() || undefined })
      setItems(data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Hatırlatmalar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [tab, query])

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, query])

  // Like Wise Reminder's pop-up: while the page is open, a reminder whose time comes opens a window with a sound.
  useEffect(() => {
    let stopped = false
    const check = async () => {
      try {
        const { data } = await adminGet<Reminder[]>('/reminders', { kapsam: 'vadesi_gelen', limit: 50 })
        if (stopped) return
        const fresh = data.filter((r) => !seen.current.has(`${r.id}:${r.remind_at}`))
        // Old overdue ones are listed on the page; only those that came due in the last 10 minutes pop up.
        const recent = fresh.filter((r) => Date.now() - new Date(r.remind_at).getTime() < 10 * 60_000)
        fresh.forEach((r) => seen.current.add(`${r.id}:${r.remind_at}`))
        if (recent.length) {
          setAlerts((prev) => [...prev, ...recent.filter((r) => !prev.some((p) => p.id === r.id))])
          chime()
          void load()
        }
        document.title = data.length ? `(${data.length}) Hatırlatıcı` : 'Hatırlatıcı'
      } catch {
        /* next round */
      }
    }
    void check()
    const timer = setInterval(check, 30_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [load])

  const add = async () => {
    if (!content.trim()) {
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const { data } = await adminSend<Reminder>('post', '/reminders', {
        content: content.trim(), remind_at: new Date(when).toISOString(), repeat,
      })
      toast.ok(data.donor ? `Kaydedildi · ${data.donor.name} kartına da bağlandı` : 'Kaydedildi')
      setContent('')
      setRepeat('none')
      setWhen(toLocalInput(nextHour()))
      if (tab === 'acik') void load()
      inputRef.current?.focus()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }

  const act = async (r: Reminder, action: 'complete' | 'reopen' | 'delete') => {
    try {
      if (action === 'delete') {
        if (!(await confirmDialog({ title: 'Hatırlatma silinsin mi?', text: r.content, confirmLabel: 'Sil' }))) return
        await adminSend('delete', `/reminders/${r.id}`)
      } else {
        const { data } = await adminSend<Reminder>('post', `/reminders/${r.id}/${action}`)
        if (action === 'complete' && data.completed_at === null) toast.ok(`Tamamlandı · sonraki: ${formatWhen(data.remind_at)}`)
        else toast.ok(action === 'complete' ? 'Tamamlandı' : 'Yeniden açıldı')
      }
      setAlerts((prev) => prev.filter((a) => a.id !== r.id))
      void load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const moveTo = async (r: Reminder, at: Date) => {
    try {
      await adminSend('patch', `/reminders/${r.id}`, { remind_at: at.toISOString() })
      toast.ok(`Ertelendi · ${formatWhen(at.toISOString())}`)
      setAlerts((prev) => prev.filter((a) => a.id !== r.id))
      setSnoozing(null)
      void load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const groups = useMemo(() => (tab === 'acik' ? groupOpen(items) : []), [items, tab])
  const lateCount = groups.find((g) => g.key === 'late')?.items.length || 0

  const row = (r: Reminder) => (
    <li key={r.id} className="group flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-medium ${r.completed_at ? 'text-gray-500' : 'text-gray-900'}`}>{r.content}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {r.completed_at ? `Tamamlandı: ${formatWhen(r.completed_at)}` : formatWhen(r.remind_at)}
          </span>
          {r.repeat !== 'none' && (
            <span className="inline-flex items-center gap-1"><Repeat className="h-3.5 w-3.5" aria-hidden="true" />{REPEAT_LABEL[r.repeat]}</span>
          )}
          {r.donor && (
            <Link href={`/admin/bagiscilar?donor=${r.donor.id}`} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 font-semibold text-primary-700 hover:underline">
              <User className="h-3.5 w-3.5" aria-hidden="true" />{r.donor.name}
            </Link>
          )}
          {r.source === 'wise_reminder' && <span className="rounded-full bg-gray-100 px-2 py-0.5">Wise Reminder&apos;dan</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {telHref(r.phone) && (
          <a href={telHref(r.phone)!} className={`${ghostButton} inline-flex items-center gap-1`} title="Telefonla ara">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />Ara
          </a>
        )}
        {r.completed_at ? (
          <button type="button" onClick={() => act(r, 'reopen')} className={`${ghostButton} inline-flex items-center gap-1`}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Geri al
          </button>
        ) : (
          <>
            <button type="button" onClick={() => act(r, 'complete')} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Tamamla
            </button>
            <button type="button" onClick={() => setSnoozing(r)} className={`${ghostButton} inline-flex items-center gap-1`}>
              <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />Ertele
            </button>
          </>
        )}
        <button type="button" onClick={() => setEditing(r)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Düzenle" title="Düzenle">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => act(r, 'delete')} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Sil" title="Sil">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hatırlatıcı"
        description="Kimi, ne zaman arayacağınızı yazın; vakti gelince telefonunuza bildirim gelir. Metinde telefon numarası varsa kayıtlı bağışçıya kendiliğinden bağlanır."
        actions={
          <button type="button" onClick={() => setImportOpen(true)} className={`${ghostButton} inline-flex items-center gap-1.5`}>
            <FileUp className="h-4 w-4" aria-hidden="true" />Wise Reminder&apos;dan aktar
          </button>
        }
      />

      {/* Quick add */}
      <form
        onSubmit={(e) => { e.preventDefault(); void add() }}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void add() } }}
          rows={2}
          placeholder="Örn: 0532 223 36 10 Sinan Başyaptan, Gazze yemeği için arayın dedi"
          className={`${inputClass} resize-none`}
          aria-label="Hatırlatma metni"
        />
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-gray-600">
            Ne zaman
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${inputClass} mt-1 w-auto`} required />
          </label>
          <div className="flex flex-wrap gap-1">
            {[
              { label: '1 saat sonra', at: () => inMinutes(60) },
              { label: 'Yarın 10:00', at: () => tomorrowAt(10) },
              { label: '1 hafta sonra', at: () => { const d = tomorrowAt(10); d.setDate(d.getDate() + 6); return d } },
            ].map((chip) => (
              <button key={chip.label} type="button" onClick={() => setWhen(toLocalInput(chip.at()))} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-primary-600 hover:text-primary-700">
                {chip.label}
              </button>
            ))}
          </div>
          <label className="text-xs font-semibold text-gray-600">
            Tekrar
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className={`${inputClass} mt-1 w-auto`}>
              {Object.entries(REPEAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving} className={`${primaryButton} ml-auto`}>{saving ? 'Kaydediliyor…' : 'Hatırlatma ekle'}</button>
        </div>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="tablist">
          {([['acik', 'Hatırlatıcılar'], ['tamamlanan', 'Tamamlanmış']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key}
              onClick={() => { setLoading(true); setTab(key) }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {label}
              {key === 'acik' && lateCount > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{lateCount}</span>}
            </button>
          ))}
        </div>
        <label className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad, telefon ya da metin ara" className={`${inputClass} pl-8`} aria-label="Ara" />
        </label>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-500">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
          {query ? 'Aramaya uyan hatırlatma yok.' : tab === 'acik' ? 'Bekleyen hatırlatmanız yok.' : 'Henüz tamamlanan hatırlatma yok.'}
        </div>
      ) : tab === 'acik' ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <h2 className={`border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold ${g.tone}`}>{g.title} · {g.items.length}</h2>
              <ul>{g.items.map(row)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <ul>{items.map(row)}</ul>
        </section>
      )}

      {alerts.length > 0 && (
        <Modal title="Hatırlatma vakti geldi" onClose={() => setAlerts([])} size="md">
          <ul className="space-y-3">
            {alerts.map((r) => (
              <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-start gap-2 text-sm font-semibold text-gray-900">
                  <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />{r.content}
                </p>
                <p className="mt-1 text-xs text-gray-600">{formatWhen(r.remind_at)}{r.donor ? ` · ${r.donor.name}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {telHref(r.phone) && <a href={telHref(r.phone)!} className={`${ghostButton} inline-flex items-center gap-1`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />Ara</a>}
                  <button type="button" onClick={() => act(r, 'complete')} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">Tamamla</button>
                  <button type="button" onClick={() => moveTo(r, inMinutes(10))} className={ghostButton}>10 dk ertele</button>
                  <button type="button" onClick={() => moveTo(r, inMinutes(60))} className={ghostButton}>1 saat ertele</button>
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {snoozing && <SnoozeModal reminder={snoozing} onClose={() => setSnoozing(null)} onPick={(at) => moveTo(snoozing, at)} />}
      {editing && <EditModal reminder={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); void load() }} />}
    </div>
  )
}

function SnoozeModal({ reminder, onClose, onPick }: { reminder: Reminder; onClose: () => void; onPick: (at: Date) => void }) {
  const [custom, setCustom] = useState(toLocalInput(tomorrowAt(10)))
  const options = [
    { label: '10 dakika', at: () => inMinutes(10) },
    { label: '1 saat', at: () => inMinutes(60) },
    { label: 'Yarın 10:00', at: () => tomorrowAt(10) },
    { label: '1 hafta sonra', at: () => { const d = tomorrowAt(10); d.setDate(d.getDate() + 6); return d } },
  ]
  return (
    <Modal title="Ertele" description={reminder.content} onClose={onClose} size="sm">
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button key={o.label} type="button" onClick={() => onPick(o.at())} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-800 hover:border-primary-600 hover:text-primary-700">{o.label}</button>
        ))}
      </div>
      <Label label="Başka bir zaman">
        <div className="flex gap-2">
          <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className={inputClass} />
          <button type="button" onClick={() => onPick(new Date(custom))} className={primaryButton}>Ertele</button>
        </div>
      </Label>
    </Modal>
  )
}

function EditModal({ reminder, onClose, onSaved }: { reminder: Reminder; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState(reminder.content)
  const [when, setWhen] = useState(toLocalInput(new Date(reminder.remind_at)))
  const [repeat, setRepeat] = useState<RepeatKind>(reminder.repeat)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const changedTime = toLocalInput(new Date(reminder.remind_at)) !== when
      await adminSend('patch', `/reminders/${reminder.id}`, {
        content: content.trim(), repeat, ...(changedTime ? { remind_at: new Date(when).toISOString() } : {}),
      })
      toast.ok('Kaydedildi')
      onSaved()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Kaydedilemedi'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal title="Hatırlatmayı düzenle" onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className={ghostButton}>Vazgeç</button>
        <button type="button" disabled={saving || !content.trim()} onClick={save} className={primaryButton}>Kaydet</button>
      </>
    }>
      <Label label="Metin">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className={inputClass} />
      </Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label label="Ne zaman">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Label>
        <Label label="Tekrar">
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className={inputClass}>
            {Object.entries(REPEAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Label>
      </div>
    </Modal>
  )
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [completed, setCompleted] = useState(false)
  const [createDonors, setCreateDonors] = useState(true)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const readFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    // Windows programs often write Turkish text as windows-1254 rather than UTF-8.
    let decoded = new TextDecoder('utf-8').decode(buf)
    if (decoded.includes('�')) decoded = new TextDecoder('windows-1254').decode(buf)
    setText(decoded)
    setPreview(null)
  }

  const run = async (dryRun: boolean) => {
    setBusy(true)
    try {
      const { data } = await adminSend<ImportResult>('post', '/reminders/import', {
        text, completed, dry_run: dryRun, create_donors: createDonors,
      })
      if (dryRun) setPreview(data)
      else {
        toast.ok(`${data.created} hatırlatma aktarıldı${data.new_donors ? `, ${data.new_donors} yeni bağışçı açıldı` : ''}${data.skipped ? ` (${data.skipped} tanesi zaten vardı)` : ''}`)
        onDone()
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Aktarılamadı'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Wise Reminder'dan aktar" size="lg" onClose={onClose}
      description="Wise Reminder listesini dışa aktardığınız dosyayı seçin ya da metni yapıştırın. Her kaydın metni ve tarihi okunur; telefon numarası kayıtlı bir bağışçıya aitse ona bağlanır."
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButton}>Vazgeç</button>
          {preview ? (
            <button type="button" disabled={busy || preview.total === 0} onClick={() => run(false)} className={primaryButton}>
              {preview.total} kaydı aktar
            </button>
          ) : (
            <button type="button" disabled={busy || !text.trim()} onClick={() => run(true)} className={primaryButton}>Önizle</button>
          )}
        </>
      }>
      <div className="space-y-3">
        <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f) }} className="block text-sm" />
        <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null) }} rows={6} className={`${inputClass} font-mono text-xs`}
          placeholder={'(543) 352 66 28 MESUT ... GAZZE İÇİN YEMEK BAĞIŞI\n23.10.2026 11:15:52\n0532 223 36 10 SİNAN BAŞYAPTAN GAZZE İÇİN YEMEK\n6.11.2026 11:16:50'} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={completed} onChange={(e) => { setCompleted(e.target.checked); setPreview(null) }} />
          Bu liste &quot;Tamamlanmış&quot; sekmesinden (hepsi tamamlanmış olarak gelsin)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={createDonors} onChange={(e) => setCreateDonors(e.target.checked)} />
          Telefonu kayıtlı olmayanlar için yeni bağışçı aç (ad metinden alınır)
        </label>
        {preview && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <b>{preview.total}</b> kayıt okundu · <b>{preview.matched}</b> tanesi kayıtlı bağışçıyla eşleşti
              {preview.rows.some((r) => r.duplicate) && <> · <b>{preview.rows.filter((r) => r.duplicate).length}</b> tanesi zaten aktarılmış, atlanacak</>}
            </p>
            <div className="max-h-72 overflow-auto rounded-xl border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  <tr><th className="px-3 py-2">Metin</th><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Bağışçı</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${r.duplicate ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2">{r.content}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.date_missing ? <span className="text-amber-700">Tarih yok (bugün)</span> : formatWhen(r.remind_at)}</td>
                      <td className="px-3 py-2">
                        {r.donor ? <span className="font-semibold text-primary-700">{r.donor.name}</span>
                          : r.phone && createDonors && r.suggested_name ? <span className="text-gray-600">Yeni: {r.suggested_name}</span>
                            : <span className="text-gray-400">Bağlanmayacak</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
