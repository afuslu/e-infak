'use client'

/** Bağışçılar list in STK PRO's layout: per-column filters, column chooser, "Tüm N kaydı seç" and "Toplu İşlemler". */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Copy, Download, Eye, ListChecks, Mail, MailPlus, PencilLine, Plus, Send, Smartphone, Trash2, Upload, Users, Zap } from 'lucide-react'
import { adminGet, adminSend, apiErrorMessage, can, exportXlsx, formatMoney } from '../../../../lib/admin-access'
import { Label, inputClass } from '../../../../components/admin/FormKit'
import { QuickSmsDialog, sentNotice } from '../../../../components/admin/QuickSmsDialog'
import { QuickWhatsAppDialog } from '../../../../components/admin/QuickWhatsAppDialog'
import { Modal, WhatsAppIcon, confirmDialog, toast } from '../../../../components/admin/ui'
import { EMPTY_SELECTION, type ListColumn, type ListSelection, ListView, RowAction, usePageSize } from '../../../../components/admin/ListView'
import { DonorForm } from '../../../../components/admin/donors/DonorForm'
import { CallButton } from '../../../../components/admin/donors/DonorCardView'
import { useDonorContext } from '../../../../components/admin/donors/useDonorContext'
import { MailComposer } from '../../../../components/admin/messaging/MailComposer'
import { SaveToListModal } from '../../../../components/admin/messaging/RecipientLists'
import { type DonorRow, formatPhone, staffName } from '../../../../components/admin/donors/types'

/** Columns the export can carry; labels and order match STK PRO's Excel. */
const EXPORT_COLUMNS: [string, string][] = [
  ['no', 'No'], ['donor_type', 'Üyelik Türü'], ['full_name', 'Ad Soyad'], ['company_name', 'Kurum Adı'], ['phone_code', 'Kod'],
  ['phone', 'Cep Telefon'], ['phone2', 'Diğer Telefon'], ['email', 'E-posta'], ['tc_no', 'T.C. Kimlik'], ['created_at', 'Üyelik Tarihi'],
  ['total', 'Toplam Bağış'], ['total_donations', 'Bağış Sayısı'], ['last_donation_at', 'Son Bağış'], ['membership_type', 'Üyelik Tipi'],
  ['referral_source', 'Referans'], ['assigned', 'Temsilci'], ['staff', 'Personel'], ['rating', 'Değerlendirme'], ['occupation', 'Meslek'],
  ['gender', 'Cinsiyet'], ['blood_group', 'Kan Grubu'], ['birth_date', 'Doğum Tarihi'], ['country', 'Ülke'], ['city', 'İl'],
  ['district', 'İlçe'], ['neighbourhood', 'Mahalle'], ['address', 'Adres'], ['tags', 'Etiketler'], ['allow_sms', 'SMS İzni'],
  ['allow_email', 'E-posta İzni'], ['notes', 'Açıklama'], ['call_notes', 'Görüşme Notları'],
]
const DEFAULT_EXPORT = ['no', 'donor_type', 'full_name', 'phone_code', 'phone', 'email', 'tc_no', 'created_at', 'total',
  'membership_type', 'referral_source', 'assigned', 'staff']
const EXPORT_PREF = 'einfak-export-cols:donors'

const EMPTY_FILTERS: Record<string, string> = {
  q: '', no: '', donor_type: '', name: '', phone: '', email: '', tc: '', created_start: '', created_end: '',
  min_total: '', max_total: '', membership_type: '', referral_source: '', assigned: '', staff: '', city: '',
  region: '', last_donation_start: '', last_donation_end: '', tag: '', has_donation: '', allow_sms: '',
}

export default function DonorsPageWrapper() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-gray-500">Yükleniyor…</p>}>
      <DonorsPage />
    </Suspense>
  )
}

function DonorsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { access, staff, options, perms } = useDonorContext()
  const canBulk = can(access, 'sms.bulk')
  const [filters, setFilters] = useState<Record<string, string>>(() => ({ ...EMPTY_FILTERS, q: searchParams.get('q') || '', assigned: searchParams.get('temsilci') || '' }))
  const [sort, setSort] = useState('recent')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('donors', 25)
  const [list, setList] = useState<{ total: number; items: DonorRow[] }>({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<ListSelection>(EMPTY_SELECTION)
  const [quickAdd, setQuickAdd] = useState(false)
  const [bulkUpdate, setBulkUpdate] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [smsFor, setSmsFor] = useState<DonorRow | null>(null)
  const [waFor, setWaFor] = useState<DonorRow | null>(null)
  const [listFor, setListFor] = useState<'sms' | 'mail' | null>(null)
  const [mailOpen, setMailOpen] = useState(false)

  // Old links (?donor=…) open the full card page.
  useEffect(() => {
    const id = searchParams.get('donor')
    if (id) router.replace(`/admin/bagiscilar/${id}`)
  }, [searchParams, router])

  const apiFilters = useMemo(() => {
    const toCents = (v: string) => (v ? Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100) || undefined : undefined)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(filters)) {
      if (!v || k === 'min_total' || k === 'max_total') continue
      out[k] = v === 'true' ? true : v === 'false' ? false : v
    }
    out.min_total_cents = toCents(filters.min_total)
    out.max_total_cents = toCents(filters.max_total)
    return out
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminGet<{ total: number; items: DonorRow[] }>('/donors', { ...apiFilters, sort, direction, page, page_size: pageSize })
      setList(res.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bağışçılar yüklenemedi'))
    } finally {
      setLoading(false)
    }
  }, [apiFilters, sort, direction, page, pageSize])
  useEffect(() => { load() }, [load])

  const applyFilters = (next: Record<string, string>) => { setFilters(next); setPage(1); setSelection(EMPTY_SELECTION) }
  const target = () => ({ ids: selection.all ? [] : selection.ids, select_all: selection.all, filters: apiFilters })
  const picked = selection.all ? list.total : selection.ids.length

  // "Gönderim Sihirbazı": the picked donors become a dated SMS list and open in the bulk SMS wizard.
  const sendWizard = async () => {
    try {
      const name = `Seçim ${new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`
      const r = await adminSend<{ id: string }>('post', '/recipient-lists', { channel: 'sms', name, target: target() })
      router.push(`/admin/broadcast?liste=${r.data.id}`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gönderim hazırlanamadı'))
    }
  }

  const runDelete = async () => {
    const ok = await confirmDialog({
      title: `${picked.toLocaleString('tr-TR')} bağışçı silinsin mi?`,
      text: 'Bağışı veya üyeliği olan kayıtlar silinmez, atlanır. Silinen kayıtlar geri alınamaz.',
      danger: true, confirmLabel: 'Sil',
    })
    if (!ok) return
    try {
      const r = await adminSend<{ deleted: number; skipped: number }>('post', '/donors/bulk', { action: 'delete', ...target() })
      toast.ok(`${r.data.deleted} kayıt silindi${r.data.skipped ? `, ${r.data.skipped} kayıt bağışı olduğu için atlandı` : ''}.`)
      setSelection(EMPTY_SELECTION)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Silinemedi'))
    }
  }

  const options2 = (values?: string[]) => [{ value: 'none', label: '(Boş)' }, ...(values || []).map((v) => ({ value: v, label: v }))]
  const staffOptions = [{ value: 'none', label: '(Atanmamış)' }, ...staff.map((s) => ({ value: s.id, label: staffName(s) }))]

  const columns: ListColumn<DonorRow>[] = [
    { key: 'no', header: 'No', sort: 'no', filter: { type: 'text', param: 'no' }, render: (d) => <span className="tabular-nums text-gray-500">{d.external_ref || '—'}</span> },
    {
      key: 'donor_type', header: 'Üyelik Türü', filter: { type: 'select', param: 'donor_type', options: [{ value: 'individual', label: 'Bireysel' }, { value: 'corporate', label: 'Kurumsal' }] },
      render: (d) => (d.donor_type === 'corporate' ? 'Kurumsal' : 'Bireysel'),
    },
    {
      key: 'name', header: 'Ad Soyad', sort: 'name', filter: { type: 'text', param: 'name' },
      render: (d) => (
        <Link href={`/admin/bagiscilar/${d.id}`} className="whitespace-nowrap font-bold uppercase text-gray-900 hover:text-primary-700">
          {d.full_name}
        </Link>
      ),
    },
    { key: 'phone', header: 'Cep Telefon', filter: { type: 'text', param: 'phone' }, render: (d) => <span className="whitespace-nowrap tabular-nums">{formatPhone(d.phone) || '—'}</span> },
    { key: 'email', header: 'Eposta', filter: { type: 'text', param: 'email' }, render: (d) => d.email || '—' },
    { key: 'tc', header: 'T.C. Kimlik', filter: { type: 'text', param: 'tc' }, render: (d) => (d.has_tc ? '•••••••••••' : '—') },
    {
      key: 'created', header: 'Üyelik Tarihi', sort: 'created', filter: { type: 'daterange', from: 'created_start', to: 'created_end' },
      render: (d) => <span className="whitespace-nowrap tabular-nums">{d.created_at ? new Date(d.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>,
    },
    {
      key: 'total', header: 'Toplam Bağış', sort: 'total', align: 'right', filter: { type: 'numberrange', min: 'min_total', max: 'max_total' },
      render: (d) => <span className={`whitespace-nowrap font-semibold tabular-nums ${d.total_donated_cents ? 'text-emerald-600' : 'text-gray-400'}`}>{formatMoney(d.total_donated_cents)}</span>,
    },
    {
      key: 'membership_type', header: 'Üyelik Tipi', filter: { type: 'select', param: 'membership_type', options: options2(options?.membership_type) },
      render: (d) => (d.membership_type ? <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[12px]">{d.membership_type}</span> : '—'),
    },
    { key: 'referral', header: 'Referans', filter: { type: 'select', param: 'referral_source', options: options2(options?.referral_source) }, render: (d) => d.referral_source || '—' },
    { key: 'assigned', header: 'Temsilci', filter: { type: 'select', param: 'assigned', options: [{ value: 'me', label: 'Bana atananlar' }, ...staffOptions] }, render: (d) => d.assigned_user_name || '—' },
    { key: 'staff', header: 'Personel', filter: { type: 'select', param: 'staff', options: staffOptions }, render: (d) => <span className="whitespace-nowrap uppercase">{d.staff_user_name || '—'}</span> },
    {
      key: 'country', header: 'Ülke / Bölge',
      filter: { type: 'select', param: 'region', options: [{ value: 'yurtici', label: 'Yurt İçi' }, { value: 'yurtdisi', label: 'Yurt Dışı' }] },
      render: (d) => {
        const c = (d.country || '').trim()
        const isDomestic = !c || ['türkiye', 'turkiye', 'turkey', 'tr'].includes(c.toLowerCase())
        return (
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${isDomestic ? 'bg-gray-100 text-gray-700' : 'bg-sky-50 text-sky-700'}`}>
            {c || 'Türkiye'}
          </span>
        )
      },
    },
    { key: 'city', header: 'İl', hidden: true, filter: { type: 'text', param: 'city' }, render: (d) => d.city || '—' },
    {
      key: 'last', header: 'Son Bağış', sort: 'recent', hidden: true, filter: { type: 'daterange', from: 'last_donation_start', to: 'last_donation_end' },
      render: (d) => (d.last_donation_at ? new Date(d.last_donation_at).toLocaleDateString('tr-TR') : '—'),
    },
    { key: 'count', header: 'Bağış Sayısı', hidden: true, align: 'right', filter: { type: 'select', param: 'has_donation', options: [{ value: 'true', label: 'Bağışı olan' }, { value: 'false', label: 'Bağışsız' }] }, render: (d) => d.total_donations },
    { key: 'sms', header: 'SMS İzni', hidden: true, filter: { type: 'select', param: 'allow_sms', options: [{ value: 'true', label: 'Var' }, { value: 'false', label: 'Yok' }] }, render: (d) => (d.allow_sms ? 'Var' : 'Yok') },
    {
      key: 'tags', header: 'Etiketler', hidden: true, filter: { type: 'text', param: 'tag' },
      render: (d) => <div className="flex flex-wrap gap-1">{d.tags.map((t) => <span key={t} className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">{t}</span>)}</div>,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Users className="h-5 w-5" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Bağışçılar</h1>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Link href="/admin/bagiscilar/mukerrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
            <Copy className="h-4 w-4" /> Mükerrer Numaralar
          </Link>
          {perms.imports && (
            <Link href="/admin/veri-aktarma" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
              <Upload className="h-4 w-4" /> Toplu Yükle
            </Link>
          )}
          {perms.create && (
            <>
              <button type="button" onClick={() => setQuickAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700">
                <Zap className="h-4 w-4" /> Hızlı Ekle
              </button>
              <Link href="/admin/bagiscilar/yeni" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">
                <Plus className="h-4 w-4" /> Yeni Bağışçı
              </Link>
            </>
          )}
        </div>
      </div>

      <ListView
        storageKey="donors"
        columns={columns}
        rows={list.items}
        total={list.total}
        loading={loading}
        rowKey={(d) => d.id}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(1) }}
        filters={filters}
        onApplyFilters={applyFilters}
        sort={sort}
        direction={direction}
        onSort={(s, d) => { setSort(s); setDirection(d); setPage(1) }}
        selection={selection}
        onSelection={setSelection}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" value={filters.q} placeholder="Hızlı ara: ad, telefon, no…" aria-label="Bağışçı ara"
              onChange={(e) => applyFilters({ ...filters, q: e.target.value })}
              className="h-8 w-56 rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-primary-500" />
            <select
              aria-label="Yurt içi / Yurt dışı filtresi"
              value={filters.region}
              onChange={(e) => applyFilters({ ...filters, region: e.target.value })}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-gray-700 outline-none focus:border-primary-500"
            >
              <option value="">Tüm Bölgeler</option>
              <option value="yurtici">Yurt İçi</option>
              <option value="yurtdisi">Yurt Dışı</option>
            </select>
          </div>
        }
        bulkActions={[
          ...(perms.update ? [{ key: 'update', label: 'Toplu Güncelle', icon: PencilLine, tone: 'info' as const, onClick: () => setBulkUpdate(true) }] : []),
          ...(perms.remove ? [{ key: 'delete', label: 'Sil', icon: Trash2, tone: 'danger' as const, onClick: runDelete }] : []),
          ...(perms.exports ? [{ key: 'export', label: 'Dışa Aktar', icon: Download, tone: 'success' as const, onClick: () => setExportOpen(true) }] : []),
          ...(canBulk ? [
            { key: 'wizard', label: 'Gönderim Sihirbazı', icon: Send, tone: 'warning' as const, onClick: sendWizard },
            { key: 'smslist', label: 'SMS Listesi Oluştur', icon: ListChecks, tone: 'info' as const, onClick: () => setListFor('sms') },
            { key: 'mail', label: 'Mail Gönder', icon: Mail, tone: 'info' as const, onClick: () => setMailOpen(true) },
            { key: 'maillist', label: 'Mail Listesi Oluştur', icon: MailPlus, tone: 'info' as const, onClick: () => setListFor('mail') },
          ] : []),
        ]}
        rowActions={(d) => (
            <>
              {perms.update && <RowAction label="Düzenle" icon={PencilLine} href={`/admin/bagiscilar/${d.id}`} />}
              <RowAction label="Bağışçı kartı" icon={Eye} onClick={() => router.push(`/admin/bagiscilar/${d.id}`)} />
              {perms.sms && d.phone && <RowAction label="SMS gönder" icon={Smartphone} tone="sms" onClick={() => setSmsFor(d)} />}
              {d.phone && <RowAction label="WhatsApp" icon={WhatsAppIcon} tone="success" onClick={() => setWaFor(d)} />}
              {d.phone && <CallButton donorId={d.id} compact />}
              {perms.remove && d.total_donations === 0 && (
                <RowAction label="Sil" icon={Trash2} tone="danger" onClick={async () => {
                  if (!(await confirmDialog({ title: `"${d.full_name}" silinsin mi?`, text: 'Kayıt kalıcı olarak silinecek.', danger: true }))) return
                  try { await adminSend('delete', `/donors/${d.id}`); toast.ok('Bağışçı silindi'); load() } catch (err) { toast.error(apiErrorMessage(err, 'Silinemedi')) }
                }} />
              )}
            </>
          )}
        empty="Bağışçı bulunamadı"
      />

      {quickAdd && (
        <Modal title="Hızlı Ekle" description="Ad, telefon ve üyelik tipiyle hızlıca bağışçı açın; diğer bilgileri sonra kartından tamamlayın." onClose={() => setQuickAdd(false)}>
          <DonorForm compact staff={staff} options={options} onCancel={() => setQuickAdd(false)}
            onSaved={() => { setQuickAdd(false); toast.ok('Bağışçı eklendi'); load() }} />
        </Modal>
      )}
      {bulkUpdate && (
        <BulkUpdateModal count={picked} staff={staff} options={options} onClose={() => setBulkUpdate(false)}
          onSubmit={async (update) => {
            try {
              const r = await adminSend<{ updated: number }>('post', '/donors/bulk', { action: 'update', update, ...target() })
              toast.ok(`${r.data.updated.toLocaleString('tr-TR')} bağışçı güncellendi.`)
              setBulkUpdate(false)
              setSelection(EMPTY_SELECTION)
              load()
            } catch (err) {
              toast.error(apiErrorMessage(err, 'Güncellenemedi'))
            }
          }} />
      )}
      {exportOpen && (
        <ExportModal count={picked} onClose={() => setExportOpen(false)}
          onSubmit={async (cols) => {
            try {
              const r = await adminSend<{ columns: { key: string; label: string }[]; rows: (string | number)[][] }>(
                'post', '/donors/bulk', { action: 'export', columns: cols, ...target() })
              const totalIdx = r.data.columns.findIndex((c) => c.key === 'total')
              await exportXlsx('bagiscilar.xlsx', 'Bağışçılar', r.data.columns.map((c) => c.label), r.data.rows,
                { subtitle: `${r.data.rows.length} bağışçı`, currencyCols: totalIdx >= 0 ? [totalIdx] : [] })
              setExportOpen(false)
            } catch (err) {
              toast.error(apiErrorMessage(err, 'Dışa aktarılamadı'))
            }
          }} />
      )}
      {listFor && (
        <SaveToListModal channel={listFor} count={picked} target={target()} onClose={() => setListFor(null)}
          onDone={() => { setListFor(null); setSelection(EMPTY_SELECTION) }} />
      )}
      {mailOpen && (
        <MailComposer target={{ target: target() }} label={`${picked.toLocaleString('tr-TR')} seçili bağışçı`} onClose={() => setMailOpen(false)} />
      )}
      {smsFor && (
        <QuickSmsDialog
          target={{ donorId: smsFor.id, name: smsFor.full_name, phone: smsFor.phone, allowSms: smsFor.allow_sms }}
          onClose={() => setSmsFor(null)}
          onSent={(r) => toast.ok(sentNotice(r))}
        />
      )}
      {waFor && (
        <QuickWhatsAppDialog
          target={{ donorId: waFor.id, name: waFor.full_name, phone: waFor.phone }}
          onClose={() => setWaFor(null)}
        />
      )}
    </div>
  )
}

function BulkUpdateModal({ count, staff, options, onClose, onSubmit }: {
  count: number; staff: ReturnType<typeof useDonorContext>['staff']; options: ReturnType<typeof useDonorContext>['options']
  onClose: () => void; onSubmit: (update: Record<string, unknown>) => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }))
  const submit = async () => {
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v === '') continue
      if (k === 'allow_sms' || k === 'allow_email') update[k] = v === 'true'
      else if (k === 'assigned_user_id' || k === 'staff_user_id') update[k] = v === 'none' ? null : v
      else update[k] = v === '__clear__' ? '' : v
    }
    if (!Object.keys(update).length) { toast.error('Değiştirilecek bir alan seçin'); return }
    setBusy(true)
    await onSubmit(update)
    setBusy(false)
  }
  const text = (k: string, label: string, list?: string[]) => (
    <Label label={label}>
      <input className={inputClass} list={list ? `bulk-${k}` : undefined} placeholder="Değiştirme" value={values[k] || ''} onChange={(e) => set(k, e.target.value)} />
      {list && <datalist id={`bulk-${k}`}>{list.map((v) => <option key={v} value={v} />)}</datalist>}
    </Label>
  )
  const staffSel = (k: string, label: string) => (
    <Label label={label}>
      <select className={inputClass} value={values[k] || ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">Değiştirme</option><option value="none">Kaldır</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
      </select>
    </Label>
  )
  const yesNo = (k: string, label: string) => (
    <Label label={label}>
      <select className={inputClass} value={values[k] || ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">Değiştirme</option><option value="true">Var</option><option value="false">Yok</option>
      </select>
    </Label>
  )
  return (
    <Modal title="Toplu Güncelle" description={`${count.toLocaleString('tr-TR')} bağışçıya uygulanır. Boş bıraktığınız alanlar değişmez.`} size="lg" onClose={onClose}
      footer={<button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{busy ? 'Uygulanıyor…' : 'Güncelle'}</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {text('membership_type', 'Üyelik Tipi', options?.membership_type)}
        {text('referral_source', 'Referans', options?.referral_source)}
        {text('rating', 'Değerlendirme', options?.rating)}
        {text('city', 'İl')}
        {staffSel('assigned_user_id', 'Temsilci')}
        {staffSel('staff_user_id', 'Personel')}
        {yesNo('allow_sms', 'SMS İzni')}
        {yesNo('allow_email', 'E-posta İzni')}
        {text('add_tag', 'Etiket ekle')}
        {text('remove_tag', 'Etiket kaldır')}
      </div>
    </Modal>
  )
}

function ExportModal({ count, onClose, onSubmit }: { count: number; onClose: () => void; onSubmit: (cols: string[]) => Promise<void> }) {
  const [cols, setCols] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EXPORT_PREF) || 'null')
      if (Array.isArray(saved) && saved.length) return saved
    } catch {
      // ignore
    }
    return DEFAULT_EXPORT
  })
  const [busy, setBusy] = useState(false)
  const toggle = (k: string) => setCols((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  const submit = async () => {
    const ordered = EXPORT_COLUMNS.map(([k]) => k).filter((k) => cols.includes(k))
    try { localStorage.setItem(EXPORT_PREF, JSON.stringify(ordered)) } catch { /* ignore */ }
    setBusy(true)
    await onSubmit(ordered)
    setBusy(false)
  }
  return (
    <Modal title="Dışa Aktar" description={`${count.toLocaleString('tr-TR')} bağışçı Excel'e aktarılacak. Sütun seçiminiz bir sonraki sefer için hatırlanır.`} size="lg" onClose={onClose}
      footer={<button type="button" disabled={busy || !cols.length} onClick={submit} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? 'Hazırlanıyor…' : 'Excel İndir'}</button>}>
      <div className="mb-3 flex gap-3 text-[12px] font-semibold">
        <button type="button" onClick={() => setCols(EXPORT_COLUMNS.map(([k]) => k))} className="text-primary-700 hover:underline">Tümünü seç</button>
        <button type="button" onClick={() => setCols(DEFAULT_EXPORT)} className="text-gray-600 hover:underline">Varsayılan</button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {EXPORT_COLUMNS.map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-gray-50">
            <input type="checkbox" checked={cols.includes(k)} onChange={() => toggle(k)} />{label}
          </label>
        ))}
      </div>
    </Modal>
  )
}
